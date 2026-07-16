import { useState, useRef, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';

// ─── Roulette numbers layout (European, 37 pockets) ──────────────────────────
const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

const RED_NUMS = new Set([1,3,5,7,9,12,14,16,18,21,23,25,27,30,32,34,36]);

function getColor(n: number): 'red' | 'black' | 'green' {
  if (n === 0) return 'green';
  return RED_NUMS.has(n) ? 'red' : 'black';
}

// ─── Web Audio ────────────────────────────────────────────────────────────────
function getCtx(): AudioContext | null {
  try {
    type WA = typeof window & { webkitAudioContext?: typeof AudioContext };
    const Ctor = window.AudioContext || (window as WA).webkitAudioContext;
    return Ctor ? new Ctor() : null;
  } catch { return null; }
}
function ensureCtx(ref: React.MutableRefObject<AudioContext | null>) {
  if (!ref.current || ref.current.state === 'closed') ref.current = getCtx();
  if (ref.current?.state === 'suspended') ref.current.resume();
  return ref.current;
}

function playBallTick(ctx: AudioContext) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = 'sine'; o.frequency.value = 1800 + Math.random() * 400;
  g.gain.setValueAtTime(0.06, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
  o.connect(g); g.connect(ctx.destination);
  o.start(); o.stop(ctx.currentTime + 0.06);
}

function playWheelSpin(ctx: AudioContext): () => void {
  let running = true; let interval = 60;
  const tick = () => {
    if (!running) return;
    playBallTick(ctx);
    if (interval < 200) interval += 1.5;
    setTimeout(tick, interval);
  };
  tick();
  return () => { running = false; };
}

function playBallLand(ctx: AudioContext) {
  [1200, 900, 600].forEach((f, i) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    const t = ctx.currentTime + i * 0.09;
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + 0.2);
  });
}

function playWin(ctx: AudioContext, big: boolean) {
  const notes = big ? [523, 659, 784, 1047, 1319] : [440, 554, 659, 784];
  notes.forEach((freq, i) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = big ? 'square' : 'triangle'; o.frequency.value = freq;
    const t = ctx.currentTime + i * 0.1;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(big ? 0.15 : 0.12, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + 0.32);
  });
}

