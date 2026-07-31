import * as ort from 'onnxruntime-web';
import { getModelBufferDB, storeModelBufferDB, deleteModelBufferDB } from './idbStorage';

export interface LocalFrameItem {
  image: string; // base64 or data URL
  timestamp: number;
}

export interface LocalOcrResult {
  startTime: number;
  endTime: number;
  originalText: string;
  sourceLang: string;
}

export interface PaddleOcrModelStatus {
  isReady: boolean;
  detLoaded: boolean;
  recLoaded: boolean;
  modelName: string;
  detSizeMB?: string;
  recSizeMB?: string;
  downloadProgress?: number;
  downloadMessage?: string;
}

// Global ONNX Session cache
let onnxDetSession: ort.InferenceSession | null = null;
let onnxRecSession: ort.InferenceSession | null = null;
let isSessionLoading = false;

// Default backend proxy endpoints or direct CDN URLs for PaddleOCR PP-OCRv4/v6 ONNX weights
const DET_MODEL_URL = '/api/paddle-models/det';
const REC_MODEL_URL = '/api/paddle-models/rec';

/**
 * Check if PaddleOCR ONNX models are present in IndexedDB or memory
 */
export async function checkPaddleOcrModelStatus(): Promise<PaddleOcrModelStatus> {
  if (onnxDetSession || onnxRecSession) {
    return {
      isReady: true,
      detLoaded: !!onnxDetSession,
      recLoaded: !!onnxRecSession,
      modelName: 'PP-OCRv4/v6 ONNX (Đã load trong bộ nhớ)',
    };
  }

  const detBuf = await getModelBufferDB('paddleocr_det');
  const recBuf = await getModelBufferDB('paddleocr_rec');

  // Valid ONNX models for PP-OCR are at least 100KB+
  const detLoaded = !!detBuf && detBuf.byteLength > 100000;
  const recLoaded = !!recBuf && recBuf.byteLength > 100000;
  const isReady = detLoaded || recLoaded;

  return {
    isReady,
    detLoaded,
    recLoaded,
    modelName: isReady ? 'PP-OCRv4 Local ONNX (Đã lưu trong IndexedDB)' : 'Chưa tải Model PaddleOCR',
    detSizeMB: detBuf && detBuf.byteLength > 100000 ? (detBuf.byteLength / (1024 * 1024)).toFixed(2) + ' MB' : undefined,
    recSizeMB: recBuf && recBuf.byteLength > 100000 ? (recBuf.byteLength / (1024 * 1024)).toFixed(2) + ' MB' : undefined,
  };
}

/**
 * Initializes local ONNX Runtime Web session from IndexedDB or ArrayBuffers
 */
export async function initLocalOnnxEngine(): Promise<boolean> {
  if (onnxDetSession || onnxRecSession) return true;
  if (isSessionLoading) return false;

  isSessionLoading = true;
  try {
    // Configure ONNX Runtime Web env (SIMD & Multi-threading with CPU logical processors count)
    try {
      const logicalCores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
      ort.env.wasm.simd = true;
      try {
        ort.env.wasm.numThreads = Math.min(Math.max(1, logicalCores), 8);
      } catch (_e) {
        ort.env.wasm.numThreads = 1;
      }
      ort.env.wasm.proxy = false;
      ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/';
      console.log(`[ONNX WASM Environment] SIMD: enabled | numThreads: ${ort.env.wasm.numThreads} (CPU Cores: ${logicalCores})`);
    } catch (e) {
      console.warn('ONNX WASM env setup note:', e);
    }

    const detBuf = await getModelBufferDB('paddleocr_det');
    const recBuf = await getModelBufferDB('paddleocr_rec');

    if (detBuf && detBuf.byteLength > 100000) {
      try {
        onnxDetSession = await ort.InferenceSession.create(detBuf, {
          executionProviders: ['webgpu', 'webgl', 'wasm'],
          graphOptimizationLevel: 'all',
        });
        console.log('[ONNX Web] Loaded PaddleOCR Detection model (WebGPU acceleration) from IndexedDB.');
      } catch (e) {
        console.warn('Failed to parse detection model session, clearing invalid cache:', e);
        await deleteModelBufferDB('paddleocr_det');
      }
    } else if (detBuf) {
      // Clear legacy/corrupted dummy buffer
      await deleteModelBufferDB('paddleocr_det');
    }

    if (recBuf && recBuf.byteLength > 100000) {
      try {
        onnxRecSession = await ort.InferenceSession.create(recBuf, {
          executionProviders: ['webgpu', 'webgl', 'wasm'],
          graphOptimizationLevel: 'all',
        });
        console.log('[ONNX Web] Loaded PaddleOCR Recognition model (WebGPU acceleration) from IndexedDB.');
      } catch (e) {
        console.warn('Failed to parse recognition model session, clearing invalid cache:', e);
        await deleteModelBufferDB('paddleocr_rec');
      }
    } else if (recBuf) {
      // Clear legacy/corrupted dummy buffer
      await deleteModelBufferDB('paddleocr_rec');
    }

    return !!(onnxDetSession || onnxRecSession);
  } catch (err) {
    console.warn('[ONNX Runtime Web] Could not load ONNX session directly:', err);
    return false;
  } finally {
    isSessionLoading = false;
  }
}

