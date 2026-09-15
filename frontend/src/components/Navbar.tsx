import React from 'react';
import { FileText, Cpu, Sparkles, Key, CheckCircle2, AlertCircle } from 'lucide-react';
import { Document, HealthStatus } from '../types';

interface NavbarProps {
  activeDocument: Document | null;
  health: HealthStatus | null;
  onOpenApiKeyModal: () => void;
  hasApiKey: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeDocument,
  health,
  onOpenApiKeyModal,
  hasApiKey,
}) => {
  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
          <FileText className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-slate-100 tracking-tight">DocChat</h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              RAG AI
            </span>
          </div>
          <p className="text-[11px] text-slate-400">PDF Question & Answer Chatbot</p>
        </div>
      </div>

      {/* Active Document Pill & Models */}
      <div className="hidden md:flex items-center gap-2.5">
        {activeDocument ? (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 border border-slate-700/80 rounded-full text-xs text-slate-300">
            <FileText className="w-3.5 h-3.5 text-indigo-400" />
            <span className="font-medium max-w-[200px] truncate" title={activeDocument.filename}>
              {activeDocument.filename}
            </span>
            <span className="text-[10px] px-1.5 py-0.2 bg-slate-700 text-slate-300 rounded-md">
              {activeDocument.page_count} {activeDocument.page_count === 1 ? 'page' : 'pages'}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/40 border border-slate-800 rounded-full text-xs text-slate-500">
            <span>No document loaded</span>
          </div>
        )}

        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800/40 border border-slate-800 rounded-full text-[11px] text-slate-400">
          <Cpu className="w-3 h-3 text-cyan-400" />
          <span>all-MiniLM-L6-v2 (Local)</span>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800/40 border border-slate-800 rounded-full text-[11px] text-slate-400">
          <Sparkles className="w-3 h-3 text-amber-400" />
          <span>{health?.gemini_model || 'Gemini Flash'}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenApiKeyModal}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border transition-all ${
            hasApiKey
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
              : 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20'
          }`}
          title="Configure Google Gemini API key"
        >
          <Key className="w-3.5 h-3.5" />
          <span>{hasApiKey ? 'API Key Set' : 'Set API Key'}</span>
          {hasApiKey ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          )}
        </button>
      </div>
    </header>
  );
};
