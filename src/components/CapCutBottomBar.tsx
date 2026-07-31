import React, { useState, useEffect } from 'react';
import {
  Crop,
  Languages,
  Volume2,
  SlidersHorizontal,
  Plus,
  X,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Edit3,
  Palette,
  Trash2,
  Type,
  Check,
  Sparkles,
  Camera,
  Play,
  Mic,
  Sliders,
  Loader2,
  Merge,
  VolumeX,
  Settings,
} from 'lucide-react';
import {
  CapCutTab,
  GeminiModelOption,
  RegionROI,
  SubtitleItem,
  SubtitleStyleConfig,
  OCRScanProgress,
  AppSettings,
  TTSProviderOption,
} from '../types';
import { SUPPORTED_LANGUAGES } from '../data/sampleVideos';
import { SubtitleStylingPanel } from './SubtitleStylingPanel';

interface CapCutBottomBarProps {
  activeTab: CapCutTab | null;
  onSelectTab: (tab: CapCutTab | null) => void;
  // Selected Subtitle Block state
  selectedSubtitle: SubtitleItem | null;
  onSelectSubtitle: (sub: SubtitleItem | null) => void;
  onUpdateSubtitle: (updated: SubtitleItem) => void;
  onDeleteSubtitle: (id: string) => void;
  // Extract actions
  onExtractSingleFrame: () => void;
  isExtractingSingle: boolean;
  onStartFullScan: (startTime: number, endTime: number, interval: number, customContext: string) => void;
  scanProgress: OCRScanProgress;
  onCancelScan: () => void;
  videoDuration: number;
  // Translate actions
  targetLang: string;
  onSelectTargetLang: (lang: string) => void;
  selectedModel: GeminiModelOption;
  onSelectModel: (model: GeminiModelOption) => void;
  onReTranslateAll: (overrideModel?: GeminiModelOption, optimizeForTts?: boolean) => void;
  isTranslatingBatch: boolean;
  // Audio TTS actions
  activeSubtitle?: SubtitleItem | null;
  appSettings: AppSettings;
  onSaveSettings: (newSettings: AppSettings) => void;
  onPlayTTS: (text: string, speed?: number, pitch?: number, providerOverride?: TTSProviderOption) => void;
  onMergeShortSubtitles: () => void;
  onGenerateAllAudio: () => void;
  isGeneratingAllAudio: boolean;
  audioGenProgress: { current: number; total: number };
  audioPlayWithVideo: boolean;
  onToggleAudioPlayWithVideo: (val: boolean) => void;
  onClearAllAudio: () => void;
  // Subtitles & Styling
  subtitles: SubtitleItem[];
  onAddSubtitle: () => void;
  styleConfig: SubtitleStyleConfig;
  onChangeStyle: (newStyle: SubtitleStyleConfig) => void;
  // ROI presets
  onChangeRoi: (roi: RegionROI) => void;
  onOpenConfigDrawer?: () => void;
}

