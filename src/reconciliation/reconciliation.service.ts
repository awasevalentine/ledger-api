import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ACCOUNT_CODES } from '../database/entities/account.entity';
import { LedgerService } from '../ledger/ledger.service';

export interface ReconciliationRow {
  loanId: string;
  loansReceivableKobo: string;
  interestReceivableKobo: string;
  unappliedCreditKobo: string;
}

export interface ReconciliationReport {
  balanced: boolean;
  loans: ReconciliationRow[];
  totals: {
    loansReceivableKobo: string;
    interestReceivableKobo: string;
    unappliedCreditKobo: string;
  };
  controlAccounts: {
    loansReceivableKobo: string;
    interestReceivableKobo: string;
    unappliedCreditKobo: string;
  };
  differences: Array<{ account: string; loanSumKobo: string; controlKobo: string; diffKobo: string }>;
}

@Injectable()
export class ReconciliationService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly ledger: LedgerService,
  ) {}

  async report(): Promise<ReconciliationReport> {
    const loans: Array<{
      loan_id: string;
      principal_kobo: string;
      principal_paid: string;
      interest_accrued: string;
      interest_paid: string;
      unapplied: string;
    }> = await this.ds.query(`
      WITH per_loan_instalment AS (
        SELECT l.id AS loan_id,
               l.principal_kobo,
               COALESCE(SUM(CASE WHEN i.interest_accrued THEN i.interest_kobo ELSE 0 END), 0) AS interest_accrued
        FROM loans l
        LEFT JOIN instalments i ON i.loan_id = l.id
        GROUP BY l.id
      ),
      per_loan_alloc AS (
        SELECT p.loan_id,
               COALESCE(SUM(a.principal_kobo), 0) AS principal_paid,
               COALESCE(SUM(a.interest_kobo), 0)  AS interest_paid,
               COALESCE(SUM(a.unapplied_kobo), 0) AS unapplied
        FROM payments p
        LEFT JOIN payment_allocations a
               ON a.payment_id = p.id AND a.is_current = TRUE
        WHERE p.status = 'applied'
        GROUP BY p.loan_id
      )
      SELECT i.loan_id,
             i.principal_kobo::text AS principal_kobo,
             i.interest_accrued::text AS interest_accrued,
             COALESCE(a.principal_paid, 0)::text AS principal_paid,
             COALESCE(a.interest_paid, 0)::text AS interest_paid,
             COALESCE(a.unapplied, 0)::text AS unapplied
      FROM per_loan_instalment i
      LEFT JOIN per_loan_alloc a ON a.loan_id = i.loan_id
      ORDER BY i.loan_id
    `);

    const rows: ReconciliationRow[] = loans.map((r) => {
      const loansReceivable = BigInt(r.principal_kobo) - BigInt(r.principal_paid);
      const interestReceivable = BigInt(r.interest_accrued) - BigInt(r.interest_paid);
      const unappliedCredit = BigInt(r.unapplied);
      return {
        loanId: r.loan_id,
        loansReceivableKobo: loansReceivable.toString(),
        interestReceivableKobo: interestReceivable.toString(),
        unappliedCreditKobo: unappliedCredit.toString(),
      };
    });

    const totals = rows.reduce(
      (t, r) => ({
        loansReceivableKobo: t.loansReceivableKobo + BigInt(r.loansReceivableKobo),
        interestReceivableKobo: t.interestReceivableKobo + BigInt(r.interestReceivableKobo),
        unappliedCreditKobo: t.unappliedCreditKobo + BigInt(r.unappliedCreditKobo),
      }),
      { loansReceivableKobo: 0n, interestReceivableKobo: 0n, unappliedCreditKobo: 0n },
    );

    const [controlLoans, controlInterest, controlUnapplied] = await Promise.all([
      this.ledger.getAccountNet(ACCOUNT_CODES.LOANS_RECEIVABLE),
      this.ledger.getAccountNet(ACCOUNT_CODES.INTEREST_RECEIVABLE),
      this.ledger.getAccountNet(ACCOUNT_CODES.UNAPPLIED_CREDIT),
    ]);

    const differences = [
      { account: 'LOANS_RECEIVABLE', loanSum: totals.loansReceivableKobo, control: controlLoans },
      { account: 'INTEREST_RECEIVABLE', loanSum: totals.interestReceivableKobo, control: controlInterest },
      { account: 'UNAPPLIED_CREDIT', loanSum: totals.unappliedCreditKobo, control: controlUnapplied },
    ]
      .map((d) => ({
        account: d.account,
        loanSumKobo: d.loanSum.toString(),
        controlKobo: d.control.toString(),
        diffKobo: (d.control - d.loanSum).toString(),
      }))
      .filter((d) => d.diffKobo !== '0');

    return {
      balanced: differences.length === 0,
      loans: rows,
      totals: {
        loansReceivableKobo: totals.loansReceivableKobo.toString(),
        interestReceivableKobo: totals.interestReceivableKobo.toString(),
        unappliedCreditKobo: totals.unappliedCreditKobo.toString(),
      },
      controlAccounts: {
        loansReceivableKobo: controlLoans.toString(),
        interestReceivableKobo: controlInterest.toString(),
        unappliedCreditKobo: controlUnapplied.toString(),
      },
      differences,
    };
  }
}
