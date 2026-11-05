import 'captions.dart';
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:isolate';
import 'package:archive/archive_io.dart';
import 'package:path/path.dart' as paths;
import 'domain.dart';
import 'models.dart';
import 'package_contract.dart';

class PackageCancellation {
  bool cancelled = false, _sealed = false;
  final _cancelled = Completer<void>();
  Future<void> get whenCancelled => _cancelled.future;
  void Function()? _abort;
  bool get canCancel => !_sealed;
  void cancel() {
    if (_sealed || cancelled) return;
    cancelled = true;
    _cancelled.complete();
    _abort?.call();
  }

  void check() {
    if (cancelled) throw StateError('packageCancelled');
  }

  void seal() {
    check();
    _sealed = true;
    _abort = null;
  }
}

typedef PackageProgress = void Function(String phase, double fraction);

/// The worker only knows paths and plain data, never keys, database handles or
/// Flutter objects. Killing it stops extraction; the caller owns staging cleanup.
Future<Json> runPackageWorker(
  Json input,
  PackageCancellation token,
  PackageProgress? progress,
) async {
  token.check();
  final port = ReceivePort(),
      result = Completer<Json>(),
      exited = Completer<void>();
  Isolate? isolate;
  final subscription = port.listen((message) {
    if (message == null) {
      if (!exited.isCompleted) exited.complete();
      if (!result.isCompleted) {
        result.completeError(StateError('invalidPackage'));
      }
    } else if (message is Map) {
      if (message['progress'] == true) {
        if (!result.isCompleted) {
          progress?.call(
            message['phase'],
            (message['fraction'] as num).toDouble(),
          );
        }
      } else if (!result.isCompleted) {
        if (message.containsKey('error')) {
          result.completeError(StateError(message['error']));
        } else {
          result.complete(Map<String, dynamic>.from(message));
        }
      }
    } else if (!result.isCompleted) {
      result.completeError(StateError('invalidPackage'));
    }
  });
  token._abort = () {
    isolate?.kill(priority: Isolate.immediate);
    if (!result.isCompleted) {
      result.completeError(StateError('packageCancelled'));
    }
  };
  // Attach the error listener before spawn; cancellation can happen while spawn awaits.
  final outcome = result.future;
  unawaited(outcome.catchError((_) => <String, dynamic>{}));
  try {
    isolate = await Isolate.spawn(
      _worker,
      [port.sendPort, input],
      onError: port.sendPort,
      onExit: port.sendPort,
    );
    if (token.cancelled) isolate.kill(priority: Isolate.immediate);
    return await outcome;
  } finally {
    token._abort = null;
    if (isolate != null) {
      isolate.kill(priority: Isolate.immediate);
      await exited.future;
    }
    await subscription.cancel();
    port.close();
  }
}

void _worker(List<dynamic> args) async {
  final send = args[0] as SendPort, input = args[1] as Json;
  final timer = Stopwatch()..start();
  var last = -100;
  void progress(String phase, double fraction) {
    if (timer.elapsedMilliseconds - last < 80 && fraction < 1) return;
    last = timer.elapsedMilliseconds;
    send.send({'progress': true, 'phase': phase, 'fraction': fraction});
  }

  try {
    send.send(
      input['operation'] == 'import'
          ? _extract(input, progress)
          : await _export(input, progress),
    );
  } catch (e) {
    final key = e is StateError
        ? e.message
        : e is FileSystemException
        ? 'packageStorageError'
        : 'invalidPackage';
    send.send({'error': key});
  }
}

String packageLocalPath(String root, String relative) {
  safePackagePath(relative);
  final file = paths.normalize(paths.join(root, relative));
  if (!paths.isWithin(root, file)) invalidPackage();
  return file;
}

