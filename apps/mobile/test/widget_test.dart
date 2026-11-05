import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingxu_mobile/data/api.dart';
import 'package:jingxu_mobile/data/studio.dart';
import 'package:jingxu_mobile/main.dart';
import 'support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final font = FontLoader('NotoSansSC')
      ..addFont(rootBundle.load('assets/NotoSansSC.ttf'));
    await font.load();
    final icons = FontLoader('MaterialIcons')
      ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
    await icons.load();
  });
  for (final language in ['en', 'zh']) {
    testWidgets(
      '$language mobile library and project remain usable on a narrow screen',
      (tester) async {
        tester.view.physicalSize = const Size(390, 844);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        late Directory dir;
        late Studio studio;
        await tester.pumpWidget(const MaterialApp(home: SizedBox()));
        await tester.runAsync(() async {
          dir = await Directory.systemTemp.createTemp('jingxu-ui-');
          final credentials = MemoryCredentials();
          await credentials.write('localeChoice', language);
          final api = StudioApi(
            directory: dir,
            records: MemoryRecords(),
            credentials: credentials,
            renderer: FakeRenderer(),
          );
          studio = Studio(api);
          await studio.initialize();
          await api.seedDemo();
          await studio.refresh();
          for (final asset in studio.projects.first.assets) {
            await precacheImage(
              FileImage(File(asset.url)),
              tester.element(find.byType(MaterialApp)),
            );
          }
        });
        await tester.pumpWidget(JingxuApp(studio: studio));
        await tester.pumpAndSettle();
        expect(
          find.text(language == 'en' ? 'Letters in the rain' : '雨夜来信'),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
        await expectLater(
          find.byType(MaterialApp),
          matchesGoldenFile('goldens/library-$language.png'),
        );
        await tester.tap(
          find.text(language == 'en' ? 'Letters in the rain' : '雨夜来信'),
        );
        await tester.pumpAndSettle();
        expect(find.text(language == 'en' ? 'Cast' : '角色'), findsOneWidget);
        expect(tester.takeException(), isNull);
        await expectLater(
          find.byType(MaterialApp),
          matchesGoldenFile('goldens/storyboard-$language.png'),
        );
        await tester.tap(find.text(studio.projects.first.shots.first.title));
        await tester.pumpAndSettle();
        expect(
          find.text(language == 'en' ? 'Candidates' : '候选版本'),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
        await expectLater(
          find.byType(MaterialApp),
          matchesGoldenFile('goldens/shot-$language.png'),
        );
        await tester.tap(find.byType(BackButton));
        await tester.pumpAndSettle();
        await tester.tap(find.text(language == 'en' ? 'Cast' : '角色'));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await expectLater(
          find.byType(MaterialApp),
          matchesGoldenFile('goldens/cast-$language.png'),
        );
        await tester.tap(find.text(language == 'en' ? 'Export' : '交付'));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await expectLater(
          find.byType(MaterialApp),
          matchesGoldenFile('goldens/export-$language.png'),
        );
        await tester.pumpWidget(const SizedBox());
        studio.dispose();
        await tester.runAsync(() async {
          await Future<void>.delayed(const Duration(milliseconds: 30));
          await dir.delete(recursive: true);
        });
      },
    );
  }
}
