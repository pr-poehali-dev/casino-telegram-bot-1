import { useState, useRef, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';

const SYMBOLS = [
  { id: 'cherry',  emoji: '🍒', weight: 30, payout: 3   },
  { id: 'lemon',   emoji: '🍋', weight: 26, payout: 4   },
  { id: 'grape',   emoji: '🍇', weight: 22, payout: 5   },
  { id: 'bell',    emoji: '🔔', weight: 14, payout: 10  },
  { id: 'star',    emoji: '⭐', weight: 9,  payout: 20  },
  { id: 'seven',   emoji: '7️⃣', weight: 5,  payout: 50  },
  { id: 'diamond', emoji: '💎', weight: 3,  payout: 100 },
];

const STRIP = Array.from({ length: 40 }, (_, i) => SYMBOLS[i % SYMBOLS.length]);
const BET_STEPS = [50, 100, 250, 500, 1000];
const CELL = 80;

// ─── Web Audio helpers ───────────────────────────────────────────────────────

function getCtx(): AudioContext | null {
  try {
    type WinAudio = typeof window & { webkitAudioContext?: typeof AudioContext };
    const Ctor = window.AudioContext || (window as WinAudio).webkitAudioContext;
    return Ctor ? new Ctor() : null;
  } catch {
    return null;
  }
}

function playClick(ctx: AudioContext, when: number) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.04, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = 0.18;
  src.connect(g);
  g.connect(ctx.destination);
  src.start(when);
}

function playReelSpin(ctx: AudioContext): () => void {
  const interval = 0.055;
  let t = ctx.currentTime;
  const handles: ReturnType<typeof setInterval>[] = [];

  const tick = () => {
    for (let i = 0; i < 3; i++) {
      playClick(ctx, t + i * (interval / 3));
    }
    t += interval;
  };
  tick();
  const h = setInterval(tick, interval * 1000);
  handles.push(h);
  return () => handles.forEach(clearInterval);
}

function playReelStop(ctx: AudioContext, reelIndex: number) {
  const freq = [220, 246, 277][reelIndex];
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.25, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.18);

  // mechanical thud
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.06, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 4) * 0.6;
  const s = ctx.createBufferSource();
  s.buffer = buf;
  const g2 = ctx.createGain();
  g2.gain.value = 0.35;
  s.connect(g2);
  g2.connect(ctx.destination);
  s.start();
}

function playWin(ctx: AudioContext, big: boolean) {
  const notes = big
    ? [523, 659, 784, 1047, 1319]
    : [440, 554, 659, 784];

  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = big ? 'square' : 'triangle';
    osc.frequency.value = freq;
    const t = ctx.currentTime + i * 0.11;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(big ? 0.18 : 0.14, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.35);
  });

  if (big) {
    // golden shimmer: fast arpeggio
    [1047, 1319, 1568, 2093].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const t = ctx.currentTime + 0.55 + i * 0.07;
      g.gain.setValueAtTime(0.1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t + 0.22);
    });
  }
}

function playLose(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(200, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.3);
  g.gain.setValueAtTime(0.12, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
  osc.connect(g); g.connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + 0.32);
}

function playBetClick(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 880;
  g.gain.setValueAtTime(0.08, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
  osc.connect(g); g.connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + 0.09);
}

// ─── Game logic ──────────────────────────────────────────────────────────────

function weightedPick() {
  const total = SYMBOLS.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const s of SYMBOLS) { if (r < s.weight) return s; r -= s.weight; }
  return SYMBOLS[0];
}

type SpinResult = { win: number; payoutMult: number; symbols: typeof SYMBOLS } | null;

function evaluate(result: (typeof SYMBOLS)[number][], bet: number): { win: number; mult: number } {
  const [a, b, c] = result;
  if (a.id === b.id && b.id === c.id) return { win: bet * a.payout, mult: a.payout };
  if (a.id === b.id || b.id === c.id || a.id === c.id) return { win: Math.round(bet * 1.5), mult: 1.5 };
  return { win: 0, mult: 0 };
}

// ─── Reel component ──────────────────────────────────────────────────────────

