import React, { useState, useMemo } from 'react';
import { Filter, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, X, Search, ChevronDown as ChevronDownIcon, ChevronUp as ChevronUpIcon } from 'lucide-react';
import type { BrokerData } from './Charts';
import './MarketOverview.scss';

interface MarketOverviewProps {
    data: BrokerData[];
}

type SortField = 'date' | 'company' | 'broker' | 'rating' | 'targetPrice' | 'upside';
type SortOrder = 'asc' | 'desc';

const ITEMS_PER_PAGE = 50;

const MarketOverview: React.FC<MarketOverviewProps> = ({ data }) => {
    const [selectedBroker, setSelectedBroker] = useState<string>('');
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [minUpside, setMinUpside] = useState<string>('');
    const [maxUpside, setMaxUpside] = useState<string>('');

    const [sortField, setSortField] = useState<SortField>('date');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedRow, setSelectedRow] = useState<BrokerData | null>(null);
    const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);

    // Get unique brokers for filter
    const brokers = useMemo(() => {
        const uniqueBrokers = new Set(data.map(d => d.broker).filter(Boolean));
        return Array.from(uniqueBrokers).sort();
    }, [data]);

    // Filter and sort data
    const processedData = useMemo(() => {
        let result = [...data];

        // Broker Filter
        if (selectedBroker) {
            result = result.filter(d => d.broker === selectedBroker);
        }

        // Date Range Filter
        if (startDate) {
            result = result.filter(d => new Date(d.date) >= new Date(startDate));
        }
        if (endDate) {
            result = result.filter(d => new Date(d.date) <= new Date(endDate));
        }

        // Search Filter (Company Name or Code)
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter(d =>
                (d.company && d.company.toLowerCase().includes(query)) ||
                (d.serialNumber && d.serialNumber.includes(query))
            );
        }

        // Upside Range Filter
        if (minUpside !== '') {
            result = result.filter(d => (d.upside * 100) >= parseFloat(minUpside));
        }
        if (maxUpside !== '') {
            result = result.filter(d => (d.upside * 100) <= parseFloat(maxUpside));
        }

        // Sorting
        result.sort((a, b) => {
            let valA: any = a[sortField];
            let valB: any = b[sortField];

            if (sortField === 'date') {
                valA = new Date(valA).getTime();
                valB = new Date(valB).getTime();
            }

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        return result;
    }, [data, selectedBroker, startDate, endDate, searchQuery, minUpside, maxUpside, sortField, sortOrder]);

    // Pagination logic
    const totalPages = Math.ceil(processedData.length / ITEMS_PER_PAGE);
    const paginatedData = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return processedData.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [processedData, currentPage]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('desc');
        }
    };

    const getSortIcon = (field: SortField) => {
        if (sortField !== field) return null;
        return sortOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />;
    };

    const getRatingClass = (rating: string) => {
        if (!rating) return 'neutral';
        if (rating.includes('買進') || rating.includes('優於大盤') || rating.includes('強烈買進')) return 'buy';
        if (rating.includes('賣出') || rating.includes('低於大盤')) return 'sell';
        return 'neutral';
    };

    return (
        <div className="market-overview">
            <div className="filters-bar">
                <div
                    className="filter-toggle-bar"
                    onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
                >
                    <span>Show Filters</span>
                    {isFiltersExpanded ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
                </div>

                <div className={`filters-content ${isFiltersExpanded ? 'expanded' : ''}`}>
                    {/* Search */}
                    <div className="filter-group search-group">
                        <Search size={18} />
                        <input
                            type="text"
                            placeholder="Search Code/Company..."
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            className="search-input"
                        />
                    </div>

                    {/* Broker Filter */}
                    <div className="filter-group">
                        <Filter size={18} />
                        <select
                            value={selectedBroker}
                            onChange={(e) => { setSelectedBroker(e.target.value); setCurrentPage(1); }}
                            className="filter-select"
                        >
                            <option value="">All Brokers</option>
                            {brokers.map(broker => (
                                <option key={broker} value={broker}>{broker}</option>
                            ))}
                        </select>
                    </div>

                    {/* Date Range */}
                    <div className="filter-group date-group">
                        <span className="label">Date:</span>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }}
                            className="date-input"
                        />
                        <span className="separator">to</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }}
                            className="date-input"
                        />
                    </div>

                    {/* Upside Range */}
                    <div className="filter-group upside-group">
                        <span className="label">Upside %:</span>
                        <input
                            type="number"
                            placeholder="Min"
                            value={minUpside}
                            onChange={(e) => { setMinUpside(e.target.value); setCurrentPage(1); }}
                            className="number-input"
                        />
                        <span className="separator">-</span>
                        <input
                            type="number"
                            placeholder="Max"
                            value={maxUpside}
                            onChange={(e) => { setMaxUpside(e.target.value); setCurrentPage(1); }}
                            className="number-input"
                        />
                    </div>

                    <div className="result-count">
                        Showing {processedData.length} reports
                    </div>
                </div>
            </div>

            <div className="table-container">
                <table>
                    <thead>
                        <tr>
                            <th onClick={() => handleSort('date')}>Date {getSortIcon('date')}</th>
                            <th onClick={() => handleSort('company')}>Company {getSortIcon('company')}</th>
                            <th onClick={() => handleSort('broker')}>Broker {getSortIcon('broker')}</th>
                            <th onClick={() => handleSort('rating')}>Rating {getSortIcon('rating')}</th>
                            <th onClick={() => handleSort('targetPrice')}>Target Price {getSortIcon('targetPrice')}</th>
                            <th onClick={() => handleSort('upside')}>Upside {getSortIcon('upside')}</th>
                            <th>Summary</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedData.map((row, index) => (
                            <tr key={index} onClick={() => setSelectedRow(row)} style={{ cursor: 'pointer' }}>
                                <td className="date-cell">{row.date}</td>
                                <td className="company-cell">{row.company}</td>
                                <td>{row.broker}</td>
                                <td>
                                    <span className={`rating-badge ${getRatingClass(row.rating)}`}>
                                        {row.rating}
                                    </span>
                                </td>
                                <td className="price-cell">{row.targetPrice > 0 ? row.targetPrice.toLocaleString() : '-'}</td>
                                <td className={`upside-cell ${row.upside > 0 ? 'positive' : row.upside < 0 ? 'negative' : ''}`}>
                                    {(row.upside * 100).toFixed(1)}%
                                </td>
                                <td className="summary-cell" title={row.summary}>{row.summary}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {
                totalPages > 1 && (
                    <div className="pagination">
                        <button
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            className="page-btn"
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <span className="page-info">
                            Page {currentPage} of {totalPages}
                        </span>
                        <button
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            className="page-btn"
                        >
                            <ChevronRight size={20} />
                        </button>
                    </div>
                )
            }

            {
                selectedRow && (
                    <div className="detail-modal" onClick={() => setSelectedRow(null)}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>{selectedRow.company}</h2>
                                <button className="close-btn" onClick={() => setSelectedRow(null)}>
                                    <X size={24} />
                                </button>
                            </div>
                            <div className="modal-body">
                                <div className="detail-grid">
                                    <div className="detail-item">
                                        <span className="label">發佈日期</span>
                                        <span className="value">{selectedRow.date}</span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="label">券商</span>
                                        <span className="value">{selectedRow.broker}</span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="label">序號</span>
                                        <span className="value">{selectedRow.serialNumber || 'N/A'}</span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="label">檔案來源</span>
                                        <span className="value">{selectedRow.fileSource || 'N/A'}</span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="label">投資建議</span>
                                        <span className={`value rating-badge ${getRatingClass(selectedRow.rating)}`}>
                                            {selectedRow.rating}
                                        </span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="label">目標價範圍</span>
                                        <span className="value">
                                            {selectedRow.targetPriceLow > 0 && selectedRow.targetPriceHigh > 0
                                                ? `${selectedRow.targetPriceLow.toLocaleString()} - ${selectedRow.targetPriceHigh.toLocaleString()}`
                                                : 'N/A'
                                            }
                                        </span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="label">平均目標價</span>
                                        <span className="value">
                                            {selectedRow.targetPrice > 0 ? selectedRow.targetPrice.toLocaleString() : 'N/A'}
                                        </span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="label">預測期間</span>
                                        <span className="value">{selectedRow.forecastPeriod || 'N/A'} 個月</span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="label">發佈日收盤價</span>
                                        <span className="value">
                                            {selectedRow.closePrice > 0 ? selectedRow.closePrice.toLocaleString() : 'N/A'}
                                        </span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="label">預估上漲空間</span>
                                        <span className={`value ${selectedRow.upside > 0 ? 'positive' : selectedRow.upside < 0 ? 'negative' : ''}`}>
                                            {selectedRow.upside !== 0 ? `${(selectedRow.upside * 100).toFixed(2)}%` : 'N/A'}
                                        </span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="label">EPS (Next)</span>
                                        <span className="value">
                                            {selectedRow.epsNext !== 0 ? selectedRow.epsNext.toFixed(2) : 'N/A'}
                                        </span>
                                    </div>
                                    <div className="detail-item">
                                        <span className="label">PE (Next)</span>
                                        <span className="value">
                                            {selectedRow.peNext > 0 ? selectedRow.peNext.toFixed(2) : 'N/A'}
                                        </span>
                                    </div>
                                </div>
                                <div className="summary-section">
                                    <h3>摘要</h3>
                                    <p>{selectedRow.summary || '無摘要資訊'}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default MarketOverview;
