import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:jingxu_mobile/data/api.dart';
import 'package:jingxu_mobile/data/audio_preview.dart';
import 'package:jingxu_mobile/data/studio.dart';
import 'package:jingxu_mobile/main.dart';
import 'package:jingxu_mobile/screens/voiceover.dart';
import 'package:jingxu_mobile/widgets/audio_preview.dart';
import 'support.dart';

class SpeechStudio extends Studio {
  bool failManualRefresh = false;
  SpeechStudio(super.api);
  @override
  Future<void> refresh({bool silent = false}) {
    if (failManualRefresh && !silent) {
      failManualRefresh = false;
      return Future.error(StateError('refreshUnavailable'));
    }
    return super.refresh(silent: silent);
  }
}

class FakeAudioPreview extends AudioPreviewController {
  String? filename;
  @override
  Duration? get duration => const Duration(milliseconds: 6500);
  @override
  Duration position = Duration.zero;
  @override
  bool playing = false;
  @override
  bool loading = false;
  @override
  bool completed = false;
  @override
  bool failed = false;
  bool disposed = false;
  int pauses = 0;
  @override
  Future<void> load(String file) async {
    filename = file;
  }

  @override
  Future<void> toggle() async {
    if (completed) {
      position = Duration.zero;
      completed = false;
    }
    playing = !playing;
    notifyListeners();
  }

  @override
  Future<void> seek(Duration value) async {
    position = value;
    notifyListeners();
  }

  @override
  Future<void> pause() async {
    pauses++;
    playing = false;
    notifyListeners();
  }

  @override
  void dispose() {
    disposed = true;
    super.dispose();
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
  Future<(Directory, SpeechStudio, List<http.Request>)> setup(
    WidgetTester tester,
    String language, {
    bool configured = true,
  }) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    late Directory dir;
    late SpeechStudio studio;
    final requests = <http.Request>[];
    await tester.runAsync(() async {
      dir = await Directory.systemTemp.createTemp('jingxu-voice-ui-');
      final credentials = MemoryCredentials();
      await credentials.write('localeChoice', language);
      final api = StudioApi(
        directory: dir,
        records: MemoryRecords(),
        credentials: credentials,
        renderer: FakeRenderer(),
        client: MockClient((r) async {
          requests.add(r);
          return http.Response.bytes(
            await File('test/fixtures/voice.wav').readAsBytes(),
            200,
          );
        }),
        packageMediaCheck: (_, _) async {},
      );
      studio = SpeechStudio(api);
      await studio.initialize();
      await api.request(
        '/projects',
        method: 'POST',
        body: {
          'name': language == 'zh' ? '夜雨配音' : 'Rainy night voiceover',
          'script': language == 'zh'
              ? '林晚：今晚的雨，终于停了。'
              : 'Mia: Tonight, the rain has finally stopped.',
        },
      );
      final id = (await api.projects()).first.id;
      await api.mutate(id, (p) {
        p['shots'][0]['title'] = language == 'zh' ? '雨停之后' : 'After the rain';
        p['shots'][0]['dialogue'] = language == 'zh'
            ? '今晚的雨，终于停了。'
            : 'Tonight, the rain has finally stopped.';
      });
      if (configured) {
        final s = await api.settings();
        s['speech'] = {
          'endpoint': 'https://voice.example/v1',
          'model': 'bilingual-voice',
          'voice': 'narrator',
          'speed': 1.1,
          'apiKey': 'ui-key',
        };
        await api.request('/settings', method: 'PUT', body: s);
      }
      await studio.refresh();
    });
    await tester.pumpWidget(JingxuApp(studio: studio));
    await tester.pumpAndSettle();
    addTearDown(() async {
      await tester.pumpWidget(const SizedBox());
      await tester.runAsync(() async {
        studio.dispose();
        await studio.api.close();
        await dir.delete(recursive: true);
      });
    });
    return (dir, studio, requests);
  }

