/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Mic,
  Square,
  Play,
  RotateCcw,
  Sparkles,
  Users,
  Plus,
  Trash2,
  Shuffle,
  Volume2,
  Eye,
  EyeOff,
  Award,
  CheckCircle2,
  HelpCircle,
  Download,
  ArrowRight,
  Sliders,
} from 'lucide-react';
import {
  GAME_MODES,
  INITIAL_CARDS,
  ROUND_VARIANTS,
  GameCard,
  GameModeId,
  RoundVariantId,
  generatePhoneticGuide,
} from './data/decks';
import {
  LiveMicRecorder,
  reverseAudioBuffer,
  playAudioBuffer,
  extractWaveformPeaks,
  synthesizeDemoPhraseBuffer,
  calculateAcousticSimilarity,
  exportCombinedRoundWav,
  playUiSound,
} from './utils/audioEngine';
import { WaveformCanvas } from './components/WaveformCanvas';
import { GalaReceiptView, PlayerStats, CompletedRoundClip } from './components/GalaReceiptView';

type ActiveTab = 'mesa' | 'escenario' | 'mazos' | 'acta';
type RoundPhase = 'PICK_AND_RECORD' | 'IMITATE_REVERSED' | 'REVEAL_AND_SCORE';

const FESTIVE_AVATARS = ['🦌', '🎅', '🥂', '🎄', '🌟', '🍾', '🦊', '⛄', '🎁', '🔔'];

const INITIAL_PLAYERS: PlayerStats[] = [
  { id: 'p1', name: 'Marta', avatar: '🥂', score: 0, roundsPlayed: 0, bestSimilarity: 0 },
  { id: 'p2', name: 'Carlos (Cuñado)', avatar: '🦌', score: 0, roundsPlayed: 0, bestSimilarity: 0 },
  { id: 'p3', name: 'Abuela Carmen', avatar: '🌟', score: 0, roundsPlayed: 0, bestSimilarity: 0 },
  { id: 'p4', name: 'Javi', avatar: '🎅', score: 0, roundsPlayed: 0, bestSimilarity: 0 },
];

