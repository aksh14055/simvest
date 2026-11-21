import { useState, useEffect, useRef } from 'react';
import { StockChart } from './StockChart';
import { TradeAnalysis, DeepAnalysisData } from './TradeAnalysis';
import { TradeForm } from './TradeForm';
import { apiService } from '../services/api';
import { generateHistoricalData, Timeframe } from '../services/historicalData';
import {
    calculateSMA,
    calculateEMA,
    calculateRSI,
    calculateMACD,
    calculateBollingerBands
} from '../services/technicalIndicators';



import { Stock } from '../types';
import { colors } from '../styles/colors';
import { useWatchlistStore } from '../stores/watchlistStore';
import { Star, ChevronDown, CandlestickChart, BarChart3, LineChart, AreaChart, TrendingUp } from 'lucide-react';
import { IndicatorsDropdown } from './IndicatorsDropdown';

interface ChartModalProps {
    stock: Stock;
    onClose: () => void;
}

export const ChartModal = ({ stock, onClose }: ChartModalProps) => {
    const [timeframe, setTimeframe] = useState<Timeframe>('1M');
    const [chartType, setChartType] = useState<'candlestick' | 'line' | 'area' | 'bar' | 'baseline' | 'renko' | 'pointAndFigure'>('candlestick');
    const [isChartTypeOpen, setIsChartTypeOpen] = useState(false);
    const chartTypeRef = useRef<HTMLDivElement>(null);
    const [sidebarTab, setSidebarTab] = useState<'verdict' | 'trade'>('verdict');
    const [tradeSide, setTradeSide] = useState<'BUY' | 'SELL'>('BUY');

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (chartTypeRef.current && !chartTypeRef.current.contains(event.target as Node)) {
                setIsChartTypeOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const [chartData, setChartData] = useState<{
        ohlc: any[];
        volume: any[];
    }>({ ohlc: [], volume: [] });

    const [activeIndicators, setActiveIndicators] = useState<string[]>([]);
    const [indicators, setIndicators] = useState<Record<string, any>>({});

    const [analysisData, setAnalysisData] = useState<DeepAnalysisData | null>(null);
    const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(true);

    useEffect(() => {
        const fetchAnalysis = async () => {
            if (!stock.symbol) return;
            setIsLoadingAnalysis(true);
            try {
                const data = await apiService.getDeepAnalysis(stock.symbol);
                setAnalysisData(data);
            } catch (error) {
                console.error("Failed to fetch analysis", error);
            } finally {
                setIsLoadingAnalysis(false);
            }
        };

        fetchAnalysis();
    }, [stock.symbol]);


    // Generate chart data when timeframe changes
    useEffect(() => {
        const fetchChartData = async () => {
            if (!stock.symbol) return;

            try {
                // Map timeframe to API interval/range
                let interval = '1d';
                let period = '1mo';

                switch (timeframe) {
                    case '1D':
                        interval = '5m';
                        period = '5d'; // Fetch 5 days of data, allowing scrolling back
                        break;
                    case '1W':
                        interval = '30m';
                        period = '1mo'; // Fetch 1 month, allowing scrolling back
                        break;
                    case '1M':
                        interval = '1d';
                        period = '6mo'; // Fetch 6 months of daily history
                        break;
                    case '3M':
                        interval = '1d';
                        period = '1y'; // Fetch 1 full year of history
                        break;
                    case '1Y':
                        interval = '1wk';
                        period = '5y'; // Fetch 5 years of weekly candles
                        break;
                }

                // Use apiService directly (we might need to update apiService to support range param if backend allows)
                // Current backend implementation for /historical/:key primarily looks at interval.
                // Let's pass the mapped interval.
                // Note: We need instrumentKey. If stock prop doesn't have it, we might need to derive it or pass it.
                // Assuming stock matches Stock interface or has instrumentKey.
                // If not, we fall back to generating via symbol if backend supports it, but endpoint is /historical/:instrumentKey.
                // We'll trust the parent passes a valid object, or update Props.

                const key = (stock as any).instrumentKey || calculateInstrumentKey(stock.symbol);
                const candles = await apiService.getHistoricalData(key, interval, period);

                if (candles && candles.length > 0) {
                    const validCandles = candles.filter((c: any) => c.close > 0 && c.timestamp > 0);

                    if (validCandles.length > 0) {
                        // Detect and correct system clock/API time drift (e.g. system is set to the future, or API is stale)
                        const lastApiTimestamp = validCandles[validCandles.length - 1].timestamp;
                        const currentSystemTimestamp = Date.now();
                        
                        // If drift is larger than 1 day (86400000 ms), shift all timestamps to align the last candle with now
                        const driftThreshold = 24 * 60 * 60 * 1000;
                        const timeOffset = Math.abs(currentSystemTimestamp - lastApiTimestamp) > driftThreshold
                            ? currentSystemTimestamp - lastApiTimestamp
                            : 0;

                        const ohlc = validCandles.map((c: any) => ({
                            time: Math.floor((c.timestamp + timeOffset) / 1000),
                            open: c.open,
                            high: c.high,
                            low: c.low,
                            close: c.close
                        }));

                        const volume = validCandles.map((c: any) => ({
                            time: Math.floor((c.timestamp + timeOffset) / 1000),
                            value: c.volume,
                            color: c.close >= c.open ? `${colors.success.DEFAULT}40` : `${colors.danger.DEFAULT}40`
                        }));

                        setChartData({ ohlc, volume });
                    } else {
                        throw new Error("No valid candles after filtering");
                    }
                } else {
                    throw new Error("No data returned");
                }
            } catch (error) {
                console.error("Failed to fetch chart data", error);
                // Fallback to mock if fetch fails?
                if (stock.ltp) {
                    const key = (stock as any).instrumentKey || calculateInstrumentKey(stock.symbol);
                    const data = generateHistoricalData(stock.ltp, timeframe, key);
                    setChartData(data);
                }
            }
        };

        fetchChartData();
    }, [stock.symbol, timeframe]);

    // Helper to generate key if missing (nifty50 config logic)
    const calculateInstrumentKey = (symbol: string) => {
        return `NSE_EQ|${symbol}`;
    };

    // Live Candle Logic
    const [liveCandle, setLiveCandle] = useState<any>(null); // Use existing type logic

    useEffect(() => {
        if (!stock.ltp || chartData.ohlc.length === 0) return;

        // Get the last candle from history
        const lastCandle = chartData.ohlc[chartData.ohlc.length - 1];

        // This is a simplified "Update Last Candle" logic.
        // It assumes the last candle fetched aligns with current time (e.g. today's daily candle).
        // If stock.ltp updates, we update High/Low/Close of that same candle.

        // NOTE: Ideally we check timestamps. If fetched data is old, we might need a new candle.
        // For now, updating the last candle gives instant feedback for "today".

        // Don't mutate, create new object
        const updatedCandle = {
            ...lastCandle,
            close: stock.ltp, // Set Close to current LTP
            high: Math.max(lastCandle.high, stock.ltp), // Update High
            low: Math.min(lastCandle.low, stock.ltp),  // Update Low
        };

        setLiveCandle(updatedCandle);

    }, [stock.ltp, chartData.ohlc]); // Re-run when LTP changes or we get new history

    // Calculate indicators when chart data or active indicators change
    useEffect(() => {
        if (chartData.ohlc.length === 0) return;

        const newIndicators: Record<string, any> = {};

        if (activeIndicators.includes('SMA20')) newIndicators.sma20 = calculateSMA(chartData.ohlc, 20);
        if (activeIndicators.includes('SMA50')) newIndicators.sma50 = calculateSMA(chartData.ohlc, 50);
        if (activeIndicators.includes('SMA200')) newIndicators.sma200 = calculateSMA(chartData.ohlc, 200);
        if (activeIndicators.includes('EMA12')) newIndicators.ema12 = calculateEMA(chartData.ohlc, 12);
        if (activeIndicators.includes('EMA26')) newIndicators.ema26 = calculateEMA(chartData.ohlc, 26);

        // Advanced indicators
        if (activeIndicators.includes('BB')) newIndicators.bollinger = calculateBollingerBands(chartData.ohlc, 20, 2);
        if (activeIndicators.includes('RSI')) newIndicators.rsi = calculateRSI(chartData.ohlc, 14);
        if (activeIndicators.includes('MACD')) newIndicators.macd = calculateMACD(chartData.ohlc);

        setIndicators(newIndicators);
    }, [chartData, activeIndicators]);

    // Handle escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    const timeframes: Timeframe[] = ['1D', '1W', '1M', '3M', '1Y'];

    const toggleIndicator = (indicator: string) => {
        setActiveIndicators(prev =>
            prev.includes(indicator)
                ? prev.filter(i => i !== indicator)
                : [...prev, indicator]
        );
    };

    const formatChange = () => {
        if (!stock.change || !stock.changePercent) return null;
        const sign = stock.change >= 0 ? '+' : '';
        const color = stock.change >= 0 ? 'text-profit' : 'text-loss';
        return (
            <span className={`${color} text-sm font-medium`}>
                {sign}₹{stock.change.toFixed(2)} ({sign}{stock.changePercent.toFixed(2)}%)
            </span>
        );
    };

    const handleTradeClick = (side: 'BUY' | 'SELL') => {
        setTradeSide(side);
        setSidebarTab('trade');
    };

    const { addToWatchlist, removeFromWatchlist, isInWatchlist } = useWatchlistStore();
    const inWatchlist = isInWatchlist(stock.instrumentKey);

    const handleToggleWatchlist = () => {
        if (inWatchlist) {
            removeFromWatchlist(stock.instrumentKey);
        } else {
            addToWatchlist(stock.instrumentKey);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[32px] shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden transition-all duration-300">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md">
                    <div className="flex items-center gap-6">
                        <div>
                            <div className="flex items-center gap-3">
                                <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{stock.symbol}</h2>
                                <button
                                    onClick={handleToggleWatchlist}
                                    className={`p-1.5 rounded-xl transition-all duration-200 ${inWatchlist ? 'text-yellow-500 bg-yellow-500/10' : 'text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                                    title={inWatchlist ? "Remove from Watchlist" : "Add to Watchlist"}
                                >
                                    <Star className={`w-4.5 h-4.5 ${inWatchlist ? 'fill-current' : ''}`} />
                                </button>
                            </div>
                            <div className="flex items-center space-x-2 mt-1">
                                <span className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                                    ₹{stock.ltp?.toFixed(2) || '0.00'}
                                </span>
                                {formatChange()}
                            </div>
                            <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 mt-1 block">
                                Last Updated: {stock.lastUpdated ? new Date(stock.lastUpdated).toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' }) : 'Live'}
                            </span>
                        </div>

                        <div className="h-8 w-px bg-slate-200 dark:bg-slate-800"></div>

                        {/* Trade Actions */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => handleTradeClick('BUY')}
                                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-lg shadow-emerald-500/10 flex items-center gap-1.5 transform active:scale-95 transition-all group"
                            >
                                <span className="opacity-80 font-normal">B</span> Buy
                            </button>
                            <button
                                onClick={() => handleTradeClick('SELL')}
                                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-black rounded-xl shadow-lg shadow-red-500/10 flex items-center gap-1.5 transform active:scale-95 transition-all group"
                            >
                                <span className="opacity-80 font-normal">S</span> Sell
                            </button>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition p-2 rounded-xl"
                        title="Close (Esc)"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Controls */}
                <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/10 flex items-center justify-between gap-4 flex-wrap">
                    {/* Timeframe & Chart Type */}
                    <div className="flex items-center gap-4">
                        {/* Timeframe Selector */}
                        <div className="flex bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-xl border border-slate-200/50 dark:border-slate-700/50">
                            {timeframes.map((tf) => (
                                <button
                                    key={tf}
                                    onClick={() => setTimeframe(tf)}
                                    className={`px-3 py-1.5 text-xs font-extrabold rounded-lg transition-all duration-150 ${timeframe === tf
                                        ? 'bg-white dark:bg-slate-700 text-primary shadow-sm'
                                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                                        }`}
                                >
                                    {tf}
                                </button>
                            ))}
                        </div>

                        <div className="h-5 w-px bg-slate-200 dark:bg-slate-700/50"></div>

                        {/* Chart Style Selector Dropdown */}
                        <div className="relative" ref={chartTypeRef}>
                            <button
                                onClick={() => setIsChartTypeOpen(!isChartTypeOpen)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border transition-all duration-200 ${
                                    isChartTypeOpen
                                        ? 'bg-primary/10 text-primary border-primary/30'
                                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:border-slate-300 dark:hover:border-slate-600 shadow-sm'
                                }`}
                                title="Select Chart Style"
                            >
                                <span className="text-primary flex items-center justify-center">
                                    {chartType === 'candlestick' && <CandlestickChart size={13} />}
                                    {chartType === 'bar' && <BarChart3 size={13} />}
                                    {chartType === 'line' && <LineChart size={13} />}
                                    {chartType === 'area' && <AreaChart size={13} />}
                                    {chartType === 'baseline' && <TrendingUp size={13} />}
                                </span>
                                <span className="capitalize text-[10px] font-bold">
                                    {chartType === 'candlestick' ? 'Candles' : chartType === 'bar' ? 'Bars' : chartType === 'pointAndFigure' ? 'Point & Figure' : chartType}
                                </span>
                                <ChevronDown size={10} className={`opacity-60 transition-transform duration-200 ${isChartTypeOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {isChartTypeOpen && (
                                <div className="absolute right-0 mt-2 w-44 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 py-1 overflow-hidden">
                                    {[
                                        { id: 'candlestick', label: 'Candlestick', icon: <CandlestickChart size={12} /> },
                                        { id: 'bar', label: 'OHLC Bars', icon: <BarChart3 size={12} /> },
                                        { id: 'line', label: 'Line Chart', icon: <LineChart size={12} /> },
                                        { id: 'area', label: 'Area Chart', icon: <AreaChart size={12} /> },
                                        { id: 'baseline', label: 'Baseline', icon: <TrendingUp size={12} /> },
                                        { id: 'renko', label: 'Renko', icon: <BarChart3 size={12} /> },
                                        { id: 'pointAndFigure', label: 'Point & Figure', icon: <TrendingUp size={12} /> }
                                    ].map((style) => (
                                        <button
                                            key={style.id}
                                            onClick={() => {
                                                setChartType(style.id as any);
                                                setIsChartTypeOpen(false);
                                            }}
                                            className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                                                chartType === style.id
                                                    ? 'bg-primary/10 text-primary font-bold'
                                                    : 'text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                            }`}
                                        >
                                            <span className={chartType === style.id ? 'text-primary flex items-center' : 'text-slate-400 dark:text-slate-500 flex items-center'}>
                                                {style.icon}
                                            </span>
                                            <span>{style.label}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Indicator Toggles */}
                    <div className="flex items-center space-x-2">
                        <IndicatorsDropdown
                            activeIndicators={activeIndicators}
                            onToggleIndicator={toggleIndicator}
                        />
                    </div>
                </div>

                {/* Main Content: Chart + Analysis/Trade */}
                <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                    {/* Chart Area */}
                    <div className="flex-1 min-h-[400px] md:min-h-0 relative">
                        {chartData.ohlc.length > 0 ? (
                            <StockChart
                                ohlcData={chartData.ohlc}
                                volumeData={chartData.volume}
                                chartType={chartType}
                                indicators={indicators}
                                activeIndicators={activeIndicators}
                                liveCandle={liveCandle}
                                timeframe={timeframe}
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full text-text-secondary">
                                Loading Chart...
                            </div>
                        )}
                    </div>

                    {/* Analysis & Trade Sidebar */}
                    <div className="w-full md:w-[390px] border-l border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/10 flex flex-col h-full overflow-hidden">
                        {/* Tab Headers */}
                        <div className="px-5 py-2.5 border-b border-slate-100 dark:border-slate-800 flex bg-white/40 dark:bg-slate-900/20 backdrop-blur-sm flex-none">
                            <div className="w-full bg-slate-100 dark:bg-slate-900/60 p-0.5 rounded-xl flex gap-0.5 border border-slate-200/30 dark:border-slate-700/30">
                                <button
                                    onClick={() => setSidebarTab('verdict')}
                                    className={`flex-1 py-1.8 px-3 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                                        sidebarTab === 'verdict'
                                            ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm font-bold border-0'
                                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-semibold'
                                    }`}
                                >
                                    <span>🤖</span> AI Verdict
                                </button>
                                <button
                                    onClick={() => {
                                        setSidebarTab('trade');
                                        setTradeSide('BUY');
                                    }}
                                    className={`flex-1 py-1.8 px-3 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                                        sidebarTab === 'trade'
                                            ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm font-bold border-0'
                                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-semibold'
                                    }`}
                                >
                                    <span>⚡</span> Trade
                                </button>
                            </div>
                        </div>

                        {/* Tab Content */}
                        <div className="flex-1 px-5 pt-2 pb-3 overflow-y-auto custom-scrollbar">
                            {sidebarTab === 'verdict' ? (
                                <div className="space-y-3">
                                    <TradeAnalysis
                                        analysis={analysisData}
                                        isLoading={isLoadingAnalysis}
                                        minimal={true}
                                    />
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="bg-white dark:bg-slate-900/60 border border-slate-200/50 dark:border-slate-800/80 rounded-2xl px-4 py-2.5 shadow-sm">
                                        <TradeForm
                                            stock={stock}
                                            initialSide={tradeSide}
                                            onSuccess={() => {}}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
