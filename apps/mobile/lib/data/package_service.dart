import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:path/path.dart' as paths;
import 'domain.dart';
import 'models.dart';
import 'records.dart';
import 'package_contract.dart';
import 'package_files.dart';

typedef PackageMediaCheck = Future<void> Function(String file, String kind);

Future<void> _discard(FileSystemEntity entity) async {
  try {
    if (await entity.exists()) {
      await entity.delete(recursive: entity is Directory);
    }
  } catch (_) {
    /* owned leftovers are checked on the next launch */
  }
}

class ProjectPackages {
  final String root, schema;
  final Records records;
  final PackageMediaCheck validateMedia;
  final Future<Json> Function(Future<Json> Function()) commit;
  final _tokens = <PackageCancellation>{}, _active = <Future<void>>{};
  bool _closed = false;
  ProjectPackages({
    required this.root,
    required this.schema,
    required this.records,
    required this.validateMedia,
    required this.commit,
  });

  Future<T> _task<T>(PackageCancellation token, Future<T> Function() body) {
    if (_closed) return Future.error(StateError('packageCancelled'));
    _tokens.add(token);
    final work = body(), done = work.then<void>((_) {}, onError: (Object _) {});
    _active.add(done);
    return work.whenComplete(() {
      _tokens.remove(token);
      _active.remove(done);
    });
  }

  Future<Json> importFile(
    String filename, {
    PackageCancellation? cancellation,
    PackageProgress? progress,
  }) {
    final token = cancellation ?? PackageCancellation();
    return _task(token, () => _import(filename, token, progress));
  }

  Future<Json> importStream(
    Stream<List<int>> source, {
    int? length,
    PackageCancellation? cancellation,
    PackageProgress? progress,
  }) {
    final token = cancellation ?? PackageCancellation();
    return _task(token, () async {
      token.check();
      if (length != null && length > packageTotalLimit) {
        throw StateError('packageTooLarge');
      }
      final file = File(
        paths.join(root, 'incoming', '.package-upload-${newId()}.zip'),
      );
      await file.parent.create(recursive: true);
      final output = await file.open(mode: FileMode.write);
      final iterator = StreamIterator(source);
      var bytes = 0, closed = false;
      try {
        while (await Future.any([
          iterator.moveNext(),
          token.whenCancelled.then((_) => false),
        ])) {
          token.check();
          bytes += iterator.current.length;
          if (bytes > packageTotalLimit) throw StateError('packageTooLarge');
          await output.writeFrom(iterator.current);
          progress?.call(
            'readingPackage',
            length == null || length == 0 ? 0 : bytes / length,
          );
        }
        token.check();
        await output.close();
        closed = true;
        return await _import(file.path, token, progress);
      } finally {
        try {
          await iterator.cancel();
        } catch (_) {}
        if (!closed) {
          try {
            await output.close();
          } catch (_) {}
        }
        await _discard(file);
      }
    });
  }

  Future<Json> _import(
    String filename,
    PackageCancellation token,
    PackageProgress? progress,
  ) async {
    token.check();
    final staging = await Directory(root).createTemp('.import-');
    String? published, projectId;
    try {
      final result = await runPackageWorker(
        {
          'operation': 'import',
          'filename': filename,
          'staging': staging.path,
          'schema': schema,
        },
        token,
        progress,
      );
      final project = Map<String, dynamic>.from(result['project']);
      projectId = project['id'];
      final files = result['files'] as List;
      for (final (i, item) in files.indexed) {
        token.check();
        progress?.call('checkingPackage', files.isEmpty ? 1 : i / files.length);
        try {
          await Future.any<void>([
            validateMedia(
              packageLocalPath(staging.path, item['file']),
              item['kind'],
            ),
            token.whenCancelled.then((_) => token.check()),
          ]);
        } on FileSystemException {
          throw StateError('packageStorageError');
        } catch (_) {
          token.check();
          throw StateError('invalidPackageMedia');
        }
      }
      token.check();
      final committed = await commit(() async {
        token.check();
        if ((await records.all('project')).any((p) => p['id'] == projectId)) {
          invalidPackage();
        }
        await File(
          paths.join(staging.path, '.pending-import.json'),
        ).writeAsString(jsonEncode({'projectId': projectId}));
        token.seal();
        progress?.call('savingPackage', 1);
        published = paths.join(root, 'media', 'import-$projectId');
        await staging.rename(published!);
        try {
          await records.put('project', project);
        } catch (_) {
          var retained = false;
          try {
            await records.remove('project', projectId!);
          } catch (_) {
            try {
              retained = (await records.all(
                'project',
              )).any((p) => p['id'] == projectId);
            } catch (_) {}
          }
          if (!retained) rethrow;
        }
        await _discard(File(paths.join(published!, '.pending-import.json')));
        published = null;
        return project;
      });
      return committed;
    } finally {
      await _discard(staging);
      if (published != null) {
        var persisted = true;
        try {
          persisted = (await records.all(
            'project',
          )).any((p) => p['id'] == projectId);
        } catch (_) {
          /* do not destroy files while database state is unknown */
        }
        if (!persisted) await _discard(Directory(published!));
      }
    }
  }

