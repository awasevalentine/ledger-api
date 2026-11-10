export interface SlotAmounts {
  slot: number;
  instalmentId: string | null;
  penaltyKobo: bigint;
  feeKobo: bigint;
  interestKobo: bigint;
  principalKobo: bigint;
  unappliedKobo: bigint;
}

export interface SlotReduction {
  retained: SlotAmounts;
  reduced: { penalty: bigint; fee: bigint; interest: bigint; principal: bigint; unapplied: bigint };
}

export interface LifoReduction {
  retainedSlots: SlotAmounts[];
  totals: { penalty: bigint; fee: bigint; interest: bigint; principal: bigint; unapplied: bigint };
}

export function lifoReduce(current: SlotAmounts[], amount: bigint): LifoReduction {
  if (amount <= 0n) throw new Error('reversal amount must be positive');

  const ordered = [...current].sort((a, b) => b.slot - a.slot);
  let remaining = amount;

  const retainedMap = new Map<number, SlotAmounts>();
  const totals = { penalty: 0n, fee: 0n, interest: 0n, principal: 0n, unapplied: 0n };

  for (const s of ordered) {
    const retained: SlotAmounts = { ...s };
    if (remaining <= 0n) {
      retainedMap.set(s.slot, retained);
      continue;
    }

    const take = (available: bigint): [bigint, bigint] => {
      if (available <= 0n || remaining <= 0n) return [0n, available];
      const amt = available < remaining ? available : remaining;
      remaining -= amt;
      return [amt, available - amt];
    };

    let taken: bigint;
    [taken, retained.unappliedKobo] = take(s.unappliedKobo);
    totals.unapplied += taken;

    [taken, retained.principalKobo] = take(s.principalKobo);
    totals.principal += taken;

    [taken, retained.interestKobo] = take(s.interestKobo);
    totals.interest += taken;

    [taken, retained.feeKobo] = take(s.feeKobo);
    totals.fee += taken;

    [taken, retained.penaltyKobo] = take(s.penaltyKobo);
    totals.penalty += taken;

    retainedMap.set(s.slot, retained);
  }

  if (remaining > 0n) {
    throw new Error(`cannot reverse ${amount}: only ${amount - remaining} was available`);
  }

  const retainedSlots = Array.from(retainedMap.values())
    .filter(
      (s) =>
        s.penaltyKobo > 0n ||
        s.feeKobo > 0n ||
        s.interestKobo > 0n ||
        s.principalKobo > 0n ||
        s.unappliedKobo > 0n,
    )
    .sort((a, b) => a.slot - b.slot);

  return { retainedSlots, totals };
}
