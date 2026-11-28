import screens from "./splash-screens.json";

/**
 * iPhone and iPad show a splash image only when one matches the screen exactly.
 * The images come from `desktop/scripts/make-icons.js`, which reads the same list.
 */
export const appleStartupImages = screens.map(([width, height, ratio]) => ({
  url: `/icons/splash/${width * ratio}x${height * ratio}.png`,
  media: `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`,
}));
