import os
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin

def download_fet_atps():
    target_url = "https://www.education.gov.za/Curriculum/NationalCurriculumStatementsGradesR-12/2023ATPsFET.aspx"
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    
    # Non-English language exclusion list
    exclude = ["Afrikaans", "IsiNdebele", "IsiXhosa", "IsiZulu", "Sepedi", 
               "Sesotho", "Setswana", "Sign Language", "Siswati", "Tshivenda", "Xitsonga"]

    base_dir = "FET_ATPs_Organized"
    os.makedirs(base_dir, exist_ok=True)

    try:
        print("Connecting to DBE FET Portal...")
        response = requests.get(target_url, headers=headers, timeout=30)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Find all relevant elements in order of appearance
        # This handles mixed layouts (tables, lists, headings) seamlessly
        elements = soup.find_all(['h2', 'h3', 'h4', 'strong', 'span', 'p', 'a'])
        
        current_grade = None
        download_count = 0
        seen_links = set()

        print("Scanning page content...")

        for el in elements:
            # 1. Detect Grade Context
            text = el.get_text(strip=True)
            text_lower = text.lower()
            
            # Simple heuristic to switch current grade context
            if "grade 10" in text_lower and "content" in text_lower:
                current_grade = "Grade_10"
                print(f"--- Found Section: {current_grade} ---")
            elif "grade 11" in text_lower and "content" in text_lower:
                current_grade = "Grade_11"
                print(f"--- Found Section: {current_grade} ---")
            elif "grade 12" in text_lower and "content" in text_lower:
                current_grade = "Grade_12"
                print(f"--- Found Section: {current_grade} ---")
            
            # 2. Process Links
            if el.name == 'a' and el.has_attr('href') and current_grade:
                href = el['href']
                subject_name = text
                
                # Check validity
                if not subject_name or len(subject_name) < 3: continue
                if "download" in subject_name.lower(): continue
                if "linkclick" not in href.lower() and ".pdf" not in href.lower(): continue
                
                # Deduplication logic (Subject Name + Grade) ensures we don't re-download or duplicates
                if href in seen_links: continue
                
                # Filtering logic
                is_excluded = any(lang.lower() in subject_name.lower() for lang in exclude)
                is_english = "english" in subject_name.lower()
                
                if (is_english or not is_excluded):
                    # Sanitize filename
                    clean_name = "".join(c for c in subject_name if c.isalnum() or c in " _-").strip()
                    filename = f"{clean_name}.pdf"
                    
                    grade_path = os.path.join(base_dir, current_grade)
                    os.makedirs(grade_path, exist_ok=True)
                    file_path = os.path.join(grade_path, filename)
                    
                    if not os.path.exists(file_path):
                        print(f"Downloading [{current_grade}] -> {filename}")
                        try:
                            # Handle relative URLs
                            file_url = urljoin(target_url, href)
                            r = requests.get(file_url, stream=True, headers=headers, timeout=60)
                            
                            if r.status_code == 200:
                                with open(file_path, 'wb') as f:
                                    for chunk in r.iter_content(chunk_size=8192):
                                        f.write(chunk)
                                download_count += 1
                                seen_links.add(href)
                            else:
                                print(f"  [!] Failed to download {filename}: Status {r.status_code}")
                                
                        except Exception as dl_err:
                            print(f"  [!] Error downloading {filename}: {dl_err}")

        print(f"\nSuccess! {download_count} files saved in their correct folders.")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    download_fet_atps()