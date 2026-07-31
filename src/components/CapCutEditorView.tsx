import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  Download,
  Cpu,
  List,
  Save,
  Check,
  X,
  Plus,
  Upload,
  Film,
  Settings,
} from 'lucide-react';
import {
  Project,
  CapCutTab,
  GeminiModelOption,
  RegionROI,
  SubtitleItem,
  SubtitleStyleConfig,
  OCRScanProgress,
  AppSettings,
  TTSProviderOption,
} from '../types';
import { SAMPLE_VIDEOS } from '../data/sampleVideos';
import { normalizeSubtitles } from '../utils/srtParser';
import { storeMediaFileDB, getMediaFileUrlDB } from '../utils/idbStorage';
import { runClientSideLocalOcrBatch } from '../utils/localPaddleOcrEngine';
import { VideoPlayer } from './VideoPlayer';
import { CapCutTimeline } from './CapCutTimeline';
import { CapCutBottomBar } from './CapCutBottomBar';
import { SubtitleList } from './SubtitleList';
import { ExportModal } from './ExportModal';
import { HelpModal } from './HelpModal';
import { ConfigView } from './ConfigView';

interface CapCutEditorViewProps {
  project: Project;
  onBackToHome: () => void;
  onSaveProject: (updated: Project) => void;
  selectedModel: GeminiModelOption;
  onSelectModel: (model: GeminiModelOption) => void;
  appSettings: AppSettings;
  onSaveSettings: (newSettings: AppSettings) => void;
  onOpenSettings?: () => void;
}

