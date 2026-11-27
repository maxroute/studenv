/** Creates an empty page, on its own or inside `parentId`, and returns its id. A page holds everything: text, files, videos, links. */
export async function createEmptyPage(parentId: string | null = null): Promise<string> {
  const response = await fetch("/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Untitled", parentId }),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || typeof json?.data?.id !== "string") throw new Error(json?.error ?? "The page could not be created.");
  return json.data.id;
}
