import { CheckCircle, AlertOctagon } from 'lucide-react';

interface TradeSuccessMessageProps {
    symbol: string;
    side: 'BUY' | 'SELL';
    quantity: number;
    status?: string;
    onClose: () => void;
}

export const TradeSuccessMessage = ({ symbol, side, quantity, status = 'EXECUTED', onClose }: TradeSuccessMessageProps) => {
    const isFailed = status === 'FAILED';

    return (
        <div className="bg-surface rounded-lg p-4 flex flex-col items-center justify-center text-center space-y-2.5">
            {isFailed ? (
                <>
                    <div className="w-12 h-12 bg-red-500/10 dark:bg-red-500/20 rounded-full flex items-center justify-center mb-1">
                        <AlertOctagon className="w-6 h-6 text-red-500" />
                    </div>
                    <h3 className="text-base font-bold text-red-500">Order Failed</h3>
                    <p className="text-text-secondary text-xs leading-relaxed max-w-xs mx-auto">
                        Your {side.toLowerCase()} order for {quantity} {symbol} failed because standard market hours are currently closed.
                    </p>
                </>
            ) : (
                <>
                    <div className="w-12 h-12 bg-success/20 rounded-full flex items-center justify-center mb-1">
                        <CheckCircle className="w-6 h-6 text-success" />
                    </div>
                    <h3 className="text-base font-bold text-text-primary">Order Placed!</h3>
                    <p className="text-text-secondary text-xs">
                        Your {side} order for {quantity} {symbol} has been executed.
                    </p>
                </>
            )}
            <button
                onClick={onClose}
                className="mt-2 px-5 py-1.5 bg-surface-hover hover:bg-surface-active text-text-primary rounded transition text-xs font-semibold"
            >
                Done
            </button>
        </div>
    );
};