/**
 * Download PaddleOCR models directly with progress tracking
 */
export async function downloadPaddleOcrModels(
  onProgress?: (percent: number, msg: string) => void
): Promise<boolean> {
  try {
    if (onProgress) onProgress(5, 'Đang kết nối server proxy tải Model PaddleOCR v6 (ONNX)...');

    const fetchWithProgress = async (proxyUrl: string, name: string, startPct: number, endPct: number) => {
      const isDet = name.toLowerCase().includes('detection') || proxyUrl.includes('det');
      const fallbackUrls = [
        proxyUrl,
        isDet
          ? 'https://media.githubusercontent.com/media/hiroi-sora/PaddleOCR-json/main/resources/models/ch_PP-OCRv4_det_infer.onnx'
          : 'https://media.githubusercontent.com/media/hiroi-sora/PaddleOCR-json/main/resources/models/ch_PP-OCRv4_rec_infer.onnx',
        isDet
          ? 'https://cdn.jsdelivr.net/gh/hiroi-sora/PaddleOCR-json@main/resources/models/ch_PP-OCRv4_det_infer.onnx'
          : 'https://cdn.jsdelivr.net/gh/hiroi-sora/PaddleOCR-json@main/resources/models/ch_PP-OCRv4_rec_infer.onnx',
      ];

      let lastError: any = null;
      for (const rawUrl of fallbackUrls) {
        const targetUrl = rawUrl.includes('huggingface.co') && rawUrl.includes('/blob/')
          ? rawUrl.replace('/blob/', '/resolve/')
          : rawUrl;
        try {
          const response = await fetch(targetUrl);
          if (!response.ok) continue;

          const contentLength = +(response.headers.get('Content-Length') || '0');
          const reader = response.body?.getReader();

          if (!reader) {
            const buf = await response.arrayBuffer();
            if (buf.byteLength >= 100000) return buf;
            continue;
          }

          let receivedLength = 0;
          const chunks: Uint8Array[] = [];

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            receivedLength += value.length;

            if (contentLength && onProgress) {
              const pct = Math.round(startPct + (receivedLength / contentLength) * (endPct - startPct));
              const mb = (receivedLength / (1024 * 1024)).toFixed(1);
              onProgress(pct, `Đang tải ${name}: ${mb} MB...`);
            }
          }

          const allChunks = new Uint8Array(receivedLength);
          let position = 0;
          for (const chunk of chunks) {
            allChunks.set(chunk, position);
            position += chunk.length;
          }

          if (allChunks.buffer.byteLength >= 100000) {
            return allChunks.buffer;
          }
        } catch (e) {
          lastError = e;
        }
      }

      throw new Error(`Không thể tải tệp ${name} từ bất kỳ nguồn nào. Chi tiết: ${String(lastError || 'Server trả về dữ liệu rỗng')}`);
    };

    if (onProgress) onProgress(10, 'Đang tải PaddleOCR Detection Model (det)...');
    const detBuffer = await fetchWithProgress(DET_MODEL_URL, 'Detection (Mô hình nhận diện vị trí)', 10, 50);

    if (onProgress) onProgress(50, 'Đang tải PaddleOCR Recognition Model (rec)...');
    const recBuffer = await fetchWithProgress(REC_MODEL_URL, 'Recognition (Mô hình đọc chữ)', 50, 90);

    if (onProgress) onProgress(92, 'Đang lưu Model vào bộ nhớ trình duyệt IndexedDB...');
    await storeModelBufferDB('paddleocr_det', detBuffer, 'ch_PP-OCRv4_det_infer.onnx');
    await storeModelBufferDB('paddleocr_rec', recBuffer, 'ch_PP-OCRv4_rec_infer.onnx');

    if (onProgress) onProgress(98, 'Đang khởi tạo Session ONNX Runtime Web WASM...');
    await initLocalOnnxEngine();

    if (onProgress) onProgress(100, 'Tải Model PaddleOCR hoàn tất 100%! Đã sẵn sàng chạy local.');
    return true;
  } catch (err: any) {
    console.error('Download PaddleOCR error:', err);
    if (onProgress) onProgress(0, `Lỗi tải model: ${err?.message || 'Không thể kết nối server'}`);
    return false;
  }
}

