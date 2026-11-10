import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { ACCOUNT_CODES } from '../database/entities/account.entity';
import { LedgerService } from '../ledger/ledger.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { allocate, AllocatedSlot, Owed } from './allocator';
import { PostLine } from '../ledger/ledger.types';
import { kobo } from '../money/money';
import { advisoryLock, hashRequest, lookupIdempotency, storeIdempotency } from '../common/idempotency';

export interface PaymentResponse {
  id: string;
  loanId: string;
  amountKobo: string;
  receivedAt: string;
  sequence: string;
  status: 'applied' | 'reversed';
  entryId: string;
  allocations: Array<{
    instalmentId: string | null;
    sequence: number | null;
    penaltyKobo: string;
    feeKobo: string;
    interestKobo: string;
    principalKobo: string;
    unappliedKobo: string;
  }>;
}

@Injectable()
export class PaymentsService {
  private readonly scope = 'payment';

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly ledger: LedgerService,
  ) {}

  async create(loanId: string, dto: CreatePaymentDto, idempotencyKey: string): Promise<{
    statusCode: number;
    body: PaymentResponse;
  }> {
    const requestHash = hashRequest({ loanId, ...dto });
    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await advisoryLock(qr, this.scope, idempotencyKey);

      const stored = await lookupIdempotency(qr, this.scope, idempotencyKey);
      if (stored) {
        if (stored.requestHash !== requestHash) {
          await qr.rollbackTransaction();
          throw new ConflictException('idempotency key reused with a different request body');
        }
        await qr.commitTransaction();
        return { statusCode: stored.statusCode, body: stored.responseBody as unknown as PaymentResponse };
      }

      const body = await this.applyPayment(qr, loanId, dto, idempotencyKey);
      await storeIdempotency(qr, this.scope, idempotencyKey, requestHash, 201, body as unknown as Record<string, unknown>);
      await qr.commitTransaction();
      return { statusCode: 201, body };
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

  private async applyPayment(
    qr: QueryRunner,
    loanId: string,
    dto: CreatePaymentDto,
    idempotencyKey: string,
  ): Promise<PaymentResponse> {
    const loanRows: Array<{ id: string; payment_sequence: string }> = await qr.query(
      `SELECT id, payment_sequence FROM loans WHERE id = $1 FOR UPDATE`,
      [loanId],
    );
    if (loanRows.length === 0) throw new NotFoundException(`loan ${loanId} not found`);
    const loan = loanRows[0]!;

    const amount = kobo(dto.amountKobo);
    if (amount <= 0n) throw new BadRequestException('amountKobo must be positive');

    const due = await this.fetchOwed(qr, loanId, dto.receivedAt);
    const result = allocate(amount, due);

    const nextSeq = BigInt(loan.payment_sequence) + 1n;
    const [payment] = (await qr.query(
      `INSERT INTO payments
         (loan_id, amount_kobo, received_at, sequence, external_ref, status, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, 'applied', $6)
       RETURNING id, sequence::text AS sequence`,
      [loanId, amount.toString(), dto.receivedAt, nextSeq.toString(), dto.externalRef ?? null, idempotencyKey],
    )) as Array<{ id: string; sequence: string }>;

    await qr.query(`UPDATE loans SET payment_sequence = $1 WHERE id = $2`, [nextSeq.toString(), loanId]);

    for (let slot = 0; slot < result.slots.length; slot++) {
      const s = result.slots[slot]!;
      await qr.query(
        `INSERT INTO payment_allocations
           (payment_id, version, instalment_id, slot,
            penalty_kobo, fee_kobo, interest_kobo, principal_kobo, unapplied_kobo, is_current)
         VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, TRUE)`,
        [
          payment.id,
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

    const lines = this.buildPaymentLines(amount, result.slots);
    const entry = await this.ledger.postEntry(qr, {
      entryDate: dto.receivedAt,
      memo: `payment ${payment.id} on loan ${loanId}`,
      referenceType: 'payment',
      referenceId: payment.id,
      lines,
    });

    await qr.query(`UPDATE payments SET entry_id = $1 WHERE id = $2`, [entry.id, payment.id]);

    return {
      id: payment.id,
      loanId,
      amountKobo: amount.toString(),
      receivedAt: dto.receivedAt,
      sequence: payment.sequence,
      status: 'applied',
      entryId: entry.id,
      allocations: result.slots.map((s) => ({
        instalmentId: s.instalmentId,
        sequence: s.instalmentId ? s.sequence : null,
        penaltyKobo: s.penaltyKobo.toString(),
        feeKobo: s.feeKobo.toString(),
        interestKobo: s.interestKobo.toString(),
        principalKobo: s.principalKobo.toString(),
        unappliedKobo: s.unappliedKobo.toString(),
      })),
    };
  }

  private buildPaymentLines(amount: bigint, slots: AllocatedSlot[]): PostLine[] {
    const totals = slots.reduce(
      (t, s) => {
        t.penalty += s.penaltyKobo;
        t.fee += s.feeKobo;
        t.interest += s.interestKobo;
        t.principal += s.principalKobo;
        t.unapplied += s.unappliedKobo;
        return t;
      },
      { penalty: 0n, fee: 0n, interest: 0n, principal: 0n, unapplied: 0n },
    );

    const lines: PostLine[] = [
      { accountCode: ACCOUNT_CODES.CASH, direction: 'DR', amountKobo: amount },
    ];
    if (totals.interest > 0n)
      lines.push({ accountCode: ACCOUNT_CODES.INTEREST_RECEIVABLE, direction: 'CR', amountKobo: totals.interest });
    if (totals.principal > 0n)
      lines.push({ accountCode: ACCOUNT_CODES.LOANS_RECEIVABLE, direction: 'CR', amountKobo: totals.principal });
    if (totals.penalty > 0n)
      lines.push({ accountCode: ACCOUNT_CODES.PENALTY_INCOME, direction: 'CR', amountKobo: totals.penalty });
    if (totals.fee > 0n)
      lines.push({ accountCode: ACCOUNT_CODES.FEE_INCOME, direction: 'CR', amountKobo: totals.fee });
    if (totals.unapplied > 0n)
      lines.push({ accountCode: ACCOUNT_CODES.UNAPPLIED_CREDIT, direction: 'CR', amountKobo: totals.unapplied });

    return lines;
  }

  async fetchOwed(qr: QueryRunner, loanId: string, asOf: string): Promise<Owed[]> {
    const rows: Array<{
      id: string;
      sequence: number;
      interest_kobo: string;
      principal_kobo: string;
      allocated_penalty: string;
      allocated_fee: string;
      allocated_interest: string;
      allocated_principal: string;
    }> = await qr.query(
      `
      SELECT i.id,
             i.sequence,
             i.interest_kobo,
             i.principal_kobo,
             COALESCE(SUM(a.penalty_kobo), 0)   AS allocated_penalty,
             COALESCE(SUM(a.fee_kobo), 0)       AS allocated_fee,
             COALESCE(SUM(a.interest_kobo), 0)  AS allocated_interest,
             COALESCE(SUM(a.principal_kobo), 0) AS allocated_principal
      FROM instalments i
      LEFT JOIN payment_allocations a
             ON a.instalment_id = i.id AND a.is_current = TRUE
      LEFT JOIN payments p ON p.id = a.payment_id AND p.status = 'applied'
      WHERE i.loan_id = $1
        AND i.due_date <= $2
      GROUP BY i.id, i.sequence, i.interest_kobo, i.principal_kobo
      ORDER BY i.sequence
      `,
      [loanId, asOf],
    );

    return rows.map((r) => ({
      instalmentId: r.id,
      sequence: r.sequence,
      penaltyOwed: 0n - BigInt(r.allocated_penalty),
      feeOwed: 0n - BigInt(r.allocated_fee),
      interestOwed: BigInt(r.interest_kobo) - BigInt(r.allocated_interest),
      principalOwed: BigInt(r.principal_kobo) - BigInt(r.allocated_principal),
    })).map((o) => ({
      ...o,
      penaltyOwed: o.penaltyOwed < 0n ? 0n : o.penaltyOwed,
      feeOwed: o.feeOwed < 0n ? 0n : o.feeOwed,
      interestOwed: o.interestOwed < 0n ? 0n : o.interestOwed,
      principalOwed: o.principalOwed < 0n ? 0n : o.principalOwed,
    }));
  }
}
