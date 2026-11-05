import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingxu_mobile/data/api.dart';
import 'package:jingxu_mobile/data/models.dart';
import 'package:jingxu_mobile/data/package_files.dart';
import 'package:jingxu_mobile/data/studio.dart';
import 'package:jingxu_mobile/main.dart';
import 'package:jingxu_mobile/screens/home.dart';
import 'package:jingxu_mobile/screens/package_transfer.dart';
import 'support.dart';

class ObservedApi extends StudioApi {
  Future<Project>? lastImport;
  int importCalls = 0;
  ObservedApi({
    super.directory,
    super.records,
    super.credentials,
    super.renderer,
  });
  @override
  Future<Project> importPackageStream(
    Stream<List<int>> stream, {
    int? length,
    PackageCancellation? cancellation,
    PackageProgress? progress,
  }) {
    importCalls++;
    return lastImport = super.importPackageStream(
      stream,
      length: length,
      cancellation: cancellation,
      progress: progress,
    );
  }
}

class FlakyStudio extends Studio {
  bool failNext = false;
  FlakyStudio(super.api);
  @override
  Future<void> refresh({bool silent = false}) {
    if (failNext && !silent) {
      failNext = false;
      return Future.error(StateError('taskFailed'));
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
  Future<(Directory, ObservedApi, FlakyStudio, File)> setup(
    WidgetTester tester,
    String language,
  ) async {
    late Directory dir;
    late ObservedApi api;
    late FlakyStudio studio;
    late File archive;
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.runAsync(() async {
      dir = await Directory.systemTemp.createTemp('jingxu-package-ui-');
      final credentials = MemoryCredentials();
      await credentials.write('localeChoice', language);
      api = ObservedApi(
        directory: dir,
        records: MemoryRecords(),
        credentials: credentials,
        renderer: FakeRenderer(),
      );
      studio = FlakyStudio(api);
      await studio.initialize();
      await api.seedDemo();
      final p = (await api.projects()).first;
      await api.archive(p.id);
      archive = File(
        api.path(
          ((await api.rawProject(p.id))['exports'] as List).last['file'],
        ),
      );
      await studio.refresh();
    });
    await tester.pumpWidget(JingxuApp(studio: studio));
    await tester.pumpAndSettle();
    addTearDown(() async {
      await api.close();
      studio.dispose();
      await dir.delete(recursive: true);
    });
    return (dir, api, studio, archive);
  }

  Future<void> showTransfer(WidgetTester tester, PickedPackage source) async {
    final navigator = Navigator.of(tester.element(find.byType(StudioHome)));
    unawaited(
      navigator.push(
        MaterialPageRoute<void>(
          builder: (_) => PackageTransferScreen(pick: () async => source),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  for (final language in ['en', 'zh']) {
    testWidgets(
      '$language project restore form completes an actual file import',
      (tester) async {
        final (_, api, studio, archive) = await setup(tester, language);
        expect(
          find.byTooltip(language == 'en' ? 'Import project package' : '导入项目包'),
          findsOneWidget,
        );
        await showTransfer(
          tester,
          PickedPackage(
            name: 'Rainy-night-project.zip',
            length: () async => archive.lengthSync(),
            read: archive.openRead,
          ),
        );
        await tester.tap(
          find
              .text(language == 'en' ? 'Choose a project ZIP' : '选择项目 ZIP')
              .last,
        );
        await tester.pumpAndSettle();
        expect(find.text('Rainy-night-project.zip'), findsOneWidget);
        expect(tester.takeException(), isNull);
        await expectLater(
          find.byType(MaterialApp),
          matchesGoldenFile('goldens/package-ready-$language.png'),
        );
        await tester.runAsync(() async {
          await tester.tap(
            find.text(language == 'en' ? 'Import as a new project' : '导入为新项目'),
          );
          await api.lastImport!;
          await studio.refresh();
        });
        await tester.pumpAndSettle();
        expect(studio.projects.length, 2);
        expect(api.importCalls, 1);
        expect(
          find.text(language == 'en' ? 'Open imported project' : '打开已导入项目'),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
        await expectLater(
          find.byType(MaterialApp),
          matchesGoldenFile('goldens/package-complete-$language.png'),
        );
        await tester.pumpWidget(const SizedBox());
      },
    );
  }
  testWidgets(
    'retry after refresh failure opens the committed project without importing twice',
    (tester) async {
      final (_, api, studio, archive) = await setup(tester, 'en');
      await showTransfer(
        tester,
        PickedPackage(
          name: 'project.zip',
          length: () async => archive.lengthSync(),
          read: archive.openRead,
        ),
      );
      await tester.tap(find.text('Choose a project ZIP').last);
      await tester.pumpAndSettle();
      studio.failNext = true;
      await tester.runAsync(() async {
        await tester.tap(find.text('Import as a new project'));
        await api.lastImport!;
      });
      await tester.pumpAndSettle();
      expect(find.text('Open imported project'), findsOneWidget);
      expect(find.text('Import as a new project'), findsNothing);
      await tester.runAsync(() async {
        await tester.tap(find.text('Open imported project'));
        await studio.refresh();
      });
      await tester.pumpAndSettle();
      expect(api.importCalls, 1);
      expect(studio.projects.length, 2);
      expect(find.byType(PackageTransferScreen), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'cancel stops a waiting import and leaves the source selection available',
    (tester) async {
      final (_, api, _, _) = await setup(tester, 'en');
      final stream = StreamController<List<int>>();
      await showTransfer(
        tester,
        PickedPackage(
          name: 'cloud-project.zip',
          length: () async => null,
          read: () => stream.stream,
        ),
      );
      await tester.tap(find.text('Choose a project ZIP').last);
      await tester.pumpAndSettle();
      await tester.runAsync(() async {
        await tester.tap(find.text('Import as a new project'));
        // Pump a frame while the source is genuinely waiting, then cancel.
        await tester.pump();
        await tester.tap(find.text('Cancel'));
        await expectLater(api.lastImport!, throwsStateError);
        await stream.close();
      });
      await tester.pumpAndSettle();
      expect(find.text('Project transfer cancelled.'), findsOneWidget);
      expect(find.text('cloud-project.zip'), findsOneWidget);
      expect(find.text('Import as a new project'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
