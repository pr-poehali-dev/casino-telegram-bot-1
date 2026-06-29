import { useState, useRef, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/icon';

// ── Константы ────────────────────────────────────────────────────────────────
const GRID = 5; // 5×5
const FREE_CENTER = true; // центр — FREE
const TOTAL_BALLS = 75;
const BALL_INTERVAL = 1800; // мс между шарами

// Выплаты по типу выигрыша
const PAYOUTS: Record<string, number> = {
  'Линия':         2,
  'Две линии':     5,
  'Три линии':     10,
  'Четыре линии':  20,
  'БИНГО! (5)':    40,
  'Blackout':      100,
};

// ── Генерация карточки ────────────────────────────────────────────────────────
// Классическое бинго: B(1-15) I(16-30) N(31-45) G(46-60) O(61-75)
const COL_LABELS = ['B','I','N','G','O'];
const COL_RANGES = [[1,15],[16,30],[31,45],[46,60],[61,75]] as const;

function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateCard(): (number | 'FREE')[][] {
  const card: (number | 'FREE')[][] = [];
  for (let col = 0; col < GRID; col++) {
    const [min, max] = COL_RANGES[col];
    const used = new Set<number>();
    const column: (number | 'FREE')[] = [];
    for (let row = 0; row < GRID; row++) {
      if (FREE_CENTER && col === 2 && row === 2) {
        column.push('FREE');
      } else {
        let n: number;
        do { n = randomInRange(min, max); } while (used.has(n));
        used.add(n);
        column.push(n);
      }
    }
    card.push(column);
  }
  return card;
}

// card[col][row] → отображаем по [row][col]
function getCell(card: (number|'FREE')[][], row: number, col: number): number | 'FREE' {
  return card[col][row];
}

// ── Проверка линий ────────────────────────────────────────────────────────────
type Marked = boolean[][];

function checkLines(marked: Marked): { lines: number; winLines: [number,number][][] } {
  const winLines: [number,number][][] = [];

  // Горизонтали
  for (let r = 0; r < GRID; r++) {
    if (Array.from({length: GRID}, (_, c) => marked[r][c]).every(Boolean))
      winLines.push(Array.from({length: GRID}, (_, c) => [r, c] as [number,number]));
  }
  // Вертикали
  for (let c = 0; c < GRID; c++) {
    if (Array.from({length: GRID}, (_, r) => marked[r][c]).every(Boolean))
      winLines.push(Array.from({length: GRID}, (_, r) => [r, c] as [number,number]));
  }
  // Диагональ ↘
  if (Array.from({length: GRID}, (_, i) => marked[i][i]).every(Boolean))
    winLines.push(Array.from({length: GRID}, (_, i) => [i, i] as [number,number]));
  // Диагональ ↗
  if (Array.from({length: GRID}, (_, i) => marked[i][GRID-1-i]).every(Boolean))
    winLines.push(Array.from({length: GRID}, (_, i) => [i, GRID-1-i] as [number,number]));

  return { lines: winLines.length, winLines };
}

function isBlackout(marked: Marked): boolean {
  return marked.every(row => row.every(Boolean));
}

function cellIsWinning(winLines: [number,number][][], r: number, c: number): boolean {
  return winLines.some(line => line.some(([lr, lc]) => lr === r && lc === c));
}

// ── Web Audio ─────────────────────────────────────────────────────────────────
function getCtx(): AudioContext | null {
  try {
    const C = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return C ? new C() : null;
  } catch { return null; }
}
function playBall(ctx: AudioContext) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = 'sine'; o.frequency.value = 440 + Math.random() * 120;
  g.gain.setValueAtTime(0.07, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
  o.start(); o.stop(ctx.currentTime + 0.12);
}
function playMark(ctx: AudioContext) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = 'triangle'; o.frequency.value = 880;
  g.gain.setValueAtTime(0.12, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
  o.start(); o.stop(ctx.currentTime + 0.15);
}
function playLine(ctx: AudioContext) {
  [523,659,784,1047].forEach((f, i) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; o.frequency.value = f;
    const t = ctx.currentTime + i * 0.09;
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.start(t); o.stop(t + 0.22);
  });
}
function playBingo(ctx: AudioContext) {
  [523,659,784,1047,1319,1568,2093].forEach((f, i) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = i % 2 === 0 ? 'sine' : 'triangle'; o.frequency.value = f;
    const t = ctx.currentTime + i * 0.1;
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.start(t); o.stop(t + 0.3);
  });
}
function playLose(ctx: AudioContext) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(280, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.5);
  g.gain.setValueAtTime(0.18, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
  o.start(); o.stop(ctx.currentTime + 0.5);
}

