import pdfplumber

def inspect_tables(pdf_path):
    print(f"Opening {pdf_path}...")
    with pdfplumber.open(pdf_path) as pdf:
        all_tables = []
        for page in pdf.pages:
            all_tables.extend(page.extract_tables())

        # Inspect Table 5 (Index 4) specifically, as that's where skip=4 starts
        if len(all_tables) > 4:
            table = all_tables[4]
            print(f"--- Table 5 Inspection (Rows: {len(table)}) ---")
            for i, row in enumerate(table[:5]):
                # detailed print
                print(f"Row {i}: {row}")
        else:
            print("Not enough tables.")

if __name__ == "__main__":
    path = "FET_ATPs_Organized/Grade_11/Mathematics.pdf"
    inspect_tables(path)
