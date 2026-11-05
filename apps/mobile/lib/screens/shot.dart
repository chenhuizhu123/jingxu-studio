import 'package:flutter/material.dart';
import '../data/studio.dart';
import '../data/models.dart';
import '../widgets/common.dart';
import 'project.dart';
import 'voiceover.dart';
import 'captions.dart';
import 'shot_generation.dart';
import '../widgets/audio_preview.dart';

class ShotScreen extends StatefulWidget {
  final String projectId, shotId;
  const ShotScreen({super.key, required this.projectId, required this.shotId});
  @override
  State<ShotScreen> createState() => _ShotScreenState();
}

class _ShotScreenState extends State<ShotScreen> {
  final title = TextEditingController(),
      scene = TextEditingController(),
      duration = TextEditingController(),
      trim = TextEditingController(),
      dialogue = TextEditingController(),
      prompt = TextEditingController(),
      note = TextEditingController();
  bool loaded = false, busy = false, dirty = false;
  String review = 'pending';
  String? audio;
  List<String> cast = [], references = [];
  @override
  void dispose() {
    for (final c in [title, scene, duration, trim, dialogue, prompt, note]) {
      c.dispose();
    }
    super.dispose();
  }

  void _load(Shot shot) {
    title.text = shot.title;
    scene.text = shot.scene;
    duration.text = '${shot.duration}';
    trim.text = '${shot.trimStart}';
    dialogue.text = shot.dialogue;
    prompt.text = shot.prompt;
    note.text = shot.note;
    review = shot.review;
    audio = shot.audioAssetId;
    cast = [...shot.characterIds];
    references = [...shot.referenceIds];
    loaded = true;
    for (final c in [title, scene, duration, trim, dialogue, prompt, note]) {
      c.addListener(() {
        if (mounted) setState(() => dirty = true);
      });
    }
  }

  Future<bool> _save(Studio studio, Project p) async {
    final d = double.tryParse(duration.text), t = double.tryParse(trim.text);
    if (d == null ||
        d < 2 ||
        d > 30 ||
        !d.isFinite ||
        t == null ||
        t < 0 ||
        !t.isFinite) {
      await perform(context, () async {
        throw StateError('invalidDuration');
      });
      return false;
    }
    final ok = await perform(
      context,
      () => studio.action(
        '/projects/${p.id}/shots/${widget.shotId}',
        method: 'PATCH',
        body: {
          'title': title.text,
          'scene': scene.text,
          'duration': d,
          'trimStart': t,
          'dialogue': dialogue.text,
          'prompt': prompt.text,
          'note': note.text,
          'characterIds': cast,
          'referenceIds': references,
          'audioAssetId': audio,
          if (review != p.shots.firstWhere((s) => s.id == widget.shotId).review)
            'review': review,
          'revision': p.revision,
        },
      ),
    );
    if (ok && mounted) setState(() => dirty = false);
    return ok;
  }

