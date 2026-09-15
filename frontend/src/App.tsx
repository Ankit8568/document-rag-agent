import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { DocumentSidebar } from './components/DocumentSidebar';
import { ChatArea } from './components/ChatArea';
import { UploadModal } from './components/UploadModal';
import { ApiKeyModal } from './components/ApiKeyModal';
import { Document, ChatMessage, HealthStatus } from './types';

export const App: React.FC = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activeDocument, setActiveDocument] = useState<Document | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(true);

  // Modals & API Key
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isApiKeyOpen, setIsApiKeyOpen] = useState(false);
  const [apiKey, setApiKey] = useState<string>(() => {
    return localStorage.getItem('docchat_gemini_key') || '';
  });
  const [health, setHealth] = useState<HealthStatus | null>(null);

  // Fetch health and documents on initial load
  useEffect(() => {
    fetchHealth();
    fetchDocuments();
  }, []);

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data: HealthStatus = await res.json();
        setHealth(data);
      }
    } catch (err) {
      console.error('Failed to fetch health status:', err);
    }
  };

  const fetchDocuments = async () => {
    setLoadingDocs(true);
    try {
      const res = await fetch('/api/documents');
      if (res.ok) {
        const data: Document[] = await res.json();
        setDocuments(data);
        if (data.length > 0 && !activeDocument) {
          setActiveDocument(data[0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleSaveApiKey = (key: string) => {
    setApiKey(key);
    if (key) {
      localStorage.setItem('docchat_gemini_key', key);
    } else {
      localStorage.removeItem('docchat_gemini_key');
    }
  };

  const handleSelectDocument = (doc: Document) => {
    if (activeDocument?.id === doc.id) return;
    setActiveDocument(doc);
    setMessages([]); // Start fresh conversation for new document
  };

  const handleDeleteDocument = async (docId: string) => {
    try {
      const res = await fetch(`/api/documents/${docId}`, { method: 'DELETE' });
      if (res.ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== docId));
        if (activeDocument?.id === docId) {
          const remaining = documents.filter((d) => d.id !== docId);
          setActiveDocument(remaining.length > 0 ? remaining[0] : null);
          setMessages([]);
        }
        fetchHealth();
      }
    } catch (err) {
      console.error('Failed to delete document:', err);
    }
  };

  const handleUploadSuccess = (newDoc: Document) => {
    setDocuments((prev) => [newDoc, ...prev]);
    setActiveDocument(newDoc);
    setMessages([]);
    fetchHealth();
  };

  const handleClearChat = () => {
    setMessages([]);
  };

  const handleSendMessage = async (question: string) => {
    if (!activeDocument || isStreaming) return;

    const userMessageId = `user_${Date.now()}`;
    const assistantMessageId = `asst_${Date.now()}`;

    const userMsg: ChatMessage = {
      id: userMessageId,
      sender: 'user',
      text: question,
      timestamp: new Date().toISOString(),
    };

    const assistantMsg: ChatMessage = {
      id: assistantMessageId,
      sender: 'assistant',
      text: '',
      timestamp: new Date().toISOString(),
      isStreaming: true,
      sources: [],
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          document_id: activeDocument.id,
          question: question,
          api_key: apiKey.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.detail || `Server error: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No readable stream available in response.');
      }

      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;

          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;

          try {
            const data = JSON.parse(jsonStr);

            if (data.event === 'sources') {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId ? { ...msg, sources: data.sources } : msg
                )
              );
            } else if (data.event === 'token') {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId
                    ? { ...msg, text: msg.text + (data.token || '') }
                    : msg
                )
              );
            } else if (data.event === 'error') {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId
                    ? { ...msg, error: data.message, isStreaming: false }
                    : msg
                )
              );
              setIsStreaming(false);
              return;
            } else if (data.event === 'done') {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId ? { ...msg, isStreaming: false } : msg
                )
              );
              setIsStreaming(false);
              return;
            }
          } catch (jsonErr) {
            console.warn('Failed to parse SSE line:', jsonStr, jsonErr);
          }
        }
      }
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                error: err.message || 'Error generating streaming response.',
                isStreaming: false,
              }
            : msg
        )
      );
    } finally {
      setIsStreaming(false);
    }
  };

  const hasEffectiveKey = Boolean(apiKey.trim() || health?.gemini_key_configured);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Navbar */}
      <Navbar
        activeDocument={activeDocument}
        health={health}
        onOpenApiKeyModal={() => setIsApiKeyOpen(true)}
        hasApiKey={hasEffectiveKey}
      />

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Document Sidebar */}
        <DocumentSidebar
          documents={documents}
          activeDocument={activeDocument}
          onSelectDocument={handleSelectDocument}
          onDeleteDocument={handleDeleteDocument}
          onOpenUploadModal={() => setIsUploadOpen(true)}
          health={health}
          loading={loadingDocs}
        />

        {/* Chat Conversation Area */}
        <ChatArea
          activeDocument={activeDocument}
          messages={messages}
          isStreaming={isStreaming}
          onSendMessage={handleSendMessage}
          onClearChat={handleClearChat}
          onOpenUploadModal={() => setIsUploadOpen(true)}
          onOpenApiKeyModal={() => setIsApiKeyOpen(true)}
          hasApiKey={hasEffectiveKey}
        />
      </div>

      {/* Upload PDF Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={handleUploadSuccess}
      />

      {/* API Key Modal */}
      <ApiKeyModal
        isOpen={isApiKeyOpen}
        onClose={() => setIsApiKeyOpen(false)}
        apiKey={apiKey}
        onSaveKey={handleSaveApiKey}
        backendHasKey={Boolean(health?.gemini_key_configured)}
      />
    </div>
  );
};
