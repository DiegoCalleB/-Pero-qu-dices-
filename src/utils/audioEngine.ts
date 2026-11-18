import { COMEDY_VERDICTS } from '../data/decks';

let sharedAudioCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!sharedAudioCtx) {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedAudioCtx = new AudioContextClass();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume();
  }
  return sharedAudioCtx;
}

/**
 * Synthesizes crisp UI sound effects using Web Audio API oscillators.
 */
export function playUiSound(
  type: 'recordStart' | 'recordStop' | 'rewind' | 'reveal' | 'fanfare' | 'tick'
): void {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    if (type === 'recordStart') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.14);
    } else if (type === 'recordStop') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(740, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.14);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === 'rewind') {
      // Cassette tape rewindchirp
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(1400, now + 0.18);
      osc.frequency.exponentialRampToValueAtTime(480, now + 0.32);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.34);
    } else if (type === 'reveal') {
      const freqs = [523.25, 659.25, 783.99, 1046.5];
      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now + idx * 0.06);
        gain.gain.setValueAtTime(0.12, now + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.06);
        osc.stop(now + idx * 0.06 + 0.29);
      });
    } else if (type === 'fanfare') {
      const notes = [440, 554.37, 659.25, 880];
      notes.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now + idx * 0.09);
        gain.gain.setValueAtTime(0.14, now + idx * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.09);
        osc.stop(now + idx * 0.09 + 0.36);
      });
    } else if (type === 'tick') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(900, now);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.045);
    }
  } catch {
    // Ignore audio context restrictions before user interaction
  }
}

/**
 * Trims leading and trailing silence from a mono Float32Array so reversed audio starts cleanly.
 */
export function trimSilence(samples: Float32Array, sampleRate: number, threshold = 0.015): Float32Array {
  let start = 0;
  let end = samples.length - 1;

  while (start < samples.length && Math.abs(samples[start]) < threshold) {
    start++;
  }
  while (end > start && Math.abs(samples[end]) < threshold) {
    end--;
  }

  // Keep a tiny 60ms cushion at both ends
  const pad = Math.floor(sampleRate * 0.06);
  start = Math.max(0, start - pad);
  end = Math.min(samples.length - 1, end + pad);

  if (end - start < sampleRate * 0.35) {
    // If almost silent or too short, return original
    return samples;
  }

  return samples.slice(start, end + 1);
}

/**
 * Normalizes peak amplitude to 0.92 for loud, clear playback around a noisy dinner table.
 */
export function normalizeSamples(samples: Float32Array): Float32Array {
  let maxPeak = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > maxPeak) maxPeak = abs;
  }
  if (maxPeak < 0.005) return samples;
  const scale = 0.92 / maxPeak;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    out[i] = Math.max(-1, Math.min(1, samples[i] * scale));
  }
  return out;
}

/**
 * Reverses an AudioBuffer in place into a new AudioBuffer.
 */
export function reverseAudioBuffer(buffer: AudioBuffer): AudioBuffer {
  const ctx = getAudioContext();
  const reversed = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = reversed.getChannelData(ch);
    const len = src.length;
    for (let i = 0; i < len; i++) {
      dst[i] = src[len - 1 - i];
    }
  }
  return reversed;
}

/**
 * Extracts normalized waveform bar peaks (0..1) for Canvas visualization.
 */
export function extractWaveformPeaks(buffer: AudioBuffer | null, barCount = 56): number[] {
  if (!buffer || buffer.length === 0) {
    return Array.from({ length: barCount }, () => 0.08);
  }
  const data = buffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(data.length / barCount));
  const peaks: number[] = [];
  let maxVal = 0.01;

  for (let i = 0; i < barCount; i++) {
    const start = i * blockSize;
    let sum = 0;
    let count = 0;
    for (let j = 0; j < blockSize && start + j < data.length; j++) {
      const val = Math.abs(data[start + j]);
      if (val > sum) sum = val;
      count++;
    }
    const peak = count > 0 ? sum : 0.05;
    if (peak > maxVal) maxVal = peak;
    peaks.push(peak);
  }

  return peaks.map((p) => Math.max(0.08, Math.min(1, p / maxVal)));
}

/**
 * Plays an AudioBuffer at a chosen speed (e.g. 1.0x or 0.72x slow-mo) and reports progress.
 */
