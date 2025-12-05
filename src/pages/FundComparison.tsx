import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    TimeScale
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { fundDataService } from '../services/FundDataService';
import type { FundHistory, FundBasicInfo, FundFee } from '../services/FundDataService';
import './FundComparison.scss';
import { X, Eye, EyeOff, FileText, BarChart2 } from 'lucide-react';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    TimeScale
);

interface FundComparisonProps {
    selectedFunds: FundBasicInfo[];
    setSelectedFunds: (funds: FundBasicInfo[]) => void;
    startDate: string;
    endDate: string;
    alignment: 'price' | 'percentage';
    setAlignment: (val: 'price' | 'percentage') => void;
}

interface FundMetrics {
    roi1M: number | null;
    roi3M: number | null;
    roi6M: number | null;
    roi1Y: number | null;
    roi2Y: number | null;
    roiYTD: number | null;
    volatility: number | null;
    sharpeRatio: number | null;
    sortinoRatio: number | null;
    maxDrawdown: number | null;
    winRate: number | null;
}



// Hover data type
interface HoverData {
    date: string;
    values: { fundId: string; shortName: string; dataType: string; label: string; value: number; color: string }[];
}

interface DetailedMetrics {
    positiveMonths: number;
    negativeMonths: number;
    annualizedReturn: number | null;
    annualizedVolatility: number | null;
    annualizedDownsideDeviation: number | null;
    maxDrawdown: number | null;
    monthlyVaR95: number | null;
    monthlyCVaR95: number | null;
    sharpeRatio: number | null;
    sortinoRatio: number | null;
    calmarRatio: number | null;
    skewness: number | null;
    kurtosis: number | null;
    profitFactor: number | null;
    avgMonthlyGain: number | null;
    avgMonthlyLoss: number | null;
}

// --- Statistical Helper Functions ---

