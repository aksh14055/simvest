import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePortfolioStore } from '../stores/portfolioStore';
import { Navbar } from '../components/Navbar';
import { Order } from '../types';
import {
    BookOpen,
    Search,
    MessageSquare,
    ChevronDown,
    ChevronUp,
    ArrowUpRight,
    ArrowDownRight,
    Edit2,
    Save,
    X,
    Zap,
    PenLine,
    BarChart3,
    Clock,
    CheckCircle,
    SlidersHorizontal,
    Plus,
    SlidersHorizontal as FilterIcon,
    TrendingUp,
    BookMarked,
    AlertCircle,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

// ─── Strategy Data ─────────────────────────────────────────────────────────────
// Strategy badge colors are intentionally semantic (per-strategy identity),
// not part of global page chrome. These are the only intentional non-token colors.

const STRATEGY_META: Record<string, { icon: string; cls: string; dot: string }> = {
    'Breakout':                 { icon: '📈', cls: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/30',     dot: 'bg-blue-500' },
    'Mean Reversion':           { icon: '🔄', cls: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/30', dot: 'bg-purple-500' },
    'Moving Average Crossover': { icon: '⚡', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/30', dot: 'bg-indigo-500' },
    'Momentum':                 { icon: '🚀', cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30',   dot: 'bg-amber-500' },
    'Scalp':                    { icon: '✂️', cls: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/30',       dot: 'bg-cyan-500' },
    'Scalping':                 { icon: '✂️', cls: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/30',       dot: 'bg-cyan-500' },
    'Swing Trade':              { icon: '⏳', cls: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30',       dot: 'bg-rose-500' },
    'Value':                    { icon: '💰', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30', dot: 'bg-emerald-500' },
    'Earnings Play':            { icon: '📊', cls: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/30', dot: 'bg-orange-500' },
    'News Catalyst':            { icon: '📰', cls: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/30', dot: 'bg-orange-500' },
    'News Play':                { icon: '📰', cls: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/30', dot: 'bg-orange-500' },
    'Other':                    { icon: '✨', cls: 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-slate-700 dark:text-slate-400 dark:border-slate-600',           dot: 'bg-gray-400 dark:bg-slate-500' },
};

const DEFAULT_META = {
    icon: '🎯',
    cls: 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-slate-700 dark:text-slate-400 dark:border-slate-600',
    dot: 'bg-gray-400 dark:bg-slate-500',
};
const getMeta = (s: string) => STRATEGY_META[s] || DEFAULT_META;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDate = (iso: string) => {
    const d = new Date(iso);
    return {
        date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        relative: (() => {
            const diff = Math.floor((Date.now() - d.getTime()) / 1000);
            if (diff < 60)     return 'Just now';
            if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
            if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
            if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
            return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
        })(),
    };
};

const fmt = (n: number) =>
    `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ─── Reflection Score ─────────────────────────────────────────────────────────

const getScore = (len: number) => {
    if (len === 0)  return { pct: 0,   label: 'No notes yet',    color: 'text-text-muted',                    bar: 'bg-muted',     tip: 'Start with: Why did I take this trade?' };
    if (len < 15)   return { pct: 15,  label: 'Too brief',       color: 'text-danger',                        bar: 'bg-danger',    tip: 'Mention the catalyst or setup you saw.' };
    if (len < 50)   return { pct: 45,  label: 'Getting there',   color: 'text-yellow-600',                    bar: 'bg-yellow-500', tip: 'Add your emotional state & execution notes.' };
    if (len < 120)  return { pct: 72,  label: 'Good reflection', color: 'text-primary',                       bar: 'bg-primary',   tip: "Describe what you'd do differently next time." };
    return               { pct: 100, label: 'Outstanding! 🌟',  color: 'text-success',                       bar: 'bg-success',   tip: 'Perfect depth — this is how patterns become profits.' };
};

// ─── JournalEntry Card ────────────────────────────────────────────────────────

interface JournalEntryProps {
    order: Order;
    defaultExpanded?: boolean;
}

const JournalEntry = ({ order, defaultExpanded = false }: JournalEntryProps) => {
    const { updateOrderMetadata } = usePortfolioStore();
    const [expanded,  setExpanded]  = useState(defaultExpanded);
    const [isEditing, setIsEditing] = useState(false);
    const [strategy,  setStrategy]  = useState(order.strategy || '');
    const [notes,     setNotes]     = useState(order.notes || '');
    const [isSaving,  setIsSaving]  = useState(false);

    useEffect(() => {
        setStrategy(order.strategy || '');
        setNotes(order.notes || '');
    }, [order]);

    const isBuy       = order.type === 'BUY';
    const meta        = getMeta(order.strategy || '');
    const date        = formatDate(order.created_at || new Date().toISOString());
    const totalVal    = order.total_amount || (order.execution_price * order.quantity);
    const score       = getScore(notes.length);
    const hasNotes    = !!order.notes?.trim();
    const hasStrategy = !!order.strategy?.trim();

    // BUY = profit/success colors, SELL = loss/danger colors (existing tokens)
    const tradeCls = isBuy
        ? 'text-profit bg-profit border-profit'
        : 'text-loss bg-loss border-loss';

    const expandedBorderCls = isBuy
        ? 'border-profit shadow-sm shadow-profit/10'
        : 'border-loss shadow-sm shadow-loss/10';

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await updateOrderMetadata(order.id, strategy, notes);
            toast.success('Reflection saved!');
            setIsEditing(false);
        } catch (err: any) {
            toast.error(err.message || 'Failed to save.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggle = () => {
        setExpanded(e => !e);
        if (isEditing) {
            setIsEditing(false);
            setStrategy(order.strategy || '');
            setNotes(order.notes || '');
        }
    };

    return (
        <div className={`group/card bg-card border rounded-xl overflow-hidden transition-all duration-200 ${
            expanded
                ? expandedBorderCls
                : 'border-border hover:border-border/80 hover:shadow-sm'
        }`}>

            {/* ── Collapsed Header ─────────────────────────────────────── */}
            <div
                role="button"
                aria-expanded={expanded}
                aria-label={`${order.symbol} ${order.type} — ${expanded ? 'collapse' : 'expand'}`}
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToggle(); } }}
                onClick={handleToggle}
                className="flex items-center gap-3 px-4 py-3.5 cursor-pointer select-none hover:bg-muted transition-colors"
            >
                {/* Direction icon */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border flex-shrink-0 ${tradeCls}`}>
                    {isBuy
                        ? <ArrowUpRight className="w-[18px] h-[18px]" />
                        : <ArrowDownRight className="w-[18px] h-[18px]" />
                    }
                </div>

                {/* Symbol + chips */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-extrabold text-foreground tracking-tight">
                            {order.symbol}
                        </span>

                        {/* BUY / SELL chip */}
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${tradeCls}`}>
                            {order.type}
                        </span>

                        {/* Strategy chip — visible sm+ */}
                        {hasStrategy && (
                            <span className={`hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${meta.cls}`}>
                                {meta.icon} {order.strategy}
                            </span>
                        )}

                        {/* Annotated badge — uses primary token */}
                        {hasNotes && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary bg-primary/10 border border-primary/20 px-2.5 py-0.5 rounded-full">
                                <MessageSquare className="w-3 h-3" />
                                <span className="hidden sm:inline">Noted</span>
                            </span>
                        )}
                    </div>

                    <p className="text-xs text-text-secondary mt-1 font-medium">
                        {order.quantity} shares &nbsp;·&nbsp; {fmt(order.execution_price)}
                    </p>
                </div>

                {/* Trade value + time */}
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-sm font-extrabold text-foreground font-mono">
                        {fmt(totalVal)}
                    </span>
                    <span className="text-[11px] text-text-muted font-medium">{date.relative}</span>
                </div>

                {/* Edit shortcut — appears on card hover */}
                <button
                    aria-label="Edit reflection"
                    onClick={e => { e.stopPropagation(); setExpanded(true); setIsEditing(true); }}
                    className="opacity-0 group-hover/card:opacity-100 focus:opacity-100 flex-shrink-0 p-1.5 rounded-lg text-text-muted hover:text-primary hover:bg-primary/10 transition-all"
                    title="Add reflection"
                >
                    <Edit2 className="w-3.5 h-3.5" />
                </button>

                {/* Chevron in circle */}
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                    {expanded
                        ? <ChevronUp className="w-3.5 h-3.5 text-text-secondary" />
                        : <ChevronDown className="w-3.5 h-3.5 text-text-secondary" />
                    }
                </div>
            </div>

            {/* ── Expanded Body ─────────────────────────────────────────── */}
            {expanded && (
                <div className="border-t border-border/50 bg-background/40 px-4 py-4 space-y-4">

                    {/* Details grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {[
                            { label: 'Order Type',  val: order.order_type || 'MARKET', icon: <SlidersHorizontal className="w-3 h-3 text-primary" /> },
                            { label: 'Trade Value', val: fmt(totalVal),                icon: <TrendingUp className="w-3 h-3 text-success" /> },
                            { label: 'Status',      val: order.status,                 icon: <CheckCircle className="w-3 h-3 text-primary" /> },
                            { label: 'Exec. Price', val: fmt(order.execution_price),   icon: <Zap className="w-3 h-3 text-text-muted" /> },
                            { label: 'Time',        val: date.time,                    icon: <Clock className="w-3 h-3 text-text-muted" /> },
                            { label: 'Date',        val: date.date,                    icon: <Clock className="w-3 h-3 text-text-muted" /> },
                        ].map(({ label, val, icon }) => (
                            <div key={label} className="bg-card rounded-lg p-3 border border-border">
                                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-text-muted mb-1.5">
                                    {icon} {label}
                                </div>
                                <div className="text-xs font-bold text-foreground truncate">{val}</div>
                            </div>
                        ))}
                    </div>

                    {/* Mobile-only strategy chip */}
                    {hasStrategy && (
                        <div className="sm:hidden">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border ${meta.cls}`}>
                                {meta.icon} {order.strategy}
                            </span>
                        </div>
                    )}

                    {/* ── Reflection Section ───────────────────────────── */}
                    <div className="bg-card rounded-xl border border-border overflow-hidden">

                        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/50">
                            <div className="flex items-center gap-2">
                                <BookMarked className="w-4 h-4 text-primary" />
                                <span className="text-xs font-extrabold text-foreground">Trade Notes</span>
                                {hasNotes && (
                                    <span className="text-[11px] font-semibold text-success bg-profit border border-profit px-2 py-0.5 rounded-full">
                                        Logged ✓
                                    </span>
                                )}
                            </div>
                            {!isEditing && (
                                <button
                                    aria-label="Edit trade notes"
                                    onClick={e => { e.stopPropagation(); setIsEditing(true); }}
                                    className="flex items-center gap-1.5 text-[11px] font-bold text-primary bg-primary/8 hover:bg-primary/15 px-3 py-1.5 rounded-lg border border-primary/20 transition-all focus:outline-none focus:ring-2 focus:ring-primary/60 active:scale-95"
                                >
                                    <Edit2 className="w-3 h-3" />
                                    {hasNotes ? 'Edit' : 'Add Notes'}
                                </button>
                            )}
                        </div>

                        <div className="p-4">
                            {isEditing ? (
                                <div className="space-y-4">
                                    {/* Strategy selector */}
                                    <div>
                                        <label
                                            htmlFor={`strategy-${order.id}`}
                                            className="block text-[11px] font-bold uppercase tracking-wider text-text-secondary mb-2"
                                        >
                                            Strategy
                                        </label>
                                        <div className="relative">
                                            <select
                                                id={`strategy-${order.id}`}
                                                value={strategy}
                                                onChange={e => setStrategy(e.target.value)}
                                                className="w-full pl-3 pr-9 py-2.5 bg-background border border-border rounded-lg text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary appearance-none cursor-pointer transition-all"
                                            >
                                                <option value="">— No strategy —</option>
                                                {['Breakout','Mean Reversion','Moving Average Crossover','Momentum','Scalp','Scalping','Swing Trade','Value','Earnings Play','News Catalyst','News Play','Other'].map(s => (
                                                    <option key={s} value={s}>{getMeta(s).icon}  {s}</option>
                                                ))}
                                            </select>
                                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                                        </div>
                                    </div>

                                    {/* Notes */}
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <label
                                                htmlFor={`notes-${order.id}`}
                                                className="text-[11px] font-bold uppercase tracking-wider text-text-secondary"
                                            >
                                                What happened?
                                            </label>
                                            <span className="text-[11px] font-semibold text-text-muted bg-muted px-2 py-0.5 rounded-md">
                                                {notes.length} chars
                                            </span>
                                        </div>
                                        <textarea
                                            id={`notes-${order.id}`}
                                            rows={4}
                                            value={notes}
                                            onChange={e => setNotes(e.target.value)}
                                            placeholder="Entry setup, catalyst, emotional state, mistakes, what you'd do differently…"
                                            className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary resize-none leading-relaxed transition-all"
                                        />

                                        {/* Quality bar */}
                                        <div className="mt-3 bg-background border border-border rounded-lg p-3 space-y-2.5">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
                                                    Reflection Quality
                                                </span>
                                                <span className={`text-xs font-semibold ${score.color}`}>{score.label}</span>
                                            </div>
                                            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-500 ease-out ${score.bar}`}
                                                    style={{ width: `${score.pct}%` }}
                                                    role="progressbar"
                                                    aria-valuenow={score.pct}
                                                    aria-valuemin={0}
                                                    aria-valuemax={100}
                                                    aria-label="Reflection quality score"
                                                />
                                            </div>
                                            <p className="text-[11px] text-text-muted italic">{score.tip}</p>
                                        </div>
                                    </div>

                                    {/* Action row */}
                                    <div className="flex justify-end gap-2 pt-2 border-t border-border">
                                        <button
                                            onClick={() => { setStrategy(order.strategy || ''); setNotes(order.notes || ''); setIsEditing(false); }}
                                            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-text-secondary bg-transparent border border-border hover:bg-muted rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
                                        >
                                            <X className="w-3.5 h-3.5" /> Cancel
                                        </button>
                                        <button
                                            disabled={isSaving}
                                            onClick={handleSave}
                                            className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-primary hover:bg-primary-dark rounded-lg transition-all shadow-sm shadow-primary/20 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary/60 active:scale-[0.97]"
                                        >
                                            {isSaving
                                                ? <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                                : <Save className="w-3.5 h-3.5" />
                                            }
                                            {isSaving ? 'Saving…' : 'Save Reflection'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {hasStrategy && (
                                        <div className="hidden sm:block">
                                            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border ${meta.cls}`}>
                                                {meta.icon} {order.strategy}
                                            </span>
                                        </div>
                                    )}

                                    {hasNotes ? (
                                        <div className="bg-primary/5 border border-primary/15 border-l-[3px] border-l-primary rounded-r-lg px-4 py-3">
                                            <p className="text-sm text-foreground/90 leading-relaxed">
                                                {order.notes}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="bg-background border border-dashed border-border rounded-xl p-5 text-center">
                                            <BookOpen className="w-6 h-6 text-text-muted mx-auto mb-2" />
                                            <p className="text-xs font-semibold text-text-secondary">
                                                Every elite trader journals every trade.
                                            </p>
                                            <button
                                                onClick={() => setIsEditing(true)}
                                                className="mt-2 text-xs font-bold text-primary hover:underline focus:outline-none"
                                            >
                                                Add yours →
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Sidebar Content ──────────────────────────────────────────────────────────

interface SidebarContentProps {
    stats: { total: number; withStrategy: number; withNotes: number; coverage: number };
    badge: { label: string; progressCls: string };
    metricItems: { label: string; val: string | number; icon: React.ReactNode; pct: number; barCls: string }[];
    strategies: string[];
    strategyCounts: Record<string, number>;
    search: string;           setSearch: (v: string) => void;
    filterType: 'All' | 'BUY' | 'SELL'; setFilterType: (v: 'All' | 'BUY' | 'SELL') => void;
    filterStrategy: string;   setFilterStrategy: (v: string) => void;
    onClose?: () => void;
    navigate: (path: string) => void;
}

const SidebarContent = ({
    stats, badge, metricItems, strategies, strategyCounts,
    search, setSearch, filterType, setFilterType, filterStrategy, setFilterStrategy,
    onClose, navigate,
}: SidebarContentProps) => (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">

        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-border flex-shrink-0">
            {onClose && (
                <button
                    onClick={onClose}
                    aria-label="Close filter panel"
                    className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-foreground transition-colors"
                >
                    <X className="w-3.5 h-3.5" /> Close
                </button>
            )}

            {/* Coverage hero */}
            <div className="mb-4 bg-primary/5 dark:bg-primary/10 border border-primary/15 dark:border-primary/20 rounded-xl p-4 text-center">
                <div className="text-2xl mb-1.5">{badge.label.split(' ').slice(-1)[0]}</div>
                <div className="text-[11px] font-bold text-primary bg-primary/10 border border-primary/20 px-3 py-1 rounded-full inline-flex items-center">
                    {badge.label}
                </div>
                <div className="mt-3">
                    <div className="text-2xl font-extrabold text-foreground">{stats.coverage}%</div>
                    <div className="text-[11px] font-semibold text-text-muted mt-0.5">Coverage Score</div>
                    <div className="mt-2 h-2.5 bg-muted rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-700 ${badge.progressCls}`}
                            style={{ width: `${stats.coverage}%` }}
                            role="progressbar"
                            aria-valuenow={stats.coverage}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label="Coverage score"
                        />
                    </div>
                </div>
            </div>

            {/* CTA */}
            <button
                onClick={() => { navigate('/practice'); onClose?.(); }}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-lg transition-all shadow-sm shadow-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/60 active:scale-[0.98]"
            >
                <Plus className="w-3.5 h-3.5" /> New Paper Trade
            </button>
        </div>

        {/* Metrics */}
        <div className="px-5 py-4 border-b border-border flex-shrink-0">
            <p className="text-[11px] font-black uppercase tracking-widest text-text-muted mb-3">
                Your Progress
            </p>
            <div className="grid grid-cols-3 gap-2">
                {metricItems.map(m => (
                    <div key={m.label as string}
                        className="bg-background rounded-lg p-2.5 border border-border text-center"
                    >
                        <div className="mb-1.5">{m.icon}</div>
                        <div className="text-base font-extrabold text-foreground">{m.val}</div>
                        <div className="text-[11px] font-medium text-text-muted mt-0.5 leading-tight">{m.label}</div>
                        <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${m.barCls}`} style={{ width: `${m.pct}%` }} />
                        </div>
                    </div>
                ))}
            </div>
        </div>

        {/* Filters */}
        <div className="px-5 py-4 space-y-4 flex-shrink-0">
            <p className="text-[11px] font-black uppercase tracking-widest text-text-muted">
                Filters
            </p>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Symbol, strategy, notes…"
                    aria-label="Search trades"
                    className="w-full h-9 pl-9 pr-8 text-xs font-medium bg-background border border-border rounded-lg text-foreground placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary transition-all"
                />
                {search && (
                    <button
                        onClick={() => setSearch('')}
                        aria-label="Clear search"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-foreground p-0.5"
                    >
                        <X className="w-3 h-3" />
                    </button>
                )}
            </div>

            {/* BUY / SELL / All toggle */}
            <div
                className="flex gap-1 bg-muted p-1 rounded-lg border border-border"
                role="group"
                aria-label="Filter by trade type"
            >
                {(['All', 'BUY', 'SELL'] as const).map(t => (
                    <button
                        key={t}
                        onClick={() => setFilterType(t)}
                        aria-pressed={filterType === t}
                        className={`flex-1 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all focus:outline-none focus:ring-2 focus:ring-inset ${
                            filterType === t
                                ? t === 'BUY'
                                    ? 'bg-success text-white shadow-sm focus:ring-success'
                                    : t === 'SELL'
                                        ? 'bg-danger text-white shadow-sm focus:ring-danger'
                                        : 'bg-primary text-white shadow-sm focus:ring-primary'
                                : 'text-text-secondary hover:text-foreground focus:ring-gray-300'
                        }`}
                    >
                        {t}
                    </button>
                ))}
            </div>

            {/* Strategy list */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-black uppercase tracking-widest text-text-muted">
                        Strategy
                    </span>
                    {filterStrategy !== 'All' && (
                        <button
                            onClick={() => setFilterStrategy('All')}
                            className="text-[11px] font-bold text-primary hover:underline focus:outline-none"
                        >
                            Clear
                        </button>
                    )}
                </div>
                <div className="space-y-0.5 max-h-56 overflow-y-auto custom-scrollbar">
                    {strategies.map(s => {
                        const sm = getMeta(s);
                        const active = filterStrategy === s;
                        const count = strategyCounts[s] || 0;
                        return (
                            <button
                                key={s}
                                onClick={() => { setFilterStrategy(s); onClose?.(); }}
                                aria-pressed={active}
                                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg transition-all text-left focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                                    active
                                        ? `${sm.cls} border font-bold`
                                        : 'text-text-secondary hover:bg-muted'
                                }`}
                            >
                                <span className="flex items-center gap-2 text-xs font-semibold">
                                    <span className="text-sm">{sm.icon}</span>
                                    <span>{s === 'All' ? 'All Strategies' : s}</span>
                                </span>
                                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md ${
                                    active ? 'bg-white/60 dark:bg-black/20' : 'text-text-muted'
                                }`}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    </div>
);

// ─── Main Page ────────────────────────────────────────────────────────────────

export const JournalPage = () => {
    const navigate = useNavigate();
    const { orders, fetchOrders, isOrdersLoading } = usePortfolioStore();

    const [search,         setSearch]         = useState('');
    const [filterStrategy, setFilterStrategy] = useState('All');
    const [filterType,     setFilterType]     = useState<'All' | 'BUY' | 'SELL'>('All');
    const [sidebarOpen,    setSidebarOpen]    = useState(false);

    useEffect(() => { fetchOrders(200); }, []);

    // ESC closes drawer
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, []);

    // Lock body scroll when drawer is open
    useEffect(() => {
        document.body.style.overflow = sidebarOpen ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [sidebarOpen]);

    const executedOrders = useMemo(() => orders.filter(o => o.status === 'EXECUTED'), [orders]);

    const strategyCounts = useMemo(() => {
        const counts: Record<string, number> = { All: executedOrders.length };
        executedOrders.forEach(o => {
            if (o.strategy) counts[o.strategy] = (counts[o.strategy] || 0) + 1;
        });
        return counts;
    }, [executedOrders]);

    const strategies = useMemo(() => {
        const set = new Set<string>(['All']);
        executedOrders.forEach(o => { if (o.strategy) set.add(o.strategy); });
        return Array.from(set);
    }, [executedOrders]);

    const filtered = useMemo(() => executedOrders
        .filter(o => filterType === 'All' || o.type === filterType)
        .filter(o => filterStrategy === 'All' || o.strategy === filterStrategy)
        .filter(o => {
            if (!search) return true;
            const q = search.toLowerCase();
            return (
                o.symbol?.toLowerCase().includes(q) ||
                o.strategy?.toLowerCase().includes(q) ||
                o.notes?.toLowerCase().includes(q)
            );
        }),
    [executedOrders, filterType, filterStrategy, search]);

    const stats = useMemo(() => {
        const ws = executedOrders.filter(o => o.strategy && o.strategy !== 'Uncategorized');
        const wn = executedOrders.filter(o => o.notes?.trim());
        return {
            total:        executedOrders.length,
            withStrategy: ws.length,
            withNotes:    wn.length,
            coverage:     executedOrders.length > 0
                ? Math.round((ws.length / executedOrders.length) * 100)
                : 0,
        };
    }, [executedOrders]);

    const grouped = useMemo(() => {
        const g: Record<string, Order[]> = {};
        filtered.forEach(o => {
            const key = new Date(o.created_at || '').toLocaleDateString('en-IN', {
                weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
            });
            if (!g[key]) g[key] = [];
            g[key].push(o);
        });
        return Object.entries(g);
    }, [filtered]);

    // Badge uses only primary/success tokens — no hardcoded amber
    const badge = stats.coverage >= 80
        ? { label: 'Elite Logger 🏆',    progressCls: 'bg-success' }
        : stats.coverage >= 50
            ? { label: 'Consistent ⚡',    progressCls: 'bg-primary' }
            : stats.coverage > 0
                ? { label: 'Active Starter ✍️', progressCls: 'bg-primary/60' }
                : { label: 'Just Starting 📔', progressCls: 'bg-text-muted' };

    const metricItems = [
        {
            label: 'Trades',
            val:   stats.total,
            icon:  <BarChart3 className="w-4 h-4 text-primary mx-auto" />,
            pct:   100,
            barCls: 'bg-primary',
        },
        {
            label: 'Tagged',
            val:   stats.withStrategy,
            icon:  <Zap className="w-4 h-4 text-primary/70 mx-auto" />,
            pct:   stats.total > 0 ? Math.round((stats.withStrategy / stats.total) * 100) : 0,
            barCls: 'bg-primary/70',
        },
        {
            label: 'Noted',
            val:   stats.withNotes,
            icon:  <PenLine className="w-4 h-4 text-primary/50 mx-auto" />,
            pct:   stats.total > 0 ? Math.round((stats.withNotes / stats.total) * 100) : 0,
            barCls: 'bg-primary/50',
        },
    ];

    const activeFilterCount =
        (search ? 1 : 0) +
        (filterType !== 'All' ? 1 : 0) +
        (filterStrategy !== 'All' ? 1 : 0);

    const sidebarProps: SidebarContentProps = {
        stats, badge, metricItems, strategies, strategyCounts,
        search, setSearch, filterType, setFilterType, filterStrategy, setFilterStrategy,
        navigate,
    };

    return (
        <div className="h-screen bg-background flex flex-col overflow-hidden text-foreground">
            <div className="flex-none"><Navbar /></div>

            <div className="flex-1 flex overflow-hidden">

                {/* ── DESKTOP SIDEBAR ──────────────────────────────────── */}
                <aside className="hidden lg:flex w-80 flex-shrink-0 border-r border-border bg-card flex-col">
                    <SidebarContent {...sidebarProps} />
                </aside>

                {/* ── MOBILE DRAWER ────────────────────────────────────── */}
                {sidebarOpen && (
                    <>
                        <div
                            className="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
                            onClick={() => setSidebarOpen(false)}
                            aria-hidden="true"
                        />
                        <div
                            className="lg:hidden fixed inset-y-0 left-0 z-50 w-80 bg-card border-r border-border shadow-xl"
                            role="dialog"
                            aria-modal="true"
                            aria-label="Filter panel"
                        >
                            <SidebarContent {...sidebarProps} onClose={() => setSidebarOpen(false)} />
                        </div>
                    </>
                )}

                {/* ── MAIN CONTENT ─────────────────────────────────────── */}
                <main className="flex-1 flex flex-col overflow-hidden">

                    {/* Mobile sticky filter bar */}
                    <div className="lg:hidden flex-none flex items-center gap-3 px-4 py-2.5 bg-card/90 backdrop-blur-sm border-b border-border sticky top-0 z-30">
                        <button
                            onClick={() => setSidebarOpen(true)}
                            aria-label="Open filters"
                            className="flex items-center gap-2 px-3 py-1.5 bg-muted hover:bg-muted/80 rounded-lg text-xs font-bold text-text-secondary transition-colors focus:outline-none focus:ring-2 focus:ring-primary/60"
                        >
                            <FilterIcon className="w-3.5 h-3.5" />
                            Filters
                            {activeFilterCount > 0 && (
                                <span className="bg-primary text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
                                    {activeFilterCount}
                                </span>
                            )}
                        </button>

                        {/* Active filter pills */}
                        <div className="flex-1 flex items-center gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                            {filterType !== 'All' && (
                                <span className="flex-shrink-0 flex items-center gap-1 text-[10px] font-bold px-2 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full">
                                    {filterType}
                                    <button onClick={() => setFilterType('All')} aria-label={`Remove ${filterType} filter`}>
                                        <X className="w-2.5 h-2.5" />
                                    </button>
                                </span>
                            )}
                            {filterStrategy !== 'All' && (
                                <span className="flex-shrink-0 flex items-center gap-1 text-[10px] font-bold px-2 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full truncate max-w-[120px]">
                                    {filterStrategy}
                                    <button onClick={() => setFilterStrategy('All')} aria-label={`Remove ${filterStrategy} filter`}>
                                        <X className="w-2.5 h-2.5" />
                                    </button>
                                </span>
                            )}
                            {search && (
                                <span className="flex-shrink-0 flex items-center gap-1 text-[10px] font-bold px-2 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full truncate max-w-[120px]">
                                    "{search}"
                                    <button onClick={() => setSearch('')} aria-label="Clear search">
                                        <X className="w-2.5 h-2.5" />
                                    </button>
                                </span>
                            )}
                        </div>

                        <span className="flex-shrink-0 text-[11px] font-semibold text-text-muted">
                            {filtered.length} trade{filtered.length !== 1 ? 's' : ''}
                        </span>
                    </div>

                    {/* Timeline area */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar px-4 sm:px-6 py-6">
                        <div className="max-w-3xl mx-auto space-y-6">

                            {/* Loading skeletons */}
                            {isOrdersLoading && (
                                <div className="space-y-3">
                                    {[1, 2, 3].map(i => (
                                        <div
                                            key={i}
                                            className="bg-card border border-border rounded-xl h-[72px] animate-pulse"
                                        />
                                    ))}
                                </div>
                            )}

                            {/* Empty state */}
                            {!isOrdersLoading && grouped.length === 0 && (
                                <div className="bg-card border border-border rounded-2xl p-12 text-center">
                                    <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
                                        <BookMarked className="w-8 h-8 text-primary" />
                                    </div>
                                    <h3 className="text-base font-bold text-foreground mb-2">
                                        {activeFilterCount > 0 ? 'No matching trades' : 'Your trading journal is empty'}
                                    </h3>
                                    <p className="text-sm text-text-secondary max-w-xs mx-auto leading-relaxed mb-6">
                                        {activeFilterCount > 0
                                            ? 'No trades match your current filters. Try adjusting or clearing them.'
                                            : "Top traders journal 100% of trades. It's how patterns become profits."}
                                    </p>
                                    {activeFilterCount > 0 ? (
                                        <button
                                            onClick={() => { setSearch(''); setFilterStrategy('All'); setFilterType('All'); }}
                                            className="px-4 py-2 text-sm font-semibold text-text-secondary bg-muted hover:bg-muted/80 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary/60"
                                        >
                                            Clear all filters
                                        </button>
                                    ) : (
                                        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                                            <button
                                                onClick={() => navigate('/practice')}
                                                className="px-5 py-2.5 text-sm font-bold text-white bg-primary hover:bg-primary-dark rounded-lg transition-all shadow-sm shadow-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/60 active:scale-[0.97]"
                                            >
                                                Start Paper Trading
                                            </button>
                                            <button
                                                onClick={() => navigate('/advisor')}
                                                className="text-sm font-semibold text-text-secondary hover:text-primary transition-colors hover:underline underline-offset-2 focus:outline-none"
                                            >
                                                How to use the journal
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Timeline */}
                            {!isOrdersLoading && grouped.length > 0 && (
                                <div className="relative sm:pl-7">
                                    {/* Timeline line */}
                                    <div className="hidden sm:block absolute left-[11px] top-3 bottom-3 w-px bg-gradient-to-b from-primary/50 via-primary/20 to-transparent" />

                                    {grouped.map(([date, dayOrders]) => (
                                        <div key={date} className="relative mb-10 last:mb-0">
                                            {/* Dot */}
                                            <div className="hidden sm:block absolute -left-[20px] top-1.5 w-4 h-4 rounded-full bg-primary border-2 border-white dark:border-slate-900 shadow-sm ring-4 ring-primary/15" />

                                            {/* Date header */}
                                            <div className="flex items-center gap-3 mb-4">
                                                <span className="text-xs font-semibold text-text-secondary bg-card border border-border px-3 py-1.5 rounded-full leading-none">
                                                    {date}
                                                </span>
                                                <span className="text-xs text-text-muted font-medium">
                                                    {dayOrders.length} {dayOrders.length === 1 ? 'trade' : 'trades'}
                                                </span>
                                            </div>

                                            {/* Cards */}
                                            <div className="space-y-3">
                                                {dayOrders.map(o => <JournalEntry key={o.id} order={o} />)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Coverage nudge — uses primary/warning tokens only */}
                            {!isOrdersLoading && stats.total > 0 && stats.coverage < 100 && (
                                <div className="flex items-start sm:items-center gap-4 bg-primary/5 dark:bg-primary/8 border border-primary/20 rounded-xl p-4">
                                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5 sm:mt-0">
                                        <AlertCircle className="w-4 h-4 text-primary" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-foreground">
                                            Tag {stats.total - stats.withStrategy} untagged{' '}
                                            {stats.total - stats.withStrategy === 1 ? 'trade' : 'trades'}
                                        </p>
                                        <p className="text-xs text-text-secondary mt-0.5 font-medium">
                                            You're at <strong className="text-primary">{stats.coverage}%</strong> coverage. Tagging strategies unlocks pattern analytics.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => { setFilterStrategy('All'); setFilterType('All'); setSearch(''); }}
                                        className="flex-shrink-0 px-3.5 py-2 bg-primary hover:bg-primary-dark text-white text-xs font-bold rounded-lg transition-all shadow-sm shadow-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/60 active:scale-[0.97]"
                                    >
                                        Tag Now →
                                    </button>
                                </div>
                            )}

                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};
