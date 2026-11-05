import 'captions.dart';
import 'dart:convert';
import 'package:json_schema/json_schema.dart';
import 'package:path/path.dart' as paths;
import 'domain.dart';
import 'models.dart';

const packageTotalLimit = 2 * 1024 * 1024 * 1024;
const packageAssetLimit = 200 * 1024 * 1024;
const packageMetadataLimit = 8 * 1024 * 1024;
const packageEntryLimit = 3000;
const mediaFormats = <String, List<String>>{
  '.png': ['image', 'image/png'],
  '.jpg': ['image', 'image/jpeg'],
  '.jpeg': ['image', 'image/jpeg'],
  '.webp': ['image', 'image/webp'],
  '.mp4': ['video', 'video/mp4'],
  '.mp3': ['audio', 'audio/mpeg'],
  '.wav': ['audio', 'audio/wav'],
  '.m4a': ['audio', 'audio/mp4'],
  '.txt': ['document', 'text/plain'],
  '.srt': ['document', 'text/plain'],
};
Never invalidPackage() => throw StateError('invalidPackage');
String safePackagePath(String value) {
  final name = value.endsWith('/')
      ? value.substring(0, value.length - 1)
      : value;
  if (name.isEmpty ||
      name.length > 400 ||
      RegExp(r'[\\:\x00-\x1f]').hasMatch(name) ||
      name.startsWith('/') ||
      name.split('/').any((s) => s.isEmpty || s == '.' || s == '..')) {
    invalidPackage();
  }
  return name;
}

void _unique(Iterable<dynamic> ids) {
  final list = ids.toList();
  if (list.toSet().length != list.length) invalidPackage();
}

/// Same generated JSON Schema as the desktop engine, with explicit transforms
/// for defaults/unknown fields (JSON Schema validation itself never mutates).
class PackageContract {
  final Json schema;
  late final JsonSchema validator = JsonSchema.create(schema);
  PackageContract(String source)
    : schema = Map<String, dynamic>.from(jsonDecode(source));
  dynamic _normalize(dynamic value, Json spec) {
    if (spec['type'] == 'integer' &&
        value is num &&
        value.isFinite &&
        value == value.truncateToDouble()) {
      return value.toInt();
    }
    if (spec['type'] == 'object' && value is Map) {
      final result = <String, dynamic>{};
      for (final entry in (spec['properties'] as Map? ?? {}).entries) {
        final key = entry.key as String,
            child = Map<String, dynamic>.from(entry.value);
        final raw = value[key];
        if (raw == null ||
            (raw == '' &&
                const [
                  'audioAssetId',
                  'musicAssetId',
                  'selectedVersionId',
                  'referenceId',
                  'characterId',
                  'subtitlesFile',
                ].contains(key))) {
          if (child.containsKey('default')) {
            result[key] = jsonDecode(jsonEncode(child['default']));
          }
          continue;
        }
        result[key] = _normalize(raw, child);
      }
      return result;
    }
    if (spec['type'] == 'array' && value is List && spec['items'] is Map) {
      return value
          .map((v) => _normalize(v, Map<String, dynamic>.from(spec['items'])))
          .toList();
    }
    return value;
  }

