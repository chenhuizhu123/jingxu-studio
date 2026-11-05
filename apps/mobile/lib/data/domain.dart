import 'captions.dart';
import 'dart:convert';
import 'package:uuid/uuid.dart';
import 'models.dart';

String newId() => const Uuid().v4();
String timestamp() => DateTime.now().toUtc().toIso8601String();
Json copyJson(Json value) =>
    Map<String, dynamic>.from(jsonDecode(jsonEncode(value)));

Json newProject(Json input, {String language = 'en'}) {
  final name = '${input['name'] ?? ''}'.trim();
  if (name.isEmpty || name.length > 100) throw ArgumentError('required');
  if (!['9:16', '16:9', '1:1'].contains(input['format'] ?? '9:16')) {
    throw ArgumentError('invalidResponse');
  }
  final project = <String, dynamic>{
    'id': newId(),
    'name': name,
    'description': input['description'] ?? '',
    'script': input['script'] ?? '',
    'style': input['style'] ?? (language == 'zh' ? '电影写实' : 'Cinematic'),
    'format': input['format'] ?? '9:16',
    'revision': 1,
    'createdAt': timestamp(),
    'updatedAt': timestamp(),
    'assets': <Json>[],
    'shots': <Json>[],
    'characters': <Json>[],
    'exports': <Json>[],
    'messages': <Json>[],
  };
  buildStoryboard(project, language: language);
  return project;
}

Json emptyShot(int order, {String language = 'en'}) => {
  'id': newId(),
  'order': order,
  'title': language == 'zh' ? '新镜头' : 'Untitled shot',
  'scene': '',
  'type': language == 'zh' ? '中景' : 'Medium',
  'duration': 4.0,
  'trimStart': 0.0,
  'dialogue': '',
  'prompt': '',
  'characterIds': <String>[],
  'referenceIds': <String>[],
  'versions': <Json>[],
  'review': 'pending',
  'note': '',
};

void buildStoryboard(Json project, {String language = 'en'}) {
  if ((project['shots'] as List).any(
    (s) => (s['versions'] as List).isNotEmpty,
  )) {
    throw StateError('hasMedia');
  }
  final lines = '${project['script']}'
      .split(RegExp(r'\n+'))
      .map((s) => s.trim())
      .where((s) => s.isNotEmpty)
      .toList();
  final characters = project['characters'] as List;
  final shots = <Json>[];
  for (final line in lines) {
    if (RegExp(r'^(角色|Cast)\s*[:：]', caseSensitive: false).hasMatch(line)) {
      final names = line
          .replaceFirst(RegExp(r'^(角色|Cast)\s*[:：]', caseSensitive: false), '')
          .split(RegExp('[、,，]'));
      for (final name
          in names.map((n) => n.trim()).where((n) => n.isNotEmpty).take(12)) {
        if (!characters.any((c) => c['name'] == name)) {
          characters.add({'id': newId(), 'name': name, 'description': ''});
        }
      }
      continue;
    }
    if (shots.length >= 60) break;
    final shot = emptyShot(shots.length + 1, language: language);
    shot['title'] = line.length > 40 ? line.substring(0, 40) : line;
    final speaker = RegExp(r'^([^:：]{1,30})[:：](.+)$').firstMatch(line);
    shot['dialogue'] = speaker?.group(2)?.trim() ?? '';
    shot['prompt'] = '${project['style']}, ${project['format']}. $line';
    shot['characterIds'] = characters
        .where((c) => line.contains(c['name'] as String))
        .map((c) => c['id'])
        .toList();
    shots.add(shot);
  }
  project['shots'] = shots;
}

