import { useState, useRef } from 'react';
import Icon from '@/components/ui/icon';

// ── Колода ───────────────────────────────────────────────────────────────────
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'] as const;
const SUITS = ['♠','♥','♦','♣'] as const;
type Rank = typeof RANKS[number];
type Suit = typeof SUITS[number];
interface Card { rank: Rank; suit: Suit; value: number; }

function makeDeck(): Card[] {
  const d: Card[] = [];
  for (const suit of SUITS)
    for (let i = 0; i < RANKS.length; i++)
      d.push({ rank: RANKS[i], suit, value: i + 2 }); // 2–14
  return d;
}
function shuffle(deck: Card[]): Card[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// ── Шансы и коэффициент ──────────────────────────────────────────────────────
// deck — оставшиеся карты, current — текущее значение
function calcOdds(deck: Card[], current: number, guess: 'hi' | 'lo' | 'eq') {
  const n = deck.length;
  if (n === 0) return { odds: 1, pct: 0 };
  if (guess === 'hi') {
    const higher = deck.filter(c => c.value > current).length;
    const pct = higher / n;
    const odds = pct > 0 ? Math.min(+(0.95 / pct).toFixed(2), 12) : 0;
    return { odds, pct };
  }
  if (guess === 'lo') {
    const lower = deck.filter(c => c.value < current).length;
    const pct = lower / n;
    const odds = pct > 0 ? Math.min(+(0.95 / pct).toFixed(2), 12) : 0;
    return { odds, pct };
  }
  // equal
  const eq = deck.filter(c => c.value === current).length;
  const pct = eq / n;
  const odds = pct > 0 ? Math.min(+(0.95 / pct).toFixed(2), 30) : 0;
  return { odds, pct };
}

// ── Карточка ─────────────────────────────────────────────────────────────────
function CardView({ card, flipped, small }: { card: Card; flipped: boolean; small?: boolean }) {
  const isRed = card.suit === '♥' || card.suit === '♦';
  const w = small ? 52 : 68, h = small ? 74 : 96;
  return (
    <div style={{ perspective: 500 }}>
      <div style={{
        width: w, height: h,
        transformStyle: 'preserve-3d',
        transform: flipped ? 'rotateY(0deg)' : 'rotateY(90deg)',
        transition: 'transform 220ms ease',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          backfaceVisibility: 'hidden',
          background: 'linear-gradient(145deg,#ffffff,#f0f0f0)',
          borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.15)',
          padding: '5px 6px',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        }}>
          <div style={{ color: isRed ? '#ef4444' : '#1a1a2e', fontSize: small ? 10 : 12, fontWeight: 700, lineHeight: 1 }}>
            {card.rank}<br />{card.suit}
          </div>
          <div style={{ color: isRed ? '#ef4444' : '#1a1a2e', fontSize: small ? 18 : 26, textAlign: 'center', fontWeight: 700 }}>
            {card.suit}
          </div>
          <div style={{ color: isRed ? '#ef4444' : '#1a1a2e', fontSize: small ? 10 : 12, fontWeight: 700, lineHeight: 1, transform: 'rotate(180deg)' }}>
            {card.rank}<br />{card.suit}
          </div>
        </div>
      </div>
    </div>
  );
}

function CardBack({ small }: { small?: boolean }) {
  const w = small ? 52 : 68, h = small ? 74 : 96;
  return (
    <div style={{
      width: w, height: h, borderRadius: 10,
      background: 'linear-gradient(135deg,#1a1a3e,#2a1a4e)',
      border: '1px solid rgba(245,200,66,0.2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 24, opacity: 0.7,
    }}>🂠</div>
  );
}

