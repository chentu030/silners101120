// import { openDB, DBSchema, IDBPDatabase } from 'idb';

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

// Dummy implementation to test if idb is the cause of the crash
export const initDB = async () => {
    console.log('initDB called (dummy)');
    return null;
};

export const saveArticles = async (articles: ArticleData[], _lastModified: string) => {
    console.log('saveArticles called (dummy)', articles.length);
};

export const getArticles = async (): Promise<{ data: ArticleData[], lastModified: string, timestamp: number } | null> => {
    console.log('getArticles called (dummy)');
    return null;
};

export const clearArticles = async () => {
    console.log('clearArticles called (dummy)');
};
