import Papa from 'papaparse';

export interface FundBasicInfo {
    id: string; // 基金碼
    name: string; // 基金全稱
    manager?: string; // 經理公司
    type?: string; // 類型
    riskLevel?: string; // 風險收益等級
    custodian?: string; // 保管機構
    guarantor?: string; // 保證機構
    inceptionDate?: string; // 成立日
    currency?: string; // 計價幣別
    fundSize?: string; // 基金規模 (net asset value or similar if available, though CSV header '淨資產' might appear in fee file, checking basic info first)
    dataType?: '淨值' | '市價'; // 資料類型
}

export interface FundFee {
    fundId: string;
    managementFee: number; // A1經理費
    custodianFee: number; // B2保管費
    guaranteeFee: number; // B3保證費
    otherFee: number; // B4其他費用
    totalExpenseRatio: number; // 費用率 (Total Expense Ratio)
}

export interface FundManifestEntry {
    file: string;
    path: string;
    startDate: string;
    endDate: string;
    type: string;
}

export interface FundHistoryPoint {
    date: string;
    value: number;
}

export interface FundHistory {
    fundId: string;
    type: '淨值' | '市價';
    data: FundHistoryPoint[];
}

class FundDataService {
    private manifest: FundManifestEntry[] | null = null;
    private basicInfoCache: FundBasicInfo[] | null = null;
    private feeCache: Map<string, FundFee> | null = null;
    private historyCache: Map<string, any[]> = new Map(); // Cache parsed CSV data by file path
    private readonly BASE_URL = import.meta.env.BASE_URL || '/';

    async loadManifest(): Promise<FundManifestEntry[]> {
        if (this.manifest) return this.manifest;
        const url = `${this.BASE_URL}data/fund/manifest.json`;
        console.log('Loading manifest from:', url);
        const response = await fetch(url);
        this.manifest = await response.json();
        return this.manifest!;
    }

