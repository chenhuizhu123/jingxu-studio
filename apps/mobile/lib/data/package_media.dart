import 'dart:io';
import 'dart:ui' as ui;
import 'package:pro_video_editor/pro_video_editor.dart';

String? imageMime(List<int> header) {
  if (header.length >= 8 &&
      header.take(8).join(',') == '137,80,78,71,13,10,26,10') {
    return 'image/png';
  }
  if (header.length >= 3 &&
      header[0] == 255 &&
      header[1] == 216 &&
      header[2] == 255) {
    return 'image/jpeg';
  }
  if (header.length >= 12 &&
      String.fromCharCodes(header.take(4)) == 'RIFF' &&
      String.fromCharCodes(header.sublist(8, 12)) == 'WEBP') {
    return 'image/webp';
  }
  return null;
}

Future<void> validatePackageMedia(
  String filename,
  String kind, {
  int imagePixelLimit = 40000000,
  bool singleImage = false,
}) async {
  if (kind == 'document') return;
  if (kind == 'image') {
    final file = await File(filename).open();
    late List<int> header;
    try {
      header = await file.read(16);
    } finally {
      await file.close();
    }
    if (imageMime(header) == null) throw StateError('invalidPackageMedia');
    final buffer = await ui.ImmutableBuffer.fromFilePath(filename);
    ui.ImageDescriptor? descriptor;
    ui.Codec? codec;
    try {
      descriptor = await ui.ImageDescriptor.encoded(buffer);
      if (descriptor.width * descriptor.height > imagePixelLimit) {
        throw StateError('invalidPackageMedia');
      }
      codec = await descriptor.instantiateCodec(
        targetWidth: 64,
        targetHeight: 64,
      );
      if (singleImage && codec.frameCount != 1) {
        throw StateError('invalidPackageMedia');
      }
      final frame = await codec.getNextFrame();
      frame.image.dispose();
    } finally {
      codec?.dispose();
      descriptor?.dispose();
      buffer.dispose();
    }
    return;
  }
  final metadata = await ProVideoEditor.instance
      .getMetadata(EditorVideo.file(filename))
      .timeout(const Duration(seconds: 30));
  if (metadata.duration <= Duration.zero ||
      (kind == 'video' &&
          (metadata.resolution.width <= 0 ||
              metadata.resolution.height <= 0)) ||
      (kind == 'audio' &&
          (metadata.audioDuration == null ||
              metadata.audioDuration! <= Duration.zero))) {
    throw StateError('invalidPackageMedia');
  }
}
