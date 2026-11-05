typedef Json = Map<String, dynamic>;

class MediaAsset {
  final String id, name, kind, url;
  final int size;
  MediaAsset.fromJson(Json data)
    : id = data['id'] as String,
      name = data['name'] as String? ?? '',
      kind = data['kind'] as String? ?? 'document',
      url = data['url'] as String? ?? '',
      size = (data['size'] as num?)?.toInt() ?? 0;
}

class ShotVersion {
  final String id, assetId, source, prompt;
  final int number;
  ShotVersion.fromJson(Json data)
    : id = data['id'] as String,
      assetId = data['assetId'] as String,
      source = data['source'] as String? ?? '',
      prompt = data['prompt'] as String? ?? '',
      number = (data['number'] as num?)?.toInt() ?? 1;
}

class Shot {
  final String id, title, scene, type, dialogue, prompt, review, note;
  final String? selectedVersionId, audioAssetId;
  final int order;
  final double duration, trimStart;
  final List<String> characterIds, referenceIds;
  final List<ShotVersion> versions;
  final Json? visualReview, captionTrack;
  Shot.fromJson(Json data)
    : id = data['id'] as String,
      title = data['title'] as String? ?? '',
      scene = data['scene'] as String? ?? '',
      type = data['type'] as String? ?? '',
      dialogue = data['dialogue'] as String? ?? '',
      prompt = data['prompt'] as String? ?? '',
      review = data['review'] as String? ?? 'pending',
      note = data['note'] as String? ?? '',
      order = (data['order'] as num?)?.toInt() ?? 1,
      duration = (data['duration'] as num?)?.toDouble() ?? 4,
      trimStart = (data['trimStart'] as num?)?.toDouble() ?? 0,
      selectedVersionId = data['selectedVersionId'] as String?,
      audioAssetId = data['audioAssetId'] as String?,
      characterIds = List<String>.from(data['characterIds'] as List? ?? []),
      referenceIds = List<String>.from(data['referenceIds'] as List? ?? []),
      versions = (data['versions'] as List? ?? [])
          .map((v) => ShotVersion.fromJson(Map<String, dynamic>.from(v)))
          .toList(),
      captionTrack = data['captionTrack'] == null
          ? null
          : Map<String, dynamic>.from(data['captionTrack']),
      visualReview = data['visualReview'] == null
          ? null
          : Map<String, dynamic>.from(data['visualReview']);
  ShotVersion? get selected {
    for (final v in versions) {
      if (v.id == selectedVersionId) return v;
    }
    return null;
  }
}

class Project {
  final Json data;
  final String id, name, description, script, format, style;
  final int revision;
  final List<Shot> shots;
  final List<MediaAsset> assets;
  final List<Json> characters, exports, messages;
  final bool burnSubtitles;
  final String? musicAssetId;
  final double musicVolume;
  Project.fromJson(Json data)
    : data = data,
      id = data['id'] as String,
      name = data['name'] as String? ?? '',
      description = data['description'] as String? ?? '',
      script = data['script'] as String? ?? '',
      format = data['format'] as String? ?? '9:16',
      style = data['style'] as String? ?? '',
      revision = (data['revision'] as num?)?.toInt() ?? 1,
      shots = (data['shots'] as List? ?? [])
          .map((s) => Shot.fromJson(Map<String, dynamic>.from(s)))
          .toList(),
      assets = (data['assets'] as List? ?? [])
          .map((a) => MediaAsset.fromJson(Map<String, dynamic>.from(a)))
          .toList(),
      characters = _maps(data['characters']),
      exports = _maps(data['exports']),
      messages = _maps(data['messages']),
      burnSubtitles = data['burnSubtitles'] != false,
      musicAssetId = data['musicAssetId'] as String?,
      musicVolume = (data['musicVolume'] as num?)?.toDouble() ?? .15;
  MediaAsset? asset(String? id) {
    for (final a in assets) {
      if (a.id == id) return a;
    }
    return null;
  }

  double get duration => shots.fold(0, (sum, shot) => sum + shot.duration);
}

List<Json> _maps(dynamic value) =>
    (value as List? ?? []).map((v) => Map<String, dynamic>.from(v)).toList();

class ProductionJob {
  final String id, projectId, state, type, message, provider;
  final String? shotId, error, remoteId;
  final double progress;
  ProductionJob.fromJson(Json data)
    : id = data['id'] as String,
      projectId = data['projectId'] as String,
      shotId = data['shotId'] as String?,
      state = data['state'] as String? ?? 'queued',
      type = data['type'] as String? ?? 'generate',
      message = data['message'] as String? ?? '',
      provider = data['provider'] as String? ?? '',
      error = data['error'] as String?,
      remoteId = data['remoteId'] as String?,
      progress = (data['progress'] as num?)?.toDouble() ?? 0;
  bool get active => state == 'queued' || state == 'running';
}

String timecode(double seconds) =>
    '${(seconds ~/ 60).toString().padLeft(2, '0')}:${(seconds.toInt() % 60).toString().padLeft(2, '0')}';