Map<String, ZipFileHeader> _entries(InputFileStream input) {
  final directory = ZipDirectory(), result = <String, ZipFileHeader>{};
  var total = 0;
  for (final entry in directory.headers(input, verify: true)) {
    if (directory.centralDirectorySize > 16 * 1024 * 1024 ||
        directory.totalCentralDirectoryEntries > packageEntryLimit ||
        directory.totalCentralDirectoryEntries < 0 ||
        directory.numberOfThisDisk != 0 ||
        directory.diskWithTheStartOfTheCentralDirectory != 0) {
      invalidPackage();
    }
    final name = safePackagePath(entry.filename),
        kind = (entry.externalFileAttributes >> 16) & 0xf000;
    if (result.containsKey(name) ||
        result.length >= packageEntryLimit ||
        entry.generalPurposeBitFlag & 1 != 0 ||
        ![0, 8].contains(entry.compressionMethod) ||
        ![0, 0x8000, 0x4000].contains(kind) ||
        entry.diskNumberStart != 0 ||
        entry.uncompressedSize < 0 ||
        entry.compressedSize < 0) {
      invalidPackage();
    }
    total += entry.uncompressedSize;
    if (total > packageTotalLimit) throw StateError('packageTooLarge');
    result[name] = entry;
  }
  if (directory.filePosition < 0) invalidPackage();
  return result;
}

void _decode(ZipFileHeader entry, OutputStream output, int maximum) {
  if (entry.filename.endsWith('/') || entry.uncompressedSize > maximum) {
    invalidPackage();
  }
  final file = entry.file;
  if (file == null ||
      safePackagePath(file.filename) != safePackagePath(entry.filename) ||
      file.flags & 1 != 0 ||
      ![
        CompressionType.none,
        CompressionType.deflate,
      ].contains(file.compressionMethod) ||
      file.unsupportedMethod != null ||
      file.uncompressedSize != entry.uncompressedSize ||
      file.compressedSize != entry.compressedSize) {
    invalidPackage();
  }
  file.verify = true;
  file.throwOnError = true;
  file.decompress(output);
  output.flush();
  if (output.length != entry.uncompressedSize) invalidPackage();
}

Json _extract(Json args, PackageProgress progress) {
  final source = File(args['filename']);
  if (source.lengthSync() > packageTotalLimit) {
    throw StateError('packageTooLarge');
  }
  final input = InputFileStream(source.path);
  try {
    final entries = _entries(input), contract = PackageContract(args['schema']);
    final manifest = entries['manifest.json'] ?? entries['project.json'];
    if (manifest == null) invalidPackage();
    final buffer = OutputMemoryStream();
    _decode(manifest, buffer, packageMetadataLimit);
    final decoded = jsonDecode(
      utf8.decode(buffer.getBytes(), allowMalformed: false),
    );
    var original = entries.containsKey('manifest.json')
        ? contract.manifest(decoded)['project'] as Json
        : contract.project(decoded);
    if (!entries.containsKey('manifest.json')) {
      for (final a in original['assets']) {
        if (entries.containsKey(a['file'])) continue;
        final matches = entries.keys
            .where(
              (n) =>
                  n.startsWith('assets/${a['id']}-') ||
                  n.startsWith('assets/${a['id']}.'),
            )
            .toList();
        if (matches.length != 1) throw StateError('packageMissingMedia');
        a['file'] = matches.single;
      }
      for (final e in original['exports']) {
        if (e['kind'] != 'video') continue;
        if (!entries.containsKey(e['file'])) {
          e['file'] = 'renders/${e['id']}.mp4';
        }
        if (entries.containsKey('renders/${e['id']}.srt')) {
          e['subtitlesFile'] = 'renders/${e['id']}.srt';
        }
      }
      original = contract.project(original);
    }
    original['exports'] = (original['exports'] as List)
        .where((e) => e['kind'] == 'video')
        .toList();
    final project = remapPackageProject(original), files = <Json>[];
    for (final (i, a) in (original['assets'] as List).indexed) {
      files.add({
        'source': a['file'],
        'target': 'assets/${paths.basename(project['assets'][i]['file'])}',
        'kind': a['kind'],
        'maximum': packageAssetLimit,
        'record': project['assets'][i],
      });
    }
    for (final (i, e) in (original['exports'] as List).indexed) {
      files.add({
        'source': e['file'],
        'target': 'renders/${paths.basename(project['exports'][i]['file'])}',
        'kind': 'video',
        'maximum': packageTotalLimit,
        'record': project['exports'][i],
      });
      if (e['subtitlesFile'] != null) {
        files.add({
          'source': e['subtitlesFile'],
          'target':
              'renders/${paths.basename(project['exports'][i]['subtitlesFile'])}',
          'kind': 'document',
          'maximum': packageMetadataLimit,
        });
      }
    }
    var total = 0, written = 0;
    for (final f in files) {
      final entry = entries[f['source']];
      if (entry == null) throw StateError('packageMissingMedia');
      if (entry.uncompressedSize > f['maximum']) {
        throw StateError('packageTooLarge');
      }
      total += entry.uncompressedSize;
    }
    for (final f in files) {
      final destination = File(packageLocalPath(args['staging'], f['target']));
      destination.parent.createSync(recursive: true);
      final output = OutputFileStream(destination.path);
      try {
        final tracked = ProgressOutputStream(
          output,
          (count) => progress(
            'extractingPackage',
            total == 0 ? 1 : (written + count) / total,
          ),
          interval: 4 * 1024 * 1024,
        );
        _decode(entries[f['source']]!, tracked, f['maximum']);
        written += output.length;
        if (f['record'] != null) f['record']['size'] = output.length;
      } finally {
        output.closeSync();
      }
    }
    return {
      'project': project,
      'files': [
        for (final f in files) {'file': f['target'], 'kind': f['kind']},
      ],
    };
  } finally {
    input.closeSync();
  }
}

