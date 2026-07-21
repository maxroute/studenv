import type { ItemRecord } from "@/types";

type StatsGridProps = {
  items: ItemRecord[];
};

export function StatsGrid({ items }: StatsGridProps) {
  const done = items.filter((item) => item.status === "done").length;
  const reading = items.filter((item) => item.status === "reading").length;
  const starred = items.filter((item) => item.starred).length;
  const donePct = items.length ? Math.round((done / items.length) * 100) : 0;

  return (
    <div className="stats-grid">
      <div className="stat-card">
        <div className="stat-label">Total Items</div>
        <div className="stat-value">{items.length}</div>
        <div aria-hidden="true" className="stat-sub stat-sub-placeholder">
          placeholder
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-label">Completed</div>
        <div className="stat-value">{done}</div>
        <div className="stat-sub">{donePct}% done</div>
      </div>
      <div className="stat-card">
        <div className="stat-label">In Progress</div>
        <div className="stat-value">{reading}</div>
        <div aria-hidden="true" className="stat-sub stat-sub-placeholder">
          placeholder
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-label">Starred</div>
        <div className="stat-value">{starred}</div>
        <div aria-hidden="true" className="stat-sub stat-sub-placeholder">
          placeholder
        </div>
      </div>
    </div>
  );
}
