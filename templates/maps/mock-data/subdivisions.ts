// Human labels for administrative subdivisions used by the funding choropleth +
// leaderboards. POC: Norwegian Fylker (ISO 3166-2:NO, post-2024 reform). The
// `NATIONAL` sentinel is the bucket for awarded money from funders with no
// single origin Fylke (national / supranational). Country-neutral by design:
// add other countries' maps keyed by ISO 3166-2 as they come online.

export const FYLKE_NAME: Record<string, string> = {
  "NO-03": "Oslo",
  "NO-11": "Rogaland",
  "NO-15": "Møre og Romsdal",
  "NO-18": "Nordland",
  "NO-31": "Østfold",
  "NO-32": "Akershus",
  "NO-33": "Buskerud",
  "NO-34": "Innlandet",
  "NO-39": "Vestfold",
  "NO-40": "Telemark",
  "NO-42": "Agder",
  "NO-46": "Vestland",
  "NO-50": "Trøndelag",
  "NO-55": "Troms",
  "NO-56": "Finnmark",
};

export const NATIONAL_SUBDIVISION = "NATIONAL";

// Label for any subdivision code (Fylke, the NATIONAL bucket, or an unknown
// kommune/poststed which we just echo back).
export function subdivisionLabel(code: string): string {
  if (code === NATIONAL_SUBDIVISION) return "National (no single Fylke)";
  return FYLKE_NAME[code] ?? code;
}
