import React, { useMemo } from 'react';
import { Scatter, Chart, Doughnut, Bar } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
    TimeScale,
    ArcElement,
    type ChartOptions
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import annotationPlugin from 'chartjs-plugin-annotation';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
    TimeScale,
    ArcElement,
    annotationPlugin
);

export interface BrokerData {
    company: string;
    date: string;
    serialNumber: string; // 序號
    broker: string;
    targetPriceLow: number; // 目標價下限
    targetPriceHigh: number; // 目標價上限
    targetPrice: number; // 平均目標價
    forecastPeriod: string; // 預測價格期間
    closePrice: number;
    upside: number;
    rating: string;
    epsNext: number;
    peNext: number;
    summary: string;
    fileSource: string; // 檔案來源
}

interface ChartProps {
    data: BrokerData[];
}

// --- Generic Components ---

interface ScatterProps extends ChartProps {
    xKey: keyof BrokerData;
    yKey: keyof BrokerData;
    xLabel: string;
    yLabel: string;
    color: string;
    isPercentage?: boolean;
}

export const SimpleScatterChart: React.FC<ScatterProps> = ({ data, xKey, yKey, xLabel, yLabel, color, isPercentage }) => {
    const chartData = useMemo(() => {
        const validData = data.filter(d => {
            const x = d[xKey];
            const y = d[yKey];
            return x != null && y != null && !isNaN(x as number) && !isNaN(y as number);
        });

        if (validData.length === 0) return null;

        return {
            datasets: [{
                label: `${xLabel} vs ${yLabel}`,
                data: validData.map(d => ({
                    x: d[xKey] as number,
                    y: isPercentage ? (d[yKey] as number) * 100 : (d[yKey] as number),
                    raw: d // Pass full object
                })),
                backgroundColor: color,
                borderColor: color,
            }]
        };
    }, [data, xKey, yKey, color, isPercentage]);

    if (!chartData) return <div className="no-data">No data available</div>;

    const options: ChartOptions<'scatter'> = {
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: (ctx: any) => {
                        const pt = ctx.raw;
                        const d = pt.raw as BrokerData;
                        const xVal = isPercentage && xKey === 'upside' ? (d[xKey] as number * 100).toFixed(2) + '%' : d[xKey];
                        const yVal = isPercentage ? pt.y.toFixed(2) + '%' : pt.y;

                        return [
                            `券商: ${d.broker}`,
                            `日期: ${d.date}`,
                            `${xLabel}: ${xVal}`,
                            `${yLabel}: ${yVal}`
                        ];
                    }
                }
            }
        },
        scales: {
            x: { title: { display: true, text: xLabel }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: {
                title: { display: true, text: yLabel },
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: {
                    callback: (v: string | number) => {
                        const val = Number(v);
                        return isPercentage ? val.toFixed(2) + '%' : val.toFixed(2);
                    }
                }
            }
        }
    };

    return <div style={{ height: '300px' }}><Scatter data={chartData} options={options} /></div>;
};

interface HistoryProps extends ChartProps {
    dataKey: keyof BrokerData;
    label: string;
    color: string;
    isPercentage?: boolean;
}

export const TimeHistoryChart: React.FC<HistoryProps> = ({ data, dataKey, label, color, isPercentage }) => {
    const chartData = useMemo(() => {
        const validData = data.filter(d => {
            const val = d[dataKey];
            const date = new Date(d.date);
            return val != null && !isNaN(val as number) && !isNaN(date.getTime());
        }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        if (validData.length === 0) return null;

        return {
            datasets: [{
                type: 'scatter' as const,
                label: label,
                data: validData.map(d => ({
                    x: d.date,
                    y: isPercentage ? (d[dataKey] as number) * 100 : (d[dataKey] as number),
                    broker: d.broker
                })),
                backgroundColor: color,
                borderColor: color,
            }]
        };
    }, [data, dataKey, label, color, isPercentage]);

    if (!chartData) return <div className="no-data">No data available</div>;

    const options: any = {
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: (ctx: any) => {
                        const val = isPercentage ? ctx.raw.y.toFixed(2) + '%' : ctx.raw.y;
                        return `${ctx.raw.broker}: ${val}`;
                    }
                }
            }
        },
        scales: {
            x: {
                type: 'time',
                time: { unit: 'month', displayFormats: { month: 'yyyy/MM' } },
                grid: { color: 'rgba(255,255,255,0.05)' }
            },
            y: {
                title: { display: true, text: label },
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: { callback: (v: any) => isPercentage ? v + '%' : v }
            }
        }
    };

    return <div style={{ height: '300px' }}><Chart type='scatter' data={chartData} options={options} /></div>;
};

