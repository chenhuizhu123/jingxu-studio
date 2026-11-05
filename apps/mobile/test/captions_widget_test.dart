import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingxu_mobile/data/api.dart';
import 'package:jingxu_mobile/data/captions.dart';
import 'package:jingxu_mobile/data/domain.dart';
import 'package:jingxu_mobile/data/models.dart';
import 'package:jingxu_mobile/data/studio.dart';
import 'package:jingxu_mobile/main.dart';
import 'package:jingxu_mobile/screens/captions.dart';
import 'support.dart';

class CaptionApi extends StudioApi {
  Future<dynamic>? lastMutation;
  CaptionApi({
    super.directory,
    super.records,
    super.credentials,
    super.renderer,
  });
  @override
  Future<dynamic> request(String route, {String method = 'GET', Json? body}) {
    final result = super.request(route, method: method, body: body);
    if (method == 'PATCH' && route.contains('/shots/')) lastMutation = result;
    return result;
  }
}

class CaptionStudio extends Studio {
  bool failRefresh = false;
  CaptionStudio(super.api);
  @override
  Future<void> refresh({bool silent = false}) {
    if (failRefresh && !silent) {
      failRefresh = false;
      return Future.error(StateError('offline'));
    }
    return super.refresh(silent: silent);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    await (FontLoader(
      'NotoSansSC',
    )..addFont(rootBundle.load('assets/NotoSansSC.ttf'))).load();
    await (FontLoader(
      'MaterialIcons',
    )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
  });
  Future<CaptionStudio> setup(
    WidgetTester tester,
    String lang, {
    bool stale = false,
  }) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    late Directory dir;
    late CaptionStudio studio;
    await tester.runAsync(() async {
      dir = await Directory.systemTemp.createTemp('jingxu-caption-ui-');
      final credentials = MemoryCredentials();
      await credentials.write('localeChoice', lang);
      final api = CaptionApi(
        directory: dir,
        records: MemoryRecords(),
        credentials: credentials,
        renderer: FakeRenderer(),
      );
      studio = CaptionStudio(api);
      await studio.initialize();
      await api.seedDemo();
      final p = (await api.projects()).first;
      await api.mutate(p.id, (p) {
        p['shots'][0]['duration'] = 4;
        final source = currentCaptionSource(Shot.fromJson(p['shots'][0]))!;
        p['shots'][0]['captionTrack'] = {
          'source': {...source, 'duration': stale ? 3 : 4},
          'origin': 'manual',
          'createdAt': timestamp(),
          'cues': [
            {
              'start': .25,
              'end': 1.2,
              'text': lang == 'zh'
                  ? '今晚的雨，停了。'
                  : 'Tonight, the rain has stopped.',
            },
            {
              'start': 1.8,
              'end': 2.8,
              'text': lang == 'zh' ? '我们继续吧。' : 'Let’s keep going.',
            },
          ],
        };
      });
      await studio.refresh();
    });
    await tester.pumpWidget(JingxuApp(studio: studio));
    await tester.pumpAndSettle();
    final p = studio.projects.first;
    Navigator.of(tester.element(find.byType(Scaffold).first)).push(
      MaterialPageRoute(
        builder: (_) =>
            CaptionsScreen(projectId: p.id, shotId: p.shots.first.id),
      ),
    );
    await tester.pumpAndSettle();
    addTearDown(() async {
      await tester.pumpWidget(const SizedBox());
      await tester.runAsync(() async {
        studio.dispose();
        await studio.api.close();
        await dir.delete(recursive: true);
      });
    });
    return studio;
  }

  Future<void> press(
    WidgetTester tester,
    CaptionStudio studio,
    String label,
  ) async {
    final filled = find.widgetWithText(FilledButton, label);
    final action = filled.evaluate().isNotEmpty
        ? tester.widget<FilledButton>(filled).onPressed
        : tester
              .widget<TextButton>(find.widgetWithText(TextButton, label))
              .onPressed;
    await tester.runAsync(() async {
      action!();
      await (studio.api as CaptionApi).lastMutation;
      await studio.refresh();
    });
    await tester.pumpAndSettle();
  }

  Finder field(String label) => find.byWidgetPredicate(
    (w) => w is TextField && w.decoration?.labelText == label,
  );
  for (final lang in ['zh', 'en']) {
    testWidgets(
      '$lang timed captions keep edits local until apply and show their actual fields',
      (tester) async {
        final studio = await setup(tester, lang), p = studio.projects.first;
        await expectLater(
          find.byType(MaterialApp),
          matchesGoldenFile('goldens/captions-$lang.png'),
        );
        await tester.enterText(
          field('${lang == 'zh' ? '开始 / 秒' : 'Start / seconds'} 1'),
          '0.4',
        );
        await tester.pump();
        expect(
          (await studio.api.rawProject(
            p.id,
          ))['shots'][0]['captionTrack']['cues'][0]['start'],
          .25,
        );
        await press(
          tester,
          studio,
          lang == 'zh' ? '应用时间轴字幕' : 'Apply timed captions',
        );
        expect(
          (await studio.api.rawProject(
            p.id,
          ))['shots'][0]['captionTrack']['cues'][0]['start'],
          .4,
        );
        expect(find.byType(CaptionsScreen), findsNothing);
        expect(tester.takeException(), isNull);
      },
    );
  }
  testWidgets(
    'overlap disables apply and deleting an earlier row preserves the following row text',
    (tester) async {
      final studio = await setup(tester, 'en');
      await tester.enterText(field('End / seconds 1'), '2');
      await tester.pump();
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Apply timed captions'),
            )
            .onPressed,
        isNull,
      );
      expect(find.textContaining('non-overlapping'), findsOneWidget);
      await tester.tap(find.byTooltip('Delete cue 1'));
      await tester.pump();
      expect(find.text('Let’s keep going.'), findsOneWidget);
      expect(studio.projects.first.shots.first.captionTrack!['cues'].length, 2);
    },
  );
  testWidgets('saved captions retry only refreshes after an accepted write', (
    tester,
  ) async {
    final studio = await setup(tester, 'en');
    final revision = studio.projects.first.revision;
    studio.failRefresh = true;
    await press(tester, studio, 'Apply timed captions');
    expect(find.textContaining('Retry only refreshes'), findsOneWidget);
    await press(tester, studio, 'Refresh saved captions');
    expect(studio.projects.first.revision, revision + 1);
    expect(find.byType(CaptionsScreen), findsNothing);
  });
  testWidgets(
    'stale track cannot apply and can explicitly switch back to script captions',
    (tester) async {
      final studio = await setup(tester, 'en', stale: true);
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Apply timed captions'),
            )
            .onPressed,
        isNull,
      );
      final button = find.text('Use script captions');
      await tester.ensureVisible(button);
      await press(tester, studio, 'Use script captions');
      expect(studio.projects.first.shots.first.captionTrack, isNull);
    },
  );
}
