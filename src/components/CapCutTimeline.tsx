import React, { useRef, useState, useEffect } from 'react';
import {
  Play,
  Pause,
  ZoomIn,
  ZoomOut,
  Scissors,
  Type,
  Volume2,
  Subtitles,
  Film,
  Upload,
  Mic,
  Headphones,
  Music2,
  ChevronDown,
} from 'lucide-react';
import { SubtitleItem } from '../types';

interface CapCutTimelineProps {
  duration: number;
  currentTime: number;
  subtitles: SubtitleItem[];
  selectedSubtitleId: string | null;
  onSeek: (time: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onAddSubtitle?: (time?: number) => void;
  onSplitSubtitle?: (time: number) => void;
  onSelectSubtitle?: (sub: SubtitleItem | null) => void;
  onUpdateSubtitle?: (updated: SubtitleItem) => void;
  hasVideo?: boolean;
  videoTitle?: string;
  onOpenImportModal?: () => void;
  onImportVideo?: (url: string, title?: string) => void;
  onPlayTTS?: (text: string) => void;
}

const formatMMSS = (seconds: number): string => {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const mm = m < 10 ? `0${m}` : `${m}`;
  const ss = s < 10 ? `0${s}` : `${s}`;
  return `${mm}:${ss}`;
};

const formatTimeLabel = (seconds: number, step: number): string => {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const mm = m < 10 ? `0${m}` : `${m}`;
  const ss = s < 10 ? `0${s}` : `${s}`;

  if (step < 1) {
    const tenths = Math.floor((seconds % 1) * 10);
    return `${mm}:${ss}.${tenths}`;
  }
  return `${mm}:${ss}`;
};

export const CapCutTimeline: React.FC<CapCutTimelineProps> = ({
  duration,
  currentTime,
  subtitles,
  selectedSubtitleId,
  onSeek,
  isPlaying,
  onTogglePlay,
  onAddSubtitle,
  onSplitSubtitle,
  onSelectSubtitle,
  onUpdateSubtitle,
  hasVideo = true,
  videoTitle = 'imported_video_1785328015414.mp4',
  onOpenImportModal,
  onImportVideo,
  onPlayTTS,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  // Zoom scale multiplier (1x = fit, 1.5x, 2x, up to 8x)
  const [zoom, setZoom] = useState<number>(1);
  const [containerWidth, setContainerWidth] = useState<number>(800);
  const [headerWidth, setHeaderWidth] = useState<number>(112);

  // Programmatic scroll flag to avoid scroll feedback loops
  const isProgrammaticScrollRef = useRef<boolean>(false);

  // Mouse drag-to-scroll scrubbing state
  const [isMouseDown, setIsMouseDown] = useState<boolean>(false);
  const startXRef = useRef<number>(0);
  const startScrollLeftRef = useRef<number>(0);

  // Measure timeline container & header widths dynamically for pixel-perfect playhead alignment
  useEffect(() => {
    if (!containerRef.current) return;
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth || 800);
      }
      if (headerRef.current) {
        setHeaderWidth(headerRef.current.clientWidth || 112);
      }
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(containerRef.current);
    if (headerRef.current) {
      observer.observe(headerRef.current);
    }
    return () => observer.disconnect();
  }, []);

  // Calculate playhead offset inside track container so playhead aligns with 50% center of the whole timeline bar
  const playheadOffset = Math.max(0, (containerWidth - headerWidth) / 2);

  // Dragging state for Left/Right handles or whole block move on selected subtitle clip
  const [draggingState, setDraggingState] = useState<{
    subId: string;
    type: 'left' | 'right' | 'move';
    initialClickTime?: number;
    initialStartTime?: number;
    initialEndTime?: number;
  } | null>(null);

  // Touch gesture state for pinch-to-zoom
  const touchStartDistRef = useRef<number | null>(null);
  const touchStartZoomRef = useRef<number>(1);

  const safeDuration = duration && duration > 0 ? duration : 60;

  // Sync scrollLeft with currentTime so the white playhead remains fixed in the center
  useEffect(() => {
    if (!containerRef.current) return;
    const trackWidth = containerWidth * zoom;
    const targetScroll = Math.max(0, (currentTime / safeDuration) * trackWidth);

    if (Math.abs(containerRef.current.scrollLeft - targetScroll) > 0.5) {
      isProgrammaticScrollRef.current = true;
      containerRef.current.scrollLeft = targetScroll;
      requestAnimationFrame(() => {
        isProgrammaticScrollRef.current = false;
      });
    }
  }, [currentTime, safeDuration, zoom, containerWidth]);