interface HistogramProps extends ChartProps {
    dataKey: keyof BrokerData;
    color: string;
}

export const HistogramChart: React.FC<HistogramProps> = ({ data, dataKey, color }) => {
    const { chartData } = useMemo(() => {
        const valid = data.filter(d => {
            const v = d[dataKey] as number;
            return v != null && !isNaN(v) && v > 0;
        });

        if (valid.length === 0) return { chartData: null };

        const values = valid.map(d => d[dataKey] as number);
        const min = Math.min(...values);
        const max = Math.max(...values);

        // Handle case where all values are the same
        if (min === max) {
            return {
                chartData: {
                    labels: [min.toFixed(1)],
                    datasets: [{
                        label: 'Count',
                        data: [valid.length],
                        backgroundColor: color + '80',
                        borderColor: color,
                        borderWidth: 1,
                        binItems: [valid] // Store all items in first bin
                    }]
                }
            };
        }

        const binCount = 10;
        const range = max - min;
        const step = range / binCount;

        const bins = new Array(binCount).fill(0);
        const binItems: BrokerData[][] = Array.from({ length: binCount }, () => []);
        const binLabels = [];

        for (let i = 0; i < binCount; i++) {
            const s = min + i * step;
            const e = s + step;
            binLabels.push(`${s.toFixed(2)} - ${e.toFixed(2)}`);
        }

        valid.forEach(d => {
            const v = d[dataKey] as number;
            let idx = Math.floor((v - min) / step);
            if (idx >= binCount) idx = binCount - 1;
            if (idx < 0) idx = 0;
            bins[idx]++;
            binItems[idx].push(d);
        });

        return {
            chartData: {
                labels: binLabels,
                datasets: [{
                    label: 'Count',
                    data: bins,
                    backgroundColor: color + '80',
                    borderColor: color,
                    borderWidth: 1,
                    binItems: binItems // Custom property
                }]
            }
        };
    }, [data, dataKey, color]);

    if (!chartData) return <div className="no-data">No data available</div>;

    const options: any = {
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    title: (ctx: any) => `區間: ${ctx[0].label}`,
                    label: (ctx: any) => `數量: ${ctx.raw} 筆`,
                    afterBody: (ctx: any) => {
                        const idx = ctx[0].dataIndex;
                        const items = ctx[0].dataset.binItems[idx] as BrokerData[];
                        // Sort by date desc
                        const sorted = [...items].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                        const maxItems = 8;
                        const displayItems = sorted.slice(0, maxItems);
                        const remaining = sorted.length - maxItems;

                        const lines = displayItems.map(d => {
                            const val = d[dataKey] as number;
                            return `${d.broker} (${d.date}): ${val.toFixed(2)} | EPS:${d.epsNext}`;
                        });

                        if (remaining > 0) {
                            lines.push(`...還有 ${remaining} 筆`);
                        }

                        return lines;
                    }
                }
            }
        },
        scales: {
            x: { grid: { display: false } },
            y: { grid: { color: 'rgba(255,255,255,0.05)' } }
        }
    };

    return <div style={{ height: '300px' }}><Bar data={chartData} options={options} /></div>;
};

interface LatestBarProps extends ChartProps {
    dataKey: keyof BrokerData;
    label: string;
    color: string;
}