export function playAudioBuffer(
  buffer: AudioBuffer,
  rate = 1.0,
  onProgress?: (ratio: number) => void,
  onEnded?: () => void
): { stop: () => void } {
  const ctx = getAudioContext();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = rate;

  const gainNode = ctx.createGain();
  gainNode.gain.value = 1.0;

  source.connect(gainNode);
  gainNode.connect(ctx.destination);

  const durationSec = buffer.duration / rate;
  const startedAt = ctx.currentTime;
  let rafId = 0;
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    const elapsed = ctx.currentTime - startedAt;
    const ratio = Math.min(1, Math.max(0, elapsed / durationSec));
    if (onProgress) onProgress(ratio);
    if (ratio < 1) {
      rafId = requestAnimationFrame(tick);
    }
  };

  source.onended = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(rafId);
    if (onProgress) onProgress(1);
    if (onEnded) onEnded();
  };

  source.start(0);
  rafId = requestAnimationFrame(tick);

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(rafId);
      try {
        source.stop();
      } catch {
        // Ignore if already stopped
      }
    },
  };
}

/**
 * Live Microphone Recorder using Web Audio API PCM capture for 100% cross-browser reliability.
 */
export class LiveMicRecorder {
  private stream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  private sampleRate = 44100;
  private isRecording = false;
  private onLevelCallback?: (rms: number, livePeaks: number[]) => void;
  private rollingPeaks: number[] = Array.from({ length: 56 }, () => 0.08);

  async start(onLevel?: (rms: number, livePeaks: number[]) => void): Promise<void> {
    const ctx = getAudioContext();
    this.sampleRate = ctx.sampleRate;
    this.chunks = [];
    this.onLevelCallback = onLevel;
    this.rollingPeaks = Array.from({ length: 56 }, () => 0.08);

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
      },
    });

    this.sourceNode = ctx.createMediaStreamSource(this.stream);
    this.processorNode = ctx.createScriptProcessor(2048, 1, 1);
    this.isRecording = true;

    this.processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
      if (!this.isRecording) return;
      const input = event.inputBuffer.getChannelData(0);
      const copy = new Float32Array(input.length);
      copy.set(input);
      this.chunks.push(copy);

      // Compute RMS level for live waveform feedback
      let sumSq = 0;
      let maxSample = 0;
      for (let i = 0; i < input.length; i++) {
        sumSq += input[i] * input[i];
        const abs = Math.abs(input[i]);
        if (abs > maxSample) maxSample = abs;
      }
      const rms = Math.sqrt(sumSq / input.length);
      const normalizedPeak = Math.min(1, Math.max(0.08, maxSample * 1.8));
      this.rollingPeaks = [...this.rollingPeaks.slice(1), normalizedPeak];

      if (this.onLevelCallback) {
        this.onLevelCallback(rms, this.rollingPeaks);
      }
    };

    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(ctx.destination);
    playUiSound('recordStart');
  }

  stop(): AudioBuffer {
    this.isRecording = false;
    playUiSound('recordStop');

    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }

    const totalLen = this.chunks.reduce((acc, c) => acc + c.length, 0);
    const merged = new Float32Array(totalLen);
    let offset = 0;
    for (const chunk of this.chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    const trimmed = normalizeSamples(trimSilence(merged, this.sampleRate));
    const ctx = getAudioContext();
    const finalLength = Math.max(trimmed.length, Math.floor(this.sampleRate * 0.5));
    const audioBuffer = ctx.createBuffer(1, finalLength, this.sampleRate);
    audioBuffer.getChannelData(0).set(trimmed.slice(0, finalLength));
    return audioBuffer;
  }
}

/**
 * Generates a realistic formant-voiced AudioBuffer for instant Demo / No-Mic testing.
 * Models syllable cadence, pitch inflections, and vowel formants of the target phrase.
 */
export function synthesizeDemoPhraseBuffer(
  phrase: string,
  mode: 'original' | 'imitation'
): AudioBuffer {
  const ctx = getAudioContext();
  const sampleRate = ctx.sampleRate;
  const words = phrase.trim().split(/\s+/);
  // Estimate syllables (~2.2 per Spanish word)
  const syllableCount = Math.max(4, Math.min(18, Math.round(words.length * 2.3)));
  const syllableDur = 0.21;
  const durationSec = Math.max(1.6, Math.min(4.2, syllableCount * syllableDur + 0.3));
  const totalSamples = Math.floor(sampleRate * durationSec);
  const buffer = ctx.createBuffer(1, totalSamples, sampleRate);
  const data = buffer.getChannelData(0);

  // Vowels formant frequencies (Spanish A, E, I, O, U approximations)
  const formants = [
    [730, 1090],
    [530, 1840],
    [390, 2290],
    [570, 840],
    [320, 870],
  ];

  const basePitch = mode === 'original' ? 145 : 162;

  for (let s = 0; s < syllableCount; s++) {
    const sylStart = Math.floor((s * syllableDur + 0.12) * sampleRate);
    const sylLen = Math.floor(syllableDur * 0.82 * sampleRate);
    const charCode = phrase.charCodeAt(s % phrase.length) || 65;
    const [f1, f2] = formants[(charCode + s) % formants.length];
    const pitchShift = 1 + Math.sin(s * 1.3) * 0.14 + (mode === 'imitation' ? Math.cos(s) * 0.08 : 0);
    const f0 = basePitch * pitchShift;

    for (let i = 0; i < sylLen && sylStart + i < totalSamples; i++) {
      const t = i / sampleRate;
      const env = Math.sin((Math.PI * i) / sylLen); // smooth syllable envelope
      const glottal =
        0.5 * Math.sin(2 * Math.PI * f0 * t) +
        0.25 * Math.sin(2 * Math.PI * f0 * 2 * t) +
        0.15 * Math.sin(2 * Math.PI * f1 * t) +
        0.1 * Math.sin(2 * Math.PI * f2 * t);
      data[sylStart + i] = glottal * env * 0.85;
    }
  }

  // If generating the imitation buffer, reverse the envelope Order so that when reversed back it matches!
  if (mode === 'imitation') {
    const rev = reverseAudioBuffer(buffer);
    return rev;
  }

  return buffer;
}

