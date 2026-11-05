import 'dart:convert';
import 'package:sqflite/sqflite.dart';
import 'models.dart';

abstract class Records {
  Future<List<Json>> all(String kind);
  Future<void> put(String kind, Json value);
  Future<void> remove(String kind, String id);
  Future<void> close();
}

class SqliteRecords implements Records {
  final Database db;
  SqliteRecords._(this.db);
  static Future<SqliteRecords> open(String path) async => SqliteRecords._(
    await openDatabase(
      path,
      version: 1,
      onCreate: (db, _) => db.execute(
        'CREATE TABLE records(kind TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(kind,id))',
      ),
    ),
  );
  @override
  Future<List<Json>> all(String kind) async =>
      (await db.query('records', where: 'kind = ?', whereArgs: [kind]))
          .map(
            (row) =>
                Map<String, dynamic>.from(jsonDecode(row['value'] as String)),
          )
          .toList();
  @override
  Future<void> put(String kind, Json value) async {
    await db.insert('records', {
      'kind': kind,
      'id': value['id'],
      'value': jsonEncode(value),
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  @override
  Future<void> remove(String kind, String id) async {
    await db.delete(
      'records',
      where: 'kind = ? AND id = ?',
      whereArgs: [kind, id],
    );
  }

  @override
  Future<void> close() => db.close();
}
