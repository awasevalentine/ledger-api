import { createHarness, Harness } from './test-app';
import { LedgerService } from '../src/ledger/ledger.service';
import { DataSource } from 'typeorm';

async function postEntry(ds: DataSource, ledger: LedgerService, lines: any[], memo = 'test') {
  const qr = ds.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    const entry = await ledger.postEntry(qr, {
      entryDate: '2026-01-15',
      memo,
      lines,
    });
    await qr.commitTransaction();
    return entry;
  } catch (e) {
    await qr.rollbackTransaction();
    throw e;
  } finally {
    await qr.release();
  }
}

describe('ledger DB-level invariants', () => {
  let h: Harness;
  let ledger: LedgerService;

  beforeAll(async () => {
    h = await createHarness();
    ledger = h.app.get(LedgerService);
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await h.reset();
  });

  it('accepts a balanced entry', async () => {
    const entry = await postEntry(h.ds, ledger, [
      { accountCode: 'CASH', direction: 'DR', amountKobo: 1_000n },
      { accountCode: 'INTEREST_INCOME', direction: 'CR', amountKobo: 1_000n },
    ]);
    expect(entry.id).toBeDefined();
  });

  it('rejects an unbalanced entry (service layer)', async () => {
    await expect(
      postEntry(h.ds, ledger, [
        { accountCode: 'CASH', direction: 'DR', amountKobo: 1_000n },
        { accountCode: 'INTEREST_INCOME', direction: 'CR', amountKobo: 999n },
      ]),
    ).rejects.toThrow(/unbalanced/);
  });

  it('refuses to update or delete a journal entry', async () => {
    const entry = await postEntry(h.ds, ledger, [
      { accountCode: 'CASH', direction: 'DR', amountKobo: 500n },
      { accountCode: 'INTEREST_INCOME', direction: 'CR', amountKobo: 500n },
    ]);

    await expect(
      h.ds.query(`UPDATE journal_entries SET memo = 'tamper' WHERE id = $1`, [entry.id]),
    ).rejects.toThrow(/append-only/);

    await expect(
      h.ds.query(`DELETE FROM journal_entries WHERE id = $1`, [entry.id]),
    ).rejects.toThrow(/append-only/);

    await expect(
      h.ds.query(`UPDATE journal_lines SET amount_kobo = 1 WHERE entry_id = $1`, [entry.id]),
    ).rejects.toThrow(/append-only/);
  });

  it('rejects a second reversal of the same entry', async () => {
    const entry = await postEntry(h.ds, ledger, [
      { accountCode: 'CASH', direction: 'DR', amountKobo: 777n },
      { accountCode: 'INTEREST_INCOME', direction: 'CR', amountKobo: 777n },
    ]);

    const qr = h.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    await ledger.reverseEntry(qr, entry.id, { entryDate: '2026-01-16' });
    await qr.commitTransaction();
    await qr.release();

    const qr2 = h.ds.createQueryRunner();
    await qr2.connect();
    await qr2.startTransaction();
    await expect(
      ledger.reverseEntry(qr2, entry.id, { entryDate: '2026-01-17' }),
    ).rejects.toThrow(/already been reversed/);
    await qr2.rollbackTransaction();
    await qr2.release();
  });
});
