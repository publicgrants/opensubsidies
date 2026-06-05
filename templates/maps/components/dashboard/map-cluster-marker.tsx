// =============================================================================
// OpenSubsidies — Cluster / Country bubble marker
// =============================================================================
// DOM-element factory used by the imperative MapLibre marker code in
// `map-view.tsx`. We mirror the visual language of the existing grant pin
// (drop shadow, scale-on-hover, semantic colors) so the bubble and pin tiers
// feel like the same product.
//
// Two variants: country bubbles carry a country code label, proximity
// clusters just show the count.
// =============================================================================

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function sizeForCount(n: number | null): { px: number; fontPx: number } {
  // null (no data) → small uniform bubble. Otherwise lerp 36px → 72px.
  if (n === null) return { px: 36, fontPx: 15 };
  const clamped = Math.min(500, Math.max(1, n));
  const t = Math.log10(clamped) / Math.log10(500); // 0 → 1
  const px = Math.round(36 + t * 36);
  const fontPx = Math.round(13 + t * 5);
  return { px, fontPx };
}

// Funding bubbles size by a 0..1 magnitude (caller does the √-area scaling), so
// area is proportional to money rather than log-compressed like counts.
function sizeForMagnitude(m: number): { px: number; fontPx: number } {
  const mag = Math.max(0, Math.min(1, m));
  return { px: Math.round(20 + mag * 44), fontPx: Math.round(11 + mag * 6) };
}

export type ClusterMarkerOptions = {
  count: number | null;
  label?: string;
  /** Country-tier bubbles get a slightly different accent ring. */
  variant: "country" | "cluster";
  onClick: () => void;
  /** Funding bubbles: pre-formatted money label (overrides the count text). */
  displayValue?: string;
  /** Funding bubbles: 0..1 magnitude for √-area sizing. */
  magnitude?: number;
  /** Funding view accent: green for received, amber for awarded. */
  tone?: "received" | "awarded";
};

export function createClusterMarkerElement(
  opts: ClusterMarkerOptions,
): HTMLElement {
  const { count, label, variant, onClick } = opts;
  const { px, fontPx } =
    opts.magnitude != null ? sizeForMagnitude(opts.magnitude) : sizeForCount(count);
  const display =
    opts.displayValue ?? (count === null ? "—" : formatCount(count));
  const ariaValue = opts.displayValue ?? (count === null ? "no data" : String(count));

  const el = document.createElement("div");
  el.className = "grant-cluster-container";
  el.setAttribute("role", "button");
  el.setAttribute("tabindex", "0");
  el.setAttribute(
    "aria-label",
    variant === "country"
      ? `${label ?? "Country"} — ${ariaValue}. Click to zoom in.`
      : `${ariaValue} in this cluster. Click to zoom in.`,
  );

  const ring =
    variant === "country"
      ? "ring-2 ring-white/90 dark:ring-white/70"
      : "ring-2 ring-white/70 dark:ring-white/50";

  const bg =
    opts.tone === "received"
      ? "bg-green-600 hover:bg-green-500"
      : opts.tone === "awarded"
        ? "bg-amber-600 hover:bg-amber-500"
        : variant === "country"
          ? "bg-blue-600 hover:bg-blue-500"
          : "bg-indigo-500 hover:bg-indigo-400";

  el.innerHTML = `
    <div
      class="relative cursor-pointer transition-transform duration-150 hover:scale-110"
      style="width:${px}px;height:${px}px;"
    >
      <div
        class="absolute inset-0 rounded-full ${bg} ${ring} text-white font-semibold flex items-center justify-center select-none"
        style="font-size:${fontPx}px;line-height:1;box-shadow:0 4px 10px rgba(0,0,0,0.25);"
      >
        ${escapeHtml(display)}
      </div>
      ${
        label && variant === "country"
          ? `<div
              class="absolute left-1/2 -translate-x-1/2 mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium tracking-wide uppercase bg-background/85 text-foreground shadow"
              style="top:100%;"
            >${escapeHtml(label)}</div>`
          : ""
      }
    </div>
  `;

  el.addEventListener("click", onClick);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  });

  return el;
}

function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
