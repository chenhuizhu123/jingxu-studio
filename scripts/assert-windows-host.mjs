if (process.platform !== "win32") {
  throw new Error(
    "Use npm run package:win:cross on macOS/Linux so Windows FFmpeg and Sharp binaries are installed separately.",
  );
}
