export default function Loading() {
  return (
    <div className="flex h-screen w-screen bg-[#11110e] text-[#9c9788] animate-pulse">
      {/* Sidebar Skeleton */}
      <aside className="w-64 border-r border-white/[0.065] bg-[#161612] p-6 flex flex-col gap-6 shrink-0 hidden md:flex">
        <div className="h-6 w-32 bg-white/5 rounded"></div>
        <div className="space-y-3">
          <div className="h-4 bg-white/5 rounded w-5/6"></div>
          <div className="h-4 bg-white/5 rounded w-full"></div>
          <div className="h-4 bg-white/5 rounded w-4/6"></div>
        </div>
        <hr className="border-white/[0.065]" />
        <div className="space-y-3">
          <div className="h-4 bg-white/5 rounded w-2/3"></div>
          <div className="h-4 bg-white/5 rounded w-3/4"></div>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar Skeleton */}
        <header className="h-14 border-b border-white/[0.065] bg-[#161612] flex items-center justify-between px-6 shrink-0">
          <div className="h-4 bg-white/5 rounded w-48"></div>
          <div className="h-8 bg-white/5 rounded-full w-8"></div>
        </header>

        {/* Content Skeleton */}
        <main className="flex-1 p-8 space-y-6 overflow-auto">
          <div className="space-y-2">
            <div className="h-7 bg-white/5 rounded w-1/4"></div>
            <div className="h-4 bg-white/5 rounded w-1/3"></div>
          </div>

          {/* Grid Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 rounded-lg bg-[#1b1b16] border border-white/[0.065] p-4 flex flex-col justify-between">
                <div className="h-4 bg-white/5 rounded w-1/3"></div>
                <div className="h-6 bg-white/5 rounded w-1/2"></div>
              </div>
            ))}
          </div>

          <div className="h-40 rounded-lg bg-[#1b1b16] border border-white/[0.065]"></div>
        </main>
      </div>
    </div>
  );
}
