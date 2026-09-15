import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, AlertCircle, Copy, Check, RotateCcw, FileText, Upload } from 'lucide-react';
import { Document, ChatMessage } from '../types';
import { SourcesDrawer } from './SourcesDrawer';

interface ChatAreaProps {
  activeDocument: Document | null;
  messages: ChatMessage[];
  isStreaming: boolean;
  onSendMessage: (question: string) => void;
  onClearChat: () => void;
  onOpenUploadModal: () => void;
  onOpenApiKeyModal: () => void;
  hasApiKey: boolean;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  activeDocument,
  messages,
  isStreaming,
  onSendMessage,
  onClearChat,
  onOpenUploadModal,
  onOpenApiKeyModal,
  hasApiKey,
}) => {
  const [inputQuestion, setInputQuestion] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages or streaming chunks
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputQuestion.trim() || isStreaming || !activeDocument) return;
    onSendMessage(inputQuestion.trim());
    setInputQuestion('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const suggestedQuestions = [
    'Can you provide a comprehensive summary of this document?',
    'What are the key points and findings highlighted here?',
    'What are the main conclusions or next steps described?',
  ];

  // If no document is selected
  if (!activeDocument) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-950/40">
        <div className="max-w-md w-full p-8 rounded-3xl border border-slate-800 bg-slate-900/60 shadow-xl backdrop-blur-sm">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center mx-auto mb-5 shadow-inner">
            <FileText className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-100 mb-2">No Document Selected</h2>
          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            Upload a PDF document to start querying. The RAG pipeline will extract text, chunk it into ~500 token sections, index vectors in ChromaDB, and stream answers via Gemini 1.5 Flash.
          </p>
          <button
            onClick={onOpenUploadModal}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 transition-all active:scale-[0.98]"
          >
            <Upload className="w-4 h-4" />
            <span>Upload a PDF to Start</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-4rem)] bg-slate-950">
      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        {/* Document Header Card */}
        <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-200">{activeDocument.filename}</p>
              <p className="text-[11px] text-slate-400">
                {activeDocument.page_count} pages • {activeDocument.chunk_count} indexed vector chunks in ChromaDB
              </p>
            </div>
          </div>
          {messages.length > 0 && (
            <button
              onClick={onClearChat}
              disabled={isStreaming}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Clear Chat</span>
            </button>
          )}
        </div>

        {/* Empty Chat State with Suggested Prompts */}
        {messages.length === 0 ? (
          <div className="py-12 px-4 text-center max-w-xl mx-auto space-y-6">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center mx-auto shadow-inner">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-200 mb-1">
                Ask anything about "{activeDocument.filename}"
              </h3>
              <p className="text-xs text-slate-400">
                DocChat embeds your question, retrieves the 4 most relevant chunks from ChromaDB, and streams a grounded answer.
              </p>
            </div>

            <div className="space-y-2 text-left">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1">
                Suggested Questions
              </p>
              <div className="grid gap-2">
                {suggestedQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => onSendMessage(q)}
                    className="w-full text-left p-3 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800/80 hover:border-indigo-500/30 text-xs text-slate-300 transition-all flex items-center justify-between group"
                  >
                    <span>{q}</span>
                    <Sparkles className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 transition-colors flex-shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Message List */
          messages.map((msg) => {
            const isAssistant = msg.sender === 'assistant';
            return (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-3xl ${
                  isAssistant ? 'mr-auto w-full' : 'ml-auto justify-end'
                }`}
              >
                {/* Assistant Avatar */}
                {isAssistant && (
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-indigo-600/20">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                {/* Message Bubble */}
                <div
                  className={`rounded-2xl px-4 py-3 text-xs leading-relaxed max-w-2xl ${
                    isAssistant
                      ? 'bg-slate-900/90 border border-slate-800/90 text-slate-200 shadow-sm w-full'
                      : 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  }`}
                >
                  {/* Message Content */}
                  <div className="whitespace-pre-wrap font-sans">
                    {msg.text}
                    {msg.isStreaming && (
                      <span className="inline-block w-1.5 h-4 ml-1 bg-indigo-400 align-middle animate-cursor" />
                    )}
                  </div>

                  {/* Error display */}
                  {msg.error && (
                    <div className="mt-2 p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p>{msg.error}</p>
                        {!hasApiKey && (
                          <button
                            onClick={onOpenApiKeyModal}
                            className="mt-1.5 text-xs text-indigo-400 hover:text-indigo-300 underline block font-medium"
                          >
                            Click here to configure your Gemini API Key
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Retrieved Chunks Drawer */}
                  {isAssistant && msg.sources && msg.sources.length > 0 && (
                    <SourcesDrawer sources={msg.sources} />
                  )}

                  {/* Footer / Copy Action */}
                  {isAssistant && !msg.isStreaming && msg.text && (
                    <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500">
                      <span>Grounded with ChromaDB & Gemini 1.5 Flash</span>
                      <button
                        onClick={() => handleCopyText(msg.text, msg.id)}
                        className="hover:text-slate-300 p-1 rounded hover:bg-slate-800 transition-colors flex items-center gap-1"
                        title="Copy answer"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* User Avatar */}
                {!isAssistant && (
                  <div className="w-8 h-8 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-900/60">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto relative">
          <textarea
            ref={inputRef}
            rows={2}
            value={inputQuestion}
            onChange={(e) => setInputQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            placeholder={
              isStreaming
                ? 'DocChat is streaming the answer...'
                : `Ask a question about ${activeDocument.filename} (Enter to send, Shift+Enter for new line)`
            }
            className="w-full bg-slate-950 border border-slate-700/80 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-2xl pl-4 pr-14 py-3 text-xs text-slate-100 placeholder-slate-500 outline-none resize-none transition-all disabled:opacity-50"
          />

          <button
            type="submit"
            disabled={!inputQuestion.trim() || isStreaming}
            className="absolute right-3 bottom-3.5 w-8 h-8 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white disabled:text-slate-500 flex items-center justify-center transition-all shadow-md shadow-indigo-600/20 disabled:shadow-none"
            title="Send Question"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
        <p className="text-center text-[11px] text-slate-500 mt-2">
          Retrieves top 4 most similar chunks from ChromaDB and streams response using Gemini 1.5 Flash.
        </p>
      </div>
    </div>
  );
};