  Future<Json> exportProject(
    Json project, {
    PackageCancellation? cancellation,
    PackageProgress? progress,
  }) {
    final token = cancellation ?? PackageCancellation();
    return _task(token, () async {
      final key = newId(), relative = 'exports/$key.zip';
      final partial = File(
        paths.join(root, 'exports', '.package-$key.partial'),
      );
      final marker = File(
        paths.join(root, 'exports', '.package-export-$key.pending'),
      );
      await marker.writeAsString(jsonEncode({'projectId': project['id']}));
      var ready = false;
      try {
        final result = await runPackageWorker(
          {
            'operation': 'export',
            'root': root,
            'schema': schema,
            'project': copyJson(project),
            'output': partial.path,
          },
          token,
          progress,
        );
        token.check();
        token.seal();
        progress?.call('savingPackage', 1);
        await partial.rename(packageLocalPath(root, relative));
        ready = true;
        return {
          'id': key,
          'name': '${project['name']}-project.zip',
          'file': relative,
          'kind': 'archive',
          'createdAt': timestamp(),
          'size': result['bytes'],
          'revision': project['revision'],
        };
      } finally {
        await _discard(partial);
        if (!ready) {
          final finalFile = File(packageLocalPath(root, relative));
          await _discard(finalFile);
          await _discard(marker);
        }
      }
    });
  }

  Future<void> completeExport(Json entry) async {
    try {
      await File(
        paths.join(root, 'exports', '.package-export-${entry['id']}.pending'),
      ).delete();
    } catch (_) {
      /* registered archives are retained by restart recovery */
    }
  }

  Future<void> recover() async {
    final projects = await records.all('project');
    await for (final entity in Directory(root).list(followLinks: false)) {
      if (entity is Directory &&
          RegExp(
            r'^\.import-[A-Za-z0-9_-]+$',
          ).hasMatch(paths.basename(entity.path))) {
        await entity.delete(recursive: true);
      }
    }
    await for (final entity in Directory(
      paths.join(root, 'media'),
    ).list(followLinks: false)) {
      final name = paths.basename(entity.path);
      if (entity is! Directory ||
          !RegExp(r'^import-[A-Za-z0-9_-]+$').hasMatch(name)) {
        continue;
      }
      final marker = File(paths.join(entity.path, '.pending-import.json'));
      if (!await marker.exists()) continue;
      final prefix = 'media/$name/';
      final retained = projects.any(
        (p) =>
            'import-${p['id']}' == name ||
            [
              ...p['assets'],
              ...p['exports'],
            ].any((a) => '${a['file']}'.startsWith(prefix)),
      );
      if (retained) {
        await marker.delete();
      } else {
        await entity.delete(recursive: true);
      }
    }
    for (final folder in ['incoming', 'exports']) {
      final dir = Directory(paths.join(root, folder));
      if (!await dir.exists()) continue;
      await for (final entry in dir.list(followLinks: false)) {
        final pending = RegExp(
          r'^\.package-export-([A-Za-z0-9_-]+)\.pending$',
        ).firstMatch(paths.basename(entry.path));
        if (entry is File && folder == 'exports' && pending != null) {
          final id = pending.group(1)!,
              relative = 'exports/${pending.group(1)}.zip';
          final retained = projects.any(
            (p) => (p['exports'] as List).any(
              (e) => e['id'] == id && e['file'] == relative,
            ),
          );
          final archive = File(packageLocalPath(root, relative));
          if (!retained && await archive.exists()) await archive.delete();
          await entry.delete();
          continue;
        }
        if (entry is File &&
            RegExp(
              r'^\.package-(?:upload-)?[A-Za-z0-9_-]+\.(?:zip|partial)$',
            ).hasMatch(paths.basename(entry.path))) {
          await entry.delete();
        }
      }
    }
  }

  Future<void> close() async {
    _closed = true;
    for (final token in _tokens.toList()) {
      token.cancel();
    }
    await Future.wait(_active.toList());
  }
}
