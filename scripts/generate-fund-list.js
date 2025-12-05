import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const csvFilePath = path.join(__dirname, '../public/data/fund/基金基本資料.csv');
const outputFilePath = path.join(__dirname, '../src/data/fund-list.json');

// Ensure output directory exists
const outputDir = path.dirname(outputFilePath);
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

const fileContent = fs.readFileSync(csvFilePath, 'utf8');

// The CSV has 2 header lines that are metadata, the real header is on line 3.
// We need to skip the first 2 lines.
const lines = fileContent.split('\n');
const dataLines = lines.slice(2).join('\n');

Papa.parse(dataLines, {
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
        const funds = results.data
            .filter(row => row['基金碼'] && row['基金全稱']) // Ensure ID and Name exist
            .map(row => ({
                id: row['基金碼'].trim(),
                name: row['基金全稱'].trim()
            }));

        fs.writeFileSync(outputFilePath, JSON.stringify(funds, null, 2), 'utf8');
        console.log(`Successfully generated fund list with ${funds.length} entries.`);
        console.log(`Output saved to: ${outputFilePath}`);
    },
    error: (err) => {
        console.error('Error parsing CSV:', err);
    }
});
