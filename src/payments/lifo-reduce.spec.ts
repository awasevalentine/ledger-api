import { lifoReduce, SlotAmounts } from './lifo-reduce';

const slot = (
  n: number,
  parts: { penalty?: bigint; fee?: bigint; interest?: bigint; principal?: bigint; unapplied?: bigint; instalmentId?: string | null },
): SlotAmounts => ({
  slot: n,
  instalmentId: parts.instalmentId ?? `inst-${n}`,
  penaltyKobo: parts.penalty ?? 0n,
  feeKobo: parts.fee ?? 0n,
  interestKobo: parts.interest ?? 0n,
  principalKobo: parts.principal ?? 0n,
  unappliedKobo: parts.unapplied ?? 0n,
});

describe('lifoReduce', () => {
  it('reverses from the last slot first and consumes principal before interest', () => {
    const slots = [
      slot(0, { interest: 1_800_000n, principal: 19_263_026n }),
    ];
    const r = lifoReduce(slots, 500_000n);
    expect(r.totals.principal).toBe(500_000n);
    expect(r.totals.interest).toBe(0n);
    expect(r.retainedSlots[0]!.principalKobo).toBe(18_763_026n);
    expect(r.retainedSlots[0]!.interestKobo).toBe(1_800_000n);
  });

  it('reverses from unapplied credit before anything else', () => {
    const slots = [
      slot(0, { interest: 1_800_000n, principal: 19_263_026n }),
      slot(1, { unapplied: 28_936_974n, instalmentId: null }),
    ];
    const r = lifoReduce(slots, 10_000_000n);
    expect(r.totals.unapplied).toBe(10_000_000n);
    expect(r.totals.principal).toBe(0n);
    expect(r.retainedSlots).toHaveLength(2);
    expect(r.retainedSlots[1]!.unappliedKobo).toBe(18_936_974n);
  });

  it('spills from the last slot into the previous one when the last is exhausted', () => {
    const slots = [
      slot(0, { interest: 1_800_000n, principal: 19_263_026n }),
      slot(1, { interest: 1_511_055n, principal: 2_425_919n }),
    ];
    const r = lifoReduce(slots, 5_000_000n);
    expect(r.totals.principal).toBe(2_425_919n + (5_000_000n - 2_425_919n - 1_511_055n));
    expect(r.totals.interest).toBe(1_511_055n);
  });

  it('drops a slot that is fully reversed', () => {
    const slots = [
      slot(0, { interest: 1_800_000n, principal: 19_263_026n }),
      slot(1, { unapplied: 500_000n, instalmentId: null }),
    ];
    const r = lifoReduce(slots, 500_000n);
    expect(r.retainedSlots).toHaveLength(1);
    expect(r.retainedSlots[0]!.slot).toBe(0);
  });

  it('throws when the requested amount exceeds what is available', () => {
    expect(() => lifoReduce([slot(0, { principal: 100n })], 200n)).toThrow();
  });
});
