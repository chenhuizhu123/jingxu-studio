import 'dart:io';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:http/http.dart' as http;
import 'package:jingxu_mobile/data/api.dart';
import 'package:jingxu_mobile/data/providers.dart';
import 'package:jingxu_mobile/data/studio.dart';
import 'package:jingxu_mobile/data/mcp.dart';
import 'package:jingxu_mobile/data/models.dart';
import 'support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory dir;
  late MemoryRecords records;
  late MemoryCredentials credentials;
  late StudioApi api;
  setUp(() async {
    dir = await Directory.systemTemp.createTemp('jingxu-test-');
    records = MemoryRecords();
    credentials = MemoryCredentials();
    api = StudioApi(
      directory: dir,
      records: records,
      credentials: credentials,
      renderer: FakeRenderer(),
    );
    await api.restore();
  });
  tearDown(() async {
    await api.close();
    await dir.delete(recursive: true);
  });
  test(
    'offline projects survive engine recreation without a server or account',
    () async {
      final p = await api.request(
        '/projects',
        method: 'POST',
        body: {'name': 'Offline film', 'script': 'A door opens.'},
      );
      await api.close();
      api = StudioApi(
        directory: dir,
        records: records,
        credentials: credentials,
        renderer: FakeRenderer(),
      );
      await api.restore();
      expect((await api.projects()).single.id, p['id']);
      expect((await api.projects()).single.shots.length, 1);
    },
  );
  test('sandbox rejects absolute and relative traversal', () {
    expect(() => api.path('../outside'), throwsArgumentError);
    expect(() => api.path('/etc/passwd'), throwsArgumentError);
  });
  test(
    'keys remain in secure credentials and never appear in project data',
    () async {
      await api.request(
        '/settings',
        method: 'PUT',
        body: {
          'generation': {
            'provider': 'gateway',
            'endpoint': 'https://api.example.com',
            'model': 'video',
            'apiKey': 'top-secret',
          },
          'agent': {'endpoint': '', 'model': '', 'apiKey': ''},
          'mcp': [],
        },
      );
      final public = await api.settings();
      expect(jsonEncode(public), isNot(contains('top-secret')));
      expect(public['generation']['hasApiKey'], true);
      expect(jsonEncode(records.values), isNot(contains('top-secret')));
    },
  );
  test('revision guards prevent overwriting newer project changes', () async {
    final p = await api.request(
      '/projects',
      method: 'POST',
      body: {'name': 'A', 'script': 'One'},
    );
    await api.request(
      '/projects/${p['id']}',
      method: 'PATCH',
      body: {'name': 'New', 'revision': 1},
    );
    await expectLater(
      api.request(
        '/projects/${p['id']}',
        method: 'PATCH',
        body: {'name': 'Stale', 'revision': 1},
      ),
      throwsStateError,
    );
    expect((await api.project(p['id'])).name, 'New');
  });
  test(
    'unknown paid submission is failed on restart instead of being resubmitted',
    () async {
      await records.put('job', {
        'id': 'interrupted',
        'type': 'generate',
        'projectId': 'p',
        'state': 'running',
        'phase': 'submitting',
        'provider': 'ark',
      });
      await api.close();
      api = StudioApi(
        directory: dir,
        records: records,
        credentials: credentials,
        renderer: FakeRenderer(),
      );
      await api.restore();
      expect((await api.jobs()).single.state, 'failed');
      expect((await api.jobs()).single.error, 'unknownSubmission');
    },
  );
  test(
    'direct provider contract validates task id and sends key only to provider',
    () async {
      final calls = <http.Request>[];
      final client = MockClient((request) async {
        calls.add(request);
        return http.Response('{"id":"task-1"}', 200);
      });
      final provider = DirectProviders(client);
      expect(
        await provider.submit(
          {
            'provider': 'ark',
            'endpoint': 'https://provider.test/v3',
            'model': 'video',
            'apiKey': 'secret',
          },
          {'prompt': 'Rain', 'duration': 4, 'format': '9:16', 'references': []},
        ),
        'task-1',
      );
      expect(calls.single.url.path, '/v3/contents/generations/tasks');
      expect(calls.single.headers['Authorization'], 'Bearer secret');
      expect(jsonDecode(calls.single.body)['content'][0]['text'], 'Rain');
      client.close();
    },
  );
  test('generation persists a selected demo candidate locally', () async {
    final p = await api.request(
      '/projects',
      method: 'POST',
      body: {'name': 'A', 'script': 'Rain'},
    );
    await api.enqueue(p['id'], 'generate', shotId: p['shots'][0]['id']);
    for (var i = 0; i < 100; i++) {
      if ((await api.jobs()).every((j) => !j.active)) break;
      await Future<void>.delayed(const Duration(milliseconds: 10));
    }
    expect((await api.jobs()).single.state, 'succeeded');
    final project = await api.project(p['id']);
    expect(project.shots.single.selected!.source, 'demo');
    expect(await File(project.assets.single.url).exists(), true);
  });
  test('rapid edits wait for the latest view state before export', () async {
    final studio = Studio(api);
    await studio.initialize();
    final p = await api.request(
      '/projects',
      method: 'POST',
      body: {'name': 'Rapid edits', 'script': 'A\nB\nC'},
    );
    await studio.refresh();
    for (final shot in studio.projects.single.shots) {
      await studio.action(
        '/projects/${p['id']}/shots/${shot.id}',
        method: 'PATCH',
        body: {'duration': 2.0},
      );
    }
    expect(studio.projects.single.duration, 6);
    studio.dispose();
  });
  test(
    'assistant reads and edits through tools; MCP execution waits for approval',
    () async {
      final remote = FakeRemoteTools();
      String shotId = '', projectId = '';
      int turn = 0;
      final client = MockClient((request) async {
        final functions = [
          {'name': 'project_read', 'arguments': '{}'},
          {
            'name': 'shot_update',
            'arguments': jsonEncode({
              'shotId': shotId,
              'patch': {'prompt': 'Keep the grey coat. Slow push in.'},
            }),
          },
          {
            'name': 'mcp_request',
            'arguments': jsonEncode({
              'serverId': 'browser',
              'tool': 'publish',
              'arguments': {'title': 'Preview'},
            }),
          },
        ];
        final message = turn < 3
            ? {
                'role': 'assistant',
                'content': null,
                'tool_calls': [
                  {
                    'id': 'call-${turn + 1}',
                    'type': 'function',
                    'function': functions[turn++],
                  },
                ],
              }
            : {
                'role': 'assistant',
                'content':
                    'Prompt saved. Publishing is waiting for your approval.',
              };
        return http.Response(
          jsonEncode({
            'choices': [
              {'message': message},
            ],
          }),
          200,
        );
      });
      await api.close();
      api = StudioApi(
        directory: dir,
        records: records,
        credentials: credentials,
        renderer: FakeRenderer(),
        client: client,
        remoteTools: remote,
      );
      await api.restore();
      final settings = await api.settings();
      await api.request(
        '/settings',
        method: 'PUT',
        body: {
          ...settings,
          'agent': {
            'endpoint': 'https://model.test/v1',
            'model': 'test',
            'apiKey': 'assistant-secret',
          },
          'mcp': [
            {
              'id': 'browser',
              'name': 'Browser',
              'url': 'https://tools.test/mcp',
              'enabled': true,
              'token': 'tool-secret',
            },
          ],
        },
      );
      final p = await api.request(
        '/projects',
        method: 'POST',
        body: {'name': 'Agent', 'script': 'A'},
      );
      projectId = p['id'];
      shotId = p['shots'][0]['id'];
      await api.request(
        '/projects/$projectId/chat',
        method: 'POST',
        body: {
          'text': 'Refine the prompt and request publication.',
          'skill': 'shot-repair',
        },
      );
      expect(
        (await api.project(projectId)).shots.single.prompt,
        'Keep the grey coat. Slow push in.',
      );
      expect(remote.calls, 0);
      final approval = (await records.all('approval')).single;
      expect(approval['state'], 'pending');
      expect(jsonEncode(await api.settings()), isNot(contains('tool-secret')));
      await api.decide(approval['id'], true);
      expect(remote.calls, 1);
      await expectLater(api.decide(approval['id'], true), throwsStateError);
      expect(remote.calls, 1);
    },
  );
}

class FakeRemoteTools implements RemoteTools {
  int calls = 0;
  @override
  Future<List<Json>> list(Json server) async => [
    {'name': 'publish'},
  ];
  @override
  Future<Json> call(Json server, String tool, Json arguments) async {
    calls++;
    return {
      'content': [
        {'type': 'text', 'text': 'saved'},
      ],
    };
  }
}
