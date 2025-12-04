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
