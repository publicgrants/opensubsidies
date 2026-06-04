import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Minimal config: the dashboard is client-rendered and reads data through API
// routes (D1), so there is no ISR / cached-fetch surface that needs an
// incremental-cache binding. Add one (KV or R2) here only if we introduce ISR.
export default defineCloudflareConfig({});
