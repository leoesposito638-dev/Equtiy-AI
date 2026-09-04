// ============================================================================
// Display-only number formatting. These never change or derive a value —
// they only decide how an already-computed/stored number renders on screen
// (rounding, thousands scaling, a $ or % sign). The underlying value used
// for scoring/calculation is untouched.
// ============================================================================

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatPlainNumber(value: number, decimals = 1): string {
  return value.toFixed(decimals);
}

const CURRENCY_SCALE: [number, string][] = [
  [1e12, "T"],
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "K"],
];

export function formatCurrency(value: number, currency = "USD"): string {
  const symbol = currency === "USD" ? "$" : `${currency} `;
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  for (const [threshold, suffix] of CURRENCY_SCALE) {
    if (abs >= threshold) return `${sign}${symbol}${(abs / threshold).toFixed(2)}${suffix}`;
  }
  return `${sign}${symbol}${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function formatPerShare(value: number, currency = "USD"): string {
  const symbol = currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${value.toFixed(2)}`;
}
