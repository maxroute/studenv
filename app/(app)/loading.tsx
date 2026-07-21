export default function Loading() {
  return (
    <div className="dashboard-shell animate-pulse">
      <main className="main">
        <div className="main-header">
          <div>
            <div className="h-8 w-56 rounded-md bg-white/[0.06]" />
            <div className="mt-3 h-4 w-36 rounded-md bg-white/[0.05]" />
          </div>
          <div className="h-10 w-52 rounded-[8px] bg-white/[0.05]" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div
              key={item}
              className="h-44 rounded-[14px] border border-white/[0.065] bg-[#1b1b16]"
            />
          ))}
        </div>
      </main>
      <aside className="detail-panel">
        <div className="h-48 rounded-[14px] bg-white/[0.04]" />
        <div className="mt-4 h-4 w-3/4 rounded bg-white/[0.05]" />
        <div className="mt-2 h-4 w-1/2 rounded bg-white/[0.05]" />
      </aside>
    </div>
  );
}