function playLose(ctx: AudioContext) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(240, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(90, ctx.currentTime + 0.35);
  g.gain.setValueAtTime(0.12, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
  o.connect(g); g.connect(ctx.destination);
  o.start(); o.stop(ctx.currentTime + 0.38);
}

function playClick(ctx: AudioContext) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = 'sine'; o.frequency.value = 880;
  g.gain.setValueAtTime(0.07, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
  o.connect(g); g.connect(ctx.destination);
  o.start(); o.stop(ctx.currentTime + 0.08);
}

// ─── Roulette Wheel Canvas ────────────────────────────────────────────────────
function RouletteWheel({ spinning, result, angle }: {
  spinning: boolean;
  result: number | null;
  angle: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const SIZE = 260;
  const R = SIZE / 2;
  const NUM_POCKETS = WHEEL_ORDER.length;
  const ARC = (Math.PI * 2) / NUM_POCKETS;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, SIZE, SIZE);

    // Outer rim
    ctx.beginPath();
    ctx.arc(R, R, R - 1, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1208';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(R, R, R - 4, 0, Math.PI * 2);
    ctx.strokeStyle = '#b8860b';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Draw pockets
    WHEEL_ORDER.forEach((num, i) => {
      const startAngle = angle + i * ARC - ARC / 2;
      const endAngle = startAngle + ARC;
      const color = getColor(num);

      ctx.beginPath();
      ctx.moveTo(R, R);
      ctx.arc(R, R, R - 8, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle =
        color === 'green' ? '#1a6b3c' :
        color === 'red'   ? '#8b1a1a' : '#111';
      ctx.fill();
      ctx.strokeStyle = '#b8860b';
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // Number label
      const midAngle = startAngle + ARC / 2;
      const labelR = R - 22;
      const x = R + labelR * Math.cos(midAngle);
      const y = R + labelR * Math.sin(midAngle);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(midAngle + Math.PI / 2);
      ctx.fillStyle = '#f5e6c8';
      ctx.font = 'bold 8px Oswald, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(num), 0, 0);
      ctx.restore();
    });

    // Inner decorative circle
    const grad = ctx.createRadialGradient(R, R, R * 0.25, R, R, R * 0.42);
    grad.addColorStop(0, '#2a1f0a');
    grad.addColorStop(1, '#1a1208');
    ctx.beginPath();
    ctx.arc(R, R, R * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(R, R, R * 0.42, 0, Math.PI * 2);
    ctx.strokeStyle = '#b8860b';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Center cap
    const capGrad = ctx.createRadialGradient(R, R, 0, R, R, R * 0.12);
    capGrad.addColorStop(0, '#d4a017');
    capGrad.addColorStop(1, '#8b6914');
    ctx.beginPath();
    ctx.arc(R, R, R * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = capGrad;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(R, R, R * 0.12, 0, Math.PI * 2);
    ctx.strokeStyle = '#f0c040';
    ctx.lineWidth = 1.5;
    ctx.stroke();

  }, [angle, R, ARC]);

  return (
    <div className="relative flex items-center justify-center">
      {/* Outer glow ring */}
      <div className="absolute inset-0 rounded-full"
        style={{ boxShadow: spinning ? '0 0 40px hsl(43 74% 52% / 0.5)' : '0 0 20px hsl(43 74% 52% / 0.2)', transition: 'box-shadow 0.5s' }} />

      <canvas ref={canvasRef} width={SIZE} height={SIZE} style={{ borderRadius: '50%', display: 'block' }} />

      {/* Ball marker (fixed at top) */}
      <div className="absolute top-1 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full z-20"
        style={{
          background: 'radial-gradient(circle at 35% 35%, #fff, #ccc)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.8)',
        }} />

      {/* Pointer triangle */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-0.5 z-30"
        style={{
          width: 0, height: 0,
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: '12px solid hsl(43 74% 52%)',
          filter: 'drop-shadow(0 0 4px hsl(43 74% 52%))',
        }} />

      {/* Center result */}
      {result !== null && !spinning && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="flex flex-col items-center">
            <span
              className="font-display font-bold tabular-nums"
              style={{
                fontSize: 36,
                color: getColor(result) === 'red' ? 'hsl(var(--crimson))' :
                       getColor(result) === 'green' ? 'hsl(var(--emerald))' : '#e0e0e0',
                textShadow: '0 0 12px rgba(0,0,0,0.9)',
              }}
            >
              {result}
            </span>
            <span className="text-[10px] uppercase tracking-wider font-semibold"
              style={{
                color: getColor(result) === 'red' ? 'hsl(var(--crimson))' :
                       getColor(result) === 'green' ? 'hsl(var(--emerald))' : '#aaa',
              }}
            >
              {getColor(result) === 'red' ? 'Красное' : getColor(result) === 'green' ? 'Зеро' : 'Чёрное'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Bet types ────────────────────────────────────────────────────────────────
type BetType =
  | { kind: 'number'; value: number }
  | { kind: 'color'; value: 'red' | 'black' }
  | { kind: 'parity'; value: 'even' | 'odd' }
  | { kind: 'half'; value: '1-18' | '19-36' }
  | { kind: 'dozen'; value: '1-12' | '13-24' | '25-36' };

function betLabel(b: BetType): string {
  if (b.kind === 'number') return String(b.value);
  if (b.kind === 'color') return b.value === 'red' ? 'Красное' : 'Чёрное';
  if (b.kind === 'parity') return b.value === 'even' ? 'Чётное' : 'Нечётное';
  if (b.kind === 'half') return b.value;
  return b.value;
}

function betPayout(b: BetType): number {
  if (b.kind === 'number') return 35;
  if (b.kind === 'dozen') return 2;
  return 1; // color, parity, half
}

function betWins(b: BetType, result: number): boolean {
  const c = getColor(result);
  if (b.kind === 'number') return b.value === result;
  if (b.kind === 'color') return c === b.value;
  if (b.kind === 'parity') {
    if (result === 0) return false;
    return b.value === 'even' ? result % 2 === 0 : result % 2 !== 0;
  }
  if (b.kind === 'half') {
    if (result === 0) return false;
    return b.value === '1-18' ? result <= 18 : result >= 19;
  }
  if (b.kind === 'dozen') {
    if (result === 0) return false;
    if (b.value === '1-12') return result <= 12;
    if (b.value === '13-24') return result >= 13 && result <= 24;
    return result >= 25;
  }
  return false;
}

// ─── Main component ───────────────────────────────────────────────────────────

const BET_STEPS = [50, 100, 250, 500, 1000];
type Phase = 'idle' | 'spinning' | 'result';

interface PlacedBet { type: BetType; amount: number; }

export default function RouletteGame({
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
  const [bets, setBets] = useState<PlacedBet[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<number | null>(null);
  const [wheelAngle, setWheelAngle] = useState(0);
  const [totalWin, setTotalWin] = useState(0);
  const [muted, setMuted] = useState(false);
  const [activeTab, setActiveTab] = useState<'outside' | 'numbers'>('outside');

  const timers = useRef<number[]>([]);
  const stopSpin = useRef<(() => void) | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const angleRef = useRef(0);
  const rafRef = useRef(0);

  const getAudio = useCallback(() => {
    if (muted) return null;
    return ensureCtx(audioCtx);
  }, [muted]);

  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    stopSpin.current?.();
    cancelAnimationFrame(rafRef.current);
    audioCtx.current?.close();
  }, []);

  const totalBet = bets.reduce((s, b) => s + b.amount, 0);

  const placeBet = (type: BetType) => {
    if (phase === 'spinning') return;
    setBets(prev => {
      const existing = prev.find(b =>
        b.type.kind === type.kind && (b.type as { value: unknown }).value === (type as { value: unknown }).value
      );
      if (existing) {
        return prev.map(b =>
          b === existing ? { ...b, amount: b.amount + bet } : b
        );
      }
      return [...prev, { type, amount: bet }];
    });
    const ctx = getAudio(); if (ctx) playClick(ctx);
  };

  const clearBets = () => { setBets([]); setResult(null); };

  const spin = () => {
    if (phase === 'spinning' || bets.length === 0) return;
    if (totalBet <= 0 || totalBet > balance) return;

    onBalanceChange(-totalBet);
    setPhase('spinning');
    setResult(null);
    setTotalWin(0);

    const ctx = getAudio();
    if (ctx) stopSpin.current = playWheelSpin(ctx);

    // animate wheel
    const speed = 0.18;
    const targetResult = WHEEL_ORDER[Math.floor(Math.random() * WHEEL_ORDER.length)];
    const targetIdx = WHEEL_ORDER.indexOf(targetResult);
    const ARC = (Math.PI * 2) / WHEEL_ORDER.length;
    const fullRotations = Math.PI * 2 * (8 + Math.floor(Math.random() * 4));
    const targetAngle = -(targetIdx * ARC) + fullRotations;
    const startAngle = angleRef.current;
    const duration = 4000;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const currentAngle = startAngle + targetAngle * ease;
      angleRef.current = currentAngle;
      setWheelAngle(currentAngle);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        // stopped
        stopSpin.current?.(); stopSpin.current = null;
        const ctx2 = getAudio();
        if (ctx2) playBallLand(ctx2);

        setResult(targetResult);

        const win = bets.reduce((total, placedBet) => {
          if (betWins(placedBet.type, targetResult)) {
            return total + placedBet.amount * (betPayout(placedBet.type) + 1);
          }
          return total;
        }, 0);

        setTotalWin(win);
        onGameResult?.(totalBet, win, win > 0, { number: targetResult });
        if (win > 0) {
          onBalanceChange(win);
          const ctx3 = getAudio();
          if (ctx3) playWin(ctx3, win >= totalBet * 5);
        } else {
          const ctx3 = getAudio();
          if (ctx3) playLose(ctx3);
        }
        setPhase('result');
      }
    };
    rafRef.current = requestAnimationFrame(animate);
  };

  // Number grid colors
  const numColor = (n: number) => {
    const c = getColor(n);
    return c === 'red' ? 'hsl(var(--crimson))' : c === 'green' ? 'hsl(var(--emerald))' : '#1a1a1a';
  };

  const hasBet = (type: BetType) =>
    bets.find(b => b.type.kind === type.kind && (b.type as { value: unknown }).value === (type as { value: unknown }).value);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 animate-float-up">
        <button onClick={onBack} className="w-10 h-10 rounded-xl glass flex items-center justify-center text-gold">
          <Icon name="ArrowLeft" size={20} />
        </button>
        <div>
          <h2 className="font-display text-2xl font-bold tracking-wide leading-none">Рулетка</h2>
          <p className="text-sm text-muted-foreground">Европейская, 37 секторов</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setMuted(m => !m)}
            className={`w-9 h-9 rounded-xl glass flex items-center justify-center ${muted ? 'text-muted-foreground' : 'text-gold'}`}
          >
            <Icon name={muted ? 'VolumeX' : 'Volume2'} size={18} />
          </button>
          <div className="glass rounded-full px-3 py-1.5 flex items-center gap-1.5">
            <span className="font-display font-semibold text-gold tabular-nums">{balance.toLocaleString('ru')}</span>
            <span className="text-xs text-muted-foreground">₽</span>
          </div>
        </div>
      </div>

      {/* Wheel */}
      <div className="animate-float-up flex flex-col items-center glass rounded-3xl glow-soft p-5 relative overflow-hidden"
        style={{ animationDelay: '60ms' }}>
        <div className="absolute inset-0 shimmer-line opacity-10 pointer-events-none" />
        <RouletteWheel spinning={phase === 'spinning'} result={result} angle={wheelAngle} />

        {/* Result banner */}
        <div className="h-10 w-full flex items-center justify-center mt-2">
          {phase === 'result' && totalWin > 0 && (
            <div className="animate-win-pop flex items-center gap-2 gold-gradient text-background px-5 py-2 rounded-full font-display font-bold glow-gold">
              <Icon name="PartyPopper" size={18} />
              ВЫИГРЫШ +{totalWin.toLocaleString('ru')} ₽
            </div>
          )}
          {phase === 'result' && totalWin === 0 && (
            <div className="animate-float-up text-muted-foreground text-sm flex items-center gap-1.5">
              <Icon name="RefreshCw" size={14} /> Выпало {result} — не угадал!
            </div>
          )}
          {phase === 'spinning' && (
            <div className="text-gold text-sm flex items-center gap-2 font-medium">
              <Icon name="Loader" size={16} className="animate-spin" /> Шарик летит...
            </div>
          )}
          {phase === 'idle' && bets.length === 0 && (
            <div className="text-muted-foreground text-sm">Сделай ставку и крути</div>
          )}
        </div>
      </div>

      {/* Placed bets summary */}
      {bets.length > 0 && (
        <div className="animate-float-up glass rounded-2xl p-3 flex flex-wrap gap-2 items-center">
          {bets.map((b, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-xs bg-gold/15 text-gold rounded-full px-2.5 py-1 font-medium">
              {betLabel(b.type)} <span className="opacity-70">·</span> {b.amount.toLocaleString('ru')}₽
            </span>
          ))}
          <button onClick={clearBets} className="ml-auto text-muted-foreground hover:text-crimson transition-colors">
            <Icon name="X" size={16} />
          </button>
        </div>
      )}

      {/* Bet tabs */}
      <div className="animate-float-up glass rounded-2xl overflow-hidden" style={{ animationDelay: '80ms' }}>
        <div className="flex border-b border-gold/10">
          {(['outside', 'numbers'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                activeTab === tab ? 'text-gold border-b-2 border-gold' : 'text-muted-foreground'
              }`}
            >
              {tab === 'outside' ? 'Внешние ставки' : 'На число'}
            </button>
          ))}
        </div>

        <div className="p-3">
          {activeTab === 'outside' && (
            <div className="space-y-2">
              {/* Color / Parity / Half row */}
              <div className="grid grid-cols-2 gap-2">
                {([
                  { type: { kind: 'color', value: 'red' } as BetType, label: '🔴 Красное', payout: '×1' },
                  { type: { kind: 'color', value: 'black' } as BetType, label: '⚫ Чёрное', payout: '×1' },
                  { type: { kind: 'parity', value: 'even' } as BetType, label: 'Чётное', payout: '×1' },
                  { type: { kind: 'parity', value: 'odd' } as BetType, label: 'Нечётное', payout: '×1' },
                  { type: { kind: 'half', value: '1-18' } as BetType, label: '1–18', payout: '×1' },
                  { type: { kind: 'half', value: '19-36' } as BetType, label: '19–36', payout: '×1' },
                ]).map((item) => {
                  const active = !!hasBet(item.type);
                  return (
                    <button
                      key={item.label}
                      disabled={phase === 'spinning'}
                      onClick={() => placeBet(item.type)}
                      className={`py-3 rounded-xl text-sm font-semibold flex items-center justify-between px-3 transition-all disabled:opacity-40 ${
                        active ? 'glow-gold' : ''
                      }`}
                      style={{
                        background: active ? 'hsl(43 74% 52% / 0.2)' : 'hsl(240 24% 11%)',
                        border: active ? '1px solid hsl(43 74% 52% / 0.6)' : '1px solid hsl(43 74% 52% / 0.1)',
                      }}
                    >
                      <span>{item.label}</span>
                      <span className="text-xs text-gold">{item.payout}</span>
                    </button>
                  );
                })}
              </div>
              {/* Dozens */}
              <div className="grid grid-cols-3 gap-2">
                {([
                  { type: { kind: 'dozen', value: '1-12' } as BetType, label: '1–12' },
                  { type: { kind: 'dozen', value: '13-24' } as BetType, label: '13–24' },
                  { type: { kind: 'dozen', value: '25-36' } as BetType, label: '25–36' },
                ]).map(item => {
                  const active = !!hasBet(item.type);
                  return (
                    <button
                      key={item.label}
                      disabled={phase === 'spinning'}
                      onClick={() => placeBet(item.type)}
                      className="py-3 rounded-xl text-sm font-semibold flex flex-col items-center gap-0.5 transition-all disabled:opacity-40"
                      style={{
                        background: active ? 'hsl(43 74% 52% / 0.2)' : 'hsl(240 24% 11%)',
                        border: active ? '1px solid hsl(43 74% 52% / 0.6)' : '1px solid hsl(43 74% 52% / 0.1)',
                      }}
                    >
                      <span>{item.label}</span>
                      <span className="text-[10px] text-gold">Дюжина ×2</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'numbers' && (
            <div>
              {/* Zero */}
              <button
                disabled={phase === 'spinning'}
                onClick={() => placeBet({ kind: 'number', value: 0 })}
                className="w-full py-2 rounded-xl text-sm font-bold mb-2 transition-all disabled:opacity-40"
                style={{
                  background: hasBet({ kind: 'number', value: 0 })
                    ? 'hsl(158 64% 42% / 0.4)'
                    : 'hsl(158 64% 20%)',
                  border: hasBet({ kind: 'number', value: 0 })
                    ? '2px solid hsl(var(--emerald))'
                    : '1px solid hsl(158 64% 30%)',
                  color: '#fff',
                }}
              >
                0 — Зеро ×35
              </button>
              {/* Number grid 1-36 */}
              <div className="grid grid-cols-6 gap-1">
                {Array.from({ length: 36 }, (_, i) => i + 1).map(n => {
                  const active = !!hasBet({ kind: 'number', value: n });
                  return (
                    <button
                      key={n}
                      disabled={phase === 'spinning'}
                      onClick={() => placeBet({ kind: 'number', value: n })}
                      className="aspect-square rounded-lg text-xs font-bold flex items-center justify-center transition-all disabled:opacity-40"
                      style={{
                        background: active ? `${numColor(n)}cc` : numColor(n),
                        border: active ? '2px solid hsl(43 74% 52%)' : '1px solid rgba(255,255,255,0.1)',
                        color: '#fff',
                        boxShadow: active ? '0 0 8px hsl(43 74% 52% / 0.7)' : 'none',
                      }}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
              <div className="text-[10px] text-muted-foreground text-center mt-2">Выплата на число ×35</div>
            </div>
          )}
        </div>
      </div>

      {/* Bet amount */}
      <div className="animate-float-up glass rounded-2xl p-4 space-y-3" style={{ animationDelay: '120ms' }}>
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Фишка</span>
          <span className="font-display text-xl font-bold gold-text tabular-nums">{bet.toLocaleString('ru')} ₽</span>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {BET_STEPS.map(v => (
            <button
              key={v}
              disabled={phase === 'spinning'}
              onClick={() => { setBet(v); const ctx = getAudio(); if (ctx) playClick(ctx); }}
              className={`py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 ${
                bet === v ? 'gold-gradient text-background' : 'bg-background/50 text-foreground/70'
              }`}
            >
              {v >= 1000 ? `${v / 1000}к` : v}
            </button>
          ))}
        </div>
      </div>

      {/* Spin button */}
      <Button
        onClick={spin}
        disabled={phase === 'spinning' || bets.length === 0 || totalBet > balance}
        className="w-full gold-gradient text-background font-bold text-lg h-14 glow-gold disabled:opacity-50"
      >
        {phase === 'spinning' ? (
          <><Icon name="Loader" size={22} className="mr-2 animate-spin" /> Колесо крутится...</>
        ) : bets.length === 0 ? (
          'Сделай ставку'
        ) : totalBet > balance ? (
          'Недостаточно средств'
        ) : (
          <><span className="mr-2">🎡</span> Крутить — ставка {totalBet.toLocaleString('ru')} ₽</>
        )}
      </Button>
    </div>
  );
}