/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { 
  Sparkles, BookOpen, Layers, Info, Check, AlertTriangle, 
  Github, Database, Network, Cpu, LogOut, HardDrive 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DocumentItem, SearchResult, RAGResponse, RepositoryStats } from './types';
import StatsGrid from './components/StatsGrid';
import DocumentManager from './components/DocumentManager';
import SemanticSearch from './components/SemanticSearch';
import { initAuth, googleSignIn, logout as googleLogout } from './lib/auth';
import { User } from 'firebase/auth';

export default function App() {
  const [activeTab, setActiveTab] = useState<'search' | 'library' | 'stats'>('search');
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [stats, setStats] = useState<RepositoryStats | null>(null);
  
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [reindexing, setReindexing] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Google Drive Authentication state
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);

  // Subscribe to Firebase Auth changes
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setGoogleUser(user);
        setGoogleToken(token);
      },
      () => {
        setGoogleUser(null);
        setGoogleToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    try {
      const res = await googleSignIn();
      if (res) {
        setGoogleUser(res.user);
        setGoogleToken(res.accessToken);
        showNotification('Google account connected successfully!', 'success');
      }
    } catch (err: any) {
      console.error(err);
      showNotification(err.message || 'Failed to authorize Google Drive access', 'error');
    }
  };

  const handleGoogleLogout = async () => {
    try {
      await googleLogout();
      setGoogleUser(null);
      setGoogleToken(null);
      showNotification('Google Drive connection closed.', 'info');
    } catch (err: any) {
      console.error(err);
      showNotification('Failed to disconnect Google account', 'error');
    }
  };

  // Show auto-dismiss notifications
  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  // Fetch all documents
  const fetchDocuments = async () => {
    setLoadingDocs(true);
    try {
      const response = await fetch('/api/documents');
      if (!response.ok) throw new Error('Failed to retrieve documents');
      const data = await response.json();
      setDocuments(data);
    } catch (err: any) {
      console.error(err);
      showNotification(err.message || 'Error loading library', 'error');
    } finally {
      setLoadingDocs(false);
    }
  };

  // Fetch Stats
  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      const response = await fetch('/api/stats');
      if (!response.ok) throw new Error('Failed to retrieve stats');
      const data = await response.json();
      setStats(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingStats(false);
    }
  };

  // Initialize data load
  useEffect(() => {
    fetchDocuments();
    fetchStats();
  }, []);

  // Sync stats when active tab shifts to analytics or libraries are updated
  const syncRepositoryState = async () => {
    await Promise.all([fetchDocuments(), fetchStats()]);
  };

  // Add a new Document
  const handleAddDocument = async (title: string, content: string, category: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, category }),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to index document');
      }
      
      const data = await response.json();
      showNotification(
        data.indexed 
          ? `"${title}" has been added and successfully embedded!` 
          : `"${title}" added, but embedding failed. Check Settings > Secrets.`,
        data.indexed ? 'success' : 'info'
      );
      
      await syncRepositoryState();
      return true;
    } catch (err: any) {
      showNotification(err.message || 'Failed to add document', 'error');
      return false;
    }
  };

  // Delete a Document
  const handleDeleteDocument = async (id: string) => {
    try {
      const response = await fetch(`/api/documents/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete document');
      showNotification('Document successfully removed from repository.', 'success');
      await syncRepositoryState();
    } catch (err: any) {
      showNotification(err.message || 'Deletion failed', 'error');
    }
  };

  // Manual Trigger Reindex
  const handleReindex = async () => {
    setReindexing(true);
    try {
      const response = await fetch('/api/documents/reindex', {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Reindexing failure');
      const data = await response.json();
      showNotification(
        data.reindexedCount > 0 
          ? `Success! Generated embeddings for ${data.reindexedCount} documents.` 
          : 'All documents in repository are already fully indexed.',
        'success'
      );
      await syncRepositoryState();
    } catch (err: any) {
      showNotification(err.message || 'Failed to complete reindexing', 'error');
    } finally {
      setReindexing(false);
    }
  };

  // Search execution API connector
  const handleSearch = async (query: string, threshold: number, limit: number): Promise<{ semantic: SearchResult[]; keyword: SearchResult[] }> => {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, threshold, limit }),
    });
    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || 'Search service error');
    }
    return response.json();
  };

  // RAG generation API connector
  const handleGenerateRAG = async (query: string, results: SearchResult[]): Promise<RAGResponse> => {
    // Sanitize and minimize results payload before sending to prevent PayloadTooLargeError.
    // The server will look up full document contents directly from the local JSON database by ID.
    const minimizedResults = results.map(r => ({
      ...r,
      document: {
        id: r.document.id,
        title: r.document.title,
        category: r.document.category,
        content: r.document.content ? r.document.content.substring(0, 1000) : ''
      }
    }));

    const response = await fetch('/api/rag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, results: minimizedResults }),
    });
    if (!response.ok) throw new Error('AI answer synthesis error');
    return response.json();
  };

  return (
    <div className="w-full h-screen bg-slate-50 flex flex-col overflow-hidden font-sans text-slate-900" id="application-container">
      {/* Top Sleek Navigation */}
      <nav className="h-16 bg-white border-b border-slate-200 flex items-center px-6 justify-between shadow-sm z-10" id="app-header">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
            <div className="w-4 h-4 border-2 border-white rounded-sm"></div>
          </div>
          <span className="font-bold text-xl tracking-tight text-slate-800">
            Semantic<span className="text-indigo-600 font-extrabold">DocuSearch</span>
          </span>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200" id="navigation-tabs">
          <button
            id="tab-search"
            onClick={() => setActiveTab('search')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'search'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-800 hover:bg-white/40'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Search
          </button>
          <button
            id="tab-library"
            onClick={() => setActiveTab('library')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'library'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-800 hover:bg-white/40'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Repository
          </button>
          <button
            id="tab-stats"
            onClick={() => setActiveTab('stats')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'stats'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-800 hover:bg-white/40'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Analytics
          </button>
        </div>

        {/* Index Status Info & Google Drive Authentication */}
        <div className="flex items-center gap-4">
          {googleUser ? (
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Google Drive</p>
                <p className="text-xs text-indigo-600 font-semibold">Connected</p>
              </div>
              <div className="relative group flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-full py-1 pl-2.5 pr-1 hover:bg-slate-100 transition-all cursor-pointer">
                {googleUser.photoURL ? (
                  <img 
                    src={googleUser.photoURL} 
                    alt={googleUser.displayName || 'Google User'} 
                    referrerPolicy="no-referrer"
                    className="w-7 h-7 rounded-full shadow-sm object-cover"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center border border-indigo-200">
                    {googleUser.displayName ? googleUser.displayName.charAt(0) : 'G'}
                  </div>
                )}
                <button
                  onClick={handleGoogleLogout}
                  title="Disconnect Google Account"
                  className="p-1.5 hover:bg-slate-200 rounded-full text-slate-400 hover:text-rose-500 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Google Drive</p>
                <p className="text-xs text-slate-400 font-semibold">Disconnected</p>
              </div>
              <button
                onClick={handleGoogleLogin}
                className="px-3.5 py-1.5 border border-slate-200 hover:border-indigo-300 rounded-full text-xs font-bold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/20 transition-all shadow-sm flex items-center gap-1.5 cursor-pointer bg-white"
                id="header-google-connect-btn"
              >
                <HardDrive className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500" />
                Connect
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Main Container Layout */}
      <main className="flex flex-1 overflow-hidden" id="app-main-layout">
        {/* Left Sidebar */}
        <aside className="w-64 bg-slate-50 border-r border-slate-200 p-6 flex flex-col gap-8 overflow-y-auto hidden md:flex">
          <section>
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Repositories</h3>
              <ul className="space-y-2">
                <li className="flex items-center justify-between px-3 py-2 bg-indigo-50/70 text-indigo-700 rounded-lg font-semibold text-xs border border-indigo-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2 h-2 rounded-full bg-indigo-600"></div>
                    Main Archive
                  </div>
                  <span className="text-[10px] bg-indigo-100 px-1.5 py-0.5 rounded text-indigo-800 font-mono font-bold">
                    {documents.length}
                  </span>
                </li>
                <li className="flex items-center gap-2.5 px-3 py-2 text-slate-400 hover:bg-slate-100 rounded-lg text-xs font-medium cursor-not-allowed">
                  <div className="w-2 h-2 rounded-full bg-slate-300"></div>
                  Legal Documents
                </li>
                <li className="flex items-center gap-2.5 px-3 py-2 text-slate-400 hover:bg-slate-100 rounded-lg text-xs font-medium cursor-not-allowed">
                  <div className="w-2 h-2 rounded-full bg-slate-300"></div>
                  User Research
                </li>
              </ul>
            </div>
          </section>

          <section>
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Thematic Filters</h3>
              <div className="space-y-3">
                {stats?.categories && stats.categories.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {stats.categories.map((cat, idx) => (
                      <span key={idx} className="px-2.5 py-1 bg-white border border-slate-200 rounded-md text-[10px] font-bold text-slate-600 uppercase tracking-wider shadow-sm/50">
                        {cat.name} ({cat.count})
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 italic">No category metrics loaded.</p>
                )}
              </div>
            </div>
          </section>

          <div className="mt-auto p-4 bg-indigo-600 rounded-xl text-white shadow-md shadow-indigo-100">
            <p className="text-xs opacity-80 mb-1">Vector Embedding</p>
            <p className="text-sm font-semibold">gemini-embedding-2</p>
            <p className="text-[10px] opacity-70 mt-2">Projects paragraphs into 768-dimension vectors for semantic intent parsing.</p>
          </div>
        </aside>

        {/* Center Viewport */}
        <section className="flex-1 bg-white flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 bg-slate-50/20">
            {activeTab !== 'stats' && (
              <StatsGrid stats={stats} loading={loadingStats} />
            )}

            {/* Dynamic Panels */}
            <div className="flex-1">
              <AnimatePresence mode="wait">
                {activeTab === 'search' && (
                  <motion.div
                    key="search-panel"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.2 }}
                  >
                    <SemanticSearch onSearch={handleSearch} onGenerateRAG={handleGenerateRAG} />
                  </motion.div>
                )}

                {activeTab === 'library' && (
                  <motion.div
                    key="library-panel"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.2 }}
                  >
                    <DocumentManager
                      documents={documents}
                      loading={loadingDocs}
                      onAdd={handleAddDocument}
                      onDelete={handleDeleteDocument}
                      onReindex={handleReindex}
                      reindexing={reindexing}
                      googleToken={googleToken}
                      onGoogleLogin={handleGoogleLogin}
                    />
                  </motion.div>
                )}

                {activeTab === 'stats' && (
                  <motion.div
                    key="stats-panel"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.2 }}
                    className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6"
                    id="analytics-workspace-panel"
                  >
                    <div className="border-b border-slate-100 pb-6">
                      <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                        <Layers className="w-5 h-5 text-indigo-500" />
                        Category Analytics & Vectors
                      </h2>
                      <p className="text-xs text-slate-500 mt-1">
                        Understand category representation and vector-embedding coverage
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="border border-slate-200/80 rounded-2xl p-5 bg-slate-50/20">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                          <Cpu className="w-4 h-4 text-indigo-500" />
                          Category Distribution
                        </h3>
                        {stats?.categories && stats.categories.length > 0 ? (
                          <div className="space-y-3" id="analytics-categories-list">
                            {stats.categories.map((cat, idx) => {
                              const total = stats.totalDocuments;
                              const pct = total ? (cat.count / total) * 100 : 0;
                              return (
                                <div key={idx} className="space-y-1">
                                  <div className="flex justify-between text-xs font-bold text-slate-600">
                                    <span>{cat.name}</span>
                                    <span>{cat.count} files ({pct.toFixed(0)}%)</span>
                                  </div>
                                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic">No document metrics available. Populate the library first.</p>
                        )}
                      </div>

                      <div className="border border-slate-200/80 rounded-2xl p-5 bg-slate-50/20 flex flex-col justify-between">
                        <div>
                          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <Database className="w-4 h-4 text-emerald-500" />
                            Infrastructure Info
                          </h3>
                          <div className="space-y-2 text-xs font-medium text-slate-600 font-sans">
                            <div className="flex justify-between py-1.5 border-b border-slate-100">
                              <span className="text-slate-400">Database Engine</span>
                              <span className="font-mono text-slate-800">Local JSON Store</span>
                            </div>
                            <div className="flex justify-between py-1.5 border-b border-slate-100">
                              <span className="text-slate-400">Embedding Model</span>
                              <span className="font-mono text-slate-800">gemini-embedding-2-preview</span>
                            </div>
                            <div className="flex justify-between py-1.5">
                              <span className="text-slate-400">RAG Generation Model</span>
                              <span className="font-mono text-slate-800">gemini-3.5-flash</span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-100 text-[10px] text-slate-400 leading-normal flex items-start gap-2">
                          <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                          <p>
                            Vector representation projects text paragraphs into a 768-dimension coordinate space. Cosine similarity calculates angular difference, meaning synonymous concepts remain strongly paired even without matching literal words.
                          </p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </section>

        {/* Right Sidebar - Document Intelligence */}
        <aside className="w-80 bg-slate-50 border-l border-slate-200 flex flex-col hidden xl:flex overflow-y-auto">
          <div className="p-6 border-b border-slate-200 bg-white">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Document Intelligence</h3>
            <div className="aspect-video bg-indigo-50 border border-indigo-100 rounded-xl flex flex-col items-center justify-center text-slate-500 p-4 text-center">
              <Network className="w-8 h-8 text-indigo-600 mb-2 animate-pulse" />
              <p className="text-xs font-bold text-slate-800">Cognitive Grounding Ready</p>
              <p className="text-[10px] text-slate-400 mt-1 max-w-[180px]">Ask questions or upload documents to query the neural network.</p>
            </div>
          </div>

          <div className="flex-1 p-6 space-y-6">
            <section>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Key Concepts Supported</h4>
              <div className="flex flex-wrap gap-1.5">
                <span className="px-2 py-1 bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-bold rounded-md">Hybrid Collaboration</span>
                <span className="px-2 py-1 bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-bold rounded-md">Deployments</span>
                <span className="px-2 py-1 bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-bold rounded-md">Security Standards</span>
                <span className="px-2 py-1 bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-bold rounded-md">Brand Visuals</span>
              </div>
            </section>

            <section>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Quick Search Examples</h4>
              <ul className="text-xs text-indigo-600 font-semibold space-y-2">
                <li className="hover:underline cursor-pointer flex items-center gap-1">
                  • How do hardware stipends work?
                </li>
                <li className="hover:underline cursor-pointer flex items-center gap-1">
                  • Deployment cloud configurations
                </li>
                <li className="hover:underline cursor-pointer flex items-center gap-1">
                  • Password encryption protocol
                </li>
              </ul>
            </section>

            <div className="p-4 bg-white rounded-xl border border-slate-200/80 shadow-sm">
              <p className="text-[10px] text-slate-400 uppercase font-bold mb-2">Workspace Metadata</p>
              <div className="grid grid-cols-2 gap-y-2 text-[11px] font-semibold">
                <span className="text-slate-400">Class:</span>
                <span className="text-slate-800">Confidential</span>
                <span className="text-slate-400">Active Node:</span>
                <span className="text-emerald-600">Online</span>
              </div>
            </div>
          </div>
        </aside>
      </main>

      {/* Floating notifications */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            id="toast-notification"
            className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl shadow-xl border flex items-center gap-3 max-w-sm ${
              notification.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
                : notification.type === 'error'
                ? 'bg-rose-50 text-rose-800 border-rose-100'
                : 'bg-indigo-50 text-indigo-800 border-indigo-100'
            }`}
          >
            {notification.type === 'success' ? (
              <Check className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : notification.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-indigo-500 shrink-0" />
            )}
            <p className="text-xs font-bold leading-normal">{notification.message}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="py-6 border-t border-slate-100 bg-white" id="app-footer">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
          <p>© 2026 Semantic DocuSearchWorkspace</p>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1 text-slate-400">
              <Cpu className="w-3.5 h-3.5" /> Powered by Gemini
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
