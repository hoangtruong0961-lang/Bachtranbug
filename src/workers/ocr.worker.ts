import { PaddleOcrService } from 'ppu-paddle-ocr/web';
import * as ort from 'onnxruntime-web';

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

function cleanChineseOcrText(text: string): string {
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

let ocrService: PaddleOcrService | null = null;

self.onmessage = async (e: MessageEvent) => {
  const { type, detBuffer, recBuffer, frames } = e.data;

  if (type === 'INIT') {
    try {
      // Configure ONNX WASM SIMD & Multi-threading for Web Worker fallback
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
        console.log(`[OCR Worker WASM Setup] SIMD: enabled | numThreads: ${ort.env.wasm.numThreads} (Cores: ${logicalCores})`);
      } catch (envErr) {
        console.warn('[OCR Worker WASM Setup Warning]', envErr);
      }

      if (!ocrService) {
        const hasCustomBuffers = detBuffer && recBuffer && detBuffer.byteLength > 100000 && recBuffer.byteLength > 100000;
        ocrService = new PaddleOcrService({
          model: hasCustomBuffers
            ? {
                detection: detBuffer,
                recognition: recBuffer,
              }
            : undefined,
          session: {
            executionProviders: ['webgpu', 'webgl', 'wasm'],
          },
          processing: {
            engine: 'canvas-native',
          },
        });
        await ocrService.initialize();
      }
      console.log('[OCR Worker] ppu-paddle-ocr initialized successfully!');
      self.postMessage({
        type: 'READY',
        detReady: true,
        recReady: true,
      });
    } catch (err: any) {
      console.warn('[OCR Worker] ppu-paddle-ocr init attempt 1 warning:', err);
      try {
        if (!ocrService) {
          ocrService = new PaddleOcrService({
            session: {
              executionProviders: ['webgpu', 'webgl', 'wasm'],
            },
            processing: {
              engine: 'canvas-native',
            },
          });
          await ocrService.initialize();
        }
        self.postMessage({ type: 'READY', detReady: true, recReady: true });
      } catch (fallbackErr: any) {
        console.error('[OCR Worker] ppu-paddle-ocr init failed:', fallbackErr);
        self.postMessage({ type: 'ERROR', error: fallbackErr?.message || 'Worker init error' });
      }
    }
  } else if (type === 'PROCESS_BATCH' && Array.isArray(frames)) {
    try {
      const results: { timestamp: number; text: string }[] = [];

      for (let i = 0; i < frames.length; i++) {
        const item = frames[i];
        self.postMessage({
          type: 'PROGRESS',
          progress: Math.round(((i + 1) / frames.length) * 100),
          message: `ppu-paddle-ocr (WebGPU/Wasm) đang bóc tách nét chữ (${i + 1}/${frames.length})...`,
        });

        if (ocrService) {
          try {
            let res: any = null;
            if (item.image) {
              const arrayBuf = typeof item.image === 'string' ? dataUrlToArrayBuffer(item.image) : item.image;
              res = await ocrService.recognize(arrayBuf, { flatten: true });
            } else if (item.pixelData && item.width && item.height) {
              const offscreen = new OffscreenCanvas(item.width, item.height);
              const ctx = offscreen.getContext('2d');
              if (ctx) {
                const imgData = new ImageData(new Uint8ClampedArray(item.pixelData), item.width, item.height);
                ctx.putImageData(imgData, 0, 0);
                res = await ocrService.recognize(offscreen as any, { flatten: true });
              }
            }
            const rawText = typeof res === 'string' ? res : res?.text || '';
            const text = cleanChineseOcrText(rawText);
            if (text && text.trim().length > 0) {
              results.push({ timestamp: item.timestamp, text: text.trim() });
            }
          } catch (recErr) {
            console.warn('[OCR Worker] Frame recognition exception:', recErr);
          }
        }
      }

      self.postMessage({ type: 'BATCH_COMPLETE', results });
    } catch (err: any) {
      self.postMessage({ type: 'ERROR', error: err?.message || 'Worker batch error' });
    }
  }
};
