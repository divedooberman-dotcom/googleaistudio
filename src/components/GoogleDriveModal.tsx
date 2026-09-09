import { useState, useEffect } from 'react';
import { 
  X, Search, FileText, Loader2, Calendar, HardDrive, 
  Download, AlertCircle, CheckCircle2 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { listDriveFiles, fetchDriveFileContent, DriveFile } from '../lib/auth';

interface GoogleDriveModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  onImport: (title: string, content: string, category: string) => Promise<boolean>;
}

export default function GoogleDriveModal({
  isOpen,
  onClose,
  token,
  onImport
}: GoogleDriveModalProps) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [importingId, setImportingId] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && token) {
      loadFiles();
    }
  }, [isOpen, token]);

  const loadFiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const driveFiles = await listDriveFiles(token);
      setFiles(driveFiles);
    } catch (err: any) {
      console.error('Failed to load Google Drive files:', err);
      setError(err.message || 'Could not list files from Google Drive. Please check your connection or permissions.');
    } finally {
      setLoading(false);
    }
  };

  const handleImportFile = async (file: DriveFile) => {
    setImportingId(file.id);
    setError(null);
    try {
      const textContent = await fetchDriveFileContent(token, file);
      
      if (!textContent.trim()) {
        throw new Error('This file appears to be empty and cannot be imported.');
      }

      const cleanTitle = file.name.replace(/\.[^/.]+$/, "");
      const category = file.mimeType === 'application/vnd.google-apps.document' 
        ? 'Google Doc' 
        : 'Google Drive File';

      const success = await onImport(cleanTitle, textContent, category);
      
      if (success) {
        setSuccessId(file.id);
        setTimeout(() => {
          setSuccessId(null);
          onClose();
        }, 1500);
      } else {
        throw new Error('Failed to import the document into your library.');
      }
    } catch (err: any) {
      console.error('Import error:', err);
      setError(err.message || 'An error occurred while importing the file.');
    } finally {
      setImportingId(null);
    }
  };

  // Filter files on the client side based on query
  const filteredFiles = files.filter(f => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatSize = (bytesStr?: string) => {
    if (!bytesStr) return 'N/A';
    const bytes = parseInt(bytesStr, 10);
    if (isNaN(bytes)) return 'N/A';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" id="drive-modal-wrapper">
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
        id="drive-modal-backdrop"
      />

      {/* Modal Container */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="relative bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
        id="drive-modal-content"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 border border-indigo-100 rounded-lg">
              <HardDrive className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Browse Google Drive</h3>
              <p className="text-[11px] text-slate-500 font-medium">Select a file or document to index in your semantic engine</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            id="drive-modal-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search bar */}
        <div className="p-4 border-b border-slate-100 flex items-center gap-3">
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text"
              placeholder="Search files by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-full text-xs font-medium focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none placeholder-slate-400"
              id="drive-search-input"
            />
          </div>
          <button
            onClick={loadFiles}
            disabled={loading}
            className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-50 border border-slate-200 rounded-full transition-all disabled:opacity-50 cursor-pointer"
          >
            Refresh
          </button>
        </div>

        {/* Error notification if any */}
        {error && (
          <div className="px-6 py-3 bg-red-50 border-b border-red-100 flex items-start gap-2.5 text-xs text-red-600 font-medium">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Files Area */}
        <div className="flex-grow overflow-y-auto p-4 space-y-2 min-h-[300px]">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center py-20 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-2" />
              <p className="text-xs font-semibold">Listing your documents...</p>
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <HardDrive className="w-10 h-10 text-slate-300 mb-3" />
              <p className="text-sm font-bold text-slate-600">No files found</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm text-center">
                {searchQuery 
                  ? `No items match your search for "${searchQuery}"`
                  : 'We couldn\'t find any compatible text or document files on your Drive.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2" id="drive-files-grid">
              {filteredFiles.map((file) => {
                const isDoc = file.mimeType === 'application/vnd.google-apps.document';
                const isImporting = importingId === file.id;
                const isSuccess = successId === file.id;

                return (
                  <div
                    key={file.id}
                    className={`flex items-center justify-between p-3 border rounded-xl hover:bg-indigo-50/10 transition-colors ${
                      isSuccess 
                        ? 'border-green-200 bg-green-50/10' 
                        : isImporting 
                          ? 'border-indigo-200 bg-indigo-50/5' 
                          : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-4">
                      <div className={`p-2 rounded-lg shrink-0 ${
                        isDoc ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-slate-50 text-slate-500 border border-slate-100'
                      }`}>
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate" title={file.name}>{file.name}</p>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400 font-medium">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(file.modifiedTime)}
                          </span>
                          {!isDoc && (
                            <span>{formatSize(file.size)}</span>
                          )}
                          <span className={`px-1.5 py-0.5 rounded-[4px] uppercase text-[8px] font-bold ${
                            isDoc ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {isDoc ? 'Google Doc' : 'File'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {isSuccess ? (
                        <span className="flex items-center gap-1 text-xs font-bold text-green-600">
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                          Imported!
                        </span>
                      ) : (
                        <button
                          onClick={() => handleImportFile(file)}
                          disabled={importingId !== null}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold shadow-sm transition-all flex items-center gap-1 cursor-pointer ${
                            importingId !== null
                              ? 'bg-slate-50 text-slate-400 border border-slate-200'
                              : 'bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow'
                          }`}
                        >
                          {isImporting ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Reading...
                            </>
                          ) : (
                            <>
                              <Download className="w-3 h-3" />
                              Import
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30 flex justify-between items-center text-[10px] text-slate-400 font-semibold">
          <span>Logged in as authorized Drive client</span>
          <span className="font-mono text-slate-300">v3 API ReadOnly</span>
        </div>
      </motion.div>
    </div>
  );
}
