"use client";

import { useEffect, useRef, useState } from "react";
import type { ConnectorNode, StudioItem } from "@/types/workspace";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { useConnectorUiStore } from "@/lib/workspace/connector-ui-store";
import { getConnectorRoute } from "@/lib/workspace/connector-selection";
import { getPointAtOffset } from "@/lib/workspace/connector-path";
import {
  CONNECTOR_LABEL_FONT_SIZE,
  CONNECTOR_LABEL_LINE_HEIGHT,
  CONNECTOR_LABEL_MAX_WIDTH,
  applyLabelText,
} from "@/lib/workspace/connector-label";
import { CONNECTION_EMPHASIS_COLOR } from "../ConnectionOverlay";

/**
 * In-place editor for a connector label (AFFiNE parity): opens on the path,
 * grows with its text up to the label's max width, and commits on blur,
 * Escape or Cmd/Ctrl+Enter. Blank text removes the label.
 */
export function ConnectorLabelEditor({ items }: { items: StudioItem[] }) {
  const editing = useConnectorUiStore((state) => state.editingLabel);
  const byId = new Map(items.map((item) => [item.id, item] as const));
  const found = editing ? byId.get(editing.connectorId) : undefined;
  const connector = found?.type === "connector" ? found : null;
  if (!editing || !connector) return null;
  return <LabelEditorBox key={connector.id} connector={connector} offset={editing.offset} byId={byId} />;
}

function LabelEditorBox({
  connector,
  offset,
  byId,
}: {
  connector: ConnectorNode;
  offset: number;
  byId: Map<string, StudioItem>;
}) {
  const updateItemProps = useWorkspaceStore((state) => state.updateItemProps);
  const setEditingLabel = useConnectorUiStore((state) => state.setEditingLabel);
  const [text, setText] = useState(connector.props.label?.text ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const committed = useRef(false);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus({ preventScroll: true });
    textarea.select();
  }, []);

  const route = getConnectorRoute(connector, byId);
  if (!route) return null;
  const center = getPointAtOffset(route, offset);

  const commit = () => {
    if (committed.current) return;
    committed.current = true;
    updateItemProps(connector.id, { label: applyLabelText(text, offset) });
    setEditingLabel(null);
  };

  return (
    <div
      data-connector-label-editor={connector.id}
      data-no-canvas-gesture="true"
      className="pointer-events-auto absolute"
      style={{
        left: center.x,
        top: center.y,
        transform: "translate(-50%, -50%)",
        zIndex: 1250,
        // The hidden copy of the text sizes the box; the textarea is laid over
        // it, so its own default size (cols/rows) never inflates the box.
        display: "inline-block",
        maxWidth: CONNECTOR_LABEL_MAX_WIDTH,
        minWidth: 16,
        fontSize: CONNECTOR_LABEL_FONT_SIZE,
        lineHeight: CONNECTOR_LABEL_LINE_HEIGHT,
        background: "#ffffff",
        outline: `2px solid ${CONNECTION_EMPHASIS_COLOR}`,
        outlineOffset: 2,
        borderRadius: 2,
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <span aria-hidden="true" className="invisible block whitespace-pre-wrap break-words text-center" style={{ width: "max-content", maxWidth: CONNECTOR_LABEL_MAX_WIDTH }}>
        {`${text} `}
      </span>
      <textarea
        ref={textareaRef}
        aria-label="Connector label"
        value={text}
        rows={1}
        spellCheck={false}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape" || (event.key === "Enter" && (event.metaKey || event.ctrlKey))) {
            event.preventDefault();
            commit();
          }
        }}
        className="absolute inset-0 m-0 h-full w-full resize-none overflow-hidden whitespace-pre-wrap break-words border-0 bg-transparent p-0 text-center text-black outline-none"
        style={{ font: "inherit", lineHeight: "inherit", minWidth: 0, minHeight: 0 }}
      />
    </div>
  );
}
