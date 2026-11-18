import React, { useEffect, useRef } from 'react';

interface WaveformCanvasProps {
  peaks: number[];
  secondaryPeaks?: number[];
  progress?: number; // 0 to 1
  reverseDirection?: boolean;
  isRecording?: boolean;
  primaryColor?: string;
  secondaryColor?: string;
  height?: number;
  labelLeft?: string;
  labelRight?: string;
}

export const WaveformCanvas: React.FC<WaveformCanvasProps> = ({
  peaks,
  secondaryPeaks,
  progress = 0,
  reverseDirection = false,
  isRecording = false,
  primaryColor = '#F59E0B',
  secondaryColor = '#E11D48',
  height = 112,
  labelLeft,
  labelRight,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 520;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    // Subtle center baseline
    const midY = height / 2;
    ctx.strokeStyle = 'rgba(251, 248, 243, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(12, midY);
    ctx.lineTo(width - 12, midY);
    ctx.stroke();

    const count = peaks.length || 56;
    const horizontalPad = 16;
    const usableWidth = width - horizontalPad * 2;
    const step = usableWidth / count;
    const barWidth = Math.max(3, Math.min(8, step * 0.62));

    for (let i = 0; i < count; i++) {
      const x = horizontalPad + i * step + (step - barWidth) / 2;
      const ratioPos = i / count;

      // Determine whether this bar has been played based on direction
      let isActiveBar = false;
      if (isRecording) {
        isActiveBar = true;
      } else if (progress > 0) {
        isActiveBar = reverseDirection ? ratioPos >= 1 - progress : ratioPos <= progress;
      }

      const amp = Math.max(0.08, Math.min(1, peaks[i] ?? 0.1));
      const barH = Math.max(6, amp * (height - 26));

      if (secondaryPeaks && secondaryPeaks.length > 0) {
        // Split / dual comparison mode: top half original (gold), bottom half imitation (crimson)
        const secAmp = Math.max(0.08, Math.min(1, secondaryPeaks[i] ?? 0.1));
        const topH = Math.max(4, amp * (midY - 12));
        const botH = Math.max(4, secAmp * (midY - 12));

        ctx.fillStyle = isActiveBar ? primaryColor : 'rgba(245, 158, 11, 0.42)';
        ctx.beginPath();
        ctx.roundRect(x, midY - topH - 2, barWidth, topH, 3);
        ctx.fill();

        ctx.fillStyle = isActiveBar ? secondaryColor : 'rgba(225, 29, 72, 0.42)';
        ctx.beginPath();
        ctx.roundRect(x, midY + 2, barWidth, botH, 3);
        ctx.fill();
      } else {
        // Single symmetrical waveform
        ctx.fillStyle = isRecording
          ? '#E11D48'
          : isActiveBar
            ? primaryColor
            : 'rgba(251, 248, 243, 0.24)';

        ctx.beginPath();
        ctx.roundRect(x, midY - barH / 2, barWidth, barH, 3);
        ctx.fill();
      }
    }

    // Playhead line when playing
    if (!isRecording && progress > 0 && progress < 1) {
      const playheadX = reverseDirection
        ? horizontalPad + (1 - progress) * usableWidth
        : horizontalPad + progress * usableWidth;

      ctx.strokeStyle = '#FBF8F3';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 8);
      ctx.lineTo(playheadX, height - 8);
      ctx.stroke();
    }
  }, [peaks, secondaryPeaks, progress, reverseDirection, isRecording, primaryColor, secondaryColor, height]);

  return (
    <div className="relative w-full rounded-xl bg-[#071A12] border border-white/10 p-3">
      {(labelLeft || labelRight) && (
        <div className="flex items-center justify-between text-xs text-[#FBF8F3]/70 mb-1.5 px-1">
          <span>{labelLeft}</span>
          <span className="font-mono-tabular">{labelRight}</span>
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={{ height: `${height}px` }}
        className="w-full block"
      />
    </div>
  );
};
