"use client";

import { StatsCards } from "./stats-cards";
import { MonthlyViewsChart } from "./monthly-views-chart";
import { RecentUploads } from "./recent-uploads";
import { CampaignsTable } from "./campaigns-table";

export function DashboardContent() {
  return (
    <main className="w-full overflow-y-auto overflow-x-hidden p-4 h-full">
      <div className="mx-auto w-full space-y-4">
        <StatsCards />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MonthlyViewsChart />
          <RecentUploads />
        </div>
        <CampaignsTable />
      </div>
    </main>
  );
}
