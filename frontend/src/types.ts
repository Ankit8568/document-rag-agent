export interface Document {
  id: string;
  filename: string;
  file_size: number;
  page_count: number;
  chunk_count: number;
  created_at: string;
}

export interface RetrievedChunk {
  chunk_id: string;
  text: string;
  page_number: number;
  page_label: string;
  chunk_index: number;
  distance: number;
  similarity_score: number;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  sources?: RetrievedChunk[];
  isStreaming?: boolean;
  error?: string;
}

export interface HealthStatus {
  status: string;
  service: string;
  embedding_model: string;
  gemini_model: string;
  gemini_key_configured: boolean;
  total_documents: number;
  total_vectors: number;
}
