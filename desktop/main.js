// Studenv desktop prototype: the website in a window, and a small timer that
// floats above other apps while a focus session runs and Studenv is not in front.
// The website owns the session; the small timer only shows it and asks for changes.
const { app, BrowserWindow, Menu, ipcMain, screen, session, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const logic = require("./timer-logic");

const APP_URL = logic.appUrl(process.env.STUDENV_APP_URL);
const MINI_SIZE = { width: 340, height: 84 };
const BACKGROUND = "#141310";

let mainWindow = null;
let miniWindow = null;
let quitting = false;

let timer = { status: "idle" };
let hiddenSessionId = null;
let seenFinishedId = null;
let settings = { showOnSwitch: true, position: null };

// ─── Settings (this computer only) ───────────────────────────
const settingsFile = () => path.join(app.getPath("userData"), "timer-settings.json");

function loadSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsFile(), "utf8"));
    settings = { showOnSwitch: saved.showOnSwitch !== false, position: saved.position ?? null };
  } catch {
    // First run, or an unreadable file: keep the defaults.
  }
}

function saveSettings() {
  try {
    fs.writeFileSync(settingsFile(), JSON.stringify(settings));
  } catch (error) {
    console.error("Could not save the timer settings:", error.message);
  }
}

// ─── Small timer ─────────────────────────────────────────────
const alive = (window) => window !== null && !window.isDestroyed();

function mainIsInFront() {
  return alive(mainWindow) && mainWindow.isVisible() && mainWindow.isFocused();
}

function refreshMini() {
  if (!alive(miniWindow)) return;
  const mainFocused = mainIsInFront();
  // A finished session the student has seen in Studenv isn't announced again.
  if (mainFocused && timer.status === "finished") seenFinishedId = timer.sessionId;

  miniWindow.webContents.send("mini:state", timer);
  const show = logic.shouldShowMini({
    state: timer,
    enabled: settings.showOnSwitch,
    mainFocused,
    hiddenSessionId,
    seenFinishedId,
  });
  if (show && !miniWindow.isVisible()) miniWindow.showInactive();
  else if (!show && miniWindow.isVisible()) miniWindow.hide();
}

let refreshSoon = null;
/** Focus moves between windows in two steps; wait until it has settled. */
function refreshAfterFocusChange() {
  clearTimeout(refreshSoon);
  refreshSoon = setTimeout(refreshMini, 200);
}

