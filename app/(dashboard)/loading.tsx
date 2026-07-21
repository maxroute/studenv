export default function Loading() {
  return (
    <div className="min-h-full px-10 py-9">
      <div className="mx-auto max-w-6xl animate-pulse">
        <div className="mb-8 flex items-start justify-between gap-5">
          <div>
            <div className="mb-3 h-8 w-64 rounded-md bg-white/[0.06]" />
            <div className="h-4 w-48 rounded-md bg-white/[0.05]" />
          </div>
          <div className="h-10 w-40 rounded-[8px] bg-white/[0.05]" />
        </div>
        <div className="mb-8 grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-[116px] rounded-[14px] border border-white/[0.065] bg-[#1b1b16]"
            />
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_290px]">
          <div className="space-y-3">
            {[0, 1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-28 rounded-[10px] border border-white/[0.065] bg-[#1b1b16]"
              />
            ))}
          </div>
          <div className="h-72 rounded-[14px] border border-white/[0.065] bg-[#1b1b16]" />
        </div>
      </div>
    </div>
  );
}
