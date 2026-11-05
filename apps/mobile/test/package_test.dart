import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:archive/archive_io.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingxu_mobile/data/api.dart';
import 'package:jingxu_mobile/data/domain.dart';
import 'package:jingxu_mobile/data/models.dart';
import 'package:jingxu_mobile/data/package_contract.dart';
import 'package:jingxu_mobile/data/package_files.dart';
import 'package:jingxu_mobile/data/package_service.dart';
import 'support.dart';

class FailingRecords extends MemoryRecords {
  bool fail = false, afterWrite = false, failRemove = false;
  void Function(String, Json)? onWrite;
  @override
  Future<void> put(String kind, Json value) async {
    onWrite?.call(kind, value);
    if (fail && kind == 'project') {
      if (afterWrite) await super.put(kind, value);
      throw FileSystemException('simulated disk write failure');
    }
    await super.put(kind, value);
  }

  @override
  Future<void> remove(String kind, String id) async {
    if (failRemove) throw FileSystemException('simulated rollback failure');
    await super.remove(kind, id);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory root;
  late StudioApi api;
  late MemoryRecords records;
  late String schema;
  setUp(() async {
    root = await Directory.systemTemp.createTemp('jingxu-package-');
    records = FailingRecords();
    schema = await rootBundle.loadString('assets/project-package.schema.json');
    api = StudioApi(
      directory: root,
      records: records,
      credentials: MemoryCredentials(),
      renderer: FakeRenderer(),
    );
    await api.restore();
    await api.seedDemo();
  });
  tearDown(() async {
    await api.close();
    await root.delete(recursive: true);
  });
  Future<File> archive() async {
    final p = (await api.projects()).first;
    await api.archive(p.id);
    final result = await api.rawProject(p.id);
    return File(api.path((result['exports'] as List).last['file']));
  }

  Future<Project> restore(File file, {PackageCancellation? token}) =>
      api.importPackageStream(
        file.openRead(),
        length: file.lengthSync(),
        cancellation: token,
      );
  Future<File> makeZip(List<ArchiveFile> entries) async {
    final file = File('${root.path}/${newId()}.zip');
    final encoder = ZipFileEncoder()
      ..create(file.path, level: ZipFileEncoder.store);
    for (final e in entries) {
      encoder.addArchiveFile(e);
    }
    await encoder.close();
    return file;
  }

  Future<List<FileSystemEntity>> imports() async => [
    ...await root
        .list()
        .where((e) => e.path.split('/').last.startsWith('.import-'))
        .toList(),
    ...await Directory(api.path('media'))
        .list()
        .where((e) => e.path.split('/').last.startsWith('import-'))
        .toList(),
  ];

  for (final (locale, title) in [
    ('zh', '雨夜来信'),
    ('en', 'Letters in the Rain'),
  ]) {
    test(
      'imports the $locale website sample with its selected illustrations',
      () async {
        final file = File(
          '../website/src/samples/jingxu-rain-sample-$locale.zip',
        );
        final sample = await restore(file);
        expect(sample.name, title);
        expect(sample.format, '9:16');
        expect(sample.shots, hasLength(3));
        expect(sample.exports, isEmpty);
        for (final shot in sample.shots) {
          expect(shot.selected?.source, 'demo');
          final asset = (sample.data['assets'] as List).firstWhere(
            (a) => a['id'] == shot.selected!.assetId,
          );
          expect(await File(api.path(asset['file'])).exists(), isTrue);
        }
      },
    );
  }

  test(
    'archives and restores real images, characters, selected takes and messages without device credentials',
    () async {
      final p = (await api.projects()).first;
      await api.mutate(p.id, (raw) {
        raw['messages'] = [
          {
            'id': newId(),
            'role': 'user',
            'text': 'Keep this scene',
            'createdAt': timestamp(),
          },
        ];
        raw['shots'][0]['referenceIds'] = [raw['assets'][0]['id']];
        raw['shots'][0]['visualReview'] = {
          'versionId': raw['shots'][0]['selectedVersionId'],
          'createdAt': timestamp(),
          'text': 'Review still required',
          'frameCount': 1,
          'referenceIds': [raw['assets'][0]['id']],
        };
        raw['settings'] = {'apiKey': 'must-not-travel'};
      });
      final file = await archive();
      final old = await api.rawProject(p.id);
      final result = await restore(file);
      expect(result.id, isNot(p.id));
      expect((await api.projects()).length, 2);
      expect(await api.rawProject(p.id), old);
      expect(result.messages.single['text'], 'Keep this scene');
      expect(jsonEncode(result.data), isNot(contains('must-not-travel')));
      expect(result.shots.first.selected!.assetId, result.assets.first.id);
      expect(result.characters.first['referenceId'], result.assets.first.id);
      expect(
        result.shots.first.visualReview!['versionId'],
        result.shots.first.selectedVersionId,
      );
      expect(result.shots.first.visualReview!['referenceIds'], [
        result.assets.first.id,
      ]);
      for (var i = 0; i < p.assets.length; i++) {
        expect(
          await File(result.assets[i].url).readAsBytes(),
          await File(p.assets[i].url).readAsBytes(),
        );
      }
      expect(await Directory(api.path('incoming')).list().toList(), isEmpty);
    },
  );
  test('restores old mobile project.json packages', () async {
    final p = await api.rawProject((await api.projects()).first.id);
    final entries = [ArchiveFile.string('project.json', jsonEncode(p))];
    for (final a in p['assets']) {
      entries.add(
        ArchiveFile.bytes(
          'assets/${a['id']}.png',
          await File(api.path(a['file'])).readAsBytes(),
        ),
      );
    }
    final result = await restore(await makeZip(entries));
    expect(result.shots.length, (p['shots'] as List).length);
    expect(result.assets.length, (p['assets'] as List).length);
  });
  for (final kind in [
    'crc',
    'traversal',
    'symlink',
    'duplicate',
    'encrypted',
    'expanded-size',
    'invalid-utf8',
  ]) {
    test('rejects $kind ZIP before publishing project files', () async {
      final p = await api.rawProject((await api.projects()).first.id);
      final manifest = {
        'format': 'jingxu-project',
        'version': 1,
        'exportedAt': timestamp(),
        'project': p,
      };
      final link = ArchiveFile.string('link', '/etc/passwd')..mode = 0xa1ff;
      final file = await makeZip([
        ArchiveFile.bytes(
          'manifest.json',
          kind == 'invalid-utf8' ? [255] : utf8.encode(jsonEncode(manifest)),
        ),
        if (kind == 'symlink') link,
        if (kind == 'duplicate') ArchiveFile.string('manifest.json', '{}'),
        if (kind == 'traversal') ArchiveFile.string('safe/a.txt', 'bad'),
      ]);
      final bytes = await file.readAsBytes(),
          data = ByteData.sublistView(bytes);
      var central = -1;
      for (var i = 0; i <= bytes.length - 4; i++) {
        if (data.getUint32(i, Endian.little) == 0x02014b50) {
          central = i;
          break;
        }
      }
      expect(central, greaterThanOrEqualTo(0));
      if (kind == 'crc') bytes[central + 16] ^= 1;
      if (kind == 'encrypted') {
        data.setUint16(
          central + 8,
          data.getUint16(central + 8, Endian.little) | 1,
          Endian.little,
        );
      }
      if (kind == 'expanded-size') {
        data.setUint32(central + 24, packageTotalLimit + 1, Endian.little);
      }
      if (kind == 'traversal') {
        final name = utf8.encode('safe/a.txt'),
            replacement = utf8.encode('../bad.txt');
        for (var i = 0; i <= bytes.length - name.length; i++) {
          if (List.generate(
            name.length,
            (n) => bytes[i + n] == name[n],
          ).every((x) => x)) {
            bytes.setRange(i, i + name.length, replacement);
          }
        }
      }
      await file.writeAsBytes(bytes);
      await expectLater(restore(file), throwsA(isA<StateError>()));
      expect((await api.projects()).length, 1);
      expect(await imports(), isEmpty);
    });
  }
  test(
    'missing media and unknown package versions do not create projects',
    () async {
      final p = await api.rawProject((await api.projects()).first.id);
      for (final version in [1, 999]) {
        final file = await makeZip([
          ArchiveFile.string(
            'manifest.json',
            jsonEncode({
              'format': 'jingxu-project',
              'version': version,
              'exportedAt': timestamp(),
              'project': p,
            }),
          ),
        ]);
        await expectLater(restore(file), throwsStateError);
      }
      expect((await api.projects()).length, 1);
      expect(await imports(), isEmpty);
    },
  );
  for (final afterWrite in [false, true]) {
    test(
      'database failure ${afterWrite ? 'after' : 'before'} write rolls back the new project and media',
      () async {
        final file = await archive();
        (records as FailingRecords)
          ..fail = true
          ..afterWrite = afterWrite;
        await expectLater(restore(file), throwsA(isA<FileSystemException>()));
        expect((await api.projects()).length, 1);
        expect(await imports(), isEmpty);
      },
    );
  }
  test(
    'cancellation interrupts a stalled source stream and removes its upload',
    () async {
      final stream = StreamController<List<int>>(),
          token = PackageCancellation();
      final result = api.importPackageStream(
        stream.stream,
        cancellation: token,
      );
      final expectation = expectLater(result, throwsStateError);
      token.cancel();
      await expectation.timeout(const Duration(seconds: 5));
      await stream.close();
      expect(await Directory(api.path('incoming')).list().toList(), isEmpty);
    },
  );
  test(
    'a confirmed committed import remains usable when its acknowledgement and rollback fail',
    () async {
      final file = await archive();
      (records as FailingRecords)
        ..fail = true
        ..afterWrite = true
        ..failRemove = true;
      final restored = await restore(file);
      expect((await api.projects()).length, 2);
      expect(await File(restored.assets.first.url).exists(), true);
    },
  );
  test(
    'a confirmed committed archive is returned when its acknowledgement fails',
    () async {
      final p = (await api.projects()).first;
      (records as FailingRecords)
        ..fail = true
        ..afterWrite = true;
      final result = await api.archive(p.id);
      expect((result['exports'] as List).length, 1);
      expect(await File(api.path(result['exports'][0]['file'])).exists(), true);
    },
  );
  test('pre-cancelled worker never extracts a project', () async {
    final file = await archive(), token = PackageCancellation()..cancel();
    await expectLater(restore(file, token: token), throwsStateError);
    expect(await imports(), isEmpty);
  });
  test('cancel stops waiting for an unavailable native media probe', () async {
    final file = await archive(), token = PackageCancellation();
    final entered = Completer<void>();
    final service = ProjectPackages(
      root: root.path,
      schema: schema,
      records: records,
      validateMedia: (_, _) {
        if (!entered.isCompleted) entered.complete();
        return Completer<void>().future;
      },
      commit: (work) => work(),
    );
    final result = service.importStream(file.openRead(), cancellation: token);
    final expectation = expectLater(result, throwsStateError);
    await entered.future.timeout(const Duration(seconds: 5));
    token.cancel();
    await expectation.timeout(const Duration(seconds: 5));
    await service.close();
    expect((await api.projects()).length, 1);
    expect(await imports(), isEmpty);
  });
  test(
    'cancellation after extraction starts never publishes a project',
    () async {
      final file = await archive(), token = PackageCancellation();
      var extracting = false;
      final result = api.importPackageStream(
        file.openRead(),
        cancellation: token,
        progress: (phase, _) {
          if (phase == 'extractingPackage') {
            extracting = true;
            token.cancel();
          }
        },
      );
      await expectLater(result, throwsStateError);
      expect(extracting, true);
      expect((await api.projects()).length, 1);
      expect(await imports(), isEmpty);
    },
  );
  test(
    'cancelled export removes partial output and its publication marker',
    () async {
      final p = (await api.projects()).first, token = PackageCancellation();
      await expectLater(
        api.archive(
          p.id,
          cancellation: token,
          progress: (phase, _) {
            if (phase == 'packingProject') token.cancel();
          },
        ),
        throwsStateError,
      );
      expect(await Directory(api.path('exports')).list().toList(), isEmpty);
      expect((await api.project(p.id)).exports, isEmpty);
    },
  );
  test(
    'valid ZIP containing unreadable image data is rejected without changing existing files',
    () async {
      final p = await api.rawProject((await api.projects()).first.id);
      final entries = [
        ArchiveFile.string(
          'manifest.json',
          jsonEncode({
            'format': 'jingxu-project',
            'version': 1,
            'exportedAt': timestamp(),
            'project': p,
          }),
        ),
      ];
      for (final (i, a) in (p['assets'] as List).indexed) {
        entries.add(
          ArchiveFile.bytes(
            a['file'],
            i == 0
                ? utf8.encode('not an image')
                : await File(api.path(a['file'])).readAsBytes(),
          ),
        );
      }
      await expectLater(
        restore(await makeZip(entries)),
        throwsA(
          isA<StateError>().having(
            (e) => e.message,
            'error',
            'invalidPackageMedia',
          ),
        ),
      );
      expect((await api.projects()).length, 1);
      expect(await imports(), isEmpty);
      expect(await api.rawProject(p['id']), p);
    },
  );
  test('JSON integral doubles remain editable after import', () async {
    final p = await api.rawProject((await api.projects()).first.id);
    p['revision'] = 2.0;
    p['shots'][0]['order'] = 1.0;
    final entries = [
      ArchiveFile.string(
        'manifest.json',
        jsonEncode({
          'format': 'jingxu-project',
          'version': 1,
          'exportedAt': timestamp(),
          'project': p,
        }),
      ),
    ];
    for (final a in p['assets']) {
      entries.add(
        ArchiveFile.bytes(
          a['file'],
          await File(api.path(a['file'])).readAsBytes(),
        ),
      );
    }
    final imported = await restore(await makeZip(entries));
    await api.mutate(
      imported.id,
      (raw) => raw['description'] = 'Still editable',
    );
    expect((await api.project(imported.id)).revision, 3);
  });
  test(
    'video export is only published after its caption sidecar exists',
    () async {
      var observed = false;
      (records as FailingRecords).onWrite = (kind, record) {
        if (kind != 'project') return;
        for (final e in record['exports']) {
          if (e['kind'] != 'video') continue;
          expect(
            File(api.path(e['subtitlesFile'])).readAsStringSync(),
            contains('00:00'),
          );
          expect(e['size'], File(api.path(e['file'])).lengthSync());
          observed = true;
        }
      };
      final p = (await api.projects()).first;
      final job = await api.request('/projects/${p.id}/render', method: 'POST');
      final deadline = DateTime.now().add(const Duration(seconds: 10));
      while (DateTime.now().isBefore(deadline)) {
        final current = (await records.all(
          'job',
        )).firstWhere((j) => j['id'] == job['id']);
        if (current['state'] == 'succeeded') break;
        if (current['state'] == 'failed') fail('${current['error']}');
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
      expect(observed, true);
      final export = (await api.project(p.id)).exports.single;
      final originalSrt = await File(export['subtitlesUrl']).readAsString();
      await api.mutate(
        p.id,
        (p) => p['shots'][0]['dialogue'] = 'Changed after rendering',
      );
      expect(
        await File(
          (await api.project(p.id)).exports.single['subtitlesUrl'],
        ).readAsString(),
        originalSrt,
      );
      expect(
        await api.request('/projects/${p.id}/subtitles'),
        contains('Changed after rendering'),
      );
      expect(
        (await records.all(
          'job',
        )).firstWhere((j) => j['id'] == job['id'])['state'],
        'succeeded',
      );
    },
  );
  test(
    'restart recovery cleans unregistered final ZIPs and retains registered archives',
    () async {
      final saved = await archive(), p = (await api.projects()).first;
      final entry = (await api.rawProject(p.id))['exports'].last;
      final orphanId = newId();
      await saved.copy(api.path('exports/$orphanId.zip'));
      for (final id in [orphanId, entry['id']]) {
        await File(
          api.path('exports/.package-export-$id.pending'),
        ).writeAsString('{}');
      }
      final service = ProjectPackages(
        root: root.path,
        schema: schema,
        records: records,
        validateMedia: (_, _) async {},
        commit: (work) => work(),
      );
      await service.recover();
      await service.close();
      expect(await saved.exists(), true);
      expect(await File(api.path('exports/$orphanId.zip')).exists(), false);
      expect(
        await Directory(
          api.path('exports'),
        ).list().where((e) => e.path.endsWith('.pending')).toList(),
        isEmpty,
      );
    },
  );
  test(
    'restart recovery removes uncommitted imports and preserves committed or unrelated files',
    () async {
      final p = (await api.projects()).first;
      for (final name in [
        '.import-leftover',
        'media/import-orphan',
        'media/import-${p.id}',
        'media/unrelated',
      ]) {
        final dir = await Directory('${root.path}/$name').create();
        await File('${dir.path}/.pending-import.json').writeAsString('{}');
      }
      final service = ProjectPackages(
        root: root.path,
        schema: schema,
        records: records,
        validateMedia: (_, _) async {},
        commit: (work) => work(),
      );
      await service.recover();
      await service.close();
      expect(await Directory('${root.path}/.import-leftover').exists(), false);
      expect(await Directory(api.path('media/import-orphan')).exists(), false);
      expect(await Directory(api.path('media/import-${p.id}')).exists(), true);
      expect(
        await File(
          api.path('media/import-${p.id}/.pending-import.json'),
        ).exists(),
        false,
      );
      expect(await Directory(api.path('media/unrelated')).exists(), true);
    },
  );
}
