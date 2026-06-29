import { useState, useRef, useCallback, useEffect } from 'react';
import Icon from '@/components/ui/icon';

// ── Константы ─────────────────────────────────────────────────────────────────
const TOTAL      = 80;   // чисел в поле
const DRAW_COUNT = 20;   // тянется шаров
const MIN_PICK   = 5;
const MAX_PICK   = 10;
const DRAW_INTERVAL_MS = 400;

// ── Таблица выплат (pick → hits → mult) ──────────────────────────────────────
// Ключ: количество выбранных чисел → массив множителей по совпадениям [0, 1, 2, ...]
const PAYTABLE: Record<number, number[]> = {
  5:  [0, 0, 0, 1,  4,   20],
  6:  [0, 0, 0, 1,  3,   10,   50],
  7:  [0, 0, 0, 1,  2,   6,    30,   100],
  8:  [0, 0, 0, 0,  2,   5,    15,   50,   200],
  9:  [0, 0, 0, 0,  1,   4,    10,   30,   100,  500],
  10: [0, 0, 0, 0,  1,   3,    8,    20,   60,   200, 1000],
};

// ── Цвет шара по диапазону ────────────────────────────────────────────────────
function ballColor(n: number): string {
  if (n <= 10)  return '#ef4444';
  if (n <= 20)  return '#f97316';
  if (n <= 30)  return '#eab308';
  if (n <= 40)  return '#22c55e';
  if (n <= 50)  return '#06b6d4';
  if (n <= 60)  return '#3b82f6';
  if (n <= 70)  return '#a855f7';
  return             '#ec4899';
}

// ── Web Audio ─────────────────────────────────────────────────────────────────
function getCtx(): AudioContext | null {
  try {
    const C = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return C ? new C() : null;
  } catch { return null; }
}
function playDraw(ctx: AudioContext, hit: boolean) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = hit ? 'sine' : 'triangle';
  o.frequency.value = hit ? 880 : 440;
  g.gain.setValueAtTime(hit ? 0.13 : 0.05, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (hit ? 0.18 : 0.09));
  o.start(); o.stop(ctx.currentTime + 0.18);
}
function playWin(ctx: AudioContext, big: boolean) {
  const notes = big ? [523,659,784,1047,1319,1568] : [523,659,784,1047];
  notes.forEach((f, i) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; o.frequency.value = f;
    const t = ctx.currentTime + i * 0.09;
    g.gain.setValueAtTime(0.17, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.start(t); o.stop(t + 0.25);
  });
}
function playLose(ctx: AudioContext) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(280, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.45);
  g.gain.setValueAtTime(0.18, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
  o.start(); o.stop(ctx.currentTime + 0.45);
}

// ── Главный компонент ─────────────────────────────────────────────────────────
type Phase = 'pick' | 'drawing' | 'result';

