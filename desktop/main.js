// The Studenv desktop app: the website in a window, and a small timer that
// floats above other apps while a focus session runs and Studenv is not in front.
// The website owns the session; the small timer only shows it and asks for changes.
const { app, BrowserWindow, ipcMain, screen } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const logic = require("./timer-logic");
const studenv = require("./app-shell");
const { MIN_SIZE } = require("./shell-rules");
const { smokeTest } = require("./smoke-test");

// The installed app opens the live site; `npm start` opens the copy on this computer.
const APP_URL = logic.appUrl(
  process.env.STUDENV_APP_URL || (app.isPackaged ? "https://studenv-online.vercel.app" : undefined),
);
const MINI_SIZE = { width: 340, height: 84 };
const BACKGROUND = studenv.BACKGROUND;

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
  const areas = [screen.getPrimaryDisplay(), ...screen.getAllDisplays()].map((display) => display.workArea);
  const { maximized, ...bounds } = studenv.savedWindow(areas);
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    backgroundColor: BACKGROUND,
    title: "Studenv",
    icon: studenv.ICON,
    // Windows: the menu stays out of the way until Alt is pressed.
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      // The timer must keep counting while the window is behind other apps.
      backgroundThrottling: false,
    },
  });
  if (maximized) mainWindow.maximize();
  studenv.rememberWindow(mainWindow);

  for (const event of ["focus", "blur", "show", "hide", "minimize", "restore"]) {
    mainWindow.on(event, refreshAfterFocusChange);
  }
  // On a Mac, closing the window keeps the session going; Quit ends the app.
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

  studenv.openStudenv(mainWindow, APP_URL);
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

// ─── Menu ────────────────────────────────────────────────────
function timerMenu() {
  return {
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
  };
}

// ─── Life cycle ──────────────────────────────────────────────
studenv.brand();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  studenv.keepOnStudenv(APP_URL);
  app.on("second-instance", showMainWindow);
  app.on("activate", showMainWindow);
  app.on("before-quit", () => {
    quitting = true;
    if (alive(miniWindow)) miniWindow.destroy();
  });
  app.on("window-all-closed", () => app.quit());
  void app.whenReady().then(() => {
    loadSettings();
    studenv.limitPermissions(APP_URL);
    studenv.watchDownloads();
    studenv.buildMenu({ appUrl: APP_URL, mainWindow: () => mainWindow, timerMenu: timerMenu() });
    createMainWindow();
    createMiniWindow();
    smokeTest(mainWindow, APP_URL);
  });
}
