
import json
import os
from extract_atp_data import extract_text_from_pdf

def test_single_file():
    test_file = "FET_ATPs_Organized/Grade_12/Physical Science.pdf"
    if not os.path.exists(test_file):
        print(f"File not found: {test_file}")
        return

    print(f"Testing extraction on single file: {test_file}")
    result = extract_text_from_pdf(test_file)
    
    if result:
        output_file = "test_history_output.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump([result], f, indent=2, ensure_ascii=False)
        print(f"\nSuccess! Output saved to {output_file}")
        
        # Print a snippet
        print("\n--- JSON Snippet ---")
        print(json.dumps(result, indent=2, ensure_ascii=False)[:1000] + "...")
    else:
        print("Extraction return None/Failed.")

if __name__ == "__main__":
    test_single_file()
