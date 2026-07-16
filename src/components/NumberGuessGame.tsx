import { useState, useRef, useEffect } from 'react';
import Icon from '@/components/ui/icon';

// ── Web Audio ────────────────────────────────────────────────────────────────
function getCtx(): AudioContext | null {
  try {
    const C = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return C ? new C() : null;
  } catch { return null; }
}
function playTick(ctx: AudioContext, freq: number) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = 'square'; o.frequency.value = freq;
  g.gain.setValueAtTime(0.06, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
  o.start(); o.stop(ctx.currentTime + 0.05);
}
function playWin(ctx: AudioContext, big: boolean) {
  const notes = big ? [523, 659, 784, 1047, 1319] : [523, 659, 784];
  notes.forEach((f, i) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; o.frequency.value = f;
    const t = ctx.currentTime + i * 0.09;
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.start(t); o.stop(t + 0.22);
  });
}
function playLose(ctx: AudioContext) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(280, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.4);
  g.gain.setValueAtTime(0.16, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
  o.start(); o.stop(ctx.currentTime + 0.4);
}

// ── Множитель по точности ────────────────────────────────────────────────────
function getMultiplier(distance: number): number {
  if (distance === 0) return 50;
  if (distance <= 2) return 15;
  if (distance <= 5) return 6;
  if (distance <= 10) return 3;
  if (distance <= 20) return 1.5;
  if (distance <= 35) return 1.1;
  return 0;
}

const TIERS = [
  { label: 'Точно в цель', range: '0', mult: '×50' },
  { label: 'Очень близко', range: '±2', mult: '×15' },
  { label: 'Близко', range: '±5', mult: '×6' },
  { label: 'Неплохо', range: '±10', mult: '×3' },
  { label: 'Есть шанс', range: '±20', mult: '×1.5' },
  { label: 'Почти', range: '±35', mult: '×1.1' },
];

type Phase = 'idle' | 'revealing' | 'result';

