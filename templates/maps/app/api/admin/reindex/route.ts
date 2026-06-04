import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { queryEmbedBatch } from "@/lib/server/db";

export const dynamic = "force-dynamic";

// Embeds a batch of documented grants (bge-m3) and upserts them into Vectorize.
// Call repeatedly with ?offset until `next` is null. Protected by the
// REINDEX_KEY secret (wrangler secret put REINDEX_KEY).
const BATCH = 100; // grants fetched/upserted per HTTP call
const EMBED_SUB = 10; // texts per Workers AI embed call (batch token limits)
const MAX_EMBED_CHARS = 2000; // ~500 tokens/doc

// Vectorize vector ids are capped at 64 bytes; grant ids can be longer, so use
// a stable hash as the id and keep the real grantId in metadata.
async function vecId(grantId: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(grantId),
  );
  return [...new Uint8Array(buf)]
    .slice(0, 20)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(""); // 40 hex chars
}

export async function POST(req: Request) {
  const { env } = getCloudflareContext();
  const key = (env as unknown as { REINDEX_KEY?: string }).REINDEX_KEY;
  if (!key || req.headers.get("x-reindex-key") !== key) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sp = new URL(req.url).searchParams;
  const offset = Math.max(Math.trunc(Number(sp.get("offset")) || 0), 0);
  const limit = Math.min(
    Math.max(Math.trunc(Number(sp.get("limit")) || BATCH), 1),
    BATCH,
  );

  const rows = await queryEmbedBatch(offset, limit);
  if (rows.length === 0) {
    return NextResponse.json({ processed: 0, offset, next: null });
  }

  const texts = rows.map((r) =>
    [r.name, r.description ?? "", (r.prose ?? "").slice(0, 4000)]
      .filter(Boolean)
      .join("\n")
      .slice(0, MAX_EMBED_CHARS),
  );

  // Embed in small sub-batches — Workers AI caps texts/tokens per request.
  // A failed sub-batch pushes nulls (kept index-aligned with rows) so one bad
  // sub-batch doesn't abort the whole batch; those grants are skipped below and
  // picked up on a re-run (upsert is idempotent).
  const data: (number[] | undefined)[] = [];
  for (let i = 0; i < texts.length; i += EMBED_SUB) {
    const slice = texts.slice(i, i + EMBED_SUB);
    try {
      const emb = (await env.AI.run("@cf/baai/bge-m3", { text: slice })) as {
        data?: number[][];
      };
      const d = emb.data ?? [];
      for (let j = 0; j < slice.length; j++) data.push(d[j]);
    } catch (e) {
      console.error("reindex embed sub-batch failed", e);
      for (let j = 0; j < slice.length; j++) data.push(undefined);
    }
  }
  const vectors: {
    id: string;
    values: number[];
    metadata: Record<string, string>;
  }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const values = data[i];
    if (!Array.isArray(values)) continue;
    vectors.push({
      id: await vecId(rows[i].id),
      values,
      metadata: {
        grantId: rows[i].id,
        country: rows[i].country,
        instrumentType: rows[i].instrument_type ?? "unknown",
      },
    });
  }

  if (vectors.length > 0) await env.VECTORIZE.upsert(vectors);

  const next = rows.length < limit ? null : offset + rows.length;
  return NextResponse.json({ processed: vectors.length, offset, next });
}
