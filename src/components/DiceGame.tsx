import { useState, useRef, useEffect } from 'react';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';

const BET_STEPS = [50, 100, 250, 500, 1000];

// ─── Dot layouts for faces 1-6 ────────────────────────────────────────────────
const DOT_POSITIONS: Record<number, { top: string; left: string }[]> = {
  1: [{ top: '50%', left: '50%' }],
  2: [{ top: '25%', left: '25%' }, { top: '75%', left: '75%' }],
  3: [{ top: '25%', left: '25%' }, { top: '50%', left: '50%' }, { top: '75%', left: '75%' }],
  4: [
    { top: '25%', left: '25%' }, { top: '25%', left: '75%' },
    { top: '75%', left: '25%' }, { top: '75%', left: '75%' },
  ],
  5: [
    { top: '25%', left: '25%' }, { top: '25%', left: '75%' },
    { top: '50%', left: '50%' },
    { top: '75%', left: '25%' }, { top: '75%', left: '75%' },
  ],
  6: [
    { top: '22%', left: '25%' }, { top: '22%', left: '75%' },
    { top: '50%', left: '25%' }, { top: '50%', left: '75%' },
    { top: '78%', left: '25%' }, { top: '78%', left: '75%' },
  ],
};

// ─── Web Audio ────────────────────────────────────────────────────────────────

function getCtx(): AudioContext | null {
  try {
    type WA = typeof window & { webkitAudioContext?: typeof AudioContext };
    const Ctor = window.AudioContext || (window as WA).webkitAudioContext;
    return Ctor ? new Ctor() : null;
  } catch { return null; }
}

function resume(ctx: AudioContext) { if (ctx.state === 'suspended') ctx.resume(); }

function playRattle(ctx: AudioContext): () => void {
  let running = true;
  const tick = () => {
    if (!running) return;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.04, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.5) * 0.5;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    const g = ctx.createGain(); g.gain.value = 0.22;
    s.connect(g); g.connect(ctx.destination); s.start();
    setTimeout(tick, 90 + Math.random() * 60);
  };
  tick();
  return () => { running = false; };
}

function playDiceHit(ctx: AudioContext) {
  // Wooden thud
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3) * 0.8;
  const s = ctx.createBufferSource();
  s.buffer = buf;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 1200;
  const g = ctx.createGain(); g.gain.value = 0.5;
  s.connect(lp); lp.connect(g); g.connect(ctx.destination); s.start();

  // Second lighter bounce
  setTimeout(() => {
    const buf2 = ctx.createBuffer(1, ctx.sampleRate * 0.07, ctx.sampleRate);
    const d2 = buf2.getChannelData(0);
    for (let i = 0; i < d2.length; i++) d2[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d2.length, 3) * 0.5;
    const s2 = ctx.createBufferSource();
    s2.buffer = buf2;
    const g2 = ctx.createGain(); g2.gain.value = 0.3;
    s2.connect(g2); g2.connect(ctx.destination); s2.start();
  }, 180);
}

