import io
import uuid
from pypdf import PdfWriter
from pypdf.generic import DictionaryObject, NameObject, ArrayObject, DecodedStreamObject, create_string_object

from database import init_db, SessionLocal
from models import Document
from rag import extract_pdf_pages, chunk_document_pages, RAGService


def create_sample_pdf() -> bytes:
    """Creates a synthetic 2-page PDF in memory using pypdf for testing."""
    writer = PdfWriter()
    
    # Page 1 text
    page1_text = (
        "DocChat Technical Documentation. "
        "DocChat is an advanced Retrieval-Augmented Generation chatbot system designed for documents. "
        "It uses sentence-transformers with the all-MiniLM-L6-v2 embedding model running 100 percent locally. "
        "ChromaDB is employed as the vector store for nearest neighbor semantic similarity queries. "
        "For language generation, DocChat connects to Google Gemini 1.5 Flash via streaming Server-Sent Events. "
        "Metadata such as document ID, file size, chunk counts, and page numbers are persisted in SQLite using SQLAlchemy."
    )
    # Page 2 text
    page2_text = (
        "Architecture Guidelines and Performance Metrics. "
        "The chunking algorithm splits text into segments of approximately 500 tokens with a 50-token overlap. "
        "This window guarantees semantic continuity between adjacent chunks. "
        "When a user asks a question, the top 4 most relevant chunks are retrieved from ChromaDB. "
        "The system strictly instructs Gemini 1.5 Flash to ground its responses exclusively in the retrieved chunks. "
        "If a question cannot be answered from the provided chunks, the chatbot will decline rather than hallucinate."
    )

    # Use reportlab or standard pypdf page creation
    # If reportlab is not installed, we can construct simple PDF stream pages
    # Let's test if reportlab is installed or use minimal PDF bytes
    return make_minimal_pdf([page1_text, page2_text])


def make_minimal_pdf(pages_text: list[str]) -> bytes:
    """
    Constructs a valid multi-page PDF using standard PDF syntax.
    """
    objects = []
    
    # We will build standard PDF objects
    font_obj_num = 3
    
    page_obj_nums = []
    current_num = 4
    
    # We'll build contents and pages
    contents_and_pages = []
    for text in pages_text:
        content_num = current_num
        page_num = current_num + 1
        current_num += 2
        page_obj_nums.append(page_num)
        contents_and_pages.append((content_num, page_num, text))

    out = []
    out.append(b"%PDF-1.4\n")
    
    offsets = {}
    
    def add_obj(num, content_bytes):
        offsets[num] = sum(len(x) for x in out)
        out.append(f"{num} 0 obj\n".encode("ascii"))
        out.append(content_bytes)
        out.append(b"\nendobj\n")

    # 1: Catalog
    add_obj(1, b"<< /Type /Catalog /Pages 2 0 R >>")
    
    # 2: Pages
    kids_str = " ".join(f"{p} 0 R" for p in page_obj_nums)
    add_obj(2, f"<< /Type /Pages /Kids [{kids_str}] /Count {len(page_obj_nums)} >>".encode("ascii"))
    
    # 3: Font
    add_obj(3, b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

    for content_num, page_num, text in contents_and_pages:
        # Simple PDF text stream: BT /F1 12 Tf 50 700 Td (text) Tj ET
        safe_text = text.replace("(", "\\(").replace(")", "\\)")
        stream_content = f"BT\n/F1 12 Tf\n50 750 Td\n({safe_text}) Tj\nET\n".encode("utf-8")
        stream_obj = (
            f"<< /Length {len(stream_content)} >>\nstream\n".encode("ascii")
            + stream_content
            + b"endstream"
        )
        add_obj(content_num, stream_obj)
        
        page_obj = (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            f"/Contents {content_num} 0 R /Resources << /Font << /F1 3 0 R >> >> >>"
        ).encode("ascii")
        add_obj(page_num, page_obj)

    # xref
    xref_pos = sum(len(x) for x in out)
    out.append(f"xref\n0 {current_num}\n0000000000 65535 f \n".encode("ascii"))
    for i in range(1, current_num):
        off = offsets.get(i, 0)
        out.append(f"{off:010d} 00000 n \n".encode("ascii"))
        
    out.append(f"trailer\n<< /Size {current_num} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode("ascii"))
    return b"".join(out)


def run_tests():
    print("=== Testing DocChat Backend Pipeline ===")

    # 1. Initialize DB
    print("[1/6] Initializing SQLite database...")
    init_db()
    db = SessionLocal()

    # 2. Generate and parse PDF
    print("[2/6] Generating sample multi-page PDF...")
    pdf_bytes = create_sample_pdf()
    pages, page_count = extract_pdf_pages(pdf_bytes)
    print(f"      Extracted {len(pages)} pages. Total pages count: {page_count}")
    assert page_count == 2, f"Expected 2 pages, got {page_count}"
    assert "DocChat" in pages[0]["text"]

    # 3. Chunking
    print("[3/6] Chunking document (~500 tokens with 50 token overlap)...")
    doc_id = str(uuid.uuid4())
    chunks = chunk_document_pages(pages, document_id=doc_id, target_tokens=500, overlap_tokens=50)
    print(f"      Created {len(chunks)} chunks.")
    assert len(chunks) >= 1, "Expected at least 1 chunk"
    print(f"      Chunk 0 preview: {chunks[0]['text'][:80]}... (Page {chunks[0]['page_label']})")

    # 4. ChromaDB & SentenceTransformer
    print("[4/6] Embedding and storing chunks in ChromaDB...")
    rag = RAGService()
    added_count = rag.add_document(doc_id, chunks)
    print(f"      Stored {added_count} chunks in ChromaDB.")
    assert added_count == len(chunks)

    # 5. Semantic Query & Retrieval
    print("[5/6] Querying ChromaDB for top relevant chunks...")
    query = "What embedding model and vector database does DocChat use?"
    retrieved = rag.retrieve_top_k(document_id=doc_id, query=query, top_k=4)
    print(f"      Retrieved {len(retrieved)} chunks:")
    for r in retrieved:
        print(f"        - [Page {r['page_label']}] Similarity: {r['similarity_score']}% | Preview: {r['text'][:70]}...")
    assert len(retrieved) > 0
    assert "all-MiniLM-L6-v2" in retrieved[0]["text"] or "ChromaDB" in retrieved[0]["text"]

    # 6. SQLite Metadata
    print("[6/6] Storing and verifying SQLite document metadata...")
    doc_rec = Document(
        id=doc_id,
        filename="DocChat_Architecture.pdf",
        file_size=len(pdf_bytes),
        page_count=page_count,
        chunk_count=len(chunks)
    )
    db.add(doc_rec)
    db.commit()

    saved = db.query(Document).filter(Document.id == doc_id).first()
    assert saved is not None
    assert saved.filename == "DocChat_Architecture.pdf"
    assert saved.chunk_count == len(chunks)
    print(f"      Successfully saved in SQLite: {saved.to_dict()}")

    # Cleanup test doc
    rag.delete_document(doc_id)
    db.delete(saved)
    db.commit()
    db.close()

    print("\n[PASS] ALL BACKEND PIPELINE TESTS PASSED SUCCESSFULLY!")


if __name__ == "__main__":
    run_tests()
