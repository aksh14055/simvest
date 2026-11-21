// One gate for all Yahoo endpoints: cache successful responses, share in-flight
// requests, and stop upstream traffic temporarily after a provider rate limit.
export class YahooUnavailableError extends Error {
    constructor(retryAfter) {
        super('Market data is temporarily unavailable. Please try again later.');
        this.statusCode = 503;
        this.retryAfter = retryAfter;
    }
}

export default class YahooRequestCache {
    constructor({ now = Date.now, cooldownMs = 300000, maxEntries = 500 } = {}) {
        this.now = now;
        this.cooldownMs = cooldownMs;
        this.maxEntries = maxEntries;
        this.cache = new Map();
        this.pending = new Map();
        this.blockedUntil = 0;
        this.queue = Promise.resolve();
    }

    async get(key, ttl, fetcher) {
        const cached = this.cache.get(key);
        if (cached && cached.expiresAt > this.now()) return cached.value;
        if (this.pending.has(key)) return this.pending.get(key);

        const request = this.queue.then(async () => {
            if (this.blockedUntil > this.now()) {
                throw new YahooUnavailableError(Math.ceil((this.blockedUntil - this.now()) / 1000));
            }
            try {
                const value = await fetcher();
                this.cache.delete(key);
                this.cache.set(key, { value, expiresAt: this.now() + ttl });
                while (this.cache.size > this.maxEntries) this.cache.delete(this.cache.keys().next().value);
                return value;
            } catch (error) {
                const status = error.status ?? error.statusCode ?? error.response?.status;
                if (Number(status) === 429 || /\b429\b|too many requests/i.test(error.message || '')) {
                    this.blockedUntil = this.now() + this.cooldownMs;
                    throw new YahooUnavailableError(Math.ceil(this.cooldownMs / 1000));
                }
                throw error;
            }
        });
        this.pending.set(key, request);
        this.queue = request.catch(() => {});
        try {
            return await request;
        } finally {
            this.pending.delete(key);
        }
    }
}
