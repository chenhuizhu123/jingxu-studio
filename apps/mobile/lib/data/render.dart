import 'captions.dart';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/painting.dart';
import 'package:pro_video_editor/pro_video_editor.dart';
import 'models.dart';

typedef RenderProgress = void Function(double progress);

abstract class LocalRenderer {
  Future<void> render(
    Project project,
    String output,
    String taskId,
    String Function(String) path,
    RenderProgress progress,
  );
  Future<void> cancel(String taskId);
}

/// AVFoundation on iOS, Media3 on Android. Rendering never needs our server.
class NativeRenderer implements LocalRenderer {
  final editor = ProVideoEditor.instance;
  @override
  Future<void> cancel(String taskId) async {
    await editor.cancel(taskId);
  }

  Duration _time(double seconds) =>
      Duration(microseconds: (seconds * 1000000).round());
  @override
  Future<void> render(
    Project project,
    String output,
    String taskId,
    String Function(String) path,
    RenderProgress progress,
  ) async {
    if (project.shots.isEmpty) throw StateError('missingMedia');
    for (final shot in project.shots) {
      captionCues(shot);
    }
    final size = switch (project.format) {
      '16:9' => const ui.Size(1280, 720),
      '1:1' => const ui.Size(720, 720),
      _ => const ui.Size(720, 1280),
    };
    final temporary = <String>[];
    final clips = <VideoSegment>[];
    final audio = <VideoAudioTrack>[];
    final captions = <ImageLayer>[];
    double cursor = 0;
    try {
      for (final shot in project.shots) {
        final asset = project.asset(shot.selected?.assetId);
        if (asset == null || !['image', 'video'].contains(asset.kind)) {
          throw StateError('missingMedia');
        }
        var source = path(asset.url);
        var trim = shot.trimStart;
        if (asset.kind == 'image') {
          source = '$output-${shot.id}.mp4';
          temporary.add(source);
          trim = 0;
          await editor.renderStopMotionToFile(
            source,
            StopMotionRenderData(
              id: '$taskId-image',
              frames: [
                StopMotionFrame(
                  image: EditorLayerImage.file(path(asset.url)),
                  duration: _time(shot.duration),
                ),
              ],
              resolution: size,
              frameRate: 25,
            ),
          );
        } else {
          final metadata = await editor.getMetadata(EditorVideo.file(source));
          if (trim + shot.duration >
              metadata.duration.inMicroseconds / 1000000 + .1) {
            throw StateError('trimExceedsMedia');
          }
        }
        final voice = project.asset(shot.audioAssetId);
        clips.add(
          VideoSegment(
            video: EditorVideo.file(source),
            startTime: _time(trim),
            endTime: _time(trim + shot.duration),
            timelineStart: _time(cursor),
            volume: voice == null ? 1 : 0,
          ),
        );
        if (voice != null) {
          audio.add(
            VideoAudioTrack(
              path: path(voice.url),
              startTime: _time(cursor),
              endTime: _time(cursor + shot.duration),
            ),
          );
        }
        if (project.burnSubtitles) {
          for (final (index, cue) in captionCues(shot).indexed) {
            final png = '$output-${shot.id}-caption-$index.png';
            temporary.add(png);
            await _caption(plainSubtitle(cue['text']), size, png);
            captions.add(
              ImageLayer(
                image: EditorLayerImage.file(png),
                startTime: _time(cursor + (cue['start'] as num)),
                endTime: _time(cursor + (cue['end'] as num)),
                offset: ui.Offset.zero,
                size: size,
              ),
            );
          }
        }
        cursor += shot.duration;
        progress(.5 * clips.length / project.shots.length);
      }
      final music = project.asset(project.musicAssetId);
      if (music != null) {
        audio.add(
          VideoAudioTrack(
            path: path(music.url),
            loop: true,
            volume: project.musicVolume,
            startTime: Duration.zero,
            endTime: _time(cursor),
          ),
        );
      }
      final subscription = editor
          .progressStreamById(taskId)
          .listen((value) => progress(.5 + value.progress * .5));
      try {
        await editor.renderVideoToFile(
          output,
          VideoRenderData(
            id: taskId,
            composition: VideoComposition(
              canvasSize: size,
              layers: [
                VideoLayer(
                  clips: clips,
                  transform: SegmentTransform(
                    size: size,
                    fit: SegmentFit.contain,
                  ),
                ),
              ],
            ),
            audioTracks: audio,
            imageLayers: captions,
            endTime: _time(cursor),
            maxFrameRate: 25,
            shouldOptimizeForNetworkUse: true,
          ),
        );
      } finally {
        await subscription.cancel();
      }
    } finally {
      for (final file in temporary) {
        if (await File(file).exists()) await File(file).delete();
      }
    }
  }

  Future<void> _caption(String text, ui.Size size, String output) async {
    final recorder = ui.PictureRecorder();
    final canvas = ui.Canvas(recorder);
    final painter = TextPainter(
      text: TextSpan(
        text: text,
        style: const TextStyle(
          color: ui.Color(0xffffffff),
          fontSize: 28,
          fontFamily: 'NotoSansSC',
          height: 1.3,
          shadows: [Shadow(color: ui.Color(0xff000000), blurRadius: 5)],
        ),
      ),
      textDirection: ui.TextDirection.ltr,
      textAlign: TextAlign.center,
      maxLines: 4,
      ellipsis: '…',
    )..layout(maxWidth: size.width - 96);
    painter.paint(
      canvas,
      ui.Offset(
        (size.width - painter.width) / 2,
        size.height - 110 - painter.height,
      ),
    );
    final picture = recorder.endRecording();
    final image = await picture.toImage(
      size.width.toInt(),
      size.height.toInt(),
    );
    try {
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      await File(output).writeAsBytes(bytes!.buffer.asUint8List());
    } finally {
      image.dispose();
      picture.dispose();
      painter.dispose();
    }
  }
}
