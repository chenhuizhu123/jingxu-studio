import 'package:flutter/material.dart';
import '../data/captions.dart';
import '../data/domain.dart';
import '../data/models.dart';
import '../data/studio.dart';
import '../widgets/common.dart';

class CaptionsScreen extends StatefulWidget {
  final String projectId, shotId;
  const CaptionsScreen({
    super.key,
    required this.projectId,
    required this.shotId,
  });
  @override
  State<CaptionsScreen> createState() => _CaptionsScreenState();
}

class _CaptionsScreenState extends State<CaptionsScreen> {
  bool loaded = false, busy = false, committed = false;
  late int revision;
  Json? draft;
  Object? error;
  void _load(Project p, Shot s) {
    revision = p.revision;
    draft = s.captionTrack == null ? null : copyJson(s.captionTrack!);
    for (final row in draft?['cues'] ?? []) {
      row['_key'] = newId();
    }
    loaded = true;
  }

  Json? _clean() => draft == null
      ? null
      : {
          ...draft!,
          'origin': 'manual',
          'createdAt': timestamp(),
          'cues': [
            for (final row in draft!['cues'])
              {'start': row['start'], 'end': row['end'], 'text': row['text']},
          ],
        };
  Future<void> _save(Json? track) async {
    if (busy) return;
    final studio = StudioScope.of(context);
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (!committed) {
        if (track != null) validateCaptionTrack(track);
        await studio.api.request(
          '/projects/${widget.projectId}/shots/${widget.shotId}',
          method: 'PATCH',
          body: {'revision': revision, 'captionTrack': track},
        );
        committed = true;
      }
      await studio.refresh();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) setState(() => error = e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final studio = StudioScope.of(context),
        p = studio.project(widget.projectId)!,
        s = p.shots.firstWhere((s) => s.id == widget.shotId),
        l = context.l;
    if (!loaded) _load(p, s);
    final source = currentCaptionSource(s), asset = p.asset(source?['assetId']);
    final matches =
        draft != null &&
        source != null &&
        [
          'assetId',
          'start',
          'duration',
        ].every((k) => draft!['source'][k] == source[k]);
    var valid = false;
    try {
      if (draft != null) {
        validateCaptionTrack(_clean()!);
        valid = true;
      }
    } catch (_) {}
    final action = FilledButton.icon(
      onPressed: busy || (!committed && (!valid || !matches))
          ? null
          : () => _save(_clean()),
      icon: busy
          ? const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : const Icon(Icons.check),
      label: Text(committed ? l.captionRefresh : l.captionApply),
    );
    return Scaffold(
      appBar: AppBar(title: Text(l.captionsTitle)),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 12, 24, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (draft != null && !matches)
                Text(
                  l.captionStale,
                  style: const TextStyle(color: Color(0xff9b4838)),
                ),
              if (draft != null && !valid)
                Text(
                  l.invalidCaptions,
                  style: const TextStyle(color: Color(0xff9b4838)),
                ),
              if (error != null) ...[
                if (committed) Text(l.captionSavedRefresh),
                Text(
                  errorText(context, error!),
                  style: const TextStyle(color: Color(0xff9b4838)),
                ),
              ],
              SizedBox(width: double.infinity, child: action),
              if (s.captionTrack != null)
                TextButton(
                  onPressed: busy ? null : () => _save(null),
                  child: Text(l.captionFallback),
                ),
            ],
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(24, 18, 24, 40),
        children: [
          Text(l.captionsIntro),
          const SizedBox(height: 18),
          if (asset != null)
            Text(
              '${l.captionCurrentSource}: ${asset.name} · ${s.duration}s',
              style: const TextStyle(fontSize: 12),
            ),
          if (asset == null) Text(l.captionNoMedia),
          OutlinedButton.icon(
            onPressed: busy || committed || asset == null
                ? null
                : () {
                    setState(
                      () => draft = {
                        'source': source,
                        'origin': 'manual',
                        'createdAt': timestamp(),
                        'cues': [
                          if (s.dialogue.trim().isNotEmpty)
                            {
                              'start': 0,
                              'end': s.duration,
                              'text': s.dialogue,
                              '_key': newId(),
                            },
                        ],
                      },
                    );
                  },
            icon: const Icon(Icons.edit_note),
            label: Text(l.captionFromDialogue),
          ),
          const SizedBox(height: 12),
          if (draft != null) ...[
            if ((draft!['cues'] as List).isEmpty) Text(l.captionEmpty),
            for (final (index, row) in (draft!['cues'] as List).indexed)
              Padding(
                key: ValueKey(row['_key']),
                padding: const EdgeInsets.only(bottom: 12),
                child: StudioCard(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: TextFormField(
                              initialValue: '${row['start']}',
                              keyboardType:
                                  const TextInputType.numberWithOptions(
                                    decimal: true,
                                  ),
                              decoration: InputDecoration(
                                labelText: '${l.captionStart} ${index + 1}',
                              ),
                              enabled: !busy && !committed,
                              onChanged: (v) => setState(
                                () => row['start'] = double.tryParse(v),
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: TextFormField(
                              initialValue: '${row['end']}',
                              keyboardType:
                                  const TextInputType.numberWithOptions(
                                    decimal: true,
                                  ),
                              decoration: InputDecoration(
                                labelText: '${l.captionEnd} ${index + 1}',
                              ),
                              enabled: !busy && !committed,
                              onChanged: (v) => setState(
                                () => row['end'] = double.tryParse(v),
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        initialValue: row['text'],
                        minLines: 2,
                        maxLines: 4,
                        maxLength: 1000,
                        enabled: !busy && !committed,
                        decoration: InputDecoration(
                          labelText: '${l.captionText} ${index + 1}',
                        ),
                        onChanged: (v) => setState(() => row['text'] = v),
                      ),
                      Align(
                        alignment: Alignment.centerRight,
                        child: IconButton(
                          tooltip: '${l.captionRemove} ${index + 1}',
                          onPressed: busy || committed
                              ? null
                              : () => setState(
                                  () =>
                                      (draft!['cues'] as List).removeAt(index),
                                ),
                          icon: const Icon(Icons.delete_outline, size: 18),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            TextButton.icon(
              onPressed:
                  busy || committed || (draft!['cues'] as List).length >= 300
                  ? null
                  : () {
                      final rows = draft!['cues'] as List;
                      final start = rows.isEmpty ? 0 : rows.last['end'];
                      if (start is! num || start >= s.duration) return;
                      setState(
                        () => rows.add({
                          'start': start,
                          'end': (start + 1).clamp(0, s.duration),
                          'text': '',
                          '_key': newId(),
                        }),
                      );
                    },
              icon: const Icon(Icons.add),
              label: Text(l.captionAdd),
            ),
          ],
        ],
      ),
    );
  }
}