export default function KenoGame({
  balance, onBalanceChange, onBack, onGameResult,
}: {
  balance: number;
  onBalanceChange: (delta: number) => void;
  onBack: () => void;
  onGameResult?: (bet: number, result: number, isWin: boolean, details: object) => void;
}) {
  const [bet, setBet]         = useState(100);
  const [picked, setPicked]   = useState<Set<number>>(new Set());
  const [phase, setPhase]     = useState<Phase>('pick');
  const [drawn, setDrawn]     = useState<number[]>([]);
  const [hits, setHits]       = useState<Set<number>>(new Set());
  const [payout, setPayout]   = useState(0);
  const [mult, setMult]       = useState(0);
  const [muted, setMuted]     = useState(false);
  const [speed, setSpeed]     = useState(1);
  const [lastDrawn, setLastDrawn] = useState<number | null>(null);

  const ctxRef      = useRef<AudioContext | null>(null);
  const intervalRef = useRef<number>(0);
  const betRef      = useRef(100);
  const pickedRef   = useRef<Set<number>>(new Set());
  const drawnRef    = useRef<number[]>([]);
  const hitsRef     = useRef<Set<number>>(new Set());
  const poolRef     = useRef<number[]>([]);

  function audio() {
    if (muted) return null;
    if (!ctxRef.current) ctxRef.current = getCtx();
    return ctxRef.current;
  }

  // Перемешиваем пул 1–80
  function makePool(): number[] {
    const arr = Array.from({ length: TOTAL }, (_, i) => i + 1);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  const finishGame = useCallback((finalDrawn: number[], finalHits: Set<number>, finalPicked: Set<number>) => {
    clearInterval(intervalRef.current);
    const pickCount = finalPicked.size;
    const hitCount  = finalHits.size;
    const table = PAYTABLE[pickCount] ?? [];
    const m = table[hitCount] ?? 0;
    const win = m > 0 ? parseFloat((betRef.current * m).toFixed(2)) : 0;
    setMult(m);
    setPayout(win);
    if (win > 0) onBalanceChange(win);
    onGameResult?.(betRef.current, win, win > 0, {
      picked: [...finalPicked].sort((a,b)=>a-b),
      drawn: finalDrawn,
      hits: hitCount,
      mult: m,
    });
    const ctx = audio();
    if (ctx) {
      if (win === 0) playLose(ctx);
      else playWin(ctx, m >= 50);
    }
    setPhase('result');
  }, []); // eslint-disable-line

  const drawNext = useCallback(() => {
    if (drawnRef.current.length >= DRAW_COUNT || poolRef.current.length === 0) {
      finishGame(drawnRef.current, hitsRef.current, pickedRef.current);
      return;
    }
    const ball = poolRef.current.shift()!;
    drawnRef.current = [...drawnRef.current, ball];
    setDrawn([...drawnRef.current]);
    setLastDrawn(ball);

    const isHit = pickedRef.current.has(ball);
    if (isHit) {
      hitsRef.current = new Set([...hitsRef.current, ball]);
      setHits(new Set(hitsRef.current));
    }
    const ctx = audio(); if (ctx) playDraw(ctx, isHit);

    if (drawnRef.current.length >= DRAW_COUNT) {
      finishGame(drawnRef.current, hitsRef.current, pickedRef.current);
    }
  }, [finishGame]); // eslint-disable-line

  function startGame() {
    if (picked.size < MIN_PICK) return;
    const b = Math.max(1, Math.min(bet, balance));
    betRef.current = b;
    pickedRef.current = new Set(picked);
    drawnRef.current = [];
    hitsRef.current  = new Set();
    poolRef.current  = makePool();

    onBalanceChange(-b);
    setDrawn([]);
    setHits(new Set());
    setLastDrawn(null);
    setPayout(0);
    setMult(0);
    setPhase('drawing');

    intervalRef.current = window.setInterval(drawNext, DRAW_INTERVAL_MS / speed);
  }

  // Пересоздаём интервал при смене скорости во время игры
  useEffect(() => {
    if (phase !== 'drawing') return;
    clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(drawNext, DRAW_INTERVAL_MS / speed);
    return () => clearInterval(intervalRef.current);
  }, [speed, phase, drawNext]);

  useEffect(() => () => clearInterval(intervalRef.current), []);

  function reset() {
    setPicked(new Set());
    setDrawn([]);
    setHits(new Set());
    setLastDrawn(null);
    setPayout(0);
    setMult(0);
    setPhase('pick');
  }

  function togglePick(n: number) {
    if (phase !== 'pick') return;
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(n)) { next.delete(n); return next; }
      if (next.size >= MAX_PICK) return prev;
      next.add(n);
      return next;
    });
  }

  function quickPick(count: number) {
    const pool = Array.from({ length: TOTAL }, (_, i) => i + 1);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    setPicked(new Set(pool.slice(0, count)));
  }

  const parsedBet = Math.max(1, Math.min(bet, balance));
  const PRESETS   = [50, 100, 250, 500, 1000].filter(v => v <= balance);
  const pickCount = picked.size;
  const hitCount  = hits.size;
  const table     = PAYTABLE[pickCount] ?? [];
  const isWin     = payout > 0;

  // Потенциальный выигрыш при текущей ставке
  const maxMult   = table.length > 0 ? Math.max(...table) : 0;

  return (
    <div className="space-y-4 animate-float-up">

      {/* Шапка */}
      <div className="flex items-center gap-3">
        <button onClick={onBack}
          className="w-10 h-10 rounded-xl glass flex items-center justify-center text-gold shrink-0">
          <Icon name="ArrowLeft" size={20} />
        </button>
        <div className="flex-1">
          <h2 className="font-display text-xl font-bold">Кено 🎯</h2>
          <p className="text-xs text-muted-foreground">Выбери {MIN_PICK}–{MAX_PICK} чисел, тянется {DRAW_COUNT}</p>
        </div>
        {phase === 'drawing' && (
          <button onClick={() => setSpeed(s => s === 1 ? 4 : 1)}
            className="px-3 h-10 rounded-xl glass text-xs font-bold text-muted-foreground hover:text-gold transition-colors shrink-0">
            {speed === 1 ? '1×' : '4×'}
          </button>
        )}
        <button onClick={() => setMuted(m => !m)}
          className="w-10 h-10 rounded-xl glass flex items-center justify-center text-muted-foreground hover:text-gold transition-colors shrink-0">
          <Icon name={muted ? 'VolumeX' : 'Volume2'} size={18} />
        </button>
      </div>

      {/* Статус-строка */}
      {phase !== 'pick' && (
        <div className="glass rounded-2xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Выпало:</span>
            {lastDrawn !== null && (
              <div className="w-8 h-8 rounded-full flex items-center justify-center font-display font-bold text-xs text-white"
                style={{ background: ballColor(lastDrawn), boxShadow: `0 0 10px ${ballColor(lastDrawn)}80` }}>
                {lastDrawn}
              </div>
            )}
            <span className="font-display font-bold">{drawn.length}/{DRAW_COUNT}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="font-display font-bold text-lg text-emerald-400">{hitCount}</div>
              <div className="text-xs text-muted-foreground">попаданий</div>
            </div>
            {hitCount > 0 && table[hitCount] > 0 && (
              <div className="text-center">
                <div className="font-display font-bold text-lg gold-text">×{table[hitCount]}</div>
                <div className="text-xs text-muted-foreground">текущий</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Сетка чисел */}
      <div className="glass rounded-2xl p-3">
        {/* Выбрано / быстрый выбор */}
        {phase === 'pick' && (
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold">
              Выбрано: <span className={pickCount >= MIN_PICK ? 'text-emerald-400' : 'text-muted-foreground'}>{pickCount}</span>
              <span className="text-muted-foreground">/{MAX_PICK}</span>
            </span>
            <div className="flex gap-1.5">
              {[5,7,10].map(n => (
                <button key={n} onClick={() => quickPick(n)}
                  className="px-2.5 py-1 rounded-lg glass text-xs font-semibold text-muted-foreground hover:text-gold transition-colors">
                  {n}
                </button>
              ))}
              <button onClick={() => setPicked(new Set())}
                className="px-2.5 py-1 rounded-lg glass text-xs font-semibold text-muted-foreground hover:text-red-400 transition-colors">
                Сброс
              </button>
            </div>
          </div>
        )}

        {/* Числа 1–80 сетка 10×8 */}
        <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(10, 1fr)' }}>
          {Array.from({ length: TOTAL }, (_, i) => i + 1).map(n => {
            const isPicked  = picked.has(n);
            const isDrawn   = drawn.includes(n);
            const isHit     = hits.has(n);
            const isLast    = n === lastDrawn;

            let bg = 'bg-background/40 text-foreground/60';
            let ring = '';
            let scale = '';

            if (phase === 'pick') {
              if (isPicked) bg = 'gold-gradient text-background font-bold';
            } else {
              if (isHit) {
                bg = 'bg-emerald-500 text-white font-bold';
                ring = isLast ? 'ring-2 ring-white' : '';
                scale = 'scale-110';
              } else if (isDrawn) {
                bg = 'bg-white/15 text-white/50';
              } else if (isPicked) {
                bg = 'border border-gold/40 text-gold font-bold bg-gold/5';
              }
            }

            return (
              <button key={n}
                onClick={() => togglePick(n)}
                disabled={phase !== 'pick'}
                className={`aspect-square rounded-lg flex items-center justify-center text-[11px] transition-all duration-200
                  ${bg} ${ring} ${scale}
                  ${phase === 'pick' && !isPicked && pickCount >= MAX_PICK ? 'opacity-30 cursor-not-allowed' : ''}
                  ${phase === 'pick' ? 'hover:opacity-80 active:scale-90' : ''}
                  ${isLast ? 'animate-win-pop' : ''}
                `}>
                {n}
              </button>
            );
          })}
        </div>
      </div>

      {/* Результат */}
      {phase === 'result' && (
        <div className={`animate-win-pop glass rounded-2xl p-5 text-center border ${
          isWin ? (mult >= 50 ? 'border-gold/50 glow-gold' : 'border-emerald-500/40') : 'border-red-500/20'
        }`}>
          {isWin ? (
            <>
              <p className={`font-display text-2xl font-bold ${mult >= 50 ? 'gold-text' : 'text-emerald-400'}`}>
                {mult >= 100 ? '🏆 ДЖЕКПОТ!' : mult >= 20 ? '🎉 Отлично!' : '✅ Выигрыш!'}
              </p>
              <p className="font-display text-3xl font-bold text-emerald-400 mt-1">
                +{payout.toLocaleString('ru')} ₽
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {hitCount} из {pickCount} попаданий • ×{mult}
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-2xl font-bold text-red-400">Не повезло 😢</p>
              <p className="text-xs text-muted-foreground mt-1">
                {hitCount} из {pickCount} попаданий — нужно больше!
              </p>
            </>
          )}
        </div>
      )}

      {/* Таблица выплат для выбранного количества */}
      {phase === 'pick' && pickCount >= MIN_PICK && (
        <div className="glass rounded-2xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
            Выплаты при выборе {pickCount} чисел
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            {table.map((m, hits_n) => {
              if (m === 0) return null;
              return (
                <div key={hits_n} className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">{hits_n} попаданий</span>
                  <span className={`font-display font-bold ${m >= 100 ? 'gold-text' : m >= 20 ? 'text-emerald-400' : 'text-foreground'}`}>
                    ×{m}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-white/5 flex justify-between text-xs text-muted-foreground">
            <span>Максимальный выигрыш</span>
            <span className="gold-text font-bold">×{maxMult} = {(parsedBet * maxMult).toLocaleString('ru')} ₽</span>
          </div>
        </div>
      )}

      {/* Ставка */}
      {phase === 'pick' && (
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

      {/* CTA */}
      {phase === 'pick' && (
        <button onClick={startGame}
          disabled={pickCount < MIN_PICK || parsedBet > balance}
          className="w-full h-14 rounded-2xl font-display font-bold text-xl gold-gradient text-background glow-gold disabled:opacity-40 flex items-center justify-center gap-3 transition-all">
          {pickCount < MIN_PICK
            ? <><Icon name="MousePointer" size={22} /> Выбери ещё {MIN_PICK - pickCount}</>
            : <><Icon name="Play" size={22} /> Старт — {pickCount} чисел</>
          }
        </button>
      )}

      {phase === 'result' && (
        <button onClick={reset}
          className="w-full h-14 rounded-2xl font-display font-bold text-xl gold-gradient text-background glow-gold flex items-center justify-center gap-3">
          <Icon name="RotateCcw" size={22} /> Сыграть ещё
        </button>
      )}
    </div>
  );
}
