"use client";

import Link from "next/link";
import useSWR from "swr";

type AppearsInSource = {
  sourceType: string;
  sourceId: string;
  title: string;
  url: string | null;
  supported: boolean;
  links: Array<{ sourceAnchor: string; kind: string; targetAnchor: string; url: string | null }>;
};

const KIND_LABELS: Record<string, string> = {
  mention: "mentioned",
  link: "linked",
  citation: "cited",
  embed: "embedded",
  card: "card",
  source: "source",
};

const SOURCE_LABELS: Record<string, string> = { note: "Note", workspace: "Workspace", flashcard: "Flashcard" };

function anchorLabel(anchor: string) {
  const page = /^page(\d+)$/.exec(anchor);
  if (page) return `page ${page[1]}`;
  const time = /^t=(\d+)$/.exec(anchor);
  if (time) {
    const seconds = Math.floor(Number(time[1]) / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }
  return null;
}

async function fetcher(url: string) {
  const response = await fetch(url);
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) throw new Error(json?.error ?? "Could not load links.");
  return json.data as AppearsInSource[];
}

/** "Appears in": everything of yours that points at `refString`, grouped by source. */
export function AppearsIn({ refString, className }: { refString: string; className?: string }) {
  const { data, error } = useSWR(`/api/refs/appears-in?ref=${encodeURIComponent(refString)}`, fetcher);
  if (error || !data || data.length === 0) return null;

  return (
    <section className={`appears-in ${className ?? ""}`} aria-label="Appears in">
      <h3 className="appears-in-title">Appears in</h3>
      <ul className="appears-in-list">
        {data.map((source) => {
          const details = source.links
            .map((link) => [KIND_LABELS[link.kind] ?? link.kind, anchorLabel(link.targetAnchor)].filter(Boolean).join(" · "))
            .filter((value, index, all) => all.indexOf(value) === index)
            .join(", ");
          const href = source.links.find((link) => link.url)?.url ?? source.url;
          return (
            <li key={`${source.sourceType}:${source.sourceId}`}>
              <span className="appears-in-type">{SOURCE_LABELS[source.sourceType] ?? source.sourceType}</span>
              {href && source.supported ? <Link href={href}>{source.title}</Link> : <span>{source.title}</span>}
              {details ? <span className="appears-in-details">{details}</span> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
