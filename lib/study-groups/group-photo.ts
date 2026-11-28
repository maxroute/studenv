/**
 * A study group's picture. Stored with the other uploads under
 * `group-photos/<name>` and served to the group's members from
 * `/group-photos/<group id>/<name>`. Pure helpers.
 */
import { avatarContentType, type AvatarExtension } from "@/lib/storage/avatar";

export const MAX_GROUP_PHOTO_SIZE = 5 * 1024 * 1024;

/** `<group id>-<random id>.<extension>`: no folders or dots that could leave `group-photos/`. */
const GROUP_PHOTO_NAME = /^([a-zA-Z0-9]{1,60})-[a-zA-Z0-9-]{1,80}\.(jpg|png|webp|gif)$/;

export function groupPhotoName(groupId: string, randomId: string, extension: AvatarExtension) {
  return `${groupId}-${randomId}.${extension}`;
}

/** The stored file for a photo name, only when the name belongs to that group. */
export function groupPhotoFile(
  groupId: string,
  name: string,
): { key: string; contentType: string } | null {
  const match = GROUP_PHOTO_NAME.exec(name);
  if (!match || match[1] !== groupId) {
    return null;
  }

  return {
    key: `group-photos/${name}`,
    contentType: avatarContentType(match[2] as AvatarExtension),
  };
}

export function groupPhotoUrl(groupId: string, name: string | null) {
  return name ? `/group-photos/${encodeURIComponent(groupId)}/${encodeURIComponent(name)}` : null;
}
