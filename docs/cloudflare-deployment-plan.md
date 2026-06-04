# OpenSubsidies — Cloudflare Deployment + Embedding Plan (v2, post-review)

> v2 incorporates findings from four specialist reviews (Cloudflare platform
> currency, embedding model, architecture risks, app-refactor scoping) run
> 2026-06-03. v1 draft is superseded by the decisions below.
> **Verdict: the "rebuild ≠ serve" approach is sound, but (1) several platform
> facts needed correcting, (2) the hardest work is in the APP, not the infra —
> the app aggregates the whole dataset client-side — and (3) a D1-for-structured
> upgrade removes most of the consistency/payload risk.**

## Context (unchanged)
- `opensubsidies` = Next.js 16 SSR app at `templates/maps` (MapLibre globe, filters, tiers, search, detail panel).
- `grant-sources` = SEPARATE, often-updated repo (markdown/YAML) = source of truth.
- Today: `build-catalog.ts` reads a sibling `grant-sources` checkout → `catalog.json` (**~34 MB**, 23 MB of it grant prose) → **statically `import`ed** into client code. This (a) won't fit a Worker bundle, (b) is too heavy for the browser, (c) isn't committed and isn't present in a fresh Cloudflare clone.
- Add **semantic search** over grant prose (embedding model).

---

