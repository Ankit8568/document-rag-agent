import os
import json
import uuid
from typing import Optional, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from dotenv import load_dotenv

from database import init_db, get_db
from models import Document
from rag import extract_pdf_pages, chunk_document_pages, RAGService

load_dotenv()

PORT = int(os.getenv("PORT", "4004"))
HOST = os.getenv("HOST", "0.0.0.0")
CORS_ORIGINS_RAW = os.getenv("CORS_ORIGINS", "http://localhost:3004,http://localhost:5173")
ALLOWED_ORIGINS = [o.strip() for o in CORS_ORIGINS_RAW.split(",") if o.strip()]
if "*" not in ALLOWED_ORIGINS:
    ALLOWED_ORIGINS.extend(["http://localhost:3004", "http://127.0.0.1:3004", "http://localhost:5173"])


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize SQLite database schema
    init_db()
    # Initialize RAG Service (loads embedding model & ChromaDB)
    rag_service = RAGService()
    print(f"[DocChat API] Ready on port {PORT} with model all-MiniLM-L6-v2")
    yield


app = FastAPI(
    title="DocChat API",
    description="Full-stack AI Document Q&A RAG Backend with ChromaDB and Gemini 1.5 Flash",
    version="1.0.0",
    lifespan=lifespan
)

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Pydantic Schemas
class ChatRequest(BaseModel):
    document_id: str = Field(..., description="ID of the uploaded document")
    question: str = Field(..., min_length=1, max_length=2000, description="Natural language question")
    api_key: Optional[str] = Field(None, description="Optional user-provided Gemini API key")
    model_name: Optional[str] = Field(None, description="Optional model override")


class DocumentResponse(BaseModel):
    id: str
    filename: str
    file_size: int
    page_count: int
    chunk_count: int
    created_at: Optional[str]


# API Endpoints
@app.get("/api/health")
def health_check(db: Session = Depends(get_db)):
    rag_service = RAGService()
    total_docs = db.query(Document).count()
    total_vectors = rag_service.collection.count()
    has_env_key = bool(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))

    return {
        "status": "healthy",
        "service": "DocChat API",
        "embedding_model": "all-MiniLM-L6-v2",
        "gemini_model": os.getenv("GEMINI_MODEL", "gemini-1.5-flash"),
        "gemini_key_configured": has_env_key,
        "total_documents": total_docs,
        "total_vectors": total_vectors
    }


@app.post("/api/documents/upload", response_model=DocumentResponse)
async def upload_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file format. Only PDF files are supported."
        )

    file_bytes = await file.read()
    file_size = len(file_bytes)

    if file_size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded PDF file is empty."
        )

    # 1. Extract text and pages
    try:
        pages, page_count = extract_pdf_pages(file_bytes)
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(ve)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse PDF: {str(e)}"
        )

    document_id = str(uuid.uuid4())

    # 2. Chunk document into ~500 tokens with 50 token overlap
    chunks = chunk_document_pages(
        pages=pages,
        document_id=document_id,
        target_tokens=500,
        overlap_tokens=50
    )

    if not chunks:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not generate text chunks from the document. The PDF may lack readable text."
        )

    # 3. Store chunks and embeddings in ChromaDB
    rag_service = RAGService()
    rag_service.add_document(document_id, chunks)

    # 4. Save document metadata in SQLite
    doc_record = Document(
        id=document_id,
        filename=file.filename,
        file_size=file_size,
        page_count=page_count,
        chunk_count=len(chunks)
    )
    db.add(doc_record)
    db.commit()
    db.refresh(doc_record)

    return doc_record.to_dict()


@app.get("/api/documents", response_model=List[DocumentResponse])
def list_documents(db: Session = Depends(get_db)):
    docs = db.query(Document).order_by(Document.created_at.desc()).all()
    return [d.to_dict() for d in docs]


@app.get("/api/documents/{document_id}", response_model=DocumentResponse)
def get_document(document_id: str, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    return doc.to_dict()


@app.delete("/api/documents/{document_id}")
def delete_document(document_id: str, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    # Remove chunks from ChromaDB
    rag_service = RAGService()
    rag_service.delete_document(document_id)

    # Remove from SQLite
    db.delete(doc)
    db.commit()

    return {"deleted": True, "id": document_id}


@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest, db: Session = Depends(get_db)):
    # Verify document exists
    doc = db.query(Document).filter(Document.id == request.document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    rag_service = RAGService()

    # 1. Retrieve top 4 most similar chunks
    retrieved_chunks = rag_service.retrieve_top_k(
        document_id=request.document_id,
        query=request.question,
        top_k=4
    )

    async def sse_event_generator():
        try:
            # Send the retrieved sources first so the UI can display citations immediately
            sources_event = {
                "event": "sources",
                "sources": retrieved_chunks
            }
            yield f"data: {json.dumps(sources_event)}\n\n"

            # Stream answer tokens from Gemini 1.5 Flash
            for token in rag_service.generate_answer_stream(
                question=request.question,
                retrieved_chunks=retrieved_chunks,
                api_key=request.api_key,
                model_name=request.model_name
            ):
                token_event = {
                    "event": "token",
                    "token": token
                }
                yield f"data: {json.dumps(token_event)}\n\n"

            # Signal completion
            yield f"data: {json.dumps({'event': 'done'})}\n\n"

        except Exception as e:
            error_event = {
                "event": "error",
                "message": str(e)
            }
            yield f"data: {json.dumps(error_event)}\n\n"

    return StreamingResponse(
        sse_event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Content-Type": "text/event-stream",
            "X-Accel-Buffering": "no"
        }
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=HOST, port=PORT, reload=True)
