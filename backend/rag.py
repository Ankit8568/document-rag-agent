import io
import os
import re
import time
import random
from pathlib import Path
from typing import List, Dict, Any, Generator, Optional
from dotenv import load_dotenv
from pypdf import PdfReader
from sentence_transformers import SentenceTransformer
import chromadb

# Load environment
backend_dir = Path(__file__).resolve().parent
load_dotenv(backend_dir / ".env")

CHROMA_DIR = os.getenv("CHROMA_DIR", "./data/chroma")
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
DEFAULT_GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

if CHROMA_DIR.startswith("./") or CHROMA_DIR.startswith(".\\"):
    chroma_path = backend_dir / CHROMA_DIR
else:
    chroma_path = Path(CHROMA_DIR)
chroma_path.mkdir(parents=True, exist_ok=True)


def extract_pdf_pages(file_bytes: bytes) -> tuple[List[Dict[str, Any]], int]:
    stream = io.BytesIO(file_bytes)
    reader = PdfReader(stream)
    total_pages = len(reader.pages)

    pages = []
    total_text_length = 0
    for page_idx, page in enumerate(reader.pages):
        raw_text = page.extract_text() or ""
        cleaned_text = re.sub(r"[ \t]+", " ", raw_text).strip()
        pages.append({
            "page_number": page_idx + 1,
            "text": cleaned_text
        })
        total_text_length += len(cleaned_text)

    if total_text_length == 0:
        raise ValueError(
            "No extractable text found in this PDF. It may be a scanned image or empty document."
        )

    return pages, total_pages


def chunk_document_pages(
    pages: List[Dict[str, Any]],
    document_id: str,
    target_tokens: int = 500,
    overlap_tokens: int = 50
) -> List[Dict[str, Any]]:
    words_per_chunk = max(50, int(target_tokens / 1.3))
    overlap_words = max(5, int(overlap_tokens / 1.3))
    step = words_per_chunk - overlap_words

    tagged_words = []
    for p in pages:
        page_num = p["page_number"]
        page_text = p["text"]
        if not page_text:
            continue
        words = page_text.split()
        for w in words:
            tagged_words.append((w, page_num))

    if not tagged_words:
        return []

    chunks = []
    chunk_index = 0
    i = 0
    total_words = len(tagged_words)

    while i < total_words:
        chunk_slice = tagged_words[i : i + words_per_chunk]
        if not chunk_slice:
            break

        chunk_text = " ".join(word for word, _ in chunk_slice)
        start_page = chunk_slice[0][1]
        end_page = chunk_slice[-1][1]
        page_label = f"{start_page}" if start_page == end_page else f"{start_page}-{end_page}"
        estimated_tokens = int(len(chunk_slice) * 1.3)

        chunks.append({
            "id": f"{document_id}_chunk_{chunk_index}",
            "document_id": document_id,
            "chunk_index": chunk_index,
            "text": chunk_text,
            "page_number": start_page,
            "page_label": page_label,
            "token_count": estimated_tokens
        })

        chunk_index += 1
        i += step

        if i >= total_words:
            break

    return chunks


