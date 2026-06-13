// Build-time funding step: streams every `sources/*/awards.jsonl` in the
// grants-sources catalog and emits pre-aggregated rollups as a D1 seed file
// (scripts/.generated/funding.sql), loaded via `wrangler d1 execute`. Run via
// `pnpm build:funding` (also chained into `pnpm build:data`).
//
// The raw catalog holds ~2.4M award records — far too many to ship to the
// browser or hold in memory. We stream line-by-line and keep only compact
// aggregates:
//   funding_country     — per (view, country) totals for map bubbles + the hero
//   funding_entity      — top-N recipients/funders per (view, scope) for leaderboards
//   funding_coverage    — per-country data-completeness for the honesty chips
//   funding_subdivision — per (view, scope, level, subdivision) totals for the
//                         within-country Fylke choropleth + per-provider drill-down
//                         (scope = country code for the aggregate, or funderId)
//   funding_recipient_year — per (recipient, year, funder) grant breakdown for the
//                         recipient-detail panel; built in a SECOND streaming pass
//                         gated to the recipients that surfaced in a leaderboard
//                         (bounded memory: surfaced recipients × years × funders)
//
// Correctness rules (see the plan):
//   • recipient country = recipient_country ?? funder country (the {CC} prefix)
//   • exclude ES (sample-only, anonymised) from money totals + leaderboards
//   • US-only: keep grant instruments (PROJECT GRANT (B) / COOPERATIVE
//     AGREEMENT (B)); drop the entitlements / loans / insurance / null-instrument
//     aggregates USASpending mixes in. Other jurisdictions are not filtered.
//   • mask null-id recipients (persons) from leaderboards, but still count their
//     money in country totals
//   • amounts are pre-converted to EUR via a dated snapshot; unknown currencies
//     are logged and skipped, never silently zeroed
//   • each funder has a single, pre-filtered awards.jsonl, so summing across
//     funder dirs does not double-count.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import matter from "gray-matter";

import { toEur, FX_AS_OF } from "../lib/fx-rates";
import {
  loadOrgGeoMap,
  unpackGeo,
  type OrgGeoMap,
} from "./build-geo-enrichment";

const ROOT = path.resolve(
  process.env.GRANTS_SOURCES_DIR ??
    path.resolve(process.cwd(), "../../../grants-sources"),
);
const SOURCES_DIR = path.join(ROOT, "sources");
const OUT_SQL = path.resolve(process.cwd(), "scripts/.generated/funding.sql");

// Which source data to include is the catalog's responsibility, not this
// builder's — we roll up whatever grants-sources provides. ES remains excluded
// for now only because its sample is fully anonymised (no recipient ids /
// countries); flagged for the data agent to revisit. Presentation safeguards
// apply downstream regardless: null-id recipients are masked from leaderboards
// and per-country completeness drives the coverage chips. (US is a special
// case: USASpending is the federal financial-assistance register, mixing
// competitive grants with Medicare/Medicaid entitlements, loans and insurance,
// so US records are filtered to grant instruments here — see
// includeInGrantRollup — while the full data stays in the catalog.)
const EXCLUDED_COUNTRIES = new Set(["ES"]);
const TOP_N = 50;
const ALL = "ALL";

// Countries for which we compute sub-national (subdivision) rollups. Norway is
// the POC: we have an org-nr → Fylke map (build-geo-enrichment) only for NO, and
// gating the per-funder + per-subdivision accumulation to NO keeps memory bounded
// (a global per-(funder,recipient) accumulation would be millions of entries).
// Extend this set as other countries gain a recipient-location enrichment.
const SUBDIVISION_COUNTRIES = new Set(["NO"]);
// Origin bucket for funders with no single subdivision (national/supranational).
const NATIONAL = "NATIONAL";

type View = "received" | "awarded";

// Granularity level of a subdivision rollup row. POC emits "fylke"; the
// Kommune/City toggle adds "kommune"/"city" rows with no schema change.
type SubdivLevel = "fylke" | "kommune" | "city";

// ── grants-sources award record (only the fields we use) ────────────────────
type Award = {
  recipient?: unknown;
  recipient_id?: unknown;
  recipient_country?: unknown;
  amount?: unknown;
  currency?: unknown;
  instrument?: unknown;
  funder?: unknown;
  grantor_name_raw?: unknown;
  awarded_at?: unknown;
  paid_at?: unknown;
  fetched_at?: unknown;
};

