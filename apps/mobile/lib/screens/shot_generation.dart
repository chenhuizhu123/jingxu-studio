import 'package:flutter/material.dart';
import '../data/models.dart';
import '../data/shot_generation.dart';
import '../data/studio.dart';
import '../widgets/common.dart';
import 'settings.dart';

class ShotGenerationScreen extends StatefulWidget {
  final String projectId, shotId;
  final bool firstFrame;
  const ShotGenerationScreen({
    super.key,
    required this.projectId,
    required this.shotId,
    this.firstFrame = false,
  });

  @override
  State<ShotGenerationScreen> createState() => _ShotGenerationScreenState();
}

class _ShotGenerationScreenState extends State<ShotGenerationScreen> {
  ({Project project, Shot shot, Json config})? reviewed;
  bool started = false, busy = false;
  String? jobId;
  Object? error;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (started) return;
    started = true;
    _load();
  }

  Future<void> _load() async {
    final api = StudioScope.of(context).api;
    try {
      final project = await api.project(widget.projectId);
      final config =
          (await api.settings())[widget.firstFrame ? 'generation' : 'image']
              as Json;
      final shot = project.shots.firstWhere((s) => s.id == widget.shotId);
      if (mounted) {
        setState(() {
          reviewed = (project: project, shot: shot, config: config);
          error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = e);
    }
  }

  Future<void> _submit() async {
    final review = reviewed;
    if (review == null || busy) return;
    final studio = StudioScope.of(context);
    setState(() {
      error = null;
      busy = true;
    });
    try {
      if (jobId == null) {
        final task = await studio.api.request(
          '/projects/${widget.projectId}/shots/${widget.shotId}/${widget.firstFrame ? 'first-frame' : 'image'}',
          method: 'POST',
          body: {
            'revision': review.project.revision,
            'endpoint': review.config['endpoint'],
            'model': review.config['model'],
            if (widget.firstFrame) 'assetId': review.shot.selected?.assetId,
          },
        );
        if (mounted) setState(() => jobId = task['id']);
      }
      await studio.refresh();
    } catch (e) {
      if (mounted) setState(() => error = e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final studio = StudioScope.of(context), l = context.l;
    final review = reviewed;
    final firstFrame = widget.firstFrame;
    final selected = review?.project.asset(review.shot.selected?.assetId);
    final ready =
        review != null &&
        review.config['hasApiKey'] == true &&
        ['endpoint', 'model'].every(
          (key) => (review.config[key] as String? ?? '').trim().isNotEmpty,
        ) &&
        (!firstFrame || review.config['provider'] == 'ark');
    final refs = review == null
        ? const <String>[]
        : firstFrame
        ? [if (selected != null) selected.id]
        : shotReferenceIds(review.project, review.shot);
    final job = studio.jobs.where((j) => j.id == jobId).firstOrNull;
    final title = firstFrame ? l.firstFrameReview : l.imageReview;
    return Scaffold(
      appBar: AppBar(
        title: Text(firstFrame ? l.firstFrameTask : l.imageProvider),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(22, 14, 22, 32),
        children: [
          Text(
            jobId == null ? title : l.newTask,
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: 12),
          if (jobId == null) Text(l.generationSendNotice),
          if (review == null && error == null)
            const Center(child: CircularProgressIndicator()),
          if (review != null) ...[
            const SizedBox(height: 18),
            StudioCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${l.shot} ${review.shot.order.toString().padLeft(2, '0')} · ${review.shot.title}',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  if (ready) ...[
                    const SizedBox(height: 8),
                    Text('${review.config['model']}'),
                    Text(
                      '${review.config['endpoint']}',
                      style: const TextStyle(fontSize: 11),
                    ),
                  ],
                  if (firstFrame) ...[
                    const SizedBox(height: 10),
                    Text(
                      '${l.firstFrameAspect} · ${l.duration} ${firstFrameSeconds(review.shot)} s',
                      style: const TextStyle(fontSize: 12),
                    ),
                  ],
                  const Divider(height: 28),
                  Text(
                    l.generationImages,
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  const SizedBox(height: 8),
                  if (refs.isEmpty)
                    Text(l.generationNoReferences)
                  else
                    for (final id in refs)
                      _GenerationReference(
                        asset: review.project.asset(id),
                        firstFrame: firstFrame,
                      ),
                  const Divider(height: 28),
                  Text(
                    l.generationPrompt,
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  const SizedBox(height: 8),
                  SelectableText(generationPrompt(review.project, review.shot)),
                ],
              ),
            ),
            const SizedBox(height: 18),
            if (jobId == null && !ready) ...[
              Text(firstFrame ? l.configureFirstFrame : l.configureImage),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                icon: const Icon(Icons.tune),
                onPressed: () async {
                  await Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => Scaffold(
                        appBar: AppBar(title: Text(l.settings)),
                        body: const SettingsScreen(),
                      ),
                    ),
                  );
                  if (mounted) await _load();
                },
                label: Text(l.settings),
              ),
            ],
            if (jobId == null && ready)
              FilledButton.icon(
                icon: Icon(
                  firstFrame
                      ? Icons.movie_outlined
                      : Icons.auto_awesome_outlined,
                ),
                onPressed:
                    busy ||
                        (firstFrame
                            ? selected?.kind != 'image'
                            : review.shot.prompt.trim().isEmpty)
                    ? null
                    : _submit,
                label: Text(busy ? l.running : l.generationConfirm),
              ),
            if (jobId == null &&
                ready &&
                !firstFrame &&
                review.shot.prompt.trim().isEmpty)
              Text(l.imagePromptRequired),
            if (jobId != null) ...[
              if (job?.active ?? true) const LinearProgressIndicator(),
              if (job?.message.isNotEmpty == true)
                Text(errorText(context, job!.message)),
              if (job?.error != null) Text(errorText(context, job!.error!)),
              if (job?.remoteId != null)
                SelectableText('${l.remoteGenerationId} ${job!.remoteId}'),
              const SizedBox(height: 14),
              FilledButton(
                onPressed: () => Navigator.pop(context),
                child: Text(l.backToShot),
              ),
            ],
          ],
          if (error != null) ...[
            const SizedBox(height: 10),
            Text(
              errorText(context, error!),
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
            TextButton(
              onPressed: busy ? null : (jobId == null ? _load : _submit),
              child: Text(l.generationRefresh),
            ),
          ],
        ],
      ),
    );
  }
}

class _GenerationReference extends StatelessWidget {
  final MediaAsset? asset;
  final bool firstFrame;
  const _GenerationReference({required this.asset, required this.firstFrame});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: SizedBox(
              width: firstFrame ? 60 : 40,
              height: firstFrame ? 96 : 40,
              child: AssetPreview(
                asset,
                fit: firstFrame ? BoxFit.contain : BoxFit.cover,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(child: Text(asset?.name ?? context.l.imageReferenceInvalid)),
        ],
      ),
    );
  }
}
