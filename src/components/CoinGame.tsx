import { useState, useRef, useEffect } from 'react';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';

const BET_STEPS = [50, 100, 250, 500, 1000];

// ─── Web Audio ────────────────────────────────────────────────────────────────

function getCtx(): AudioContext | null {
  try {
    type WA = typeof window & { webkitAudioContext?: typeof AudioContext };
    const Ctor = window.AudioContext || (window as WA).webkitAudioContext;
    return Ctor ? new Ctor() : null;
  } catch { return null; }
}

function resume(ctx: AudioContext) {
  if (ctx.state === 'suspended') ctx.resume();
}

function playCoinSpin(ctx: AudioContext): () => void {
  // Metal ringing tones cycling fast
  let running = true;
  let idx = 0;
  const freqs = [1046, 1318, 1568, 1318];

  const tick = () => {
    if (!running) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freqs[idx % freqs.length];
    idx++;
    g.gain.setValueAtTime(0.09, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.08);
    setTimeout(tick, 80);
  };
  tick();
  return () => { running = false; };
}

function playCoinLand(ctx: AudioContext, win: boolean) {
  // Metallic thud
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.15, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.5) * 0.7;
  }
  const s = ctx.createBufferSource();
  s.buffer = buf;
  const g = ctx.createGain(); g.gain.value = 0.4;
  s.connect(g); g.connect(ctx.destination); s.start();

  // Ring after landing
  const ring = ctx.createOscillator();
  const rg = ctx.createGain();
  ring.type = 'sine';
  ring.frequency.value = win ? 880 : 440;
  rg.gain.setValueAtTime(0.18, ctx.currentTime + 0.05);
  rg.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
  ring.connect(rg); rg.connect(ctx.destination);
  ring.start(ctx.currentTime + 0.05);
  ring.stop(ctx.currentTime + 0.6);
}

function playWin(ctx: AudioContext) {
  [523, 659, 784, 1047].forEach((freq, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = freq;
    const t = ctx.currentTime + i * 0.1;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.15, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + 0.32);
  });
}

function playLose(ctx: AudioContext) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(300, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.35);
  g.gain.setValueAtTime(0.12, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
  o.connect(g); g.connect(ctx.destination);
  o.start(); o.stop(ctx.currentTime + 0.38);
}

function playClick(ctx: AudioContext) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine'; o.frequency.value = 880;
  g.gain.setValueAtTime(0.07, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
  o.connect(g); g.connect(ctx.destination);
  o.start(); o.stop(ctx.currentTime + 0.08);
}

// ─── Coin 3D SVG ──────────────────────────────────────────────────────────────

