import 'dart:io';
import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';
import '../l10n/generated/app_localizations.dart';
import '../data/models.dart';

extension StudioStrings on BuildContext {
  AppLocalizations get l => AppLocalizations.of(this);
}

String errorText(BuildContext context, Object error) {
  final key = error.toString().replaceFirst(
    RegExp(r'^(Bad state|Invalid argument\(s\)|Exception):\s*'),
    '',
  );
  final l = context.l;
  if (RegExp(r'^speechHttp_\d+$').hasMatch(key)) {
    return l.speechHttpError(key.substring(11));
  }
  if (RegExp(r'^imageHttp_\d{3}$').hasMatch(key)) {
    return l.generationHttpError(key.substring(10));
  }
  return switch (key) {
    'configureImage' => l.configureImage,
    'configureFirstFrame' => l.configureFirstFrame,
    'generationChanged' => l.generationChanged,
    'imagePromptRequired' => l.imagePromptRequired,
    'imageReferenceLimit' => l.imageReferenceLimit,
    'imageReferenceInvalid' => l.imageReferenceInvalid,
    'imageReferencesTooLarge' => l.imageReferencesTooLarge,
    'imageInvalid' => l.imageInvalid,
    'imageResponseTooLarge' => l.imageResponseTooLarge,
    'generationSubmitting' => l.generationSubmitting,
    'generationPolling' => l.generationPolling,
    'generationCandidateSaved' => l.generationCandidateSaved,
    'generationReviewAgain' => l.generationReviewAgain,
    'invalidVideo' => l.generationVideoInvalid,
    'providerTaskFailed' => l.generationRemoteFailed,
    'providerTimeout' => l.generationTimedOut,
    'downloadFailed' => l.generationDownloadFailed,
    'configureSpeech' => l.configureSpeech,
    'speechTextInvalid' => l.speechTextInvalid,
    'speechTextChanged' => l.speechTextChanged,
    'speechSpeedInvalid' => l.speechSpeedInvalid,
    'speechTooLarge' => l.speechTooLarge,
    'speechInvalidAudio' => l.speechInvalidAudio,
    'speechTimeout' => l.speechTimeout,
    'speechFailed' => l.speechFailed,
    'speechCancelled' => l.speechCancelled,
    'speechUnknownSubmission' => l.speechUnknownSubmission,
    'speechGenerating' => l.speechGenerating,
    'speechSaved' => l.speechSaved,

    'invalidCaptions' => l.invalidCaptions,
    'captionStale' => l.captionStale,
    'invalidPackage' => l.invalidPackage,
    'packageVersion' => l.packageVersion,
    'packageTooLarge' => l.packageTooLarge,
    'packageMissingMedia' => l.packageMissingMedia,
    'invalidPackageMedia' => l.invalidPackageMedia,
    'packageStorageError' => l.packageStorageError,
    'packageCancelled' => l.packageCancelled,
    'configureModel' => l.configureModel,
    'invalidDuration' => l.invalidDuration,
    'staleRevision' => l.staleRevision,
    'taskExists' => l.taskExists,
    'hasMedia' => l.hasMedia,
    'unsupportedFile' => l.unsupportedFile,
    'missingMedia' => l.missingMedia,
    'trimExceedsMedia' => l.trimExceedsMedia,
    'imageReviewOnly' => l.imageReviewOnly,
    'unknownSubmission' => l.unknownSubmission,
    'exportInterrupted' => l.exportInterrupted,
    'remoteMayContinue' => l.remoteMayContinue,
    'httpsRequired' => l.httpsRequired,
    'required' => l.required,
    _ => l.taskFailed,
  };
}

Future<bool> perform(
  BuildContext context,
  Future<void> Function() work, {
  String? success,
}) async {
  try {
    await work();
    if (context.mounted && success != null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(success)));
    }
    return true;
  } catch (e) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(errorText(context, e)),
          backgroundColor: const Color(0xff8c3a32),
        ),
      );
    }
    return false;
  }
}

class SectionHeading extends StatelessWidget {
  final String title;
  final Widget? trailing;
  const SectionHeading(this.title, {super.key, this.trailing});
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 24, bottom: 12),
    child: Row(
      children: [
        Expanded(
          child: Text(title, style: Theme.of(context).textTheme.titleMedium),
        ),
        ?trailing,
      ],
    ),
  );
}

