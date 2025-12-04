import React, { useState, useEffect, useMemo } from 'react';
import { Search, Calendar, BarChart2, List, Activity, Upload, ChevronDown, ChevronUp } from 'lucide-react';
import JSZip from 'jszip';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    BubbleController,
    BarController,
    LineController,
    ArcElement,
    PieController,
    Filler
} from 'chart.js';
import { Bar, Bubble, Pie, Chart } from 'react-chartjs-2';
import { TreemapController, TreemapElement } from 'chartjs-chart-treemap';
import './BrokerageDashboard.scss';

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    BubbleController,
    BarController,
    LineController,
    ArcElement,
    PieController,
    PieController,
    Filler,
    TreemapController,
    TreemapElement
);

interface BrokerageDashboardProps {
    basePath?: string;
}

interface BrokerSummary {
    broker: string;
    buyVol: number;
    sellVol: number;
    buyAmt: number;
    sellAmt: number;
    netVol: number;
    netAmt: number;
    avgBuyPrice: number;
    avgSellPrice: number;
}



const BrokerageCharts = ({ data, topN }: { data: any, topN: number }) => {
    const { topBuyers, topSellers, topActive, totalNetBuy, totalNetSell } = useMemo(() => {
        const sortedNet = [...data.summary].sort((a: any, b: any) => b.netVol - a.netVol);
        const buyers = sortedNet.filter((b: any) => b.netVol > 0).slice(0, topN);
        const sellers = sortedNet.filter((b: any) => b.netVol < 0).reverse().slice(0, topN);

        // Calculate Top Active (Total Volume)
        const sortedActive = [...data.summary].sort((a: any, b: any) => (b.buyVol + b.sellVol) - (a.buyVol + a.sellVol));
        const active = sortedActive.slice(0, topN);

        const tNetBuy = sortedNet.filter((b: any) => b.netVol > 0).reduce((sum: number, b: any) => sum + b.netVol, 0);
        const tNetSell = sortedNet.filter((b: any) => b.netVol < 0).reduce((sum: number, b: any) => sum + Math.abs(b.netVol), 0);

        return { topBuyers: buyers, topSellers: sellers, topActive: active, totalNetBuy: tNetBuy, totalNetSell: tNetSell };
    }, [data, topN]);

    const getTickSize = (price: number) => {
        if (price < 10) return 0.01;
        if (price < 50) return 0.05;
        if (price < 100) return 0.1;
        if (price < 500) return 0.5;
        if (price < 1000) return 1;
        return 5;
    };

    const getHistogramData = (brokerList: any[]) => {
        const brokerNames = new Set(brokerList.map((b: any) => b.broker));
        const relevantRows = data.details.filter((r: any) => brokerNames.has(r.broker));

        if (relevantRows.length === 0) return { labels: [], buyData: [], sellData: [] };

        const prices = relevantRows.map((r: any) => r.price);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);

        const bins: number[] = [];
        let currentPrice = minPrice;

        while (currentPrice <= maxPrice) {
            bins.push(currentPrice);
            const tick = getTickSize(currentPrice);
            currentPrice += tick;
            currentPrice = Math.round(currentPrice * 100) / 100;
        }

        if (bins[bins.length - 1] < maxPrice) {
            bins.push(maxPrice);
        }

        const buyVol = new Array(bins.length).fill(0);
        const sellVol = new Array(bins.length).fill(0);

        const binMap = new Map<string, number>();
        bins.forEach((p, i) => binMap.set(p.toFixed(2), i));

        relevantRows.forEach((r: any) => {
            let index = binMap.get(r.price.toFixed(2));

            if (index !== undefined) {
                buyVol[index] += r.buyVol;
                sellVol[index] += r.sellVol;
            } else {
                let minDiff = Number.MAX_VALUE;
                let closestIndex = -1;

                bins.forEach((bin, i) => {
                    const diff = Math.abs(bin - r.price);
                    if (diff < minDiff) {
                        minDiff = diff;
                        closestIndex = i;
                    }
                });

                if (closestIndex !== -1) {
                    buyVol[closestIndex] += r.buyVol;
                    sellVol[closestIndex] += r.sellVol;
                }
            }
        });

        // Invert calculation: 
        // If Buy > Sell, we want it to go Left (Negative). So (Sell - Buy) will be negative.
        // If Sell > Buy, we want it to go Right (Positive). So (Sell - Buy) will be positive.
        const netData = buyVol.map((b, i) => sellVol[i] - b);

        return {
            labels: bins.map(p => p.toFixed(2)),
            buyData: buyVol,
            sellData: sellVol,
            netData: netData
        };
    };

    const getCostBattleData = (buyers: any[], sellers: any[]) => {
        if (!data || !data.details || data.details.length === 0) return { labels: [], buyData: [], sellData: [] };

        const buyerNames = new Set(buyers.map((b: any) => b.broker));
        const sellerNames = new Set(sellers.map((b: any) => b.broker));

        // Get all relevant rows for both groups
        const buyerRows = data.details.filter((r: any) => buyerNames.has(r.broker));
        const sellerRows = data.details.filter((r: any) => sellerNames.has(r.broker));

        if (buyerRows.length === 0 && sellerRows.length === 0) return { labels: [], buyData: [], sellData: [] };

        // Use global min/max price from all details to ensure consistent bins
        const allPrices = data.details.map((r: any) => r.price).filter((p: number) => !isNaN(p) && isFinite(p));

        if (allPrices.length === 0) return { labels: [], buyData: [], sellData: [] };

        const minPrice = Math.min(...allPrices);
        const maxPrice = Math.max(...allPrices);

        if (!isFinite(minPrice) || !isFinite(maxPrice)) return { labels: [], buyData: [], sellData: [] };

        const bins: number[] = [];
        let currentPrice = minPrice;

        // Safety break to prevent infinite loops
        let safetyCounter = 0;
        while (currentPrice <= maxPrice && safetyCounter < 10000) {
            bins.push(currentPrice);
            const tick = getTickSize(currentPrice);
            if (tick <= 0) break; // Prevent infinite loop
            currentPrice += tick;
            currentPrice = Math.round(currentPrice * 100) / 100;
            safetyCounter++;
        }
        if (bins.length > 0 && bins[bins.length - 1] < maxPrice) bins.push(maxPrice);

        const buyVol = new Array(bins.length).fill(0);
        const sellVol = new Array(bins.length).fill(0);
        const binMap = new Map<string, number>();
        bins.forEach((p, i) => binMap.set(p.toFixed(2), i));

        const addToBin = (rows: any[], targetArray: number[], isBuy: boolean) => {
            rows.forEach((r: any) => {
                if (!r.price) return;

                let index = binMap.get(r.price.toFixed(2));
                if (index === undefined) {
                    // Find closest bin if exact match fails
                    let minDiff = Number.MAX_VALUE;
                    let closestIndex = -1;
                    bins.forEach((bin, i) => {
                        const diff = Math.abs(bin - r.price);
                        if (diff < minDiff) {
                            minDiff = diff;
                            closestIndex = i;
                        }
                    });
                    index = closestIndex;
                }

                if (index !== undefined && index !== -1) {
                    // For cost battle, we care about the volume traded by these players
                    // Buyers: We care about their BUY volume
                    // Sellers: We care about their SELL volume
                    const vol = isBuy ? r.buyVol : r.sellVol;
                    if (!isNaN(vol)) {
                        targetArray[index] += vol;
                    }
                }
            });
        };

        addToBin(buyerRows, buyVol, true);
        addToBin(sellerRows, sellVol, false);

        return {
            labels: bins.map(p => p.toFixed(2)),
            buyData: buyVol,
            sellData: sellVol
        };
    };

    const maxLength = Math.max(topBuyers.length, topSellers.length);
    const chartHeight = Math.max(500, maxLength * 30);

    const barChartOptions = {
        indexAxis: 'y' as const,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'top' as const },
            title: { display: true, text: `Top ${topN} Brokers Net Buy vs Net Sell` },
            tooltip: {
                callbacks: {
                    label: (context: any) => `${context.dataset.label}: ${Math.abs(context.raw)} vol`
                }
            }
        },
        scales: {
            x: {
                stacked: true,
                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                ticks: { color: '#94a3b8', callback: (val: any) => Math.abs(val) }
            },
            y: { stacked: true, grid: { display: false }, ticks: { color: '#ef4444' } },
            y1: {
                stacked: true, position: 'right' as const, grid: { display: false },
                ticks: { color: '#10b981', callback: (_: any, i: number) => topSellers[i]?.broker || '' }
            }
        }
    };

    const finalBarData = {
        labels: topBuyers.map((b: any) => b.broker),
        datasets: [
            { label: 'Net Buy', data: topBuyers.map((b: any) => -b.netVol), backgroundColor: 'rgba(239, 68, 68, 0.8)', yAxisID: 'y' },
            { label: 'Net Sell', data: topSellers.map((b: any) => Math.abs(b.netVol)), backgroundColor: 'rgba(16, 185, 129, 0.8)', yAxisID: 'y' }
        ]
    };

    const netHistData = useMemo(() => getHistogramData([...topBuyers, ...topSellers]), [topBuyers, topSellers]);

    const priceHistOptions = {
        indexAxis: 'y' as const,
        responsive: true,
        maintainAspectRatio: false,
        categoryPercentage: 1.0,
        barPercentage: 1.0,
        plugins: {
            legend: { position: 'top' as const },
            title: { display: true, text: `Price Distribution (Top Net Buy/Sell Brokers)` },
            tooltip: {
                callbacks: {
                    label: (context: any) => `${context.dataset.label}: ${Math.abs(context.raw)} vol`
                }
            }
        },
        scales: {
            x: {
                stacked: true,
                title: { display: true, text: 'Volume (Left: Buy, Right: Sell)', color: '#94a3b8' },
                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                ticks: { color: '#94a3b8', callback: (val: any) => Math.abs(val) }
            },
            y: {
                stacked: true,
                title: { display: true, text: 'Price', color: '#94a3b8' },
                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                ticks: { color: '#94a3b8' }
            }
        }
    };

    const priceHistChartData = {
        labels: netHistData.labels,
        datasets: [
            { label: 'Buy Vol', data: netHistData.buyData.map(v => -v), backgroundColor: 'rgba(239, 68, 68, 0.6)', order: 2 },
            { label: 'Sell Vol', data: netHistData.sellData, backgroundColor: 'rgba(16, 185, 129, 0.6)', order: 2 },
            {
                type: 'line' as const,
                label: 'Net Volume',
                data: netHistData.netData,
                borderColor: '#3b82f6',
                borderWidth: 2,
                fill: false,
                tension: 0.4,
                order: 1
            }
        ]
    };

    const netBrokersSet = new Set([...topBuyers, ...topSellers].map(b => b.broker));
    let maxVolNet = 0;
    const netBubblePoints = data.details
        .filter((row: any) => netBrokersSet.has(row.broker))
        .map((row: any) => {
            const points = [];
            if (row.buyVol > 0) {
                maxVolNet = Math.max(maxVolNet, row.buyVol);
                points.push({ x: row.broker, y: row.price, _vol: row.buyVol, r: 0, type: 'buy', broker: row.broker });
            }
            if (row.sellVol > 0) {
                maxVolNet = Math.max(maxVolNet, row.sellVol);
                points.push({ x: row.broker, y: row.price, _vol: row.sellVol, r: 0, type: 'sell', broker: row.broker });
            }
            return points;
        }).flat();

    const normalizeSizeNet = (vol: number) => (vol / (maxVolNet || 1)) * 30 + 3;

    const netBubbleOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'top' as const },
            title: { display: true, text: `Key Broker Buy/Sell Points (Net Buy/Sell)` },
            tooltip: {
                callbacks: {
                    label: (context: any) => `${context.raw.broker} (${context.raw.type}): ${context.raw._vol} vol @ $${context.raw.y}`
                }
            }
        },
        scales: {
            x: {
                type: 'category' as const,
                labels: [...topBuyers.map(b => b.broker), ...topSellers.map(b => b.broker)],
                offset: false,
                grid: { color: 'rgba(255, 255, 255, 0.1)', offset: false },
                ticks: { color: '#94a3b8', maxRotation: 90, minRotation: 90 }
            },
            y: { title: { display: true, text: 'Price', color: '#94a3b8' }, grid: { color: 'rgba(255, 255, 255, 0.1)' }, ticks: { color: '#94a3b8' } }
        }
    };

    const netBubbleData = {
        datasets: [
            {
                label: 'Buy',
                data: netBubblePoints.filter((p: any) => p.type === 'buy').map((p: any) => ({ ...p, r: normalizeSizeNet(p._vol) })),
                backgroundColor: 'rgba(239, 68, 68, 0.6)', borderColor: 'rgba(239, 68, 68, 1)'
            },
            {
                label: 'Sell',
                data: netBubblePoints.filter((p: any) => p.type === 'sell').map((p: any) => ({ ...p, r: normalizeSizeNet(p._vol) })),
                backgroundColor: 'rgba(16, 185, 129, 0.6)', borderColor: 'rgba(16, 185, 129, 1)'
            }
        ]
    };

    const activeBrokersSet = new Set(topActive.map(b => b.broker));
    let maxVolActive = 0;
    const activeBubblePoints = data.details
        .filter((row: any) => activeBrokersSet.has(row.broker))
        .map((row: any) => {
            const points = [];
            if (row.buyVol > 0) {
                maxVolActive = Math.max(maxVolActive, row.buyVol);
                points.push({ x: row.broker, y: row.price, _vol: row.buyVol, r: 0, type: 'buy', broker: row.broker });
            }
            if (row.sellVol > 0) {
                maxVolActive = Math.max(maxVolActive, row.sellVol);
                points.push({ x: row.broker, y: row.price, _vol: row.sellVol, r: 0, type: 'sell', broker: row.broker });
            }
            return points;
        }).flat();

    const normalizeSize = (vol: number) => (vol / (maxVolActive || 1)) * 30 + 3;

    const activeBubbleOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'top' as const },
            title: { display: true, text: `Top ${topN} Active Brokers (Total Volume)` },
            tooltip: {
                callbacks: {
                    label: (context: any) => `${context.raw.broker} (${context.raw.type}): ${context.raw._vol} vol @ $${context.raw.y}`
                }
            }
        },
        scales: {
            x: {
                type: 'category' as const,
                labels: topActive.map(b => b.broker),
                offset: false,
                grid: { color: 'rgba(255, 255, 255, 0.1)', offset: false },
                ticks: { color: '#94a3b8', maxRotation: 90, minRotation: 90 }
            },
            y: { title: { display: true, text: 'Price', color: '#94a3b8' }, grid: { color: 'rgba(255, 255, 255, 0.1)' }, ticks: { color: '#94a3b8' } }
        }
    };

    const activeBubbleData = {
        datasets: [
            {
                label: 'Buy',
                data: activeBubblePoints.filter((p: any) => p.type === 'buy').map((p: any) => ({ ...p, r: normalizeSize(p._vol) })),
                backgroundColor: 'rgba(239, 68, 68, 0.6)', borderColor: 'rgba(239, 68, 68, 1)'
            },
            {
                label: 'Sell',
                data: activeBubblePoints.filter((p: any) => p.type === 'sell').map((p: any) => ({ ...p, r: normalizeSize(p._vol) })),
                backgroundColor: 'rgba(16, 185, 129, 0.6)', borderColor: 'rgba(16, 185, 129, 1)'
            }
        ]
    };

    const activeHistData = useMemo(() => getHistogramData(topActive), [topActive]);

    const activeHistOptions = {
        indexAxis: 'y' as const,
        responsive: true,
        maintainAspectRatio: false,
        categoryPercentage: 1.0,
        barPercentage: 1.0,
        plugins: {
            legend: { position: 'top' as const },
            title: { display: true, text: `Price Distribution (Top Active Brokers)` },
            tooltip: {
                callbacks: {
                    label: (context: any) => `${context.dataset.label}: ${Math.abs(context.raw)} vol`
                }
            }
        },
        scales: {
            x: {
                stacked: true,
                title: { display: true, text: 'Volume (Left: Buy, Right: Sell)', color: '#94a3b8' },
                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                ticks: { color: '#94a3b8', callback: (val: any) => Math.abs(val) }
            },
            y: {
                stacked: true,
                title: { display: true, text: 'Price', color: '#94a3b8' },
                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                ticks: { color: '#94a3b8' }
            }
        }
    };

    const activeHistChartData = {
        labels: activeHistData.labels,
        datasets: [
            { label: 'Buy Vol', data: activeHistData.buyData.map(v => -v), backgroundColor: 'rgba(239, 68, 68, 0.6)', order: 2 },
            { label: 'Sell Vol', data: activeHistData.sellData, backgroundColor: 'rgba(16, 185, 129, 0.6)', order: 2 },
            {
                type: 'line' as const,
                label: 'Net Volume',
                data: activeHistData.netData,
                borderColor: '#3b82f6',
                borderWidth: 2,
                fill: false,
                tension: 0.4,
                order: 1
            }
        ]
    };

    // --- New Chart 5: Major Player Cost Battle (Stacked Bar) ---
    const costBattleProcessed = useMemo(() => getCostBattleData(topBuyers, topSellers), [topBuyers, topSellers]);

    const costBattleData = {
        labels: costBattleProcessed.labels,
        datasets: [
            {
                label: `Top ${topN} Buyers Buy Cost`,
                data: costBattleProcessed.buyData,
                backgroundColor: 'rgba(239, 68, 68, 0.8)',
                stack: 'stack0'
            },
            {
                label: `Top ${topN} Sellers Sell Cost`,
                data: costBattleProcessed.sellData,
                backgroundColor: 'rgba(16, 185, 129, 0.8)',
                stack: 'stack0'
            }
        ]
    };

    const costBattleOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'top' as const },
            title: { display: true, text: `Major Player Cost Battle (Top ${topN} Buyers vs Sellers)` },
            tooltip: {
                callbacks: {
                    label: (context: any) => `${context.dataset.label}: ${context.raw} vol`
                }
            }
        },
        scales: {
            x: {
                stacked: true,
                ticks: { color: '#94a3b8', maxRotation: 90, minRotation: 90 },
                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                title: { display: true, text: 'Price', color: '#94a3b8' }
            },
            y: {
                stacked: true,
                beginAtZero: true,
                ticks: { color: '#94a3b8' },
                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                title: { display: true, text: 'Volume', color: '#94a3b8' }
            }
        }
    };

    // --- New Chart 6: Major Player Buy/Sell Concentration Analysis (Double Pie) ---
    const concentrationDataBuy = {
        labels: [...topBuyers.map((b: any) => b.broker), 'Others'],
        datasets: [{
            data: [
                ...topBuyers.map((b: any) => b.netVol),
                Math.max(0, totalNetBuy - topBuyers.reduce((sum: number, b: any) => sum + b.netVol, 0))
            ],
            backgroundColor: [
                ...topBuyers.map(() => '#ef4444'),
                '#334155'
            ]
        }]
    };

    const concentrationDataSell = {
        labels: [...topSellers.map((b: any) => b.broker), 'Others'],
        datasets: [{
            data: [
                ...topSellers.map((b: any) => Math.abs(b.netVol)),
                Math.max(0, totalNetSell - topSellers.reduce((sum: number, b: any) => sum + Math.abs(b.netVol), 0))
            ],
            backgroundColor: [
                ...topSellers.map(() => '#10b981'),
                '#334155'
            ]
        }]
    };

    // --- New Chart 7: Market Activity Distribution (Pie - Top 10 Active vs Others) ---
    const activityPieData = useMemo(() => {
        const top10Active = topActive.slice(0, 10);
        const top10Vol = top10Active.reduce((sum, b) => sum + b.buyVol + b.sellVol, 0);
        const totalVol = data.summary.reduce((sum: number, b: any) => sum + b.buyVol + b.sellVol, 0);
        const othersVol = Math.max(0, totalVol - top10Vol);

        return {
            labels: [...top10Active.map(b => b.broker), 'Others'],
            datasets: [{
                data: [...top10Active.map(b => b.buyVol + b.sellVol), othersVol],
                backgroundColor: [
                    '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a',
                    '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe', '#eff6ff',
                    '#334155'
                ]
            }]
        };
    }, [topActive, data]);

    // --- New Chart 8: Buy Share (Treemap) ---
    // Using Chart component with type='treemap'
    const buyTreemapData = useMemo(() => {
        const buyers = data.summary.filter((b: any) => b.netVol > 0);
        return {
            datasets: [{
                label: 'Buy Share',
                tree: buyers,
                key: 'netVol',
                groups: ['broker'],
                backgroundColor: (ctx: any) => {
                    if (ctx.type !== 'data') return 'transparent';
                    return '#ef4444';
                },
                labels: {
                    display: true,
                    formatter: (ctx: any) => ctx.raw.g
                }
            }]
        };
    }, [data]);

    // --- New Chart 9: Sell Share (Treemap) ---
    const sellTreemapData = useMemo(() => {
        const sellers = data.summary.filter((b: any) => b.netVol < 0).map((b: any) => ({ ...b, absNetVol: Math.abs(b.netVol) }));
        return {
            datasets: [{
                label: 'Sell Share',
                tree: sellers,
                key: 'absNetVol',
                groups: ['broker'],
                backgroundColor: (ctx: any) => {
                    if (ctx.type !== 'data') return 'transparent';
                    return '#10b981';
                },
                labels: {
                    display: true,
                    formatter: (ctx: any) => ctx.raw.g
                }
            }]
        };
    }, [data]);

    // --- New Chart 10: Buy/Sell Intensity Amount Range Analysis ---
    const getTierAnalysisData = (excludeBrokers: string[] = []) => {
        if (!data || !data.summary || data.summary.length === 0) return { labels: [], buyData: [], sellData: [], netData: [] };

        const totalBuyAmt = data.summary.reduce((sum: number, b: any) => sum + b.buyAmt, 0);
        const totalBuyVol = data.summary.reduce((sum: number, b: any) => sum + b.buyVol, 0);
        const avgPrice = totalBuyVol > 0 ? totalBuyAmt / totalBuyVol : 0;
        const unitValue = avgPrice * 1000;

        console.log('Tier Analysis Debug:', { avgPrice, unitValue, totalBuyAmt, totalBuyVol });

        const labels = [
            '>1億', '5千萬-1億', '2千萬-5千萬', '1千萬-2千萬',
            '500萬-1千萬', '200萬-500萬', '100萬-200萬', '1張-100萬', '<1張'
        ];

        // Initialize buckets
        const buyBuckets = new Array(labels.length).fill(0);
        const sellBuckets = new Array(labels.length).fill(0);

        const excludeSet = new Set(excludeBrokers);

        data.summary.forEach((b: any) => {
            if (excludeSet.has(b.broker)) return;

            const netAmt = b.netAmt;
            const netVol = b.netVol;

            if (netAmt === 0) return;

            const absAmt = Math.abs(netAmt);
            let bucketIndex = 8; // Default to <1張 (Index 8)

            if (absAmt >= 100_000_000) bucketIndex = 0;
            else if (absAmt >= 50_000_000) bucketIndex = 1;
            else if (absAmt >= 20_000_000) bucketIndex = 2;
            else if (absAmt >= 10_000_000) bucketIndex = 3;
            else if (absAmt >= 5_000_000) bucketIndex = 4;
            else if (absAmt >= 2_000_000) bucketIndex = 5;
            else if (absAmt >= 1_000_000) bucketIndex = 6;
            else if (absAmt >= unitValue) bucketIndex = 7;
            else bucketIndex = 8;

            // Aggregate Volume (in Sheets, so divide by 1000)
            const netVolSheets = netVol / 1000;

            if (netAmt > 0) {
                buyBuckets[bucketIndex] += netVolSheets;
            } else {
                sellBuckets[bucketIndex] += Math.abs(netVolSheets);
            }
        });

        // Calculate Net
        const netBuckets = buyBuckets.map((b, i) => b - sellBuckets[i]);

        return {
            labels,
            buyData: buyBuckets, // Positive for left side (will be negated in chart)
            sellData: sellBuckets,
            netData: netBuckets
        };
    };

    const tierAnalysisProcessedAll = useMemo(() => getTierAnalysisData(), [data]);

    // Get top 20 active brokers to exclude
    const top20ActiveBrokers = useMemo(() => {
        if (!data || !data.summary) return [];
        // Sort by total volume (buy + sell)
        const sorted = [...data.summary].sort((a: any, b: any) => (b.buyVol + b.sellVol) - (a.buyVol + a.sellVol));
        return sorted.slice(0, 20).map((b: any) => b.broker);
    }, [data]);

    const tierAnalysisProcessedExcluding = useMemo(() => getTierAnalysisData(top20ActiveBrokers), [data, top20ActiveBrokers]);

    const createTierChartData = (processedData: any) => ({
        labels: processedData.labels,
        datasets: [
            {
                label: 'Buy Vol',
                data: processedData.buyData.map((v: number) => -v), // Negative for left side
                backgroundColor: 'rgba(239, 68, 68, 0.7)',
                stack: 'stack0',
                order: 2
            },
            {
                label: 'Sell Vol',
                data: processedData.sellData,
                backgroundColor: 'rgba(16, 185, 129, 0.7)',
                stack: 'stack0',
                order: 2
            },
            {
                type: 'line' as const,
                label: 'Net Volume',
                data: processedData.netData.map((v: number) => -v), // Invert to match Buy (Left) / Sell (Right) direction
                borderColor: '#3b82f6',
                borderWidth: 2,
                fill: false,
                tension: 0.4,
                order: 1
            }
        ]
    });

    const tierAnalysisDataAll = createTierChartData(tierAnalysisProcessedAll);
    const tierAnalysisDataExcluding = createTierChartData(tierAnalysisProcessedExcluding);

    const tierAnalysisOptions = {
        indexAxis: 'y' as const,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'top' as const },
            tooltip: {
                callbacks: {
                    label: (context: any) => `${context.dataset.label}: ${Math.abs(context.raw)} vol`
                }
            }
        },
        scales: {
            x: {
                stacked: true,
                title: { display: true, text: 'Volume (Left: Buy, Right: Sell)', color: '#94a3b8' },
                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                ticks: { color: '#94a3b8', callback: (val: any) => Math.abs(val) }
            },
            y: {
                stacked: true,
                title: { display: true, text: 'Amount Range', color: '#94a3b8' },
                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                ticks: { color: '#94a3b8' }
            }
        }
    };



    const scatterChartWidth = Math.max(typeof window !== 'undefined' ? window.innerWidth - 40 : 1024, topActive.length * 40);

    return (
        <div className="charts-view">
            <div className="chart-scroll-container">
                <div className="chart-wrapper" style={{ height: `${chartHeight}px`, minWidth: '800px' }}>
                    <Bar options={barChartOptions} data={finalBarData} />
                </div>
            </div>

            <div className="chart-scroll-container" style={{ marginTop: '3rem' }}>
                <div className="chart-wrapper" style={{ height: '500px', minWidth: '800px' }}>
                    <Bar options={priceHistOptions} data={priceHistChartData as any} />
                </div>
            </div>

            <div className="chart-scroll-container" style={{ marginTop: '3rem' }}>
                <div className="chart-wrapper" style={{ width: `${Math.max(typeof window !== 'undefined' ? window.innerWidth - 40 : 1024, (topBuyers.length + topSellers.length) * 40)}px`, height: '600px' }}>
                    <Bubble options={netBubbleOptions} data={netBubbleData as any} />
                </div>
            </div>

            <div className="chart-scroll-container" style={{ marginTop: '3rem' }}>
                <div className="chart-wrapper" style={{ height: '500px', minWidth: '800px' }}>
                    <Bar options={activeHistOptions} data={activeHistChartData as any} />
                </div>
            </div>

            <div className="chart-scroll-container" style={{ marginTop: '3rem' }}>
                <div className="chart-wrapper" style={{ width: `${scatterChartWidth}px`, height: '600px' }}>
                    <Bubble options={activeBubbleOptions} data={activeBubbleData as any} />
                </div>
            </div>

            <div className="chart-scroll-container" style={{ marginTop: '3rem', display: 'flex', gap: '20px' }}>
                <div className="chart-wrapper" style={{ flex: 1, height: '400px' }}>
                    <h4 style={{ textAlign: 'center', color: '#fff' }}>Buy Concentration</h4>
                    <Pie data={concentrationDataBuy} />
                </div>
                <div className="chart-wrapper" style={{ flex: 1, height: '400px' }}>
                    <h4 style={{ textAlign: 'center', color: '#fff' }}>Sell Concentration</h4>
                    <Pie data={concentrationDataSell} />
                </div>
            </div>

            <div className="chart-scroll-container" style={{ marginTop: '3rem' }}>
                <div className="chart-wrapper" style={{ height: '500px', minWidth: '800px' }}>
                    <h4 style={{ textAlign: 'center', color: '#fff' }}>Market Activity Distribution</h4>
                    <Pie data={activityPieData} />
                </div>
            </div>

            <div className="chart-scroll-container" style={{ marginTop: '3rem' }}>
                <div className="chart-wrapper" style={{ height: '500px', minWidth: '800px' }}>
                    <h4 style={{ textAlign: 'center', color: '#fff' }}>Buy Share (Treemap)</h4>
                    <Chart type='treemap' data={buyTreemapData as any} />
                </div>
            </div>

            <div className="chart-scroll-container" style={{ marginTop: '3rem' }}>
                <div className="chart-wrapper" style={{ height: '500px', minWidth: '800px' }}>
                    <h4 style={{ textAlign: 'center', color: '#fff' }}>Sell Share (Treemap)</h4>
                    <Chart type='treemap' data={sellTreemapData as any} />
                </div>
            </div>

            <div className="chart-scroll-container" style={{ marginTop: '3rem' }}>
                <div className="chart-wrapper" style={{ height: '500px', minWidth: '800px' }}>
                    <Bar options={costBattleOptions} data={costBattleData} />
                </div>
            </div>

            <div className="chart-scroll-container" style={{ marginTop: '3rem', display: 'flex', gap: '20px' }}>
                <div className="chart-wrapper" style={{ flex: 1, height: '500px', minWidth: '600px' }}>
                    <h4 style={{ textAlign: 'center', color: '#fff' }}>All Brokers</h4>
                    <Bar options={{ ...tierAnalysisOptions, plugins: { ...tierAnalysisOptions.plugins, title: { display: true, text: 'All Brokers' } } }} data={tierAnalysisDataAll as any} />
                </div>
                <div className="chart-wrapper" style={{ flex: 1, height: '500px', minWidth: '600px' }}>
                    <h4 style={{ textAlign: 'center', color: '#fff' }}>Excluding Top 20 Active Brokers</h4>
                    <Bar options={{ ...tierAnalysisOptions, plugins: { ...tierAnalysisOptions.plugins, title: { display: true, text: 'Excluding Top 20 Active' } } }} data={tierAnalysisDataExcluding as any} />
                </div>
            </div>
        </div>
    );
};


