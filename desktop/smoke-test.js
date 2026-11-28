// `Studenv --smoke-test=<folder>` opens the app, saves a picture and a short
// report of what loaded, and quits. The build machines use it to check that the
// packaged app starts, on a computer nobody is looking at.
const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const logic = require("./timer-logic");

const FLAG = "--smoke-test=";

function smokeTest(window, appUrl) {
  const argument = process.argv.find((value) => value.startsWith(FLAG));
  if (!argument) return;
  const folder = path.resolve(argument.slice(FLAG.length));
  let finished = false;

  const finish = async () => {
    if (finished) return;
    finished = true;
    let report = { ok: false, name: app.getName(), version: app.getVersion() };
    try {
      const contents = window.webContents;
      report = {
        ...report,
        ok: logic.sameOrigin(contents.getURL(), appUrl.origin),
        url: contents.getURL().split("?")[0],
        title: window.getTitle(),
        userAgent: contents.getUserAgent(),
      };
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(path.join(folder, "window.png"), (await contents.capturePage()).toPNG());
    } catch (error) {
      report.error = error.message;
    }
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, "report.json"), JSON.stringify(report, null, 2));
    app.exit(report.ok ? 0 : 1);
  };

  window.webContents.on("did-finish-load", () => {
    if (logic.sameOrigin(window.webContents.getURL(), appUrl.origin)) setTimeout(finish, 8000);
  });
  setTimeout(finish, 60000);
}

module.exports = { smokeTest };
