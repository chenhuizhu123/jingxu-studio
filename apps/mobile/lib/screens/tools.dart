import 'dart:convert';
import 'package:flutter/material.dart';
import '../data/studio.dart';
import '../data/domain.dart';
import '../data/models.dart';
import '../widgets/common.dart';

class ToolsScreen extends StatelessWidget {
  const ToolsScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final studio = StudioScope.of(context), l = context.l;
    return Scaffold(
      appBar: AppBar(title: Text(l.mcpTools)),
      body: FutureBuilder<Json>(
        future: studio.api.settings(),
        builder: (context, snapshot) {
          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          final settings = snapshot.data!,
              servers = (settings['mcp'] as List).cast<Json>();
          return ListView(
            padding: const EdgeInsets.all(22),
            children: [
              Text(l.mcpHelp),
              const SizedBox(height: 24),
              ...servers.map(
                (server) => Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: StudioCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                server['name'] ?? server['id'],
                                style: Theme.of(context).textTheme.titleMedium,
                              ),
                            ),
                            IconButton(
                              tooltip: l.save,
                              onPressed: () => _edit(context, settings, server),
                              icon: const Icon(Icons.edit_outlined),
                            ),
                          ],
                        ),
                        Text(
                          server['url'],
                          style: const TextStyle(fontSize: 11),
                        ),
                        const SizedBox(height: 10),
                        OutlinedButton(
                          onPressed: () => perform(context, () async {
                            final tools = await studio.api.request(
                              '/mcp/${server['id']}/tools',
                            );
                            if (!context.mounted) return;
                            await showDialog<void>(
                              context: context,
                              builder: (ctx) => AlertDialog(
                                title: Text(l.testTools),
                                content: SingleChildScrollView(
                                  child: SelectableText(
                                    const JsonEncoder.withIndent(
                                      '  ',
                                    ).convert(tools),
                                  ),
                                ),
                                actions: [
                                  TextButton(
                                    onPressed: () => Navigator.pop(ctx),
                                    child: Text(l.ok),
                                  ),
                                ],
                              ),
                            );
                          }),
                          child: Text(l.testTools),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              FilledButton.icon(
                onPressed: () => _edit(context, settings, null),
                icon: const Icon(Icons.add),
                label: Text(l.addServer),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _edit(BuildContext context, Json settings, Json? server) async {
    final l = context.l,
        studio = StudioScope.of(context),
        name = TextEditingController(text: server?['name'] ?? ''),
        url = TextEditingController(text: server?['url'] ?? ''),
        token = TextEditingController();
    bool enabled = server?['enabled'] ?? true;
    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, set) => AlertDialog(
          title: Text(l.addServer),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                field(l.serverName, name),
                field(
                  l.serverUrl,
                  url,
                  keyboard: TextInputType.url,
                  hint: 'https://tools.example.com/mcp',
                ),
                field(
                  l.serverToken,
                  token,
                  secret: true,
                  hint: server?['hasToken'] == true ? l.keySaved : null,
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(l.connected),
                  value: enabled,
                  onChanged: (v) => set(() => enabled = v),
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
                final next = <String, dynamic>{
                  'id': server?['id'] ?? newId(),
                  'name': name.text,
                  'url': url.text.trim(),
                  'enabled': enabled,
                  if (token.text.isNotEmpty) 'token': token.text,
                };
                final servers =
                    (settings['mcp'] as List)
                        .cast<Json>()
                        .where((s) => s['id'] != next['id'])
                        .toList()
                      ..add(next);
                final ok = await perform(
                  ctx,
                  () => studio.action(
                    '/settings',
                    method: 'PUT',
                    body: {...settings, 'mcp': servers},
                  ),
                );
                if (ok && ctx.mounted) Navigator.pop(ctx);
              },
              child: Text(l.save),
            ),
          ],
        ),
      ),
    );
    name.dispose();
    url.dispose();
    token.dispose();
  }
}

class ApprovalCards extends StatelessWidget {
  final String projectId;
  const ApprovalCards({super.key, required this.projectId});
  @override
  Widget build(BuildContext context) {
    final studio = StudioScope.of(context),
        l = context.l,
        requests = studio.approvals
            .where((a) => a['projectId'] == projectId)
            .toList();
    if (requests.isEmpty) return const SizedBox();
    return ConstrainedBox(
      constraints: const BoxConstraints(maxHeight: 250),
      child: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 22),
        shrinkWrap: true,
        children: requests
            .map(
              (a) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: StudioCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        l.approvals,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      Text(
                        '${a['tool']} · ${a['url']}',
                        style: const TextStyle(fontSize: 11),
                      ),
                      const SizedBox(height: 8),
                      SelectableText(
                        const JsonEncoder.withIndent(
                          '  ',
                        ).convert(a['arguments']),
                        style: const TextStyle(fontSize: 11),
                      ),
                      if (a['state'] == 'pending')
                        Wrap(
                          spacing: 10,
                          children: [
                            FilledButton(
                              onPressed: () => perform(
                                context,
                                () => studio.action(
                                  '/approvals/${a['id']}/decide',
                                  body: {'approve': true},
                                ),
                              ),
                              child: Text(l.approve),
                            ),
                            TextButton(
                              onPressed: () => perform(
                                context,
                                () => studio.action(
                                  '/approvals/${a['id']}/decide',
                                  body: {'approve': false},
                                ),
                              ),
                              child: Text(l.reject),
                            ),
                          ],
                        )
                      else
                        Text('${a['state']}'),
                      if (a['result'] != null)
                        SelectableText(
                          a['result'],
                          style: const TextStyle(fontSize: 11),
                        ),
                    ],
                  ),
                ),
              ),
            )
            .toList(),
      ),
    );
  }
}

Future<void> newSkill(BuildContext context) async {
  final l = context.l,
      studio = StudioScope.of(context),
      name = TextEditingController(),
      description = TextEditingController(),
      content = TextEditingController();
  await showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(l.newSkill),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            field(l.skillName, name, hint: 'brand-review'),
            field(l.skillDescription, description),
            field(l.skillContent, content, lines: 6),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: Text(l.cancel)),
        FilledButton(
          onPressed: () async {
            final ok = await perform(
              ctx,
              () => studio.action(
                '/skills',
                body: {
                  'name': name.text.trim(),
                  'description': description.text,
                  'content': content.text,
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
  content.dispose();
}
