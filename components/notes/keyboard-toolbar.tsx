"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import {
  AtSign, Bold, CaseSensitive, Highlighter, Italic, KeyboardOff, Layers, Link2, ListChecks, Paperclip, Plus, Strikethrough, Underline,
} from "lucide-react";
import { placeAtVisibleBottom, setFloatingBottomInset } from "@/lib/notes/floating";
import { editLink } from "./editor-actions";
import { FontMenu, TextColorMenu } from "./style-menus";

type Panel = "turn-into" | "attach" | null;

const TURN_INTO: Array<{ label: string; run: (editor: Editor) => void }> = [
  { label: "Text", run: (e) => e.chain().focus().setParagraph().run() },
  { label: "Heading 1", run: (e) => e.chain().focus().setHeading({ level: 1 }).run() },
  { label: "Heading 2", run: (e) => e.chain().focus().setHeading({ level: 2 }).run() },
  { label: "Heading 3", run: (e) => e.chain().focus().setHeading({ level: 3 }).run() },
  { label: "Bulleted list", run: (e) => e.chain().focus().toggleBulletList().run() },
  { label: "Numbered list", run: (e) => e.chain().focus().toggleOrderedList().run() },
  { label: "Quote", run: (e) => e.chain().focus().toggleBlockquote().run() },
  { label: "Code", run: (e) => e.chain().focus().toggleCodeBlock().run() },
];

/** Cancelling the press keeps the editor focused (and the keyboard open) on iOS. */
const keepFocus = (event: React.PointerEvent | React.MouseEvent) => event.preventDefault();

/**
 * The phone toolbar, docked above the keyboard while the note is being
 * edited. Typing: insert, text style, to-do, link a page, attach, hide the
 * keyboard. With text selected: formatting. It replaces the floating bubble
 * on touch screens, which fought with the system's own Cut / Copy / Paste bar.
 */
export function KeyboardToolbar({
  editor, onFlashcard, onAttach,
}: {
  editor: Editor;
  onFlashcard: () => void;
  onAttach: Array<{ label: string; run: (editor: Editor) => void }>;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [, setTick] = useState(0);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    const onFocus = () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      setVisible(true);
    };
    // A short delay: tapping one of the bar's own menus may blur the editor for a moment.
    const onBlur = () => {
      hideTimer.current = window.setTimeout(() => {
        setVisible(false);
        setPanel(null);
      }, 200);
    };
    const rerender = () => setTick((tick) => tick + 1);
    editor.on("focus", onFocus);
    editor.on("blur", onBlur);
    editor.on("selectionUpdate", rerender);
    editor.on("transaction", rerender);
    if (editor.isFocused) setVisible(true);
    return () => {
      editor.off("focus", onFocus);
      editor.off("blur", onBlur);
      editor.off("selectionUpdate", rerender);
      editor.off("transaction", rerender);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [editor]);

  // Follow the keyboard: re-pin whenever the visible area moves or resizes.
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!visible || !bar) {
      setFloatingBottomInset(0);
      return;
    }
    const place = () => {
      placeAtVisibleBottom(bar);
      setFloatingBottomInset(bar.offsetHeight);
    };
    place();
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", place);
    viewport?.addEventListener("scroll", place);
    window.addEventListener("resize", place);
    return () => {
      viewport?.removeEventListener("resize", place);
      viewport?.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
      setFloatingBottomInset(0);
    };
  }, [visible, panel]);

  if (!visible || !editor.isEditable) return null;

  const { empty } = editor.state.selection;
  const chain = () => editor.chain().focus();
  const button = (label: string, icon: ReactNode, run: () => void, active = false) => (
    <button
      key={label}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      className={active ? "active" : undefined}
      onPointerDown={keepFocus}
      onMouseDown={keepFocus}
      onClick={run}
    >
      {icon}
    </button>
  );

  return createPortal(
    <div ref={barRef} className="note-keyboard-bar" role="toolbar" aria-label="Editing tools" onPointerDown={keepFocus} onMouseDown={keepFocus}>
      {panel ? (
        <div className="note-keyboard-panel" role="menu">
          {(panel === "turn-into" ? TURN_INTO : onAttach).map((entry) => (
            <button
              key={entry.label}
              type="button"
              role="menuitem"
              onPointerDown={keepFocus}
              onMouseDown={keepFocus}
              onClick={() => {
                setPanel(null);
                entry.run(editor);
              }}
            >
              {entry.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="note-keyboard-row">
        {empty ? (
          <>
            {button("Insert block", <Plus size={18} />, () => chain().insertContent("/").run())}
            {button("Turn into", <CaseSensitive size={19} />, () => setPanel(panel === "turn-into" ? null : "turn-into"), panel === "turn-into")}
            {button("To-do", <ListChecks size={18} />, () => chain().toggleTaskList().run(), editor.isActive("taskList"))}
            {button("Link a page", <AtSign size={18} />, () => chain().insertContent("@").run())}
            {button("Attach", <Paperclip size={18} />, () => setPanel(panel === "attach" ? null : "attach"), panel === "attach")}
            {button("Hide keyboard", <KeyboardOff size={18} />, () => editor.commands.blur())}
          </>
        ) : (
          <>
            {button("Bold", <Bold size={17} />, () => chain().toggleBold().run(), editor.isActive("bold"))}
            {button("Italic", <Italic size={17} />, () => chain().toggleItalic().run(), editor.isActive("italic"))}
            {button("Underline", <Underline size={17} />, () => chain().toggleUnderline().run(), editor.isActive("underline"))}
            {button("Strikethrough", <Strikethrough size={17} />, () => chain().toggleStrike().run(), editor.isActive("strike"))}
            {button("Highlight", <Highlighter size={17} />, () => chain().toggleHighlight().run(), editor.isActive("highlight"))}
            <TextColorMenu editor={editor} />
            <FontMenu editor={editor} />
            {button("Link", <Link2 size={17} />, () => void editLink(editor), editor.isActive("link"))}
            {button("Make flashcard", <Layers size={17} />, onFlashcard)}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
