import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import '../data/models.dart';
import '../data/package_files.dart';
import '../data/package_contract.dart';
import '../data/studio.dart';
import '../widgets/common.dart';
import 'project.dart';

class PickedPackage {
  final String name;
  final Future<int?> Function() length;
  final Stream<List<int>> Function() read;
  PickedPackage({required this.name, required this.length, required this.read});
}

Future<PickedPackage?> pickProjectPackage() async {
  final files = await FilePicker.pickFiles(
    type: FileType.custom,
    allowedExtensions: ['zip'],
  );
  if (files.isEmpty) return null;
  final file = files.first;
  return PickedPackage(
    name: file.name,
    length: file.length,
    read: file.readAsByteStream,
  );
}

class PackageTransferScreen extends StatefulWidget {
  final String? projectId;
  final Future<PickedPackage?> Function()? pick;
  const PackageTransferScreen({super.key, this.projectId, this.pick});
  @override
  State<PackageTransferScreen> createState() => _PackageTransferScreenState();
}

class _PackageTransferScreenState extends State<PackageTransferScreen> {
  PickedPackage? selected;
  int? size;
  bool busy = false, picking = false;
  String? error;
  bool wasCancelled = false;
  String phase = '';
  double fraction = 0;
  Project? imported;
  Json? exported;
  PackageCancellation? cancellation;
  bool get exporting => widget.projectId != null;
  @override
  void dispose() {
    cancellation?.cancel();
    super.dispose();
  }

  Future<void> choose() async {
    setState(() {
      picking = true;
      error = null;
      wasCancelled = false;
    });
    try {
      final result = await (widget.pick ?? pickProjectPackage)();
      if (result == null || !mounted) return;
      if (!result.name.toLowerCase().endsWith('.zip')) {
        throw StateError('invalidPackage');
      }
      final length = await result.length();
      if (length != null && length > packageTotalLimit) {
        throw StateError('packageTooLarge');
      }
      if (mounted) {
        setState(() {
          selected = result;
          size = length;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = errorText(context, e));
    } finally {
      if (mounted) setState(() => picking = false);
    }
  }

  Future<void> start() async {
    if (busy || (!exporting && selected == null)) return;
    final studio = StudioScope.of(context), token = PackageCancellation();
    cancellation = token;
    setState(() {
      busy = true;
      error = null;
      wasCancelled = false;
      fraction = 0;
      phase = exporting ? 'packingProject' : 'readingPackage';
    });
    void progress(String value, double n) {
      if (mounted) {
        setState(() {
          phase = value;
          fraction = n.clamp(0, 1);
        });
      }
    }

    try {
      if (exporting) {
        final result = await studio.api.archive(
          widget.projectId!,
          cancellation: token,
          progress: progress,
        );
        exported = Map<String, dynamic>.from(
          (result['exports'] as List).lastWhere((e) => e['kind'] == 'archive'),
        );
      } else {
        imported = await studio.api.importPackageStream(
          selected!.read(),
          length: size,
          cancellation: token,
          progress: progress,
        );
      }
      await studio.refresh();
    } catch (e) {
      if (mounted) {
        setState(() {
          wasCancelled = token.cancelled;
          error = errorText(context, e);
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> openProject() async {
    final studio = StudioScope.of(context);
    final ok = await perform(context, studio.refresh);
    if (ok && mounted) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => ProjectScreen(id: imported!.id)),
      );
    }
  }

  Future<void> share() async {
    final studio = StudioScope.of(context),
        box = context.findRenderObject() as RenderBox?;
    final origin = box == null
        ? const Rect.fromLTWH(0, 0, 1, 1)
        : box.localToGlobal(Offset.zero) & box.size;
    await perform(context, () async {
      await SharePlus.instance.share(
        ShareParams(
          files: [XFile(studio.api.path(exported!['file']))],
          fileNameOverrides: [
            '${exported!['name']}'.replaceAll(
              RegExp(r'[\\/:*?"<>|\x00-\x1f]'),
              '_',
            ),
          ],
          sharePositionOrigin: origin,
        ),
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l, done = imported != null || exported != null;
    final label = switch (phase) {
      'readingPackage' => l.readingPackage,
      'extractingPackage' => l.extractingPackage,
      'checkingPackage' => l.checkingPackage,
      'savingPackage' => l.savingPackage,
      _ => l.packingProject,
    };
    return PopScope(
      canPop: !busy || cancellation?.canCancel != false,
      child: Scaffold(
        appBar: AppBar(
          title: Text(exporting ? l.archive : l.importProjectPackage),
        ),
        body: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            Text(
              exporting ? l.packageExportTitle : l.packageImportTitle,
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            const SizedBox(height: 14),
            Text(exporting ? l.packageExportHelp : l.packageImportHelp),
            const SizedBox(height: 24),
            StudioCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    done
                        ? Icons.check_circle_outline
                        : Icons.inventory_2_outlined,
                    size: 34,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    done
                        ? l.packageComplete
                        : selected?.name ??
                              (exporting ? l.archive : l.chooseProjectPackage),
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  if (selected != null && size != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text('${(size! / 1000000).toStringAsFixed(1)} MB'),
                    ),
                  if (imported != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(
                        l.packageSummary(
                          imported!.shots.length,
                          imported!.assets.length,
                        ),
                      ),
                    ),
                  if (exported != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(
                        '${((exported!['size'] as num) / 1000000).toStringAsFixed(1)} MB',
                      ),
                    ),
                  if (!done && !exporting)
                    Padding(
                      padding: const EdgeInsets.only(top: 16),
                      child: OutlinedButton.icon(
                        onPressed: busy || picking ? null : choose,
                        icon: const Icon(Icons.folder_open),
                        label: Text(
                          picking ? l.loading : l.chooseProjectPackage,
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            Text(l.packagePrivacyHint),
            const SizedBox(height: 10),
            Text(
              l.packageSizeHint,
              style: Theme.of(context).textTheme.bodySmall,
            ),
            if (error != null)
              Padding(
                padding: const EdgeInsets.only(top: 18),
                child: Semantics(
                  liveRegion: true,
                  child: Text(
                    error!,
                    style: TextStyle(
                      color: wasCancelled
                          ? Theme.of(context).colorScheme.onSurfaceVariant
                          : const Color(0xff8c3a32),
                    ),
                  ),
                ),
              ),
            if (busy) ...[
              const SizedBox(height: 24),
              Semantics(liveRegion: true, child: Text(label)),
              const SizedBox(height: 12),
              LinearProgressIndicator(value: fraction > 0 ? fraction : null),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: cancellation?.canCancel == true
                    ? () {
                        cancellation!.cancel();
                      }
                    : null,
                child: Text(l.cancel),
              ),
            ] else ...[
              const SizedBox(height: 24),
              if (imported != null)
                FilledButton.icon(
                  onPressed: openProject,
                  icon: const Icon(Icons.arrow_forward),
                  label: Text(l.openImportedProject),
                )
              else if (exported != null)
                FilledButton.icon(
                  onPressed: share,
                  icon: const Icon(Icons.ios_share),
                  label: Text(l.shareProjectPackage),
                )
              else
                FilledButton.icon(
                  onPressed: picking || (!exporting && selected == null)
                      ? null
                      : start,
                  icon: Icon(
                    exporting
                        ? Icons.inventory_2_outlined
                        : Icons.drive_folder_upload_outlined,
                  ),
                  label: Text(exporting ? l.archive : l.importAsNewProject),
                ),
            ],
            if (done)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(l.packageSavedHint),
              ),
          ],
        ),
      ),
    );
  }
}
