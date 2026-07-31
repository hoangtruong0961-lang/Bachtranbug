import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  Crop,
  Play,
  Pause,
  Camera,
  AlertCircle,
  RefreshCw,
  Upload,
  Film,
} from 'lucide-react';
import { RegionROI, SubtitleItem, SubtitleStyleConfig } from '../types';
import { wrapSubtitleText } from '../utils/srtParser';

interface VideoPlayerProps {
  videoUrl: string;
  roi: RegionROI;
  onChangeRoi: (newRoi: RegionROI) => void;
  activeSubtitle?: SubtitleItem | null;
  onUpdateActiveSubtitleBox?: (newBox: { x: number; y: number; width: number; height: number }) => void;
  styleConfig: SubtitleStyleConfig;
  onChangeStyleConfig?: (newStyle: SubtitleStyleConfig) => void;
  onExtractSingleFrame: (currentTime: number, croppedBase64: string) => void;
  isExtractingSingle: boolean;
  onAutoDetectRoi?: () => void;
  isDetectingRoi?: boolean;
  onTimeUpdate?: (currentTime: number) => void;
  onLoadedMetadata?: (duration: number) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  onImportVideo?: (url: string, title?: string, file?: File) => void;
  onOpenImportModal?: () => void;
  showRoiBox?: boolean;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  videoUrl,
  roi,
  onChangeRoi,
  activeSubtitle,
  onUpdateActiveSubtitleBox,
  styleConfig,
  onChangeStyleConfig,
  onExtractSingleFrame,
  isExtractingSingle,
  onAutoDetectRoi,
  isDetectingRoi,
  onTimeUpdate,
  onLoadedMetadata,
  videoRef,
  isPlaying = false,
  onTogglePlay,
  onImportVideo,
  onOpenImportModal,
  showRoiBox = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);

  // Active target box for mask and subtitle auto-alignment
  const activeBox = activeSubtitle?.boundingBox || roi;

  // Detect if videoUrl is an iframe embed URL (e.g. YouTube embed)
  const isEmbedUrl = Boolean(
    videoUrl &&
    (videoUrl.includes('youtube.com/embed/') ||
     videoUrl.includes('youtube-nocookie.com/embed/') ||
     videoUrl.includes('player.vimeo.com/video/'))
  );

  // Video fallback CORS and error management
  const [useCrossOrigin, setUseCrossOrigin] = useState<boolean>(
    Boolean(videoUrl && !videoUrl.startsWith('blob:') && !isEmbedUrl)
  );
  const [hasLoadError, setHasLoadError] = useState<boolean>(false);

  useEffect(() => {
    setHasLoadError(false);
    setUseCrossOrigin(Boolean(videoUrl && !videoUrl.startsWith('blob:') && !isEmbedUrl));
  }, [videoUrl, isEmbedUrl]);

  const handleVideoError = () => {
    if (useCrossOrigin) {
      console.warn('Video load error with crossOrigin="anonymous", retrying without crossOrigin...');
      setUseCrossOrigin(false);
      if (videoRef.current) {
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.load();
          }
        }, 50);
      }
    } else if (
      videoUrl &&
      (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) &&
      !videoUrl.includes('/api/proxy-video') &&
      onImportVideo
    ) {
      console.warn('Direct video URL failed to stream, auto-retrying via /api/proxy-video proxy stream...');
      const proxiedUrl = `/api/proxy-video?url=${encodeURIComponent(videoUrl)}`;
      onImportVideo(proxiedUrl, 'Video Stream (Proxied)');
    } else if (videoUrl && videoUrl.startsWith('blob:') && onImportVideo) {
      console.warn('Blob URL invalid or expired, falling back to sample video source...');
      onImportVideo(
        'https://media.w3.org/2010/05/sintel/trailer.mp4',
        'Sample Video (Sintel MP4)'
      );
    } else {
      console.error('Video element failed to load source:', videoUrl);
      setHasLoadError(true);
    }
  };

  // Dragging states for ROI box
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragMode, setDragMode] = useState<'move' | 'nw' | 'ne' | 'sw' | 'se' | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [startRoi, setStartRoi] = useState<RegionROI>(roi);

  // Subtitle Overlay Interactive Drag & Scale Handling (Mouse & Touch)
  const [isSubDragging, setIsSubDragging] = useState<boolean>(false);
  const [subDragMode, setSubDragMode] = useState<'move' | 'nw' | 'ne' | 'sw' | 'se' | null>(null);
  const [subDragStart, setSubDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [subStartBox, setSubStartBox] = useState<{ x: number; y: number; width: number; height: number }>({ x: 10, y: 76, width: 80, height: 20 });

  const startDraggingSub = (
    clientX: number,
    clientY: number,
    mode: 'move' | 'nw' | 'ne' | 'sw' | 'se'
  ) => {
    setIsSubDragging(true);
    setSubDragMode(mode);
    const { xPercent, yPercent } = getContainerRelativePosFromClient(clientX, clientY);
    setSubDragStart({ x: xPercent, y: yPercent });
    setSubStartBox(activeSubtitle?.boundingBox || roi);
  };

  const handleStartDragSubtitle = (
    e: React.MouseEvent | React.TouchEvent,
    mode: 'move' | 'nw' | 'ne' | 'sw' | 'se'
  ) => {
    e.stopPropagation();
    if ('touches' in e && e.touches.length > 0) {
      startDraggingSub(e.touches[0].clientX, e.touches[0].clientY, mode);
    } else if ('clientX' in e) {
      e.preventDefault();
      startDraggingSub(e.clientX, e.clientY, mode);
    }
  };

  useEffect(() => {
    if (!isSubDragging || !subDragMode) return;

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      let clientX = 0;
      let clientY = 0;

      if ('touches' in e && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else if ('clientX' in e) {
        clientX = (e as MouseEvent).clientX;
        clientY = (e as MouseEvent).clientY;
      } else {
        return;
      }

      const { xPercent, yPercent } = getContainerRelativePosFromClient(clientX, clientY);
      const deltaX = xPercent - subDragStart.x;
      const deltaY = yPercent - subDragStart.y;

      const nextBox = { ...subStartBox };

      if (subDragMode === 'move') {
        nextBox.x = Math.max(0, Math.min(100 - subStartBox.width, subStartBox.x + deltaX));
        nextBox.y = Math.max(0, Math.min(100 - subStartBox.height, subStartBox.y + deltaY));
      } else if (subDragMode === 'se') {
        nextBox.width = Math.max(10, Math.min(100 - subStartBox.x, subStartBox.width + deltaX));
        nextBox.height = Math.max(5, Math.min(100 - subStartBox.y, subStartBox.height + deltaY));
      } else if (subDragMode === 'sw') {
        const newX = Math.max(0, Math.min(subStartBox.x + subStartBox.width - 10, subStartBox.x + deltaX));
        nextBox.width = subStartBox.width + (subStartBox.x - newX);
        nextBox.x = newX;
        nextBox.height = Math.max(5, Math.min(100 - subStartBox.y, subStartBox.height + deltaY));
      } else if (subDragMode === 'ne') {
        const newY = Math.max(0, Math.min(subStartBox.y + subStartBox.height - 5, subStartBox.y + deltaY));
        nextBox.height = subStartBox.height + (subStartBox.y - newY);
        nextBox.y = newY;
        nextBox.width = Math.max(10, Math.min(100 - subStartBox.x, subStartBox.width + deltaX));
      } else if (subDragMode === 'nw') {
        const newX = Math.max(0, Math.min(subStartBox.x + subStartBox.width - 10, subStartBox.x + deltaX));
        const newY = Math.max(0, Math.min(subStartBox.y + subStartBox.height - 5, subStartBox.y + deltaY));
        nextBox.width = subStartBox.width + (subStartBox.x - newX);
        nextBox.height = subStartBox.height + (subStartBox.y - newY);
        nextBox.x = newX;
        nextBox.y = newY;
      }

      if (onUpdateActiveSubtitleBox) {
        onUpdateActiveSubtitleBox(nextBox);
      }
    };

    const handlePointerUp = () => {
      setIsSubDragging(false);
      setSubDragMode(null);
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);
    window.addEventListener('touchcancel', handlePointerUp);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
      window.removeEventListener('touchcancel', handlePointerUp);
    };
  }, [isSubDragging, subDragMode, subDragStart, subStartBox, onUpdateActiveSubtitleBox]);

  const handleTimeUpdateInternal = () => {
    if (!videoRef.current) return;
    const t = videoRef.current.currentTime;
    setCurrentTime(t);
    if (onTimeUpdate) onTimeUpdate(t);
  };

  const handleLoadedMetadataInternal = () => {
    if (!videoRef.current) return;
    setHasLoadError(false);
    const d = videoRef.current.duration;
    if (onLoadedMetadata && !isNaN(d)) onLoadedMetadata(d);
  };

  // Helper to crop video frame according to current ROI
  const captureCroppedFrame = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;

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
    if (!ctx) return null;

    try {
      ctx.drawImage(
        video,
        cropX,
        cropY,
        cropW,
        cropH,
        0,
        0,
        canvas.width,
        canvas.height
      );
      return canvas.toDataURL('image/jpeg', 0.92);
    } catch (e) {
      console.error('Error rendering cropped frame to canvas:', e);
      return null;
    }
  }, [roi, videoRef]);

  const handleExtractClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const cropped = captureCroppedFrame();
    if (cropped) {
      onExtractSingleFrame(currentTime, cropped);
    }
  };

  // ROI Interactive Drag & Scale Handling (Mouse & Touch)
  const getContainerRelativePosFromClient = (clientX: number, clientY: number) => {
    if (!containerRef.current) return { xPercent: 0, yPercent: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;

    const xPercent = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
    const yPercent = Math.max(0, Math.min(100, (clickY / rect.height) * 100));

    return { xPercent, yPercent };
  };

  const startDraggingROI = (
    clientX: number,
    clientY: number,
    mode: 'move' | 'nw' | 'ne' | 'sw' | 'se'
  ) => {
    setIsDragging(true);
    setDragMode(mode);
    const { xPercent, yPercent } = getContainerRelativePosFromClient(clientX, clientY);
    setDragStart({ x: xPercent, y: yPercent });
    setStartRoi({ ...roi });
  };

  const handleStartDrag = (
    e: React.MouseEvent | React.TouchEvent,
    mode: 'move' | 'nw' | 'ne' | 'sw' | 'se'
  ) => {
    e.stopPropagation();
    if ('touches' in e && e.touches.length > 0) {
      startDraggingROI(e.touches[0].clientX, e.touches[0].clientY, mode);
    } else if ('clientX' in e) {
      e.preventDefault();
      startDraggingROI(e.clientX, e.clientY, mode);
    }
  };

  // Global pointer listeners during active ROI drag
  useEffect(() => {
    if (!isDragging || !dragMode) return;

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      let clientX = 0;
      let clientY = 0;

      if ('touches' in e && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else if ('clientX' in e) {
        clientX = (e as MouseEvent).clientX;
        clientY = (e as MouseEvent).clientY;
      } else {
        return;
      }

      const { xPercent, yPercent } = getContainerRelativePosFromClient(clientX, clientY);
      const deltaX = xPercent - dragStart.x;
      const deltaY = yPercent - dragStart.y;

      const nextRoi = { ...startRoi };

      if (dragMode === 'move') {
        nextRoi.x = Math.max(0, Math.min(100 - startRoi.width, startRoi.x + deltaX));
        nextRoi.y = Math.max(0, Math.min(100 - startRoi.height, startRoi.y + deltaY));
      } else if (dragMode === 'se') {
        nextRoi.width = Math.max(5, Math.min(100 - startRoi.x, startRoi.width + deltaX));
        nextRoi.height = Math.max(5, Math.min(100 - startRoi.y, startRoi.height + deltaY));
      } else if (dragMode === 'sw') {
        const newX = Math.max(0, Math.min(startRoi.x + startRoi.width - 5, startRoi.x + deltaX));
        nextRoi.width = startRoi.width + (startRoi.x - newX);
        nextRoi.x = newX;
        nextRoi.height = Math.max(5, Math.min(100 - startRoi.y, startRoi.height + deltaY));
      } else if (dragMode === 'ne') {
        const newY = Math.max(0, Math.min(startRoi.y + startRoi.height - 5, startRoi.y + deltaY));
        nextRoi.height = startRoi.height + (startRoi.y - newY);
        nextRoi.y = newY;
        nextRoi.width = Math.max(5, Math.min(100 - startRoi.x, startRoi.width + deltaX));
      } else if (dragMode === 'nw') {
        const newX = Math.max(0, Math.min(startRoi.x + startRoi.width - 5, startRoi.x + deltaX));
        const newY = Math.max(0, Math.min(startRoi.y + startRoi.height - 5, startRoi.y + deltaY));
        nextRoi.width = startRoi.width + (startRoi.x - newX);
        nextRoi.height = startRoi.height + (startRoi.y - newY);
        nextRoi.x = newX;
        nextRoi.y = newY;
      }

      onChangeRoi(nextRoi);
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      setDragMode(null);
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);
    window.addEventListener('touchcancel', handlePointerUp);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
      window.removeEventListener('touchcancel', handlePointerUp);
    };
  }, [isDragging, dragMode, dragStart, startRoi, onChangeRoi]);

  return (
    <div className="bg-slate-950 border border-slate-900 rounded-2xl overflow-hidden shadow-2xl flex flex-col flex-1 min-h-[220px] max-h-[50vh] relative">
      {/* Main Video Screen Container */}
      <div
        ref={containerRef}
        onClick={() => {
          if (!isDragging) onTogglePlay?.();
        }}
        className="relative bg-black w-full flex-1 flex items-center justify-center overflow-hidden select-none cursor-pointer group"
      >
        {!videoUrl ? (
          <div className="absolute inset-0 z-40 bg-[#0d0e12] flex flex-col items-center justify-center p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-sky-500/15 border border-sky-400/30 flex items-center justify-center text-sky-400 shadow-xl shadow-sky-500/10">
              <Upload className="w-8 h-8" />
            </div>
            <div className="space-y-1 max-w-xs">
              <h3 className="text-base font-extrabold text-white">Import Video</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Vui lòng import file video (MP4/WebM) từ thiết bị hoặc chọn từ thư viện để bắt đầu chỉnh sửa.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <label className="cursor-pointer bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs px-4 py-2.5 rounded-xl transition shadow-lg shadow-sky-500/20 flex items-center space-x-1.5 active:scale-95">
                <Upload className="w-4 h-4" />
                <span>Import Video Từ Máy</span>
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file && onImportVideo) {
                      const url = URL.createObjectURL(file);
                      onImportVideo(url, file.name.replace(/\.[^/.]+$/, ''), file);
                    }
                  }}
                  className="hidden"
                />
              </label>
              {onOpenImportModal && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenImportModal();
                  }}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs px-3.5 py-2.5 rounded-xl transition border border-slate-700 active:scale-95"
                >
                  Chọn Nguồn Khác
                </button>
              )}
            </div>
          </div>
        ) : isEmbedUrl ? (
          <div className="relative w-full h-full flex flex-col items-center justify-center bg-black">
            <iframe
              src={videoUrl.includes('?') ? videoUrl : `${videoUrl}?autoplay=1`}
              title="Embedded Video Player"
              className="w-full h-full border-0 pointer-events-auto"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
            <div className="absolute top-2 left-2 z-30 bg-slate-900/90 backdrop-blur-md text-amber-300 border border-amber-500/30 text-[11px] px-2.5 py-1 rounded-lg shadow-md flex items-center space-x-1.5 pointer-events-none">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
              <span>Chế độ phát Embed Web (YouTube)</span>
            </div>
          </div>
        ) : (
          <video
            ref={videoRef}
            src={videoUrl}
            onTimeUpdate={handleTimeUpdateInternal}
            onLoadedMetadata={handleLoadedMetadataInternal}
            onError={handleVideoError}
            className="w-full h-full object-contain pointer-events-auto"
            crossOrigin={useCrossOrigin ? 'anonymous' : undefined}
            playsInline
          />
        )}

        {/* Video Load Error Overlay */}
        {hasLoadError && (
          <div className="absolute inset-0 z-40 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center space-y-3">
            <AlertCircle className="w-10 h-10 text-rose-500 animate-bounce" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">Không thể phát trực tiếp URL này</h4>
              <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                URL video không hỗ trợ HTML5 direct stream hoặc link đã hết hạn. Bạn có thể chọn Sample Video MP4 hoặc tải file từ máy lên.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              {onImportVideo && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setHasLoadError(false);
                    onImportVideo(
                      'https://media.w3.org/2010/05/sintel/trailer.mp4',
                      'Sample Video (Sintel MP4)'
                    );
                  }}
                  className="px-3.5 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-xl text-xs flex items-center space-x-1.5 transition shadow-md active:scale-95"
                >
                  <Film className="w-3.5 h-3.5" />
                  <span>Dùng Sample MP4</span>
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setHasLoadError(false);
                  if (videoRef.current) {
                    videoRef.current.load();
                  }
                }}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs flex items-center space-x-1.5 transition border border-slate-700"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Thử Lại</span>
              </button>
              {onImportVideo && (
                <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs px-3.5 py-2 rounded-xl transition border border-slate-700 flex items-center space-x-1 active:scale-95">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Chọn File Từ Máy</span>
                  <input
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setHasLoadError(false);
                        const url = URL.createObjectURL(file);
                        onImportVideo(url, file.name.replace(/\.[^/.]+$/, ''), file);
                      }
                    }}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>
        )}




        {/* ROI Box Overlay (Cyan / Blue Dashed Border with 4 Corner Handles) - ONLY shown in Extract mode */}
        {showRoiBox && !hasLoadError && (
          <div className="absolute inset-0 z-20 pointer-events-none">
            <div
              onMouseDown={(e) => handleStartDrag(e, 'move')}
              onTouchStart={(e) => handleStartDrag(e, 'move')}
              onClick={(e) => e.stopPropagation()}
              className="absolute border-2 border-dashed border-cyan-400 bg-cyan-400/5 shadow-[0_0_20px_rgba(0,229,255,0.4)] cursor-move transition-colors pointer-events-auto rounded-xs touch-none"
              style={{
                left: `${roi.x}%`,
                top: `${roi.y}%`,
                width: `${roi.width}%`,
                height: `${roi.height}%`,
              }}
            >
              <div className="absolute -top-6 left-0 bg-cyan-400 text-slate-950 font-black text-[10px] px-2 py-0.5 rounded shadow-lg pointer-events-none flex items-center space-x-1 whitespace-nowrap">
                <Crop className="w-3 h-3" />
                <span>Vùng Quét OCR {activeSubtitle?.boundingBox ? '(Đã khớp)' : ''}</span>
              </div>

              {/* 4 Corner Touch Handles */}
              <div
                onMouseDown={(e) => handleStartDrag(e, 'nw')}
                onTouchStart={(e) => handleStartDrag(e, 'nw')}
                className="absolute -top-2.5 -left-2.5 w-5 h-5 bg-cyan-400 border-2 border-slate-950 rounded-full cursor-nwse-resize shadow-lg pointer-events-auto touch-none hover:scale-125 transition-transform"
                title="Kéo thu phóng góc trên-trái"
              />
              <div
                onMouseDown={(e) => handleStartDrag(e, 'ne')}
                onTouchStart={(e) => handleStartDrag(e, 'ne')}
                className="absolute -top-2.5 -right-2.5 w-5 h-5 bg-cyan-400 border-2 border-slate-950 rounded-full cursor-nesw-resize shadow-lg pointer-events-auto touch-none hover:scale-125 transition-transform"
                title="Kéo thu phóng góc trên-phải"
              />
              <div
                onMouseDown={(e) => handleStartDrag(e, 'sw')}
                onTouchStart={(e) => handleStartDrag(e, 'sw')}
                className="absolute -bottom-2.5 -left-2.5 w-5 h-5 bg-cyan-400 border-2 border-slate-950 rounded-full cursor-nesw-resize shadow-lg pointer-events-auto touch-none hover:scale-125 transition-transform"
                title="Kéo thu phóng góc dưới-trái"
              />
              <div
                onMouseDown={(e) => handleStartDrag(e, 'se')}
                onTouchStart={(e) => handleStartDrag(e, 'se')}
                className="absolute -bottom-2.5 -right-2.5 w-5 h-5 bg-cyan-400 border-2 border-slate-950 rounded-full cursor-nwse-resize shadow-lg pointer-events-auto touch-none hover:scale-125 transition-transform"
                title="Kéo thu phóng góc dưới-phải"
              />
            </div>
          </div>
        )}

        {/* Active Subtitle Overlay - Touch Draggable & Scalable (Applies to all subtitles) */}
        {activeSubtitle && !hasLoadError && (() => {
          const isVertical = styleConfig.orientation === 'vertical';
          const activeText = activeSubtitle.translatedText || activeSubtitle.originalText;
          const formattedText = wrapSubtitleText(
            activeText,
            styleConfig.orientation || 'horizontal',
            styleConfig.maxCharsHorizontal || 65,
            styleConfig.maxCharsVertical || 36
          );

          const outlineCol = styleConfig.outlineColor || '#000000';
          const textShadowStyle = styleConfig.textOutline
            ? `-1px -1px 0 ${outlineCol}, 1px -1px 0 ${outlineCol}, -1px 1px 0 ${outlineCol}, 1px 1px 0 ${outlineCol}, 0 2px 6px rgba(0,0,0,0.9)`
            : undefined;

          const displayBox = activeSubtitle.boundingBox || roi;

          // Helper to calculate RGBA background with opacity
          const getBgColorWithOpacity = (hexColor: string, opacity: number = 65) => {
            if (!hexColor) return `rgba(0, 0, 0, ${opacity / 100})`;
            if (hexColor.startsWith('rgba')) return hexColor;
            let hex = hexColor.replace('#', '');
            if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
            const num = parseInt(hex, 16);
            if (isNaN(num)) return `rgba(0, 0, 0, ${opacity / 100})`;
            const r = (num >> 16) & 255;
            const g = (num >> 8) & 255;
            const b = num & 255;
            return `rgba(${r}, ${g}, ${b}, ${(opacity / 100).toFixed(2)})`;
          };

          const textCasingCss = styleConfig.textTransform === 'uppercase' 
            ? 'uppercase' 
            : styleConfig.textTransform === 'lowercase' 
            ? 'lowercase' 
            : styleConfig.textTransform === 'capitalize' 
            ? 'capitalize' 
            : 'none';

          return (
            <div
              onMouseDown={(e) => handleStartDragSubtitle(e, 'move')}
              onTouchStart={(e) => handleStartDragSubtitle(e, 'move')}
              className="absolute z-30 pointer-events-auto touch-none cursor-grab active:cursor-grabbing flex flex-col items-center justify-center text-center group/sub ring-2 ring-transparent hover:ring-amber-400/80 rounded-lg p-1 select-none"
              title="Kéo di chuyển hoặc chạm góc thu phóng phụ đề (Áp dụng cho toàn bộ)"
              style={{
                left: `${displayBox.x}%`,
                top: `${displayBox.y}%`,
                width: `${displayBox.width}%`,
                minHeight: `${displayBox.height}%`,
              }}
            >
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-amber-500 text-slate-950 font-black text-[9px] px-2 py-0.5 rounded-full shadow opacity-0 group-hover/sub:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-40">
                Kéo di chuyển / Thu phóng góc (Áp dụng tất cả)
              </div>

              {/* 4 Corner Touch Resizing Handles for Subtitle Box */}
              <div
                onMouseDown={(e) => handleStartDragSubtitle(e, 'nw')}
                onTouchStart={(e) => handleStartDragSubtitle(e, 'nw')}
                className="absolute -top-2 -left-2 w-4 h-4 bg-amber-400 border border-slate-950 rounded-full cursor-nwse-resize shadow pointer-events-auto touch-none hover:scale-125 transition-transform"
                title="Thu phóng góc"
              />
              <div
                onMouseDown={(e) => handleStartDragSubtitle(e, 'ne')}
                onTouchStart={(e) => handleStartDragSubtitle(e, 'ne')}
                className="absolute -top-2 -right-2 w-4 h-4 bg-amber-400 border border-slate-950 rounded-full cursor-nesw-resize shadow pointer-events-auto touch-none hover:scale-125 transition-transform"
                title="Thu phóng góc"
              />
              <div
                onMouseDown={(e) => handleStartDragSubtitle(e, 'sw')}
                onTouchStart={(e) => handleStartDragSubtitle(e, 'sw')}
                className="absolute -bottom-2 -left-2 w-4 h-4 bg-amber-400 border border-slate-950 rounded-full cursor-nesw-resize shadow pointer-events-auto touch-none hover:scale-125 transition-transform"
                title="Thu phóng góc"
              />
              <div
                onMouseDown={(e) => handleStartDragSubtitle(e, 'se')}
                onTouchStart={(e) => handleStartDragSubtitle(e, 'se')}
                className="absolute -bottom-2 -right-2 w-4 h-4 bg-amber-400 border border-slate-950 rounded-full cursor-nwse-resize shadow pointer-events-auto touch-none hover:scale-125 transition-transform"
                title="Thu phóng góc"
              />

              <div className={`text-center transition-all w-full flex ${isVertical ? 'flex-row items-center justify-center' : 'flex-col items-center'} gap-1.5 drop-shadow-lg px-1 py-0.5`}>
                {formattedText ? (
                  <div
                    className="leading-snug transition-all whitespace-pre-line"
                    style={{
                      fontSize: `${styleConfig.fontSize || 16}px`,
                      fontWeight: styleConfig.fontWeight || 'bold',
                      fontStyle: styleConfig.fontStyle || 'normal',
                      textTransform: textCasingCss as any,
                      fontFamily: styleConfig.fontFamily || 'system-ui, sans-serif',
                      color: styleConfig.fontColor || '#ffffff',
                      backgroundColor: styleConfig.hasBackground !== false
                        ? getBgColorWithOpacity(styleConfig.backgroundColor || '#000000', styleConfig.bgOpacity ?? 65)
                        : 'transparent',
                      borderRadius: `${styleConfig.borderRadius ?? 8}px`,
                      padding: styleConfig.hasBackground !== false ? `${styleConfig.padding || 6}px` : '0px',
                      textShadow: styleConfig.textOutline !== false
                        ? textShadowStyle || `-1px -1px 0 ${outlineCol}, 1px -1px 0 ${outlineCol}, -1px 1px 0 ${outlineCol}, 1px 1px 0 ${outlineCol}, 0 2px 6px rgba(0,0,0,0.9)`
                        : '0 2px 6px rgba(0,0,0,0.9)',
                      writingMode: isVertical ? 'vertical-rl' : 'horizontal-tb',
                      textOrientation: isVertical ? 'upright' : undefined,
                      display: 'inline-block',
                      maxWidth: '100%',
                    }}
                  >
                    {activeSubtitle.timestamps && activeSubtitle.timestamps.length > 0 ? (
                      activeSubtitle.timestamps.map((ts, idx) => {
                        const relTime = currentTime - activeSubtitle.startTime;
                        const isActive = relTime >= ts.start && relTime <= ts.end;
                        return (
                          <span
                            key={idx}
                            className={`transition-colors duration-75 ${isActive ? 'inline-block transform scale-105' : ''}`}
                            style={
                              isActive
                                ? {
                                    color: '#facc15', // Bright active karaoke yellow
                                    textShadow: '0 0 10px rgba(250, 204, 21, 0.9), -1px -1px 0 #000, 1px 1px 0 #000',
                                  }
                                : undefined
                            }
                          >
                            {ts.word}{' '}
                          </span>
                        )
                      })
                    ) : (
                      formattedText
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};
