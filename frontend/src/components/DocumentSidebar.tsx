import React from 'react';
import { Upload, FileText, Trash2, Database, Layers, CheckCircle2 } from 'lucide-react';
import { Document, HealthStatus } from '../types';

interface DocumentSidebarProps {
  documents: Document[];
  activeDocument: Document | null;
  onSelectDocument: (doc: Document) => void;
  onDeleteDocument: (docId: string) => void;
  onOpenUploadModal: () => void;
  health: HealthStatus | null;
  loading: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const DocumentSidebar: React.FC<DocumentSidebarProps> = ({
  documents,
  activeDocument,
  onSelectDocument,
  onDeleteDocument,
  onOpenUploadModal,
  health,
  loading,
}) => {
  return (
    <aside className="w-80 border-r border-slate-800 bg-slate-900/50 flex flex-col h-[calc(100vh-4rem)]">
      {/* Upload Trigger Button */}
      <div className="p-4 border-b border-slate-800">
        <button
          onClick={onOpenUploadModal}
          className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 transition-all hover:shadow-indigo-600/40 active:scale-[0.98]"
        >
          <Upload className="w-4 h-4" />
          <span>Upload PDF Document</span>
        </button>
      </div>

      {/* Documents List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <div className="flex items-center justify-between px-2 py-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Documents ({documents.length})
          </span>
        </div>

        {loading && documents.length === 0 ? (
          <div className="text-center py-10 text-slate-500 text-xs">Loading documents...</div>
        ) : documents.length === 0 ? (
          <div className="text-center py-12 px-4 border border-dashed border-slate-800 rounded-2xl">
            <FileText className="w-8 h-8 mx-auto text-slate-600 mb-2" />
            <p className="text-xs font-medium text-slate-400 mb-1">No documents yet</p>
            <p className="text-[11px] text-slate-500">
              Upload a PDF to chunk, embed, and query with AI.
            </p>
          </div>
        ) : (
          documents.map((doc) => {
            const isActive = activeDocument?.id === doc.id;
            return (
              <div
                key={doc.id}
                onClick={() => onSelectDocument(doc)}
                className={`group relative p-3 rounded-xl border transition-all cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600/10 border-indigo-500/30 text-white shadow-sm'
                    : 'bg-slate-900/60 hover:bg-slate-800/60 border-slate-800/80 text-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        isActive
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-800 text-slate-400 group-hover:text-indigo-400'
                      }`}
                    >
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate leading-tight mb-1 text-slate-200">
                        {doc.filename}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <span>{doc.page_count} {doc.page_count === 1 ? 'page' : 'pages'}</span>
                        <span>•</span>
                        <span>{doc.chunk_count} chunks</span>
                        <span>•</span>
                        <span>{formatBytes(doc.file_size)}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete "${doc.filename}" and its vector embeddings?`)) {
                        onDeleteDocument(doc.id);
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                    title="Delete document"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {isActive && (
                  <div className="absolute right-3 top-3.5 text-indigo-400 pointer-events-none group-hover:opacity-0 transition-opacity">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* System Status Footer */}
      <div className="p-3 border-t border-slate-800 bg-slate-900/80 text-[11px] space-y-1.5">
        <div className="flex items-center justify-between text-slate-400">
          <span className="flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            <span>SQLite Metadata</span>
          </span>
          <span className="font-mono text-slate-300">{documents.length} docs</span>
        </div>
        <div className="flex items-center justify-between text-slate-400">
          <span className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            <span>ChromaDB Vectors</span>
          </span>
          <span className="font-mono text-slate-300">{health?.total_vectors ?? 0} vectors</span>
        </div>
      </div>
    </aside>
  );
};
