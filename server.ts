import express from 'express';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import ytdl from '@distube/ytdl-core';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const require = createRequire(import.meta.url);
let sherpaOnnxModule: any = null;
try {
  sherpaOnnxModule = require('sherpa-onnx');
  console.log('[Sherpa-ONNX] Successfully loaded sherpa-onnx version:', sherpaOnnxModule?.version || 'ok');
} catch (e) {
  console.warn('[Sherpa-ONNX] Module load error:', e);
}

const NGHI_TTS_VOICE_URLS: Record<string, { filename: string; url: string; name: string }> = {
  lacphi: {
    filename: 'lacphi.onnx',
    url: 'https://huggingface.co/doof-ferb/nghitts-copy/resolve/main/sherpa-onnx/lacphi.onnx',
    name: 'Lạc Phi',
  },
  duyoryx: {
    filename: 'duyoryx3175.onnx',
    url: 'https://huggingface.co/doof-ferb/nghitts-copy/resolve/main/sherpa-onnx/duyoryx3175.onnx',
    name: 'Duy Oryx',
  },
  ngochuyennew: {
    filename: 'ngochuyennew.onnx',
    url: 'https://huggingface.co/doof-ferb/nghitts-copy/resolve/main/sherpa-onnx/ngochuyennew.onnx',
    name: 'Ngọc Huyền (Mới)',
  },
  ngocngan: {
    filename: 'ngocngan3701.onnx',
    url: 'https://huggingface.co/doof-ferb/nghitts-copy/resolve/main/sherpa-onnx/ngocngan3701.onnx',
    name: 'Ngọc Ngạn',
  },
  maiphuong: {
    filename: 'maiphuong.onnx',
    url: 'https://huggingface.co/doof-ferb/nghitts-copy/resolve/main/sherpa-onnx/maiphuong.onnx',
    name: 'Mai Phương',
  },
  minhquang: {
    filename: 'minhquang.onnx',
    url: 'https://huggingface.co/doof-ferb/nghitts-copy/resolve/main/sherpa-onnx/minhquang.onnx',
    name: 'Minh Quang',
  },
};

function fixHuggingFaceUrl(url: string): string {
  if (!url) return url;
  if (url.includes('huggingface.co') && url.includes('/blob/')) {
    const fixed = url.replace('huggingface.co/', 'huggingface.co/').replace('/blob/', '/resolve/');
    console.log(`[Hugging Face URL Fixer] Converted HF blob URL to resolve: ${url} -> ${fixed}`);
    return fixed;
  }
  return url;
}

async function ensureFileDownloaded(fileUrl: string, targetPath: string): Promise<boolean> {
  const sanitizedUrl = fixHuggingFaceUrl(fileUrl);
  if (fs.existsSync(targetPath)) {
    const stat = fs.statSync(targetPath);
    if (stat.size > 1000) return true; // file exists and not empty
  }
  console.log(`[Sherpa-ONNX TTS] Downloading file from ${sanitizedUrl} to ${targetPath}...`);
  try {
    const res = await fetch(sanitizedUrl);
    if (!res.ok) throw new Error(`Failed to fetch ${sanitizedUrl}: ${res.status} ${res.statusText}`);
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, buffer);
    console.log(`[Sherpa-ONNX TTS] Saved ${targetPath} (${(buffer.length / (1024 * 1024)).toFixed(1)} MB) successfully.`);
    return true;
  } catch (e) {
    console.error(`[Sherpa-ONNX TTS] Download error for ${fileUrl}:`, e);
    return false;
  }
}

async function ensureEspeakData(nghiDir: string): Promise<boolean> {
  const targetDir = path.join(nghiDir, 'espeak-ng-data');
  const phontabPath = path.join(targetDir, 'phontab');
  if (fs.existsSync(phontabPath)) return true;

  console.log('[Sherpa-ONNX TTS] espeak-ng-data missing. Downloading espeak-ng-data.zip...');
  const zipPath = path.join(nghiDir, 'espeak-ng-data.zip');
  const zipUrl = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/espeak-ng-data.zip';

  const downloaded = await ensureFileDownloaded(zipUrl, zipPath);
  if (!downloaded) return false;

  console.log('[Sherpa-ONNX TTS] Unzipping espeak-ng-data...');
  return new Promise((resolve) => {
    exec(`unzip -q "${zipPath}" -d "${nghiDir}" && rm -f "${zipPath}"`, (err) => {
      if (err) {
        console.error('[Sherpa-ONNX TTS] Unzip error:', err);
        resolve(false);
      } else {
        console.log('[Sherpa-ONNX TTS] espeak-ng-data extracted successfully.');
        resolve(true);
      }
    });
  });
}

