import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { Search, ArrowRight } from 'lucide-react';
import {
    SimpleScatterChart,
    HistogramChart,
    LatestBarChart,
    RatingDistribution,
    type BrokerData
} from './Charts';
import LoadingScreen from './LoadingScreen';
import HeroSection from './HeroSection';
import Sidebar from './Sidebar';
import MarketOverview from './MarketOverview';
import Statistics from './Statistics';
import './NewDashboard.scss';

const NewDashboard: React.FC = () => {
    const [query, setQuery] = useState('');
    const [brokerData, setBrokerData] = useState<BrokerData[]>([]);
    const [filteredData, setFilteredData] = useState<BrokerData[]>([]);
    const [loading, setLoading] = useState(true);
    const [showLoadingScreen, setShowLoadingScreen] = useState(true);
    const [viewMode, setViewMode] = useState<'hero' | 'dashboard'>('hero');
    const [activeTab, setActiveTab] = useState('dashboard');
    const [selectedCompany, setSelectedCompany] = useState('');

    // Date Filter State
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            try {
                const response = await fetch(`${import.meta.env.BASE_URL}data/brokers.csv`);
                const csvText = await response.text();

                Papa.parse(csvText, {
                    complete: (results) => {
                        console.log('First 5 raw rows:', results.data.slice(1, 6)); // Log first 5 data rows
                        const parsedData: BrokerData[] = results.data.slice(1).map((row: any) => {
                            const targetPriceLow = parseFloat(row[4] ? row[4].replace(/,/g, '') : '0');
                            const targetPriceHigh = parseFloat(row[5] ? row[5].replace(/,/g, '') : '0');
                            const targetPrice = (targetPriceLow + targetPriceHigh) / 2;
                            const closePrice = parseFloat(row[7] ? row[7].replace(/,/g, '') : '0');
                            // Fix percentage logic: divide by 100 to get decimal (e.g. 10% -> 0.1)
                            const upside = parseFloat(row[8] ? row[8].replace('%', '') : '0') / 100;
                            const epsNext = parseFloat(row[19]);
                            const peNext = parseFloat(row[21]);

                            return {
                                company: row[0] || '',
                                date: row[1],
                                serialNumber: row[2] || '',
                                broker: row[3],
                                targetPriceLow: isNaN(targetPriceLow) ? 0 : targetPriceLow,
                                targetPriceHigh: isNaN(targetPriceHigh) ? 0 : targetPriceHigh,
                                targetPrice: isNaN(targetPrice) ? 0 : targetPrice,
                                forecastPeriod: row[6] || '',
                                closePrice: isNaN(closePrice) ? 0 : closePrice,
                                upside: isNaN(upside) ? 0 : upside,
                                rating: row[9],
                                summary: row[22],
                                fileSource: row[23] || '',
                                epsNext: isNaN(epsNext) ? 0 : epsNext,
                                peNext: isNaN(peNext) ? 0 : peNext,
                            };
                        }).filter((item: BrokerData) => item.company);


                        setBrokerData(parsedData);
                        setLoading(false);
                    },
                    header: false,
                    skipEmptyLines: true
                });
            } catch (error) {
                console.error('Error loading data:', error);
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    // Effect to filter data when date range or selected company changes
    useEffect(() => {
        if (!selectedCompany) return;

        let filtered = brokerData.filter(d => d.company === selectedCompany);

        if (startDate) {
            filtered = filtered.filter(d => new Date(d.date) >= new Date(startDate));
        }

        if (endDate) {
            filtered = filtered.filter(d => new Date(d.date) <= new Date(endDate));
        }

        setFilteredData(filtered);
    }, [startDate, endDate, selectedCompany, brokerData]);

    const handleSearch = (searchQuery: string) => {
        if (!searchQuery.trim()) return;

        const matched = brokerData.filter(d =>
            d.company && (d.company.includes(searchQuery) || d.company.includes(searchQuery.toUpperCase()))
        );

        if (matched.length > 0) {
            const company = matched[0].company;
            setSelectedCompany(company);
            setQuery(searchQuery); // Sync query state
            // Initial filter will be triggered by useEffect
            setViewMode('dashboard');
        } else {
            alert('No results found for ' + searchQuery);
        }
    };

    // Handle internal search in dashboard header
    const handleHeaderSearch = (e: React.FormEvent) => {
        e.preventDefault();
        handleSearch(query);
    };

    const getRatingClass = (rating: string) => {
        if (!rating) return 'neutral';
        if (rating.includes('買進') || rating.includes('優於大盤') || rating.includes('強烈買進')) return 'buy';
        if (rating.includes('賣出') || rating.includes('低於大盤')) return 'sell';
        return 'neutral';
    };

    if (showLoadingScreen) {
        return <LoadingScreen onComplete={() => setShowLoadingScreen(false)} isLoading={loading} />;
    }



    return (
        <div className="new-dashboard">
            {viewMode === 'hero' ? (
                <HeroSection onSearch={handleSearch} />
            ) : (
                <div className="dashboard-layout" style={{ display: 'flex', width: '100%', minHeight: '100vh' }}>
                    <Sidebar
                        activeTab={activeTab}
                        onTabChange={setActiveTab}
                        onLogout={() => setViewMode('hero')}
                        onLogoClick={() => setViewMode('hero')}
                    />

                    <div className="dashboard-container" style={{ flex: 1, overflow: 'hidden' }}>
                        <header className="dashboard-header">
                            <div className="header-title">
                                <h1>{activeTab === 'market' ? 'Market Overview' : activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h1>
                            </div>

                            {activeTab === 'dashboard' && (
                                <div className="filters" style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
                                    <div className="date-range" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: '#94a3b8' }}>
                                        <input
                                            type="date"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            className="date-input"
                                        />
                                        <span>to</span>
                                        <input
                                            type="date"
                                            value={endDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                            className="date-input"
                                        />
                                    </div>
                                    <div className="search-bar">
                                        <form onSubmit={handleHeaderSearch}>
                                            <Search className="icon" size={18} />
                                            <input
                                                type="text"
                                                placeholder="Search stock..."
                                                value={query}
                                                onChange={(e) => setQuery(e.target.value)}
                                            />
                                        </form>
                                    </div>
                                </div>
                            )}
                        </header>

                        <main className="dashboard-content">
                            {activeTab === 'dashboard' ? (
                                <div className="analysis-view">
                                    <div className="company-header">
                                        <button className="back-btn" onClick={() => setViewMode('hero')}>
                                            <ArrowRight style={{ transform: 'rotate(180deg)' }} />
                                        </button>
                                        <h2>{selectedCompany}</h2>
                                        <span className="badge">TWSE</span>
                                        <span className="badge" style={{ marginLeft: '0.5rem', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
                                            {filteredData.length} Reports
                                        </span>
                                    </div>

                                    <div className="charts-grid">
                                        {/* Row 1: Scatters */}
                                        <div className="chart-card">
                                            <h3>Target Price vs Upside</h3>
                                            <SimpleScatterChart
                                                data={filteredData}
                                                xKey="targetPrice" yKey="upside"
                                                xLabel="Target Price" yLabel="Upside (%)"
                                                color="#3b82f6" isPercentage={true}
                                            />
                                        </div>
                                        <div className="chart-card">
                                            <h3>EPS vs PE (Next Year)</h3>
                                            <SimpleScatterChart
                                                data={filteredData}
                                                xKey="epsNext" yKey="peNext"
                                                xLabel="EPS (Next)" yLabel="PE (Next)"
                                                color="#8b5cf6"
                                            />
                                        </div>

                                        {/* Row 2: Histograms */}
                                        <div className="chart-card">
                                            <h3>Target Price Distribution</h3>
                                            <HistogramChart data={filteredData} dataKey="targetPrice" color="#06b6d4" />
                                        </div>
                                        <div className="chart-card">
                                            <h3>PE Distribution</h3>
                                            <HistogramChart data={filteredData} dataKey="peNext" color="#10b981" />
                                        </div>
                                        <div className="chart-card">
                                            <h3>Rating Distribution</h3>
                                            <RatingDistribution data={filteredData} />
                                        </div>

                                        {/* Row 3: Latest Bars */}
                                        <div className="chart-card full-width">
                                            <h3>Latest Target Price by Broker</h3>
                                            <LatestBarChart data={filteredData} dataKey="targetPrice" label="Target Price" color="#06b6d4" />
                                        </div>
                                        <div className="chart-card full-width">
                                            <h3>Latest EPS by Broker</h3>
                                            <LatestBarChart data={filteredData} dataKey="epsNext" label="EPS (Next)" color="#10b981" />
                                        </div>
                                        <div className="chart-card full-width">
                                            <h3>Latest PE by Broker</h3>
                                            <LatestBarChart data={filteredData} dataKey="peNext" label="PE (Next)" color="#ef4444" />
                                        </div>
                                    </div>

                                    <div className="summary-section">
                                        <h3>Latest Analyst Summaries</h3>
                                        <div className="summary-list">
                                            {filteredData
                                                .filter(d => d.summary && d.summary.trim() !== '' && !d.summary.includes('#DIV/0!') && !d.summary.includes('#VALUE!'))
                                                .slice(0, 5)
                                                .map((item, index) => (
                                                    <div key={index} className="summary-card">
                                                        <div className="meta">
                                                            <span className="date">{item.date}</span>
                                                            <span className="broker">{item.broker}</span>
                                                            <span className={`rating ${getRatingClass(item.rating)}`}>
                                                                {item.rating}
                                                            </span>
                                                        </div>
                                                        <div className="content">
                                                            {item.summary}
                                                        </div>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                </div>
                            ) : activeTab === 'market' ? (
                                <MarketOverview data={brokerData} />
                            ) : activeTab === 'statistics' ? (
                                <Statistics />
                            ) : (
                                <div className="placeholder-view" style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    height: '100%',
                                    color: '#94a3b8',
                                    fontSize: '1.5rem'
                                }}>
                                    Feature coming soon...
                                </div>
                            )}
                        </main>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NewDashboard;
