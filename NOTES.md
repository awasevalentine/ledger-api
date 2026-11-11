# Notes

## Assumptions

- **Money.** Every money column is "BIGINT" kobo with "CHECK (amount > 0)" on posting-side and balance columns. All arithmetic routes or goes through "decimal.js" with "precision: 40 and ROUND_HALF_UP. Rounding is applied only at the points named in the brief: once on the term-loan instalment, once per period on interest, once on the discount fee, once on the penalty.

- **Dates.** Treated as calendar dates (no time zone). Instalment due dates are "disbursementDate + n months", rolling back to the last day of the month when the day would overflow.
- **Payment waterfall.** Oldest unpaid due instalment first; inside an instalment the order is penalty, fee, interest, principal. Anything left over after every due instalment is cleared sits in Unapplied Credit. "Due" means "due_date <= receivedAt".

- **Instalment status.** "PAID" or "UNPAID", derived on demand from the sum of current allocations (applied payments only) against the instalment's required principal + interest. Surfaced on "GET /loans/:id".

- **Term loans carry no per-instalment penalty or fee**, so those slots stay at zero. The waterfall still runs in the full order so invoice-financing scenarios drop in without change.

- **Idempotency scope.** The "Idempotency-Key" header is scoped to "payment". A reused key with a different request body returns 409. A reused key with the same body returns the original response.
- **Reversal effective date.** The caller supplies "effectiveDate". Correcting entries land on that date; if it falls in a closed period the database rejects the insert via trigger.

- **Reversal of a reversal entry is rejected.** For a reversal of an already-reversed original is also rejected (409).


## Verified by hand

- Worked Example 1 (term loan) to the kobo: instalment 21,063,026; last payment 21,063,024; total interest 6,378,154. Unit test asserts every row.
- Worked Example 2 (invoice financing) to the kobo on the due date and 10 days late, plus end-to-end `POST /invoices` + `POST /invoices/:id/settle` trial balance.
- Visible scenario for task 4: after payment X is reversed, Y moves onto instalment 1. Loans Receivable settles to 100,736,974, Interest Receivable to 1,511,055, trial balance balances, reconciliation reports balanced. Instalment 1 reports `PAID`, instalment 2 reports `UNPAID`.
- 50 parallel different-key payments of 1,000,000 kobo on one loan apply exactly 21,063,026 to instalment 1 and leave 28,936,974 as unapplied credit.
- 50 simultaneous same-key payment requests produce exactly one payment row and one journal entry.
- Append-only triggers reject UPDATE and DELETE on journal_entries and journal_lines.
- A closed period rejects an accrual run that would land an entry inside it.
