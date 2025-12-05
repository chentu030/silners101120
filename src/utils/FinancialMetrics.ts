import type { FundHistoryPoint } from '../services/FundDataService';

export interface FinancialMetrics {
    roi1M: number | null;
    roi3M: number | null;
    roi6M: number | null;
    roi1Y: number | null;
    roi2Y: number | null;
    volatility: number | null; // Annualized Standard Deviation
    sharpeRatio: number | null; // Assuming risk-free rate is 0 for simplicity, or we can pass it
    maxDrawdown: number | null;
}

export const calculateMetrics = (data: FundHistoryPoint[]): FinancialMetrics => {
    if (data.length === 0) {
        return {
            roi1M: null, roi3M: null, roi6M: null, roi1Y: null, roi2Y: null,
            volatility: null, sharpeRatio: null, maxDrawdown: null
        };
    }

    const sortedData = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const latest = sortedData[sortedData.length - 1];
    const latestDate = new Date(latest.date);

    const getROI = (months: number) => {
        const targetDate = new Date(latestDate);
        targetDate.setMonth(targetDate.getMonth() - months);

        // Find closest data point on or before target date
        let closest = null;
        for (let i = sortedData.length - 1; i >= 0; i--) {
            const d = new Date(sortedData[i].date);
            if (d <= targetDate) {
                closest = sortedData[i];
                break;
            }
        }

        if (!closest) return null;
        return ((latest.value - closest.value) / closest.value) * 100;
    };

    // Calculate Daily Returns for Volatility
    const dailyReturns = [];
    for (let i = 1; i < sortedData.length; i++) {
        const prev = sortedData[i - 1].value;
        const curr = sortedData[i].value;
        dailyReturns.push((curr - prev) / prev);
    }

    // Annualized Volatility
    let volatility = null;
    if (dailyReturns.length > 0) {
        const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
        const variance = dailyReturns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / dailyReturns.length;
        // Annualize (assuming 252 trading days)
        volatility = Math.sqrt(variance) * Math.sqrt(252) * 100;
    }

    // Sharpe Ratio (Assuming Risk Free Rate = 1% for now, or 0)
    // Sharpe = (Rp - Rf) / Sigma_p
    // Using annualized return and volatility
    let sharpeRatio = null;
    const roi1Y = getROI(12);
    if (roi1Y !== null && volatility !== null && volatility !== 0) {
        const rf = 1; // 1% risk free rate
        sharpeRatio = (roi1Y - rf) / volatility;
    }

    // Max Drawdown
    let maxDrawdown = 0;
    let peak = sortedData[0].value;
    for (const point of sortedData) {
        if (point.value > peak) peak = point.value;
        const drawdown = (peak - point.value) / peak;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    return {
        roi1M: getROI(1),
        roi3M: getROI(3),
        roi6M: getROI(6),
        roi1Y: roi1Y,
        roi2Y: getROI(24),
        volatility,
        sharpeRatio,
        maxDrawdown: maxDrawdown * 100 // Convert to percentage
    };
};
