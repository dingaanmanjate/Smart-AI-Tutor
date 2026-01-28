import pdfplumber
import re
import json
import os

def clean_text(text):
    if not text: return ""
    return re.sub(r'\s+', ' ', text).strip()

def parse_full_content_text(full_text):
    """
    Parses a block of text (joined from multiple rows) into subtopics and bullets.
    """
    subtopics = []
    current_sub = None
    
    # Regexes
    # "1. Title"
    subtopic_pattern = re.compile(r'^(\d+)\.\s+(.+)')
    # "1.1 Title", "2.1 Title"
    numbered_context_pattern = re.compile(r'^(\d+\.\d+(\.\d+)*)\.?\s+(.+)')
    
    lines = full_text.split('\n')
    
    for line in lines:
        line = line.strip()
        if not line: continue
        
        # 1. Check for "1. Title"
        st_match = subtopic_pattern.match(line)
        if st_match:
            sub = {
                "number": st_match.group(1),
                "title": st_match.group(2),
                "context_bullets": []
            }
            subtopics.append(sub)
            current_sub = sub
            continue
            
        # 2. Check for "1.1 Context"
        nc_match = numbered_context_pattern.match(line)
        if nc_match:
            content = line 
            if current_sub:
                current_sub["context_bullets"].append(content)
            else:
                 current_sub = {"number": "", "title": "Background / Revision", "context_bullets": [content]}
                 subtopics.append(current_sub)
            continue
            
        # 3. Bullets
        if line.startswith(('•', '-', '–')):
            content = line.lstrip('•-– ').strip()
            if current_sub:
                current_sub["context_bullets"].append(content)
            else:
                 current_sub = {"number": "", "title": "Key Concepts", "context_bullets": [content]}
                 subtopics.append(current_sub)
            continue
            
        # 4. Continuation Text
        if current_sub:
            if current_sub["context_bullets"]:
                current_sub["context_bullets"][-1] += " " + line
            else:
                current_sub["title"] += " " + line
        else:
             current_sub = {"number": "", "title": line, "context_bullets": []}
             subtopics.append(current_sub)

    return subtopics

def scrape_gr11_math_atp(pdf_path):
    results = {
        "subject": "Mathematics",
        "grade": "11",
        "topics": [] 
    }
    
    current_term = 1 # Default

    print(f"Processing {pdf_path}...")
    with pdfplumber.open(pdf_path) as pdf:
        all_tables = []
        # Skip Page 1 (index 0)
        for p_idx, page in enumerate(pdf.pages):
            if p_idx == 0: continue 
            all_tables.extend(page.extract_tables())

        for i, table in enumerate(all_tables):
            # 0. Check for TERM Header
            # Scan first few rows for "TERM X"
            for r_idx in range(min(5, len(table))):
                row_str = " ".join([str(c).upper() for c in table[r_idx] if c])
                term_match = re.search(r'TERM\s*(\d)', row_str)
                if term_match:
                    current_term = int(term_match.group(1))
                    print(f"Found Term {current_term} in Table {i}")
                    break

            # 1. Find the "TOPICS" row
            topics_row_idx = -1
            topic_header_indices = [] # [(col_idx, Name), ...]
            
            for r_idx, row in enumerate(table):
                row_str = [str(c).upper() for c in row if c]
                if "TOPICS" in row_str:
                    topics_row_idx = r_idx
                    # Map topics in this row
                    for c_idx, cell in enumerate(row):
                        if cell:
                            c_text = clean_text(str(cell))
                            # Ignore "TOPICS" header itself
                            if "TOPIC" not in c_text.upper() and len(c_text) > 3:
                                topic_header_indices.append((c_idx, c_text))
                    break
            
            if topics_row_idx == -1: continue 
            
            # 2. Determine CONTENT Columns for each Topic
            # For each topic header, we look at the row immediately below (topics_row_idx + 1)
            # Find the first non-empty column between this topic's start and the NEXT topic's start.
            
            topic_map = [] # List of { "name": name, "content_col": idx }
            
            # If no data row below header, skip
            if topics_row_idx + 1 >= len(table): continue
            
            data_row = table[topics_row_idx + 1]
            
            for k in range(len(topic_header_indices)):
                t_idx, t_name = topic_header_indices[k]
                
                # Determine search range for content column
                # Start at t_idx. End at next_topic_idx (exclusive) or end of row.
                if k + 1 < len(topic_header_indices):
                    end_search = topic_header_indices[k+1][0]
                else:
                    end_search = len(data_row)
                
                # Find first non-empty col in data_row within [t_idx, end_search)
                found_col = -1
                for scan_c in range(t_idx, end_search):
                    if scan_c < len(data_row) and data_row[scan_c]:
                        found_col = scan_c
                        break
                
                # If found, use it. If not found, default to t_idx (maybe empty currently but data later?)
                # If data_row is empty, we better hope subsequent rows align with t_idx.
                # But typically we use found_col if valid.
                final_content_col = found_col if found_col != -1 else t_idx
                
                topic_map.append({
                    "name": t_name,
                    "content_col": final_content_col
                })

            # 3. Extract Raw Content using mapped content columns
            col_content_buffer = { item["content_col"]: [] for item in topic_map }
            
            for r_idx in range(topics_row_idx + 1, len(table)):
                row = table[r_idx]
                for item in topic_map:
                    c = item["content_col"]
                    if c < len(row) and row[c]:
                        # Only add if distinct from previous line to avoid some duplicate glitches?
                        # No, pdfplumber distinctness is needed? 
                        # Actually just add it.
                        col_content_buffer[c].append(str(row[c]))

            # 4. Process Buffers
            for item in topic_map:
                c = item["content_col"]
                topic_name = item["name"]
                
                raw_text_block = "\n".join(col_content_buffer[c])
                if not raw_text_block.strip(): continue
                
                parsed_subtopics = parse_full_content_text(raw_text_block)
                
                # Add to results
                results["topics"].append({
                    "topic_name": topic_name,
                    "term": current_term,
                    "subtopics": parsed_subtopics
                })

    return results

if __name__ == "__main__":
    path = "FET_ATPs_Organized/Grade_11/Mathematics.pdf"
    output_path = "grade_11_math_data_v5.json"
    if os.path.exists(path):
        data = scrape_gr11_math_atp(path)
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"Extraction complete: {output_path}")
