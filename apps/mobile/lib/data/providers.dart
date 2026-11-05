import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'models.dart';

Uri endpoint(String value) {
  final uri = Uri.tryParse(value.trim().replaceFirst(RegExp(r'/$'), ''));
  if (uri == null ||
      !uri.hasAuthority ||
      uri.userInfo.isNotEmpty ||
      uri.hasQuery ||
      uri.hasFragment ||
      (uri.scheme != 'https' &&
          !(uri.scheme == 'http' &&
              ['localhost', '127.0.0.1', '10.0.2.2'].contains(uri.host)))) {
    throw ArgumentError('httpsRequired');
  }
  return uri;
}

class ProviderCancellation {
  final _cancelled = Completer<void>();
  final String defaultReason;
  late String reason = defaultReason;
  ProviderCancellation([this.defaultReason = 'providerCancelled']);
  Future<void> get whenCancelled => _cancelled.future;
  void cancel([String? value]) {
    if (_cancelled.isCompleted) return;
    reason = value ?? defaultReason;
    _cancelled.complete();
  }

  void check() {
    if (_cancelled.isCompleted) throw StateError(reason);
  }

  Future<T> guard<T>(Future<T> work) => Future.any([
    work,
    whenCancelled.then<T>((_) => throw StateError(reason)),
  ]);
}

class DirectProviders {
  final http.Client client;
  DirectProviders(this.client);
  Future<Json> json(
    String method,
    Uri uri, {
    String? key,
    Json? body,
    ProviderCancellation? cancellation,
  }) async {
    endpoint(uri.toString());
    cancellation?.check();
    final request =
        (cancellation == null
              ? http.Request(method, uri)
              : (http.AbortableRequest(
                  method,
                  uri,
                  abortTrigger: cancellation.whenCancelled,
                )..followRedirects = false))
          ..headers['Accept'] = 'application/json';
    if (key != null && key.isNotEmpty) {
      request.headers['Authorization'] = 'Bearer $key';
    }
    if (body != null) {
      request.headers['Content-Type'] = 'application/json';
      request.body = jsonEncode(body);
    }
    final response = client.send(request).timeout(const Duration(seconds: 90));
    final streamed = await (cancellation?.guard(response) ?? response);
    final bytes = <int>[];
    final iterator = StreamIterator(
      streamed.stream.timeout(const Duration(seconds: 90)),
    );
    try {
      while (await (cancellation?.guard(iterator.moveNext()) ??
          iterator.moveNext())) {
        final chunk = iterator.current;
        if (bytes.length + chunk.length > 8 * 1024 * 1024) {
          throw StateError('responseTooLarge');
        }
        bytes.addAll(chunk);
      }
    } finally {
      unawaited(iterator.cancel().catchError((_) {}));
    }
    dynamic value;
    try {
      value = jsonDecode(utf8.decode(bytes));
    } catch (_) {
      throw StateError('invalidResponse');
    }
    if (streamed.statusCode < 200 || streamed.statusCode >= 300) {
      // Never expose raw provider responses: they may echo authorization data.
      throw HttpException('Provider HTTP ${streamed.statusCode}');
    }
    if (value is! Map) throw StateError('invalidResponse');
    return Map<String, dynamic>.from(value);
  }

  Future<String> submit(
    Json config,
    Json snapshot, {
    ProviderCancellation? cancellation,
  }) async {
    final base = endpoint(config['endpoint'] as String);
    if ('${config['apiKey'] ?? ''}'.isEmpty ||
        '${config['model'] ?? ''}'.isEmpty) {
      throw StateError('configureModel');
    }
    final ark = config['provider'] == 'ark';
    final firstFrame = snapshot['firstFrame'] == true;
    final content = <Json>[
      {'type': 'text', 'text': snapshot['prompt']},
    ];
    final references = (snapshot['references'] as List? ?? []).cast<Json>();
    for (final ref in references) {
      content.add({
        'type': 'image_url',
        'image_url': {'url': ref['url']},
        'role': references.length == 1 ? 'first_frame' : 'reference_image',
      });
    }
    final data = await json(
      'POST',
      Uri.parse('$base/${ark ? 'contents/generations/tasks' : 'tasks'}'),
      key: config['apiKey'],
      cancellation: cancellation,
      body: ark
          ? {
              'model': config['model'],
              'content': content,
              'duration': (snapshot['duration'] as num).round(),
              'ratio': firstFrame ? 'adaptive' : snapshot['format'],
              'watermark': false,
            }
          : {
              'model': config['model'],
              'prompt': snapshot['prompt'],
              'duration': snapshot['duration'],
              'ratio': snapshot['format'],
              'references': references,
            },
    );
    final id = data['id'] ?? data['task_id'];
    if (id is! String || id.isEmpty) throw StateError('invalidResponse');
    return id;
  }

  Future<Json> poll(
    Json config,
    String id, {
    ProviderCancellation? cancellation,
  }) => json(
    'GET',
    Uri.parse(
      '${endpoint(config['endpoint'])}/${config['provider'] == 'ark' ? 'contents/generations/tasks' : 'tasks'}/${Uri.encodeComponent(id)}',
    ),
    key: config['apiKey'],
    cancellation: cancellation,
  );
  Future<void> download(
    String url,
    File target,
    bool Function() cancelled, {
    ProviderCancellation? cancellation,
  }) async {
    final uri = Uri.parse(url);
    if (uri.scheme != 'https' &&
        !(uri.scheme == 'http' &&
            ['127.0.0.1', 'localhost'].contains(uri.host))) {
      throw StateError('httpsRequired');
    }
    // CDN signed query strings are allowed, credentials and fragments are not.
    if (uri.userInfo.isNotEmpty || uri.hasFragment) {
      throw StateError('invalidResponse');
    }
    cancellation?.check();
    final request = cancellation == null
        ? http.Request('GET', uri)
        : (http.AbortableRequest(
            'GET',
            uri,
            abortTrigger: cancellation.whenCancelled,
          )..followRedirects = false);
    final pending = client.send(request).timeout(const Duration(seconds: 30));
    final response = await (cancellation?.guard(pending) ?? pending);
    final iterator = StreamIterator(
      response.stream.timeout(const Duration(seconds: 60)),
    );
    if (response.statusCode != 200) {
      unawaited(iterator.cancel().catchError((_) {}));
      throw StateError('downloadFailed');
    }
    final sink = target.openWrite();
    int size = 0;
    try {
      while (await (cancellation?.guard(iterator.moveNext()) ??
          iterator.moveNext())) {
        if (cancelled()) throw StateError('cancelled');
        final chunk = iterator.current;
        size += chunk.length;
        if (size > 200 * 1024 * 1024) throw StateError('responseTooLarge');
        sink.add(chunk);
      }
    } finally {
      unawaited(iterator.cancel().catchError((_) {}));
      await sink.close();
    }
    final file = await target.open();
    try {
      final header = await file.read(12);
      if (header.length < 12 ||
          ascii.decode(header.sublist(4, 8), allowInvalid: true) != 'ftyp') {
        throw StateError('invalidVideo');
      }
    } finally {
      await file.close();
    }
  }
}
