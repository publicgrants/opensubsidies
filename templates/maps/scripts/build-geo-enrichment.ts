// Build-time geo enrichment: maps a Norwegian organisasjonsnummer to its
// administrative location (Fylke / Kommune / City) using the public Brønnøysund
// Enhetsregisteret bulk download. Grant award records (grants-sources
// awards.jsonl) carry only the recipient org-nr — no location — so this is what
// lets the funding rollup place "received" money on a Fylke.
//
// Source (public, no auth): the full main-units CSV, ~1.1M rows, gzipped ~150 MB.
//   https://data.brreg.no/enhetsregisteret/api/enheter/lastned/csv
// We use CSV (not JSON/Excel): the registry exceeds Excel's ~1.05M row ceiling,
// and CSV streams line-by-line so memory stays flat regardless of size.
//
// Fylke is exact, not geocoded: the first 2 digits of forretningsadresse
// .kommunenummer ARE the fylke number (e.g. kommune 4204 Kristiansand → 42 Agder
// → ISO 3166-2 "NO-42"). We also retain the full kommune number/name and the
// poststed/postnummer so the later Fylke↔Kommune↔City toggle needs no re-download.
//
// Used two ways:
//   • as a module — `loadOrgGeoMap()` returns the org-nr → packed-geo Map that
//     build-funding-rollups.ts consumes directly (no intermediate file);
//   • as a CLI (`tsx scripts/build-geo-enrichment.ts`) — downloads/caches the CSV
//     and prints coverage stats + a fylke distribution for a quick sanity check.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const GEN_DIR = path.resolve(process.cwd(), "scripts/.generated");
const CSV_GZ =
  process.env.BRREG_ENHETER_GZ ?? path.join(GEN_DIR, "enheter.csv.gz");
const ENHETER_CSV_URL =
  "https://data.brreg.no/enhetsregisteret/api/enheter/lastned/csv";

// Current (post-2024 reform) Norwegian fylker, keyed by the 2-digit fylke number
// that prefixes every kommune number. ISO 3166-2 code is "NO-" + this key.
export const FYLKE_NAMES: Record<string, string> = {
  "03": "Oslo",
  "11": "Rogaland",
  "15": "Møre og Romsdal",
  "18": "Nordland",
  "31": "Østfold",
  "32": "Akershus",
  "33": "Buskerud",
  "34": "Innlandet",
  "39": "Vestfold",
  "40": "Telemark",
  "42": "Agder",
  "46": "Vestland",
  "50": "Trøndelag",
  "55": "Troms",
  "56": "Finnmark",
};

// Per-org geographic record. `fylke` is the ISO 3166-2 code ("NO-42") or null
// (foreign / unknown / Svalbard etc.); the rest are the raw business-address bits.
export type OrgGeo = {
  fylke: string | null;
  kommunenr: string | null;
  kommune: string | null;
  poststed: string | null;
  postnr: string | null;
};

// The Map stores a tab-packed string (objects × 1.1M would bloat the heap).
// Order: fylke \t kommunenr \t kommune \t poststed \t postnr. Tabs never occur
// in the registry's address fields.
export type OrgGeoMap = Map<string, string>;

export function unpackGeo(packed: string | undefined): OrgGeo | null {
  if (!packed) return null;
  const [fylke, kommunenr, kommune, poststed, postnr] = packed.split("\t");
  return {
    fylke: fylke || null,
    kommunenr: kommunenr || null,
    kommune: kommune || null,
    poststed: poststed || null,
    postnr: postnr || null,
  };
}

// Fylke ISO code from a kommune number, or null if it isn't a mainland fylke.
export function fylkeFromKommunenr(kommunenr: string | null): string | null {
  if (!kommunenr) return null;
  const prefix = kommunenr.padStart(4, "0").slice(0, 2);
  return FYLKE_NAMES[prefix] ? `NO-${prefix}` : null;
}

// ── Streaming CSV record parser ──────────────────────────────────────────────
// The brreg CSV is RFC-4180-ish: comma-separated, fields optionally double-quoted,
// with "" escaping a literal quote, and quoted fields may contain commas AND
// newlines (e.g. vedtektsfestetFormaal). So we cannot split on lines — we run a
// char state machine over the decoded stream and yield one field array per record.
// The pending-close-quote flag carries the `""` decision across chunk boundaries.
async function* parseCsvRecords(
  stream: NodeJS.ReadableStream,
): AsyncGenerator<string[]> {
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let pendingCloseQuote = false; // saw a `"` while in quotes; deciding close vs ""

  for await (const chunk of stream) {
    const s = chunk as string; // stream is set to utf8 encoding by the caller
    for (let i = 0; i < s.length; i++) {
      const c = s[i];

      if (pendingCloseQuote) {
        pendingCloseQuote = false;
        if (c === '"') {
          field += '"'; // escaped quote ""
          inQuotes = true;
          continue;
        }
        // otherwise the quote really closed the field — fall through to handle c
      }

      if (inQuotes) {
        if (c === '"') {
          // Tentatively close; the next char decides close vs `""` escape.
          inQuotes = false;
          pendingCloseQuote = true;
        } else field += c;
        continue;
      }

      if (c === '"') inQuotes = true;
      else if (c === ",") {
        record.push(field);
        field = "";
      } else if (c === "\n") {
        record.push(field);
        yield record;
        field = "";
        record = [];
      } else if (c === "\r") {
        // CRLF — ignore the CR; a CR inside quotes is preserved above
      } else field += c;
    }
  }

  // Flush a trailing record with no final newline.
  if (field.length || record.length) {
    record.push(field);
    yield record;
  }
}

