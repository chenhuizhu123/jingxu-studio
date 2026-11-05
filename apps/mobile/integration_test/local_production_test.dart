import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pro_video_editor/pro_video_editor.dart';
import 'package:jingxu_mobile/data/api.dart';
import 'package:jingxu_mobile/data/studio.dart';
import 'package:jingxu_mobile/data/render.dart';
import 'package:jingxu_mobile/main.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'on-device SQLite, secure storage, editing and native MP4 rendering',
    (tester) async {
      final directory = Directory(
        '${(await getTemporaryDirectory()).path}/jingxu-native-validation',
      );
      if (await directory.exists()) await directory.delete(recursive: true);
      final credentials = SecureCredentials();
      await credentials.write('validationKey', 'local-test-value');
      expect(await credentials.read('validationKey'), 'local-test-value');
      await credentials.delete('validationKey');
      await credentials.write('localeChoice', 'en');
      final api = StudioApi(directory: directory, credentials: credentials),
          studio = Studio(api);
      await studio.initialize();
      expect(studio.error, isNull);
      await api.seedDemo();
      await studio.refresh();
      await tester.pumpWidget(JingxuApp(studio: studio));
      await tester.pumpAndSettle();
      expect(find.text('Letters in the rain'), findsOneWidget);
      await tester.tap(find.text('Letters in the rain'));
      await tester.pumpAndSettle();
      expect(find.text('Cast'), findsOneWidget);
      var project = studio.projects.first;
      await studio.action(
        '/projects/${project.id}/reorder',
        body: {
          'shotIds': project.shots.reversed.map((s) => s.id).toList(),
          'revision': project.revision,
        },
      );
      project = studio.project(project.id)!;
      for (final shot in project.shots) {
        await studio.action(
          '/projects/${project.id}/shots/${shot.id}',
          method: 'PATCH',
          body: {'duration': 2.0},
        );
      }
      project = studio.project(project.id)!;
      expect(project.duration, 6);
      final output = api.path('exports/native-validation.mp4');
      await NativeRenderer().render(
        project,
        output,
        'native-validation',
        (value) => api.path(value),
        (_) {},
      );
      expect(await File(output).length(), greaterThan(10000));
      final metadata = await ProVideoEditor.instance.getMetadata(
        EditorVideo.file(output),
      );
      expect(metadata.duration.inMilliseconds, closeTo(6000, 400));
      expect(metadata.resolution.width, 720);
      expect(metadata.resolution.height, 1280);
      final id = project.id;
      await api.close();
      final restored = StudioApi(
        directory: directory,
        credentials: credentials,
      );
      await restored.restore();
      final saved = await restored.project(id);
      expect(saved.shots.first.id, project.shots.first.id);
      expect(saved.shots.every((s) => s.duration == 2), true);
      await restored.close();
      await tester.pumpWidget(const SizedBox());
      studio.dispose();
    },
  );
}
