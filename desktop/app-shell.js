// What makes the window behave like an app rather than a bare browser tab:
// branding, menus, right-click, downloads, the microphone, links and the
// loading and offline screens.
const { app, BrowserWindow, Menu, clipboard, dialog, session, shell, systemPreferences } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const logic = require("./timer-logic");
const rules = require("./shell-rules");

const BACKGROUND = "#050505";
const ICON = path.join(__dirname, "assets", "icon.png");
const WEBSITE = "https://studenv-online.vercel.app";

/** Sets everything that carries the app's name, before any window opens. */
function brand() {
  app.setName("Studenv");
  // Windows ties notifications and the taskbar icon to this id (the installer's shortcut uses it too).
  app.setAppUserModelId("online.studenv.app");
  app.userAgentFallback = rules.userAgent(app.userAgentFallback, app.getVersion());
  app.setAboutPanelOptions({
    applicationName: "Studenv",
    applicationVersion: app.getVersion(),
    version: "",
    copyright: "© 2026 Studenv",
    website: WEBSITE,
    iconPath: ICON,
  });
}

// ─── Links and pages ─────────────────────────────────────────
/** Pages stay on Studenv; every other link opens in the system browser. */
function keepOnStudenv(appUrl) {
  const openOutside = (url) => {
    if (logic.canOpenOutside(url)) void shell.openExternal(url);
  };
  app.on("web-contents-created", (_event, contents) => {
    const stayOnStudenv = (details) => {
      // Frames inside a page (a video player, say) may move as they like.
      if (details.isMainFrame === false || logic.sameOrigin(details.url, appUrl.origin)) return;
      details.preventDefault();
      openOutside(details.url);
    };
    contents.on("will-navigate", stayOnStudenv);
    contents.on("will-redirect", stayOnStudenv);
    contents.on("will-attach-webview", (event) => event.preventDefault());
    contents.setWindowOpenHandler(({ url }) => {
      if (!logic.sameOrigin(url, appUrl.origin)) {
        openOutside(url);
        return { action: "deny" };
      }
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          title: "Studenv",
          icon: ICON,
          backgroundColor: BACKGROUND,
          autoHideMenuBar: true,
          webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
        },
      };
    });
    addContextMenu(contents, openOutside);
  });
}

// ─── Right-click ─────────────────────────────────────────────
/** Electron has no right-click menu of its own. Pages with theirs (boards) keep it. */
function addContextMenu(contents, openOutside) {
  contents.on("context-menu", (_event, params) => {
    const items = [];
    const group = (entries) => {
      if (!entries.length) return;
      if (items.length) items.push({ type: "separator" });
      items.push(...entries);
    };

    if (params.misspelledWord) {
      group([
        ...params.dictionarySuggestions.map((word) => ({ label: word, click: () => contents.replaceMisspelling(word) })),
        { label: "Add to dictionary", click: () => contents.session.addWordToSpellCheckerDictionary(params.misspelledWord) },
      ]);
    }
    if (params.linkURL && logic.canOpenOutside(params.linkURL)) {
      group([
        { label: "Open link in browser", click: () => openOutside(params.linkURL) },
        { label: "Copy link", click: () => clipboard.writeText(params.linkURL) },
      ]);
    }
    if (params.mediaType === "image") {
      group([
        { label: "Copy image", click: () => contents.copyImageAt(params.x, params.y) },
        { label: "Save image…", click: () => contents.downloadURL(params.srcURL) },
      ]);
    }
    if (params.isEditable) {
      group([
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut", enabled: params.editFlags.canCut },
        { role: "copy", enabled: params.editFlags.canCopy },
        { role: "paste", enabled: params.editFlags.canPaste },
        { role: "selectAll" },
      ]);
    } else if (params.selectionText) {
      group([{ role: "copy" }]);
    }

    if (items.length) Menu.buildFromTemplate(items).popup({ window: BrowserWindow.fromWebContents(contents) ?? undefined });
  });
}

// ─── Microphone, camera and other permissions ────────────────
async function allowedBySystem(mediaTypes) {
  if (process.platform !== "darwin") return true;
  for (const type of mediaTypes) {
    const device = type === "video" ? "camera" : "microphone";
    if (await systemPreferences.askForMediaAccess(device)) continue;
    const { response } = await dialog.showMessageBox({
      type: "info",
      message: `Studenv can't use the ${device}`,
      detail: `Allow Studenv in System Settings → Privacy & Security → ${device === "camera" ? "Camera" : "Microphone"}, then try again.`,
      buttons: ["Open System Settings", "Not now"],
      cancelId: 1,
    });
    if (response === 0) {
      const pane = device === "camera" ? "Privacy_Camera" : "Privacy_Microphone";
      void shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${pane}`);
    }
    return false;
  }
  return true;
}

function limitPermissions(appUrl) {
  const allowed = (permission, url) => rules.mayUse(permission, url, appUrl.origin);
  session.defaultSession.setPermissionRequestHandler((_contents, permission, done, details) => {
    if (!allowed(permission, details.requestingUrl)) return done(false);
    if (permission !== "media") return done(true);
    allowedBySystem(details.mediaTypes ?? []).then(done, () => done(false));
  });
  session.defaultSession.setPermissionCheckHandler((_contents, permission, requestingOrigin) =>
    allowed(permission, requestingOrigin),
  );
  // Screen sharing uses the system's own picker where there is one (macOS 15 and
  // later). Elsewhere it is refused: nothing is shared without the user choosing.
  session.defaultSession.setDisplayMediaRequestHandler((_request, done) => done({}), { useSystemPicker: true });
}

// ─── Downloads ───────────────────────────────────────────────
/** Every download asks where to save, and says so if it fails. */
function watchDownloads() {
  session.defaultSession.on("will-download", (_event, item) => {
    item.setSaveDialogOptions({
      title: "Save file",
      defaultPath: path.join(app.getPath("downloads"), path.basename(item.getFilename())),
    });
    item.once("done", (_done, state) => {
      if (state === "completed") {
        if (process.platform === "darwin") app.dock?.downloadFinished(item.getSavePath());
      } else if (state === "interrupted") {
        dialog.showErrorBox("Download didn't finish", `${item.getFilename()} couldn't be saved. Please try again.`);
      }
    });
  });
}

