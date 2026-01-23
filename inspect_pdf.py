
import pdfplumber
import os

pdf_files = [
    "FET_ATPs_Organized/Grade_11/History.pdf",
    "FET_ATPs_Organized/Grade_10/Mathematics.pdf",
    "FET_ATPs_Organized/Grade_12/Physical Science.pdf"
]

for pdf_path in pdf_files:
    if os.path.exists(pdf_path):
        print(f"\n--- Inspecting {pdf_path} ---")
        with pdfplumber.open(pdf_path) as pdf:
            if len(pdf.pages) > 0:
                p0 = pdf.pages[0]
                text = p0.extract_text()
                print("First Page Text Snippet:\n", text[:500])
                
                tables = p0.extract_tables()
                if tables:
                    print(f"\nFound {len(tables)} tables on page 1.")
                    print("First Table Row 1:", tables[0][0] if len(tables[0]) > 0 else "Empty")
                    print("First Table Row 2:", tables[0][1] if len(tables[0]) > 1 else "Empty")
                else:
                    print("\nNo tables found on page 1.")
