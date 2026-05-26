"use client";

import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { HugeiconsIcon } from "@hugeicons/react";
import { Folder01Icon, Share01Icon, Github01Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { lastUpdated } from "@/mock-data/dashboard";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DashboardHeader() {
  return (
    <header className="flex items-center justify-between gap-4 px-4 sm:px-6 py-3 border-b bg-card sticky top-0 z-10 w-full shrink-0">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="-ml-2" />
        <div className="flex items-center gap-2 text-muted-foreground">
          <HugeiconsIcon icon={Folder01Icon} className="size-4" />
          <span className="text-sm font-medium">Dashboard</span>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <span className="text-xs text-muted-foreground hidden sm:inline">
          Last Updated {lastUpdated}
        </span>
        <div className="flex -space-x-2">
          <Avatar className="size-7 border-2 border-card">
            <AvatarImage src="https://api.dicebear.com/9.x/glass/svg?seed=a" />
            <AvatarFallback>A</AvatarFallback>
          </Avatar>
          <Avatar className="size-7 border-2 border-card">
            <AvatarImage src="https://api.dicebear.com/9.x/glass/svg?seed=b" />
            <AvatarFallback>B</AvatarFallback>
          </Avatar>
          <Avatar className="size-7 border-2 border-card">
            <AvatarImage src="https://api.dicebear.com/9.x/glass/svg?seed=c" />
            <AvatarFallback>C</AvatarFallback>
          </Avatar>
        </div>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          <HugeiconsIcon icon={Share01Icon} className="size-3.5" />
          <span className="hidden sm:inline">Share</span>
        </Button>
        <ThemeToggle />
        <Link
          href="https://github.com/ln-dev7/square-ui/tree/master/templates-baseui/dashboard-5"
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-8")}
        >
          <HugeiconsIcon icon={Github01Icon} className="size-5" />
        </Link>
      </div>
    </header>
  );
}
