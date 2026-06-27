import { useState, useRef, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/icon';

// ── Активы ───────────────────────────────────────────────────────────────────
const ASSETS = [
  { id: 'btc',  name: 'Bitcoin',  symbol: 'BTC', emoji: '₿',  basePrice: 67420, volatility: 0.012 },
  { id: 'eth',  name: 'Ethereum', symbol: 'ETH', emoji: 'Ξ',  basePrice: 3540,  volatility: 0.015 },
  { id: 'gold', name: 'Золото',   symbol: 'XAU', emoji: '🥇', basePrice: 2340,  volatility: 0.006 },
  { id: 'oil',  name: 'Нефть',    symbol: 'OIL', emoji: '🛢', basePrice: 82,    volatility: 0.018 },
] as const;
type AssetId = typeof ASSETS[number]['id'];

// ── Web Audio ────────────────────────────────────────────────────────────────
function getCtx(): AudioContext | null {
  try {
    const C = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return C ? new C() : null;
  } catch { return null; }
}
function playTick(ctx: AudioContext, up: boolean) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = 'sine'; o.frequency.value = up ? 880 : 660;
  g.gain.setValueAtTime(0.04, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
  o.start(); o.stop(ctx.currentTime + 0.05);
}
function playWin(ctx: AudioContext) {
  [523, 659, 784, 1047, 1319].forEach((f, i) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; o.frequency.value = f;
    const t = ctx.currentTime + i * 0.09;
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.start(t); o.stop(t + 0.25);
  });
}
function playLose(ctx: AudioContext) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(300, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.45);
  g.gain.setValueAtTime(0.2, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
  o.start(); o.stop(ctx.currentTime + 0.45);
}
function playBeep(ctx: AudioContext) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = 'square'; o.frequency.value = 1200;
  g.gain.setValueAtTime(0.06, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
  o.start(); o.stop(ctx.currentTime + 0.06);
}

// ── Мини-график (SVG sparkline) ──────────────────────────────────────────────
function Sparkline({ points, up }: { points: number[]; up: boolean | null }) {
  if (points.length < 2) return <div style={{ height: 72 }} />;
  const W = 280, H = 72;
  const min = Math.min(...points), max = Math.max(...points);
  const range = max - min || 1;
  const xs = points.map((_, i) => (i / (points.length - 1)) * W);
  const ys = points.map(p => H - ((p - min) / range) * (H - 8) - 4);
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ');
  const color = up === null ? '#f5c842' : up ? '#34d399' : '#ef4444';

  // fill area under line
  const fill = `${d} L ${W} ${H} L 0 ${H} Z`;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full">
      <defs>
        <linearGradient id="sparkg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill="url(#sparkg)" />
      <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Текущая цена — точка */}
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="4" fill={color} />
    </svg>
  );
}

// ── Таймер-кольцо ────────────────────────────────────────────────────────────
function TimerRing({ seconds, total }: { seconds: number; total: number }) {
  const r = 28, c = 2 * Math.PI * r;
  const progress = seconds / total;
  const dash = progress * c;
  const color = seconds <= 3 ? '#ef4444' : seconds <= 6 ? '#f97316' : '#34d399';
  return (
    <svg width="72" height="72" className="-rotate-90">
      <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
      <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.9s linear, stroke 0.3s' }} />
    </svg>
  );
}

// ── Главный компонент ─────────────────────────────────────────────────────────
type Phase = 'idle' | 'countdown' | 'running' | 'result';
const ROUND_SECS = 10;
const TICK_MS    = 250; // частота обновления графика