/**
 * Compares the Original AudioBuffer and the Final Reversed Imitation AudioBuffer.
 * Returns a 0-100 similarity score and comedy verdict.
 */
export function calculateAcousticSimilarity(
  original: AudioBuffer,
  finalResult: AudioBuffer
): {
  score: number;
  verdictTitle: string;
  verdictDetail: string;
  badge: string;
} {
  const bins = 28;
  const origPeaks = extractWaveformPeaks(original, bins);
  const finalPeaks = extractWaveformPeaks(finalResult, bins);

  // 1. Duration similarity (0..1)
  const durRatio =
    Math.min(original.duration, finalResult.duration) /
    Math.max(0.2, Math.max(original.duration, finalResult.duration));
  const durationScore = Math.pow(durRatio, 0.55);

  // 2. Envelope shape correlation across 28 bins
  let diffSum = 0;
  for (let i = 0; i < bins; i++) {
    diffSum += Math.abs(origPeaks[i] - finalPeaks[i]);
  }
  const avgDiff = diffSum / bins;
  const envelopeScore = Math.max(0, 1 - avgDiff * 1.15);

  // Combine into an encouraging, realistic party score between 28 and 96
  const raw = durationScore * 0.42 + envelopeScore * 0.58;
  const scaled = Math.round(Math.min(97, Math.max(24, raw * 92 + 12)));

  const matchedVerdict =
    COMEDY_VERDICTS.find((v) => scaled >= v.minScore) || COMEDY_VERDICTS[COMEDY_VERDICTS.length - 1];

  return {
    score: scaled,
    verdictTitle: matchedVerdict.title,
    verdictDetail: matchedVerdict.detail,
    badge: matchedVerdict.badge,
  };
}

/**
 * Stitches Original + Reversed Alien + Final Reversed Result into a single downloadable WAV Blob URL.
 */
export function exportCombinedRoundWav(
  original: AudioBuffer,
  reversedOriginal: AudioBuffer,
  finalReversed: AudioBuffer
): string {
  const sampleRate = original.sampleRate;
  const gapSamples = Math.floor(sampleRate * 0.35);
  const d1 = original.getChannelData(0);
  const d2 = reversedOriginal.getChannelData(0);
  const d3 = finalReversed.getChannelData(0);

  const totalSamples = d1.length + gapSamples + d2.length + gapSamples + d3.length;
  const combined = new Float32Array(totalSamples);

  // Generate a tiny transition beep inside the gap
  const makeBeep = (target: Float32Array, offset: number) => {
    const beepLen = Math.floor(sampleRate * 0.1);
    for (let i = 0; i < beepLen && offset + i < target.length; i++) {
      target[offset + i] = Math.sin((2 * Math.PI * 660 * i) / sampleRate) * 0.2;
    }
  };

  let cursor = 0;
  combined.set(d1, cursor);
  cursor += d1.length;
  makeBeep(combined, cursor + Math.floor(gapSamples * 0.3));
  cursor += gapSamples;

  combined.set(d2, cursor);
  cursor += d2.length;
  makeBeep(combined, cursor + Math.floor(gapSamples * 0.3));
  cursor += gapSamples;

  combined.set(d3, cursor);

  // Encode 16-bit PCM WAV
  const buffer = new ArrayBuffer(44 + combined.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + combined.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, combined.length * 2, true);

  let byteOffset = 44;
  for (let i = 0; i < combined.length; i++) {
    const s = Math.max(-1, Math.min(1, combined[i]));
    view.setInt16(byteOffset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    byteOffset += 2;
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}
