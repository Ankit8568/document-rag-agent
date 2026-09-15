import React, { useState, useRef } from 'react';
import { Upload, FileUp, X, CheckCircle, AlertCircle, Loader2, Sparkles, FileText } from 'lucide-react';
import { Document } from '../types';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (doc: Document) => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onUploadSuccess,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      validateAndSetFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (file: File) => {
    setError(null);
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please upload a valid PDF document (.pdf).');
      setSelectedFile(null);
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError('File is too large. Maximum size is 50MB.');
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setError(null);
    setStatusMessage('Extracting pages and text...');

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      // Small simulated status updates for polish
      setTimeout(() => {
        if (uploading) setStatusMessage('Chunking into ~500 token segments with overlap...');
      }, 1000);

      setTimeout(() => {
        if (uploading) setStatusMessage('Generating all-MiniLM-L6-v2 embeddings & storing in ChromaDB...');
      }, 2000);

      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to process and index PDF.');
      }

      const doc: Document = await res.json();
      setStatusMessage('Document indexed successfully!');
      setTimeout(() => {
        onUploadSuccess(doc);
        onClose();
        resetState();
      }, 600);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred during upload.');
    } finally {
      setUploading(false);
    }
  };

  const resetState = () => {
    setSelectedFile(null);
    setUploading(false);
    setStatusMessage('');
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
              <FileUp className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100">Upload PDF Document</h2>
              <p className="text-xs text-slate-400">RAG pipeline will parse, chunk, and embed automatically</p>
            </div>
          </div>
          {!uploading && (
            <button
              onClick={() => {
                resetState();
                onClose();
              }}
              className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Drag & Drop Area */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => !uploading && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
              dragActive
                ? 'border-indigo-500 bg-indigo-500/10 scale-[0.99]'
                : selectedFile
                ? 'border-emerald-500/50 bg-emerald-500/5'
                : 'border-slate-700/80 hover:border-slate-600 bg-slate-950/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileChange}
              className="hidden"
              disabled={uploading}
            />

            {selectedFile ? (
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-3">
                  <FileText className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-slate-200 mb-1">{selectedFile.name}</p>
                <p className="text-xs text-slate-400 mb-3">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready to process
                </p>
                {!uploading && (
                  <span className="text-xs text-indigo-400 hover:underline">
                    Click or drag to replace file
                  </span>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-3">
                  <Upload className="w-6 h-6" />
                </div>
                <p className="text-sm font-medium text-slate-200 mb-1">
                  Drag and drop your PDF here, or <span className="text-indigo-400">browse</span>
                </p>
                <p className="text-xs text-slate-500">Supports PDF documents up to 50MB</p>
              </div>
            )}
          </div>

          {/* Upload Progress / Status */}
          {uploading && (
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-indigo-400 animate-spin flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-200">{statusMessage}</p>
                <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div className="bg-indigo-500 h-full rounded-full animate-pulse w-3/4" />
                </div>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* RAG Pipeline info box */}
          <div className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl text-[11px] text-slate-400 space-y-1">
            <div className="flex items-center gap-1.5 font-medium text-slate-300">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Automatic RAG Processing Pipeline:</span>
            </div>
            <ul className="list-disc list-inside space-y-0.5 pl-1 text-slate-400">
              <li>Text parsed page-by-page preserving document structure</li>
              <li>Recursive token chunking (~500 tokens with 50-token overlap)</li>
              <li>Local 384-dimensional dense embeddings with <code className="text-indigo-300">all-MiniLM-L6-v2</code></li>
              <li>Indexed in local ChromaDB for fast cosine similarity retrieval</li>
            </ul>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              disabled={uploading}
              onClick={() => {
                resetState();
                onClose();
              }}
              className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!selectedFile || uploading}
              onClick={handleUpload}
              className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Upload & Index</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