const calculateDetailedStats = (data: { date: string; value: number }[]): DetailedMetrics | null => {
    if (data.length < 30) return null;

    // 1. Resample to Monthly
    // Group by Year-Month, take the last value of each month
    const monthlyMap = new Map<string, number>();
    const sortedData = [...data].sort((a, b) => {
        const da = new Date(a.date.split('/').map(Number) as [number, number, number] | any); // quick parse assuming yyyy/mm/dd
        const db = new Date(b.date.split('/').map(Number) as [number, number, number] | any);
        return da.getTime() - db.getTime();
    });

    // Helper to parse "yyyy/mm/dd"
    const parseDate = (d: string) => {
        const parts = d.split('/');
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    };

    // Sort by date object
    sortedData.sort((a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime());

    sortedData.forEach(d => {
        const date = parseDate(d.date);
        const key = `${date.getFullYear()}-${date.getMonth()}`; // e.g. "2023-0" for Jan
        monthlyMap.set(key, d.value); // Overwrite, so last one stays
    });

    const monthlyValues = Array.from(monthlyMap.values());
    const monthlyReturns: number[] = [];
    for (let i = 1; i < monthlyValues.length; i++) {
        monthlyReturns.push((monthlyValues[i] - monthlyValues[i - 1]) / monthlyValues[i - 1]);
    }

    // Also need Daily Returns for some stats (Vol, Sharpe, Sortino are usually daily annualized)
    // But request asks for "Year Stats" in context of comparison table. 
    // The "Annualized Volatility" in the example (34.02%) matches Daily Volatility * sqrt(252).
    // So sticking to DAILY for Vol, Sharpe, Sortino. 
    // MONTHLY for VaR, CVaR, Skew, Kurtosis, Profit Factor.

    const dailyReturns: number[] = [];
    for (let i = 1; i < sortedData.length; i++) {
        dailyReturns.push((sortedData[i].value - sortedData[i - 1].value) / sortedData[i - 1].value);
    }

    // --- Calculations ---

    // Basic
    const positiveMonths = monthlyReturns.filter(r => r > 0).length;
    const negativeMonths = monthlyReturns.filter(r => r < 0).length;

    // Annualized Return (CAGR)
    const totalYears = (parseDate(sortedData[sortedData.length - 1].date).getTime() - parseDate(sortedData[0].date).getTime()) / (1000 * 3600 * 24 * 365.25);
    const totalReturn = (sortedData[sortedData.length - 1].value - sortedData[0].value) / sortedData[0].value;
    const annualizedReturn = Math.pow(1 + totalReturn, 1 / totalYears) - 1;

    // Volatility (Daily Annualized)
    const meanDaily = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const varDaily = dailyReturns.reduce((a, b) => a + Math.pow(b - meanDaily, 2), 0) / dailyReturns.length;
    const annualizedVolatility = Math.sqrt(varDaily) * Math.sqrt(252);

    // Downside Deviation (Daily Annualized for Sortino) - Need to match typical definition
    // Note: The user prompt asked for "Annualized Downside Deviation (%)" in the Risk Metrics section. 
    // Usually matched with Sortino.

    const sumSqNegDaily = dailyReturns.reduce((acc, r) => r < 0 ? acc + r * r : acc, 0); // Target=0
    const downsideDevDaily = Math.sqrt(sumSqNegDaily / dailyReturns.length) * Math.sqrt(252);

    // Max Drawdown
    let maxDD = 0;
    let peak = sortedData[0].value;
    for (const d of sortedData) {
        if (d.value > peak) peak = d.value;
        const dd = (d.value - peak) / peak;
        if (dd < maxDD) maxDD = dd;
    }

    // Monthly VaR 95% (5th percentile)
    const sortedMonthlyReturns = [...monthlyReturns].sort((a, b) => a - b);
    const index95 = Math.floor(monthlyReturns.length * 0.05);
    const monthlyVaR95 = sortedMonthlyReturns[index95] || 0;

    // Monthly CVaR 95%
    const tailReturns = sortedMonthlyReturns.slice(0, index95 + 1); // +1 to include the VaR point or just below? Usually below.
    // If index is 0, just take the first one.
    const effectiveTail = tailReturns.length > 0 ? tailReturns : [monthlyVaR95];
    const monthlyCVaR95 = effectiveTail.reduce((a, b) => a + b, 0) / effectiveTail.length;

    // Risk Free Rate
    const rf = 0.012; // 1.2%

    // Sharpe (using annualized daily stats)
    const sharpeRatio = annualizedVolatility > 0 ? (annualizedReturn - rf) / annualizedVolatility : 0;

    // Sortino (using annualized daily stats)
    const sortinoRatio = downsideDevDaily > 0 ? (annualizedReturn - rf) / downsideDevDaily : 0;

    // Calmar Ratio
    const calmarRatio = maxDD < 0 ? annualizedReturn / Math.abs(maxDD) : 0;

    // Distribution (Monthly)
    // Skewness = E[((x-mu)/sigma)^3]
    const meanMonthly = monthlyReturns.reduce((a, b) => a + b, 0) / monthlyReturns.length;
    const stdMonthly = Math.sqrt(monthlyReturns.reduce((a, b) => a + Math.pow(b - meanMonthly, 2), 0) / monthlyReturns.length);

    let skewnessSum = 0;
    let kurtosisSum = 0;
    monthlyReturns.forEach(r => {
        skewnessSum += Math.pow((r - meanMonthly) / stdMonthly, 3);
        kurtosisSum += Math.pow((r - meanMonthly) / stdMonthly, 4);
    });
    const skewness = skewnessSum / monthlyReturns.length;
    const kurtosis = (kurtosisSum / monthlyReturns.length) - 3; // Excess Kurtosis

    // Profit Factor (Gross Gain / |Gross Loss|) - using Monthly or Daily?
    // "赚的总金额是赔的总金额的几倍" - usually trade by trade. Here monthly is a good proxy for "periodic outcome".
    // Using Monthly returns sum
    const grossGain = monthlyReturns.filter(r => r > 0).reduce((a, b) => a + b, 0);
    const grossLoss = Math.abs(monthlyReturns.filter(r => r < 0).reduce((a, b) => a + b, 0));
    const profitFactor = grossLoss > 0 ? grossGain / grossLoss : grossGain > 0 ? 999 : 0;

    // Avg Monthly Gain/Loss
    const posMonths = monthlyReturns.filter(r => r > 0);
    const negMonths = monthlyReturns.filter(r => r < 0);
    const avgMonthlyGain = posMonths.length > 0 ? posMonths.reduce((a, b) => a + b, 0) / posMonths.length : 0;
    const avgMonthlyLoss = negMonths.length > 0 ? negMonths.reduce((a, b) => a + b, 0) / negMonths.length : 0;

    return {
        positiveMonths,
        negativeMonths,
        annualizedReturn: annualizedReturn * 100,
        annualizedVolatility: annualizedVolatility * 100,
        annualizedDownsideDeviation: downsideDevDaily * 100,
        maxDrawdown: maxDD * 100,
        monthlyVaR95: monthlyVaR95 * 100,
        monthlyCVaR95: monthlyCVaR95 * 100,
        sharpeRatio,
        sortinoRatio,
        calmarRatio,
        skewness,
        kurtosis,
        profitFactor,
        avgMonthlyGain: avgMonthlyGain * 100,
        avgMonthlyLoss: avgMonthlyLoss * 100
    };
};

// Helper function to detect stock splits and adjust historical data
// Only detects ONE split - looks for a sharp drop that matches a known split ratio
function adjustForStockSplits(data: { date: string; value: number }[]): { date: string; value: number }[] {
    if (data.length < 2) return data;

    // Filter out invalid values (0, negative, or very small values)
    const validData = data.filter(d => d.value > 1);
    if (validData.length < 2) return data;

    // Helper to parse date string to Date object
    const parseDate = (dateStr: string): Date => {
        const parts = dateStr.split('/');
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    };

    // Sort by date ascending using Date objects
    const sorted = [...validData].sort((a, b) => {
        return parseDate(a.date).getTime() - parseDate(b.date).getTime();
    });

    // Build a map of date -> adjusted value for the result
    const dateValueMap = new Map(sorted.map(d => [d.date, d.value]));

    const splitRatios = [
        { ratio: 2, minDrop: 0.48, maxDrop: 0.52 },  // 1:2 = 50%
        { ratio: 3, minDrop: 0.64, maxDrop: 0.68 },  // 1:3 = 66.7%
        { ratio: 4, minDrop: 0.73, maxDrop: 0.77 },  // 1:4 = 75%
        { ratio: 5, minDrop: 0.78, maxDrop: 0.82 },  // 1:5 = 80%
        { ratio: 10, minDrop: 0.88, maxDrop: 0.92 }, // 1:10 = 90%
    ];

    let bestSplit: { index: number; ratio: number; preSplitValue: number; date1: string; date2: string } | null = null;

    for (let i = 0; i < sorted.length - 1; i++) {
        const currentValue = sorted[i].value;
        const nextValue = sorted[i + 1].value;
        const currentDate = parseDate(sorted[i].date);
        const nextDate = parseDate(sorted[i + 1].date);

        // Calculate days between data points
        const daysDiff = Math.abs((nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));

        // Skip if dates are too far apart (more than 14 days) - indicates data gap, not real split
        if (daysDiff > 14) continue;

        // Both values must be reasonable (> 10 to avoid noise)
        if (currentValue < 10 || nextValue < 10) continue;

        const dropRatio = 1 - (nextValue / currentValue);

        // Must be a significant drop (at least 40%)
        if (dropRatio < 0.40) continue;

        // Check if this matches a known split pattern
        for (const split of splitRatios) {
            if (dropRatio >= split.minDrop && dropRatio <= split.maxDrop) {
                // Additional validation: the ratio of values should match the split ratio closely
                const actualRatio = currentValue / nextValue;
                const expectedRatio = split.ratio;
                const ratioError = Math.abs(actualRatio - expectedRatio) / expectedRatio;

                // Only accept if the ratio is within 15% of expected
                if (ratioError > 0.15) continue;

                // Keep the split with the highest pre-split value (most significant)
                if (!bestSplit || currentValue > bestSplit.preSplitValue) {
                    bestSplit = {
                        index: i,
                        ratio: split.ratio,
                        preSplitValue: currentValue,
                        date1: sorted[i].date,
                        date2: sorted[i + 1].date
                    };
                    console.log(`[Split Detection] Found 1:${split.ratio} split at ${sorted[i].date} -> ${sorted[i + 1].date} (${daysDiff.toFixed(0)} days apart)`);
                    console.log(`  Values: ${currentValue.toFixed(2)} -> ${nextValue.toFixed(2)}, drop: ${(dropRatio * 100).toFixed(1)}%`);
                }
                break;
            }
        }
    }

    // Apply adjustment to the result
    if (bestSplit) {
        console.log(`[Split Detection] Applying 1:${bestSplit.ratio} adjustment to all dates before ${bestSplit.date2}`);
        // Divide all values at or before the split index
        for (let j = 0; j <= bestSplit.index; j++) {
            const adjustedValue = sorted[j].value / bestSplit.ratio;
            dateValueMap.set(sorted[j].date, adjustedValue);
        }
    } else {
        console.log('[Split Detection] No valid split detected');
    }

    // Return adjusted data maintaining original order
    return data.map(d => ({
        date: d.date,
        value: dateValueMap.get(d.date) ?? d.value
    }));
}

const FundComparison: React.FC<FundComparisonProps> = ({
    selectedFunds,
    setSelectedFunds,
    startDate,
    endDate,
    alignment,
    setAlignment,
}) => {
    const [fundHistory, setFundHistory] = useState<FundHistory[]>([]);
    const [fundFees, setFundFees] = useState<Map<string, FundFee>>(new Map());
    const [loading, setLoading] = useState<boolean>(false);
    const [activeTab, setActiveTab] = useState<'performance' | 'basic'>('performance');
    const [adjustForSplits, setAdjustForSplits] = useState<boolean>(false);
    const [hoverData, setHoverData] = useState<HoverData | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const [showDescription, setShowDescription] = useState<boolean>(true);
    const chartRef = useRef<any>(null);

    // Fetch data when selected funds change
    useEffect(() => {
        const fetchData = async () => {
            if (selectedFunds.length === 0) {
                setFundHistory([]);
                return;
            }

            setLoading(true);
            try {
                const results: FundHistory[] = [];

                // Group by type to optimize fetching
                const netFunds = selectedFunds.filter(f => f.dataType === '淨值');
                const marketPriceFunds = selectedFunds.filter(f => f.dataType === '市價');

                if (netFunds.length > 0) {
                    const netIds = netFunds.map(f => f.id);
                    const netHistory = await fundDataService.getFundHistory(
                        netIds, '淨值',
                        startDate.replace(/-/g, ''),
                        endDate ? endDate.replace(/-/g, '') : undefined
                    );
                    results.push(...netHistory);
                }

                if (marketPriceFunds.length > 0) {
                    const marketIds = marketPriceFunds.map(f => f.id);
                    const marketHistory = await fundDataService.getFundHistory(
                        marketIds, '市價',
                        startDate.replace(/-/g, ''),
                        endDate ? endDate.replace(/-/g, '') : undefined
                    );
                    results.push(...marketHistory);
                }

                setFundHistory(results);
            } catch (error) {
                console.error("Failed to load fund history", error);
            } finally {
                setLoading(false);
            }
        };

        const fetchFees = async () => {
            try {
                const fees = await fundDataService.getFundFees();
                setFundFees(fees);
            } catch (error) {
                console.error("Failed to load fund fees", error);
            }
        };

        fetchData();
        fetchFees();
    }, [selectedFunds, startDate, endDate]);

    // Calculate metrics
    const metricsMap = useMemo(() => {
        const map = new Map<string, FundMetrics>();

        fundHistory.forEach(fh => {
            const data = adjustForSplits ? adjustForStockSplits(fh.data) : fh.data;
            if (data.length < 2) return;

            // Sort by date for metrics calculation
            const parseDateValues = (dateStr: string) => {
                const parts = dateStr.split('/');
                return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            };

            const sortedData = [...data].sort((a, b) => {
                return parseDateValues(a.date).getTime() - parseDateValues(b.date).getTime();
            });

            const latestValue = sortedData[sortedData.length - 1].value;
            const latestDate = parseDateValues(sortedData[sortedData.length - 1].date);

            const getReturn = (months: number) => {
                const targetDate = new Date(latestDate);
                targetDate.setMonth(targetDate.getMonth() - months);

                // Find closest data point accurately using parseDateValues
                const point = sortedData.find(d => {
                    const dDate = parseDateValues(d.date);
                    return dDate >= targetDate;
                });

                if (point) {
                    return ((latestValue - point.value) / point.value) * 100;
                }
                return null;
            };

            // Calculate volatility, Sharpe, Sortino, Win Rate
            let volatility = null;
            let sharpeRatio = null;
            let sortinoRatio = null;
            let winRate = null;


            if (sortedData.length > 30) {
                const returns = [];
                let positiveDays = 0;
                let negativeReturnSumSq = 0;

                for (let i = 1; i < sortedData.length; i++) {
                    const dailyReturn = (sortedData[i].value - sortedData[i - 1].value) / sortedData[i - 1].value;
                    returns.push(dailyReturn);

                    if (dailyReturn > 0) positiveDays++;
                    if (dailyReturn < 0) negativeReturnSumSq += Math.pow(dailyReturn, 2);
                }

                const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
                const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;

                // Volatility (Annualized Standard Deviation)
                volatility = Math.sqrt(variance) * Math.sqrt(252) * 100;

                // Risk Free Rate = 1.2% (0.012)
                const annualizedReturn = mean * 252;
                const riskFreeRate = 0.012;

                // Sharpe Ratio
                if (volatility > 0) {
                    sharpeRatio = (annualizedReturn - riskFreeRate) / (volatility / 100);
                }

                // Sortino Ratio (uses Downside Deviation)
                // Downside Deviation = sqrt( sum(min(r - target, 0)^2) / N )
                // Using 0 as target return for downside risk
                const downsideVariance = negativeReturnSumSq / returns.length;
                const downsideDeviation = Math.sqrt(downsideVariance) * Math.sqrt(252); // Annualized

                if (downsideDeviation > 0) {
                    sortinoRatio = (annualizedReturn - riskFreeRate) / downsideDeviation;
                }

                // Win Rate (Daily)
                winRate = (positiveDays / returns.length) * 100;
            }

            // Calculate YTD
            const getYTD = () => {
                const currentYear = latestDate.getFullYear();
                const jan1 = new Date(currentYear, 0, 1);

                // Find first data point of the year or after
                const point = sortedData.find(d => {
                    const dDate = parseDateValues(d.date);
                    return dDate >= jan1;
                });

                if (point) {
                    return ((latestValue - point.value) / point.value) * 100;
                }
                return null;
            };

            // Calculate Max Drawdown
            let maxDrawdown = 0;
            let peak = sortedData[0].value; // Initial peak
            for (const d of sortedData) {
                if (d.value > peak) peak = d.value;
                const drawdown = (d.value - peak) / peak;
                if (drawdown < maxDrawdown) maxDrawdown = drawdown;
            }

            map.set(`${fh.fundId}-${fh.type}`, {
                roi1M: getReturn(1),
                roi3M: getReturn(3),
                roi6M: getReturn(6),
                roi1Y: getReturn(12),
                roi2Y: getReturn(24),
                roiYTD: getYTD(),
                volatility,
                sharpeRatio,
                sortinoRatio,
                maxDrawdown: maxDrawdown * 100,
                winRate
            });
        });

        return map;
        return map;
    }, [fundHistory, adjustForSplits]);

    // Calculate Detailed Statistics (Transposed view)
    const detailedStatsMap = useMemo(() => {
        const map = new Map<string, DetailedMetrics | null>();
        fundHistory.forEach(fh => {
            const data = adjustForSplits ? adjustForStockSplits(fh.data) : fh.data;
            const stats = calculateDetailedStats(data);
            map.set(`${fh.fundId}-${fh.type}`, stats);
        });
        return map;
    }, [fundHistory, adjustForSplits]);

    // Prepare chart data
    const chartData = useMemo(() => {
        if (fundHistory.length === 0) return { datasets: [] };

        const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

        // 1. Collect all unique dates from all funds
        const allDatesSet = new Set<number>();
        fundHistory.forEach(fh => {
            const dataToUse = adjustForSplits ? adjustForStockSplits(fh.data) : fh.data;
            dataToUse.forEach(d => {
                const parts = d.date.split('/');
                const time = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])).getTime();
                allDatesSet.add(time);
            });
        });
        const allDates = Array.from(allDatesSet).sort((a, b) => a - b);

        // Create datasets - interpolate missing values
        const datasets = fundHistory.map((fh, index) => {
            const fundInfo = selectedFunds.find(f => f.id === fh.fundId);
            const color = colors[index % colors.length];
            const dataToUse = adjustForSplits ? adjustForStockSplits(fh.data) : fh.data;

            // Create a map for quick lookup
            const dataMap = new Map<number, number>();
            dataToUse.forEach(d => {
                const parts = d.date.split('/');
                const time = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])).getTime();
                if (d.value > 0) dataMap.set(time, d.value);
            });

            // Generate data points for all dates, using forward fill
            let lastKnownValue: number | null = null;
            const dataPoints: { x: Date, y: number }[] = [];

            allDates.forEach(time => {
                if (dataMap.has(time)) {
                    lastKnownValue = dataMap.get(time)!;
                }

                if (lastKnownValue !== null) {
                    dataPoints.push({
                        x: new Date(time),
                        y: lastKnownValue
                    });
                }
            });

            // Handle percentage alignment
            if (alignment === 'percentage' && dataPoints.length > 0) {
                const initialValue = dataPoints[0].y;
                for (let i = 0; i < dataPoints.length; i++) {
                    dataPoints[i].y = ((dataPoints[i].y - initialValue) / initialValue) * 100;
                }
            }

            return {
                label: fundInfo ? `${fundInfo.name} (${fh.fundId})` : fh.fundId,
                data: dataPoints,
                borderColor: color,
                backgroundColor: color,
                tension: 0.1,
                pointRadius: 0,
                pointHoverRadius: 6,
            };
        });

        return { datasets };
    }, [fundHistory, selectedFunds, alignment, adjustForSplits]);

    const handleSort = (key: string) => {
        setSortConfig(current => {
            if (current?.key === key && current.direction === 'desc') {
                return { key, direction: 'asc' };
            }
            return { key, direction: 'desc' };
        });
    };

    const sortedFunds = useMemo(() => {
        if (!sortConfig) return selectedFunds;

        return [...selectedFunds].sort((a, b) => {
            if (sortConfig.key === 'fund') {
                const nameA = a.id + a.name;
                const nameB = b.id + b.name;
                if (sortConfig.direction === 'asc') return nameA.localeCompare(nameB);
                return nameB.localeCompare(nameA);
            }

            const key = sortConfig.key as keyof FundMetrics;
            const metricsA = metricsMap.get(`${a.id}-${a.dataType}`);
            const metricsB = metricsMap.get(`${b.id}-${b.dataType}`);

            const valueA = metricsA ? metricsA[key] : -Infinity;
            const valueB = metricsB ? metricsB[key] : -Infinity;

            // Handle null and missing values (push to bottom)
            if ((valueA === null || valueA === -Infinity) && (valueB === null || valueB === -Infinity)) return 0;
            if (valueA === null || valueA === -Infinity) return 1;
            if (valueB === null || valueB === -Infinity) return -1;

            if (valueA < valueB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valueA > valueB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [selectedFunds, metricsMap, sortConfig]);

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'nearest' as const,
            axis: 'x' as const,
            intersect: false,
        },
        onHover: (_event: any, elements: any[], chart: any) => {
            if (elements.length > 0) {
                const dataIndex = elements[0].index;
                const values: { fundId: string; shortName: string; dataType: string; label: string; value: number; color: string }[] = [];
                let dateStr = '';

                chart.data.datasets.forEach((dataset: any, dsIndex: number) => {
                    const point = dataset.data[dataIndex];
                    if (point) {
                        if (!dateStr) {
                            const d = point.x;
                            dateStr = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
                        }
                        // Get fund info correctly from fundHistory (dataset order matches fundHistory)
                        const historyItem = fundHistory[dsIndex];
                        const fund = selectedFunds.find(f => f.id === historyItem?.fundId && f.dataType === historyItem?.type);

                        const fundId = fund?.id || historyItem?.fundId || '';
                        const fullName = fund?.name || '';
                        // Shorten the name: take first 6 characters
                        const shortName = fullName.length > 6 ? fullName.substring(0, 6) : fullName;
                        const dataType = fund?.dataType || historyItem?.type || '';

                        values.push({
                            fundId,
                            shortName,
                            dataType,
                            label: fullName,
                            value: point.y,
                            color: dataset.borderColor
                        });
                    }
                });

                setHoverData({ date: dateStr, values });
            }
        },
        plugins: {
            legend: {
                position: 'top' as const,
                labels: { color: '#94a3b8' }
            },
            tooltip: {
                enabled: false
            }
        },
        scales: {
            x: {
                type: 'time' as const,
                time: {
                    unit: 'month' as const,
                    displayFormats: { month: 'yyyy/MM' }
                },
                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                ticks: { color: '#94a3b8' }
            },
            y: {
                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                ticks: { color: '#94a3b8' },
                title: {
                    display: true,
                    text: alignment === 'percentage' ? 'Return (%)' : 'Price',
                    color: '#94a3b8'
                }
            }
        }
    };

    return (
        <div className="fund-comparison">
            {/* Selected Funds Tags */}
            {selectedFunds.length > 0 && (
                <div className="selected-funds">
                    {selectedFunds.map(fund => (
                        <div key={`${fund.id}-${fund.dataType}`} className="fund-tag">
                            <span>{fund.name} ({fund.id})</span>
                            <span className={`data-type-badge ${fund.dataType === '淨值' ? 'net' : 'market'}`}>
                                {fund.dataType}
                            </span>
                            <button onClick={() => setSelectedFunds(selectedFunds.filter(f => !(f.id === fund.id && f.dataType === fund.dataType)))}>
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            )}



            {/* Tab Navigation */}
            <div className="tab-header">
                <button
                    className={`tab-btn ${activeTab === 'performance' ? 'active' : ''}`}
                    onClick={() => setActiveTab('performance')}
                >
                    <BarChart2 size={18} style={{ display: 'inline', marginRight: '6px', marginBottom: '-3px' }} />
                    Performance View
                </button>
                <button
                    className={`tab-btn ${activeTab === 'basic' ? 'active' : ''}`}
                    onClick={() => setActiveTab('basic')}
                >
                    <FileText size={18} style={{ display: 'inline', marginRight: '6px', marginBottom: '-3px' }} />
                    Basic Information
                </button>
            </div>

            {activeTab === 'performance' ? (
                <>
                    {/* Chart Section */}
                    <div className="chart-card">
                        {loading && <div className="loading-overlay">Loading Data...</div>}
                        <Line ref={chartRef} data={chartData} options={chartOptions} />
                    </div>

                    {/* Hover Info Bar - Fixed below chart */}
                    <div className="hover-info-bar">
                        {hoverData ? (
                            <>
                                <span className="hover-date">{hoverData.date}</span>
                                <div className="hover-values">
                                    {hoverData.values.map((v, i) => (
                                        <div key={i} className="hover-value-item">
                                            <div className="hover-line-1">
                                                <span className="hover-dot" style={{ backgroundColor: v.color }}></span>
                                                <span className="hover-fund-id">{v.fundId}</span>
                                                <span className="hover-short-name">{v.shortName}</span>
                                                <span className="hover-value">{v.value.toFixed(2)}{alignment === 'percentage' ? '%' : ''}</span>
                                                <span className={`hover-badge ${v.dataType === '淨值' ? 'net' : 'market'}`}>{v.dataType}</span>
                                            </div>
                                            <div className="hover-line-2">
                                                <span className="hover-full-name">{v.label}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <span className="hover-placeholder">將滑鼠移到圖表上查看數據</span>
                        )}
                    </div>

                    {/* Chart Controls */}
                    <div className="chart-controls">
                        <button
                            className={`toggle-btn ${alignment === 'percentage' ? 'active' : ''}`}
                            onClick={() => setAlignment('percentage')}
                        >
                            % Change
                        </button>
                        <button
                            className={`toggle-btn ${alignment === 'price' ? 'active' : ''}`}
                            onClick={() => setAlignment('price')}
                        >
                            Price
                        </button>
                        <span className="control-divider">|</span>
                        <button
                            className={`toggle-btn split-btn ${adjustForSplits ? 'active' : ''}`}
                            onClick={() => setAdjustForSplits(!adjustForSplits)}
                            title="自動偵測並調整股票拆分"
                        >
                            調整拆分
                        </button>
                    </div>

                    {/* Metrics Table */}
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th onClick={() => handleSort('fund')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                        Fund {sortConfig?.key === 'fund' && (sortConfig.direction === 'asc' ? ' ▲' : ' ▼')}
                                    </th>
                                    <th onClick={() => handleSort('roi1M')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                        1M {sortConfig?.key === 'roi1M' && (sortConfig.direction === 'asc' ? ' ▲' : ' ▼')}
                                    </th>
                                    <th onClick={() => handleSort('roi3M')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                        3M {sortConfig?.key === 'roi3M' && (sortConfig.direction === 'asc' ? ' ▲' : ' ▼')}
                                    </th>
                                    <th onClick={() => handleSort('roi6M')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                        6M {sortConfig?.key === 'roi6M' && (sortConfig.direction === 'asc' ? ' ▲' : ' ▼')}
                                    </th>
                                    <th onClick={() => handleSort('roiYTD')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                        YTD {sortConfig?.key === 'roiYTD' && (sortConfig.direction === 'asc' ? ' ▲' : ' ▼')}
                                    </th>
                                    <th onClick={() => handleSort('roi1Y')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                        1Y {sortConfig?.key === 'roi1Y' && (sortConfig.direction === 'asc' ? ' ▲' : ' ▼')}
                                    </th>
                                    <th onClick={() => handleSort('roi2Y')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                        2Y {sortConfig?.key === 'roi2Y' && (sortConfig.direction === 'asc' ? ' ▲' : ' ▼')}
                                    </th>
                                    <th onClick={() => handleSort('volatility')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                        Vol {sortConfig?.key === 'volatility' && (sortConfig.direction === 'asc' ? ' ▲' : ' ▼')}
                                    </th>
                                    <th onClick={() => handleSort('sharpeRatio')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                        Sharpe {sortConfig?.key === 'sharpeRatio' && (sortConfig.direction === 'asc' ? ' ▲' : ' ▼')}
                                    </th>
                                    <th onClick={() => handleSort('sortinoRatio')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                        Sortino {sortConfig?.key === 'sortinoRatio' && (sortConfig.direction === 'asc' ? ' ▲' : ' ▼')}
                                    </th>
                                    <th onClick={() => handleSort('winRate')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                        Win% {sortConfig?.key === 'winRate' && (sortConfig.direction === 'asc' ? ' ▲' : ' ▼')}
                                    </th>
                                    <th onClick={() => handleSort('maxDrawdown')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                        Max DD {sortConfig?.key === 'maxDrawdown' && (sortConfig.direction === 'asc' ? ' ▲' : ' ▼')}
                                    </th>
                                </tr>
                            </thead>

                            <tbody>
                                {sortedFunds.map((fund) => {
                                    const metrics = metricsMap.get(`${fund.id}-${fund.dataType}`);

                                    const getMetricDisplay = (val: number | null | undefined) => {
                                        if (val === undefined || val === null) return { value: '-', class: '' };
                                        return {
                                            value: `${val.toFixed(2)}%`,
                                            class: val >= 0 ? 'positive' : 'negative'
                                        };
                                    };

                                    const formatNumber = (val: number | null | undefined) => {
                                        if (val === undefined || val === null) return '-';
                                        return val.toFixed(2);
                                    };

                                    return (
                                        <tr key={`${fund.id}-${fund.dataType}`}>
                                            <td className="company-cell">
                                                <div className="name">{fund.name}</div>
                                                <div className="code">{fund.id}</div>
                                                {/* Added badge for clarity */}
                                                <span className={`fund-type-badge ${fund.dataType === '淨值' ? 'net' : 'market'}`} style={{ fontSize: '0.7em', padding: '1px 4px', borderRadius: '4px', marginLeft: '4px', background: fund.dataType === '淨值' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.1)', color: fund.dataType === '淨值' ? '#10b981' : '#3b82f6' }}>
                                                    {fund.dataType}
                                                </span>
                                            </td>
                                            <td className={`upside-cell ${getMetricDisplay(metrics?.roi1M).class}`}>
                                                {getMetricDisplay(metrics?.roi1M).value}
                                            </td>
                                            <td className={`upside-cell ${getMetricDisplay(metrics?.roi3M).class}`}>
                                                {getMetricDisplay(metrics?.roi3M).value}
                                            </td>
                                            <td className={`upside-cell ${getMetricDisplay(metrics?.roi6M).class}`}>
                                                {getMetricDisplay(metrics?.roi6M).value}
                                            </td>
                                            <td className={`upside-cell ${getMetricDisplay(metrics?.roiYTD).class}`}>
                                                {getMetricDisplay(metrics?.roiYTD).value}
                                            </td>
                                            <td className={`upside-cell ${getMetricDisplay(metrics?.roi1Y).class}`}>
                                                {getMetricDisplay(metrics?.roi1Y).value}
                                            </td>
                                            <td className={`upside-cell ${getMetricDisplay(metrics?.roi2Y).class}`}>
                                                {getMetricDisplay(metrics?.roi2Y).value}
                                            </td>
                                            <td className="volatility-cell">
                                                {formatNumber(metrics?.volatility)}{metrics?.volatility ? '%' : ''}
                                            </td>
                                            <td className="sharpe-cell">
                                                {formatNumber(metrics?.sharpeRatio)}
                                            </td>
                                            <td className="sharpe-cell">
                                                {formatNumber(metrics?.sortinoRatio)}
                                            </td>
                                            <td className="volatility-cell">
                                                {formatNumber(metrics?.winRate)}{metrics?.winRate ? '%' : ''}
                                            </td>
                                            <td className="drawdown-cell">
                                                {getMetricDisplay(metrics?.maxDrawdown).value}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Detailed Statistics Table (Transposed) */}
                    <div className="detailed-stats-header">
                        <h3 className="detailed-stats-title">Detailed Statistics</h3>
                        <button
                            className={`desc-toggle-btn ${showDescription ? 'active' : ''}`}
                            onClick={() => setShowDescription(!showDescription)}
                        >
                            {showDescription ? <EyeOff size={16} /> : <Eye size={16} />}
                            <span>{showDescription ? '隱藏指標說明' : '顯示指標說明'}</span>
                        </button>
                    </div>
                    <div className="table-container detailed-stats-table">
                        <table>
                            <thead>
                                <tr>
                                    <th className="sticky-col sticky-col-1">Category</th>
                                    <th className="sticky-col sticky-col-2">Item</th>
                                    {showDescription && <th className="desc-header">Description</th>}
                                    {sortedFunds.map(fund => (
                                        <th key={`${fund.id}-${fund.dataType}`}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                <span>{fund.name}</span>
                                                <span style={{ fontSize: '0.7em', opacity: 0.7 }}>{fund.dataType}</span>
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {[
                                    { category: '基本統計', item: '賺錢月數', desc: '總共有幾個月的報酬率是正的。', key: 'positiveMonths', format: 'number' },
                                    { category: '基本統計', item: '賠錢月數', desc: '總共有幾個月的報酬率是負的。', key: 'negativeMonths', format: 'number' },

                                    { category: '報酬率指標', item: '年化報酬率 (%)', desc: '平均每年賺多少%。將總成果換算成「平均每年賺多少%」，方便比較不同投資長度的表現。', key: 'annualizedReturn', format: 'percent' },

                                    { category: '風險指標', item: '年化波動率 (%)', desc: '開車時的「晃動指數」。衡量淨值上下起伏的劇烈程度，數字越高代表過程越顛簸。', key: 'annualizedVolatility', format: 'percent' },
                                    { category: '風險指標', item: '年化下行標準差 (%)', desc: '只算「掉進坑洞」的負面晃動指數。只計算賠錢月份的波動，更能反映令人不適的真實風險。', key: 'annualizedDownsideDeviation', format: 'percent' },
                                    { category: '風險指標', item: '最大回撤 (%)', desc: '從山頂到谷底的最大垂直距離。代表在最慘的情況下，帳戶從最高點最多回檔了多少%。', key: 'maxDrawdown', format: 'percent' },
                                    { category: '風險指標', item: '月 95% 風險價值 (VaR) (%)', desc: '天氣預報的「小雨警報」。告訴你有 95% 的機率，一個月內的虧損不會超過這個數字。', key: 'monthlyVaR95', format: 'percent' },
                                    { category: '風險指標', item: '月 95% 條件風險價值 (CVaR) (%)', desc: '天氣預報的「颱風警報」。萬一發生了那最慘的 5% 情況，預期的平均虧損會是多少。', key: 'monthlyCVaR95', format: 'percent' },

                                    { category: '風險調整後報酬', item: '夏普比率', desc: '投資的「CP值」。衡量承擔的「每一分總風險」，能換回多少超額報酬。數字越高越划算。', key: 'sharpeRatio', format: 'decimal' },
                                    { category: '風險調整後報酬', item: '索提諾比率', desc: '更懂老饕的「CP值」。只計算「下跌風險」的 CP 值，更能反映承擔壞風險所換來的回報。', key: 'sortinoRatio', format: 'decimal' },
                                    { category: '風險調整後報酬', item: '卡瑪比率', desc: '登山家的「爬升/跌落比」。年化報酬率與最大回撤的比值，衡量從逆境中恢復並創新高的能力。', key: 'calmarRatio', format: 'decimal' },

                                    { category: '報酬分佈特性', item: '偏度 (Skewness)', desc: '報酬的「幸運尾巴」長度。正數(>0)代表賺大錢的機會稍多；負數(<0)代表虧大錢的機會稍多。', key: 'skewness', format: 'decimal' },
                                    { category: '報酬分佈特性', item: '峰度 (Kurtosis)', desc: '出現「極端行情」的頻率。數字越高，代表暴漲或暴跌這種極端情況發生的機率越大。', key: 'kurtosis', format: 'decimal' },

                                    { category: '盈虧特性', item: '盈虧比 (Profit Factor)', desc: '拳擊手的「攻擊/受傷比」。賺的總金額是賠的總金額的幾倍？數字越高代表攻擊效率越高。', key: 'profitFactor', format: 'decimal' },
                                    { category: '盈虧特性', item: '平均月獲利 (%)', desc: '在賺錢的月份裡，平均一個月賺多少%。', key: 'avgMonthlyGain', format: 'percent' },
                                    { category: '盈虧特性', item: '平均月虧損 (%)', desc: '在賠錢的月份裡，平均一個月賠多少%。', key: 'avgMonthlyLoss', format: 'percent' },
                                ].map((row, index) => (
                                    <tr key={index}>
                                        <td className="category-cell sticky-col sticky-col-1">{row.category}</td>
                                        <td className="item-cell sticky-col sticky-col-2">{row.item}</td>
                                        {showDescription && <td className="desc-cell">{row.desc}</td>}
                                        {sortedFunds.map(fund => {
                                            const stats = detailedStatsMap.get(`${fund.id}-${fund.dataType}`);
                                            const val = stats ? (stats as any)[row.key] : null;

                                            let displayVal = '-';
                                            let cellClass = '';
                                            if (val !== null && val !== undefined) {
                                                if (row.format === 'percent') {
                                                    displayVal = `${val.toFixed(2)}%`;
                                                    // Color coding for percentages
                                                    if (row.key.includes('Drawdown') || row.key.includes('Loss') || row.key.includes('VaR')) {
                                                        // Negative is bad/red usually, but Drawdown is naturally negative
                                                        // Actually existing table uses red for negative.
                                                        cellClass = val >= 0 ? 'positive' : 'negative';
                                                    } else {
                                                        cellClass = val >= 0 ? 'positive' : 'negative';
                                                    }
                                                } else if (row.format === 'decimal') {
                                                    displayVal = val.toFixed(2);
                                                } else {
                                                    displayVal = val.toString();
                                                }
                                            }

                                            return (
                                                <td key={`${fund.id}-${fund.dataType}`} className={cellClass} style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                                                    {displayVal}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>


                </>
            ) : (
                <div className="table-container basic-info-table">
                    <table>
                        <thead>
                            <tr>
                                <th className="sticky-col sticky-col-1">Item</th>
                                {selectedFunds.map(fund => (
                                    <th key={`${fund.id}-${fund.dataType}`}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                            <span>{fund.name}</span>
                                            <span style={{ fontSize: '0.7em', opacity: 0.7 }}>{fund.dataType}</span>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {/* Basic Info Section */}
                            <tr className="section-header-row"><td colSpan={selectedFunds.length + 1}>基本資料</td></tr>
                            <tr>
                                <td className="label-cell">基金代碼</td>
                                {selectedFunds.map(fund => <td key={fund.id} className="value-cell">{fund.id}</td>)}
                            </tr>
                            <tr>
                                <td className="label-cell">經理公司</td>
                                {selectedFunds.map(fund => <td key={fund.id} className="value-cell">{fund.manager}</td>)}
                            </tr>
                            <tr>
                                <td className="label-cell">成立日期</td>
                                {selectedFunds.map(fund => <td key={fund.id} className="value-cell">{fund.inceptionDate || '-'}</td>)}
                            </tr>
                            <tr>
                                <td className="label-cell">計價幣別</td>
                                {selectedFunds.map(fund => <td key={fund.id} className="value-cell">{fund.currency || 'TWD'}</td>)}
                            </tr>
                            <tr>
                                <td className="label-cell">保管機構</td>
                                {selectedFunds.map(fund => <td key={fund.id} className="value-cell">{fund.custodian || '-'}</td>)}
                            </tr>
                            <tr>
                                <td className="label-cell">保證機構</td>
                                {selectedFunds.map(fund => <td key={fund.id} className="value-cell">{fund.guarantor || '-'}</td>)}
                            </tr>
                            <tr>
                                <td className="label-cell">風險等級</td>
                                {selectedFunds.map(fund => <td key={fund.id} className="value-cell">{fund.riskLevel}</td>)}
                            </tr>

                            {/* Fees Section */}
                            <tr className="section-header-row"><td colSpan={selectedFunds.length + 1}>費用與稅率</td></tr>
                            <tr>
                                <td className="label-cell">總費用率 (TER)</td>
                                {selectedFunds.map(fund => {
                                    const fee = fundFees.get(fund.id);
                                    return <td key={fund.id} className="value-cell">{fee?.totalExpenseRatio ? `${fee.totalExpenseRatio.toFixed(2)}%` : '-'}</td>
                                })}
                            </tr>
                            <tr>
                                <td className="label-cell">經理費</td>
                                {selectedFunds.map(fund => {
                                    const fee = fundFees.get(fund.id);
                                    return <td key={fund.id} className="value-cell">{fee?.managementFee ? `${fee.managementFee.toFixed(2)}%` : '-'}</td>
                                })}
                            </tr>
                            <tr>
                                <td className="label-cell">保管費</td>
                                {selectedFunds.map(fund => {
                                    const fee = fundFees.get(fund.id);
                                    return <td key={fund.id} className="value-cell">{fee?.custodianFee ? `${fee.custodianFee.toFixed(2)}%` : '-'}</td>
                                })}
                            </tr>
                            <tr>
                                <td className="label-cell">其他費用</td>
                                {selectedFunds.map(fund => {
                                    const fee = fundFees.get(fund.id);
                                    return <td key={fund.id} className="value-cell">{fee?.otherFee ? `${fee.otherFee.toFixed(2)}%` : '-'}</td>
                                })}
                            </tr>
                        </tbody>
                    </table>
                </div>
            )
            }

        </div >
    );
};

export default FundComparison;
