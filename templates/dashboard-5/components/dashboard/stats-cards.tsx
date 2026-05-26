"use client";

import { dashboardStats } from "@/mock-data/dashboard";
import { Folder, ListTodo, Eye, CheckCircle2 } from "lucide-react";

const stats = [
  {
    title: "Total Projects",
    value: dashboardStats.totalProjects.value,
    change: dashboardStats.totalProjects.change,
    icon: Folder,
  },
  {
    title: "Total Task",
    value: dashboardStats.totalTasks.value,
    change: dashboardStats.totalTasks.change,
    icon: ListTodo,
  },
  {
    title: "In Reviews",
    value: dashboardStats.inReviews.value,
    change: dashboardStats.inReviews.change,
    icon: Eye,
  },
  {
    title: "Completed Tasks",
    value: dashboardStats.completedTasks.value,
    change: dashboardStats.completedTasks.change,
    icon: CheckCircle2,
  },
];

export function StatsCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, index) => (
        <div
          key={index}
          className="rounded-xl border border-border bg-card p-4"
        >
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{stat.title}</p>
              <p className="text-2xl font-medium text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground">
                +{stat.change} vs last month
              </p>
            </div>
            <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted shrink-0">
              <stat.icon className="size-5 text-muted-foreground" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