// ─── Window size and place ───────────────────────────────────
const boundsFile = () => path.join(app.getPath("userData"), "window.json");

function savedWindow(workAreas) {
  try {
    return rules.windowBounds(JSON.parse(fs.readFileSync(boundsFile(), "utf8")), workAreas);
  } catch {
    return rules.windowBounds(null, workAreas);
  }
}

function rememberWindow(window) {
  window.on("close", () => {
    try {
      fs.writeFileSync(boundsFile(), JSON.stringify({ ...window.getNormalBounds(), maximized: window.isMaximized() }));
    } catch (error) {
      console.error("Could not save the window size:", error.message);
    }
  });
}

// ─── Loading and offline screens ─────────────────────────────
const SCREENS = path.join(__dirname, "screen.html");

/** Shows Studenv's loading screen, opens the website, and covers failures with the offline screen. */
function openStudenv(window, appUrl) {
  const contents = window.webContents;
  const start = new URL("/dashboard", appUrl).href;
  // The loading and offline screens must not stay behind the Back button.
  let leaveScreenBehind = true;

  // Chromium also "finishes loading" its own error page under the website's
  // address, so only a real answer from the server counts as arriving.
  let arrived = false;
  contents.on("did-navigate", (_event, url, responseCode) => {
    arrived = responseCode > 0 && logic.sameOrigin(url, appUrl.origin);
  });

  // The offline screen waits until the failed load has completely stopped.
  // Opened any sooner, it loads but is never drawn: a black window.
  let offlineRetry = null;
  contents.on("did-stop-loading", () => {
    if (!offlineRetry) return;
    const retry = offlineRetry;
    offlineRetry = null;
    void window.loadFile(SCREENS, { query: { state: "offline", retry } });
  });
  contents.on("did-fail-load", (_event, code, _description, url, isMainFrame) => {
    // -3 is a load the page itself cancelled.
    if (!isMainFrame || code === -3) return;
    arrived = false;
    leaveScreenBehind = true;
    offlineRetry = logic.sameOrigin(url, appUrl.origin) ? url : start;
  });
  contents.on("did-finish-load", () => {
    if (leaveScreenBehind && arrived) {
      leaveScreenBehind = false;
      contents.navigationHistory.clear();
    }
  });
  contents.on("render-process-gone", (_event, details) => {
    if (details.reason !== "clean-exit" && !window.isDestroyed()) {
      leaveScreenBehind = true;
      void window.loadURL(start).catch(() => {});
    }
  });
  // Mouse back and forward buttons (Windows), and the two-finger swipe (Mac).
  window.on("app-command", (_event, command) => {
    if (command === "browser-backward") goBack(contents);
    if (command === "browser-forward") goForward(contents);
  });
  window.on("swipe", (_event, direction) => {
    if (direction === "left") goBack(contents);
    if (direction === "right") goForward(contents);
  });

  contents.once("did-finish-load", () => {
    void window.loadURL(start).catch(() => {
      // did-fail-load shows the offline screen.
    });
  });
  void window.loadFile(SCREENS, { query: { state: "loading" } });
}

const goBack = (contents) => {
  if (contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
};
const goForward = (contents) => {
  if (contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward();
};

// ─── Menu ────────────────────────────────────────────────────
function buildMenu({ appUrl, mainWindow, timerMenu }) {
  const mac = process.platform === "darwin";
  const inMain = (action) => () => {
    const window = BrowserWindow.getFocusedWindow() ?? mainWindow();
    if (window && !window.isDestroyed()) action(window.webContents);
  };

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(mac ? [{ role: "appMenu" }] : []),
      { role: "fileMenu" },
      { role: "editMenu" },
      {
        label: "View",
        submenu: [
          { role: "reload" },
          { type: "separator" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { type: "separator" },
          { role: "togglefullscreen" },
          ...(app.isPackaged ? [] : [{ role: "toggleDevTools" }]),
        ],
      },
      {
        label: "Go",
        submenu: [
          { label: "Back", accelerator: mac ? "Cmd+[" : "Alt+Left", click: inMain(goBack) },
          { label: "Forward", accelerator: mac ? "Cmd+]" : "Alt+Right", click: inMain(goForward) },
          {
            label: "Home",
            accelerator: "CmdOrCtrl+Shift+H",
            click: inMain((contents) => void contents.loadURL(new URL("/dashboard", appUrl).href).catch(() => {})),
          },
        ],
      },
      timerMenu,
      { role: "windowMenu" },
      {
        role: "help",
        submenu: [
          { label: "Open Studenv in browser", click: () => void shell.openExternal(appUrl.href) },
          ...(mac ? [] : [{ label: "About Studenv", click: () => app.showAboutPanel() }]),
        ],
      },
    ]),
  );
}

module.exports = {
  BACKGROUND,
  ICON,
  brand,
  buildMenu,
  keepOnStudenv,
  limitPermissions,
  openStudenv,
  rememberWindow,
  savedWindow,
  watchDownloads,
};