export default function App() {
  // Navigation & Game Configuration State
  const [activeTab, setActiveTab] = useState<ActiveTab>('escenario');
  const [activeMode, setActiveMode] = useState<GameModeId>('familia');
  const [roundVariant, setRoundVariant] = useState<RoundVariantId>('duelo');
  const [players, setPlayers] = useState<PlayerStats[]>(INITIAL_PLAYERS);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [cards, setCards] = useState<GameCard[]>(INITIAL_CARDS);

  // Turn & Round State
  const [roundNumber, setRoundNumber] = useState(1);
  const [speakerIdx, setSpeakerIdx] = useState(0);
  const [imitatorIdx, setImitatorIdx] = useState(1);
  const [roundPhase, setRoundPhase] = useState<RoundPhase>('PICK_AND_RECORD');

  // Card Selection & Custom Prompt in Stage
  const [handCards, setHandCards] = useState<GameCard[]>([]);
  const [selectedCard, setSelectedCard] = useState<GameCard | null>(null);
  const [customStagePhrase, setCustomStagePhrase] = useState('');
  const [useCustomPhrase, setUseCustomPhrase] = useState(false);

  // Deck Creator Form State (in 'mazos' view)
  const [deckFilterMode, setDeckFilterMode] = useState<GameModeId>('familia');
  const [newCardText, setNewCardText] = useState('');
  const [newCardCategory, setNewCardCategory] = useState<GameCard['category']>('Frase de Mesa');
  const [newCardHint, setNewCardHint] = useState('');

  // Audio Buffers & Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [livePeaks, setLivePeaks] = useState<number[]>(Array.from({ length: 56 }, () => 0.08));

  const [originalBuffer, setOriginalBuffer] = useState<AudioBuffer | null>(null);
  const [reversedOriginalBuffer, setReversedOriginalBuffer] = useState<AudioBuffer | null>(null);
  const [imitationBuffer, setImitationBuffer] = useState<AudioBuffer | null>(null);
  const [finalReversedBuffer, setFinalReversedBuffer] = useState<AudioBuffer | null>(null);

  // Playback & Assist Controls
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 0.72>(1);
  const [showPhoneticGuide, setShowPhoneticGuide] = useState(true);

  // Verdict & Reveal State
  const [secretRevealed, setSecretRevealed] = useState(false);
  const [tableGuessedBonus, setTableGuessedBonus] = useState<boolean | null>(null);
  const [verdictData, setVerdictData] = useState<{
    score: number;
    verdictTitle: string;
    verdictDetail: string;
    badge: string;
    combinedWavUrl: string;
  } | null>(null);

  // Night History & Image Fallback State
  const [history, setHistory] = useState<CompletedRoundClip[]>([]);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  const recorderRef = useRef<LiveMicRecorder | null>(null);
  const activePlayerStopRef = useRef<{ stop: () => void } | null>(null);
  const recTimerRef = useRef<number | null>(null);

  // Draw 3 cards whenever mode changes
  const drawThreeCards = useCallback(
    (targetMode: GameModeId, allCards: GameCard[]) => {
      const pool = allCards.filter((c) => c.mode === targetMode);
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      const picked = shuffled.slice(0, 3);
      setHandCards(picked);
      if (picked.length > 0) {
        setSelectedCard(picked[0]);
      }
      setUseCustomPhrase(false);
    },
    []
  );

  useEffect(() => {
    drawThreeCards(activeMode, cards);
  }, [activeMode, cards, drawThreeCards]);

  // Clean up any active audio or timers on unmount
  useEffect(() => {
    return () => {
      if (activePlayerStopRef.current) activePlayerStopRef.current.stop();
      if (recTimerRef.current) window.clearInterval(recTimerRef.current);
    };
  }, []);

  const stopCurrentPlayback = () => {
    if (activePlayerStopRef.current) {
      activePlayerStopRef.current.stop();
      activePlayerStopRef.current = null;
    }
    setIsPlayingAudio(false);
    setPlaybackProgress(0);
  };

  const handlePlayBuffer = (buffer: AudioBuffer | null, rate = 1.0) => {
    if (!buffer) return;
    stopCurrentPlayback();
    setIsPlayingAudio(true);
    activePlayerStopRef.current = playAudioBuffer(
      buffer,
      rate,
      (ratio) => setPlaybackProgress(ratio),
      () => {
        setIsPlayingAudio(false);
        setPlaybackProgress(0);
      }
    );
  };

  // Determine the active phrase and phonetic guide for the current round
  const activePhraseText = useCustomPhrase
    ? customStagePhrase.trim() || 'Pásame el polvorón de almendra'
    : selectedCard?.text || 'Pásame el langostino';

  const activePhonetic = useCustomPhrase
    ? generatePhoneticGuide(activePhraseText)
    : {
        phoneticReverse:
          selectedCard?.phoneticReverse || generatePhoneticGuide(activePhraseText).phoneticReverse,
        phoneticSyllables:
          selectedCard?.phoneticSyllables ||
          generatePhoneticGuide(activePhraseText).phoneticSyllables,
      };

  // Start / Stop Live Microphone Recording
  const startMicRecording = async () => {
    stopCurrentPlayback();
    setMicError(null);
    const recorder = new LiveMicRecorder();
    recorderRef.current = recorder;

    try {
      await recorder.start((_rms, peaks) => {
        setLivePeaks([...peaks]);
      });
      setIsRecording(true);
      setRecordingSeconds(0);

      recTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 6.5) {
            stopMicRecording();
            return prev;
          }
          return +(prev + 0.1).toFixed(1);
        });
      }, 100);
    } catch {
      setMicError(
        'No se pudo acceder al micrófono. Puedes dar permiso en el navegador o usar el botón "Generar Voz Demo" para jugar al instante.'
      );
    }
  };

  const stopMicRecording = () => {
    if (recTimerRef.current) {
      window.clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
    if (!recorderRef.current) return;
    const recordedBuf = recorderRef.current.stop();
    recorderRef.current = null;
    setIsRecording(false);

    processRecordedBuffer(recordedBuf);
  };

  const processRecordedBuffer = (buffer: AudioBuffer) => {
    playUiSound('rewind');
    if (roundPhase === 'PICK_AND_RECORD') {
      const reversed = reverseAudioBuffer(buffer);
      setOriginalBuffer(buffer);
      setReversedOriginalBuffer(reversed);
    } else if (roundPhase === 'IMITATE_REVERSED') {
      const finalRev = reverseAudioBuffer(buffer);
      setImitationBuffer(buffer);
      setFinalReversedBuffer(finalRev);

      if (originalBuffer && reversedOriginalBuffer) {
        const sim = calculateAcousticSimilarity(originalBuffer, finalRev);
        const wavUrl = exportCombinedRoundWav(originalBuffer, reversedOriginalBuffer, finalRev);
        setVerdictData({
          ...sim,
          combinedWavUrl: wavUrl,
        });
      }
    }
  };

  // Instant Demo Audio Generator (works even without microphone!)
  const handleUseDemoVoice = (stage: 'original' | 'imitation') => {
    stopCurrentPlayback();
    setMicError(null);
    const synthBuf = synthesizeDemoPhraseBuffer(activePhraseText, stage);
    processRecordedBuffer(synthBuf);
    handlePlayBuffer(
      stage === 'original' ? reverseAudioBuffer(synthBuf) : reverseAudioBuffer(synthBuf),
      1.0
    );
  };

  const proceedToImitationPhase = () => {
    if (!originalBuffer || !reversedOriginalBuffer) return;
    stopCurrentPlayback();
    setRoundPhase('IMITATE_REVERSED');
    setImitationBuffer(null);
    setFinalReversedBuffer(null);
    setVerdictData(null);
    setSecretRevealed(false);
    setTableGuessedBonus(null);
  };

  const proceedToRevealPhase = () => {
    if (!finalReversedBuffer || !verdictData) return;
    stopCurrentPlayback();
    setRoundPhase('REVEAL_AND_SCORE');
    setSecretRevealed(false);
    setTableGuessedBonus(null);
    // Play the mystery final reversed audio right away so the table can guess!
    handlePlayBuffer(finalReversedBuffer, 1.0);
  };

  const handleRevealSecretAndScore = () => {
    playUiSound('reveal');
    setSecretRevealed(true);
  };

  const completeRoundAndNextTurn = (guessedByTable: boolean) => {
    if (!verdictData || !originalBuffer || !reversedOriginalBuffer || !finalReversedBuffer) return;
    playUiSound('fanfare');
    setTableGuessedBonus(guessedByTable);

    const bonus = guessedByTable ? 25 : 0;
    const totalPoints = verdictData.score + bonus;
    const speaker = players[speakerIdx] || players[0];
    const imitator = players[imitatorIdx] || players[1] || players[0];

    // Update players scoreboard
    setPlayers((prev) =>
      prev.map((p, idx) => {
        if (idx === imitatorIdx) {
          const isNewBest = verdictData.score > p.bestSimilarity;
          return {
            ...p,
            score: p.score + totalPoints,
            roundsPlayed: p.roundsPlayed + 1,
            bestSimilarity: Math.max(p.bestSimilarity, verdictData.score),
            bestPhrase: isNewBest ? activePhraseText : p.bestPhrase,
          };
        }
        if (idx === speakerIdx && guessedByTable) {
          // Speaker also gets +15 co-op bonus when the table guesses it
          return {
            ...p,
            score: p.score + 15,
          };
        }
        return p;
      })
    );

    const newClip: CompletedRoundClip = {
      id: `clip-${Date.now()}`,
      roundNumber,
      speakerName: speaker.name,
      imitatorName: imitator.name,
      phrase: activePhraseText,
      phoneticReverse: activePhonetic.phoneticReverse,
      similarityScore: verdictData.score,
      verdictTitle: verdictData.verdictTitle,
      verdictBadge: verdictData.badge,
      tableGuessedIt: guessedByTable,
      pointsAwarded: totalPoints,
      combinedWavUrl: verdictData.combinedWavUrl,
      originalBuffer,
      reversedOriginalBuffer,
      finalReversedBuffer,
    };

    setHistory((prev) => [newClip, ...prev]);

    // Advance turn indices
    const nextSpeaker = (speakerIdx + 1) % players.length;
    const nextImitator = (nextSpeaker + 1) % players.length;
    setSpeakerIdx(nextSpeaker);
    setImitatorIdx(nextImitator);
    setRoundNumber((r) => r + 1);
    setRoundPhase('PICK_AND_RECORD');
    setOriginalBuffer(null);
    setReversedOriginalBuffer(null);
    setImitationBuffer(null);
    setFinalReversedBuffer(null);
    setVerdictData(null);
    setSecretRevealed(false);
    drawThreeCards(activeMode, cards);
  };

  // Player Management Handlers
  const handleAddPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newPlayerName.trim();
    if (!trimmed) return;
    const nextAvatar = FESTIVE_AVATARS[players.length % FESTIVE_AVATARS.length];
    setPlayers((prev) => [
      ...prev,
      {
        id: `p-${Date.now()}`,
        name: trimmed,
        avatar: nextAvatar,
        score: 0,
        roundsPlayed: 0,
        bestSimilarity: 0,
      },
    ]);
    setNewPlayerName('');
  };

  const handleRemovePlayer = (id: string) => {
    if (players.length <= 2) return;
    setPlayers((prev) => {
      const filtered = prev.filter((p) => p.id !== id);
      setSpeakerIdx(0);
      setImitatorIdx(1 % filtered.length);
      return filtered;
    });
  };

  // Custom Card Addition Handler
  const handleCreateCustomCard = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanText = newCardText.trim();
    if (!cleanText) return;
    const guide = generatePhoneticGuide(cleanText);
    const created: GameCard = {
      id: `custom-${Date.now()}`,
      mode: deckFilterMode,
      category: newCardCategory,
      text: cleanText,
      phoneticReverse: guide.phoneticReverse,
      phoneticSyllables: guide.phoneticSyllables,
      difficulty: cleanText.split(' ').length > 6 ? 3 : 2,
      hint: newCardHint.trim() || 'Reto personalizado de nuestra mesa',
    };
    setCards((prev) => [created, ...prev]);
    setNewCardText('');
    setNewCardHint('');
  };

  const handleResetGame = () => {
    stopCurrentPlayback();
    setPlayers((prev) =>
      prev.map((p) => ({ ...p, score: 0, roundsPlayed: 0, bestSimilarity: 0, bestPhrase: undefined }))
    );
    setHistory([]);
    setRoundNumber(1);
    setSpeakerIdx(0);
    setImitatorIdx(1 % Math.max(2, players.length));
    setRoundPhase('PICK_AND_RECORD');
    setOriginalBuffer(null);
    setReversedOriginalBuffer(null);
    setImitationBuffer(null);
    setFinalReversedBuffer(null);
    setVerdictData(null);
    setActiveTab('escenario');
  };

  const currentSpeaker = players[speakerIdx] || players[0];
  const currentImitator = players[imitatorIdx] || players[1] || players[0];
  const currentModeObj = GAME_MODES.find((m) => m.id === activeMode) || GAME_MODES[0];

  // Waveform peaks for current stage view
  const displayedPeaks = isRecording
    ? livePeaks
    : roundPhase === 'PICK_AND_RECORD'
      ? extractWaveformPeaks(reversedOriginalBuffer || originalBuffer)
      : roundPhase === 'IMITATE_REVERSED'
        ? extractWaveformPeaks(imitationBuffer || reversedOriginalBuffer)
        : extractWaveformPeaks(originalBuffer);

  const secondaryComparisonPeaks =
    roundPhase === 'REVEAL_AND_SCORE' && secretRevealed && finalReversedBuffer
      ? extractWaveformPeaks(finalReversedBuffer)
      : undefined;

  return (
    <div className="min-h-screen flex flex-col bg-[#0B2419] text-[#FBF8F3]">
      {/* ==================== TOP BAR CONTRACT (3 ZONES, GAP-8) ==================== */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-8 px-4 sm:px-8 py-3.5 bg-[#081C13]/95 backdrop-blur-md border-b border-white/10">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('escenario');
          }}
          className="font-display text-xl sm:text-2xl font-bold tracking-tight text-[#FBF8F3] whitespace-nowrap shrink-0"
        >
          ¿Pero qué dices?
        </a>

        {/* Zone 2: 4 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#FBF8F3]/75">
          <button
            onClick={() => setActiveTab('escenario')}
            className={`hover:text-[#FBF8F3] transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-0.5 ${
              activeTab === 'escenario'
                ? 'text-[#F59E0B] border-b-2 border-[#F59E0B]'
                : ''
            }`}
          >
            Escenario de Voz
          </button>
          <button
            onClick={() => setActiveTab('mesa')}
            className={`hover:text-[#FBF8F3] transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-0.5 ${
              activeTab === 'mesa'
                ? 'text-[#F59E0B] border-b-2 border-[#F59E0B]'
                : ''
            }`}
          >
            Mesa y Modos
          </button>
          <button
            onClick={() => setActiveTab('mazos')}
            className={`hover:text-[#FBF8F3] transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-0.5 ${
              activeTab === 'mazos'
                ? 'text-[#F59E0B] border-b-2 border-[#F59E0B]'
                : ''
            }`}
          >
            Mazos y Retos
          </button>
          <button
            onClick={() => setActiveTab('acta')}
            className={`hover:text-[#FBF8F3] transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-0.5 ${
              activeTab === 'acta'
                ? 'text-[#F59E0B] border-b-2 border-[#F59E0B]'
                : ''
            }`}
          >
            Acta de la Cena
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            onClick={() => {
              if (activeTab !== 'acta') {
                setActiveTab('acta');
              } else {
                setActiveTab('escenario');
              }
            }}
            className="min-h-[40px] px-4 py-2 text-xs font-semibold text-[#0B2419] bg-[#F59E0B] rounded-lg hover:bg-[#D97706] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {activeTab === 'acta' ? 'Volver al Juego' : `Ver Acta (${history.length})`}
          </button>
        </div>
      </header>

      {/* ==================== WORKSPACE MODE & INTENSITY BAR ==================== */}
      <div className="bg-[#0E2E20] border-b border-white/10 px-4 sm:px-8 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Interactive Segmented Mode Selector */}
          <div className="flex items-center gap-1.5 p-1 bg-[#071A12] rounded-xl border border-white/10 overflow-x-auto max-w-full">
            {GAME_MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setActiveMode(m.id);
                  playUiSound('tick');
                }}
                className={`min-h-[38px] px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeMode === m.id
                    ? 'bg-[#E11D48] text-white shadow-sm'
                    : 'text-[#FBF8F3]/75 hover:text-[#FBF8F3]'
                }`}
              >
                {m.title}
              </button>
            ))}
          </div>

          {/* Unboxed Metadata Summary */}
          <div className="flex items-center gap-2 text-xs text-[#FBF8F3]/75">
            <span>Ronda {roundNumber}</span>
            <span aria-hidden="true">·</span>
            <span>{players.length} comensales en mesa</span>
            <span aria-hidden="true">·</span>
            <span className="hidden sm:inline">{currentModeObj.audienceLabel}</span>
          </div>
        </div>
      </div>

      {/* ==================== MAIN CONTENT CONTAINER (1440px MAX-W-7XL) ==================== */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 pb-24 md:pb-10">
        {/* ==================== TAB 1: ESCENARIO DE VOZ (ACTIVE GAMEPLAY) ==================== */}
        {activeTab === 'escenario' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column (3 cols on Desktop): Table Roster & Turn Order */}
            <aside className="lg:col-span-3 space-y-6 order-2 lg:order-1">
              <div className="bg-[#103324] border border-white/10 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-bold text-[#FBF8F3]">
                    Mesa en Juego
                  </h2>
                  <button
                    onClick={() => setActiveTab('mesa')}
                    className="text-xs font-semibold text-[#F59E0B] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Editar Mesa
                  </button>
                </div>

                {/* Players List */}
                <div className="space-y-2">
                  {players.map((p, idx) => {
                    const isSpeaker = idx === speakerIdx;
                    const isImitator = idx === imitatorIdx;
                    return (
                      <div
                        key={p.id}
                        onClick={() => {
                          if (roundPhase === 'PICK_AND_RECORD') {
                            setSpeakerIdx(idx);
                            setImitatorIdx((idx + 1) % players.length);
                          }
                        }}
                        className={`p-3 rounded-xl border transition-colors cursor-pointer ${
                          isSpeaker
                            ? 'bg-[#F59E0B]/15 border-[#F59E0B]'
                            : isImitator
                              ? 'bg-[#E11D48]/15 border-[#E11D48]'
                              : 'bg-[#0B2419]/60 border-white/10 hover:border-white/25'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-xl shrink-0" aria-hidden="true">
                              {p.avatar}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-[#FBF8F3] truncate">
                                {p.name}
                              </p>
                              <p className="text-[11px] text-[#FBF8F3]/65">
                                {isSpeaker
                                  ? '1º Graba el Secreto'
                                  : isImitator
                                    ? '2º Imita al Revés'
                                    : `${p.roundsPlayed} rondas · Máx ${p.bestSimilarity}%`}
                              </p>
                            </div>
                          </div>
                          <span className="font-mono-tabular text-sm font-bold text-[#F59E0B] shrink-0">
                            {p.score} pts
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Quick Rotate Turn Button */}
                <button
                  onClick={() => {
                    const nextS = (speakerIdx + 1) % players.length;
                    setSpeakerIdx(nextS);
                    setImitatorIdx((nextS + 1) % players.length);
                    playUiSound('tick');
                  }}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-[#FBF8F3] flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Shuffle className="w-3.5 h-3.5 text-[#F59E0B]" />
                  <span>Rotar Pareja de Turno</span>
                </button>
              </div>

              {/* Mode Visual Card Preview */}
              <div className="bg-[#103324] border border-white/10 rounded-2xl overflow-hidden">
                <div className="relative h-36 bg-[#071A12]">
                  {!brokenImages[currentModeObj.id] ? (
                    <img
                      src={currentModeObj.imageUrl}
                      alt={currentModeObj.title}
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setBrokenImages((prev) => ({ ...prev, [currentModeObj.id]: true }))
                      }
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#133E2B] to-[#071A12] p-4 text-center">
                      <span className="font-display text-lg font-bold text-[#F59E0B]">
                        {currentModeObj.title}
                      </span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex items-end p-4">
                    <div>
                      <p className="text-xs text-[#F59E0B] font-semibold">Mazo Activo</p>
                      <h3 className="font-display text-lg font-bold text-white">
                        {currentModeObj.title}
                      </h3>
                    </div>
                  </div>
                </div>
                <div className="p-4 space-y-2">
                  <p className="text-xs text-[#FBF8F3]/80 leading-relaxed">
                    {currentModeObj.subtitle}
                  </p>
                  <div className="pt-1 flex items-center gap-1.5">
                    {ROUND_VARIANTS.map((rv) => (
                      <button
                        key={rv.id}
                        onClick={() => setRoundVariant(rv.id)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          roundVariant === rv.id
                            ? 'bg-[#F59E0B] text-[#0B2419] font-semibold'
                            : 'bg-white/5 text-[#FBF8F3]/70 hover:text-white'
                        }`}
                      >
                        {rv.shortLabel}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </aside>

            {/* Center Column (6 cols on Desktop): Primary Interactive Reverse Voice Stage */}
            <section className="lg:col-span-6 space-y-6 order-1 lg:order-2">
              {/* Stage Progress Stepper */}
              <div className="grid grid-cols-3 gap-2 p-1.5 bg-[#071A12] rounded-2xl border border-white/10">
                <button
                  onClick={() => setRoundPhase('PICK_AND_RECORD')}
                  className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap truncate cursor-pointer ${
                    roundPhase === 'PICK_AND_RECORD'
                      ? 'bg-[#FBF8F3] text-[#0B2419]'
                      : 'text-[#FBF8F3]/65 hover:text-[#FBF8F3]'
                  }`}
                >
                  1. Secreto ({currentSpeaker.name})
                </button>
                <button
                  disabled={!reversedOriginalBuffer}
                  onClick={() => reversedOriginalBuffer && setRoundPhase('IMITATE_REVERSED')}
                  className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap truncate ${
                    roundPhase === 'IMITATE_REVERSED'
                      ? 'bg-[#FBF8F3] text-[#0B2419]'
                      : reversedOriginalBuffer
                        ? 'text-[#FBF8F3]/75 hover:text-[#FBF8F3] cursor-pointer'
                        : 'text-[#FBF8F3]/30 cursor-not-allowed'
                  }`}
                >
                  2. Imitar ({currentImitator.name})
                </button>
                <button
                  disabled={!finalReversedBuffer}
                  onClick={() => finalReversedBuffer && setRoundPhase('REVEAL_AND_SCORE')}
                  className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap truncate ${
                    roundPhase === 'REVEAL_AND_SCORE'
                      ? 'bg-[#F59E0B] text-[#0B2419]'
                      : finalReversedBuffer
                        ? 'text-[#FBF8F3]/75 hover:text-[#FBF8F3] cursor-pointer'
                        : 'text-[#FBF8F3]/30 cursor-not-allowed'
                  }`}
                >
                  3. Veredicto de Mesa
                </button>
              </div>

              {/* ==================== PHASE 1: PICK SECRET CARD & RECORD ORIGINAL ==================== */}
              {roundPhase === 'PICK_AND_RECORD' && (
                <div className="bg-[#FBF8F3] text-[#0B2419] rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#0B2419]/10 pb-4">
                    <div>
                      <p className="text-xs font-semibold text-[#0B2419]/65">
                        Paso 1 de 3 · Que {currentImitator.name} no mire la pantalla
                      </p>
                      <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0B2419] mt-0.5">
                        Turno de {currentSpeaker.avatar} {currentSpeaker.name}: Elige y Graba
                      </h1>
                    </div>
                    <button
                      onClick={() => {
                        drawThreeCards(activeMode, cards);
                        playUiSound('tick');
                      }}
                      className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#0B2419]/8 hover:bg-[#0B2419]/15 text-xs font-semibold text-[#0B2419] flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Shuffle className="w-3.5 h-3.5" />
                      <span>Otras 3 Tarjetas</span>
                    </button>
                  </div>

                  {/* 3 Drawn Cards to Pick From */}
                  <div className="space-y-2.5">
                    <p className="text-xs font-semibold text-[#0B2419]/70">
                      Elige una frase del mazo ({currentModeObj.title}) o escribe una broma interna:
                    </p>
                    <div className="grid grid-cols-1 gap-2.5">
                      {handCards.map((card) => {
                        const isSelected = !useCustomPhrase && selectedCard?.id === card.id;
                        return (
                          <button
                            key={card.id}
                            onClick={() => {
                              setSelectedCard(card);
                              setUseCustomPhrase(false);
                              playUiSound('tick');
                            }}
                            className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-[#0B2419] text-[#FBF8F3] border-[#0B2419] shadow-md'
                                : 'bg-white text-[#0B2419] border-[#0B2419]/15 hover:border-[#0B2419]/40'
                            }`}
                          >
                            <div className="flex items-center justify-between text-xs opacity-75 mb-1">
                              <span>
                                {card.category} · Dificultad {card.difficulty}/3
                              </span>
                              <span>{card.hint}</span>
                            </div>
                            <p className="font-display text-lg sm:text-xl font-bold">
                              "{card.text}"
                            </p>
                          </button>
                        );
                      })}
                    </div>

                    {/* Custom Inside Joke Input Option */}
                    <div
                      className={`p-3.5 rounded-2xl border transition-all ${
                        useCustomPhrase
                          ? 'bg-[#0B2419] text-[#FBF8F3] border-[#0B2419]'
                          : 'bg-white/70 text-[#0B2419] border-[#0B2419]/15'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={customStagePhrase}
                          onFocus={() => setUseCustomPhrase(true)}
                          onChange={(e) => {
                            setCustomStagePhrase(e.target.value);
                            setUseCustomPhrase(true);
                          }}
                          placeholder="O escribe aquí una frase secreta sobre alguien de la mesa..."
                          className={`w-full text-sm font-medium bg-transparent focus:outline-none ${
                            useCustomPhrase
                              ? 'text-[#FBF8F3] placeholder:text-[#FBF8F3]/50'
                              : 'text-[#0B2419] placeholder:text-[#0B2419]/50'
                          }`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Waveform & Recording Deck */}
                  <div className="space-y-4 pt-2">
                    <WaveformCanvas
                      peaks={displayedPeaks}
                      progress={playbackProgress}
                      reverseDirection={true}
                      isRecording={isRecording}
                      labelLeft={
                        isRecording
                          ? 'Grabando voz en directo...'
                          : reversedOriginalBuffer
                            ? 'Audio invertido listo (Onda al revés)'
                            : 'Lista la frase: pulsa Grabar con Voz'
                      }
                      labelRight={
                        isRecording
                          ? `${recordingSeconds.toFixed(1)}s / 6.5s`
                          : originalBuffer
                            ? `${originalBuffer.duration.toFixed(1)}s`
                            : '0.0s'
                      }
                    />

                    {micError && (
                      <p className="text-xs text-[#E11D48] font-medium bg-[#E11D48]/10 p-3 rounded-xl">
                        {micError}
                      </p>
                    )}

                    {/* Primary Recording & Demo Controls */}
                    <div className="flex flex-wrap items-center gap-3">
                      {!isRecording ? (
                        <button
                          onClick={startMicRecording}
                          className="flex-1 min-h-[52px] px-5 py-3 rounded-2xl bg-[#E11D48] hover:bg-[#BE123C] text-white font-bold text-sm flex items-center justify-center gap-2.5 shadow-lg transition-transform active:scale-[0.99] whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Mic className="w-5 h-5" />
                          <span>
                            {originalBuffer ? 'Repetir Grabación' : 'Grabar Frase con Micrófono'}
                          </span>
                        </button>
                      ) : (
                        <button
                          onClick={stopMicRecording}
                          className="flex-1 min-h-[52px] px-5 py-3 rounded-2xl bg-[#0B2419] text-white font-bold text-sm flex items-center justify-center gap-2.5 shadow-lg whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Square className="w-5 h-5 text-[#E11D48] fill-[#E11D48]" />
                          <span>Detener e Invertir Voz ({recordingSeconds.toFixed(1)}s)</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleUseDemoVoice('original')}
                        className="min-h-[52px] px-4 py-3 rounded-2xl border border-[#0B2419]/20 hover:bg-[#0B2419]/5 text-xs font-semibold text-[#0B2419] flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Sparkles className="w-4 h-4 text-[#D97706]" />
                        <span>Generar Voz Demo</span>
                      </button>
                    </div>

                    {/* Preview & Pass Phone CTA once recorded */}
                    {reversedOriginalBuffer && (
                      <div className="p-4 rounded-2xl bg-[#0B2419]/5 border border-[#0B2419]/15 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handlePlayBuffer(reversedOriginalBuffer, 1.0)}
                            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white border border-[#0B2419]/15 text-xs font-semibold text-[#0B2419] flex items-center gap-1.5 hover:bg-[#0B2419]/5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5 fill-[#0B2419]" />
                            <span>Oír cómo suena al revés</span>
                          </button>
                        </div>

                        <button
                          onClick={proceedToImitationPhase}
                          className="min-h-[46px] px-5 py-2.5 rounded-xl bg-[#0B2419] text-[#FBF8F3] font-bold text-xs sm:text-sm flex items-center gap-2 hover:bg-[#133E2B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <span>Pasar el móvil a {currentImitator.name}</span>
                          <ArrowRight className="w-4 h-4 text-[#F59E0B]" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ==================== PHASE 2: ALIEN LABORATORY (IMITATE REVERSED) ==================== */}
              {roundPhase === 'IMITATE_REVERSED' && (
                <div className="bg-[#FBF8F3] text-[#0B2419] rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#0B2419]/10 pb-4">
                    <div>
                      <p className="text-xs font-semibold text-[#E11D48]">
                        Paso 2 de 3 · Laboratorio de Imitación al Revés
                      </p>
                      <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0B2419] mt-0.5">
                        Turno de {currentImitator.avatar} {currentImitator.name}: Imita el Audio
                      </h1>
                    </div>

                    <button
                      onClick={() => setShowPhoneticGuide((v) => !v)}
                      className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#0B2419]/8 hover:bg-[#0B2419]/15 text-xs font-semibold text-[#0B2419] flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {showPhoneticGuide ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5" />
                          <span>Ocultar Chuleta</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          <span>Ver Chuleta Fonética</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Step A: Listen to the Alien Audio (1x or Slow-Mo 0.72x) */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-[#0B2419] text-[#FBF8F3] space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs text-[#FBF8F3]/70">
                          1. Escucha el audio invertido de {currentSpeaker.name}
                        </p>
                        <p className="text-sm font-semibold text-[#F59E0B]">
                          Apréndete la melodía rara y pronúnciala igual
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setPlaybackSpeed(1);
                            handlePlayBuffer(reversedOriginalBuffer, 1.0);
                          }}
                          className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            playbackSpeed === 1 && isPlayingAudio
                              ? 'bg-[#F59E0B] text-[#0B2419]'
                              : 'bg-white/15 text-[#FBF8F3] hover:bg-white/25'
                          }`}
                        >
                          <Volume2 className="w-4 h-4" />
                          <span>Oír Normal (1x)</span>
                        </button>

                        <button
                          onClick={() => {
                            setPlaybackSpeed(0.72);
                            handlePlayBuffer(reversedOriginalBuffer, 0.72);
                          }}
                          className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            playbackSpeed === 0.72 && isPlayingAudio
                              ? 'bg-[#F59E0B] text-[#0B2419]'
                              : 'bg-white/15 text-[#FBF8F3] hover:bg-white/25'
                          }`}
                        >
                          <Sliders className="w-3.5 h-3.5" />
                          <span>Cámara Lenta (0.7x)</span>
                        </button>
                      </div>
                    </div>

                    {/* Phonetic Alien Guide ("La Chuleta Fonética") */}
                    {showPhoneticGuide && (
                      <div className="p-4 rounded-xl bg-[#133E2B] border border-white/10 space-y-1.5">
                        <p className="text-[11px] text-[#FBF8F3]/70">
                          Chuleta Fonética Alienígena (léelo en voz alta de izquierda a derecha):
                        </p>
                        <p className="font-mono-tabular text-base sm:text-lg font-bold tracking-wide text-[#F59E0B]">
                          {activePhonetic.phoneticReverse}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Step B: Record the Imitation */}
                  <div className="space-y-4">
                    <WaveformCanvas
                      peaks={displayedPeaks}
                      progress={playbackProgress}
                      reverseDirection={!imitationBuffer}
                      isRecording={isRecording}
                      labelLeft={
                        isRecording
                          ? `Grabando a ${currentImitator.name}...`
                          : imitationBuffer
                            ? 'Imitación grabada y lista para invertir'
                            : 'Pulsa para grabar tu imitación alienígena'
                      }
                      labelRight={
                        isRecording
                          ? `${recordingSeconds.toFixed(1)}s`
                          : imitationBuffer
                            ? `${imitationBuffer.duration.toFixed(1)}s`
                            : ''
                      }
                    />

                    <div className="flex flex-wrap items-center gap-3">
                      {!isRecording ? (
                        <button
                          onClick={startMicRecording}
                          className="flex-1 min-h-[52px] px-5 py-3 rounded-2xl bg-[#E11D48] hover:bg-[#BE123C] text-white font-bold text-sm flex items-center justify-center gap-2.5 shadow-lg whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Mic className="w-5 h-5" />
                          <span>
                            {imitationBuffer
                              ? 'Repetir Imitación'
                              : `Grabar Imitación de ${currentImitator.name}`}
                          </span>
                        </button>
                      ) : (
                        <button
                          onClick={stopMicRecording}
                          className="flex-1 min-h-[52px] px-5 py-3 rounded-2xl bg-[#0B2419] text-white font-bold text-sm flex items-center justify-center gap-2.5 shadow-lg whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Square className="w-5 h-5 text-[#E11D48] fill-[#E11D48]" />
                          <span>Terminar Imitación ({recordingSeconds.toFixed(1)}s)</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleUseDemoVoice('imitation')}
                        className="min-h-[52px] px-4 py-3 rounded-2xl border border-[#0B2419]/20 hover:bg-[#0B2419]/5 text-xs font-semibold text-[#0B2419] flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Sparkles className="w-4 h-4 text-[#D97706]" />
                        <span>Simular Imitación Demo</span>
                      </button>
                    </div>

                    {finalReversedBuffer && (
                      <button
                        onClick={proceedToRevealPhase}
                        className="w-full min-h-[52px] px-6 py-3.5 rounded-2xl bg-[#0B2419] hover:bg-[#133E2B] text-[#FBF8F3] font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <span>Darle la Vuelta y Escuchar en la Mesa</span>
                        <ArrowRight className="w-4 h-4 text-[#F59E0B]" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* ==================== PHASE 3: REVEAL & POLVORÓN-ÍMETRO VERDICT ==================== */}
              {roundPhase === 'REVEAL_AND_SCORE' && verdictData && (
                <div className="bg-[#FBF8F3] text-[#0B2419] rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#0B2419]/10 pb-4">
                    <div>
                      <p className="text-xs font-semibold text-[#0B2419]/60">
                        Paso 3 de 3 · La Hora de la Verdad en la Mesa
                      </p>
                      <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0B2419] mt-0.5">
                        ¿Pero qué acaba de decir {currentImitator.name}?
                      </h1>
                    </div>
                  </div>

                  {/* Step 1 of Reveal: Listen to the reversed imitation BEFORE showing the phrase */}
                  <div className="p-5 rounded-2xl bg-[#0B2419] text-[#FBF8F3] space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs text-[#F59E0B] font-semibold">
                          Audio de {currentImitator.name} invertido al derecho
                        </p>
                        <p className="text-sm text-[#FBF8F3]/85 mt-0.5">
                          {secretRevealed
                            ? 'Comparativa de ondas: Dorado (Original) vs. Rojo (Imitación)'
                            : '¡Escuchadlo en alto! ¿Alguien de la mesa adivina la frase exacta?'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handlePlayBuffer(finalReversedBuffer, 1.0)}
                          className="min-h-[44px] px-4 py-2 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Volume2 className="w-4 h-4" />
                          <span>Oír Resultado Final</span>
                        </button>

                        {secretRevealed && (
                          <button
                            onClick={() => handlePlayBuffer(originalBuffer, 1.0)}
                            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-[#FBF8F3] text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span>Oír Original</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <WaveformCanvas
                      peaks={displayedPeaks}
                      secondaryPeaks={secondaryComparisonPeaks}
                      progress={playbackProgress}
                      reverseDirection={false}
                      labelLeft={
                        secretRevealed
                          ? 'Arriba: Original · Abajo: Imitación al derecho'
                          : 'Onda del resultado misterioso'
                      }
                      labelRight={
                        finalReversedBuffer ? `${finalReversedBuffer.duration.toFixed(1)}s` : ''
                      }
                    />
                  </div>

                  {!secretRevealed ? (
                    <button
                      onClick={handleRevealSecretAndScore}
                      className="w-full min-h-[54px] px-6 py-4 rounded-2xl bg-[#F59E0B] hover:bg-[#D97706] text-[#0B2419] font-display font-bold text-base flex items-center justify-center gap-2 shadow-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Award className="w-5 h-5" />
                      <span>Revelar Frase Secreta y Nota del Polvorón-ímetro</span>
                    </button>
                  ) : (
                    <div className="space-y-5">
                      {/* Secret Phrase & Acoustic Score Breakdown */}
                      <div className="p-5 rounded-2xl bg-white border border-[#0B2419]/15 space-y-4">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-[#0B2419]/60">
                              Frase Secreta Original · {verdictData.badge}
                            </p>
                            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#0B2419]">
                              "{activePhraseText}"
                            </h2>
                            <p className="font-mono-tabular text-xs text-[#0B2419]/60">
                              Chuleta invertida: {activePhonetic.phoneticReverse}
                            </p>
                          </div>

                          <div className="text-right bg-[#0B2419] text-[#FBF8F3] px-4 py-3 rounded-2xl shrink-0">
                            <p className="text-[11px] text-[#FBF8F3]/70">Polvorón-ímetro</p>
                            <p className="font-mono-tabular text-3xl font-bold text-[#F59E0B]">
                              {verdictData.score}%
                            </p>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-[#0B2419]/10">
                          <p className="font-display font-bold text-base text-[#E11D48]">
                            {verdictData.verdictTitle}
                          </p>
                          <p className="text-xs sm:text-sm text-[#0B2419]/80 mt-0.5 leading-relaxed">
                            {verdictData.verdictDetail}
                          </p>
                        </div>
                      </div>

                      {/* Table Bonus Vote & Advance to Next Turn */}
                      <div className="space-y-3">
                        <p className="text-xs font-semibold text-[#0B2419]/75 text-center">
                          Juez de Mesa: ¿Se ha entendido la frase antes de revelarla?
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <button
                            onClick={() => completeRoundAndNextTurn(true)}
                            className="min-h-[52px] px-4 py-3 rounded-2xl bg-[#0B2419] hover:bg-[#133E2B] text-[#FBF8F3] font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
                          >
                            <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                            <span>¡Sí, la mesa lo adivinó! (+{verdictData.score + 25} pts)</span>
                          </button>

                          <button
                            onClick={() => completeRoundAndNextTurn(false)}
                            className="min-h-[52px] px-4 py-3 rounded-2xl bg-[#E11D48] hover:bg-[#BE123C] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
                          >
                            <HelpCircle className="w-4 h-4" />
                            <span>Ni de broma, sonó alienígena (+{verdictData.score} pts)</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Right Column (3 cols on Desktop): Live Audio Jewels & Quick Rules */}
            <aside className="lg:col-span-3 space-y-6 order-3">
              <div className="bg-[#103324] border border-white/10 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-bold text-[#FBF8F3]">
                    Audios de la Noche
                  </h2>
                  <span className="font-mono-tabular text-xs text-[#F59E0B]">
                    {history.length} clips
                  </span>
                </div>

                {history.length === 0 ? (
                  <p className="text-xs text-[#FBF8F3]/70 leading-relaxed">
                    Cada vez que completéis una ronda, aquí quedará guardado el audio original, la
                    versión alienígena y el resultado para volver a reíros o descargarlo en WAV.
                  </p>
                ) : (
                  <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                    {history.slice(0, 5).map((clip) => (
                      <div
                        key={clip.id}
                        className="p-3.5 rounded-xl bg-[#0B2419]/80 border border-white/10 space-y-2"
                      >
                        <div className="flex items-center justify-between text-xs text-[#FBF8F3]/70">
                          <span className="font-semibold text-[#FBF8F3]">
                            {clip.imitatorName}
                          </span>
                          <span className="font-mono-tabular text-[#F59E0B] font-bold">
                            {clip.similarityScore}%
                          </span>
                        </div>
                        <p className="text-xs italic text-[#FBF8F3]/90 truncate">
                          "{clip.phrase}"
                        </p>
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={() => handlePlayBuffer(clip.finalReversedBuffer, 1.0)}
                            className="flex-1 min-h-[36px] px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-semibold text-[#FBF8F3] flex items-center justify-center gap-1 transition-colors whitespace-nowrap cursor-pointer"
                          >
                            <Volume2 className="w-3 h-3 text-[#F59E0B]" />
                            <span>Oír</span>
                          </button>
                          <a
                            href={clip.combinedWavUrl}
                            download={`pero-que-dices-ronda-${clip.roundNumber}.wav`}
                            className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[#E11D48]/20 hover:bg-[#E11D48]/35 text-[11px] font-semibold text-[#FDA4AF] flex items-center justify-center gap-1 transition-colors whitespace-nowrap"
                          >
                            <Download className="w-3 h-3" />
                            <span>WAV</span>
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {history.length > 0 && (
                  <button
                    onClick={() => setActiveTab('acta')}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#F59E0B] text-[#0B2419] text-xs font-bold hover:bg-[#D97706] transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Generar Ticket Oficial de la Cena
                  </button>
                )}
              </div>

              {/* Quick Sobremesa Tips */}
              <div className="bg-[#103324] border border-white/10 rounded-2xl p-5 space-y-2.5">
                <h3 className="font-display text-base font-bold text-[#F59E0B]">
                  Truco de Sobremesa
                </h3>
                <p className="text-xs text-[#FBF8F3]/80 leading-relaxed">
                  Para que el audio invertido salga clavado, lee la{' '}
                  <strong className="text-white">Chuleta Fonética</strong> exagerando las vocales y
                  copiando la entonación del audio en cámara lenta.
                </p>
              </div>
            </aside>
          </div>
        )}

        {/* ==================== TAB 2: MESA Y MODOS (PLAYERS & MODE SETUP) ==================== */}
        {activeTab === 'mesa' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left 6 cols: Player Roster Manager */}
            <div className="lg:col-span-6 bg-[#103324] border border-white/10 rounded-2xl p-6 sm:p-8 space-y-6">
              <div>
                <h2 className="font-display text-2xl font-bold text-[#FBF8F3]">
                  Comensales en la Mesa ({players.length})
                </h2>
                <p className="text-xs sm:text-sm text-[#FBF8F3]/75 mt-1">
                  Añade a todos los que están sentados a la mesa. La app irá rotando quién graba y
                  quién imita automáticamente.
                </p>
              </div>

              <form onSubmit={handleAddPlayer} className="flex items-center gap-3">
                <input
                  type="text"
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  placeholder="Nombre (ej. Tío Pepe, Laura RRHH, El Jefe...)"
                  className="flex-1 min-h-[48px] px-4 py-2.5 rounded-xl bg-[#071A12] border border-white/15 text-sm text-[#FBF8F3] placeholder:text-[#FBF8F3]/40 focus:outline-none focus:border-[#F59E0B]"
                />
                <button
                  type="submit"
                  className="min-h-[48px] px-5 py-2.5 rounded-xl bg-[#F59E0B] hover:bg-[#D97706] text-[#0B2419] font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Añadir</span>
                </button>
              </form>

              <div className="space-y-2.5">
                {players.map((p, index) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-[#0B2419]/80 border border-white/10"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono-tabular text-xs text-[#FBF8F3]/50 w-5">
                        0{index + 1}
                      </span>
                      <span className="text-2xl" aria-hidden="true">
                        {p.avatar}
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-[#FBF8F3] truncate">{p.name}</p>
                        <p className="text-xs text-[#FBF8F3]/60">
                          {p.score} puntos · {p.roundsPlayed} turnos jugados
                        </p>
                      </div>
                    </div>

                    {players.length > 2 && (
                      <button
                        onClick={() => handleRemovePlayer(p.id)}
                        aria-label={`Eliminar a ${p.name}`}
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[#FBF8F3]/50 hover:text-[#E11D48] hover:bg-white/5 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Right 6 cols: Mode Cards Showcase */}
            <div className="lg:col-span-6 space-y-5">
              <div>
                <h2 className="font-display text-2xl font-bold text-[#FBF8F3]">
                  Elige el Nivel de Salseo de Hoy
                </h2>
                <p className="text-xs sm:text-sm text-[#FBF8F3]/75 mt-1">
                  Puedes cambiar de mazo en cualquier momento de la cena sin perder los puntos.
                </p>
              </div>

              <div className="space-y-4">
                {GAME_MODES.map((m) => {
                  const isSelected = activeMode === m.id;
                  return (
                    <div
                      key={m.id}
                      onClick={() => {
                        setActiveMode(m.id);
                        playUiSound('tick');
                      }}
                      className={`grid grid-cols-1 sm:grid-cols-12 rounded-2xl overflow-hidden border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#133E2B] border-[#F59E0B] shadow-lg'
                          : 'bg-[#103324] border-white/10 hover:border-white/30'
                      }`}
                    >
                      <div className="sm:col-span-4 h-36 sm:h-auto bg-[#071A12] relative">
                        {!brokenImages[m.id] ? (
                          <img
                            src={m.imageUrl}
                            alt={m.title}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setBrokenImages((prev) => ({ ...prev, [m.id]: true }))
                            }
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center p-4">
                            <span className="font-display font-bold text-sm text-[#F59E0B]">
                              {m.title}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="sm:col-span-8 p-5 flex flex-col justify-between space-y-3">
                        <div>
                          <p className="text-xs text-[#F59E0B] font-semibold">
                            {m.audienceLabel}
                          </p>
                          <h3 className="font-display text-xl font-bold text-[#FBF8F3] mt-0.5">
                            {m.title}
                          </h3>
                          <p className="text-xs text-[#FBF8F3]/80 mt-1 leading-relaxed">
                            {m.subtitle}
                          </p>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-xs text-[#FBF8F3]/65">
                            {cards.filter((c) => c.mode === m.id).length} tarjetas listas
                          </span>
                          <span
                            className={`text-xs font-bold ${
                              isSelected ? 'text-[#F59E0B]' : 'text-[#FBF8F3]/70'
                            }`}
                          >
                            {isSelected ? 'Modo Seleccionado ✓' : 'Activar este modo →'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 3: MAZOS Y RETOS (DECK BROWSER & CUSTOM CREATOR) ==================== */}
        {activeTab === 'mazos' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left 5 cols: Create Custom Card with Live Phonetic Reversal */}
            <div className="lg:col-span-5 bg-[#103324] border border-white/10 rounded-2xl p-6 space-y-5">
              <div>
                <h2 className="font-display text-2xl font-bold text-[#FBF8F3]">
                  Creador de Salseo a Medida
                </h2>
                <p className="text-xs text-[#FBF8F3]/75 mt-1">
                  Mete anécdotas de tu familia, el nombre del jefe o chistes internos del grupo. La
                  app genera la chuleta fonética invertida al instante.
                </p>
              </div>

              <form onSubmit={handleCreateCustomCard} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#FBF8F3]/80">
                    ¿Para qué modo es esta tarjeta?
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {GAME_MODES.map((m) => (
                      <button
                        type="button"
                        key={m.id}
                        onClick={() => setDeckFilterMode(m.id)}
                        className={`min-h-[40px] px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap truncate cursor-pointer ${
                          deckFilterMode === m.id
                            ? 'bg-[#E11D48] text-white'
                            : 'bg-[#071A12] text-[#FBF8F3]/70 hover:text-white'
                        }`}
                      >
                        {m.title.replace('Modo ', '')}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#FBF8F3]/80">
                    Frase o Villancico para decir al revés
                  </label>
                  <input
                    type="text"
                    value={newCardText}
                    onChange={(e) => setNewCardText(e.target.value)}
                    placeholder="Ej. El tío Fernando siempre se duerme en el sofá"
                    className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[#071A12] border border-white/15 text-sm text-[#FBF8F3] placeholder:text-[#FBF8F3]/40 focus:outline-none focus:border-[#F59E0B]"
                  />
                </div>

                {newCardText.trim() && (
                  <div className="p-3.5 rounded-xl bg-[#071A12] border border-[#F59E0B]/30 space-y-1">
                    <p className="text-[11px] text-[#FBF8F3]/65">
                      Vista previa de la Chuleta Fonética:
                    </p>
                    <p className="font-mono-tabular text-sm font-bold text-[#F59E0B]">
                      {generatePhoneticGuide(newCardText).phoneticReverse}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#FBF8F3]/80">Categoría</label>
                    <select
                      value={newCardCategory}
                      onChange={(e) =>
                        setNewCardCategory(e.target.value as GameCard['category'])
                      }
                      className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#071A12] border border-white/15 text-xs text-[#FBF8F3]"
                    >
                      <option value="Frase de Mesa">Frase de Mesa</option>
                      <option value="Villancico / Temazo">Villancico / Temazo</option>
                      <option value="Trabalenguas">Trabalenguas</option>
                      <option value="Cliché">Cliché</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#FBF8F3]/80">
                      Pista o guiño (opcional)
                    </label>
                    <input
                      type="text"
                      value={newCardHint}
                      onChange={(e) => setNewCardHint(e.target.value)}
                      placeholder="Ej. Clásico de Nochebuena"
                      className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#071A12] border border-white/15 text-xs text-[#FBF8F3]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#F59E0B] hover:bg-[#D97706] text-[#0B2419] font-bold text-sm flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Guardar Tarjeta en el Mazo</span>
                </button>
              </form>
            </div>

            {/* Right 7 cols: Browse & Send Any Card Directly to Stage */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-2xl font-bold text-[#FBF8F3]">
                  Repertorio de Tarjetas ({cards.filter((c) => c.mode === deckFilterMode).length})
                </h2>

                <div className="flex items-center gap-1.5 p-1 bg-[#071A12] rounded-xl border border-white/10">
                  {GAME_MODES.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setDeckFilterMode(m.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        deckFilterMode === m.id
                          ? 'bg-[#F59E0B] text-[#0B2419]'
                          : 'text-[#FBF8F3]/70 hover:text-white'
                      }`}
                    >
                      {m.title}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {cards
                  .filter((c) => c.mode === deckFilterMode)
                  .map((card) => (
                    <div
                      key={card.id}
                      className="p-4 rounded-2xl bg-[#103324] border border-white/10 flex flex-col justify-between space-y-3"
                    >
                      <div className="space-y-1.5">
                        <p className="text-xs text-[#FBF8F3]/60">
                          {card.category} · Dificultad {card.difficulty}/3
                        </p>
                        <p className="font-display font-bold text-base text-[#FBF8F3]">
                          "{card.text}"
                        </p>
                        <p className="font-mono-tabular text-xs text-[#F59E0B]">
                          {card.phoneticReverse}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-[#FBF8F3]/60 truncate">{card.hint}</span>
                        <button
                          onClick={() => {
                            setActiveMode(card.mode);
                            setSelectedCard(card);
                            setUseCustomPhrase(false);
                            setRoundPhase('PICK_AND_RECORD');
                            setActiveTab('escenario');
                            playUiSound('tick');
                          }}
                          className="min-h-[36px] px-3 py-1 rounded-lg bg-white/10 hover:bg-[#F59E0B] hover:text-[#0B2419] text-xs font-semibold text-[#FBF8F3] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Jugar Ahora →
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 4: ACTA DE LA CENA (GALA RECEIPT & WHATSAPP SHARE) ==================== */}
        {activeTab === 'acta' && (
          <GalaReceiptView
            players={players}
            history={history}
            activeMode={activeMode}
            onPlayBuffer={(buf) => handlePlayBuffer(buf, 1.0)}
            onNewGame={handleResetGame}
            onBackToStage={() => setActiveTab('escenario')}
          />
        )}
      </main>

      {/* ==================== MOBILE BOTTOM NAVIGATION BAR (THUMB ZONE, <15% HEIGHT) ==================== */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#081C13]/95 backdrop-blur-md border-t border-white/10 grid grid-cols-4 items-center h-16 px-2">
        <button
          onClick={() => setActiveTab('escenario')}
          className={`flex flex-col items-center justify-center min-h-[44px] cursor-pointer ${
            activeTab === 'escenario' ? 'text-[#F59E0B]' : 'text-[#FBF8F3]/65'
          }`}
        >
          <Mic className="w-5 h-5" />
          <span className="text-[10px] font-semibold mt-0.5 whitespace-nowrap">Escenario</span>
        </button>

        <button
          onClick={() => setActiveTab('mesa')}
          className={`flex flex-col items-center justify-center min-h-[44px] cursor-pointer ${
            activeTab === 'mesa' ? 'text-[#F59E0B]' : 'text-[#FBF8F3]/65'
          }`}
        >
          <Users className="w-5 h-5" />
          <span className="text-[10px] font-semibold mt-0.5 whitespace-nowrap">
            Mesa ({players.length})
          </span>
        </button>

        <button
          onClick={() => setActiveTab('mazos')}
          className={`flex flex-col items-center justify-center min-h-[44px] cursor-pointer ${
            activeTab === 'mazos' ? 'text-[#F59E0B]' : 'text-[#FBF8F3]/65'
          }`}
        >
          <RotateCcw className="w-5 h-5" />
          <span className="text-[10px] font-semibold mt-0.5 whitespace-nowrap">Mazos</span>
        </button>

        <button
          onClick={() => setActiveTab('acta')}
          className={`flex flex-col items-center justify-center min-h-[44px] cursor-pointer ${
            activeTab === 'acta' ? 'text-[#F59E0B]' : 'text-[#FBF8F3]/65'
          }`}
        >
          <Award className="w-5 h-5" />
          <span className="text-[10px] font-semibold mt-0.5 whitespace-nowrap">
            Acta ({history.length})
          </span>
        </button>
      </nav>
    </div>
  );
}