function createMiniWindow() {
  const workAreas = [screen.getPrimaryDisplay(), ...screen.getAllDisplays()].map((display) => display.workArea);
  miniWindow = new BrowserWindow({
    ...MINI_SIZE,
    ...logic.miniPosition(settings.position, MINI_SIZE, workAreas),
    // A panel takes clicks without pulling the student out of the app they're in.
    type: process.platform === "darwin" ? "panel" : undefined,
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hiddenInMissionControl: true,
    acceptFirstMouse: true,
    backgroundColor: BACKGROUND,
    title: "Studenv timer",
    webPreferences: {
      preload: path.join(__dirname, "preload-mini.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  miniWindow.setAlwaysOnTop(true, "floating");
  miniWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  miniWindow.on("moved", () => {
    const [x, y] = miniWindow.getPosition();
    settings.position = { x, y };
    saveSettings();
  });
  miniWindow.on("closed", () => {
    miniWindow = null;
  });
  void miniWindow.loadFile(path.join(__dirname, "mini.html"));
}

// ─── Main window ─────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 380,
    minHeight: 560,
    backgroundColor: BACKGROUND,
    title: "Studenv",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // The timer must keep counting while the window is behind other apps.
      backgroundThrottling: false,
    },
  });

  for (const event of ["focus", "blur", "show", "hide", "minimize", "restore"]) {
    mainWindow.on(event, refreshAfterFocusChange);
  }
  // Closing the window keeps the session going; Quit ends the app.
  mainWindow.on("close", (event) => {
    if (quitting || process.platform !== "darwin") return;
    event.preventDefault();
    if (mainWindow.isFullScreen()) {
      mainWindow.once("leave-full-screen", () => mainWindow.hide());
      mainWindow.setFullScreen(false);
    } else {
      mainWindow.hide();
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
    if (!quitting) app.quit();
  });
  mainWindow.webContents.on("did-fail-load", (_event, code, _description, _url, isMainFrame) => {
    // -3 is a load the page itself cancelled.
    if (!isMainFrame || code === -3) return;
    void mainWindow.loadFile(path.join(__dirname, "offline.html"), { query: { app: APP_URL.href } });
  });

  void mainWindow.loadURL(APP_URL.href).catch(() => {
    // did-fail-load shows the "can't reach Studenv" page.
  });
}

function showMainWindow() {
  if (!alive(mainWindow)) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  app.focus({ steal: true });
  mainWindow.focus();
}

// ─── Messages ────────────────────────────────────────────────
function fromWebsite(event) {
  return (
    alive(mainWindow) &&
    event.sender === mainWindow.webContents &&
    logic.sameOrigin(event.senderFrame?.url, APP_URL.origin)
  );
}

const fromMini = (event) => alive(miniWindow) && event.sender === miniWindow.webContents;

function ask(command) {
  if (alive(mainWindow)) mainWindow.webContents.send("timer:command", command);
}

ipcMain.on("timer:state", (event, value) => {
  if (!fromWebsite(event)) return;
  const next = logic.parseTimerState(value);
  if (!next) return;
  timer = next;
  refreshMini();
});

ipcMain.on("mini:ready", (event) => {
  if (fromMini(event)) refreshMini();
});

ipcMain.on("mini:action", (event, action) => {
  if (!fromMini(event)) return;
  if (action === "toggle" && timer.status === "running") ask("pause");
  else if (action === "toggle" && timer.status === "paused") ask("resume");
  else if (action === "startBreak" && timer.status === "finished" && timer.canStartBreak) ask("startBreak");
  else if (action === "open") showMainWindow();
  else if (action === "hide" && timer.status !== "idle") {
    hiddenSessionId = timer.sessionId;
    refreshMini();
  }
});

// ─── Safety ──────────────────────────────────────────────────
/** Pages stay on Studenv; every other link opens in the system browser. */
app.on("web-contents-created", (_event, contents) => {
  const openOutside = (url) => {
    if (logic.canOpenOutside(url)) void shell.openExternal(url);
  };
  const stayOnStudenv = (details) => {
    // Frames inside a page (a video player, say) may move as they like.
    if (details.isMainFrame === false || logic.sameOrigin(details.url, APP_URL.origin)) return;
    details.preventDefault();
    openOutside(details.url);
  };
  contents.on("will-navigate", stayOnStudenv);
  contents.on("will-redirect", stayOnStudenv);
  contents.on("will-attach-webview", (event) => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    if (logic.sameOrigin(url, APP_URL.origin)) return { action: "allow" };
    openOutside(url);
    return { action: "deny" };
  });
});

const ALLOWED_FOR_STUDENV = new Set(["media", "notifications", "clipboard-sanitized-write", "clipboard-read"]);

function limitPermissions() {
  const allowed = (permission, url) =>
    permission === "fullscreen" || (ALLOWED_FOR_STUDENV.has(permission) && logic.sameOrigin(url, APP_URL.origin));
  session.defaultSession.setPermissionRequestHandler((_contents, permission, done, details) => {
    done(allowed(permission, details.requestingUrl));
  });
  session.defaultSession.setPermissionCheckHandler((_contents, permission, requestingOrigin) =>
    allowed(permission, requestingOrigin),
  );
}

// ─── Menu ────────────────────────────────────────────────────
function buildMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
      { role: "fileMenu" },
      { role: "editMenu" },
      { role: "viewMenu" },
      {
        label: "Timer",
        submenu: [
          {
            label: "Show timer when I switch away",
            type: "checkbox",
            checked: settings.showOnSwitch,
            click: (item) => {
              settings.showOnSwitch = item.checked;
              // Turning it on again also brings back a timer hidden earlier.
              if (item.checked) hiddenSessionId = null;
              saveSettings();
              refreshMini();
            },
          },
        ],
      },
      { role: "windowMenu" },
    ]),
  );
}

// ─── Life cycle ──────────────────────────────────────────────
app.setName("Studenv");

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showMainWindow);
  app.on("activate", showMainWindow);
  app.on("before-quit", () => {
    quitting = true;
    if (alive(miniWindow)) miniWindow.destroy();
  });
  app.on("window-all-closed", () => app.quit());
  void app.whenReady().then(() => {
    loadSettings();
    limitPermissions();
    buildMenu();
    createMainWindow();
    createMiniWindow();
  });
}
