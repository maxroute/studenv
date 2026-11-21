"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Network, Plus } from "lucide-react";
import { toast } from "react-hot-toast";
import { useRanganStore, type RanganTurn } from "@/hooks/use-rangan-store";
import type { RanganMap } from "@/lib/services/rangan.service";
import { describeBoardChange } from "@/lib/workspace/board-edit";
import { mapElementCount } from "@/lib/workspace/mind-map";
import { applyBoardEdit, createMapBoard } from "./board-actions";

/** The map's branches and sub-nodes, as a preview. */
export function MapOutline({ map }: { map: RanganMap }) {
  return (
    <div className="rangan-map-outline">
      <span className="rangan-map-centre">{map.draft.centre}</span>
      <ul>
        {map.draft.branches.map((branch) => (
          <li key={branch.title}>
            <span className="rangan-map-branch">
              {branch.title}
              {branch.relation ? <em> · {branch.relation}</em> : null}
            </span>
            {branch.children.length ? <span className="rangan-plan-meta"> {branch.children.map((child) => child.title).join(", ")}</span> : null}
          </li>
        ))}
      </ul>
      {map.draft.tips.length ? <p className="rangan-plan-meta">{map.draft.tips.length} exam tip{map.draft.tips.length === 1 ? "" : "s"}</p> : null}
      <MapExtras map={map} />
    </div>
  );
}

/** The pictures and further reading a map comes with: shown before anything is saved. */
function MapExtras({ map }: { map: RanganMap }) {
  const images = map.images ?? [];
  const reading = map.reading ?? [];
  const video = map.video ?? null;
  if (!images.length && !reading.length && !video) return null;
  return (
    <>
      {video ? (
        <a className="rangan-map-video" href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`} target="_blank" rel="noopener noreferrer">
          {/* YouTube's own thumbnail, shown as is. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://i.ytimg.com/vi/${encodeURIComponent(video.videoId)}/mqdefault.jpg`} alt="" loading="lazy" />
          <span>
            <strong>{video.title}</strong>
            <span className="rangan-plan-meta">{video.channel ? `${video.channel} · ` : ""}YouTube. Saved to your library when you create the board.</span>
          </span>
        </a>
      ) : null}
      {images.length ? (
        <div className="rangan-map-images">
          {images.map((image) => (
            <figure key={image.src}>
              {/* A Commons thumbnail shown as is; next/image would proxy a third-party picture through the app. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.src} alt={image.alt} loading="lazy" />
              <figcaption>
                <span>{image.target || map.draft.centre}</span>
                <a href={image.sourceUrl} target="_blank" rel="noopener noreferrer">
                  {image.credit}
                </a>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : null}
      {reading.length ? (
        <div className="rangan-map-reading">
          <span className="rangan-plan-meta">Further reading, saved to your library as links when you create the board:</span>
          <ul>
            {reading.map((link) => (
              <li key={link.url}>
                <a href={link.url} target="_blank" rel="noopener noreferrer">
                  {link.title}
                </a>{" "}
                <span className="rangan-plan-meta">Wikipedia</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

/** "Create board", then "Open board": shared by map cards and page cards that came with a map. */
export function CreateBoardButton({ turnId, map, boardId, pageNoteId, onNavigate }: { turnId: string; map: RanganMap; boardId: string | null; pageNoteId?: string | null; onNavigate: () => void }) {
  const router = useRouter();
  const markBoardCreated = useRanganStore((state) => state.markBoardCreated);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    const result = await createMapBoard(map, pageNoteId);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    markBoardCreated(turnId, result.workspaceId);
    toast.success(`Created the board "${map.draft.title}".`);
  };

  if (boardId) {
    return (
      <>
        <span className="rangan-plan-saved">
          <Check size={15} aria-hidden /> Board created
        </span>
        <button
          type="button"
          className="rangan-chip"
          onClick={() => {
            onNavigate();
            router.push(`/workspaces/${encodeURIComponent(boardId)}`);
          }}
        >
          Open board
        </button>
      </>
    );
  }
  return (
    <button type="button" className="rangan-plan-add" onClick={create} disabled={busy}>
      {busy ? <Loader2 size={15} className="rangan-spin" aria-hidden /> : <Network size={15} aria-hidden />} Create board
    </button>
  );
}

/** A new map board Rangan drafted: preview, then create it. */
export function RanganMapCard({ turn, onNavigate }: { turn: Extract<RanganTurn, { role: "map" }>; onNavigate: () => void }) {
  const { map } = turn;
  return (
    <div className="rangan-plan rangan-page">
      <div className="rangan-plan-head">
        <Network size={16} aria-hidden />
        <span className="rangan-plan-goal">{map.draft.title}</span>
      </div>
      <p className="rangan-plan-meta">
        A new board with a mind map of about {mapElementCount(map.draft, new Map(), { images: (map.images ?? []).length, reading: (map.reading ?? []).length, video: Boolean(map.video) })} elements. Nothing is saved until you create it.
      </p>
      <MapOutline map={map} />
      {map.sources.length ? <p className="rangan-plan-meta">Cards for {map.sources.map((source) => source.title).join(" · ")}</p> : null}
      <div className="rangan-plan-actions">
        <CreateBoardButton turnId={turn.id} map={map} boardId={turn.boardId} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

/** Additions Rangan suggests to the open board: what they are, then Apply. */
export function RanganBoardEditCard({ turn }: { turn: Extract<RanganTurn, { role: "board-edit" }> }) {
  const markEditApplied = useRanganStore((state) => state.markEditApplied);
  const { edit, planned } = turn;
  const [problem, setProblem] = useState<string | null>(null);

  const apply = () => {
    setProblem(null);
    const result = applyBoardEdit(edit.boardRef, edit.changes, planned);
    if (!result.ok) {
      setProblem(result.message);
      return;
    }
    markEditApplied(turn.id);
    toast.success("Added to the board. The new stickies are selected.");
  };

  return (
    <div className="rangan-plan rangan-page">
      <div className="rangan-plan-head">
        <Plus size={16} aria-hidden />
        <span className="rangan-plan-goal">Suggested additions</span>
      </div>
      <p className="rangan-plan-meta">{edit.summary}</p>
      <ul className="rangan-edit-list">
        {edit.changes.map((change, index) => (
          <li key={index} className="rangan-edit-new">
            {describeBoardChange(change, planned)}
          </li>
        ))}
      </ul>
      <p className="rangan-plan-meta">Rangan only adds: nothing on the board is moved or removed.</p>
      {problem ? (
        <p className="rangan-plan-note" role="alert">
          {problem}
        </p>
      ) : null}
      <div className="rangan-plan-actions">
        {turn.applied ? (
          <span className="rangan-plan-saved">
            <Check size={15} aria-hidden /> Added. Undo it with the board&apos;s undo button or Ctrl/⌘ Z.
          </span>
        ) : (
          <button type="button" className="rangan-plan-add" onClick={apply}>
            <Check size={15} aria-hidden /> Add to the board
          </button>
        )}
      </div>
    </div>
  );
}
