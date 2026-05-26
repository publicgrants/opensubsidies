import { Eye, TrendingDown, TrendingUp, Users, WalletMinimal, Coins } from "lucide-react";
import { dashboardStats } from "@/mock-data/creator-dashboard";
import { cn } from "@/lib/utils";

function formatNumber(value: number): string {
  if (value >= 1000000) return (value / 1000000).toFixed(1) + "M";
  if (value >= 1000) return value.toLocaleString();
  return value.toString();
}

function formatCurrency(value: number): string {
  return "$" + value.toLocaleString();
}

const statsConfig = [
  {
    key: "viewsDelivered" as const,
    label: "Views delivered",
    icon: Eye,
    format: formatNumber,
  },
  {
    key: "budgetSpent" as const,
    label: "Budget spent",
    icon: WalletMinimal,
    format: formatCurrency,
  },
  {
    key: "remainingBudget" as const,
    label: "Remaining budget",
    icon: Coins,
    format: formatCurrency,
  },
  {
    key: "activeCreators" as const,
    label: "Active creators",
    icon: Users,
    format: (v: number) => v.toString(),
  },
];

export function StatsCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {statsConfig.map(({ key, label, icon: Icon, format }) => {
        const stat = dashboardStats[key];
        const isUp = stat.trend === "up";

        return (
          <div
            key={key}
            className="rounded-lg border bg-muted/30 p-3 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">
                {label}
              </span>
              <Icon className="size-3.5 text-muted-foreground" />
            </div>
            <div className="rounded-md border bg-card p-3 flex items-center justify-between">
              <span className="text-2xl font-semibold tracking-tight">
                {format(stat.value)}
              </span>
              <div className="flex items-center gap-1">
                {isUp ? (
                  <TrendingUp className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <TrendingDown className="size-3.5 text-destructive" />
                )}
                <span
                  className={cn(
                    "text-sm font-medium",
                    isUp
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-destructive"
                  )}
                >
                  {stat.change}%
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
