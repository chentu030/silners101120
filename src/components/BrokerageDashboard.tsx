import React, { useState, useEffect, useMemo } from 'react';
import { Search, Calendar, BarChart2, List, Activity } from 'lucide-react';
import JSZip from 'jszip';
// import Papa from 'papaparse';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
    PointElement,
} from 'chart.js';
import { Bar, Scatter } from 'react-chartjs-2';
import './BrokerageDashboard.scss';

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    PointElement,
    Title,
    Tooltip,
    Legend
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

const BrokerageDashboard: React.FC<BrokerageDashboardProps> = ({ basePath: _basePath = '' }) => {
    const [dates, setDates] = useState<string[]>([]);
    const [selectedDate, setSelectedDate] = useState('');
    const [stockCode, setStockCode] = useState('');
    const [activeTab, setActiveTab] = useState<'charts' | 'scan' | 'query'>('charts');
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState('');
    const [zipCache, setZipCache] = useState<Map<string, JSZip>>(new Map());

    useEffect(() => {
        // Fetch available dates
        fetch(`${import.meta.env.BASE_URL}data/chips/dates.json`)
            .then(res => res.json())
            .then(data => {
                setDates(data);
                if (data.length > 0) setSelectedDate(data[0]);
            })
            .catch(err => console.error("Failed to load dates", err));
    }, []);

    const parseDoubleColumnCSV = (csvText: string) => {
        // Manual parsing because PapaParse failed to detect newlines correctly in some files
        const lines = csvText.split(/\r?\n/);
        const rows = lines.map(line => line.split(','));

        let dataRows: any[] = [];
        let headerIndex = -1;

        // Find header row index
        for (let i = 0; i < Math.min(20, rows.length); i++) {
            if (rows[i][1] && rows[i][1].includes('券商')) {
                headerIndex = i;
                break;
            }
        }

        if (headerIndex === -1) return [];

        for (let i = headerIndex + 1; i < rows.length; i++) {
            const row = rows[i];

            // Skip empty rows or rows with insufficient columns
            if (row.length < 2) continue;

            // Left side (indices 0-4)
            if (row[1]) {
                const brokerName = row[1].replace(/^\d+/, '').trim();
                if (brokerName) {
                    dataRows.push({
                        broker: brokerName,
                        price: parseFloat(row[2]) || 0,
                        buyVol: parseFloat(row[3]) || 0,
                        sellVol: parseFloat(row[4]) || 0
                    });
                }
            }

            // Right side (indices 6-10)
            if (row.length > 7 && row[7]) {
                const brokerName = row[7].replace(/^\d+/, '').trim();
                if (brokerName) {
                    dataRows.push({
                        broker: brokerName,
                        price: parseFloat(row[8]) || 0,
                        buyVol: parseFloat(row[9]) || 0,
                        sellVol: parseFloat(row[10]) || 0
                    });
                }
            }
        }
        return dataRows;
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
        if (!stockCode || !selectedDate) return;
        setLoading(true);
        setError('');
        setData(null);

        try {
            let zip = zipCache.get(selectedDate);

            if (!zip) {
                console.log(`Downloading ZIP for ${selectedDate}...`);
                const response = await fetch(`${import.meta.env.BASE_URL}data/chips/${selectedDate}.zip`);
                if (!response.ok) throw new Error('ZIP file not found');
                const blob = await response.blob();
                zip = await JSZip.loadAsync(blob);
                setZipCache(prev => new Map(prev).set(selectedDate, zip!));
            }

            const fileName = `${selectedDate}/${stockCode}.csv`;
            const file = zip.file(fileName);

            if (!file) {
                throw new Error(`Stock ${stockCode} not found in ${selectedDate} data`);
            }

            const uint8Array = await file.async('uint8array');
            let decodedText = '';
            try {
                const decoder = new TextDecoder('big5');
                decodedText = decoder.decode(uint8Array);
            } catch (e) {
                const decoder = new TextDecoder('utf-8');
                decodedText = decoder.decode(uint8Array);
            }

            const rawRows = parseDoubleColumnCSV(decodedText);
            const processedData = processStockData(rawRows);

            setData(processedData);

        } catch (err: any) {
            setError(err.message || 'Error loading data');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="brokerage-dashboard">
            <div className="controls-bar">
                <div className="control-group">
                    <label><Calendar size={16} /> Date</label>
                    <select value={selectedDate} onChange={e => setSelectedDate(e.target.value)}>
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
                <button className="search-btn" onClick={handleSearch} disabled={loading}>
                    {loading ? 'Loading...' : 'Search'}
                </button>
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
                    <div className="empty-state">Please select a date and enter a stock code to start analysis.</div>
                )}

                {data && (
                    <>
                        {activeTab === 'charts' && <BrokerageCharts data={data} />}
                        {activeTab === 'scan' && <BrokerageScanner />}
                        {activeTab === 'query' && <BrokerageQuery data={data} />}
                    </>
                )}
            </div>
        </div>
    );
};

