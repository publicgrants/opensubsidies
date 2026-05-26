export const dashboardStats = {
  viewsDelivered: { value: 19546889, change: 42, trend: "up" as const },
  budgetSpent: { value: 123674, change: 13, trend: "up" as const },
  remainingBudget: { value: 56339, change: 52, trend: "down" as const },
  activeCreators: { value: 146, change: 37, trend: "up" as const },
};

// Last month — daily points (30 days)
export const lastMonthData = [
  { date: "Apr 1", views: 82000 },
  { date: "Apr 2", views: 95000 },
  { date: "Apr 3", views: 78000 },
  { date: "Apr 4", views: 52000 },
  { date: "Apr 5", views: 68000 },
  { date: "Apr 6", views: 105000 },
  { date: "Apr 7", views: 130000 },
  { date: "Apr 8", views: 145000 },
  { date: "Apr 9", views: 110000 },
  { date: "Apr 10", views: 88000 },
  { date: "Apr 11", views: 120000 },
  { date: "Apr 12", views: 155000 },
  { date: "Apr 13", views: 135000 },
  { date: "Apr 14", views: 180000 },
  { date: "Apr 15", views: 210000 },
  { date: "Apr 16", views: 238000 },
  { date: "Apr 17", views: 254882 },
  { date: "Apr 18", views: 230000 },
  { date: "Apr 19", views: 175000 },
  { date: "Apr 20", views: 145000 },
  { date: "Apr 21", views: 162000 },
  { date: "Apr 22", views: 185000 },
  { date: "Apr 23", views: 210000 },
  { date: "Apr 24", views: 195000 },
  { date: "Apr 25", views: 215000 },
  { date: "Apr 26", views: 240000 },
  { date: "Apr 27", views: 258000 },
  { date: "Apr 28", views: 245000 },
  { date: "Apr 29", views: 265000 },
  { date: "Apr 30", views: 275000 },
];

// Last 3 months — weekly points (~13 weeks)
export const last3MonthsData = [
  { date: "Feb W1", views: 38000 },
  { date: "Feb W2", views: 52000 },
  { date: "Feb W3", views: 45000 },
  { date: "Feb W4", views: 61000 },
  { date: "Mar W1", views: 74000 },
  { date: "Mar W2", views: 68000 },
  { date: "Mar W3", views: 89000 },
  { date: "Mar W4", views: 112000 },
  { date: "Apr W1", views: 98000 },
  { date: "Apr W2", views: 145000 },
  { date: "Apr W3", views: 208000 },
  { date: "Apr W4", views: 235000 },
  { date: "Apr W5", views: 275000 },
];

// Last 6 months — bi-weekly points (~12 points)
export const last6MonthsData = [
  { date: "Nov 1", views: 22000 },
  { date: "Nov 15", views: 31000 },
  { date: "Dec 1", views: 28000 },
  { date: "Dec 15", views: 35000 },
  { date: "Jan 1", views: 29000 },
  { date: "Jan 15", views: 48000 },
  { date: "Feb 1", views: 42000 },
  { date: "Feb 15", views: 68000 },
  { date: "Mar 1", views: 85000 },
  { date: "Mar 15", views: 142000 },
  { date: "Apr 1", views: 195000 },
  { date: "Apr 15", views: 275000 },
];

// Last year — monthly points (12 months)
export const lastYearData = [
  { date: "May", views: 18000 },
  { date: "Jun", views: 25000 },
  { date: "Jul", views: 22000 },
  { date: "Aug", views: 31000 },
  { date: "Sep", views: 28000 },
  { date: "Oct", views: 42000 },
  { date: "Nov", views: 38000 },
  { date: "Dec", views: 35000 },
  { date: "Jan", views: 55000 },
  { date: "Feb", views: 72000 },
  { date: "Mar", views: 148000 },
  { date: "Apr", views: 275000 },
];

export const recentUploads = [
  {
    id: "1",
    imageUrl: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&h=300&fit=crop",
    views: 5778,
    timeAgo: "2d ago",
  },
  {
    id: "2",
    imageUrl: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=400&h=300&fit=crop",
    views: 133672,
    timeAgo: "4d ago",
  },
  {
    id: "3",
    imageUrl: "https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=400&h=300&fit=crop",
    views: 34999,
    timeAgo: "7d ago",
  },
  {
    id: "4",
    imageUrl: "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=400&h=300&fit=crop",
    views: 89234,
    timeAgo: "9d ago",
  },
];

export type CampaignStatus = "Draft" | "Live" | "Paused" | "Ended";
export type Platform = "Instagram" | "TikTok" | "Facebook" | "Shorts";

export interface Campaign {
  id: string;
  name: string;
  avatarSeed: string;
  status: CampaignStatus;
  platforms: Platform[];
  payRate: string;
  creators: number;
  submissions: number;
  paid: number;
  percentage: number;
  budget: number;
}

