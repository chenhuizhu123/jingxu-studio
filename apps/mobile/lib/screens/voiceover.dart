import 'package:flutter/material.dart';
import '../data/studio.dart';
import '../data/models.dart';
import '../widgets/common.dart';
import 'settings.dart';
import 'home.dart';

class VoiceoverScreen extends StatefulWidget {
  final String projectId, shotId;
  const VoiceoverScreen({
    super.key,
    required this.projectId,
    required this.shotId,
  });
  @override
  State<VoiceoverScreen> createState() => _VoiceoverScreenState();
}

class _VoiceoverScreenState extends State<VoiceoverScreen> {
  Json? config, shot, accepted;
  bool started = false, busy = false;
  Object? error;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!started) {
      started = true;
      _load();
    }
  }

  Future<void> _load() async {
    try {
      final api = StudioScope.of(context).api;
      final settings = await api.settings(),
          project = await api.rawProject(widget.projectId);
      if (mounted) {
        setState(() {
          config = settings['speech'];
          shot = (project['shots'] as List).cast<Json>().firstWhere(
            (s) => s['id'] == widget.shotId,
          );
          error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = e);
    }
  }

  Future<void> _submit() async {
    if (busy) return;
    final studio = StudioScope.of(context);
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (accepted == null) {
        final result = await studio.api.request(
          '/projects/${widget.projectId}/shots/${widget.shotId}/speech',
          method: 'POST',
          body: {'text': shot!['dialogue']},
        );
        if (mounted) setState(() => accepted = result);
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
    final latest = accepted == null
        ? null
        : studio.jobs.where((j) => j.id == accepted!['id']).firstOrNull;
    final state = latest?.state ?? accepted?['state'];
    final shownConfig = accepted?['speechConfig'] as Json? ?? config;
    final ready =
        config != null &&
        config!['hasApiKey'] == true &&
        [
          'endpoint',
          'model',
          'voice',
        ].every((k) => '${config![k]}'.trim().isNotEmpty);
    return Scaffold(
      appBar: AppBar(title: Text(l.speechTitle)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(24, 20, 24, 40),
        children: [
          Text(
            accepted == null ? l.speechReview : l.speechTaskAccepted,
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: 12),
          Text(accepted == null ? l.speechReviewHelp : l.speechAcceptedHelp),
          const SizedBox(height: 22),
          if (shot == null && error == null)
            const Center(child: CircularProgressIndicator()),
          if (shot != null)
            StudioCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(
                        Icons.graphic_eq_rounded,
                        color: Color(0xff285744),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          '${l.shot} ${shot!['order']} · ${shot!['title']}',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  SelectableText(
                    '${accepted?['speechText'] ?? shot!['dialogue']}',
                  ),
                  if (shownConfig != null) ...[
                    const Divider(height: 32),
                    Text(
                      '${shownConfig['model']} · ${shownConfig['voice']} · ${shownConfig['speed']}×',
                      style: const TextStyle(fontSize: 12),
                    ),
                  ],
                ],
              ),
            ),
          if (accepted == null) ...[
            Text(l.speechSendNotice, style: const TextStyle(fontSize: 12)),
            const SizedBox(height: 20),
            if (ready)
              FilledButton.icon(
                onPressed: busy || '${shot?['dialogue'] ?? ''}'.trim().isEmpty
                    ? null
                    : _submit,
                icon: busy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.graphic_eq),
                label: Text(l.speechCreate),
              ),
            if (ready) const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: busy
                  ? null
                  : () async {
                      await Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => Scaffold(
                            appBar: AppBar(title: Text(l.speechSettings)),
                            body: const SettingsScreen(),
                          ),
                        ),
                      );
                      if (mounted) await _load();
                    },
              icon: const Icon(Icons.tune),
              label: Text(l.speechConfigButton),
            ),
          ] else ...[
            if (latest?.active ?? true) const LinearProgressIndicator(),
            if (latest?.message.isNotEmpty == true)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Text(errorText(context, latest!.message)),
              ),
            if (latest?.error != null) Text(errorText(context, latest!.error!)),
            if (error != null) ...[
              Text(l.speechRefreshError),
              TextButton(
                onPressed: busy ? null : _submit,
                child: Text(l.speechRefresh),
              ),
            ],
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: () => Navigator.pop(context),
              icon: const Icon(Icons.arrow_back),
              label: Text(l.speechReturn),
            ),
            TextButton(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => Scaffold(
                    appBar: AppBar(title: Text(l.tasks)),
                    body: const TasksScreen(),
                  ),
                ),
              ),
              child: Text(l.tasks),
            ),
            if (['failed', 'cancelled'].contains(state)) ...[
              Text(l.speechRetryNotice),
              TextButton(
                onPressed: () {
                  setState(() => accepted = null);
                  _load();
                },
                child: Text(l.speechNewRequest),
              ),
            ],
          ],
          if (error != null)
            Padding(
              padding: const EdgeInsets.only(top: 14),
              child: Text(
                errorText(context, error!),
                style: const TextStyle(color: Color(0xff9b4838)),
              ),
            ),
        ],
      ),
    );
  }
}
