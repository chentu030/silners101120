import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../public/data/fund');
const OUTPUT_FILE = path.join(DATA_DIR, 'manifest.json');

// Regex to parse filenames like "20240101-20241231(淨值).csv"
// Captures: StartDate, EndDate, Type
const FILE_PATTERN = /^(\d{8})-(\d{8})\((.+)\)\.csv$/;

function generateManifest() {
    if (!fs.existsSync(DATA_DIR)) {
        console.error(`Directory not found: ${DATA_DIR}`);
        process.exit(1);
    }

    const files = fs.readdirSync(DATA_DIR);
    const manifest = [];

    files.forEach(file => {
        const match = file.match(FILE_PATTERN);
        if (match) {
            const [_, startDate, endDate, type] = match;
            manifest.push({
                file: file,
                path: `/data/fund/${file}`,
                startDate: startDate,
                endDate: endDate,
                type: type, // e.g., "淨值", "市價"
            });
        }
    });

    // Sort by start date descending
    manifest.sort((a, b) => b.startDate.localeCompare(a.startDate));

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2), 'utf-8');
    console.log(`Manifest generated with ${manifest.length} files at ${OUTPUT_FILE}`);
}

generateManifest();
