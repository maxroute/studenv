// Draws every app icon and splash image from the Studenv mark, so the web app,
// the Mac and Windows apps and the Android app all carry the same logo.
// Run from desktop/:  npm run icons
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
// One logo everywhere, as in the website's header: a black mark on Studenv
// yellow. Where a platform cuts its own icon shape, the yellow fills that shape;
// everywhere else it is the round badge.
const INK = "#050505";
const YELLOW = "#ffde0a";

// Traced from the website's logo, public/branding/logo-variant1.png (at three
// times its size), so the icons stay sharp at any size.
const MARK = [
  "M318 423C270 405 242 356 243 300C244 218 312 163 410 163L470 163",
  "M430 120L474 162L430 199",
  "M513 406C566 425 596 472 596 525C596 611 524 669 428 669L356 669",
  "M397 628L351 669L397 718",
];
const CENTRE = { x: 412, y: 418 };
const STROKE = 35;
const DOT = 47;
const HEIGHT = 633;

/** The mark centred at (cx, cy); `height` is how tall it is drawn. */
function mark(cx, cy, height) {
  const scale = height / HEIGHT;
  const paths = MARK.map((d) => `<path d="${d}"/>`).join("");
  return (
    `<g transform="translate(${cx} ${cy}) scale(${scale}) translate(${-CENTRE.x} ${-CENTRE.y})">` +
    `<g fill="none" stroke="${INK}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round">${paths}</g>` +
    `<circle cx="${CENTRE.x}" cy="${CENTRE.y}" r="${DOT}" fill="${INK}"/></g>`
  );
}

/** The round Studenv badge, `size` across and centred at (cx, cy). */
const badge = (cx, cy, size) =>
  `<circle cx="${cx}" cy="${cy}" r="${size / 2}" fill="${YELLOW}"/>` + mark(cx, cy, size * 0.79);

const svg = (width, height, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;

/** A square icon: `inset` is the clear border and `radius` the corner, as parts of the size. */
function icon(size, { round, inset = 0, radius = 0, markHeight }) {
  if (round) return svg(size, size, badge(size / 2, size / 2, size * 0.98));
  const side = size * (1 - 2 * inset);
  const tile = `<rect x="${size * inset}" y="${size * inset}" width="${side}" height="${side}" rx="${side * radius}" fill="${YELLOW}"/>`;
  return svg(size, size, tile + mark(size / 2, size / 2, side * markHeight));
}

// Full square, for places that cut their own shape (iPhone, Android).
const SQUARE = { markHeight: 0.68 };
// Full square with the mark inside the safe circle of a "maskable" icon.
const MASKABLE = { markHeight: 0.6 };
// The badge itself, for places that show the image as it is (browser, Windows).
const ROUNDED = { round: true };
// Apple's Mac grid: an 824 tile on a 1024 canvas.
const MAC = { inset: 100 / 1024, radius: 0.225, markHeight: 0.7 };

const splash = (width, height) =>
  svg(width, height, `<rect width="${width}" height="${height}" fill="${INK}"/>` + badge(width / 2, height / 2, width * 0.34));

// Portrait iPhone and iPad screens, as [width, height, pixel ratio] in points.
const SPLASH_SCREENS = require("../../lib/pwa/splash-screens.json");

async function render(window, source, width, height) {
  const data = await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = ${width};
      canvas.height = ${height};
      canvas.getContext("2d").drawImage(image, 0, 0, ${width}, ${height});
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => reject(new Error("The icon could not be drawn."));
    image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(${JSON.stringify(source)});
  })`);
  return Buffer.from(data.slice(data.indexOf(",") + 1), "base64");
}

function write(relative, contents) {
  const target = path.join(ROOT, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

/** A Windows .ico holding PNG images, one per size. */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, index) => {
    const at = 6 + 16 * index;
    header.writeUInt8(size === 256 ? 0 : size, at);
    header.writeUInt8(size === 256 ? 0 : size, at + 1);
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(png.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map((image) => image.png)]);
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false });
  await window.loadURL("data:text/html,<title>icons</title>");
  const png = (size, style) => render(window, icon(size, style), size, size);

  // Browser tab.
  write("public/branding/browser-favicon.png", await png(200, ROUNDED));
  write("public/favicon.svg", svg(100, 100, badge(50, 50, 98)) + "\n");

  // Web app (installed from the browser).
  for (const size of [192, 512]) {
    write(`public/icons/app/icon-${size}.png`, await png(size, ROUNDED));
    write(`public/icons/app/maskable-${size}.png`, await png(size, MASKABLE));
  }
  write("public/icons/app/apple-touch-icon.png", await png(180, SQUARE));
  for (const [width, height, ratio] of SPLASH_SCREENS) {
    const [w, h] = [width * ratio, height * ratio];
    write(`public/icons/splash/${w}x${h}.png`, await render(window, splash(w, h), w, h));
  }

  // Mac: the sizes iconutil expects.
  for (const base of [16, 32, 128, 256, 512]) {
    write(`desktop/assets/icon.iconset/icon_${base}x${base}.png`, await png(base, MAC));
    write(`desktop/assets/icon.iconset/icon_${base}x${base}@2x.png`, await png(base * 2, MAC));
  }

  // Windows.
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = [];
  for (const size of sizes) images.push({ size, png: await png(size, ROUNDED) });
  write("desktop/assets/icon.ico", ico(images));
  write("desktop/assets/icon.png", await png(512, ROUNDED));

  // For the desktop app's own loading and offline pages.
  write("desktop/assets/mark.svg", svg(282, 282, badge(141, 141, 278)));

  // Android launcher icons and splash.
  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [name, factor] of Object.entries(densities)) {
    const res = `android/app/src/main/res/mipmap-${name}`;
    write(`${res}/ic_launcher.png`, await png(48 * factor, ROUNDED));
    // Adaptive icon front layer: 108dp, of which the middle 66dp is always visible.
    const front = 108 * factor;
    write(`${res}/ic_launcher_foreground.png`, await render(window, svg(front, front, mark(front / 2, front / 2, front * 0.48)), front, front));
    const logo = 160 * factor;
    write(
      `android/app/src/main/res/drawable-${name}/splash.png`,
      await render(window, svg(logo, logo, badge(logo / 2, logo / 2, logo * 0.9)), logo, logo),
    );
  }
  // Google Play and download pages want a 512 square.
  write("android/store-icon-512.png", await png(512, SQUARE));

  console.log("Icons written.");
  app.quit();
});
