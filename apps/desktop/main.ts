import { app, BrowserWindow, dialog, shell, Menu, safeStorage } from "electron";
import { join, resolve } from "node:path";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
} from "node:fs";
import { startServer } from "../server/src/app";

let server: Awaited<ReturnType<typeof startServer>> | undefined;
let mainWindow: BrowserWindow | undefined;
const single = app.requestSingleInstanceLock();
if (!single) app.quit();
app.on("second-instance", () => {
  if (mainWindow?.isMinimized()) mainWindow.restore();
  mainWindow?.focus();
});
app.setName("镜序 Studio");
async function createWindow() {
  if (!server) return;
  const origin = `http://127.0.0.1:${server.port}`;
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 1020,
    minWidth: 880,
    minHeight: 700,
    title: "镜序 Studio",
    backgroundColor: "#101514",
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(origin + "/")) event.preventDefault();
  });
  mainWindow.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  await mainWindow.loadURL(origin);
  if (process.env.JINGXU_ELECTRON_TEST === "1")
    mainWindow.webContents.once("did-finish-load", () => {});
}
if (single)
  void app.whenReady().then(async () => {
    try {
      const root =
        process.env.JINGXU_DATA_DIR ??
        join(app.getPath("userData"), "workspace");
      mkdirSync(root, { recursive: true, mode: 0o700 });
      // Migrate the local vault key to the operating system's protected storage before opening the database.
      if (safeStorage.isEncryptionAvailable()) {
        const plain = join(root, ".vault-key"),
          encrypted = join(root, ".vault-key.os");
        if (existsSync(encrypted))
          writeFileSync(
            plain,
            Buffer.from(
              safeStorage.decryptString(readFileSync(encrypted)),
              "base64",
            ),
            { mode: 0o600 },
          );
      }
      const base = app.getAppPath();
      process.env.JINGXU_FONTS_DIR = join(base, "dist/runtime/fonts").replace(
        "app.asar/",
        "app.asar.unpacked/",
      );
      server = await startServer({
        root,
        port: 0,
        seed: false,
        sampleRoot: join(base, "dist/runtime/samples"),
        studioRoot: join(base, "dist/studio"),
        skillRoot: join(base, "dist/skills"),
        wasmPath: join(base, "dist/runtime/sql-wasm.wasm"),
      });
      if (safeStorage.isEncryptionAvailable()) {
        const plain = join(root, ".vault-key");
        writeFileSync(
          join(root, ".vault-key.os"),
          safeStorage.encryptString(readFileSync(plain).toString("base64")),
          { mode: 0o600 },
        );
        unlinkSync(plain);
      }
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
          {
            label: "编辑",
            submenu: [
              { role: "undo" },
              { role: "redo" },
              { type: "separator" },
              { role: "cut" },
              { role: "copy" },
              { role: "paste" },
              { role: "selectAll" },
            ],
          },
          {
            label: "视图",
            submenu: [
              { role: "reload" },
              { role: "togglefullscreen" },
              ...(app.isPackaged ? [] : [{ role: "toggleDevTools" as const }]),
            ],
          },
          { label: "窗口", submenu: [{ role: "minimize" }, { role: "close" }] },
        ]),
      );
      await createWindow();
    } catch (error) {
      dialog.showErrorBox(
        "镜序 Studio 无法启动",
        error instanceof Error ? error.message : String(error),
      );
      app.quit();
    }
  });
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin" || process.env.JINGXU_ELECTRON_TEST === "1")
    app.quit();
});
let closing = false;
app.on("before-quit", (event) => {
  if (server && !closing) {
    event.preventDefault();
    closing = true;
    void server.close().then(() => app.quit());
  }
});