export const CapCutBottomBar: React.FC<CapCutBottomBarProps> = ({
  activeTab,
  onSelectTab,
  selectedSubtitle,
  onSelectSubtitle,
  onUpdateSubtitle,
  onDeleteSubtitle,
  onExtractSingleFrame,
  isExtractingSingle,
  onStartFullScan,
  scanProgress,
  onCancelScan,
  videoDuration,
  targetLang,
  onSelectTargetLang,
  selectedModel,
  onSelectModel,
  onReTranslateAll,
  isTranslatingBatch,
  activeSubtitle,
  appSettings,
  onSaveSettings,
  onPlayTTS,
  onMergeShortSubtitles,
  onGenerateAllAudio,
  isGeneratingAllAudio,
  audioGenProgress,
  audioPlayWithVideo,
  onToggleAudioPlayWithVideo,
  onClearAllAudio,
  subtitles,
  onAddSubtitle,
  styleConfig,
  onChangeStyle,
  onChangeRoi,
  onOpenConfigDrawer,
}) => {
  const [scanStart, setScanStart] = useState<number>(0);
  const [scanEnd, setScanEnd] = useState<number>(Math.min(300, Math.ceil(videoDuration) || 60));
  const [scanInterval, setScanInterval] = useState<number>(1.0);
  const [contextPrompt, setContextPrompt] = useState<string>('');

  // Audio TTS Local Config
  const [ttsSpeed, setTtsSpeed] = useState<number>(appSettings.ttsSpeed || 1.0);
  const [ttsPitch, setTtsPitch] = useState<number>(appSettings.ttsPitch || 0);
  const [selectedTtsProvider, setSelectedTtsProvider] = useState<TTSProviderOption>(appSettings.ttsProvider || 'nghi_tts');
  const [autoMergeSubtitles, setAutoMergeSubtitles] = useState<boolean>(true);
  const [isTuningCollapsed, setIsTuningCollapsed] = useState<boolean>(false);

  useEffect(() => {
    if (appSettings.ttsProvider) {
      setSelectedTtsProvider(appSettings.ttsProvider);
    }
  }, [appSettings.ttsProvider]);

  // Nghi TTS download & status management
  const [nghiStatus, setNghiStatus] = useState<{ ready: boolean; modelSizeMb: number; downloadedVoices: string[] } | null>(null);
  const [isDownloadingNghi, setIsDownloadingNghi] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState('');

  const checkNghiStatus = async (voiceKey: string, autoDownloadIfMissing = false) => {
    try {
      const res = await fetch('/api/tts/nghi-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nghiVoice: voiceKey }),
      });
      const data = await res.json();
      if (data.success) {
        setNghiStatus(data);
        if (autoDownloadIfMissing && !data.downloadedVoices?.includes(voiceKey)) {
          handleDownloadNghiModel(voiceKey);
        }
      }
    } catch (e) {
      console.warn('Check Nghi status error:', e);
    }
  };

  const handleDownloadNghiModel = async (voiceKey: string) => {
    const voiceNameMap: Record<string, string> = {
      ngochuyennew: 'Ngọc Huyền',
      lacphi: 'Lạc Phi',
      duyoryx: 'Duy Oryx',
      ngocngan: 'Ngọc Ngạn',
      maiphuong: 'Mai Phương',
      minhquang: 'Minh Quang',
    };
    const voiceName = voiceNameMap[voiceKey] || voiceKey;

    setIsDownloadingNghi(true);
    setDownloadMsg(`⏳ Đang tải về mô hình giọng đọc ${voiceName}... Vui lòng đợi trong giây lát!`);
    try {
      const res = await fetch('/api/tts/nghi-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nghiVoice: voiceKey }),
      });
      const data = await res.json();
      if (data.success) {
        setDownloadMsg(`✓ Đã tải xong giọng đọc ${voiceName}!`);
        await checkNghiStatus(voiceKey);
      } else {
        setDownloadMsg(`❌ Lỗi tải: ${data.error}`);
      }
    } catch (e: any) {
      setDownloadMsg(`❌ Lỗi kết nối: ${e.message}`);
    } finally {
      setIsDownloadingNghi(false);
    }
  };

  React.useEffect(() => {
    if (selectedTtsProvider === 'nghi_tts') {
      checkNghiStatus(appSettings.nghiVoice || 'lacphi', true);
    }
  }, [selectedTtsProvider, appSettings.nghiVoice]);

  // Subtitle block edit panel popups
  const [showTextEditor, setShowTextEditor] = useState<boolean>(false);
  const [showConfigPanel, setShowConfigPanel] = useState<boolean>(false);

  // Editable text state
  const [editTextOriginal, setEditTextOriginal] = useState<string>('');
  const [editTextTranslated, setEditTextTranslated] = useState<string>('');

  // Bottom Sheet animation & collapse/expand state ("Ngạch Ngang" handle bar)
  const [isSheetCollapsed, setIsSheetCollapsed] = useState<boolean>(false);
  const [sourceLang, setSourceLang] = useState<string>('Tiếng Trung');
  const [ocrMode, setOcrMode] = useState<'fast' | 'deep'>('fast');
  const [filterStrength, setFilterStrength] = useState<string>('80%');
  const [aiFilterDeduplicate, setAiFilterDeduplicate] = useState<boolean>(true);
  const [optimizeForTts, setOptimizeForTts] = useState<boolean>(true);

  React.useEffect(() => {
    if (activeTab || showTextEditor || showConfigPanel) {
      setIsSheetCollapsed(false);
    }
  }, [activeTab, showTextEditor, showConfigPanel]);

  const isScanning = scanProgress.status === 'scanning' || scanProgress.status === 'translating';

  // Open text edit modal
  const handleOpenTextEditor = () => {
    if (selectedSubtitle) {
      setEditTextOriginal(selectedSubtitle.originalText || '');
      setEditTextTranslated(selectedSubtitle.translatedText || '');
      setShowTextEditor(true);
      setShowConfigPanel(false);
    }
  };

  const handleSaveTextEditor = () => {
    if (selectedSubtitle) {
      onUpdateSubtitle({
        ...selectedSubtitle,
        originalText: editTextOriginal,
        translatedText: editTextTranslated,
      });
      setShowTextEditor(false);
    }
  };

  const activeSheetType = selectedSubtitle && showTextEditor
    ? 'text_editor'
    : (showConfigPanel || activeTab === 'config' || activeTab === 'style')
    ? 'config'
    : activeTab && !selectedSubtitle
    ? activeTab
    : null;

  return (
    <div className="bg-[#121215] border-t border-slate-900 shadow-2xl flex flex-col relative z-30 select-none">
      {/* ------------------------------------------------------------- */}
      {/* UNIFIED SLIDE-UP BOTTOM SHEET FOR ALL BOTTOM TAB / BLOCK ACTIONS */}
      {/* ------------------------------------------------------------- */}
      {activeSheetType && (
        <React.Fragment>
          {/* Backdrop (Fades out when collapsed so user can interact with video/OCR) */}
          <div
            onClick={() => {
              onSelectTab(null);
              setShowTextEditor(false);
              setShowConfigPanel(false);
            }}
            className={`fixed inset-0 bg-black/60 z-50 transition-opacity duration-300 ${
              isSheetCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100 backdrop-blur-xs'
            }`}
          />

          {/* Slide-Up Container */}
          <div
            className={`fixed inset-x-0 bottom-0 z-[60] max-w-md mx-auto bg-[#18181c] border-t border-slate-800 rounded-t-3xl shadow-2xl transition-transform duration-300 ease-out flex flex-col max-h-[80vh] ${
              isSheetCollapsed ? 'translate-y-[calc(100%-3.25rem)]' : 'translate-y-0'
            }`}
          >
            {/* Top Horizontal Drag Handle Bar ("Ngạch Ngang") */}
            <div
              onClick={() => setIsSheetCollapsed(!isSheetCollapsed)}
              className="w-full pt-2.5 pb-1 flex flex-col items-center justify-center cursor-pointer select-none group active:scale-95 transition-transform"
              title={isSheetCollapsed ? 'Nhấp vào đây để trồi UI lên' : 'Nhấp ngạch ngang để trồi UI xuống xem video & chỉnh OCR'}
            >
              <div className="w-12 h-1.5 bg-slate-600 group-hover:bg-sky-400 rounded-full transition-colors shadow-sm" />
              {isSheetCollapsed && (
                <div className="flex items-center space-x-1.5 text-xs text-sky-400 font-bold mt-1 animate-pulse">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Trồi UI Lên (Kéo/Chỉnh vùng OCR ở video phía trên)</span>
                </div>
              )}
            </div>

            {/* SHEET CONTENT WRAPPER */}
            <div className="overflow-y-auto max-h-[72vh] p-4 pt-1 custom-scrollbar">

              {/* SHEET 1: INLINE TEXT EDITOR */}
              {activeSheetType === 'text_editor' && selectedSubtitle && (
                <div className="flex flex-col gap-3 text-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <span className="font-bold text-xs text-white uppercase tracking-wider flex items-center space-x-1.5">
                      <Edit3 className="w-4 h-4 text-amber-400" />
                      <span>Sửa Nội Dung Phụ Đề</span>
                    </span>
                    <button
                      onClick={() => setShowTextEditor(false)}
                      className="p-1 text-slate-400 hover:text-white bg-slate-800 rounded-full"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[11px] font-semibold text-slate-400">Văn bản gốc (OCR):</label>
                    <textarea
                      value={editTextOriginal}
                      onChange={(e) => setEditTextOriginal(e.target.value)}
                      rows={2}
                      className="w-full bg-[#101013] border border-slate-700 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                      placeholder="Nhập chữ gốc..."
                    />

                    <label className="text-[11px] font-semibold text-amber-400 mt-1">Bản dịch (Hiển thị):</label>
                    <textarea
                      value={editTextTranslated}
                      onChange={(e) => setEditTextTranslated(e.target.value)}
                      rows={2}
                      className="w-full bg-[#101013] border border-amber-500/50 rounded-lg p-2 text-xs text-amber-200 font-medium focus:outline-none focus:border-amber-400"
                      placeholder="Nhập bản dịch tiếng Việt..."
                    />
                  </div>

                  <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
                    <button
                      onClick={() => setShowTextEditor(false)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
                    >
                      Hủy
                    </button>
                    <button
                      onClick={handleSaveTextEditor}
                      className="px-4 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold rounded-lg text-xs flex items-center space-x-1 shadow-md"
                    >
                      <Check className="w-4 h-4" />
                      <span>Lưu Thay Đổi</span>
                    </button>
                  </div>
                </div>
              )}

              {/* SHEET 2: CONFIG STYLE PANEL */}
              {activeSheetType === 'config' && (
                <div className="flex flex-col gap-3 text-xs">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                    <span className="font-bold text-xs text-white uppercase tracking-wider flex items-center space-x-1.5">
                      <Palette className="w-4 h-4 text-amber-400" />
                      <span>Cấu Hình Kiểu Chữ & Phụ Đề</span>
                    </span>
                    <button
                      onClick={() => {
                        setShowConfigPanel(false);
                        if (activeTab === 'config' || activeTab === 'style') onSelectTab(null);
                      }}
                      className="p-1 text-slate-400 hover:text-white bg-slate-800 rounded-full"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <SubtitleStylingPanel
                    styleConfig={styleConfig}
                    onChangeStyle={onChangeStyle}
                  />
                </div>
              )}

              {/* SHEET 3: TAB EXTRACT (OCR) */}
              {activeSheetType === 'extract' && (
                <div className="flex flex-col gap-3 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h3 className="text-sm font-bold text-white flex items-center space-x-1.5">
                      <Crop className="w-4 h-4 text-sky-400" />
                      <span>Bóc tách phụ đề (OCR)</span>
                    </h3>
                    <button
                      onClick={() => onSelectTab(null)}
                      className="p-1 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-full transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {isScanning ? (
                    <div className="bg-slate-900 border border-sky-500/30 p-3 rounded-xl space-y-2">
                      <div className="flex justify-between items-center text-sky-300 font-semibold text-xs">
                        <span>{scanProgress.message}</span>
                        <span className="font-mono">{scanProgress.percentage}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-sky-400 to-indigo-500 transition-all duration-300"
                          style={{ width: `${scanProgress.percentage}%` }}
                        />
                      </div>
                      <button
                        onClick={onCancelScan}
                        className="w-full py-1.5 bg-rose-900/40 text-rose-300 border border-rose-700/50 rounded-lg text-xs font-bold hover:bg-rose-800/60"
                      >
                        Hủy quét
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {/* Ngôn ngữ gốc */}
                      <div>
                        <label className="text-xs text-slate-400 block mb-1 font-semibold">Ngôn ngữ gốc của video</label>
                        <select
                          value={sourceLang}
                          onChange={(e) => setSourceLang(e.target.value)}
                          className="w-full bg-[#101013] border border-slate-700 rounded-xl p-2.5 text-xs text-white font-semibold focus:outline-none focus:border-sky-500"
                        >
                          <option value="Tiếng Trung">Tiếng Trung (Trung Quốc)</option>
                          <option value="Tiếng Anh">Tiếng Anh (English)</option>
                          <option value="Tiếng Hàn">Tiếng Hàn (Korean)</option>
                          <option value="Tiếng Nhật">Tiếng Nhật (Japanese)</option>
                          <option value="Tiếng Việt">Tiếng Việt</option>
                          <option value="Tự động phát hiện">Tự động phát hiện AI</option>
                        </select>
                      </div>

                      {/* Chế độ bóc tách */}
                      <div className="bg-[#101013] border border-slate-800 rounded-xl p-3 flex flex-col gap-2">
                        <span className="text-[11px] text-slate-400 font-semibold">Chế độ bóc tách</span>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setOcrMode('fast')}
                            className={`p-2.5 rounded-xl text-left border text-xs font-bold transition flex flex-col gap-0.5 ${
                              ocrMode === 'fast'
                                ? 'bg-sky-500/15 border-sky-400 text-sky-300 shadow-md'
                                : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center space-x-1">
                              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                              <span>⚡ Bóc tách nhanh (Cân bằng)</span>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setOcrMode('deep')}
                            className={`p-2.5 rounded-xl text-left border text-xs font-bold transition flex flex-col gap-0.5 ${
                              ocrMode === 'deep'
                                ? 'bg-sky-500/15 border-sky-400 text-sky-300 shadow-md'
                                : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center space-x-1">
                              <Crop className="w-3.5 h-3.5 text-amber-400" />
                              <span>🎯 Bóc tách kỹ</span>
                            </div>
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-normal">
                          {ocrMode === 'fast' ? '⚡ Tốc độ cao, nhẹ máy, quét tối ưu cho video.' : '🎯 Quét từng khung hình chi tiết cho độ chính xác cao nhất.'}
                        </p>
                      </div>

                      {/* Độ mạnh lọc chữ nền */}
                      <div>
                        <label className="text-xs text-slate-400 block mb-1 font-semibold">Độ mạnh lọc chữ nền</label>
                        <select
                          value={filterStrength}
                          onChange={(e) => setFilterStrength(e.target.value)}
                          className="w-full bg-[#101013] border border-slate-700 rounded-xl p-2.5 text-xs text-white font-semibold focus:outline-none focus:border-sky-500"
                        >
                          <option value="50%">50% - Lọc nhẹ</option>
                          <option value="80%">80% - Tiêu chuẩn (Khuyên dùng)</option>
                          <option value="90%">90% - Lọc mạnh</option>
                          <option value="100%">100% - Tuyệt đối</option>
                        </select>
                      </div>

                      {/* Checkbox AI */}
                      <label className="flex items-center space-x-2.5 text-xs text-slate-200 font-semibold cursor-pointer bg-[#101013] p-2.5 rounded-xl border border-slate-800">
                        <input
                          type="checkbox"
                          checked={aiFilterDeduplicate}
                          onChange={(e) => setAiFilterDeduplicate(e.target.checked)}
                          className="accent-sky-500 w-4 h-4 rounded cursor-pointer"
                        />
                        <div className="flex flex-col">
                          <span>Lọc trùng & nhiễu bằng AI</span>
                          <span className="text-[10px] text-slate-400 font-normal">Tự động gộp câu trùng và loại bỏ rác OCR</span>
                        </div>
                      </label>

                      {/* Presets vị trí phụ đề */}
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] text-slate-400 font-semibold">Vùng gợi ý:</span>
                        <div className="flex items-center space-x-1.5">
                          <button
                            type="button"
                            onClick={() => onChangeRoi({ x: 10, y: 76, width: 80, height: 20 })}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-[10px] text-sky-300 font-bold border border-slate-700 transition"
                          >
                            Phụ đề dưới
                          </button>
                          <button
                            type="button"
                            onClick={() => onChangeRoi({ x: 10, y: 5, width: 80, height: 18 })}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-[10px] text-slate-200 font-bold border border-slate-700 transition"
                          >
                            Tiêu đề trên
                          </button>
                        </div>
                      </div>

                      {/* Main action buttons */}
                      <div className="flex flex-col gap-2 pt-1">
                        <button
                          onClick={() => onStartFullScan(0, Math.ceil(videoDuration) || 60, ocrMode === 'fast' ? 1.0 : 0.6, contextPrompt)}
                          className="w-full py-3 btn-metallic text-slate-950 font-black text-xs rounded-xl transition shadow-lg active:scale-95 flex items-center justify-center space-x-2 uppercase tracking-wide cursor-pointer"
                        >
                          <Sparkles className="w-4 h-4 text-slate-950" />
                          <span>BẮT ĐẦU BÓC TÁCH TOÀN VIDEO</span>
                        </button>

                        <button
                          onClick={onExtractSingleFrame}
                          disabled={isExtractingSingle}
                          className="w-full py-2 btn-metallic-dark font-bold rounded-xl text-xs flex items-center justify-center space-x-1.5 transition cursor-pointer"
                        >
                          <Camera className="w-3.5 h-3.5 text-slate-300" />
                          <span>{isExtractingSingle ? 'Đang đọc khung hình...' : 'Đọc OCR Khung Hình Hiện Tại'}</span>
                        </button>
                      </div>

                      <p className="text-[10px] text-slate-400 text-center">
                        ⚠️ Bạn có thể nhấp ngạch ngang ở trên để trồi UI xuống và tự do di chuyển/thu phóng vùng viền nét đứt OCR màu xanh!
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* SHEET 4: TAB TRANSLATE (Dịch thuật AI) */}
              {activeSheetType === 'translate' && (
                <div className="flex flex-col gap-4 p-1">
                  {/* Header */}
                  <div className="flex items-center justify-between pb-1">
                    <h3 className="text-lg font-bold text-white tracking-wide">Dịch thuật AI</h3>
                    <button
                      onClick={() => onSelectTab(null)}
                      className="p-1.5 text-zinc-400 hover:text-white rounded-full transition"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Engine dịch thuật */}
                  <div className="bg-[#212126] border border-zinc-700/60 rounded-xl p-3 flex flex-col gap-1">
                    <label className="text-[11px] text-zinc-400 font-medium">Engine dịch thuật</label>
                    <div className="relative flex items-center">
                      <select
                        value={selectedModel}
                        onChange={(e) => onSelectModel(e.target.value as GeminiModelOption)}
                        className="w-full bg-transparent text-sm font-bold text-white focus:outline-none appearance-none pr-6 cursor-pointer"
                      >
                        <option value="GEMINI_WEB" className="bg-[#1c1c21] text-white">GEMINI_WEB</option>
                        <option value="gemini-2.5-flash" className="bg-[#1c1c21] text-white">Gemini 2.5 Flash</option>
                        <option value="gemini-2.5-pro" className="bg-[#1c1c21] text-white">Gemini 2.5 Pro</option>
                        <option value="gemini-2.0-flash" className="bg-[#1c1c21] text-white">Gemini 2.0 Flash</option>
                        <option value="gemini-1.5-flash" className="bg-[#1c1c21] text-white">Gemini 1.5 Flash</option>
                        <option value="gemini-3.6-flash" className="bg-[#1c1c21] text-white">Gemini 3.6 Flash</option>
                        <option value="gemini-3.1-pro-preview" className="bg-[#1c1c21] text-white">Gemini 3.1 Pro Preview</option>
                      </select>
                      <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-0 pointer-events-none" />
                    </div>
                  </div>

                  {/* Dịch sang ngôn ngữ */}
                  <div className="bg-[#212126] border border-zinc-700/60 rounded-xl p-3 flex flex-col gap-1">
                    <label className="text-[11px] text-zinc-400 font-medium">Dịch sang ngôn ngữ</label>
                    <div className="relative flex items-center">
                      <select
                        value={targetLang}
                        onChange={(e) => {
                          const newLang = e.target.value;
                          onSelectTargetLang(newLang);
                          onSaveSettings({ ...appSettings, targetLang: newLang });
                        }}
                        className="w-full bg-transparent text-sm font-bold text-white focus:outline-none appearance-none pr-6 cursor-pointer"
                      >
                        {SUPPORTED_LANGUAGES.map((lang) => (
                          <option key={lang.code} value={lang.name} className="bg-[#1c1c21] text-white">
                            {lang.flag} {lang.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-0 pointer-events-none" />
                    </div>
                  </div>

                  {/* Checkbox: Tối ưu hóa cho thuyết minh (TTS) */}
                  <label className="flex items-center space-x-3 cursor-pointer py-1 select-none">
                    <input
                      type="checkbox"
                      checked={optimizeForTts}
                      onChange={(e) => setOptimizeForTts(e.target.checked)}
                      className="w-5 h-5 rounded bg-[#212126] border-zinc-600 text-sky-500 focus:ring-0 accent-sky-500 cursor-pointer"
                    />
                    <span className="text-sm font-medium text-white">Tối ưu hóa cho thuyết minh (TTS)</span>
                  </label>

                  {/* Action Button */}
                  <button
                    onClick={() => onReTranslateAll(selectedModel, optimizeForTts)}
                    disabled={isTranslatingBatch || subtitles.length === 0}
                    className="w-full mt-2 py-3.5 btn-metallic text-slate-950 disabled:opacity-50 font-black text-sm sm:text-base rounded-xl transition shadow-lg active:scale-98 flex items-center justify-center uppercase tracking-wider cursor-pointer"
                  >
                    {isTranslatingBatch ? 'Đang dịch lại...' : 'DỊCH LẠI TOÀN BỘ'}
                  </button>
                </div>
              )}

              {/* SHEET 5: TAB AUDIO */}
              {activeSheetType === 'audio' && (
                <div className="flex flex-col gap-3.5 text-xs pb-1">
                  {/* Top Sheet Pill Handle */}
                  <div className="w-10 h-1 bg-zinc-600 rounded-full mx-auto -mt-1 mb-1 opacity-50" />

                  {/* Header Title Bar */}
                  <div className="flex items-center justify-between pb-2">
                    <div className="flex items-center space-x-2">
                      <h3 className="text-base font-extrabold text-white tracking-tight">Tạo Thuyết minh (TTS)</h3>
                      {onOpenConfigDrawer && (
                        <button
                          type="button"
                          onClick={onOpenConfigDrawer}
                          className="p-1 text-sky-400 hover:text-sky-300 rounded-lg hover:bg-zinc-800/60 transition"
                          title="Cấu hình hệ thống"
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectTab(null)}
                      className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* 1. SELECT FIELD: TTS Engine */}
                  <div className="bg-[#242429] border border-zinc-700/60 rounded-2xl px-4 py-3 relative transition focus-within:border-sky-500">
                    <label className="text-[11px] text-zinc-400 font-medium block mb-1">
                      TTS Engine
                    </label>
                    <select
                      value={selectedTtsProvider}
                      onChange={(e) => {
                        const provider = e.target.value as TTSProviderOption;
                        setSelectedTtsProvider(provider);
                        onSaveSettings({ ...appSettings, ttsProvider: provider });
                      }}
                      className="w-full bg-transparent text-sm font-semibold text-white focus:outline-none cursor-pointer appearance-none pr-7"
                    >
                      <option value="nghi_tts" className="bg-[#1e1e24] text-white">Piper TTS (Offline)</option>
                      <option value="edge_tts" className="bg-[#1e1e24] text-white">Edge TTS (Online)</option>
                      <option value="tiktok_tts" className="bg-[#1e1e24] text-white">TikTok TTS (Thuyết Minh TikTok)</option>
                      <option value="gemini" className="bg-[#1e1e24] text-white">Gemini Audio (Google AI)</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-3.5 bottom-3.5 pointer-events-none" />
                  </div>

                  {/* 2. SELECT FIELD: Ngôn ngữ */}
                  <div className="bg-[#242429] border border-zinc-700/60 rounded-2xl px-4 py-3 relative transition focus-within:border-sky-500">
                    <label className="text-[11px] text-zinc-400 font-medium block mb-1">
                      Ngôn ngữ Dịch & Thuyết minh
                    </label>
                    <select
                      value="Tiếng Việt"
                      onChange={(e) => {
                        onSelectTargetLang('Tiếng Việt');
                        onSaveSettings({ ...appSettings, targetLang: 'Tiếng Việt' });
                      }}
                      className="w-full bg-transparent text-sm font-semibold text-white focus:outline-none cursor-pointer appearance-none pr-7"
                    >
                      <option value="Tiếng Việt" className="bg-[#1e1e24] text-white">
                        🇻🇳 Tiếng Việt
                      </option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-3.5 bottom-3.5 pointer-events-none" />
                  </div>

                  {/* 3. SELECT FIELD: Giọng thuyết minh */}
                  <div className="bg-[#242429] border border-zinc-700/60 rounded-2xl px-4 py-3 relative transition focus-within:border-sky-500">
                    <label className="text-[11px] text-zinc-400 font-medium block mb-1">
                      Giọng thuyết minh
                    </label>

                    {/* Nghi TTS / Piper Voices */}
                    {selectedTtsProvider === 'nghi_tts' && (
                      <select
                        value={appSettings.nghiVoice || 'ngochuyennew'}
                        onChange={(e) => {
                          const v = e.target.value;
                          onSaveSettings({ ...appSettings, nghiVoice: v });
                          checkNghiStatus(v, true);
                        }}
                        className="w-full bg-transparent text-sm font-semibold text-white focus:outline-none cursor-pointer appearance-none pr-7"
                      >
                        {[
                          { id: 'ngochuyennew', name: 'Ngọc Huyền (Nữ)' },
                          { id: 'lacphi', name: 'Lạc Phi (Nam)' },
                          { id: 'duyoryx', name: 'Duy Oryx (Nam)' },
                          { id: 'ngocngan', name: 'Ngọc Ngạn (Nam)' },
                          { id: 'maiphuong', name: 'Mai Phương (Nữ)' },
                          { id: 'minhquang', name: 'Minh Quang (Nam)' },
                        ].map((v) => {
                          const isDownloaded = nghiStatus?.downloadedVoices?.includes(v.id);
                          return (
                            <option key={v.id} value={v.id} className="bg-[#1e1e24] text-white">
                              {isDownloaded ? `✓ ${v.name} (Đã sẵn sàng)` : `⏳ ${v.name} (Chưa tải - Chọn để tải)`}
                            </option>
                          );
                        })}
                      </select>
                    )}

                    {/* Edge TTS Voices */}
                    {selectedTtsProvider === 'edge_tts' && (
                      <select
                        value={appSettings.edgeVoice || 'vi-VN-HoaiMyNeural'}
                        onChange={(e) => onSaveSettings({ ...appSettings, edgeVoice: e.target.value })}
                        className="w-full bg-transparent text-sm font-semibold text-white focus:outline-none cursor-pointer appearance-none pr-7"
                      >
                        <option value="vi-VN-HoaiMyNeural" className="bg-[#1e1e24] text-white">✓ Hoài Mỹ (Nữ)</option>
                        <option value="vi-VN-NamMinhNeural" className="bg-[#1e1e24] text-white">✓ Nam Minh (Nam)</option>
                      </select>
                    )}

                    {/* TikTok TTS Voices */}
                    {selectedTtsProvider === 'tiktok_tts' && (
                      <select
                        value={appSettings.tiktokVoice || 'vi_001'}
                        onChange={(e) => onSaveSettings({ ...appSettings, tiktokVoice: e.target.value })}
                        className="w-full bg-transparent text-sm font-semibold text-white focus:outline-none cursor-pointer appearance-none pr-7"
                      >
                        <option value="vi_001" className="bg-[#1e1e24] text-white">✓ Cô Sáu / Nữ (vi_001)</option>
                        <option value="vi_002" className="bg-[#1e1e24] text-white">✓ Nam Thuyết Minh (vi_002)</option>
                        <option value="vi_female" className="bg-[#1e1e24] text-white">✓ Nữ Trẻ Trung (vi_female)</option>
                        <option value="vi_male" className="bg-[#1e1e24] text-white">✓ Nam Trầm Ấm (vi_male)</option>
                      </select>
                    )}

                    {/* Gemini Voices */}
                    {selectedTtsProvider === 'gemini' && (
                      <select
                        value={appSettings.geminiVoice || 'Kore'}
                        onChange={(e) => onSaveSettings({ ...appSettings, geminiVoice: e.target.value })}
                        className="w-full bg-transparent text-sm font-semibold text-white focus:outline-none cursor-pointer appearance-none pr-7"
                      >
                        <option value="Kore" className="bg-[#1e1e24] text-white">✓ Kore (Nữ Truyền Cảm)</option>
                        <option value="Puck" className="bg-[#1e1e24] text-white">✓ Puck (Nam Trầm Ấm)</option>
                        <option value="Charon" className="bg-[#1e1e24] text-white">✓ Charon (Nam Phim)</option>
                        <option value="Aoede" className="bg-[#1e1e24] text-white">✓ Aoede (Nữ Truyện Đọc)</option>
                      </select>
                    )}

                    <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-3.5 bottom-3.5 pointer-events-none" />

                    {/* Active Voice Status Indicator Badge & Download Loading */}
                    {selectedTtsProvider === 'nghi_tts' && (
                      <div className="mt-2.5">
                        {isDownloadingNghi ? (
                          <div className="flex items-center space-x-2.5 bg-sky-950/80 border border-sky-500/50 p-2.5 rounded-xl text-sky-200 text-xs font-semibold animate-pulse">
                            <Loader2 className="w-4 h-4 animate-spin text-sky-400 shrink-0" />
                            <span>{downloadMsg || `Đang tải về mô hình giọng đọc... Vui lòng đợi trong giây lát.`}</span>
                          </div>
                        ) : nghiStatus?.downloadedVoices?.includes(appSettings.nghiVoice || 'ngochuyennew') ? (
                          <div className="flex items-center space-x-1.5 text-xs font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-3 py-1.5 rounded-xl">
                            <Check className="w-3.5 h-3.5 text-emerald-400 font-bold shrink-0" />
                            <span>Đã sẵn sàng (Giọng đọc đã tải thành công)</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDownloadNghiModel(appSettings.nghiVoice || 'ngochuyennew')}
                            className="w-full flex items-center justify-center space-x-2 text-xs font-semibold text-amber-300 bg-amber-950/50 hover:bg-amber-900/60 border border-amber-500/40 px-3 py-2 rounded-xl transition cursor-pointer"
                          >
                            <Loader2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>Giọng chưa tải — Click để tải về ngay</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 4. CARD BOX: Tùy chỉnh Giọng đọc */}
                  <div className="bg-[#1c1c21] border border-zinc-800/90 rounded-2xl p-4 space-y-3.5">
                    {/* Header Row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <SlidersHorizontal className="w-4 h-4 text-sky-400" />
                        <span className="font-bold text-xs text-white">Tùy chỉnh Giọng đọc</span>
                      </div>

                      <span className="text-[11px] font-mono font-bold text-zinc-300">
                        Speed: {ttsSpeed.toFixed(1).replace('.', ',')}x | Pitch: {(1 + ttsPitch / 10).toFixed(1).replace('.', ',')}x
                      </span>

                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => {
                            const sampleText = activeSubtitle
                              ? (activeSubtitle.translatedText || activeSubtitle.originalText)
                              : "Xin chào, đây là giọng đọc thử nghiệm với tốc độ và cao độ tùy chỉnh.";
                            onPlayTTS(sampleText, ttsSpeed, ttsPitch, selectedTtsProvider);
                          }}
                          className="text-xs font-bold text-sky-400 hover:text-sky-300 flex items-center space-x-1 transition active:scale-95 bg-sky-500/10 px-2.5 py-1 rounded-lg border border-sky-500/20"
                        >
                          <Volume2 className="w-3.5 h-3.5 text-sky-400" />
                          <span>Nghe thử</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setIsTuningCollapsed(!isTuningCollapsed)}
                          className="text-zinc-400 hover:text-white p-0.5"
                        >
                          {isTuningCollapsed ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronUp className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {!isTuningCollapsed && (
                      <div className="space-y-3.5 pt-1 border-t border-zinc-800/80">
                        {/* Speed Slider */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-zinc-300 font-medium">Tốc độ giọng đọc</span>
                            <span className="font-mono text-white font-bold">{ttsSpeed.toFixed(1).replace('.', ',')}x</span>
                          </div>
                          <input
                            type="range"
                            min="0.5"
                            max="2.0"
                            step="0.1"
                            value={ttsSpeed}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setTtsSpeed(val);
                              onSaveSettings({ ...appSettings, ttsSpeed: val });
                            }}
                            className="w-full accent-sky-400 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                          />
                        </div>

                        {/* Pitch Slider */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-zinc-300 font-medium">Cao độ giọng đọc (Pitch)</span>
                            <span className="font-mono text-white font-bold">{(1 + ttsPitch / 10).toFixed(1).replace('.', ',')}x</span>
                          </div>
                          <input
                            type="range"
                            min="-5"
                            max="5"
                            step="1"
                            value={ttsPitch}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              setTtsPitch(val);
                              onSaveSettings({ ...appSettings, ttsPitch: val });
                            }}
                            className="w-full accent-sky-400 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                          />
                        </div>

                        <p className="text-[11px] text-zinc-400 leading-relaxed pt-1">
                          Chỉnh giọng trầm hơn (0.5x) hoặc thanh bổng hơn (1.5x). Mặc định 1.0x.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* 5. CHECKBOX: Gộp phụ đề */}
                  <div className="flex items-start space-x-3 px-1 pt-1">
                    <input
                      type="checkbox"
                      id="merge-subtitles-chk"
                      checked={autoMergeSubtitles}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setAutoMergeSubtitles(checked);
                        if (checked) {
                          onMergeShortSubtitles();
                        }
                      }}
                      className="accent-sky-500 w-4 h-4 rounded cursor-pointer mt-0.5"
                    />
                    <label htmlFor="merge-subtitles-chk" className="cursor-pointer select-none space-y-0.5">
                      <span className="font-bold text-xs text-white block">Gộp phụ đề</span>
                      <span className="text-[11px] text-zinc-400 block">Gộp các đoạn ngắn đứt gãy để audio liền mạch hơn</span>
                    </label>
                  </div>

                  {/* 6. MAIN ACTION BUTTON: TẠO AUDIO */}
                  <div className="pt-2 space-y-2">
                    <button
                      type="button"
                      onClick={async () => {
                        if (autoMergeSubtitles) {
                          onMergeShortSubtitles();
                        }
                        onGenerateAllAudio();
                      }}
                      disabled={isGeneratingAllAudio || subtitles.length === 0}
                      className="w-full py-3.5 bg-[#0088ff] hover:bg-[#0077ee] disabled:opacity-50 text-white font-black text-sm rounded-2xl shadow-lg shadow-sky-500/20 transition active:scale-[0.98] uppercase tracking-wider flex items-center justify-center space-x-2"
                    >
                      {isGeneratingAllAudio ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin text-white" />
                          <span>ĐANG TẠO AUDIO ({audioGenProgress.current}/{audioGenProgress.total})...</span>
                        </>
                      ) : (
                        <span>TẠO AUDIO</span>
                      )}
                    </button>

                    {/* Secondary Playback Options */}
                    <div className="flex items-center justify-between px-1 text-[11px]">
                      <label className="flex items-center space-x-2 cursor-pointer text-zinc-300 font-medium">
                        <input
                          type="checkbox"
                          checked={audioPlayWithVideo}
                          onChange={(e) => onToggleAudioPlayWithVideo(e.target.checked)}
                          className="accent-sky-500 w-3.5 h-3.5 rounded"
                        />
                        <span>Tự phát thuyết minh khi chạy video</span>
                      </label>

                      <button
                        type="button"
                        onClick={onClearAllAudio}
                        className="text-rose-400 hover:text-rose-300 font-medium underline flex items-center space-x-1"
                      >
                        <VolumeX className="w-3.5 h-3.5" />
                        <span>Xóa Audio</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* SHEET 6: TAB FILTERS */}
              {activeSheetType === 'filters' && (
                <div className="flex flex-col gap-2 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center space-x-2">
                      <SlidersHorizontal className="w-4 h-4 text-purple-400" />
                      <span className="font-bold text-white text-xs">Ngữ Cảnh Dịch Thuật Chuyên Sâu</span>
                    </div>
                    <button
                      onClick={() => onSelectTab(null)}
                      className="p-1 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-full transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <textarea
                    value={contextPrompt}
                    onChange={(e) => setContextPrompt(e.target.value)}
                    placeholder="Ví dụ: Video về phim cổ trang Trung Quốc, xưng hô 'Huynh/Đệ/Ta/Nàng'..."
                    className="w-full bg-[#101013] border border-slate-700 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-purple-400"
                    rows={3}
                  />
                </div>
              )}

            </div>
          </div>
        </React.Fragment>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 2. DYNAMIC BOTTOM TOOLBAR BAR */}
      {/* (Switches to Block Edit Mode when selectedSubtitle is active!) */}
      {/* ------------------------------------------------------------- */}
      {selectedSubtitle ? (
        /* CAPCUT SUBTITLE BLOCK EDIT TOOLBAR (< | Sửa | Config | Xóa) */
        <div className="bg-[#121215] px-3 sm:px-6 py-2 flex items-center justify-between border-t border-amber-500/40 shadow-2xl animate-in fade-in duration-150">
          {/* 1. BACK BUTTON < */}
          <button
            onClick={() => {
              onSelectSubtitle(null);
              setShowTextEditor(false);
              setShowConfigPanel(false);
            }}
            className="flex flex-col items-center justify-center p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition min-w-[56px] min-h-[44px]"
            title="Bỏ chọn block phụ đề"
          >
            <ChevronLeft className="w-5 h-5 mb-0.5 text-amber-400" />
            <span className="text-[10px] font-semibold">Quay lại</span>
          </button>

          {/* Selected clip info snippet */}
          <div className="hidden sm:flex flex-col items-center max-w-[140px] truncate px-2">
            <span className="text-[10px] text-amber-400 font-bold truncate">
              {selectedSubtitle.translatedText || selectedSubtitle.originalText}
            </span>
            <span className="text-[9px] font-mono text-slate-400">
              {selectedSubtitle.startTime.toFixed(1)}s - {selectedSubtitle.endTime.toFixed(1)}s
            </span>
          </div>

          {/* 2. SỬA BUTTON */}
          <button
            onClick={handleOpenTextEditor}
            className="flex flex-col items-center justify-center p-2 rounded-xl text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 transition min-w-[64px] min-h-[44px]"
            title="Sửa nội dung văn bản phụ đề"
          >
            <Edit3 className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] font-bold">Sửa</span>
          </button>

          {/* 3. CONFIG BUTTON */}
          <button
            onClick={() => {
              setShowConfigPanel(true);
              setShowTextEditor(false);
            }}
            className="flex flex-col items-center justify-center p-2 rounded-xl text-sky-400 hover:text-sky-300 hover:bg-sky-500/10 transition min-w-[64px] min-h-[44px]"
            title="Chỉnh font chữ, màu sắc, viền, kích thước"
          >
            <Palette className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] font-bold">Config</span>
          </button>

          {/* 4. XÓA BUTTON */}
          <button
            onClick={() => {
              onDeleteSubtitle(selectedSubtitle.id);
              onSelectSubtitle(null);
              setShowTextEditor(false);
              setShowConfigPanel(false);
            }}
            className="flex flex-col items-center justify-center p-2 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition min-w-[64px] min-h-[44px]"
            title="Xóa block phụ đề này"
          >
            <Trash2 className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] font-bold">Xóa</span>
          </button>
        </div>
      ) : (
        /* STANDARD CAPCUT BOTTOM TOOLBAR BUTTONS */
        <div className="bg-metallic-panel px-2 sm:px-4 py-2 flex items-center justify-between sm:justify-around overflow-x-auto border-t border-slate-700/60 shadow-xl">
          <button
            onClick={() => onSelectTab(activeTab === 'extract' ? null : 'extract')}
            className={`flex-1 min-w-[64px] flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition min-h-[44px] ${
              activeTab === 'extract'
                ? 'text-white bg-slate-700/80 border border-slate-500 font-bold shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Crop className="w-5 h-5 mb-0.5" />
            <span className="text-[10px]">Extract</span>
          </button>

          <button
            onClick={() => onSelectTab(activeTab === 'translate' ? null : 'translate')}
            className={`flex-1 min-w-[64px] flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition min-h-[44px] ${
              activeTab === 'translate'
                ? 'text-white bg-slate-700/80 border border-slate-500 font-bold shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Languages className="w-5 h-5 mb-0.5" />
            <span className="text-[10px]">Translate</span>
          </button>

          <button
            onClick={() => onSelectTab(activeTab === 'style' ? null : 'style')}
            className={`flex-1 min-w-[64px] flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition min-h-[44px] ${
              activeTab === 'style' || activeTab === 'config'
                ? 'text-amber-300 bg-slate-700/80 border border-amber-400/50 font-bold shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Palette className="w-5 h-5 mb-0.5" />
            <span className="text-[10px]">Kiểu chữ</span>
          </button>

          <button
            onClick={() => onSelectTab(activeTab === 'audio' ? null : 'audio')}
            className={`flex-1 min-w-[64px] flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition min-h-[44px] ${
              activeTab === 'audio'
                ? 'text-white bg-slate-700/80 border border-slate-500 font-bold shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Volume2 className="w-5 h-5 mb-0.5" />
            <span className="text-[10px]">Audio</span>
          </button>

          <button
            onClick={onAddSubtitle}
            className="flex-1 min-w-[64px] flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition min-h-[44px] text-slate-400 hover:text-slate-200"
          >
            <Plus className="w-5 h-5 mb-0.5 text-slate-200" />
            <span className="text-[10px]">Thêm phụ đề</span>
          </button>

          <button
            onClick={() => onSelectTab(activeTab === 'filters' ? null : 'filters')}
            className={`flex-1 min-w-[64px] flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition min-h-[44px] ${
              activeTab === 'filters'
                ? 'text-white bg-slate-700/80 border border-slate-500 font-bold shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <SlidersHorizontal className="w-5 h-5 mb-0.5" />
            <span className="text-[10px]">Lọc</span>
          </button>
        </div>
      )}
    </div>
  );
};
