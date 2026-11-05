import 'dart:async';
import 'package:flutter/material.dart';
import 'api.dart';
import 'models.dart';

class Studio extends ChangeNotifier with WidgetsBindingObserver {
  final StudioApi api;
  List<Project> projects = [];
  List<ProductionJob> jobs = [];
  List<Json> skills = [], approvals = [];
  bool ready = false, loading = false;
  String? error;
  Locale? locale;
  bool _refreshAgain = false, _disposed = false;
  Future<void>? _refreshFuture;
  Studio(this.api);
  Future<void> initialize() async {
    try {
      final stored = await api.credentials.read('localeChoice');
      locale = ['zh', 'en'].contains(stored) ? Locale(stored!) : null;
      api.language =
          locale?.languageCode ??
          WidgetsBinding.instance.platformDispatcher.locale.languageCode;
      await api.restore();
      await refresh();
      api.onChanged = () => unawaited(refresh(silent: true));
      WidgetsBinding.instance.addObserver(this);
    } catch (e) {
      error = e.toString();
    }
    ready = true;
    notifyListeners();
  }

  Future<void> setLanguage(String value) async {
    locale = value == 'system' ? null : Locale(value);
    api.language =
        locale?.languageCode ??
        WidgetsBinding.instance.platformDispatcher.locale.languageCode;
    await api.credentials.write('localeChoice', value);
    notifyListeners();
  }

  Future<void> refresh({bool silent = false}) {
    if (_disposed) return Future.value();
    if (_refreshFuture != null) {
      _refreshAgain = true;
      return _refreshFuture!;
    }
    return _refreshFuture = _reload(silent).whenComplete(() {
      _refreshFuture = null;
    });
  }

  Future<void> _reload(bool silent) async {
    if (!silent) {
      loading = true;
      notifyListeners();
    }
    try {
      do {
        _refreshAgain = false;
        projects = await api.projects();
        jobs = await api.jobs();
        skills = (await api.request('/skills') as List).cast<Json>();
        approvals = (await api.request('/approvals') as List).cast<Json>();
      } while (_refreshAgain && !_disposed);
      error = null;
    } catch (e) {
      error = e.toString();
      if (!silent) rethrow;
    } finally {
      loading = false;
      if (!_disposed) notifyListeners();
    }
  }

  Project? project(String id) {
    for (final p in projects) {
      if (p.id == id) return p;
    }
    return null;
  }

  Future<void> action(String path, {String method = 'POST', Json? body}) async {
    await api.request(path, method: method, body: body ?? {});
    await refresh();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(refresh(silent: true));
  }

  @override
  void dispose() {
    _disposed = true;
    WidgetsBinding.instance.removeObserver(this);
    api.onChanged = null;
    unawaited(api.close());
    super.dispose();
  }
}

class StudioScope extends InheritedNotifier<Studio> {
  const StudioScope({super.key, required Studio studio, required super.child})
    : super(notifier: studio);
  static Studio of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<StudioScope>()!.notifier!;
}
