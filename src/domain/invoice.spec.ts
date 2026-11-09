import { quoteInvoice } from './invoice';

describe('invoice quote — Worked Example 2', () => {
  const base = {
    faceValueKobo: 1_000_000_000n,
    issueDate: '2026-01-01',
    dueDate: '2026-03-02',
  };

  it('paid on the due date', () => {
    const q = quoteInvoice({ ...base, settlementDate: '2026-03-02' });
    expect(q.tenorDays).toBe(60);
    expect(q.advanceKobo).toBe(800_000_000n);
    expect(q.reserveKobo).toBe(200_000_000n);
    expect(q.discountFeeKobo).toBe(47_342_466n);
    expect(q.latePenaltyKobo).toBe(0n);
    expect(q.payableToClientKobo).toBe(152_657_534n);
    expect(q.clientShortfallKobo).toBe(0n);
  });

  it('paid 10 days late', () => {
    const q = quoteInvoice({ ...base, settlementDate: '2026-03-12' });
    expect(q.daysOverdue).toBe(10);
    expect(q.latePenaltyKobo).toBe(16_000_000n);
    expect(q.payableToClientKobo).toBe(136_657_534n);
    expect(q.clientShortfallKobo).toBe(0n);
  });

  it('no settlement date yields a forecast with no penalty', () => {
    const q = quoteInvoice(base);
    expect(q.daysOverdue).toBe(0);
    expect(q.latePenaltyKobo).toBe(0n);
  });

  it('settlement before due still has zero penalty', () => {
    const q = quoteInvoice({ ...base, settlementDate: '2026-02-20' });
    expect(q.daysOverdue).toBe(0);
    expect(q.latePenaltyKobo).toBe(0n);
  });

  it('reports a shortfall when charges exceed reserve', () => {
    const q = quoteInvoice({
      faceValueKobo: 1_000_000_000n,
      issueDate: '2026-01-01',
      dueDate: '2026-03-02',
      settlementDate: '2027-01-01',
    });
    expect(q.payableToClientKobo).toBe(0n);
    expect(q.clientShortfallKobo).toBeGreaterThan(0n);
  });
});
