export default function Loading() {
  return (
    <div className="app-page room-page">
      <div className="mx-auto flex w-full max-w-[1100px] animate-pulse flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <div className="room-bar !border-0 !px-0 !pb-0">
          <div>
            <div className="mb-3 h-4 w-40 rounded bg-white/[0.05]" />
            <div className="h-9 w-72 rounded bg-white/[0.06]" />
            <div className="mt-4 flex gap-2">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-7 w-24 rounded-full bg-white/[0.05]" />
              ))}
            </div>
          </div>
        </div>
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <div className="h-64 rounded-[18px] border border-white/[0.065] bg-[#141410]" />
            <div className="grid gap-6 md:grid-cols-2">
              <div className="h-48 rounded-[18px] border border-white/[0.065] bg-[#141410]" />
              <div className="h-48 rounded-[18px] border border-white/[0.065] bg-[#141410]" />
            </div>
            <div className="h-56 rounded-[18px] border border-white/[0.065] bg-[#141410]" />
          </div>
          <aside className="hidden h-80 rounded-[18px] border border-white/[0.05] bg-[#161614] lg:block" />
        </div>
      </div>
    </div>
  );
}