    async getFundBasicInfo(): Promise<FundBasicInfo[]> {
        if (this.basicInfoCache) return this.basicInfoCache;

        const url = `${this.BASE_URL}data/fund/基金基本資料.csv`;
        return new Promise((resolve, reject) => {
            Papa.parse(url, {
                download: true,
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    const data = results.data.map((row: any) => ({
                        id: row['基金碼'],
                        name: row['基金全稱'],
                        manager: row['經理公司'],
                        type: row['類型'],
                        riskLevel: row['風險收益等級'],
                        custodian: row['保管機構'],
                        guarantor: row['保證機構'],
                        inceptionDate: row['成立日'],
                        currency: row['計價幣別'] || 'TWD', // Default to TWD if missing
                    })).filter(item => item.id); // Filter out empty rows
                    this.basicInfoCache = data;
                    resolve(data);
                },
                error: (error) => reject(error),
            });
        });
    }

    async getFundHistory(
        fundIds: string[],
        type: '淨值' | '市價',
        startDate?: string,
        endDate?: string
    ): Promise<FundHistory[]> {
        console.log('=== FundDataService.getFundHistory ===');
        console.log('fundIds:', fundIds);
        console.log('type:', type);
        console.log('startDate:', startDate, 'endDate:', endDate);

        await this.loadManifest();
        console.log('Manifest loaded, entries:', this.manifest?.length);

        // 1. Identify relevant files
        const relevantFiles = this.manifest!.filter(entry => {
            if (entry.type !== type) return false;
            // Simple overlap check. If no dates provided, load all.
            if (!startDate && !endDate) return true;

            const fileStart = entry.startDate;
            const fileEnd = entry.endDate;
            const reqStart = startDate || '00000000';
            const reqEnd = endDate || '99999999';

            return fileStart <= reqEnd && fileEnd >= reqStart;
        });
        console.log('Relevant files:', relevantFiles);

        // 2. Fetch and parse files (with caching)
        const filePromises = relevantFiles.map(async (file) => {
            // Construct full path with BASE_URL
            const fullPath = `${this.BASE_URL}${file.path.replace(/^\//, '')}`;

            if (this.historyCache.has(fullPath)) {
                console.log('Cache hit for:', fullPath);
                return { file, data: this.historyCache.get(fullPath)! };
            }

            console.log('Fetching file:', fullPath);
            return new Promise<{ file: FundManifestEntry, data: any[] }>((resolve, reject) => {
                Papa.parse(fullPath, {
                    download: true,
                    header: false, // Don't use first row as header
                    skipEmptyLines: true,
                    complete: (results) => {
                        console.log('Raw parsed file:', fullPath, 'rows:', results.data.length);

                        // Find the header row (the one that starts with 基金碼)
                        const rawData = results.data as string[][];
                        let headerRowIndex = -1;
                        for (let i = 0; i < Math.min(10, rawData.length); i++) {
                            if (rawData[i] && rawData[i][0] === '基金碼') {
                                headerRowIndex = i;
                                break;
                            }
                        }

                        if (headerRowIndex === -1) {
                            console.error('Could not find header row with 基金碼');
                            resolve({ file, data: [] });
                            return;
                        }

                        console.log('Found header at row:', headerRowIndex);
                        const headers = rawData[headerRowIndex];
                        const dataRows = rawData.slice(headerRowIndex + 1);

                        // Convert to objects with headers as keys
                        const processedData = dataRows.map(row => {
                            const obj: any = {};
                            headers.forEach((header, index) => {
                                obj[header] = row[index];
                            });
                            return obj;
                        }).filter(row => row['基金碼']); // Filter out rows without fund code

                        console.log('Processed data rows:', processedData.length);
                        if (processedData.length > 0) {
                            console.log('Sample processed row 基金碼:', processedData[0]['基金碼']);
                        }

                        this.historyCache.set(fullPath, processedData);
                        resolve({ file, data: processedData });
                    },
                    error: (error) => {
                        console.error('Parse error for', fullPath, error);
                        reject(error);
                    },
                });
            });
        });

        const loadedFiles = await Promise.all(filePromises);
        console.log('Loaded files count:', loadedFiles.length);

        // 3. Merge data for requested funds
        const result: FundHistory[] = fundIds.map(fundId => ({
            fundId,
            type,
            data: []
        }));

        // Map to store date -> value for each fund to handle merging and deduplication
        const fundDataMaps = new Map<string, Map<string, number>>();
        fundIds.forEach(id => fundDataMaps.set(id, new Map()));

        loadedFiles.forEach(({ data }) => {
            console.log('Processing file with', data.length, 'rows');
            // Log first few rows to see structure
            if (data.length > 0) {
                console.log('Sample row 基金碼:', data[0]['基金碼']);
            }

            let matchCount = 0;
            data.forEach((row: any) => {
                const rowFundId = row['基金碼'];
                if (fundIds.includes(rowFundId)) {
                    matchCount++;
                    const fundMap = fundDataMaps.get(rowFundId)!;
                    // Iterate over date columns
                    Object.keys(row).forEach(key => {
                        if (key !== '基金碼' && key.match(/^\d{4}\/\d{1,2}\/\d{1,2}$/)) {
                            // Date format in CSV is YYYY/MM/DD
                            const date = key;
                            const value = parseFloat(row[key]);
                            if (!isNaN(value)) {
                                fundMap.set(date, value);
                            }
                        }
                    });
                }
            });
            console.log('Matched funds in this file:', matchCount);
        });

        // Convert maps to sorted arrays
        result.forEach(fund => {
            const fundMap = fundDataMaps.get(fund.fundId)!;
            const sortedDates = Array.from(fundMap.keys()).sort((a, b) => {
                const partsA = a.split('/');
                const partsB = b.split('/');
                const dateA = new Date(parseInt(partsA[0]), parseInt(partsA[1]) - 1, parseInt(partsA[2]));
                const dateB = new Date(parseInt(partsB[0]), parseInt(partsB[1]) - 1, parseInt(partsB[2]));
                return dateA.getTime() - dateB.getTime();
            });
            console.log('Fund', fund.fundId, 'has', sortedDates.length, 'date points');

            // Filter by requested date range if provided
            const filteredDates = sortedDates.filter(date => {
                // Convert YYYY/M/D to YYYYMMDD with proper padding
                const parts = date.split('/');
                const year = parts[0];
                const month = parts[1].padStart(2, '0');
                const day = parts[2].padStart(2, '0');
                const dateStr = `${year}${month}${day}`;

                const start = startDate ? startDate.replace(/-/g, '') : '00000000';
                const end = endDate ? endDate.replace(/-/g, '') : '99999999';
                return dateStr >= start && dateStr <= end;
            });
            console.log('After date filter:', filteredDates.length, 'points (start:', startDate, 'end:', endDate, ')');

            fund.data = filteredDates.map(date => ({
                date,
                value: fundMap.get(date)!
            }));
        });

        console.log('Final result:', result);
        return result;
    }

    async getFundFees(): Promise<Map<string, FundFee>> {
        if (this.feeCache) return this.feeCache;

        const url = `${this.BASE_URL}data/fund/基金費用.csv`;
        return new Promise((resolve, reject) => {
            Papa.parse(url, {
                download: true,
                header: true, // Auto-detect header
                skipEmptyLines: true,
                complete: (results) => {
                    const feeMap = new Map<string, FundFee>();
                    // Group by fund and take the latest entry usually, but here we scan all
                    // Assuming we want the latest available fee data? 
                    // Or maybe the file structure is one row per fund per month?
                    // Let's assume we want the most recent 'Current' data or similar. 
                    // Based on CSV observation, it seems to have 'Current' column or similar? 
                    // Wait, the previous `get-content` showed: "Current,,,淨資產,A1手續費..." then next line "基金碼,年月日..."
                    // It seems the file defines fields like A1經理費, B2保管費 etc.
                    // Let's rely on standard parsing.

                    results.data.forEach((row: any) => {
                        const id = row['基金碼'];
                        if (!id) return;

                        // Parse fees - handle % signs or raw numbers
                        const parseFee = (val: string) => {
                            if (!val) return 0;
                            return parseFloat(val.replace('%', ''));
                        };

                        // Construct fee object
                        // Note: Column names based on user provided data/header inspection
                        // "A1經理費", "B2保管費", "B3保證費", "B4其他費用", "費用率"
                        const fee: FundFee = {
                            fundId: id,
                            managementFee: parseFee(row['A1經理費'] || row['經理費率']), // Try both potentially
                            custodianFee: parseFee(row['B2保管費'] || row['保管費率']),
                            guaranteeFee: parseFee(row['B3保證費'] || row['保證費率']),
                            otherFee: parseFee(row['B4其他費用']),
                            totalExpenseRatio: parseFee(row['費用率']),
                        };

                        // If multiple entries exist (e.g. historical), we might overwrite. 
                        // Usually we want the latest. If the CSV is sorted by date, last one wins.
                        // If not, we might need to check date. "年月日" column exists.
                        const existing = feeMap.get(id);
                        if (!existing) {
                            feeMap.set(id, fee);
                        } else {
                            // Check date if available to always keep latest
                            const newDate = row['年月日'];
                            const oldEntry = (existing as any)._date; // temporary storage
                            if (newDate > oldEntry) {
                                feeMap.set(id, { ...fee, _date: newDate } as any);
                            }
                        }
                    });

                    this.feeCache = feeMap;
                    resolve(feeMap);
                },
                error: (error) => reject(error),
            });
        });
    }
}

export const fundDataService = new FundDataService();
