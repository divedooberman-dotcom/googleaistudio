/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Plus, Trash2, Calendar, Folder, BookOpen, UploadCloud, 
  CheckCircle, ArrowLeft, RefreshCw, X, FileText, HardDrive 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DocumentItem } from '../types';
import GoogleDriveModal from './GoogleDriveModal';

interface DocumentManagerProps {
  documents: DocumentItem[];
  loading: boolean;
  onAdd: (title: string, content: string, category: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<void>;
  onReindex: () => Promise<void>;
  reindexing: boolean;
  googleToken: string | null;
  onGoogleLogin: () => Promise<void>;
}

export default function DocumentManager({
  documents,
  loading,
  onAdd,
  onDelete,
  onReindex,
  reindexing,
  googleToken,
  onGoogleLogin
}: DocumentManagerProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null);
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);
  const [waitingForToken, setWaitingForToken] = useState(false);

  // Automatically open Drive modal if login was triggered and token becomes available
  useEffect(() => {
    if (googleToken && waitingForToken) {
      setWaitingForToken(false);
      setIsDriveModalOpen(true);
    }
  }, [googleToken, waitingForToken]);
  
  // Form fields
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File parsing logic for txt/md files
  const handleFileContent = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        // Clean up file name as title
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
        setTitle(nameWithoutExt);
        setContent(text);
        // Guess a category based on name/content or default to 'Uploaded'
        if (file.name.endsWith('.md')) {
          setCategory('Documentation');
        } else {
          setCategory('General');
        }
      }
    };
    reader.readAsText(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileContent(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileContent(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setSubmitting(true);
    const success = await onAdd(title, content, category || 'Uncategorized');
    setSubmitting(false);

    if (success) {
      setTitle('');
      setCategory('');
      setContent('');
      setIsAdding(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm" id="document-manager-root">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-6 mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-600" />
            Document Repository
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Manage files that compose your semantic search context
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            id="reindex-button"
            onClick={onReindex}
            disabled={reindexing || loading}
            className="px-4 py-1.5 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-full hover:bg-slate-100 disabled:opacity-50 flex items-center gap-2 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${reindexing ? 'animate-spin' : ''}`} />
            {reindexing ? 'Reindexing...' : 'Refresh Index'}
          </button>
          
          <button
            id="add-doc-toggle"
            onClick={() => setIsAdding(!isAdding)}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-full shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
          >
            {isAdding ? (
              <>
                <ArrowLeft className="w-3.5 h-3.5" />
                View Library
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                Add Document
              </>
            )}
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {isAdding ? (
          <motion.div
            key="add-form"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25 }}
            id="add-document-form-container"
          >
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Drag and Drop File Input */}
              <div 
                id="drag-drop-zone"
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all ${
                  dragActive 
                    ? 'border-indigo-500 bg-indigo-50/50' 
                    : 'border-slate-200 bg-slate-50/30 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept=".txt,.md,.json"
                  className="hidden" 
                />
                <UploadCloud className={`w-10 h-10 mb-3 transition-colors ${dragActive ? 'text-indigo-500' : 'text-slate-400'}`} />
                <p className="text-sm font-semibold text-slate-700">
                  Drag and drop a file, or <span className="text-indigo-600">browse files</span>
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Supports .txt, .md, and .json files (ASCII or UTF-8 Plain Text)
                </p>
              </div>

              {/* Google Drive Import Row */}
              <div className="flex flex-col items-center justify-center py-3 px-4 bg-slate-50/50 border border-slate-200 rounded-xl gap-3 sm:flex-row sm:justify-between" id="google-drive-import-row">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg border border-indigo-100">
                    <HardDrive className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold text-slate-700">Import from Google Drive</p>
                    <p className="text-[10px] text-slate-400 font-medium">Connect and index Google Docs or Drive files directly</p>
                  </div>
                </div>
                
                <button
                  type="button"
                  onClick={async () => {
                    if (googleToken) {
                      setIsDriveModalOpen(true);
                    } else {
                      setWaitingForToken(true);
                      await onGoogleLogin();
                    }
                  }}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold shadow-sm flex items-center gap-1.5 cursor-pointer transition-all ${
                    googleToken
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow'
                      : 'bg-white border border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <HardDrive className="w-3.5 h-3.5" />
                  {googleToken ? 'Browse Drive' : 'Connect Drive'}
                </button>
              </div>

              {/* Grid for inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="doc-title" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Document Title
                  </label>
                  <input
                    type="text"
                    id="doc-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    placeholder="e.g. Sales Onboarding Roadmap"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none text-sm text-slate-800 bg-slate-50/30 font-medium"
                  />
                </div>
                <div>
                  <label htmlFor="doc-category" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Category Tag
                  </label>
                  <input
                    type="text"
                    id="doc-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g. Finance, HR, Marketing"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none text-sm text-slate-800 bg-slate-50/30 font-medium"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="doc-content" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Document Content
                </label>
                <textarea
                  id="doc-content"
                  rows={8}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                  placeholder="Paste or write document text here. The semantic engine works best with descriptive, complete sentences."
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none text-sm text-slate-800 bg-slate-50/30 font-sans leading-relaxed resize-y"
                />
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-slate-50 pt-4">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-5 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Embedding Content...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-3.5 h-3.5" />
                      Index Document
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                <RefreshCw className="w-8 h-8 animate-spin mb-3 text-indigo-500" />
                <p className="text-sm font-medium">Fetching active documents...</p>
              </div>
            ) : documents.length === 0 ? (
              <div className="py-16 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/30">
                <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h4 className="text-base font-bold text-slate-700">No Documents Found</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                  Upload text/markdown logs or draft a new one above. We will calculate the vectorized context automatically.
                </p>
                <button
                  onClick={() => setIsAdding(true)}
                  className="mt-4 px-4 py-2 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-all inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Document
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" id="documents-grid">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    id={`doc-card-${doc.id}`}
                    className="group border border-slate-200 shadow-sm rounded-xl p-5 hover:border-slate-300 hover:shadow-md transition-all duration-200 flex flex-col justify-between bg-white hover:bg-slate-50/30 cursor-pointer"
                    onClick={() => setSelectedDoc(doc)}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="px-2.5 py-0.5 text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full uppercase tracking-wider">
                          {doc.category}
                        </span>
                        <button
                          id={`delete-btn-${doc.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(doc.id);
                          }}
                          className="text-slate-300 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                          title="Delete Document"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <h3 className="font-bold text-slate-800 text-sm group-hover:text-indigo-600 transition-colors line-clamp-1">
                        {doc.title}
                      </h3>
                      <p className="text-xs text-slate-500 font-sans leading-relaxed line-clamp-3 mt-2">
                        {doc.content}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] text-slate-400 font-medium border-t border-slate-50 pt-3 mt-4">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Folder className="w-3 h-3 text-slate-400" />
                        {doc.wordCount} words
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedDoc && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" id="document-detail-modal">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[85vh]"
            >
              <div className="p-6 border-b border-slate-50 flex items-start justify-between bg-slate-50/50">
                <div>
                  <span className="px-2.5 py-0.5 text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full uppercase tracking-wider">
                    {selectedDoc.category}
                  </span>
                  <h3 className="text-lg font-bold text-slate-800 mt-2">{selectedDoc.title}</h3>
                </div>
                <button
                  onClick={() => setSelectedDoc(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 bg-white border border-slate-100 rounded-xl hover:shadow-sm transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto leading-relaxed text-sm text-slate-600 font-sans whitespace-pre-wrap flex-1 max-h-[50vh]">
                {selectedDoc.content}
              </div>

              <div className="p-6 border-t border-slate-50 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <span className="flex items-center gap-1 font-medium">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    Created: {new Date(selectedDoc.createdAt).toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1 font-medium">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    Word Count: {selectedDoc.wordCount}
                  </span>
                </div>
                <button
                  onClick={() => {
                    onDelete(selectedDoc.id);
                    setSelectedDoc(null);
                  }}
                  className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer self-stretch sm:self-auto justify-center"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Document
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Google Drive Modal */}
      <AnimatePresence>
        {isDriveModalOpen && googleToken && (
          <GoogleDriveModal
            isOpen={isDriveModalOpen}
            onClose={() => setIsDriveModalOpen(false)}
            token={googleToken}
            onImport={onAdd}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