void patchShot(Json project, String id, Json patch) {
  final shot = (project['shots'] as List).cast<Json>().firstWhere(
    (s) => s['id'] == id,
  );
  final allowed = {
    'title',
    'scene',
    'type',
    'dialogue',
    'prompt',
    'note',
    'duration',
    'trimStart',
    'characterIds',
    'referenceIds',
    'selectedVersionId',
    'review',
    'audioAssetId',
    'captionTrack',
  };
  if (patch.keys.any((key) => !allowed.contains(key))) {
    throw ArgumentError('invalidResponse');
  }
  for (final key in ['title', 'scene', 'type', 'dialogue', 'prompt', 'note']) {
    if (patch.containsKey(key) &&
        (patch[key] is! String || (patch[key] as String).length > 10000)) {
      throw ArgumentError('invalidResponse');
    }
  }
  if (patch.containsKey('review') &&
      !['pending', 'approved', 'changes'].contains(patch['review'])) {
    throw ArgumentError('invalidResponse');
  }
  final duration = patch['duration'];
  if (duration != null &&
      (duration is! num ||
          !duration.isFinite ||
          duration < 2 ||
          duration > 30)) {
    throw ArgumentError('invalidDuration');
  }
  final trim = patch['trimStart'];
  if (trim != null &&
      (trim is! num || !trim.isFinite || trim < 0 || trim > 86400)) {
    throw ArgumentError('invalidTrim');
  }
  if (patch['selectedVersionId'] != null &&
      !(shot['versions'] as List).any(
        (v) => v['id'] == patch['selectedVersionId'],
      )) {
    throw ArgumentError('invalidVersion');
  }
  for (final key in ['characterIds', 'referenceIds']) {
    if (patch[key] != null &&
        (patch[key] as List).any(
          (id) =>
              !(project[key == 'characterIds' ? 'characters' : 'assets']
                      as List)
                  .any(
                    (a) =>
                        a['id'] == id &&
                        (key == 'characterIds' || a['kind'] == 'image'),
                  ),
        )) {
      throw ArgumentError('invalidReference');
    }
  }
  if (patch['captionTrack'] != null) {
    validateCaptionTrack(Map<String, dynamic>.from(patch['captionTrack']));
    final track = patch['captionTrack'];
    if (!(project['assets'] as List).any(
      (a) =>
          a['id'] == track['source']['assetId'] &&
          (track['origin'] == 'manual'
                  ? ['audio', 'video', 'image']
                  : ['audio', 'video'])
              .contains(a['kind']),
    )) {
      throw ArgumentError('invalidCaptions');
    }
    final updated = Shot.fromJson({...shot, ...patch});
    if (!captionsCurrent(updated)) throw StateError('captionStale');
  }
  if (patch['audioAssetId'] != null &&
      !(project['assets'] as List).any(
        (a) => a['id'] == patch['audioAssetId'] && a['kind'] == 'audio',
      )) {
    throw ArgumentError('invalidReference');
  }
  if ((patch.containsKey('duration') &&
          patch['duration'] != shot['duration']) ||
      (patch.containsKey('trimStart') &&
          patch['trimStart'] != (shot['trimStart'] ?? 0)) ||
      ['scene', 'characterIds', 'referenceIds'].any(
        (key) =>
            patch.containsKey(key) &&
            jsonEncode(patch[key]) != jsonEncode(shot[key]),
      ) ||
      (patch['selectedVersionId'] != null &&
          patch['selectedVersionId'] != shot['selectedVersionId'])) {
    shot.remove('visualReview');
    shot['review'] = 'pending';
  }
  shot.addAll(patch);
}

void reorder(Json project, List<String> ids) {
  final shots = (project['shots'] as List).cast<Json>();
  if (ids.length != shots.length ||
      ids.toSet().length != ids.length ||
      ids.any((id) => !shots.any((s) => s['id'] == id))) {
    throw ArgumentError('invalidOrder');
  }
  project['shots'] = ids.indexed
      .map(
        (entry) =>
            shots.firstWhere((s) => s['id'] == entry.$2)
              ..['order'] = entry.$1 + 1,
      )
      .toList();
}

void addCandidate(
  Json project,
  String shotId,
  Json asset,
  String prompt,
  String source, {
  String? provider,
}) {
  final shot = (project['shots'] as List).cast<Json>().firstWhere(
    (s) => s['id'] == shotId,
  );
  if (!(project['assets'] as List).any((a) => a['id'] == asset['id'])) {
    (project['assets'] as List).add(asset);
  }
  final versions = shot['versions'] as List;
  final version = {
    'id': newId(),
    'number': versions.length + 1,
    'assetId': asset['id'],
    'prompt': prompt,
    'source': source,
    'provider': ?provider,
    'createdAt': timestamp(),
  };
  versions.add(version);
  shot['selectedVersionId'] ??= version['id'];
  shot['review'] = 'pending';
}

String srtTime(double seconds) {
  final ms = (seconds * 1000).round();
  return '${(ms ~/ 3600000).toString().padLeft(2, '0')}:${(ms ~/ 60000 % 60).toString().padLeft(2, '0')}:${(ms ~/ 1000 % 60).toString().padLeft(2, '0')},${(ms % 1000).toString().padLeft(3, '0')}';
}

String subtitles(Project project) {
  double cursor = 0;
  int n = 0;
  final result = <String>[];
  for (final shot in project.shots) {
    for (final cue in captionCues(shot)) {
      result.add(
        '${++n}\n${srtTime(cursor + (cue['start'] as num))} --> ${srtTime(cursor + (cue['end'] as num))}\n${plainSubtitle(cue['text'])}\n',
      );
    }
    cursor += shot.duration;
  }
  return result.join('\n');
}

String csvCell(dynamic value) {
  var text = '$value';
  if (RegExp(r'^[=+@-]').hasMatch(text)) text = "'$text";
  return '"${text.replaceAll('"', '""')}"';
}

String storyboardCsv(Project project) =>
    '\uFEFF${[
      ['Shot', 'Title', 'Scene', 'Type', 'Seconds', 'Dialogue', 'Prompt', 'Version'],
      ...project.shots.map((s) => [s.order, s.title, s.scene, s.type, s.duration, s.dialogue, s.prompt, s.selected?.number ?? '']),
    ].map((row) => row.map(csvCell).join(',')).join('\r\n')}';
