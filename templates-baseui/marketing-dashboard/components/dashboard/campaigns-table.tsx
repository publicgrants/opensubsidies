"use client";

import { useMemo, useState } from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  campaigns,
  type Campaign,
  type CampaignStatus,
  type Platform,
} from "@/mock-data/creator-dashboard";
import { useCreatorDashboardStore } from "@/store/creator-dashboard-store";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  InstagramIcon,
  Add01Icon,
  Search01Icon,
  FilterIcon,
  SortByDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowLeftDoubleIcon,
  ArrowRightDoubleIcon,
  ArrowUpDownIcon,
} from "@hugeicons/core-free-icons";

function PlatformIcon({ platform }: { platform: Platform }) {
  return (
    <span title={platform} aria-label={platform}>
      {platform === "Instagram" && (
        <HugeiconsIcon icon={InstagramIcon} className="size-3.5 text-pink-500" />
      )}
      {platform === "TikTok" && (
        <svg className="size-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.84a8.2 8.2 0 004.79 1.53V6.92a4.85 4.85 0 01-1.02-.23z" />
        </svg>
      )}
      {platform === "Facebook" && (
        <svg className="size-3.5 text-blue-600" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      )}
      {platform === "Shorts" && (
        <svg className="size-3.5 text-red-500" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M10 15l5.19-3L10 9v6m11.56-7.83c.13.47.22 1.1.28 1.9.07.8.1 1.49.1 2.09L22 12c0 2.19-.16 3.8-.44 4.83-.25.9-.83 1.48-1.73 1.73-.47.13-1.33.22-2.65.28-1.3.07-2.49.1-3.59.1L12 19c-4.19 0-6.8-.16-7.83-.44-.9-.25-1.48-.83-1.73-1.73-.13-.47-.22-1.1-.28-1.9-.07-.8-.1-1.49-.1-2.09L2 12c0-2.19.16-3.8.44-4.83.25-.9.83-1.48 1.73-1.73.47-.13 1.33-.22 2.65-.28 1.3-.07 2.49-.1 3.59-.1L12 5c4.19 0 6.8.16 7.83.44.9.25 1.48.83 1.73 1.73z" />
        </svg>
      )}
    </span>
  );
}

function StatusBadge({ status }: { status: CampaignStatus }) {
  const variants: Record<CampaignStatus, string> = {
    Draft: "border text-muted-foreground bg-transparent",
    Live: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900",
    Paused: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 border-amber-200 dark:border-amber-900",
    Ended: "bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-400 border-pink-200 dark:border-pink-900",
  };
  return (
    <Badge variant="outline" className={cn("text-xs font-medium px-2 py-0.5", variants[status])}>
      {status}
    </Badge>
  );
}