// ── Шар ──────────────────────────────────────────────────────────────────────
function Ball({ n, fresh }: { n: number; fresh: boolean }) {
  const col = Math.ceil(n / 15) - 1;
  const colors = ['#3b82f6','#a855f7','#ec4899','#f97316','#22c55e'];
  return (
    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-display font-bold text-xs text-white shrink-0
      ${fresh ? 'scale-110 ring-2 ring-white/40' : ''} transition-all duration-300`}
      style={{ background: colors[col], boxShadow: fresh ? `0 0 12px ${colors[col]}80` : 'none' }}>
      {n}
    </div>
  );
}

// ── Главный компонент ─────────────────────────────────────────────────────────
type Phase = 'idle' | 'playing' | 'result';

export default function BingoGame({
  balance, onBalanceChange, onBack, onGameResult,
}: {
  balance: number;
  onBalanceChange: (delta: number) => void;
  onBack: () => void;
  onGameResult?: (bet: number, result: number, isWin: boolean, details: object) => void;
}) {
  const [bet, setBet]           = useState(100);
  const [phase, setPhase]       = useState<Phase>('idle');
  const [card, setCard]         = useState<(number|'FREE')[][]>([]);
  const [marked, setMarked]     = useState<boolean[][]>([]);
  const [drawn, setDrawn]       = useState<number[]>([]);
  const [lastBall, setLastBall] = useState<number | null>(null);
  const [lines, setLines]       = useState(0);
  const [winLines, setWinLines] = useState<[number,number][][]>([]);
  const [blackout, setBlackout] = useState(false);
  const [payout, setPayout]     = useState(0);
  const [winType, setWinType]   = useState('');
  const [muted, setMuted]       = useState(false);
  const [ballsLeft, setBallsLeft] = useState(TOTAL_BALLS);
  const [speed, setSpeed]       = useState(1); // 1x / 2x

  const ctxRef     = useRef<AudioContext | null>(null);
  const intervalRef = useRef<number>(0);
  const betRef     = useRef(100);
  const drawnRef   = useRef<Set<number>>(new Set());
  const markedRef  = useRef<boolean[][]>([]);
  const cardRef    = useRef<(number|'FREE')[][]>([]);
  const linesRef   = useRef(0);
  const blackoutRef = useRef(false);
  const phaseRef   = useRef<Phase>('idle');

  function audio() {
    if (muted) return null;
    if (!ctxRef.current) ctxRef.current = getCtx();
    return ctxRef.current;
  }

  const stopGame = useCallback((finalMarked: boolean[][], finalDrawn: number[]) => {
    clearInterval(intervalRef.current);
    const { lines: l, winLines: wl } = checkLines(finalMarked);
    const bo = isBlackout(finalMarked);
    const isWin = l > 0 || bo;

    let type = '';
    let mult = 0;
    if (bo)          { type = 'Blackout';        mult = PAYOUTS['Blackout']; }
    else if (l >= 5) { type = 'БИНГО! (5)';      mult = PAYOUTS['БИНГО! (5)']; }
    else if (l === 4){ type = 'Четыре линии';     mult = PAYOUTS['Четыре линии']; }
    else if (l === 3){ type = 'Три линии';        mult = PAYOUTS['Три линии']; }
    else if (l === 2){ type = 'Две линии';        mult = PAYOUTS['Две линии']; }
    else if (l === 1){ type = 'Линия';            mult = PAYOUTS['Линия']; }

    const win = isWin ? parseFloat((betRef.current * mult).toFixed(2)) : 0;
    setPayout(win);
    setWinType(type);
    setLines(l);
    setWinLines(wl);
    setBlackout(bo);
    if (win > 0) onBalanceChange(win);
    onGameResult?.(betRef.current, win, isWin, {
      lines: l, balls_drawn: finalDrawn.length, win_type: type, mult,
    });
    const ctx = audio();
    if (ctx) {
      if (bo || l >= 5) playBingo(ctx);
      else if (l > 0) playLine(ctx);
      else playLose(ctx);
    }
    phaseRef.current = 'result';
    setPhase('result');
  }, []); // eslint-disable-line

  const drawBall = useCallback((
    currentMarked: boolean[][],
    currentDrawn: number[],
    currentCard: (number|'FREE')[][],
  ) => {
    if (phaseRef.current !== 'playing') return;

    // Генерируем новый шар
    const available: number[] = [];
    for (let i = 1; i <= TOTAL_BALLS; i++) {
      if (!drawnRef.current.has(i)) available.push(i);
    }
    if (available.length === 0) { stopGame(currentMarked, currentDrawn); return; }

    const ball = available[Math.floor(Math.random() * available.length)];
    drawnRef.current.add(ball);

    const ctx = audio(); if (ctx) playBall(ctx);
    setLastBall(ball);
    setBallsLeft(available.length - 1);

    const newDrawn = [...currentDrawn, ball];
    setDrawn(newDrawn);

    // Помечаем ячейки
    const newMarked = currentMarked.map(row => [...row]);
    let hit = false;
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const cell = getCell(currentCard, r, c);
        if (cell === ball) { newMarked[r][c] = true; hit = true; }
      }
    }
    if (hit) { const ctx2 = audio(); if (ctx2) playMark(ctx2); }
    markedRef.current = newMarked;
    setMarked(newMarked);

    // Проверяем линии
    const { lines: newLines, winLines: newWL } = checkLines(newMarked);
    const bo = isBlackout(newMarked);

    if (newLines > linesRef.current) {
      linesRef.current = newLines;
      const ctx3 = audio();
      if (ctx3 && !bo) playLine(ctx3);
    }

    // Blackout — немедленный финал
    if (bo && !blackoutRef.current) {
      blackoutRef.current = true;
      setWinLines(newWL);
      stopGame(newMarked, newDrawn);
      return;
    }

    // Все шары исчерпаны
    if (available.length === 1) { stopGame(newMarked, newDrawn); return; }

    setLines(newLines);
    setWinLines(newWL);
  }, [stopGame]); // eslint-disable-line

  function startGame() {
    const b = Math.max(1, Math.min(bet, balance));
    betRef.current = b;
    onBalanceChange(-b);

    const newCard = generateCard();
    const initMarked: boolean[][] = Array.from({ length: GRID }, (_, r) =>
      Array.from({ length: GRID }, (__, c) => FREE_CENTER && r === 2 && c === 2)
    );

    cardRef.current = newCard;
    markedRef.current = initMarked;
    drawnRef.current = new Set();
    linesRef.current = 0;
    blackoutRef.current = false;
    phaseRef.current = 'playing';

    setCard(newCard);
    setMarked(initMarked);
    setDrawn([]);
    setLastBall(null);
    setLines(0);
    setWinLines([]);
    setBlackout(false);
    setPayout(0);
    setWinType('');
    setBallsLeft(TOTAL_BALLS);
    setPhase('playing');

    const interval = () => BALL_INTERVAL / speed;

    intervalRef.current = window.setInterval(() => {
      drawBall(markedRef.current, [...drawnRef.current].map(Number), cardRef.current);
    }, interval());
  }

  // Пересоздаём интервал при смене скорости
  useEffect(() => {
    if (phase !== 'playing') return;
    clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(() => {
      drawBall(markedRef.current, [...drawnRef.current].map(Number), cardRef.current);
    }, BALL_INTERVAL / speed);
    return () => clearInterval(intervalRef.current);
  }, [speed, phase, drawBall]);

  useEffect(() => () => clearInterval(intervalRef.current), []);

  function reset() {
    phaseRef.current = 'idle';
    setPhase('idle');
    setCard([]);
    setMarked([]);
    setDrawn([]);
    setLastBall(null);
    setLines(0);
    setWinLines([]);
    setBlackout(false);
    setPayout(0);
    setWinType('');
    setBallsLeft(TOTAL_BALLS);
  }

  const parsedBet = Math.max(1, Math.min(bet, balance));
  const PRESETS = [50, 100, 250, 500, 1000].filter(v => v <= balance);
  const isWin = lines > 0 || blackout;

  return (
    <div className="space-y-4 animate-float-up">

      {/* Шапка */}
      <div className="flex items-center gap-3">
        <button onClick={onBack}
          className="w-10 h-10 rounded-xl glass flex items-center justify-center text-gold shrink-0">
          <Icon name="ArrowLeft" size={20} />
        </button>
        <div className="flex-1">
          <h2 className="font-display text-xl font-bold">Бинго 🎱</h2>
          <p className="text-xs text-muted-foreground">Собери линию — получи выигрыш</p>
        </div>
        {phase === 'playing' && (
          <button onClick={() => setSpeed(s => s === 1 ? 2 : 1)}
            className="px-3 h-10 rounded-xl glass text-xs font-bold text-muted-foreground hover:text-gold transition-colors">
            {speed === 1 ? '1×' : '2×'}
          </button>
        )}
        <button onClick={() => setMuted(m => !m)}
          className="w-10 h-10 rounded-xl glass flex items-center justify-center text-muted-foreground hover:text-gold transition-colors shrink-0">
          <Icon name={muted ? 'VolumeX' : 'Volume2'} size={18} />
        </button>
      </div>

      {/* Последний шар + счётчик */}
      {phase !== 'idle' && (
        <div className="glass rounded-2xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-xs text-muted-foreground">Последний:</div>
            {lastBall
              ? <Ball n={lastBall} fresh />
              : <div className="w-9 h-9 rounded-full bg-white/5 animate-pulse" />
            }
          </div>
          <div className="text-right">
            <div className="font-display font-bold text-lg gold-text">{drawn.length}</div>
            <div className="text-xs text-muted-foreground">из {TOTAL_BALLS} шаров</div>
          </div>
          <div className="text-right">
            <div className={`font-display font-bold text-lg ${lines > 0 ? 'text-emerald-400' : 'text-muted-foreground'}`}>
              {lines}
            </div>
            <div className="text-xs text-muted-foreground">линий</div>
          </div>
        </div>
      )}

      {/* Карточка бинго */}
      {(phase === 'playing' || phase === 'result') && card.length > 0 && (
        <div className="glass rounded-2xl p-3 overflow-hidden">
          {/* Заголовок B I N G O */}
          <div className="grid grid-cols-5 gap-1.5 mb-1.5">
            {COL_LABELS.map((l, i) => (
              <div key={i} className="h-8 flex items-center justify-center font-display font-bold text-base"
                style={{ color: ['#3b82f6','#a855f7','#ec4899','#f97316','#22c55e'][i] }}>
                {l}
              </div>
            ))}
          </div>

          {/* Сетка 5×5 */}
          <div className="grid grid-cols-5 gap-1.5">
            {Array.from({ length: GRID }, (_, r) =>
              Array.from({ length: GRID }, (__, c) => {
                const cell = getCell(card, r, c);
                const isMarked = marked[r]?.[c] ?? false;
                const isWinCell = cellIsWinning(winLines, r, c);
                const isFree = cell === 'FREE';
                const isNew = cell !== 'FREE' && cell === lastBall;

                return (
                  <div key={`${r}-${c}`}
                    className={`aspect-square rounded-xl flex items-center justify-center font-display font-bold text-sm
                      transition-all duration-300 select-none
                      ${isFree
                        ? 'gold-gradient text-background text-xs'
                        : isWinCell && phase === 'result'
                          ? 'bg-emerald-500 text-white ring-2 ring-emerald-300 scale-105'
                          : isMarked
                            ? 'bg-gold/80 text-background scale-95'
                            : 'bg-background/40 text-foreground/80'
                      }
                      ${isNew ? 'ring-2 ring-white animate-win-pop' : ''}
                    `}>
                    {isFree ? 'FREE' : cell}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Idle — заглушка карточки */}
      {phase === 'idle' && (
        <div className="glass rounded-2xl p-3 opacity-40">
          <div className="grid grid-cols-5 gap-1.5 mb-1.5">
            {COL_LABELS.map((l, i) => (
              <div key={i} className="h-8 flex items-center justify-center font-display font-bold text-base"
                style={{ color: ['#3b82f6','#a855f7','#ec4899','#f97316','#22c55e'][i] }}>
                {l}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {Array.from({ length: 25 }, (_, i) => (
              <div key={i} className="aspect-square rounded-xl bg-background/40 flex items-center justify-center text-xs text-muted-foreground/30">
                {i === 12 ? 'FREE' : '–'}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Результат */}
      {phase === 'result' && (
        <div className={`animate-win-pop glass rounded-2xl p-5 text-center border ${
          isWin ? (blackout ? 'border-gold/50 glow-gold' : 'border-emerald-500/40') : 'border-red-500/20'
        }`}>
          {isWin ? (
            <>
              <p className={`font-display text-2xl font-bold ${blackout ? 'gold-text' : 'text-emerald-400'}`}>
                {blackout ? '🎉 BLACKOUT!' : winType}
              </p>
              <p className="font-display text-3xl font-bold text-emerald-400 mt-1">
                +{payout.toLocaleString('ru')} ₽
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {lines} линий • {drawn.length} шаров выпало
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-2xl font-bold text-red-400">Не повезло 😢</p>
              <p className="text-xs text-muted-foreground mt-1">
                {drawn.length} шаров • ни одной линии
              </p>
            </>
          )}
        </div>
      )}

      {/* История шаров (последние 15) */}
      {phase !== 'idle' && drawn.length > 0 && (
        <div className="glass rounded-2xl p-3">
          <p className="text-xs text-muted-foreground mb-2">Выпавшие шары</p>
          <div className="flex flex-wrap gap-1.5">
            {drawn.slice(-20).map((n, i) => (
              <Ball key={i} n={n} fresh={n === lastBall} />
            ))}
            {drawn.length > 20 && (
              <div className="text-xs text-muted-foreground self-center">+{drawn.length - 20} ещё</div>
            )}
          </div>
        </div>
      )}

      {/* Таблица выплат */}
      {phase === 'idle' && (
        <div className="glass rounded-2xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Выплаты</p>
          <div className="space-y-1.5">
            {Object.entries(PAYOUTS).map(([name, mult]) => (
              <div key={name} className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">{name}</span>
                <span className="font-display font-bold gold-text">×{mult}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ставка */}
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
        <button onClick={startGame} disabled={parsedBet > balance}
          className="w-full h-14 rounded-2xl font-display font-bold text-xl gold-gradient text-background glow-gold disabled:opacity-50 flex items-center justify-center gap-3">
          <Icon name="Play" size={22} /> Начать игру
        </button>
      )}

      {phase === 'result' && (
        <button onClick={reset}
          className="w-full h-14 rounded-2xl font-display font-bold text-xl gold-gradient text-background glow-gold flex items-center justify-center gap-3">
          <Icon name="RotateCcw" size={22} /> Новая карточка
        </button>
      )}
    </div>
  );
}
