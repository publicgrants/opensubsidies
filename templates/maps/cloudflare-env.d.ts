// Committed stand-in for the wrangler-generated Cloudflare env types.
//
// `wrangler types` (the `cf-typegen` script) normally emits this from the
// bindings in wrangler.jsonc, but it loads workerd, which has no win32-arm64
// build, so it can't be generated on the maintainer's machine — and the
// Cloudflare CI build (`next build` type-check) needs the `CloudflareEnv`
// bindings to exist or it fails. So we commit this minimal hand-written version
// (mirrors wrangler.jsonc: DB / AI / VECTORIZE / ASSETS). Keep it in sync with
// wrangler.jsonc when bindings change. If you later switch to real generated
// types via `wrangler types`, DELETE this file first to avoid duplicate global
// declarations (D1Database, etc.).

interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: unknown;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface AiRunResult {
  data?: number[][];
}
interface Ai {
  run(model: string, inputs: unknown): Promise<AiRunResult>;
}

interface VectorizeMatch {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}
interface VectorizeMatches {
  matches: VectorizeMatch[];
}
interface VectorizeIndex {
  query(vector: number[], options?: unknown): Promise<VectorizeMatches>;
  upsert(vectors: unknown[]): Promise<unknown>;
}

interface CloudflareEnv {
  DB: D1Database;
  AI: Ai;
  VECTORIZE: VectorizeIndex;
  ASSETS: unknown;
  REINDEX_KEY?: string;
}
