import { useState, useEffect } from 'react';
import JSZip from 'jszip';

export interface BrokerSummary {
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

export const useBrokerageData = () => {
    const [dates, setDates] = useState<string[]>([]);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [stockCode, setStockCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [data, setData] = useState<any>(null);
    const [topN, setTopN] = useState(15);
    const [zipCache, setZipCache] = useState<Map<string, JSZip>>(new Map());

    useEffect(() => {
        fetch(`${import.meta.env.BASE_URL}data/chips/dates.json?t=${new Date().getTime()}`)
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

    const parseOTCcsv = (text: string) => {
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
        const rows: any[] = [];
        let startIndex = 0;

        // Look for the header line "序號,券商,價格,買進股數,賣出股數"
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('序號,券商,價格')) {
                startIndex = i + 1;
                break;
            }
        }

        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i];
            // Format: "1","1040 臺銀證券","56.50","1000","0"
            // Simple split by comma might work if no commas in values, but safer to respect quotes
            // Strip quotes first
            const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));

            if (parts.length >= 5) {
                const broker = parts[1];
                if (broker) {
                    rows.push({
                        broker: broker,
                        price: parseFloat(parts[2]),
                        buyVol: parseInt(parts[3]) || 0,
                        sellVol: parseInt(parts[4]) || 0
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

                    let fileName = `${date}/${stockCode}.csv`;
                    let file = zip.file(fileName);

                    if (!file) {
                        // OTC stocks might use format: Code_Date.csv (e.g., 8299_20251209.csv)
                        fileName = `${date}/${stockCode}_${date}.csv`;
                        file = zip.file(fileName);
                    }

                    if (!file) {
                        // Try ROC Date format (e.g. 1141111 for 20251111)
                        // user reported: 1240_1141111.csv
                        try {
                            const year = parseInt(date.substring(0, 4));
                            const monthDay = date.substring(4);
                            const rocYear = year - 1911;
                            const rocDate = `${rocYear}${monthDay}`;

                            // Try with folder
                            fileName = `${date}/${stockCode}_${rocDate}.csv`;
                            file = zip.file(fileName);

                            if (!file) {
                                // Try without folder (just in case)
                                fileName = `${stockCode}_${rocDate}.csv`;
                                file = zip.file(fileName);
                            }
                        } catch (e) {
                            console.warn('Failed to convert to ROC date', e);
                        }
                    }

                    if (!file) {
                        // Some OTC might purely be Code_Date.csv without parent folder if structure varies (just in case)
                        fileName = `${stockCode}_${date}.csv`;
                        file = zip.file(fileName);
                    }

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

                    let dayRows = [];
                    // Detect file type
                    if (decodedText.includes('券商買賣證券成交價量資訊')) {
                        dayRows = parseOTCcsv(decodedText);
                    } else {
                        dayRows = parseDoubleColumnCSV(decodedText);
                    }
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

                let rows = [];
                if (decodedText.includes('券商買賣證券成交價量資訊')) {
                    rows = parseOTCcsv(decodedText);
                } else {
                    rows = parseDoubleColumnCSV(decodedText);
                }

                if (rows.length === 0) {
                    // Try the other parser just in case
                    if (!decodedText.includes('券商買賣證券成交價量資訊')) {
                        const retryRows = parseOTCcsv(decodedText);
                        if (retryRows.length > 0) rows = retryRows;
                    }
                }
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

    return {
        dates,
        startDate, setStartDate,
        endDate, setEndDate,
        stockCode, setStockCode,
        topN, setTopN,
        loading,
        error,
        data,
        handleSearch,
        handleFileUpload
    };
};
