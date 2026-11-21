import YahooFinance from 'yahoo-finance2';
import YahooRequestCache from './YahooRequestCache.js';

const yahooFinance = new YahooFinance();

export class YahooFinanceService {
    constructor(client = yahooFinance, options = {}) {
        this.client = client;
        this.requests = new YahooRequestCache(options);
        this.quoteCache = new Map();
        this.quotePending = null;
        // Map Indian stock symbols to Yahoo Finance format (NSE)
        this.symbolMap = {
            'ADANIENT': 'ADANIENT.NS',
            'ADANIPORTS': 'ADANIPORTS.NS',
            'APOLLOHOSP': 'APOLLOHOSP.NS',
            'ASIANPAINT': 'ASIANPAINT.NS',
            'AXISBANK': 'AXISBANK.NS',
            'BAJAJ-AUTO': 'BAJAJ-AUTO.NS',
            'BAJAJFINSV': 'BAJAJFINSV.NS',
            'BAJFINANCE': 'BAJFINANCE.NS',
            'BEL': 'BEL.NS',
            'BHARTIARTL': 'BHARTIARTL.NS',
            'CIPLA': 'CIPLA.NS',
            'COALINDIA': 'COALINDIA.NS',
            'DRREDDY': 'DRREDDY.NS',
            'EICHERMOT': 'EICHERMOT.NS',
            'ETERNAL': 'ETERNAL.NS',
            'GRASIM': 'GRASIM.NS',
            'HCLTECH': 'HCLTECH.NS',
            'HDFCBANK': 'HDFCBANK.NS',
            'HDFCLIFE': 'HDFCLIFE.NS',
            'HINDALCO': 'HINDALCO.NS',
            'HINDUNILVR': 'HINDUNILVR.NS',
            'ICICIBANK': 'ICICIBANK.NS',
            'INDIGO': 'INDIGO.NS',
            'INFY': 'INFY.NS',
            'ITC': 'ITC.NS',
            'JIOFIN': 'JIOFIN.NS',
            'JSWSTEEL': 'JSWSTEEL.NS',
            'KOTAKBANK': 'KOTAKBANK.NS',
            'LT': 'LT.NS',
            'M&M': 'M&M.NS',
            'MARUTI': 'MARUTI.NS',
            'MAXHEALTH': 'MAXHEALTH.NS',
            'NESTLEIND': 'NESTLEIND.NS',
            'NTPC': 'NTPC.NS',
            'ONGC': 'ONGC.NS',
            'POWERGRID': 'POWERGRID.NS',
            'RELIANCE': 'RELIANCE.NS',
            'SBILIFE': 'SBILIFE.NS',
            'SBIN': 'SBIN.NS',
            'SHRIRAMFIN': 'SHRIRAMFIN.NS',
            'SUNPHARMA': 'SUNPHARMA.NS',
            'TATACONSUM': 'TATACONSUM.NS',
            'TATASTEEL': 'TATASTEEL.NS',
            'TCS': 'TCS.NS',
            'TECHM': 'TECHM.NS',
            'TITAN': 'TITAN.NS',
            'TMPV': 'TMPV.NS',
            'TRENT': 'TRENT.NS',
            'ULTRACEMCO': 'ULTRACEMCO.NS',
            'WIPRO': 'WIPRO.NS'
        };

        // Suppress generic warnings from the library
        // Check if suppressNotices exists on instance
        if (yahooFinance.suppressNotices) {
            yahooFinance.suppressNotices(['yahooSurvey']);
        }
    }

    /**
     * Convert symbol to Yahoo Finance format
     */
    toYahooSymbol(symbol) {
        return this.symbolMap[symbol] || (symbol.startsWith('^') || symbol.includes('.') ? symbol : `${symbol}.NS`);
    }

    /**
     * Convert Yahoo symbol back to simple format
     */
    fromYahooSymbol(yahooSymbol) {
        return yahooSymbol.replace('.NS', '').replace('.BO', '');
    }

    /**
     * Get single quote
     */
    async getQuote(symbol) {
        const [quote] = await this.getQuotes([symbol]);
        if (!quote || quote.price <= 0) throw new Error(`Symbol ${symbol} not found`);
        return quote;
    }

    async getQuotes(symbols) {
        if (!symbols.length) return [];
        // Concurrent REST and polling callers share completed per-symbol quotes.
        if (this.quotePending) {
            await this.quotePending;
            return this.getQuotes(symbols);
        }
        const yahooSymbols = [...new Set(symbols.map(s => this.toYahooSymbol(s)))].sort();
        const missing = yahooSymbols.filter(s => {
            const cached = this.quoteCache.get(s);
            return !cached || cached.expiresAt <= this.requests.now();
        });
        if (missing.length) {
            this.quotePending = (async () => {
                const quotes = await this.requests.get(`quotes:${missing.join(',')}`, 60000,
                    () => this.client.quote(missing));
                for (const quote of quotes) {
                    if (!(quote.regularMarketPrice > 0)) continue;
                    this.quoteCache.delete(quote.symbol);
                    this.quoteCache.set(quote.symbol, {
                        value: quote, expiresAt: this.requests.now() + 60000
                    });
                }
                while (this.quoteCache.size > 500) this.quoteCache.delete(this.quoteCache.keys().next().value);
            })();
            try {
                await this.quotePending;
            } finally {
                this.quotePending = null;
            }
        }
        return symbols.map(symbol => {
            const cached = this.quoteCache.get(this.toYahooSymbol(symbol));
            if (cached && cached.expiresAt > this.requests.now()) return this.formatQuote(cached.value, symbol);
            return { symbol, price: 0, change: 0, changePercent: 0, lastUpdated: null };
        });
    }

