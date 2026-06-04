# P2 — Auto-refresh pipeline setup

The workflow `.github/workflows/refresh-data.yml` (in this repo) rebuilds the
maps app's **D1 data** and **Vectorize embeddings** from `grant-sources`, with
**no Worker redeploy** (the live Worker reads D1/Vectorize directly). It runs on
a daily cron, on manual dispatch, and on a cross-repo `repository_dispatch` from
`grant-sources`.

## What you must add (one-time)

### 1. A Cloudflare API token (the one thing that can't be scripted here)
Cloudflare dashboard → **My Profile → API Tokens → Create Token → Custom**:
- **Account › D1 › Edit**
- **Account › Vectorize › Edit**
- **Account › Workers AI › Read**
- Account resources: *Fredrik@fmcybersecurity.com's Account*

Then in **publicgrants/opensubsidies → Settings → Secrets and variables → Actions**, add:
- `CLOUDFLARE_API_TOKEN` = the token above
- `CLOUDFLARE_ACCOUNT_ID` = `16f45884803ac72caae1fa6b3273a4a5` *(I set this for you if I had access — verify it exists)*
- `REINDEX_KEY` = the **same value as the Worker's `REINDEX_KEY` secret** (set via `wrangler secret put REINDEX_KEY`). Already configured in this repo's Actions secrets.
- `GS_READ_TOKEN` = only if `publicgrants/grant-sources` is **private** (a fine-grained PAT with read on that repo). If it's public, delete the `token:` line from the checkout step.

### 2. Cross-repo trigger (so a grant-sources push refreshes the data)
In **publicgrants/grant-sources**, add `.github/workflows/notify-opensubsidies.yml`:

```yaml
name: Notify opensubsidies
on:
  push:
    branches: [main]
jobs:
  dispatch:
    runs-on: ubuntu-latest
    steps:
      - name: Dispatch refresh
        run: |
          curl -fsS -X POST \
            -H "Authorization: Bearer ${{ secrets.OPENSUBSIDIES_DISPATCH_TOKEN }}" \
            -H "Accept: application/vnd.github+json" \
            https://api.github.com/repos/publicgrants/opensubsidies/dispatches \
            -d '{"event_type":"grant-sources-updated"}'
```

Add secret `OPENSUBSIDIES_DISPATCH_TOKEN` to **grant-sources** = a PAT (or
fine-grained token) with permission to trigger dispatches on
`publicgrants/opensubsidies` (classic: `repo` scope; fine-grained: *Contents:
read* + *Metadata: read* on opensubsidies isn't enough — needs the dispatch
permission, i.e. *Actions/Contents* write or a classic `repo` PAT).

## Activate
1. Merge branch `cloudflare-deploy-d1-search` to `main` (or run from the branch).
2. Add the secrets above.
3. Trigger once manually: opensubsidies → Actions → **Refresh grant data** → Run.

## Known limitations / refinements
- **Reload is not atomic.** `data.sql` does `DELETE`+`INSERT`; there's a brief
  window mid-reload. For zero-gap refresh, switch to a versioned/atomic swap
  (write to staging keys, flip a pointer) — deferred.
- **Full re-embed each run** (~3.3k docs, cheap). Incremental embedding via a
  content-hash cache is a later optimization.
- Code deploys are separate (Cloudflare↔GitHub Workers Builds, or `pnpm deploy`
  from the maps dir).