  Json project(dynamic input) {
    final spec = Map<String, dynamic>.from(schema['properties']['project']);
    final candidate = _normalize(input, spec);
    if (candidate is! Map<String, dynamic>) invalidPackage();
    if (candidate['name'] is String) {
      candidate['name'] = (candidate['name'] as String).trim();
    }
    final envelope = {
      'format': 'jingxu-project',
      'version': 1,
      'exportedAt': timestamp(),
      'project': candidate,
    };
    if (!validator.validate(envelope).isValid) invalidPackage();
    final p = candidate;
    final assets = (p['assets'] as List).cast<Json>(),
        shots = (p['shots'] as List).cast<Json>();
    final cast = (p['characters'] as List).cast<Json>(),
        exports = (p['exports'] as List).cast<Json>();
    for (final values in [
      assets,
      shots,
      cast,
      exports,
      (p['messages'] as List).cast<Json>(),
    ]) {
      _unique(values.map((v) => v['id']));
    }
    _unique(shots.map((s) => s['order']));
    _unique(shots.expand((s) => (s['versions'] as List).map((v) => v['id'])));
    final byAsset = {for (final a in assets) a['id']: a};
    final castIds = cast.map((c) => c['id']).toSet();
    void requireAsset(dynamic id, List<String> kinds) {
      if (id != null && !kinds.contains(byAsset[id]?['kind'])) invalidPackage();
    }

    final datePattern = RegExp(schema['properties']['exportedAt']['pattern']);
    void date(Json record) {
      if (record['createdAt'] == '') record['createdAt'] = p['createdAt'];
      if (!datePattern.hasMatch(record['createdAt'])) invalidPackage();
    }

    for (final a in assets) {
      safePackagePath(a['file']);
      final format = mediaFormats[paths.extension(a['file']).toLowerCase()];
      if (format == null || format[0] != a['kind']) invalidPackage();
      a['mime'] = format[1];
      date(a);
      if (a['characterId'] != null && !castIds.contains(a['characterId'])) {
        invalidPackage();
      }
    }
    for (final c in cast) {
      requireAsset(c['referenceId'], ['image']);
    }
    requireAsset(p['musicAssetId'], ['audio']);
    for (final s in shots) {
      final versions = (s['versions'] as List).cast<Json>();
      _unique(versions.map((v) => v['number']));
      if (s['selectedVersionId'] != null &&
          !versions.any((v) => v['id'] == s['selectedVersionId'])) {
        invalidPackage();
      }
      for (final c in s['characterIds']) {
        if (!castIds.contains(c)) invalidPackage();
      }
      for (final r in s['referenceIds']) {
        requireAsset(r, ['image']);
      }
      requireAsset(s['audioAssetId'], ['audio']);
      if (s['captionTrack'] != null) {
        validateCaptionTrack(s['captionTrack']);
        requireAsset(
          s['captionTrack']['source']['assetId'],
          s['captionTrack']['origin'] == 'manual'
              ? ['audio', 'video', 'image']
              : ['audio', 'video'],
        );
      }
      for (final v in versions) {
        requireAsset(v['assetId'], ['image', 'video']);
        date(v);
      }
      if (s['visualReview'] case final Map review) {
        if (!versions.any((v) => v['id'] == review['versionId'])) {
          invalidPackage();
        }
        for (final r in review['referenceIds']) {
          requireAsset(r, ['image']);
        }
      }
    }
    for (final e in exports) {
      safePackagePath(e['file']);
      if (e['subtitlesFile'] != null) safePackagePath(e['subtitlesFile']);
    }
    return p;
  }

  Json manifest(dynamic input) {
    if (input is! Map ||
        input['format'] != 'jingxu-project' ||
        ![1, 2].contains(input['version'])) {
      throw StateError('packageVersion');
    }
    final result = {
      'format': 'jingxu-project',
      'version': input['version'],
      'exportedAt': input['exportedAt'],
      'project': project(input['project']),
    };
    if (!validator.validate(result).isValid) invalidPackage();
    return result;
  }
}

Json remapPackageProject(Json original) {
  final p = copyJson(original), projectId = newId();
  final assets = {for (final a in p['assets']) a['id']: newId()};
  final cast = {for (final c in p['characters']) c['id']: newId()};
  final versions = {
    for (final s in p['shots'])
      for (final v in s['versions']) v['id']: newId(),
  };
  final prefix = 'media/import-$projectId';
  p['id'] = projectId;
  p['updatedAt'] = timestamp();
  for (final a in p['assets']) {
    a['id'] = assets[a['id']];
    a['file'] =
        '$prefix/assets/${a['id']}${paths.extension(a['file']).toLowerCase()}';
    if (a['characterId'] != null) a['characterId'] = cast[a['characterId']];
  }
  for (final c in p['characters']) {
    c['id'] = cast[c['id']];
    if (c['referenceId'] != null) c['referenceId'] = assets[c['referenceId']];
  }
  if (p['musicAssetId'] != null) p['musicAssetId'] = assets[p['musicAssetId']];
  (p['shots'] as List).sort(
    (a, b) => (a['order'] as num).compareTo(b['order']),
  );
  for (final (index, s) in (p['shots'] as List).indexed) {
    s['id'] = newId();
    s['order'] = index + 1;
    s['characterIds'] = [for (final id in s['characterIds']) cast[id]];
    s['referenceIds'] = [for (final id in s['referenceIds']) assets[id]];
    if (s['audioAssetId'] != null) {
      s['audioAssetId'] = assets[s['audioAssetId']];
    }
    if (s['captionTrack'] != null) {
      s['captionTrack']['source']['assetId'] =
          assets[s['captionTrack']['source']['assetId']];
    }
    if (s['selectedVersionId'] != null) {
      s['selectedVersionId'] = versions[s['selectedVersionId']];
    }
    for (final v in s['versions']) {
      v['id'] = versions[v['id']];
      v['assetId'] = assets[v['assetId']];
    }
    if (s['visualReview'] case final Map review) {
      review['versionId'] = versions[review['versionId']];
      review['referenceIds'] = [
        for (final id in review['referenceIds']) assets[id],
      ];
    }
  }
  p['exports'] = (p['exports'] as List)
      .where((e) => e['kind'] == 'video')
      .toList();
  for (final e in p['exports']) {
    e['id'] = newId();
    e['file'] = '$prefix/renders/${e['id']}.mp4';
    if (e['subtitlesFile'] != null) {
      e['subtitlesFile'] = '$prefix/renders/${e['id']}.srt';
    }
  }
  for (final m in p['messages']) {
    m['id'] = newId();
  }
  return p;
}
