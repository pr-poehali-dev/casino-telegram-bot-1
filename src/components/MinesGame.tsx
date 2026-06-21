import { useState, useCallback, useRef } from 'react';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';

// ── Audio ──────────────────────────────────────────────────────────────────
function getAudio() {
  try { return new (window.AudioContext || (window as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); }
  catch { return null; }
}
function playClick(ctx: AudioContext) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = 'sine'; o.frequency.setValueAtTime(880, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.07);
  g.gain.setValueAtTime(0.15, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
  o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.12);
}
function playMine(ctx: AudioContext) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = 'sawtooth'; o.frequency.setValueAtTime(200, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.5);
  g.gain.setValueAtTime(0.3, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
  o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.5);
}
function playCashout(ctx: AudioContext) {
  [523, 659, 784, 1047].forEach((f, i) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; o.frequency.value = f;
    const t = ctx.currentTime + i * 0.1;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.start(t); o.stop(t + 0.25);
  });
}

// ── Constants ──────────────────────────────────────────────────────────────
const GRID = 25;
const MINE_OPTIONS = [1, 3, 5, 10, 15, 20];

// Множитель выигрыша за N открытых клеток при M минах
function calcMultiplier(opened: number, mines: number): number {
  if (opened === 0) return 1;
  const safe = GRID - mines;
  let mult = 1;
  for (let i = 0; i < opened; i++) {
    mult *= (safe - i) / (GRID - mines - i) * (GRID / (GRID - i));
  }
  // сглаживаем: казино берёт ~5% маржи
  return Math.max(1, parseFloat((mult * 0.95).toFixed(2)));
}

type Phase = 'idle' | 'playing' | 'won' | 'lost';
type Cell = 'hidden' | 'safe' | 'mine';