class StudioCard extends StatelessWidget {
  final Widget child;
  final EdgeInsets padding;
  const StudioCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(20),
  });
  @override
  Widget build(BuildContext context) => Material(
    color: Theme.of(context).colorScheme.surface,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(20),
      side: const BorderSide(color: Color(0xffe7e7df)),
    ),
    child: Padding(padding: padding, child: child),
  );
}

class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title, description;
  final Widget? action;
  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    required this.description,
    this.action,
  });
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 52, horizontal: 28),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.all(22),
          decoration: BoxDecoration(
            color: const Color(0xffeaf0e8),
            borderRadius: BorderRadius.circular(24),
          ),
          child: Icon(icon, size: 32, color: const Color(0xff285744)),
        ),
        const SizedBox(height: 24),
        Text(
          title,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 10),
        Text(
          description,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(height: 22),
        ?action,
      ],
    ),
  );
}

class AssetPreview extends StatefulWidget {
  final MediaAsset? asset;
  final bool playable;
  final BoxFit fit;
  const AssetPreview(
    this.asset, {
    super.key,
    this.playable = false,
    this.fit = BoxFit.cover,
  });
  @override
  State<AssetPreview> createState() => _AssetPreviewState();
}

class _AssetPreviewState extends State<AssetPreview> {
  VideoPlayerController? controller;
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(AssetPreview old) {
    super.didUpdateWidget(old);
    if (old.asset?.url != widget.asset?.url ||
        old.playable != widget.playable) {
      controller?.dispose();
      controller = null;
      _load();
    }
  }

  void _load() {
    if (widget.asset?.kind == 'video' && widget.playable) {
      final next = VideoPlayerController.file(File(widget.asset!.url));
      controller = next;
      next
          .initialize()
          .then((_) {
            if (mounted && controller == next) setState(() {});
          })
          .catchError((_) {
            if (mounted) setState(() {});
          });
    }
  }

  @override
  void dispose() {
    controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final asset = widget.asset;
    if (asset?.kind == 'image') {
      return Image.file(
        File(asset!.url),
        fit: widget.fit,
        errorBuilder: (_, _, _) => const Center(
          child: Icon(Icons.broken_image_outlined, color: Colors.white54),
        ),
      );
    }
    if (controller?.value.isInitialized ?? false) {
      return ColoredBox(
        color: Colors.black,
        child: Stack(
          alignment: Alignment.center,
          children: [
            Center(
              child: AspectRatio(
                aspectRatio: controller!.value.aspectRatio,
                child: VideoPlayer(controller!),
              ),
            ),
            Positioned(
              bottom: 14,
              right: 14,
              child: IconButton.filled(
                tooltip: controller!.value.isPlaying ? 'Pause' : 'Play',
                onPressed: () {
                  setState(() {
                    controller!.value.isPlaying
                        ? controller!.pause()
                        : controller!.play();
                  });
                },
                icon: Icon(
                  controller!.value.isPlaying ? Icons.pause : Icons.play_arrow,
                ),
              ),
            ),
            Positioned(
              left: 12,
              right: 72,
              bottom: 24,
              child: VideoProgressIndicator(controller!, allowScrubbing: true),
            ),
          ],
        ),
      );
    }
    return ColoredBox(
      color: const Color(0xff18382f),
      child: Center(
        child: Icon(
          asset?.kind == 'video'
              ? Icons.play_circle_outline
              : Icons.movie_creation_outlined,
          color: const Color(0xffb3c6b6),
          size: 36,
        ),
      ),
    );
  }
}

Widget field(
  String label,
  TextEditingController controller, {
  int lines = 1,
  bool secret = false,
  TextInputType? keyboard,
  String? hint,
}) => Padding(
  padding: const EdgeInsets.only(bottom: 18),
  child: TextFormField(
    controller: controller,
    maxLines: lines,
    obscureText: secret,
    keyboardType: keyboard,
    decoration: InputDecoration(labelText: label, hintText: hint),
    autocorrect: !secret,
  ),
);
Future<bool> confirm(BuildContext context, String text) async =>
    await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        content: Text(text),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(ctx.l.cancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(ctx.l.delete),
          ),
        ],
      ),
    ) ??
    false;
