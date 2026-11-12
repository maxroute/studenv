"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, ChevronDown, Trash2, Type } from "lucide-react";
import type { ConnectorEndpointStyle, ConnectorMode, ConnectorNode, ConnectorStrokeStyle } from "@/types/workspace";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { useSelectionStore } from "@/lib/workspace/selection-engine";
import { useConnectorUiStore } from "@/lib/workspace/connector-ui-store";
import {
  CONNECTOR_COLORS,
  CONNECTOR_ENDPOINT_STYLES,
  CONNECTOR_STROKE_WIDTHS,
  flipEndpointStyles,
  getMostCommonValue,
  type ConnectorStyle,
} from "@/lib/workspace/connector-style";
import { CONNECTOR_MODE_CYCLE } from "@/lib/workspace/connector-autocomplete";
import { isElementLocked } from "@/lib/workspace/element-lock";

type Panel = "color" | "start" | "end" | "mode" | null;

const ENDPOINT_LABELS: Record<ConnectorEndpointStyle, string> = {
  none: "None",
  arrow: "Arrow",
  triangle: "Triangle",
  circle: "Circle",
  diamond: "Diamond",
};

const MODE_LABELS: Record<ConnectorMode, string> = {
  curve: "Curve",
  elbow: "Elbowed",
  straight: "Straight",
};

