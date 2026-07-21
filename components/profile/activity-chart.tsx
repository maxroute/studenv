import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type ActivityChartProps = {
  items: any[];
  className?: string;
};

export function ActivityChart({ items, className }: ActivityChartProps) {
  const [year, setYear] = useState(new Date().getFullYear());
  const today = new Date();

  const { chartData, activeDays } = useMemo(() => {
    const data = Array.from({ length: 12 }, (_, i) => ({
      label: new Date(year, i).toLocaleString('en-US', { month: 'short' }),
      value: 0
    }));

    let activeDaysCount = 0;
    const uniqueDays = new Set<string>();

    items.forEach(item => {
      const d = new Date(item.createdAt);
      if (d.getFullYear() === year) {
        data[d.getMonth()].value += 1;
        
        // Track unique active days for the header
        const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        if (!uniqueDays.has(dayKey)) {
          uniqueDays.add(dayKey);
          activeDaysCount++;
        }
      }
    });

    return { chartData: data, activeDays: activeDaysCount };
  }, [items, year]);

  const maxValue = Math.max(...chartData.map(d => d.value), 4); // minimum ceiling of 4 for better visual scale

  return (
    <div className={`activity-panel${className ? ` ${className}` : ""}`}>
      <div className="section-head mb-6 flex justify-between items-start">
        <div>
          <h3>Activity Chart</h3>
          <span className="text-sm text-[#9c9788]">{activeDays} active day{activeDays === 1 ? "" : "s"} in {year}</span>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setYear(y => y - 1)}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 hover:bg-white/5 text-[#9c9788] transition"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium w-10 text-center">{year}</span>
          <button 
            onClick={() => setYear(y => y + 1)}
            disabled={year >= today.getFullYear()}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 hover:bg-white/5 text-[#9c9788] transition disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="w-full h-[180px] flex items-end justify-between gap-2 relative mt-4 pb-6 border-b border-white/5">
        {/* Y-axis grid lines (optional subtle lines) */}
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-6">
          <div className="w-full border-t border-white/[0.02]" />
          <div className="w-full border-t border-white/[0.02]" />
          <div className="w-full border-t border-white/[0.02]" />
          <div className="w-full border-t border-white/[0.02]" />
        </div>

        {chartData.map((data, i) => {
          const heightPercentage = data.value > 0 ? Math.max((data.value / maxValue) * 100, 4) : 0; // min 4% height if > 0
          
          return (
            <div key={i} className="flex flex-col items-center flex-1 h-full relative group">
              <div className="w-full flex-1 flex items-end justify-center z-10">
                <div 
                  className={`w-full max-w-[24px] rounded-t-sm transition-all duration-300 relative ${data.value > 0 ? 'bg-[var(--amber)] hover:brightness-110' : 'bg-transparent'}`}
                  style={{ height: `${heightPercentage}%` }}
                >
                  {/* Tooltip */}
                  {data.value > 0 && (
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[#1a1a1a] border border-white/10 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                      {data.value} item{data.value === 1 ? '' : 's'}
                    </div>
                  )}
                </div>
              </div>
              <span className="text-[10px] text-[#5c5a52] mt-2 absolute -bottom-6">
                {data.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