const campaignSeeds: Omit<Campaign, "id">[] = [
  { name: "The Investor Lookout", avatarSeed: "investor", status: "Draft", platforms: [], payRate: "$0.00 / 1k", creators: 0, submissions: 0, paid: 0, percentage: 0, budget: 0 },
  { name: "Mintify Bytes", avatarSeed: "mintify", status: "Live", platforms: ["Instagram", "TikTok", "Shorts"], payRate: "$4.50 / 1k", creators: 28, submissions: 64, paid: 6480, percentage: 54, budget: 12000 },
  { name: "Bionic Marketing", avatarSeed: "bionic", status: "Paused", platforms: ["Instagram", "TikTok"], payRate: "$6.00 / 1k", creators: 19, submissions: 41, paid: 9180, percentage: 61, budget: 15000 },
  { name: "Howie Town", avatarSeed: "howie", status: "Live", platforms: ["TikTok"], payRate: "$5.25 / 1k", creators: 14, submissions: 23, paid: 2940, percentage: 42, budget: 7000 },
  { name: "CityChad", avatarSeed: "citychad", status: "Live", platforms: ["TikTok", "Facebook"], payRate: "$8.00 / 1k", creators: 11, submissions: 18, paid: 7200, percentage: 60, budget: 12000 },
  { name: "Sensu Investor", avatarSeed: "sensu", status: "Ended", platforms: ["Instagram", "TikTok", "Shorts"], payRate: "$4.00 / 1k", creators: 22, submissions: 57, paid: 8000, percentage: 100, budget: 8000 },
  { name: "Game Launch", avatarSeed: "game", status: "Draft", platforms: [], payRate: "$0.00 / 1k", creators: 0, submissions: 0, paid: 0, percentage: 0, budget: 0 },
  { name: "Personal Brand Accelerator", avatarSeed: "personal", status: "Ended", platforms: ["Instagram", "TikTok"], payRate: "$4.50 / 1k", creators: 18, submissions: 32, paid: 4205, percentage: 46, budget: 9975 },
  { name: "Tech Horizon", avatarSeed: "tech", status: "Live", platforms: ["Instagram", "Facebook"], payRate: "$5.00 / 1k", creators: 25, submissions: 48, paid: 9500, percentage: 68, budget: 14000 },
  { name: "Fitness Daily", avatarSeed: "fitness", status: "Paused", platforms: ["TikTok", "Shorts"], payRate: "$3.50 / 1k", creators: 16, submissions: 30, paid: 3800, percentage: 38, budget: 10000 },
  { name: "Crypto Pulse", avatarSeed: "crypto", status: "Live", platforms: ["Instagram", "TikTok", "Facebook"], payRate: "$7.00 / 1k", creators: 32, submissions: 71, paid: 14200, percentage: 79, budget: 18000 },
  { name: "Vlog Universe", avatarSeed: "vlog", status: "Ended", platforms: ["Shorts", "TikTok"], payRate: "$3.00 / 1k", creators: 9, submissions: 21, paid: 2100, percentage: 100, budget: 2100 },
  { name: "Style Forward", avatarSeed: "style", status: "Live", platforms: ["Instagram"], payRate: "$5.50 / 1k", creators: 20, submissions: 38, paid: 7600, percentage: 72, budget: 11000 },
  { name: "Startup Stories", avatarSeed: "startup", status: "Draft", platforms: [], payRate: "$0.00 / 1k", creators: 0, submissions: 0, paid: 0, percentage: 0, budget: 5000 },
  { name: "Food Explorers", avatarSeed: "food", status: "Live", platforms: ["Instagram", "TikTok", "Shorts"], payRate: "$4.00 / 1k", creators: 27, submissions: 55, paid: 8250, percentage: 58, budget: 14200 },
  { name: "Travel Diaries", avatarSeed: "travel", status: "Paused", platforms: ["Instagram", "Facebook"], payRate: "$6.50 / 1k", creators: 12, submissions: 29, paid: 5800, percentage: 44, budget: 13200 },
  { name: "Mindset Mastery", avatarSeed: "mindset", status: "Ended", platforms: ["TikTok", "Shorts"], payRate: "$3.75 / 1k", creators: 15, submissions: 34, paid: 3400, percentage: 100, budget: 3400 },
  { name: "Web3 Insiders", avatarSeed: "web3", status: "Live", platforms: ["Instagram", "TikTok"], payRate: "$9.00 / 1k", creators: 8, submissions: 14, paid: 4500, percentage: 45, budget: 10000 },
  { name: "Eco Warriors", avatarSeed: "eco", status: "Draft", platforms: [], payRate: "$0.00 / 1k", creators: 0, submissions: 0, paid: 0, percentage: 0, budget: 8000 },
  { name: "Hustle Culture", avatarSeed: "hustle", status: "Live", platforms: ["TikTok", "Shorts", "Facebook"], payRate: "$5.00 / 1k", creators: 23, submissions: 47, paid: 9400, percentage: 65, budget: 14500 },
  { name: "DIY Masters", avatarSeed: "diy", status: "Paused", platforms: ["Instagram", "Shorts"], payRate: "$4.25 / 1k", creators: 17, submissions: 36, paid: 5100, percentage: 40, budget: 12800 },
  { name: "Finance for Gen Z", avatarSeed: "finance", status: "Ended", platforms: ["TikTok", "Instagram"], payRate: "$6.00 / 1k", creators: 30, submissions: 62, paid: 12400, percentage: 100, budget: 12400 },
  { name: "Gaming Legends", avatarSeed: "gaming", status: "Live", platforms: ["TikTok", "Shorts"], payRate: "$3.50 / 1k", creators: 21, submissions: 44, paid: 5500, percentage: 48, budget: 11500 },
  { name: "Beauty Secrets", avatarSeed: "beauty", status: "Live", platforms: ["Instagram", "TikTok", "Facebook"], payRate: "$7.50 / 1k", creators: 35, submissions: 78, paid: 17600, percentage: 82, budget: 21500 },
  { name: "Productivity Hacks", avatarSeed: "productivity", status: "Ended", platforms: ["Instagram"], payRate: "$4.75 / 1k", creators: 13, submissions: 28, paid: 3990, percentage: 100, budget: 3990 },
];

export const campaigns: Campaign[] = campaignSeeds.map((c, i) => ({ ...c, id: String(i + 1) }));

export const folders = [
  { id: "1", name: "Product launch" },
  { id: "2", name: "Personal brand" },
  { id: "3", name: "Build in public" },
  { id: "4", name: "Lunor design" },
  { id: "5", name: "Day life vlogs" },
];
