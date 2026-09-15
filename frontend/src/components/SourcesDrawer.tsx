import React, { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, Copy, Check, Hash, ExternalLink } from 'lucide-react';
import { RetrievedChunk } from '../types';

interface SourcesDrawerProps {
  sources: RetrievedChunk[];
}

export const SourcesDrawer: React.FC<SourcesDrawerProps> = ({ sources }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  if (!sources || sources.length === 0) return null;

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 1500);
  };

  return (
    <div className="mt-3 border border-slate-800/80 bg-slate-950/40 rounded-xl overflow-hidden transition-all">
      {/* Toggle header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3.5 py-2 flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
          <span className="font-medium text-slate-300">
            {sources.length} Retrieved Source {sources.length === 1 ? 'Chunk' : 'Chunks'}
          </span>
          <span className="text-[11px] text-slate-500">
            (Top match: {sources[0]?.similarity_score}%)
          </span>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-slate-500">
          <span>{isOpen ? 'Hide sources' : 'Show sources'}</span>
          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      {/* Expanded Chunks */}
      {isOpen && (
        <div className="p-3 pt-1 space-y-2.5 border-t border-slate-800/60 bg-slate-950/60">
          {sources.map((source, idx) => (
            <div
              key={source.chunk_id || idx}
              className="p-3 rounded-lg bg-slate-900/80 border border-slate-800/80 text-xs space-y-2 hover:border-slate-700/80 transition-all"
            >
              {/* Chunk Header */}
              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 font-semibold border border-indigo-500/20">
                    Page {source.page_label}
                  </span>
                  <span className="text-slate-400">
                    Match: <strong className="text-emerald-400 font-mono">{source.similarity_score}%</strong>
                  </span>
                  <span className="text-slate-500 font-mono text-[10px]">
                    chunk #{source.chunk_index}
                  </span>
                </div>
                <button
                  onClick={() => handleCopy(source.text, idx)}
                  className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-800 transition-colors flex items-center gap-1"
                  title="Copy chunk text"
                >
                  {copiedIndex === idx ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-[10px] text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span className="text-[10px]">Copy</span>
                    </>
                  )}
                </button>
              </div>

              {/* Chunk Content */}
              <p className="text-slate-300 leading-relaxed font-serif bg-slate-950/50 p-2.5 rounded border border-slate-800/40 text-[11.5px] italic">
                "{source.text}"
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