export default function NumberGuessGame({
  balance, onBalanceChange, onBack, onGameResult,
}: {
  balance: number;
  onBalanceChange: (delta: number) => void;
  onBack: () => void;
  onGameResult?: (bet: number, result: number, isWin: boolean, details: object) => void;
}) {
  const [bet, setBet] = useState(100);
  const [guess, setGuess] = useState(50);
  const [phase, setPhase] = useState<Phase>('idle');
  const [target, setTarget] = useState<number | null>(null);
  const [displayNum, setDisplayNum] = useState(1);
  const [distance, setDistance] = useState(0);
  const [multiplier, setMultiplier] = useState(0);
  const [payout, setPayout] = useState(0);
  const [muted, setMuted] = useState(false);

  const betRef = useRef(100);
  const guessRef = useRef(50);
  const ctxRef = useRef<AudioContext | null>(null);
  const timers = useRef<number[]>([]);

  function audio() {
    if (muted) return null;
    if (!ctxRef.current) ctxRef.current = getCtx();
    return ctxRef.current;
  }

  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    ctxRef.current?.close();
  }, []);

  const parsedBet = Math.max(1, Math.min(bet, balance));
  const PRESETS = [50, 100, 250, 500, 1000].filter(v => v <= balance);

  function play() {
    if (phase === 'revealing') return;
    const b = Math.max(1, Math.min(bet, balance));
    betRef.current = b;
    guessRef.current = guess;
    onBalanceChange(-b);
    setPayout(0);
    setPhase('revealing');

    const finalTarget = 1 + Math.floor(Math.random() * 100);
    setTarget(null);

    // Анимация прокрутки чисел
    let step = 0;
    const totalSteps = 16;
    const tick = () => {
      step++;
      const rnd = 1 + Math.floor(Math.random() * 100);
      setDisplayNum(step >= totalSteps ? finalTarget : rnd);
      const ctx = audio();
      if (ctx) playTick(ctx, 300 + step * 25);

      if (step < totalSteps) {
        const delay = 40 + step * 8;
        const t = window.setTimeout(tick, delay);
        timers.current.push(t);
      } else {
        const t = window.setTimeout(() => finish(finalTarget), 400);
        timers.current.push(t);
      }
    };
    tick();
  }

  function finish(finalTarget: number) {
    const dist = Math.abs(finalTarget - guessRef.current);
    const mult = getMultiplier(dist);
    const win = mult > 0 ? Math.round(betRef.current * mult * 100) / 100 : 0;

    setTarget(finalTarget);
    setDistance(dist);
    setMultiplier(mult);
    setPayout(win);
    setPhase('result');

    const ctx = audio();
    if (win > 0) {
      onBalanceChange(win);
      if (ctx) playWin(ctx, mult >= 6);
    } else if (ctx) {
      playLose(ctx);
    }
    onGameResult?.(betRef.current, win, win > 0, { guess: guessRef.current, target: finalTarget, distance: dist, multiplier: mult });
  }

  function reset() {
    setPhase('idle');
    setTarget(null);
    setDistance(0);
    setMultiplier(0);
    setPayout(0);
  }

  return (
    <div className="space-y-4 animate-float-up">

      {/* Шапка */}
      <div className="flex items-center gap-3">
        <button onClick={onBack}
          className="w-10 h-10 rounded-xl glass flex items-center justify-center text-gold shrink-0">
          <Icon name="ArrowLeft" size={20} />
        </button>
        <div className="flex-1">
          <h2 className="font-display text-xl font-bold">Числа 🎯</h2>
          <p className="text-xs text-muted-foreground">Угадай число от 1 до 100</p>
        </div>
        <button onClick={() => setMuted(m => !m)}
          className="w-10 h-10 rounded-xl glass flex items-center justify-center text-muted-foreground hover:text-gold transition-colors shrink-0">
          <Icon name={muted ? 'VolumeX' : 'Volume2'} size={18} />
        </button>
      </div>

      {/* Табло с числом */}
      <div className="glass rounded-2xl p-6 flex flex-col items-center justify-center gap-3">
        <div className={`font-display font-bold tabular-nums transition-all ${phase === 'revealing' ? 'text-5xl text-gold animate-pulse' : 'text-6xl gold-text'}`}>
          {phase === 'idle' ? '?' : phase === 'revealing' ? displayNum : target}
        </div>

        {phase === 'result' && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Твоё число: <b className="text-foreground">{guessRef.current}</b></span>
            <span>•</span>
            <span>Отклонение: <b className="text-foreground">{distance}</b></span>
          </div>
        )}
      </div>

      {/* Результат */}
      {phase === 'result' && (
        <div className={`animate-win-pop glass rounded-2xl p-5 text-center border ${
          payout > 0 ? 'border-gold/30 bg-gold/5' : 'border-red-500/30 bg-red-500/5'
        }`}>
          {payout > 0 ? (
            <>
              <p className="font-display text-2xl font-bold gold-text">Выигрыш! 🎉</p>
              <p className="text-3xl font-display font-bold text-emerald-400 mt-1">
                +{payout.toLocaleString('ru')} ₽
              </p>
              <p className="text-xs text-muted-foreground mt-1">Множитель ×{multiplier}</p>
            </>
          ) : (
            <>
              <p className="font-display text-2xl font-bold text-red-400">Мимо 😢</p>
              <p className="text-sm text-muted-foreground mt-1">Слишком большое отклонение</p>
            </>
          )}
        </div>
      )}

      {/* Выбор числа — только в idle */}
      {phase === 'idle' && (
        <div className="glass rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Твоё число</label>
            <span className="font-display font-bold text-2xl gold-text tabular-nums">{guess}</span>
          </div>
          <input
            type="range" min={1} max={100} value={guess}
            onChange={e => setGuess(Number(e.target.value))}
            className="w-full accent-[hsl(var(--gold))]"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground px-0.5">
            <span>1</span><span>25</span><span>50</span><span>75</span><span>100</span>
          </div>
          <input
            type="number" min={1} max={100} value={guess}
            onChange={e => setGuess(Math.max(1, Math.min(100, Number(e.target.value))))}
            className="w-full bg-background/50 border border-gold/20 rounded-xl px-3 py-2 text-center font-display font-bold gold-text focus:outline-none focus:border-gold/50"
          />
        </div>
      )}

      {/* Таблица множителей */}
      {phase === 'idle' && (
        <div className="glass rounded-2xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Множители за точность</p>
          <div className="grid grid-cols-2 gap-2">
            {TIERS.map(t => (
              <div key={t.label} className="flex items-center justify-between bg-background/40 rounded-xl px-3 py-2">
                <div>
                  <div className="text-xs font-semibold">{t.label}</div>
                  <div className="text-[10px] text-muted-foreground">{t.range}</div>
                </div>
                <div className="font-display font-bold text-gold text-sm">{t.mult}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ставка — только в idle */}
      {phase === 'idle' && (
        <div className="glass rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Ставка</label>
            <span className="text-xs text-muted-foreground">Баланс: {balance.toLocaleString('ru')} ₽</span>
          </div>
          <div className="flex gap-2">
            <input type="number" min={1} max={balance} value={bet}
              onChange={e => setBet(Math.max(1, Math.min(Number(e.target.value), balance)))}
              className="flex-1 bg-background/50 border border-gold/20 rounded-xl px-3 py-2.5 text-center font-display font-bold gold-text text-lg focus:outline-none focus:border-gold/50"
            />
            <button onClick={() => setBet(b => Math.max(1, Math.floor(b / 2)))}
              className="glass rounded-xl px-3 text-sm font-bold text-muted-foreground hover:text-gold transition-colors">½</button>
            <button onClick={() => setBet(b => Math.min(b * 2, balance))}
              className="glass rounded-xl px-3 text-sm font-bold text-muted-foreground hover:text-gold transition-colors">×2</button>
            <button onClick={() => setBet(balance)}
              className="glass rounded-xl px-3 text-sm font-bold text-muted-foreground hover:text-gold transition-colors">Макс</button>
          </div>
          {PRESETS.length > 0 && (
            <div className="grid grid-cols-5 gap-2">
              {PRESETS.map(v => (
                <button key={v} onClick={() => setBet(v)}
                  className={`py-2 rounded-xl text-sm font-semibold transition-all
                    ${bet === v ? 'gold-gradient text-background' : 'bg-background/50 text-foreground/70 hover:text-gold'}`}>
                  {v >= 1000 ? `${v/1000}к` : v}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {phase === 'idle' && (
        <button onClick={play} disabled={parsedBet > balance}
          className="w-full h-14 rounded-2xl font-display font-bold text-xl gold-gradient text-background glow-gold disabled:opacity-50 flex items-center justify-center gap-3">
          <Icon name="Target" size={22} /> Угадать число
        </button>
      )}

      {phase === 'revealing' && (
        <div className="flex justify-center py-2">
          <Icon name="Loader" size={32} className="animate-spin text-gold" />
        </div>
      )}

      {phase === 'result' && (
        <button onClick={reset}
          className="w-full h-14 rounded-2xl font-display font-bold text-xl gold-gradient text-background glow-gold flex items-center justify-center gap-3">
          <Icon name="RotateCcw" size={22} /> Новая игра
        </button>
      )}

      {phase === 'idle' && (
        <div className="glass rounded-xl p-3 flex items-start gap-2 text-xs text-muted-foreground">
          <Icon name="Info" size={14} className="text-gold shrink-0 mt-0.5" />
          Чем ближе твоё число к загаданному — тем больше множитель. Угадаешь точно — получишь ×50!
        </div>
      )}
    </div>
  );
}
