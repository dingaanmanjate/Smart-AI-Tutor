
import os
import json
import re
import pdfplumber
from collections import defaultdict

# Regex patterns
TERM_PATTERN = re.compile(r'Term\s*(\d)', re.IGNORECASE)
WEEK_PATTERN = re.compile(r'Week\s*(\d+(?:\s*-\s*\d+)?)', re.IGNORECASE)
# Improved Formula Pattern: looks for 'Left Side = Right Side' structure
# Enforce short tokens (variables) to avoid matching regular text sentences
# Uses boundary \b to avoid matching suffixes of long words (e.g. 'tion' from 'equation')
# Matches: F = ma, E = mc^2, P = VI, (F Δt = mΔv)
FORMULA_PATTERN = re.compile(r'((?:(?:(?!\w{5,})\b\w+\b|[\+\-\*\/½\(\)\.\^])\s*)+\s*=\s*(?:(?:(?!\w{5,})\b\w+\b|[\+\-\*\/½\(\)\.\^])\s*)+)', re.IGNORECASE)

def extract_text_from_pdf(pdf_path):
    data = {
        "grade": "",
        "subject": "",
        "terms": defaultdict(lambda: defaultdict(lambda: {"subtopics": [], "formulas": [], "main_topic": "", "formal_assessment": ""}))
    }
    
    # Extract Header Info
    path_parts = pdf_path.split(os.sep)
    if "Grade_" in path_parts[-2]:
        data["grade"] = path_parts[-2].replace("_", " ")
    data["subject"] = os.path.basename(pdf_path).replace(".pdf", "")

    print(f"Processing: {data['grade']} - {data['subject']}")

    # Noise Patterns to Ignore
    NOISE_PATTERNS = [
        "teacher:", "signature:", "date:", "curr adv:", "school stamp", 
        "department of education", "annual teaching plan", "page", "copyright"
    ]

    try:
        with pdfplumber.open(pdf_path) as pdf:
            current_term = 0
            
            for page in pdf.pages:
                tables = page.extract_tables()
                
                for table in tables:
                    if not table: continue
                    
                    # 1. Map Columns to Weeks
                    week_col_map = {} # col_idx -> week_list
                    
                    # Search for header row
                    header_row_idx = -1
                    for r_idx, row in enumerate(table):
                        row_str = [str(c).lower() if c else "" for c in row]
                        if any("week" in c for c in row_str):
                            header_row_idx = r_idx
                            break
                    
                    if header_row_idx == -1: continue

                    # Check for Term
                    header_row = table[header_row_idx]
                    for r in range(max(0, header_row_idx-1), min(len(table), header_row_idx+2)):
                        row_text = " ".join([str(c) for c in table[r] if c]).lower()
                        term_match = TERM_PATTERN.search(row_text)
                        if term_match:
                            current_term = int(term_match.group(1))
                            break
                    
                    if current_term == 0: current_term = 1

                    # Build Week Map (Handling Merged/Empty Headers)
                    last_weeks = []
                    for c_idx, cell_val in enumerate(header_row):
                        if cell_val:
                            cell_clean = str(cell_val).replace('\n', ' ')
                            week_match = WEEK_PATTERN.search(cell_clean)
                            if week_match:
                                week_str = week_match.group(1)
                                if '-' in week_str:
                                    s, e = map(int, week_str.split('-'))
                                    last_weeks = list(range(s, e+1))
                                else:
                                    last_weeks = [int(week_str)]
                            elif "term" not in cell_clean.lower():
                                # Not a week or term header, reset carry-over
                                # unless it's strictly empty
                                pass
                        
                        # Assign current column to the active weeks
                        # Note: This assigns multiple columns to the same week if headers are wide?
                        # Or repeats the map?
                        # Better strategy: If we found weeks, mapped them.
                        if last_weeks:
                            week_col_map[c_idx] = last_weeks
                            # Important: In some tables, "Week 1" header is one col, "Week 2" is next.
                            # So we shouldn't infinitely forward fill unless we hit None.
                            # If cell_val was NOT None and NOT a week, maybe stop filling?
                            # But pdfplumber fills None for merged cells usually.
                            
                    # 2. Extract Data
                    active_topic = "" # For merged cell handling (vertical or horizontal)
                    
                    for r_idx in range(header_row_idx + 1, len(table)):
                        row = table[r_idx]
                        if not row: continue
                        
                        # Determine Row Type
                        first_cell = ""
                        for c in row:
                            if c:
                                first_cell = str(c).strip().lower()
                                break
                        
                        is_topic = "topic" in first_cell and "sub" not in first_cell
                        is_assessment = any(k in first_cell for k in ["assessment", "sba", "task"])
                        # Treat others as content if not explicitly something else
                        is_content = not (is_topic or is_assessment)
                        
                        # Iterate columns aligned with weeks
                        for c_idx, cell_text in enumerate(row):
                            if c_idx not in week_col_map: continue
                            
                            # Clean Text & Filter Noise
                            clean_text = str(cell_text).strip() if cell_text else ""
                            if not clean_text: 
                                # If it's a Topic row and cell is empty, it might be merged from left
                                # But we iterate column by column.
                                if is_topic and active_topic:
                                    clean_text = active_topic # Imputed value for processing logic
                                else:
                                    continue
                            
                            if any(np in clean_text.lower() for np in NOISE_PATTERNS):
                                continue
                            if clean_text.lower() in ["week", "term"]: continue

                            # Update Active Topic (Forward Fill logic for Horizontal merges)
                            # Actually, pdfplumber repeats values? No, usually None.
                            # So 'clean_text' being empty handled above helps.
                            if is_topic:
                                active_topic = clean_text

                            weeks = week_col_map[c_idx]
                            for w in weeks:
                                entry = data["terms"][current_term][w]
                                
                                if is_topic:
                                    # Split Main Topic from Bullets
                                    # Strategy: Take text up to first newline or bullet
                                    parts = re.split(r'[\n•\-]', clean_text, 1)
                                    main_title = parts[0].strip()
                                    
                                    if main_title:
                                        if not entry["main_topic"]:
                                            entry["main_topic"] = main_title
                                        elif main_title not in entry["main_topic"]:
                                            # Avoid duplicates
                                            pass
                                    
                                    # The rest goes to subtopics? Or just ignore?
                                    # Usually topics row has some content too.
                                    if len(parts) > 1:
                                        rest = parts[1].strip()
                                        if rest:
                                         # Same logic as content: Split by bullets only
                                             clean_rest = re.sub(r'(^|\n)\s*[•\-]\s*', '<BULLET>', rest)
                                             if '<BULLET>' in clean_rest:
                                                 raw_bullets = clean_rest.split('<BULLET>')
                                                 bullets = []
                                                 for b in raw_bullets:
                                                     if not b.strip(): continue
                                                     b = re.sub(r'\(\d+\s*hrs?\)', '', b, flags=re.IGNORECASE)
                                                     b = b.replace('\n', ' ').strip()
                                                     if b: bullets.append(b)
                                             else:
                                                 b = re.sub(r'\(\d+\s*hrs?\)', '', rest, flags=re.IGNORECASE)
                                                 b = b.replace('\n', ' ').strip()
                                                 bullets = [b] if b else []
                                             
                                             # Formulas for Topic-row content
                                             for b in bullets:
                                                 f_matches = FORMULA_PATTERN.findall(b)
                                                 cleaned_matches = [m.strip() for m in f_matches if len(m.strip()) > 3]
                                                 entry["formulas"].extend(cleaned_matches)

                                             entry["subtopics"].extend(bullets)
                                    
                                elif is_assessment:
                                    if entry["formal_assessment"]:
                                        if clean_text not in entry["formal_assessment"]:
                                            entry["formal_assessment"] += "; " + clean_text
                                    else:
                                        entry["formal_assessment"] = clean_text
                                
                                else:
                                    # Content / Concepts / Skills (is_content)
                                    # Robust split:
                                    # 1. Replace real bullets with a unique token
                                    # 2. Split by that token
                                    clean_text_norm = re.sub(r'(^|\n)\s*[•\-]\s*', '<BULLET>', clean_text)
                                    
                                    if '<BULLET>' in clean_text_norm:
                                        raw_bullets = clean_text_norm.split('<BULLET>')
                                        # Clean individual bullets:
                                        # - Remove (x hrs)
                                        # - Replace newlines with space
                                        bullets = []
                                        for b in raw_bullets:
                                            if not b.strip(): continue
                                            # Remove time duration
                                            b = re.sub(r'\(\d+\s*hrs?\)', '', b, flags=re.IGNORECASE)
                                            # Replace newlines
                                            b = b.replace('\n', ' ').strip()
                                            if b: bullets.append(b)
                                    else:
                                        # No bullets found, treat as single text block
                                        # Remove time duration
                                        b = re.sub(r'\(\d+\s*hrs?\)', '', clean_text, flags=re.IGNORECASE)
                                        # Replace newlines
                                        b = b.replace('\n', ' ').strip()
                                        bullets = [b] if b else []

                                    # Formulas
                                    for b in bullets:
                                        f_matches = FORMULA_PATTERN.findall(b)
                                        # Clean matches
                                        cleaned_matches = [m.strip() for m in f_matches if len(m.strip()) > 3] # simple filter
                                        entry["formulas"].extend(cleaned_matches)
                                            
                                    entry["subtopics"].extend(bullets)

            # Cleanup
            for t_idx in data["terms"]:
                for w_idx in data["terms"][t_idx]:
                    # Unique lists
                    data["terms"][t_idx][w_idx]["subtopics"] = sorted(list(set(data["terms"][t_idx][w_idx]["subtopics"])))
                    data["terms"][t_idx][w_idx]["formulas"] = sorted(list(set(data["terms"][t_idx][w_idx]["formulas"])))
                    # Strip lingering "Topic X:" from main topic if preferred? Or keep it.
                    # User wanted "Main Topic: Communism". Current keeps "Topic 1: Communism in Russia..."
                    # That is acceptable.

    except Exception as e:
        print(f"Error processing {pdf_path}: {e}")
        return None

    # Format Output
    formatted_output = {
        "grade": data["grade"],
        "subject": data["subject"],
        "curriculum": []
    }

    for term_num in sorted(data["terms"].keys()):
        term_entry = {"term": term_num, "weeks": []}
        for week_num in sorted(data["terms"][term_num].keys()):
            week_data = data["terms"][term_num][week_num]
            week_data["week"] = week_num
            term_entry["weeks"].append(week_data)
        formatted_output["curriculum"].append(term_entry)

    return formatted_output

def main():
    root_dir = "FET_ATPs_Organized"
    output_file = "extracted_atp_data.json"
    all_data = []

    for root, dirs, files in os.walk(root_dir):
        for file in files:
            if file.lower().endswith(".pdf"):
                pdf_path = os.path.join(root, file)
                extracted = extract_text_from_pdf(pdf_path)
                if extracted:
                    all_data.append(extracted)

    # Save to JSON
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(all_data, f, indent=2, ensure_ascii=False)
    
    print(f"\nExtraction complete. Data saved to {output_file}")

if __name__ == "__main__":
    main()
