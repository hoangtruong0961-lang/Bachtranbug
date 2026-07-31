import React, { useState } from 'react';
import {
  Palette,
  Eye,
  Type,
  MoveHorizontal,
  MoveVertical,
  Bold,
  Italic,
  RotateCcw,
  Sliders,
  Sparkles,
  Check,
  Box,
  Layers,
} from 'lucide-react';
import { SubtitleStyleConfig } from '../types';

interface SubtitleStylingPanelProps {
  styleConfig: SubtitleStyleConfig;
  onChangeStyle: (newStyle: SubtitleStyleConfig) => void;
}

const TEXT_COLOR_PRESETS = [
  { name: 'Trắng', hex: '#ffffff' },
  { name: 'Vàng Nổi', hex: '#facc15' },
  { name: 'Xanh Cyan', hex: '#22d3ee' },
  { name: 'Lục Xanh', hex: '#4ade80' },
  { name: 'Hồng Sunset', hex: '#f472b6' },
  { name: 'Cam Sáng', hex: '#fb923c' },
  { name: 'Đỏ Nổi', hex: '#f87171' },
  { name: 'Đen Tuyền', hex: '#000000' },
];

const OUTLINE_COLOR_PRESETS = [
  { name: 'Đen Tuyền', hex: '#000000' },
  { name: 'Xám Đen', hex: '#0f172a' },
  { name: 'Xám Đậm', hex: '#334155' },
  { name: 'Trắng Viền', hex: '#ffffff' },
  { name: 'Đỏ Viền', hex: '#dc2626' },
  { name: 'Hổ Phách', hex: '#d97706' },
  { name: 'Xanh Dương', hex: '#2563eb' },
];

const BG_COLOR_PRESETS = [
  { name: 'Đen Tuyền', hex: '#000000' },
  { name: 'Xám Đêm', hex: '#0f172a' },
  { name: 'Chàm Đậm', hex: '#1e1b4b' },
  { name: 'Xanh Lục Bảo', hex: '#064e3b' },
  { name: 'Đỏ Rượu', hex: '#4c0519' },
  { name: 'Tím Đêm', hex: '#3b0764' },
];

const FONT_FAMILIES = [
  { label: 'Sans-Serif (Mặc định - Chuẩn HD)', value: 'system-ui, sans-serif' },
  { label: 'Plus Jakarta Sans (Hiện đại)', value: "'Plus Jakarta Sans', sans-serif" },
  { label: 'Roboto (Gọn gàng)', value: "'Roboto', sans-serif" },
  { label: 'Arial (Thanh thoát)', value: "'Arial', sans-serif" },
  { label: 'Impact (Đậm nét điện ảnh)', value: "'Impact', sans-serif" },
  { label: 'Serif (Cổ điển & Nghệ thuật)', value: 'serif' },
  { label: 'Playfair Display (Sang trọng)', value: "'Playfair Display', serif" },
  { label: 'Monospace (Giao diện Code)', value: 'monospace' },
];

