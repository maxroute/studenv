"use client";

import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { useEditorState } from "@tiptap/react";
import { PluginKey } from "@tiptap/pm/state";
import { Copy, ExternalLink, Pencil, Unlink } from "lucide-react";
import toast from "react-hot-toast";
import { linkTarget, type LinkTarget } from "@/lib/notes/link-target";
import { editLink } from "./editor-actions";

const linkMenuKey = new PluginKey("noteLinkMenu");

/** Opens a link: web addresses in a new tab, places in Studenv in this one. */
export function openLink(target: LinkTarget, navigate: (url: string) => void) {
  if (target.kind === "app") navigate(target.url);
  else window.open(target.url, "_blank", "noopener,noreferrer");
}

/**
 * Shown when the caret is in a link (a click or a tap on it): open it, copy its
 * address, change or remove it. Clicking a link still places the caret, so the
 * words stay easy to edit.
 */
export function LinkMenu({ editor, navigate }: { editor: Editor; navigate: (url: string) => void }) {
  const target = useEditorState({
    editor,
    selector: ({ editor: current }) => (current.isActive("link") ? linkTarget(current.getAttributes("link")) : null),
    equalityFn: (a, b) => a?.url === b?.url,
  });

  return (
    <BubbleMenu
      editor={editor}
      pluginKey={linkMenuKey}
      shouldShow={({ editor: current, state }) => current.isEditable && state.selection.empty && current.isActive("link")}
      // Above the link: on a phone, the editing bar over the keyboard covers what is below.
      options={{ placement: "top", offset: 8 }}
    >
      <div className="note-bubble note-link-menu" role="toolbar" aria-label="Link">
        {target ? (
          <button type="button" className="note-link-open" onPointerDown={(event) => event.preventDefault()} onClick={() => openLink(target, navigate)}>
            <ExternalLink size={14} aria-hidden="true" />
            <span>Open {target.label}</span>
          </button>
        ) : null}
        {target?.kind === "web" ? (
          <button
            type="button"
            title="Copy link"
            aria-label="Copy link"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() =>
              void navigator.clipboard.writeText(target.url).then(
                () => toast.success("Link copied."),
                () => toast.error("The link couldn't be copied."),
              )
            }
          >
            <Copy size={14} />
          </button>
        ) : null}
        <button type="button" title="Edit link" aria-label="Edit link" onPointerDown={(event) => event.preventDefault()} onClick={() => void editLink(editor)}>
          <Pencil size={14} />
        </button>
        <button type="button" title="Remove link" aria-label="Remove link" onPointerDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}>
          <Unlink size={14} />
        </button>
      </div>
    </BubbleMenu>
  );
}