/** A short line with the endpoint style drawn at its start or end. */
function EndpointGlyph({ style, side }: { style: ConnectorEndpointStyle; side: "start" | "end" }) {
  const tip = side === "end" ? 19 : 3;
  const dir = side === "end" ? 1 : -1;
  let marker: React.ReactNode = null;
  if (style === "arrow") marker = <path d={`M ${tip - 5 * dir} 5 L ${tip} 10 L ${tip - 5 * dir} 15`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />;
  if (style === "triangle") marker = <path d={`M ${tip} 10 L ${tip - 7 * dir} 6 L ${tip - 7 * dir} 14 Z`} fill="currentColor" />;
  if (style === "circle") marker = <circle cx={tip - 3 * dir} cy="10" r="3.2" fill="currentColor" />;
  if (style === "diamond") marker = <path d={`M ${tip} 10 L ${tip - 4 * dir} 6 L ${tip - 8 * dir} 10 L ${tip - 4 * dir} 14 Z`} fill="currentColor" />;
  return (
    <svg width="22" height="20" viewBox="0 0 22 20" aria-hidden="true">
      <line x1="3" y1="10" x2="19" y2="10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {marker}
    </svg>
  );
}

function ModeGlyph({ mode }: { mode: ConnectorMode }) {
  const d = mode === "curve" ? "M3 16 C 10 16 12 4 19 4" : mode === "elbow" ? "M3 16 H 11 V 4 H 19" : "M3 16 L 19 4";
  return (
    <svg width="22" height="20" viewBox="0 0 22 20" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Toolbar for selected connectors (AFFiNE parity): colour, line width and
 * style, start style, flip, end style, connector shape, add text and delete. Edits
 * apply to every selected connector; mixed selections show the most common
 * value. Style changes become the defaults for new connectors.
 */
export function ConnectorStyleToolbar({ enabled }: { enabled: boolean }) {
  const selectedIds = useSelectionStore((state) => state.selectedIds);
  const items = useWorkspaceStore((state) => state.items);
  const batchUpdateItems = useWorkspaceStore((state) => state.batchUpdateItems);
  const gestureActive = useConnectorUiStore((state) => state.gestureActive);
  const rememberStyle = useConnectorUiStore((state) => state.rememberStyle);
  const setMode = useConnectorUiStore((state) => state.setMode);
  const setEditingLabel = useConnectorUiStore((state) => state.setEditingLabel);
  const removeItems = useWorkspaceStore((state) => state.removeItems);
  const [panel, setPanel] = useState<Panel>(null);

  const connectors = useMemo(() => {
    const selected = new Set(selectedIds);
    return items.filter((item): item is ConnectorNode => selected.has(item.id) && item.type === "connector");
  }, [items, selectedIds]);

  // Only for a selection made of connectors alone; hidden while creating one.
  // Popups are positioned against the toolbar itself (centred on screen), so
  // they stay on screen at phone widths.
  if (!enabled || gestureActive || connectors.length === 0 || connectors.length !== selectedIds.length) return null;

  const common = <K extends keyof ConnectorNode["props"]>(key: K) => getMostCommonValue(connectors.map((c) => c.props[key]));
  const color = common("color") ?? CONNECTOR_COLORS[0];
  const strokeWidth = common("strokeWidth") ?? 2;
  const strokeStyle = common("strokeStyle") ?? "solid";
  const front = common("frontEndpointStyle") ?? "none";
  const rear = common("rearEndpointStyle") ?? "arrow";
  const mode = common("mode") ?? "curve";

  const applyStyle = (changes: Partial<ConnectorStyle>) => {
    batchUpdateItems(connectors.map((c) => ({ id: c.id, changes: {}, props: changes })));
    rememberStyle(changes);
  };
  const applyMode = (next: ConnectorMode) => {
    batchUpdateItems(connectors.map((c) => ({ id: c.id, changes: {}, props: { mode: next } })));
    setMode(next);
  };
  const flip = () => batchUpdateItems(connectors.map((c) => ({ id: c.id, changes: {}, props: flipEndpointStyles(c.props) })));
  const addText = () => {
    const connector = connectors[0];
    setPanel(null);
    setEditingLabel({ connectorId: connector.id, offset: connector.props.label?.offset ?? 0.5 });
  };
  // Locked connectors keep their label and cannot be deleted (unlock first).
  const allLocked = connectors.every(isElementLocked);
  // A visible delete (AFFiNE keeps it under "more"): the only way to delete a
  // connector on touch and pen devices without a keyboard.
  const deleteSelected = () => {
    setPanel(null);
    removeItems(connectors.map((c) => c.id));
    useSelectionStore.getState().deselectAll();
  };
  const toggle = (next: Exclude<Panel, null>) => setPanel((open) => (open === next ? null : next));

  const buttonClass = "flex h-8 shrink-0 items-center justify-center gap-0.5 rounded-full px-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white";
  const activeClass = "bg-[#f5a623]/20 text-[#ffc15a]";
  const divider = <span className="mx-1 h-5 w-px shrink-0 bg-white/15" />;
  const popupClass = "absolute bottom-[calc(100%+12px)] left-1/2 z-[1400] -translate-x-1/2 rounded-2xl border border-white/10 bg-slate-900/95 p-2 shadow-2xl backdrop-blur-xl";
  const optionClass = (active: boolean) => `flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${active ? activeClass : "text-white/70 hover:bg-white/10"}`;

  const endpointMenu = (side: "start" | "end", current: ConnectorEndpointStyle) => (
    <div className={`${popupClass} flex gap-1`} role="menu" aria-label={side === "start" ? "Start style" : "End style"}>
      {CONNECTOR_ENDPOINT_STYLES.map((style) => (
        <button
          key={style}
          type="button"
          role="menuitemradio"
          aria-checked={current === style}
          title={ENDPOINT_LABELS[style]}
          aria-label={ENDPOINT_LABELS[style]}
          className={optionClass(current === style)}
          onClick={() => {
            applyStyle(side === "start" ? { frontEndpointStyle: style } : { rearEndpointStyle: style });
            setPanel(null);
          }}
        >
          <EndpointGlyph style={style} side={side} />
        </button>
      ))}
    </div>
  );

  return (
    <div
      data-connector-style-toolbar="true"
      className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+5rem)] left-1/2 z-[1300] flex w-max max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-nowrap items-center gap-0.5 overflow-visible rounded-2xl border border-white/10 bg-slate-900/90 px-2 py-2 text-white shadow-2xl backdrop-blur-xl md:bottom-24"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="shrink-0">
        <button type="button" onClick={() => toggle("color")} title="Stroke style" aria-label="Stroke style" aria-expanded={panel === "color"} className={`${buttonClass} w-8 ${panel === "color" ? activeClass : ""}`}>
          <span className="h-[19px] w-[19px] rounded-full border-2 border-white/35" style={{ backgroundColor: color }} />
        </button>
        {panel === "color" && (
          <div className={`${popupClass} w-64 p-3`}>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/50">Line</div>
            <div className="mb-3 flex items-center gap-1">
              {(["solid", "dash"] as ConnectorStrokeStyle[]).map((style) => (
                <button key={style} type="button" aria-label={style === "solid" ? "Solid line" : "Dashed line"} aria-pressed={strokeStyle === style} onClick={() => applyStyle({ strokeStyle: style })} className={`flex h-8 flex-1 items-center justify-center rounded-lg ${strokeStyle === style ? activeClass : "text-white/60 hover:bg-white/10"}`}>
                  <svg width="40" height="10" viewBox="0 0 40 10" aria-hidden="true"><line x1="2" y1="5" x2="38" y2="5" stroke="currentColor" strokeWidth="2" strokeDasharray={style === "dash" ? "6 4" : undefined} strokeLinecap="round" /></svg>
                </button>
              ))}
            </div>
            <div className="mb-3 flex items-center justify-between gap-1">
              {CONNECTOR_STROKE_WIDTHS.map((width) => (
                <button key={width} type="button" aria-label={`Line width ${width}`} aria-pressed={strokeWidth === width} title={`${width}px`} onClick={() => applyStyle({ strokeWidth: width })} className={`flex h-8 w-8 items-center justify-center rounded-lg ${strokeWidth === width ? activeClass : "text-white/60 hover:bg-white/10"}`}>
                  <span className="rounded-full bg-current" style={{ width: Math.max(4, width + 2), height: Math.max(4, width + 2) }} />
                </button>
              ))}
            </div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/50">Color</div>
            <div className="grid grid-cols-5 gap-2">
              {CONNECTOR_COLORS.map((swatch) => (
                <button key={swatch} type="button" aria-label={`Choose ${swatch}`} title={swatch} aria-pressed={color === swatch} onClick={() => applyStyle({ color: swatch })} className={`h-8 w-8 rounded-lg border-2 transition-transform hover:scale-105 ${color === swatch ? "border-indigo-300 ring-1 ring-indigo-300/60" : "border-transparent"}`} style={{ backgroundColor: swatch }} />
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2 border-t border-white/[0.08] pt-3">
              <span className="text-[11px] text-white/55">Custom</span>
              <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : "#929292"} onChange={(event) => applyStyle({ color: event.target.value })} className="h-7 w-7 cursor-pointer rounded-md border-0 bg-transparent p-0" aria-label="Custom color" />
            </div>
          </div>
        )}
      </div>

      {divider}

      <div className="shrink-0">
        <button type="button" onClick={() => toggle("start")} title="Start style" aria-label="Start style" aria-expanded={panel === "start"} className={`${buttonClass} ${panel === "start" ? activeClass : ""}`}>
          <EndpointGlyph style={front} side="start" />
          <ChevronDown size={12} className="text-white/45" />
        </button>
        {panel === "start" && endpointMenu("start", front)}
      </div>

      <button type="button" onClick={flip} title="Flip direction" aria-label="Flip direction" className={`${buttonClass} w-8`}>
        <ArrowLeftRight size={16} />
      </button>

      <div className="shrink-0">
        <button type="button" onClick={() => toggle("end")} title="End style" aria-label="End style" aria-expanded={panel === "end"} className={`${buttonClass} ${panel === "end" ? activeClass : ""}`}>
          <EndpointGlyph style={rear} side="end" />
          <ChevronDown size={12} className="text-white/45" />
        </button>
        {panel === "end" && endpointMenu("end", rear)}
      </div>

      {divider}

      <div className="shrink-0">
        <button type="button" onClick={() => toggle("mode")} title="Connector shape" aria-label="Connector shape" aria-expanded={panel === "mode"} className={`${buttonClass} ${panel === "mode" ? activeClass : ""}`}>
          <ModeGlyph mode={mode} />
          <ChevronDown size={12} className="text-white/45" />
        </button>
        {panel === "mode" && (
          <div className={`${popupClass} flex gap-1`} role="menu" aria-label="Connector shape">
            {CONNECTOR_MODE_CYCLE.map((option) => (
              <button
                key={option}
                type="button"
                role="menuitemradio"
                aria-checked={mode === option}
                title={MODE_LABELS[option]}
                aria-label={MODE_LABELS[option]}
                className={optionClass(mode === option)}
                onClick={() => {
                  applyMode(option);
                  setPanel(null);
                }}
              >
                <ModeGlyph mode={option} />
              </button>
            ))}
          </div>
        )}
      </div>

      {connectors.length === 1 && !allLocked && (
        <>
          {divider}
          <button type="button" onClick={addText} title={connectors[0].props.label ? "Edit text" : "Add text"} aria-label={connectors[0].props.label ? "Edit text" : "Add text"} className={`${buttonClass} w-8`}>
            <Type size={16} />
          </button>
        </>
      )}

      {divider}
      <button type="button" onClick={deleteSelected} disabled={allLocked} title={allLocked ? "Locked" : "Delete"} aria-label="Delete connector" className={`${buttonClass} w-8 hover:bg-red-500/20 hover:text-red-300 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-white/70`}>
        <Trash2 size={16} />
      </button>
    </div>
  );
}