export const SubtitleStylingPanel: React.FC<SubtitleStylingPanelProps> = ({
  styleConfig,
  onChangeStyle,
}) => {
  const [previewText, setPreviewText] = useState<string>(
    'Xin chào! Đây là mẫu phụ đề xem trước trực tiếp.'
  );
  const [previewBgMode, setPreviewBgMode] = useState<'dark' | 'bright' | 'pattern'>('dark');

  // Convert hex to RGBA string for live preview
  const getRgba = (hexColor: string, opacityPercent: number = 65) => {
    if (!hexColor) return `rgba(0, 0, 0, ${opacityPercent / 100})`;
    if (hexColor.startsWith('rgba')) return hexColor;
    let hex = hexColor.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map((x) => x + x).join('');
    const num = parseInt(hex, 16);
    if (isNaN(num)) return `rgba(0, 0, 0, ${opacityPercent / 100})`;
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${(opacityPercent / 100).toFixed(2)})`;
  };

  const handleResetToDefault = () => {
    onChangeStyle({
      fontSize: 16,
      fontColor: '#ffffff',
      backgroundColor: '#000000',
      bgOpacity: 65,
      borderRadius: 8,
      fontWeight: 'bold',
      fontStyle: 'normal',
      textTransform: 'normal',
      outlineColor: '#000000',
      padding: 6,
      position: 'bottom',
      bottomOffsetPercentage: 10,
      textOutline: true,
      fontFamily: 'system-ui, sans-serif',
      orientation: 'horizontal',
      maxCharsHorizontal: 65,
      maxCharsVertical: 36,
      hasBackground: false,
    });
  };

  const outlineCol = styleConfig.outlineColor || '#000000';
  const textShadowStyle = styleConfig.textOutline !== false
    ? `-1px -1px 0 ${outlineCol}, 1px -1px 0 ${outlineCol}, -1px 1px 0 ${outlineCol}, 1px 1px 0 ${outlineCol}, 0 2px 6px rgba(0,0,0,0.9)`
    : '0 2px 6px rgba(0,0,0,0.9)';

  const textCasingCss = styleConfig.textTransform === 'uppercase'
    ? 'uppercase'
    : styleConfig.textTransform === 'lowercase'
    ? 'lowercase'
    : styleConfig.textTransform === 'capitalize'
    ? 'capitalize'
    : 'none';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col gap-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-800 pb-4 gap-3">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
            <Palette className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">Cấu Hình Custom Block Phụ Đề</h2>
            <p className="text-xs text-slate-400">Tùy chỉnh màu sắc, viền, nền, font chữ và kiểu hiển thị chuyên nghiệp</p>
          </div>
        </div>

        <button
          onClick={handleResetToDefault}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition border border-slate-700"
          title="Đặt lại cài đặt mặc định (Cỡ chữ 16px, Trắng viền Đen)"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Mặc Định (Chữ Trắng - Viền Đen)</span>
        </button>
      </div>

      {/* 1. Interactive Live Subtitle Preview Box */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3 shadow-inner">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
          <div className="flex items-center space-x-2">
            <Eye className="w-4 h-4 text-amber-400" />
            <span>Xem Trước Trực Tiếp Mẫu Phụ Đề (Live Preview)</span>
          </div>

          <div className="flex items-center space-x-1.5 bg-slate-900 p-1 rounded-lg border border-slate-800 text-[11px]">
            <span className="text-slate-400 px-1">Nền thử:</span>
            <button
              onClick={() => setPreviewBgMode('dark')}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                previewBgMode === 'dark' ? 'bg-slate-800 text-amber-400 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Nền Tối
            </button>
            <button
              onClick={() => setPreviewBgMode('bright')}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                previewBgMode === 'bright' ? 'bg-amber-400 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Nền Sáng
            </button>
            <button
              onClick={() => setPreviewBgMode('pattern')}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                previewBgMode === 'pattern' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Video Mẫu
            </button>
          </div>
        </div>

        {/* Live Preview Screen Container */}
        <div
          className={`relative h-32 sm:h-36 rounded-xl border border-slate-800 flex items-center justify-center p-4 overflow-hidden transition-all ${
            previewBgMode === 'bright'
              ? 'bg-gradient-to-br from-amber-100 via-sky-100 to-emerald-100 text-slate-900'
              : previewBgMode === 'pattern'
              ? 'bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:16px_16px] bg-slate-900'
              : 'bg-slate-950'
          }`}
        >
          {previewBgMode === 'pattern' && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 pointer-events-none" />
          )}

          {/* Subtitle Element Rendered inside Preview */}
          <div className="relative z-10 max-w-full text-center px-2">
            <span
              className="inline-block transition-all whitespace-pre-line leading-snug"
              style={{
                fontSize: `${styleConfig.fontSize || 16}px`,
                fontWeight: styleConfig.fontWeight || 'bold',
                fontStyle: styleConfig.fontStyle || 'normal',
                textTransform: textCasingCss as any,
                fontFamily: styleConfig.fontFamily || 'system-ui, sans-serif',
                color: styleConfig.fontColor || '#ffffff',
                backgroundColor: styleConfig.hasBackground === true
                  ? getRgba(styleConfig.backgroundColor || '#000000', styleConfig.bgOpacity ?? 65)
                  : 'transparent',
                borderRadius: `${styleConfig.borderRadius ?? 8}px`,
                padding: styleConfig.hasBackground === true ? `${styleConfig.padding || 6}px` : '0px',
                textShadow: textShadowStyle,
                writingMode: styleConfig.orientation === 'vertical' ? 'vertical-rl' : 'horizontal-tb',
                textOrientation: styleConfig.orientation === 'vertical' ? 'upright' : undefined,
              }}
            >
              {previewText || 'Mẫu phụ đề xem trước'}
            </span>
          </div>
        </div>

        {/* Editable Sample Text Input */}
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={previewText}
            onChange={(e) => setPreviewText(e.target.value)}
            placeholder="Nhập nội dung phụ đề thử nghiệm..."
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-400 placeholder:text-slate-500"
          />
        </div>
      </div>

      {/* 2. Color Palette & Block Styling Settings */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center space-x-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
          <Sliders className="w-4 h-4" />
          <span>Bảng Màu & Khối Nền Phụ Đề</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Màu Chữ (Font Color) */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200">Màu Chữ (Text Color)</span>
              <div className="flex items-center space-x-1.5">
                <span className="font-mono text-[11px] text-amber-400 font-bold">{styleConfig.fontColor || '#ffffff'}</span>
                <input
                  type="color"
                  value={styleConfig.fontColor || '#ffffff'}
                  onChange={(e) => onChangeStyle({ ...styleConfig, fontColor: e.target.value })}
                  className="w-6 h-6 rounded border-0 bg-transparent cursor-pointer"
                  title="Chọn màu tùy chỉnh"
                />
              </div>
            </div>

            {/* Color Swatch Presets */}
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              {TEXT_COLOR_PRESETS.map((color) => (
                <button
                  key={color.hex}
                  onClick={() => onChangeStyle({ ...styleConfig, fontColor: color.hex })}
                  className={`h-7 rounded-lg border transition flex items-center justify-center ${
                    (styleConfig.fontColor || '#ffffff').toLowerCase() === color.hex.toLowerCase()
                      ? 'border-amber-400 ring-2 ring-amber-400/40 scale-105 z-10'
                      : 'border-slate-800 hover:border-slate-600'
                  }`}
                  style={{ backgroundColor: color.hex }}
                  title={color.name}
                >
                  {(styleConfig.fontColor || '#ffffff').toLowerCase() === color.hex.toLowerCase() && (
                    <Check
                      className={`w-3.5 h-3.5 ${
                        color.hex === '#ffffff' || color.hex === '#facc15' || color.hex === '#22d3ee' || color.hex === '#4ade80'
                          ? 'text-slate-950'
                          : 'text-white'
                      }`}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Màu Viền Chữ (Outline / Stroke Color) */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={styleConfig.textOutline !== false}
                  onChange={(e) => onChangeStyle({ ...styleConfig, textOutline: e.target.checked })}
                  className="accent-amber-400 w-3.5 h-3.5 rounded"
                />
                <span className="text-xs font-semibold text-slate-200">Viền Chữ (Outline)</span>
              </label>
              <div className="flex items-center space-x-1.5">
                <span className="font-mono text-[11px] text-amber-400 font-bold">{styleConfig.outlineColor || '#000000'}</span>
                <input
                  type="color"
                  value={styleConfig.outlineColor || '#000000'}
                  onChange={(e) => onChangeStyle({ ...styleConfig, outlineColor: e.target.value, textOutline: true })}
                  className="w-6 h-6 rounded border-0 bg-transparent cursor-pointer"
                  title="Chọn màu viền tùy chỉnh"
                />
              </div>
            </div>

            {/* Outline Color Swatch Presets */}
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              {OUTLINE_COLOR_PRESETS.map((color) => (
                <button
                  key={color.hex}
                  onClick={() => onChangeStyle({ ...styleConfig, outlineColor: color.hex, textOutline: true })}
                  className={`h-7 rounded-lg border transition flex items-center justify-center ${
                    (styleConfig.outlineColor || '#000000').toLowerCase() === color.hex.toLowerCase() && styleConfig.textOutline !== false
                      ? 'border-amber-400 ring-2 ring-amber-400/40 scale-105 z-10'
                      : 'border-slate-800 hover:border-slate-600'
                  }`}
                  style={{ backgroundColor: color.hex }}
                  title={color.name}
                >
                  {(styleConfig.outlineColor || '#000000').toLowerCase() === color.hex.toLowerCase() && styleConfig.textOutline !== false && (
                    <Check className={`w-3.5 h-3.5 ${color.hex === '#ffffff' ? 'text-slate-950' : 'text-white'}`} />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Màu Nền Phụ Đề (Background Box Color) */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={styleConfig.hasBackground === true}
                  onChange={(e) => onChangeStyle({ ...styleConfig, hasBackground: e.target.checked })}
                  className="accent-amber-400 w-3.5 h-3.5 rounded"
                />
                <span className="text-xs font-semibold text-slate-200">Bật Khối Nền (Background)</span>
              </label>
              <div className="flex items-center space-x-1.5">
                <input
                  type="color"
                  value={
                    styleConfig.backgroundColor && styleConfig.backgroundColor.startsWith('#')
                      ? styleConfig.backgroundColor
                      : '#000000'
                  }
                  onChange={(e) =>
                    onChangeStyle({
                      ...styleConfig,
                      backgroundColor: e.target.value,
                      hasBackground: true,
                    })
                  }
                  className="w-6 h-6 rounded border-0 bg-transparent cursor-pointer"
                  title="Chọn màu nền tùy chỉnh"
                />
              </div>
            </div>

            {/* Background Color Swatch Presets */}
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              {BG_COLOR_PRESETS.map((color) => (
                <button
                  key={color.hex}
                  onClick={() => onChangeStyle({ ...styleConfig, backgroundColor: color.hex, hasBackground: true })}
                  className={`h-7 rounded-lg border transition flex items-center justify-center ${
                    (styleConfig.backgroundColor || '#000000').toLowerCase() === color.hex.toLowerCase() && styleConfig.hasBackground === true
                      ? 'border-amber-400 ring-2 ring-amber-400/40 scale-105 z-10'
                      : 'border-slate-800 hover:border-slate-600'
                  }`}
                  style={{ backgroundColor: color.hex }}
                  title={color.name}
                >
                  {(styleConfig.backgroundColor || '#000000').toLowerCase() === color.hex.toLowerCase() && styleConfig.hasBackground === true && (
                    <Check className="w-3.5 h-3.5 text-white" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Sliders cho Nền phụ đề (Độ mờ + Độ bo góc) */}
        {styleConfig.hasBackground === true && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/80">
            {/* Slider Độ mờ nền (Opacity) */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs font-semibold text-slate-300">
                <span>Độ Mờ / Trong Suốt Khối Nền:</span>
                <span className="font-mono text-amber-400 font-bold">{styleConfig.bgOpacity ?? 65}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={styleConfig.bgOpacity ?? 65}
                onChange={(e) =>
                  onChangeStyle({ ...styleConfig, bgOpacity: parseInt(e.target.value, 10) })
                }
                className="w-full accent-amber-400 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>0% (Trong suốt)</span>
                <span>50%</span>
                <span>100% (Đặc hoàn toàn)</span>
              </div>
            </div>

            {/* Slider Độ bo góc (Corner Radius) */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs font-semibold text-slate-300">
                <span>Độ Bo Góc Khối Nền (Border Radius):</span>
                <span className="font-mono text-amber-400 font-bold">{styleConfig.borderRadius ?? 8}px</span>
              </div>
              <input
                type="range"
                min="0"
                max="24"
                value={styleConfig.borderRadius ?? 8}
                onChange={(e) =>
                  onChangeStyle({ ...styleConfig, borderRadius: parseInt(e.target.value, 10) })
                }
                className="w-full accent-amber-400 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>0px (Vuông góc)</span>
                <span>8px (Góc bo vừa)</span>
                <span>24px (Bo tròn mượt)</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Typography & Formatting Options */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center space-x-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
          <Type className="w-4 h-4" />
          <span>Kiểu Chữ & Cỡ Chữ (Typography)</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Cỡ chữ (Font Size) - Default 16px */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-col gap-2">
            <div className="flex justify-between items-center text-xs font-semibold text-slate-200">
              <span>Cỡ Chữ (Font Size)</span>
              <span className="font-mono text-amber-400 font-bold">{styleConfig.fontSize || 16}px</span>
            </div>
            <input
              type="range"
              min="10"
              max="60"
              value={styleConfig.fontSize || 16}
              onChange={(e) =>
                onChangeStyle({ ...styleConfig, fontSize: parseInt(e.target.value, 10) })
              }
              className="w-full accent-amber-400 cursor-pointer"
            />
            {/* Quick Font Size Buttons */}
            <div className="flex items-center justify-between gap-1 pt-1">
              {[14, 16, 18, 22, 28].map((size) => (
                <button
                  key={size}
                  onClick={() => onChangeStyle({ ...styleConfig, fontSize: size })}
                  className={`flex-1 py-1 rounded text-[11px] font-mono border transition ${
                    (styleConfig.fontSize || 16) === size
                      ? 'bg-amber-500/20 text-amber-400 border-amber-400 font-bold'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  {size}px
                </button>
              ))}
            </div>
          </div>

          {/* Định Dạng In Đậm / In Nghiêng */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-col gap-2">
            <span className="text-xs font-semibold text-slate-200">Định Dạng Văn Bản</span>
            <div className="grid grid-cols-2 gap-2 pt-0.5">
              <button
                onClick={() =>
                  onChangeStyle({
                    ...styleConfig,
                    fontWeight: (styleConfig.fontWeight || 'bold') === 'bold' ? 'normal' : 'bold',
                  })
                }
                className={`py-2 px-3 rounded-lg border text-xs font-bold flex items-center justify-center space-x-1.5 transition ${
                  (styleConfig.fontWeight || 'bold') === 'bold'
                    ? 'bg-amber-500/20 text-amber-400 border-amber-400 shadow-sm'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                <Bold className="w-4 h-4" />
                <span>In Đậm (Bold)</span>
              </button>

              <button
                onClick={() =>
                  onChangeStyle({
                    ...styleConfig,
                    fontStyle: styleConfig.fontStyle === 'italic' ? 'normal' : 'italic',
                  })
                }
                className={`py-2 px-3 rounded-lg border text-xs font-bold flex items-center justify-center space-x-1.5 transition ${
                  styleConfig.fontStyle === 'italic'
                    ? 'bg-amber-500/20 text-amber-400 border-amber-400 shadow-sm'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                <Italic className="w-4 h-4" />
                <span>In Nghiêng</span>
              </button>
            </div>
          </div>

          {/* Viết Hoa / Thường (Text Case) */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-col gap-2 col-span-1 sm:col-span-2 lg:col-span-1">
            <span className="text-xs font-semibold text-slate-200">Kiểu Chữ Hoa / Thường</span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => onChangeStyle({ ...styleConfig, textTransform: 'normal' })}
                className={`py-1.5 px-2 rounded-lg text-[11px] font-medium border text-center transition ${
                  (!styleConfig.textTransform || styleConfig.textTransform === 'normal')
                    ? 'bg-amber-500/20 text-amber-400 border-amber-400 font-bold'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                Gốc / Thường
              </button>

              <button
                onClick={() => onChangeStyle({ ...styleConfig, textTransform: 'uppercase' })}
                className={`py-1.5 px-2 rounded-lg text-[11px] font-bold uppercase border text-center transition ${
                  styleConfig.textTransform === 'uppercase'
                    ? 'bg-amber-500/20 text-amber-400 border-amber-400 font-bold'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                IN HOA ALL
              </button>

              <button
                onClick={() => onChangeStyle({ ...styleConfig, textTransform: 'lowercase' })}
                className={`py-1.5 px-2 rounded-lg text-[11px] font-medium lowercase border text-center transition ${
                  styleConfig.textTransform === 'lowercase'
                    ? 'bg-amber-500/20 text-amber-400 border-amber-400 font-bold'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                in thường
              </button>

              <button
                onClick={() => onChangeStyle({ ...styleConfig, textTransform: 'capitalize' })}
                className={`py-1.5 px-2 rounded-lg text-[11px] font-medium capitalize border text-center transition ${
                  styleConfig.textTransform === 'capitalize'
                    ? 'bg-amber-500/20 text-amber-400 border-amber-400 font-bold'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                Hoa Đầu Từ
              </button>
            </div>
          </div>
        </div>

        {/* Font Family & Orientation Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Font Family */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300">Font Chữ (Typography Family)</label>
            <select
              value={styleConfig.fontFamily || 'system-ui, sans-serif'}
              onChange={(e) => onChangeStyle({ ...styleConfig, fontFamily: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
            >
              {FONT_FAMILIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          {/* Hướng Chữ: Ngang / Dọc */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>Hướng Chữ Hiển Thị</span>
              <span className="text-[10px] text-amber-400 font-mono">
                {styleConfig.orientation === 'vertical' ? 'Chữ Dọc (Vertical)' : 'Chữ Ngang (Horizontal)'}
              </span>
            </label>
            <div className="grid grid-cols-2 gap-2 pt-0.5">
              <button
                onClick={() => onChangeStyle({ ...styleConfig, orientation: 'horizontal' })}
                className={`py-1.5 px-3 rounded-lg text-xs font-bold border flex items-center justify-center space-x-1.5 transition ${
                  (styleConfig.orientation || 'horizontal') === 'horizontal'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                <MoveHorizontal className="w-3.5 h-3.5" />
                <span>Chữ Ngang</span>
              </button>
              <button
                onClick={() => onChangeStyle({ ...styleConfig, orientation: 'vertical' })}
                className={`py-1.5 px-3 rounded-lg text-xs font-bold border flex items-center justify-center space-x-1.5 transition ${
                  styleConfig.orientation === 'vertical'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                <MoveVertical className="w-3.5 h-3.5" />
                <span>Chữ Dọc</span>
              </button>
            </div>
          </div>
        </div>

        {/* Tự động Ngắt Dòng (Max Characters) */}
        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-col gap-2">
          <span className="text-xs font-semibold text-slate-300">Tự Động Xuống Dòng (Max Chars Line Limits)</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 space-y-1">
              <div className="flex justify-between text-xs text-slate-300">
                <span>Dòng Ngang Tối Đa:</span>
                <span className="font-mono text-amber-400 font-bold">{styleConfig.maxCharsHorizontal || 65} ký tự</span>
              </div>
              <input
                type="range"
                min="10"
                max="120"
                value={styleConfig.maxCharsHorizontal || 65}
                onChange={(e) =>
                  onChangeStyle({ ...styleConfig, maxCharsHorizontal: parseInt(e.target.value, 10) })
                }
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>

            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 space-y-1">
              <div className="flex justify-between text-xs text-slate-300">
                <span>Dòng Dọc Tối Đa:</span>
                <span className="font-mono text-amber-400 font-bold">{styleConfig.maxCharsVertical || 36} ký tự</span>
              </div>
              <input
                type="range"
                min="5"
                max="60"
                value={styleConfig.maxCharsVertical || 36}
                onChange={(e) =>
                  onChangeStyle({ ...styleConfig, maxCharsVertical: parseInt(e.target.value, 10) })
                }
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

