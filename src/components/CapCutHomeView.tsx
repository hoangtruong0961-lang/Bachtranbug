import React, { useState } from 'react';
import {
  Star,
  LayoutGrid,
  Video,
  Languages,
  Download,
  Users,
  Home,
  Settings,
  Plus,
  Play,
  Trash2,
  Clock,
  Sparkles,
  Upload,
  Film,
  FileText,
  HelpCircle,
  Cpu,
  Globe,
  Link as LinkIcon,
  DownloadCloud,
  Check,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { Project, GeminiModelOption, AppSettings } from '../types';
import { ConfigView } from './ConfigView';
import { MultiPlatformDownloaderView } from './MultiPlatformDownloaderView';

interface CapCutHomeViewProps {
  projects: Project[];
  onOpenProject: (project: Project) => void;
  onCreateNewProject: (videoUrl: string, title?: string, roi?: any, videoFile?: File) => void;
  onDeleteProject: (id: string) => void;
  selectedModel: GeminiModelOption;
  onSelectModel: (model: GeminiModelOption) => void;
  onOpenHelp: () => void;
  appSettings: AppSettings;
  onSaveSettings: (newSettings: AppSettings) => void;
  initialTab?: 'home' | 'editor' | 'config' | 'downloader';
}

export const CapCutHomeView: React.FC<CapCutHomeViewProps> = ({
  projects,
  onOpenProject,
  onCreateNewProject,
  onDeleteProject,
  selectedModel,
  onSelectModel,
  onOpenHelp,
  appSettings,
  onSaveSettings,
  initialTab = 'home',
}) => {
  const [activeTab, setActiveTab] = useState<'home' | 'editor' | 'config' | 'downloader'>(initialTab);
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [importTab, setImportTab] = useState<'file' | 'gendownload' | 'url'>('gendownload');
  const [customUrl, setCustomUrl] = useState<string>('');
  
  // GenDownload Extractor State for Quick Import Modal
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<{
    title: string;
    videoUrl: string;
    directUrl: string;
    platform: string;
    thumbnail?: string;
    author?: string;
  } | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const title = file.name.replace(/\.[^/.]+$/, '');
      const url = URL.createObjectURL(file);
      onCreateNewProject(url, title, undefined, file);
      setShowImportModal(false);
    }
  };

  const handleExtractVideoWithGenDownload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customUrl.trim()) return;

    setIsExtracting(true);
    setExtractError(null);
    setExtractedData(null);

    try {
      const res = await fetch('/api/download-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: customUrl.trim(),
          apiKey: appSettings.genDownloadApiKey,
          apiUrl: appSettings.videoDownloaderApiUrl,
        }),
      });

      const json = await res.json();
      if (!json.success || !json.data) {
        throw new Error(json.error || json.message || 'Không thể bóc tách link video từ đường dẫn đã cung cấp.');
      }

      setExtractedData({
        title: json.data.title || 'Video Tải Từ Link',
        videoUrl: json.data.videoUrl,
        directUrl: json.data.directUrl || json.data.videoUrl,
        platform: json.platform || 'Multi-platform',
        thumbnail: json.data.thumbnail,
        author: json.data.author,
      });
    } catch (err: any) {
      console.error('Error extracting video:', err);
      setExtractError(err.message || 'Lỗi khi kết nối API tải video GenDownload.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleConfirmImportExtracted = () => {
    if (extractedData) {
      onCreateNewProject(extractedData.directUrl || extractedData.videoUrl, extractedData.title);
      setShowImportModal(false);
      setExtractedData(null);
      setCustomUrl('');
    }
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customUrl.trim()) {
      onCreateNewProject(customUrl.trim(), 'Video URL từ Internet');
      setCustomUrl('');
      setShowImportModal(false);
    }
  };

  const handlePrimaryEditorClick = () => {
    if (projects.length > 0) {
      onOpenProject(projects[0]);
    } else {
      onCreateNewProject('', 'Dự án mới');
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0b0d] text-slate-100 flex justify-center font-sans antialiased">
      {/* Smartphone Container Viewport */}
      <div className="w-full max-w-md bg-[#121215] min-h-screen flex flex-col relative shadow-2xl border-x border-slate-900">
        
        {/* Top Header - Icon & BachTranslate Logo Only */}
        <header className="px-4 py-3 bg-metallic-panel flex items-center sticky top-0 z-30 border-b border-slate-700/60 shadow-md">
          {/* Logo Left */}
          <div className="flex items-center space-x-2 cursor-pointer" onClick={() => setActiveTab('home')}>
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-slate-600 via-slate-300 to-slate-100 p-1 flex items-center justify-center shadow-md shadow-slate-300/20 border border-white/30">
              <Star className="w-4 h-4 text-slate-950 fill-slate-900 drop-shadow-[0_0_6px_rgba(255,255,255,0.8)]" />
            </div>
            <h1 className="text-xl font-black tracking-wider text-metallic-silver font-sans">
              BachTranslate
            </h1>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 px-4 py-4 flex flex-col gap-4 overflow-y-auto pb-24">
          
          {/* VIEW SWITCHER: CONFIG VIEW */}
          {activeTab === 'config' ? (
            <ConfigView
              settings={appSettings}
              onSaveSettings={onSaveSettings}
            />
          ) : activeTab === 'downloader' ? (
            /* VIEW SWITCHER: MULTI-PLATFORM DOWNLOADER VIEW */
            <MultiPlatformDownloaderView
              onBack={() => setActiveTab('home')}
              onCreateProject={(url, title, roi, file) => {
                onCreateNewProject(url, title, roi, file);
              }}
              appSettings={appSettings}
              onOpenConfig={() => setActiveTab('config')}
            />
          ) : (
            /* VIEW SWITCHER: HOME DASHBOARD */
            <>
              {/* Card 1: Trình biên tập Video */}
              <div
                onClick={handlePrimaryEditorClick}
                className="group relative bg-metallic-card border-metallic rounded-2xl p-5 cursor-pointer transition-all duration-300 shadow-xl overflow-hidden hover:scale-[1.01]"
              >
                {/* Top Dot & Category Tag */}
                <div className="flex items-center space-x-1.5 text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-3">
                  <span className="w-2 h-2 rounded-full bg-slate-200 inline-block animate-pulse shadow-[0_0_6px_rgba(255,255,255,0.8)]" />
                  <span>BIÊN TẬP VIDEO</span>
                </div>

                {/* Glowing Icon */}
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-slate-700 via-slate-500 to-slate-200 border border-slate-300/40 flex items-center justify-center text-slate-950 mb-4 shadow-lg shadow-slate-300/10 group-hover:scale-110 transition-transform">
                  <Video className="w-6 h-6 fill-slate-900 text-slate-950" />
                </div>

                {/* Content */}
                <h2 className="text-lg font-bold text-metallic-silver mb-1 group-hover:text-white transition-colors">
                  Trình biên tập Video
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed pr-8">
                  Biên tập video tích hợp dịch thuật và lồng tiếng kiểu...
                </p>

                {/* Subtle Watermark Graphic */}
                <Video className="absolute -right-3 -bottom-3 w-28 h-28 text-slate-700/15 pointer-events-none transform -rotate-12" />
              </div>

              {/* Card 2: Dịch màn hình Realtime */}
              <div
                onClick={() => setShowImportModal(true)}
                className="group relative bg-metallic-card border-metallic rounded-2xl p-5 cursor-pointer transition-all duration-300 shadow-xl overflow-hidden hover:scale-[1.01]"
              >
                {/* Top Dot & Category Tag */}
                <div className="flex items-center space-x-1.5 text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-3">
                  <span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />
                  <span>DỊCH MÀN HÌNH</span>
                </div>

                {/* Glowing Icon */}
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-slate-700 via-slate-500 to-slate-200 border border-slate-300/40 flex items-center justify-center text-slate-950 mb-4 shadow-lg shadow-slate-300/10 group-hover:scale-110 transition-transform">
                  <Languages className="w-6 h-6" />
                </div>

                {/* Content */}
                <h2 className="text-lg font-bold text-metallic-silver mb-1 group-hover:text-white transition-colors">
                  Dịch màn hình Realtime
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed pr-8">
                  Dịch thuật văn bản trên màn hình theo thời gian th...
                </p>

                {/* Subtle Watermark Graphic */}
                <Languages className="absolute -right-4 -bottom-4 w-32 h-32 text-slate-700/15 pointer-events-none transform rotate-6" />
              </div>

              {/* Card 3: Tải Video Đa Nền Tảng */}
              <div
                onClick={() => setActiveTab('downloader')}
                className="group relative bg-metallic-card border-metallic rounded-2xl p-5 cursor-pointer transition-all duration-300 shadow-xl overflow-hidden hover:scale-[1.01]"
              >
                {/* Top Dot & Category Tag */}
                <div className="flex items-center space-x-1.5 text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-3">
                  <span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />
                  <span>TẢI VIDEO</span>
                </div>

                {/* Glowing Icon */}
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-slate-700 via-slate-500 to-slate-200 border border-slate-300/40 flex items-center justify-center text-slate-950 mb-4 shadow-lg shadow-slate-300/10 group-hover:scale-110 transition-transform">
                  <Download className="w-6 h-6" />
                </div>

                {/* Content */}
                <h2 className="text-lg font-bold text-metallic-silver mb-1 group-hover:text-white transition-colors">
                  Tải Video Đa Nền Tảng
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed pr-8">
                  Tải video từ Douyin, Bilibili, YouTube, Facebook, Tik...
                </p>

                {/* Subtle Watermark Graphic */}
                <Download className="absolute -right-4 -bottom-4 w-32 h-32 text-slate-700/15 pointer-events-none" />
              </div>

              {/* Card 4: Kết Nối Cộng Đồng */}
              <div className="bg-metallic-card border-slate-700/60 rounded-2xl p-4 flex items-center justify-between text-slate-300 shadow-md">
                <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-slate-200 inline-block shadow-[0_0_6px_rgba(255,255,255,0.8)]" />
                  <span>KẾT NỐI CỘNG ĐỒNG</span>
                </div>
                <Users className="w-4 h-4 text-slate-200" />
              </div>

              {/* Saved Projects List */}
              {projects.length > 0 && (
                <div className="mt-2 space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-bold text-slate-300 flex items-center space-x-1">
                      <Clock className="w-3.5 h-3.5 text-sky-400" />
                      <span>Dự án gần đây ({projects.length})</span>
                    </span>
                  </div>

                  <div className="space-y-2">
                    {projects.map((proj) => (
                      <div
                        key={proj.id}
                        className="bg-[#18181c] border border-slate-800/80 hover:border-sky-500/50 rounded-xl p-3 flex items-center justify-between cursor-pointer transition"
                        onClick={() => onOpenProject(proj)}
                      >
                        <div className="flex items-center space-x-3 min-w-0">
                          <div className="w-12 h-12 bg-slate-900 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center">
                            {proj.thumbnailUrl ? (
                              <img src={proj.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Video className="w-5 h-5 text-slate-600" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-white truncate">{proj.title}</h4>
                            <p className="text-[10px] text-slate-400">
                              {proj.subtitles?.length || 0} phụ đề • {Math.round(proj.duration || 0)}s
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteProject(proj.id);
                          }}
                          className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </main>

        {/* Smartphone Fixed Bottom Dock Navigation */}
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-metallic-panel/95 backdrop-blur-md border-t border-slate-700/80 px-6 py-2 flex items-center justify-between z-40 shadow-2xl">
          {/* Home Tab */}
          <button
            onClick={() => setActiveTab('home')}
            className={`flex flex-col items-center justify-center space-y-1 transition ${
              activeTab === 'home' ? 'text-white font-bold drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[10px] tracking-wider uppercase">HOME</span>
          </button>

          {/* Center Floating Editor Action */}
          <button
            onClick={handlePrimaryEditorClick}
            className="flex flex-col items-center justify-center -mt-5 group"
          >
            <div className="w-12 h-12 rounded-full btn-metallic text-slate-950 flex items-center justify-center shadow-lg shadow-white/20 border-4 border-[#121215] transition-transform group-hover:scale-105">
              <Play className="w-5 h-5 fill-slate-950 ml-0.5" />
            </div>
            <span className="text-[10px] tracking-wider uppercase text-slate-200 font-bold mt-0.5">
              EDITOR
            </span>
          </button>

          {/* Config Tab */}
          <button
            onClick={() => setActiveTab('config')}
            className={`flex flex-col items-center justify-center space-y-1 transition ${
              activeTab === 'config' ? 'text-white font-bold drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span className="text-[10px] tracking-wider uppercase">CONFIG</span>
          </button>
        </nav>

        {/* Import Video Modal */}
        {showImportModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
            <div className="bg-metallic-panel border-t sm:border border-slate-700/80 rounded-t-3xl sm:rounded-2xl w-full max-w-md p-5 flex flex-col gap-4 shadow-2xl">
              
              {/* Modal Title & Close */}
              <div className="flex items-center justify-between border-b border-slate-700/60 pb-2.5">
                <div className="flex items-center space-x-2">
                  <DownloadCloud className="w-4 h-4 text-slate-300" />
                  <h3 className="text-xs font-black text-metallic-silver uppercase tracking-wider">Tải / Import Video Vào BachTranslate</h3>
                </div>
                <button
                  onClick={() => {
                    setShowImportModal(false);
                    setExtractedData(null);
                    setExtractError(null);
                  }}
                  className="text-slate-400 hover:text-white bg-slate-800 p-1.5 rounded-full text-xs transition border border-slate-700"
                >
                  ✕
                </button>
              </div>

              {/* Import Modal Mode Tabs */}
              <div className="grid grid-cols-3 gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-700/80 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setImportTab('gendownload');
                    setExtractError(null);
                  }}
                  className={`py-1.5 rounded-lg transition flex items-center justify-center space-x-1 ${
                    importTab === 'gendownload'
                      ? 'btn-metallic text-slate-950 font-extrabold shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>GenDownload</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setImportTab('file');
                    setExtractError(null);
                  }}
                  className={`py-1.5 rounded-lg transition flex items-center justify-center space-x-1 ${
                    importTab === 'file'
                      ? 'btn-metallic text-slate-950 font-extrabold shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>File Máy</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setImportTab('url');
                    setExtractError(null);
                  }}
                  className={`py-1.5 rounded-lg transition flex items-center justify-center space-x-1 ${
                    importTab === 'url'
                      ? 'bg-sky-500 text-slate-950 font-extrabold shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  <span>Link MP4</span>
                </button>
              </div>

              {/* TAB 1: GENDOWNLOAD MULTI-PLATFORM VIDEO DOWNLOADER */}
              {importTab === 'gendownload' && (
                <div className="flex flex-col gap-3">
                  {/* Platform Badges */}
                  <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                    <span className="bg-slate-800 text-sky-300 font-mono font-bold px-2 py-0.5 rounded-full border border-sky-500/30 flex items-center space-x-1">
                      <ShieldCheck className="w-3 h-3 text-sky-400" />
                      <span>GenDownload API</span>
                    </span>
                    <span className="bg-slate-900 text-slate-300 px-2 py-0.5 rounded-full border border-slate-800">TikTok</span>
                    <span className="bg-slate-900 text-slate-300 px-2 py-0.5 rounded-full border border-slate-800">Douyin 抖音</span>
                    <span className="bg-slate-900 text-slate-300 px-2 py-0.5 rounded-full border border-slate-800">YouTube</span>
                    <span className="bg-slate-900 text-slate-300 px-2 py-0.5 rounded-full border border-slate-800">Facebook</span>
                    <span className="bg-slate-900 text-slate-300 px-2 py-0.5 rounded-full border border-slate-800">Bilibili</span>
                  </div>

                  <form onSubmit={handleExtractVideoWithGenDownload} className="flex flex-col gap-2">
                    <label className="text-[11px] text-slate-300 font-semibold flex items-center justify-between">
                      <span>Dán link video từ TikTok / Douyin / YT / FB:</span>
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="url"
                        required
                        placeholder="https://v.douyin.com/... hoặc TikTok / YouTube link"
                        value={customUrl}
                        onChange={(e) => setCustomUrl(e.target.value)}
                        className="flex-1 bg-[#121215] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-sky-500"
                      />
                      <button
                        type="submit"
                        disabled={isExtracting || !customUrl.trim()}
                        className="bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-black text-xs px-4 py-2 rounded-xl transition flex items-center space-x-1 shadow-md"
                      >
                        {isExtracting ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Đang bóc...</span>
                          </>
                        ) : (
                          <>
                            <DownloadCloud className="w-3.5 h-3.5" />
                            <span>LẤY VIDEO</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>

                  {/* Error Notification */}
                  {extractError && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl text-xs">
                      {extractError}
                    </div>
                  )}

                  {/* Extracted Video Result Card */}
                  {extractedData && (
                    <div className="bg-[#121215] border border-sky-500/40 rounded-2xl p-3 flex flex-col gap-2 animate-fade-in shadow-xl">
                      <div className="flex items-start space-x-3">
                        {extractedData.thumbnail ? (
                          <img
                            src={extractedData.thumbnail}
                            alt="Preview"
                            className="w-16 h-16 object-cover rounded-xl border border-slate-800 flex-shrink-0"
                          />
                        ) : (
                          <div className="w-14 h-14 bg-slate-800 rounded-xl flex items-center justify-center flex-shrink-0">
                            <Film className="w-6 h-6 text-sky-400" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center space-x-1.5">
                            <span className="text-[9px] bg-sky-500/20 text-sky-300 font-bold px-1.5 py-0.5 rounded border border-sky-500/30 uppercase">
                              {extractedData.platform}
                            </span>
                            <span className="text-[10px] text-slate-400 truncate">{extractedData.author}</span>
                          </div>
                          <h4 className="text-xs font-bold text-white line-clamp-2 leading-snug">
                            {extractedData.title}
                          </h4>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleConfirmImportExtracted}
                        className="w-full mt-1 bg-sky-500 hover:bg-sky-400 active:scale-95 text-slate-950 font-extrabold text-xs py-2.5 rounded-xl transition flex items-center justify-center space-x-1.5 shadow-lg shadow-sky-500/20"
                      >
                        <Check className="w-4 h-4" />
                        <span>MỞ DỰ ÁN VỚI VIDEO NÀY</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: LOCAL FILE SELECTOR */}
              {importTab === 'file' && (
                <div className="border-2 border-dashed border-slate-800 hover:border-sky-500 rounded-2xl p-6 text-center bg-[#121215] transition space-y-3">
                  <Upload className="w-8 h-8 text-sky-400 mx-auto" />
                  <p className="text-xs font-semibold text-slate-200">Tải file video trực tiếp từ thiết bị của bạn</p>
                  <label className="cursor-pointer bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl transition shadow-md inline-block">
                    <span>Chọn Video MP4 / WebM / MOV</span>
                    <input
                      type="file"
                      accept="video/mp4,video/webm,video/quicktime"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              )}

              {/* TAB 3: DIRECT MP4 URL */}
              {importTab === 'url' && (
                <form onSubmit={handleUrlSubmit} className="flex flex-col gap-2">
                  <label className="text-xs text-slate-300 font-medium">Dán link trực tiếp file video MP4 / WebM:</label>
                  <div className="flex space-x-2">
                    <input
                      type="url"
                      placeholder="https://example.com/video.mp4"
                      value={customUrl}
                      onChange={(e) => setCustomUrl(e.target.value)}
                      className="flex-1 bg-[#121215] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                    />
                    <button
                      type="submit"
                      className="bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold px-4 py-2 rounded-xl transition"
                    >
                      Mở
                    </button>
                  </div>
                </form>
              )}

            </div>
          </div>
        )}

      </div>
    </div>
  );
};