const BrokerageScanner = () => (
    <div className="scanner-view">
        <h3>Strong Buy/Sell Scan (Coming Soon)</h3>
        <p>This feature requires cross-stock analysis which is not available in single-stock mode.</p>
    </div>
);

const BrokerageQuery = ({ data }: { data: any }) => (
    <div className="query-view">
        <h3>Transaction Details ({data.details.length} records)</h3>
        <div className="table-container">
            <table>
                <thead>
                    <tr>
                        <th>Broker</th>
                        <th>Price</th>
                        <th>Buy Vol</th>
                        <th>Sell Vol</th>
                    </tr>
                </thead>
                <tbody>
                    {data.details.slice(0, 100).map((row: any, i: number) => (
                        <tr key={i}>
                            <td>{row.broker}</td>
                            <td>{row.price}</td>
                            <td>{row.buyVol}</td>
                            <td>{row.sellVol}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
);

const BrokerageDashboard: React.FC<BrokerageDashboardProps> = ({ basePath: _basePath = '' }) => {
    console.log('BrokerageDashboard v0.0.3 loaded');
    const [dates, setDates] = useState<string[]>([]);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [stockCode, setStockCode] = useState('');
    const [activeTab, setActiveTab] = useState<'charts' | 'scan' | 'query'>('charts');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [data, setData] = useState<any>(null);
    const [topN, setTopN] = useState(15);
    const [zipCache, setZipCache] = useState<Map<string, JSZip>>(new Map());
    const [isControlsExpanded, setIsControlsExpanded] = useState(false);

    useEffect(() => {
        fetch(`${import.meta.env.BASE_URL}data/chips/dates.json`)
            .then(res => res.json())
            .then(data => {
                const sortedDates = data.sort((a: string, b: string) => b.localeCompare(a));
                setDates(sortedDates);
                if (sortedDates.length > 0) {
                    setStartDate(sortedDates[0]);
                    setEndDate(sortedDates[0]);
                }
            })
            .catch(err => console.error('Failed to load dates:', err));
    }, []);

    const parseDoubleColumnCSV = (text: string) => {
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
        const rows: any[] = [];

        // Skip header (first line)
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            const parts = line.split(',');

            // Left column (0-4)
            if (parts.length >= 5) {
                const broker = parts[1]?.trim();
                if (broker) {
                    rows.push({
                        broker: broker,
                        price: parseFloat(parts[2]),
                        buyVol: parseInt(parts[3]) || 0,
                        sellVol: parseInt(parts[4]) || 0
                    });
                }
            }

            // Right column (6-10)
            if (parts.length >= 11) {
                const broker = parts[7]?.trim();
                if (broker) {
                    rows.push({
                        broker: broker,
                        price: parseFloat(parts[8]),
                        buyVol: parseInt(parts[9]) || 0,
                        sellVol: parseInt(parts[10]) || 0
                    });
                }
            }
        }
        return rows;
    };

    const processStockData = (rawRows: any[]) => {
        const brokerMap = new Map<string, BrokerSummary>();

        rawRows.forEach(row => {
            if (!brokerMap.has(row.broker)) {
                brokerMap.set(row.broker, {
                    broker: row.broker,
                    buyVol: 0,
                    sellVol: 0,
                    buyAmt: 0,
                    sellAmt: 0,
                    netVol: 0,
                    netAmt: 0,
                    avgBuyPrice: 0,
                    avgSellPrice: 0
                });
            }

            const b = brokerMap.get(row.broker)!;
            b.buyVol += row.buyVol;
            b.sellVol += row.sellVol;
            b.buyAmt += row.buyVol * row.price;
            b.sellAmt += row.sellVol * row.price;
        });

        const summary = Array.from(brokerMap.values()).map(b => {
            b.netVol = b.buyVol - b.sellVol;
            b.netAmt = b.buyAmt - b.sellAmt;
            b.avgBuyPrice = b.buyVol > 0 ? b.buyAmt / b.buyVol : 0;
            b.avgSellPrice = b.sellVol > 0 ? b.sellAmt / b.sellVol : 0;
            return b;
        });

        summary.sort((a, b) => b.netVol - a.netVol);

        return {
            details: rawRows,
            summary: summary
        };
    };

    const handleSearch = async () => {
        if (!stockCode || !startDate || !endDate) return;
        setLoading(true);
        setError('');
        setData(null);

        try {
            // dates array is sorted descending (newest first)
            const targetDates = dates.filter(d => d >= startDate && d <= endDate);

            if (targetDates.length === 0) {
                throw new Error('No valid dates found in range');
            }

            console.log(`Fetching data for ${targetDates.length} days...`);

            const allRows: any[] = [];

            await Promise.all(targetDates.map(async (date) => {
                try {
                    let zip = zipCache.get(date);

                    if (!zip) {
                        const response = await fetch(`${import.meta.env.BASE_URL}data/chips/${date}.zip`);
                        if (!response.ok) return;
                        const blob = await response.blob();
                        zip = await JSZip.loadAsync(blob);
                        setZipCache(prev => new Map(prev).set(date, zip!));
                    }

                    const fileName = `${date}/${stockCode}.csv`;
                    const file = zip.file(fileName);

                    if (!file) return;

                    const uint8Array = await file.async('uint8array');
                    let decodedText = '';
                    try {
                        const decoder = new TextDecoder('big5');
                        decodedText = decoder.decode(uint8Array);
                    } catch (e) {
                        const decoder = new TextDecoder('utf-8');
                        decodedText = decoder.decode(uint8Array);
                    }

                    const dayRows = parseDoubleColumnCSV(decodedText);
                    allRows.push(...dayRows);

                } catch (err) {
                    console.warn(`Failed to process ${date}:`, err);
                }
            }));

            if (allRows.length === 0) {
                throw new Error(`Stock ${stockCode} not found in selected range`);
            }

            const processedData = processStockData(allRows);
            setData(processedData);

        } catch (err: any) {
            setError(err.message || 'Error loading data');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setLoading(true);
        setError('');
        setData(null);

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target?.result;
                if (typeof content === 'string') {
                    const rows = parseDoubleColumnCSV(content);
                    if (rows.length === 0) {
                        throw new Error('No valid data found in CSV');
                    }
                    const processedData = processStockData(rows);
                    setData(processedData);
                    setStockCode(file.name.replace('.csv', '')); // Set stock code from filename
                }
            } catch (err: any) {
                setError('Failed to parse CSV: ' + err.message);
            } finally {
                setLoading(false);
                // Reset file input
                event.target.value = '';
            }
        };

        // Try reading as Big5 first (common for Taiwan stock data)
        // If it looks like UTF-8, FileReader usually handles it, but explicit TextDecoder is better.
        // Here we rely on FileReader's default or we can use readAsArrayBuffer and TextDecoder like in handleSearch.
        // For simplicity, let's use readAsArrayBuffer and decode manually to match handleSearch logic.
        reader.readAsArrayBuffer(file);
        reader.onload = (e) => {
            try {
                const buffer = e.target?.result as ArrayBuffer;
                let decodedText = '';
                try {
                    const decoder = new TextDecoder('big5');
                    decodedText = decoder.decode(buffer);
                } catch (e) {
                    const decoder = new TextDecoder('utf-8');
                    decodedText = decoder.decode(buffer);
                }

                const rows = parseDoubleColumnCSV(decodedText);
                if (rows.length === 0) {
                    throw new Error('No valid data found in CSV');
                }
                const processedData = processStockData(rows);
                setData(processedData);
                setStockCode(file.name.replace('.csv', ''));
            } catch (err: any) {
                setError('Failed to parse CSV: ' + err.message);
            } finally {
                setLoading(false);
                event.target.value = '';
            }
        };
    };

    return (
        <div className="brokerage-dashboard">
            <div className="controls-bar">
                <div
                    className="filter-toggle-bar"
                    onClick={() => setIsControlsExpanded(!isControlsExpanded)}
                >
                    <span>Show Filters</span>
                    {isControlsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>

                <div className={`controls-content ${isControlsExpanded ? 'expanded' : ''}`}>
                    <div className="control-group">
                        <label><Calendar size={16} /> Start</label>
                        <select value={startDate} onChange={e => setStartDate(e.target.value)}>
                            {dates.map(d => (
                                <option key={d} value={d}>{d}</option>
                            ))}
                        </select>
                    </div>
                    <div className="control-group">
                        <label><Calendar size={16} /> End</label>
                        <select value={endDate} onChange={e => setEndDate(e.target.value)}>
                            {dates.map(d => (
                                <option key={d} value={d}>{d}</option>
                            ))}
                        </select>
                    </div>
                    <div className="control-group">
                        <label><Search size={16} /> Stock</label>
                        <input
                            type="text"
                            value={stockCode}
                            onChange={e => setStockCode(e.target.value)}
                            placeholder="e.g. 2330"
                            onKeyDown={e => e.key === 'Enter' && handleSearch()}
                        />
                    </div>
                    <div className="control-group">
                        <label>Top N</label>
                        <input
                            type="number"
                            value={topN}
                            onChange={e => setTopN(Math.max(1, parseInt(e.target.value) || 1))}
                            style={{ width: '80px' }}
                        />
                    </div>
                    <button className="search-btn" onClick={handleSearch} disabled={loading}>
                        {loading ? 'Loading...' : 'Search'}
                    </button>

                    <div className="divider" style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)', margin: '0 1rem' }}></div>

                    <label className="upload-btn" style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        background: 'rgba(59, 130, 246, 0.1)',
                        color: '#3b82f6',
                        border: '1px solid rgba(59, 130, 246, 0.2)',
                        padding: '0.5rem 1rem',
                        borderRadius: '0.5rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}>
                        <Upload size={16} />
                        <span>Upload CSV</span>
                        <input
                            type="file"
                            accept=".csv"
                            onChange={handleFileUpload}
                            style={{ display: 'none' }}
                        />
                    </label>
                </div>
            </div>

            <div className="sub-tabs">
                <button
                    className={`tab-btn ${activeTab === 'charts' ? 'active' : ''}`}
                    onClick={() => setActiveTab('charts')}
                >
                    <BarChart2 size={16} /> Chart Analysis
                </button>
                <button
                    className={`tab-btn ${activeTab === 'scan' ? 'active' : ''}`}
                    onClick={() => setActiveTab('scan')}
                >
                    <Activity size={16} /> Strong Buy/Sell Scan
                </button>
                <button
                    className={`tab-btn ${activeTab === 'query' ? 'active' : ''}`}
                    onClick={() => setActiveTab('query')}
                >
                    <List size={16} /> Data Query
                </button>
            </div>

            <div className="content-area">
                {error && <div className="error-msg">{error}</div>}

                {!data && !loading && !error && (
                    <div className="empty-state">Please select a date range and enter a stock code to start analysis.</div>
                )}

                {data && (
                    <>
                        {activeTab === 'charts' && <BrokerageCharts data={data} topN={topN} />}
                        {activeTab === 'scan' && <BrokerageScanner />}
                        {activeTab === 'query' && <BrokerageQuery data={data} />}
                    </>
                )}
            </div>
        </div >
    );
};

export default BrokerageDashboard;