// Award year for the per-recipient breakdown: prefer awarded_at, then paid_at,
// then fetched_at; null when none yields a 4-digit year. Dates are ISO strings
// ("2026-04-30") so the leading 4 chars are the year.
function yearOf(...dates: (string | null)[]): number | null {
  for (const d of dates) {
    if (typeof d === "string" && /^\d{4}/.test(d)) {
      const y = Number(d.slice(0, 4));
      if (Number.isFinite(y)) return y;
    }
  }
  return null;
}

// ── SQL literal helpers (mirror scripts/build-catalog.ts) ───────────────────
function sqlStr(v: string | null | undefined): string {
  if (v === null || v === undefined) return "NULL";
  return "'" + v.split(String.fromCharCode(0)).join("").replace(/'/g, "''") + "'";
}
function sqlNum(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? String(v) : "NULL";
}

// Batch INSERTs by UTF-8 byte size so no statement exceeds D1's 100 KB cap.
function emitInserts<T>(
  out: string[],
  table: string,
  cols: string,
  rows: T[],
  toValues: (row: T) => string,
  maxStmtBytes = 90_000,
): void {
  const header = `INSERT INTO ${table} ${cols} VALUES\n`;
  const headerBytes = Buffer.byteLength(header, "utf8");
  let batch: string[] = [];
  let size = headerBytes;
  const flush = () => {
    if (batch.length === 0) return;
    out.push(header + batch.join(",\n") + ";");
    batch = [];
    size = headerBytes;
  };
  for (const r of rows) {
    const tuple = `(${toValues(r)})`;
    const tupleBytes = Buffer.byteLength(tuple, "utf8") + 2;
    if (batch.length > 0 && size + tupleBytes > maxStmtBytes) flush();
    batch.push(tuple);
    size += tupleBytes;
  }
  flush();
}

function walk(dir: string, filename: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, filename));
    else if (entry.name === filename) out.push(full);
  }
  return out;
}