## Platform fact corrections (verified 2026-06-03, sources in agent reports)
| Assumption | Corrected current fact |
|---|---|
| Worker bundle limit | **3 MB gz (Free) / 10 MB gz (Paid)**, 64 MB uncompressed. Imported assets count. **Assume Workers Paid** (Free's 10 ms CPU + 50 subrequests are too tight for SSR + search fan-out). |
| OpenNext | `@opennextjs/cloudflare` **1.19.x**; supports **Next.js ≥ 16.2.6** (early 16.0–16.2.5 explicitly unsupported — pin Next accordingly). Bindings via `getCloudflareContext().env.{AI,VECTORIZE,R2}`. **Gotcha:** build/SSG-time bindings use *local emulated* data unless `remote:true` — keep all data/search paths **dynamic SSR**. Needs a **separate incremental-cache binding** (KV or R2 + DO) for ISR, distinct from the data store. |
| Vectorize | GA. **Max 1536 dims** (bge-m3's 1024 fits). Max **10M vectors/index**. Metadata **10 KiB/vector**, **≤10 filterable props**, string filter matches **first 64 B** → use short enum codes. **topK = 100, but only 50 when returning values/metadata.** Upsert **5000/batch via HTTP API** (use this from CI — 2.3K vectors in one call) vs 1000/batch via binding. **Float32 only — no user int8/binary quant.** Cost ≈ $0 at this scale; **query cost scales with stored-vector count** (the real cliff as the corpus grows). |
| Embedding model | `@cf/baai/bge-m3` confirmed: **1024 dims, ~8192-token effective input, 100+ languages, $0.012/M tokens**, callable from REST (CI) and binding (query). Cross-lingual works (EN query → NO doc). **No chunking needed** at ~250–1500 tokens/doc. |
| Reranker | **Don't use one.** Cloudflare's only reranker (`bge-reranker-base`) is **EN/CN-only** and would *hurt* NO/DE/FR results. Defer until a multilingual reranker lands on Workers AI. |
| R2 | Egress to Workers **free**. Edge-cache reads via Cache API with **versioned keys** (the right pattern). |
| New primitives | **AutoRAG → "AI Search"** (open beta): point it at an R2 bucket, it auto-chunks/embeds/indexes — could replace the whole embed+upsert+atomicity step (worth a spike; beta + less control). **D1 has NO native vectors** (Vectorize stays). **AI Gateway**: put it in front of Workers AI embed calls for caching + analytics (cheap win). |

---

## The biggest finding: the app aggregates the WHOLE dataset client-side
Reviewers (P0-1) showed the refactor is bigger than "lazy-load detail." Today, in the browser:
- `map-view.tsx` builds a **Supercluster index over all funders + all grants**, plus continent/country bubbles.
- `maps-store.ts` **filters/sorts/searches the entire grants array in-memory** on every keystroke, and computes global stats — including **full-text `prose.includes(q)` over all 23 MB of prose**.

So merely moving prose to R2 still leaves a ~**11 MB** client payload and a search feature that breaks once prose leaves the browser. **The fix is to move aggregation and search server-side**, not just detail.

---

## Revised architecture (v2)

**Recommended: D1 (structured) + Vectorize (semantic) + R2 (prose blobs) + Workers AI (bge-m3) behind AI Gateway, all fed by one GitHub Action.** D1 is the upgrade over v1's R2-only catalog — it gives a transactional consistency anchor and moves filter/sort/search/stats server-side, dissolving the client-aggregation problem and most of the R2/Vectorize atomicity risk.

```
grant-sources (mirror in our org, pinned submodule)
   │  push webhook + cron backstop  → GitHub Action ("rebuild")
   │   1. checkout pinned commit
   │   2. build rows + globe aggregate; VALIDATE (schema + sanity thresholds, fail closed)
   │   3. load D1 in a transaction (funders, grants, prose, FTS5 index)
   │   4. incremental embed changed docs (content-hash cache) → bge-m3 via Workers AI REST
   │   5. upsert Vectorize (ONE stable index, in place; delete stale ids)
   ▼
Cloudflare Worker (Next 16 ≥16.2.6 via @opennextjs/cloudflare 1.19.x, Workers PAID)
   • globe/tiers   → small precomputed aggregate (per-funder points ~933 + counts), edge-cached
   • list/filter   → D1 query (server-side filter/sort/paginate/stats)
   • detail/prose  → D1 (or R2) by id, lazy
   • search        → HYBRID: Vectorize(topK≤50, metadata filter) ⊕ D1 FTS5, fused via RRF
                     query embed via Workers AI (bge-m3) behind AI Gateway (cache)
   • open/closed   → derived at request time from closesAt (never baked into aggregates)
```

### Decisions locked by the review
- **Embedding:** bge-m3, **no chunking, no quant choice (Float32), no reranker.** Qwen3-embedding-0.6b is the only A/B candidate (better MMTEB but 4096-tok cap + instruction prefix).
- **Search is HYBRID** (semantic ⊕ keyword via Reciprocal Rank Fusion). Pure vector misses codes/acronyms ("SkatteFUNN", "Horizon Europe", ERDF) that pervade grant text. D1 FTS5 replaces the old client-side `prose.includes()`.
- **Vectorize: one stable index, upserted in place** (binding is static in wrangler → a per-build index would force a redeploy, defeating "no redeploy on data change"). Delete stale ids each build.
- **Consistency:** immutable **versioned keys** for any R2 artifacts (`v/{buildId}/…`, `Cache-Control: immutable`) + one short-TTL **pointer**; D1 writes in a **transaction**; gate "what's live" on D1. Add a Vectorize **readiness probe** before flipping and **GC** old versions. (Largely moot if D1 holds structured data + prose and R2 isn't used for the live catalog.)
- **Abuse/cost:** **debounce** the search box (today it fires per keystroke — would be one embed+query per keystroke), **rate-limit** the search route, **cache query embeddings** (KV/AI Gateway). Query cost scales with stored-vector count, so keep embedding **only documented grants** (~2.3 K `ready_for_verification`/`complete`), never the 11 K stubs.
- **Pipeline safety:** GitHub Action `concurrency` serialization, **fail-closed validation gate** (schema + min-count sanity → keep old data on bad upstream), **auto pin-bump bot** (reconciles "updated often" vs "pinned commit"), least-privilege tokens (fine-grained GitHub + scoped Cloudflare API tokens).
- **Status freshness:** keep `opensAt/closesAt` raw; derive open/closed **client-side at render** (don't bake status into cached aggregates).

### App refactor scope (6 files; clustering.ts unchanged)
- `scripts/build-catalog.ts` — emit rows + aggregate (+ D1 load / upsert in CI). **moderate**
- `mock-data/catalog-loader.ts` + `locations.ts` — replace `import catalog` with async data access / API routes. **critical/risky**
- `store/maps-store.ts` — async hydration + loading/error state; **search moves to a server route** (prose leaves the client). **risky**
- `components/dashboard/map-view.tsx`, `sidebar.tsx` — loading gates. **mechanical**
- `components/dashboard/maps-panel.tsx` — lazy-load prose for detail card. **moderate**
- Add `wrangler.jsonc` (nodejs_compat, compat date ≥2024-09-23, bindings: AI, VECTORIZE, R2/D1, inc-cache, assets) + `open-next.config.ts`.

---

## Decisions (both forks resolved)
1. **Structured store: Cloudflare D1.** Funders + grants + prose as rows; filter/sort/paginate/stats run server-side via SQL; updates in a transaction (the consistency anchor). Kills the client-side mega-aggregation and the ~11 MB payload; scales to 50K+.
2. **Search: hand-rolled HYBRID — Vectorize (bge-m3) ⊕ D1 FTS5, fused via RRF.** Chosen over Cloudflare AI Search (AutoRAG) after web review (2026 sources). Decisive factors: (a) D1 is already the structured store + filter engine — AI Search would return chunks you must re-join to D1 anyway, creating a second source of truth, with a 5-custom-field / AND-only / 500-char filter ceiling on top of SQL you already have for free; (b) our docs (250–1500 tok) need NO chunking, but AI Search forces recursive chunking (bge-m3 capped at 512 tok/chunk in its pipeline); (c) AI Search's only reranker is the EN/CN-only `bge-reranker-base` — harmful on NO/DE/FR, so we'd disable it anyway; (d) AI Search is **open beta, no SLA, no committed pricing**, while Vectorize + D1 are GA. A→B migration is cheap later if it matures; B→A under a live product is not.
   - **Still do a ~1-day AI Search spike** in parallel as a benchmark/future-option, but do NOT gate P1 on it.
   - **Revisit AI Search if** it reaches GA with published pricing/SLA, AND a multilingual reranker (e.g. bge-reranker-v2-m3) lands on Workers AI, AND it returns/join D1 row IDs cleanly + lifts the 5-field/AND-only filter limits — or if scope expands to generative RAG.

### Hybrid search implementation notes (from review)
- **D1 FTS5:** create the FTS5 virtual table with `tokenize='unicode61 remove_diacritics 1'` (handles æøå/umlauts), **no porter stemmer** (English stemming corrupts NO/DE). FTS5 nails exact tokens (codes/acronyms like "SkatteFUNN", "ERDF") — the reason hybrid beats pure vector here.
- **FTS5 virtual tables are not exportable / not included in D1 dumps** → `CREATE VIRTUAL TABLE … fts5` and repopulate as a **build step in the GitHub Action** after loading rows, not via import.
- **RRF:** default `k=60`; request ~2×topK candidates per arm (Vectorize topK≤50 when returning metadata) before fusing.
- Keep search a **dynamic SSR route** (OpenNext build-time bindings use local emulated data unless `remote:true`).

## Phasing
- **P0 (deploy at all):** get the app onto Workers/OpenNext with data NOT bundled — even a minimal D1/R2 read path — so the 34 MB blocker is gone and the globe renders from server data.
- **P1 (search):** Vectorize + bge-m3 + hybrid + debounce/rate-limit/AI-Gateway.
- **P2 (hardening):** validation gate, versioning/GC, observability/alerting (esp. "search returns id whose detail 404s" = consistency alarm), error UI states, favicon caching, language facet.

## Out of scope / later
Awards/funding layer; generative RAG (LLM on retrieval); UI i18n; multilingual reranker (pending Workers AI availability).