/**
 * Upload custom .onnx model file directly from user's computer
 */
export async function uploadCustomPaddleOcrModel(file: File, type: 'det' | 'rec'): Promise<boolean> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async () => {
      if (reader.result instanceof ArrayBuffer) {
        const key = type === 'det' ? 'paddleocr_det' : 'paddleocr_rec';
        await storeModelBufferDB(key, reader.result, file.name);
        // Clear old sessions
        if (type === 'det') onnxDetSession = null;
        if (type === 'rec') onnxRecSession = null;
        await initLocalOnnxEngine();
        resolve(true);
      } else {
        resolve(false);
      }
    };
    reader.onerror = () => resolve(false);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Clear PaddleOCR model cache from IndexedDB
 */
export async function clearPaddleOcrCache(): Promise<void> {
  await deleteModelBufferDB('paddleocr_det');
  await deleteModelBufferDB('paddleocr_rec');
  onnxDetSession = null;
  onnxRecSession = null;
  console.log('[PaddleOCR] Local ONNX model cache cleared.');
}

/**
 * Preprocesses ImageData: Grayscale + High Contrast Enhancement + Otsu thresholding guidance
 */
export function preprocessFrameCanvas(imgData: ImageData): ImageData {
  const data = imgData.data;
  const contrast = 1.8; // High contrast for clear text boundaries
  const factor = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255));

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    let gray = 0.299 * r + 0.587 * g + 0.114 * b;
    gray = factor * (gray - 128) + 128;

    if (gray < 0) gray = 0;
    if (gray > 255) gray = 255;

    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }

  return imgData;
}

import { PaddleOcrService } from 'ppu-paddle-ocr/web';

let mainThreadPaddleService: PaddleOcrService | null = null;

