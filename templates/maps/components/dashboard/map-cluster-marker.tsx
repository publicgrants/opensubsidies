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

export type ClusterMarkerOptions = {
  count: number | null;
  label?: string;
  /** Country-tier bubbles get a slightly different accent ring. */
  variant: "country" | "cluster";
  onClick: () => void;
};

export function createClusterMarkerElement(
  opts: ClusterMarkerOptions,
): HTMLElement {
  const { count, label, variant, onClick } = opts;
  const { px, fontPx } = sizeForCount(count);
  const display = count === null ? "—" : formatCount(count);

  const el = document.createElement("div");
  el.className = "grant-cluster-container";
  el.setAttribute("role", "button");
  el.setAttribute("tabindex", "0");
  el.setAttribute(
    "aria-label",
    variant === "country"
      ? `${label ?? "Country"} — ${count === null ? "no data" : count}. Click to zoom in.`
      : `${count === null ? "No data" : count} in this cluster. Click to zoom in.`,
  );

  const ring =
    variant === "country"
      ? "ring-2 ring-white/90 dark:ring-white/70"
      : "ring-2 ring-white/70 dark:ring-white/50";

  const bg =
    variant === "country"
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
