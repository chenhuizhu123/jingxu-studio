import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:isolate';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import 'domain.dart';
import 'models.dart';
import 'package_media.dart';
import 'providers.dart';

const arkBaseUrl = 'https://ark.cn-beijing.volces.com/api/v3';
const bytePlusBaseUrl = 'https://ark.ap-southeast.bytepluses.com/api/v3';
const defaultImage = <String, dynamic>{
  'endpoint': arkBaseUrl,
  'model': '',
  'apiKey': '',
};

// Keep isolate closures separate from the async request scopes that own
// clients, files and cancellation completers.
Future<String> _encodeReference(Uint8List bytes) =>
    Isolate.run(() => base64Encode(bytes));
Future<Uint8List> _encodeBody(Json body) =>
    Isolate.run(() => utf8.encode(jsonEncode(body)));
Future<Uint8List> _decodeBody(Uint8List bytes) =>
    Isolate.run(() => _decodeImage(bytes));

void validateImageConfig(Json config, {bool requireKey = true}) {
  for (final (key, max) in [
    ('endpoint', 2000),
    ('model', 200),
    ('apiKey', 4000),
  ]) {
    final value = config[key];
    if (value is! String ||
        value.length > max ||
        (requireKey && value.trim().isEmpty)) {
      throw StateError('configureImage');
    }
  }
  if ((config['endpoint'] as String).isNotEmpty) endpoint(config['endpoint']);
}

List<String> shotReferenceIds(Project project, Shot shot) => {
  ...shot.referenceIds,
  ...project.characters
      .where((c) => shot.characterIds.contains(c['id']))
      .map((c) => c['referenceId'])
      .whereType<String>(),
}.toList();

String generationPrompt(Project project, Shot shot) => [
  shot.prompt,
  project.style,
  shot.scene,
  shot.type,
  shot.note,
  for (final c in project.characters)
    if (shot.characterIds.contains(c['id']))
      "${c['name']}: ${c['description'] ?? ''}",
].where((line) => line.trim().isNotEmpty).join('\n');

int firstFrameSeconds(Shot shot) => shot.duration.round().clamp(4, 30);

List<Json> generationReferences(Project project, List<String> ids) {
  if (ids.length > 10) throw StateError('imageReferenceLimit');
  final assets = (project.data['assets'] as List).cast<Json>();
  return ids.map((id) {
    final asset = assets
        .where((a) => a['id'] == id && a['kind'] == 'image')
        .firstOrNull;
    if (asset == null) throw StateError('imageReferenceInvalid');
    return asset;
  }).toList();
}

Future<List<String>> referenceData(
  List<Json> assets,
  String Function(String) path,
  ProviderCancellation token, {
  bool firstFrame = false,
}) async {
  var remaining = (firstFrame ? 15 : 20) * 1024 * 1024;
  final result = <String>[];
  for (final asset in assets) {
    token.check();
    final file = File(path(asset['file']));
    final size = await file.length();
    if (size > remaining) throw StateError('imageReferencesTooLarge');
    final input = await file.open();
    late Uint8List bytes;
    try {
      bytes = await input.read(size + 1);
    } finally {
      await input.close();
    }
    if (bytes.length != size) throw StateError('generationChanged');
    final mime = imageMime(bytes);
    if (mime == null) throw StateError('imageReferenceInvalid');
    remaining -= bytes.length;
    final data = await token.guard(_encodeReference(bytes));
    result.add('data:$mime;base64,$data');
  }
  return result;
}

const _responseLimit = 28 * 1024 * 1024;
const _sizes = {'9:16': '1440x2560', '16:9': '2560x1440', '1:1': '2048x2048'};

Uint8List _decodeImage(Uint8List response) {
  try {
    final json = jsonDecode(utf8.decode(response));
    final value = json['data'][0]['b64_json'];
    if (value is! String ||
        value.isEmpty ||
        RegExp(r'[^A-Za-z0-9+/=]').hasMatch(value)) {
      throw const FormatException();
    }
    return base64Decode(value);
  } catch (_) {
    throw StateError('imageInvalid');
  }
}

Future<Json> generateShotImage({
  required http.Client client,
  required Json config,
  required String prompt,
  required String format,
  required List<String> images,
  required Directory media,
  required String jobId,
  required ProviderCancellation token,
  required Future<void> Function() beforeSubmit,
}) async {
  final body = <String, dynamic>{
    'model': config['model'],
    'prompt': prompt,
    if (images.isNotEmpty) 'image': images.length == 1 ? images.single : images,
    'size': _sizes[format] ?? _sizes['9:16'],
    'response_format': 'b64_json',
  };
  final encoded = await token.guard(_encodeBody(body));
  final request =
      http.AbortableRequest(
          'POST',
          Uri.parse("${endpoint(config['endpoint'])}/images/generations"),
          abortTrigger: token.whenCancelled,
        )
        ..followRedirects = false
        ..headers['Authorization'] = "Bearer ${config['apiKey']}"
        ..headers['Content-Type'] = 'application/json'
        ..bodyBytes = encoded;
  final partial = File('${media.path}/seedream-$jobId.partial');
  File? target;
  StreamIterator<List<int>>? iterator;
  await beforeSubmit();
  token.check();
  final timer = Timer(
    const Duration(seconds: 180),
    () => token.cancel('imageTimeout'),
  );
  try {
    final response = await token.guard(client.send(request));
    iterator = StreamIterator(response.stream);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError('imageHttp_${response.statusCode}');
    }
    final bytes = BytesBuilder(copy: false);
    while (await token.guard(iterator.moveNext())) {
      if (bytes.length + iterator.current.length > _responseLimit) {
        throw StateError('imageResponseTooLarge');
      }
      bytes.add(iterator.current);
    }
    final received = bytes.takeBytes();
    final data = await token.guard(_decodeBody(received));
    final mime = imageMime(data);
    final extension = switch (mime) {
      'image/png' => 'png',
      'image/jpeg' => 'jpg',
      'image/webp' => 'webp',
      _ => throw StateError('imageInvalid'),
    };
    token.check();
    await partial.writeAsBytes(data, flush: true);
    try {
      await validatePackageMedia(
        partial.path,
        'image',
        imagePixelLimit: 10000000,
        singleImage: true,
      );
    } catch (_) {
      throw StateError('imageInvalid');
    }
    token.check();
    final filename = 'seedream-$jobId.$extension';
    target = await partial.rename('${media.path}/$filename');
    token.check();
    return {
      'id': jobId,
      'kind': 'image',
      'mime': mime,
      'file': 'media/$filename',
      'name': 'Seedream-${jobId.substring(0, 8)}.$extension',
      'size': data.length,
      'createdAt': timestamp(),
    };
  } catch (_) {
    if (target != null) await target.delete().catchError((_) => target!);
    rethrow;
  } finally {
    timer.cancel();
    if (iterator != null) unawaited(iterator.cancel().catchError((_) {}));
    try {
      if (await partial.exists()) await partial.delete();
    } catch (_) {}
  }
}

Future<void> recoverGeneratedFiles(Directory media, List<Json> projects) async {
  final referenced = projects
      .expand((p) => (p['assets'] as List).map((a) => a['file']))
      .toSet();
  final owned = RegExp(
    r'^(seedream|first-frame)-[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}\.(png|jpg|webp|mp4|partial(?:\.mp4)?)$',
  );
  await for (final entry in media.list(followLinks: false)) {
    final name = entry.uri.pathSegments.last;
    if (entry is File &&
        owned.hasMatch(name) &&
        !referenced.contains('media/$name')) {
      try {
        await entry.delete();
      } catch (_) {}
    }
  }
}
