import { allocate } from './allocator';

describe('allocate', () => {
  const inst = (id: string, seq: number, interest: bigint, principal: bigint) => ({
    instalmentId: id,
    sequence: seq,
    penaltyOwed: 0n,
    feeOwed: 0n,
    interestOwed: interest,
    principalOwed: principal,
  });

  it('splits one payment across interest then principal of the same instalment', () => {
    const r = allocate(21_063_026n, [inst('a', 1, 1_800_000n, 19_263_026n)]);
    expect(r.slots).toHaveLength(1);
    expect(r.slots[0]!.interestKobo).toBe(1_800_000n);
    expect(r.slots[0]!.principalKobo).toBe(19_263_026n);
    expect(r.totalUnapplied).toBe(0n);
  });

  it('leaves remainder as unapplied credit when nothing more is due', () => {
    const r = allocate(50_000_000n, [inst('a', 1, 1_800_000n, 19_263_026n)]);
    expect(r.totalInterest).toBe(1_800_000n);
    expect(r.totalPrincipal).toBe(19_263_026n);
    expect(r.totalUnapplied).toBe(28_936_974n);
    expect(r.slots.at(-1)!.unappliedKobo).toBe(28_936_974n);
    expect(r.slots.at(-1)!.instalmentId).toBeNull();
  });

  it('spills from the first instalment into the next when both are due', () => {
    const r = allocate(25_000_000n, [
      inst('a', 1, 1_800_000n, 19_263_026n),
      inst('b', 2, 1_511_055n, 19_551_971n),
    ]);
    expect(r.slots).toHaveLength(2);
    expect(r.slots[0]!.interestKobo + r.slots[0]!.principalKobo).toBe(21_063_026n);
    expect(r.slots[1]!.interestKobo).toBe(1_511_055n);
    expect(r.slots[1]!.principalKobo).toBe(2_425_919n);
    expect(r.totalUnapplied).toBe(0n);
  });

  it('under-pays the current instalment', () => {
    const r = allocate(1_000_000n, [inst('a', 1, 1_800_000n, 19_263_026n)]);
    expect(r.slots).toHaveLength(1);
    expect(r.slots[0]!.interestKobo).toBe(1_000_000n);
    expect(r.slots[0]!.principalKobo).toBe(0n);
    expect(r.totalUnapplied).toBe(0n);
  });

  it('honours the penalty-fee-interest-principal order within an instalment', () => {
    const r = allocate(10_000n, [
      {
        instalmentId: 'a',
        sequence: 1,
        penaltyOwed: 3_000n,
        feeOwed: 2_000n,
        interestOwed: 4_000n,
        principalOwed: 5_000n,
      },
    ]);
    expect(r.slots[0]!.penaltyKobo).toBe(3_000n);
    expect(r.slots[0]!.feeKobo).toBe(2_000n);
    expect(r.slots[0]!.interestKobo).toBe(4_000n);
    expect(r.slots[0]!.principalKobo).toBe(1_000n);
  });
});
