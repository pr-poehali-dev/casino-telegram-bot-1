import { useState, useRef } from 'react';
import Icon from '@/components/ui/icon';

const GRID = 25;
const MINE_OPTIONS = [1, 3, 5, 10, 15, 20];

function calcMultiplier(opened: number, mines: number): number {
  if (opened === 0) return 1;
  let mult = 1;
  for (let i = 0; i < opened; i++) {
    const safe = GRID - mines;
    mult *= (safe - i) / (GRID - i);
    mult *= GRID / (GRID - mines);
  }
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
  const [bet, setBet] = useState(50);
  const [mines, setMines] = useState(3);
  const [phase, setPhase] = useState<Phase>('idle');
  const [cells, setCells] = useState<Cell[]>(Array(GRID).fill('hidden'));
  const [opened, setOpened] = useState(0);
  const [currentBet, setCurrentBet] = useState(0);
  const [currentMines, setCurrentMines] = useState(3);

  // Позиции мин хранятся в ref — без асинхронных проблем
  const mineSet = useRef<Set<number>>(new Set());

  const mult = calcMultiplier(opened, currentMines || mines);
  const potential = parseFloat((currentBet * mult).toFixed(2));
  const profit = parseFloat((potential - currentBet).toFixed(2));

  function startGame() {
    const b = Math.min(Math.max(1, bet), balance);
    if (b <= 0 || b > balance) return;

    // Генерируем мины
    const positions = new Set<number>();
    while (positions.size < mines) {
      positions.add(Math.floor(Math.random() * GRID));
    }
    mineSet.current = positions;

    onBalanceChange(-b);
    setCurrentBet(b);
    setCurrentMines(mines);
    setCells(Array(GRID).fill('hidden'));
    setOpened(0);
    setPhase('playing');
  }

  function openCell(idx: number) {
    if (phase !== 'playing') return;
    if (cells[idx] !== 'hidden') return;

    if (mineSet.current.has(idx)) {
      // Мина!
      const next = Array(GRID).fill('hidden') as Cell[];
      // Копируем текущие открытые
      cells.forEach((c, i) => { if (c === 'safe') next[i] = 'safe'; });
      // Показываем все мины
      mineSet.current.forEach(m => { next[m] = 'mine'; });
      setCells(next);
      setPhase('lost');
      onGameResult?.(currentBet, 0, false, { mines: currentMines, opened, hit: idx });
    } else {
      const newOpened = opened + 1;
      const next = [...cells] as Cell[];
      next[idx] = 'safe';
      setCells(next);
      setOpened(newOpened);

      if (newOpened === GRID - currentMines) {
        // Открыли все безопасные — победа
        const finalMult = calcMultiplier(newOpened, currentMines);
        const payout = parseFloat((currentBet * finalMult).toFixed(2));
        onBalanceChange(payout);
        setPhase('won');
        onGameResult?.(currentBet, payout, true, { mines: currentMines, opened: newOpened, mult: finalMult });
      }
    }
  }

  function cashout() {
    if (phase !== 'playing' || opened === 0) return;
    onBalanceChange(potential);
    setPhase('won');
    onGameResult?.(currentBet, potential, true, { mines: currentMines, opened, mult });
  }

  function reset() {
    mineSet.current = new Set();
    setCells(Array(GRID).fill('hidden'));
    setOpened(0);
    setPhase('idle');
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
          <h2 className="font-display text-xl font-bold">Мины 💣</h2>
          <p className="text-xs text-muted-foreground">Открывай клетки, не попади на мину</p>
        </div>
      </div>

      {/* Настройки — только в idle */}
      {phase === 'idle' && (
        <div className="glass rounded-2xl p-4 space-y-4">
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Ставка</label>
            <div className="flex gap-2">
              <input
                type="number" min={1} max={balance} value={bet}
                onChange={e => setBet(Math.max(1, Math.min(Number(e.target.value), balance)))}
                className="flex-1 bg-background/50 border border-gold/20 rounded-xl px-3 py-2 text-center font-display font-bold gold-text text-lg focus:outline-none focus:border-gold/50"
              />
              <button onClick={() => setBet(b => Math.max(1, Math.floor(b / 2)))}
                className="glass rounded-xl px-3 text-xs font-bold text-muted-foreground hover:text-gold transition-colors">½</button>
              <button onClick={() => setBet(b => Math.min(b * 2, balance))}
                className="glass rounded-xl px-3 text-xs font-bold text-muted-foreground hover:text-gold transition-colors">×2</button>
              <button onClick={() => setBet(balance)}
                className="glass rounded-xl px-3 text-xs font-bold text-muted-foreground hover:text-gold transition-colors">Макс</button>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">
              Количество мин <span className="text-gold">{mines}</span>
            </label>
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

          <button onClick={startGame}
            className="w-full gold-gradient text-background font-bold h-12 text-base rounded-xl glow-gold flex items-center justify-center gap-2">
            <Icon name="Bomb" size={18} />
            Начать игру · {bet.toLocaleString('ru')} ₽
          </button>
        </div>
      )}

      {/* Панель во время игры */}
      {phase === 'playing' && (
        <div className="glass rounded-2xl p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-0.5">Ставка</div>
              <div className="font-display font-bold text-sm gold-text">{currentBet.toLocaleString('ru')} ₽</div>
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
          <button onClick={cashout}
            className={`w-full font-bold h-11 rounded-xl flex items-center justify-center gap-2 transition-all
              ${opened === 0
                ? 'bg-white/5 text-muted-foreground cursor-not-allowed'
                : 'bg-emerald-500 hover:bg-emerald-400 text-background active:scale-95'}`}>
            <Icon name="HandCoins" size={18} />
            {opened === 0 ? 'Открой хоть одну клетку' : `Забрать +${profit.toLocaleString('ru')} ₽`}
          </button>
        </div>
      )}

      {/* Результат */}
      {(phase === 'won' || phase === 'lost') && (
        <div className={`rounded-2xl p-4 text-center space-y-2 border
          ${phase === 'won' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
          <div className="text-3xl">{phase === 'won' ? '🎉' : '💥'}</div>
          <div className={`font-display font-bold text-xl ${phase === 'won' ? 'text-emerald-400' : 'text-red-400'}`}>
            {phase === 'won'
              ? `+${profit.toLocaleString('ru')} ₽ (×${mult})`
              : 'Мина! Ты проиграл'}
          </div>
          {phase === 'won' && <div className="text-xs text-muted-foreground">Открыто: {opened} клеток</div>}
          <button onClick={reset}
            className="w-full gold-gradient text-background font-bold h-10 rounded-xl glow-gold">
            Играть снова
          </button>
        </div>
      )}

      {/* Поле 5×5 */}
      <div className="grid grid-cols-5 gap-2">
        {cells.map((cell, idx) => (
          <button
            key={idx}
            onClick={() => openCell(idx)}
            className={`
              aspect-square rounded-xl flex items-center justify-center text-xl
              transition-all duration-100 select-none border-2
              ${cell === 'mine'
                ? 'bg-red-500/25 border-red-500/70'
                : cell === 'safe'
                ? 'bg-emerald-500/20 border-emerald-500/60'
                : phase === 'playing'
                ? 'glass border-transparent hover:border-gold/60 hover:bg-gold/10 active:scale-95 cursor-pointer'
                : 'glass border-transparent opacity-40'
              }
            `}
          >
            {cell === 'mine' && '💣'}
            {cell === 'safe' && <Icon name="Gem" size={20} className="text-emerald-400" />}
          </button>
        ))}
      </div>

      {phase === 'playing' && (
        <div className="flex justify-between text-xs text-muted-foreground px-1">
          <span>💣 Мин: {currentMines}</span>
          <span>✅ Открыто: {opened}</span>
          <span>💎 Осталось: {GRID - currentMines - opened}</span>
        </div>
      )}
    </div>
  );
}