function slugName(funderId: string): string {
  const slug = funderId.split("/")[1] ?? funderId;
  if (/^[A-Z0-9]{2,}$/.test(slug)) return slug;
  return slug
    .replace(/-/g, " ")
    .replace(/([a-zæøå])([A-ZÆØÅ])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Grant-only filter for the money rollups ─────────────────────────────────
// US is the one source that mixes competitive grants with entitlements, loans
// and insurance: USASpending is the federal *financial-assistance* register,
// not a grant register, and its CMS/Medicare/Medicaid rows alone reach tens of
// trillions. So for US we keep only the two CFDA assistance classes that are
// competitive grants comparable to the other countries' registers — project
// grants and cooperative agreements — and drop everything else, including the
// null-instrument entitlement aggregates ("MULTIPLE RECIPIENTS"). The dropped
// records stay in the catalog; they are just not summed into the totals.
//
// Every non-US jurisdiction passes through unchanged. Do NOT generalise this to
// a global "drop nulls / keep only grants": EU FTS publishes awards with
// instrument:null and NO carries garanti/laan, so a global rule would wrongly
// gut their totals. Per-country grant discipline is a separate, opt-in change.
const US_GRANT_INSTRUMENTS = new Set(["PROJECT GRANT (B)", "COOPERATIVE AGREEMENT (B)"]);
function includeInGrantRollup(funderCC: string, instrument: string | null): boolean {
  if (funderCC !== "US") return true;
  return instrument !== null && US_GRANT_INSTRUMENTS.has(instrument);
}

// ── Approximate median via a bounded log-bucket histogram ───────────────────
// Buckets span 1 … 1e12 in 0.05-decade steps (~240 buckets), so memory is O(1)
// per group regardless of how many awards flow through it.
const BUCKET_STEP = 0.05;
const BUCKET_MAX = 240;
class Hist {
  private buckets = new Map<number, number>();
  n = 0;
  add(eur: number): void {
    if (!(eur > 0)) return;
    const idx = Math.min(
      BUCKET_MAX - 1,
      Math.max(0, Math.floor(Math.log10(eur) / BUCKET_STEP)),
    );
    this.buckets.set(idx, (this.buckets.get(idx) ?? 0) + 1);
    this.n++;
  }
  median(): number | null {
    if (this.n === 0) return null;
    const target = this.n / 2;
    let cum = 0;
    for (const idx of [...this.buckets.keys()].sort((a, b) => a - b)) {
      const c = this.buckets.get(idx)!;
      if (cum + c >= target) {
        const lo = Math.pow(10, idx * BUCKET_STEP);
        const hi = Math.pow(10, (idx + 1) * BUCKET_STEP);
        return lo + (hi - lo) * ((target - cum) / c);
      }
      cum += c;
    }
    return null;
  }
}

// ── Aggregators ─────────────────────────────────────────────────────────────
type CountryAcc = {
  sumEur: number;
  count: number;
  hist: Hist;
  currencies: Set<string>;
  sumNativeByCurrency: Map<string, number>;
};
type EntityAcc = {
  name: string;
  country: string;
  currency: string;
  sumEur: number;
  sumNative: number;
  count: number;
  hist: Hist | null; // only tracked for funders (few); null for recipients
};

// Per-recipient grant breakdown: one bucket per (recipient, year, funder). Filled
// in a second pass (processFileForBreakdown) gated to the surfaced recipient set,
// so memory stays bounded (surfaced recipients × years × funders).
type RecipientYearAcc = {
  recipientId: string;
  year: number | null;
  funderId: string;
  funderName: string;
  sumEur: number;
  sumNative: number;
  count: number;
  currencies: Set<string>;
};
const recipientYearAgg = new Map<string, RecipientYearAcc>();

const countryAgg = new Map<string, CountryAcc>(); // `${view}|${country}` (+ `${view}|ALL`)
const entityAgg = new Map<string, EntityAcc>(); // `${view}|${scope}|${type}|${id}`
// Subdivision rollups: `${view}|${scope}|${level}|${subdivision}`. `scope` is a
// country code (aggregate choropleth) OR a funderId (per-provider choropleth).
const subdivAgg = new Map<string, CountryAcc>();
const countryFetched = new Map<string, string>(); // country -> max fetched_at
const funderCompleteness = new Map<string, string>(); // funderId -> completeness

// org-nr → location (Fylke/Kommune/City), loaded once for SUBDIVISION_COUNTRIES.
let orgGeo: OrgGeoMap = new Map();

// funderId → { subdivision (ISO 3166-2 | null), scope } read lazily from the
// funder's sibling source.md frontmatter. Drives the "awarded" (which Fylke
// sends) view; cached so each funder's source.md is parsed at most once.
const funderGeoCache = new Map<
  string,
  { subdivision: string | null; scope: string | null }
>();

function readFunderGeo(awardsJsonlPath: string): {
  subdivision: string | null;
  scope: string | null;
} {
  const mdPath = path.join(path.dirname(awardsJsonlPath), "source.md");
  try {
    const data = matter(fs.readFileSync(mdPath, "utf8")).data as Record<
      string,
      unknown
    >;
    const geo = (data.geography ?? {}) as Record<string, unknown>;
    return {
      subdivision:
        typeof geo.subdivision === "string" && geo.subdivision
          ? geo.subdivision
          : null,
      scope: typeof geo.scope === "string" ? geo.scope : null,
    };
  } catch {
    return { subdivision: null, scope: null };
  }
}

function addSubdiv(
  view: View,
  scope: string,
  level: SubdivLevel,
  subdivision: string,
  eur: number,
  native: number,
  currency: string,
): void {
  const key = `${view}|${scope}|${level}|${subdivision}`;
  let acc = subdivAgg.get(key);
  if (!acc) {
    acc = {
      sumEur: 0,
      count: 0,
      hist: new Hist(),
      currencies: new Set(),
      sumNativeByCurrency: new Map(),
    };
    subdivAgg.set(key, acc);
  }
  acc.sumEur += eur;
  acc.count += 1;
  acc.hist.add(eur);
  acc.currencies.add(currency);
  acc.sumNativeByCurrency.set(
    currency,
    (acc.sumNativeByCurrency.get(currency) ?? 0) + native,
  );
}

function addCountry(
  view: View,
  country: string,
  eur: number,
  native: number,
  currency: string,
): void {
  for (const c of [country, ALL]) {
    const key = `${view}|${c}`;
    let acc = countryAgg.get(key);
    if (!acc) {
      acc = {
        sumEur: 0,
        count: 0,
        hist: new Hist(),
        currencies: new Set(),
        sumNativeByCurrency: new Map(),
      };
      countryAgg.set(key, acc);
    }
    acc.sumEur += eur;
    acc.count += 1;
    acc.hist.add(eur);
    acc.currencies.add(currency);
    acc.sumNativeByCurrency.set(
      currency,
      (acc.sumNativeByCurrency.get(currency) ?? 0) + native,
    );
  }
}

function addEntity(
  view: View,
  scope: string,
  type: "recipient" | "funder",
  id: string,
  name: string,
  country: string,
  currency: string,
  eur: number,
  native: number,
  withHist: boolean,
): void {
  const key = `${view}|${scope}|${type}|${id}`;
  let acc = entityAgg.get(key);
  if (!acc) {
    acc = {
      name,
      country,
      currency,
      sumEur: 0,
      sumNative: 0,
      count: 0,
      hist: withHist ? new Hist() : null,
    };
    entityAgg.set(key, acc);
  }
  acc.sumEur += eur;
  acc.sumNative += native;
  acc.count += 1;
  acc.hist?.add(eur);
}

// ── Coverage manifest (awards.md frontmatter `completeness`) ────────────────
const SEVERITY: Record<string, number> = {
  full: 1,
  partial: 2,
  threshold_capped: 3,
  sample: 4,
};
function readCompleteness(awardsJsonlPath: string): {
  funder: string | null;
  completeness: string;
} {
  const mdPath = path.join(path.dirname(awardsJsonlPath), "awards.md");
  try {
    const raw = fs.readFileSync(mdPath, "utf8");
    const data = matter(raw).data as Record<string, unknown>;
    const funder = typeof data.funder === "string" ? data.funder : null;
    const completeness =
      typeof data.completeness === "string" ? data.completeness : "partial";
    return { funder, completeness };
  } catch {
    return { funder: null, completeness: "partial" };
  }
}

async function processFile(file: string): Promise<void> {
  const { funder: mdFunder, completeness } = readCompleteness(file);
  if (mdFunder) funderCompleteness.set(mdFunder, completeness);

  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let a: Award;
    try {
      a = JSON.parse(trimmed) as Award;
    } catch {
      continue;
    }

    const funder = typeof a.funder === "string" ? a.funder : null;
    if (!funder) continue;
    const funderCC = funder.split("/")[0] || "INTL";
    if (EXCLUDED_COUNTRIES.has(funderCC)) continue;

    const amount =
      typeof a.amount === "number" && Number.isFinite(a.amount) ? a.amount : null;
    const currency = typeof a.currency === "string" ? a.currency : null;
    if (amount === null || amount <= 0 || !currency) {
      stats.skippedNoAmount++;
      continue;
    }
    const eur = toEur(amount, currency);
    if (eur === null) {
      stats.unconvertible++;
      stats.unknownCurrencies.add(currency);
      continue;
    }

    // Grant-only filter (US mixes entitlements/loans/insurance into the same
    // register). A money-bearing record dropped here is one we deliberately
    // exclude from the totals; it remains in the catalog.
    const instrument = typeof a.instrument === "string" ? a.instrument : null;
    if (!includeInGrantRollup(funderCC, instrument)) {
      stats.skippedNonGrant++;
      continue;
    }
    stats.counted++;

    const fetched = typeof a.fetched_at === "string" ? a.fetched_at : null;

    // ── awarded: money leaving a funder, placed at the funder's country ──
    const funderName =
      typeof a.grantor_name_raw === "string" && a.grantor_name_raw.trim()
        ? a.grantor_name_raw
        : slugName(funder);
    addCountry("awarded", funderCC, eur, amount, currency);
    addEntity("awarded", ALL, "funder", funder, funderName, funderCC, currency, eur, amount, true);
    addEntity("awarded", funderCC, "funder", funder, funderName, funderCC, currency, eur, amount, true);
    if (fetched) trackFetched(funderCC, fetched);

    // "which Fylke sends the most": place awarded money on the funder's own
    // subdivision (regional/local funders) or the NATIONAL bucket (national /
    // supranational funders have no single origin Fylke — never smear them).
    const doSubdivision = SUBDIVISION_COUNTRIES.has(funderCC);
    if (doSubdivision) {
      let fg = funderGeoCache.get(funder);
      if (!fg) {
        fg = readFunderGeo(file);
        funderGeoCache.set(funder, fg);
      }
      const origin =
        (fg.scope === "regional" || fg.scope === "local") && fg.subdivision
          ? fg.subdivision
          : NATIONAL;
      addSubdiv("awarded", funderCC, "fylke", origin, eur, amount, currency);
    }

    // ── received: money landing on a recipient, placed at recipient country ──
    const recCountry =
      typeof a.recipient_country === "string" && a.recipient_country
        ? a.recipient_country
        : funderCC;
    addCountry("received", recCountry, eur, amount, currency);
    if (fetched) trackFetched(recCountry, fetched);

    const recId =
      typeof a.recipient_id === "string" && a.recipient_id ? a.recipient_id : null;
    const recName =
      typeof a.recipient === "string" && a.recipient.trim() ? a.recipient : null;
    // Mask null-id recipients (persons) from leaderboards; their money still
    // counts in the country totals above.
    if (recId && recName) {
      addEntity("received", ALL, "recipient", recId, recName, recCountry, currency, eur, amount, false);
      addEntity("received", recCountry, "recipient", recId, recName, recCountry, currency, eur, amount, false);
    }

    // "where money flows TO, by Fylke": resolve the recipient's own registered
    // location (independent of the funder) from the brreg enrichment. Drives
    // both the country choropleth and the per-provider drill-down (a funder —
    // national OR regional — shading the map by where its money lands + its
    // top-10 receivers). Gated to SUBDIVISION_COUNTRIES to bound memory.
    if (doSubdivision && recId) {
      const geo = unpackGeo(orgGeo.get(recId));
      if (geo?.fylke) {
        // Emit all three granularity levels so the Fylke↔Kommune↔City toggle is
        // a pure read switch. Codes: fylke = ISO 3166-2 (NO-42); kommune =
        // 4-digit kommune number; city = poststed name.
        const levels: [SubdivLevel, string | null][] = [
          ["fylke", geo.fylke],
          ["kommune", geo.kommunenr],
          ["city", geo.poststed],
        ];
        for (const [level, code] of levels) {
          if (!code) continue;
          // country-scoped choropleth (which area receives the most)
          addSubdiv("received", recCountry, level, code, eur, amount, currency);
          // per-provider choropleth (where THIS funder's money flows)
          addSubdiv("received", funder, level, code, eur, amount, currency);
        }
        if (recName) {
          // recipient leaderboards within the clicked Fylke / Kommune, plus this
          // funder's top receivers (the provider drill-down popup table).
          addEntity("received", geo.fylke, "recipient", recId, recName, recCountry, currency, eur, amount, false);
          if (geo.kommunenr)
            addEntity("received", geo.kommunenr, "recipient", recId, recName, recCountry, currency, eur, amount, false);
          addEntity("received", funder, "recipient", recId, recName, recCountry, currency, eur, amount, false);
        }
      }
    }
  }
}

function trackFetched(country: string, fetched: string): void {
  const cur = countryFetched.get(country);
  if (!cur || fetched > cur) countryFetched.set(country, fetched);
}

// Second pass: for each award whose recipient is in the surfaced set, accumulate a
// global (recipient, year, funder) bucket. Re-applies the SAME guards as
// processFile (funder, excluded countries, valid amount/currency, EUR conversion,
// US grant-only filter) so the per-recipient totals reconcile with the leaderboard.
async function processFileForBreakdown(
  file: string,
  surfaced: Set<string>,
): Promise<void> {
  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let a: Award;
    try {
      a = JSON.parse(trimmed) as Award;
    } catch {
      continue;
    }

    const recId =
      typeof a.recipient_id === "string" && a.recipient_id ? a.recipient_id : null;
    if (!recId || !surfaced.has(recId)) continue;

    const funder = typeof a.funder === "string" ? a.funder : null;
    if (!funder) continue;
    const funderCC = funder.split("/")[0] || "INTL";
    if (EXCLUDED_COUNTRIES.has(funderCC)) continue;

    const amount =
      typeof a.amount === "number" && Number.isFinite(a.amount) ? a.amount : null;
    const currency = typeof a.currency === "string" ? a.currency : null;
    if (amount === null || amount <= 0 || !currency) continue;
    const eur = toEur(amount, currency);
    if (eur === null) continue;

    const instrument = typeof a.instrument === "string" ? a.instrument : null;
    if (!includeInGrantRollup(funderCC, instrument)) continue;

    const year = yearOf(
      typeof a.awarded_at === "string" ? a.awarded_at : null,
      typeof a.paid_at === "string" ? a.paid_at : null,
      typeof a.fetched_at === "string" ? a.fetched_at : null,
    );
    const funderName =
      typeof a.grantor_name_raw === "string" && a.grantor_name_raw.trim()
        ? a.grantor_name_raw
        : slugName(funder);

    const key = `${recId}${year ?? ""}${funder}`;
    let acc = recipientYearAgg.get(key);
    if (!acc) {
      acc = {
        recipientId: recId,
        year,
        funderId: funder,
        funderName,
        sumEur: 0,
        sumNative: 0,
        count: 0,
        currencies: new Set(),
      };
      recipientYearAgg.set(key, acc);
    }
    acc.sumEur += eur;
    acc.sumNative += amount;
    acc.count += 1;
    acc.currencies.add(currency);
  }
}

