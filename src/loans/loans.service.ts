import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { buildSchedule } from '../domain/amortization';
import { LedgerService } from '../ledger/ledger.service';
import { ACCOUNT_CODES } from '../database/entities/account.entity';
import { CreateLoanDto } from './dto/create-loan.dto';
import { kobo } from '../money/money';

export interface LoanView {
  id: string;
  principalKobo: string;
  annualRateBps: number;
  termMonths: number;
  disbursementDate: string;
  disbursementEntryId: string;
  instalmentKobo: string;
  totalInterestKobo: string;
  schedule: Array<{
    sequence: number;
    dueDate: string;
    openingBalanceKobo: string;
    interestKobo: string;
    principalKobo: string;
    paymentKobo: string;
    closingBalanceKobo: string;
    status?: 'PAID' | 'UNPAID';
    allocatedKobo?: string;
  }>;
}

@Injectable()
export class LoansService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly ledger: LedgerService,
  ) {}

  async create(dto: CreateLoanDto): Promise<LoanView> {
    const principal = kobo(dto.principalKobo);
    const amort = buildSchedule({
      principalKobo: principal,
      annualRateBps: dto.annualRateBps,
      termMonths: dto.termMonths,
      disbursementDate: dto.disbursementDate,
    });

    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const [loan] = (await qr.query(
        `INSERT INTO loans (principal_kobo, annual_rate_bps, term_months, disbursement_date)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [principal.toString(), dto.annualRateBps, dto.termMonths, dto.disbursementDate],
      )) as Array<{ id: string }>;

      for (const row of amort.schedule) {
        await qr.query(
          `INSERT INTO instalments
             (loan_id, sequence, due_date, opening_balance_kobo, interest_kobo,
              principal_kobo, payment_kobo, closing_balance_kobo)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            loan.id,
            row.sequence,
            row.dueDate,
            row.openingBalanceKobo.toString(),
            row.interestKobo.toString(),
            row.principalKobo.toString(),
            row.paymentKobo.toString(),
            row.closingBalanceKobo.toString(),
          ],
        );
      }

      const entry = await this.ledger.postEntry(qr, {
        entryDate: dto.disbursementDate,
        memo: `disbursement of loan ${loan.id}`,
        referenceType: 'loan',
        referenceId: loan.id,
        lines: [
          { accountCode: ACCOUNT_CODES.LOANS_RECEIVABLE, direction: 'DR', amountKobo: principal },
          { accountCode: ACCOUNT_CODES.CASH, direction: 'CR', amountKobo: principal },
        ],
      });

      await qr.query(`UPDATE loans SET disbursement_entry_id = $1 WHERE id = $2`, [entry.id, loan.id]);

      await qr.commitTransaction();

      return {
        id: loan.id,
        principalKobo: principal.toString(),
        annualRateBps: dto.annualRateBps,
        termMonths: dto.termMonths,
        disbursementDate: dto.disbursementDate,
        disbursementEntryId: entry.id,
        instalmentKobo: amort.instalmentKobo.toString(),
        totalInterestKobo: amort.totalInterestKobo.toString(),
        schedule: amort.schedule.map((r) => ({
          sequence: r.sequence,
          dueDate: r.dueDate,
          openingBalanceKobo: r.openingBalanceKobo.toString(),
          interestKobo: r.interestKobo.toString(),
          principalKobo: r.principalKobo.toString(),
          paymentKobo: r.paymentKobo.toString(),
          closingBalanceKobo: r.closingBalanceKobo.toString(),
        })),
      };
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  async findOne(id: string): Promise<LoanView> {
    const [loan]: Array<{
      id: string;
      principal_kobo: string;
      annual_rate_bps: number;
      term_months: number;
      disbursement_date: string;
      disbursement_entry_id: string;
    }> = await this.ds.query(
      `SELECT id, principal_kobo, annual_rate_bps, term_months, disbursement_date, disbursement_entry_id
       FROM loans WHERE id = $1`,
      [id],
    );
    if (!loan) throw new NotFoundException(`loan ${id} not found`);

    const instalments: Array<{
      sequence: number;
      due_date: string;
      opening_balance_kobo: string;
      interest_kobo: string;
      principal_kobo: string;
      payment_kobo: string;
      closing_balance_kobo: string;
      allocated_kobo: string;
      required_kobo: string;
    }> = await this.ds.query(
      `SELECT i.sequence,
              i.due_date,
              i.opening_balance_kobo,
              i.interest_kobo,
              i.principal_kobo,
              i.payment_kobo,
              i.closing_balance_kobo,
              COALESCE(SUM(
                CASE WHEN p.status = 'applied' AND a.is_current THEN
                  a.penalty_kobo + a.fee_kobo + a.interest_kobo + a.principal_kobo
                ELSE 0 END
              ), 0)::text AS allocated_kobo,
              (i.interest_kobo + i.principal_kobo)::text AS required_kobo
       FROM instalments i
       LEFT JOIN payment_allocations a
              ON a.instalment_id = i.id AND a.is_current = TRUE
       LEFT JOIN payments p ON p.id = a.payment_id
       WHERE i.loan_id = $1
       GROUP BY i.id, i.sequence, i.due_date, i.opening_balance_kobo, i.interest_kobo,
                i.principal_kobo, i.payment_kobo, i.closing_balance_kobo
       ORDER BY i.sequence`,
      [id],
    );

    const instalmentKobo = instalments[0]?.payment_kobo ?? '0';
    const totalInterest = instalments.reduce((s, r) => s + BigInt(r.interest_kobo), 0n);

    return {
      id: loan.id,
      principalKobo: loan.principal_kobo,
      annualRateBps: loan.annual_rate_bps,
      termMonths: loan.term_months,
      disbursementDate: typeof loan.disbursement_date === 'string'
        ? loan.disbursement_date
        : new Date(loan.disbursement_date).toISOString().slice(0, 10),
      disbursementEntryId: loan.disbursement_entry_id,
      instalmentKobo,
      totalInterestKobo: totalInterest.toString(),
      schedule: instalments.map((r) => {
        const allocated = BigInt(r.allocated_kobo);
        const required = BigInt(r.required_kobo);
        return {
          sequence: r.sequence,
          dueDate: typeof r.due_date === 'string' ? r.due_date : new Date(r.due_date).toISOString().slice(0, 10),
          openingBalanceKobo: r.opening_balance_kobo,
          interestKobo: r.interest_kobo,
          principalKobo: r.principal_kobo,
          paymentKobo: r.payment_kobo,
          closingBalanceKobo: r.closing_balance_kobo,
          status: (allocated >= required ? 'PAID' : 'UNPAID') as 'PAID' | 'UNPAID',
          allocatedKobo: allocated.toString(),
        };
      }),
    };
  }
}
