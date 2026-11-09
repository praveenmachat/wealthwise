import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import handler, { config } from '../netlify/functions/investing-portfolio-snapshot.mts';
import { normalizeSnapshot } from '../netlify/functions/_shared/portfolio-snapshot.mts';

// Synthetic credentials and financial data only; never call a live service.
const token = 't'.repeat(43);
const originalFetch = globalThis.fetch;
const originalNetlify = globalThis.Netlify;
afterEach(() => { globalThis.fetch = originalFetch; globalThis.Netlify = originalNetlify; });
const row = (data = {}) => ({ updated_at: '2026-10-01T12:00:00Z', data });
function setup(overrides = {}, response = [row()]) {
  const env = { INVESTING_PORTFOLIO_TOKEN: token, INVESTING_WEALTHWISE_USER_ID: 'synthetic-user',
    SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key', ...overrides };
  globalThis.Netlify = { env: { get: key => env[key] } };
  const calls = [];
  globalThis.fetch = async (...args) => { calls.push(args); return Response.json(response); };
  return { env, calls };
}
const request = (headers = { Authorization: `Bearer ${token}` }, method = 'GET', query = '') =>
  new Request(`https://example.test/api/investing/portfolio-snapshot${query}`, { headers, method });

test('custom route is registered', () => assert.equal(config.path, '/api/investing/portfolio-snapshot'));
test('only GET is accepted without database access', async () => {
  const { calls } = setup();
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
    const res = await handler(request({}, method));
    assert.equal(res.status, 405); assert.equal(res.headers.get('allow'), 'GET');
  }
  assert.equal(calls.length, 0);
});
test('missing, malformed, wrong, duplicate and service credentials are denied', async () => {
  const { calls } = setup();
  for (const value of ['', 'Basic abc', `Bearer ${'x'.repeat(43)}`, `Bearer ${token}, Bearer ${token}`,
    'Bearer synthetic-service-key', `Bearer ${token} extra`, `Bearer ${'t'.repeat(129)}`]) {
    const res = await handler(request({ Authorization: value }));
    assert.equal(res.status, 401); assert.ok(res.headers.get('www-authenticate'));
  }
  assert.equal((await handler(request({}))).status, 401);
  assert.equal(calls.length, 0);
});
test('missing/weak/shared configuration fails closed', async () => {
  for (const overrides of [{ INVESTING_PORTFOLIO_TOKEN: '' }, { INVESTING_PORTFOLIO_TOKEN: 'short' },
    { SUPABASE_SERVICE_ROLE_KEY: token }, { SUPABASE_SERVICE_ROLE_KEY: '' }, { INVESTING_WEALTHWISE_USER_ID: ' ' },
    { SUPABASE_URL: '' }, { SUPABASE_URL: 'http://example.test' }, { SUPABASE_URL: 'https://user:pass@example.test' },
    { SUPABASE_URL: 'https://example.test/path' }, { SUPABASE_URL: 'https://example.test?key=value' }]) {
    const { calls } = setup(overrides);
    assert.equal((await handler(request())).status, 503); assert.equal(calls.length, 0);
  }
});
test('rotation and removal take effect in a warm handler', async () => {
  const { env, calls } = setup();
  assert.equal((await handler(request())).status, 200);
  env.INVESTING_PORTFOLIO_TOKEN = 'r'.repeat(43);
  assert.equal((await handler(request())).status, 401);
  assert.equal((await handler(request({ Authorization: `bearer ${env.INVESTING_PORTFOLIO_TOKEN}` }))).status, 200);
  delete env.INVESTING_PORTFOLIO_TOKEN;
  assert.equal((await handler(request())).status, 503); assert.equal(calls.length, 2);
});
test('query overrides and URL tokens cannot select users or authenticate', async () => {
  const { calls } = setup();
  for (const query of ['?user_id=someone-else', '?table=private', `?token=${token}`]) {
    assert.equal((await handler(request(undefined, 'GET', query))).status, 400);
  }
  assert.equal((await handler(request({}, 'GET', `?token=${token}`))).status, 401);
  assert.equal(calls.length, 0);
});
test('exact configured user, narrow projection, GET, timeout, no redirects and server credentials', async () => {
  const user = 'user"\\,&or=(user_id.not.is.null)';
  const { calls } = setup({ INVESTING_WEALTHWISE_USER_ID: user });
  const res = await handler(request({ Authorization: `Bearer ${token}`, 'x-user-id': 'attacker' }));
  assert.equal(res.status, 200); assert.equal(calls.length, 1);
  const [url, options] = calls[0];
  assert.equal(url.origin, 'https://example.supabase.co');
  assert.equal(url.pathname, '/rest/v1/wealthwise_profiles');
  assert.equal(url.searchParams.get('user_id'), `eq."${user.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  assert.equal(url.searchParams.get('select'), 'data,updated_at');
  assert.equal(url.searchParams.get('limit'), '1'); assert.equal([...url.searchParams].length, 3);
  assert.equal(options.method, 'GET'); assert.equal(options.body, undefined);
  assert.equal(options.headers.apikey, 'synthetic-service-key');
  assert.equal(options.headers.Authorization, 'Bearer synthetic-service-key');
  assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store'); assert.ok(options.signal);
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  assert.equal(res.headers.get('netlify-cdn-cache-control'), 'no-store');
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  assert.equal((await res.text()).includes('synthetic'), false);
});
test('not found, corrupt profile, upstream errors and timeout return safe errors', async () => {
  setup({}, []); assert.equal((await handler(request())).status, 404);
  for (const response of [{ message: 'private' }, [null], [row(), row()], [row(null)],
    [{ data: {}, updated_at: 'invalid' }], [row({ stocks: {} })], [row({ stocks: [null] })]]) {
    setup({}, response); assert.equal((await handler(request())).status, 502);
  }
  for (const fetcher of [async () => new Response('secret upstream error', { status: 500 }),
    async () => new Response('bad JSON'), async () => { throw new DOMException('secret', 'TimeoutError'); }]) {
    setup(); globalThis.fetch = fetcher;
    const res = await handler(request()); assert.equal(res.status, 502);
    assert.deepEqual(await res.json(), { error: 'snapshot_unavailable' });
    assert.equal(res.headers.get('cache-control'), 'private, no-store');
  }
});
test('normalizes all six asset groups, isolates currencies and strips private fields', () => {
  const data = { settings: { baseCur: 'aed', secret: 'private' }, email: 'private', expenses: [{ note: 'private' }],
    stocks: [{ name: 'Example', sym: 'abc', isin: 'in0000000001', qty: '2', avg: '10', ltp: '12', cur: 'inr', exch: 'NSE', note: 'private' }],
    mf: [{ name: 'Example Fund', inv: 100, val: 125 }],
    crypto: [{ name: 'Example Coin', sym: 'coin', qty: .5, buy: 20, ltp: 30, wallet: 'private' }],
    otherInv: [{ name: 'Gold', inv: 10, val: 15 }],
    fds: [{ bank: 'Example Bank', prin: 100, matamt: 150, note: 'private' }],
    banks: [{ name: 'Example Bank', bal: 25, cur: 'AED', acno: 'private' }], loans: [{ bal: 999 }], cards: [{ due: 999 }] };
  const original = structuredClone(data);
  const result = normalizeSnapshot(row(data));
  assert.deepEqual(data, original); assert.equal(result.schemaVersion, '1.0'); assert.equal(result.baseCurrency, 'AED');
  assert.equal(result.asOf, '2026-10-01T12:00:00.000Z'); assert.equal(result.holdings.length, 6);
  assert.equal(result.holdings[0].costBasis, 20); assert.equal(result.holdings[0].currentValue, 24);
  assert.equal(result.holdings[0].unrealizedGain, 4); assert.equal(result.holdings[0].symbol, 'ABC');
  assert.equal(result.holdings[2].costBasis, 10); assert.equal(result.holdings[2].currentValue, 15);
  assert.equal(result.holdings[4].currentValue, 100); assert.equal(result.holdings[4].valuationBasis, 'principal');
  assert.equal(result.holdings[4].unrealizedGain, null);
  assert.deepEqual(result.totalsByCurrency.map(v => [v.currency, v.totalValue]), [['AED', 25], ['INR', 264], ['USD', 15]]);
  assert.equal(JSON.stringify(result).includes('private'), false);
  assert.deepEqual(Object.keys(result), ['schemaVersion', 'source', 'asOf', 'baseCurrency', 'holdings', 'totalsByCurrency']);
});
test('unknown, invalid, zero and extreme numeric values never become fabricated totals', () => {
  for (const invalid of [undefined, null, '', ' ', true, [], {}, '1,234', 'Infinity', Infinity, NaN, -1, 1e100]) {
    const result = normalizeSnapshot(row({ stocks: [{ qty: 2, avg: 3, ltp: invalid }] }));
    assert.equal(result.holdings[0].currentValue, null);
    assert.equal(result.totalsByCurrency[0].totalValue, null);
    assert.equal(result.totalsByCurrency[0].unknownValueCount, 1);
  }
  const zero = normalizeSnapshot(row({ stocks: [{ qty: 2, avg: 3, ltp: 0 }] }));
  assert.equal(zero.holdings[0].currentValue, 0); assert.equal(zero.holdings[0].unrealizedGain, -6);
  assert.equal(zero.totalsByCurrency[0].totalValue, 0);
  assert.equal(normalizeSnapshot(row({ stocks: [{ qty: 1e10, ltp: 1e10 }] })).holdings[0].currentValue, null);
  assert.throws(() => normalizeSnapshot(row({ banks: [{ bal: Number.MAX_SAFE_INTEGER }, { bal: 1 }] })));
  assert.throws(() => normalizeSnapshot(row({ stocks: [{ cur: 'bad-currency' }] })));
});
test('empty profile is valid and carries no invented holdings', () => {
  assert.deepEqual(normalizeSnapshot(row()).holdings, []);
  assert.deepEqual(normalizeSnapshot(row()).totalsByCurrency, []);
});
