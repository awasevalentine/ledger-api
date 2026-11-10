const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDate(s: string): Date {
  if (!ISO_DATE.test(s)) throw new Error(`invalid ISO date: ${s}`);
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    throw new Error(`invalid calendar date: ${s}`);
  }
  return date;
}

export function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function yearMonth(d: Date | string): string {
  const date = typeof d === 'string' ? parseDate(d) : d;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function addMonths(d: Date, months: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(y, m + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

export function daysBetween(earlier: string | Date, later: string | Date): number {
  const a = typeof earlier === 'string' ? parseDate(earlier) : earlier;
  const b = typeof later === 'string' ? parseDate(later) : later;
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / 86_400_000);
}
