import 'package:flutter/material.dart';
import '../data/studio.dart';
import '../data/models.dart';
import '../widgets/common.dart';
import 'project.dart';
import 'settings.dart';
import 'package_transfer.dart';

class StudioHome extends StatefulWidget {
  const StudioHome({super.key});
  @override
  State<StudioHome> createState() => _StudioHomeState();
}

class _StudioHomeState extends State<StudioHome> {
  int tab = 0;
  @override
  Widget build(BuildContext context) {
    final studio = StudioScope.of(context), l = context.l;
    if (!studio.ready) {
      return Scaffold(
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const CircularProgressIndicator(),
              const SizedBox(height: 20),
              Text(l.loading),
            ],
          ),
        ),
      );
    }
    if (studio.error != null && studio.projects.isEmpty) {
      return Scaffold(
        body: EmptyState(
          icon: Icons.error_outline,
          title: l.error,
          description: errorText(context, studio.error!),
          action: FilledButton(
            onPressed: () => perform(context, studio.refresh),
            child: Text(l.tryAgain),
          ),
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(9),
              decoration: BoxDecoration(
                color: const Color(0xff285744),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(
                Icons.movie_creation_outlined,
                color: Colors.white,
                size: 22,
              ),
            ),
            const SizedBox(width: 12),
            Text(
              l.appName,
              style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w600),
            ),
          ],
        ),
        actions: [
          if (tab == 0)
            IconButton(
              tooltip: l.importProjectPackage,
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => const PackageTransferScreen(),
                ),
              ),
              icon: const Icon(Icons.drive_folder_upload_outlined),
            ),
          if (tab == 0)
            IconButton(
              tooltip: l.refresh,
              onPressed: () => perform(context, studio.refresh),
              icon: const Icon(Icons.refresh),
            ),
        ],
      ),
      body: IndexedStack(
        index: tab,
        children: [
          _projects(studio),
          const TasksScreen(),
          const SettingsScreen(),
        ],
      ),
      floatingActionButton: tab == 0
          ? FloatingActionButton.extended(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const CreateProjectScreen()),
              ),
              icon: const Icon(Icons.add),
              label: Text(l.create),
            )
          : null,
      bottomNavigationBar: NavigationBar(
        selectedIndex: tab,
        onDestinationSelected: (index) => setState(() => tab = index),
        destinations: [
          NavigationDestination(
            icon: const Icon(Icons.grid_view_outlined),
            selectedIcon: const Icon(Icons.grid_view_rounded),
            label: l.projects,
          ),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: studio.jobs.any((j) => j.active),
              child: const Icon(Icons.layers_outlined),
            ),
            label: l.tasks,
          ),
          NavigationDestination(
            icon: const Icon(Icons.tune),
            label: l.settings,
          ),
        ],
      ),
    );
  }

  Widget _projects(Studio studio) {
    final l = context.l;
    return RefreshIndicator(
      onRefresh: studio.refresh,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(22, 22, 22, 110),
        children: [
          Text(
            l.production,
            style: const TextStyle(
              fontSize: 10,
              letterSpacing: 2.5,
              color: Color(0xff6a806d),
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 10),
          Text(l.tagline, style: Theme.of(context).textTheme.headlineLarge),
          const SizedBox(height: 12),
          Text(l.localFirstHint),
          const SizedBox(height: 26),
          if (studio.projects.isEmpty)
            EmptyState(
              icon: Icons.auto_stories_outlined,
              title: l.noProjects,
              description: l.noProjectsHint,
              action: FilledButton.tonalIcon(
                onPressed: () => perform(context, () async {
                  await studio.api.seedDemo();
                  await studio.refresh();
                }),
                icon: const Icon(Icons.play_arrow_outlined),
                label: Text(l.openDemo),
              ),
            )
          else ...[
            Row(
              children: [
                Text(
                  l.projects,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(width: 8),
                Text('${studio.projects.length}'),
              ],
            ),
            const SizedBox(height: 16),
            ...studio.projects.map(
              (p) => Padding(
                padding: const EdgeInsets.only(bottom: 20),
                child: Material(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(20),
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => ProjectScreen(id: p.id),
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(
                          height: 178,
                          width: double.infinity,
                          child: Stack(
                            fit: StackFit.expand,
                            children: [
                              AssetPreview(
                                p.assets
                                    .where((a) => a.kind == 'image')
                                    .firstOrNull,
                              ),
                              const DecoratedBox(
                                decoration: BoxDecoration(
                                  gradient: LinearGradient(
                                    begin: Alignment.topCenter,
                                    end: Alignment.bottomCenter,
                                    colors: [
                                      Colors.transparent,
                                      Color(0xb31b332a),
                                    ],
                                  ),
                                ),
                              ),
                              Positioned(
                                left: 18,
                                bottom: 16,
                                child: Text(
                                  p.format,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 12,
                                    letterSpacing: 2,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.all(18),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                p.name,
                                style: Theme.of(context).textTheme.titleLarge,
                              ),
                              const SizedBox(height: 6),
                              Text(
                                p.description,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 16),
                              Row(
                                children: [
                                  const Icon(
                                    Icons.movie_outlined,
                                    size: 14,
                                    color: Color(0xff647463),
                                  ),
                                  const SizedBox(width: 6),
                                  Text(
                                    '${p.shots.length} ${l.shots} · ${timecode(p.duration)}',
                                  ),
                                  const Spacer(),
                                  const Icon(
                                    Icons.arrow_forward,
                                    size: 18,
                                    color: Color(0xff285744),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
          const SizedBox(height: 14),
          Row(
            children: [
              const Icon(
                Icons.shield_outlined,
                size: 14,
                color: Color(0xff6b806b),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(l.onDevice, style: const TextStyle(fontSize: 11)),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class CreateProjectScreen extends StatefulWidget {
  const CreateProjectScreen({super.key});
  @override
  State<CreateProjectScreen> createState() => _CreateProjectScreenState();
}

class _CreateProjectScreenState extends State<CreateProjectScreen> {
  final name = TextEditingController(),
      brief = TextEditingController(),
      script = TextEditingController();
  String format = '9:16', style = 'Cinematic';
  bool busy = false;
  @override
  void dispose() {
    name.dispose();
    brief.dispose();
    script.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l, studio = StudioScope.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l.newProject)),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Text(l.tagline, style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: 12),
          Text(l.scriptHint),
          const SizedBox(height: 28),
          field(l.projectName, name),
          field(l.description, brief, lines: 2),
          field(l.script, script, lines: 8),
          DropdownButtonFormField<String>(
            initialValue: format,
            decoration: InputDecoration(labelText: l.format),
            items: [
              '9:16',
              '16:9',
              '1:1',
            ].map((s) => DropdownMenuItem(value: s, child: Text(s))).toList(),
            onChanged: (v) => format = v!,
          ),
          const SizedBox(height: 18),
          DropdownButtonFormField<String>(
            initialValue: style,
            decoration: InputDecoration(labelText: l.style),
            items: [
              DropdownMenuItem(value: 'Cinematic', child: Text(l.cinematic)),
              DropdownMenuItem(value: 'Animation', child: Text(l.animation)),
              DropdownMenuItem(value: 'Product ad', child: Text(l.ad)),
            ],
            onChanged: (v) => style = v!,
          ),
          const SizedBox(height: 26),
          FilledButton.icon(
            onPressed: busy
                ? null
                : () async {
                    setState(() => busy = true);
                    String? id;
                    final ok = await perform(context, () async {
                      final p = await studio.api.request(
                        '/projects',
                        method: 'POST',
                        body: {
                          'name': name.text,
                          'description': brief.text,
                          'script': script.text,
                          'format': format,
                          'style': style,
                        },
                      );
                      id = p['id'];
                      await studio.refresh();
                    });
                    if (context.mounted) {
                      setState(() => busy = false);
                      if (ok) {
                        Navigator.pushReplacement(
                          context,
                          MaterialPageRoute(
                            builder: (_) => ProjectScreen(id: id!),
                          ),
                        );
                      }
                    }
                  },
            icon: busy
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.arrow_forward),
            label: Text(l.create),
          ),
          const SizedBox(height: 16),
          Text(l.localRules, style: const TextStyle(fontSize: 11)),
        ],
      ),
    );
  }
}

class TasksScreen extends StatelessWidget {
  const TasksScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final studio = StudioScope.of(context), l = context.l;
    return ListView(
      padding: const EdgeInsets.all(22),
      children: [
        Text(l.tasks, style: Theme.of(context).textTheme.headlineMedium),
        const SizedBox(height: 12),
        Text(l.keepOpen),
        const SizedBox(height: 22),
        if (studio.jobs.isEmpty)
          EmptyState(
            icon: Icons.layers_outlined,
            title: l.noTasks,
            description: l.noTasksHint,
          ),
        ...studio.jobs.map(
          (job) => Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: StudioCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        job.type == 'export'
                            ? Icons.file_download_outlined
                            : job.type == 'speech'
                            ? Icons.graphic_eq_rounded
                            : Icons.auto_awesome_outlined,
                        size: 20,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          studio.project(job.projectId)?.name ?? l.projects,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                      ),
                      Text(
                        _status(context, job.state),
                        style: TextStyle(
                          color: job.state == 'failed'
                              ? const Color(0xffa24a3b)
                              : const Color(0xff446748),
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  if (job.active)
                    LinearProgressIndicator(
                      value: job.progress > 0 ? job.progress : null,
                      borderRadius: BorderRadius.circular(3),
                    ),
                  if (job.type == 'speech') Text(l.speechTitle),
                  if (job.type == 'image') Text(l.imageProvider),
                  if (job.type == 'first-frame') Text(l.firstFrameTask),
                  if (['image', 'first-frame'].contains(job.type) &&
                      ['failed', 'cancelled'].contains(job.state))
                    Text(l.generationReviewAgain),
                  if (job.type == 'first-frame' && job.remoteId != null)
                    SelectableText('${l.remoteGenerationId} ${job.remoteId}'),
                  if (job.type == 'speech' &&
                      ['failed', 'cancelled'].contains(job.state))
                    Text(l.speechRetryNotice),
                  if (job.error != null) Text(errorText(context, job.error!)),
                  if (job.message.isNotEmpty)
                    Text(errorText(context, job.message)),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      if (job.active)
                        TextButton(
                          onPressed: () => perform(
                            context,
                            () => studio.action('/jobs/${job.id}/cancel'),
                          ),
                          child: Text(l.cancelTask),
                        ),
                      if (['failed', 'cancelled'].contains(job.state) &&
                          !['image', 'first-frame'].contains(job.type))
                        TextButton(
                          onPressed: () => perform(
                            context,
                            () => studio.action('/jobs/${job.id}/retry'),
                          ),
                          child: Text(l.retry),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  String _status(BuildContext c, String state) => switch (state) {
    'queued' => c.l.queued,
    'running' => c.l.running,
    'succeeded' => c.l.succeeded,
    'failed' => c.l.failed,
    _ => c.l.cancelled,
  };
}
