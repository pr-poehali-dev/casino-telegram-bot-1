import { useState, useRef } from 'react';
import Icon from '@/components/ui/icon';

const GRID = 25;
const MINE_OPTIONS = [1, 3, 5, 10, 15, 20];

// ── Web Audio ──
type AC = AudioContext;
function getCtx(): AC | null {
  try {
    const C = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return C ? new C() : null;
  } catch { return null; }
}
function playClick(ctx: AC) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.frequency.value = 600; o.type = 'sine';
  g.gain.setValueAtTime(0.08, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
  o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.06);
}
function playSafe(ctx: AC, mult: number) {
  // Короткий приятный «пинг» — тем выше, чем больше множитель
  const freq = Math.min(400 + mult * 80, 1200);
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(0.15, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
  o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.18);
}
function playMine(ctx: AC) {
  // Резкий взрыв — белый шум + низкий бум
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.5, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
  src.connect(g); g.connect(ctx.destination); src.start();

  // Низкий бум
  const o = ctx.createOscillator(); const g2 = ctx.createGain();
  o.connect(g2); g2.connect(ctx.destination);
  o.type = 'sawtooth'; o.frequency.setValueAtTime(120, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.3);
  g2.gain.setValueAtTime(0.4, ctx.currentTime);
  g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
  o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.3);
}
function playCashout(ctx: AC) {
  // Восходящий аккорд — забрал деньги!
  const notes = [523, 659, 784, 1047];
  notes.forEach((freq, i) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; o.frequency.value = freq;
    const t = ctx.currentTime + i * 0.08;
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.start(t); o.stop(t + 0.25);
  });
}
function playJackpot(ctx: AC) {
  // Все клетки открыты — большой джекпот!
  const notes = [523, 659, 784, 1047, 1319, 1568];
  notes.forEach((freq, i) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = i % 2 === 0 ? 'sine' : 'triangle'; o.frequency.value = freq;
    const t = ctx.currentTime + i * 0.07;
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.start(t); o.stop(t + 0.3);
  });
}

function calcMultiplier(opened: number, mines: number): number {
  if (opened === 0) return 1;
  const safe = GRID - mines;
  let probability = 1;
  for (let i = 0; i < opened; i++) {
    probability *= (safe - i) / (GRID - i);
  }
  if (probability <= 0) return 1;
  const mult = 0.95 / probability;
  return Math.max(1, parseFloat(mult.toFixed(2)));
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
  const ctxRef = useRef<AudioContext | null>(null);
  const [muted, setMuted] = useState(false);
  function audio() {
    if (muted) return null;
    if (!ctxRef.current) ctxRef.current = getCtx();
    return ctxRef.current;
  }

  const mult = calcMultiplier(opened, currentMines || mines);
  const potential = parseFloat((currentBet * mult).toFixed(2));
  const profit = parseFloat((potential - currentBet).toFixed(2));

  function startGame() {
    const b = Math.min(Math.max(1, bet), balance);
    if (b <= 0 || b > balance) return;

    const ctx = audio(); if (ctx) playClick(ctx);

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
      const ctx = audio(); if (ctx) playMine(ctx);
      const next = Array(GRID).fill('hidden') as Cell[];
      cells.forEach((c, i) => { if (c === 'safe') next[i] = 'safe'; });
      mineSet.current.forEach(m => { next[m] = 'mine'; });
      setCells(next);
      setPhase('lost');
      onGameResult?.(currentBet, 0, false, { mines: currentMines, opened, hit: idx });
    } else {
      const newOpened = opened + 1;
      const nextMult = calcMultiplier(newOpened, currentMines || mines);
      const ctx = audio();

      const next = [...cells] as Cell[];
      next[idx] = 'safe';
      setCells(next);
      setOpened(newOpened);

      if (newOpened === GRID - currentMines) {
        // Все клетки открыты — джекпот!
        if (ctx) playJackpot(ctx);
        const finalMult = calcMultiplier(newOpened, currentMines);
        const payout = parseFloat((currentBet * finalMult).toFixed(2));
        onBalanceChange(payout);
        setPhase('won');
        onGameResult?.(currentBet, payout, true, { mines: currentMines, opened: newOpened, mult: finalMult });
      } else {
        if (ctx) playSafe(ctx, nextMult);
      }
    }
  }

  function cashout() {
    if (phase !== 'playing' || opened === 0) return;
    const ctx = audio(); if (ctx) playCashout(ctx);
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
        <button onClick={() => setMuted(m => !m)}
          className="w-10 h-10 rounded-xl glass flex items-center justify-center text-muted-foreground hover:text-gold transition-colors shrink-0">
          <Icon name={muted ? 'VolumeX' : 'Volume2'} size={18} />
        </button>
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

          <button onClick={startGame} disabled={bet > balance || balance <= 0}
            className="w-full gold-gradient text-background font-bold h-12 text-base rounded-xl glow-gold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
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