"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Eraser, FileText, Highlighter, Maximize2, PenLine, Undo2 } from "lucide-react";
import { createStrokeOutline, outlineToPath } from "@/lib/workspace/drawing-geometry";
import { coerceStrokes, strokeHitsPoint, strokeToPixels, type NoteStroke, type NoteStrokeTool } from "@/lib/notes/annotations";
import { NotePdfViewer } from "./note-pdf-viewer";
import { pageAspect, renderPdfPage } from "./pdf-render";

type Tool = NoteStrokeTool | "eraser";

const PEN_COLORS = ["#e05a4b", "#2f6fdf", "#1f9d55", "#1a1a1a"] as const;
const HIGHLIGHT_COLORS = ["#f5d76e", "#7fe0a0", "#7cc4f5", "#f59ad0"] as const;
const SIZES: Record<NoteStrokeTool, number> = { pen: 0.004, highlighter: 0.022 };

/**
 * Pressing a control must not focus the note: inside an editable area, iOS
 * focuses it (opening the keyboard) on the press. Cancelling the press keeps
 * the click and stops the focus, like the formatting toolbar does.
 */
const keepEditorBlurred = (event: React.PointerEvent | React.MouseEvent) => event.preventDefault();

/** The SVG path for a stored stroke at the given page size. */
function strokePath(stroke: NoteStroke, width: number, height: number) {
  const points = strokeToPixels(stroke, width, height);
  if (stroke.tool === "highlighter") {
    // Even-width marker: a plain polyline reads better than a pressure outline.
    return { d: points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" "), fill: false };
  }
  return { d: outlineToPath(createStrokeOutline(points, stroke.size * width)), fill: true };
}