// ── Download / cache ─────────────────────────────────────────────────────────
async function ensureEnheterCsv(): Promise<string> {
  if (fs.existsSync(CSV_GZ) && !process.env.BRREG_REFRESH) {
    return CSV_GZ;
  }
  fs.mkdirSync(path.dirname(CSV_GZ), { recursive: true });
  console.log(`[build-geo] downloading ${ENHETER_CSV_URL} …`);
  const res = await fetch(ENHETER_CSV_URL);
  if (!res.ok || !res.body) {
    throw new Error(`[build-geo] download failed: HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(CSV_GZ, buf);
  console.log(
    `[build-geo] cached ${(buf.length / 1e6).toFixed(0)} MB → ${CSV_GZ}`,
  );
  return CSV_GZ;
}

// ── Build the org-nr → packed-geo map ────────────────────────────────────────
export async function loadOrgGeoMap(): Promise<OrgGeoMap> {
  const file = await ensureEnheterCsv();
  const gunzip = fs.createReadStream(file).pipe(zlib.createGunzip());
  gunzip.setEncoding("utf8");

  const map: OrgGeoMap = new Map();
  let header: string[] | null = null;
  let idxOrg = -1;
  let idxKommunenr = -1;
  let idxKommune = -1;
  let idxPoststed = -1;
  let idxPostnr = -1;
  let idxLandkode = -1;

  for await (const rec of parseCsvRecords(gunzip)) {
    if (!header) {
      header = rec;
      const at = (name: string) => header!.indexOf(name);
      idxOrg = at("organisasjonsnummer");
      idxKommunenr = at("forretningsadresse.kommunenummer");
      idxKommune = at("forretningsadresse.kommune");
      idxPoststed = at("forretningsadresse.poststed");
      idxPostnr = at("forretningsadresse.postnummer");
      idxLandkode = at("forretningsadresse.landkode");
      if (idxOrg < 0 || idxKommunenr < 0) {
        throw new Error(
          "[build-geo] CSV header missing organisasjonsnummer / forretningsadresse.kommunenummer",
        );
      }
      continue;
    }

    const org = rec[idxOrg];
    if (!org) continue;
    // Foreign-registered orgs (landkode != NO) have no Norwegian subdivision.
    const landkode = idxLandkode >= 0 ? rec[idxLandkode] : "";
    if (landkode && landkode !== "NO") continue;

    const kommunenr = rec[idxKommunenr] || "";
    const fylke = fylkeFromKommunenr(kommunenr) ?? "";
    const kommune = idxKommune >= 0 ? rec[idxKommune] || "" : "";
    const poststed = idxPoststed >= 0 ? rec[idxPoststed] || "" : "";
    const postnr = idxPostnr >= 0 ? rec[idxPostnr] || "" : "";
    // Skip rows with no usable geo at all.
    if (!fylke && !kommunenr && !poststed) continue;
    map.set(org, [fylke, kommunenr, kommune, poststed, postnr].join("\t"));
  }

  return map;
}

// ── CLI: download + report coverage stats ────────────────────────────────────
async function main(): Promise<void> {
  const t0 = process.hrtime.bigint();
  const map = await loadOrgGeoMap();
  const byFylke = new Map<string, number>();
  let withFylke = 0;
  for (const packed of map.values()) {
    const fylke = packed.split("\t")[0];
    if (fylke) {
      withFylke++;
      byFylke.set(fylke, (byFylke.get(fylke) ?? 0) + 1);
    }
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const dist = [...byFylke.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([f, n]) => `${f} ${FYLKE_NAMES[f.slice(3)]}=${n.toLocaleString()}`)
    .join(", ");
  console.log(
    `[build-geo] ${map.size.toLocaleString()} orgs mapped ` +
      `(${withFylke.toLocaleString()} with a fylke) in ${(ms / 1000).toFixed(1)}s`,
  );
  console.log(`[build-geo] fylke distribution: ${dist}`);

  // Persist a tiny stats file for inspection (the rollup uses the in-memory map).
  fs.mkdirSync(GEN_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(GEN_DIR, "geo-stats.json"),
    JSON.stringify(
      { orgs: map.size, withFylke, byFylke: Object.fromEntries(byFylke) },
      null,
      2,
    ) + "\n",
  );
}

// Run main() only when invoked directly (not when imported by the rollup).
// readline import kept off the hot path; guard via argv basename.
const invokedDirectly = process.argv[1]?.includes("build-geo-enrichment");
if (invokedDirectly) {
  main().catch((err) => {
    console.error("[build-geo] failed:", err);
    process.exit(1);
  });
}
