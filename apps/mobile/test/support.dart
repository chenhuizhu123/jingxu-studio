import 'dart:convert';
import 'package:jingxu_mobile/data/api.dart';
import 'package:jingxu_mobile/data/models.dart';
import 'package:jingxu_mobile/data/records.dart';
import 'package:jingxu_mobile/data/render.dart';
import 'dart:io';

class MemoryRecords implements Records {
  final values = <String, Json>{};
  @override
  Future<List<Json>> all(String kind) async => values.entries
      .where((e) => e.key.startsWith('$kind:'))
      .map((e) => Map<String, dynamic>.from(jsonDecode(jsonEncode(e.value))))
      .toList();
  @override
  Future<void> put(String kind, Json value) async {
    values['$kind:${value['id']}'] = Map<String, dynamic>.from(
      jsonDecode(jsonEncode(value)),
    );
  }

  @override
  Future<void> remove(String kind, String id) async {
    values.remove('$kind:$id');
  }

  @override
  Future<void> close() async {}
}

class MemoryCredentials implements Credentials {
  final values = <String, String>{};
  @override
  Future<String?> read(String key) async => values[key];
  @override
  Future<void> write(String key, String value) async {
    values[key] = value;
  }

  @override
  Future<void> delete(String key) async {
    values.remove(key);
  }
}

class FakeRenderer implements LocalRenderer {
  @override
  Future<void> cancel(String id) async {}
  @override
  Future<void> render(
    Project p,
    String output,
    String task,
    String Function(String) path,
    RenderProgress progress,
  ) async {
    await File(output).writeAsString('test render only');
    progress(1);
  }
}
