import 'dart:io';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import '../data/studio.dart';
import '../data/models.dart';
import '../widgets/common.dart';
import 'shot.dart';
import 'tools.dart';
import 'package_transfer.dart';

class ProjectScreen extends StatelessWidget {
  final String id;
  const ProjectScreen({super.key, required this.id});
  @override
  Widget build(BuildContext context) {
    final studio = StudioScope.of(context),
        p = studio.project(id),
        l = context.l;
    if (p == null) return Scaffold(appBar: AppBar(), body: const SizedBox());
    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: Text(p.name),
          actions: [
            PopupMenuButton<String>(
              onSelected: (value) async {
                if (value == 'script') {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => ScriptScreen(id: id)),
                  );
                }
                if (value == 'assets') {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => AssetsScreen(id: id)),
                  );
                }
                if (value == 'copy') {
                  await perform(
                    context,
                    () => studio.action('/projects/$id/duplicate'),
                    success: l.saved,
                  );
                }
                if (value == 'delete' &&
                    context.mounted &&
                    await confirm(context, l.confirmDelete) &&
                    context.mounted) {
                  final ok = await perform(
                    context,
                    () => studio.action('/projects/$id', method: 'DELETE'),
                  );
                  if (ok && context.mounted) Navigator.pop(context);
                }
              },
              itemBuilder: (_) => [
                PopupMenuItem(value: 'script', child: Text(l.script)),
                PopupMenuItem(value: 'assets', child: Text(l.assets)),
                PopupMenuItem(value: 'copy', child: Text(l.copyProject)),
                PopupMenuItem(value: 'delete', child: Text(l.delete)),
              ],
            ),
          ],
          bottom: TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            tabs: [
              Tab(text: l.shots),
              Tab(text: l.characters),
              Tab(text: l.review),
              Tab(text: l.delivery),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _Shots(p),
            _Cast(p),
            _Review(p),
            DeliveryScreen(project: p),
          ],
        ),
        floatingActionButton: FloatingActionButton.small(
          tooltip: l.agent,
          onPressed: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => AgentScreen(id: id)),
          ),
          child: const Icon(Icons.auto_awesome_outlined),
        ),
      ),
    );
  }
}

