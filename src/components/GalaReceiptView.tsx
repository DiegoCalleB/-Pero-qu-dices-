import React, { useState } from 'react';
import { Download, Share2, Trophy, Volume2, RotateCcw, Check } from 'lucide-react';
import { GameModeId, GAME_MODES } from '../data/decks';

export interface PlayerStats {
  id: string;
  name: string;
  avatar: string;
  score: number;
  roundsPlayed: number;
  bestSimilarity: number;
  bestPhrase?: string;
}

export interface CompletedRoundClip {
  id: string;
  roundNumber: number;
  speakerName: string;
  imitatorName: string;
  phrase: string;
  phoneticReverse: string;
  similarityScore: number;
  verdictTitle: string;
  verdictBadge: string;
  tableGuessedIt: boolean;
  pointsAwarded: number;
  combinedWavUrl: string;
  originalBuffer: AudioBuffer;
  reversedOriginalBuffer: AudioBuffer;
  finalReversedBuffer: AudioBuffer;
}

interface GalaReceiptViewProps {
  players: PlayerStats[];
  history: CompletedRoundClip[];
  activeMode: GameModeId;
  onPlayBuffer: (buffer: AudioBuffer) => void;
  onNewGame: () => void;
  onBackToStage: () => void;
}

export const GalaReceiptView: React.FC<GalaReceiptViewProps> = ({
  players,
  history,
  activeMode,
  onPlayBuffer,
  onNewGame,
  onBackToStage,
}) => {
  const [copiedText, setCopiedText] = useState(false);
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
  const modeInfo = GAME_MODES.find((m) => m.id === activeMode) || GAME_MODES[0];

  // Compute funny titles based on real round performance
  const topPlayer = sortedPlayers[0];
  const highestAccuracyClip = [...history].sort((a, b) => b.similarityScore - a.similarityScore)[0];
  const mostChaoticClip = [...history].sort((a, b) => a.similarityScore - b.similarityScore)[0];

  const getAwardTitle = (index: number, player: PlayerStats) => {
    if (index === 0) return 'Lengua de Oro Invertida';
    if (player.bestSimilarity >= 80) return 'Susurrador de Elfos';
    if (player.bestSimilarity > 0 && player.bestSimilarity < 48) return 'Dos Polvorones en Boca';
    if (index === 1) return 'Subcampeón del Anís';
    return 'Comensal Revelación';
  };

  const handleShareWhatsAppSummary = async () => {
    const lines = [
      `🎄 ACTA OFICIAL DE LA SOBREMESA — ¿PERO QUÉ DICES? 🎄`,
      `Modo jugado: ${modeInfo.title}`,
      ``,
      `🏆 PODIO DE LA MESA:`,
      ...sortedPlayers.map(
        (p, i) =>
          `${i + 1}. ${p.avatar} ${p.name} — ${p.score} pts (${getAwardTitle(i, p)} · Mejor precisión: ${p.bestSimilarity}%)`
      ),
      ``,
      highestAccuracyClip
        ? `✨ Mayor brujería: ${highestAccuracyClip.imitatorName} clavó "${highestAccuracyClip.phrase}" al ${highestAccuracyClip.similarityScore}%`
        : '',
      mostChaoticClip && mostChaoticClip.id !== highestAccuracyClip?.id
        ? `💥 Momento "¿Pero qué dices?": ${mostChaoticClip.imitatorName} con "${mostChaoticClip.phrase}" (${mostChaoticClip.similarityScore}%)`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    if (navigator.share) {
      try {
        await navigator.share({
          title: '¿Pero qué dices? — Acta de la Sobremesa',
          text: lines,
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(lines);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2500);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleDownloadReceiptPng = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 1280;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Warm ivory receipt paper background
    ctx.fillStyle = '#FBF8F3';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Top festive border
    ctx.fillStyle = '#0B2419';
    ctx.fillRect(0, 0, canvas.width, 170);

    ctx.fillStyle = '#F59E0B';
    ctx.font = 'bold 22px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ACTA OFICIAL DE SOBREMESA NAVIDEÑA', canvas.width / 2, 58);

    ctx.fillStyle = '#FBF8F3';
    ctx.font = 'bold 54px "Fraunces", Georgia, serif';
    ctx.fillText('¿Pero qué dices?', canvas.width / 2, 125);

    // Mode & Date metadata
    ctx.fillStyle = '#0B2419';
    ctx.font = '600 24px "Plus Jakarta Sans", sans-serif';
    const dateStr = new Date().toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    ctx.fillText(`${modeInfo.title} · ${dateStr}`, canvas.width / 2, 230);

    // Dashed receipt divider
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(70, 265);
    ctx.lineTo(830, 265);
    ctx.stroke();
    ctx.setLineDash([]);

    // Players list
    let y = 325;
    sortedPlayers.slice(0, 6).forEach((p, idx) => {
      ctx.fillStyle = idx === 0 ? '#FEF3C7' : '#F1ECE1';
      ctx.beginPath();
      ctx.roundRect(70, y - 40, 760, 92, 16);
      ctx.fill();

      ctx.fillStyle = '#0B2419';
      ctx.textAlign = 'left';
      ctx.font = 'bold 28px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(`${idx + 1}. ${p.avatar} ${p.name}`, 100, y);

      ctx.fillStyle = '#475569';
      ctx.font = '500 20px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(`${getAwardTitle(idx, p)} · Mejor onda: ${p.bestSimilarity}%`, 100, y + 32);

      ctx.fillStyle = '#E11D48';
      ctx.textAlign = 'right';
      ctx.font = 'bold 32px "JetBrains Mono", monospace';
      ctx.fillText(`${p.score} PTS`, 800, y + 12);

      y += 112;
    });

    // Bottom quote
    if (highestAccuracyClip) {
      ctx.fillStyle = '#0B2419';
      ctx.textAlign = 'center';
      ctx.font = 'bold 24px "Fraunces", Georgia, serif';
      ctx.fillText(
        `Momento estelar: ${highestAccuracyClip.imitatorName} (${highestAccuracyClip.similarityScore}%)`,
        canvas.width / 2,
        1080
      );
      ctx.fillStyle = '#475569';
      ctx.font = 'italic 22px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(`"${highestAccuracyClip.phrase}"`, canvas.width / 2, 1120);
    }

    ctx.fillStyle = '#0B2419';
    ctx.font = '600 20px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Gracias por su visita · Propina en polvorones incluida', canvas.width / 2, 1220);

    const link = document.createElement('a');
    link.download = `acta-pero-que-dices-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Left / Center Column: The Printable Receipt Ticket */}
      <div className="lg:col-span-7 bg-[#FBF8F3] text-[#0B2419] rounded-2xl p-6 sm:p-8 shadow-xl border border-[#E2D9C8]">
        <div className="text-center border-b border-dashed border-[#0B2419]/25 pb-6">
          <p className="text-xs font-semibold tracking-wider text-[#0B2419]/60">
            Acta Oficial de Sobremesa Navideña · {modeInfo.title}
          </p>
          <h2 className="font-display text-3xl sm:text-4xl font-bold mt-1 text-[#0B2419]">
            ¿Pero qué dices?
          </h2>
          <p className="text-sm text-[#0B2419]/70 mt-1">
            {history.length} rondas grabadas · Campeón actual:{' '}
            <span className="font-semibold text-[#0B2419]">
              {topPlayer ? `${topPlayer.avatar} ${topPlayer.name}` : 'Por decidir'}
            </span>
          </p>
        </div>

        {/* Ranking Rows */}
        <div className="py-6 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-[#0B2419]/60 px-2">
            <span>Comensal y Premio de la Noche</span>
            <span className="font-mono-tabular">Mejor Precisión · Puntos</span>
          </div>

          {sortedPlayers.map((player, index) => (
            <div
              key={player.id}
              className={`flex items-center justify-between p-4 rounded-xl border ${
                index === 0
                  ? 'bg-[#FEF3C7]/70 border-[#F59E0B]/50'
                  : 'bg-white border-[#0B2419]/10'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono-tabular text-sm font-bold text-[#0B2419]/60 w-5">
                  0{index + 1}
                </span>
                <span className="text-2xl shrink-0" aria-hidden="true">
                  {player.avatar}
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-base text-[#0B2419] truncate">{player.name}</p>
                  <p className="text-xs text-[#0B2419]/70 truncate">
                    {getAwardTitle(index, player)} · {player.roundsPlayed} turnos
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0 ml-4">
                <p className="font-mono-tabular text-lg font-bold text-[#E11D48]">
                  {player.score} pts
                </p>
                <p className="font-mono-tabular text-xs text-[#0B2419]/60">
                  Máx: {player.bestSimilarity}%
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Highlights of the Dinner */}
        {history.length > 0 && (
          <div className="border-t border-dashed border-[#0B2419]/25 pt-5 space-y-3">
            <h3 className="font-display text-lg font-bold text-[#0B2419]">
              Hitos de la Sobremesa
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {highestAccuracyClip && (
                <div className="p-3.5 rounded-xl bg-[#0B2419]/5">
                  <p className="text-xs text-[#0B2419]/60">Mayor Brujería Fonética</p>
                  <p className="font-bold text-sm mt-0.5 text-[#0B2419]">
                    {highestAccuracyClip.imitatorName} ·{' '}
                    <span className="font-mono-tabular text-[#0D9488]">
                      {highestAccuracyClip.similarityScore}%
                    </span>
                  </p>
                  <p className="text-xs text-[#0B2419]/80 mt-1 italic">
                    "{highestAccuracyClip.phrase}"
                  </p>
                </div>
              )}
              {mostChaoticClip && (
                <div className="p-3.5 rounded-xl bg-[#0B2419]/5">
                  <p className="text-xs text-[#0B2419]/60">Momento "¿Pero qué dices?"</p>
                  <p className="font-bold text-sm mt-0.5 text-[#0B2419]">
                    {mostChaoticClip.imitatorName} ·{' '}
                    <span className="font-mono-tabular text-[#E11D48]">
                      {mostChaoticClip.similarityScore}%
                    </span>
                  </p>
                  <p className="text-xs text-[#0B2419]/80 mt-1 italic">
                    "{mostChaoticClip.phrase}"
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons for Sharing */}
        <div className="mt-6 pt-5 border-t border-[#0B2419]/10 flex flex-wrap items-center gap-3">
          <button
            onClick={handleDownloadReceiptPng}
            className="flex-1 min-h-[48px] px-4 py-2.5 rounded-xl bg-[#0B2419] text-[#FBF8F3] font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#133E2B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Descargar Ticket PNG</span>
          </button>

          <button
            onClick={handleShareWhatsAppSummary}
            className="flex-1 min-h-[48px] px-4 py-2.5 rounded-xl bg-[#E11D48] text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#BE123C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copiedText ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
            <span>{copiedText ? 'Copiado para WhatsApp' : 'Compartir Resumen'}</span>
          </button>
        </div>
      </div>

      {/* Right Column: Recorded Audio Jewels of the Night */}
      <div className="lg:col-span-5 bg-[#103324] border border-white/10 rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-xl font-bold text-[#FBF8F3]">
              Joyas de Audio de la Cena
            </h3>
            <p className="text-xs text-[#FBF8F3]/70 mt-0.5">
              Escucha o descarga los intentos completos para el grupo de WhatsApp
            </p>
          </div>
          <Trophy className="w-6 h-6 text-[#F59E0B] shrink-0" />
        </div>

        {history.length === 0 ? (
          <div className="py-10 text-center space-y-3 border border-dashed border-white/15 rounded-xl p-6">
            <p className="text-sm text-[#FBF8F3]/80">
              Todavía no habéis completado ninguna ronda en esta cena.
            </p>
            <button
              onClick={onBackToStage}
              className="min-h-[44px] px-4 py-2 rounded-lg bg-[#F59E0B] text-[#0B2419] font-semibold text-xs hover:bg-[#D97706] transition-colors whitespace-nowrap cursor-pointer"
            >
              Ir al Escenario de Grabación
            </button>
          </div>
        ) : (
          <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
            {history.map((clip) => (
              <div
                key={clip.id}
                className="p-4 rounded-xl bg-[#0B2419]/80 border border-white/10 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-[#FBF8F3]/65">
                      Ronda {clip.roundNumber} · Grabó {clip.speakerName} · Imitó{' '}
                      <strong className="text-[#FBF8F3]">{clip.imitatorName}</strong>
                    </p>
                    <p className="font-display font-bold text-base text-[#FBF8F3] mt-0.5">
                      "{clip.phrase}"
                    </p>
                  </div>
                  <span className="font-mono-tabular text-sm font-bold text-[#F59E0B] shrink-0">
                    {clip.similarityScore}%
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    onClick={() => onPlayBuffer(clip.finalReversedBuffer)}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-[#FBF8F3] flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5 text-[#F59E0B]" />
                    <span>Oír Resultado</span>
                  </button>

                  <button
                    onClick={() => onPlayBuffer(clip.reversedOriginalBuffer)}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-[#FBF8F3] flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-[#E11D48]" />
                    <span>Oír en Alienígena</span>
                  </button>

                  <a
                    href={clip.combinedWavUrl}
                    download={`pero-que-dices-ronda-${clip.roundNumber}.wav`}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg bg-[#E11D48]/20 hover:bg-[#E11D48]/30 text-xs font-medium text-[#FDA4AF] flex items-center gap-1.5 transition-colors whitespace-nowrap ml-auto"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>WAV Completo</span>
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-3">
          <button
            onClick={onBackToStage}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-white/20 text-xs font-semibold text-[#FBF8F3] hover:bg-white/10 transition-colors whitespace-nowrap cursor-pointer"
          >
            Seguir Jugando Rondas
          </button>
          <button
            onClick={onNewGame}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-white/10 text-xs font-semibold text-[#FBF8F3] hover:bg-white/20 transition-colors whitespace-nowrap cursor-pointer"
          >
            Reiniciar Marcador
          </button>
        </div>
      </div>
    </div>
  );
};
