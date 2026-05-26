"use client";

import Link from "next/link";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { HugeiconsIcon } from "@hugeicons/react";
import { Github01Icon, Megaphone01Icon } from "@hugeicons/core-free-icons";

export function DashboardHeader() {
  return (
    <header className="flex items-center justify-between gap-4 px-4 sm:px-6 py-3 border-b bg-card sticky top-0 z-10 w-full shrink-0">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="-ml-2" />
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={Megaphone01Icon} className="size-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Campaigns</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Button variant="ghost" size="icon" className="size-8" render={
          <Link
            href="https://github.com/ln-dev7/square-ui/tree/master/templates-baseui/marketing-dashboard"
            target="_blank"
            rel="noopener noreferrer"
          />
        }>
          <HugeiconsIcon icon={Github01Icon} className="size-5" />
        </Button>
      </div>
    </header>
  );
}
