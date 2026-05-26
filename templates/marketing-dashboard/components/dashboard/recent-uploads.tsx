import { Upload } from "lucide-react";
import Image from "next/image";
import { recentUploads } from "@/mock-data/creator-dashboard";

function formatViews(views: number): string {
  if (views >= 1000000) return (views / 1000000).toFixed(1) + "M";
  if (views >= 1000) return (views / 1000).toFixed(1) + "k";
  return views.toLocaleString();
}

export function RecentUploads() {
  return (
    <div className="rounded-lg border bg-card p-4 flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Recent uploads</span>
        <Upload className="size-3.5 text-muted-foreground" />
      </div>
      <div className="w-full flex gap-2 h-full">
        {recentUploads.map((upload) => (
          <div key={upload.id} className="relative rounded-lg overflow-hidden aspect-4/5 group cursor-pointer border border-white/20 h-full">
            <img
              src={upload.imageUrl}
              alt="Upload thumbnail"
              className="object-cover transition-transform duration-300 w-full h-full"
            />
            <div className="absolute inset-0 bg-linear-to-b from-transparent from-60% to-black/70" />
            <div className="absolute bottom-[6px] left-[4px] right-[4px] bg-background rounded-md px-2.5 py-1.5 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-foreground truncate">
                {formatViews(upload.views)} views
              </span>
              <span className="text-[10px] font-medium text-muted-foreground border border-border rounded px-1.5 py-0.5 shrink-0 bg-muted/50">
                {upload.timeAgo}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
