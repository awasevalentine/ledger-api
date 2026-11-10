import { kobo, dec, roundHalfUpToKobo, add, sub, min, max } from './money';
import { parseDate, daysBetween, addMonths, yearMonth, formatDate } from './date';

describe('kobo()', () => {
  it('accepts integer string, integer number, bigint', () => {
    expect(kobo('1234')).toBe(1234n);
    expect(kobo(1234)).toBe(1234n);
    expect(kobo(1234n)).toBe(1234n);
  });

  it('rejects non-integer number', () => {
    expect(() => kobo(1.5)).toThrow();
  });

  it('rejects non-integer string', () => {
    expect(() => kobo('1.5')).toThrow();
    expect(() => kobo('abc')).toThrow();
  });
});

describe('roundHalfUpToKobo', () => {
  it('rounds .5 up', () => {
    expect(roundHalfUpToKobo(dec('0.5'))).toBe(1n);
    expect(roundHalfUpToKobo(dec('1.5'))).toBe(2n);
    expect(roundHalfUpToKobo(dec('2.5'))).toBe(3n);
  });

  it('rounds .4 down', () => {
    expect(roundHalfUpToKobo(dec('0.4'))).toBe(0n);
    expect(roundHalfUpToKobo(dec('1.49'))).toBe(1n);
  });

  it('rounds the worked-example instalment interest', () => {
    expect(roundHalfUpToKobo(dec('100736974').mul('0.015'))).toBe(1_511_055n);
    expect(roundHalfUpToKobo(dec('81185003').mul('0.015'))).toBe(1_217_775n);
    expect(roundHalfUpToKobo(dec('61339752').mul('0.015'))).toBe(920_096n);
    expect(roundHalfUpToKobo(dec('41196822').mul('0.015'))).toBe(617_952n);
    expect(roundHalfUpToKobo(dec('20751748').mul('0.015'))).toBe(311_276n);
  });
});

describe('arithmetic helpers', () => {
  it('add accumulates bigints', () => {
    expect(add(1n, 2n, 3n)).toBe(6n);
    expect(add()).toBe(0n);
  });

  it('sub/min/max work on bigints', () => {
    expect(sub(10n, 4n)).toBe(6n);
    expect(min(10n, 4n)).toBe(4n);
    expect(max(10n, 4n)).toBe(10n);
  });
});

describe('date helpers', () => {
  it('parses and formats ISO dates', () => {
    expect(formatDate(parseDate('2026-11-09'))).toBe('2026-11-09');
  });

  it('rejects invalid dates', () => {
    expect(() => parseDate('2026-13-01')).toThrow();
    expect(() => parseDate('2026-02-30')).toThrow();
    expect(() => parseDate('2026-1-1')).toThrow();
  });

  it('daysBetween is later minus earlier', () => {
    expect(daysBetween('2026-01-01', '2026-01-11')).toBe(10);
    expect(daysBetween('2026-02-01', '2026-03-01')).toBe(28);
  });

  it('addMonths handles month-end rollover', () => {
    expect(formatDate(addMonths(parseDate('2026-01-31'), 1))).toBe('2026-02-28');
    expect(formatDate(addMonths(parseDate('2026-01-15'), 6))).toBe('2026-07-15');
  });

  it('yearMonth extracts YYYY-MM', () => {
    expect(yearMonth('2026-11-09')).toBe('2026-11');
  });
});
