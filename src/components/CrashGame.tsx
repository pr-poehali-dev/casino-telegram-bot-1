import { useState, useRef, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';

// ── Audio ──────────────────────────────────────────────────────────────────
function getAudio() {
  try {
    return new (window.AudioContext ||
      (window as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  } catch { return null; }
}
function playTick(ctx: AudioContext, mult: number) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = 'sine';
  o.frequency.setValueAtTime(Math.min(200 + mult * 40, 900), ctx.currentTime);
  g.gain.setValueAtTime(0.06, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
  o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.06);
}
function playCrash(ctx: AudioContext) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(400, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.6);
  g.gain.setValueAtTime(0.35, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
  o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.6);
}
function playCashout(ctx: AudioContext) {
  [523, 659, 784, 1047].forEach((f, i) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; o.frequency.value = f;
    const t = ctx.currentTime + i * 0.08;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.15, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.start(t); o.stop(t + 0.2);
  });
}

// ── Генерация точки краша ───────────────────────────────────────────────────
// Дом берёт ~5%. Распределение: P(crash >= x) = 0.95/x
function generateCrashPoint(): number {
  const r = Math.random();
  if (r < 0.05) return 1.00; // 5% шанс краша сразу
  const raw = 0.95 / (1 - r);
  return Math.max(1.00, parseFloat(raw.toFixed(2)));
}

// ── История крашей ─────────────────────────────────────────────────────────
const MAX_HISTORY = 10;

type Phase = 'idle' | 'countdown' | 'flying' | 'crashed' | 'cashedout';

const BET_PRESETS = [10, 25, 50, 100, 250, 500];

