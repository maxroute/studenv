const [major, minor] = process.versions.node.split(".").map(Number);

const minimumMajor = 20;
const minimumMinor = 9;
const maximumSupportedMajor = 23;

const tooOld =
  Number.isFinite(major) &&
  Number.isFinite(minor) &&
  (major < minimumMajor || (major === minimumMajor && minor < minimumMinor));
const tooNew = Number.isFinite(major) && major > maximumSupportedMajor;

if (!tooOld && !tooNew) {
  process.exit(0);
}

const lines = [
  "",
  "Unsupported Node.js version for local dev in this repo.",
  `Detected: ${process.versions.node}`,
  "Recommended: Node.js 22 LTS (tested choice: 22.22.3).",
  "Why: this project currently hits broken Next.js asset serving in dev on Node 24.x.",
  "",
  "Use one of these:",
  "  nvm use 22.22.3",
  "  fnm use 22.22.3",
  "  volta install node@22.22.3",
  "",
  "If you need a temporary workaround without switching Node yet, run:",
  "  npm run preview",
  "",
];

console.error(lines.join("\n"));
process.exit(1);