  Future<void> open(WidgetTester tester, SpeechStudio studio) async {
    final p = studio.projects.first;
    Navigator.of(tester.element(find.byType(Scaffold).first)).push(
      MaterialPageRoute(
        builder: (_) =>
            VoiceoverScreen(projectId: p.id, shotId: p.shots.first.id),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> submit(
    WidgetTester tester,
    SpeechStudio studio,
    String label,
  ) async {
    final button = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, label),
    );
    await tester.runAsync(() async {
      button.onPressed!();
      var completed = false;
      for (var n = 0; n < 200; n++) {
        final jobs = await studio.api.jobs();
        if (jobs.isNotEmpty && !jobs.first.active) {
          completed = true;
          break;
        }
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
      expect(
        completed,
        true,
        reason: 'The real local task must finish before capturing UI.',
      );
      await studio.refresh();
    });
    await tester.pumpAndSettle();
  }

  for (final language in ['zh', 'en']) {
    testWidgets(
      '$language voiceover review submits actual local request and retains created task',
      (tester) async {
        final (_, studio, requests) = await setup(tester, language);
        await open(tester, studio);
        expect(
          find.text(
            language == 'zh'
                ? '今晚的雨，终于停了。'
                : 'Tonight, the rain has finally stopped.',
          ),
          findsOneWidget,
        );
        expect(requests, isEmpty);
        expect(find.text('bilingual-voice · narrator · 1.1×'), findsOneWidget);
        await expectLater(
          find.byType(MaterialApp),
          matchesGoldenFile('goldens/voiceover-ready-$language.png'),
        );
        await submit(
          tester,
          studio,
          language == 'zh' ? '确认并生成配音' : 'Confirm and generate',
        );
        expect(requests.length, 1);
        expect(studio.jobs.first.state, 'succeeded');
        expect(studio.projects.first.assets.single.kind, 'audio');
        expect(
          find.text(language == 'zh' ? '配音任务已创建' : 'Voiceover task created'),
          findsOneWidget,
        );
        await expectLater(
          find.byType(MaterialApp),
          matchesGoldenFile('goldens/voiceover-complete-$language.png'),
        );
        expect(tester.takeException(), isNull);
      },
    );
    testWidgets(
      '$language audio preview exposes seek, pause, replay and truncation warning',
      (tester) async {
        final (_, studio, _) = await setup(tester, language);
        final player = FakeAudioPreview();
        // Use the app's localized navigator and the real audio preview widget with a fake platform controller.
        await tester.pumpWidget(JingxuApp(studio: studio));
        await tester.pumpAndSettle();
        Navigator.of(tester.element(find.byType(Scaffold).first)).push(
          MaterialPageRoute(
            builder: (_) => Scaffold(
              appBar: AppBar(
                title: Text(language == 'zh' ? '配音试听' : 'Voiceover preview'),
              ),
              body: Padding(
                padding: const EdgeInsets.all(24),
                child: LocalAudioPreview(
                  filename: '/local/voice.wav',
                  shotDuration: 3,
                  createController: () => player,
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(player.filename, '/local/voice.wav');
        expect(
          find.textContaining(language == 'zh' ? '成片会截断' : 'will be cut off'),
          findsOneWidget,
        );
        await expectLater(
          find.byType(MaterialApp),
          matchesGoldenFile('goldens/audio-preview-$language.png'),
        );
        await tester.tap(
          find.byTooltip(language == 'zh' ? '试听配音' : 'Play voiceover'),
        );
        await tester.pump();
        expect(player.playing, true);
        final slider = tester.widget<Slider>(find.byType(Slider));
        slider.onChanged!(3000);
        await tester.pump();
        expect(player.position.inSeconds, 3);
        tester.binding.handleAppLifecycleStateChanged(
          AppLifecycleState.inactive,
        );
        await tester.pump();
        expect(player.playing, false);
        expect(player.pauses, greaterThan(0));
        tester.binding.handleAppLifecycleStateChanged(
          AppLifecycleState.resumed,
        );
        player.completed = true;
        player.position = player.duration!;
        player.notifyListeners();
        await tester.pump();
        await tester.tap(
          find.byTooltip(language == 'zh' ? '重新试听' : 'Replay voiceover'),
        );
        await tester.pump();
        expect(player.position, Duration.zero);
        Navigator.of(tester.element(find.byType(LocalAudioPreview))).push(
          MaterialPageRoute(
            builder: (_) =>
                Scaffold(appBar: AppBar(title: const Text('Another page'))),
          ),
        );
        await tester.pumpAndSettle();
        expect(
          player.playing,
          false,
          reason: 'Navigating away must pause local audio.',
        );
        await tester.tap(find.byType(BackButton));
        await tester.pumpAndSettle();
        await tester.tap(find.byType(BackButton));
        await tester.pumpAndSettle();
        expect(player.disposed, true);
        expect(tester.takeException(), isNull);
      },
    );
  }
  testWidgets('manual refresh failure retries only the accepted task', (
    tester,
  ) async {
    final (_, studio, requests) = await setup(tester, 'en');
    await open(tester, studio);
    studio.failManualRefresh = true;
    await submit(tester, studio, 'Confirm and generate');
    expect(
      find.text(
        'Task created, but refresh failed. Retry refreshes it without submitting again.',
      ),
      findsOneWidget,
    );
    final retry = tester.widget<TextButton>(
      find.widgetWithText(TextButton, 'Refresh existing task'),
    );
    await tester.runAsync(() async {
      retry.onPressed!();
      await studio.refresh();
    });
    await tester.pumpAndSettle();
    expect(requests.length, 1);
    expect(studio.jobs.length, 1);
  });
  testWidgets(
    'unconfigured service opens editable settings without submitting',
    (tester) async {
      final (_, studio, requests) = await setup(
        tester,
        'en',
        configured: false,
      );
      await open(tester, studio);
      expect(find.text('Confirm and generate'), findsNothing);
      await tester.tap(find.text('Configure speech service'));
      await tester.pumpAndSettle();
      expect(find.text('Dialogue voice service'), findsWidgets);
      expect(requests, isEmpty);
    },
  );
}
