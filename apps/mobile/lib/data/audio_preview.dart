import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:just_audio/just_audio.dart';

abstract class AudioPreviewController extends ChangeNotifier {
  Duration? get duration;
  Duration get position;
  bool get playing;
  bool get loading;
  bool get completed;
  bool get failed;
  Future<void> load(String filename);
  Future<void> toggle();
  Future<void> seek(Duration value);
  Future<void> pause();
}

class NativeAudioPreview extends AudioPreviewController {
  final _player = AudioPlayer();
  final _subscriptions = <StreamSubscription<dynamic>>[];
  bool _loading = false, _failed = false, _disposed = false;
  NativeAudioPreview() {
    _subscriptions.add(_player.playerStateStream.listen((_) => _changed()));
    _subscriptions.add(_player.positionStream.listen((_) => _changed()));
    _subscriptions.add(
      _player.errorStream.listen((_) {
        _failed = true;
        _changed();
      }),
    );
  }
  void _changed() {
    if (!_disposed) notifyListeners();
  }

  @override
  Duration? get duration => _player.duration;
  @override
  Duration get position => _player.position;
  @override
  bool get completed => _player.processingState == ProcessingState.completed;
  @override
  bool get playing => _player.playing && !completed;
  @override
  bool get loading => _loading;
  @override
  bool get failed => _failed;
  @override
  Future<void> load(String filename) async {
    _loading = true;
    _failed = false;
    _changed();
    try {
      await _player.setFilePath(filename).timeout(const Duration(seconds: 20));
    } catch (_) {
      if (!_disposed) _failed = true;
    } finally {
      _loading = false;
      _changed();
    }
  }

  @override
  Future<void> toggle() async {
    try {
      if (playing) {
        await _player.pause();
      } else {
        if (completed) await _player.seek(Duration.zero);
        unawaited(
          _player.play().catchError((_) {
            _failed = true;
            _changed();
          }),
        );
      }
    } catch (_) {
      _failed = true;
      _changed();
    }
  }

  @override
  Future<void> seek(Duration value) async {
    try {
      await _player.seek(value);
    } catch (_) {
      _failed = true;
      _changed();
    }
  }

  @override
  Future<void> pause() async {
    try {
      await _player.pause();
    } catch (_) {
      /* Disposing/interruption can race a pause. */
    }
  }

  @override
  void dispose() {
    _disposed = true;
    for (final sub in _subscriptions) {
      unawaited(sub.cancel());
    }
    unawaited(_player.dispose().catchError((_) {}));
    super.dispose();
  }
}
