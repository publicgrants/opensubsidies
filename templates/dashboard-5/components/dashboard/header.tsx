"use client";

import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Folder, Share2 } from "lucide-react";
import Link from "next/link";
import { Github } from "lucide-react";
import { lastUpdated } from "@/mock-data/dashboard";

export function DashboardHeader() {
  return (
    <header className="flex items-center justify-between gap-4 px-4 sm:px-6 py-3 border-b bg-card sticky top-0 z-10 w-full shrink-0">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="-ml-2" />
        <div className="flex items-center gap-2 text-muted-foreground">
          <Folder className="size-4" />
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
          <Share2 className="size-3.5" />
          <span className="hidden sm:inline">Share</span>
        </Button>
        <ThemeToggle />
        <Button variant="ghost" size="icon" asChild className="size-8">
          <Link
            href="https://github.com/ln-dev7/square-ui/tree/master/templates/dashboard-5"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Github className="size-5" />
          </Link>
        </Button>
      </div>
    </header>
  );
}
