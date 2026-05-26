"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  lastMonthData,
  last3MonthsData,
  last6MonthsData,
  lastYearData,
} from "@/mock-data/creator-dashboard";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HugeiconsIcon } from "@hugeicons/react";
import { MoreVerticalIcon } from "@hugeicons/core-free-icons";

type Period = "1m" | "3m" | "6m" | "1y";

const periodConfig: Record<Period, { label: string; data: typeof lastMonthData }> = {
  "1m": { label: "Last month", data: lastMonthData },
  "3m": { label: "Last 3 months", data: last3MonthsData },
  "6m": { label: "Last 6 months", data: last6MonthsData },
  "1y": { label: "Last year", data: lastYearData },
};

const chartConfig = {
  views: {
    label: "Views",
    color: "oklch(0.55 0.17 160)",
  },
};

function formatYAxis(value: number): string {
  if (value >= 1000000) return (value / 1000000).toFixed(1) + "M";
  if (value >= 1000) return (value / 1000).toFixed(0) + "k";
  return value.toString();
}

export function MonthlyViewsChart() {
  const [period, setPeriod] = useState<Period>("1m");
  const [showGrid, setShowGrid] = useState(true);
  const [smoothCurve, setSmoothCurve] = useState(true);

  const { label, data } = periodConfig[period];

  const yMax = useMemo(() => {
    const max = Math.max(...data.map((d) => d.views));
    return Math.ceil(max / 50000) * 50000;
  }, [data]);

  const yMid = useMemo(() => Math.round(yMax / 2 / 1000) * 1000, [yMax]);

  const tickDates = useMemo(() => {
    const first = data[0]?.date ?? "";
    const mid = data[Math.floor(data.length / 2)]?.date ?? "";
    const last = data[data.length - 1]?.date ?? "";
    return new Set([first, mid, last]);
  }, [data]);

  const resetToDefault = () => {
    setPeriod("1m");
    setShowGrid(true);
    setSmoothCurve(true);
  };

  return (
    <div className="rounded-lg border bg-card p-4 flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Monthly views</span>
          <span className="text-xs text-muted-foreground border rounded px-1.5 py-0.5">
            {label}
          </span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon" className="size-7" />
            }
          >
            <HugeiconsIcon icon={MoreVerticalIcon} className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Time Period</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {(Object.entries(periodConfig) as [Period, { label: string }][]).map(
                  ([key, { label: lbl }]) => (
                    <DropdownMenuItem key={key} onClick={() => setPeriod(key)}>
                      {lbl} {period === key && "✓"}
                    </DropdownMenuItem>
                  )
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={showGrid}
              onCheckedChange={(v) => setShowGrid(v)}
            >
              Show Grid
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={smoothCurve}
              onCheckedChange={(v) => setSmoothCurve(v)}
            >
              Smooth Curve
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={resetToDefault}>
              Reset to Default
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="min-h-[220px]">
        <ChartContainer config={chartConfig} className="h-[220px] w-full">
          <AreaChart
            data={data}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="viewsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-views)" stopOpacity={0.2} />
                <stop offset="95%" stopColor="var(--color-views)" stopOpacity={0} />
              </linearGradient>
            </defs>
            {showGrid && (
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border)"
                vertical={false}
              />
            )}
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickFormatter={(v: string) => (tickDates.has(v) ? v : "")}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickFormatter={formatYAxis}
              width={40}
              domain={[0, yMax]}
              ticks={[0, yMid, yMax]}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => [
                    `${Number(value).toLocaleString()} views`,
                    "",
                  ]}
                />
              }
            />
            <Area
              type={smoothCurve ? "monotone" : "linear"}
              dataKey="views"
              stroke="var(--color-views)"
              strokeWidth={2}
              fill="url(#viewsGradient)"
              dot={false}
              activeDot={{
                r: 4,
                fill: "var(--color-views)",
                stroke: "var(--card)",
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ChartContainer>
      </div>
    </div>
  );
}