class _Shots extends StatelessWidget {
  final Project p;
  const _Shots(this.p);
  @override
  Widget build(BuildContext context) {
    final l = context.l, studio = StudioScope.of(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(22, 16, 22, 100),
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                '${p.shots.length} ${l.shots} · ${timecode(p.duration)} · ${p.format}',
                style: const TextStyle(fontSize: 12),
              ),
            ),
            IconButton(
              tooltip: l.moveShots,
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => ReorderScreen(id: p.id)),
              ),
              icon: const Icon(Icons.reorder, size: 20),
            ),
            IconButton(
              tooltip: l.addShot,
              onPressed: () => perform(
                context,
                () => studio.action('/projects/${p.id}/shots'),
              ),
              icon: const Icon(Icons.add),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (p.shots.isEmpty)
          EmptyState(
            icon: Icons.auto_stories_outlined,
            title: l.noScript,
            description: l.localRules,
            action: FilledButton(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => ScriptScreen(id: p.id)),
              ),
              child: Text(l.script),
            ),
          ),
        ...p.shots.map(
          (shot) => Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Material(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) =>
                        ShotScreen(projectId: p.id, shotId: shot.id),
                  ),
                ),
                child: Row(
                  children: [
                    SizedBox(
                      width: 116,
                      height: 148,
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          AssetPreview(p.asset(shot.selected?.assetId)),
                          Positioned(
                            left: 10,
                            top: 10,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 7,
                                vertical: 3,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.black54,
                                borderRadius: BorderRadius.circular(5),
                              ),
                              child: Text(
                                '${shot.order}'.padLeft(2, '0'),
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 11,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              shot.title,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            const SizedBox(height: 8),
                            Text(
                              '${shot.type} · ${shot.duration}s',
                              style: const TextStyle(fontSize: 11),
                            ),
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                Icon(
                                  shot.review == 'approved'
                                      ? Icons.check_circle_outline
                                      : shot.review == 'changes'
                                      ? Icons.build_outlined
                                      : Icons.circle_outlined,
                                  size: 14,
                                  color: shot.review == 'changes'
                                      ? const Color(0xffb36940)
                                      : const Color(0xff66805f),
                                ),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: Text(
                                    shot.selected == null
                                        ? l.noMedia
                                        : 'V${shot.selected!.number}',
                                    style: const TextStyle(fontSize: 11),
                                  ),
                                ),
                                const Icon(Icons.chevron_right, size: 16),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class ReorderScreen extends StatefulWidget {
  final String id;
  const ReorderScreen({super.key, required this.id});
  @override
  State<ReorderScreen> createState() => _ReorderScreenState();
}

class _ReorderScreenState extends State<ReorderScreen> {
  List<String>? ids;
  int? revision;
  bool busy = false;
  @override
  Widget build(BuildContext context) {
    final studio = StudioScope.of(context),
        p = studio.project(widget.id)!,
        l = context.l;
    ids ??= p.shots.map((s) => s.id).toList();
    revision ??= p.revision;
    return Scaffold(
      appBar: AppBar(
        title: Text(l.moveShots),
        actions: [
          TextButton(
            onPressed: busy
                ? null
                : () async {
                    setState(() => busy = true);
                    final ok = await perform(
                      context,
                      () => studio.action(
                        '/projects/${p.id}/reorder',
                        body: {'shotIds': ids, 'revision': revision},
                      ),
                    );
                    if (context.mounted) {
                      setState(() => busy = false);
                      if (ok) Navigator.pop(context);
                    }
                  },
            child: Text(l.save),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(22),
            child: Text(l.reorderHelp),
          ),
          Expanded(
            child: ReorderableListView.builder(
              itemCount: ids!.length,
              onReorderItem: (from, to) => setState(() {
                ids!.insert(to, ids!.removeAt(from));
              }),
              itemBuilder: (context, index) {
                final shot = p.shots.firstWhere((s) => s.id == ids![index]);
                return ListTile(
                  key: ValueKey(shot.id),
                  leading: SizedBox(
                    width: 46,
                    height: 56,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: AssetPreview(p.asset(shot.selected?.assetId)),
                    ),
                  ),
                  title: Text(shot.title),
                  subtitle: Text('${shot.duration}s'),
                  trailing: ReorderableDragStartListener(
                    index: index,
                    child: const Icon(Icons.drag_handle),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class ScriptScreen extends StatefulWidget {
  final String id;
  const ScriptScreen({super.key, required this.id});
  @override
  State<ScriptScreen> createState() => _ScriptScreenState();
}

class _ScriptScreenState extends State<ScriptScreen> {
  TextEditingController? script;
  bool busy = false;
  @override
  void dispose() {
    script?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final studio = StudioScope.of(context),
        p = studio.project(widget.id)!,
        l = context.l;
    script ??= TextEditingController(text: p.script);
    return Scaffold(
      appBar: AppBar(title: Text(l.script)),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Text(l.scriptHint),
          const SizedBox(height: 24),
          field(l.script, script!, lines: 16),
          FilledButton(
            onPressed: busy
                ? null
                : () async {
                    setState(() => busy = true);
                    await perform(
                      context,
                      () => studio.action(
                        '/projects/${p.id}',
                        method: 'PATCH',
                        body: {'script': script!.text},
                      ),
                      success: l.saved,
                    );
                    if (mounted) setState(() => busy = false);
                  },
            child: Text(l.save),
          ),
          const SizedBox(height: 14),
          OutlinedButton(
            onPressed: busy
                ? null
                : () async {
                    setState(() => busy = true);
                    await perform(context, () async {
                      await studio.action(
                        '/projects/${p.id}',
                        method: 'PATCH',
                        body: {'script': script!.text},
                      );
                      await studio.action('/projects/${p.id}/storyboard');
                    }, success: l.saved);
                    if (mounted) setState(() => busy = false);
                  },
            child: Text(l.scriptDraft),
          ),
          const SizedBox(height: 14),
          Text(l.localRules),
        ],
      ),
    );
  }
}

class _Cast extends StatelessWidget {
  final Project p;
  const _Cast(this.p);
  @override
  Widget build(BuildContext context) {
    final l = context.l;
    return ListView(
      padding: const EdgeInsets.all(22),
      children: [
        Text(l.referenceHint),
        const SizedBox(height: 20),
        ...p.characters.map(
          (c) => Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: StudioCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      SizedBox(
                        width: 64,
                        height: 76,
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(10),
                          child: AssetPreview(p.asset(c['referenceId'])),
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Text(
                          c['name'],
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                      ),
                      IconButton(
                        tooltip: l.save,
                        onPressed: () => _edit(context, c),
                        icon: const Icon(Icons.edit_outlined),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Text(c['description'] ?? ''),
                  if (c['referenceId'] == null)
                    Text(
                      l.noReference,
                      style: const TextStyle(
                        color: Color(0xffa46e40),
                        fontSize: 11,
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
        OutlinedButton.icon(
          onPressed: () => _edit(context, null),
          icon: const Icon(Icons.person_add_outlined),
          label: Text(l.addCharacter),
        ),
      ],
    );
  }

  Future<void> _edit(BuildContext context, Json? character) async {
    final l = context.l,
        studio = StudioScope.of(context),
        name = TextEditingController(text: character?['name'] ?? ''),
        description = TextEditingController(
          text: character?['description'] ?? '',
        );
    String? reference = character?['referenceId'];
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(character == null ? l.addCharacter : l.characters),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              field(l.characterName, name),
              field(l.characterDescription, description, lines: 4),
              DropdownButtonFormField<String>(
                initialValue: reference,
                decoration: InputDecoration(labelText: l.reference),
                isExpanded: true,
                items: [
                  DropdownMenuItem<String>(
                    value: null,
                    child: Text(l.noReference),
                  ),
                  ...p.assets
                      .where((a) => a.kind == 'image')
                      .map(
                        (a) => DropdownMenuItem(
                          value: a.id,
                          child: Text(a.name, overflow: TextOverflow.ellipsis),
                        ),
                      ),
                ],
                onChanged: (v) => reference = v,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(l.cancel),
          ),
          FilledButton(
            onPressed: () async {
              if (name.text.trim().isEmpty) return;
              final ok = await perform(
                ctx,
                () => studio.action(
                  '/projects/${p.id}/characters${character == null ? '' : '/${character['id']}'}',
                  method: character == null ? 'POST' : 'PATCH',
                  body: {
                    'name': name.text,
                    'description': description.text,
                    'referenceId': reference,
                  },
                ),
              );
              if (ok && ctx.mounted) Navigator.pop(ctx);
            },
            child: Text(l.save),
          ),
        ],
      ),
    );
    name.dispose();
    description.dispose();
  }
}

class _Review extends StatelessWidget {
  final Project p;
  const _Review(this.p);
  @override
  Widget build(BuildContext context) {
    final studio = StudioScope.of(context),
        findings = studio.api.findings(p),
        l = context.l;
    return ListView(
      padding: const EdgeInsets.all(22),
      children: [
        Text(l.checks, style: Theme.of(context).textTheme.headlineMedium),
        const SizedBox(height: 12),
        Text(l.manualReview),
        const SizedBox(height: 24),
        if (findings.isEmpty)
          StudioCard(
            child: Row(
              children: [
                const Icon(
                  Icons.check_circle_outline,
                  color: Color(0xff285744),
                ),
                const SizedBox(width: 12),
                Expanded(child: Text(l.noFindings)),
              ],
            ),
          ),
        ...findings.map((f) {
          final shot = p.shots.firstWhere((s) => s.id == f['shotId']);
          final title = switch (f['code']) {
            'missingMedia' => l.missingMedia,
            'missingScene' => l.missingScene,
            'missingReference' => l.missingReference,
            _ => l.changes,
          };
          return Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: StudioCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${shot.order.toString().padLeft(2, '0')} · ${shot.title}',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  Text(title),
                  if (f['detail'] != null) Text(f['detail']),
                  TextButton.icon(
                    onPressed: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) =>
                            ShotScreen(projectId: p.id, shotId: shot.id),
                      ),
                    ),
                    icon: const Icon(Icons.arrow_forward, size: 16),
                    label: Text(l.openShot),
                  ),
                ],
              ),
            ),
          );
        }),
      ],
    );
  }
}

Future<void> importMedia(BuildContext context, String projectId) async {
  final studio = StudioScope.of(context);
  await perform(context, () async {
    final result = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: [
        'png',
        'jpg',
        'jpeg',
        'webp',
        'mp4',
        'mp3',
        'wav',
        'm4a',
        'srt',
        'txt',
      ],
    );
    if (result.isEmpty) return;
    final file = result.single;
    if ((await file.length() ?? 0) > 200 * 1024 * 1024) {
      throw StateError('unsupportedFile');
    }
    final bytes = await file.readAsBytes();
    await studio.api.upload(projectId, file.name, bytes);
    await studio.refresh();
  });
}

class AssetsScreen extends StatelessWidget {
  final String id;
  const AssetsScreen({super.key, required this.id});
  @override
  Widget build(BuildContext context) {
    final p = StudioScope.of(context).project(id)!, l = context.l;
    return Scaffold(
      appBar: AppBar(
        title: Text(l.assets),
        actions: [
          IconButton(
            tooltip: l.importAssets,
            onPressed: () => importMedia(context, id),
            icon: const Icon(Icons.add),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(22),
        children: [
          OutlinedButton.icon(
            onPressed: () => importMedia(context, id),
            icon: const Icon(Icons.upload_file_outlined),
            label: Text(l.importAssets),
          ),
          const SizedBox(height: 20),
          ...p.assets.map(
            (a) => ListTile(
              contentPadding: const EdgeInsets.symmetric(vertical: 6),
              leading: SizedBox(
                width: 54,
                height: 64,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: AssetPreview(a),
                ),
              ),
              title: Text(a.name, maxLines: 2, overflow: TextOverflow.ellipsis),
              subtitle: Text(
                '${a.kind} · ${(a.size / 1024 / 1024).toStringAsFixed(1)} MB',
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class DeliveryScreen extends StatelessWidget {
  final Project project;
  const DeliveryScreen({super.key, required this.project});
  @override
  Widget build(BuildContext context) {
    final p = project, studio = StudioScope.of(context), l = context.l;
    final active = studio.jobs.any(
      (j) => j.projectId == p.id && j.type == 'export' && j.active,
    );
    return ListView(
      padding: const EdgeInsets.fromLTRB(22, 22, 22, 110),
      children: [
        Text(l.delivery, style: Theme.of(context).textTheme.headlineMedium),
        const SizedBox(height: 12),
        Text(l.exportHelp),
        const SizedBox(height: 20),
        StudioCard(
          child: Column(
            children: [
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(l.burnSubtitles),
                value: p.burnSubtitles,
                onChanged: (v) => perform(
                  context,
                  () => studio.action(
                    '/projects/${p.id}',
                    method: 'PATCH',
                    body: {'burnSubtitles': v},
                  ),
                ),
              ),
              DropdownButtonFormField<String>(
                initialValue: p.musicAssetId,
                isExpanded: true,
                decoration: InputDecoration(labelText: l.backgroundMusic),
                items: [
                  DropdownMenuItem<String>(value: null, child: Text(l.noMusic)),
                  ...p.assets
                      .where((a) => a.kind == 'audio')
                      .map(
                        (a) => DropdownMenuItem(
                          value: a.id,
                          child: Text(a.name, overflow: TextOverflow.ellipsis),
                        ),
                      ),
                ],
                onChanged: (v) => perform(
                  context,
                  () => studio.action(
                    '/projects/${p.id}',
                    method: 'PATCH',
                    body: {'musicAssetId': v},
                  ),
                ),
              ),
              const SizedBox(height: 18),
              Text(l.subtitleTiming, style: const TextStyle(fontSize: 11)),
            ],
          ),
        ),
        const SizedBox(height: 22),
        FilledButton.icon(
          onPressed: active
              ? null
              : () => perform(
                  context,
                  () => studio.action('/projects/${p.id}/render'),
                  success: l.newTask,
                ),
          icon: Icon(
            active ? Icons.hourglass_top : Icons.file_download_outlined,
          ),
          label: Text(active ? l.running : l.render),
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: () => Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => PackageTransferScreen(projectId: p.id),
            ),
          ),
          icon: const Icon(Icons.inventory_2_outlined),
          label: Text(l.archive),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: () => _text(context, 'subtitles', 'srt'),
                child: Text(l.subtitles),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton(
                onPressed: () => _text(context, 'storyboard.csv', 'csv'),
                child: Text(l.storyboardCsv),
              ),
            ),
          ],
        ),
        SectionHeading(l.exportHistory),
        if (p.exports.isEmpty) Text(l.noExports),
        ...p.exports.reversed.map(
          (e) => ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(
              e['kind'] == 'video'
                  ? Icons.movie_outlined
                  : Icons.folder_zip_outlined,
            ),
            title: Text(e['name']),
            subtitle: Text('R${e['revision']}'),
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (e['subtitlesUrl'] != null)
                  IconButton(
                    tooltip: '${l.subtitles} · R${e['revision']}',
                    onPressed: () => perform(context, () async {
                      await SharePlus.instance.share(
                        ShareParams(
                          files: [XFile(e['subtitlesUrl'])],
                          sharePositionOrigin: _shareRect(context),
                        ),
                      );
                    }),
                    icon: const Icon(Icons.subtitles_outlined),
                  ),
                IconButton(
                  tooltip: l.downloadShare,
                  onPressed: () => perform(context, () async {
                    await SharePlus.instance.share(
                      ShareParams(
                        files: [XFile(e['url'])],
                        sharePositionOrigin: _shareRect(context),
                      ),
                    );
                  }),
                  icon: const Icon(Icons.ios_share),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 18),
        Text(l.keepOpen, style: const TextStyle(fontSize: 11)),
      ],
    );
  }

  Future<void> _text(
    BuildContext context,
    String route,
    String extension,
  ) async {
    final studio = StudioScope.of(context);
    final shareRect = _shareRect(context);
    await perform(context, () async {
      final text = await studio.api.request('/projects/${project.id}/$route');
      final file = File(studio.api.path('exports/${project.id}.$extension'));
      await file.writeAsString(text);
      await SharePlus.instance.share(
        ShareParams(files: [XFile(file.path)], sharePositionOrigin: shareRect),
      );
    });
  }

  Rect _shareRect(BuildContext context) {
    final box = context.findRenderObject() as RenderBox?;
    return box == null
        ? const Rect.fromLTWH(0, 0, 1, 1)
        : box.localToGlobal(Offset.zero) & box.size;
  }
}

class AgentScreen extends StatefulWidget {
  final String id;
  const AgentScreen({super.key, required this.id});
  @override
  State<AgentScreen> createState() => _AgentScreenState();
}

class _AgentScreenState extends State<AgentScreen> {
  final input = TextEditingController();
  String skill = 'story-director';
  bool busy = false;
  @override
  void dispose() {
    input.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final studio = StudioScope.of(context),
        p = studio.project(widget.id)!,
        l = context.l;
    return Scaffold(
      appBar: AppBar(title: Text(l.agent)),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(22, 12, 22, 16),
            child: Column(
              children: [
                Text(l.agentHint),
                const SizedBox(height: 14),
                DropdownButtonFormField<String>(
                  initialValue: skill,
                  isExpanded: true,
                  decoration: InputDecoration(labelText: l.selectSkill),
                  items: studio.skills
                      .map(
                        (s) => DropdownMenuItem(
                          value: s['name'] as String,
                          child: Text(
                            '${s['name']}',
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      )
                      .toList(),
                  onChanged: (v) => skill = v!,
                ),
              ],
            ),
          ),
          ApprovalCards(projectId: p.id),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 22),
              children: p.messages
                  .map(
                    (m) => Padding(
                      padding: const EdgeInsets.only(bottom: 16),
                      child: Align(
                        alignment: m['role'] == 'user'
                            ? Alignment.centerRight
                            : Alignment.centerLeft,
                        child: Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: m['role'] == 'user'
                                ? const Color(0xffe3eddf)
                                : Colors.white,
                            borderRadius: BorderRadius.circular(16),
                          ),
                          child: SelectableText(m['text']),
                        ),
                      ),
                    ),
                  )
                  .toList(),
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: TextField(
                      controller: input,
                      minLines: 1,
                      maxLines: 4,
                      decoration: InputDecoration(hintText: l.message),
                    ),
                  ),
                  const SizedBox(width: 10),
                  IconButton.filled(
                    tooltip: l.send,
                    onPressed: busy
                        ? null
                        : () async {
                            setState(() => busy = true);
                            final ok = await perform(
                              context,
                              () => studio.action(
                                '/projects/${p.id}/chat',
                                body: {'text': input.text, 'skill': skill},
                              ),
                            );
                            if (ok) input.clear();
                            if (mounted) setState(() => busy = false);
                          },
                    icon: busy
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.arrow_upward),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
