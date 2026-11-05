import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:jingxu_mobile/data/api.dart';
import 'package:jingxu_mobile/data/studio.dart';
import 'package:jingxu_mobile/main.dart';
import 'package:jingxu_mobile/screens/shot.dart';
import 'support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    for (final (family, file) in [
      ('NotoSansSC', 'assets/NotoSansSC.ttf'),
      ('MaterialIcons', 'fonts/MaterialIcons-Regular.otf'),
    ]) {
      await (FontLoader(family)..addFont(rootBundle.load(file))).load();
    }
  });

  for (final language in ['zh', 'en']) {
    testWidgets(
      '$language shot controls review provider, prompt and selected image before sending',
      (tester) async {
        final zh = language == 'zh';
        tester.view.physicalSize = const Size(390, 844);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        late Directory root;
        late Studio studio;
        final requests = <http.Request>[];
        await tester.pumpWidget(const MaterialApp(home: SizedBox()));
        await tester.runAsync(() async {
          root = await Directory.systemTemp.createTemp('jingxu-shot-review-');
          final creds = MemoryCredentials();
          await creds.write('localeChoice', language);
          final png = await File('assets/demo-2.png').readAsBytes();
          final api = StudioApi(
            directory: root,
            records: MemoryRecords(),
            credentials: creds,
            renderer: FakeRenderer(),
            client: MockClient((r) async {
              requests.add(r);
              return http.Response(
                jsonEncode({
                  'data': [
                    {'b64_json': base64Encode(png)},
                  ],
                }),
                200,
              );
            }),
          );
          studio = Studio(api);
          await studio.initialize();
          await api.seedDemo();
          await api.request(
            '/settings',
            method: 'PUT',
            body: {
              'image': {
                'endpoint': 'https://images.example/api/v3',
                'model': 'seedream-preview',
                'apiKey': 'local-test-key',
              },
              'generation': {
                'provider': 'ark',
                'endpoint': 'https://video.example/api/v3',
                'model': 'seedance-preview',
                'apiKey': 'local-test-video-key',
              },
            },
          );
          await studio.refresh();
          for (final asset in studio.projects.first.assets) {
            await precacheImage(
              FileImage(File(asset.url)),
              tester.element(find.byType(MaterialApp)),
            );
          }
        });
        addTearDown(() async {
          await tester.pumpWidget(const SizedBox());
          await tester.runAsync(() async {
            studio.dispose();
            await studio.api.close();
            await root.delete(recursive: true);
          });
        });
        final p = studio.projects.first, shot = studio.projects.first.shots[1];
        await tester.pumpWidget(JingxuApp(studio: studio));
        await tester.pumpAndSettle();
        Navigator.of(tester.element(find.byType(Scaffold).first)).push(
          MaterialPageRoute(
            builder: (_) => ShotScreen(projectId: p.id, shotId: shot.id),
          ),
        );
        await tester.pumpAndSettle();
        final generate = find.widgetWithText(
          OutlinedButton,
          zh ? '生成图片' : 'Generate image',
        );
        await tester.scrollUntilVisible(
          generate,
          140,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.pumpAndSettle();
        await tester.tap(generate);
        await tester.pumpAndSettle();
        expect(find.text('seedream-preview'), findsOneWidget);
        expect(find.text('Demo 1.png'), findsOneWidget);
        expect(requests, isEmpty);
        await expectLater(
          find.byType(MaterialApp),
          matchesGoldenFile('goldens/image-review-$language.png'),
        );
        final confirm = find.widgetWithText(
          FilledButton,
          zh ? '确认并加入队列' : 'Confirm and queue',
        );
        await tester.scrollUntilVisible(
          confirm,
          120,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.pumpAndSettle();
        final button = tester.widget<FilledButton>(confirm);
        await tester.runAsync(() async {
          button.onPressed!();
          for (var n = 0; n < 200; n++) {
            final jobs = await studio.api.jobs();
            if (jobs.isNotEmpty && !jobs.first.active) break;
            await Future<void>.delayed(const Duration(milliseconds: 10));
          }
          await studio.refresh();
        });
        await tester.pumpAndSettle();
        expect(requests, hasLength(1));
        expect(studio.jobs.first.state, 'succeeded');
        expect(studio.projects.first.shots[1].selected!.id, shot.selected!.id);
        final back = find.widgetWithText(
          FilledButton,
          zh ? '返回镜头' : 'Back to shot',
        );
        await tester.scrollUntilVisible(
          back,
          100,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.pumpAndSettle();
        await tester.tap(back);
        await tester.pumpAndSettle();
        final animate = find.widgetWithText(
          TextButton,
          zh ? '用选中图片生成视频' : 'Animate selected image',
        );
        await tester.ensureVisible(animate);
        await tester.pumpAndSettle();
        await tester.tap(animate);
        await tester.pumpAndSettle();
        expect(find.text('seedance-preview'), findsOneWidget);
        expect(find.text('Demo 2.png'), findsOneWidget);
        expect(find.text('Demo 1.png'), findsNothing);
        expect(requests, hasLength(1));
        await expectLater(
          find.byType(MaterialApp),
          matchesGoldenFile('goldens/first-frame-review-$language.png'),
        );
        expect(tester.takeException(), isNull);
      },
    );
  }
}