function playWin(ctx: AudioContext, big: boolean) {
  const notes = big ? [523, 659, 784, 1047, 1319] : [440, 554, 659, 784];
  notes.forEach((freq, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = big ? 'square' : 'triangle';
    o.frequency.value = freq;
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

// ─── Payout table ─────────────────────────────────────────────────────────────
// Player picks target sum (2-12). Each sum has a payout multiplier.
const SUM_PAYOUTS: Record<number, number> = {
  2: 35, 3: 17, 4: 11, 5: 7, 6: 5, 7: 4, 8: 5, 9: 7, 10: 11, 11: 17, 12: 35,
};

// ─── 3D Die component ─────────────────────────────────────────────────────────

function Die({ value, rolling, idx }: { value: number; rolling: boolean; idx: number }) {
  const size = 72;
  const half = size / 2;

  const faceStyle = (transform: string, bg = 'hsl(240 24% 11%)'): React.CSSProperties => ({
    position: 'absolute',
    width: size, height: size,
    backfaceVisibility: 'hidden',
    background: bg,
    border: '2px solid hsl(43 74% 52% / 0.35)',
    borderRadius: 14,
    transform,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  });

  const faces = [
    { transform: `rotateY(0deg) translateZ(${half}px)`,   face: value },
    { transform: `rotateY(180deg) translateZ(${half}px)`, face: 7 - value > 6 ? 6 : 7 - value },
    { transform: `rotateY(90deg) translateZ(${half}px)`,  face: value === 1 ? 2 : value === 2 ? 1 : value === 5 ? 6 : value === 6 ? 5 : value === 3 ? 4 : 3 },
    { transform: `rotateY(-90deg) translateZ(${half}px)`, face: value === 1 ? 5 : value === 5 ? 1 : value === 2 ? 6 : value === 6 ? 2 : value === 3 ? 3 : 4 },
    { transform: `rotateX(90deg) translateZ(${half}px)`,  face: value === 1 ? 3 : value === 3 ? 1 : value === 4 ? 6 : value === 6 ? 4 : value === 2 ? 5 : value === 5 ? 2 : 3 },
    { transform: `rotateX(-90deg) translateZ(${half}px)`, face: value === 1 ? 4 : value === 4 ? 1 : value === 3 ? 6 : value === 6 ? 3 : value === 2 ? 2 : 5 },
  ];

  return (
    <div
      style={{
        width: size, height: size,
        position: 'relative',
        transformStyle: 'preserve-3d',
        animation: rolling
          ? `dice-roll-${idx} 0.3s linear infinite`
          : undefined,
        transition: rolling ? undefined : 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {faces.map((f, i) => {
        const dots = DOT_POSITIONS[Math.max(1, Math.min(6, f.face))] || DOT_POSITIONS[1];
        return (
          <div key={i} style={faceStyle(f.transform)}>
            <div style={{ position: 'relative', width: size - 16, height: size - 16 }}>
              {dots.map((pos, di) => (
                <div
                  key={di}
                  style={{
                    position: 'absolute',
                    width: 10, height: 10,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, hsl(45 95% 75%), hsl(43 74% 52%))',
                    boxShadow: '0 0 4px hsl(43 74% 52% / 0.6)',
                    top: pos.top, left: pos.left,
                    transform: 'translate(-50%, -50%)',
                  }}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Phase = 'idle' | 'rolling' | 'result';

export default function DiceGame({
  balance,
  onBalanceChange,
  onBack,
}: {
  balance: number;
  onBalanceChange: (delta: number) => void;
  onBack: () => void;
}) {
  const [bet, setBet] = useState(100);
  const [target, setTarget] = useState(7);
  const [phase, setPhase] = useState<Phase>('idle');
  const [dice, setDice] = useState<[number, number]>([1, 1]);
  const [won, setWon] = useState<boolean | null>(null);
  const [winAmount, setWinAmount] = useState(0);
  const [muted, setMuted] = useState(false);

  const timers = useRef<number[]>([]);
  const stopRattle = useRef<(() => void) | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const shuffleRef = useRef<number>(0);

  const getAudio = () => {
    if (muted) return null;
    if (!audioCtx.current || audioCtx.current.state === 'closed') audioCtx.current = getCtx();
    if (audioCtx.current) resume(audioCtx.current);
    return audioCtx.current;
  };

  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    stopRattle.current?.();
    audioCtx.current?.close();
    cancelAnimationFrame(shuffleRef.current);
  }, []);

  const roll = () => {
    if (phase === 'rolling') return;
    if (bet > balance) return;
    onBalanceChange(-bet);
    setWon(null);
    setPhase('rolling');

    const ctx = getAudio();
    if (ctx) stopRattle.current = playRattle(ctx);

    // shuffle dice visually during roll
    const startTime = Date.now();
    const shuffle = () => {
      if (Date.now() - startTime < 1600) {
        setDice([Math.ceil(Math.random() * 6) as 1, Math.ceil(Math.random() * 6) as 1]);
        shuffleRef.current = requestAnimationFrame(shuffle);
      }
    };
    shuffleRef.current = requestAnimationFrame(shuffle);

    const t1 = window.setTimeout(() => {
      stopRattle.current?.(); stopRattle.current = null;
      cancelAnimationFrame(shuffleRef.current);

      const d1 = Math.ceil(Math.random() * 6) as 1;
      const d2 = Math.ceil(Math.random() * 6) as 1;
      setDice([d1, d2]);

      const c = getAudio();
      if (c) playDiceHit(c);

      const sum = d1 + d2;
      const didWin = sum === target;
      const mult = SUM_PAYOUTS[target] ?? 4;
      const prize = didWin ? bet * mult : 0;

      if (didWin) {
        onBalanceChange(prize);
        setWinAmount(prize);
        if (c) playWin(c, mult >= 10);
      } else {
        if (c) playLose(c);
      }
      setWon(didWin);
      setPhase('result');
    }, 1700);

    timers.current.push(t1);
  };

  const handleBet = (v: number) => {
    if (phase === 'rolling') return;
    setBet(v);
    const ctx = getAudio(); if (ctx) playClick(ctx);
  };

  const handleTarget = (v: number) => {
    if (phase === 'rolling') return;
    setTarget(v);
    setWon(null);
    const ctx = getAudio(); if (ctx) playClick(ctx);
  };

  const sum = dice[0] + dice[1];
  const payout = SUM_PAYOUTS[target] ?? 4;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 animate-float-up">
        <button onClick={onBack} className="w-10 h-10 rounded-xl glass flex items-center justify-center text-gold">
          <Icon name="ArrowLeft" size={20} />
        </button>
        <div>
          <h2 className="font-display text-2xl font-bold tracking-wide leading-none">Кости</h2>
          <p className="text-sm text-muted-foreground">Угадай сумму кубиков</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setMuted(m => !m)}
            className={`w-9 h-9 rounded-xl glass flex items-center justify-center transition-colors ${muted ? 'text-muted-foreground' : 'text-gold'}`}
          >
            <Icon name={muted ? 'VolumeX' : 'Volume2'} size={18} />
          </button>
          <div className="glass rounded-full px-3 py-1.5 flex items-center gap-1.5">
            <span className="font-display font-semibold text-gold tabular-nums">{balance.toLocaleString('ru')}</span>
            <span className="text-xs text-muted-foreground">₽</span>
          </div>
        </div>
      </div>

      {/* Dice stage */}
      <div
        className="animate-float-up rounded-3xl glass glow-soft p-6 flex flex-col items-center gap-6 relative overflow-hidden"
        style={{ animationDelay: '60ms', perspective: 600 }}
      >
        <div className="absolute inset-0 shimmer-line opacity-20 pointer-events-none" />

        {/* Shadow on table */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-40 h-5 rounded-full"
          style={{ background: 'radial-gradient(ellipse, hsl(0 0% 0% / 0.5), transparent 70%)', filter: 'blur(4px)' }} />

        {/* Dice */}
        <div className="flex gap-8 items-center relative z-10" style={{ perspective: 600 }}>
          <Die value={dice[0]} rolling={phase === 'rolling'} idx={0} />
          <div className="font-display text-3xl font-bold text-gold/60">+</div>
          <Die value={dice[1]} rolling={phase === 'rolling'} idx={1} />
        </div>

        {/* Sum display */}
        <div className="flex items-center gap-3">
          <div className="glass rounded-2xl px-6 py-3 text-center">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Сумма</div>
            <div
              className="font-display text-4xl font-bold tabular-nums transition-all"
              style={{ color: phase === 'result' ? (won ? 'hsl(var(--gold))' : 'hsl(var(--crimson))') : 'hsl(var(--foreground))' }}
            >
              {sum}
            </div>
          </div>
          <Icon name="ArrowRight" size={20} className="text-muted-foreground" />
          <div className="glass rounded-2xl px-6 py-3 text-center" style={{ borderColor: 'hsl(43 74% 52% / 0.4)' }}>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Цель</div>
            <div className="font-display text-4xl font-bold gold-text tabular-nums">{target}</div>
          </div>
        </div>

        {/* Result banner */}
        <div className="h-10 flex items-center justify-center w-full">
          {phase === 'result' && won && (
            <div className="animate-win-pop flex items-center gap-2 gold-gradient text-background px-5 py-2 rounded-full font-display font-bold glow-gold">
              <Icon name="PartyPopper" size={18} />
              ВЫИГРЫШ +{winAmount.toLocaleString('ru')} ₽
            </div>
          )}
          {phase === 'result' && won === false && (
            <div className="animate-float-up text-muted-foreground text-sm flex items-center gap-1.5">
              <Icon name="RefreshCw" size={14} /> Выпало {sum} — не угадал!
            </div>
          )}
          {phase === 'rolling' && (
            <div className="text-gold text-sm flex items-center gap-2 font-medium">
              <Icon name="Loader" size={16} className="animate-spin" /> Кости летят...
            </div>
          )}
        </div>
      </div>

      {/* Target picker */}
      <div className="animate-float-up glass rounded-2xl p-4 space-y-3" style={{ animationDelay: '100ms' }}>
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Выбери сумму</span>
          <span className="text-xs text-gold flex items-center gap-1">
            Выплата <span className="font-display font-bold text-sm">×{payout}</span>
          </span>
        </div>
        <div className="grid grid-cols-11 gap-1">
          {Array.from({ length: 11 }, (_, i) => i + 2).map((v) => {
            const mult = SUM_PAYOUTS[v];
            const active = target === v;
            return (
              <button
                key={v}
                disabled={phase === 'rolling'}
                onClick={() => handleTarget(v)}
                className={`flex flex-col items-center py-1.5 rounded-xl text-center transition-all disabled:opacity-40 ${
                  active ? 'gold-gradient text-background' : 'bg-background/50 text-foreground/70 hover:bg-background/80'
                }`}
              >
                <span className={`font-display font-bold text-sm ${active ? '' : ''}`}>{v}</span>
                <span className={`text-[9px] leading-tight ${active ? 'opacity-80' : 'text-muted-foreground'}`}>×{mult}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bet */}
      <div className="animate-float-up glass rounded-2xl p-4 space-y-3" style={{ animationDelay: '140ms' }}>
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Ставка</span>
          <div className="flex items-center gap-2">
            <span className="font-display text-xl font-bold gold-text tabular-nums">{bet.toLocaleString('ru')} ₽</span>
            <span className="text-xs text-muted-foreground">→</span>
            <span className="font-display font-semibold text-emerald-400 tabular-nums text-sm">
              {(bet * payout).toLocaleString('ru')} ₽
            </span>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {BET_STEPS.map((v) => (
            <button
              key={v}
              disabled={phase === 'rolling'}
              onClick={() => handleBet(v)}
              className={`py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 ${
                bet === v ? 'gold-gradient text-background' : 'bg-background/50 text-foreground/70'
              }`}
            >
              {v >= 1000 ? `${v / 1000}к` : v}
            </button>
          ))}
        </div>
      </div>

      {/* Roll button */}
      <Button
        onClick={roll}
        disabled={phase === 'rolling' || bet > balance}
        className="w-full gold-gradient text-background font-bold text-lg h-14 glow-gold disabled:opacity-50"
      >
        {phase === 'rolling' ? (
          <><Icon name="Loader" size={22} className="mr-2 animate-spin" /> Бросаем...</>
        ) : bet > balance ? (
          'Недостаточно средств'
        ) : (
          <><span className="mr-2 text-xl">🎲</span> Бросить за {bet.toLocaleString('ru')} ₽</>
        )}
      </Button>

      {/* Probability hint */}
      <div className="animate-float-up glass rounded-2xl p-4" style={{ animationDelay: '180ms' }}>
        <h3 className="font-display font-semibold mb-3 flex items-center gap-2 text-sm">
          <Icon name="Info" size={16} className="text-gold" /> Вероятности и выплаты
        </h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
          {[
            { sum: '2 или 12', prob: '2.8%', mult: '×35' },
            { sum: '3 или 11', prob: '5.6%', mult: '×17' },
            { sum: '4 или 10', prob: '8.3%', mult: '×11' },
            { sum: '5 или 9',  prob: '11.1%', mult: '×7' },
            { sum: '6 или 8',  prob: '13.9%', mult: '×5' },
            { sum: '7',        prob: '16.7%', mult: '×4' },
          ].map((r) => (
            <div key={r.sum} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{r.sum}</span>
              <span className="flex gap-2">
                <span className="text-foreground/50">{r.prob}</span>
                <span className="font-display font-semibold text-gold">{r.mult}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