export const LatestBarChart: React.FC<LatestBarProps> = ({ data, dataKey, label, color }) => {
    const { chartData, average } = useMemo(() => {
        // Get latest data per broker
        const map = new Map<string, BrokerData>();
        data.forEach(d => {
            if (!d.broker) return;
            const existing = map.get(d.broker);
            if (!existing || (new Date(d.date) > new Date(existing.date))) {
                map.set(d.broker, d);
            }
        });

        const latest = Array.from(map.values())
            .filter(d => {
                const val = d[dataKey];
                return typeof val === 'number' && !isNaN(val) && val > 0;
            })
            .sort((a, b) => (b[dataKey] as number) - (a[dataKey] as number));

        if (latest.length === 0) return { chartData: null, average: 0 };

        // Calculate Average
        const total = latest.reduce((sum, d) => sum + (d[dataKey] as number), 0);
        const avg = total / latest.length;

        return {
            average: avg,
            chartData: {
                labels: latest.map(d => d.broker),
                datasets: [
                    {
                        label: label,
                        data: latest.map(d => d[dataKey] as number),
                        backgroundColor: color,
                        borderRadius: 4,
                        raw: latest // Pass full objects array to dataset for access
                    }
                ]
            }
        };
    }, [data, dataKey, color]);

    if (!chartData) return <div className="no-data">No data available</div>;

    const options: any = {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            annotation: {
                annotations: {
                    averageLine: {
                        type: 'line',
                        xMin: average,
                        xMax: average,
                        borderColor: '#fbbf24', // Amber-400
                        borderWidth: 2,
                        borderDash: [5, 5],
                        label: {
                            display: true,
                            content: `Avg: ${average.toFixed(2)}`,
                            position: 'end',
                            backgroundColor: 'rgba(0,0,0,0.7)',
                            color: '#fbbf24',
                            font: { size: 10 }
                        }
                    }
                }
            },
            tooltip: {
                callbacks: {
                    label: (ctx: any) => {
                        const idx = ctx.dataIndex;
                        const d = ctx.dataset.raw[idx] as BrokerData;
                        const val = ctx.raw;
                        return [
                            `${d.broker}`,
                            `${label}: ${val}`,
                            `發佈日: ${d.date}`,
                            `全體平均: ${average.toFixed(0)}`
                        ];
                    }
                }
            }
        },
        scales: {
            x: { grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { grid: { display: false } }
        }
    };

    // Dynamic height based on number of brokers
    const height = Math.max(300, (chartData.labels?.length || 0) * 30);

    return <div style={{ height: `${height}px` }}><Chart type='bar' data={chartData} options={options} /></div>;
};

export const RatingDistribution: React.FC<ChartProps> = ({ data }) => {
    const chartData = useMemo(() => {
        const counts: Record<string, number> = {};
        const items: Record<string, string[]> = {};

        // Get latest rating per broker
        const map = new Map<string, BrokerData>();
        data.forEach(d => {
            if (!d.broker) return;
            const existing = map.get(d.broker);
            if (!existing || (new Date(d.date) > new Date(existing.date))) {
                map.set(d.broker, d);
            }
        });

        if (map.size === 0) return null;

        Array.from(map.values()).forEach(d => {
            const r = d.rating || 'Unknown';
            counts[r] = (counts[r] || 0) + 1;
            if (!items[r]) items[r] = [];
            items[r].push(d.broker);
        });

        const labels = Object.keys(counts);
        const dataValues = Object.values(counts);
        const itemValues = labels.map(l => items[l]);

        return {
            labels: labels,
            datasets: [{
                data: dataValues,
                backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'],
                borderColor: 'rgba(15, 17, 26, 0.8)',
                borderWidth: 2,
                items: itemValues // Custom property
            }]
        };
    }, [data]);

    if (!chartData) return <div className="no-data">No data available</div>;

    const options: any = {
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { position: 'right', labels: { color: '#e2e8f0' } },
            tooltip: {
                callbacks: {
                    label: (ctx: any) => {
                        const idx = ctx.dataIndex;
                        const count = ctx.raw;
                        const label = ctx.label;
                        const brokers = ctx.dataset.items[idx] as string[];

                        // Wrap brokers logic
                        const maxLineLength = 20;
                        const lines: string[] = [];
                        let currentLine = "(";

                        brokers.forEach((broker, i) => {
                            const separator = i === 0 ? "" : ", ";
                            const nextPart = separator + broker;

                            if (currentLine.length + nextPart.length > maxLineLength) {
                                lines.push(currentLine);
                                currentLine = " " + broker; // Start new line
                            } else {
                                currentLine += nextPart;
                            }
                        });
                        lines.push(currentLine + ")");

                        return [
                            `${label}: ${count} 家`,
                            ...lines
                        ];
                    }
                }
            }
        }
    };

    return <div style={{ height: '300px' }}><Doughnut data={chartData} options={options} /></div>;
};
