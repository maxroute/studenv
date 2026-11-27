/**
 * Profile photos live with every other upload (object storage in production,
 * public/uploads in local development) and are served from /avatars/<name>.
 * Pure helpers.
 */
const TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" } as const;
export type AvatarExtension = keyof typeof TYPES;

/** `<user id>-<random id>.<extension>`: no folders, dots or anything else that could leave `avatars/`. */
const AVATAR_NAME = /^[a-zA-Z0-9-]{1,120}\.(jpg|png|webp|gif)$/;

export function avatarFile(name: string): { key: string; contentType: string } | null {
  const match = AVATAR_NAME.exec(name);
  return match ? { key: `avatars/${name}`, contentType: TYPES[match[1] as AvatarExtension] } : null;
}

export const avatarContentType = (extension: AvatarExtension) => TYPES[extension];

/** The image type the bytes really are, whatever the upload claims; null when it is none of the allowed ones. */
export function imageExtension(bytes: Uint8Array): AvatarExtension | null {
  const starts = (...signature: number[]) => signature.every((value, index) => bytes[index] === value);
  const text = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (starts(0xff, 0xd8, 0xff)) return "jpg";
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "webp";
  if (text(0, 6) === "GIF87a" || text(0, 6) === "GIF89a") return "gif";
  return null;
}
