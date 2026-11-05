import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'models.dart';
import 'domain.dart';
import 'providers.dart';

const defaultSpeech = <String, dynamic>{
  'endpoint': '',
  'model': '',
  'voice': '',
  'speed': 1.0,
  'apiKey': '',
};
const speechByteLimit = 32 * 1024 * 1024;
void validateSpeech(Json config, {bool requireKey = true}) {
  for (final name in ['endpoint', 'model', 'voice', 'apiKey']) {
    if (config[name] is! String) throw ArgumentError('configureSpeech');
  }
  if (requireKey &&
      [
        'endpoint',
        'model',
        'voice',
        'apiKey',
      ].any((k) => (config[k] as String).trim().isEmpty)) {
    throw StateError('configureSpeech');
  }
  if ((config['endpoint'] as String).isNotEmpty) endpoint(config['endpoint']);
  final speed = config['speed'];
  if (speed is! num || !speed.isFinite || speed < .25 || speed > 4) {
    throw ArgumentError('speechSpeedInvalid');
  }
  if ((config['endpoint'] as String).length > 2000 ||
      (config['model'] as String).length > 200 ||
      (config['voice'] as String).length > 200 ||
      (config['apiKey'] as String).length > 4000) {
    throw ArgumentError('configureSpeech');
  }
}

class SpeechCancellation extends ProviderCancellation {
  SpeechCancellation() : super('speechCancelled');
}

Future<Json> generateSpeech({
  required http.Client client,
  required Json config,
  required String text,
  required int order,
  required Directory media,
  required SpeechCancellation token,
  required Future<void> Function(String, String) validateMedia,
}) async {
  validateSpeech(config);
  token.check();
  if (text.trim().isEmpty || text.length > 3000) {
    throw ArgumentError('speechTextInvalid');
  }
  final id = newId(),
      file = 'media/speech-$id.wav',
      target = File('${media.path}/speech-$id.wav'),
      partial = File('${media.path}/speech-$id.partial.wav');
  final timeout = Timer(
    const Duration(seconds: 120),
    () => token.cancel('speechTimeout'),
  );
  var published = false;
  StreamIterator<List<int>>? iterator;
  try {
    final request =
        http.AbortableRequest(
            'POST',
            Uri.parse('${endpoint(config['endpoint'])}/audio/speech'),
            abortTrigger: token.whenCancelled,
          )
          ..followRedirects = false
          ..headers['Authorization'] = 'Bearer ${config['apiKey']}'
          ..headers['Content-Type'] = 'application/json'
          ..body = jsonEncode({
            'model': config['model'],
            'voice': config['voice'],
            'speed': config['speed'],
            'input': text,
            'response_format': 'wav',
          });
    final response = await token.guard(client.send(request));
    iterator = StreamIterator(response.stream);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError('speechHttp_${response.statusCode}');
    }
    if ((response.contentLength ?? 0) > speechByteLimit) {
      throw StateError('speechTooLarge');
    }
    final output = await partial.open(mode: FileMode.writeOnly);
    try {
      var size = 0;
      while (await token.guard(iterator.moveNext())) {
        token.check();
        final bytes = iterator.current;
        size += bytes.length;
        if (size > speechByteLimit) throw StateError('speechTooLarge');
        await output.writeFrom(bytes);
      }
      await output.flush();
    } finally {
      await output.close();
    }
    token.check();
    final input = await partial.open();
    late List<int> header;
    try {
      header = await input.read(12);
    } finally {
      await input.close();
    }
    if (header.length != 12 ||
        ascii.decode(header.take(4).toList(), allowInvalid: true) != 'RIFF' ||
        ascii.decode(header.sublist(8), allowInvalid: true) != 'WAVE') {
      throw StateError('speechInvalidAudio');
    }
    try {
      await token.guard(validateMedia(partial.path, 'audio'));
    } catch (_) {
      token.check();
      throw StateError('speechInvalidAudio');
    }
    token.check();
    await partial.rename(target.path);
    published = true;
    final size = await target.length();
    token.check();
    return {
      'id': id,
      'name':
          'AI Voiceover · ${order.toString().padLeft(2, '0')} · ${id.substring(0, 8)}.wav',
      'kind': 'audio',
      'mime': 'audio/wav',
      'file': file,
      'size': size,
      'createdAt': timestamp(),
    };
  } catch (_) {
    if (published) {
      try {
        await target.delete();
      } catch (_) {}
    }
    rethrow;
  } finally {
    timeout.cancel();
    if (iterator != null) unawaited(iterator.cancel().catchError((_) {}));
    try {
      if (await partial.exists()) await partial.delete();
    } catch (_) {}
  }
}

Future<void> recoverSpeechFiles(Directory media, List<Json> projects) async {
  final referenced = projects
      .expand((p) => (p['assets'] as List).map((a) => a['file']))
      .toSet();
  await for (final entry in media.list(followLinks: false)) {
    final name = entry.uri.pathSegments.last;
    if (entry is! File ||
        !RegExp(
          r'^speech-[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}(?:\.partial)?\.wav(?:\.partial)?$',
          caseSensitive: false,
        ).hasMatch(name) ||
        referenced.contains('media/$name')) {
      continue;
    }
    try {
      await entry.delete();
    } catch (_) {}
  }
}
