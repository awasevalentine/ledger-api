import request from 'supertest';
import { createHarness, Harness } from './test-app';

describe('POST /invoices/quote (worked example 2)', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  it('paid on the due date', async () => {
    const res = await request(h.app.getHttpServer())
      .post('/invoices/quote')
      .send({
        faceValueKobo: '1000000000',
        issueDate: '2026-01-01',
        dueDate: '2026-03-02',
        settlementDate: '2026-03-02',
      })
      .expect(200);
    expect(res.body.advanceKobo).toBe('800000000');
    expect(res.body.reserveKobo).toBe('200000000');
    expect(res.body.discountFeeKobo).toBe('47342466');
    expect(res.body.latePenaltyKobo).toBe('0');
    expect(res.body.payableToClientKobo).toBe('152657534');
  });

  it('paid 10 days late', async () => {
    const res = await request(h.app.getHttpServer())
      .post('/invoices/quote')
      .send({
        faceValueKobo: '1000000000',
        issueDate: '2026-01-01',
        dueDate: '2026-03-02',
        settlementDate: '2026-03-12',
      })
      .expect(200);
    expect(res.body.latePenaltyKobo).toBe('16000000');
    expect(res.body.payableToClientKobo).toBe('136657534');
  });
});

describe('invoice create and settle', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await h.reset();
  });

  it('posts the advance entry on create', async () => {
    const res = await request(h.app.getHttpServer())
      .post('/invoices')
      .send({ faceValueKobo: '1000000000', issueDate: '2026-01-01', dueDate: '2026-03-02' })
      .expect(201);

    expect(res.body.advanceKobo).toBe('800000000');
    expect(res.body.reserveKobo).toBe('200000000');
    expect(res.body.status).toBe('advanced');
    expect(res.body.advanceEntryId).toBeDefined();

    const tb = await request(h.app.getHttpServer()).get('/ledger/trial-balance').expect(200);
    const ir = tb.body.rows.find((r: any) => r.accountCode === 'INVOICE_RECEIVABLES');
    expect(ir.debitsKobo).toBe('800000000');
    const cash = tb.body.rows.find((r: any) => r.accountCode === 'CASH');
    expect(cash.creditsKobo).toBe('800000000');
  });

  it('settles on the due date with fee income and client payable', async () => {
    const inv = (
      await request(h.app.getHttpServer())
        .post('/invoices')
        .send({ faceValueKobo: '1000000000', issueDate: '2026-01-01', dueDate: '2026-03-02' })
        .expect(201)
    ).body;

    const res = await request(h.app.getHttpServer())
      .post(`/invoices/${inv.id}/settle`)
      .send({ settlementDate: '2026-03-02' })
      .expect(201);

    expect(res.body.status).toBe('settled');
    expect(res.body.discountFeeKobo).toBe('47342466');
    expect(res.body.latePenaltyKobo).toBe('0');
    expect(res.body.payableToClientKobo).toBe('152657534');

    const tb = await request(h.app.getHttpServer()).get('/ledger/trial-balance').expect(200);
    const map: Record<string, { dr: string; cr: string }> = Object.fromEntries(
      tb.body.rows.map((r: any) => [r.accountCode, { dr: r.debitsKobo, cr: r.creditsKobo }]),
    );
    expect(map.INVOICE_RECEIVABLES).toEqual({ dr: '800000000', cr: '800000000' });
    expect(map.CASH).toEqual({ dr: '1000000000', cr: '800000000' });
    expect(map.FEE_INCOME).toEqual({ dr: '0', cr: '47342466' });
    expect(map.CLIENT_PAYABLE).toEqual({ dr: '0', cr: '152657534' });

    const totalDr = tb.body.rows.reduce((s: bigint, r: any) => s + BigInt(r.debitsKobo), 0n);
    const totalCr = tb.body.rows.reduce((s: bigint, r: any) => s + BigInt(r.creditsKobo), 0n);
    expect(totalDr).toBe(totalCr);
  });

  it('settles 10 days late with penalty income', async () => {
    const inv = (
      await request(h.app.getHttpServer())
        .post('/invoices')
        .send({ faceValueKobo: '1000000000', issueDate: '2026-01-01', dueDate: '2026-03-02' })
        .expect(201)
    ).body;

    const res = await request(h.app.getHttpServer())
      .post(`/invoices/${inv.id}/settle`)
      .send({ settlementDate: '2026-03-12' })
      .expect(201);

    expect(res.body.latePenaltyKobo).toBe('16000000');
    expect(res.body.payableToClientKobo).toBe('136657534');

    const tb = await request(h.app.getHttpServer()).get('/ledger/trial-balance').expect(200);
    const map: Record<string, { dr: string; cr: string }> = Object.fromEntries(
      tb.body.rows.map((r: any) => [r.accountCode, { dr: r.debitsKobo, cr: r.creditsKobo }]),
    );
    expect(map.PENALTY_INCOME.cr).toBe('16000000');
    expect(map.CLIENT_PAYABLE.cr).toBe('136657534');
  });

  it('rejects a second settlement', async () => {
    const inv = (
      await request(h.app.getHttpServer())
        .post('/invoices')
        .send({ faceValueKobo: '1000000000', issueDate: '2026-01-01', dueDate: '2026-03-02' })
        .expect(201)
    ).body;
    await request(h.app.getHttpServer())
      .post(`/invoices/${inv.id}/settle`)
      .send({ settlementDate: '2026-03-02' })
      .expect(201);
    await request(h.app.getHttpServer())
      .post(`/invoices/${inv.id}/settle`)
      .send({ settlementDate: '2026-03-02' })
      .expect(409);
  });
});