/** A pinned PDF page: shown in the note, annotated in place with pen, highlighter and eraser. */
export function PdfPageBlockView({ node, updateAttributes, editor, selected }: NodeViewProps) {
  const assetId = typeof node.attrs.assetId === "string" ? node.attrs.assetId : null;
  const page = Number(node.attrs.page) || 1;
  const title = typeof node.attrs.title === "string" && node.attrs.title ? node.attrs.title : "PDF";
  const strokes = useMemo(() => coerceStrokes(node.attrs.strokes), [node.attrs.strokes]);

  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [aspect, setAspect] = useState(0.77);
  const [failed, setFailed] = useState<string | null>(null);
  const [annotating, setAnnotating] = useState(false);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState<string>(PEN_COLORS[0]);
  const [live, setLive] = useState<NoteStroke | null>(null);
  const [readerOpen, setReaderOpen] = useState(false);
  const drawing = useRef<{ pointerId: number; points: number[]; erased: boolean } | null>(null);
  const editable = editor.isEditable;

  useEffect(() => {
    if (!assetId) return;
    let active = true;
    pageAspect(assetId, page).then((value) => active && setAspect(value)).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [assetId, page]);

  // Track the frame width; the height follows the page's shape.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => {
      const width = frame.clientWidth;
      setSize({ width, height: width / aspect });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [aspect]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!assetId || !canvas || size.width === 0) return;
    setFailed(null);
    return renderPdfPage(assetId, page, canvas, size.width, (error) => setFailed(error ? error.message : null));
  }, [assetId, page, size.width]);

  const localPoint = useCallback((event: React.PointerEvent) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height, px: event.clientX - rect.left, py: event.clientY - rect.top };
  }, []);

  // The latest strokes, also between renders: one eraser movement can carry
  // several samples, and each must erase from what the previous one left.
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  const eraseAt = useCallback(
    (px: number, py: number) => {
      const current = strokesRef.current;
      const remaining = current.filter((stroke) => !strokeHitsPoint(stroke, size.width, size.height, px, py, 8));
      if (remaining.length === current.length) return false;
      strokesRef.current = remaining;
      updateAttributes({ strokes: remaining });
      return true;
    },
    [size.height, size.width, updateAttributes],
  );

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!annotating || event.button > 0) return;
    const point = localPoint(event);
    if (!point) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === "eraser") {
      drawing.current = { pointerId: event.pointerId, points: [], erased: eraseAt(point.px, point.py) };
      return;
    }
    const pressure = event.pointerType === "pen" ? event.pressure || 0.5 : 0.5;
    drawing.current = { pointerId: event.pointerId, points: [point.x, point.y, pressure], erased: false };
    setLive({ tool, color, size: SIZES[tool], points: [point.x, point.y, pressure] });
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const current = drawing.current;
    if (!current || current.pointerId !== event.pointerId) return;
    // Coalesced samples keep fast pen strokes smooth.
    const samples = typeof event.nativeEvent.getCoalescedEvents === "function" ? event.nativeEvent.getCoalescedEvents() : [];
    const events = samples.length ? samples : [event.nativeEvent];
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    for (const sample of events) {
      const px = sample.clientX - rect.left;
      const py = sample.clientY - rect.top;
      if (tool === "eraser") {
        eraseAt(px, py);
        continue;
      }
      if (current.points.length / 3 >= 1500) break;
      current.points.push(px / rect.width, py / rect.height, sample.pointerType === "pen" ? sample.pressure || 0.5 : 0.5);
    }
    if (tool !== "eraser") setLive({ tool, color, size: SIZES[tool], points: [...current.points] });
  };

  const finish = (event: React.PointerEvent<SVGSVGElement>) => {
    const current = drawing.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drawing.current = null;
    setLive(null);
    if (tool === "eraser") return;
    const stroke = coerceStrokes([{ tool, color, size: SIZES[tool as NoteStrokeTool], points: current.points }])[0];
    if (stroke) updateAttributes({ strokes: [...strokesRef.current, stroke] });
  };

  const pickTool = (next: Tool) => {
    setTool(next);
    if (next === "pen" && !(PEN_COLORS as readonly string[]).includes(color)) setColor(PEN_COLORS[0]);
    if (next === "highlighter" && !(HIGHLIGHT_COLORS as readonly string[]).includes(color)) setColor(HIGHLIGHT_COLORS[0]);
  };

  const shown = live ? [...strokes, live] : strokes;
  const palette = tool === "highlighter" ? HIGHLIGHT_COLORS : PEN_COLORS;

  return (
    <NodeViewWrapper className={`note-pdf-block${selected ? " selected" : ""}${annotating ? " annotating" : ""}`} data-pdf-page="">
      <div className="note-pdf-block-bar" contentEditable={false} data-note-interactive="" onPointerDown={keepEditorBlurred} onMouseDown={keepEditorBlurred}>
        <FileText size={15} />
        <span className="note-pdf-block-title">{title}</span>
        <span className="note-pdf-block-page">Page {page}</span>
        {editable ? (
          <button
            type="button"
            className={annotating ? "active" : undefined}
            onClick={() => {
              // Drawing is not typing: close the phone keyboard so the page stays in view.
              if (!annotating && document.activeElement instanceof HTMLElement) document.activeElement.blur();
              setAnnotating((value) => !value);
            }}
            aria-pressed={annotating}
          >
            <PenLine size={14} /> {annotating ? "Done" : "Annotate"}
          </button>
        ) : null}
        {assetId ? (
          <button type="button" onClick={() => setReaderOpen(true)} aria-label="Open the PDF at this page">
            <Maximize2 size={14} />
          </button>
        ) : null}
      </div>

      {annotating ? (
        <div className="note-pdf-tools" role="toolbar" aria-label="Annotation tools" contentEditable={false} data-note-interactive="" onPointerDown={keepEditorBlurred} onMouseDown={keepEditorBlurred}>
          <button type="button" className={tool === "pen" ? "active" : undefined} onClick={() => pickTool("pen")} aria-label="Pen" title="Pen">
            <PenLine size={15} />
          </button>
          <button type="button" className={tool === "highlighter" ? "active" : undefined} onClick={() => pickTool("highlighter")} aria-label="Highlighter" title="Highlighter">
            <Highlighter size={15} />
          </button>
          <button type="button" className={tool === "eraser" ? "active" : undefined} onClick={() => pickTool("eraser")} aria-label="Eraser" title="Eraser">
            <Eraser size={15} />
          </button>
          <span className="note-pdf-tools-sep" />
          {tool !== "eraser"
            ? palette.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  className={`note-pdf-swatch${color === swatch ? " active" : ""}`}
                  style={{ background: swatch }}
                  onClick={() => setColor(swatch)}
                  aria-label={`Colour ${swatch}`}
                />
              ))
            : null}
          <span className="note-pdf-tools-sep" />
          <button type="button" onClick={() => updateAttributes({ strokes: strokes.slice(0, -1) })} disabled={strokes.length === 0} aria-label="Undo last stroke" title="Undo">
            <Undo2 size={15} />
          </button>
        </div>
      ) : null}

      <div className="note-pdf-frame" ref={frameRef} style={{ aspectRatio: String(aspect) }} contentEditable={false}>
        <canvas ref={canvasRef} aria-label={`${title}, page ${page}`} />
        {failed || !assetId ? <span className="note-pdf-block-error">{failed ?? "This PDF is missing."}</span> : null}
        <svg
          data-note-interactive=""
          className="note-pdf-ink"
          viewBox={`0 0 ${Math.max(size.width, 1)} ${Math.max(size.height, 1)}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finish}
          onPointerCancel={finish}
          onLostPointerCapture={finish}
        >
          {size.width > 0
            ? shown.map((stroke, index) => {
                const path = strokePath(stroke, size.width, size.height);
                return path.fill ? (
                  <path key={index} d={path.d} fill={stroke.color} />
                ) : (
                  <path
                    key={index}
                    d={path.d}
                    fill="none"
                    stroke={stroke.color}
                    strokeWidth={stroke.size * size.width}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.4}
                  />
                );
              })
            : null}
        </svg>
      </div>

      {readerOpen && assetId ? <NotePdfViewer assetId={assetId} title={title} initialPage={page} onClose={() => setReaderOpen(false)} /> : null}
    </NodeViewWrapper>
  );
}