export function CampaignsTable() {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState({});
  const { searchQuery, statusFilter, platformFilter, setSearchQuery, setStatusFilter, setPlatformFilter } =
    useCreatorDashboardStore();

  const columns = useMemo<ColumnDef<Campaign>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected()
                ? true
                : table.getIsSomePageRowsSelected()
                ? true
                : false
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "name",
        header: ({ column }) => (
          <Button variant="ghost" className="h-auto p-0 font-medium text-xs hover:bg-transparent" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Campaign name <HugeiconsIcon icon={ArrowUpDownIcon} className="ml-1 size-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-2 min-w-[160px]">
            <Avatar className="size-6 shrink-0">
              <AvatarImage src={`https://api.dicebear.com/9.x/glass/svg?seed=${row.original.avatarSeed}`} />
              <AvatarFallback className="text-xs">{row.original.name[0]}</AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium truncate">{row.original.name}</span>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: ({ column }) => (
          <Button variant="ghost" className="h-auto p-0 font-medium text-xs hover:bg-transparent" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Status <HugeiconsIcon icon={ArrowUpDownIcon} className="ml-1 size-3" />
          </Button>
        ),
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "platforms",
        header: ({ column }) => (
          <Button variant="ghost" className="h-auto p-0 font-medium text-xs hover:bg-transparent" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Platforms <HugeiconsIcon icon={ArrowUpDownIcon} className="ml-1 size-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            {row.original.platforms.map((p) => <PlatformIcon key={p} platform={p} />)}
          </div>
        ),
      },
      {
        accessorKey: "payRate",
        header: ({ column }) => (
          <Button variant="ghost" className="h-auto p-0 font-medium text-xs hover:bg-transparent" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Pay rate <HugeiconsIcon icon={ArrowUpDownIcon} className="ml-1 size-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{row.original.payRate}</span>
        ),
      },
      {
        accessorKey: "creators",
        header: ({ column }) => (
          <Button variant="ghost" className="h-auto p-0 font-medium text-xs hover:bg-transparent" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Creators <HugeiconsIcon icon={ArrowUpDownIcon} className="ml-1 size-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.creators || "—"}</span>
        ),
      },
      {
        accessorKey: "submissions",
        header: ({ column }) => (
          <Button variant="ghost" className="h-auto p-0 font-medium text-xs hover:bg-transparent" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Submissions <HugeiconsIcon icon={ArrowUpDownIcon} className="ml-1 size-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.submissions || "—"}</span>
        ),
      },
      {
        accessorKey: "paid",
        header: ({ column }) => (
          <Button variant="ghost" className="h-auto p-0 font-medium text-xs hover:bg-transparent" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Paid <HugeiconsIcon icon={ArrowUpDownIcon} className="ml-1 size-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="text-sm">{row.original.paid ? `$${row.original.paid.toLocaleString()}` : "$0,000"}</span>
        ),
      },
      {
        accessorKey: "percentage",
        header: ({ column }) => (
          <Button variant="ghost" className="h-auto p-0 font-medium text-xs hover:bg-transparent" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Percentage <HugeiconsIcon icon={ArrowUpDownIcon} className="ml-1 size-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-2 min-w-[80px]">
            <Progress value={row.original.percentage} className="h-1.5 flex-1" />
          </div>
        ),
      },
      {
        accessorKey: "budget",
        header: ({ column }) => (
          <Button variant="ghost" className="h-auto p-0 font-medium text-xs hover:bg-transparent" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Budget <HugeiconsIcon icon={ArrowUpDownIcon} className="ml-1 size-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.budget ? `$${row.original.budget.toLocaleString()}` : "$0,000"}
          </span>
        ),
      },
    ],
    []
  );

  const filteredData = useMemo(() => {
    let result = campaigns;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((c) => c.name.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") {
      result = result.filter((c) => c.status === statusFilter);
    }
    if (platformFilter !== "all") {
      result = result.filter((c) => c.platforms.includes(platformFilter));
    }
    return result;
  }, [searchQuery, statusFilter, platformFilter]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 8 } },
  });

  const hasActiveFilters = statusFilter !== "all" || platformFilter !== "all";
  const pageSize = table.getState().pagination.pageSize;
  const pageIndex = table.getState().pagination.pageIndex;
  const totalRows = filteredData.length;
  const from = totalRows === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min((pageIndex + 1) * pageSize, totalRows);

  return (
    <div className="rounded-lg border bg-card flex flex-col">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 border-b">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <HugeiconsIcon icon={Search01Icon} className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search campaigns..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" />
              }
            >
              <HugeiconsIcon icon={FilterIcon} className="size-3" />
              Filter
              {hasActiveFilters && <span className="size-1.5 rounded-full bg-primary" />}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuCheckboxItem checked={statusFilter === "all"} onCheckedChange={() => setStatusFilter("all")}>
                All statuses
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={statusFilter === "Draft"} onCheckedChange={() => setStatusFilter("Draft")}>
                Draft
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={statusFilter === "Live"} onCheckedChange={() => setStatusFilter("Live")}>
                Live
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={statusFilter === "Paused"} onCheckedChange={() => setStatusFilter("Paused")}>
                Paused
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={statusFilter === "Ended"} onCheckedChange={() => setStatusFilter("Ended")}>
                Ended
              </DropdownMenuCheckboxItem>
              {statusFilter !== "all" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setStatusFilter("all")}>Clear filter</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" />
              }
            >
              <HugeiconsIcon icon={SortByDown01Icon} className="size-3" />
              Sort
              {platformFilter !== "all" && <span className="size-1.5 rounded-full bg-primary" />}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              <DropdownMenuCheckboxItem checked={platformFilter === "all"} onCheckedChange={() => setPlatformFilter("all")}>
                All platforms
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={platformFilter === "Instagram"} onCheckedChange={() => setPlatformFilter("Instagram")}>
                Instagram
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={platformFilter === "TikTok"} onCheckedChange={() => setPlatformFilter("TikTok")}>
                TikTok
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={platformFilter === "Facebook"} onCheckedChange={() => setPlatformFilter("Facebook")}>
                Facebook
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={platformFilter === "Shorts"} onCheckedChange={() => setPlatformFilter("Shorts")}>
                Shorts
              </DropdownMenuCheckboxItem>
              {platformFilter !== "all" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setPlatformFilter("all")}>Clear filter</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Button size="sm" className="h-8 gap-1.5 ml-auto">
          <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
          <span className="hidden sm:inline">New campaign</span>
        </Button>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="text-xs font-medium text-muted-foreground h-10 whitespace-nowrap">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="border-b last:border-0 hover:bg-muted/30" data-state={row.getIsSelected() ? "selected" : undefined}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-3 whitespace-nowrap">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  No campaigns found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 border-t">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>
            {totalRows === 0
              ? "0 campaigns"
              : `Showing ${from} to ${to} of ${totalRows} campaigns`}
          </span>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline">Rows per page</span>
            <Select value={String(pageSize)} onValueChange={(v) => table.setPageSize(Number(v))}>
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5</SelectItem>
                <SelectItem value="8">8</SelectItem>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="size-8" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
            <HugeiconsIcon icon={ArrowLeftDoubleIcon} className="size-4" />
          </Button>
          <Button variant="outline" size="icon" className="size-8" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
          </Button>
          <span className="px-2 text-sm tabular-nums">
            {pageIndex + 1} / {table.getPageCount() || 1}
          </span>
          <Button variant="outline" size="icon" className="size-8" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
          </Button>
          <Button variant="outline" size="icon" className="size-8" onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()}>
            <HugeiconsIcon icon={ArrowRightDoubleIcon} className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
