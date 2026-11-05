import 'dart:io';
import 'dart:convert';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingxu_mobile/data/api.dart';
import 'package:jingxu_mobile/data/captions.dart';
import 'package:jingxu_mobile/data/domain.dart';
import 'package:jingxu_mobile/data/models.dart';
import 'package:jingxu_mobile/data/package_contract.dart';
import 'support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  Json fixture() {
    final p = newProject({
      'name': 'Captions',
      'script': 'Mia: first\nMia: second',
    });
    for (final s in p['shots']) {
      s['duration'] = 3;
      s['audioAssetId'] = 'a';
    }
    p['assets'] = [
      {'id': 'a', 'file': 'media/a.wav', 'kind': 'audio', 'name': 'voice.wav'},
    ];
    return p;
  }

  Json track({String origin = 'asr'}) => {
    'source': {'assetId': 'a', 'start': 0, 'duration': 3},
    'origin': origin,
    'createdAt': timestamp(),
    'cues': [
      {'start': .25, 'end': .8, 'text': 'Hello'},
      {'start': 1.4, 'end': 2, 'text': '雨停了'},
    ],
  };
  test(
    'timestamp cues are offset by shot order and empty tracks suppress fallback dialogue',
    () {
      final p = fixture();
      p['shots'][0]['captionTrack'] = track();
      var result = subtitles(Project.fromJson(p));
      expect(result, contains('00:00:00,250 --> 00:00:00,800'));
      expect(result, contains('00:00:03,000 --> 00:00:06,000'));
      reorder(p, [p['shots'][1]['id'], p['shots'][0]['id']]);
      result = subtitles(Project.fromJson(p));
      expect(result, contains('00:00:03,250 --> 00:00:03,800'));
      p['shots'][1]['captionTrack']['cues'] = [];
      expect(subtitles(Project.fromJson(p)), isNot(contains('Hello')));
    },
  );
  test(
    'changing a voice or duration makes the old track stale without deleting user edits',
    () {
      final p = fixture(), s = p['shots'][0];
      patchShot(p, s['id'], {'captionTrack': track()});
      patchShot(p, s['id'], {'duration': 4.0});
      expect(captionsCurrent(Shot.fromJson(s)), false);
      expect(() => subtitles(Project.fromJson(p)), throwsStateError);
      expect(s['captionTrack']['cues'][0]['text'], 'Hello');
      patchShot(p, s['id'], {'captionTrack': null});
      expect(subtitles(Project.fromJson(p)), contains('first'));
    },
  );
  test(
    'invalid order, nonfinite times, empty text and out-of-range cues are rejected',
    () {
      for (final change in [
        {'start': double.nan},
        {'end': 4},
        {'end': .1},
        {'text': ' '},
      ]) {
        final t = track();
        t['cues'][0].addAll(change);
        expect(() => validateCaptionTrack(t), throwsArgumentError);
      }
      final t = track();
      t['cues'][1]['start'] = .5;
      expect(() => validateCaptionTrack(t), throwsArgumentError);
    },
  );
  test(
    'v2 schema/remapping preserves source references and rejects ASR tracks on an image',
    () async {
      final contract = PackageContract(
        await rootBundle.loadString('assets/project-package.schema.json'),
      );
      final p = fixture();
      p['shots'][0]['captionTrack'] = track();
      final validated = contract.project(p),
          restored = remapPackageProject(validated);
      expect(
        restored['shots'][0]['captionTrack']['source']['assetId'],
        restored['assets'][0]['id'],
      );
      expect(
        subtitles(Project.fromJson(restored)),
        subtitles(Project.fromJson(p)),
      );
      expect(
        contract.manifest({
          'format': 'jingxu-project',
          'version': 2,
          'exportedAt': timestamp(),
          'project': p,
        })['version'],
        2,
      );
      p['assets'][0]['kind'] = 'image';
      p['assets'][0]['file'] = 'media/a.png';
      expect(() => contract.project(p), throwsStateError);
      p['shots'][0]['captionTrack']['origin'] = 'manual';
      for (final s in p['shots']) {
        s.remove('audioAssetId');
      }
      expect(
        contract.project(p)['shots'][0]['captionTrack']['origin'],
        'manual',
      );
    },
  );
  test(
    'real ZIP with timed captions uses v2 and keeps cue text and SRT after restoration',
    () async {
      final dir = await Directory.systemTemp.createTemp('jingxu-captions-');
      final api = StudioApi(
        directory: dir,
        records: MemoryRecords(),
        credentials: MemoryCredentials(),
        renderer: FakeRenderer(),
      );
      try {
        await api.restore();
        await api.seedDemo();
        final p = (await api.projects()).first, s = p.shots.first;
        final source = currentCaptionSource(s)!;
        final t = {
          'source': source,
          'origin': 'manual',
          'createdAt': timestamp(),
          'cues': [
            {'start': .25, 'end': 1.2, 'text': '保留字幕 / Keep captions'},
          ],
        };
        await api.request(
          '/projects/${p.id}/shots/${s.id}',
          method: 'PATCH',
          body: {'captionTrack': t},
        );
        final saved = await api.archive(p.id),
            archive = File(api.path(saved['exports'].last['file']));
        final restored = await api.importPackageStream(
          archive.openRead(),
          length: await archive.length(),
        );
        expect(
          restored.shots.first.captionTrack!['cues'][0]['text'],
          '保留字幕 / Keep captions',
        );
        expect(captionsCurrent(restored.shots.first), true);
        expect(subtitles(restored), contains('00:00:00,250 --> 00:00:01,200'));
        expect(jsonEncode(restored.data), isNot(contains('apiKey')));
      } finally {
        await api.close();
        await dir.delete(recursive: true);
      }
    },
  );
}
