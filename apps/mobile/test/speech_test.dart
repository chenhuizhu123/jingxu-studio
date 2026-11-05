import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:jingxu_mobile/data/api.dart';
import 'package:jingxu_mobile/data/models.dart';
import 'package:jingxu_mobile/data/domain.dart';
import 'package:jingxu_mobile/data/speech.dart';
import 'support.dart';

class SpeechRecords extends MemoryRecords {
  bool failAfterWrite = false, closed = false;
  int writesAfterClose = 0;
  @override
  Future<void> put(String kind, Json value) async {
    if (closed) {
      writesAfterClose++;
      throw StateError('databaseClosed');
    }
    await super.put(kind, value);
    if (failAfterWrite &&
        kind == 'project' &&
        (value['assets'] as List).any(
          (a) => a['name'].toString().startsWith('AI Voiceover'),
        )) {
      failAfterWrite = false;
      throw FileSystemException('simulated lost acknowledgement');
    }
  }

  @override
  Future<void> close() async {
    closed = true;
  }
}

class DirectIoOverrides extends HttpOverrides {}

class IdleGateRecords extends SpeechRecords {
  final entered = Completer<void>(), release = Completer<void>();
  int jobReads = 0;
  @override
  Future<List<Json>> all(String kind) async {
    final result = await super.all(kind);
    if (kind == 'job' && ++jobReads == 2 && result.isEmpty) {
      entered.complete();
      await release.future;
    }
    return result;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory dir;
  late StudioApi api;
  late SpeechRecords records;
  late MemoryCredentials credentials;
  HttpServer? server;
  final wav = File('test/fixtures/voice.wav').readAsBytesSync();
  Future<void> setup({
    http.Client? client,
    Future<void> Function(String, String)? probe,
    SpeechRecords? recordStore,
  }) async {
    dir = await Directory.systemTemp.createTemp('jingxu-speech-');
    records = recordStore ?? SpeechRecords();
    credentials = MemoryCredentials();
    api = StudioApi(
      directory: dir,
      records: records,
      credentials: credentials,
      renderer: FakeRenderer(),
      client: client ?? MockClient((_) async => http.Response.bytes(wav, 200)),
      packageMediaCheck:
          probe ??
          (file, kind) async {
            expect(kind, 'audio');
            expect(file.endsWith('.wav'), true);
            expect(await File(file).readAsBytes(), wav);
          },
    );
    await api.restore();
  }

  Future<Json> project() async {
    final p = await api.request(
      '/projects',
      method: 'POST',
      body: {'name': 'Voice project', 'script': 'Mia: Hello，创作者。'},
    );
    await api.mutate(p['id'], (p) {
      p['shots'][0]['dialogue'] = 'Hello，创作者。';
      p['shots'][0]['duration'] = 3;
    });
    return api.rawProject(p['id']);
  }

  Future<void> configure([String url = 'https://voice.example/v1']) async {
    final settings = await api.settings();
    settings['speech'] = {
      'endpoint': url,
      'model': 'bilingual-model',
      'voice': 'narrator',
      'speed': 1.15,
      'apiKey': 'voice-secret',
    };
    await api.request('/settings', method: 'PUT', body: settings);
  }

  Future<Json> terminal(String id) async {
    for (var n = 0; n < 200; n++) {
      final job = (await records.all('job')).firstWhere((j) => j['id'] == id);
      if (['succeeded', 'failed', 'cancelled'].contains(job['state'])) {
        return job;
      }
      await Future<void>.delayed(const Duration(milliseconds: 10));
    }
    fail('Speech task did not finish');
  }

  tearDown(() async {
    await api.close();
    await server?.close(force: true);
    server = null;
    await dir.delete(recursive: true);
  });
  test(
    'voice request snapshots bilingual dialogue and settings, keeps old audio and secrets out of records',
    () async {
      final requests = <http.Request>[];
      await setup(
        client: MockClient((r) async {
          requests.add(r);
          return http.Response.bytes(wav, 200);
        }),
      );
      final p = await project();
      await configure();
      await api.mutate(
        p['id'],
        (p) => p['shots'][0]['audioAssetId'] = 'existing',
      );
      final job = await api.enqueue(
        p['id'],
        'speech',
        shotId: p['shots'][0]['id'],
        expectedText: 'Hello，创作者。',
      );
      final settings = await api.settings();
      settings['speech']['apiKey'] = 'replacement-secret';
      settings['speech']['voice'] = 'other';
      await api.request('/settings', method: 'PUT', body: settings);
      await api.mutate(
        p['id'],
        (p) => p['shots'][0]['dialogue'] = 'Changed after enqueue',
      );
      final result = await terminal(job['id']);
      expect(result['state'], 'succeeded');
      expect(requests.single.url.path, '/v1/audio/speech');
      expect(requests.single.headers['Authorization'], 'Bearer voice-secret');
      expect(requests.single.followRedirects, false);
      expect(jsonDecode(requests.single.body), {
        'model': 'bilingual-model',
        'voice': 'narrator',
        'speed': 1.15,
        'input': 'Hello，创作者。',
        'response_format': 'wav',
      });
      final saved = await api.rawProject(p['id']);
      final asset = (saved['assets'] as List).single;
      expect(asset['id'], result['resultId']);
      expect(await File(api.path(asset['file'])).readAsBytes(), wav);
      expect(saved['shots'][0]['audioAssetId'], 'existing');
      expect(jsonEncode(records.values), isNot(contains('voice-secret')));
      expect(
        jsonEncode(await api.settings()),
        isNot(contains('replacement-secret')),
      );
      expect(await credentials.read('job-${job['id']}'), null);
    },
  );
  test(
    'enqueue during an empty queue read is picked up instead of getting stuck',
    () async {
      final gate = IdleGateRecords();
      try {
        await setup(recordStore: gate);
        await gate.entered.future.timeout(const Duration(seconds: 3));
        final p = await project();
        await configure();
        final job = await api.enqueue(
          p['id'],
          'speech',
          shotId: p['shots'][0]['id'],
        );
        gate.release.complete();
        expect((await terminal(job['id']))['state'], 'succeeded');
      } finally {
        if (!gate.release.isCompleted) gate.release.complete();
      }
    },
  );
  test(
    'generated voice survives project ZIP export and restore with its selected audio reference',
    () async {
      await setup();
      final p = await project();
      await configure();
      final job = await api.enqueue(
        p['id'],
        'speech',
        shotId: p['shots'][0]['id'],
      );
      final completed = await terminal(job['id']);
      expect(completed['state'], 'succeeded');
      await api.mutate(
        p['id'],
        (p) => p['shots'][0]['audioAssetId'] = completed['resultId'],
      );
      final saved = await api.archive(p['id']);
      final archive = File(api.path((saved['exports'] as List).last['file']));
      final imported = await api.importPackageStream(
        archive.openRead(),
        length: await archive.length(),
      );
      expect(imported.id, isNot(p['id']));
      expect(imported.shots.first.audioAssetId, imported.assets.single.id);
      expect(imported.assets.single.id, isNot(completed['resultId']));
      expect(await File(imported.assets.single.url).readAsBytes(), wav);
      expect(jsonEncode(imported.data), isNot(contains('voice-secret')));
    },
  );
  test(
    'old settings preserve defaults and saving blank keys retains existing speech key',
    () async {
      await setup();
      expect((await api.settings())['speech']['hasApiKey'], false);
      await configure();
      final data = await api.settings();
      data.remove('speech');
      await api.request('/settings', method: 'PUT', body: data);
      expect(
        (await api.settings(secrets: true))['speech']['apiKey'],
        'voice-secret',
      );
      expect(
        () => validateSpeech({
          ...defaultSpeech,
          'speed': double.nan,
        }, requireKey: false),
        throwsArgumentError,
      );
    },
  );
  test(
    'requires configuration and rejects stale or empty dialogue before a paid request',
    () async {
      await setup();
      final p = await project(), sid = p['shots'][0]['id'];
      await expectLater(
        api.enqueue(p['id'], 'speech', shotId: sid),
        throwsStateError,
      );
      await configure();
      await expectLater(
        api.enqueue(p['id'], 'speech', shotId: sid, expectedText: 'wrong'),
        throwsStateError,
      );
      await api.mutate(p['id'], (p) => p['shots'][0]['dialogue'] = ' ');
      await expectLater(
        api.enqueue(p['id'], 'speech', shotId: sid),
        throwsArgumentError,
      );
      expect(await records.all('job'), isEmpty);
    },
  );
  for (final mode in [
    'http',
    'redirect',
    'json',
    'header-size',
    'stream-size',
    'probe',
  ]) {
    test(
      'rejects $mode response without publishing media or leaking provider output',
      () async {
        final client = MockClient.streaming((r, _) async {
          if (mode == 'http') {
            return http.StreamedResponse(
              Stream.value(utf8.encode('voice-secret')),
              429,
            );
          }
          if (mode == 'redirect') {
            return http.StreamedResponse(
              const Stream.empty(),
              302,
              headers: {'location': 'https://other.example'},
            );
          }
          if (mode == 'json') {
            return http.StreamedResponse(
              Stream.value(utf8.encode('{"error":"voice-secret"}')),
              200,
            );
          }
          if (mode == 'header-size') {
            return http.StreamedResponse(
              const Stream.empty(),
              200,
              contentLength: speechByteLimit + 1,
            );
          }
          if (mode == 'stream-size') {
            return http.StreamedResponse(
              Stream.fromIterable(
                List.generate(33, (_) => List.filled(1024 * 1024, 0)),
              ),
              200,
            );
          }
          return http.StreamedResponse(Stream.value(wav), 200);
        });
        await setup(
          client: client,
          probe: mode == 'probe'
              ? (_, _) async {
                  throw StateError('invalidNativeMedia');
                }
              : null,
        );
        final p = await project();
        await configure();
        final job = await api.enqueue(
          p['id'],
          'speech',
          shotId: p['shots'][0]['id'],
        );
        final result = await terminal(job['id']);
        expect(result['state'], 'failed');
        expect(result['error'].toString(), isNot(contains('voice-secret')));
        expect((await api.project(p['id'])).assets, isEmpty);
        expect(await Directory(api.path('media')).list().toList(), isEmpty);
      },
    );
  }
  test(
    'cancel interrupts a stalled native probe and never publishes a candidate',
    () async {
      final probing = Completer<void>();
      await setup(
        probe: (_, _) {
          probing.complete();
          return Completer<void>().future;
        },
      );
      final p = await project();
      await configure();
      final job = await api.enqueue(
        p['id'],
        'speech',
        shotId: p['shots'][0]['id'],
      );
      await probing.future.timeout(const Duration(seconds: 3));
      await api.request('/jobs/${job['id']}/cancel', method: 'POST');
      await api.close();
      expect((await records.all('job')).single['state'], 'cancelled');
      expect((await records.all('project')).single['assets'], isEmpty);
      expect(await Directory('${dir.path}/media').list().toList(), isEmpty);
      expect(records.writesAfterClose, 0);
    },
  );
  for (final headers in [false, true]) {
    test(
      'real HTTP cancellation stops ${headers ? 'stream' : 'header wait'} promptly and leaves no files',
      () async {
        await setup(
          client: HttpOverrides.runWithHttpOverrides(
            () => http.Client(),
            DirectIoOverrides(),
          ),
        );
        server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
        final arrived = Completer<void>();
        server!.listen((req) async {
          await req.drain<void>();
          if (headers) {
            req.response.add(wav.sublist(0, 64));
            await req.response.flush();
          }
          arrived.complete();
        });
        final p = await project();
        await configure('http://127.0.0.1:${server!.port}/v1');
        final job = await api.enqueue(
          p['id'],
          'speech',
          shotId: p['shots'][0]['id'],
        );
        await arrived.future.timeout(const Duration(seconds: 3));
        await api.request('/jobs/${job['id']}/cancel', method: 'POST');
        await api.close().timeout(const Duration(seconds: 3));
        expect((await records.all('job')).single['state'], 'cancelled');
        expect(await Directory('${dir.path}/media').list().toList(), isEmpty);
        expect(records.writesAfterClose, 0);
      },
    );
  }
  test(
    'duplicate speech is blocked while generation remains independent',
    () async {
      final wait = Completer<http.Response>();
      await setup(client: MockClient((_) => wait.future));
      final p = await project();
      await configure();
      final sid = p['shots'][0]['id'];
      await api.enqueue(p['id'], 'speech', shotId: sid);
      await expectLater(
        api.enqueue(p['id'], 'speech', shotId: sid),
        throwsStateError,
      );
      expect(
        (await api.enqueue(p['id'], 'generate', shotId: sid))['type'],
        'generate',
      );
      wait.complete(http.Response.bytes(wav, 200));
    },
  );
  test('acknowledgement failure preserves already referenced audio', () async {
    await setup();
    final p = await project();
    await configure();
    records.failAfterWrite = true;
    final job = await api.enqueue(
      p['id'],
      'speech',
      shotId: p['shots'][0]['id'],
    );
    expect((await terminal(job['id']))['state'], 'failed');
    final asset = (await api.rawProject(p['id']))['assets'][0];
    expect(await File(api.path(asset['file'])).readAsBytes(), wav);
  });
  test(
    'restart marks submitting speech unknown and cleans only owned unreferenced files',
    () async {
      await setup();
      final p = await project();
      final names = [
        'speech-00000000-0000-4000-8000-000000000001.partial.wav',
        'speech-00000000-0000-4000-8000-000000000002.wav',
        'speech-00000000-0000-4000-8000-000000000003.wav',
        'user.wav',
      ];
      for (final n in names) {
        await File(api.path('media/$n')).writeAsBytes(wav);
      }
      await api.mutate(
        p['id'],
        (p) => (p['assets'] as List).add({
          'id': 'kept',
          'name': 'kept',
          'file': 'media/${names[2]}',
          'kind': 'audio',
          'size': wav.length,
          'createdAt': timestamp(),
        }),
      );
      await api.close();
      records.closed = false;
      await records.put('job', {
        'id': 'lost',
        'projectId': p['id'],
        'shotId': p['shots'][0]['id'],
        'type': 'speech',
        'state': 'running',
        'phase': 'submitting',
      });
      await credentials.write('job-lost', '{"apiKey":"secret"}');
      api = StudioApi(
        directory: dir,
        records: records,
        credentials: credentials,
        renderer: FakeRenderer(),
      );
      await api.restore();
      expect((await api.jobs()).single.error, 'speechUnknownSubmission');
      expect(await credentials.read('job-lost'), null);
      expect(
        (await Directory(
          api.path('media'),
        ).list().map((e) => e.uri.pathSegments.last).toList())..sort(),
        names.sublist(2)..sort(),
      );
    },
  );
}
