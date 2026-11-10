import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type Kobo = bigint;

export const ZERO: Kobo = 0n;

export function kobo(input: string | number | bigint): Kobo {
  if (typeof input === 'bigint') return input;
  if (typeof input === 'number') {
    if (!Number.isInteger(input)) {
      throw new Error(`kobo() requires an integer, got ${input}`);
    }
    return BigInt(input);
  }
  if (!/^-?\d+$/.test(input)) {
    throw new Error(`kobo() requires an integer string, got "${input}"`);
  }
  return BigInt(input);
}

export function dec(value: Decimal.Value): Decimal {
  return new Decimal(value);
}

export function roundHalfUpToKobo(d: Decimal): Kobo {
  const rounded = d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return BigInt(rounded.toFixed(0));
}

export function add(...xs: Kobo[]): Kobo {
  let sum = 0n;
  for (const x of xs) sum += x;
  return sum;
}

export function sub(a: Kobo, b: Kobo): Kobo {
  return a - b;
}

export function min(a: Kobo, b: Kobo): Kobo {
  return a < b ? a : b;
}

export function max(a: Kobo, b: Kobo): Kobo {
  return a > b ? a : b;
}

export function isPositive(x: Kobo): boolean {
  return x > 0n;
}

export function isZero(x: Kobo): boolean {
  return x === 0n;
}
