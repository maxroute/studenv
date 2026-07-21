import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="w-screen h-screen flex flex-col bg-slate-50 animate-pulse">
      {/* Header Skeleton */}
      <header className="h-14 border-b bg-white flex items-center px-4 justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded-lg bg-slate-200" />
          <div className="h-5 bg-slate-200 rounded w-48" />
          <div className="w-16 h-5 bg-slate-200 rounded-full" />
        </div>
        <div className="flex items-center gap-3">
          <div className="w-16 h-8 bg-slate-200 rounded-lg" />
          <div className="w-20 h-8 bg-slate-200 rounded-lg" />
        </div>
      </header>

      {/* Main Workspace Area Skeleton */}
      <div className="flex-1 flex relative bg-slate-100 items-center justify-center">
        {/* Infinite Grid Background Effect */}
        <div 
          className="absolute inset-0 opacity-[0.03]" 
          style={{
            backgroundImage: "radial-gradient(#000 1px, transparent 1px)",
            backgroundSize: "20px 20px"
          }}
        />

        {/* Pulsing loading center */}
        <div className="flex flex-col items-center gap-3 z-10 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
          <span className="text-sm font-semibold tracking-wide text-slate-400">Initializing Studio...</span>
        </div>
      </div>
    </div>
  );
}
