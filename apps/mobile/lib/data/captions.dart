import 'models.dart';

Json? currentCaptionSource(Shot shot) {
  final asset = shot.audioAssetId ?? shot.selected?.assetId;
  return asset == null
      ? null
      : {
          'assetId': asset,
          'start': shot.audioAssetId != null ? 0 : shot.trimStart,
          'duration': shot.duration,
        };
}

bool captionsCurrent(Shot shot) {
  final source = currentCaptionSource(shot), track = shot.captionTrack;
  return track != null &&
      source != null &&
      [
        'assetId',
        'start',
        'duration',
      ].every((k) => source[k] == track['source'][k]);
}

void validateCaptionTrack(Json track) {
  void invalid() => throw ArgumentError('invalidCaptions');
  final source = track['source'], cues = track['cues'];
  if (source is! Map ||
      source['assetId'] is! String ||
      !RegExp(r'^[A-Za-z0-9_-]{1,100}$').hasMatch(source['assetId']) ||
      !['asr', 'manual'].contains(track['origin']) ||
      track['createdAt'] is! String ||
      DateTime.tryParse(track['createdAt']) == null ||
      cues is! List ||
      cues.length > 300) {
    invalid();
  }
  final start = source['start'], duration = source['duration'];
  if (start is! num ||
      !start.isFinite ||
      start < 0 ||
      start > 86400 ||
      duration is! num ||
      !duration.isFinite ||
      duration < 2 ||
      duration > 30) {
    invalid();
  }
  double end = 0;
  for (final cue in cues) {
    if (cue is! Map ||
        cue['start'] is! num ||
        cue['end'] is! num ||
        cue['text'] is! String) {
      invalid();
    }
    final a = cue['start'] as num,
        b = cue['end'] as num,
        text = cue['text'] as String;
    if (!a.isFinite ||
        !b.isFinite ||
        a < end ||
        b <= a ||
        b > (duration as num) + .001 ||
        text.trim().isEmpty ||
        text.length > 1000) {
      invalid();
    }
    end = b.toDouble();
  }
}

List<Json> captionCues(Shot shot) {
  if (shot.captionTrack != null) {
    if (!captionsCurrent(shot)) throw StateError('captionStale');
    validateCaptionTrack(shot.captionTrack!);
    return (shot.captionTrack!['cues'] as List).cast<Json>();
  }
  return shot.dialogue.trim().isEmpty
      ? []
      : [
          {'start': 0, 'end': shot.duration, 'text': shot.dialogue},
        ];
}

String plainSubtitle(String value) => value
    .replaceAll('\r', '')
    .replaceAll(RegExp(r'\n{2,}'), '\n')
    .replaceAll('-->', '→')
    .trim();
