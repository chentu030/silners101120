import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonPath = path.join(__dirname, '../src/data/fund-list.json');

try {
    console.log(`Reading ${jsonPath}...`);
    const data = fs.readFileSync(jsonPath, 'utf8');
    const funds = JSON.parse(data);

    console.log(`Successfully loaded ${funds.length} funds.`);

    // Test search
    const query = "安聯";
    console.log(`Testing search for "${query}"...`);

    const results = funds.filter(f =>
        f.name.includes(query) || f.id.includes(query)
    );

    console.log(`Found ${results.length} matches.`);
    if (results.length > 0) {
        console.log("First 3 matches:");
        results.slice(0, 3).forEach(f => console.log(`- [${f.id}] ${f.name}`));
    } else {
        console.error("No matches found! Data might be incorrect.");
    }

} catch (err) {
    console.error("Error verifying fund list:", err);
}
