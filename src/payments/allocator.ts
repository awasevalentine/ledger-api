export interface Owed {
  instalmentId: string;
  sequence: number;
  penaltyOwed: bigint;
  feeOwed: bigint;
  interestOwed: bigint;
  principalOwed: bigint;
}

export interface AllocatedSlot {
  instalmentId: string | null;
  sequence: number;
  penaltyKobo: bigint;
  feeKobo: bigint;
  interestKobo: bigint;
  principalKobo: bigint;
  unappliedKobo: bigint;
}

export interface AllocationResult {
  slots: AllocatedSlot[];
  totalPenalty: bigint;
  totalFee: bigint;
  totalInterest: bigint;
  totalPrincipal: bigint;
  totalUnapplied: bigint;
}

export function allocate(amount: bigint, due: Owed[]): AllocationResult {
  let remaining = amount;
  const slots: AllocatedSlot[] = [];

  for (const d of due) {
    if (remaining <= 0n) break;

    const slot: AllocatedSlot = {
      instalmentId: d.instalmentId,
      sequence: d.sequence,
      penaltyKobo: 0n,
      feeKobo: 0n,
      interestKobo: 0n,
      principalKobo: 0n,
      unappliedKobo: 0n,
    };

    const take = (owed: bigint): bigint => {
      if (owed <= 0n || remaining <= 0n) return 0n;
      const amt = owed < remaining ? owed : remaining;
      remaining -= amt;
      return amt;
    };

    slot.penaltyKobo = take(d.penaltyOwed);
    slot.feeKobo = take(d.feeOwed);
    slot.interestKobo = take(d.interestOwed);
    slot.principalKobo = take(d.principalOwed);

    if (
      slot.penaltyKobo > 0n ||
      slot.feeKobo > 0n ||
      slot.interestKobo > 0n ||
      slot.principalKobo > 0n
    ) {
      slots.push(slot);
    }
  }

  if (remaining > 0n) {
    slots.push({
      instalmentId: null,
      sequence: Number.MAX_SAFE_INTEGER,
      penaltyKobo: 0n,
      feeKobo: 0n,
      interestKobo: 0n,
      principalKobo: 0n,
      unappliedKobo: remaining,
    });
  }

  const totals = slots.reduce(
    (t, s) => {
      t.totalPenalty += s.penaltyKobo;
      t.totalFee += s.feeKobo;
      t.totalInterest += s.interestKobo;
      t.totalPrincipal += s.principalKobo;
      t.totalUnapplied += s.unappliedKobo;
      return t;
    },
    { totalPenalty: 0n, totalFee: 0n, totalInterest: 0n, totalPrincipal: 0n, totalUnapplied: 0n },
  );

  return { slots, ...totals };
}
