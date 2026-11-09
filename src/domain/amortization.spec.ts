import { buildSchedule, computeInstalment } from './amortization';

describe('amortization — Worked Example 1', () => {
  const input = {
    principalKobo: 120_000_000n,
    annualRateBps: 1800,
    termMonths: 6,
    disbursementDate: '2026-01-01',
  };

  it('computes the instalment to the kobo', () => {
    expect(computeInstalment(input.principalKobo, input.annualRateBps, input.termMonths)).toBe(21_063_026n);
  });

  it('matches every schedule row', () => {
    const { schedule, instalmentKobo, totalInterestKobo } = buildSchedule(input);
    expect(instalmentKobo).toBe(21_063_026n);
    expect(totalInterestKobo).toBe(6_378_154n);

    const expected = [
      { seq: 1, payment: 21_063_026n, interest: 1_800_000n, principal: 19_263_026n, closing: 100_736_974n },
      { seq: 2, payment: 21_063_026n, interest: 1_511_055n, principal: 19_551_971n, closing: 81_185_003n },
      { seq: 3, payment: 21_063_026n, interest: 1_217_775n, principal: 19_845_251n, closing: 61_339_752n },
      { seq: 4, payment: 21_063_026n, interest: 920_096n, principal: 20_142_930n, closing: 41_196_822n },
      { seq: 5, payment: 21_063_026n, interest: 617_952n, principal: 20_445_074n, closing: 20_751_748n },
      { seq: 6, payment: 21_063_024n, interest: 311_276n, principal: 20_751_748n, closing: 0n },
    ];

    for (let k = 0; k < expected.length; k++) {
      const got = schedule[k]!;
      const want = expected[k]!;
      expect(got.sequence).toBe(want.seq);
      expect(got.paymentKobo).toBe(want.payment);
      expect(got.interestKobo).toBe(want.interest);
      expect(got.principalKobo).toBe(want.principal);
      expect(got.closingBalanceKobo).toBe(want.closing);
    }
  });

  it('schedules the due date one month after disbursement', () => {
    const { schedule } = buildSchedule(input);
    expect(schedule[0]!.dueDate).toBe('2026-02-01');
    expect(schedule[5]!.dueDate).toBe('2026-07-01');
  });
});

describe('amortization — zero rate', () => {
  it('splits principal evenly', () => {
    const { schedule } = buildSchedule({
      principalKobo: 12_000_000n,
      annualRateBps: 0,
      termMonths: 6,
      disbursementDate: '2026-01-01',
    });
    for (const r of schedule.slice(0, -1)) {
      expect(r.interestKobo).toBe(0n);
      expect(r.principalKobo).toBe(2_000_000n);
    }
    expect(schedule[5]!.closingBalanceKobo).toBe(0n);
  });
});
