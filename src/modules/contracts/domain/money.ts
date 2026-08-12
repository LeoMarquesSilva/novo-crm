export type MoneyCents = bigint & { readonly __brand: "MoneyCents" };

const asMoneyCents = (value: bigint): MoneyCents => value as MoneyCents;

export function decimalToCents(value: string | number): MoneyCents {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Money must be a finite number");
    }

    const scaled = value * 100;
    const rounded = Math.round(scaled);
    if (Math.abs(scaled - rounded) > Number.EPSILON * Math.max(1, Math.abs(scaled))) {
      throw new Error("Money cannot have more than two decimal places");
    }
    if (!Number.isSafeInteger(rounded)) {
      throw new Error("Money is outside the safe numeric range; use a decimal string");
    }
    return asMoneyCents(BigInt(rounded));
  }

  const original = value.trim();
  const hasBrlPrefix = /^[-+]?\s*R\$/i.test(original);
  let normalized = original.replace(/R\$/gi, "").replace(/\s+/g, "");

  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  } else if (hasBrlPrefix && /^[+-]?\d{1,3}(?:\.\d{3})+$/.test(normalized)) {
    normalized = normalized.replace(/\./g, "");
  }

  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) {
    throw new Error("Invalid monetary decimal");
  }

  const decimals = match[3] ?? "";
  if (decimals.length > 2) {
    throw new Error("Money cannot have more than two decimal places");
  }

  const sign = match[1] === "-" ? -1n : 1n;
  return asMoneyCents(sign * (BigInt(match[2]) * 100n + BigInt(decimals.padEnd(2, "0") || "0")));
}

export function centsToDecimal(value: MoneyCents): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}

export function moneyCents(value: bigint): MoneyCents {
  return asMoneyCents(value);
}
