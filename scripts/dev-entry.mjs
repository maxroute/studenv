import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const localNodeDir = "C:\\tmp\\node22\\node-v22.22.3-win-x64";
const localNodeExe = path.join(localNodeDir, "node.exe");

const major = Number(process.versions.node.split(".")[0] ?? "0");
const useCurrentNode = major >= 20 && major < 24;

const env = { ...process.env };

let command;
let args;

if (useCurrentNode) {
  command = process.platform === "win32" ? "npx.cmd" : "npx";
  args = ["tsx", "watch", "server.ts"];
} else if (existsSync(localNodeExe)) {
  command = localNodeExe;
  args = [
    path.join(localNodeDir, "node_modules", "npm", "bin", "npx-cli.js"),
    "tsx",
    "watch",
    "server.ts",
  ];
  env.PATH = `${localNodeDir}${path.delimiter}${env.PATH ?? ""}`;
} else {
  console.error("");
  console.error("`npm run dev` needs Node 20-23 for this repo.");
  console.error(`Detected Node ${process.versions.node}.`);
  console.error("No local fallback runtime was found at:");
  console.error(`  ${localNodeExe}`);
  console.error("");
  console.error("Fix options:");
  console.error("  1. Install/use Node 22.22.3");
  console.error("  2. Or download the local fallback runtime again");
  console.error("");
  process.exit(1);
}

const child = spawn(command, args, {
  stdio: "inherit",
  shell: false,
  env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
