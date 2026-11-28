// Builds Studenv.app and a .dmg from the Electron runtime in node_modules, using
// only tools that come with macOS (iconutil, plutil, codesign, hdiutil).
//
//   npm run package:mac
//
// The app is signed "ad hoc": it runs, but macOS can't tell who made it, so the
// first launch needs "Open Anyway". Removing that step needs a paid Apple
// Developer account.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const HERE = path.join(__dirname, "..");
const ELECTRON = path.join(HERE, "node_modules", "electron", "dist");
const { version } = require("../package.json");
const ID = "online.studenv.app";

// Everything the app runs; tests and build scripts stay out.
const APP_FILES = [
  "main.js",
  "app-shell.js",
  "shell-rules.js",
  "smoke-test.js",
  "timer-logic.js",
  "preload.js",
  "preload-mini.js",
  "mini.html",
  "mini.css",
  "mini.js",
  "screen.html",
  "screen.css",
  "screen.js",
  "package.json",
  "assets/icon.png",
  "assets/mark.svg",
];

const run = (command, args) => execFileSync(command, args, { stdio: ["ignore", "pipe", "inherit"] }).toString();
const setText = (plist, key, value) => run("plutil", ["-replace", key, "-string", value, plist]);
const remove = (plist, key) => {
  try {
    execFileSync("plutil", ["-remove", key, plist], { stdio: "ignore" });
  } catch {
    // The key wasn't there.
  }
};

/** The processor the downloaded runtime is built for. */
function runtimeArch() {
  const description = run("lipo", ["-archs", path.join(ELECTRON, "Electron.app", "Contents", "MacOS", "Electron")]);
  return description.trim() === "x86_64" ? "x64" : "arm64";
}

function brandHelpers(frameworks) {
  for (const suffix of ["", " (GPU)", " (Plugin)", " (Renderer)"]) {
    const from = `Electron Helper${suffix}`;
    const name = `Studenv Helper${suffix}`;
    const bundle = path.join(frameworks, `${name}.app`);
    fs.renameSync(path.join(frameworks, `${from}.app`), bundle);
    fs.renameSync(path.join(bundle, "Contents", "MacOS", from), path.join(bundle, "Contents", "MacOS", name));
    const plist = path.join(bundle, "Contents", "Info.plist");
    const kind = suffix.replace(/[ ()]/g, "").toLowerCase();
    setText(plist, "CFBundleName", name);
    setText(plist, "CFBundleDisplayName", name);
    setText(plist, "CFBundleExecutable", name);
    setText(plist, "CFBundleIdentifier", `${ID}.helper${kind ? `.${kind}` : ""}`);
  }
}

function buildApp(out) {
  const app = path.join(out, "Studenv.app");
  // ditto keeps the links inside the frameworks as links.
  run("ditto", [path.join(ELECTRON, "Electron.app"), app]);
  const contents = path.join(app, "Contents");
  const resources = path.join(contents, "Resources");

  fs.renameSync(path.join(contents, "MacOS", "Electron"), path.join(contents, "MacOS", "Studenv"));
  fs.rmSync(path.join(resources, "default_app.asar"), { force: true });
  fs.rmSync(path.join(resources, "electron.icns"), { force: true });
  run("iconutil", ["-c", "icns", path.join(HERE, "assets", "icon.iconset"), "-o", path.join(resources, "studenv.icns")]);

  for (const file of APP_FILES) {
    const target = path.join(resources, "app", file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(HERE, file), target);
  }

  // The open-source licences of what the app is built on must travel with it.
  fs.mkdirSync(path.join(resources, "licenses"), { recursive: true });
  for (const file of ["LICENSE", "LICENSES.chromium.html"]) {
    fs.copyFileSync(path.join(ELECTRON, file), path.join(resources, "licenses", file));
  }

  const plist = path.join(contents, "Info.plist");
  setText(plist, "CFBundleName", "Studenv");
  setText(plist, "CFBundleDisplayName", "Studenv");
  setText(plist, "CFBundleExecutable", "Studenv");
  setText(plist, "CFBundleIdentifier", ID);
  setText(plist, "CFBundleIconFile", "studenv.icns");
  setText(plist, "CFBundleShortVersionString", version);
  setText(plist, "CFBundleVersion", version);
  setText(plist, "LSApplicationCategoryType", "public.app-category.education");
  setText(plist, "NSHumanReadableCopyright", "© 2026 Studenv");
  // What macOS shows when it asks the student for permission.
  setText(plist, "NSMicrophoneUsageDescription", "Studenv uses the microphone when you talk to Rangan or join a study call.");
  setText(plist, "NSCameraUsageDescription", "Studenv uses the camera when you turn on video in a study call.");
  setText(plist, "NSAudioCaptureUsageDescription", "Studenv records sound only when you share it in a study call.");
  setText(plist, "NSBluetoothAlwaysUsageDescription", "Studenv uses Bluetooth only for devices you choose, such as headsets.");
  setText(plist, "NSBluetoothPeripheralUsageDescription", "Studenv uses Bluetooth only for devices you choose, such as headsets.");
  // There is no bundled archive to check, and the app only loads secure pages.
  remove(plist, "ElectronAsarIntegrity");
  run("plutil", ["-replace", "NSAppTransportSecurity", "-json", '{"NSAllowsLocalNetworking":true}', plist]);

  brandHelpers(path.join(contents, "Frameworks"));

  // Finder and iCloud add attributes that codesign refuses.
  run("xattr", ["-cr", app]);
  run("codesign", ["--force", "--deep", "--sign", "-", app]);
  run("codesign", ["--verify", "--deep", "--strict", app]);
  return app;
}

/** A disk image with the app beside a shortcut to Applications, wearing the Studenv icon. */
function buildDiskImage(app, out, image) {
  const staging = path.join(out, "dmg");
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  run("ditto", [app, path.join(staging, "Studenv.app")]);
  fs.symlinkSync("/Applications", path.join(staging, "Applications"));
  fs.copyFileSync(path.join(app, "Contents", "Resources", "studenv.icns"), path.join(staging, ".VolumeIcon.icns"));

  const writable = path.join(out, "writable.dmg");
  const mount = path.join(out, "mount");
  run("hdiutil", ["create", "-volname", "Studenv", "-srcfolder", staging, "-format", "UDRW", "-ov", writable]);
  fs.mkdirSync(mount, { recursive: true });
  run("hdiutil", ["attach", writable, "-mountpoint", mount, "-nobrowse"]);
  try {
    run("xcrun", ["SetFile", "-a", "C", mount]);
  } finally {
    run("hdiutil", ["detach", mount]);
  }
  run("hdiutil", ["convert", writable, "-format", "UDZO", "-ov", "-o", image]);
  fs.rmSync(writable);
  fs.rmSync(staging, { recursive: true, force: true });
  fs.rmdirSync(mount);
  return image;
}

if (process.platform !== "darwin") throw new Error("The Mac app can only be built on a Mac.");
const arch = runtimeArch();
// Built in a temporary folder: synced folders such as Desktop keep adding the
// attributes codesign refuses.
const out = fs.mkdtempSync(path.join(os.tmpdir(), "studenv-mac-"));
const dist = path.join(HERE, "dist");
fs.mkdirSync(dist, { recursive: true });
const app = buildApp(out);
const image = buildDiskImage(app, out, path.join(dist, `Studenv-${version}-mac-${arch}.dmg`));
console.log(`App: ${app}\nDisk image: ${path.relative(HERE, image)}`);
