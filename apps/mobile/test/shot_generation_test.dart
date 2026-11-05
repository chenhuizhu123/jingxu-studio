import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:jingxu_mobile/data/api.dart';
import 'package:jingxu_mobile/data/models.dart';
import 'package:jingxu_mobile/data/package_media.dart';
import 'support.dart';

class GenerationRecords extends MemoryRecords {
  bool loseAcknowledgement = false;

  @override
  Future<void> put(String kind, Json value) async {
    await super.put(kind, value);
    if (loseAcknowledgement &&
        kind == 'project' &&
        (value['assets'] as List).any(
          (a) => (a['file'] as String).startsWith('media/seedream-'),
        )) {
      loseAcknowledgement = false;
      throw const FileSystemException('Simulated lost write acknowledgement');
    }
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final png = File('assets/demo-2.png').readAsBytesSync();
  final mp4 = File('test/fixtures/first-frame.mp4').readAsBytesSync();
  const base = 'https://provider.example/api/v3';
  late Directory root;
  late StudioApi api;
  late GenerationRecords records;
  late MemoryCredentials credentials;
  late String id, shotId;

  Future<void> start(http.Client client) async {
    api = StudioApi(
      directory: root,
      records: records,
      credentials: credentials,
      client: client,
      renderer: FakeRenderer(),
      packageMediaCheck: (file, kind) async {
        if (kind == 'video') {
          expect(await File(file).readAsBytes(), mp4);
        } else {
          await validatePackageMedia(file, kind);
        }
      },
    );
    await api.restore();
  }

  Future<void> prepare(http.Client client) async {
    await start(client);
    await api.seedDemo();
    final p = (await api.projects()).first;
    id = p.id;
    // Use a spoken shot so the same image can be bound to cast and scene.
    shotId = p.shots.firstWhere((s) => s.characterIds.isNotEmpty).id;
    await api.mutate(id, (data) {
      final shot = (data['shots'] as List).firstWhere((s) => s['id'] == shotId);
      shot['scene'] = 'Corner store at night';
      shot['duration'] = 2.5;
      shot['referenceIds'] = [data['characters'][0]['referenceId']];
      data['format'] = '9:16';
    });
    await api.request(
      '/settings',
      method: 'PUT',
      body: {
        'image': {
          'endpoint': base,
          'model': 'seedream-test',
          'apiKey': 'image-key',
        },
        'generation': {
          'provider': 'ark',
          'endpoint': base,
          'model': 'seedance-test',
          'apiKey': 'video-key',
        },
      },
    );
  }

  Json payload(Project p, String model, {String? assetId}) => {
    'revision': p.revision,
    'endpoint': base,
    'model': model,
    'assetId': ?assetId,
  };
  Future<Json> image(Project p) async =>
      await api.request(
            '/projects/$id/shots/$shotId/image',
            method: 'POST',
            body: payload(p, 'seedream-test'),
          )
          as Json;
  Future<Json> terminal(String jobId) async {
    for (var n = 0; n < 300; n++) {
      final job = (await records.all(
        'job',
      )).firstWhere((j) => j['id'] == jobId);
      if (['failed', 'succeeded', 'cancelled'].contains(job['state'])) {
        return job;
      }
      await Future<void>.delayed(const Duration(milliseconds: 15));
    }
    fail('Generation did not reach a terminal state');
  }

  http.Response imageResponse(List<int> bytes) => http.Response(
    jsonEncode({
      'data': [
        {'b64_json': base64Encode(bytes)},
      ],
    }),
    200,
  );

  setUp(() async {
    root = await Directory.systemTemp.createTemp('jingxu-mobile-image-');
    records = GenerationRecords();
    credentials = MemoryCredentials();
  });
  tearDown(() async {
    await api.close();
    await root.delete(recursive: true);
  });

  test(
    'reviews exact references, preserves selected takes, animates only the selected image, and archives both media',
    () async {
      final requests = <http.Request>[];
      await prepare(
        MockClient((request) async {
          requests.add(request);
          if (request.url.path.endsWith('/images/generations')) {
            return imageResponse(png);
          }
          if (request.url.path.endsWith('/contents/generations/tasks')) {
            return http.Response('{"id":"remote-test"}', 200);
          }
          if (request.url.path.endsWith('/remote-test')) {
            return http.Response(
              '{"status":"succeeded","content":{"video_url":"$base/video.mp4"}}',
              200,
            );
          }
          return http.Response.bytes(mp4, 200);
        }),
      );
      var p = await api.project(id);
      final original = p.shots.firstWhere((s) => s.id == shotId).selected!.id;
      final task = await image(p);
      expect((await terminal(task['id']))['state'], 'succeeded');
      expect(requests, hasLength(1));
      expect(requests.first.headers['authorization'], 'Bearer image-key');
      expect(requests.first.followRedirects, isFalse);
      final request = jsonDecode(requests.first.body);
      expect(request['prompt'], contains('Corner store at night'));
      expect(request['size'], '1440x2560');
      expect(request['response_format'], 'b64_json');
      final reference = await File(
        p.asset(p.characters.first['referenceId'])!.url,
      ).readAsBytes();
      expect(
        request['image'],
        'data:image/png;base64,${base64Encode(reference)}',
      );
      expect(await api.settings(), isNot(contains('apiKey')));
      expect(jsonEncode(await api.settings()), isNot(contains('image-key')));
      expect(
        jsonEncode(await records.all('job')),
        isNot(contains('image-key')),
      );
      p = await api.project(id);
      final shot = p.shots.firstWhere((s) => s.id == shotId);
      expect(shot.selected!.id, original);
      final still = shot.versions.last;
      expect(still.assetId, task['id']);
      expect(still.source, 'generated');
      expect(await File(p.asset(still.assetId)!.url).readAsBytes(), png);
      await expectLater(
        api.request(
          '/projects/$id/shots/$shotId/first-frame',
          method: 'POST',
          body: payload(p, 'seedance-test', assetId: still.assetId),
        ),
        throwsStateError,
      );
      await api.request(
        '/projects/$id/shots/$shotId',
        method: 'PATCH',
        body: {'selectedVersionId': still.id, 'revision': p.revision},
      );
      p = await api.project(id);
      final video =
          await api.request(
                '/projects/$id/shots/$shotId/first-frame',
                method: 'POST',
                body: payload(p, 'seedance-test', assetId: still.assetId),
              )
              as Json;
      final finished = await terminal(video['id']);
      expect(finished['state'], 'succeeded', reason: '${finished['error']}');
      expect(finished['remoteId'], 'remote-test');
      final submitted = requests.firstWhere(
        (r) => r.url.path.endsWith('/contents/generations/tasks'),
      );
      final body = jsonDecode(submitted.body);
      expect(body['ratio'], 'adaptive');
      expect(body['duration'], 4);
      expect(
        (body['content'] as List)
            .where((c) => c['type'] == 'image_url')
            .toList(),
        [
          {
            'type': 'image_url',
            'role': 'first_frame',
            'image_url': {'url': 'data:image/png;base64,${base64Encode(png)}'},
          },
        ],
      );
      p = await api.project(id);
      expect(p.shots.firstWhere((s) => s.id == shotId).selected!.id, still.id);
      expect(await File(p.asset(video['id'])!.url).readAsBytes(), mp4);
      await api.archive(id);
      final zip = File((await api.project(id)).exports.last['url']);
      final restored = await api.importPackageStream(
        zip.openRead(),
        length: await zip.length(),
      );
      expect(restored.assets.where((a) => a.kind == 'video'), hasLength(1));
      final restoredShot = restored.shots.firstWhere(
        (s) => s.order == shot.order,
      );
      expect(
        restoredShot.versions.where((v) => v.source == 'generated'),
        hasLength(2),
      );
      expect(
        await File(
          restored.asset(restoredShot.selected!.assetId)!.url,
        ).readAsBytes(),
        png,
      );
    },
  );

  test('a committed candidate survives a lost write acknowledgement', () async {
    await prepare(MockClient((_) async => imageResponse(png)));
    final p = await api.project(id);
    records.loseAcknowledgement = true;
    final task = await image(p);
    expect((await terminal(task['id']))['state'], 'succeeded');
    final current = await api.project(id);
    expect(current.assets.where((a) => a.id == task['id']), hasLength(1));
    expect(await File(current.asset(task['id'])!.url).readAsBytes(), png);
  });

  test(
    'changed revision, provider and legacy settings are handled without sending a request',
    () async {
      await prepare(
        MockClient((_) async => fail('Unexpected provider request')),
      );
      final stale = await api.project(id);
      await api.mutate(id, (p) => p['style'] = 'New style');
      await expectLater(image(stale), throwsStateError);
      final current = await api.project(id);
      await expectLater(
        api.request(
          '/projects/$id/shots/$shotId/image',
          method: 'POST',
          body: {
            ...payload(current, 'seedream-test'),
            'endpoint': '$base/changed',
          },
        ),
        throwsStateError,
      );
      final settings = await api.settings()
        ..remove('image');
      await api.request('/settings', method: 'PUT', body: settings);
      expect((await api.settings())['image']['hasApiKey'], isTrue);
    },
  );

  test(
    'invalid images are rejected and cancelling a submission neither saves media nor retries it',
    () async {
      final entered = Completer<void>(), pending = Completer<http.Response>();
      var calls = 0;
      await prepare(
        MockClient((_) async {
          if (++calls == 1) return imageResponse([1, 2, 3]);
          entered.complete();
          return pending.future;
        }),
      );
      final p = await api.project(id);
      final failed = await image(p);
      expect(
        await terminal(failed['id']),
        containsPair('error', 'imageInvalid'),
      );
      final second = await image(p);
      await entered.future;
      await expectLater(image(p), throwsStateError);
      await api.request('/jobs/${second['id']}/cancel', method: 'POST');
      pending.complete(imageResponse(png));
      expect((await terminal(second['id']))['state'], 'cancelled');
      await expectLater(
        api.request('/jobs/${second['id']}/retry', method: 'POST'),
        throwsStateError,
      );
      await api.close();
      expect((await api.project(id)).assets.length, p.assets.length);
      expect(
        await Directory(
          api.path('media'),
        ).list().where((f) => f.path.contains('seedream-')).toList(),
        isEmpty,
      );
    },
  );

  test(
    'restores a known first-frame job by polling and leaves an ambiguous image submission failed',
    () async {
      await prepare(
        MockClient((_) async => fail('Unexpected initial provider request')),
      );
      final p = await api.rawProject(id);
      final shot = Project.fromJson(p).shots.firstWhere((s) => s.id == shotId);
      await api.close();
      const imageId = '12345678-1234-1234-1234-123456789abc';
      const videoId = '22222222-1234-1234-1234-123456789abc';
      final baseJob = {
        'projectId': id,
        'shotId': shotId,
        'state': 'running',
        'snapshot': p,
      };
      await records.put('job', {
        ...baseJob,
        'id': imageId,
        'type': 'image',
        'phase': 'submitting',
      });
      await records.put('job', {
        ...baseJob,
        'id': videoId,
        'type': 'first-frame',
        'phase': 'polling',
        'remoteId': 'resume-this',
      });
      await credentials.write('job-$imageId', '{}');
      await credentials.write(
        'job-$videoId',
        jsonEncode({
          'endpoint': base,
          'apiKey': 'resume-video-key',
          'provider': 'ark',
        }),
      );
      final orphan = File('${root.path}/media/seedream-$imageId.partial');
      await orphan.writeAsString('temporary');
      final calls = <String>[];
      await start(
        MockClient((r) async {
          calls.add('${r.method} ${r.url.path}');
          if (r.url.path.endsWith('/resume-this')) {
            return http.Response(
              '{"status":"succeeded","video_url":"$base/video.mp4"}',
              200,
            );
          }
          return http.Response.bytes(mp4, 200);
        }),
      );
      expect(
        await terminal(imageId),
        containsPair('error', 'unknownSubmission'),
      );
      expect((await terminal(videoId))['state'], 'succeeded');
      expect(calls, [
        'GET /api/v3/contents/generations/tasks/resume-this',
        'GET /api/v3/video.mp4',
      ]);
      expect(await orphan.exists(), isFalse);
      expect(await credentials.read('job-$imageId'), isNull);
      final current = await api.project(id);
      expect(
        current.shots.firstWhere((s) => s.id == shotId).selected!.id,
        shot.selected!.id,
      );
    },
  );
}
