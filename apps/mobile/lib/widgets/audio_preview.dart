import 'dart:async';
import 'package:flutter/material.dart';
import '../data/audio_preview.dart';
import '../data/models.dart';
import 'common.dart';

class LocalAudioPreview extends StatefulWidget {
  final String filename;
  final double shotDuration;
  final AudioPreviewController Function()? createController;
  const LocalAudioPreview({
    super.key,
    required this.filename,
    required this.shotDuration,
    this.createController,
  });
  @override
  State<LocalAudioPreview> createState() => _LocalAudioPreviewState();
}

class _LocalAudioPreviewState extends State<LocalAudioPreview>
    with WidgetsBindingObserver {
  late final AudioPreviewController controller;
  @override
  void initState() {
    super.initState();
    controller = widget.createController?.call() ?? NativeAudioPreview();
    controller.addListener(_changed);
    WidgetsBinding.instance.addObserver(this);
    unawaited(controller.load(widget.filename));
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (ModalRoute.of(context)?.isCurrent == false) {
      unawaited(controller.pause());
    }
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) unawaited(controller.pause());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    controller.removeListener(_changed);
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l, total = controller.duration?.inMilliseconds ?? 0;
    final end = total > 0 ? total.toDouble() : 1.0;
    return StudioCard(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              IconButton(
                onPressed: controller.loading || controller.failed
                    ? null
                    : () => controller.toggle(),
                tooltip: controller.playing
                    ? l.speechPause
                    : controller.completed
                    ? l.speechReplay
                    : l.speechPlay,
                icon: controller.loading
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Icon(
                        controller.playing
                            ? Icons.pause_rounded
                            : controller.completed
                            ? Icons.replay_rounded
                            : Icons.play_arrow_rounded,
                      ),
              ),
              Expanded(
                child: Text(
                  '${timecode(controller.position.inMilliseconds / 1000)} / ${timecode(total / 1000)}',
                ),
              ),
            ],
          ),
          Semantics(
            label: l.speechSeek,
            child: Slider(
              value: controller.position.inMilliseconds.toDouble().clamp(
                0,
                end,
              ),
              max: end,
              onChanged: total > 0 && !controller.failed
                  ? (v) => controller.seek(Duration(milliseconds: v.round()))
                  : null,
            ),
          ),
          if (controller.duration != null)
            Text(
              '${l.speechTrackDuration}: ${(total / 1000).toStringAsFixed(1)}s · ${l.shot}: ${widget.shotDuration}s',
              style: const TextStyle(fontSize: 11),
            ),
          if (total / 1000 > widget.shotDuration + .1)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                l.speechLongTrack,
                style: const TextStyle(color: Color(0xff9b4838), fontSize: 12),
              ),
            ),
          if (controller.failed) ...[
            Text(l.speechPlaybackError),
            TextButton(
              onPressed: () => controller.load(widget.filename),
              child: Text(l.retry),
            ),
          ],
        ],
      ),
    );
  }
}
