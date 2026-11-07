import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> testExecutable(Future<void> Function() testMain) async {
  if (!const bool.fromEnvironment(
    'JINGXU_COMPARE_GOLDENS',
    defaultValue: true,
  )) {
    debugPrint('Pixel comparisons are disabled for this functional test run.');
    goldenFileComparator = _FunctionalTestComparator();
  }
  await testMain();
}

class _FunctionalTestComparator extends GoldenFileComparator {
  @override
  Future<bool> compare(Uint8List imageBytes, Uri golden) async => true;

  @override
  Future<void> update(Uri golden, Uint8List imageBytes) async {
    throw StateError('Enable pixel comparisons before updating snapshots.');
  }
}