Future<Json> _export(Json args, PackageProgress progress) async {
  final contract = PackageContract(args['schema']);
  final candidate = copyJson(args['project']);
  candidate['exports'] = (candidate['exports'] as List)
      .where((e) => e['kind'] == 'video')
      .toList();
  final p = contract.project(candidate), files = <Json>[];
  var total = 0;
  int add(String source, String target, int limit) {
    final file = File(packageLocalPath(args['root'], source)),
        size = file.lengthSync();
    if (size > limit) throw StateError('packageTooLarge');
    total += size;
    files.add({'source': file.path, 'target': target, 'size': size});
    return size;
  }

  for (final a in p['assets']) {
    final target =
        'assets/${a['id']}${paths.extension(a['file']).toLowerCase()}';
    a['size'] = add(a['file'], target, packageAssetLimit);
    a['file'] = target;
  }
  for (final e in p['exports']) {
    final source = e['file'] as String, target = 'renders/${e['id']}.mp4';
    e['size'] = add(source, target, packageTotalLimit);
    e['file'] = target;
    final subtitle =
        e['subtitlesFile'] ??
        source.replaceFirst(RegExp(r'\.mp4$', caseSensitive: false), '.srt');
    if (File(packageLocalPath(args['root'], subtitle)).existsSync()) {
      e['subtitlesFile'] = 'renders/${e['id']}.srt';
      add(subtitle, e['subtitlesFile'], packageMetadataLimit);
    } else {
      e.remove('subtitlesFile');
    }
  }
  final manifest = jsonEncode({
    'format': 'jingxu-project',
    'version': (p['shots'] as List).any((s) => s['captionTrack'] != null)
        ? 2
        : 1,
    'exportedAt': timestamp(),
    'project': p,
  });
  if (utf8.encode(manifest).length > packageMetadataLimit) {
    throw StateError('packageTooLarge');
  }
  final buffers = {
    'manifest.json': manifest,
    'project.json': jsonEncode(p),
    if (!Project.fromJson(
      p,
    ).shots.any((s) => s.captionTrack != null && !captionsCurrent(s)))
      'subtitles.srt': subtitles(Project.fromJson(p)),
    'storyboard.csv': storyboardCsv(Project.fromJson(p)),
    'README.txt':
        'Jingxu Studio project package. Contains project content and media; device settings and tool permissions stay on the original device.\n',
  };
  total += buffers.values.fold<int>(
    0,
    (sum, value) => sum + utf8.encode(value).length,
  );
  if (total > packageTotalLimit) throw StateError('packageTooLarge');
  final encoder = ZipFileEncoder()
    ..create(args['output'], level: ZipFileEncoder.store);
  var written = 0;
  try {
    for (final entry in buffers.entries) {
      encoder.addArchiveFile(ArchiveFile.string(entry.key, entry.value));
    }
    for (final f in files) {
      await encoder.addFile(
        File(f['source']),
        f['target'],
        ZipFileEncoder.store,
      );
      written += f['size'] as int;
      progress('packingProject', total == 0 ? 1 : written / total);
    }
  } finally {
    await encoder.close();
  }
  if (File(args['output']).lengthSync() > packageTotalLimit) {
    throw StateError('packageTooLarge');
  }
  return {'bytes': File(args['output']).lengthSync()};
}