// ── Web Audio ─────────────────────────────────────────────────────────────────
function getCtx(): AudioContext | null {
  try {
    const C = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return C ? new C() : null;
  } catch { return null; }
}
function playFlip(ctx: AudioContext) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = 'triangle'; o.frequency.value = 700 + Math.random() * 200;
  g.gain.setValueAtTime(0.09, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
  o.start(); o.stop(ctx.currentTime + 0.08);
}
function playCorrect(ctx: AudioContext, big: boolean) {
  const notes = big ? [523,659,784,1047,1319] : [523,659,784];
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
function playWrong(ctx: AudioContext) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(280, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.4);
  g.gain.setValueAtTime(0.18, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
  o.start(); o.stop(ctx.currentTime + 0.4);
}
function playCashout(ctx: AudioContext) {
  [523,659,784,1047].forEach((f, i) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; o.frequency.value = f;
    const t = ctx.currentTime + i * 0.08;
    g.gain.setValueAtTime(0.13, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.start(t); o.stop(t + 0.2);
  });
}

// ── Константы ────────────────────────────────────────────────────────────────
const MAX_STREAK = 8; // максимум угадываний за раунд

type Phase = 'idle' | 'playing' | 'result';
type GuessResult = 'correct' | 'wrong';

export default function HiLoGame({
  balance, onBalanceChange, onBack, onGameResult,
}: {
  balance: number;
  onBalanceChange: (delta: number) => void;
  onBack: () => void;
  onGameResult?: (bet: number, result: number, isWin: boolean, details: object) => void;
}) {
  const [bet, setBet]           = useState(100);
  const [phase, setPhase]       = useState<Phase>('idle');
  const [deck, setDeck]         = useState<Card[]>([]);
  const [current, setCurrent]   = useState<Card | null>(null);
  const [next, setNext]         = useState<Card | null>(null);
  const [nextFlipped, setNF]    = useState(false);
  const [streak, setStreak]     = useState(0);
  const [multiplier, setMult]   = useState(1);
  const [lastResult, setLR]     = useState<GuessResult | null>(null);
  const [history, setHistory]   = useState<{ card: Card; guess: 'hi'|'lo'|'eq'; ok: boolean }[]>([]);
  const [payout, setPayout]     = useState(0);
  const [endReason, setEndReason] = useState<'cashout'|'wrong'|'max'|null>(null);
  const [muted, setMuted]       = useState(false);
  const [animating, setAnimating] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const betRef = useRef(100);

  function audio() {
    if (muted) return null;
    if (!ctxRef.current) ctxRef.current = getCtx();
    return ctxRef.current;
  }

  // Стартуем — тянем первую карту
  function startGame() {
    const b = Math.max(1, Math.min(bet, balance));
    betRef.current = b;
    onBalanceChange(-b);

    const d = shuffle(makeDeck());
    const first = d.shift()!;
    setDeck(d);
    setCurrent(first);
    setNext(null);
    setNF(false);
    setStreak(0);
    setMult(1);
    setHistory([]);
    setLR(null);
    setPayout(0);
    setEndReason(null);
    setPhase('playing');
  }

  // Сделать ставку
  function guess(g: 'hi' | 'lo' | 'eq') {
    if (phase !== 'playing' || !current || animating) return;
    setAnimating(true);

    const d = [...deck];
    const nextCard = d.shift()!;
    setDeck(d);
    setNext(nextCard);
    setNF(false);

    // Показываем карту через flip
    setTimeout(() => {
      setNF(true);
      const ctx = audio(); if (ctx) playFlip(ctx);

      setTimeout(() => {
        const correct =
          (g === 'hi' && nextCard.value > current.value) ||
          (g === 'lo' && nextCard.value < current.value) ||
          (g === 'eq' && nextCard.value === current.value);

        const { odds } = calcOdds(deck, current.value, g);
        const newMult = correct ? parseFloat((multiplier * odds).toFixed(2)) : multiplier;

        if (correct) {
          const ctx = audio();
          const newStreak = streak + 1;
          setStreak(newStreak);
          setMult(newMult);
          setLR('correct');
          setHistory(h => [...h, { card: nextCard, guess: g, ok: true }]);
          if (ctx) playCorrect(ctx, odds >= 3);

          if (newStreak >= MAX_STREAK || d.length === 0) {
            // Автоматический кэшаут при максимальной серии
            const win = parseFloat((betRef.current * newMult).toFixed(2));
            setPayout(win);
            onBalanceChange(win);
            onGameResult?.(betRef.current, win, true, { streak: newStreak, mult: newMult, reason: 'max' });
            setEndReason('max');
            setPhase('result');
          }
        } else {
          const ctx = audio(); if (ctx) playWrong(ctx);
          setLR('wrong');
          setHistory(h => [...h, { card: nextCard, guess: g, ok: false }]);
          onGameResult?.(betRef.current, 0, false, { streak, mult: multiplier, reason: 'wrong' });
          setEndReason('wrong');
          setPhase('result');
        }

        setCurrent(nextCard);
        setNext(null);
        setNF(false);
        setAnimating(false);
      }, 350);
    }, 80);
  }

  // Забрать выигрыш
  function cashout() {
    if (phase !== 'playing' || streak === 0) return;
    const ctx = audio(); if (ctx) playCashout(ctx);
    const win = parseFloat((betRef.current * multiplier).toFixed(2));
    setPayout(win);
    onBalanceChange(win);
    onGameResult?.(betRef.current, win, true, { streak, mult: multiplier, reason: 'cashout' });
    setEndReason('cashout');
    setPhase('result');
  }

  function reset() {
    setPhase('idle');
    setCurrent(null);
    setNext(null);
    setStreak(0);
    setMult(1);
    setHistory([]);
    setLR(null);
    setEndReason(null);
    setPayout(0);
  }

  const parsedBet = Math.max(1, Math.min(bet, balance));
  const PRESETS = [50, 100, 250, 500, 1000].filter(v => v <= balance);

  // Шансы для текущей карты
  const hiOdds = current ? calcOdds(deck, current.value, 'hi') : null;
  const loOdds = current ? calcOdds(deck, current.value, 'lo') : null;
  const eqOdds = current ? calcOdds(deck, current.value, 'eq') : null;

  const rankLabel = (r: Rank) =>
    r === 'A' ? 'Туз' : r === 'K' ? 'Король' : r === 'Q' ? 'Дама' : r === 'J' ? 'Валет' : r;

  return (
    <div className="space-y-4 animate-float-up">

      {/* Шапка */}
      <div className="flex items-center gap-3">
        <button onClick={onBack}
          className="w-10 h-10 rounded-xl glass flex items-center justify-center text-gold shrink-0">
          <Icon name="ArrowLeft" size={20} />
        </button>
        <div className="flex-1">
          <h2 className="font-display text-xl font-bold">Hi-Lo 🎴</h2>
          <p className="text-xs text-muted-foreground">Угадай — следующая выше или ниже?</p>
        </div>
        <button onClick={() => setMuted(m => !m)}
          className="w-10 h-10 rounded-xl glass flex items-center justify-center text-muted-foreground hover:text-gold transition-colors shrink-0">
          <Icon name={muted ? 'VolumeX' : 'Volume2'} size={18} />
        </button>
      </div>

      {/* Игровая зона */}
      <div className="glass rounded-2xl p-5 space-y-4">

        {/* Серия и множитель */}
        {phase === 'playing' && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {Array.from({ length: MAX_STREAK }).map((_, i) => (
                  <div key={i} className={`w-5 h-2 rounded-full transition-all ${
                    i < streak ? 'bg-gold glow-gold' : 'bg-white/10'
                  }`} />
                ))}
              </div>
              <span className="text-xs text-muted-foreground">{streak}/{MAX_STREAK}</span>
            </div>
            <div className="text-right">
              <div className="font-display font-bold text-lg gold-text">×{multiplier.toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">
                {(betRef.current * multiplier).toLocaleString('ru')} ₽
              </div>
            </div>
          </div>
        )}

        {/* Карты */}
        <div className="flex items-center justify-center gap-6">
          {/* История последних 3 карт */}
          <div className="flex gap-1.5 items-end">
            {history.slice(-3).map((h, i) => (
              <div key={i} className="relative">
                <CardView card={h.card} flipped small />
                <div className={`absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px]
                  ${h.ok ? 'bg-emerald-500' : 'bg-red-500'}`}>
                  {h.ok ? '✓' : '✗'}
                </div>
              </div>
            ))}
          </div>

          {/* Текущая карта (большая) */}
          <div className="flex flex-col items-center gap-2">
            {phase === 'idle'
              ? <CardBack />
              : current
                ? <div className="relative">
                    <CardView card={current} flipped />
                    {lastResult && (
                      <div className={`absolute -top-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shadow-lg
                        ${lastResult === 'correct' ? 'bg-emerald-500' : 'bg-red-500'}`}>
                        {lastResult === 'correct' ? '✓' : '✗'}
                      </div>
                    )}
                  </div>
                : <CardBack />
            }
            {current && phase === 'playing' && (
              <p className="text-xs text-muted-foreground">{rankLabel(current.rank)}</p>
            )}
          </div>

          {/* Следующая карта (рубашка) */}
          <div className="flex flex-col items-center gap-2">
            {next && nextFlipped
              ? <CardView card={next} flipped />
              : <CardBack />
            }
            <p className="text-xs text-muted-foreground opacity-50">?</p>
          </div>
        </div>

        {/* Вероятности */}
        {phase === 'playing' && current && (
          <div className="grid grid-cols-3 gap-2 text-center text-xs text-muted-foreground">
            <div>
              <div className="font-bold text-emerald-400">{loOdds ? Math.round(loOdds.pct * 100) : 0}%</div>
              <div>ниже</div>
            </div>
            <div>
              <div className="font-bold text-gold">{eqOdds ? Math.round(eqOdds.pct * 100) : 0}%</div>
              <div>равно</div>
            </div>
            <div>
              <div className="font-bold text-emerald-400">{hiOdds ? Math.round(hiOdds.pct * 100) : 0}%</div>
              <div>выше</div>
            </div>
          </div>
        )}
      </div>

      {/* Результат */}
      {phase === 'result' && (
        <div className={`animate-win-pop glass rounded-2xl p-5 text-center border ${
          endReason === 'wrong'
            ? 'border-red-500/30 bg-red-500/5'
            : 'border-gold/30 bg-gold/5'
        }`}>
          {endReason === 'wrong' ? (
            <>
              <p className="font-display text-2xl font-bold text-red-400">Не угадал 😢</p>
              <p className="text-sm text-muted-foreground mt-1">Серия {streak} • Ставка сгорела</p>
            </>
          ) : (
            <>
              <p className="font-display text-2xl font-bold gold-text">
                {endReason === 'max' ? '🏆 Максимум!' : '💰 Забрал!'}
              </p>
              <p className="text-3xl font-display font-bold text-emerald-400 mt-1">
                +{payout.toLocaleString('ru')} ₽
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Серия {streak} • Множитель ×{multiplier.toFixed(2)}
              </p>
            </>
          )}
        </div>
      )}

      {/* Кнопки угадывания */}
      {phase === 'playing' && !animating && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3">
            {/* ВЫШЕ */}
            <button onClick={() => guess('hi')}
              className="h-16 rounded-2xl font-display font-bold text-lg flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95"
              style={{ background: 'linear-gradient(135deg,#065f46,#059669)', color: 'white', boxShadow: '0 0 20px #05966940' }}>
              <div className="flex items-center gap-2">
                <Icon name="ChevronUp" size={24} />
                <span>ВЫШЕ</span>
              </div>
              {hiOdds && <span className="text-xs opacity-75 font-normal">×{hiOdds.odds.toFixed(2)}</span>}
            </button>

            {/* НИЖЕ */}
            <button onClick={() => guess('lo')}
              className="h-16 rounded-2xl font-display font-bold text-lg flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95"
              style={{ background: 'linear-gradient(135deg,#7f1d1d,#dc2626)', color: 'white', boxShadow: '0 0 20px #dc262640' }}>
              <div className="flex items-center gap-2">
                <Icon name="ChevronDown" size={24} />
                <span>НИЖЕ</span>
              </div>
              {loOdds && <span className="text-xs opacity-75 font-normal">×{loOdds.odds.toFixed(2)}</span>}
            </button>
          </div>

          {/* РАВНО + КЭШАУТ */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => guess('eq')}
              className="h-12 rounded-2xl font-semibold text-sm glass text-muted-foreground hover:text-gold transition-colors flex items-center justify-center gap-2">
              <Icon name="Equal" size={16} />
              Равно
              {eqOdds && <span className="text-xs opacity-60">×{eqOdds.odds.toFixed(1)}</span>}
            </button>
            <button onClick={cashout} disabled={streak === 0}
              className="h-12 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-30
                gold-gradient text-background glow-gold">
              <Icon name="HandCoins" size={16} />
              Забрать {streak > 0 ? `${(betRef.current * multiplier).toLocaleString('ru')} ₽` : ''}
            </button>
          </div>
        </div>
      )}

      {/* Анимация угадывания */}
      {phase === 'playing' && animating && (
        <div className="flex justify-center py-6">
          <Icon name="Loader" size={32} className="animate-spin text-gold" />
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
        <button onClick={startGame} disabled={parsedBet > balance}
          className="w-full h-14 rounded-2xl font-display font-bold text-xl gold-gradient text-background glow-gold disabled:opacity-50 flex items-center justify-center gap-3">
          <Icon name="Shuffle" size={22} /> Раздать карту
        </button>
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
          Угадывай серию до {MAX_STREAK} карт подряд. Каждое угадывание множит ставку. Забери деньги в любой момент — или рискни дальше!
        </div>
      )}
    </div>
  );
}