function Reel({ targetIndex, spinning, delay }: { targetIndex: number; spinning: boolean; delay: number }) {
  const offset = spinning ? 0 : -(targetIndex * CELL);
  return (
    <div
      className="relative overflow-hidden rounded-2xl bg-background/60 border border-gold/20"
      style={{ height: CELL, width: CELL }}
    >
      <div className="absolute inset-0 z-10 pointer-events-none rounded-2xl"
        style={{ boxShadow: 'inset 0 12px 20px -8px rgba(0,0,0,0.9), inset 0 -12px 20px -8px rgba(0,0,0,0.9)' }} />
      <div
        className="flex flex-col"
        style={{
          transform: `translateY(${offset}px)`,
          transition: spinning ? 'none' : `transform 1.1s cubic-bezier(0.18, 0.9, 0.25, 1) ${delay}ms`,
          animation: spinning ? 'reel-spin 0.18s linear infinite' : undefined,
        }}
      >
        {STRIP.map((s, i) => (
          <div key={i} className="flex items-center justify-center" style={{ height: CELL, fontSize: 40 }}>
            {s.emoji}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function SlotsGame({
  balance,
  onBalanceChange,
  onBack,
  onGameResult,
}: {
  balance: number;
  onBalanceChange: (delta: number) => void;
  onBack: () => void;
  onGameResult?: (bet: number, result: number, isWin: boolean, details: object) => void;
}) {
  const [bet, setBet] = useState(100);
  const [spinning, setSpinning] = useState(false);
  const [targets, setTargets] = useState<number[]>([5, 12, 19]);
  const [result, setResult] = useState<SpinResult>(null);
  const [lastWin, setLastWin] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);

  const timers = useRef<number[]>([]);
  const stopSpinRef = useRef<(() => void) | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);

  const getAudio = useCallback(() => {
    if (muted) return null;
    if (!audioCtx.current || audioCtx.current.state === 'closed') {
      audioCtx.current = getCtx();
    }
    if (audioCtx.current?.state === 'suspended') {
      audioCtx.current.resume();
    }
    return audioCtx.current;
  }, [muted]);

  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    stopSpinRef.current?.();
    audioCtx.current?.close();
  }, []);

  const spin = () => {
    if (spinning || bet > balance) return;

    onBalanceChange(-bet);
    setResult(null);
    setLastWin(null);
    setSpinning(true);

    const ctx = getAudio();
    if (ctx) stopSpinRef.current = playReelSpin(ctx);

    const picks = [weightedPick(), weightedPick(), weightedPick()];
    const newTargets = picks.map((p) => {
      const candidates = STRIP.map((s, i) => (s.id === p.id ? i : -1)).filter((i) => i >= 10 && i <= 30);
      return candidates[Math.floor(Math.random() * candidates.length)] ?? 14;
    });

    const stopDelays = [600, 950, 1300];
    stopDelays.forEach((d, idx) => {
      const t = window.setTimeout(() => {
        setTargets((prev) => { const next = [...prev]; next[idx] = newTargets[idx]; return next; });
        const c = getAudio();
        if (c) playReelStop(c, idx);
        if (idx === 2) { stopSpinRef.current?.(); stopSpinRef.current = null; }
      }, d);
      timers.current.push(t);
    });

    const finish = window.setTimeout(() => {
      setSpinning(false);
      const { win, mult } = evaluate(picks, bet);
      onGameResult?.(bet, win, win > 0, { mult, symbols: picks });
      if (win > 0) {
        onBalanceChange(win);
        setLastWin(win);
        const c = getAudio();
        if (c) playWin(c, mult >= 10);
      } else {
        setLastWin(0);
        const c = getAudio();
        if (c) playLose(c);
      }
      setResult({ win, payoutMult: mult, symbols: picks });
    }, stopDelays[2] + 1200);
    timers.current.push(finish);
  };

  const handleBetClick = (v: number) => {
    setBet(v);
    const c = getAudio();
    if (c) playBetClick(c);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 animate-float-up">
        <button onClick={onBack} className="w-10 h-10 rounded-xl glass flex items-center justify-center text-gold">
          <Icon name="ArrowLeft" size={20} />
        </button>
        <div>
          <h2 className="font-display text-2xl font-bold tracking-wide leading-none">Слоты</h2>
          <p className="text-sm text-muted-foreground">Собери 3 в ряд</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setMuted((m) => !m)}
            className={`w-9 h-9 rounded-xl glass flex items-center justify-center transition-colors ${muted ? 'text-muted-foreground' : 'text-gold'}`}
            title={muted ? 'Включить звук' : 'Выключить звук'}
          >
            <Icon name={muted ? 'VolumeX' : 'Volume2'} size={18} />
          </button>
          <div className="glass rounded-full px-3 py-1.5 flex items-center gap-1.5">
            <span className="font-display font-semibold text-gold tabular-nums">{balance.toLocaleString('ru')}</span>
            <span className="text-xs text-muted-foreground">₽</span>
          </div>
        </div>
      </div>

      {/* Machine */}
      <div
        className="relative animate-float-up rounded-3xl glass glow-soft p-6 overflow-hidden"
        style={{ animationDelay: '60ms' }}
      >
        <div className="absolute inset-0 shimmer-line opacity-20 pointer-events-none" />
        {/* win line */}
        <div
          className="absolute left-4 right-4 top-1/2 -translate-y-1/2 h-[2px] z-20 pointer-events-none transition-opacity duration-300"
          style={{
            background: lastWin && lastWin > 0
              ? 'linear-gradient(90deg, transparent, hsl(43 74% 52%), transparent)'
              : 'hsl(43 74% 52% / 0.3)',
            boxShadow: lastWin && lastWin > 0 ? '0 0 12px hsl(43 74% 52% / 0.8)' : 'none',
            marginTop: '-2px',
          }}
        />

        <div className="relative flex justify-center gap-3 z-10">
          {[0, 1, 2].map((i) => (
            <Reel key={i} targetIndex={targets[i]} spinning={spinning} delay={i * 120} />
          ))}
        </div>

        {/* result banner */}
        <div className="h-12 mt-4 flex items-center justify-center">
          {lastWin !== null && lastWin > 0 && (
            <div className="animate-win-pop flex items-center gap-2 gold-gradient text-background px-5 py-2 rounded-full font-display font-bold glow-gold">
              <Icon name="PartyPopper" size={20} />
              ВЫИГРЫШ +{lastWin.toLocaleString('ru')} ₽
            </div>
          )}
          {lastWin === 0 && !spinning && (
            <div className="animate-float-up text-muted-foreground text-sm flex items-center gap-1.5">
              <Icon name="RefreshCw" size={14} /> Не повезло — крути ещё!
            </div>
          )}
          {spinning && (
            <div className="text-gold text-sm flex items-center gap-1.5 font-medium">
              <Icon name="Loader" size={16} className="animate-spin" /> Барабаны крутятся...
            </div>
          )}
        </div>
      </div>

      {/* Bet control */}
      <div className="animate-float-up glass rounded-2xl p-4 space-y-3" style={{ animationDelay: '120ms' }}>
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Ставка</span>
          <span className="font-display text-xl font-bold gold-text tabular-nums">{bet.toLocaleString('ru')} ₽</span>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {BET_STEPS.map((v) => (
            <button
              key={v}
              disabled={spinning}
              onClick={() => handleBetClick(v)}
              className={`py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 ${
                bet === v ? 'gold-gradient text-background' : 'bg-background/50 text-foreground/70'
              }`}
            >
              {v >= 1000 ? `${v / 1000}к` : v}
            </button>
          ))}
        </div>
      </div>

      <Button
        onClick={spin}
        disabled={spinning || bet > balance}
        className="w-full gold-gradient text-background font-bold text-lg h-14 glow-gold disabled:opacity-50"
      >
        {spinning ? (
          <><Icon name="Loader" size={22} className="mr-2 animate-spin" /> Крутим...</>
        ) : bet > balance ? (
          'Недостаточно средств'
        ) : (
          <><Icon name="Play" size={22} className="mr-2" /> Крутить за {bet.toLocaleString('ru')} ₽</>
        )}
      </Button>

      {/* Paytable */}
      <div className="animate-float-up glass rounded-2xl p-4" style={{ animationDelay: '180ms' }}>
        <h3 className="font-display font-semibold mb-3 flex items-center gap-2">
          <Icon name="Table" size={18} className="text-gold" /> Таблица выплат
        </h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {SYMBOLS.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1">
                <span className="text-xl">{s.emoji}{s.emoji}{s.emoji}</span>
              </span>
              <span className="font-display font-semibold text-gold">×{s.payout}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-gold/10 text-xs text-muted-foreground flex items-center gap-1.5">
          <Icon name="Info" size={13} /> Любая пара одинаковых — возврат ×1.5
        </div>
      </div>
    </div>
  );
}