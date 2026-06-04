// One-off / pipeline driver: repeatedly calls the protected /api/admin/reindex
// route until all documented grants are embedded into Vectorize.
// Usage: BASE_URL=https://... REINDEX_KEY=... node scripts/reindex-runner.mjs
const key = process.env.REINDEX_KEY;
const base = process.env.BASE_URL;
if (!key || !base) {
  console.error("Set BASE_URL and REINDEX_KEY env vars");
  process.exit(1);
}

let offset = 0;
let total = 0;
for (;;) {
  const res = await fetch(`${base}/api/admin/reindex?offset=${offset}`, {
    method: "POST",
    headers: { "x-reindex-key": key },
  });
  if (!res.ok) {
    console.error("HTTP", res.status, await res.text());
    process.exit(1);
  }
  const j = await res.json();
  total += j.processed || 0;
  process.stdout.write(
    `offset ${j.offset} processed ${j.processed} total ${total} -> next ${j.next}\n`,
  );
  if (j.next == null) break;
  offset = j.next;
}
console.log("DONE. embedded:", total);
