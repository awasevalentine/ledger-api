import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { ACCOUNT_CODES, AccountCode } from '../database/entities/account.entity';
import { LedgerService } from '../ledger/ledger.service';
import { PaymentsService } from './payments.service';
import { allocate } from './allocator';
import { lifoReduce, SlotAmounts } from './lifo-reduce';
import { PostLine } from '../ledger/ledger.types';

interface AllocationSummary {
  penalty: bigint;
  fee: bigint;
  interest: bigint;
  principal: bigint;
  unapplied: bigint;
}

interface PaymentRow {
  id: string;
  sequence: string;
  amount_kobo: string;
  received_at: string;
  status: 'applied' | 'reversed';
  entry_id: string | null;
}

interface AllocRow {
  payment_id: string;
  instalment_id: string | null;
  slot: number;
  penalty_kobo: string;
  fee_kobo: string;
  interest_kobo: string;
  principal_kobo: string;
  unapplied_kobo: string;
  version: number;
}

export interface ReversalResult {
  paymentId: string;
  mode: 'full' | 'partial';
  reverseAmountKobo: string;
  reversalEntryId: string;
  correctingEntryIds: string[];
  reallocatedPayments: Array<{
    paymentId: string;
    beforeSummary: Record<string, string>;
    afterSummary: Record<string, string>;
  }>;
}

