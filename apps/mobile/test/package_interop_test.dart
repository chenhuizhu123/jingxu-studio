import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingxu_mobile/data/api.dart';
import 'package:jingxu_mobile/data/domain.dart';
import 'package:jingxu_mobile/data/models.dart';
import 'package:jingxu_mobile/data/package_media.dart';
import 'support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final directory = Platform.environment['JINGXU_INTEROP_DIR'];
  final phase = Platform.environment['JINGXU_INTEROP_PHASE'];
  test(
    'actual desktop/Flutter ZIP interoperability ($phase)',
    () async {
      final root = await Directory.systemTemp.createTemp(
        'jingxu-interop-mobile-',
      );
      final api = StudioApi(
        directory: root,
        records: MemoryRecords(),
        credentials: MemoryCredentials(),
        renderer: FakeRenderer(),
        packageMediaCheck: (file, kind) async {
          if (kind == 'image') {
            await validatePackageMedia(file, kind);
            return;
          }
          if (kind == 'document') return;
          // A host Flutter test has no AVFoundation/Media3 method-channel plugin.
          // Decode the real fixture with host FFmpeg; native probes need device QA.
          final result = await Process.run(
            Platform.environment['JINGXU_INTEROP_FFMPEG']!,
            [
              '-hide_banner',
              '-loglevel',
              'error',
              '-i',
              file,
              '-f',
              'null',
              '-',
            ],
          );
          expect(result.exitCode, 0, reason: '${result.stderr}');
        },
      );
      final base = directory!;
      Future<Project> restore(String name) {
        final file = File('$base/$name');
        return api.importPackageStream(
          file.openRead(),
          length: file.lengthSync(),
        );
      }

      Future<void> export(String id, String name) async {
        await api.archive(id);
        final p = await api.rawProject(id);
        final entry = (p['exports'] as List).last;
        await File(api.path(entry['file'])).copy('$base/$name');
      }

      Future<void> evidence(Json p, String name) async {
        final videos = (p['exports'] as List).where(
          (e) => e['kind'] == 'video',
        );
        await File('$base/$name').writeAsString(
          jsonEncode({
            'project': p,
            'assets': [
              for (final a in p['assets'])
                base64Encode(await File(api.path(a['file'])).readAsBytes()),
            ],
            'exports': [
              for (final e in videos)
                {
                  'video': base64Encode(
                    await File(api.path(e['file'])).readAsBytes(),
                  ),
                  'subtitles': base64Encode(
                    await File(api.path(e['subtitlesFile'])).readAsBytes(),
                  ),
                },
            ],
          }),
        );
      }

      try {
        await api.restore();
        if (phase == 'first') {
          final imported = await restore('desktop-origin.zip');
          expect(imported.shots.first.selected!.number, 2);
          expect(imported.exports.single['subtitlesFile'], isNotNull);
          expect((await api.settings())['generation']['hasApiKey'], false);
          expect(await api.request('/approvals'), isEmpty);
          await export(imported.id, 'desktop-return.zip');
          await api.seedDemo();
          final mobile = (await api.projects()).firstWhere(
            (p) => p.id != imported.id,
          );
          final audioFile = 'media/${newId()}.wav',
              videoFile = 'media/${newId()}.mp4';
          await File('$base/fixtures/voice.wav').copy(api.path(audioFile));
          await File('$base/fixtures/clip.mp4').copy(api.path(videoFile));
          final subtitle = videoFile.replaceFirst('.mp4', '.srt');
          await File('$base/fixtures/clip.srt').copy(api.path(subtitle));
          await api.mutate(mobile.id, (p) {
            final audio = {
              'id': newId(),
              'name': 'Mobile voice.wav',
              'kind': 'audio',
              'file': audioFile,
              'size': File(api.path(audioFile)).lengthSync(),
            };
            (p['assets'] as List).add(audio);
            final shot = p['shots'][0];
            addCandidate(
              p,
              shot['id'],
              {
                'id': newId(),
                'name': 'Mobile second take.mp4',
                'kind': 'video',
                'file': videoFile,
                'size': File(api.path(videoFile)).lengthSync(),
              },
              'A mobile take / 手机候选',
              'imported',
            );
            shot['selectedVersionId'] = (shot['versions'] as List).last['id'];
            shot['referenceIds'] = [p['assets'][0]['id']];
            shot['audioAssetId'] = audio['id'];
            shot['duration'] = 2;
            shot['captionTrack'] = {
              'source': {'assetId': audio['id'], 'start': 0, 'duration': 2},
              'origin': 'manual',
              'createdAt': timestamp(),
              'cues': [
                {'start': .2, 'end': .8, 'text': 'Mobile captions / 手机字幕'},
                {'start': 1.2, 'end': 1.8, 'text': 'Keep timings / 保留时间'},
              ],
            };
            shot['trimStart'] = .25;
            shot['review'] = 'changes';
            shot['note'] = 'Keep the scene / 保留场景';
            shot['visualReview'] = {
              'versionId': shot['selectedVersionId'],
              'createdAt': timestamp(),
              'text': 'Compare the reference before approval.',
              'frameCount': 3,
              'referenceIds': [p['assets'][0]['id']],
            };
            p['musicAssetId'] = audio['id'];
            p['musicVolume'] = .18;
            p['burnSubtitles'] = true;
            p['exports'] = [
              {
                'id': newId(),
                'name': 'Mobile episode.mp4',
                'file': videoFile,
                'kind': 'video',
                'subtitlesFile': subtitle,
                'size': File(api.path(videoFile)).lengthSync(),
                'createdAt': timestamp(),
                'revision': p['revision'],
              },
            ];
            p['messages'] = [
              {
                'id': newId(),
                'role': 'user',
                'text': 'Keep every version / 保留全部版本',
                'createdAt': timestamp(),
                'skill': 'shot-repair',
              },
            ];
          });
          await evidence(
            await api.rawProject(mobile.id),
            'mobile-origin-evidence.json',
          );
          await export(mobile.id, 'mobile-origin.zip');
        } else {
          final imported = await restore('mobile-return.zip');
          expect(imported.shots.first.selected!.number, 2);
          await evidence(
            await api.rawProject(imported.id),
            'mobile-return-evidence.json',
          );
        }
      } finally {
        await api.close();
        await root.delete(recursive: true);
      }
    },
    skip: directory == null
        ? 'Run npm run test:interop from the repository root.'
        : false,
  );
}