export default function CrashGame({
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
  const [bet, setBetState] = useState(50);
  const [autoCashout, setAutoCashout] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [multiplier, setMultiplier] = useState(1.00);
  const [crashPoint, setCrashPoint] = useState(1.00);
  const [countdown, setCountdown] = useState(3);
  const [history, setHistory] = useState<number[]>([]);
  const [muted, setMuted] = useState(false);
  const [cashedOutAt, setCashedOutAt] = useState(0);

  const phaseRef = useRef<Phase>('idle');
  const multRef = useRef(1.00);
  const betRef = useRef(bet);
  const crashRef = useRef(1.00);
  const autoCashoutRef = useRef('');
  const frameRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastTickRef = useRef(0);

  const getCtx = useCallback(() => {
    if (muted) return null;
    if (!audioCtxRef.current) audioCtxRef.current = getAudio();
    return audioCtxRef.current;
  }, [muted]);

  const setBet = (v: number) => {
    if (phase !== 'idle') return;
    betRef.current = Math.min(Math.max(1, v), balance);
    setBetState(betRef.current);
  };

  // Множитель по времени: экспоненциальный рост
  const calcMult = (elapsed: number) =>
    parseFloat(Math.pow(Math.E, elapsed * 0.00006).toFixed(2));

  // ── Игровой цикл ────────────────────────────────────────────────────────
  const gameLoop = useCallback(() => {
    const elapsed = performance.now() - startTimeRef.current;
    const m = calcMult(elapsed);
    multRef.current = m;
    setMultiplier(m);

    // Звук-тик
    const ctx = getCtx();
    if (ctx && elapsed - lastTickRef.current > Math.max(50, 300 - m * 20)) {
      lastTickRef.current = elapsed;
      playTick(ctx, m);
    }

    // Авто-кэшаут
    const auto = parseFloat(autoCashoutRef.current);
    if (!isNaN(auto) && auto >= 1.01 && m >= auto) {
      doCashout(m);
      return;
    }

    // Краш
    if (m >= crashRef.current) {
      if (ctx) playCrash(ctx);
      phaseRef.current = 'crashed';
      setPhase('crashed');
      setMultiplier(crashRef.current);
      setHistory(h => [crashRef.current, ...h].slice(0, MAX_HISTORY));
      onGameResult?.(betRef.current, 0, false, { crashAt: crashRef.current, mult: m });
      return;
    }

    frameRef.current = requestAnimationFrame(gameLoop);
  }, [getCtx, onGameResult]);

  const doCashout = useCallback((m: number) => {
    if (phaseRef.current !== 'flying') return;
    phaseRef.current = 'cashedout';
    setPhase('cashedout');
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    const payout = parseFloat((betRef.current * m).toFixed(2));
    const ctx = getCtx();
    if (ctx) playCashout(ctx);
    onBalanceChange(payout);
    setCashedOutAt(m);
    onGameResult?.(betRef.current, payout, true, { cashedAt: m, crashAt: crashRef.current });
  }, [getCtx, onBalanceChange, onGameResult]);

  const cashout = useCallback(() => {
    doCashout(multRef.current);
  }, [doCashout]);

  // ── Старт игры ─────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    if (phase !== 'idle' && phase !== 'crashed' && phase !== 'cashedout') return;
    if (betRef.current > balance || betRef.current <= 0) return;

    const cp = generateCrashPoint();
    crashRef.current = cp;
    setCrashPoint(cp);
    autoCashoutRef.current = autoCashout;

    onBalanceChange(-betRef.current);
    setMultiplier(1.00);
    multRef.current = 1.00;
    setCashedOutAt(0);

    // Обратный отсчёт 3с
    phaseRef.current = 'countdown';
    setPhase('countdown');
    setCountdown(3);

    let c = 3;
    const cd = setInterval(() => {
      c--;
      setCountdown(c);
      if (c <= 0) {
        clearInterval(cd);
        phaseRef.current = 'flying';
        setPhase('flying');
        startTimeRef.current = performance.now();
        lastTickRef.current = 0;
        frameRef.current = requestAnimationFrame(gameLoop);
      }
    }, 1000);
  }, [phase, balance, autoCashout, onBalanceChange, gameLoop]);

  // Cleanup
  useEffect(() => () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
  }, []);

  const payout = parseFloat((bet * multiplier).toFixed(2));
  const profit = parseFloat((payout - bet).toFixed(2));
  const isActive = phase === 'flying';
  const isCrashed = phase === 'crashed';
  const isCashedOut = phase === 'cashedout';
  const isIdle = phase === 'idle';

  // Цвет множителя
  const multColor = isCrashed ? 'text-red-400'
    : isCashedOut ? 'text-emerald-400'
    : multiplier < 1.5 ? 'text-foreground'
    : multiplier < 2 ? 'text-amber-300'
    : multiplier < 5 ? 'text-emerald-400'
    : 'text-purple-400';

  return (
    <div className="space-y-4 animate-float-up">
      {/* Шапка */}
      <div className="flex items-center gap-3">
        <button onClick={onBack}
          className="w-10 h-10 rounded-xl glass flex items-center justify-center text-gold shrink-0">
          <Icon name="ArrowLeft" size={20} />
        </button>
        <div className="flex-1">
          <h2 className="font-display text-xl font-bold">Краш 🚀</h2>
          <p className="text-xs text-muted-foreground">Забери выигрыш до краша</p>
        </div>
        <button onClick={() => setMuted(m => !m)}
          className="w-9 h-9 glass rounded-xl flex items-center justify-center text-muted-foreground">
          <Icon name={muted ? 'VolumeX' : 'Volume2'} size={16} />
        </button>
      </div>

      {/* История */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {history.length === 0
          ? <span className="text-xs text-muted-foreground">История крашей появится здесь</span>
          : history.map((h, i) => (
            <span key={i} className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-bold
              ${h < 1.5 ? 'bg-red-500/20 text-red-400'
                : h < 3 ? 'bg-amber-500/20 text-amber-400'
                : 'bg-emerald-500/20 text-emerald-400'}`}>
              ×{h.toFixed(2)}
            </span>
          ))
        }
      </div>

      {/* Экран краша */}
      <div className="glass rounded-3xl overflow-hidden relative" style={{ minHeight: 260 }}>
        {/* Фон-график (имитация) */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {isActive && (
            <svg className="absolute bottom-0 left-0 w-full h-full opacity-20" viewBox="0 0 300 200" preserveAspectRatio="none">
              <path
                d={`M0,200 Q${Math.min(multiplier * 30, 280)},${200 - Math.min(multiplier * 60, 180)} 300,${Math.max(20, 200 - multiplier * 80)}`}
                stroke="hsl(43 74% 52%)" strokeWidth="2" fill="none"
              />
            </svg>
          )}
        </div>

        <div className="relative flex flex-col items-center justify-center h-full py-10 gap-4">
          {/* Множитель */}
          <div className={`font-display font-bold transition-all
            ${isCrashed || isCashedOut ? 'text-5xl' : isActive ? 'text-6xl' : 'text-4xl'}
            ${multColor}`}
            style={{ textShadow: isActive && multiplier >= 5 ? '0 0 30px currentColor' : undefined }}>
            {phase === 'countdown'
              ? countdown
              : `×${multiplier.toFixed(2)}`}
          </div>

          {/* Статус */}
          <div className="text-sm text-muted-foreground font-semibold">
            {isIdle && 'Сделай ставку и запускай'}
            {phase === 'countdown' && 'Запуск через...'}
            {isActive && <span className="text-gold animate-pulse">🚀 Летим!</span>}
            {isCrashed && <span className="text-red-400">💥 Краш на ×{crashPoint.toFixed(2)}</span>}
            {isCashedOut && <span className="text-emerald-400">✅ Забрал на ×{cashedOutAt.toFixed(2)}</span>}
          </div>

          {/* Потенциальный выигрыш во время полёта */}
          {isActive && (
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Сейчас выплатят</div>
              <div className="font-display font-bold text-2xl text-emerald-400">
                {payout.toLocaleString('ru')} ₽
              </div>
              <div className="text-xs text-emerald-400/70">+{profit.toLocaleString('ru')} ₽</div>
            </div>
          )}

          {/* Результат */}
          {isCashedOut && (
            <div className="text-center">
              <div className="font-display font-bold text-2xl text-emerald-400">
                +{(bet * cashedOutAt - bet).toLocaleString('ru')} ₽
              </div>
              <div className="text-xs text-muted-foreground">
                Краш случился на ×{crashPoint.toFixed(2)}
              </div>
            </div>
          )}
          {isCrashed && (
            <div className="text-center">
              <div className="font-display font-bold text-xl text-red-400">−{bet.toLocaleString('ru')} ₽</div>
            </div>
          )}
        </div>
      </div>

      {/* Кнопка ЗАБРАТЬ во время полёта */}
      {isActive && (
        <button onClick={cashout}
          className="w-full py-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-95
            text-background font-display font-bold text-2xl transition-all
            shadow-[0_0_30px_hsl(158_64%_42%/0.5)]">
          💰 ЗАБРАТЬ ×{multiplier.toFixed(2)}
        </button>
      )}

      {/* Панель ставки */}
      {(isIdle || isCrashed || isCashedOut) && (
        <div className="glass rounded-2xl p-4 space-y-4">
          {/* Ставка */}
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Ставка</label>
            <div className="flex gap-2 mb-2">
              <input
                type="number" min={1} max={balance} value={bet}
                onChange={e => setBet(Number(e.target.value))}
                className="flex-1 bg-background/50 border border-gold/20 rounded-xl px-3 py-2.5 text-center font-display font-bold gold-text text-lg focus:outline-none focus:border-gold/50"
              />
              <button onClick={() => setBet(Math.floor(bet / 2))}
                className="glass rounded-xl px-3 text-xs font-bold text-muted-foreground hover:text-gold transition-colors">½</button>
              <button onClick={() => setBet(Math.min(bet * 2, balance))}
                className="glass rounded-xl px-3 text-xs font-bold text-muted-foreground hover:text-gold transition-colors">×2</button>
              <button onClick={() => setBet(balance)}
                className="glass rounded-xl px-3 text-xs font-bold text-muted-foreground hover:text-gold transition-colors">Max</button>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {BET_PRESETS.map(p => (
                <button key={p} onClick={() => setBet(p)}
                  className={`py-1.5 rounded-xl text-xs font-bold transition-all
                    ${bet === p ? 'gold-gradient text-background' : 'glass text-muted-foreground hover:text-gold'}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Авто-кэшаут */}
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">
              Авто-забрать на ×<span className="text-gold">{autoCashout || '—'}</span>
            </label>
            <div className="flex gap-2">
              <input
                type="number" min={1.01} step={0.1}
                value={autoCashout}
                onChange={e => { setAutoCashout(e.target.value); autoCashoutRef.current = e.target.value; }}
                placeholder="Например: 2.00"
                className="flex-1 bg-background/50 border border-gold/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-gold/50 placeholder:text-muted-foreground/40"
              />
              {['1.5', '2', '3', '5', '10'].map(v => (
                <button key={v} onClick={() => { setAutoCashout(v); autoCashoutRef.current = v; }}
                  className={`glass rounded-xl px-2.5 py-2 text-xs font-bold transition-all hover:text-gold
                    ${autoCashout === v ? 'border-gold/40 text-gold' : 'text-muted-foreground'}`}>
                  ×{v}
                </button>
              ))}
            </div>
          </div>

          <Button onClick={startGame} disabled={bet > balance || bet <= 0}
            className="w-full gold-gradient text-background font-bold h-12 text-base glow-gold disabled:opacity-50">
            <Icon name="Rocket" size={18} className="mr-2" />
            {isCrashed || isCashedOut ? 'Играть снова' : 'Запустить'} · {bet.toLocaleString('ru')} ₽
          </Button>
        </div>
      )}
    </div>
  );
}
