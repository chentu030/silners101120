import React, { useEffect, useState, useMemo } from 'react';
import Papa from 'papaparse';
import { Search, X, Tag as TagIcon, Calendar, MessageSquare, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Database, RefreshCw } from 'lucide-react';
import { getArticles, saveArticles } from '../utils/db';
import './Articles.scss';

interface ArticleData {
    處理時間: string;
    原始檔案: string;
    原始檔案上傳時間: string;
    來源資料夾: string;
    SUMMARY: string;
    判斷: string;
    理由: string;
    KEY_POINTS: string;
    TAGS: string;
    id?: string;
}

const Articles: React.FC = () => {
    const [articles, setArticles] = useState<ArticleData[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingStatus, setLoadingStatus] = useState('Initializing...');
    const [isBackgroundLoading, setIsBackgroundLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedArticle, setSelectedArticle] = useState<ArticleData | null>(null);

    // Pagination & Filter State
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 30;
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedTagFilter, setSelectedTagFilter] = useState('');
    const [availableTags, setAvailableTags] = useState<string[]>([]);

    useEffect(() => {
        console.log('Articles component mounted');
        const loadData = async () => {
            try {
                setLoadingStatus('Checking for updates...');

                // 1. Check Last-Modified header from server
                const headResponse = await fetch('data/history.csv', { method: 'HEAD' });
                const serverLastModified = headResponse.headers.get('Last-Modified');

                // 2. Check IndexedDB
                const cachedData = await getArticles();

                if (cachedData && serverLastModified && cachedData.lastModified === serverLastModified) {
                    console.log('Loading from cache...');
                    setLoadingStatus('Loading from cache...');
                    processData(cachedData.data);
                } else {
                    console.log('Cache miss or stale. Fetching fresh data...');
                    setLoadingStatus('Downloading data...');

                    let allData: ArticleData[] = [];
                    let isFirstChunk = true;

                    // 3. Fetch and Parse with Progressive Loading
                    Papa.parse('data/history.csv', {
                        download: true,
                        header: true,
                        skipEmptyLines: true,
                        worker: false, // Disabled worker to prevent dev server issues
                        chunk: (results) => {
                            const chunkData = (results.data as ArticleData[]).filter(
                                item => item.SUMMARY && item.原始檔案上傳時間
                            );

                            if (chunkData.length > 0) {
                                allData = allData.concat(chunkData);

                                // If this is the first chunk, render it immediately
                                if (isFirstChunk) {
                                    // Sort the first chunk to ensure top items are correct
                                    chunkData.sort((a, b) => {
                                        return new Date(b.原始檔案上傳時間).getTime() - new Date(a.原始檔案上傳時間).getTime();
                                    });

                                    setArticles(chunkData);
                                    processTags(chunkData);
                                    setLoading(false);
                                    setIsBackgroundLoading(true);
                                    isFirstChunk = false;
                                }
                            }
                        },
                        complete: async () => {
                            console.log('Download complete. Processing full dataset...');

                            // Sort full dataset
                            allData.sort((a, b) => {
                                return new Date(b.原始檔案上傳時間).getTime() - new Date(a.原始檔案上傳時間).getTime();
                            });

                            // Update with full data
                            setArticles(allData);
                            processTags(allData);
                            setIsBackgroundLoading(false);

                            // Save to Cache
                            if (serverLastModified) {
                                console.log('Saving to IndexedDB...');
                                await saveArticles(allData, serverLastModified);
                                console.log('Saved to IndexedDB');
                            }
                        },
                        error: (error: Error) => {
                            console.error('Error parsing CSV:', error);
                            setLoadingStatus('Error loading data.');
                            setLoading(false);
                            setIsBackgroundLoading(false);
                        }
                    });
                }
            } catch (error) {
                console.error('Error in data loading flow:', error);
                setLoadingStatus('Error initializing.');
                setLoading(false);
            }
        };

        loadData();
    }, []);

    const processTags = (data: ArticleData[]) => {
        const tags = new Set<string>();
        data.forEach(article => {
            if (article.TAGS) {
                article.TAGS.split(',').forEach(tag => tags.add(tag.trim()));
            }
        });
        setAvailableTags(Array.from(tags).sort());
    };

    const processData = (data: ArticleData[]) => {
        setArticles(data);
        processTags(data);
        setLoading(false);
    };

    // Reset page when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, startDate, endDate, selectedTagFilter]);

    const filteredArticles = useMemo(() => {
        return articles.filter(article => {
            // 1. Search Term
            const matchesSearch = !searchTerm ||
                article.SUMMARY.toLowerCase().includes(searchTerm.toLowerCase()) ||
                article.TAGS?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                article.KEY_POINTS?.toLowerCase().includes(searchTerm.toLowerCase());

            // 2. Date Range
            let matchesDate = true;
            if (startDate || endDate) {
                const articleDate = new Date(article.原始檔案上傳時間);
                if (startDate) {
                    matchesDate = matchesDate && articleDate >= new Date(startDate);
                }
                if (endDate) {
                    // Set end date to end of day
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    matchesDate = matchesDate && articleDate <= end;
                }
            }

            // 3. Tag Filter
            const matchesTag = !selectedTagFilter || article.TAGS?.includes(selectedTagFilter);

            return matchesSearch && matchesDate && matchesTag;
        });
    }, [articles, searchTerm, startDate, endDate, selectedTagFilter]);

    // Pagination Logic
    const totalPages = Math.ceil(filteredArticles.length / itemsPerPage);
    const paginatedArticles = filteredArticles.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const handlePageChange = (page: number) => {
        setCurrentPage(page);
        // Scroll to top of grid
        const grid = document.querySelector('.articles-header');
        if (grid) {
            grid.scrollIntoView({ behavior: 'smooth' });
        }
    };

    const getSentimentColor = (sentiment: string) => {
        if (sentiment?.includes('正面')) return 'positive';
        if (sentiment?.includes('負面')) return 'negative';
        return 'neutral';
    };

    const formatDate = (dateString: string) => {
        try {
            // Attempt to parse "YYYY-MM-DD HH:MM"
            const date = new Date(dateString);
            return new Intl.DateTimeFormat('zh-TW', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }).format(date);
        } catch {
            return dateString;
        }
    };

    const parseKeyPoints = (points: string) => {
        if (!points) return [];
        return points.split('\n').filter(p => p.trim().length > 0).map(p => p.replace(/^- /, ''));
    };

    const handleTagClick = (e: React.MouseEvent, tag: string) => {
        e.stopPropagation();
        setSearchTerm(tag);
    };

    if (loading) {
        return (
            <div className="articles-loading">
                <div className="loading-content">
                    <RefreshCw className="spin" size={48} />
                    <h2>{loadingStatus}</h2>
                    <p>Optimizing your experience with local caching.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="articles-container">
            <header className="articles-header">
                <h1>Market Insights</h1>
                <div className="header-divider"></div>
                <p className="header-subtitle">
                    Latest analysis and reports from top brokerages
                    <span className="db-status" title={isBackgroundLoading ? "Loading more history..." : "Data cached locally"}>
                        {isBackgroundLoading ? <RefreshCw className="spin" size={12} /> : <Database size={12} />}
                        {isBackgroundLoading ? ` Loading History (${articles.length} loaded)...` : ` ${articles.length.toLocaleString()} Records Loaded`}
                    </span>
                </p>

                <div className="search-filter-container">
                    <div className="search-container">
                        <Search className="search-icon" size={20} />
                        <input
                            type="text"
                            placeholder="Search by keyword, tag, or summary..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="search-input"
                        />
                        {searchTerm && (
                            <button className="clear-search" onClick={() => setSearchTerm('')}>
                                <X size={16} />
                            </button>
                        )}
                    </div>

                    <div className="advanced-filters">
                        <div className="filter-group">
                            <label>Date Range:</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                                className="filter-input"
                            />
                            <span>to</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                                className="filter-input"
                            />
                        </div>

                        <div className="filter-group">
                            <label>Topic:</label>
                            <select
                                value={selectedTagFilter}
                                onChange={e => setSelectedTagFilter(e.target.value)}
                                className="filter-select"
                            >
                                <option value="">All Topics</option>
                                {availableTags.map(tag => (
                                    <option key={tag} value={tag}>{tag}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            </header>

            <div className="articles-grid">
                {paginatedArticles.map((article, index) => {
                    const sentimentClass = getSentimentColor(article.判斷);
                    const keyPoints = parseKeyPoints(article.KEY_POINTS);
                    const tags = article.TAGS ? article.TAGS.split(',').map(t => t.trim()).slice(0, 3) : [];

                    return (
                        <article
                            key={index}
                            className={`article-card ${sentimentClass}`}
                            onClick={() => setSelectedArticle(article)}
                        >
                            <div className="article-meta">
                                <span className="article-date">{formatDate(article.原始檔案上傳時間)}</span>
                                <span className={`article-sentiment ${sentimentClass}`}>{article.判斷}</span>
                            </div>

                            <h2 className="article-title">
                                {article.SUMMARY.split('。')[0]}
                            </h2>

                            <div className="article-content">
                                <p className="article-summary">{article.SUMMARY}</p>

                                {keyPoints.length > 0 && (
                                    <div className="article-key-points">
                                        <h3>Key Takeaways</h3>
                                        <ul>
                                            {keyPoints.slice(0, 3).map((point, i) => (
                                                <li key={i}>{point}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>

                            <div className="article-footer">
                                <div className="article-tags">
                                    {tags.map((tag, i) => (
                                        <span
                                            key={i}
                                            className="tag"
                                            onClick={(e) => handleTagClick(e, tag)}
                                        >
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </article>
                    );
                })}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="pagination-controls">
                    <button
                        disabled={currentPage === 1}
                        onClick={() => handlePageChange(1)}
                        className="page-btn"
                        title="First Page"
                    >
                        <ChevronsLeft size={20} />
                    </button>
                    <button
                        disabled={currentPage === 1}
                        onClick={() => handlePageChange(currentPage - 1)}
                        className="page-btn"
                        title="Previous Page"
                    >
                        <ChevronLeft size={20} />
                    </button>

                    <span className="page-info">
                        Page
                        <input
                            type="number"
                            min="1"
                            max={totalPages}
                            value={currentPage}
                            onChange={e => {
                                const val = parseInt(e.target.value);
                                if (!isNaN(val) && val >= 1 && val <= totalPages) handlePageChange(val);
                            }}
                            className="page-input"
                        />
                        of {totalPages}
                    </span>

                    <button
                        disabled={currentPage === totalPages}
                        onClick={() => handlePageChange(currentPage + 1)}
                        className="page-btn"
                        title="Next Page"
                    >
                        <ChevronRight size={20} />
                    </button>
                    <button
                        disabled={currentPage === totalPages}
                        onClick={() => handlePageChange(totalPages)}
                        className="page-btn"
                        title="Last Page"
                    >
                        <ChevronsRight size={20} />
                    </button>
                </div>
            )}

            {selectedArticle && (
                <div className="article-modal-overlay" onClick={() => setSelectedArticle(null)}>
                    <div className="article-modal" onClick={e => e.stopPropagation()}>
                        <button className="close-modal" onClick={() => setSelectedArticle(null)}>
                            <X size={24} />
                        </button>

                        <div className={`modal-header ${getSentimentColor(selectedArticle.判斷)}`}>
                            <div className="modal-meta">
                                <span className="date"><Calendar size={14} /> {formatDate(selectedArticle.原始檔案上傳時間)}</span>
                                <span className={`sentiment ${getSentimentColor(selectedArticle.判斷)}`}>
                                    {selectedArticle.判斷}
                                </span>
                            </div>
                            <h2>{selectedArticle.SUMMARY.split('。')[0]}</h2>
                        </div>

                        <div className="modal-content">
                            <div className="section summary-section">
                                <h3><MessageSquare size={18} /> Summary</h3>
                                <p>{selectedArticle.SUMMARY}</p>
                            </div>

                            {selectedArticle.理由 && (
                                <div className="section reasoning-section">
                                    <h3>Reasoning</h3>
                                    <p>{selectedArticle.理由}</p>
                                </div>
                            )}

                            <div className="section keypoints-section">
                                <h3>Key Points</h3>
                                <ul>
                                    {parseKeyPoints(selectedArticle.KEY_POINTS).map((point, i) => (
                                        <li key={i}>{point}</li>
                                    ))}
                                </ul>
                            </div>

                            <div className="section tags-section">
                                <h3>Tags</h3>
                                <div className="tags-list">
                                    {selectedArticle.TAGS?.split(',').map((tag, i) => (
                                        <span
                                            key={i}
                                            className="tag"
                                            onClick={(e) => {
                                                handleTagClick(e, tag.trim());
                                                setSelectedArticle(null);
                                            }}
                                        >
                                            <TagIcon size={12} /> {tag.trim()}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Articles;
