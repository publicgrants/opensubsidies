// Static, dated FX snapshot for the funding layer.
//
// Award amounts in the grants-sources catalog are NATIVE (NOK / EUR / SEK / USD
// / GBP / AUD), with no conversion baked in. To make totals comparable across
// countries we apply a single, dated snapshot: the build step pre-converts every
// award to EUR (the canonical stored unit), and the UI re-expresses that EUR
// figure in the user's chosen display currency. Conversion is linear, so
// round-tripping through EUR is exact for the snapshot. These rates are
// indicative, not live — surface `FX_AS_OF` next to any converted number.

export const FX_AS_OF = "2026-06-01";

// EUR value of 1 unit of each SOURCE currency present in the data.
export const EUR_PER: Record<string, number> = {
  EUR: 1,
  USD: 0.92,
  NOK: 0.085,
  SEK: 0.088,
  GBP: 1.17,
  AUD: 0.6,
};

// Display options the UI offers for now (USD / EUR / NOK).
export type DisplayCurrency = "EUR" | "USD" | "NOK";
export const DISPLAY_CURRENCIES: DisplayCurrency[] = ["EUR", "USD", "NOK"];

export const CURRENCY_SYMBOL: Record<string, string> = {
  EUR: "€",
  USD: "$",
  NOK: "kr",
  SEK: "kr",
  GBP: "£",
  AUD: "A$",
};

// Native amount -> EUR. Returns null for an unknown/unsupported currency so the
// caller can guard rather than silently treat it as zero.
export function toEur(amount: number, currency: string): number | null {
  const r = EUR_PER[currency];
  if (r === undefined) return null;
  return amount * r;
}

// EUR -> a display currency (the stored unit is EUR, so this is the hot path).
export function fromEur(amountEur: number, to: DisplayCurrency): number {
  const r = EUR_PER[to] ?? 1;
  return amountEur / r;
}

// Native amount -> display currency directly. Null if the source is unknown.
export function convert(
  amount: number,
  from: string,
  to: DisplayCurrency,
): number | null {
  const eur = toEur(amount, from);
  if (eur === null) return null;
  return fromEur(eur, to);
}
