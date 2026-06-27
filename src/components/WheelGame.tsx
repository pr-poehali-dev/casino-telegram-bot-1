import { useState, useRef, useEffect } from 'react';
import Icon from '@/components/ui/icon';

// ── Секторы колеса ──
const SECTORS = [
  { label: '×2',    mult: 2,    color: '#f5c842', textColor: '#1a1a2e' },
  { label: '×0',    mult: 0,    color: '#ef4444', textColor: '#fff'    },
  { label: '×1.5',  mult: 1.5,  color: '#a78bfa', textColor: '#fff'    },
  { label: '×3',    mult: 3,    color: '#34d399', textColor: '#1a1a2e' },
  { label: '×0',    mult: 0,    color: '#ef4444', textColor: '#fff'    },
  { label: '×1.5',  mult: 1.5,  color: '#60a5fa', textColor: '#fff'    },
  { label: '×5',    mult: 5,    color: '#f97316', textColor: '#fff'    },
  { label: '×0',    mult: 0,    color: '#ef4444', textColor: '#fff'    },
  { label: '×2',    mult: 2,    color: '#f5c842', textColor: '#1a1a2e' },
  { label: '×0.5',  mult: 0.5,  color: '#6b7280', textColor: '#fff'    },
  { label: '×10',   mult: 10,   color: '#fbbf24', textColor: '#1a1a2e' },
  { label: '×0',    mult: 0,    color: '#ef4444', textColor: '#fff'    },
];

const N = SECTORS.length;
const ANGLE = 360 / N; // 30°

// ── Web Audio ──
type AC = AudioContext;
function getCtx(): AC | null {
  try {
    const C = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return C ? new C() : null;
  } catch { return null; }
}
function playTick(ctx: AC) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = 'triangle'; o.frequency.value = 900;
  g.gain.setValueAtTime(0.07, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
  o.start(); o.stop(ctx.currentTime + 0.04);
}
function playWin(ctx: AC, big: boolean) {
  const notes = big ? [523, 659, 784, 1047, 1319] : [523, 659, 784];
  notes.forEach((f, i) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; o.frequency.value = f;
    const t = ctx.currentTime + i * 0.1;
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.start(t); o.stop(t + 0.25);
  });
}
function playLose(ctx: AC) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = 'sawtooth'; o.frequency.setValueAtTime(300, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.4);
  g.gain.setValueAtTime(0.2, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
  o.start(); o.stop(ctx.currentTime + 0.4);
}