@Injectable()
export class ReversalService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly ledger: LedgerService,
    private readonly payments: PaymentsService,
  ) {}

  async reverse(
    paymentId: string,
    opts: { reason?: string; effectiveDate: string; amountKobo?: string },
  ): Promise<ReversalResult> {
    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const [target]: Array<{
        id: string;
        loan_id: string;
        status: string;
        entry_id: string | null;
        sequence: string;
        amount_kobo: string;
      }> = await qr.query(
        `SELECT id, loan_id, status, entry_id, sequence::text AS sequence, amount_kobo
         FROM payments WHERE id = $1 FOR UPDATE`,
        [paymentId],
      );
      if (!target) throw new NotFoundException(`payment ${paymentId} not found`);
      if (target.status === 'reversed') throw new ConflictException(`payment ${paymentId} is already reversed`);
      if (!target.entry_id) throw new BadRequestException('payment has no journal entry attached');

      await qr.query(`SELECT id FROM loans WHERE id = $1 FOR UPDATE`, [target.loan_id]);

      const currentSlots = await this.loadCurrentSlots(qr, paymentId);
      const currentRemaining = currentSlots.reduce(
        (s, x) =>
          s + x.penaltyKobo + x.feeKobo + x.interestKobo + x.principalKobo + x.unappliedKobo,
        0n,
      );

      const reverseAmount = opts.amountKobo ? BigInt(opts.amountKobo) : currentRemaining;
      if (reverseAmount <= 0n) throw new BadRequestException('amountKobo must be positive');
      if (reverseAmount > currentRemaining) {
        throw new BadRequestException(
          `amountKobo ${reverseAmount} exceeds remaining ${currentRemaining} on this payment`,
        );
      }
      const mode: 'full' | 'partial' = reverseAmount === currentRemaining ? 'full' : 'partial';

      const allPayments: PaymentRow[] = await qr.query(
        `SELECT id, sequence::text AS sequence, amount_kobo, received_at::text AS received_at, status, entry_id
         FROM payments WHERE loan_id = $1 ORDER BY sequence`,
        [target.loan_id],
      );
      const before = await this.snapshotCurrentAllocations(qr, allPayments.map((p) => p.id));

      const { retainedSlots, totals: reductionTotals } = lifoReduce(currentSlots, reverseAmount);

      await qr.query(
        `UPDATE payment_allocations SET is_current = FALSE WHERE payment_id = $1 AND is_current = TRUE`,
        [paymentId],
      );

      if (mode === 'partial') {
        const [vrow]: Array<{ max: number | null }> = await qr.query(
          `SELECT MAX(version) AS max FROM payment_allocations WHERE payment_id = $1`,
          [paymentId],
        );
        const nextVersion = (vrow?.max ?? 0) + 1;

        for (const s of retainedSlots) {
          await qr.query(
            `INSERT INTO payment_allocations
               (payment_id, version, instalment_id, slot,
                penalty_kobo, fee_kobo, interest_kobo, principal_kobo, unapplied_kobo, is_current)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)`,
            [
              paymentId,
              nextVersion,
              s.instalmentId,
              s.slot,
              s.penaltyKobo.toString(),
              s.feeKobo.toString(),
              s.interestKobo.toString(),
              s.principalKobo.toString(),
              s.unappliedKobo.toString(),
            ],
          );
        }
      }

      const lines: PostLine[] = [
        { accountCode: ACCOUNT_CODES.CASH, direction: 'CR', amountKobo: reverseAmount },
      ];
      if (reductionTotals.interest > 0n)
        lines.push({ accountCode: ACCOUNT_CODES.INTEREST_RECEIVABLE, direction: 'DR', amountKobo: reductionTotals.interest });
      if (reductionTotals.principal > 0n)
        lines.push({ accountCode: ACCOUNT_CODES.LOANS_RECEIVABLE, direction: 'DR', amountKobo: reductionTotals.principal });
      if (reductionTotals.penalty > 0n)
        lines.push({ accountCode: ACCOUNT_CODES.PENALTY_INCOME, direction: 'DR', amountKobo: reductionTotals.penalty });
      if (reductionTotals.fee > 0n)
        lines.push({ accountCode: ACCOUNT_CODES.FEE_INCOME, direction: 'DR', amountKobo: reductionTotals.fee });
      if (reductionTotals.unapplied > 0n)
        lines.push({ accountCode: ACCOUNT_CODES.UNAPPLIED_CREDIT, direction: 'DR', amountKobo: reductionTotals.unapplied });

      const entry = await this.ledger.postEntry(qr, {
        entryDate: opts.effectiveDate,
        memo: `${mode} reversal of payment ${paymentId}${opts.reason ? `: ${opts.reason}` : ''}`,
        referenceType: mode === 'full' ? 'reversal' : 'partial-reversal',
        referenceId: paymentId,
        reversesEntryId: mode === 'full' ? target.entry_id : null,
        lines,
      });
      const reversalEntryId = entry.id;

      if (mode === 'full') {
        await qr.query(
          `UPDATE payments
           SET status = 'reversed', reversed_at = now(), reversal_reason = $1, reversal_entry_id = $2
           WHERE id = $3`,
          [opts.reason ?? null, reversalEntryId, paymentId],
        );
      }

      const correctingEntryIds: string[] = [reversalEntryId];
      const reallocated: ReversalResult['reallocatedPayments'] = [];

      const targetSeq = BigInt(target.sequence);
      const laterPayments = allPayments.filter(
        (p) => BigInt(p.sequence) > targetSeq && p.status === 'applied',
      );

      for (const p of laterPayments) {
        const oldSummary = this.summarize(before.filter((a) => a.payment_id === p.id));

        await qr.query(
          `UPDATE payment_allocations SET is_current = FALSE WHERE payment_id = $1 AND is_current = TRUE`,
          [p.id],
        );

        const [vrow]: Array<{ max: number | null }> = await qr.query(
          `SELECT MAX(version) AS max FROM payment_allocations WHERE payment_id = $1`,
          [p.id],
        );
        const nextVersion = (vrow?.max ?? 0) + 1;

        const owed = await this.payments.fetchOwed(qr, target.loan_id, p.received_at);
        const result = allocate(BigInt(p.amount_kobo), owed);

        for (let slot = 0; slot < result.slots.length; slot++) {
          const s = result.slots[slot]!;
          await qr.query(
            `INSERT INTO payment_allocations
               (payment_id, version, instalment_id, slot,
                penalty_kobo, fee_kobo, interest_kobo, principal_kobo, unapplied_kobo, is_current)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)`,
            [
              p.id,
              nextVersion,
              s.instalmentId,
              slot,
              s.penaltyKobo.toString(),
              s.feeKobo.toString(),
              s.interestKobo.toString(),
              s.principalKobo.toString(),
              s.unappliedKobo.toString(),
            ],
          );
        }

        const newSummary: AllocationSummary = {
          penalty: result.totalPenalty,
          fee: result.totalFee,
          interest: result.totalInterest,
          principal: result.totalPrincipal,
          unapplied: result.totalUnapplied,
        };

        const deltaLines = this.buildDeltaLines(oldSummary, newSummary);
        if (deltaLines.length >= 2) {
          const entry = await this.ledger.postEntry(qr, {
            entryDate: opts.effectiveDate,
            memo: `re-allocation delta for payment ${p.id} after reversal of ${paymentId}`,
            referenceType: 'reallocation',
            referenceId: p.id,
            lines: deltaLines,
          });
          correctingEntryIds.push(entry.id);
        }

        reallocated.push({
          paymentId: p.id,
          beforeSummary: this.summaryToStrings(oldSummary),
          afterSummary: this.summaryToStrings(newSummary),
        });
      }

      const after = await this.snapshotCurrentAllocations(qr, allPayments.map((p) => p.id));

      await qr.query(
        `INSERT INTO reversal_audits
           (payment_id, reason, before_state, after_state, correcting_entry_ids)
         VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb)`,
        [
          paymentId,
          opts.reason ?? null,
          JSON.stringify(before),
          JSON.stringify(after),
          JSON.stringify(correctingEntryIds),
        ],
      );

      await qr.commitTransaction();
      return {
        paymentId,
        mode,
        reverseAmountKobo: reverseAmount.toString(),
        reversalEntryId,
        correctingEntryIds,
        reallocatedPayments: reallocated,
      };
    } catch (e) {
      try {
        await qr.rollbackTransaction();
      } catch {
        // already rolled back
      }
      throw e;
    } finally {
      await qr.release();
    }
  }

  private async loadCurrentSlots(qr: QueryRunner, paymentId: string): Promise<SlotAmounts[]> {
    const rows: AllocRow[] = await qr.query(
      `SELECT payment_id, instalment_id, slot, version,
              penalty_kobo, fee_kobo, interest_kobo, principal_kobo, unapplied_kobo
       FROM payment_allocations WHERE payment_id = $1 AND is_current = TRUE
       ORDER BY slot`,
      [paymentId],
    );
    return rows.map((r) => ({
      slot: r.slot,
      instalmentId: r.instalment_id,
      penaltyKobo: BigInt(r.penalty_kobo),
      feeKobo: BigInt(r.fee_kobo),
      interestKobo: BigInt(r.interest_kobo),
      principalKobo: BigInt(r.principal_kobo),
      unappliedKobo: BigInt(r.unapplied_kobo),
    }));
  }

  private async snapshotCurrentAllocations(qr: QueryRunner, paymentIds: string[]): Promise<AllocRow[]> {
    if (paymentIds.length === 0) return [];
    return qr.query(
      `SELECT payment_id, instalment_id, slot, version,
              penalty_kobo, fee_kobo, interest_kobo, principal_kobo, unapplied_kobo
       FROM payment_allocations
       WHERE is_current = TRUE AND payment_id = ANY($1::uuid[])
       ORDER BY payment_id, slot`,
      [paymentIds],
    );
  }

  private summarize(rows: AllocRow[]): AllocationSummary {
    return rows.reduce<AllocationSummary>(
      (s, r) => ({
        penalty: s.penalty + BigInt(r.penalty_kobo),
        fee: s.fee + BigInt(r.fee_kobo),
        interest: s.interest + BigInt(r.interest_kobo),
        principal: s.principal + BigInt(r.principal_kobo),
        unapplied: s.unapplied + BigInt(r.unapplied_kobo),
      }),
      { penalty: 0n, fee: 0n, interest: 0n, principal: 0n, unapplied: 0n },
    );
  }

  private summaryToStrings(s: AllocationSummary): Record<string, string> {
    return {
      penalty: s.penalty.toString(),
      fee: s.fee.toString(),
      interest: s.interest.toString(),
      principal: s.principal.toString(),
      unapplied: s.unapplied.toString(),
    };
  }

  private buildDeltaLines(oldS: AllocationSummary, newS: AllocationSummary): PostLine[] {
    const pairs: Array<[AccountCode, bigint]> = [
      [ACCOUNT_CODES.INTEREST_RECEIVABLE, newS.interest - oldS.interest],
      [ACCOUNT_CODES.LOANS_RECEIVABLE, newS.principal - oldS.principal],
      [ACCOUNT_CODES.PENALTY_INCOME, newS.penalty - oldS.penalty],
      [ACCOUNT_CODES.FEE_INCOME, newS.fee - oldS.fee],
      [ACCOUNT_CODES.UNAPPLIED_CREDIT, newS.unapplied - oldS.unapplied],
    ];

    const lines: PostLine[] = [];
    for (const [code, delta] of pairs) {
      if (delta === 0n) continue;
      if (delta > 0n) {
        lines.push({ accountCode: code, direction: 'CR', amountKobo: delta });
      } else {
        lines.push({ accountCode: code, direction: 'DR', amountKobo: -delta });
      }
    }
    return lines;
  }
}