export default function BullsBears({
  balance, onBalanceChange, onBack, onGameResult,
}: {
  balance: number;
  onBalanceChange: (delta: number) => void;
  onBack: () => void;
  onGameResult?: (bet: number, result: number, isWin: boolean, details: object) => void;
}) {
  const [assetId, setAssetId]   = useState<AssetId>('btc');
  const [bet, setBet]           = useState(100);
  const [direction, setDir]     = useState<'bull' | 'bear' | null>(null);
  const [phase, setPhase]       = useState<Phase>('idle');
  const [timeLeft, setTimeLeft] = useState(ROUND_SECS);
  const [points, setPoints]     = useState<number[]>([]);
  const [startPrice, setStart]  = useState(0);
  const [endPrice, setEnd]      = useState(0);
  const [won, setWon]           = useState(false);
  const [muted, setMuted]       = useState(false);
  const [payout, setPayout]     = useState(0);

  const ctxRef   = useRef<AudioContext | null>(null);
  const rafRef   = useRef<number>(0);
  const timerRef = useRef<number>(0);

  const asset = ASSETS.find(a => a.id === assetId)!;

  function audio() {
    if (muted) return null;
    if (!ctxRef.current) ctxRef.current = getCtx();
    return ctxRef.current;
  }

  // Генерация следующей цены (случайное блуждание)
  const priceRef = useRef(0);
  const generateNext = useCallback(() => {
    const change = (Math.random() - 0.49) * asset.volatility; // лёгкий drift up
    priceRef.current = priceRef.current * (1 + change);
    return priceRef.current;
  }, [asset.volatility]);

  // Запуск игры
  function startGame(dir: 'bull' | 'bear') {
    if (phase !== 'idle') return;
    const b = Math.max(1, Math.min(bet, balance));
    onBalanceChange(-b);
    setDir(dir);
    setPhase('countdown');

    // Стартовая цена
    const sp = asset.basePrice * (0.98 + Math.random() * 0.04);
    priceRef.current = sp;
    setStart(sp);
    setPoints([sp]);

    // Короткий отсчёт 1 сек потом запуск
    setTimeout(() => {
      setPhase('running');
      setTimeLeft(ROUND_SECS);

      // Тикающий таймер каждую секунду
      let secs = ROUND_SECS;
      timerRef.current = window.setInterval(() => {
        secs--;
        setTimeLeft(secs);
        const ac = audio(); if (ac && secs <= 3) playBeep(ac);
        if (secs <= 0) clearInterval(timerRef.current);
      }, 1000);

      // График обновляется каждые TICK_MS мс
      let elapsed = 0;
      const total = ROUND_SECS * 1000;
      let last = performance.now();
      let prevPrice = sp;

      const tick = (now: number) => {
        const dt = now - last; last = now; elapsed += dt;

        if (elapsed < total) {
          const np = generateNext();
          const ac = audio();
          if (ac && elapsed % 800 < TICK_MS) playTick(ac, np > prevPrice);
          prevPrice = np;
          setPoints(prev => [...prev, np]);
          rafRef.current = requestAnimationFrame(tick);
        } else {
          // Финал
          clearInterval(timerRef.current);
          const fp = generateNext();
          priceRef.current = fp;
          setEnd(fp);
          setPoints(prev => [...prev, fp]);

          const went_up = fp > sp;
          const correct = (dir === 'bull' && went_up) || (dir === 'bear' && !went_up);
          const mult = 1.9; // ~5% дом
          const win = correct ? parseFloat((b * mult).toFixed(2)) : 0;
          setPayout(win);
          setWon(correct);
          if (win > 0) onBalanceChange(win);
          onGameResult?.(b, win, correct, {
            asset: asset.symbol, direction: dir,
            start_price: sp, end_price: fp, went_up,
          });
          const ac = audio();
          if (ac) { if (correct) playWin(ac); else playLose(ac); }
          setPhase('result');
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    }, 800);
  }

  useEffect(() => () => {
    clearInterval(timerRef.current);
    cancelAnimationFrame(rafRef.current);
  }, []);

  function reset() {
    setPhase('idle');
    setDir(null);
    setPoints([]);
    setTimeLeft(ROUND_SECS);
    setStart(0); setEnd(0);
    setWon(false); setPayout(0);
  }

  const parsedBet = Math.max(1, Math.min(bet, balance));
  const PRESETS = [50, 100, 250, 500, 1000].filter(v => v <= balance);
  const priceChange = endPrice && startPrice ? ((endPrice - startPrice) / startPrice * 100) : 0;
  const currentPrice = points.length ? points[points.length - 1] : startPrice;
  const currentUp = points.length > 1 ? currentPrice > startPrice : null;

  const fmtPrice = (p: number) => {
    if (p >= 1000) return p.toLocaleString('ru', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return p.toLocaleString('ru', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="space-y-4 animate-float-up">

      {/* Шапка */}
      <div className="flex items-center gap-3">
        <button onClick={onBack}
          className="w-10 h-10 rounded-xl glass flex items-center justify-center text-gold shrink-0">
          <Icon name="ArrowLeft" size={20} />
        </button>
        <div className="flex-1">
          <h2 className="font-display text-xl font-bold">Быки и Медведи 📈</h2>
          <p className="text-xs text-muted-foreground">Угадай направление за 10 секунд</p>
        </div>
        <button onClick={() => setMuted(m => !m)}
          className="w-10 h-10 rounded-xl glass flex items-center justify-center text-muted-foreground hover:text-gold transition-colors shrink-0">
          <Icon name={muted ? 'VolumeX' : 'Volume2'} size={18} />
        </button>
      </div>

      {/* Выбор актива */}
      {phase === 'idle' && (
        <div className="grid grid-cols-4 gap-2">
          {ASSETS.map(a => (
            <button key={a.id} onClick={() => setAssetId(a.id)}
              className={`py-3 rounded-2xl flex flex-col items-center gap-1 transition-all text-sm font-semibold
                ${assetId === a.id ? 'gold-gradient text-background glow-gold' : 'glass text-muted-foreground hover:text-gold'}`}>
              <span className="text-lg">{a.emoji}</span>
              <span className="text-xs">{a.symbol}</span>
            </button>
          ))}
        </div>
      )}

      {/* График */}
      <div className="glass rounded-2xl p-4 space-y-3">
        {/* Заголовок актива и цена */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{asset.emoji}</span>
            <div>
              <p className="font-display font-bold">{asset.name}</p>
              <p className="text-xs text-muted-foreground">{asset.symbol} / USD</p>
            </div>
          </div>
          <div className="text-right">
            <p className={`font-display font-bold text-lg ${
              currentUp === null ? 'text-foreground' : currentUp ? 'text-emerald-400' : 'text-red-400'
            }`}>
              ${fmtPrice(currentPrice || asset.basePrice)}
            </p>
            {phase !== 'idle' && startPrice > 0 && (
              <p className={`text-xs font-semibold ${currentUp ? 'text-emerald-400' : 'text-red-400'}`}>
                {currentUp ? '▲' : '▼'} {Math.abs(((currentPrice - startPrice) / startPrice) * 100).toFixed(2)}%
              </p>
            )}
          </div>
        </div>

        {/* Sparkline */}
        <div className="relative">
          {phase === 'idle' ? (
            <div className="h-18 flex items-center justify-center py-4">
              <p className="text-xs text-muted-foreground">График появится после старта</p>
            </div>
          ) : (
            <Sparkline points={points} up={currentUp} />
          )}

          {/* Стартовая линия */}
          {phase !== 'idle' && startPrice > 0 && (
            <div className="absolute inset-x-0" style={{ top: '50%' }}>
              <div className="border-t border-dashed border-white/20" />
            </div>
          )}
        </div>

        {/* Таймер */}
        {(phase === 'running' || phase === 'countdown') && (
          <div className="flex items-center justify-center gap-4 pt-1">
            <div className="relative">
              <TimerRing seconds={timeLeft} total={ROUND_SECS} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`font-display font-bold text-xl ${timeLeft <= 3 ? 'text-red-400' : 'text-foreground'}`}>
                  {timeLeft}
                </span>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Осталось секунд</p>
              <div className="flex items-center gap-2 mt-1">
                {direction === 'bull'
                  ? <span className="text-emerald-400 font-bold flex items-center gap-1"><Icon name="TrendingUp" size={16} /> Вы ставили ВВЕРХ</span>
                  : <span className="text-red-400 font-bold flex items-center gap-1"><Icon name="TrendingDown" size={16} /> Вы ставили ВНИЗ</span>
                }
              </div>
            </div>
          </div>
        )}

        {/* Результат */}
        {phase === 'result' && (
          <div className={`animate-win-pop rounded-xl p-4 text-center
            ${won ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
            <p className={`font-display font-bold text-2xl ${won ? 'text-emerald-400' : 'text-red-400'}`}>
              {won ? '🎉 Верно!' : '😢 Неверно'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {asset.symbol} {priceChange >= 0 ? '▲' : '▼'} {Math.abs(priceChange).toFixed(2)}%
              {' '}({priceChange >= 0 ? 'выросло' : 'упало'})
            </p>
            {won && (
              <p className="font-display font-bold text-lg text-emerald-400 mt-1">
                +{payout.toLocaleString('ru')} ₽
              </p>
            )}
            <div className="flex justify-between text-xs text-muted-foreground mt-3 px-2">
              <span>Старт: ${fmtPrice(startPrice)}</span>
              <span>Финал: ${fmtPrice(endPrice)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Ставка */}
      {phase === 'idle' && (
        <div className="glass rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Ставка</label>
            <span className="text-xs text-muted-foreground">Выигрыш ×1.9</span>
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
                  {v >= 1000 ? `${v / 1000}к` : v}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Кнопки направления */}
      {phase === 'idle' && (
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => startGame('bull')} disabled={parsedBet > balance}
            className="h-16 rounded-2xl font-display font-bold text-lg flex flex-col items-center justify-center gap-1 disabled:opacity-50 transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #065f46, #059669)', color: 'white', boxShadow: '0 0 20px #05966940' }}>
            <div className="flex items-center gap-2">
              <Icon name="TrendingUp" size={22} />
              <span>ВВЕРХ</span>
            </div>
            <span className="text-xs opacity-75 font-normal">Быки 🐂</span>
          </button>
          <button onClick={() => startGame('bear')} disabled={parsedBet > balance}
            className="h-16 rounded-2xl font-display font-bold text-lg flex flex-col items-center justify-center gap-1 disabled:opacity-50 transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #7f1d1d, #dc2626)', color: 'white', boxShadow: '0 0 20px #dc262640' }}>
            <div className="flex items-center gap-2">
              <Icon name="TrendingDown" size={22} />
              <span>ВНИЗ</span>
            </div>
            <span className="text-xs opacity-75 font-normal">Медведи 🐻</span>
          </button>
        </div>
      )}

      {phase === 'result' && (
        <button onClick={reset}
          className="w-full h-14 rounded-2xl font-display font-bold text-xl gold-gradient text-background glow-gold flex items-center justify-center gap-3">
          <Icon name="RotateCcw" size={22} /> Сыграть ещё
        </button>
      )}

      {/* Инфо */}
      {phase === 'idle' && (
        <div className="glass rounded-xl p-3 flex items-start gap-2 text-xs text-muted-foreground">
          <Icon name="Info" size={14} className="text-gold shrink-0 mt-0.5" />
          Выбери актив и направление движения цены за 10 секунд. Угадал — получаешь ×1.9 от ставки.
        </div>
      )}
    </div>
  );
}