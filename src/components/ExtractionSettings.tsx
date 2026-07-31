import React, { useState, useEffect } from 'react';
import { Sparkles, CheckCircle2, Settings, StopCircle } from 'lucide-react';
import { OCRScanProgress, AppSettings } from '../types';

interface ExtractionSettingsProps {
  videoDuration: number;
  onStartFullScan: (startTime: number, endTime: number, interval: number, customContext: string) => void;
  scanProgress: OCRScanProgress;
  onCancelScan: () => void;
  subtitleCount: number;
  appSettings?: AppSettings;
  onOpenSettings?: () => void;
}

export const ExtractionSettings: React.FC<ExtractionSettingsProps> = ({
  videoDuration,
  onStartFullScan,
  scanProgress,
  onCancelScan,
  subtitleCount,
  appSettings,
  onOpenSettings,
}) => {
  const [startTime, setStartTime] = useState<number>(0);
  const [endTime, setEndTime] = useState<number>(Math.min(300, Math.ceil(videoDuration) || 60));
  const [interval, setInterval] = useState<number>(appSettings?.ocrInterval || 0.5);
  const [customContext, setCustomContext] = useState<string>('');

  useEffect(() => {
    if (appSettings?.ocrInterval) {
      setInterval(appSettings.ocrInterval);
    }
  }, [appSettings?.ocrInterval]);

  const isScanning = scanProgress.status === 'scanning' || scanProgress.status === 'translating';

  const handleStart = () => {
    const validEnd = endTime > startTime ? endTime : startTime + 10;
    onStartFullScan(startTime, validEnd, interval, customContext);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-2">
          <div className="bg-amber-500/20 p-2 rounded-lg text-amber-400 border border-amber-500/30">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">Bóc Tách & Dịch Phụ Đề Tự Động</h2>
            <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
              <span>Engine:</span>
              <span className="font-bold text-amber-400 font-mono bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                {appSettings?.ocrEngine === 'gemini_vision'
                  ? 'Gemini Vision AI (Trực tiếp)'
                  : 'PaddleOCR WebAssembly (ONNX Web)'}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition border border-slate-700 flex items-center space-x-1 text-xs"
              title="Cấu hình OCR, API Key, Proxy"
            >
              <Settings className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Cài Đặt</span>
            </button>
          )}

          {subtitleCount > 0 && (
            <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-full font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {subtitleCount} phụ đề đã tạo
            </span>
          )}
        </div>
      </div>

      {/* Progress View if Scanning */}
      {isScanning ? (
        <div className="bg-slate-950 border border-indigo-500/30 rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-indigo-300 animate-pulse flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
              {scanProgress.message}
            </span>
            <span className="text-slate-400 font-mono">{scanProgress.percentage}%</span>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden p-0.5">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-400 rounded-full transition-all duration-300"
              style={{ width: `${scanProgress.percentage}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span>Khung hình: {scanProgress.currentFrame} / {scanProgress.totalFrames}</span>
            <span>Thời gian quét: {scanProgress.currentTime.toFixed(1)}s / {scanProgress.totalTime.toFixed(1)}s</span>
          </div>

          <button
            onClick={onCancelScan}
            className="mt-1 w-full bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 text-xs font-semibold py-2 rounded-lg transition flex items-center justify-center space-x-2"
          >
            <StopCircle className="w-4 h-4" />
            <span>Hủy Quét OCR</span>
          </button>
        </div>
      ) : (
        /* Form Settings */
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Start Time */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Thời gian bắt đầu (giây)
              </label>
              <input
                type="number"
                min="0"
                max={videoDuration || 3600}
                value={startTime}
                onChange={(e) => setStartTime(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* End Time */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Thời gian kết thúc (giây)
              </label>
              <input
                type="number"
                min="1"
                max={videoDuration || 3600}
                value={endTime}
                onChange={(e) => setEndTime(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Interval */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Tần suất trích xuất (giây/khung)
              </label>
              <select
                value={interval}
                onChange={(e) => setInterval(parseFloat(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
              >
                <option value={0.5}>Mỗi 0.5s (Cực chi tiết)</option>
                <option value={1.0}>Mỗi 1.0s (Khuyên dùng)</option>
                <option value={1.5}>Mỗi 1.5s (Cân bằng)</option>
                <option value={2.0}>Mỗi 2.0s (Nhanh)</option>
                <option value={3.0}>Mỗi 3.0s (Rất nhanh)</option>
              </select>
            </div>
          </div>

          {/* Context / Keywords Prompt */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Ghi chú ngữ cảnh video (Tùy chọn)
            </label>
            <input
              type="text"
              placeholder="Ví dụ: Phim hoạt hình anime thoại tiếng Nhật, hội thảo AI công nghệ..."
              value={customContext}
              onChange={(e) => setCustomContext(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Submit Action Button */}
          <button
            onClick={handleStart}
            className="w-full bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold text-xs py-3 px-4 rounded-xl shadow-lg shadow-indigo-600/30 transition transform active:scale-98 flex items-center justify-center space-x-2"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>Chạy Bóc Tách OCR & Dịch Tự Động Toàn Đoạn</span>
          </button>
        </div>
      )}
    </div>
  );
};