function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const parts = dataUrl.split(',');
  const base64 = parts.length > 1 ? parts[1] : parts[0];
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export function cleanChineseOcrText(text: string): string {
  if (!text) return '';
  let cleaned = text.trim();

  // 1. Remove unwanted background/border symbols & common OCR artifact characters
  cleaned = cleaned.replace(/[|_\\/~^=+*#@$%`§±\[\]\{\}<>‹›«»“”'"]/g, '');

  const containsChinese = /[\u4e00-\u9fa5]/.test(cleaned);
  if (containsChinese) {
    // Chinese subtitle mode: strip Western/ASCII punctuation (commas, periods, colons, etc.)
    cleaned = cleaned.replace(/[\.,!?:;\-_/\\|]+/g, ' ');

    // Strip any trailing Latin letters or numbers attached to Chinese text (e.g. "你好a" -> "你好")
    cleaned = cleaned.replace(/(?<=[\u4e00-\u9fa5])\s*[a-zA-Z0-9.,!?:;\-_]+$/g, '');
    
    // Strip any leading Latin letters or numbers before Chinese text
    cleaned = cleaned.replace(/^[a-zA-Z0-9.,!?:;\-_]+\s*(?=[\u4e00-\u9fa5])/g, '');

    // Strip isolated single Latin letters or digits sandwiched between Chinese characters (e.g. "你 a 好" -> "你好")
    cleaned = cleaned.replace(/(?<=[\u4e00-\u9fa5])\s+[a-zA-Z0-9.,!?:;\-_]\s+(?=[\u4e00-\u9fa5])/g, '');

    // Strip isolated trailing single character if it's non-Chinese or a rare stroke fragment
    cleaned = cleaned.replace(/(?<=[\u4e00-\u9fa5]{2,})\s*[\u3400-\u4dbf\u2e80-\u2eff0-9a-zA-Z]$/g, '');
  } else {
    // If NO Chinese characters exist, drop pure noise if it's 1-3 random digits/latin letters/punctuation
    if (/^[0-9a-zA-Z.,!?:;\-\s_]{1,3}$/.test(cleaned)) {
      return '';
    }
  }

  // Remove excessive whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Drop single-character noise if it's not a Chinese character or letter
  if (cleaned.length === 1 && !/[\u4e00-\u9fa5a-zA-Z]/.test(cleaned)) {
    return '';
  }

  return cleaned;
}

function chineseRatio(text: string): number {
  if (!text) return 0;
  const cjkMatches = text.match(/[\u4e00-\u9fa5]/g) || [];
  return cjkMatches.length / text.length;
}

/**
 * Frequency Majority Voting & Candidate Consensus Selection across multiple frames
 * Eliminates single-frame OCR noise, fade-out/fade-in hallucinations, and stray trailing characters.
 */
function selectConsensusText(samples: string[]): string {
  if (!samples || samples.length === 0) return '';
  if (samples.length === 1) return samples[0];

  const counts = new Map<string, number>();
  for (const s of samples) {
    if (!s) continue;
    counts.set(s, (counts.get(s) || 0) + 1);
  }

  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return '';

  const highestFreq = sorted[0][1];
  const topCandidates = sorted.filter(([_, count]) => count >= Math.max(1, Math.floor(highestFreq * 0.5)));

  topCandidates.sort((a, b) => {
    if (a[1] !== b[1]) return b[1] - a[1];
    const ratioA = chineseRatio(a[0]);
    const ratioB = chineseRatio(b[0]);
    if (Math.abs(ratioA - ratioB) > 0.1) return ratioB - ratioA;
    return a[0].length - b[0].length;
  });

  let chosen = topCandidates[0][0];

  // Trim trailing character if it's present in less than 35% of sample frames (fade-out hallucination)
  if (chosen.length > 2 && samples.length >= 3) {
    const lastChar = chosen[chosen.length - 1];
    let charMatchCount = 0;
    for (const s of samples) {
      if (s.endsWith(lastChar)) {
        charMatchCount++;
      }
    }
    if (charMatchCount / samples.length < 0.35) {
      chosen = chosen.slice(0, -1).trim();
    }
  }

  return chosen;
}

function calculateStringSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const s1 = a.replace(/\s+/g, '');
  const s2 = b.replace(/\s+/g, '');
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const set1 = new Map<string, number>();
  for (let i = 0; i < s1.length; i++) {
    const char = s1[i];
    set1.set(char, (set1.get(char) || 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < s2.length; i++) {
    const char = s2[i];
    const count = set1.get(char);
    if (count && count > 0) {
      intersection++;
      set1.set(char, count - 1);
    }
  }

  return (2.0 * intersection) / (s1.length + s2.length);
}

/**
 * Thuật toán 1: Levenshtein Distance (Edit Distance)
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Thuật toán 1 (Bổ trợ): Hybrid Text Similarity Score (60% Levenshtein + 40% CJK Jaccard)
 */
export function computeHybridTextSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1.0;
  const s1 = a.replace(/\s+/g, '');
  const s2 = b.replace(/\s+/g, '');
  if (s1 === s2) return 1.0;

  const lev = levenshteinDistance(s1, s2);
  const maxLen = Math.max(s1.length, s2.length);
  const levRatio = maxLen > 0 ? 1 - lev / maxLen : 0;
  const jaccardRatio = calculateStringSimilarity(s1, s2);

  return 0.6 * levRatio + 0.4 * jaccardRatio;
}

/**
 * Thuật toán 2: Inter-frame Pixel Difference / Motion Thresholding
 * So sánh tỉ lệ biến đổi pixel giữa 2 khung hình liên tiếp để bỏ qua inference nếu ảnh không đổi.
 */
export function computeImageFrameDifferenceRatio(img1: Uint8ClampedArray, img2: Uint8ClampedArray): number {
  if (img1.length !== img2.length) return 1.0;
  let totalDiff = 0;
  const step = 16; // Sample every 4th pixel
  let count = 0;

  for (let i = 0; i < img1.length; i += step) {
    const rDiff = Math.abs(img1[i] - img2[i]);
    const gDiff = Math.abs(img1[i + 1] - img2[i + 1]);
    const bDiff = Math.abs(img1[i + 2] - img2[i + 2]);
    totalDiff += (rDiff + gDiff + bDiff) / 3;
    count++;
  }

  return count > 0 ? totalDiff / (count * 255) : 0;
}

/**
 * Thuật toán 3: Adaptive Temporal Window Clustering, Majority Voting Consensus & Micro-Gap Filling
 */
export function processTemporalClusteringAndSnapping(
  detectedItems: { text: string; timestamp: number }[]
): LocalOcrResult[] {
  if (detectedItems.length === 0) return [];

  // Pass 1: Gom cụm khung hình kề nhau & thu thập mẫu văn bản để bầu chọn (Majority Voting)
  const rawSubtitles: { text: string; startTime: number; endTime: number }[] = [];
  let currentCluster: {
    samples: string[];
    startTime: number;
    endTime: number;
  } | null = null;

  for (const item of detectedItems) {
    const cleanText = cleanChineseOcrText(item.text);
    if (!cleanText) continue;

    if (!currentCluster) {
      currentCluster = { samples: [cleanText], startTime: item.timestamp, endTime: item.timestamp + 1.2 };
    } else {
      const representative = selectConsensusText(currentCluster.samples);
      const similarity = computeHybridTextSimilarity(representative, cleanText);
      const isSubset = representative.includes(cleanText) || cleanText.includes(representative);

      if (similarity >= 0.50 || isSubset) {
        currentCluster.samples.push(cleanText);
        currentCluster.endTime = item.timestamp + 1.2;
      } else {
        const consensusText = selectConsensusText(currentCluster.samples);
        if (consensusText) {
          rawSubtitles.push({
            text: consensusText,
            startTime: currentCluster.startTime,
            endTime: currentCluster.endTime,
          });
        }
        currentCluster = { samples: [cleanText], startTime: item.timestamp, endTime: item.timestamp + 1.2 };
      }
    }
  }

  if (currentCluster) {
    const consensusText = selectConsensusText(currentCluster.samples);
    if (consensusText) {
      rawSubtitles.push({
        text: consensusText,
        startTime: currentCluster.startTime,
        endTime: currentCluster.endTime,
      });
    }
  }

  // Pass 2: Khử lặp trùng, lấp khoảng trống cực ngắn (< 350ms), căn chỉnh Timeline & Lọc nhiễu đơn khung hình
  const finalizedSubtitles: LocalOcrResult[] = [];
  for (const sub of rawSubtitles) {
    const duration = sub.endTime - sub.startTime;
    // Bỏ qua các mẩu chữ rác ngắn (<= 2 ký tự) xuất hiện thoáng qua duy nhất ở 1 khung hình (duration <= 1.25s)
    if (sub.text.length <= 2 && duration <= 1.25 && rawSubtitles.length > 1) {
      continue;
    }

    if (finalizedSubtitles.length === 0) {
      finalizedSubtitles.push({
        startTime: Number(sub.startTime.toFixed(2)),
        endTime: Number(Math.max(sub.startTime + 1.0, sub.endTime).toFixed(2)), // Enforce min duration 1.0s
        originalText: sub.text,
        sourceLang: 'PaddleOCR Wasm Local',
      });
      continue;
    }

    const prev = finalizedSubtitles[finalizedSubtitles.length - 1];
    const gap = sub.startTime - prev.endTime;
    const similarity = computeHybridTextSimilarity(prev.originalText, sub.text);
    const isSubset = prev.originalText.includes(sub.text) || sub.text.includes(prev.originalText);

    // Nếu khoảng nghỉ rất ngắn và văn bản giống nhau -> Gộp dòng (Merge)
    if ((gap < 1.0 && (similarity >= 0.5 || isSubset)) || (gap <= 0.35 && similarity >= 0.35)) {
      prev.endTime = Number(Math.max(prev.endTime, sub.endTime).toFixed(2));
      const candidateList = [prev.originalText, sub.text];
      prev.originalText = selectConsensusText(candidateList);
    } else {
      // Đảm bảo khoảng nghỉ giữa 2 câu phụ đề tối thiểu là 0.05s để tránh chồng chéo
      const clampedStartTime = Math.max(sub.startTime, prev.endTime + 0.05);
      const minEndTime = Math.max(clampedStartTime + 1.0, sub.endTime);

      finalizedSubtitles.push({
        startTime: Number(clampedStartTime.toFixed(2)),
        endTime: Number(minEndTime.toFixed(2)),
        originalText: sub.text,
        sourceLang: 'PaddleOCR Wasm Local',
      });
    }
  }

  return finalizedSubtitles;
}

/**
 * Run client-side local OCR frame analysis entirely in browser using WebAssembly & ONNX Runtime Web (WebGPU/WebGL)
 * offloaded to a background Web Worker so the UI thread remains 100% responsive.
 */
export async function runClientSideLocalOcrBatch(
  frames: LocalFrameItem[],
  onProgress?: (msg: string) => void
): Promise<LocalOcrResult[]> {
  const detectedItems: { text: string; timestamp: number }[] = [];

  if (onProgress) {
    onProgress('Đang khởi tạo Web Worker & ONNX Runtime Web Engine (WebGPU/Wasm)...');
  }

  const detBuf = await getModelBufferDB('paddleocr_det');
  const recBuf = await getModelBufferDB('paddleocr_rec');

  // Try spawning Web Worker for background non-blocking execution
  let worker: Worker | null = null;
  try {
    worker = new Worker(new URL('../workers/ocr.worker.ts', import.meta.url), { type: 'module' });
  } catch (e) {
    console.warn('[PaddleOCR] Web Worker instantiation fallback:', e);
  }

  if (worker) {
    try {
      const processedFrames: { image: string; pixelData?: Uint8ClampedArray; width?: number; height?: number; timestamp: number }[] = [];

      for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        if (onProgress) {
          onProgress(`Đang chuẩn bị dữ liệu khung hình cho Worker (${i + 1}/${frames.length})...`);
        }
        processedFrames.push({
          image: f.image,
          timestamp: f.timestamp,
        });
      }

      const workerPromise = new Promise<{ text: string; timestamp: number }[]>((resolve) => {
        if (!worker) return resolve([]);

        worker.onmessage = (e: MessageEvent) => {
          const { type, progress, message, results, detReady, recReady } = e.data;
          if (type === 'READY') {
            console.log(`[OCR Worker] Model Ready! detReady: ${detReady}, recReady: ${recReady}`);
            worker?.postMessage({ type: 'PROCESS_BATCH', frames: processedFrames });
          } else if (type === 'PROGRESS') {
            if (onProgress) onProgress(message || `Worker đang xử lý (${progress}%)...`);
          } else if (type === 'BATCH_COMPLETE') {
            resolve(results || []);
          } else if (type === 'ERROR') {
            console.warn('[OCR Worker Error]:', e.data.error);
            resolve([]);
          }
        };

        worker.postMessage({
          type: 'INIT',
          detBuffer: detBuf,
          recBuffer: recBuf,
        });
      });

      const workerResults = await workerPromise;
      worker.terminate();

      if (workerResults && workerResults.length > 0) {
        workerResults.forEach((r) => detectedItems.push(r));
      }
    } catch (workerErr) {
      console.warn('Worker batch pass note, falling back to main thread PaddleOCR:', workerErr);
      if (worker) worker.terminate();
    }
  }

  // Main thread fallback if worker returned no items or worker not supported
  if (detectedItems.length === 0) {
    if (onProgress) onProgress('Đang chạy PaddleOCR Engine trên Luồng chính (Main Thread)...');
    try {
      if (!mainThreadPaddleService) {
        const hasCustomBuffers = detBuf && recBuf && detBuf.byteLength > 100000 && recBuf.byteLength > 100000;
        mainThreadPaddleService = new PaddleOcrService({
          model: hasCustomBuffers
            ? {
                detection: detBuf,
                recognition: recBuf,
              }
            : undefined,
          session: { executionProviders: ['webgpu', 'webgl', 'wasm'] },
          processing: { engine: 'canvas-native' },
        });
        await mainThreadPaddleService.initialize();
      }

      for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        if (onProgress) {
          onProgress(`PaddleOCR Engine đang bóc tách chữ (${i + 1}/${frames.length})...`);
        }
        try {
          const buf = dataUrlToArrayBuffer(f.image);
          const res = await mainThreadPaddleService.recognize(buf, { flatten: true });
          const rawText = typeof res === 'string' ? res : res?.text || '';
          const text = cleanChineseOcrText(rawText);
          if (text && text.length > 0) {
            detectedItems.push({ timestamp: f.timestamp, text });
          }
        } catch (err) {
          console.warn('Main thread PaddleOCR recognition error for frame', i, err);
        }
      }
    } catch (err) {
      console.error('Main thread PaddleOCR service setup failed:', err);
    }
  }

  return processTemporalClusteringAndSnapping(detectedItems);
}
