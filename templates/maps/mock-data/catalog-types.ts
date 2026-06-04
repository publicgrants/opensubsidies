export type FunderType =
  | "government"
  | "supranational"
  | "foundation"
  | "unknown";

export type InstrumentType =
  | "grant"
  | "loan"
  | "guarantee"
  | "voucher"
  | "equity"
  | "mixed"
  | "unknown";

export type ApplicationMode =
  | "rolling"
  | "deadline"
  | "call_window"
  | "unknown";

export type CatalogState =
  | "planned"
  | "in_progress"
  | "ready_for_verification"
  | "complete";

export type FunderRecord = {
  id: string;
  name: string;
  shortName: string;
  funderType: FunderType;
  country: string;
  countryName: string;
  region: string;
  hqCity: string | null;
  website: string;
  faviconUrl: string;
  prose: string;
  state: CatalogState;
};

export type GrantDocument = { title: string; url: string };

export type GrantRecord = {
  id: string;
  name: string;
  funderId: string;
  url: string;
  applicationUrl: string | null;
  applicationMode: ApplicationMode;
  opensAt: string | null;
  closesAt: string | null;
  currency: string | null;
  minAmount: number | null;
  maxAmount: number | null;
  fundingRatePct: number | null;
  totalBudget: number | null;
  instrumentType: InstrumentType;
  schemeCode: string | null;
  program: string | null;
  documents: GrantDocument[];
  sourceUpdatedAt: string | null;
  prose: string;
  state: CatalogState;
};

export type Catalog = {
  generatedAt: string;
  funders: FunderRecord[];
  grants: GrantRecord[];
};
