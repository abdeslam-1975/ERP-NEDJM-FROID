from pathlib import Path
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

try:
    import pymupdf as fitz
except Exception:
    import fitz

downloads = Path(r"C:\Users\PC\Downloads")
pdfs = [p for p in downloads.glob("*.pdf") if "Journal" in p.name or "cnas" in p.name.lower()]
out_dir = Path(r"D:\OneDrive\Desktop\NedjmFroid_ERP\supabase\.temp")
out_dir.mkdir(parents=True, exist_ok=True)

print("found", len(pdfs), "pdfs")
for i, pdf in enumerate(pdfs):
    print("=" * 60)
    print("FILE:", pdf.name.encode("utf-8", "replace").decode("utf-8"))
    print("BYTES:", pdf.stat().st_size)
    doc = fitz.open(str(pdf))
    print("pages:", doc.page_count)
    texts = []
    for pi, page in enumerate(doc):
        t = page.get_text("text")
        texts.append(f"\n--- page {pi+1} ---\n{t}")
    full = "\n".join(texts)
    out = out_dir / f"jo_extract_{i}.txt"
    out.write_text(full, encoding="utf-8", errors="replace")
    print("saved:", out)
    if full.strip():
        print(full[:6000])
    else:
        print("(empty text - likely scanned images; will try OCR later)")
        # also export first page as image for Read tool
        page = doc[0]
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
        img = out_dir / f"jo_page1_{i}.png"
        pix.save(str(img))
        print("image:", img)
