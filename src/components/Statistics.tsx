import React, { useState, useEffect, useMemo } from 'react';
import { Search, Filter, ArrowUp, ArrowDown, LayoutGrid, List, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import './MarketOverview.scss'; // Reuse styles

interface RankingData {
    [key: string]: any; // Dynamic keys from Excel
}

interface SheetData {
    stocks: RankingData[];
    industries: RankingData[];
    sub_industries: RankingData[];
    related_industries: RankingData[];
    related_groups: RankingData[];
    industry_types: RankingData[];
}

interface RankingsMap {
    [sheetName: string]: SheetData;
}

interface StockInfo {
    代碼: string;
    名稱: string;
    產業別: string;
    相關產業: string;
    相關集團: string;
    市場: string;
    權證?: string;
    細產業列表?: string[];
    [key: string]: any;
}

interface RawStatData {
    [key: string]: any;
}

const Statistics: React.FC = () => {
    const [viewMode, setViewMode] = useState<'rankings' | 'all'>('rankings');
    const [timePeriod, setTimePeriod] = useState<'3y' | '5y'>('3y');
    const [selectedSheet, setSelectedSheet] = useState<string>('1月');
    const [selectedCategory, setSelectedCategory] = useState<keyof SheetData>('stocks');

    const [rankingsData, setRankingsData] = useState<RankingsMap>({});
    const [rawData, setRawData] = useState<RawStatData[]>([]);
    const [stockInfo, setStockInfo] = useState<StockInfo[]>([]);
    const [loading, setLoading] = useState(true);

    // Filter State
    const [isTimeframeDropdownOpen, setIsTimeframeDropdownOpen] = useState(false);
    const allTimeframes = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月', 'Q1', 'Q2', 'Q3', 'Q4'];
    const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>(['1月']);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalTitle, setModalTitle] = useState('');
    const [modalConstituents, setModalConstituents] = useState<StockInfo[]>([]);

    const [searchQuery, setSearchQuery] = useState('');
    const [sortField, setSortField] = useState<string>('');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 20;

    // Fetch data based on mode and time period
    useEffect(() => {
        setLoading(true);
        const suffix = timePeriod === '3y' ? '3y' : '5y';

        const fetchData = async () => {
            try {
                const promises: Promise<any>[] = [];

                // 1. Stock Info (if not loaded)
                if (stockInfo.length === 0) {
                    promises.push(
                        fetch(`${import.meta.env.BASE_URL}data/stock_info.json`)
                            .then(res => res.json())
                            .then(data => setStockInfo(data))
                    );
                }

                // 2. Raw Stats (always needed)
                promises.push(
                    fetch(`${import.meta.env.BASE_URL}data/raw_stats_${suffix}.json`)
                        .then(res => res.json())
                        .then((data: RawStatData[]) => setRawData(data))
                );

                // 3. Rankings (only if in rankings mode)
                if (viewMode === 'rankings') {
                    promises.push(
                        fetch(`${import.meta.env.BASE_URL}data/rankings_${suffix}.json`)
                            .then(res => res.json())
                            .then((data: RankingsMap) => {
                                setRankingsData(data);
                                // Reset selected sheet if needed
                                const sheets = Object.keys(data);
                                if (sheets.length > 0 && !sheets.includes(selectedSheet)) {
                                    setSelectedSheet(sheets[0]);
                                }
                            })
                    );
                }

                await Promise.all(promises);
            } catch (err) {
                console.error("Failed to load data:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [viewMode, timePeriod, stockInfo.length]);

    // Determine data to display
    const currentData = useMemo(() => {
        if (viewMode === 'rankings') {
            const sheet = rankingsData[selectedSheet];
            if (!sheet) return [];

            let data = sheet[selectedCategory] || [];

            // Enrich 'stocks' category with Industry and Sub-industry
            if (selectedCategory === 'stocks') {
                return data.map(item => {
                    const code = String(item['代號']); // Rankings use '代號', ensure it's a string
                    const info = stockInfo.find(s => String(s['代碼']) === code);
                    const raw = rawData.find(r => String(r['代碼']).split('.')[0] === code);

                    return {
                        ...item,
                        'Industry': info ? info['產業別'] : '-',
                        'Sub-industries': raw && raw['細產業列表'] ? raw['細產業列表'] : []
                    };
                });
            }

            return data;
        } else {
            return rawData;
        }
    }, [viewMode, rankingsData, selectedSheet, selectedCategory, rawData, stockInfo]);

    // Dynamic columns
    const columns = useMemo(() => {
        if (currentData.length === 0) return [];
        const firstRow = currentData[0];

        // Fixed columns that should always be shown
        const fixedColumns = ['代碼', '商品', '產業', '細產業列表'];

        return Object.keys(firstRow)
            .filter(key => {
                // Always show fixed columns
                if (fixedColumns.includes(key)) return true;

                // Filter out unwanted columns
                if (key.startsWith('Unnamed') || key === '細產業') return false;

                // For other columns (stats), check if they match selected timeframes
                if (viewMode === 'all') {
                    if (selectedTimeframes.length === 0) return false;
                    return selectedTimeframes.some(tf => key.startsWith(tf));
                }

                return true;
            })
            .map(key => ({
                key,
                label: key === '細產業列表' ? 'Sub-industries' : (key === '產業' ? 'Industry' : key) // Rename for display
            }));
    }, [currentData, viewMode, selectedTimeframes]);

    // Filter and Sort
    const processedData = useMemo(() => {
        let result = [...currentData];

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter(d =>
                Object.values(d).some(val => String(val).toLowerCase().includes(query))
            );
        }

        if (sortField) {
            result.sort((a, b) => {
                let valA = (a as any)[sortField];
                let valB = (b as any)[sortField];
                if (typeof valA === 'string' && !isNaN(parseFloat(valA))) valA = parseFloat(valA);
                if (typeof valB === 'string' && !isNaN(parseFloat(valB))) valB = parseFloat(valB);
                if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
                if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [currentData, searchQuery, sortField, sortOrder]);

    // Pagination
    const totalPages = Math.ceil(processedData.length / ITEMS_PER_PAGE);
    const paginatedData = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return processedData.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [processedData, currentPage]);

    const handleSort = (field: string) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('desc');
        }
    };

    // Handle Row Click for Constituents
    const handleRowClick = (row: any) => {
        if (viewMode !== 'rankings' || selectedCategory === 'stocks') return;

        // Identify the category name key based on selectedCategory
        let categoryName = '';
        if (selectedCategory === 'industries') categoryName = row['產業'];
        else if (selectedCategory === 'sub_industries') categoryName = row['細產業'];
        else if (selectedCategory === 'related_industries') categoryName = row['相關產業'];
        else if (selectedCategory === 'related_groups') categoryName = row['相關集團'];
        else if (selectedCategory === 'industry_types') categoryName = row['產業別'];

        if (!categoryName) return;

        setModalTitle(categoryName);

        // Normalize name (remove 上市/上櫃 for matching)
        const normalizedName = categoryName.replace(/^(上市|上櫃)/, '');

        let constituents: StockInfo[] = [];

        if (selectedCategory === 'sub_industries') {
            // For Sub-industries, we must look at rawData because stockInfo doesn't have this granular data
            // Find all stocks in rawData that have this sub-industry in their '細產業列表'
            const matchingRawStocks = rawData.filter(d => {
                const subIndustries = d['細產業列表'];
                return Array.isArray(subIndustries) && subIndustries.includes(normalizedName);
            });

            // Now map these back to stockInfo to get names and other details
            constituents = matchingRawStocks.map(raw => {
                const rawCode = String(raw['代碼']).split('.')[0];
                const info = stockInfo.find(s => s['代碼'] === rawCode);
                // If info found, merge. If not, create a basic object from raw
                return info ? { ...info, ...raw } : {
                    代碼: rawCode,
                    名稱: raw['商品'],
                    產業別: '-',
                    相關產業: '-',
                    相關集團: '-',
                    市場: '-',
                    ...raw
                } as StockInfo;
            });
        } else {
            // For other categories, filter stockInfo as before
            constituents = stockInfo.filter(stock => {
                // Check various fields for match
                const industryMatch = stock['產業別'] && stock['產業別'].includes(normalizedName);
                const relatedMatch = stock['相關產業'] && stock['相關產業'].includes(normalizedName);
                const groupMatch = stock['相關集團'] && stock['相關集團'].includes(normalizedName);

                // Strict market check if category name specified it
                let marketMatch = true;
                if (categoryName.startsWith('上市')) marketMatch = stock['市場'] === '市';
                if (categoryName.startsWith('上櫃')) marketMatch = stock['市場'] === '櫃';

                return (industryMatch || relatedMatch || groupMatch) && marketMatch;
            });

            // Enrich with raw stats
            constituents = constituents.map(stock => {
                const stats = rawData.find(d => {
                    const rawCode = String(d['代碼']).split('.')[0]; // Remove .TW suffix
                    return rawCode === String(stock['代碼']);
                });
                return { ...stock, ...stats };
            });
        }

        setModalConstituents(constituents);
        setIsModalOpen(true);
    };

    const categories: { key: keyof SheetData; label: string }[] = [
        { key: 'stocks', label: 'Individual Stocks' },
        { key: 'industries', label: 'Industry' },
        { key: 'sub_industries', label: 'Sub-industry' },
        { key: 'related_industries', label: 'Related Industry' },
        { key: 'related_groups', label: 'Related Group' },
        { key: 'industry_types', label: 'Industry Type' },
    ];

    // Helper to get columns for modal based on selectedSheet
    const getModalColumns = () => {
        const baseCols = [
            { key: '代碼', label: 'Code' },
            { key: '名稱', label: 'Name' },
            { key: '產業別', label: 'Industry' },
            { key: '細產業列表', label: 'Sub-industries' }, // Updated to use new list field
            { key: '權證', label: 'Warrants' }, // Added Warrants
            { key: '市場', label: 'Market' },
        ];

        // Add dynamic stats columns based on selectedSheet (e.g., "1月" -> "1月上漲%", "1月漲跌幅")
        const prefix = selectedSheet;
        const statCols = [
            { key: `${prefix}上漲%`, label: 'Rise %' },
            { key: `${prefix}漲跌幅`, label: 'Change %' },
            { key: `${prefix}平均漲幅`, label: 'Avg Rise' } // Optional, check if exists
        ];

        return [...baseCols, ...statCols];
    };

    const modalColumns = getModalColumns();

    if (loading) {
        return (
            <div className="market-overview" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
                <div style={{ color: '#94a3b8' }}>Loading data...</div>
            </div>
        );
    }

    return (
        <div className="market-overview">
            <div className="filters-bar">
                {/* View Mode Toggle */}
                <div className="filter-group">
                    <button
                        className={`mode-btn ${viewMode === 'rankings' ? 'active' : ''}`}
                        onClick={() => { setViewMode('rankings'); setCurrentPage(1); }}
                        style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '8px',
                            border: '1px solid rgba(255,255,255,0.1)',
                            background: viewMode === 'rankings' ? '#3b82f6' : 'rgba(15, 23, 42, 0.6)',
                            color: 'white',
                            cursor: 'pointer',
                            marginRight: '0.5rem',
                            display: 'flex',
                            alignItems: 'center'
                        }}
                    >
                        <LayoutGrid size={16} style={{ marginRight: '0.5rem' }} />
                        Rankings
                    </button>
                    <button
                        className={`mode-btn ${viewMode === 'all' ? 'active' : ''}`}
                        onClick={() => { setViewMode('all'); setCurrentPage(1); }}
                        style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '8px',
                            border: '1px solid rgba(255,255,255,0.1)',
                            background: viewMode === 'all' ? '#3b82f6' : 'rgba(15, 23, 42, 0.6)',
                            color: 'white',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center'
                        }}
                    >
                        <List size={16} style={{ marginRight: '0.5rem' }} />
                        All Stocks
                    </button>
                </div>

                {/* Time Period Filter */}
                <div className="filter-group">
                    <Filter size={18} />
                    <select
                        value={timePeriod}
                        onChange={(e) => { setTimePeriod(e.target.value as any); setCurrentPage(1); }}
                        className="filter-select"
                    >
                        <option value="3y">Last 3 Years</option>
                        <option value="5y">Last 5 Years</option>
                    </select>
                </div>

                {/* Sheet Filter (Only for Rankings) */}
                {viewMode === 'rankings' && (
                    <>
                        <div className="filter-group">
                            <Filter size={18} />
                            <select
                                value={selectedSheet}
                                onChange={(e) => { setSelectedSheet(e.target.value); setCurrentPage(1); }}
                                className="filter-select"
                            >
                                {Object.keys(rankingsData).map(sheet => (
                                    <option key={sheet} value={sheet}>{sheet}</option>
                                ))}
                            </select>
                        </div>

                        <div className="filter-group">
                            <Filter size={18} />
                            <select
                                value={selectedCategory}
                                onChange={(e) => { setSelectedCategory(e.target.value as any); setCurrentPage(1); }}
                                className="filter-select"
                            >
                                {categories.map(cat => (
                                    <option key={cat.key} value={cat.key}>{cat.label}</option>
                                ))}
                            </select>
                        </div>
                    </>
                )}

                {/* Timeframe Filter (Only for All Stocks) */}
                {viewMode === 'all' && (
                    <div className="filter-group" style={{ position: 'relative' }}>
                        <button
                            className="filter-select"
                            onClick={() => setIsTimeframeDropdownOpen(!isTimeframeDropdownOpen)}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: '150px', cursor: 'pointer' }}
                        >
                            <span>{selectedTimeframes.length > 0 ? `${selectedTimeframes.length} selected` : 'Select Columns'}</span>
                            <ChevronDown size={14} />
                        </button>

                        {isTimeframeDropdownOpen && (
                            <div className="dropdown-menu" style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                zIndex: 100,
                                background: '#1e293b',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '8px',
                                padding: '0.5rem',
                                marginTop: '0.5rem',
                                minWidth: '200px',
                                maxHeight: '300px',
                                overflowY: 'auto',
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                            }}>
                                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                    <button
                                        onClick={() => setSelectedTimeframes(allTimeframes)}
                                        style={{ fontSize: '12px', padding: '2px 6px', background: '#3b82f6', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer' }}
                                    >
                                        All
                                    </button>
                                    <button
                                        onClick={() => setSelectedTimeframes([])}
                                        style={{ fontSize: '12px', padding: '2px 6px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer' }}
                                    >
                                        Clear
                                    </button>
                                </div>
                                {allTimeframes.map(tf => (
                                    <label key={tf} style={{ display: 'flex', alignItems: 'center', padding: '4px 0', cursor: 'pointer', color: 'white' }}>
                                        <input
                                            type="checkbox"
                                            checked={selectedTimeframes.includes(tf)}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedTimeframes([...selectedTimeframes, tf]);
                                                } else {
                                                    setSelectedTimeframes(selectedTimeframes.filter(t => t !== tf));
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

                <div className="filter-group search-group">
                    <Search size={18} />
                    <input
                        type="text"
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                        className="search-input"
                    />
                </div>
                <div className="result-count">
                    Showing {processedData.length} records
                </div>
            </div>

            <div className="table-container">
                <table>
                    <thead>
                        <tr>
                            {columns.map(col => (
                                <th key={col.key} onClick={() => handleSort(col.key)} style={{ whiteSpace: 'nowrap' }}>
                                    {col.label} {sortField === col.key && (sortOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedData.map((row, index) => (
                            <tr
                                key={index}
                                onClick={() => handleRowClick(row)}
                                style={{
                                    cursor: (viewMode === 'rankings' && selectedCategory !== 'stocks') ? 'pointer' : 'default'
                                }}
                                className={(viewMode === 'rankings' && selectedCategory !== 'stocks') ? 'clickable-row' : ''}
                            >
                                {columns.map(col => {
                                    const val = (row as any)[col.key];
                                    let displayVal: any = val;
                                    let className = '';

                                    // Handle array values (e.g. sub-industries)
                                    if (Array.isArray(displayVal)) {
                                        displayVal = displayVal.join(', ');
                                    }

                                    // Basic styling logic
                                    if (typeof val === 'number' || (typeof val === 'string' && !isNaN(parseFloat(val)) && String(val).includes('%'))) {
                                        className = 'upside-cell';
                                        const num = parseFloat(String(val).replace('%', ''));
                                        if (num > 0) className += ' positive';
                                        if (num < 0) className += ' negative';
                                    }

                                    return (
                                        <td key={col.key} className={className}>
                                            {displayVal}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="pagination">
                    <button
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        className="page-btn"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <span className="page-info">Page {currentPage} of {totalPages}</span>
                    <button
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        className="page-btn"
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>
            )}

            {/* Constituents Modal */}
            {isModalOpen && (
                <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', width: '95%' }}>
                        <div className="modal-header">
                            <h2>{modalTitle} - Constituents ({modalConstituents.length})</h2>
                            <button className="close-btn" onClick={() => setIsModalOpen(false)}>×</button>
                        </div>
                        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                            {modalConstituents.length > 0 ? (
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                            {modalColumns.map(col => (
                                                <th key={col.key} style={{ padding: '0.75rem', textAlign: 'left', whiteSpace: 'nowrap' }}>
                                                    {col.label}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {modalConstituents.map(stock => (
                                            <tr key={stock['代碼']} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                {modalColumns.map(col => {
                                                    const val = stock[col.key];
                                                    let displayVal: any = val !== undefined ? val : '-';

                                                    // Handle array values (e.g. sub-industries)
                                                    if (Array.isArray(displayVal)) {
                                                        displayVal = displayVal.join(', ');
                                                    }

                                                    let color = 'inherit';

                                                    // Colorize stats
                                                    if (col.key.includes('漲') || col.key.includes('跌') || col.key.includes('%')) {
                                                        const num = parseFloat(String(displayVal).replace('%', ''));
                                                        if (!isNaN(num)) {
                                                            if (num > 0) color = '#ef4444'; // Red for up (Taiwan style)
                                                            if (num < 0) color = '#22c55e'; // Green for down
                                                        }
                                                    }

                                                    return (
                                                        <td key={col.key} style={{ padding: '0.75rem', color }}>
                                                            {displayVal}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                                    No constituents found matching this category.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Statistics;
