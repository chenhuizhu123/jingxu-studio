import 'package:flutter/material.dart';
import '../build_version.dart';
import '../data/studio.dart';
import '../data/models.dart';
import '../data/shot_generation.dart';
import 'tools.dart';
import '../widgets/common.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});
  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final generationUrl = TextEditingController(),
      generationModel = TextEditingController(),
      generationKey = TextEditingController(),
      imageUrl = TextEditingController(),
      imageModel = TextEditingController(),
      imageKey = TextEditingController(),
      agentUrl = TextEditingController(),
      agentModel = TextEditingController(),
      agentKey = TextEditingController(),
      speechUrl = TextEditingController(),
      speechModel = TextEditingController(),
      speechVoice = TextEditingController(),
      speechSpeed = TextEditingController(),
      speechKey = TextEditingController();
  Json? settings;
  String provider = 'demo';
  bool busy = false, clearImageKey = false;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (settings == null) _load();
  }

  Future<void> _load() async {
    final data = await StudioScope.of(context).api.settings();
    if (!mounted) return;
    setState(() {
      settings = data;
      provider = data['generation']['provider'];
      generationUrl.text = data['generation']['endpoint'];
      generationModel.text = data['generation']['model'];
      imageUrl.text = data['image']['endpoint'];
      imageModel.text = data['image']['model'];
      clearImageKey = false;
      agentUrl.text = data['agent']['endpoint'];
      agentModel.text = data['agent']['model'];
      speechUrl.text = data['speech']['endpoint'];
      speechModel.text = data['speech']['model'];
      speechVoice.text = data['speech']['voice'];
      speechSpeed.text = '${data['speech']['speed']}';
    });
  }

  @override
  void dispose() {
    for (final c in [
      generationUrl,
      generationModel,
      generationKey,
      imageUrl,
      imageModel,
      imageKey,
      agentUrl,
      agentModel,
      agentKey,
      speechUrl,
      speechModel,
      speechVoice,
      speechSpeed,
      speechKey,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l, studio = StudioScope.of(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(22, 22, 22, 60),
      children: [
        Text(l.settings, style: Theme.of(context).textTheme.headlineMedium),
        const SizedBox(height: 12),
        Text(l.modelHelp),
        SectionHeading(l.language),
        DropdownButtonFormField<String>(
          key: ValueKey(studio.locale?.languageCode),
          initialValue: studio.locale?.languageCode ?? 'system',
          items: [
            DropdownMenuItem(value: 'system', child: Text(l.systemLanguage)),
            DropdownMenuItem(value: 'en', child: Text(l.english)),
            DropdownMenuItem(value: 'zh', child: Text(l.chinese)),
          ],
          onChanged: (v) => perform(context, () => studio.setLanguage(v!)),
        ),
        const SizedBox(height: 12),
        Text(l.originalContent, style: const TextStyle(fontSize: 11)),
        if (settings == null)
          const Padding(
            padding: EdgeInsets.all(30),
            child: Center(child: CircularProgressIndicator()),
          )
        else ...[
          SectionHeading(l.generationService),
          StudioCard(
            child: Column(
              children: [
                DropdownButtonFormField<String>(
                  initialValue: provider,
                  isExpanded: true,
                  decoration: InputDecoration(labelText: l.provider),
                  items: [
                    DropdownMenuItem(value: 'demo', child: Text(l.demoMode)),
                    const DropdownMenuItem(
                      value: 'ark',
                      child: Text('Seedance · Ark'),
                    ),
                    DropdownMenuItem(value: 'gateway', child: Text(l.gateway)),
                  ],
                  onChanged: (v) => setState(() => provider = v!),
                ),
                if (provider != 'demo') ...[
                  const SizedBox(height: 22),
                  field(l.endpoint, generationUrl, keyboard: TextInputType.url),
                  field(l.model, generationModel),
                  field(
                    l.apiKey,
                    generationKey,
                    secret: true,
                    hint: settings!['generation']['hasApiKey']
                        ? l.keySaved
                        : null,
                  ),
                ],
                const SizedBox(height: 12),
                Text(l.costNotice, style: const TextStyle(fontSize: 11)),
              ],
            ),
          ),
          SectionHeading(l.imageProvider),
          StudioCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l.seedreamSettingsHelp),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  children: [
                    ActionChip(
                      label: const Text('Volcengine Ark'),
                      onPressed: () => imageUrl.text = arkBaseUrl,
                    ),
                    ActionChip(
                      label: const Text('BytePlus ModelArk'),
                      onPressed: () => imageUrl.text = bytePlusBaseUrl,
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                field(l.imageBaseUrl, imageUrl, keyboard: TextInputType.url),
                field(l.model, imageModel),
                field(
                  l.apiKey,
                  imageKey,
                  secret: true,
                  hint: settings!['image']['hasApiKey'] && !clearImageKey
                      ? l.keySaved
                      : null,
                ),
                if (settings!['image']['hasApiKey'])
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(l.clearImageKey),
                    value: clearImageKey,
                    onChanged: (value) => setState(() {
                      clearImageKey = value ?? false;
                      if (clearImageKey) imageKey.clear();
                    }),
                  ),
              ],
            ),
          ),
          SectionHeading(l.speechSettings),
          StudioCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l.speechProtocol),
                const SizedBox(height: 16),
                field(l.speechBaseUrl, speechUrl, keyboard: TextInputType.url),
                field(l.speechModel, speechModel),
                field(l.speechVoice, speechVoice),
                field(
                  l.speechSpeed,
                  speechSpeed,
                  keyboard: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                ),
                field(
                  l.apiKey,
                  speechKey,
                  secret: true,
                  hint: settings!['speech']['hasApiKey'] ? l.keySaved : null,
                ),
              ],
            ),
          ),
          SectionHeading(l.assistantModel),
          StudioCard(
            child: Column(
              children: [
                field(
                  l.endpoint,
                  agentUrl,
                  keyboard: TextInputType.url,
                  hint: 'https://api.example.com/v1',
                ),
                field(l.model, agentModel),
                field(
                  l.apiKey,
                  agentKey,
                  secret: true,
                  hint: settings!['agent']['hasApiKey'] ? l.keySaved : null,
                ),
              ],
            ),
          ),
          const SizedBox(height: 22),
          FilledButton.icon(
            onPressed: busy
                ? null
                : () async {
                    setState(() => busy = true);
                    final ok = await perform(context, () async {
                      await studio.api.request(
                        '/settings',
                        method: 'PUT',
                        body: {
                          ...settings!,
                          'generation': {
                            'provider': provider,
                            'endpoint': generationUrl.text.trim(),
                            'model': generationModel.text.trim(),
                            if (generationKey.text.isNotEmpty)
                              'apiKey': generationKey.text,
                          },
                          'speech': {
                            'endpoint': speechUrl.text.trim(),
                            'model': speechModel.text.trim(),
                            'voice': speechVoice.text.trim(),
                            'speed': double.tryParse(speechSpeed.text),
                            if (speechKey.text.isNotEmpty)
                              'apiKey': speechKey.text,
                          },
                          'image': {
                            'endpoint': imageUrl.text.trim(),
                            'model': imageModel.text.trim(),
                            if (imageKey.text.isNotEmpty || clearImageKey)
                              'apiKey': imageKey.text.trim(),
                          },
                          'agent': {
                            'endpoint': agentUrl.text.trim(),
                            'model': agentModel.text.trim(),
                            if (agentKey.text.isNotEmpty)
                              'apiKey': agentKey.text,
                          },
                        },
                      );
                    }, success: l.saved);
                    if (ok) {
                      generationKey.clear();
                      agentKey.clear();
                      speechKey.clear();
                      imageKey.clear();
                      await _load();
                    }
                    if (mounted) setState(() => busy = false);
                  },
            icon: busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.check),
            label: Text(l.save),
          ),
          SectionHeading(l.advanced),
          OutlinedButton.icon(
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const ToolsScreen()),
            ),
            icon: const Icon(Icons.extension_outlined),
            label: Text(l.mcpTools),
          ),
          SectionHeading(
            l.skills,
            trailing: TextButton(
              onPressed: () => newSkill(context),
              child: Text(l.newSkill),
            ),
          ),
          Text(l.skillsHint),
          ...studio.skills.map(
            (s) => ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(s['name']),
              subtitle: Text(s['description'] ?? ''),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => showDialog<void>(
                context: context,
                builder: (ctx) => AlertDialog(
                  title: Text(s['name']),
                  content: SingleChildScrollView(
                    child: SelectableText(s['content']),
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(ctx),
                      child: Text(l.ok),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
        TextButton(
          onPressed: () => showLicensePage(
            context: context,
            applicationName: 'Jingxu Studio',
            applicationVersion: jingxuVersion,
          ),
          child: Text(l.licenses),
        ),
        const SizedBox(height: 24),
        StudioCard(
          child: Row(
            children: [
              const Icon(Icons.shield_outlined, color: Color(0xff285744)),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  l.localFirst,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        Text(
          l.paidPreview,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 11),
        ),
      ],
    );
  }
}
