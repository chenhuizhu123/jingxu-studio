# Jingxu Studio · Flutter

Android and iOS share an independent local Dart engine. SQLite stores projects and jobs; app documents store assets and renders; device secure storage holds API keys. No desktop pairing or Jingxu account is required. Generation requests go directly to user-configured providers.

Flutter 3.44.0 / Dart 3.12.0, Android JDK 21 and SDK/NDK from the generated Gradle configuration, iOS 14+ with Xcode.

```sh
flutter pub get
flutter analyze
flutter test --coverage
flutter run
```

Build with `flutter build apk --debug` or `flutter build ios --simulator --debug`. Release signing is not configured; Android release currently uses the Flutter template debug signing configuration and must not be distributed as a signed production release.

The native production integration test lives in `integration_test/local_production_test.dart`. It checks real SQLite, secure storage, ordering, persisted timing and native video rendering. Run only on an authorized device using `flutter test integration_test/local_production_test.dart -d DEVICE_ID`. UI access to the local iOS Simulator is currently denied, so the last native timing regression remains unverified after its state-refresh fix.

Widget goldens in `test/goldens` are produced by the actual Flutter widget tree with bundled fonts and local illustrative sample assets. They are independent of OS screenshots and browser previews. Update them deliberately with `flutter test --update-goldens`; review the images before accepting layout changes. Do not run multiple Flutter tests/builds against the same build directory concurrently.

Mobile MCP supports Streamable HTTP through `mcp_dart`, using configured HTTPS servers and explicit in-app approval for execution. STDIO process tools belong to desktop. Background OS suspension can interrupt exports; keep the app open during rendering. Known remote generation IDs are saved for subsequent polling; an unknown submission is not automatically charged again.

See the root README and `docs/VALIDATION.md` for known gaps and platform validation status.
