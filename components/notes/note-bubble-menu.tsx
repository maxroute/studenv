"use client";

import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Bold, Code, Heading2, Highlighter, Italic, Layers, Link2, Strikethrough, Underline } from "lucide-react";
import type { ReactNode } from "react";

type Action = { label: string; icon: ReactNode; active?: boolean; run: () => void };

/**
 * Formatting for the selected text, shown above the selection. Hidden in code
 * blocks and for empty selections, so it never covers the caret while typing.
 */
export function NoteBubbleMenu({ editor, onFlashcard }: { editor: Editor; onFlashcard: () => void }) {
  const chain = () => editor.chain().focus();
  const actions: Action[] = [
    { label: "Bold", icon: <Bold size={15} />, active: editor.isActive("bold"), run: () => chain().toggleBold().run() },
    { label: "Italic", icon: <Italic size={15} />, active: editor.isActive("italic"), run: () => chain().toggleItalic().run() },
    { label: "Underline", icon: <Underline size={15} />, active: editor.isActive("underline"), run: () => chain().toggleUnderline().run() },
    { label: "Strikethrough", icon: <Strikethrough size={15} />, active: editor.isActive("strike"), run: () => chain().toggleStrike().run() },
    { label: "Inline code", icon: <Code size={15} />, active: editor.isActive("code"), run: () => chain().toggleCode().run() },
    { label: "Highlight", icon: <Highlighter size={15} />, active: editor.isActive("highlight"), run: () => chain().toggleHighlight().run() },
    {
      label: "Link",
      icon: <Link2 size={15} />,
      active: editor.isActive("link"),
      run: () => {
        if (editor.isActive("link")) {
          chain().unsetLink().run();
          return;
        }
        const href = window.prompt("Link address (https://…)");
        if (!href?.trim()) return;
        const safe = /^(https?:|mailto:)/i.test(href.trim()) ? href.trim() : `https://${href.trim()}`;
        chain().extendMarkRange("link").setLink({ href: safe }).run();
      },
    },
    { label: "Turn into heading", icon: <Heading2 size={15} />, active: editor.isActive("heading", { level: 2 }), run: () => chain().toggleHeading({ level: 2 }).run() },
    { label: "Make flashcard", icon: <Layers size={15} />, run: onFlashcard },
  ];

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor: current, state }) =>
        current.isEditable && !state.selection.empty && !current.isActive("codeBlock") && state.doc.textBetween(state.selection.from, state.selection.to).trim().length > 0
      }
      options={{ placement: "top", offset: 8 }}
    >
      <div className="note-bubble" role="toolbar" aria-label="Format selection">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            title={action.label}
            aria-label={action.label}
            aria-pressed={action.active ?? undefined}
            className={action.active ? "active" : undefined}
            onPointerDown={(event) => event.preventDefault()}
            onClick={action.run}
          >
            {action.icon}
          </button>
        ))}
      </div>
    </BubbleMenu>
  );
}