class RAGService:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(RAGService, cls).__new__(cls)
            cls._instance._initialize()
        return cls._instance

    def _initialize(self):
        print(f"[RAGService] Loading embedding model: {EMBEDDING_MODEL_NAME}...")
        self.embedding_model = SentenceTransformer(EMBEDDING_MODEL_NAME)
        self.embedding_model.max_seq_length = 512
        print(f"[RAGService] Embedding model ready. Dim: 384")

        print(f"[RAGService] Initializing ChromaDB persistent client at: {chroma_path.as_posix()}...")
        self.chroma_client = chromadb.PersistentClient(path=chroma_path.as_posix())
        self.collection = self.chroma_client.get_or_create_collection(
            name="docchat_chunks",
            metadata={"hnsw:space": "cosine"}
        )
        print(f"[RAGService] ChromaDB collection ready. Total vectors: {self.collection.count()}")

    def add_document(self, document_id: str, chunks: List[Dict[str, Any]]) -> int:
        if not chunks:
            return 0

        texts = [c["text"] for c in chunks]
        ids = [c["id"] for c in chunks]
        metadatas = [
            {
                "document_id": c["document_id"],
                "chunk_index": c["chunk_index"],
                "page_number": c["page_number"],
                "page_label": str(c.get("page_label", c["page_number"])),
                "token_count": c.get("token_count", 0)
            }
            for c in chunks
        ]

        embeddings = self.embedding_model.encode(
            texts,
            show_progress_bar=False,
            convert_to_numpy=True
        ).tolist()

        self.collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=texts,
            metadatas=metadatas
        )

        return len(chunks)

    def delete_document(self, document_id: str) -> None:
        try:
            self.collection.delete(where={"document_id": document_id})
        except Exception as e:
            print(f"[RAGService] Warning deleting chunks for {document_id}: {e}")

    def retrieve_top_k(
        self,
        document_id: str,
        query: str,
        top_k: int = 4
    ) -> List[Dict[str, Any]]:
        query_embedding = self.embedding_model.encode(
            [query],
            show_progress_bar=False,
            convert_to_numpy=True
        ).tolist()[0]

        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            where={"document_id": document_id},
            include=["documents", "metadatas", "distances"]
        )

        retrieved = []
        if results and "documents" in results and results["documents"]:
            docs = results["documents"][0]
            metas = results["metadatas"][0] if "metadatas" in results else []
            distances = results["distances"][0] if "distances" in results else []
            ids = results["ids"][0] if "ids" in results else []

            for i in range(len(docs)):
                dist = distances[i] if i < len(distances) else 0.0
                similarity = max(0.0, min(1.0, 1.0 - (dist / 2.0)))
                meta = metas[i] if i < len(metas) else {}
                retrieved.append({
                    "chunk_id": ids[i] if i < len(ids) else f"chunk_{i}",
                    "text": docs[i],
                    "page_number": meta.get("page_number", 1),
                    "page_label": meta.get("page_label", str(meta.get("page_number", 1))),
                    "chunk_index": meta.get("chunk_index", i),
                    "distance": round(float(dist), 4),
                    "similarity_score": round(float(similarity * 100), 1)
                })

        return retrieved

    def generate_answer_stream(
        self,
        question: str,
        retrieved_chunks: List[Dict[str, Any]],
        api_key: Optional[str] = None,
        model_name: Optional[str] = None
    ) -> Generator[str, None, None]:
        """
        Builds grounded context prompt and streams response tokens from Google Gemini.
        Retries with exponential backoff on transient 503/UNAVAILABLE overload errors.
        """
        resolved_key = api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not resolved_key or not resolved_key.strip():
            raise ValueError(
                "Gemini API key not found. Please provide your Gemini API key in the UI settings "
                "or set GEMINI_API_KEY in the backend .env file."
            )

        resolved_key = resolved_key.strip().strip('"').strip("'").strip()

        resolved_model = model_name or os.getenv("GEMINI_MODEL", DEFAULT_GEMINI_MODEL)

        context_parts = []
        for idx, chunk in enumerate(retrieved_chunks):
            page_str = chunk.get("page_label", chunk.get("page_number", "Unknown"))
            context_parts.append(
                f"[Source Chunk {idx + 1} - Page {page_str}]:\n{chunk['text']}"
            )

        context_text = "\n\n---\n\n".join(context_parts)

        prompt = f"""You are DocChat, a precise, intelligent AI document assistant.
Answer the user's question using ONLY the provided document context chunks below.

CONTEXT CHUNKS:
================
{context_text}
================

USER QUESTION:
{question}

INSTRUCTIONS:
1. Ground your answer completely on the provided context chunks. Do not hallucinate or use external knowledge not supported by the context.
2. If the context does not contain enough information to answer the question, state clearly: "Based on the provided document, there is not enough information to answer this question."
3. Cite the relevant page numbers whenever making factual claims (e.g. [Page 2] or [Pages 1-3]).
4. Format your answer with clean Markdown: use bold text for key terms, lists for steps/points, and code blocks if applicable.
5. Provide a clear, direct, and well-structured answer.
"""

        try:
            from google import genai
            from google.genai import types

            client = genai.Client(
                api_key=resolved_key,
                http_options=types.HttpOptions(api_version="v1beta")
            )

            candidate_models = []
            for m in [
                resolved_model,
                "gemini-2.5-flash",
                "gemini-2.0-flash",
                "gemini-1.5-flash-latest",
                "gemini-1.5-flash",
                "gemini-2.0-flash-exp",
                "gemini-1.5-pro",
            ]:
                if m and m not in candidate_models:
                    candidate_models.append(m)

            try:
                available_from_api = []
                for model_info in client.models.list():
                    short_name = (model_info.name or "").replace("models/", "")
                    actions = getattr(model_info, "supported_actions", []) or []
                    if not actions or "generateContent" in actions:
                        available_from_api.append(short_name)

                if available_from_api:
                    valid_candidates = [m for m in candidate_models if m in available_from_api]
                    excluded_keywords = ["embed", "tts", "audio", "image", "vision", "live", "native-audio"]
                    other_gen = [
                        m for m in available_from_api
                        if "gemini" in m.lower()
                        and not any(kw in m.lower() for kw in excluded_keywords)
                        and m not in valid_candidates
                    ]
                    if valid_candidates:
                        candidate_models = valid_candidates + other_gen
                    elif other_gen:
                        candidate_models = other_gen
            except Exception as list_e:
                err_str = str(list_e)
                if "API_KEY_INVALID" in err_str or "UNAUTHENTICATED" in err_str or "PERMISSION_DENIED" in err_str:
                    raise ValueError(
                        f"Gemini API key was rejected during authentication check: {err_str}"
                    )
                print(f"[DocChat] Note: models.list query skipped ({list_e}). Using candidate list: {candidate_models}")

            # --- Retry-with-backoff settings for transient overload/rate errors ---
            MAX_RETRIES = 3
            BASE_DELAY = 1.5  # seconds

            last_error = None
            for model_to_try in candidate_models:
                attempt = 0
                while attempt <= MAX_RETRIES:
                    try:
                        print(f"[DocChat] Attempting generation with model: {model_to_try} (attempt {attempt + 1})")
                        response_stream = client.models.generate_content_stream(
                            model=model_to_try,
                            contents=prompt
                        )
                        yielded_any = False
                        for chunk in response_stream:
                            if chunk.text:
                                yielded_any = True
                                yield chunk.text
                        if yielded_any:
                            return
                        # No content streamed but no exception either - don't retry, move to next model
                        break
                    except Exception as stream_err:
                        err_str = str(stream_err)

                        is_overloaded = (
                            "503" in err_str
                            or "UNAVAILABLE" in err_str
                            or "overloaded" in err_str.lower()
                        )
                        is_rate_limited = "RESOURCE_EXHAUSTED" in err_str or "429" in err_str

                        if (is_overloaded or is_rate_limited) and attempt < MAX_RETRIES:
                            # Exponential backoff with jitter, then retry the SAME model
                            delay = BASE_DELAY * (2 ** attempt) + random.uniform(0, 0.5)
                            print(f"[DocChat] '{model_to_try}' overloaded/rate-limited, retrying in {delay:.1f}s...")
                            time.sleep(delay)
                            attempt += 1
                            continue

                        if "404" in err_str or "NOT_FOUND" in err_str or "not found for API version" in err_str:
                            print(f"[DocChat] Model '{model_to_try}' returned 404, trying next candidate...")
                            last_error = stream_err
                            break
                        elif "API_KEY_INVALID" in err_str:
                            raise ValueError("Invalid Gemini API key. Please verify your key.")
                        elif "INVALID_ARGUMENT" in err_str:
                            raise ValueError(f"Gemini request error (not necessarily the API key): {err_str}")
                        elif is_rate_limited:
                            raise ValueError("Gemini API rate limit or quota exceeded. Please try again shortly.")
                        elif is_overloaded:
                            last_error = ValueError(
                                "Gemini is currently experiencing high demand (503 UNAVAILABLE). "
                                "Retries were exhausted - please try again in a moment."
                            )
                            break
                        else:
                            raise stream_err

            if last_error:
                raise last_error

        except ValueError as ve:
            raise ve
        except Exception as e:
            raise RuntimeError(f"Gemini generation error: {str(e)}")