  @override
  Widget build(BuildContext context) {
    final studio = StudioScope.of(context),
        p = studio.project(widget.projectId)!,
        l = context.l;
    final shot = p.shots.where((s) => s.id == widget.shotId).firstOrNull;
    if (shot == null) return Scaffold(appBar: AppBar());
    if (!loaded) _load(shot);
    final active = studio.jobs.any(
      (j) =>
          j.projectId == p.id &&
          j.shotId == shot.id &&
          j.active &&
          ['generate', 'first-frame'].contains(j.type),
    );
    final imageActive = studio.jobs.any(
      (j) =>
          j.projectId == p.id &&
          j.shotId == shot.id &&
          j.active &&
          j.type == 'image',
    );
    final selectedImage = p.asset(shot.selected?.assetId)?.kind == 'image';
    return PopScope(
      canPop: !dirty,
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop) return;
        final leave = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            content: Text(l.saveFirst),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: Text(l.cancel),
              ),
              FilledButton(
                onPressed: () async {
                  final saved = await _save(studio, p);
                  if (saved && ctx.mounted) Navigator.pop(ctx, true);
                },
                child: Text(l.save),
              ),
            ],
          ),
        );
        if (leave == true && context.mounted) {
          setState(() => dirty = false);
          Navigator.pop(context);
        }
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text('${l.shot} ${shot.order.toString().padLeft(2, '0')}'),
          actions: [
            TextButton(
              onPressed: busy
                  ? null
                  : () async {
                      setState(() => busy = true);
                      await _save(studio, p);
                      if (mounted) setState(() => busy = false);
                    },
              child: Text(dirty ? l.save : l.saved),
            ),
          ],
        ),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(22, 8, 22, 120),
          children: [
            Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(
                  maxHeight: 380,
                  maxWidth: 520,
                ),
                child: AspectRatio(
                  aspectRatio: p.format == '9:16'
                      ? 9 / 16
                      : p.format == '1:1'
                      ? 1
                      : 16 / 9,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(18),
                    child: AssetPreview(
                      p.asset(shot.selected?.assetId),
                      playable: true,
                      fit: BoxFit.contain,
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
            if (shot.selected?.source == 'demo')
              Text(
                l.demoHint,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 10),
              ),
            SectionHeading(
              l.versions,
              trailing: shot.versions.length > 1
                  ? TextButton(
                      onPressed: () => _compare(p, shot),
                      child: Text(l.compare),
                    )
                  : null,
            ),
            if (shot.versions.isEmpty)
              Text(l.noMedia)
            else
              SizedBox(
                height: 146,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: shot.versions.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 10),
                  itemBuilder: (context, index) {
                    final version = shot.versions[index],
                        selected = version.id == shot.selectedVersionId;
                    return GestureDetector(
                      onTap: busy || dirty
                          ? () => perform(context, () async {
                              throw StateError('saveFirst');
                            })
                          : () async {
                              await perform(
                                context,
                                () => studio.action(
                                  '/projects/${p.id}/shots/${shot.id}',
                                  method: 'PATCH',
                                  body: {
                                    'selectedVersionId': version.id,
                                    'revision': p.revision,
                                  },
                                ),
                              );
                            },
                      child: Container(
                        width: 96,
                        decoration: BoxDecoration(
                          border: Border.all(
                            color: selected
                                ? const Color(0xff285744)
                                : const Color(0xffdfe4da),
                            width: selected ? 2 : 1,
                          ),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        clipBehavior: Clip.antiAlias,
                        child: Column(
                          children: [
                            Expanded(
                              child: AssetPreview(p.asset(version.assetId)),
                            ),
                            Padding(
                              padding: const EdgeInsets.all(7),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Text(
                                    'V${version.number}',
                                    style: const TextStyle(fontSize: 11),
                                  ),
                                  if (selected) ...[
                                    const SizedBox(width: 8),
                                    const Icon(
                                      Icons.check_circle,
                                      size: 13,
                                      color: Color(0xff285744),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),
            const SizedBox(height: 10),
            Text(l.newVersionHint, style: const TextStyle(fontSize: 11)),
            Wrap(
              spacing: 10,
              children: [
                TextButton.icon(
                  onPressed: () => _import(p, shot),
                  icon: const Icon(
                    Icons.add_photo_alternate_outlined,
                    size: 18,
                  ),
                  label: Text(l.pickMedia),
                ),
                TextButton.icon(
                  onPressed: () => importMedia(context, p.id),
                  icon: const Icon(Icons.upload_file_outlined, size: 18),
                  label: Text(l.importAssets),
                ),
              ],
            ),
            StudioCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    l.shotGeneration,
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 8,
                    children: [
                      OutlinedButton.icon(
                        icon: const Icon(Icons.auto_awesome_outlined, size: 16),
                        onPressed: busy || imageActive
                            ? null
                            : () => _openGeneration(studio, p, shot),
                        label: Text(imageActive ? l.running : l.generateImage),
                      ),
                      if (selectedImage)
                        TextButton.icon(
                          icon: const Icon(Icons.movie_outlined, size: 16),
                          onPressed: busy || active
                              ? null
                              : () => _openGeneration(
                                  studio,
                                  p,
                                  shot,
                                  firstFrame: true,
                                ),
                          label: Text(l.animateImage),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            SectionHeading(l.story),
            field(l.shotTitle, title),
            field(l.scene, scene),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: field(
                    l.duration,
                    duration,
                    keyboard: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: field(
                    l.trimStart,
                    trim,
                    keyboard: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                  ),
                ),
              ],
            ),
            field(l.dialogue, dialogue, lines: 3),
            field(l.prompt, prompt, lines: 5),
            if (p.characters.isNotEmpty) ...[
              SectionHeading(l.characters),
              Wrap(
                spacing: 8,
                children: p.characters
                    .map(
                      (c) => FilterChip(
                        label: Text(c['name']),
                        selected: cast.contains(c['id']),
                        onSelected: (on) => setState(() {
                          dirty = true;
                          on ? cast.add(c['id']) : cast.remove(c['id']);
                        }),
                      ),
                    )
                    .toList(),
              ),
            ],
            SectionHeading(l.reference),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: p.assets
                  .where((a) => a.kind == 'image')
                  .map(
                    (a) => FilterChip(
                      label: Text(
                        a.name.length > 24
                            ? '${a.name.substring(0, 24)}…'
                            : a.name,
                      ),
                      selected: references.contains(a.id),
                      onSelected: (on) => setState(() {
                        dirty = true;
                        on ? references.add(a.id) : references.remove(a.id);
                      }),
                    ),
                  )
                  .toList(),
            ),
            const SizedBox(height: 12),
            Text(l.referenceHint, style: const TextStyle(fontSize: 11)),
            OutlinedButton.icon(
              onPressed: busy
                  ? null
                  : () async {
                      setState(() => busy = true);
                      try {
                        if ((!dirty || await _save(studio, p)) &&
                            context.mounted) {
                          await Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => CaptionsScreen(
                                projectId: p.id,
                                shotId: shot.id,
                              ),
                            ),
                          );
                          if (context.mounted) {
                            await perform(context, () => studio.refresh());
                          }
                        }
                      } finally {
                        if (mounted) setState(() => busy = false);
                      }
                    },
              icon: const Icon(Icons.closed_caption_outlined),
              label: Text(l.captionsTitle),
            ),
            SectionHeading(l.voiceover),
            DropdownButtonFormField<String>(
              key: ValueKey('audio-$audio'),
              initialValue: audio,
              isExpanded: true,
              items: [
                DropdownMenuItem<String>(
                  value: null,
                  child: Text(l.sourceAudio),
                ),
                ...p.assets
                    .where((a) => a.kind == 'audio')
                    .map(
                      (a) => DropdownMenuItem(
                        value: a.id,
                        child: Text(a.name, overflow: TextOverflow.ellipsis),
                      ),
                    ),
              ],
              onChanged: (v) => setState(() {
                audio = v;
                dirty = true;
              }),
            ),
            if (audio != null && p.assets.any((a) => a.id == audio))
              LocalAudioPreview(
                key: ValueKey(audio),
                filename: p.assets.firstWhere((a) => a.id == audio).url,
                shotDuration: double.tryParse(duration.text) ?? shot.duration,
              ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: busy
                  ? null
                  : () async {
                      setState(() => busy = true);
                      try {
                        if ((!dirty || await _save(studio, p)) &&
                            context.mounted) {
                          await Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => VoiceoverScreen(
                                projectId: p.id,
                                shotId: shot.id,
                              ),
                            ),
                          );
                          if (context.mounted) {
                            await perform(context, () => studio.refresh());
                          }
                        }
                      } finally {
                        if (mounted) setState(() => busy = false);
                      }
                    },
              icon: const Icon(Icons.graphic_eq_rounded, size: 18),
              label: Text(l.speechGenerate),
            ),
            SectionHeading(l.review),
            DropdownButtonFormField<String>(
              initialValue: review,
              items: [
                DropdownMenuItem(value: 'pending', child: Text(l.pending)),
                DropdownMenuItem(value: 'approved', child: Text(l.approved)),
                DropdownMenuItem(value: 'changes', child: Text(l.changes)),
              ],
              onChanged: (v) => setState(() {
                review = v!;
                dirty = true;
              }),
            ),
            const SizedBox(height: 20),
            field(l.repairNote, note, lines: 3),
            if (shot.visualReview != null)
              StudioCard(child: SelectableText(shot.visualReview!['text'])),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: busy
                  ? null
                  : () async {
                      setState(() => busy = true);
                      if (await _save(studio, p) && context.mounted) {
                        await perform(
                          context,
                          () => studio.action(
                            '/projects/${p.id}/shots/${shot.id}/visual-review',
                          ),
                          success: l.saved,
                        );
                      }
                      if (mounted) setState(() => busy = false);
                    },
              icon: const Icon(Icons.visibility_outlined, size: 18),
              label: Text(l.visualReview),
            ),
            const SizedBox(height: 10),
            Text(l.visualReviewHelp, style: const TextStyle(fontSize: 11)),
            const SizedBox(height: 24),
            TextButton.icon(
              onPressed: busy
                  ? null
                  : () async {
                      if (await confirm(context, l.confirmDeleteShot) &&
                          context.mounted) {
                        final ok = await perform(
                          context,
                          () => studio.action(
                            '/projects/${p.id}/shots/${shot.id}',
                            method: 'DELETE',
                          ),
                        );
                        if (ok && context.mounted) {
                          setState(() => dirty = false);
                          Navigator.pop(context);
                        }
                      }
                    },
              icon: const Icon(Icons.delete_outline),
              label: Text(l.deleteShot),
            ),
          ],
        ),
        bottomNavigationBar: SafeArea(
          top: false,
          child: Container(
            padding: const EdgeInsets.fromLTRB(22, 12, 22, 12),
            decoration: const BoxDecoration(
              color: Colors.white,
              border: Border(top: BorderSide(color: Color(0xffe5e7de))),
            ),
            child: FilledButton.icon(
              onPressed: busy || active
                  ? null
                  : () async {
                      setState(() => busy = true);
                      if (await _save(studio, p) && context.mounted) {
                        await perform(
                          context,
                          () => studio.action(
                            '/projects/${p.id}/generate',
                            body: {
                              'shotIds': [shot.id],
                            },
                          ),
                          success: l.newTask,
                        );
                      }
                      if (mounted) setState(() => busy = false);
                    },
              icon: Icon(
                active ? Icons.hourglass_top : Icons.auto_awesome_outlined,
              ),
              label: Text(active ? l.running : l.generate),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _openGeneration(
    Studio studio,
    Project project,
    Shot shot, {
    bool firstFrame = false,
  }) async {
    setState(() => busy = true);
    try {
      if ((!dirty || await _save(studio, project)) && mounted) {
        await Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => ShotGenerationScreen(
              projectId: project.id,
              shotId: shot.id,
              firstFrame: firstFrame,
            ),
          ),
        );
        if (mounted) await perform(context, studio.refresh);
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _import(Project p, Shot shot) async {
    final l = context.l, studio = StudioScope.of(context);
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: DraggableScrollableSheet(
          expand: false,
          initialChildSize: .65,
          builder: (ctx, scroll) => ListView(
            controller: scroll,
            padding: const EdgeInsets.all(22),
            children: [
              Text(
                l.importToShot,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 20),
              ...p.assets
                  .where((a) => ['image', 'video'].contains(a.kind))
                  .map(
                    (a) => ListTile(
                      leading: SizedBox(
                        width: 44,
                        height: 54,
                        child: AssetPreview(a),
                      ),
                      title: Text(a.name),
                      onTap: () async {
                        final ok = await perform(
                          ctx,
                          () => studio.action(
                            '/projects/${p.id}/shots/${shot.id}/import',
                            body: {'assetId': a.id},
                          ),
                        );
                        if (ok && ctx.mounted) Navigator.pop(ctx);
                      },
                    ),
                  ),
              if (p.assets.isEmpty) Text(l.noMedia),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _compare(Project p, Shot shot) async {
    final versions = shot.versions;
    String left = shot.selectedVersionId ?? versions.first.id,
        right = versions.last.id;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, set) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(ctx.l.compare, style: Theme.of(ctx).textTheme.titleLarge),
                const SizedBox(height: 18),
                Row(
                  children: [
                    for (final isLeft in [true, false])
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.all(5),
                          child: Column(
                            children: [
                              DropdownButton<String>(
                                value: isLeft ? left : right,
                                isExpanded: true,
                                items: versions
                                    .map(
                                      (v) => DropdownMenuItem(
                                        value: v.id,
                                        child: Text('V${v.number}'),
                                      ),
                                    )
                                    .toList(),
                                onChanged: (v) => set(() {
                                  isLeft ? left = v! : right = v!;
                                }),
                              ),
                              AspectRatio(
                                aspectRatio: 9 / 16,
                                child: AssetPreview(
                                  p.asset(
                                    versions
                                        .firstWhere(
                                          (v) =>
                                              v.id == (isLeft ? left : right),
                                        )
                                        .assetId,
                                  ),
                                  playable: true,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 14),
                Text(
                  ctx.l.newVersionHint,
                  style: const TextStyle(fontSize: 11),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
