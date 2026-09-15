# Project 4: DocChat — AI Document Question and Answer Chatbot

**DocChat** is a production-quality, full-stack Retrieval-Augmented Generation (RAG) web application. Users upload any PDF document, and DocChat extracts, chunks, embeds, and indexes the text locally in ChromaDB. When a user asks a question, DocChat retrieves the top 4 most semantically similar chunks, constructs a strictly grounded context prompt, and streams token-by-token answers from Google's Gemini API alongside interactive source citations with page numbers.

## ⚡ Tech Stack

| Layer | Technology | Role / Specification |
|---|---|---|
| **Backend Framework** | **FastAPI** | High-performance asynchronous REST and Server-Sent Events (SSE) streaming API. |
| **Server** | **Uvicorn** | ASGI server running on port `4004`. |
| **Document Metadata** | **SQLite + SQLAlchemy** | Persists document ID, filename, file size, page count, chunk count, and timestamps. |
| **PDF Parsing** | **pypdf** | Pure-Python PDF parsing with page-by-page text extraction. |
| **Chunking Engine** | **Sliding Window Tokenizer** | Splits document into ~500 tokens with 50-token overlap, preserving source page references. |
| **Vector Embeddings** | **sentence-transformers (`all-MiniLM-L6-v2`)** | 384-dimensional dense embeddings running **100% locally and free**. Max sequence length configured to 512. |
| **Vector Database** | **ChromaDB** | Local persistent vector store with cosine distance metric for nearest-neighbor semantic search. |
| **LLM Generation** | **Google Gemini API** (`google-genai` SDK, AI Studio mode) | Low-latency, high-accuracy reasoning with automatic model fallback and retry-with-backoff on transient overload/rate-limit errors. |
| **Frontend** | **React 18 + Vite** | Ultra-responsive SPA with TypeScript and Lucide icons running on port `3004`. |
| **Styling** | **Tailwind CSS** | Modern slate/indigo dark theme with streaming cursor animations and responsive layout. |

---

## 🚀 Getting Started

### 1. Launch with One Click (Windows)

From the repository root directory, run:
```cmd
start-project-4.bat
```
Or in PowerShell:
```powershell
.\start-project-4.ps1
```

This starts:
- **Backend API**: `http://localhost:4004`
- **Frontend App**: `http://localhost:3004`

---

### 2. Manual Setup

#### Backend Setup:
```bash
cd projects/04-document-rag-agent/backend

# Install dependencies
pip install -r requirements.txt

# Configure environment variables (optional: add your GEMINI_API_KEY)
# You can also configure your Gemini key directly in the web UI!
copy .env.example .env

# Run backend
python main.py
```

#### Frontend Setup:
```bash
cd projects/04-document-rag-agent/frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

---

## 🔑 Gemini API Key Configuration

DocChat supports two convenient ways to provide your Gemini API key:
1. **In the Web UI**: Click the **Set API Key** button in the top navigation bar, paste your key, and click Save. It is saved in your browser's local storage and used for queries.
2. **In Backend `.env`**: Add `GEMINI_API_KEY=your_key_here` in `backend/.env`.

Get a free API key at [Google AI Studio](https://aistudio.google.com/app/apikey).

DocChat explicitly forces **AI Studio (Developer API) mode** (`api_version="v1beta"`) rather than Vertex AI mode, so a plain Gemini API key always works without needing separate cloud credentials.

---

## 📡 API Endpoints

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/health` | Service health status, total document count, Chroma vector count, model info. |
| `POST` | `/api/documents/upload` | Upload PDF file (multipart/form-data), chunk, embed, and index in ChromaDB. |
| `GET` | `/api/documents` | List all uploaded documents with metadata. |
| `GET` | `/api/documents/{id}` | Get metadata for a specific document. |
| `DELETE` | `/api/documents/{id}` | Delete document metadata and its vector embeddings from ChromaDB. |
| `POST` | `/api/chat/stream` | Server-Sent Events (SSE) streaming endpoint returning top 4 sources and generated answer tokens. |

---

## 🛡️ Reliability & Error Handling

DocChat's generation pipeline is hardened against several real-world failure modes encountered during development:

- **Model auto-discovery with safe filtering**: available Gemini models are queried live via `client.models.list()`, with TTS, audio, image, vision, and embedding-only models explicitly excluded from the text-generation fallback list (avoids `INVALID_ARGUMENT` errors from picking a non-text model).
- **Accurate error surfacing**: authentication failures, invalid API keys, invalid arguments, and quota/rate-limit errors are distinguished from one another instead of being collapsed into a generic "invalid API key" message.
- **Retry with exponential backoff**: transient `503 UNAVAILABLE` (server overload) and `429 RESOURCE_EXHAUSTED` (rate limit) errors are automatically retried on the same model up to 3 times with exponential backoff and jitter before falling back or surfacing a clear error to the user.
- **Automatic model fallback**: if a candidate model 404s or is otherwise unavailable, generation automatically retries against the next candidate model in the list.

---

## 🧪 Testing Backend Pipeline

Run the automated test suite to verify PDF generation, parsing, chunking, embedding, ChromaDB search, and SQLite metadata storage:

```bash
cd projects/04-document-rag-agent/backend
python test_backend.py
```
Output:
```
[PASS] ALL BACKEND PIPELINE TESTS PASSED SUCCESSFULLY!
```