export default function MinesGame({
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
  const [mines, setMines] = useState(3);
  const [phase, setPhase] = useState<Phase>('idle');
  const [cells, setCells] = useState<Cell[]>(Array(GRID).fill('hidden'));
  const [minePositions, setMinePositions] = useState<Set<number>>(new Set());
  const [opened, setOpened] = useState(0);
  const [muted, setMuted] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);

  const getCtx = () => {
    if (muted) return null;
    if (!audioRef.current) audioRef.current = getAudio();
    return audioRef.current;
  };

  const mult = calcMultiplier(opened, mines);
  const potential = parseFloat((bet * mult).toFixed(2));
  const profit = parseFloat((potential - bet).toFixed(2));

  const setBet = (v: number) => {
    if (phase !== 'idle') return;
    setBetState(Math.min(Math.max(1, v), balance));
  };

  // Начать игру
  const startGame = useCallback(() => {
    if (bet > balance || bet <= 0) return;
    onBalanceChange(-bet);

    // Генерируем позиции мин
    const positions = new Set<number>();
    while (positions.size < mines) {
      positions.add(Math.floor(Math.random() * GRID));
    }
    setMinePositions(positions);
    setCells(Array(GRID).fill('hidden'));
    setOpened(0);
    setPhase('playing');
  }, [bet, balance, mines, onBalanceChange]);

  // Открыть клетку
  const openCell = useCallback((idx: number) => {
    if (phase !== 'playing') return;
    if (cells[idx] !== 'hidden') return;

    const ctx = getCtx();

    if (minePositions.has(idx)) {
      // Мина!
      if (ctx) playMine(ctx);
      setCells(prev => {
        const next = [...prev];
        // Открываем все мины
        minePositions.forEach(m => { next[m] = 'mine'; });
        next[idx] = 'mine';
        return next;
      });
      setPhase('lost');
      onGameResult?.(bet, 0, false, { mines, opened, hit: idx });
    } else {
      // Безопасно
      if (ctx) playClick(ctx);
      const newOpened = opened + 1;
      setOpened(newOpened);
      setCells(prev => { const next = [...prev]; next[idx] = 'safe'; return next; });

      // Все безопасные открыты — авто-победа
      if (newOpened === GRID - mines) {
        const finalMult = calcMultiplier(newOpened, mines);
        const payout = parseFloat((bet * finalMult).toFixed(2));
        if (ctx) playCashout(ctx);
        onBalanceChange(payout);
        setPhase('won');
        onGameResult?.(bet, payout, true, { mines, opened: newOpened, mult: finalMult, auto: true });
      }
    }
  }, [phase, cells, minePositions, opened, bet, mines, onBalanceChange, onGameResult]);

  // Забрать выигрыш
  const cashout = useCallback(() => {
    if (phase !== 'playing' || opened === 0) return;
    const ctx = getCtx();
    if (ctx) playCashout(ctx);
    onBalanceChange(potential);
    setPhase('won');
    onGameResult?.(bet, potential, true, { mines, opened, mult });
  }, [phase, opened, potential, bet, mines, mult, onBalanceChange, onGameResult]);

  // Сброс
  const reset = () => {
    setCells(Array(GRID).fill('hidden'));
    setMinePositions(new Set());
    setOpened(0);
    setPhase('idle');
  };

  const safeCells = GRID - mines;
  const remainingSafe = safeCells - opened;

  return (
    <div className="space-y-4 animate-float-up">
      {/* Шапка */}
      <div className="flex items-center gap-3">
        <button onClick={onBack}
          className="w-10 h-10 rounded-xl glass flex items-center justify-center text-gold shrink-0">
          <Icon name="ArrowLeft" size={20} />
        </button>
        <div className="flex-1">
          <h2 className="font-display text-xl font-bold">Мины 💣</h2>
          <p className="text-xs text-muted-foreground">Открывай клетки, не попади на мину</p>
        </div>
        <button onClick={() => setMuted(m => !m)}
          className="w-9 h-9 glass rounded-xl flex items-center justify-center text-muted-foreground">
          <Icon name={muted ? 'VolumeX' : 'Volume2'} size={16} />
        </button>
      </div>

      {/* Панель ставки и настроек */}
      {phase === 'idle' && (
        <div className="glass rounded-2xl p-4 space-y-4">
          {/* Ставка */}
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Ставка</label>
            <div className="flex gap-2">
              <input
                type="number" min={1} max={balance} value={bet}
                onChange={e => setBet(Number(e.target.value))}
                className="flex-1 bg-background/50 border border-gold/20 rounded-xl px-3 py-2 text-center font-display font-bold gold-text text-lg focus:outline-none focus:border-gold/50"
              />
              <button onClick={() => setBet(Math.floor(bet / 2))}
                className="glass rounded-xl px-3 text-xs font-bold text-muted-foreground hover:text-gold transition-colors">½</button>
              <button onClick={() => setBet(Math.min(bet * 2, balance))}
                className="glass rounded-xl px-3 text-xs font-bold text-muted-foreground hover:text-gold transition-colors">×2</button>
              <button onClick={() => setBet(balance)}
                className="glass rounded-xl px-3 text-xs font-bold text-muted-foreground hover:text-gold transition-colors">Макс</button>
            </div>
          </div>

          {/* Количество мин */}
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Количество мин</label>
            <div className="grid grid-cols-6 gap-1.5">
              {MINE_OPTIONS.map(n => (
                <button key={n} onClick={() => setMines(n)}
                  className={`py-2 rounded-xl text-sm font-bold transition-all
                    ${mines === n ? 'gold-gradient text-background glow-gold' : 'glass text-muted-foreground hover:text-gold'}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          <Button onClick={startGame} disabled={bet > balance || bet <= 0}
            className="w-full gold-gradient text-background font-bold h-12 text-base glow-gold disabled:opacity-50">
            <Icon name="Bomb" size={18} className="mr-2" />
            Начать игру · {bet.toLocaleString('ru')} ₽
          </Button>
        </div>
      )}

      {/* Инфо во время игры */}
      {phase === 'playing' && (
        <div className="glass rounded-2xl p-4">
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-0.5">Ставка</div>
              <div className="font-display font-bold text-sm gold-text">{bet.toLocaleString('ru')} ₽</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-0.5">Множитель</div>
              <div className="font-display font-bold text-sm text-emerald-400">×{mult}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-0.5">Выигрыш</div>
              <div className="font-display font-bold text-sm text-emerald-400">{potential.toLocaleString('ru')} ₽</div>
            </div>
          </div>
          <Button onClick={cashout} disabled={opened === 0}
            className="w-full gold-gradient text-background font-bold h-11 glow-gold disabled:opacity-40">
            <Icon name="HandCoins" size={18} className="mr-2" />
            Забрать {opened > 0 ? `+${profit.toLocaleString('ru')} ₽` : '(открой хоть одну)'}
          </Button>
        </div>
      )}

      {/* Результат */}
      {(phase === 'won' || phase === 'lost') && (
        <div className={`rounded-2xl p-4 text-center space-y-2
          ${phase === 'won' ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
          <div className="text-3xl">{phase === 'won' ? '🎉' : '💥'}</div>
          <div className={`font-display font-bold text-xl ${phase === 'won' ? 'text-emerald-400' : 'text-red-400'}`}>
            {phase === 'won'
              ? `+${profit.toLocaleString('ru')} ₽ (×${calcMultiplier(opened, mines)})`
              : 'Мина! Ты потерял ставку'}
          </div>
          {phase === 'won' && <div className="text-xs text-muted-foreground">Открыто клеток: {opened}</div>}
          <Button onClick={reset}
            className="w-full gold-gradient text-background font-bold h-10 mt-1 glow-gold">
            Играть снова
          </Button>
        </div>
      )}

      {/* Поле 5×5 */}
      <div className="grid grid-cols-5 gap-2">
        {cells.map((cell, idx) => {
          const isMineCell = cell === 'mine';
          const isSafe = cell === 'safe';
          const isHidden = cell === 'hidden';
          const clickable = phase === 'playing' && isHidden;

          return (
            <button
              key={idx}
              onClick={() => clickable && openCell(idx)}
              disabled={!clickable}
              className={`
                aspect-square rounded-xl flex items-center justify-center text-xl font-bold
                transition-all duration-200 select-none
                ${isMineCell
                  ? 'bg-red-500/20 border-2 border-red-500/60 animate-win-pop'
                  : isSafe
                  ? 'bg-emerald-500/15 border-2 border-emerald-500/50 animate-win-pop'
                  : clickable
                  ? 'glass hover:border-gold/50 hover:bg-gold/8 active:scale-95 cursor-pointer'
                  : phase === 'lost' && minePositions.has(idx)
                  ? 'bg-red-500/15 border border-red-500/30'
                  : 'glass opacity-60'
                }
              `}
            >
              {isMineCell && '💣'}
              {isSafe && <Icon name="Gem" size={18} className="text-emerald-400" />}
              {isHidden && phase === 'lost' && minePositions.has(idx) && (
                <span className="opacity-40">💣</span>
              )}
              {isHidden && !minePositions.has(idx) && phase !== 'lost' && (
                <span className="text-muted-foreground/20 text-xs font-mono">
                  {clickable ? '' : ''}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Статус под полем */}
      {phase === 'playing' && (
        <div className="flex justify-between text-xs text-muted-foreground px-1">
          <span>💣 Мин: {mines}</span>
          <span>💎 Безопасных осталось: {remainingSafe}</span>
          <span>✅ Открыто: {opened}</span>
        </div>
      )}
    </div>
  );
}