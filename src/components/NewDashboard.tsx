import React, { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import { Search, ArrowRight, ChevronDown, ChevronUp, Calendar, Filter, ChevronLeft, Upload } from 'lucide-react';
import { useBrokerageData } from '../hooks/useBrokerageData';
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
import BrokerageDashboard from './BrokerageDashboard';
import Articles from './Articles';
import ErrorBoundary from './ErrorBoundary';
import FundBasicInfo from './FundBasicInfo';
import FundHistoricalRanking from './FundHistoricalRanking';
import './NewDashboard.scss';

// Types for Statistics
interface SheetData {
    stocks: any[];
    industries: any[];
    sub_industries: any[];
    related_industries: any[];
    related_groups: any[];
    industry_types: any[];
}

const NewDashboard: React.FC = () => {
    const [query, setQuery] = useState('2330');
    const [brokerData, setBrokerData] = useState<BrokerData[]>([]);
    const [filteredData, setFilteredData] = useState<BrokerData[]>([]);
    const [loading, setLoading] = useState(true);
    const [showLoadingScreen, setShowLoadingScreen] = useState(true);
    const [activeTab, setActiveTab] = useState('home'); // Default to home
    const [selectedCompany, setSelectedCompany] = useState('2330');
    const [isCollapsed, setIsCollapsed] = useState(() => {
        if (typeof window !== 'undefined') {
            return window.innerWidth <= 768;
        }
        return false;
    });
    const [isHeaderExpanded, setIsHeaderExpanded] = useState(false);

    // Dashboard Date Filter State
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Market Overview Filter State
    const [marketBroker, setMarketBroker] = useState<string>('');
    const [marketStartDate, setMarketStartDate] = useState<string>('');
    const [marketEndDate, setMarketEndDate] = useState<string>('');
    const [marketSearchQuery, setMarketSearchQuery] = useState<string>('');
    const [marketMinUpside, setMarketMinUpside] = useState<string>('');
    const [marketMaxUpside, setMarketMaxUpside] = useState<string>('');

    const [isMarketFiltersExpanded, setIsMarketFiltersExpanded] = useState(false);

    // Statistics Filter State
    const [statsViewMode, setStatsViewMode] = useState<'rankings' | 'all'>('rankings');
    const [statsTimePeriod, setStatsTimePeriod] = useState<'3y' | '5y'>('3y');
    const [statsSelectedSheet, setStatsSelectedSheet] = useState<string>('1月');
    const [statsAvailableSheets, setStatsAvailableSheets] = useState<string[]>([]);
    const [statsSelectedCategory, setStatsSelectedCategory] = useState<keyof SheetData>('stocks');
    const [statsSearchQuery, setStatsSearchQuery] = useState('');
    const [statsSelectedTimeframes, setStatsSelectedTimeframes] = useState<string[]>(['1月']);
    const [isStatsFiltersExpanded, setIsStatsFiltersExpanded] = useState(false);
    const [isStatsTimeframeDropdownOpen, setIsStatsTimeframeDropdownOpen] = useState(false);

    // Brokerage Data Hook
    const brokerage = useBrokerageData();
    const [isChipsFiltersExpanded, setIsChipsFiltersExpanded] = useState(false);

    // Constants for Statistics
    const allTimeframes = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月', 'Q1', 'Q2', 'Q3', 'Q4'];
    const statsCategories: { key: keyof SheetData; label: string }[] = [
        { key: 'stocks', label: 'Individual Stocks' },
        { key: 'industries', label: 'Industry' },
        { key: 'sub_industries', label: 'Sub-industry' },
        { key: 'related_industries', label: 'Related Industry' },
        { key: 'related_groups', label: 'Related Group' },
        { key: 'industry_types', label: 'Industry Type' },
    ];
    // Mock sheets for dropdown (in real app, this might come from data, but for UI we can hardcode or fetch)
    // Since Statistics.tsx fetches this, we might need to pass the available sheets up or just hardcode common ones if they are static.
    // Based on Statistics.tsx, it seems dynamic. For now, let's assume a standard set or wait for data.
    // Actually, Statistics.tsx fetches `rankingsData` which has keys. 
    // To properly populate the dropdown in parent, we might need to fetch data here or have Statistics pass it up.
    // For simplicity in this refactor, I will hardcode the months/quarters as they seem standard in `allTimeframes`, 
    // but `rankingsData` keys might be slightly different. 
    // Let's use a common list for now and assume it matches.
    // Mock sheets removed, now dynamic
    // const rankingSheets = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月', 'Q1', 'Q2', 'Q3', 'Q4', 'Yearly'];


    // Get unique brokers for Market Overview filter
    const brokers = useMemo(() => {
        const uniqueBrokers = new Set(brokerData.map(d => d.broker).filter(Boolean));
        return Array.from(uniqueBrokers).sort();
    }, [brokerData]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const response = await fetch(`${import.meta.env.BASE_URL}data/brokers.csv`);
                const blob = await response.blob();
                const arrayBuffer = await blob.arrayBuffer();

                let csvText = '';
                try {
                    const decoder = new TextDecoder('big5');
                    csvText = decoder.decode(arrayBuffer);
                } catch (e) {
                    console.warn('Big5 decoding failed, falling back to UTF-8');
                    const decoder = new TextDecoder('utf-8');
                    csvText = decoder.decode(arrayBuffer);
                }

                Papa.parse(csvText, {
                    complete: (results) => {
                        const parsedData: BrokerData[] = results.data.slice(1).map((row: any) => {
                            const targetPriceLow = parseFloat(row[4] ? row[4].replace(/,/g, '') : '0');
                            const targetPriceHigh = parseFloat(row[5] ? row[5].replace(/,/g, '') : '0');
                            const targetPrice = (targetPriceLow + targetPriceHigh) / 2;
                            const closePrice = parseFloat(row[7] ? row[7].replace(/,/g, '') : '0');
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

        let filtered = brokerData.filter(d =>
            d.company && d.company.toUpperCase().includes(selectedCompany.toUpperCase())
        );

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
            setSelectedCompany(searchQuery);
            setQuery(searchQuery);
            setActiveTab('dashboard');
        } else {
            alert('No results found for ' + searchQuery);
        }
    };

    const handleHeaderSearch = (e: React.FormEvent) => {
        e.preventDefault();
        handleSearch(query);
    };

    const displayCompanyName = useMemo(() => {
        if (filteredData.length === 0) return selectedCompany;
        const first = filteredData[0];
        if (first.company && !first.company.toUpperCase().includes(selectedCompany.toUpperCase())) {
            return selectedCompany;
        }
        const uniqueNames = Array.from(new Set(filteredData.map(d => d.company)));
        const chineseName = uniqueNames.find(name => /[\u4e00-\u9fa5]/.test(name));
        return chineseName || uniqueNames[0] || selectedCompany;
    }, [filteredData, selectedCompany]);

    const getRatingClass = (rating: string) => {
        if (!rating) return 'neutral';
        if (rating.includes('買進') || rating.includes('優於大盤') || rating.includes('強烈買進')) return 'buy';
        if (rating.includes('賣出') || rating.includes('低於大盤')) return 'sell';
        return 'neutral';
    };

    const getPageTitle = (tab: string) => {
        switch (tab) {
            case 'market': return 'Market Overview';
            case 'fund-basic': return 'Fund Basic Information';
            case 'fund-ranking': return 'Fund Historical Ranking';
            default: return tab.charAt(0).toUpperCase() + tab.slice(1);
        }
    };

    if (showLoadingScreen) {
        return <LoadingScreen onComplete={() => setShowLoadingScreen(false)} isLoading={loading} />;
    }

    return (
        <div className="new-dashboard">
            <div className={`dashboard-layout ${isCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
                <Sidebar
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    onLogout={() => setActiveTab('home')}
                    onLogoClick={() => setActiveTab('home')}
                    isCollapsed={isCollapsed}
                    setIsCollapsed={setIsCollapsed}
                />

                <div className="dashboard-container">
                    {activeTab === 'home' ? (
                        <div className="home-view">
                            <HeroSection onSearch={handleSearch} />
                        </div>
                    ) : (
                        <>
                            <header className="dashboard-header">
                                <div className="header-title">
                                    <h1>{getPageTitle(activeTab)}</h1>
                                </div>

                                <div
                                    className="filter-toggle-bar"
                                    onClick={() => {
                                        if (activeTab === 'market') setIsMarketFiltersExpanded(!isMarketFiltersExpanded);
                                        else if (activeTab === 'statistics') setIsStatsFiltersExpanded(!isStatsFiltersExpanded);
                                        else if (activeTab === 'chips') setIsChipsFiltersExpanded(!isChipsFiltersExpanded);
                                        else setIsHeaderExpanded(!isHeaderExpanded);
                                    }}
                                >
                                    <span>Show Filters</span>
                                    {(activeTab === 'market' ? isMarketFiltersExpanded : activeTab === 'statistics' ? isStatsFiltersExpanded : activeTab === 'chips' ? isChipsFiltersExpanded : isHeaderExpanded) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </div>

                                {activeTab === 'dashboard' && (
                                    <div className={`filters ${isHeaderExpanded ? 'expanded' : ''}`}>
                                        <div className="date-range">
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

                                {activeTab === 'market' && (
                                    <div className={`filters ${isMarketFiltersExpanded ? 'expanded' : ''}`}>
                                        {/* Search */}
                                        <div className="search-bar" style={{ width: 'auto' }}>
                                            <div style={{ position: 'relative' }}>
                                                <Search className="icon" size={18} style={{ left: '0.75rem', top: '50%', transform: 'translateY(-50%)', position: 'absolute', color: 'var(--text-secondary)' }} />
                                                <input
                                                    type="text"
                                                    placeholder="Search Code/Company..."
                                                    value={marketSearchQuery}
                                                    onChange={(e) => setMarketSearchQuery(e.target.value)}
                                                    style={{ paddingLeft: '2.5rem', width: '200px' }}
                                                    className="date-input"
                                                />
                                            </div>
                                        </div>

                                        {/* Broker Filter */}
                                        <div className="filter-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <Filter size={18} style={{ color: 'var(--text-secondary)' }} />
                                            <select
                                                value={marketBroker}
                                                onChange={(e) => setMarketBroker(e.target.value)}
                                                className="date-input"
                                                style={{ minWidth: '140px', cursor: 'pointer' }}
                                            >
                                                <option value="">All Brokers</option>
                                                {brokers.map(broker => (
                                                    <option key={broker} value={broker}>{broker}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Date Range */}
                                        <div className="date-range">
                                            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Date:</span>
                                            <input
                                                type="date"
                                                value={marketStartDate}
                                                onChange={(e) => setMarketStartDate(e.target.value)}
                                                className="date-input"
                                            />
                                            <span>to</span>
                                            <input
                                                type="date"
                                                value={marketEndDate}
                                                onChange={(e) => setMarketEndDate(e.target.value)}
                                                className="date-input"
                                            />
                                        </div>

                                        {/* Upside Range */}
                                        <div className="filter-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Upside %:</span>
                                            <input
                                                type="number"
                                                placeholder="Min"
                                                value={marketMinUpside}
                                                onChange={(e) => setMarketMinUpside(e.target.value)}
                                                className="date-input"
                                                style={{ width: '70px' }}
                                            />
                                            <span style={{ color: 'var(--text-secondary)' }}>-</span>
                                            <input
                                                type="number"
                                                placeholder="Max"
                                                value={marketMaxUpside}
                                                onChange={(e) => setMarketMaxUpside(e.target.value)}
                                                className="date-input"
                                                style={{ width: '70px' }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'statistics' && (
                                    <div className={`filters ${isStatsFiltersExpanded ? 'expanded' : ''}`}>
                                        {/* View Mode */}
                                        <div className="filter-group" style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button
                                                className={`date-input ${statsViewMode === 'rankings' ? 'active' : ''}`}
                                                onClick={() => setStatsViewMode('rankings')}
                                                style={{
                                                    background: statsViewMode === 'rankings' ? '#3b82f6' : 'var(--bg-secondary)',
                                                    color: statsViewMode === 'rankings' ? 'white' : 'var(--text-primary)',
                                                    cursor: 'pointer',
                                                    border: '1px solid var(--border-color)'
                                                }}
                                            >
                                                Rankings
                                            </button>
                                            <button
                                                className={`date-input ${statsViewMode === 'all' ? 'active' : ''}`}
                                                onClick={() => setStatsViewMode('all')}
                                                style={{
                                                    background: statsViewMode === 'all' ? '#3b82f6' : 'var(--bg-secondary)',
                                                    color: statsViewMode === 'all' ? 'white' : 'var(--text-primary)',
                                                    cursor: 'pointer',
                                                    border: '1px solid var(--border-color)'
                                                }}
                                            >
                                                All Stocks
                                            </button>
                                        </div>

                                        {/* Time Period */}
                                        <div className="filter-group">
                                            <select
                                                value={statsTimePeriod}
                                                onChange={(e) => setStatsTimePeriod(e.target.value as any)}
                                                className="date-input"
                                                style={{ cursor: 'pointer' }}
                                            >
                                                <option value="3y">Last 3 Years</option>
                                                <option value="5y">Last 5 Years</option>
                                            </select>
                                        </div>

                                        {/* Rankings Specific Filters */}
                                        {statsViewMode === 'rankings' && (
                                            <>
                                                <div className="filter-group">
                                                    <select
                                                        value={statsSelectedSheet}
                                                        onChange={(e) => setStatsSelectedSheet(e.target.value)}
                                                        className="date-input"
                                                        style={{ cursor: 'pointer' }}
                                                    >
                                                        {statsAvailableSheets.map(sheet => (
                                                            <option key={sheet} value={sheet}>{sheet}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="filter-group">
                                                    <select
                                                        value={statsSelectedCategory}
                                                        onChange={(e) => setStatsSelectedCategory(e.target.value as any)}
                                                        className="date-input"
                                                        style={{ cursor: 'pointer' }}
                                                    >
                                                        {statsCategories.map(cat => (
                                                            <option key={cat.key} value={cat.key}>{cat.label}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </>
                                        )}

                                        {/* All Stocks Specific Filters */}
                                        {statsViewMode === 'all' && (
                                            <div className="filter-group" style={{ position: 'relative' }}>
                                                <button
                                                    className="date-input"
                                                    onClick={() => setIsStatsTimeframeDropdownOpen(!isStatsTimeframeDropdownOpen)}
                                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: '150px', cursor: 'pointer' }}
                                                >
                                                    <span>{statsSelectedTimeframes.length > 0 ? `${statsSelectedTimeframes.length} selected` : 'Select Columns'}</span>
                                                    <ChevronDown size={14} />
                                                </button>

                                                {isStatsTimeframeDropdownOpen && (
                                                    <div className="dropdown-menu" style={{
                                                        position: 'absolute',
                                                        top: '100%',
                                                        left: 0,
                                                        zIndex: 100,
                                                        background: 'var(--bg-tertiary)',
                                                        border: '1px solid var(--border-color)',
                                                        borderRadius: '8px',
                                                        padding: '0.5rem',
                                                        marginTop: '0.5rem',
                                                        minWidth: '200px',
                                                        maxHeight: '300px',
                                                        overflowY: 'auto',
                                                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                                                    }}>
                                                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                                                            <button
                                                                onClick={() => setStatsSelectedTimeframes(allTimeframes)}
                                                                style={{ fontSize: '12px', padding: '2px 6px', background: '#3b82f6', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer' }}
                                                            >
                                                                All
                                                            </button>
                                                            <button
                                                                onClick={() => setStatsSelectedTimeframes([])}
                                                                style={{ fontSize: '12px', padding: '2px 6px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-primary)', cursor: 'pointer' }}
                                                            >
                                                                Clear
                                                            </button>
                                                        </div>
                                                        {allTimeframes.map(tf => (
                                                            <label key={tf} style={{ display: 'flex', alignItems: 'center', padding: '4px 0', cursor: 'pointer', color: 'var(--text-primary)' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={statsSelectedTimeframes.includes(tf)}
                                                                    onChange={(e) => {
                                                                        if (e.target.checked) {
                                                                            setStatsSelectedTimeframes([...statsSelectedTimeframes, tf]);
                                                                        } else {
                                                                            setStatsSelectedTimeframes(statsSelectedTimeframes.filter(t => t !== tf));
                                                                        }
                                                                    }}
                                                                    style={{ marginRight: '8px' }}
                                                                />
                                                                {tf}
                                                            </label>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Search */}
                                        <div className="search-bar" style={{ width: 'auto' }}>
                                            <div style={{ position: 'relative' }}>
                                                <Search className="icon" size={18} style={{ left: '0.75rem', top: '50%', transform: 'translateY(-50%)', position: 'absolute', color: 'var(--text-secondary)' }} />
                                                <input
                                                    type="text"
                                                    placeholder="Search..."
                                                    value={statsSearchQuery}
                                                    onChange={(e) => setStatsSearchQuery(e.target.value)}
                                                    style={{ paddingLeft: '2.5rem', width: '200px' }}
                                                    className="date-input"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'chips' && (
                                    <div className={`filters ${isChipsFiltersExpanded ? 'expanded' : ''}`}>
                                        <div className="filter-group">
                                            <label style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}><Calendar size={14} /> Start</label>
                                            <select
                                                value={brokerage.startDate}
                                                onChange={(e) => brokerage.setStartDate(e.target.value)}
                                                className="date-input"
                                                style={{ cursor: 'pointer' }}
                                            >
                                                {brokerage.dates.map(d => (
                                                    <option key={d} value={d}>{d}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="filter-group">
                                            <label style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}><Calendar size={14} /> End</label>
                                            <select
                                                value={brokerage.endDate}
                                                onChange={(e) => brokerage.setEndDate(e.target.value)}
                                                className="date-input"
                                                style={{ cursor: 'pointer' }}
                                            >
                                                {brokerage.dates.map(d => (
                                                    <option key={d} value={d}>{d}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="filter-group">
                                            <label style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}><Search size={14} /> Stock</label>
                                            <input
                                                type="text"
                                                value={brokerage.stockCode}
                                                onChange={(e) => brokerage.setStockCode(e.target.value)}
                                                placeholder="e.g. 2330"
                                                onKeyDown={(e) => e.key === 'Enter' && brokerage.handleSearch()}
                                                className="date-input"
                                                style={{ width: '100px' }}
                                            />
                                        </div>
                                        <div className="filter-group">
                                            <label style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Top N</label>
                                            <input
                                                type="number"
                                                value={brokerage.topN}
                                                onChange={(e) => brokerage.setTopN(Math.max(1, parseInt(e.target.value) || 1))}
                                                className="date-input"
                                                style={{ width: '60px' }}
                                            />
                                        </div>
                                        <button
                                            onClick={brokerage.handleSearch}
                                            disabled={brokerage.loading}
                                            className="date-input"
                                            style={{
                                                background: '#3b82f6',
                                                color: 'white',
                                                border: 'none',
                                                cursor: 'pointer',
                                                opacity: brokerage.loading ? 0.7 : 1
                                            }}
                                        >
                                            {brokerage.loading ? 'Loading...' : 'Search'}
                                        </button>
                                        <div style={{ width: '1px', height: '24px', background: 'var(--border-color)', margin: '0 0.5rem' }}></div>
                                        <label className="date-input" style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            cursor: 'pointer',
                                            background: 'rgba(59, 130, 246, 0.1)',
                                            color: '#3b82f6',
                                            border: '1px solid rgba(59, 130, 246, 0.2)'
                                        }}>
                                            <Upload size={14} />
                                            <span>Upload CSV</span>
                                            <input
                                                type="file"
                                                accept=".csv"
                                                onChange={brokerage.handleFileUpload}
                                                style={{ display: 'none' }}
                                            />
                                        </label>
                                    </div>
                                )}
                            </header>

                            <main className="dashboard-content">
                                {activeTab === 'dashboard' ? (
                                    <div className="analysis-view">
                                        <div className="company-header">
                                            <button className="back-btn" onClick={() => setActiveTab('home')}>
                                                <ArrowRight style={{ transform: 'rotate(180deg)' }} />
                                            </button>
                                            <h2>{displayCompanyName}</h2>
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
                                    <MarketOverview
                                        data={brokerData}
                                        filters={{
                                            broker: marketBroker,
                                            startDate: marketStartDate,
                                            endDate: marketEndDate,
                                            searchQuery: marketSearchQuery,
                                            minUpside: marketMinUpside,
                                            maxUpside: marketMaxUpside
                                        }}
                                        setFilters={{
                                            setBroker: setMarketBroker,
                                            setStartDate: setMarketStartDate,
                                            setEndDate: setMarketEndDate,
                                            setSearchQuery: setMarketSearchQuery,
                                            setMinUpside: setMarketMinUpside,
                                            setMaxUpside: setMarketMaxUpside
                                        }}
                                    />
                                ) : activeTab === 'statistics' ? (
                                    <Statistics
                                        filters={{
                                            viewMode: statsViewMode,
                                            timePeriod: statsTimePeriod,
                                            selectedSheet: statsSelectedSheet,
                                            selectedCategory: statsSelectedCategory,
                                            searchQuery: statsSearchQuery,
                                            selectedTimeframes: statsSelectedTimeframes
                                        }}
                                        setFilters={{
                                            setViewMode: setStatsViewMode,
                                            setTimePeriod: setStatsTimePeriod,
                                            setSelectedSheet: setStatsSelectedSheet,
                                            setSelectedCategory: setStatsSelectedCategory,
                                            setSearchQuery: setStatsSearchQuery,
                                            setSelectedTimeframes: setStatsSelectedTimeframes,
                                            setAvailableSheets: setStatsAvailableSheets
                                        }}
                                    />
                                ) : activeTab === 'chips' ? (
                                    <ErrorBoundary>
                                        <BrokerageDashboard
                                            data={brokerage.data}
                                            loading={brokerage.loading}
                                            error={brokerage.error}
                                            topN={brokerage.topN}
                                        />
                                    </ErrorBoundary>
                                ) : activeTab === 'articles' ? (
                                    <ErrorBoundary>
                                        <Articles />
                                    </ErrorBoundary>
                                ) : activeTab === 'fund-basic' ? (
                                    <FundBasicInfo />
                                ) : activeTab === 'fund-ranking' ? (
                                    <FundHistoricalRanking />
                                ) : (
                                    <div className="placeholder-view">
                                        Feature coming soon...
                                    </div>
                                )}
                            </main>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NewDashboard;