const BrokerageCharts = ({ data }: { data: any }) => {
    const topBuyers = useMemo(() => {
        return [...data.summary].sort((a: any, b: any) => b.netVol - a.netVol).slice(0, 40);
    }, [data]);

    const topSellers = useMemo(() => {
        return [...data.summary].sort((a: any, b: any) => a.netVol - b.netVol).slice(0, 40);
    }, [data]);

    // Calculate dynamic width based on number of bars
    // 80 bars (40 buy + 40 sell) * 30px per bar = 2400px minimum
    const totalBars = topBuyers.length + topSellers.length;
    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const chartWidth = Math.max(windowWidth - 40, totalBars * 25);

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'top' as const },
            title: { display: true, text: 'Top 40 Brokers Net Buy/Sell' },
        },
        scales: {
            y: {
                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                ticks: { color: '#94a3b8' }
            },
            x: {
                grid: { display: false },
                ticks: { color: '#94a3b8' }
            }
        }
    };

    const chartData = {
        labels: [...topBuyers.map((b: any) => b.broker), ...topSellers.map((b: any) => b.broker)],
        datasets: [
            {
                label: 'Net Volume',
                data: [...topBuyers.map((b: any) => b.netVol), ...topSellers.map((b: any) => b.netVol)],
                backgroundColor: (context: any) => {
                    const value = context.raw;
                    return value > 0 ? 'rgba(239, 68, 68, 0.8)' : 'rgba(16, 185, 129, 0.8)';
                },
            },
        ],
    };

    // Scatter Plot Data
    // We want to show points for the top brokers we selected
    const relevantBrokers = new Set([...topBuyers, ...topSellers].map(b => b.broker));

    const scatterPoints = data.summary
        .filter((b: any) => relevantBrokers.has(b.broker))
        .map((b: any) => ({
            x: b.netVol,
            y: (b.netVol > 0 ? b.avgBuyPrice : b.avgSellPrice) || 0,
            broker: b.broker
        }));

    const scatterData = {
        datasets: [
            {
                label: 'Brokerage Points',
                data: scatterPoints,
                backgroundColor: (context: any) => {
                    const val = context.raw?.x;
                    return val > 0 ? 'rgba(239, 68, 68, 0.6)' : 'rgba(16, 185, 129, 0.6)';
                },
            }
        ]
    };

    const scatterOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            title: { display: true, text: 'Brokerage Points (Price vs Net Volume)' },
            tooltip: {
                callbacks: {
                    label: (context: any) => {
                        const point = context.raw;
                        return `${point.broker}: ${point.x} vol @ $${point.y.toFixed(2)}`;
                    }
                }
            }
        },
        scales: {
            x: {
                title: { display: true, text: 'Net Volume', color: '#94a3b8' },
                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                ticks: { color: '#94a3b8' }
            },
            y: {
                title: { display: true, text: 'Avg Price', color: '#94a3b8' },
                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                ticks: { color: '#94a3b8' }
            }
        }
    };

    return (
        <div className="charts-view">
            <div className="chart-scroll-container">
                <div className="chart-wrapper" style={{ width: `${chartWidth}px`, height: '500px' }}>
                    <Bar options={chartOptions} data={chartData} />
                </div>
            </div>

            <div className="chart-scroll-container" style={{ marginTop: '2rem' }}>
                <div className="chart-wrapper" style={{ width: `${chartWidth}px`, height: '500px' }}>
                    <Scatter options={scatterOptions} data={scatterData} />
                </div>
            </div>

            <h3 style={{ marginTop: '2rem' }}>Top 40 Buyers</h3>
            <div className="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Broker</th>
                            <th>Net Vol</th>
                            <th>Avg Buy</th>
                            <th>Avg Sell</th>
                        </tr>
                    </thead>
                    <tbody>
                        {topBuyers.map((row: any, i: number) => (
                            <tr key={i}>
                                <td>{row.broker}</td>
                                <td style={{ color: '#ef4444' }}>{row.netVol}</td>
                                <td>{row.avgBuyPrice.toFixed(2)}</td>
                                <td>{row.avgSellPrice.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <h3 style={{ marginTop: '2rem' }}>Top 40 Sellers</h3>
            <div className="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Broker</th>
                            <th>Net Vol</th>
                            <th>Avg Buy</th>
                            <th>Avg Sell</th>
                        </tr>
                    </thead>
                    <tbody>
                        {topSellers.map((row: any, i: number) => (
                            <tr key={i}>
                                <td>{row.broker}</td>
                                <td style={{ color: '#10b981' }}>{row.netVol}</td>
                                <td>{row.avgBuyPrice.toFixed(2)}</td>
                                <td>{row.avgSellPrice.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
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

export default BrokerageDashboard;