// ── SVG Колесо ──
function WheelSvg({ rotation, size = 300 }: { rotation: number; size?: number }) {
  const cx = size / 2, cy = size / 2, r = size / 2 - 4;

  const sectors = SECTORS.map((s, i) => {
    const startAngle = (i * ANGLE - 90) * (Math.PI / 180);
    const endAngle   = ((i + 1) * ANGLE - 90) * (Math.PI / 180);
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const midAngle = ((i + 0.5) * ANGLE - 90) * (Math.PI / 180);
    const tr = r * 0.68;
    const tx = cx + tr * Math.cos(midAngle);
    const ty = cy + tr * Math.sin(midAngle);
    const textRot = (i + 0.5) * ANGLE;

    return (
      <g key={i}>
        <path
          d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`}
          fill={s.color}
          stroke="rgba(0,0,0,0.25)"
          strokeWidth="1.5"
        />
        <text
          x={tx} y={ty}
          textAnchor="middle" dominantBaseline="middle"
          fill={s.textColor}
          fontSize={size * 0.052}
          fontWeight="bold"
          fontFamily="Oswald, sans-serif"
          transform={`rotate(${textRot}, ${tx}, ${ty})`}
        >
          {s.label}
        </text>
      </g>
    );
  });

  return (
    <svg
      width={size} height={size}
      style={{ transform: `rotate(${rotation}deg)`, transition: 'none', display: 'block' }}
    >
      {/* Тени между секторами */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth="2" />
      {sectors}
      {/* Центр */}
      <circle cx={cx} cy={cy} r={size * 0.07} fill="#1a1a2e" stroke="hsl(43 74% 52%)" strokeWidth="3" />
      <circle cx={cx} cy={cy} r={size * 0.03} fill="hsl(43 74% 52%)" />
    </svg>
  );
}

export default function WheelGame({
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
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<{ sector: typeof SECTORS[0]; index: number } | null>(null);
  const [payout, setPayout] = useState(0);
  const [muted, setMuted] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const rotRef = useRef(0);        // текущий угол (без transition)
  const tickRef = useRef(0);       // для тиков каждые 30°

  function audio() {
    if (muted) return null;
    if (!ctxRef.current) ctxRef.current = getCtx();
    return ctxRef.current;
  }

  // Очищаем RAF при размонтировании
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  function spin() {
    if (spinning || bet <= 0 || bet > balance) return;

    // Списываем ставку
    onBalanceChange(-bet);
    setSpinning(true);
    setResult(null);

    // Случайный выигрышный сектор
    const targetIdx = Math.floor(Math.random() * N);

    // Считаем угол остановки: стрелка сверху (0°), сектор i начинается с i*ANGLE
    // Хотим чтобы середина targetIdx оказалась под стрелкой
    const targetAngle = 360 - ((targetIdx + 0.5) * ANGLE) % 360;
    // Добавляем несколько полных оборотов для реалистичности
    const extraSpins = (5 + Math.floor(Math.random() * 4)) * 360;
    const finalAngle = rotRef.current + extraSpins + ((targetAngle - rotRef.current % 360) + 360) % 360;

    // Параметры анимации
    const duration = 4500 + Math.random() * 1000; // 4.5–5.5с
    const startRot = rotRef.current;
    const startTime = performance.now();
    let lastTickAngle = startRot;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeInOutQuart
      const ease = progress < 0.5
        ? 8 * progress ** 4
        : 1 - (-2 * progress + 2) ** 4 / 2;
      const current = startRot + (finalAngle - startRot) * ease;
      rotRef.current = current;
      setRotation(current);

      // Тик каждые ~ANGLE градусов
      const ctx = audio();
      if (ctx && Math.floor(current / ANGLE) !== Math.floor(lastTickAngle / ANGLE)) {
        playTick(ctx);
        lastTickAngle = current;
      }

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        // Финал
        rotRef.current = finalAngle;
        setRotation(finalAngle);
        const sector = SECTORS[targetIdx];
        const win = parseFloat((bet * sector.mult).toFixed(2));
        setPayout(win);
        setResult({ sector, index: targetIdx });
        if (win > 0) onBalanceChange(win);
        onGameResult?.(bet, win, win > 0, { sector: sector.label, mult: sector.mult, index: targetIdx });
        const c = audio();
        if (c) {
          if (sector.mult === 0) playLose(c);
          else if (sector.mult >= 5) playWin(c, true);
          else playWin(c, false);
        }
        setSpinning(false);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
  }

  const parsedBet = Math.max(1, Math.min(bet, balance));
  const canSpin = !spinning && parsedBet > 0 && parsedBet <= balance;
  const PRESETS = [50, 100, 500, 1000].filter(v => v <= balance);

  return (
    <div className="space-y-4 animate-float-up">
      {/* Шапка */}
      <div className="flex items-center gap-3">
        <button onClick={onBack}
          className="w-10 h-10 rounded-xl glass flex items-center justify-center text-gold shrink-0">
          <Icon name="ArrowLeft" size={20} />
        </button>
        <div className="flex-1">
          <h2 className="font-display text-xl font-bold">Колесо 🎡</h2>
          <p className="text-xs text-muted-foreground">Крути и умножай ставку</p>
        </div>
        <button onClick={() => setMuted(m => !m)}
          className="w-10 h-10 rounded-xl glass flex items-center justify-center text-muted-foreground hover:text-gold transition-colors shrink-0">
          <Icon name={muted ? 'VolumeX' : 'Volume2'} size={18} />
        </button>
      </div>

      {/* Колесо */}
      <div className="relative flex justify-center items-center">
        {/* Стрелка-указатель сверху */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-10 flex flex-col items-center">
          <div className="w-0 h-0"
            style={{ borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: '22px solid hsl(43 74% 52%)' }} />
        </div>

        {/* Внешнее свечение */}
        <div className="rounded-full p-1"
          style={{ background: 'radial-gradient(circle, hsl(43 74% 52% / 0.15), transparent 70%)' }}>
          <div className="rounded-full overflow-hidden"
            style={{ boxShadow: spinning ? '0 0 40px hsl(43 74% 52% / 0.5)' : '0 0 20px hsl(43 74% 52% / 0.2)', transition: 'box-shadow 0.3s' }}>
            <WheelSvg rotation={rotation} size={300} />
          </div>
        </div>
      </div>

      {/* Результат */}
      {result && !spinning && (
        <div className={`animate-win-pop glass rounded-2xl p-4 text-center border ${
          result.sector.mult === 0 ? 'border-red-500/30' :
          result.sector.mult >= 5 ? 'border-gold/50 glow-gold' : 'border-emerald-500/30'
        }`}>
          {result.sector.mult === 0 ? (
            <p className="text-red-400 font-display font-bold text-lg">Не повезло — ×0 😢</p>
          ) : result.sector.mult >= 5 ? (
            <p className="gold-text font-display font-bold text-xl">🎉 {result.sector.label} — +{payout.toLocaleString('ru')} ₽!</p>
          ) : (
            <p className="text-emerald-400 font-display font-bold text-lg">{result.sector.label} — +{payout.toLocaleString('ru')} ₽</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">Ставка: {bet.toLocaleString('ru')} ₽</p>
        </div>
      )}

      {/* Ставка */}
      <div className="glass rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted-foreground uppercase tracking-wider">Ставка</label>
          <span className="text-xs text-muted-foreground">Баланс: {balance.toLocaleString('ru')} ₽</span>
        </div>
        <div className="flex gap-2">
          <input
            type="number" min={1} max={balance} value={bet}
            onChange={e => setBet(Math.max(1, Math.min(Number(e.target.value), balance)))}
            disabled={spinning}
            className="flex-1 bg-background/50 border border-gold/20 rounded-xl px-3 py-2.5 text-center font-display font-bold gold-text text-lg focus:outline-none focus:border-gold/50 disabled:opacity-50"
          />
          <button onClick={() => setBet(b => Math.max(1, Math.floor(b / 2)))} disabled={spinning}
            className="glass rounded-xl px-3 text-sm font-bold text-muted-foreground hover:text-gold transition-colors disabled:opacity-40">½</button>
          <button onClick={() => setBet(b => Math.min(b * 2, balance))} disabled={spinning}
            className="glass rounded-xl px-3 text-sm font-bold text-muted-foreground hover:text-gold transition-colors disabled:opacity-40">×2</button>
          <button onClick={() => setBet(balance)} disabled={spinning}
            className="glass rounded-xl px-3 text-sm font-bold text-muted-foreground hover:text-gold transition-colors disabled:opacity-40">Макс</button>
        </div>
        {PRESETS.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {PRESETS.map(v => (
              <button key={v} onClick={() => setBet(v)} disabled={spinning}
                className={`py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-40
                  ${bet === v ? 'gold-gradient text-background' : 'bg-background/50 text-foreground/70 hover:text-gold'}`}>
                {v >= 1000 ? `${v / 1000}к` : v}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Кнопка спина */}
      <button onClick={spin} disabled={!canSpin}
        className="w-full h-14 rounded-2xl font-display font-bold text-xl gold-gradient text-background glow-gold disabled:opacity-50 transition-all flex items-center justify-center gap-3">
        {spinning
          ? <><Icon name="Loader" size={22} className="animate-spin" /> Крутим...</>
          : <><Icon name="RefreshCw" size={22} /> Крутить колесо</>}
      </button>

      {/* Таблица выплат */}
      <div className="glass rounded-2xl p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Таблица выплат</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: '×10', color: '#fbbf24', chance: '1/12' },
            { label: '×5',  color: '#f97316', chance: '1/12' },
            { label: '×3',  color: '#34d399', chance: '1/12' },
            { label: '×2',  color: '#f5c842', chance: '2/12' },
            { label: '×1.5',color: '#a78bfa', chance: '2/12' },
            { label: '×0',  color: '#ef4444', chance: '4/12' },
          ].map(row => (
            <div key={row.label} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ background: row.color }} />
              <span className="font-bold text-sm" style={{ color: row.color }}>{row.label}</span>
              <span className="text-xs text-muted-foreground ml-auto">{row.chance}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