function Coin({ side, flipping, phase }: { side: 'heads' | 'tails'; flipping: boolean; phase: 'idle' | 'spinning' | 'landing' }) {
  const isHeads = side === 'heads';

  return (
    <div className="relative flex items-center justify-center" style={{ width: 160, height: 160 }}>
      {/* Glow under coin */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full transition-all duration-300"
        style={{
          width: 100,
          height: 20,
          background: 'radial-gradient(ellipse, hsl(43 74% 52% / 0.5) 0%, transparent 70%)',
          filter: 'blur(6px)',
          opacity: flipping ? 0.3 : 0.8,
          transform: `translateX(-50%) scaleX(${flipping ? 0.6 : 1})`,
        }}
      />

      {/* Coin */}
      <div
        style={{
          width: 130,
          height: 130,
          position: 'relative',
          transformStyle: 'preserve-3d',
          animation: flipping ? 'coin-flip-3d 0.22s linear infinite' : undefined,
          transform: flipping ? undefined : 'rotateY(0deg)',
          transition: flipping ? undefined : 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Front face */}
        <div
          style={{
            position: 'absolute', inset: 0,
            backfaceVisibility: 'hidden',
            borderRadius: '50%',
            background: 'linear-gradient(145deg, hsl(45 95% 72%), hsl(43 74% 48%), hsl(38 60% 35%))',
            boxShadow: '0 0 0 6px hsl(43 60% 40%), inset 0 2px 8px hsl(45 90% 80% / 0.5), 0 8px 24px hsl(0 0% 0% / 0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 52, lineHeight: 1 }}>👑</div>
            <div style={{ fontSize: 11, fontFamily: 'Oswald, sans-serif', fontWeight: 700, color: 'hsl(38 60% 28%)', letterSpacing: '0.15em', marginTop: 2 }}>ОРЁЛ</div>
          </div>
        </div>

        {/* Back face */}
        <div
          style={{
            position: 'absolute', inset: 0,
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            borderRadius: '50%',
            background: 'linear-gradient(145deg, hsl(43 60% 42%), hsl(43 74% 52%), hsl(45 85% 65%))',
            boxShadow: '0 0 0 6px hsl(43 60% 40%), inset 0 2px 8px hsl(45 90% 80% / 0.5), 0 8px 24px hsl(0 0% 0% / 0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 52, lineHeight: 1 }}>⚡</div>
            <div style={{ fontSize: 11, fontFamily: 'Oswald, sans-serif', fontWeight: 700, color: 'hsl(38 60% 28%)', letterSpacing: '0.15em', marginTop: 2 }}>РЕШКА</div>
          </div>
        </div>
      </div>

      {/* Side gleam when idle */}
      {!flipping && (
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: 'linear-gradient(135deg, hsl(45 100% 90% / 0.35) 0%, transparent 50%)',
            borderRadius: '50%',
            width: 130, height: 130,
            margin: 'auto',
          }}
        />
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

type GamePhase = 'idle' | 'spinning' | 'landing' | 'result';
type Choice = 'heads' | 'tails';

export default function CoinGame({
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
  const [choice, setChoice] = useState<Choice>('heads');
  const [phase, setPhase] = useState<GamePhase>('idle');
  const [result, setResult] = useState<Choice>('heads');
  const [won, setWon] = useState<boolean | null>(null);
  const [muted, setMuted] = useState(false);
  const [streak, setStreak] = useState(0);

  const timers = useRef<number[]>([]);
  const stopSpin = useRef<(() => void) | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);

  const getAudio = () => {
    if (muted) return null;
    if (!audioCtx.current || audioCtx.current.state === 'closed') audioCtx.current = getCtx();
    if (audioCtx.current) resume(audioCtx.current);
    return audioCtx.current;
  };

  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    stopSpin.current?.();
    audioCtx.current?.close();
  }, []);

  const flip = () => {
    if (phase === 'spinning' || phase === 'landing') return;
    if (bet > balance) return;

    onBalanceChange(-bet);
    setWon(null);
    setPhase('spinning');

    const ctx = getAudio();
    if (ctx) stopSpin.current = playCoinSpin(ctx);

    const outcome: Choice = Math.random() < 0.5 ? 'heads' : 'tails';
    setResult(outcome);

    // Stop spinning after 1.8s → landing
    const t1 = window.setTimeout(() => {
      stopSpin.current?.(); stopSpin.current = null;
      setPhase('landing');
      const c = getAudio();
      if (c) playCoinLand(c, outcome === choice);
    }, 1800);

    // Show result after landing animation
    const t2 = window.setTimeout(() => {
      setPhase('result');
      const didWin = outcome === choice;
      onGameResult?.(bet, didWin ? bet * 2 : 0, didWin, { choice, outcome });
      setWon(didWin);
      if (didWin) {
        onBalanceChange(bet * 2);
        setStreak((s) => s + 1);
        const c = getAudio();
        if (c) playWin(c);
      } else {
        setStreak(0);
        const c = getAudio();
        if (c) playLose(c);
      }
    }, 2400);

    timers.current.push(t1, t2);
  };

  const handleChoice = (c: Choice) => {
    if (phase === 'spinning' || phase === 'landing') return;
    setChoice(c);
    setWon(null);
    setPhase('idle');
    const ctx = getAudio();
    if (ctx) playClick(ctx);
  };

  const handleBet = (v: number) => {
    if (phase === 'spinning' || phase === 'landing') return;
    setBet(v);
    const ctx = getAudio();
    if (ctx) playClick(ctx);
  };

  const isFlipping = phase === 'spinning' || phase === 'landing';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 animate-float-up">
        <button onClick={onBack} className="w-10 h-10 rounded-xl glass flex items-center justify-center text-gold">
          <Icon name="ArrowLeft" size={20} />
        </button>
        <div>
          <h2 className="font-display text-2xl font-bold tracking-wide leading-none">Монета</h2>
          <p className="text-sm text-muted-foreground">Орёл или решка — ×2</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setMuted((m) => !m)}
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

      {/* Streak */}
      {streak >= 2 && (
        <div className="animate-win-pop glass rounded-2xl p-3 flex items-center gap-2.5 border-gold/30">
          <Icon name="Flame" size={20} className="text-gold" />
          <span className="font-display font-semibold">Серия побед: {streak} 🔥</span>
        </div>
      )}

      {/* Coin stage */}
      <div className="animate-float-up rounded-3xl glass glow-soft p-6 flex flex-col items-center gap-5 relative overflow-hidden" style={{ animationDelay: '60ms' }}>
        <div className="absolute inset-0 shimmer-line opacity-20 pointer-events-none" />

        {/* Coin */}
        <Coin side={isFlipping ? result : result} flipping={isFlipping} phase={phase} />

        {/* Result message */}
        <div className="h-10 flex items-center justify-center w-full">
          {phase === 'result' && won === true && (
            <div className="animate-win-pop flex items-center gap-2 gold-gradient text-background px-5 py-2 rounded-full font-display font-bold glow-gold">
              <Icon name="PartyPopper" size={18} />
              ВЫИГРЫШ +{(bet * 2).toLocaleString('ru')} ₽
            </div>
          )}
          {phase === 'result' && won === false && (
            <div className="animate-float-up text-muted-foreground text-sm flex items-center gap-1.5">
              <Icon name="RefreshCw" size={14} />
              {result === 'heads' ? 'Выпал орёл' : 'Выпала решка'} — не угадал!
            </div>
          )}
          {phase === 'spinning' && (
            <div className="text-gold text-sm flex items-center gap-2 font-medium">
              <Icon name="Loader" size={16} className="animate-spin" /> Монета в воздухе...
            </div>
          )}
          {phase === 'landing' && (
            <div className="text-gold/80 text-sm font-medium animate-float-up">Приземляется...</div>
          )}
        </div>
      </div>

      {/* Choice buttons */}
      <div className="animate-float-up grid grid-cols-2 gap-3" style={{ animationDelay: '100ms' }}>
        {(['heads', 'tails'] as Choice[]).map((c) => {
          const active = choice === c;
          return (
            <button
              key={c}
              onClick={() => handleChoice(c)}
              disabled={isFlipping}
              className={`relative rounded-2xl p-5 flex flex-col items-center gap-2 transition-all hover-lift disabled:opacity-50 ${
                active ? 'glow-gold' : ''
              }`}
              style={{
                background: active
                  ? 'linear-gradient(135deg, hsl(45 90% 55% / 0.2), hsl(43 74% 40% / 0.15))'
                  : 'hsl(240 24% 13% / 0.85)',
                border: active ? '1px solid hsl(43 74% 52% / 0.6)' : '1px solid hsl(43 74% 52% / 0.12)',
                backdropFilter: 'blur(12px)',
              }}
            >
              <span style={{ fontSize: 44, lineHeight: 1 }}>{c === 'heads' ? '👑' : '⚡'}</span>
              <span className={`font-display font-bold text-lg ${active ? 'gold-text' : 'text-foreground/70'}`}>
                {c === 'heads' ? 'Орёл' : 'Решка'}
              </span>
              {active && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full gold-gradient flex items-center justify-center">
                  <Icon name="Check" size={12} className="text-background" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Bet */}
      <div className="animate-float-up glass rounded-2xl p-4 space-y-3" style={{ animationDelay: '140ms' }}>
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Ставка</span>
          <span className="font-display text-xl font-bold gold-text tabular-nums">{bet.toLocaleString('ru')} ₽</span>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {BET_STEPS.map((v) => (
            <button
              key={v}
              disabled={isFlipping}
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

      {/* Flip button */}
      <Button
        onClick={flip}
        disabled={isFlipping || bet > balance}
        className="w-full gold-gradient text-background font-bold text-lg h-14 glow-gold disabled:opacity-50"
      >
        {isFlipping ? (
          <><Icon name="Loader" size={22} className="mr-2 animate-spin" /> Подбрасываем...</>
        ) : bet > balance ? (
          'Недостаточно средств'
        ) : (
          <><span className="mr-2 text-xl">🪙</span> Подбросить за {bet.toLocaleString('ru')} ₽</>
        )}
      </Button>

      {/* Info */}
      <div className="animate-float-up glass rounded-2xl p-4" style={{ animationDelay: '180ms' }}>
        <div className="flex items-start gap-3">
          <Icon name="Info" size={18} className="text-gold mt-0.5 shrink-0" />
          <div className="text-sm text-muted-foreground space-y-1">
            <p>Угадай сторону монеты и получи <span className="text-gold font-semibold">×2 к ставке</span></p>
            <p>Вероятность выигрыша — <span className="text-foreground font-medium">50%</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}