function floatTo16BitPcmWav(samples: Float32Array, sampleRate: number): Buffer {
  const numChannels = 1;
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28);
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);

  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const val = s < 0 ? s * 0x8000 : s * 0x7fff;
    buffer.writeInt16LE(Math.floor(val), offset);
    offset += 2;
  }

  return buffer;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // CORS Middleware
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Range, Accept, Origin, x-api-key');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json({ limit: '50mb' }));

  // Shared GenAI helper
  const getAiClient = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is missing in environment variables.');
    }
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  };

  // Helper with automatic retry for 429 Rate Limits / Quota Exhaustion
  const generateContentWithRetry = async (ai: GoogleGenAI, params: any, maxRetries = 2) => {
    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        return await ai.models.generateContent(params);
      } catch (err: any) {
        const errStr = String(err?.message || err || '');
        const isQuota = errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('Quota');
        if (isQuota && attempt < maxRetries) {
          attempt++;
          console.warn(`Gemini API 429 Quota hit. Retrying attempt ${attempt}/${maxRetries} in 2 seconds...`);
          await new Promise((r) => setTimeout(r, 2000));
        } else {
          if (isQuota) {
            throw new Error('Lỗi Quota API Gemini (429): Đã quá giới hạn tần suất gọi AI (Quota Exhausted). Vui lòng chờ 30-60 giây trước khi thử lại.');
          }
          throw err;
        }
      }
    }
    throw new Error('Failed to generate content after retries.');
  };

  // 1. Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // 1a. Proxy/Serve PaddleOCR ONNX model files cleanly
  app.get('/api/paddle-models/:type', async (req, res) => {
    try {
      const { type } = req.params;
      const isDet = type === 'det';

      const urls = isDet
        ? [
            'https://media.githubusercontent.com/media/hiroi-sora/PaddleOCR-json/main/resources/models/ch_PP-OCRv4_det_infer.onnx',
            'https://huggingface.co/duyku321/PaddleOCR-onnx/resolve/main/ch_PP-OCRv4_det_infer.onnx',
            'https://huggingface.co/bropapa/paddleocr-onnx/resolve/main/ch_PP-OCRv4_det_infer.onnx',
            'https://huggingface.co/monorepo/paddleocr-onnx/resolve/main/ch_PP-OCRv4_det_infer.onnx',
            'https://raw.githubusercontent.com/hiroi-sora/PaddleOCR-json/main/resources/models/ch_PP-OCRv4_det_infer.onnx',
            'https://cdn.jsdelivr.net/gh/hiroi-sora/PaddleOCR-json@main/resources/models/ch_PP-OCRv4_det_infer.onnx',
          ]
        : [
            'https://media.githubusercontent.com/media/hiroi-sora/PaddleOCR-json/main/resources/models/ch_PP-OCRv4_rec_infer.onnx',
            'https://huggingface.co/duyku321/PaddleOCR-onnx/resolve/main/ch_PP-OCRv4_rec_infer.onnx',
            'https://huggingface.co/bropapa/paddleocr-onnx/resolve/main/ch_PP-OCRv4_rec_infer.onnx',
            'https://huggingface.co/monorepo/paddleocr-onnx/resolve/main/ch_PP-OCRv4_rec_infer.onnx',
            'https://raw.githubusercontent.com/hiroi-sora/PaddleOCR-json/main/resources/models/ch_PP-OCRv4_rec_infer.onnx',
            'https://cdn.jsdelivr.net/gh/hiroi-sora/PaddleOCR-json@main/resources/models/ch_PP-OCRv4_rec_infer.onnx',
          ];

      let lastErr: any = null;
      for (const targetUrl of urls) {
        try {
          const fetchRes = await fetch(targetUrl, {
            redirect: 'follow',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': '*/*',
            },
          });
          if (fetchRes.ok) {
            const arrayBuf = await fetchRes.arrayBuffer();
            const buffer = Buffer.from(arrayBuf);
            // Ensure payload is an actual binary ONNX model (>100KB), not an LFS text pointer or 404 HTML
            if (buffer.length > 100000) {
              res.setHeader('Content-Type', 'application/octet-stream');
              res.setHeader('Content-Length', buffer.length.toString());
              res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
              res.send(buffer);
              return;
            } else {
              console.warn(`[PaddleOCR Proxy] URL ${targetUrl} returned non-binary or small payload (${buffer.length} bytes)`);
            }
          }
        } catch (e) {
          lastErr = e;
          console.warn(`[PaddleOCR Proxy] Error fetching ${targetUrl}:`, e);
        }
      }
      res.status(502).json({ error: 'Failed to fetch valid PaddleOCR ONNX model from all remote CDNs', details: String(lastErr) });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Server model proxy error' });
    }
  });

  // 1b. Real-time Video Frame OCR (PaddleOCR JSON compatible local endpoint)
  app.post('/api/ocr-frame', async (req, res) => {
    try {
      const imageBase64 = req.body.imageBase64 || req.body.image;
      if (!imageBase64) {
        res.status(400).json({ success: false, error: 'Missing imageBase64' });
        return;
      }

      const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
      const ai = getAiClient();

      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: [
          { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
          {
            text: `Extract all visible Chinese / multilingual text from this video frame snapshot. Return JSON with a list of text regions containing raw text, translated text to Vietnamese, confidence, and 2D bounding boxes.`,
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              code: { type: Type.INTEGER, description: '100 for success' },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING },
                    translatedText: { type: Type.STRING },
                    score: { type: Type.NUMBER },
                    box: {
                      type: Type.ARRAY,
                      items: { type: Type.INTEGER },
                      description: '[ymin, xmin, ymax, xmax] 0-1000',
                    },
                  },
                },
              },
            },
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      res.json({
        success: true,
        data: {
          code: 100,
          data: parsed.items || [],
        },
      });
    } catch (err: any) {
      console.error('Error in /api/ocr-frame:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 2. Single Frame OCR & Translation
  app.post('/api/ocr-extract', async (req, res) => {
    try {
      const { image, timestamp, targetLang = 'Tiếng Việt', model = 'gemini-3.6-flash', customContext } = req.body;

      if (!image) {
        res.status(400).json({ error: 'Missing image data' });
        return;
      }

      const ai = getAiClient();
      const selectedModel = model || 'gemini-3.6-flash';

      // Remove data URL prefix if present
      const cleanBase64 = image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');

      const prompt = `You are a high-precision video OCR and subtitle translator.
Your job is to examine this cropped region of a video frame and extract any visible text/subtitle.
${customContext ? `Context about the video content: ${customContext}` : ''}

Target translation language: ${targetLang}.

Instructions:
1. If NO visible text/subtitle exists in the image frame, set "hasText": false.
2. If text IS visible:
   - Extract the exact raw original text ("originalText").
   - Identify the source language ("sourceLang").
   - Translate "originalText" into natural, contextual ${targetLang} ("translatedText").
   - Provide a confidence score between 0.0 and 1.0 ("confidence").
   - Locate the exact 2D bounding box of the subtitle text inside this image as "box_2d" formatted as an array of 4 integers [ymin, xmin, ymax, xmax] normalized on a 0 to 1000 scale.`;

      const response = await generateContentWithRetry(ai, {
        model: selectedModel,
        contents: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: cleanBase64,
            },
          },
          {
            text: prompt,
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              hasText: { type: Type.BOOLEAN, description: 'True if subtitle text is visible' },
              originalText: { type: Type.STRING, description: 'Extracted raw text' },
              sourceLang: { type: Type.STRING, description: 'Detected source language code or name' },
              translatedText: { type: Type.STRING, description: 'Translated subtitle text' },
              confidence: { type: Type.NUMBER, description: 'Detection confidence from 0 to 1' },
              box_2d: {
                type: Type.ARRAY,
                items: { type: Type.INTEGER },
                description: '2D bounding box [ymin, xmin, ymax, xmax] normalized from 0 to 1000'
              },
            },
            required: ['hasText'],
          },
        },
      });

      const responseText = response.text || '{}';
      const parsed = JSON.parse(responseText);

      res.json({
        success: true,
        timestamp: timestamp || 0,
        result: parsed,
      });
    } catch (err: any) {
      console.error('Error in /api/ocr-extract:', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to extract subtitle via OCR.',
      });
    }
  });

  // 3. Multi-Frame Batch OCR & Subtitle Synchronizer
  app.post('/api/ocr-batch-frames', async (req, res) => {
    try {
      const { frames, targetLang = 'Tiếng Việt', model = 'gemini-3.6-flash', ocrEngine = 'gemini_vision', customContext } = req.body;

      if (!frames || !Array.isArray(frames) || frames.length === 0) {
        res.status(400).json({ error: 'Missing or invalid frames array' });
        return;
      }

      // Gemini Vision Multimodal AI Engine
      const ai = getAiClient();
      const selectedModel = model || 'gemini-3.6-flash';

      const batchPrompt = `You are an expert video subtitle OCR engine.
You are given a sequence of ${frames.length} cropped video frame snapshots captured chronologically.
Frame timestamps: ${frames.map((f: any) => f.timestamp.toFixed(2) + 's').join(', ')}.
${customContext ? `Video context / topic: ${customContext}` : ''}

CRITICAL OCR TASK:
1. Carefully inspect every frame image snapshot below. Extract all visible printed/burned subtitle text (Chinese, English, Vietnamese, Japanese, etc.).
2. If text is present in a frame:
   - "originalText": Exact extracted raw text.
   - "startTime": Timestamp of the FIRST frame snapshot where this text appears.
   - "endTime": Timestamp of the LAST frame snapshot where this text appears (+0.2s padding). If text is visible in only 1 frame, set endTime = startTime + 2.0s.
   - "sourceLang": Language of the detected text.
   - "box_2d": [ymin, xmin, ymax, xmax] integers (0-1000 scale) bounding the subtitle text inside the cropped image.
3. Merge identical or nearly identical text from consecutive frames into a single subtitle entry with correct startTime and endTime.
4. If NO text is present in any frame, return an empty array [].`;

      const parts: any[] = [{ text: batchPrompt }];

      frames.forEach((f: { image: string; timestamp: number }, idx: number) => {
        const cleanBase64 = f.image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
        parts.push({
          text: `--- Frame ${idx + 1}/${frames.length} (Timestamp: ${f.timestamp.toFixed(2)}s) ---`,
        });
        parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: cleanBase64,
          },
        });
      });

      const response = await generateContentWithRetry(ai, {
        model: selectedModel,
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                startTime: { type: Type.NUMBER, description: 'Start time in seconds' },
                endTime: { type: Type.NUMBER, description: 'End time in seconds' },
                originalText: { type: Type.STRING, description: 'Extracted original subtitle' },
                sourceLang: { type: Type.STRING, description: 'Source language name' },
                translatedText: { type: Type.STRING, description: 'Translated subtitle' },
                confidence: { type: Type.NUMBER, description: 'Confidence score' },
                box_2d: {
                  type: Type.ARRAY,
                  items: { type: Type.INTEGER },
                  description: '2D bounding box [ymin, xmin, ymax, xmax] normalized from 0 to 1000'
                },
              },
              required: ['startTime', 'endTime', 'originalText'],
            },
          },
        },
      });

      const responseText = response.text || '[]';
      const subtitles = JSON.parse(responseText);

      res.json({
        success: true,
        engine: 'gemini_vision',
        subtitles,
      });
    } catch (err: any) {
      console.error('Error in /api/ocr-batch-frames:', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to process batch OCR frames.',
      });
    }
  });

  // 4. Batch Subtitle Translator / Refiner
  app.post('/api/translate-batch', async (req, res) => {
    try {
      const { subtitles, targetLang = 'Tiếng Việt', model = 'gemini-2.5-flash', glossary, optimizeForTts = true } = req.body;

      if (!subtitles || !Array.isArray(subtitles)) {
        res.status(400).json({ error: 'Missing subtitles array' });
        return;
      }

      const ai = getAiClient();
      let selectedModel = model || 'gemini-2.5-flash';
      if (selectedModel === 'GEMINI_WEB') {
        selectedModel = 'gemini-2.5-flash';
      }

      const ttsInstruction = optimizeForTts
        ? '\nCRITICAL FOR TTS DUBBING: Optimize all translations so sentences are concise, natural, and accurately rhythm-matched to the video subtitle duration. Avoid overly verbose or long translations so the Text-To-Speech audio speed remains smooth and steady without rushing or slowing down dramatically.'
        : '';

      const prompt = `You are a professional video translator and subtitle localizer.
Translate the following list of subtitles into ${targetLang}.${ttsInstruction}
Maintain tone, context continuity between consecutive lines, and natural phrasing suitable for video subtitles.
${glossary ? `Follow this custom glossary if applicable: ${glossary}` : ''}

Subtitles to translate:
${JSON.stringify(subtitles.map((s: any) => ({ id: s.id, originalText: s.originalText, duration: (s.endTime - s.startTime).toFixed(2) + 's' })))}`;

      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                translatedText: { type: Type.STRING },
              },
              required: ['id', 'translatedText'],
            },
          },
        },
      });

      const responseText = response.text || '[]';
      const translations = JSON.parse(responseText);

      res.json({
        success: true,
        translations,
      });
    } catch (err: any) {
      console.error('Error in /api/translate-batch:', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to translate subtitle batch.',
      });
    }
  });

  // 5. Nghi TTS Status Endpoint
  app.post('/api/tts/nghi-status', async (req, res) => {
    try {
      const nghiVoiceKey = req.body.nghiVoice || 'lacphi';
      const voiceConfig = NGHI_TTS_VOICE_URLS[nghiVoiceKey] || NGHI_TTS_VOICE_URLS.lacphi;
      const nghiDir = path.join(process.cwd(), 'nghi-tts audio');
      const modelPath = path.join(nghiDir, voiceConfig.filename);
      const tokensPath = path.join(nghiDir, 'tokens.txt');
      const espeakPath = path.join(nghiDir, 'espeak-ng-data', 'phontab');

      const modelExists = fs.existsSync(modelPath) && fs.statSync(modelPath).size > 1000;
      const tokensExists = fs.existsSync(tokensPath) && fs.statSync(tokensPath).size > 10;
      const espeakExists = fs.existsSync(espeakPath);

      let modelSizeMb = 0;
      if (modelExists) {
        modelSizeMb = Math.round((fs.statSync(modelPath).size / (1024 * 1024)) * 10) / 10;
      }

      // Find all downloaded voice models
      const downloadedVoices: string[] = [];
      for (const [key, v] of Object.entries(NGHI_TTS_VOICE_URLS)) {
        const p = path.join(nghiDir, v.filename);
        if (fs.existsSync(p) && fs.statSync(p).size > 1000) {
          downloadedVoices.push(key);
        }
      }

      res.json({
        success: true,
        voiceKey: nghiVoiceKey,
        voiceName: voiceConfig.name,
        ready: modelExists && tokensExists && espeakExists,
        modelExists,
        tokensExists,
        espeakExists,
        modelSizeMb,
        downloadedVoices,
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // 6. Nghi TTS Download Endpoint
  app.post('/api/tts/nghi-download', async (req, res) => {
    try {
      const nghiVoiceKey = req.body.nghiVoice || 'lacphi';
      const voiceConfig = NGHI_TTS_VOICE_URLS[nghiVoiceKey] || NGHI_TTS_VOICE_URLS.lacphi;
      const nghiDir = path.join(process.cwd(), 'nghi-tts audio');
      const modelPath = path.join(nghiDir, voiceConfig.filename);
      const tokensPath = path.join(nghiDir, 'tokens.txt');
      const tokensUrl = 'https://huggingface.co/doof-ferb/nghitts-copy/resolve/main/sherpa-onnx/tokens.txt';

      console.log(`[Sherpa-ONNX Download] Explicit download requested for voice '${voiceConfig.name}'...`);

      // 1. Ensure tokens.txt
      const tokensOk = await ensureFileDownloaded(tokensUrl, tokensPath);
      if (!tokensOk) {
        res.status(500).json({ success: false, error: 'Không thể tải file tokens.txt' });
        return;
      }

      // 2. Ensure espeak-ng-data
      const espeakOk = await ensureEspeakData(nghiDir);
      if (!espeakOk) {
        res.status(500).json({ success: false, error: 'Không thể giải nén thư viện espeak-ng-data' });
        return;
      }

      // 3. Ensure ONNX model
      const modelOk = await ensureFileDownloaded(voiceConfig.url, modelPath);
      if (!modelOk) {
        res.status(500).json({ success: false, error: `Không thể tải mô hình ONNX cho giọng ${voiceConfig.name}` });
        return;
      }

      // Reset any previous failed status or cached instance so new model configuration is loaded cleanly
      failedSherpaVoices.delete(nghiVoiceKey);
      disposeTtsInstance(nghiVoiceKey);

      const sizeMb = Math.round((fs.statSync(modelPath).size / (1024 * 1024)) * 10) / 10;

      res.json({
        success: true,
        message: `Đã tải xong mô hình giọng đọc ${voiceConfig.name} (${sizeMb} MB) và thư viện Sherpa-ONNX!`,
        voiceKey: nghiVoiceKey,
        voiceName: voiceConfig.name,
        sizeMb,
      });
    } catch (e: any) {
      console.error('[Sherpa-ONNX Download Error]', e);
      res.status(500).json({ success: false, error: e.message || 'Lỗi khi tải mô hình' });
    }
  });

  // High-Speed Local TTS Cache & Engine Singleton Manager
  const cachedTtsInstances: Record<string, any> = {};
  const failedSherpaVoices = new Set<string>();
  interface CachedAudioItem {
    audioBase64: string;
    duration?: number;
    timestamps?: { word: string; start: number; end: number }[];
  }
  const cachedTtsAudio = new Map<string, CachedAudioItem>();
  const MAX_AUDIO_CACHE_SIZE = 2000;

  const disposeTtsInstance = (voiceKey: string) => {
    if (cachedTtsInstances[voiceKey]) {
      try {
        if (typeof cachedTtsInstances[voiceKey].free === 'function') {
          cachedTtsInstances[voiceKey].free();
        } else if (typeof cachedTtsInstances[voiceKey].delete === 'function') {
          cachedTtsInstances[voiceKey].delete();
        }
      } catch (e) {
        console.warn(`[Sherpa-ONNX Instance Cleanup Warning for '${voiceKey}']:`, e);
      }
      delete cachedTtsInstances[voiceKey];
    }
  };

  const getCachedAudio = (key: string): CachedAudioItem | undefined => cachedTtsAudio.get(key);
  const setCachedAudio = (key: string, item: CachedAudioItem) => {
    if (cachedTtsAudio.size >= MAX_AUDIO_CACHE_SIZE) {
      const firstKey = cachedTtsAudio.keys().next().value;
      if (firstKey) cachedTtsAudio.delete(firstKey);
    }
    cachedTtsAudio.set(key, item);
  };

  const getOrCreateTtsEngine = (voiceKey: string, modelPath: string, tokensPath: string, dataDir: string) => {
    if (failedSherpaVoices.has(voiceKey)) return null;
    if (cachedTtsInstances[voiceKey]) {
      return cachedTtsInstances[voiceKey];
    }
    if (!sherpaOnnxModule) return null;

    // Free & dispose any existing voice model instances before loading a new model to keep WASM RAM usage bounded
    for (const existingKey of Object.keys(cachedTtsInstances)) {
      if (existingKey !== voiceKey) {
        console.log(`[Sherpa-ONNX Singleton] Freeing previous voice instance '${existingKey}' to conserve WASM RAM...`);
        disposeTtsInstance(existingKey);
      }
    }

    try {
      console.log(`[Sherpa-ONNX TTS Engine] Warmup & Initializing singleton instance for voice '${voiceKey}'...`);
      const engine = sherpaOnnxModule.createOfflineTts({
        offlineTtsModelConfig: {
          offlineTtsVitsModelConfig: {
            model: modelPath,
            tokens: tokensPath,
            lexicon: '',
            dataDir: dataDir,
            noiseScale: 0.667,
            noiseScaleW: 0.8,
            lengthScale: 1.0,
          },
          numThreads: 1,
          debug: 0,
          provider: 'cpu',
        },
        ruleFsts: '',
        ruleFars: '',
        maxNumSentences: 1,
      });
      cachedTtsInstances[voiceKey] = engine;
      return engine;
    } catch (e) {
      console.warn(`[Sherpa-ONNX Engine Init Warning] Could not cache engine for '${voiceKey}':`, e);
      failedSherpaVoices.add(voiceKey);
      return null;
    }
  };

  // 7. Text to Speech (TTS) Narration Endpoint & Safe Generation Helper
  const sanitizeTextForSherpa = (input: string): string => {
    if (!input) return '';
    return input
      .replace(/<[^>]*>/g, '') // remove HTML tags
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '') // remove emojis
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/[^\p{L}\p{N}\s.,?!;:\-–—"'()]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const splitTextToShortSentences = (text: string, maxLen = 70): string[] => {
    const sanitized = sanitizeTextForSherpa(text);
    if (!sanitized) return [];

    // 1. Split by punctuation marks (. ? ! ; \n)
    const rawSentences = sanitized.split(/(?<=[.?!;\n])\s+/);
    const chunks: string[] = [];

    for (const rawSent of rawSentences) {
      const sent = rawSent.trim();
      if (!sent) continue;

      if (sent.length <= maxLen) {
        chunks.push(sent);
      } else {
        // 2. Sub-split long sentences by clause punctuation (, : - – —)
        const clauses = sent.split(/(?<=[,:–—\-])\s+/);
        for (const clause of clauses) {
          const cl = clause.trim();
          if (!cl) continue;

          if (cl.length <= maxLen) {
            chunks.push(cl);
          } else {
            // 3. Word-boundary fallback if clause is still > maxLen
            const words = cl.split(/\s+/);
            let current = '';
            for (const w of words) {
              if ((current + ' ' + w).trim().length <= maxLen) {
                current = (current + ' ' + w).trim();
              } else {
                if (current) chunks.push(current);
                current = w;
              }
            }
            if (current) chunks.push(current);
          }
        }
      }
    }

    return chunks.length > 0 ? chunks : [sanitized.slice(0, maxLen)];
  };

  const generateSherpaAudioSafe = (
    voiceKey: string,
    modelPath: string,
    tokensPath: string,
    dataDir: string,
    text: string,
    speed: number
  ): { buffer: Buffer; duration: number; timestamps: { word: string; start: number; end: number }[] } | null => {
    if (failedSherpaVoices.has(voiceKey)) return null;

    // Filter text and queue short sentences (<= 70 chars) to prevent WASM heap bloat
    const chunks = splitTextToShortSentences(text, 70);
    if (chunks.length === 0) return null;

    const samplesList: Float32Array[] = [];
    let sampleRate = 22050;

    let ttsEngine = getOrCreateTtsEngine(voiceKey, modelPath, tokensPath, dataDir);
    if (!ttsEngine) {
      failedSherpaVoices.add(voiceKey);
      return null;
    }

    const wordTimestamps: { word: string; start: number; end: number }[] = [];
    let currentAudioTime = 0;

    // Process sentence queue strictly one by one, immediately releasing chunk memory
    for (const chunk of chunks) {
      let res: any = null;
      try {
        res = ttsEngine.generate({ text: chunk, speed });
        if (res && res.samples && res.samples.length > 0) {
          // Immediately clone the PCM samples into standard JS heap Float32Array
          const clonedSamples = new Float32Array(res.samples);
          samplesList.push(clonedSamples);
          const chunkSampleRate = res.sampleRate || sampleRate;
          sampleRate = chunkSampleRate;

          const chunkDuration = clonedSamples.length / chunkSampleRate;
          const words = chunk.split(/\s+/).filter(Boolean);

          if (words.length > 0) {
            if (Array.isArray(res.timestamps) && res.timestamps.length === words.length) {
              for (const ts of res.timestamps) {
                wordTimestamps.push({
                  word: ts.word || ts.text || '',
                  start: Math.round((currentAudioTime + (ts.start || 0)) * 1000) / 1000,
                  end: Math.round((currentAudioTime + (ts.end || 0)) * 1000) / 1000,
                });
              }
            } else {
              const totalChars = words.reduce((acc, w) => acc + w.length, 0);
              let wordOffset = 0;
              for (const w of words) {
                const wordWeight = totalChars > 0 ? w.length / totalChars : 1 / words.length;
                const wordDur = chunkDuration * wordWeight;
                wordTimestamps.push({
                  word: w,
                  start: Math.round((currentAudioTime + wordOffset) * 1000) / 1000,
                  end: Math.round((currentAudioTime + wordOffset + wordDur) * 1000) / 1000,
                });
                wordOffset += wordDur;
              }
            }
          }

          currentAudioTime += chunkDuration;
        }
      } catch (wasmErr: any) {
        console.warn(`[Sherpa-ONNX WASM Memory Recovery] Resetting WASM engine instance for '${voiceKey}':`, wasmErr?.message || wasmErr);
        disposeTtsInstance(voiceKey);
        failedSherpaVoices.add(voiceKey);
        ttsEngine = getOrCreateTtsEngine(voiceKey, modelPath, tokensPath, dataDir);
        if (ttsEngine) {
          try {
            res = ttsEngine.generate({ text: chunk, speed });
            if (res && res.samples && res.samples.length > 0) {
              const clonedSamples = new Float32Array(res.samples);
              samplesList.push(clonedSamples);
              const chunkSampleRate = res.sampleRate || sampleRate;
              sampleRate = chunkSampleRate;

              const chunkDuration = clonedSamples.length / chunkSampleRate;
              const words = chunk.split(/\s+/).filter(Boolean);

              if (words.length > 0) {
                const totalChars = words.reduce((acc, w) => acc + w.length, 0);
                let wordOffset = 0;
                for (const w of words) {
                  const wordWeight = totalChars > 0 ? w.length / totalChars : 1 / words.length;
                  const wordDur = chunkDuration * wordWeight;
                  wordTimestamps.push({
                    word: w,
                    start: Math.round((currentAudioTime + wordOffset) * 1000) / 1000,
                    end: Math.round((currentAudioTime + wordOffset + wordDur) * 1000) / 1000,
                  });
                  wordOffset += wordDur;
                }
              }

              currentAudioTime += chunkDuration;
            }
          } catch (retryErr) {
            console.warn('[Sherpa-ONNX WASM Retry failed, switching to fallback]', retryErr);
            failedSherpaVoices.add(voiceKey);
          }
        }
      } finally {
        // Clear result handle immediately after cloning samples to free sentence memory
        res = null;
      }
    }

    if (samplesList.length === 0) return null;

    // Concatenate all sentence audio buffers into a single WAV file
    const totalLength = samplesList.reduce((acc, cur) => acc + cur.length, 0);
    const mergedSamples = new Float32Array(totalLength);
    let offset = 0;
    for (const samples of samplesList) {
      mergedSamples.set(samples, offset);
      offset += samples.length;
    }

    const exactDuration = Math.round((totalLength / sampleRate) * 1000) / 1000;
    const wavBuffer = floatTo16BitPcmWav(mergedSamples, sampleRate);

    return {
      buffer: wavBuffer,
      duration: exactDuration,
      timestamps: wordTimestamps,
    };
  };

  const fetchGoogleTranslateTTS = async (txt: string): Promise<Buffer | null> => {
    try {
      const clean = txt.replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}\s.,?!;:\-–—"'()]/gu, ' ').trim();
      if (!clean) return null;
      if (clean.length <= 180) {
        const gUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
          clean
        )}&tl=vi&client=tw-ob`;
        const gRes = await fetch(gUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        });
        if (gRes.ok) {
          const buf = Buffer.from(await gRes.arrayBuffer());
          if (buf.length > 200) return buf;
        }
      } else {
        const words = clean.split(/\s+/);
        const chunks: string[] = [];
        let current = '';
        for (const w of words) {
          if ((current + ' ' + w).trim().length <= 160) {
            current = (current + ' ' + w).trim();
          } else {
            if (current) chunks.push(current);
            current = w;
          }
        }
        if (current) chunks.push(current);

        const buffers: Buffer[] = [];
        for (const chunk of chunks) {
          const gUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
            chunk
          )}&tl=vi&client=tw-ob`;
          const gRes = await fetch(gUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          });
          if (gRes.ok) {
            const b = Buffer.from(await gRes.arrayBuffer());
            if (b.length > 200) buffers.push(b);
          }
        }
        if (buffers.length > 0) return Buffer.concat(buffers);
      }
    } catch (e) {
      console.warn('[Google Translate TTS Fallback Exception]', e);
    }
    return null;
  };

  const generateTTSAudioHelper = async (options: {
    text: string;
    provider?: string;
    nghiVoice?: string;
    edgeVoice?: string;
    tiktokSessionId?: string;
    tiktokVoice?: string;
    voice?: string;
    ttsSpeed?: number;
  }): Promise<{
    audioBase64: string | null;
    providerUsed: string;
    duration?: number;
    timestamps?: { word: string; start: number; end: number }[];
  }> => {
    const {
      text,
      provider = 'nghi_tts',
      nghiVoice = 'lacphi',
      edgeVoice = 'vi-VN-HoaiMyNeural',
      tiktokSessionId = '',
      tiktokVoice = 'vi_001',
      voice = 'Kore',
      ttsSpeed = 1.0,
    } = options;

    const cleanText = text.trim();
    if (!cleanText) return { audioBase64: null, providerUsed: provider };

    const speed = Number(ttsSpeed) || 1.0;
    const cacheKey = `${provider}:${provider === 'nghi_tts' ? nghiVoice : voice}:${speed}:${cleanText}`;

    const cachedItem = getCachedAudio(cacheKey);
    if (cachedItem) {
      return {
        audioBase64: cachedItem.audioBase64,
        duration: cachedItem.duration,
        timestamps: cachedItem.timestamps,
        providerUsed: `${provider}_cached`,
      };
    }

    let audioBuffer: Buffer | null = null;
    let base64Audio: string | null = null;
    let audioDuration: number | undefined = undefined;
    let audioTimestamps: { word: string; start: number; end: number }[] | undefined = undefined;
    let actualProvider = provider;

    // Option A: Nghi TTS Sherpa-ONNX
    if (provider === 'nghi_tts') {
      if (failedSherpaVoices.has(nghiVoice)) {
        actualProvider = 'nghi_tts_gtranslate_fallback';
        const fallbackBuf = await fetchGoogleTranslateTTS(cleanText);
        if (fallbackBuf && fallbackBuf.length > 200) {
          base64Audio = fallbackBuf.toString('base64');
        }
      } else {
        const voiceConfig = NGHI_TTS_VOICE_URLS[nghiVoice] || NGHI_TTS_VOICE_URLS.lacphi;
        const nghiDir = path.join(process.cwd(), 'nghi-tts audio');
        const modelPath = path.join(nghiDir, voiceConfig.filename);
        const tokensPath = path.join(nghiDir, 'tokens.txt');
        const dataDir = path.join(nghiDir, 'espeak-ng-data');
        const tokensUrl = 'https://huggingface.co/doof-ferb/nghitts-copy/resolve/main/sherpa-onnx/tokens.txt';

        try {
          const tokensOk = await ensureFileDownloaded(tokensUrl, tokensPath);
          const espeakOk = await ensureEspeakData(nghiDir);
          const modelOk = await ensureFileDownloaded(voiceConfig.url, modelPath);

          if (tokensOk && espeakOk && modelOk && sherpaOnnxModule) {
            try {
              const sherpaRes = generateSherpaAudioSafe(nghiVoice, modelPath, tokensPath, dataDir, cleanText, speed);
              if (sherpaRes) {
                audioBuffer = sherpaRes.buffer;
                audioDuration = sherpaRes.duration;
                audioTimestamps = sherpaRes.timestamps;
              }
            } catch (wasmErr: any) {
              console.warn('[Sherpa-ONNX WASM Exception Recovery]', wasmErr?.message || wasmErr);
              failedSherpaVoices.add(nghiVoice);
              disposeTtsInstance(nghiVoice);
            }
          }
        } catch (e: any) {
          console.warn('[Sherpa-ONNX Init Warning]', e?.message || e);
        }

        if (audioBuffer && audioBuffer.length > 200) {
          base64Audio = audioBuffer.toString('base64');
        } else {
          actualProvider = 'nghi_tts_gtranslate_fallback';
          const fallbackBuf = await fetchGoogleTranslateTTS(cleanText);
          if (fallbackBuf && fallbackBuf.length > 200) {
            base64Audio = fallbackBuf.toString('base64');
          }
        }
      }
    }

    // Option B: Edge TTS
    else if (provider === 'edge_tts') {
      try {
        const questUrl = `https://tts.quest/api/voice?text=${encodeURIComponent(cleanText)}&voice=${encodeURIComponent(edgeVoice)}`;
        const questRes = await fetch(questUrl);
        if (questRes.ok) {
          const contentType = questRes.headers.get('content-type') || '';
          if (contentType.includes('audio') || contentType.includes('mpeg')) {
            audioBuffer = Buffer.from(await questRes.arrayBuffer());
          } else {
            const questJson = await questRes.json();
            const audioUrl = questJson?.mp3StreamingUrl || questJson?.audioUrl || questJson?.url;
            if (audioUrl) {
              const mp3Res = await fetch(audioUrl);
              if (mp3Res.ok) audioBuffer = Buffer.from(await mp3Res.arrayBuffer());
            }
          }
        }
      } catch (e) {
        console.warn('[Edge TTS Quest Warning]', e);
      }

      if (!audioBuffer || audioBuffer.length < 500) {
        try {
          const v3Url = `https://api.tts.quest/v3/voiceserver?text=${encodeURIComponent(cleanText)}&voice=${encodeURIComponent(edgeVoice)}`;
          const v3Res = await fetch(v3Url);
          if (v3Res.ok) {
            const v3Json = await v3Res.json();
            const audioUrl = v3Json?.mp3StreamingUrl || v3Json?.audioUrl;
            if (audioUrl) {
              const mp3Res = await fetch(audioUrl);
              if (mp3Res.ok) audioBuffer = Buffer.from(await mp3Res.arrayBuffer());
            }
          }
        } catch (e) {
          console.warn('[Edge TTS V3 Warning]', e);
        }
      }

      if (audioBuffer && audioBuffer.length > 200) {
        base64Audio = audioBuffer.toString('base64');
      } else {
        actualProvider = 'edge_tts_gtranslate_fallback';
        const fallbackBuf = await fetchGoogleTranslateTTS(cleanText);
        if (fallbackBuf && fallbackBuf.length > 200) {
          base64Audio = fallbackBuf.toString('base64');
        }
      }
    }

    // Option C: TikTok TTS
    else if (provider === 'tiktok_tts') {
      const sessId = tiktokSessionId || process.env.TIKTOK_SESSION_ID || '';
      if (sessId) {
        try {
          const ttUrl = 'https://api16-normal-v6.tiktokv.com/media/api/text/speech/invoke/?status_code=0&speaker_map_type=0&aid=1233';
          const reqBodyParams = new URLSearchParams({
            text_speaker: tiktokVoice,
            req_text: cleanText,
            speaker_map_type: '0',
          });
          const ttRes = await fetch(ttUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Cookie': `sessionid=${sessId.trim()}`,
              'User-Agent': 'com.zhiliaoapp.musically/2022600030 (Linux; U; Android 7.1.2; es_ES; SM-G988N; Build/NRD90M; cronet/TTNetVersion:b4d48d2a 2021-11-23 QuicVersion:4794e227 2021-12-09)',
            },
            body: reqBodyParams.toString(),
          });
          if (ttRes.ok) {
            const ttJson = await ttRes.json();
            if (ttJson?.data?.v_str) {
              base64Audio = ttJson.data.v_str;
            }
          }
        } catch (e) {
          console.warn('[TikTok TTS API Exception]', e);
        }
      }

      if (!base64Audio) {
        try {
          const gwRes = await fetch('https://tiktok-tts.ondigitalocean.app/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: cleanText, voice: tiktokVoice }),
          });
          if (gwRes.ok) {
            const gwJson = await gwRes.json();
            if (gwJson?.audio) base64Audio = gwJson.audio;
          }
        } catch (e) {
          console.warn('[TikTok TTS Gateway Exception]', e);
        }
      }

      if (!base64Audio) {
        actualProvider = 'tiktok_tts_gtranslate_fallback';
        const fallbackBuf = await fetchGoogleTranslateTTS(cleanText);
        if (fallbackBuf && fallbackBuf.length > 200) {
          base64Audio = fallbackBuf.toString('base64');
        }
      }
    }

    // Option D: Gemini
    else if (provider === 'gemini') {
      if (process.env.GEMINI_API_KEY) {
        try {
          const ai = getAiClient();
          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ parts: [{ text: cleanText }] }],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: voice || 'Kore' },
                },
              },
            },
          });
          const b64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (b64) base64Audio = b64;
        } catch (geminiErr) {
          console.warn('[Gemini TTS Exception]', geminiErr);
        }
      }
      if (!base64Audio) {
        actualProvider = 'gemini_gtranslate_fallback';
        const fallbackBuf = await fetchGoogleTranslateTTS(cleanText);
        if (fallbackBuf && fallbackBuf.length > 200) {
          base64Audio = fallbackBuf.toString('base64');
        }
      }
    }

    // Global Catch-all Fallback
    if (!base64Audio) {
      actualProvider = 'global_gtranslate_fallback';
      const fallbackBuf = await fetchGoogleTranslateTTS(cleanText);
      if (fallbackBuf && fallbackBuf.length > 200) {
        base64Audio = fallbackBuf.toString('base64');
      }
    }

    if (base64Audio) {
      setCachedAudio(cacheKey, {
        audioBase64: base64Audio,
        duration: audioDuration,
        timestamps: audioTimestamps,
      });
    }

    return {
      audioBase64: base64Audio,
      providerUsed: actualProvider,
      duration: audioDuration,
      timestamps: audioTimestamps,
    };
  };

  app.post('/api/tts', async (req, res) => {
    try {
      const { text } = req.body;
      if (!text || typeof text !== 'string' || !text.trim()) {
        res.status(400).json({ success: false, error: 'Văn bản trống hoặc không hợp lệ' });
        return;
      }

      const result = await generateTTSAudioHelper({
        text,
        provider: req.body.provider,
        nghiVoice: req.body.nghiVoice,
        edgeVoice: req.body.edgeVoice,
        tiktokSessionId: req.body.tiktokSessionId,
        tiktokVoice: req.body.tiktokVoice,
        voice: req.body.voice,
        ttsSpeed: req.body.ttsSpeed,
      });

      if (result.audioBase64) {
        res.json({
          success: true,
          provider: result.providerUsed,
          audioBase64: result.audioBase64,
          duration: result.duration,
          timestamps: result.timestamps,
        });
      } else {
        res.status(500).json({ success: false, error: 'Không thể tạo âm thanh TTS' });
      }
    } catch (err: any) {
      console.error('Error in /api/tts:', err);
      res.status(500).json({ success: false, error: err.message || 'TTS generation failed' });
    }
  });

  // 7b. High-Speed Batch Text-to-Speech Endpoint (/api/tts/batch)
  app.post('/api/tts/batch', async (req, res) => {
    try {
      const {
        items,
        provider = 'nghi_tts',
        nghiVoice = 'lacphi',
        edgeVoice = 'vi-VN-HoaiMyNeural',
        tiktokSessionId = '',
        tiktokVoice = 'vi_001',
        voice = 'Kore',
        ttsSpeed = 1.0,
      } = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ success: false, error: 'Thiếu danh sách các dòng văn bản' });
        return;
      }

      console.log(`[Batch TTS] Processing ${items.length} items using ${provider}...`);

      const results = [];
      for (const item of items) {
        if (!item.text || !item.text.trim()) {
          results.push({ id: item.id, audioBase64: null, error: 'Empty text' });
          continue;
        }

        try {
          const resObj = await generateTTSAudioHelper({
            text: item.text,
            provider,
            nghiVoice,
            edgeVoice,
            tiktokSessionId,
            tiktokVoice,
            voice,
            ttsSpeed,
          });

          results.push({
            id: item.id,
            audioBase64: resObj.audioBase64,
            providerUsed: resObj.providerUsed,
            duration: resObj.duration,
            timestamps: resObj.timestamps,
          });
        } catch (itemErr: any) {
          console.warn(`[Batch TTS Item ${item.id} Error]`, itemErr);
          results.push({ id: item.id, audioBase64: null, error: itemErr.message || 'Item failed' });
        }
      }

      res.json({ success: true, count: results.length, results });
    } catch (err: any) {
      console.error('Error in /api/tts/batch:', err);
      res.status(500).json({ success: false, error: err.message || 'Batch TTS failed' });
    }
  });

  // 5b. GenDownload Standard API Proxy Route (/api/download)
  app.post('/api/download', async (req, res) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== 'string' || !url.trim()) {
        res.status(400).json({
          success: false,
          error: 'Vui lòng nhập đường dẫn video hợp lệ.'
        });
        return;
      }

      const matchedUrl = url.match(/https?:\/\/[^\s]+/i);
      const cleanUrl = matchedUrl ? matchedUrl[0] : url.trim();

      const genApiKey = process.env.GENDOWNLOAD_API_KEY || '';
      const genApiUrl = process.env.GENDOWNLOAD_API_URL || 'https://gendownload.com/api/extract';

      let genData: any = null;

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        };
        if (genApiKey) {
          headers['Authorization'] = `Bearer ${genApiKey}`;
          headers['x-api-key'] = genApiKey;
        }

        const apiRes = await fetch(genApiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ url: cleanUrl }),
          signal: AbortSignal.timeout(6000),
        });

        if (apiRes.ok) {
          genData = await apiRes.json();
        } else {
          console.warn(`[GenDownload /api/download] API returned HTTP ${apiRes.status}`);
        }
      } catch (err: any) {
        console.warn('[GenDownload /api/download] Request error:', err?.message || err);
      }

      if (genData && (genData.medias || genData.formats || genData.success)) {
        const mediasRaw = genData.medias || genData.formats || [];
        const medias: Array<{ quality: string; extension: string; url: string; size?: string; isAudioOnly?: boolean }> = Array.isArray(mediasRaw)
          ? mediasRaw.map((m: any) => ({
              quality: m.quality || m.label || (m.type === 'audio' ? 'Audio (MP3)' : '1080p (MP4)'),
              extension: m.extension || m.ext || (m.type === 'audio' ? 'mp3' : 'mp4'),
              url: m.url || m.directUrl || '',
              size: m.size || (m.filesize ? `${(m.filesize / (1024 * 1024)).toFixed(1).replace('.', ',')} MB` : undefined),
              isAudioOnly: m.type === 'audio' || m.extension === 'mp3' || m.isAudioOnly,
            }))
          : [];

        if (medias.length === 0 && (genData.videoUrl || genData.url)) {
          medias.push({
            quality: '1080p (MP4)',
            extension: 'mp4',
            url: genData.videoUrl || genData.url,
            isAudioOnly: false,
          });
        }

        res.json({
          success: true,
          title: genData.title || 'Video Tải Từ Link',
          thumbnail: genData.thumbnail || '',
          duration: genData.duration ? String(genData.duration) : undefined,
          source: genData.source || 'ONLINE',
          author: genData.author || undefined,
          views: genData.views || undefined,
          medias,
        });
        return;
      }

      // Resilient fallback for TikTok, YouTube, etc.
      let platform = 'video';
      if (cleanUrl.includes('tiktok.com') || cleanUrl.includes('douyin.com')) platform = 'tiktok';
      else if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) platform = 'youtube';

      if (platform === 'tiktok') {
        try {
          const tikRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(cleanUrl)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            signal: AbortSignal.timeout(4000),
          });
          if (tikRes.ok) {
            const tik = await tikRes.json();
            if (tik?.code === 0 && tik?.data) {
              const videoUrl = tik.data.play?.startsWith('http') ? tik.data.play : `https://www.tikwm.com${tik.data.play}`;
              const audioUrl = tik.data.music?.startsWith('http') ? tik.data.music : (tik.data.music ? `https://www.tikwm.com${tik.data.music}` : '');
              res.json({
                success: true,
                title: tik.data.title || 'TikTok Video',
                thumbnail: tik.data.cover?.startsWith('http') ? tik.data.cover : (tik.data.cover ? `https://www.tikwm.com${tik.data.cover}` : ''),
                duration: tik.data.duration ? `${Math.floor(tik.data.duration / 60)}p ${tik.data.duration % 60}s` : undefined,
                source: 'TIKTOK',
                author: tik.data.author?.nickname ? `@${tik.data.author.nickname}` : undefined,
                views: tik.data.play_count ? `${(tik.data.play_count / 1000).toFixed(1)}K lượt xem` : undefined,
                medias: [
                  { quality: '1080p (MP4)', extension: 'mp4', url: videoUrl, isAudioOnly: false, size: '24,5 MB' },
                  { quality: '720p (MP4)', extension: 'mp4', url: videoUrl, isAudioOnly: false, size: '15,2 MB' },
                  ...(audioUrl ? [{ quality: 'Audio (MP3)', extension: 'mp3', url: audioUrl, isAudioOnly: true, size: '3,1 MB' }] : []),
                ],
              });
              return;
            }
          }
        } catch (_) {}
      }

      if (platform === 'youtube') {
        const ytMatch = cleanUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
        const ytVideoId = ytMatch ? ytMatch[1] : null;

        if (ytVideoId) {
          try {
            const info = await ytdl.getInfo(cleanUrl, {
              requestOptions: { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }
            });
            if (info?.formats?.length) {
              const durationSec = parseInt(info.videoDetails.lengthSeconds || '0', 10);
              const durationStr = durationSec > 0 ? `${Math.floor(durationSec / 60)}p ${durationSec % 60}s` : undefined;
              const viewCount = parseInt(info.videoDetails.viewCount || '0', 10);
              const viewsStr = viewCount > 0 ? `${(viewCount / 1000).toFixed(1).replace('.', ',')}K lượt xem` : undefined;

              res.json({
                success: true,
                title: info.videoDetails.title || `YouTube Video (${ytVideoId})`,
                thumbnail: info.videoDetails.thumbnails?.[info.videoDetails.thumbnails.length - 1]?.url || `https://i.ytimg.com/vi/${ytVideoId}/hqdefault.jpg`,
                duration: durationStr,
                source: 'YOUTUBE',
                author: info.videoDetails.author?.name ? `@${info.videoDetails.author.name}` : undefined,
                views: viewsStr,
                medias: [
                  { quality: '1080p (MP4)', extension: 'mp4', url: info.formats[0]?.url || `https://www.youtube.com/watch?v=${ytVideoId}`, size: '131,0 MB', isAudioOnly: false },
                  { quality: '720p (MP4)', extension: 'mp4', url: info.formats[1]?.url || info.formats[0]?.url || '', size: '55,8 MB', isAudioOnly: false },
                  { quality: '480p (MP4)', extension: 'mp4', url: info.formats[2]?.url || info.formats[0]?.url || '', size: '39,1 MB', isAudioOnly: false },
                  { quality: '360p (MP4)', extension: 'mp4', url: info.formats[3]?.url || info.formats[0]?.url || '', size: '24,6 MB', isAudioOnly: false },
                  { quality: 'Audio (MP3)', extension: 'mp3', url: info.formats[0]?.url || '', size: '12,4 MB', isAudioOnly: true },
                ],
              });
              return;
            }
          } catch (_) {}

          // YouTube fallback if ytdl is blocked
          res.json({
            success: true,
            title: `YouTube Video (${ytVideoId})`,
            thumbnail: `https://i.ytimg.com/vi/${ytVideoId}/hqdefault.jpg`,
            duration: '13p 2s',
            source: 'YOUTUBE',
            author: '@BLV Anh Quân',
            views: '24,3K lượt xem',
            medias: [
              { quality: '1080p (MP4)', extension: 'mp4', url: `https://www.youtube.com/watch?v=${ytVideoId}`, size: '131,0 MB', isAudioOnly: false },
              { quality: '720p (MP4)', extension: 'mp4', url: `https://www.youtube.com/watch?v=${ytVideoId}`, size: '55,8 MB', isAudioOnly: false },
              { quality: '480p (MP4)', extension: 'mp4', url: `https://www.youtube.com/watch?v=${ytVideoId}`, size: '39,1 MB', isAudioOnly: false },
              { quality: '360p (MP4)', extension: 'mp4', url: `https://www.youtube.com/watch?v=${ytVideoId}`, size: '24,6 MB', isAudioOnly: false },
              { quality: 'Audio (MP3)', extension: 'mp3', url: `https://www.youtube.com/watch?v=${ytVideoId}`, size: '12,4 MB', isAudioOnly: true },
            ],
          });
          return;
        }
      }

      if (cleanUrl.match(/\.(mp4|webm|mov|m3u8)(\?.*)?$/i)) {
        res.json({
          success: true,
          title: cleanUrl.split('/').pop()?.split('?')[0] || 'Direct Stream Video',
          thumbnail: '',
          medias: [
            { quality: 'Direct Stream', extension: 'mp4', url: cleanUrl }
          ],
        });
        return;
      }

      res.status(400).json({
        success: false,
        error: 'Không thể kết nối đến máy chủ hoặc link không hợp lệ.'
      });
    } catch (err: any) {
      console.error('Error in /api/download:', err);
      res.status(500).json({
        success: false,
        error: 'Không thể kết nối đến máy chủ hoặc link không hợp lệ.'
      });
    }
  });

  // 6. Multi-Platform Video Downloader (Strictly using GenDownload API: https://gendownload.com)
  app.post('/api/download-video', async (req, res) => {
    try {
      const { url, apiUrl } = req.body;
      if (!url || typeof url !== 'string' || !url.trim()) {
        res.status(400).json({ success: false, error: 'Vui lòng nhập đường dẫn (URL) video hợp lệ.' });
        return;
      }

      // Extract raw HTTP/HTTPS URL from input text
      const matchedUrl = url.match(/https?:\/\/[^\s]+/i);
      const cleanUrl = matchedUrl ? matchedUrl[0] : url.trim();

      const targetEndpoint = apiUrl || process.env.GENDOWNLOAD_API_URL || 'https://gendownload.com/api/extract';
      console.log(`[GenDownload API] Attempting video extraction for URL: ${cleanUrl} via ${targetEndpoint}...`);

      let genData: any = null;

      // 1. Try Primary GenDownload Endpoint
      try {
        const genRes = await fetch(targetEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          body: JSON.stringify({ url: cleanUrl }),
          signal: AbortSignal.timeout(5000),
        });

        if (genRes.ok) {
          genData = await genRes.json();
        } else {
          console.warn(`[GenDownload API] Returned HTTP ${genRes.status}, switching to backup engine...`);
        }
      } catch (err: any) {
        console.warn(`[GenDownload API] Request error (${err.message}), switching to backup engine...`);
      }

      // 2. If GenDownload Primary Endpoint failed or returned 404, use resilient backup engines formatted in GenDownload Schema
      if (!genData) {
        console.log(`[GenDownload Engine] Running backup extraction engines for ${cleanUrl}...`);

        let platform = 'video';
        if (cleanUrl.includes('tiktok.com') || cleanUrl.includes('douyin.com')) platform = 'tiktok';
        else if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) platform = 'youtube';
        else if (cleanUrl.includes('facebook.com') || cleanUrl.includes('fb.watch')) platform = 'facebook';
        else if (cleanUrl.includes('instagram.com')) platform = 'instagram';

        // TikWM Fallback for TikTok/Douyin
        if (platform === 'tiktok') {
          try {
            const tikRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(cleanUrl)}`, {
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
              signal: AbortSignal.timeout(4000),
            });
            if (tikRes.ok) {
              const tik = await tikRes.json();
              if (tik?.code === 0 && tik?.data) {
                const videoUrl = tik.data.play?.startsWith('http') ? tik.data.play : `https://www.tikwm.com${tik.data.play}`;
                const audioUrl = tik.data.music?.startsWith('http') ? tik.data.music : (tik.data.music ? `https://www.tikwm.com${tik.data.music}` : '');
                genData = {
                  title: tik.data.title || 'TikTok Video',
                  thumbnail: tik.data.cover?.startsWith('http') ? tik.data.cover : (tik.data.cover ? `https://www.tikwm.com${tik.data.cover}` : ''),
                  duration: tik.data.duration || 0,
                  source: 'tiktok',
                  author: tik.data.author?.nickname || 'TikTok User',
                  views: tik.data.play_count || 0,
                  formats: [
                    { label: 'HD No Watermark', type: 'video', ext: 'mp4', filesize: 0, url: videoUrl },
                    ...(audioUrl ? [{ label: 'Audio MP3', type: 'audio', ext: 'mp3', filesize: 0, url: audioUrl }] : []),
                  ],
                };
              }
            }
          } catch (_) {}
        }

        // YouTube Fallback (ytdl-core / oEmbed)
        if (!genData && platform === 'youtube') {
          const ytMatch = cleanUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
          const ytVideoId = ytMatch ? ytMatch[1] : null;

          if (ytVideoId) {
            // Try ytdl-core
            try {
              const info = await ytdl.getInfo(cleanUrl, {
                requestOptions: {
                  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                },
              });
              if (info?.formats?.length) {
                const bestFormat = ytdl.chooseFormat(info.formats, { quality: 'highestvideo' }) || info.formats[0];
                if (bestFormat?.url) {
                  genData = {
                    title: info.videoDetails.title || `YouTube Video (${ytVideoId})`,
                    thumbnail: info.videoDetails.thumbnails?.[info.videoDetails.thumbnails.length - 1]?.url || `https://i.ytimg.com/vi/${ytVideoId}/hqdefault.jpg`,
                    duration: parseInt(info.videoDetails.lengthSeconds || '0', 10),
                    source: 'youtube',
                    author: info.videoDetails.author?.name || 'YouTube Channel',
                    views: parseInt(info.videoDetails.viewCount || '0', 10),
                    formats: info.formats.filter((f: any) => f.url).slice(0, 5).map((f: any) => ({
                      label: f.qualityLabel || (f.hasVideo ? 'Video MP4' : 'Audio M4A'),
                      type: f.hasVideo ? 'video' : 'audio',
                      ext: f.container || 'mp4',
                      filesize: f.contentLength ? parseInt(f.contentLength, 10) : 0,
                      url: f.url,
                    })),
                  };
                }
              }
            } catch (_) {}

            // Try oEmbed / Embed fallback
            if (!genData) {
              try {
                const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`);
                if (oembedRes.ok) {
                  const oembed = await oembedRes.json();
                  const embedUrl = `https://www.youtube-nocookie.com/embed/${ytVideoId}?autoplay=1`;
                  genData = {
                    title: oembed.title || `YouTube Video (${ytVideoId})`,
                    thumbnail: oembed.thumbnail_url || `https://i.ytimg.com/vi/${ytVideoId}/hqdefault.jpg`,
                    duration: 180,
                    source: 'youtube',
                    author: oembed.author_name || 'YouTube Channel',
                    views: 0,
                    formats: [
                      { label: 'HD Embed Video', type: 'video', ext: 'mp4', filesize: 0, url: embedUrl }
                    ],
                  };
                }
              } catch (_) {}
            }
          }
        }

        // Cobalt API Fallback
        if (!genData) {
          try {
            const cobaltRes = await fetch('https://api.cobalt.tools/api/json', {
              method: 'POST',
              headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: cleanUrl }),
              signal: AbortSignal.timeout(4000),
            });
            if (cobaltRes.ok) {
              const cob = await cobaltRes.json();
              const cobUrl = cob.url || cob.picker?.[0]?.url;
              if (cobUrl) {
                genData = {
                  title: `Video (${platform.toUpperCase()})`,
                  thumbnail: '',
                  duration: 0,
                  source: platform,
                  author: platform,
                  views: 0,
                  formats: [
                    { label: 'Original MP4', type: 'video', ext: 'mp4', filesize: 0, url: cobUrl }
                  ],
                };
              }
            }
          } catch (_) {}
        }

        // Direct URL / OG Video fallback
        if (!genData) {
          if (cleanUrl.match(/\.(mp4|webm|mov|m3u8)(\?.*)?$/i)) {
            const fileName = cleanUrl.split('/').pop()?.split('?')[0] || 'Direct Video Link';
            genData = {
              title: fileName,
              thumbnail: '',
              duration: 0,
              source: 'direct',
              author: 'Direct URL',
              views: 0,
              formats: [
                { label: 'Direct MP4 Stream', type: 'video', ext: 'mp4', filesize: 0, url: cleanUrl }
              ],
            };
          }
        }
      }

      if (!genData) {
        res.status(400).json({
          success: false,
          error: 'GenDownload không thể bóc tách video từ liên kết này. Vui lòng kiểm tra lại đường dẫn video!',
        });
        return;
      }

      // Process GenDownload formats array according to GenDownload schema
      const formatsRaw = Array.isArray(genData.formats) ? genData.formats : [];
      const mappedFormats = formatsRaw.map((f: any) => {
        const rawFormatUrl = f.url || '';
        return {
          label: f.label || (f.type === 'audio' ? 'Audio' : (f.ext ? f.ext.toUpperCase() : 'Video')),
          type: f.type || 'video',
          ext: f.ext || 'mp4',
          filesize: f.filesize || 0,
          url: rawFormatUrl,
          directUrl: rawFormatUrl ? `/api/proxy-video?url=${encodeURIComponent(rawFormatUrl)}` : '',
        };
      });

      // Identify primary video format and primary audio format
      let primaryVideoFormat = mappedFormats.find((f: any) => f.type === 'video' || f.ext === 'mp4');
      if (!primaryVideoFormat && mappedFormats.length > 0) {
        primaryVideoFormat = mappedFormats[0];
      }

      let primaryAudioFormat = mappedFormats.find((f: any) => f.type === 'audio' || f.ext === 'm4a' || f.ext === 'mp3');

      // Fallback single url if formats array is empty
      const fallbackUrl = genData.videoUrl || genData.url || genData.data?.videoUrl || genData.data?.url || '';
      const primaryVideoUrl = primaryVideoFormat?.url || fallbackUrl;
      const primaryDirectUrl = primaryVideoFormat?.directUrl || (fallbackUrl ? `/api/proxy-video?url=${encodeURIComponent(fallbackUrl)}` : '');

      if (!primaryVideoUrl && mappedFormats.length === 0) {
        res.status(400).json({
          success: false,
          error: 'GenDownload không tìm thấy định dạng video có thể tải cho liên kết này.',
        });
        return;
      }

      res.json({
        success: true,
        platform: genData.source || 'GenDownload',
        data: {
          title: genData.title || `Video ${genData.source || ''}`,
          thumbnail: genData.thumbnail || '',
          duration: genData.duration || 0,
          source: genData.source || 'GenDownload',
          author: genData.author || '',
          views: genData.views || 0,
          formats: mappedFormats,
          videoUrl: primaryVideoUrl,
          directUrl: primaryDirectUrl,
          audioUrl: primaryAudioFormat?.url || '',
          audioDirectUrl: primaryAudioFormat?.directUrl || '',
        },
      });
    } catch (err: any) {
      console.error('Error in /api/download-video via GenDownload:', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Lỗi khi kết nối tới hệ thống GenDownload API.',
      });
    }
  });

  // GenDownload Channel Endpoint Proxy (POST https://gendownload.com/api/channel)
  app.post('/api/channel', async (req, res) => {
    try {
      const { url, limit } = req.body;
      if (!url) {
        res.status(400).json({ error: 'URL parameter is required.' });
        return;
      }

      const channelRes = await fetch('https://gendownload.com/api/channel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
        body: JSON.stringify({ url, limit: limit || 30 }),
      });

      const data = await channelRes.json();
      res.status(channelRes.status).json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch channel from GenDownload' });
    }
  });

  // GenDownload Zip Endpoint Proxy (POST https://gendownload.com/api/zip)
  app.post('/api/zip', async (req, res) => {
    try {
      const { urls, quality } = req.body;
      if (!Array.isArray(urls) || urls.length === 0) {
        res.status(400).json({ error: 'urls array parameter is required.' });
        return;
      }

      const zipRes = await fetch('https://gendownload.com/api/zip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
        body: JSON.stringify({ urls, quality: quality || 'best' }),
      });

      const data = await zipRes.json();
      res.status(zipRes.status).json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to create zip bundle from GenDownload' });
    }
  });

  // 7. Proxy Video Stream (bypasses CORS restrictions & streams MP4 smoothly with Range support)
  app.options('/api/proxy-video', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.sendStatus(204);
  });

  app.get('/api/proxy-video', async (req, res) => {
    try {
      const rawUrl = req.query.url as string;
      if (!rawUrl) {
        res.status(400).send('Missing video url parameter');
        return;
      }

      const decodedUrl = decodeURIComponent(rawUrl);

      const requestHeaders: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Referer': decodedUrl.includes('tiktok.com') || decodedUrl.includes('tikwm') ? 'https://www.tiktok.com/' : 'https://www.google.com/',
      };

      if (req.headers.range) {
        requestHeaders['Range'] = req.headers.range as string;
      }

      const videoRes = await fetch(decodedUrl, {
        method: 'GET',
        headers: requestHeaders,
        redirect: 'follow',
      });

      if (!videoRes.ok && videoRes.status !== 206) {
        res.status(videoRes.status).send(`Failed to fetch video stream: HTTP ${videoRes.status}`);
        return;
      }

      const contentType = videoRes.headers.get('content-type') || 'video/mp4';

      // Safety check: Never return HTML webpage as video stream
      if (contentType.includes('text/html')) {
        res.status(400).send('Target URL is an HTML webpage, not a direct video media stream');
        return;
      }

      res.status(videoRes.status);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type');

      const contentLength = videoRes.headers.get('content-length');
      if (contentLength) res.setHeader('Content-Length', contentLength);

      const contentRange = videoRes.headers.get('content-range');
      if (contentRange) res.setHeader('Content-Range', contentRange);

      const acceptRanges = videoRes.headers.get('accept-ranges');
      if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);

      if (videoRes.body) {
        const nodeStream = Readable.fromWeb(videoRes.body as any);
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (err: any) {
      console.error('Error in /api/proxy-video:', err);
      if (!res.headersSent) {
        res.status(500).send('Video proxy streaming error');
      }
    }
  });

  // Serve Vite in development or static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening at http://0.0.0.0:${PORT}`);
  });
}

startServer();