export const CapCutEditorView: React.FC<CapCutEditorViewProps> = ({
  project,
  onBackToHome,
  onSaveProject,
  selectedModel,
  onSelectModel,
  appSettings,
  onSaveSettings,
  onOpenSettings,
}) => {
  const [projectTitle, setProjectTitle] = useState<string>(project.title);
  const [videoUrl, setVideoUrl] = useState<string>(project.videoUrl);
  const [videoDuration, setVideoDuration] = useState<number>(project.duration || 0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [showConfigDrawer, setShowConfigDrawer] = useState<boolean>(false);

  // Active Bottom Bar Tab (null by default so timeline & video stay big)
  const [activeTab, setActiveTab] = useState<CapCutTab | null>(null);

  // ROI Box
  const [roi, setRoi] = useState<RegionROI>(project.roi || { x: 10, y: 76, width: 80, height: 20 });

  // Subtitles
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>(project.subtitles || []);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);

  const selectedSubtitle = subtitles.find((s) => s.id === selectedSubtitleId) || null;

  // Target Language
  const [targetLang, setTargetLang] = useState<string>(project.targetLang || 'Tiếng Việt');

  // Style Config
  const [styleConfig, setStyleConfig] = useState<SubtitleStyleConfig>(() => {
    const base = project.styleConfig || {
      fontSize: 20,
      fontColor: '#ffffff',
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      padding: 6,
      position: 'bottom',
      bottomOffsetPercentage: 10,
      maskOriginalSubtitles: false,
      maskColor: 'rgba(0,0,0,0.35)',
      textOutline: true,
      outlineColor: '#000000',
      fontFamily: 'system-ui, sans-serif',
      orientation: 'horizontal',
      maxCharsHorizontal: 65,
      maxCharsVertical: 36,
      hasBackground: false,
    };
    return {
      ...base,
      maskOriginalSubtitles: base.maskOriginalSubtitles === true,
      hasBackground: base.hasBackground === true,
    };
  });

  // Scan progress
  const [scanProgress, setScanProgress] = useState<OCRScanProgress>({
    status: 'idle',
    currentFrame: 0,
    totalFrames: 0,
    currentTime: 0,
    totalTime: 0,
    message: '',
    percentage: 0,
  });

  const [isExtractingSingle, setIsExtractingSingle] = useState<boolean>(false);
  const [isDetectingRoi, setIsDetectingRoi] = useState<boolean>(false);
  const [isTranslatingBatch, setIsTranslatingBatch] = useState<boolean>(false);

  // Audio / TTS state & refs
  const [isGeneratingAllAudio, setIsGeneratingAllAudio] = useState<boolean>(false);
  const [audioGenProgress, setAudioGenProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [audioPlayWithVideo, setAudioPlayWithVideo] = useState<boolean>(true);
  const activeAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const lastPlayedSubIdRef = useRef<string | null>(null);
  const ttsPipelineIdRef = useRef<number>(0);

  // Subtitles list drawer overlay
  const [showSubListDrawer, setShowSubListDrawer] = useState<boolean>(false);

  // Modals & Video Import
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [customUrl, setCustomUrl] = useState<string>('');
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  // Restore stored video from IndexedDB on initial mount if current videoUrl is expired or invalid
  useEffect(() => {
    let isMounted = true;
    async function checkAndRestoreVideo() {
      if (!videoUrl || videoUrl.startsWith('blob:')) {
        const restoredUrl = await getMediaFileUrlDB(project.id);
        if (restoredUrl && isMounted) {
          setVideoUrl(restoredUrl);
        }
      }
    }
    checkAndRestoreVideo();
    return () => {
      isMounted = false;
    };
  }, [project.id]);

  const handleImportVideo = async (
    newUrl: string,
    newTitle?: string,
    newRoi?: RegionROI,
    videoFile?: File
  ) => {
    let finalUrl = newUrl;
    if (videoFile) {
      const storedUrl = await storeMediaFileDB(project.id, videoFile);
      if (storedUrl) finalUrl = storedUrl;
    }
    setVideoUrl(finalUrl);
    if (newTitle) setProjectTitle(newTitle);
    if (newRoi) setRoi(newRoi);
    setVideoDuration(0);
    setCurrentTime(0);
    setShowImportModal(false);
  };

  const cancelScanRef = useRef<boolean>(false);

  // Active Subtitle item for current video time (select most recent matching segment to prevent lag)
  const activeSubtitle = React.useMemo(() => {
    const matches = subtitles.filter(
      (s) => currentTime >= s.startTime && currentTime <= s.endTime
    );
    if (matches.length === 0) return null;
    return matches.sort((a, b) => b.startTime - a.startTime)[0];
  }, [subtitles, currentTime]);

  // Auto-save project changes
  useEffect(() => {
    onSaveProject({
      ...project,
      title: projectTitle,
      videoUrl,
      duration: videoDuration,
      subtitles,
      roi,
      targetLang,
      styleConfig,
      updatedAt: Date.now(),
    });
  }, [projectTitle, videoUrl, videoDuration, subtitles, roi, targetLang, styleConfig]);

  const handleManualSave = () => {
    onSaveProject({
      ...project,
      title: projectTitle,
      videoUrl,
      duration: videoDuration,
      subtitles,
      roi,
      targetLang,
      styleConfig,
      updatedAt: Date.now(),
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  // Helper to map relative 2D box [ymin, xmin, ymax, xmax] from 0-1000 scale to absolute frame percentage
  const calculateAbsoluteBox = (box2d: number[], currentRoi: RegionROI): RegionROI => {
    if (!Array.isArray(box2d) || box2d.length !== 4) return currentRoi;
    const [ymin, xmin, ymax, xmax] = box2d;
    const relY = ymin / 10;
    const relX = xmin / 10;
    const relH = Math.max(3, (ymax - ymin) / 10);
    const relW = Math.max(6, (xmax - xmin) / 10);

    return {
      x: Number(Math.max(0, Math.min(95, currentRoi.x + (relX * currentRoi.width) / 100)).toFixed(2)),
      y: Number(Math.max(0, Math.min(95, currentRoi.y + (relY * currentRoi.height) / 100)).toFixed(2)),
      width: Number(Math.min(100 - currentRoi.x, (relW * currentRoi.width) / 100).toFixed(2)),
      height: Number(Math.min(100 - currentRoi.y, (relH * currentRoi.height) / 100).toFixed(2)),
    };
  };

  // Handler: Auto-detect exact original subtitle position in video frame
  const handleAutoDetectRoi = async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    setIsDetectingRoi(true);
    try {
      const canvas = document.createElement('canvas');
      const vWidth = video.videoWidth || 1280;
      const vHeight = video.videoHeight || 720;

      const cropX = (roi.x / 100) * vWidth;
      const cropY = (roi.y / 100) * vHeight;
      const cropW = (roi.width / 100) * vWidth;
      const cropH = (roi.height / 100) * vHeight;

      canvas.width = Math.max(10, Math.round(cropW));
      canvas.height = Math.max(10, Math.round(cropH));

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
      const croppedBase64 = canvas.toDataURL('image/jpeg', 0.92);

      const res = await fetch('/api/ocr-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: croppedBase64,
          timestamp: currentTime,
          targetLang,
          model: selectedModel,
        }),
      });

      const data = await res.json();
      if (data.success && data.result?.box_2d) {
        const autoBox = calculateAbsoluteBox(data.result.box_2d, roi);
        setRoi(autoBox);

        if (selectedSubtitleId) {
          setSubtitles((prev) =>
            prev.map((s) => (s.id === selectedSubtitleId ? { ...s, boundingBox: autoBox } : s))
          );
        }
      } else {
        alert('Đã khớp vị trí vùng chọn phụ đề.');
      }
    } catch (err) {
      console.error('Auto detect ROI error:', err);
    } finally {
      setIsDetectingRoi(false);
    }
  };

  // Handler: Single frame OCR
  const handleExtractSingleFrame = async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    setIsExtractingSingle(true);
    try {
      const canvas = document.createElement('canvas');
      const vWidth = video.videoWidth || 1280;
      const vHeight = video.videoHeight || 720;

      const cropX = (roi.x / 100) * vWidth;
      const cropY = (roi.y / 100) * vHeight;
      const cropW = (roi.width / 100) * vWidth;
      const cropH = (roi.height / 100) * vHeight;

      const targetW = Math.max(800, Math.round(cropW * 1.5));
      const targetH = Math.max(160, Math.round(cropH * 1.5));

      canvas.width = targetW;
      canvas.height = targetH;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
      const croppedBase64 = canvas.toDataURL('image/jpeg', 0.92);

      const res = await fetch('/api/ocr-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: croppedBase64,
          timestamp: currentTime,
          targetLang,
          model: selectedModel,
        }),
      });

      const data = await res.json();
      if (data.success && data.result?.hasText) {
        let subBox: RegionROI | undefined = undefined;
        if (data.result.box_2d) {
          subBox = calculateAbsoluteBox(data.result.box_2d, roi);
          setRoi(subBox);
        }

        const newSub: SubtitleItem = {
          id: `single-${Date.now()}`,
          startTime: Math.max(0, currentTime - 0.2),
          endTime: currentTime + 2.5,
          originalText: data.result.originalText || '',
          translatedText: '', // Quét OCR ra phụ đề gốc chưa cần dịch ngay
          sourceLang: data.result.sourceLang,
          boundingBox: subBox || roi,
        };

        setSubtitles((prev) => {
          return normalizeSubtitles([...prev, newSub]);
        });
      } else {
        alert('Không tìm thấy phụ đề trong vùng chọn tại khung hình này.');
      }
    } catch (err: any) {
      console.error('OCR extract error:', err);
    } finally {
      setIsExtractingSingle(false);
    }
  };

  // Helper: Extract cropped frame at timestamp
  const extractCroppedFrameAtTime = async (
    targetTime: number,
    roiBox: RegionROI
  ): Promise<string | null> => {
    return new Promise((resolve) => {
      const video = videoRef.current;
      if (!video) {
        resolve(null);
        return;
      }

      const capture = () => {
        try {
          const canvas = document.createElement('canvas');
          const vWidth = video.videoWidth || 1280;
          const vHeight = video.videoHeight || 720;

          const cropX = (roiBox.x / 100) * vWidth;
          const cropY = (roiBox.y / 100) * vHeight;
          const cropW = (roiBox.width / 100) * vWidth;
          const cropH = (roiBox.height / 100) * vHeight;

          // High scale factor & resolution boosting for low-res videos and small ROI crops
          const scale = Math.max(2.0, Math.min(4.0, 960 / Math.max(10, cropW)));
          const targetW = Math.max(160, Math.round(cropW * scale));
          const targetH = Math.max(60, Math.round(cropH * scale));

          canvas.width = targetW;
          canvas.height = targetH;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, targetW, targetH);

          resolve(canvas.toDataURL('image/jpeg', 0.88));
        } catch (err) {
          console.error('Error capturing frame:', err);
          resolve(null);
        }
      };

      // If current time is already very close to target time, capture directly
      if (Math.abs(video.currentTime - targetTime) < 0.05) {
        setTimeout(capture, 30);
        return;
      }

      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const onSeeked = () => {
        if (timeoutId) clearTimeout(timeoutId);
        video.removeEventListener('seeked', onSeeked);
        // Pause 50ms to allow video frame buffer to fully render on canvas
        setTimeout(capture, 50);
      };

      // Fallback timeout in case seeked event does not fire
      timeoutId = setTimeout(() => {
        video.removeEventListener('seeked', onSeeked);
        capture();
      }, 800);

      video.addEventListener('seeked', onSeeked);
      video.currentTime = targetTime;
    });
  };

  // Full scan handler
  const handleStartFullScan = async (
    startT: number,
    endT: number,
    stepInterval: number,
    customContext: string
  ) => {
    cancelScanRef.current = false;
    const video = videoRef.current;
    if (!video) return;

    video.pause();

    const timePoints: number[] = [];
    for (let t = startT; t <= endT; t += stepInterval) {
      timePoints.push(t);
    }

    const totalFrames = timePoints.length;
    setScanProgress({
      status: 'scanning',
      currentFrame: 0,
      totalFrames,
      currentTime: startT,
      totalTime: endT - startT,
      message: 'Đang trích xuất khung hình...',
      percentage: 0,
    });

    const frameBatches: { image: string; timestamp: number }[][] = [];
    let currentBatch: { image: string; timestamp: number }[] = [];
    let capturedFramesCount = 0;

    for (let i = 0; i < timePoints.length; i++) {
      if (cancelScanRef.current) break;

      const timePoint = timePoints[i];
      setScanProgress((prev) => ({
        ...prev,
        currentFrame: i + 1,
        currentTime: timePoint,
        percentage: Math.round(((i + 1) / totalFrames) * 60),
        message: `Đang bóc tách khung hình (${i + 1}/${totalFrames})...`,
      }));

      const base64Img = await extractCroppedFrameAtTime(timePoint, roi);
      if (base64Img) {
        capturedFramesCount++;
        currentBatch.push({ image: base64Img, timestamp: timePoint });
      }

      if (currentBatch.length >= 3 || i === timePoints.length - 1) {
        if (currentBatch.length > 0) {
          frameBatches.push([...currentBatch]);
          currentBatch = [];
        }
      }
    }

    if (cancelScanRef.current) {
      setScanProgress((prev) => ({ ...prev, status: 'idle', message: 'Đã hủy' }));
      return;
    }

    if (capturedFramesCount === 0) {
      setScanProgress({
        status: 'completed',
        currentFrame: totalFrames,
        totalFrames,
        currentTime: endT,
        totalTime: endT - startT,
        message: 'Không thể bóc tách ảnh từ video (do bảo mật CORS của link video ngoài). Vui lòng nạp file video trực tiếp từ máy.',
        percentage: 100,
      });
      return;
    }

    const isLocalPaddle = appSettings?.ocrEngine === 'paddleocr';
    const engineName = isLocalPaddle
      ? 'PP-OCRv6 WebAssembly (ONNX Web)'
      : 'Gemini Cloud AI';

    setScanProgress((prev) => ({
      ...prev,
      status: 'translating',
      percentage: 70,
      message: `Đang bóc tách chữ bằng ${engineName} (${capturedFramesCount} khung hình)...`,
    }));

    const newSubtitles: SubtitleItem[] = [];
    let lastApiError = '';

    if (isLocalPaddle) {
      // Client-side WebAssembly ONNX Runtime Web execution
      const allFrames = frameBatches.flat();
      try {
        const localResults = await runClientSideLocalOcrBatch(
          allFrames,
          (msg) => {
            setScanProgress((prev) => ({ ...prev, message: msg }));
          }
        );

        localResults.forEach((res, idx) => {
          if (res.originalText && res.originalText.trim()) {
            newSubtitles.push({
              id: `local-scan-${idx}-${Date.now()}`,
              startTime: res.startTime,
              endTime: res.endTime,
              originalText: res.originalText.trim(),
              translatedText: '',
              sourceLang: res.sourceLang || 'PP-OCRv6 Wasm Local',
              boundingBox: roi,
            });
          }
        });
      } catch (err: any) {
        console.error('Local OCR error:', err);
        lastApiError = 'Lỗi xử lý Local Wasm ONNX Engine.';
      }
    } else {
      for (let b = 0; b < frameBatches.length; b++) {
        if (cancelScanRef.current) break;

        try {
          const res = await fetch('/api/ocr-batch-frames', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              frames: frameBatches[b],
              targetLang,
              model: selectedModel,
              ocrEngine: 'gemini_vision',
              customContext,
            }),
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({ error: `HTTP Error ${res.status}` }));
            throw new Error(errData.error || `HTTP ${res.status}: ${res.statusText}`);
          }

          const data = await res.json();
          if (data.success && Array.isArray(data.subtitles)) {
            data.subtitles.forEach((s: any, idx: number) => {
              if (s.originalText && s.originalText.trim()) {
                let subBox: RegionROI | undefined = undefined;
                if (s.box_2d) {
                  subBox = calculateAbsoluteBox(s.box_2d, roi);
                }

                newSubtitles.push({
                  id: `scan-${b}-${idx}-${Date.now()}`,
                  startTime: s.startTime || 0,
                  endTime: s.endTime || s.startTime + 2.5,
                  originalText: s.originalText.trim(),
                  translatedText: '', // OCR ra phụ đề gốc
                  sourceLang: s.sourceLang,
                  boundingBox: subBox || roi,
                });
              }
            });
          } else if (data.error) {
            lastApiError = data.error;
          }
        } catch (err: any) {
          console.error('Batch scan error:', err);
          lastApiError = err?.message || 'Lỗi kết nối máy chủ API OCR.';
        }

        setScanProgress((prev) => ({
          ...prev,
          percentage: 70 + Math.round(((b + 1) / frameBatches.length) * 28),
        }));

        // Gentle pause to respect API rate limits
        if (b < frameBatches.length - 1) {
          await new Promise((r) => setTimeout(r, 400));
        }
      }
    }

    if (newSubtitles.length > 0) {
      setSubtitles((prev) => normalizeSubtitles([...prev, ...newSubtitles]));
    }

    let completionMessage = '';
    if (newSubtitles.length > 0) {
      completionMessage = `Đã hoàn thành! Trích xuất thành công ${newSubtitles.length} phụ đề.`;
    } else if (lastApiError) {
      completionMessage = lastApiError;
    } else {
      completionMessage = `AI không tìm thấy chữ trong vùng quét OCR (${capturedFramesCount} khung hình). Bạn hãy điều chỉnh/mở rộng khung quét OCR màu xanh đè trọn vùng chữ phụ đề trên video và quét lại.`;
    }

    setScanProgress({
      status: 'completed',
      currentFrame: totalFrames,
      totalFrames,
      currentTime: endT,
      totalTime: endT - startT,
      message: completionMessage,
      percentage: 100,
    });

    setTimeout(() => {
      setScanProgress((prev) => ({ ...prev, status: 'idle' }));
    }, 3000);
  };

  const handleCancelScan = () => {
    cancelScanRef.current = true;
    setScanProgress((prev) => ({ ...prev, status: 'idle', message: 'Đã hủy' }));
  };

  const handleReTranslateAll = async (overrideModel?: GeminiModelOption, optimizeForTts: boolean = true) => {
    if (subtitles.length === 0) return;
    setIsTranslatingBatch(true);
    try {
      const res = await fetch('/api/translate-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subtitles,
          targetLang,
          model: overrideModel || selectedModel,
          optimizeForTts,
        }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.translations)) {
        const map = new Map<string, string>();
        data.translations.forEach((t: any) => map.set(t.id, t.translatedText));
        setSubtitles((prev) =>
          prev.map((s) => ({ ...s, translatedText: map.get(s.id) || s.translatedText }))
        );
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsTranslatingBatch(false);
    }
  };

  // Play base64 audio with Web Audio API for custom speed and pitch
  const playBase64AudioWithControls = async (
    base64: string,
    speed: number = appSettings.ttsSpeed || 1.0,
    pitch: number = appSettings.ttsPitch || 0
  ) => {
    try {
      if (activeAudioSourceRef.current) {
        try {
          activeAudioSourceRef.current.stop();
        } catch {}
      }
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      const binaryStr = atob(base64);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const audioBuffer = await audioCtx.decodeAudioData(bytes.buffer);
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.value = Math.max(0.2, Math.min(3.0, speed));
      source.detune.value = Math.max(-1200, Math.min(1200, pitch * 100)); // cents pitch shift
      source.connect(audioCtx.destination);
      source.start(0);
      activeAudioSourceRef.current = source;
      return source;
    } catch (e) {
      console.warn('Web Audio Playback Fallback', e);
      const audio = new Audio(`data:audio/wav;base64,${base64}`);
      audio.playbackRate = Math.max(0.5, Math.min(2.0, speed));
      audio.play().catch(() => {});
    }
  };

  // Split text into short sentence chunks for instant pipelined TTS streaming
  const splitTextIntoSentenceChunks = (text: string): string[] => {
    if (!text || !text.trim()) return [];
    const rawParts = text.split(/(?<=[.?!;\n])\s+/);
    const chunks: string[] = [];

    for (const part of rawParts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      if (trimmed.length > 90) {
        const commaParts = trimmed.split(/(?<=[,])\s+/);
        for (const cp of commaParts) {
          if (cp.trim()) chunks.push(cp.trim());
        }
      } else {
        chunks.push(trimmed);
      }
    }

    return chunks.length > 0 ? chunks : [text.trim()];
  };

  const fetchChunkAudioBase64 = async (
    textChunk: string,
    speed: number,
    provider: TTSProviderOption
  ): Promise<string | null> => {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textChunk,
          provider,
          nghiVoice: appSettings.nghiVoice || 'lacphi',
          edgeVoice: appSettings.edgeVoice || 'vi-VN-HoaiMyNeural',
          tiktokSessionId: appSettings.tiktokSessionId,
          tiktokVoice: appSettings.tiktokVoice || 'vi_001',
          voice: appSettings.geminiVoice || 'Kore',
          ttsSpeed: speed,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        const textErr = await res.text();
        console.warn('[Chunk TTS Server Response Error]', res.status, textErr.slice(0, 150));
        return null;
      }

      const data = await res.json();
      if (data.success && data.audioBase64) {
        return data.audioBase64;
      }
    } catch (e) {
      console.warn('Error fetching chunk TTS:', e);
    }
    return null;
  };

  const handlePlayTTS = async (
    text: string,
    speed: number = appSettings.ttsSpeed || 1.0,
    pitch: number = appSettings.ttsPitch || 0,
    providerOverride?: TTSProviderOption
  ) => {
    if (!text || !text.trim()) return;

    // Cancel previous playback pipeline
    if (activeAudioSourceRef.current) {
      try {
        activeAudioSourceRef.current.stop();
      } catch {}
    }

    const currentPipelineId = Date.now();
    ttsPipelineIdRef.current = currentPipelineId;

    const provider = providerOverride || appSettings.ttsProvider || 'nghi_tts';
    const chunks = splitTextIntoSentenceChunks(text);

    if (chunks.length === 0) return;

    // Single short sentence: simple immediate fetch & play
    if (chunks.length === 1) {
      const b64 = await fetchChunkAudioBase64(chunks[0], speed, provider);
      if (ttsPipelineIdRef.current !== currentPipelineId) return;
      if (b64) {
        await playBase64AudioWithControls(b64, speed, pitch);
      } else {
        const utterance = new SpeechSynthesisUtterance(chunks[0]);
        utterance.rate = Math.max(0.5, Math.min(2.0, speed));
        utterance.pitch = Math.max(0.5, Math.min(1.5, 1 + pitch / 10));
        utterance.lang = 'vi-VN';
        window.speechSynthesis.speak(utterance);
      }
      return;
    }

    // Paragraph Chunking Pipeline: Render Chunk 1 -> Play Chunk 1 while pre-rendering Chunk 2 in background
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioCtx();
    if (audioCtx.state === 'suspended') {
      try { await audioCtx.resume(); } catch {}
    }

    const chunkAudioPromises = new Map<number, Promise<AudioBuffer | null>>();

    const getOrFetchChunkBuffer = (index: number): Promise<AudioBuffer | null> => {
      if (index >= chunks.length) return Promise.resolve(null);
      if (chunkAudioPromises.has(index)) {
        return chunkAudioPromises.get(index)!;
      }

      const promise = (async () => {
        const b64 = await fetchChunkAudioBase64(chunks[index], speed, provider);
        if (!b64 || ttsPipelineIdRef.current !== currentPipelineId) return null;
        try {
          const binaryStr = atob(b64);
          const len = binaryStr.length;
          const bytes = new Uint8Array(len);
          for (let k = 0; k < len; k++) {
            bytes[k] = binaryStr.charCodeAt(k);
          }
          return await audioCtx.decodeAudioData(bytes.buffer);
        } catch (e) {
          console.warn(`Failed to decode chunk ${index}:`, e);
          return null;
        }
      })();

      chunkAudioPromises.set(index, promise);
      return promise;
    };

    // Immediately start pre-fetching Chunk 0 & Chunk 1 in parallel
    getOrFetchChunkBuffer(0);
    getOrFetchChunkBuffer(1);

    for (let i = 0; i < chunks.length; i++) {
      if (ttsPipelineIdRef.current !== currentPipelineId) break;

      // Pipeline trigger for next chunks
      if (i + 1 < chunks.length) getOrFetchChunkBuffer(i + 1);
      if (i + 2 < chunks.length) getOrFetchChunkBuffer(i + 2);

      const buffer = await getOrFetchChunkBuffer(i);
      if (ttsPipelineIdRef.current !== currentPipelineId) break;

      if (buffer) {
        await new Promise<void>((resolve) => {
          if (ttsPipelineIdRef.current !== currentPipelineId) {
            resolve();
            return;
          }
          const source = audioCtx.createBufferSource();
          source.buffer = buffer;
          source.playbackRate.value = Math.max(0.2, Math.min(3.0, speed));
          source.detune.value = Math.max(-1200, Math.min(1200, pitch * 100));
          source.connect(audioCtx.destination);

          source.onended = () => resolve();
          source.start(0);
          activeAudioSourceRef.current = source;
        });
      } else {
        // SpeechSynthesis Fallback for chunk
        await new Promise<void>((resolve) => {
          if (ttsPipelineIdRef.current !== currentPipelineId) {
            resolve();
            return;
          }
          const utterance = new SpeechSynthesisUtterance(chunks[i]);
          utterance.rate = Math.max(0.5, Math.min(2.0, speed));
          utterance.pitch = Math.max(0.5, Math.min(1.5, 1 + pitch / 10));
          utterance.lang = 'vi-VN';
          utterance.onend = () => resolve();
          utterance.onerror = () => resolve();
          window.speechSynthesis.speak(utterance);
        });
      }
    }
  };

  // Gộp Phụ Đề Ngắn (Merge short consecutive subtitles)
  const handleMergeShortSubtitles = () => {
    if (subtitles.length < 2) return;
    const sorted = [...subtitles].sort((a, b) => a.startTime - b.startTime);
    const merged: SubtitleItem[] = [];
    let i = 0;

    while (i < sorted.length) {
      let curr = { ...sorted[i] };
      let j = i + 1;

      while (j < sorted.length) {
        const next = sorted[j];
        const gap = next.startTime - curr.endTime;
        const words = (curr.translatedText || curr.originalText).trim().split(/\s+/).filter(Boolean).length;
        const duration = curr.endTime - curr.startTime;

        // Merge if gap <= 1.2s and (current sub is short <= 4 words or <= 1.8s) and combined length <= 7s
        if (gap <= 1.2 && (words <= 4 || duration <= 1.8) && (next.endTime - curr.startTime) <= 7.0) {
          curr.endTime = next.endTime;
          curr.originalText = `${curr.originalText} ${next.originalText}`.trim();
          curr.translatedText = `${curr.translatedText || curr.originalText} ${next.translatedText || next.originalText}`.trim();
          curr.audioUrl = undefined;
          j++;
        } else {
          break;
        }
      }
      merged.push(curr);
      i = j;
    }

    setSubtitles(merged);
  };

  // Tạo Audio Thuyết Minh Toàn Bộ (Generate TTS for all subtitles using ultra-fast Batch API)
  const handleGenerateAllAudio = async () => {
    if (subtitles.length === 0) return;
    setIsGeneratingAllAudio(true);
    setAudioGenProgress({ current: 0, total: subtitles.length });

    const itemsToGen = subtitles.map((s, idx) => ({
      id: String(s.id || idx),
      text: (s.translatedText || s.originalText || '').trim(),
    })).filter((item) => item.text.length > 0);

    if (itemsToGen.length === 0) {
      setIsGeneratingAllAudio(false);
      return;
    }

    try {
      const res = await fetch('/api/tts/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: itemsToGen,
          provider: appSettings.ttsProvider || 'nghi_tts',
          nghiVoice: appSettings.nghiVoice || 'lacphi',
          edgeVoice: appSettings.edgeVoice || 'vi-VN-HoaiMyNeural',
          tiktokSessionId: appSettings.tiktokSessionId,
          tiktokVoice: appSettings.tiktokVoice || 'vi_001',
          voice: appSettings.geminiVoice || 'Kore',
          ttsSpeed: appSettings.ttsSpeed || 1.0,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        const textErr = await res.text();
        console.warn('[Batch TTS Server Error]', res.status, textErr.slice(0, 150));
        return;
      }

      const data = await res.json();
      if (data.success && Array.isArray(data.results)) {
        const resultMap = new Map<string, any>();
        data.results.forEach((r: any) => {
          if (r.audioBase64) {
            resultMap.set(String(r.id), r);
          }
        });

        const updatedSubs = subtitles.map((s, idx) => {
          const sId = String(s.id || idx);
          const r = resultMap.get(sId);
          if (r && r.audioBase64) {
            const calculatedDuration = r.duration || (s.endTime - s.startTime);
            return {
              ...s,
              audioUrl: `data:audio/wav;base64,${r.audioBase64}`,
              duration: r.duration || calculatedDuration,
              endTime: r.duration ? Math.round((s.startTime + r.duration) * 1000) / 1000 : s.endTime,
              timestamps: Array.isArray(r.timestamps) ? r.timestamps : undefined,
            };
          }
          return s;
        });

        setSubtitles(updatedSubs);
      }
    } catch (err) {
      console.warn('Error batch generating TTS:', err);
    } finally {
      setAudioGenProgress({ current: subtitles.length, total: subtitles.length });
      setIsGeneratingAllAudio(false);
    }
  };

  // Clear all cached audio
  const handleClearAllAudio = () => {
    setSubtitles((prev) => prev.map((s) => ({ ...s, audioUrl: undefined })));
  };

  // Synchronize TTS audio playback with video play timeline
  useEffect(() => {
    if (!isPlaying || !audioPlayWithVideo) {
      lastPlayedSubIdRef.current = null;
      return;
    }

    const currentActive = subtitles.find(
      (s) => currentTime >= s.startTime && currentTime <= s.startTime + 0.4
    );

    if (currentActive && currentActive.audioUrl && lastPlayedSubIdRef.current !== currentActive.id) {
      lastPlayedSubIdRef.current = currentActive.id;
      const base64 = currentActive.audioUrl.replace(/^data:audio\/\w+;base64,/, '');
      playBase64AudioWithControls(base64, appSettings.ttsSpeed || 1.0, appSettings.ttsPitch || 0);
    }
  }, [currentTime, isPlaying, audioPlayWithVideo, subtitles, appSettings.ttsSpeed, appSettings.ttsPitch]);

  const handleSeek = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleTogglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          console.error('Video play error:', err);
          setIsPlaying(false);
        });
    }
  };

  // Split subtitle at current time
  const handleSplitSubtitle = (splitTime: number) => {
    const target = subtitles.find((s) => splitTime > s.startTime + 0.3 && splitTime < s.endTime - 0.3);
    if (!target) return;

    const firstSub: SubtitleItem = {
      ...target,
      endTime: splitTime,
    };

    const secondSub: SubtitleItem = {
      ...target,
      id: `split-${Date.now()}`,
      startTime: splitTime,
    };

    setSubtitles((prev) =>
      normalizeSubtitles(
        prev.map((s) => (s.id === target.id ? firstSub : s)).concat(secondSub)
      )
    );
  };

  const handleUpdateActiveSubtitleBox = React.useCallback(
    (newBox: { x: number; y: number; width: number; height: number }) => {
      setSubtitles((prev) =>
        prev.map((sub) => ({ ...sub, boundingBox: newBox }))
      );
    },
    []
  );

  return (
    <div className="min-h-screen bg-[#0b0b0d] text-slate-100 flex justify-center font-sans antialiased overflow-hidden">
      {/* Smartphone Container Viewport */}
      <div className="w-full max-w-md bg-[#121215] h-screen flex flex-col relative shadow-2xl border-x border-slate-900 overflow-hidden">
        
        {/* 1. CapCut Navigation Header */}
        <header className="bg-metallic-panel border-b border-slate-700/60 px-3 py-2.5 flex items-center justify-between z-40 shadow-xl">
          {/* Left: Close Button */}
          <button
            onClick={onBackToHome}
            className="p-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 rounded-full border border-slate-700 transition"
            title="Đóng / Trở về Trang Chủ"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Center: "+ Tạo mới / Import Video" & Quality Badge */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center space-x-1 px-3 py-1 bg-slate-800/90 hover:bg-slate-700 text-metallic-silver border border-slate-600 rounded-full text-xs font-bold transition active:scale-95 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5 text-slate-200" />
              <span>{videoUrl ? 'Đổi Video' : 'Import Video'}</span>
            </button>

            <div className="bg-slate-800/90 border border-slate-700 text-slate-300 text-[11px] px-2.5 py-1 rounded-full font-mono font-bold">
              480P
            </div>
          </div>

          {/* Header Right Controls: Subtitle Drawer & Export */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowSubListDrawer(!showSubListDrawer)}
              className={`p-1.5 rounded-full text-xs font-semibold border transition flex items-center space-x-1 ${
                showSubListDrawer
                  ? 'bg-slate-200 text-slate-950 border-white shadow-md'
                  : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
              title="Mở bảng phụ đề chi tiết"
            >
              <List className="w-4 h-4" />
            </button>

            {/* Export Button (Metallic Chrome Button) */}
            <button
              onClick={() => setIsExportOpen(true)}
              className="btn-metallic text-slate-950 font-black text-xs px-3.5 py-1 rounded-full transition shadow-md flex items-center space-x-1 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-950" />
              <span>Xuất</span>
            </button>
          </div>
        </header>



        {/* 2. Editor Main Canvas Body */}
        <div className="flex-1 flex flex-col overflow-hidden relative bg-[#0b0b0d]">
          {/* Responsive Video Canvas Container */}
          <div className="flex-1 p-2 flex items-center justify-center overflow-hidden bg-black">
            <div className="w-full max-h-full flex flex-col justify-center">
              <VideoPlayer
                videoUrl={videoUrl}
                roi={roi}
                onChangeRoi={setRoi}
                showRoiBox={activeTab === 'extract'}
                activeSubtitle={activeSubtitle}
                onUpdateActiveSubtitleBox={handleUpdateActiveSubtitleBox}
                styleConfig={styleConfig}
                onChangeStyleConfig={setStyleConfig}
                onExtractSingleFrame={handleExtractSingleFrame}
                isExtractingSingle={isExtractingSingle}
                onAutoDetectRoi={handleAutoDetectRoi}
                isDetectingRoi={isDetectingRoi}
                onTimeUpdate={setCurrentTime}
                onLoadedMetadata={setVideoDuration}
                videoRef={videoRef}
                isPlaying={isPlaying}
                onTogglePlay={handleTogglePlay}
                onImportVideo={(url, title) => handleImportVideo(url, title)}
                onOpenImportModal={() => setShowImportModal(true)}
              />
            </div>
          </div>

          {/* CapCut Multi-track Timeline Track */}
          <CapCutTimeline
            duration={videoDuration}
            currentTime={currentTime}
            subtitles={subtitles}
            selectedSubtitleId={selectedSubtitleId}
            onSeek={handleSeek}
            isPlaying={isPlaying}
            onTogglePlay={handleTogglePlay}
            onSplitSubtitle={handleSplitSubtitle}
            onSelectSubtitle={(sub) => setSelectedSubtitleId(sub ? sub.id : null)}
            onUpdateSubtitle={(updated) =>
              setSubtitles((prev) =>
                prev.map((s) => (s.id === updated.id ? updated : s))
              )
            }
            hasVideo={Boolean(videoUrl)}
            videoTitle={projectTitle || 'imported_video_1785328015414.mp4'}
            onOpenImportModal={() => setShowImportModal(true)}
            onImportVideo={(url, title) => handleImportVideo(url, title)}
            onPlayTTS={(text) => handlePlayTTS(text)}
            onAddSubtitle={(t) =>
              setSubtitles((prev) =>
                normalizeSubtitles([
                  ...prev,
                  {
                    id: `manual-${Date.now()}`,
                    startTime: t || currentTime,
                    endTime: (t || currentTime) + 2.5,
                    originalText: 'Nhập văn bản...',
                    translatedText: 'Nhập bản dịch...',
                  },
                ])
              )
            }
          />
        </div>

        {/* Drawer overlay for smartphone */}
        {showSubListDrawer && (
          <div className="absolute inset-x-0 bottom-16 top-12 z-50 bg-[#121215] p-3 overflow-y-auto flex flex-col border-t border-slate-800 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
              <span className="font-bold text-xs text-slate-100">Danh Sách Phụ Đề ({subtitles.length})</span>
              <button
                onClick={() => setShowSubListDrawer(false)}
                className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <SubtitleList
              subtitles={subtitles}
              currentTime={currentTime}
              onSeekToTime={handleSeek}
              onUpdateSubtitle={(updated) =>
                setSubtitles((prev) =>
                  normalizeSubtitles(prev.map((s) => (s.id === updated.id ? updated : s)))
                )
              }
              onDeleteSubtitle={(id) => {
                setSubtitles((prev) => normalizeSubtitles(prev.filter((s) => s.id !== id)));
                if (selectedSubtitleId === id) setSelectedSubtitleId(null);
              }}
              onAddSubtitle={(time = currentTime) =>
                setSubtitles((prev) =>
                  normalizeSubtitles([
                    ...prev,
                    {
                      id: `manual-${Date.now()}`,
                      startTime: time,
                      endTime: time + 2.5,
                      originalText: 'Nhập văn bản gốc...',
                      translatedText: 'Nhập bản dịch tiếng Việt...',
                    },
                  ])
                )
              }
              onClearAll={() => {
                if (confirm('Xóa tất cả phụ đề?')) {
                  setSubtitles([]);
                  setSelectedSubtitleId(null);
                }
              }}
              onPlayTTS={handlePlayTTS}
              onReTranslateAll={handleReTranslateAll}
              isTranslatingBatch={isTranslatingBatch}
              onNormalizeSubtitles={() => setSubtitles((prev) => normalizeSubtitles(prev))}
            />
          </div>
        )}

        {/* 3. CapCut Bottom Function Bar */}
        <CapCutBottomBar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          selectedSubtitle={selectedSubtitle}
          onSelectSubtitle={(sub) => setSelectedSubtitleId(sub ? sub.id : null)}
          onUpdateSubtitle={(updated) =>
            setSubtitles((prev) =>
              prev.map((s) => (s.id === updated.id ? updated : s))
            )
          }
          onDeleteSubtitle={(id) => {
            setSubtitles((prev) => prev.filter((s) => s.id !== id));
            if (selectedSubtitleId === id) setSelectedSubtitleId(null);
          }}
          onExtractSingleFrame={handleExtractSingleFrame}
          isExtractingSingle={isExtractingSingle}
          onStartFullScan={handleStartFullScan}
          scanProgress={scanProgress}
          onCancelScan={handleCancelScan}
          videoDuration={videoDuration}
          targetLang={targetLang}
          onSelectTargetLang={setTargetLang}
          selectedModel={selectedModel}
          onSelectModel={onSelectModel}
          onReTranslateAll={handleReTranslateAll}
          isTranslatingBatch={isTranslatingBatch}
          activeSubtitle={activeSubtitle}
          appSettings={appSettings}
          onSaveSettings={onSaveSettings}
          onPlayTTS={handlePlayTTS}
          onMergeShortSubtitles={handleMergeShortSubtitles}
          onGenerateAllAudio={handleGenerateAllAudio}
          isGeneratingAllAudio={isGeneratingAllAudio}
          audioGenProgress={audioGenProgress}
          audioPlayWithVideo={audioPlayWithVideo}
          onToggleAudioPlayWithVideo={setAudioPlayWithVideo}
          onClearAllAudio={handleClearAllAudio}
          subtitles={subtitles}
          onAddSubtitle={() =>
            setSubtitles((prev) =>
              [
                ...prev,
                {
                  id: `manual-${Date.now()}`,
                  startTime: currentTime,
                  endTime: currentTime + 3.0,
                  originalText: 'Nhập văn bản gốc...',
                  translatedText: 'Nhập bản dịch...',
                },
              ].sort((a, b) => a.startTime - b.startTime)
            )
          }
          styleConfig={styleConfig}
          onChangeStyle={setStyleConfig}
          onChangeRoi={setRoi}
          onOpenConfigDrawer={() => setShowConfigDrawer(true)}
        />

        {/* Modals */}
        {showImportModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-[#18181c] border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-2xl w-full max-w-md p-6 flex flex-col gap-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-white">Import / Đổi Video Cho Dự Án</h3>
                <button
                  onClick={() => setShowImportModal(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Local File Selector */}
              <div className="border-2 border-dashed border-slate-800 hover:border-sky-500 rounded-2xl p-5 text-center bg-[#121215] transition">
                <Upload className="w-7 h-7 text-sky-400 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-200 mb-3">Tải file video từ thiết bị</p>
                <label className="cursor-pointer bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs px-4 py-2 rounded-xl transition shadow-md inline-block">
                  <span>Chọn Video MP4/WebM</span>
                  <input
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const url = URL.createObjectURL(file);
                        const title = file.name.replace(/\.[^/.]+$/, '');
                        handleImportVideo(url, title, undefined, file);
                      }
                    }}
                    className="hidden"
                  />
                </label>
              </div>

              {/* URL Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (customUrl.trim()) {
                    handleImportVideo(customUrl.trim(), 'Video từ URL');
                    setCustomUrl('');
                  }
                }}
                className="flex flex-col gap-2"
              >
                <label className="text-xs text-slate-300 font-medium">Dán link video MP4 từ mạng:</label>
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
                    className="bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold px-3 py-2 rounded-xl transition"
                  >
                    Mở
                  </button>
                </div>
              </form>

              {/* Sample Videos */}
              <div>
                <h4 className="text-xs font-bold text-slate-300 mb-2">Hoặc dùng video mẫu có sẵn:</h4>
                <div className="grid grid-cols-1 gap-2">
                  {SAMPLE_VIDEOS.map((sample) => (
                    <button
                      key={sample.id}
                      onClick={() => handleImportVideo(sample.url, sample.title, sample.defaultRoi)}
                      className="p-2.5 bg-[#121215] border border-slate-800 hover:border-sky-500 rounded-xl text-left transition flex items-center justify-between"
                    >
                      <span className="text-xs font-semibold text-slate-200 truncate">{sample.title}</span>
                      <span className="text-[10px] bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded font-mono">
                        {sample.language}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <ExportModal
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          subtitles={subtitles}
          onImportSubtitles={setSubtitles}
        />

        {/* Inline Config Drawer styled matching Home screen cards */}
        {showConfigDrawer && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-[#121215] border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-2xl w-full max-w-md p-4 max-h-[85vh] overflow-y-auto shadow-2xl flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <Settings className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Cấu Hình Hệ Thống</h3>
                    <p className="text-[10px] text-slate-400">Thay đổi API Key, Engine OCR, Proxy</p>
                  </div>
                </div>

                <button
                  onClick={() => setShowConfigDrawer(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition text-sm font-bold"
                >
                  ✕
                </button>
              </div>

              <ConfigView
                settings={appSettings}
                onSaveSettings={onSaveSettings}
              />
            </div>
          </div>
        )}

        <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      </div>
    </div>
  );
};