    /**
     * Format quote data to match our app structure
     */
    formatQuote(yahooData, originalSymbol) {
        return {
            symbol: originalSymbol,
            name: yahooData.longName || yahooData.shortName || originalSymbol,
            price: yahooData.regularMarketPrice || 0,
            change: yahooData.regularMarketChange || 0,
            changePercent: yahooData.regularMarketChangePercent || 0,
            volume: yahooData.regularMarketVolume || 0,
            high: yahooData.regularMarketDayHigh || 0,
            low: yahooData.regularMarketDayLow || 0,
            open: yahooData.regularMarketOpen || 0,
            previousClose: yahooData.regularMarketPreviousClose || 0,
            marketCap: yahooData.marketCap || 0,
            lastUpdated: yahooData.regularMarketTime ? new Date(yahooData.regularMarketTime).getTime() : Date.now(),
        };
    }

    /**
     * Get historical data for charts
     */
    async getHistoricalData(symbol, period = '1mo', interval = '1d') {
        try {
            const yahooSymbol = this.toYahooSymbol(symbol);

            // Calculate timestamps
            // yahoo-finance2 chart uses period1 (start) and period2 (end)
            const periods = {
                '1d': 1,
                '5d': 5,
                '1mo': 30,
                '3mo': 90,
                '6mo': 180,
                '1y': 365,
                '5y': 1825,
            };

            const days = periods[period] || 30;
            const period2 = new Date(); // now
            const period1 = new Date(period2.getTime() - (days * 24 * 60 * 60 * 1000));

            const queryOptions = {
                period1: period1, // Date object or string or number
                period2: period2,
                interval: interval // '1d', '1wk', '1mo'
            };

            const result = await this.requests.get(`chart:${yahooSymbol}:${period}:${interval}`, 60000,
                () => this.client.chart(yahooSymbol, queryOptions));

            if (!result || !result.quotes) {
                return [];
            }

            // Format as OHLCV data
            return result.quotes.map(candle => ({
                timestamp: candle.date.getTime(),
                date: candle.date.toISOString(),
                open: candle.open || 0,
                high: candle.high || 0,
                low: candle.low || 0,
                close: candle.close || 0,
                volume: candle.volume || 0,
            }));

        } catch (error) {
            console.error(`Error fetching historical data for ${symbol}:`, error.message);
            throw error;
        }
    }

    /**
     * Get company profile (Sector, Industry, Website)
     */
    async getCompanyProfile(symbol) {
        try {
            const yahooSymbol = this.toYahooSymbol(symbol);
            const result = await this.requests.get(`profile:${yahooSymbol}`, 3600000,
                () => this.client.quoteSummary(yahooSymbol, { modules: ['summaryProfile'] }));

            if (result && result.summaryProfile) {
                return {
                    sector: result.summaryProfile.sector || 'Others',
                    industry: result.summaryProfile.industry || 'Others',
                    website: result.summaryProfile.website,
                    longBusinessSummary: result.summaryProfile.longBusinessSummary
                };
            }
            return null;
        } catch (error) {
            console.error(`Error fetching profile for ${symbol}:`, error.message);
            return null; // non-critical
        }
    }

    /**
     * Search for stocks
     */
    async searchSymbol(query) {
        try {
            const result = await this.requests.get(`search:${query}`, 60000, () => this.client.search(query));

            if (!result || !result.quotes) {
                return [];
            }

            return result.quotes
                .filter(q => q.symbol.endsWith('.NS') || q.symbol.endsWith('.BO'))
                .map(q => ({
                    symbol: this.fromYahooSymbol(q.symbol),
                    name: q.longname || q.shortname,
                    exchange: q.exchange,
                    type: q.quoteType,
                }));
        } catch (error) {
            console.error('Error searching symbols:', error.message);
            return [];
        }
    }

    /**
     * Get company news
     * yahoo-finance2 v3+ may throw FailedYahooValidationError on the search endpoint
     * because Yahoo changed their API schema. Pass `validateResult: false` to bypass
     * schema validation and receive the raw (but valid) data.
     */
    async getCompanyNews(symbol) {
        try {
            const yahooSymbol = this.toYahooSymbol(symbol);
            const result = await this.requests.get(`news:${yahooSymbol}`, 300000, () => this.client.search(
                yahooSymbol,
                { newsCount: 10, quotesCount: 1 },
                { validateResult: false }
            ));

            if (result && result.news && Array.isArray(result.news)) {
                return result.news
                    .filter(article => article && article.title && article.link)
                    .map(article => ({
                        id: article.uuid || `${symbol}-${Date.now()}-${Math.random()}`,
                        title: article.title,
                        source: article.publisher || 'Unknown',
                        time: article.providerPublishTime
                            ? new Date(article.providerPublishTime).toISOString()
                            : new Date().toISOString(),
                        link: article.link,
                        sentiment: 'neutral',
                        symbols: article.relatedTickers || [symbol]
                    }));
            }
            return [];
        } catch (error) {
            // Fallback: try to use partial result attached to the error
            if (error.result && error.result.news) {
                return error.result.news
                    .filter(a => a && a.title && a.link)
                    .map(article => ({
                        id: article.uuid || `${symbol}-${Date.now()}`,
                        title: article.title,
                        source: article.publisher || 'Unknown',
                        time: new Date().toISOString(),
                        link: article.link,
                        sentiment: 'neutral',
                        symbols: [symbol]
                    }));
            }
            console.error(`Error fetching news for ${symbol}:`, error.message);
            return [];
        }
    }
}

export default new YahooFinanceService();
