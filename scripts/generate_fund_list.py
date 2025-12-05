import csv
import json
import os

# Define paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(BASE_DIR, 'public', 'data', 'fund', '基金基本資料.csv')
JSON_PATH = os.path.join(BASE_DIR, 'src', 'data', 'fund-list.json')

def generate_fund_list():
    print(f"Reading CSV from: {CSV_PATH}")
    
    funds = []
    
    try:
        # Try reading with utf-8-sig first (common for CSVs)
        with open(CSV_PATH, 'r', encoding='utf-8-sig') as f:
            lines = f.readlines()
    except UnicodeDecodeError:
        # Fallback to big5 if utf-8 fails
        print("UTF-8 decode failed, trying Big5...")
        with open(CSV_PATH, 'r', encoding='big5') as f:
            lines = f.readlines()

    # Skip the first 2 metadata lines
    if len(lines) < 3:
        print("Error: CSV file is too short.")
        return

    # The header is on line 3 (index 2)
    header_line = lines[2].strip()
    headers = header_line.split(',')
    
    try:
        id_index = headers.index('基金碼')
        name_index = headers.index('基金全稱')
    except ValueError as e:
        print(f"Error finding headers: {e}")
        print(f"Available headers: {headers}")
        return

    # Process data lines (from index 3 onwards)
    for line in lines[3:]:
        # Simple CSV splitting (assuming no commas in fields for now, or use csv module for robustness)
        # Using csv.reader for proper parsing
        reader = csv.reader([line])
        row = next(reader)
        
        if len(row) > max(id_index, name_index):
            fund_id = row[id_index].strip()
            fund_name = row[name_index].strip()
            
            if fund_id and fund_name:
                funds.append({
                    'id': fund_id,
                    'name': fund_name
                })

    # Write to JSON
    print(f"Writing {len(funds)} funds to: {JSON_PATH}")
    
    # Ensure directory exists
    os.makedirs(os.path.dirname(JSON_PATH), exist_ok=True)
    
    with open(JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(funds, f, ensure_ascii=False, indent=2)
        
    print("Success!")

if __name__ == "__main__":
    generate_fund_list()
