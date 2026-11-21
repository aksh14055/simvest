import { test } from 'node:test';
import assert from 'node:assert/strict';
import YahooRequestCache from '../src/services/YahooRequestCache.js';
import { YahooFinanceService } from '../src/services/YahooFinanceService.js';
import yahooFinanceService from '../src/services/YahooFinanceService.js';
import MarketDataService from '../src/services/MarketDataService.js';
import { loadNifty50Instruments, getAllInstrumentKeys } from '../src/config/nifty50.config.js';

test('REST batches and single quotes share cached symbols and preserve order', async () => {
    let calls = 0;
    let now = 100;
    const client = { quote: async symbols => {
        calls++;
        return symbols.map(symbol => ({ symbol, regularMarketPrice: 123 }));
    } };
    const service = new YahooFinanceService(client, { now: () => now });
    const [batch, single] = await Promise.all([
        service.getQuotes(['TCS', 'RELIANCE']), service.getQuote('RELIANCE.NS')
    ]);
    assert.equal(calls, 1);
    assert.deepEqual(batch.map(q => q.symbol), ['TCS', 'RELIANCE']);
    assert.equal(single.price, 123);
    now += 60001;
    await service.getQuote('TCS');
    assert.equal(calls, 2);
});

test('a crumb 429 blocks queued endpoints, allows fresh cache, and recovers after cooldown', async () => {
    let now = 100;
    let calls = 0;
    const cache = new YahooRequestCache({ now: () => now, cooldownMs: 300000 });
    await cache.get('cached', 60000, async () => 42);
    const first = cache.get('quote', 60000, async () => {
        calls++;
        throw new Error('Failed to get crumb, status 429, statusText: Too Many Requests');
    });
    const second = cache.get('chart', 60000, async () => { calls++; });
    const outcomes = await Promise.allSettled([first, second]);
    for (const result of outcomes) {
        assert.equal(result.status, 'rejected');
        assert.equal(result.reason.statusCode, 503);
        assert.equal(result.reason.retryAfter, 300);
    }
    assert.equal(calls, 1);
    assert.equal(await cache.get('cached', 60000, () => assert.fail()), 42);
    now += 300001;
    assert.equal(await cache.get('quote', 60000, async () => 99), 99);
});

test('identical concurrent requests share one fetch; failed requests are not cached', async () => {
    const cache = new YahooRequestCache();
    let calls = 0;
    const fetcher = async () => { calls++; return 'ok'; };
    assert.deepEqual(await Promise.all([cache.get('a', 1000, fetcher), cache.get('a', 1000, fetcher)]), ['ok', 'ok']);
    assert.equal(calls, 1);
    await assert.rejects(cache.get('b', 1000, async () => { throw new Error('network failure'); }));
    assert.equal(await cache.get('b', 1000, fetcher), 'ok');
    assert.equal(calls, 2);
});

test('provider failure does not create fallback quotes or trigger order matching', async t => {
    await loadNifty50Instruments();
    t.mock.method(yahooFinanceService, 'getQuotes', async () => { throw new Error('429'); });
    let broadcasts = 0;
    let matches = 0;
    const service = new MarketDataService({ to: () => ({ emit: () => broadcasts++ }) });
    service.on('priceUpdate', () => matches++);
    await service.fetchRealPrices();
    service.broadcastPriceUpdates();
    assert.equal(broadcasts, 0);
    assert.equal(matches, 0);
    assert.equal(service.getCachedPrice(getAllInstrumentKeys()[0]), undefined);
});

test('expired provider prices cannot be broadcast or used by the trading engine', async () => {
    await loadNifty50Instruments();
    const key = getAllInstrumentKeys()[0];
    let broadcasts = 0;
    let matches = 0;
    const service = new MarketDataService({ to: () => ({ emit: () => broadcasts++ }) });
    service.on('priceUpdate', () => matches++);
    service.mockPrices.set(key, 123);
    service.fetchedAt.set(key, Date.now());
    service.broadcastPriceUpdates();
    assert.equal(broadcasts, 2);
    assert.equal(matches, 1);
    service.fetchedAt.set(key, Date.now() - 60001);
    service.broadcastPriceUpdates();
    assert.equal(service.getCachedPrice(key), undefined);
    assert.equal(broadcasts, 2);
    assert.equal(matches, 1);
});