  // Handle user timeline scrolling / scrubbing to seek currentTime
  const handleScroll = () => {
    if (!containerRef.current) return;
    if (isProgrammaticScrollRef.current) return;

    // HARD LOCK: Never allow scrollLeft < 0 (before 00:00)
    if (containerRef.current.scrollLeft < 0) {
      containerRef.current.scrollLeft = 0;
      onSeek(0);
      return;
    }

    const trackWidth = containerWidth * zoom;
    if (trackWidth <= 0) return;

    const currentScroll = Math.max(0, containerRef.current.scrollLeft);
    const calculatedTime = (currentScroll / trackWidth) * safeDuration;
    const clampedTime = Math.max(0, Math.min(safeDuration, calculatedTime));

    onSeek(Number(clampedTime.toFixed(2)));
  };

  // Mouse drag to scroll / scrub timeline on desktop
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    setIsMouseDown(true);
    startXRef.current = e.clientX;
    if (containerRef.current) {
      startScrollLeftRef.current = Math.max(0, containerRef.current.scrollLeft);
    }
  };

  useEffect(() => {
    if (!isMouseDown) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const dx = e.clientX - startXRef.current;
      // HARD LOCK: Clamp newScrollLeft to minimum 0 so user cannot scrub before 00:00
      const newScrollLeft = Math.max(0, startScrollLeftRef.current - dx);
      containerRef.current.scrollLeft = newScrollLeft;
    };

    const handleMouseUp = () => {
      setIsMouseDown(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isMouseDown]);

  // Handle drag handles for adjusting subtitle start/end times directly on timeline
  const handleStartDragHandle = (
    e: React.MouseEvent | React.TouchEvent,
    sub: SubtitleItem,
    type: 'left' | 'right' | 'move'
  ) => {
    e.stopPropagation();
    if ('cancelable' in e && e.cancelable) {
      e.preventDefault();
    }
    if (!trackRef.current) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const rect = trackRef.current.getBoundingClientRect();
    const trackWidth = containerWidth * zoom;

    const clickX = Math.max(0, Math.min(trackWidth, clientX - rect.left - playheadOffset));
    const clickTime = (clickX / trackWidth) * safeDuration;

    setDraggingState({
      subId: sub.id,
      type,
      initialClickTime: clickTime,
      initialStartTime: sub.startTime,
      initialEndTime: sub.endTime,
    });
    if (onSelectSubtitle) onSelectSubtitle(sub);
  };

  useEffect(() => {
    if (!draggingState) return;

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      if ('cancelable' in e && e.cancelable) {
        e.preventDefault();
      }
      if (!trackRef.current || !onUpdateSubtitle) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const rect = trackRef.current.getBoundingClientRect();
      const trackWidth = containerWidth * zoom;

      const clickX = Math.max(0, Math.min(trackWidth, clientX - rect.left - playheadOffset));
      const targetTime = (clickX / trackWidth) * safeDuration;

      const sub = subtitles.find((s) => s.id === draggingState.subId);
      if (!sub) return;

      if (draggingState.type === 'left') {
        const newStart = Math.max(0, Math.min(targetTime, sub.endTime - 0.2));
        onUpdateSubtitle({ ...sub, startTime: Number(newStart.toFixed(2)) });
      } else if (draggingState.type === 'right') {
        const newEnd = Math.min(safeDuration, Math.max(targetTime, sub.startTime + 0.2));
        onUpdateSubtitle({ ...sub, endTime: Number(newEnd.toFixed(2)) });
      } else if (
        draggingState.type === 'move' &&
        draggingState.initialClickTime !== undefined &&
        draggingState.initialStartTime !== undefined &&
        draggingState.initialEndTime !== undefined
      ) {
        const delta = targetTime - draggingState.initialClickTime;
        const dur = draggingState.initialEndTime - draggingState.initialStartTime;

        let newStart = Math.max(0, draggingState.initialStartTime + delta);
        let newEnd = newStart + dur;

        if (newEnd > safeDuration) {
          newEnd = safeDuration;
          newStart = Math.max(0, safeDuration - dur);
        }

        onUpdateSubtitle({
          ...sub,
          startTime: Number(newStart.toFixed(2)),
          endTime: Number(newEnd.toFixed(2)),
        });
      }
    };

    const handlePointerUp = () => {
      setDraggingState(null);
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [draggingState, subtitles, safeDuration, onUpdateSubtitle, containerWidth, zoom, playheadOffset]);

  // Handle click on timeline to seek
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingState || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const trackWidth = containerWidth * zoom;

    const clickX = e.clientX - rect.left - playheadOffset;
    const clampedX = Math.max(0, Math.min(trackWidth, clickX));
    const targetTime = (clampedX / trackWidth) * safeDuration;
    onSeek(Math.max(0, Number(targetTime.toFixed(2))));
  };

  // Wheel zoom handling
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY < 0) {
        setZoom((prev) => Math.min(8, prev + 0.25));
      } else {
        setZoom((prev) => Math.max(1, prev - 0.25));
      }
    }
  };

  // Touch Pinch-to-Zoom Gesture Handlers
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartDistRef.current = dist;
      touchStartZoomRef.current = zoom;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && touchStartDistRef.current !== null) {
      const currentDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (touchStartDistRef.current > 0) {
        const scale = currentDist / touchStartDistRef.current;
        const newZoom = Math.max(1, Math.min(8, touchStartZoomRef.current * scale));
        setZoom(newZoom);
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) {
      touchStartDistRef.current = null;
    }
  };

  // Generate timeline ruler time marks cleanly and dynamically according to zoom
  const generateRulerTicks = () => {
    const trackWidth = containerWidth * zoom;
    const pxPerSec = trackWidth / Math.max(0.1, safeDuration);

    // Minimum label width in pixels (60px) to prevent text collision
    const minLabelPx = 60;
    const minSecInterval = minLabelPx / pxPerSec;

    // Step increments in seconds based on zoom level
    const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    const tickInterval = steps.find((s) => s >= minSecInterval) || 2;

    const ticks = [];
    const totalSecs = Math.ceil(safeDuration);

    for (let sec = 0; sec < totalSecs; sec += tickInterval) {
      const startPercent = (sec / safeDuration) * 100;

      ticks.push({
        sec,
        startPercent,
        label: formatTimeLabel(sec, tickInterval),
        tickInterval,
      });
    }
    return ticks;
  };

  const rulerTicks = generateRulerTicks();

  if (!hasVideo || !duration || duration <= 0) {
    return (
      <div className="bg-[#121214] border-t border-zinc-900 p-6 flex flex-col items-center justify-center text-center space-y-2 text-zinc-400 select-none min-h-[160px]">
        <div className="w-10 h-10 rounded-2xl bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-zinc-400">
          <Film className="w-5 h-5 text-zinc-500" />
        </div>
        <p className="text-xs font-bold text-zinc-300">Chưa có video</p>
        <p className="text-[11px] text-zinc-500 max-w-xs leading-relaxed">
          Vui lòng import video để hiển thị khung thời gian và chỉnh sửa phụ đề.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#121214] border-t border-zinc-900 flex flex-col select-none text-zinc-200">
      {/* Top Toolbar Bar */}
      <div className="px-3 py-1.5 bg-[#121214] border-b border-zinc-800/80 flex items-center justify-between text-xs relative min-h-[36px]">
        {/* Left: Current / Total Timecode */}
        <div className="font-mono text-xs text-amber-400 font-bold tracking-wider flex items-center space-x-1.5">
          <span>{formatMMSS(currentTime)}</span>
          <span className="text-zinc-600">/</span>
          <span className="text-zinc-400">{formatMMSS(safeDuration)}</span>
        </div>

        {/* Center: Play / Pause toggle icon button */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center space-x-2">
          {onSplitSubtitle && (
            <button
              onClick={() => onSplitSubtitle(currentTime)}
              className="p-1.5 bg-zinc-800/90 hover:bg-zinc-700 active:scale-95 rounded-lg text-zinc-300 transition border border-zinc-700/70"
              title="Tách phụ đề tại vị trí con trỏ"
            >
              <Scissors className="w-3.5 h-3.5 text-zinc-300" />
            </button>
          )}

          <button
            onClick={onTogglePlay}
            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 active:scale-95 rounded-full text-white transition border border-zinc-700 shadow-md"
            title={isPlaying ? 'Tạm dừng video' : 'Phát video'}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-white text-white" />
            ) : (
              <Play className="w-4 h-4 fill-white text-white ml-0.5" />
            )}
          </button>
        </div>

        {/* Right: Zoom controls */}
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setZoom((prev) => Math.max(1, prev - 0.5))}
            className="p-1 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 rounded-md border border-zinc-700/60"
            title="Thu nhỏ timeline"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-mono font-bold text-zinc-400 px-1">{zoom.toFixed(1)}x</span>
          <button
            onClick={() => setZoom((prev) => Math.min(8, prev + 0.5))}
            className="p-1 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 rounded-md border border-zinc-700/60"
            title="Phóng to timeline"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* CapCut Timeline Track Container */}
      <div className="relative flex bg-[#121214] overflow-hidden">
        {/* SOLID WHITE PLAYHEAD VERTICAL NEEDLE (EXACT MATCH TO USER SCREENSHOT) */}
        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[2.5px] bg-white z-10 pointer-events-none drop-shadow-[0_0_6px_rgba(255,255,255,0.9)]" />

        {/* Fixed Left Track Headers Column */}
        <div
          ref={headerRef}
          className="w-28 sm:w-32 flex-shrink-0 bg-[#121214] border-r border-zinc-800/80 z-20 flex flex-col text-xs font-semibold text-zinc-300 select-none"
        >
          {/* Row 1: Top Ruler Header spacing */}
          <div className="h-8 bg-[#141416] border-b border-zinc-800/80" />

          {/* Row 2: Video Track row spacing */}
          <div className="h-12 border-b border-zinc-800/60 flex items-center px-2 bg-[#121214]" />

          {/* Row 3: Subtitle Track row spacing */}
          <div className="h-12 border-b border-zinc-800/60 flex items-center px-2 bg-[#121214]" />

          {/* Row 4: Audio Track Header Badge (🎧 Audio ▾) */}
          <div className="h-12 border-b border-zinc-800/60 flex items-center px-2 bg-[#121214]">
            <button
              type="button"
              className="bg-[#28282d] hover:bg-[#34343a] border border-zinc-700/70 rounded-xl px-2.5 py-1.5 flex items-center space-x-1.5 text-white font-bold text-xs shadow-md cursor-pointer transition active:scale-95"
            >
              <Headphones className="w-4 h-4 text-white flex-shrink-0" />
              <span className="text-white font-bold text-xs">Audio</span>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-300 flex-shrink-0 ml-0.5" />
            </button>
          </div>

          {/* Row 5: Nhạc nền Track Header Badge (🎵 Nhạc nền) */}
          <div className="h-12 border-b border-zinc-800/60 flex items-center px-2 bg-[#121214]">
            <button
              type="button"
              className="bg-[#28282d] hover:bg-[#34343a] border border-zinc-700/70 rounded-xl px-2.5 py-1.5 flex items-center space-x-1.5 text-white font-bold text-xs shadow-md cursor-pointer transition active:scale-95"
            >
              <Music2 className="w-4 h-4 text-purple-400 fill-purple-400/20 flex-shrink-0" />
              <span className="text-white font-bold text-xs">Nhạc nền</span>
            </button>
          </div>
        </div>

        {/* Scrollable Right Tracks Canvas Area */}
        <div className="relative flex-1 min-w-0 overflow-hidden">
          <div
            ref={containerRef}
            onScroll={handleScroll}
            onMouseDown={handleMouseDown}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="w-full overflow-x-auto relative custom-scrollbar bg-[#0f0f11] min-h-[200px] touch-pan-x overscroll-x-none cursor-grab active:cursor-grabbing select-none"
            style={{ overscrollBehaviorX: 'contain' }}
          >
            <div
              ref={trackRef}
              onClick={handleTimelineClick}
              className="relative transition-all duration-75 box-border"
              style={{
                width: `${containerWidth * zoom + containerWidth}px`,
                paddingLeft: `${playheadOffset}px`,
                paddingRight: `${containerWidth - playheadOffset}px`,
              }}
            >
              {/* Inner Track Content Wrapper */}
              <div className="relative w-full">

                {/* ROW 1: TIME RULER (00:00, 00:02, etc. placed at start of each block) */}
                <div className="h-8 bg-[#141416] border-b border-zinc-800/80 relative overflow-hidden select-none">
                  {rulerTicks.map((tick, idx) => (
                    <React.Fragment key={idx}>
                      {/* Vertical Tick Line */}
                      <div
                        className="absolute top-0 h-2 w-px bg-zinc-500/80 pointer-events-none"
                        style={{ left: `${tick.startPercent}%` }}
                      />
                      {/* Tick Label placed at head of block, small font, left-aligned */}
                      <div
                        className={`absolute top-2 bottom-0 flex items-center pointer-events-none ${
                          tick.sec === 0 || tick.startPercent === 0
                            ? 'justify-start pl-1'
                            : 'justify-start -translate-x-1/2'
                        }`}
                        style={{ left: `${tick.startPercent}%` }}
                      >
                        <span className="text-[10px] font-mono text-zinc-400 font-medium whitespace-nowrap bg-[#141416]/90 px-0.5 rounded">
                          {tick.label}
                        </span>
                      </div>
                    </React.Fragment>
                  ))}
                </div>

                {/* ROW 2: VIDEO TRACK (Cyan Strip with Segment Cut Lines & File Label) */}
                <div className="h-12 bg-[#121214] border-b border-zinc-800/60 relative flex items-center px-0">
                  <div className="w-full h-11 bg-[#00a2e8] relative overflow-hidden flex items-center shadow-md">
                    {/* Dark vertical cut segment dividing lines (1 second per block) */}
                    <div className="absolute inset-0 flex pointer-events-none overflow-hidden">
                      {Array.from({ length: Math.min(600, Math.ceil(safeDuration)) }).map((_, i) => (
                        <div
                          key={i}
                          className="h-full border-r border-[#0d0d10]/90 flex-shrink-0"
                          style={{ width: `${(1 / safeDuration) * 100}%` }}
                        />
                      ))}
                    </div>

                    {/* Translucent Dark Badge containing Video Filename */}
                    <div className="relative z-10 bg-[#18181c]/90 border border-zinc-700/60 px-3 py-1 rounded-lg text-xs font-semibold text-white shadow-md flex items-center space-x-1.5 ml-4 max-w-[80%] truncate pointer-events-none">
                      <span className="truncate">{videoTitle || 'imported_video_1785328015414.mp4'}</span>
                    </div>
                  </div>
                </div>

                {/* ROW 3: SUBTITLE TRACK (Golden Orange Rounded Rectangles) */}
                <div className="h-12 bg-[#121214] border-b border-zinc-800/60 relative flex items-center">
                  {subtitles.map((sub) => {
                    const startPct = Math.max(0, Math.min(100, (sub.startTime / safeDuration) * 100));
                    const endPct = Math.max(0, Math.min(100, (sub.endTime / safeDuration) * 100));
                    const widthPct = Math.max(0.8, endPct - startPct);

                    const isSelected = selectedSubtitleId === sub.id;
                    const isCurrentlyActive = currentTime >= sub.startTime && currentTime <= sub.endTime;

                    return (
                      <div
                        key={sub.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSeek(sub.startTime);
                          if (onSelectSubtitle) onSelectSubtitle(sub);
                        }}
                        onMouseDown={(e) => handleStartDragHandle(e, sub, 'move')}
                        onTouchStart={(e) => handleStartDragHandle(e, sub, 'move')}
                        className={`absolute top-0.5 bottom-0.5 rounded-lg text-xs font-bold px-2.5 flex items-center justify-between transition-all cursor-grab active:cursor-grabbing ${
                          isSelected
                            ? 'bg-[#d87d00] text-white border-2 border-white ring-2 ring-amber-400 z-30 font-extrabold shadow-2xl'
                            : isCurrentlyActive
                            ? 'bg-[#d87d00] text-white border border-amber-300 ring-1 ring-amber-400 z-20 shadow-md'
                            : 'bg-[#d87d00] hover:bg-[#e88800] text-white border border-amber-500/40'
                        }`}
                        style={{
                          left: `${startPct}%`,
                          width: `calc(${widthPct}% - 2px)`,
                        }}
                        title={`[${formatMMSS(sub.startTime)} - ${formatMMSS(sub.endTime)}]: ${
                          sub.translatedText || sub.originalText
                        }`}
                      >
                        {/* Left White Drag Handle */}
                        {isSelected && (
                          <div
                            onMouseDown={(e) => handleStartDragHandle(e, sub, 'left')}
                            onTouchStart={(e) => handleStartDragHandle(e, sub, 'left')}
                            className="absolute -left-3 top-0 bottom-0 w-3.5 bg-white rounded-l-md border-r border-zinc-300 shadow-xl flex items-center justify-center cursor-ew-resize z-40 touch-none active:bg-sky-100 transition-transform"
                            title="Kéo mốc bắt đầu phụ đề"
                          >
                            <div className="w-1 h-3.5 bg-zinc-900 rounded-full" />
                          </div>
                        )}

                        {/* Subtitle Text Content */}
                        <span className="truncate select-none pointer-events-none text-xs font-semibold text-white">
                          {sub.translatedText || sub.originalText}
                        </span>

                        {/* Right White Drag Handle */}
                        {isSelected && (
                          <div
                            onMouseDown={(e) => handleStartDragHandle(e, sub, 'right')}
                            onTouchStart={(e) => handleStartDragHandle(e, sub, 'right')}
                            className="absolute -right-3 top-0 bottom-0 w-3.5 bg-white rounded-r-md border-l border-zinc-300 shadow-xl flex items-center justify-center cursor-ew-resize z-40 touch-none active:bg-sky-100 transition-transform"
                            title="Kéo mốc kết thúc phụ đề"
                          >
                            <div className="w-1 h-3.5 bg-zinc-900 rounded-full" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* ROW 4: AUDIO TRACK LANE (Dark Lane matching Audio Header) */}
                <div className="h-12 bg-[#121214] border-b border-zinc-800/60 relative flex items-center">
                  {subtitles.map((sub) => {
                    const startPct = Math.max(0, Math.min(100, (sub.startTime / safeDuration) * 100));
                    const endPct = Math.max(0, Math.min(100, (sub.endTime / safeDuration) * 100));
                    const widthPct = Math.max(0.8, endPct - startPct);

                    const hasAudio = Boolean(sub.audioUrl);
                    const isCurrentlyActive = currentTime >= sub.startTime && currentTime <= sub.endTime;

                    return (
                      <div
                        key={`dub-${sub.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSeek(sub.startTime);
                          if (onSelectSubtitle) onSelectSubtitle(sub);
                          if (onPlayTTS) onPlayTTS(sub.translatedText || sub.originalText);
                        }}
                        className={`absolute top-1 bottom-1 rounded-lg text-xs font-semibold px-2 flex items-center justify-between transition-all cursor-pointer hover:scale-[1.01] active:scale-95 ${
                          hasAudio
                            ? isCurrentlyActive
                              ? 'bg-emerald-500 text-zinc-950 border-2 border-white ring-2 ring-emerald-300 z-30 shadow-lg font-bold'
                              : 'bg-emerald-600/90 hover:bg-emerald-500 text-white border border-emerald-400/60 z-20 shadow-xs'
                            : 'bg-zinc-800/40 hover:bg-zinc-800/70 text-zinc-400 border border-dashed border-zinc-700/50'
                        }`}
                        style={{
                          left: `${startPct}%`,
                          width: `calc(${widthPct}% - 2px)`,
                        }}
                        title={
                          hasAudio
                            ? `[Audio] ${sub.translatedText || sub.originalText}`
                            : `[Audio Dubbing] Click để phát TTS`
                        }
                      >
                        <div className="flex items-center space-x-1.5 truncate select-none pointer-events-none">
                          <Volume2 className={`w-3.5 h-3.5 flex-shrink-0 ${hasAudio ? 'text-white animate-pulse' : 'text-zinc-500'}`} />
                          <span className="truncate text-xs font-medium">
                            {hasAudio ? (sub.translatedText || sub.originalText) : 'Audio'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ROW 5: NHẠC NỀN TRACK LANE (Dark Purple Tinted Lane matching Nhạc nền Header) */}
                <div className="h-12 bg-[#1a0e24]/90 border-b border-zinc-800/60 relative flex items-center px-1">
                  <div className="w-full h-9 bg-purple-950/40 border border-purple-500/20 rounded-lg flex items-center px-2 overflow-hidden">
                    <div className="w-full h-full flex items-center justify-between opacity-50">
                      {Array.from({ length: 60 }).map((_, i) => {
                        const hP = 25 + Math.sin(i * 0.7) * 45 + (i % 4) * 10;
                        return (
                          <div
                            key={i}
                            className="w-0.5 bg-purple-400 rounded-full"
                            style={{ height: `${hP}%` }}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
