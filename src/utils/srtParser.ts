import { SubtitleItem } from '../types';

export function formatTimeSRT(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  const pad = (num: number, size = 2) => num.toString().padStart(size, '0');
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${pad(hrs)}:${pad(mins)}:${pad(secs)},${pad(ms, 3)}`;
}

export function formatTimeVTT(seconds: number): string {
  return formatTimeSRT(seconds).replace(',', '.');
}

export function formatTimeShort(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  const pad = (num: number) => num.toString().padStart(2, '0');
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${pad(mins)}:${pad(secs)}.${ms}`;
}

export function exportToSRT(subtitles: SubtitleItem[]): string {
  return subtitles
    .map((sub, index) => {
      const text = sub.translatedText || sub.originalText;
      return `${index + 1}\n${formatTimeSRT(sub.startTime)} --> ${formatTimeSRT(sub.endTime)}\n${text}\n`;
    })
    .join('\n');
}

export function exportToVTT(subtitles: SubtitleItem[]): string {
  let content = 'WEBVTT\n\n';
  content += subtitles
    .map((sub, index) => {
      const text = sub.translatedText || sub.originalText;
      return `${index + 1}\n${formatTimeVTT(sub.startTime)} --> ${formatTimeVTT(sub.endTime)}\n${text}\n`;
    })
    .join('\n');
  return content;
}

export function exportToTXT(subtitles: SubtitleItem[]): string {
  return subtitles
    .map((sub) => {
      const time = `[${formatTimeShort(sub.startTime)} - ${formatTimeShort(sub.endTime)}]`;
      return `${time}\n${sub.translatedText || sub.originalText}\n`;
    })
    .join('\n');
}

export function parseSRT(srtContent: string): SubtitleItem[] {
  const items: SubtitleItem[] = [];
  const blocks = srtContent.trim().split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length >= 2) {
      let timeLineIdx = lines.findIndex((l) => l.includes('-->'));
      if (timeLineIdx !== -1) {
        const timeParts = lines[timeLineIdx].split('-->');
        if (timeParts.length === 2) {
          const startTime = parseTimeToSeconds(timeParts[0].trim());
          const endTime = parseTimeToSeconds(timeParts[1].trim());
          const text = lines.slice(timeLineIdx + 1).join('\n');

          items.push({
            id: `imported-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            startTime,
            endTime,
            originalText: text,
            translatedText: text,
          });
        }
      }
    }
  }

  return normalizeSubtitles(items);
}

export function normalizeSubtitles(subs: SubtitleItem[]): SubtitleItem[] {
  if (!subs || subs.length === 0) return [];

  // 1. Remove empty items
  const valid = subs.filter(
    (s) =>
      (s.originalText && s.originalText.trim().length > 0) ||
      (s.translatedText && s.translatedText.trim().length > 0)
  );

  // 2. Sort strictly by startTime ascending
  valid.sort((a, b) => a.startTime - b.startTime);

  // 3. Deduplicate and merge overlapping or adjacent items with identical/similar text
  const merged: SubtitleItem[] = [];
  for (const item of valid) {
    if (merged.length === 0) {
      merged.push({ ...item });
      continue;
    }

    const prev = merged[merged.length - 1];
    const origA = (prev.originalText || '').trim().toLowerCase();
    const origB = (item.originalText || '').trim().toLowerCase();

    const isExactMatch = origA === origB;
    const isSubstring =
      origA.length > 3 &&
      origB.length > 3 &&
      (origA.includes(origB) || origB.includes(origA));
    const isOverlappingOrClose = item.startTime <= prev.endTime + 1.2;

    if ((isExactMatch || isSubstring) && isOverlappingOrClose) {
      // Merge into previous item
      prev.endTime = Math.max(prev.endTime, item.endTime);
      if (!prev.translatedText && item.translatedText) {
        prev.translatedText = item.translatedText;
      }
    } else {
      merged.push({ ...item });
    }
  }

  // 4. Adjust end times so no item overlaps into the next item's start time
  for (let i = 0; i < merged.length; i++) {
    const curr = merged[i];
    if (i < merged.length - 1) {
      const next = merged[i + 1];
      if (curr.endTime >= next.startTime) {
        // Trim current subtitle right before next subtitle begins
        curr.endTime = Math.max(
          curr.startTime + 0.3,
          Number((next.startTime - 0.05).toFixed(2))
        );
      }
    }
    // Ensure minimum duration of 0.4s
    if (curr.endTime <= curr.startTime) {
      curr.endTime = Number((curr.startTime + 0.5).toFixed(2));
    }
  }

  return merged;
}

function parseTimeToSeconds(timeStr: string): number {
  const cleaned = timeStr.replace(',', '.');
  const parts = cleaned.split(':');
  if (parts.length === 3) {
    const hrs = parseFloat(parts[0]);
    const mins = parseFloat(parts[1]);
    const secs = parseFloat(parts[2]);
    return hrs * 3600 + mins * 60 + secs;
  } else if (parts.length === 2) {
    const mins = parseFloat(parts[0]);
    const secs = parseFloat(parts[1]);
    return mins * 60 + secs;
  }
  return 0;
}

export function wrapSubtitleText(
  text: string,
  orientation: 'horizontal' | 'vertical' = 'horizontal',
  maxCharsH: number = 65,
  maxCharsV: number = 36
): string {
  if (!text) return '';
  const limit = Math.max(3, orientation === 'vertical' ? (maxCharsV || 36) : (maxCharsH || 65));

  const rawLines = text.split('\n');
  const finalLines: string[] = [];

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const pushWithLimit = (str: string) => {
      let remaining = str;
      while (remaining.length > limit) {
        finalLines.push(remaining.slice(0, limit));
        remaining = remaining.slice(limit);
      }
      if (remaining.length > 0) {
        finalLines.push(remaining);
      }
    };

    if (trimmed.length <= limit) {
      finalLines.push(trimmed);
      continue;
    }

    const hasSpaces = trimmed.includes(' ');

    if (orientation === 'vertical' || !hasSpaces) {
      pushWithLimit(trimmed);
    } else {
      const words = trimmed.split(/\s+/);
      let currentLine = '';

      for (const word of words) {
        if (!word) continue;

        if (word.length > limit) {
          if (currentLine) {
            finalLines.push(currentLine);
            currentLine = '';
          }
          pushWithLimit(word);
          continue;
        }

        const candidate = currentLine ? `${currentLine} ${word}` : word;
        if (candidate.length <= limit) {
          currentLine = candidate;
        } else {
          if (currentLine) finalLines.push(currentLine);
          currentLine = word;
        }
      }
      if (currentLine) {
        finalLines.push(currentLine);
      }
    }
  }

  return finalLines.join('\n');
}
