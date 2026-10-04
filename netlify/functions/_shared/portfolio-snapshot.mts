type RecordValue = Record<string, unknown>;
type Holding = {
  assetClass: string;
  name: string | null;
  symbol: string | null;
  isin: string | null;
  exchange: string | null;
  currency: string;
  quantity: number | null;
  averagePrice: number | null;
  lastPrice: number | null;
  costBasis: number | null;
  currentValue: number | null;
  unrealizedGain: number | null;
  valuationBasis: "stored_price" | "stored_value" | "principal" | "balance" | "unknown";
};

function record(value: unknown): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid profile");
  return value as RecordValue;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 160) : null;
}

function number(value: unknown): number | null {
  if (typeof value === "string") {
    if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(value.trim())) return null;
    value = Number(value.trim());
  }
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER ? value : null;
}

function nonnegative(value: unknown): number | null {
  const n = number(value);
  return n !== null && n >= 0 ? n : null;
}

function currency(value: unknown, fallback: string): string {
  if (value === undefined || value === null || value === "") return fallback;
  const code = text(value)?.toUpperCase();
  if (!code || !/^[A-Z]{3}$/.test(code)) throw new Error("Invalid currency");
  return code;
}

const product = (a: number | null, b: number | null) => a === null || b === null ? null : number(a * b);
const difference = (a: number | null, b: number | null) => a === null || b === null ? null : number(a - b);

export function normalizeSnapshot(rowValue: unknown) {
  const row = record(rowValue);
  const data = record(row.data);
  const updated = typeof row.updated_at === "string" ? Date.parse(row.updated_at) : NaN;
  if (!Number.isFinite(updated)) throw new Error("Invalid timestamp");
  const settings = data.settings == null ? {} : record(data.settings);
  const holdings: Holding[] = [];
  const groups = [
    ["stocks", "equity", "INR"], ["mf", "mutual_fund", "INR"],
    ["crypto", "crypto", "USD"], ["otherInv", "other", "INR"],
    ["fds", "fixed_deposit", "INR"], ["banks", "cash", "INR"],
  ];
  for (const [key, assetClass, fallback] of groups) {
    const values = data[key] === undefined ? [] : data[key];
    if (!Array.isArray(values) || values.length > 10000) throw new Error("Invalid holdings");
    for (const value of values) {
      const v = record(value);
      const priced = key === "stocks" || key === "crypto";
      const quantity = priced ? nonnegative(v.qty) : null;
      const averagePrice = priced ? nonnegative(key === "stocks" ? v.avg : v.buy) : null;
      const lastPrice = priced ? nonnegative(v.ltp) : null;
      const costBasis = priced ? product(quantity, averagePrice)
        : key === "fds" ? nonnegative(v.prin) : key === "banks" ? null : nonnegative(v.inv);
      // Deposit maturity proceeds are future amounts, not today's market value.
      const currentValue = priced ? product(quantity, lastPrice)
        : key === "fds" ? nonnegative(v.prin) : key === "banks" ? number(v.bal) : nonnegative(v.val);
      holdings.push({
        assetClass,
        name: text(key === "fds" ? v.bank : v.name),
        symbol: priced ? text(v.sym)?.toUpperCase() ?? null : null,
        isin: key === "stocks" ? text(v.isin)?.toUpperCase() ?? null : null,
        exchange: key === "stocks" ? text(v.exch) : null,
        currency: currency(v.cur, fallback), quantity, averagePrice, lastPrice, costBasis, currentValue,
        unrealizedGain: key === "fds" ? null : difference(currentValue, costBasis),
        valuationBasis: currentValue === null ? "unknown" : priced ? "stored_price"
          : key === "fds" ? "principal" : key === "banks" ? "balance" : "stored_value",
      });
    }
  }

  const totalsByCurrency = [...new Set(holdings.map(h => h.currency))].sort().map(code => {
    const items = holdings.filter(h => h.currency === code);
    const unknownValueCount = items.filter(h => h.currentValue === null).length;
    const knownValueSubtotal = number(items.reduce((sum, h) => sum + (h.currentValue ?? 0), 0));
    if (knownValueSubtotal === null) throw new Error("Invalid total");
    return { currency: code, holdingCount: items.length, unknownValueCount, knownValueSubtotal,
      totalValue: unknownValueCount ? null : knownValueSubtotal };
  });
  return {
    schemaVersion: "1.0", source: "wealthwise", asOf: new Date(updated).toISOString(),
    baseCurrency: currency(settings.baseCur, "INR"), holdings, totalsByCurrency,
  };
}