const stats = {
  files: 0,
  counted: 0,
  skippedNoAmount: 0,
  skippedNonGrant: 0,
  unconvertible: 0,
  unknownCurrencies: new Set<string>(),
};

async function main(): Promise<void> {
  if (!fs.existsSync(SOURCES_DIR)) {
    console.error(
      `[build-funding] grants-sources not found at ${ROOT}. ` +
        `Set GRANTS_SOURCES_DIR or clone the catalog as a sibling.`,
    );
    process.exit(1);
  }

  // Recipient-location enrichment (org-nr → Fylke/Kommune/City) for the
  // subdivision rollups. Loaded once; skipped entirely if no subdivision
  // countries are configured.
  if (SUBDIVISION_COUNTRIES.size > 0) {
    console.log(
      `[build-funding] loading recipient geo for [${[...SUBDIVISION_COUNTRIES].join(", ")}] …`,
    );
    orgGeo = await loadOrgGeoMap();
    console.log(`[build-funding] geo map: ${orgGeo.size.toLocaleString()} orgs`);
  }

  const files = walk(SOURCES_DIR, "awards.jsonl");
  console.log(`[build-funding] reading ${files.length} awards.jsonl files from ${ROOT}`);
  for (const file of files) {
    stats.files++;
    await processFile(file);
  }

  // ── funding_country rows (incl. the 'ALL' global hero row per view) ──
  type CountryRow = {
    view: string;
    country: string;
    sumEur: number;
    count: number;
    medianEur: number | null;
    nativeCurrency: string | null;
    sumNative: number | null;
  };
  const countryRows: CountryRow[] = [];
  for (const [key, acc] of countryAgg) {
    const [view, country] = key.split("|");
    const single = acc.currencies.size === 1 ? [...acc.currencies][0] : null;
    countryRows.push({
      view,
      country,
      sumEur: Math.round(acc.sumEur),
      count: acc.count,
      medianEur: acc.hist.median(),
      nativeCurrency: single,
      sumNative: single ? Math.round(acc.sumNativeByCurrency.get(single)!) : null,
    });
  }

  // ── funding_entity rows: top-N per (view, scope) ──
  type EntityRow = {
    view: string;
    scope: string;
    type: string;
    id: string;
    name: string;
    country: string;
    sumEur: number;
    count: number;
    medianEur: number | null;
    currency: string;
    sumNative: number;
    rank: number;
  };
  const groups = new Map<string, { view: string; scope: string; type: string; id: string; acc: EntityAcc }[]>();
  for (const [key, acc] of entityAgg) {
    const [view, scope, type, ...idParts] = key.split("|");
    const id = idParts.join("|");
    const gk = `${view}|${scope}`;
    if (!groups.has(gk)) groups.set(gk, []);
    groups.get(gk)!.push({ view, scope, type, id, acc });
  }
  const entityRows: EntityRow[] = [];
  for (const arr of groups.values()) {
    arr.sort((a, b) => b.acc.sumEur - a.acc.sumEur);
    arr.slice(0, TOP_N).forEach((e, i) => {
      entityRows.push({
        view: e.view,
        scope: e.scope,
        type: e.type,
        id: e.id,
        name: e.acc.name,
        country: e.acc.country,
        sumEur: Math.round(e.acc.sumEur),
        count: e.acc.count,
        medianEur: e.acc.hist ? e.acc.hist.median() : null,
        currency: e.acc.currency,
        sumNative: Math.round(e.acc.sumNative),
        rank: i + 1,
      });
    });
  }

  // ── funding_recipient_year rows: per (recipient, year, funder) ──
  // Only recipients that surfaced in a leaderboard are clickable, so build the
  // breakdown for that bounded set via a second streaming pass over the files.
  const surfaced = new Set(
    entityRows.filter((r) => r.type === "recipient").map((r) => r.id),
  );
  console.log(
    `[build-funding] breakdown pass for ${surfaced.size.toLocaleString()} surfaced recipients …`,
  );
  for (const file of files) await processFileForBreakdown(file, surfaced);

  type RecipientYearRow = {
    recipientId: string;
    year: number | null;
    funderId: string;
    funderName: string;
    sumEur: number;
    count: number;
    nativeCurrency: string | null;
    sumNative: number | null;
  };
  const recipientYearRows: RecipientYearRow[] = [];
  for (const acc of recipientYearAgg.values()) {
    const single = acc.currencies.size === 1 ? [...acc.currencies][0] : null;
    recipientYearRows.push({
      recipientId: acc.recipientId,
      year: acc.year,
      funderId: acc.funderId,
      funderName: acc.funderName,
      sumEur: Math.round(acc.sumEur),
      count: acc.count,
      nativeCurrency: single,
      sumNative: single ? Math.round(acc.sumNative) : null,
    });
  }

  // ── funding_subdivision rows: per (view, scope, level, subdivision) ──
  type SubdivRow = {
    view: string;
    scope: string;
    level: string;
    subdivision: string;
    sumEur: number;
    count: number;
    medianEur: number | null;
    nativeCurrency: string | null;
    sumNative: number | null;
  };
  const subdivRows: SubdivRow[] = [];
  for (const [key, acc] of subdivAgg) {
    // scope may itself contain '|' is impossible (country codes / funderIds use
    // '/'), so a 4-way split is safe.
    const [view, scope, level, subdivision] = key.split("|");
    const single = acc.currencies.size === 1 ? [...acc.currencies][0] : null;
    subdivRows.push({
      view,
      scope,
      level,
      subdivision,
      sumEur: Math.round(acc.sumEur),
      count: acc.count,
      medianEur: acc.hist.median(),
      nativeCurrency: single,
      sumNative: single ? Math.round(acc.sumNativeByCurrency.get(single)!) : null,
    });
  }

  // ── funding_coverage rows: worst completeness per country ──
  const countryCompleteness = new Map<string, string>();
  for (const [funderId, completeness] of funderCompleteness) {
    const cc = funderId.split("/")[0] || "INTL";
    if (EXCLUDED_COUNTRIES.has(cc)) continue;
    const prev = countryCompleteness.get(cc);
    if (!prev || (SEVERITY[completeness] ?? 2) > (SEVERITY[prev] ?? 2)) {
      countryCompleteness.set(cc, completeness);
    }
  }
  const coverageRows = [...countryCompleteness.entries()].map(([country, completeness]) => ({
    country,
    completeness,
    asOf: countryFetched.get(country) ?? FX_AS_OF,
  }));

  // ── Emit ──
  const out: string[] = [];
  out.push("-- Generated by scripts/build-funding-rollups.ts (pnpm build:funding). Do not edit.");
  out.push(`-- FX snapshot as of ${FX_AS_OF}; amounts stored in EUR + native.`);
  // Self-seeding: CREATE IF NOT EXISTS (mirrors scripts/schema.sql, without the
  // DROPs) so this file can run against remote D1 in the refresh pipeline and
  // create the funding tables on first run WITHOUT touching funders/grants.
  out.push(`CREATE TABLE IF NOT EXISTS funding_country (
  view TEXT NOT NULL,
  country TEXT NOT NULL,
  sum_eur REAL NOT NULL,
  award_count INTEGER NOT NULL,
  median_eur REAL,
  native_currency TEXT,
  sum_native REAL,
  PRIMARY KEY (view, country)
);`);
  out.push(`CREATE TABLE IF NOT EXISTS funding_entity (
  view TEXT NOT NULL,
  scope TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  entity_country TEXT,
  sum_eur REAL NOT NULL,
  award_count INTEGER NOT NULL,
  median_eur REAL,
  native_currency TEXT,
  sum_native REAL,
  rank INTEGER NOT NULL
);`);
  out.push(
    "CREATE INDEX IF NOT EXISTS idx_funding_entity_lookup ON funding_entity(view, scope, rank);",
  );
  out.push(`CREATE TABLE IF NOT EXISTS funding_coverage (
  country TEXT PRIMARY KEY,
  completeness TEXT NOT NULL,
  as_of TEXT
);`);
  out.push(`CREATE TABLE IF NOT EXISTS funding_subdivision (
  view TEXT NOT NULL,
  scope TEXT NOT NULL,            -- country code (aggregate) OR funderId (per-provider)
  level TEXT NOT NULL,            -- fylke | kommune | city
  subdivision TEXT NOT NULL,      -- ISO 3166-2 (e.g. NO-42), kommune nr, poststed, or NATIONAL
  sum_eur REAL NOT NULL,
  award_count INTEGER NOT NULL,
  median_eur REAL,
  native_currency TEXT,
  sum_native REAL,
  PRIMARY KEY (view, scope, level, subdivision)
);`);
  out.push(
    "CREATE INDEX IF NOT EXISTS idx_funding_subdivision_lookup ON funding_subdivision(view, scope, level);",
  );
  out.push(`CREATE TABLE IF NOT EXISTS funding_recipient_year (
  recipient_id TEXT NOT NULL,
  year INTEGER,                  -- award year (from awarded_at); NULL = undated
  funder_id TEXT NOT NULL,
  funder_name TEXT NOT NULL,
  sum_eur REAL NOT NULL,
  award_count INTEGER NOT NULL,
  native_currency TEXT,
  sum_native REAL,
  PRIMARY KEY (recipient_id, year, funder_id)
);`);
  out.push(
    "CREATE INDEX IF NOT EXISTS idx_funding_recipient_year ON funding_recipient_year(recipient_id);",
  );
  out.push("DELETE FROM funding_entity;");
  out.push("DELETE FROM funding_country;");
  out.push("DELETE FROM funding_coverage;");
  out.push("DELETE FROM funding_subdivision;");
  out.push("DELETE FROM funding_recipient_year;");

  emitInserts(
    out,
    "funding_country",
    "(view,country,sum_eur,award_count,median_eur,native_currency,sum_native)",
    countryRows,
    (r) =>
      [
        sqlStr(r.view),
        sqlStr(r.country),
        sqlNum(r.sumEur),
        sqlNum(r.count),
        sqlNum(r.medianEur === null ? null : Math.round(r.medianEur)),
        sqlStr(r.nativeCurrency),
        sqlNum(r.sumNative),
      ].join(","),
  );

  emitInserts(
    out,
    "funding_entity",
    "(view,scope,entity_type,entity_id,entity_name,entity_country,sum_eur,award_count,median_eur,native_currency,sum_native,rank)",
    entityRows,
    (r) =>
      [
        sqlStr(r.view),
        sqlStr(r.scope),
        sqlStr(r.type),
        sqlStr(r.id),
        sqlStr(r.name),
        sqlStr(r.country),
        sqlNum(r.sumEur),
        sqlNum(r.count),
        sqlNum(r.medianEur === null ? null : Math.round(r.medianEur)),
        sqlStr(r.currency),
        sqlNum(r.sumNative),
        sqlNum(r.rank),
      ].join(","),
  );

  emitInserts(
    out,
    "funding_coverage",
    "(country,completeness,as_of)",
    coverageRows,
    (r) => [sqlStr(r.country), sqlStr(r.completeness), sqlStr(r.asOf)].join(","),
  );

  emitInserts(
    out,
    "funding_subdivision",
    "(view,scope,level,subdivision,sum_eur,award_count,median_eur,native_currency,sum_native)",
    subdivRows,
    (r) =>
      [
        sqlStr(r.view),
        sqlStr(r.scope),
        sqlStr(r.level),
        sqlStr(r.subdivision),
        sqlNum(r.sumEur),
        sqlNum(r.count),
        sqlNum(r.medianEur === null ? null : Math.round(r.medianEur)),
        sqlStr(r.nativeCurrency),
        sqlNum(r.sumNative),
      ].join(","),
  );

  emitInserts(
    out,
    "funding_recipient_year",
    "(recipient_id,year,funder_id,funder_name,sum_eur,award_count,native_currency,sum_native)",
    recipientYearRows,
    (r) =>
      [
        sqlStr(r.recipientId),
        sqlNum(r.year),
        sqlStr(r.funderId),
        sqlStr(r.funderName),
        sqlNum(r.sumEur),
        sqlNum(r.count),
        sqlStr(r.nativeCurrency),
        sqlNum(r.sumNative),
      ].join(","),
  );

  fs.mkdirSync(path.dirname(OUT_SQL), { recursive: true });
  fs.writeFileSync(OUT_SQL, out.join("\n") + "\n");

  const allAwarded = countryAgg.get("awarded|ALL");
  console.log(
    `[build-funding] wrote ${OUT_SQL}\n` +
      `  files=${stats.files} counted=${stats.counted.toLocaleString()} ` +
      `skippedNoAmount=${stats.skippedNoAmount.toLocaleString()} ` +
      `skippedNonGrant=${stats.skippedNonGrant.toLocaleString()} ` +
      `unconvertible=${stats.unconvertible.toLocaleString()}` +
      (stats.unknownCurrencies.size
        ? ` [${[...stats.unknownCurrencies].join(", ")}]`
        : "") +
      `\n  rows: country=${countryRows.length} entity=${entityRows.length} coverage=${coverageRows.length} subdivision=${subdivRows.length} recipient_year=${recipientYearRows.length}` +
      (allAwarded
        ? `\n  global awarded ≈ €${Math.round(allAwarded.sumEur).toLocaleString()} across ${allAwarded.count.toLocaleString()} awards`
        : ""),
  );
}

main().catch((err) => {
  console.error("[build-funding] failed:", err);
  process.exit(1);
});
