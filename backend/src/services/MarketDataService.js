import { EventEmitter } from 'events';
import { getAllInstrumentKeys, getSymbolFromKey } from '../config/nifty50.config.js';
import yahooFinanceService from './YahooFinanceService.js';

/**
 * Market Data Service
 * Provides real-time market data from Yahoo Finance
 */
class MarketDataService extends EventEmitter {
    constructor(io) {
        super();
        this.io = io; // Socket.io instance for broadcasting
        this.wsServer = null;
        this.updateInterval = null;
        this.mockPrices = new Map();
        this.previousCloses = new Map(); // Store previous close for day change calculation
        this.isRunning = false;
        this.lastFetchTime = 0;
        this.fetchInterval = 60000; // Share the one-minute REST quote cache.
        this.fetchedAt = new Map();
        this.fetching = false;
    }



    /**
     * Fetch fresh prices from Yahoo Finance
     */
    async fetchRealPrices() {
        const now = Date.now();

        // Only fetch if enough time has passed
        if (this.fetching || now - this.lastFetchTime < this.fetchInterval) {
            return;
        }

        this.lastFetchTime = now;
        this.fetching = true;
        const instrumentKeys = getAllInstrumentKeys();
        const symbols = instrumentKeys.map(key => getSymbolFromKey(key));

        try {
            const quotes = await yahooFinanceService.getQuotes(symbols);

            quotes.forEach((quote, index) => {
                const instrumentKey = instrumentKeys[index];

                // Missing quotes must not overwrite genuine prices.
                if (quote.price && quote.price > 0) {
                    this.mockPrices.set(instrumentKey, quote.price);
                    this.fetchedAt.set(instrumentKey, Date.now());
                }

                // Always update previous close with real data from Yahoo
                if (quote.previousClose) {
                    this.previousCloses.set(instrumentKey, quote.previousClose);
                } else if (!this.previousCloses.has(instrumentKey)) {
                    // Fallback only if we really don't have one
                    this.previousCloses.set(instrumentKey, quote.price);
                }
                // Store the real timestamp from Yahoo
                this.mockPrices.set(`${instrumentKey}_time`, quote.lastUpdated);
            });

            console.log('🔄 Updated prices from Yahoo Finance');
        } catch (error) {
            if (error.message.includes('fetch failed') || error.message.includes('timeout')) {
                console.log('⚠️  Network glitch reaching Yahoo Finance (skipping update)');
            } else {
                console.error('⚠️  Error fetching Yahoo prices:', error.message);
            }
            // Do not fabricate prices when the provider is unavailable.
        } finally {
            this.fetching = false;
        }
    }

    /** Start the Yahoo polling service. */
    async start() {
        if (this.isRunning) {
            console.log('⚠️  Mock service already running');
            return;
        }

        console.log('🚀 Starting Live Market Data Service (Yahoo Finance)...');

        this.isRunning = true;
        this.fetchRealPrices().then(() => {
            if (this.isRunning) this.broadcastPriceUpdates();
        }).catch(err => console.error("Initial fetch failed:", err.message));

        // Quotes are fetched once a minute; failed requests respect the shared cooldown.
        this.updateInterval = setInterval(async () => {
            await this.fetchRealPrices();
            this.broadcastPriceUpdates();
        }, this.fetchInterval);

        console.log('✅ Live Market Data Service started');
        console.log('📡 Broadcasting real-time price updates');
    }

    /**
     * Broadcast price updates to all connected clients
     */
    broadcastPriceUpdates() {
        // Broadcast updates for ALL supported instruments
        const instrumentKeys = getAllInstrumentKeys();

        instrumentKeys.forEach(instrumentKey => {
            const symbol = getSymbolFromKey(instrumentKey);
            // Get latest price (exact match from Yahoo)
            const ltp = this.getCachedPrice(instrumentKey);
            if (!(ltp > 0)) return;
            const timestamp = this.mockPrices.get(`${instrumentKey}_time`) || Date.now();

            const prevClose = this.previousCloses.get(instrumentKey) || ltp;
            const change = ltp - prevClose;
            const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;

            const priceUpdate = {
                symbol,
                instrumentKey,
                ltp,
                change,
                changePercent,
                timestamp: timestamp
            };

            // Broadcast to Socket.io rooms (same as real service)
            this.io.to(`room:${instrumentKey}`).emit('price_update', priceUpdate);
            this.io.to('room:all').emit('price_update', priceUpdate);

            // Emit internal event for matching engine
            this.emit('priceUpdate', {
                instrumentKey,
                ltp
            });
        });
    }

    /**
     * Get a recently fetched provider price for trading
     */
    getCachedPrice(instrumentKey) {
        const fetchedAt = this.fetchedAt.get(instrumentKey);
        if (!fetchedAt || Date.now() - fetchedAt >= this.fetchInterval) return undefined;
        return this.mockPrices.get(instrumentKey);
    }

    /**
     * Stop mock service
     */
    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        this.isRunning = false;
        console.log('🛑 Mock WebSocket Service stopped');
    }

    /**
     * Disconnect (for compatibility with real service)
     */
    disconnect() {
        this.stop();
    }
}

export default MarketDataService;
