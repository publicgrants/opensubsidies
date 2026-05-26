import { create } from "zustand";
import type { CampaignStatus, Platform } from "@/mock-data/creator-dashboard";

interface CreatorDashboardStore {
  searchQuery: string;
  statusFilter: CampaignStatus | "all";
  platformFilter: Platform | "all";
  setSearchQuery: (query: string) => void;
  setStatusFilter: (status: CampaignStatus | "all") => void;
  setPlatformFilter: (platform: Platform | "all") => void;
  clearFilters: () => void;
}

export const useCreatorDashboardStore = create<CreatorDashboardStore>((set) => ({
  searchQuery: "",
  statusFilter: "all",
  platformFilter: "all",
  setSearchQuery: (query) => set({ searchQuery: query }),
  setStatusFilter: (status) => set({ statusFilter: status }),
  setPlatformFilter: (platform) => set({ platformFilter: platform }),
  clearFilters: () =>
    set({
      searchQuery: "",
      statusFilter: "all",
      platformFilter: "all",
    }),
}));
