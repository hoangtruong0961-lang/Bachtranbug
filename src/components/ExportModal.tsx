import React, { useState } from 'react';
import { Download, Copy, Check, X, FileText, Upload, Sparkles } from 'lucide-react';
import { SubtitleItem } from '../types';
import { exportToSRT, exportToVTT, exportToTXT, parseSRT } from '../utils/srtParser';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  subtitles: SubtitleItem[];
  onImportSubtitles: (subtitles: SubtitleItem[]) => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  subtitles,
  onImportSubtitles,
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'srt' | 'vtt' | 'txt' | 'import'>('srt');

  if (!isOpen) return null;

  const srtContent = exportToSRT(subtitles);
  const vttContent = exportToVTT(subtitles);
  const txtContent = exportToTXT(subtitles);

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const imported = parseSRT(content);
        if (imported.length > 0) {
          onImportSubtitles(imported);
          onClose();
        } else {
          alert('Khởi tạo thất bại: Cấu trúc file SRT/VTT không hợp lệ.');
        }
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Download className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-bold text-slate-100">Xuất & Nhập Phụ Đề Video</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-800 bg-slate-950 px-5 pt-2 gap-2">
          <button
            onClick={() => setActiveTab('srt')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition ${
              activeTab === 'srt'
                ? 'bg-slate-900 text-indigo-400 border-t-2 border-indigo-500'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Định dạng SRT (.srt)
          </button>
          <button
            onClick={() => setActiveTab('vtt')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition ${
              activeTab === 'vtt'
                ? 'bg-slate-900 text-indigo-400 border-t-2 border-indigo-500'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Định dạng WebVTT (.vtt)
          </button>
          <button
            onClick={() => setActiveTab('txt')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition ${
              activeTab === 'txt'
                ? 'bg-slate-900 text-indigo-400 border-t-2 border-indigo-500'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Văn bản (.txt)
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition ${
              activeTab === 'import'
                ? 'bg-slate-900 text-indigo-400 border-t-2 border-indigo-500'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Nhập file SRT
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 flex-1 overflow-y-auto">
          {activeTab === 'import' ? (
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-800 rounded-xl p-8 text-center bg-slate-950/50">
              <Upload className="w-10 h-10 text-indigo-400 mb-3" />
              <h4 className="text-sm font-semibold text-slate-200 mb-1">
                Tải lên file phụ đề SRT / VTT có sẵn
              </h4>
              <p className="text-xs text-slate-400 mb-4 max-w-sm">
                Đồng bộ file phụ đề SRT có sẵn vào video để xem trước và chỉnh sửa.
              </p>
              <label className="cursor-pointer bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-4 py-2 rounded-xl transition shadow-lg">
                <span>Chọn File SRT từ máy</span>
                <input
                  type="file"
                  accept=".srt,.vtt,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="relative bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-slate-300 max-h-60 overflow-y-auto whitespace-pre-wrap">
                {activeTab === 'srt' && srtContent}
                {activeTab === 'vtt' && vttContent}
                {activeTab === 'txt' && txtContent}
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() =>
                    copyToClipboard(
                      activeTab === 'srt' ? srtContent : activeTab === 'vtt' ? vttContent : txtContent
                    )
                  }
                  className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium px-3.5 py-2 rounded-xl transition"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? 'Đã sao chép!' : 'Sao chép văn bản'}</span>
                </button>

                <button
                  onClick={() => {
                    if (activeTab === 'srt')
                      downloadFile(srtContent, 'subtitles_translated.srt', 'text/plain');
                    if (activeTab === 'vtt')
                      downloadFile(vttContent, 'subtitles_translated.vtt', 'text/vtt');
                    if (activeTab === 'txt')
                      downloadFile(txtContent, 'transcript_translated.txt', 'text/plain');
                  }}
                  className="flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition shadow-lg shadow-indigo-600/30"
                >
                  <Download className="w-4 h-4" />
                  <span>Tải File Bề Mặt ({activeTab.toUpperCase()})</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
