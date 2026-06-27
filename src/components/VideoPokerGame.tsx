import { useState, useRef } from 'react';
import Icon from '@/components/ui/icon';

// ── Колода ──────────────────────────────────────────────────────────────────
const SUITS = ['♠', '♥', '♦', '♣'] as const;
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'] as const;
type Suit = typeof SUITS[number];
type Rank = typeof RANKS[number];
interface Card { suit: Suit; rank: Rank; value: number; }

function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS)
    for (let i = 0; i < RANKS.length; i++)
      deck.push({ suit, rank: RANKS[i], value: i + 2 });
  return deck;
}
function shuffle(deck: Card[]): Card[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// ── Комбинации ───────────────────────────────────────────────────────────────
interface Combo { name: string; mult: number; }

function evaluate(cards: Card[]): Combo {
  const values = cards.map(c => c.value).sort((a, b) => a - b);
  const suits  = cards.map(c => c.suit);
  const ranks  = cards.map(c => c.rank);

  const isFlush    = suits.every(s => s === suits[0]);
  const isStraight = (() => {
    const v = [...new Set(values)].sort((a, b) => a - b);
    if (v.length !== 5) return false;
    // A-2-3-4-5 (wheel)
    if (JSON.stringify(v) === JSON.stringify([2,3,4,5,14])) return true;
    return v[4] - v[0] === 4;
  })();

  const freq: Record<number, number> = {};
  values.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
  const counts = Object.values(freq).sort((a, b) => b - a);

  const hasAce = values.includes(14);
  const rankSet = new Set(ranks);

  // Royal Flush
  if (isFlush && isStraight && hasAce && values[0] === 10)
    return { name: 'Роял-флеш 👑', mult: 250 };
  // Straight Flush
  if (isFlush && isStraight)
    return { name: 'Стрит-флеш 🌈', mult: 50 };
  // Four of a Kind
  if (counts[0] === 4)
    return { name: 'Каре 💎', mult: 25 };
  // Full House
  if (counts[0] === 3 && counts[1] === 2)
    return { name: 'Фулл-хаус 🏠', mult: 9 };
  // Flush
  if (isFlush)
    return { name: 'Флеш 🌊', mult: 6 };
  // Straight
  if (isStraight)
    return { name: 'Стрит 📈', mult: 4 };
  // Three of a Kind
  if (counts[0] === 3)
    return { name: 'Тройка 🎯', mult: 3 };
  // Two Pair
  if (counts[0] === 2 && counts[1] === 2)
    return { name: 'Две пары ✌️', mult: 2 };
  // Jacks or Better
  const pairs = Object.entries(freq).filter(([, c]) => c === 2).map(([v]) => Number(v));
  if (pairs.some(v => v >= 11 || v === 14)) // J, Q, K, A
    return { name: 'Пара валетов+ 🃏', mult: 1 };

  return { name: 'Нет комбинации', mult: 0 };
}

// ── Цвет масти ───────────────────────────────────────────────────────────────
function suitColor(suit: Suit) {
  return suit === '♥' || suit === '♦' ? '#ef4444' : 'hsl(var(--foreground))';
}

// ── Web Audio ────────────────────────────────────────────────────────────────
function getCtx(): AudioContext | null {
  try {
    const C = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return C ? new C() : null;
  } catch { return null; }
}
function playDeal(ctx: AudioContext) {
  [0, 0.08, 0.16, 0.24, 0.32].forEach(t => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'triangle'; o.frequency.value = 600 + Math.random() * 200;
    g.gain.setValueAtTime(0.08, ctx.currentTime + t);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.07);
    o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.07);
  });
}
function playHold(ctx: AudioContext) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = 'sine'; o.frequency.value = 880;
  g.gain.setValueAtTime(0.1, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
  o.start(); o.stop(ctx.currentTime + 0.09);
}
function playWin(ctx: AudioContext, big: boolean) {
  const notes = big
    ? [523, 659, 784, 1047, 1319, 1568]
    : [523, 659, 784, 1047];
  notes.forEach((f, i) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = big && i % 2 === 0 ? 'triangle' : 'sine'; o.frequency.value = f;
    const t = ctx.currentTime + i * 0.09;
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    o.start(t); o.stop(t + 0.28);
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

// ── Карточка ─────────────────────────────────────────────────────────────────
function CardView({
  card, held, flipped, onClick, delay,
}: {
  card: Card | null; held: boolean; flipped: boolean; onClick?: () => void; delay: number;
}) {
  const isRed = card && (card.suit === '♥' || card.suit === '♦');
  return (
    <div
      onClick={onClick}
      className="relative select-none"
      style={{ perspective: 600 }}
    >
      {/* Флип-обёртка */}
      <div
        className="relative transition-transform"
        style={{
          transformStyle: 'preserve-3d',
          transform: flipped ? 'rotateY(0deg)' : 'rotateY(90deg)',
          transitionDuration: '220ms',
          transitionDelay: `${delay}ms`,
          width: 56, height: 80,
        }}
      >
        {/* Лицо карты */}
        <div
          className={`absolute inset-0 rounded-xl flex flex-col justify-between p-1.5 cursor-pointer
            transition-all duration-150 select-none
            ${held
              ? 'border-2 border-gold shadow-[0_0_12px_hsl(43_74%_52%/0.6)]'
              : 'border border-white/10 hover:border-white/30'
            }`}
          style={{
            background: 'linear-gradient(145deg, #ffffff, #f0f0f0)',
            backfaceVisibility: 'hidden',
          }}
        >
          {card && (
            <>
              <div className="flex flex-col items-start leading-none">
                <span className="text-xs font-bold" style={{ color: isRed ? '#ef4444' : '#1a1a2e', fontSize: 11 }}>
                  {card.rank}
                </span>
                <span style={{ color: isRed ? '#ef4444' : '#1a1a2e', fontSize: 10, lineHeight: 1 }}>
                  {card.suit}
                </span>
              </div>
              <div className="text-center font-bold" style={{ color: isRed ? '#ef4444' : '#1a1a2e', fontSize: 20, lineHeight: 1 }}>
                {card.suit}
              </div>
              <div className="flex flex-col items-end leading-none rotate-180">
                <span className="text-xs font-bold" style={{ color: isRed ? '#ef4444' : '#1a1a2e', fontSize: 11 }}>
                  {card.rank}
                </span>
                <span style={{ color: isRed ? '#ef4444' : '#1a1a2e', fontSize: 10, lineHeight: 1 }}>
                  {card.suit}
                </span>
              </div>
            </>
          )}
          {/* Метка HOLD */}
          {held && (
            <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-gold tracking-widest">
              HOLD
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Рубашка (placeholder пока карта не сдана) ─────────────────────────────
function CardBack() {
  return (
    <div className="rounded-xl border border-gold/20" style={{ width: 56, height: 80, background: 'linear-gradient(135deg, #1a1a3e, #2a1a4e)' }}>
      <div className="w-full h-full rounded-xl flex items-center justify-center opacity-30">
        <span style={{ fontSize: 24 }}>🂠</span>
      </div>
    </div>
  );
}

// ── Таблица выплат ────────────────────────────────────────────────────────────
const PAYTABLE: { name: string; mult: number }[] = [
  { name: 'Роял-флеш',      mult: 250 },
  { name: 'Стрит-флеш',     mult: 50  },
  { name: 'Каре',           mult: 25  },
  { name: 'Фулл-хаус',      mult: 9   },
  { name: 'Флеш',           mult: 6   },
  { name: 'Стрит',          mult: 4   },
  { name: 'Тройка',         mult: 3   },
  { name: 'Две пары',       mult: 2   },
  { name: 'Пара валетов+',  mult: 1   },
];

// ── Главный компонент ─────────────────────────────────────────────────────────
type Phase = 'idle' | 'dealt' | 'result';

export default function VideoPokerGame({
  balance, onBalanceChange, onBack, onGameResult,
}: {
  balance: number;
  onBalanceChange: (delta: number) => void;
  onBack: () => void;
  onGameResult?: (bet: number, result: number, isWin: boolean, details: object) => void;
}) {
  const [bet, setBet]           = useState(100);
  const [phase, setPhase]       = useState<Phase>('idle');
  const [hand, setHand]         = useState<Card[]>([]);
  const [held, setHeld]         = useState<boolean[]>([false,false,false,false,false]);
  const [flipped, setFlipped]   = useState<boolean[]>([false,false,false,false,false]);
  const [combo, setCombo]       = useState<Combo | null>(null);
  const [payout, setPayout]     = useState(0);
  const [muted, setMuted]       = useState(false);
  const [showPay, setShowPay]   = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const deckRef = useRef<Card[]>([]);

  function audio() {
    if (muted) return null;
    if (!ctxRef.current) ctxRef.current = getCtx();
    return ctxRef.current;
  }

  // Первая раздача
  function deal() {
    if (phase !== 'idle') return;
    const b = Math.max(1, Math.min(bet, balance));
    onBalanceChange(-b);

    deckRef.current = shuffle(makeDeck());
    const newHand = deckRef.current.splice(0, 5);
    setHand(newHand);
    setHeld([false,false,false,false,false]);
    setFlipped([false,false,false,false,false]);
    setCombo(null);
    setPayout(0);
    setPhase('dealt');

    // Анимация переворота по одной карте
    const ctx = audio(); if (ctx) playDeal(ctx);
    [0,1,2,3,4].forEach(i => {
      setTimeout(() => setFlipped(f => { const n=[...f]; n[i]=true; return n; }), i * 120 + 50);
    });
  }

  // Переключить hold
  function toggleHold(i: number) {
    if (phase !== 'dealt') return;
    const ctx = audio(); if (ctx) playHold(ctx);
    setHeld(h => { const n=[...h]; n[i]=!n[i]; return n; });
  }

  // Дроу (замена незафиксированных карт)
  function draw() {
    if (phase !== 'dealt') return;

    // Скрываем незафиксированные
    setFlipped(held.map(h => h));

    setTimeout(() => {
      const newHand = hand.map((c, i) => {
        if (held[i]) return c;
        return deckRef.current.splice(0, 1)[0] || c;
      });
      setHand(newHand);

      // Переворачиваем новые карты
      setTimeout(() => {
        const ctx = audio(); if (ctx) playDeal(ctx);
        setFlipped([true,true,true,true,true]);
      }, 80);

      // Оцениваем комбинацию
      setTimeout(() => {
        const result = evaluate(newHand);
        const win = parseFloat((bet * result.mult).toFixed(2));
        setCombo(result);
        setPayout(win);
        setPhase('result');

        if (win > 0) {
          onBalanceChange(win);
          const ctx = audio();
          if (ctx) playWin(ctx, result.mult >= 9);
        } else {
          const ctx = audio(); if (ctx) playLose(ctx);
        }
        onGameResult?.(bet, win, win > 0, { combo: result.name, mult: result.mult });
      }, 400);
    }, 220);
  }

  // Новая игра
  function reset() {
    setPhase('idle');
    setHand([]);
    setHeld([false,false,false,false,false]);
    setFlipped([false,false,false,false,false]);
    setCombo(null);
    setPayout(0);
  }

  const parsedBet = Math.max(1, Math.min(bet, balance));
  const PRESETS = [50, 100, 250, 500, 1000].filter(v => v <= balance);
  const isWin = combo ? combo.mult > 0 : false;
  const isBig = combo ? combo.mult >= 9 : false;

  return (
    <div className="space-y-4 animate-float-up">

      {/* Шапка */}
      <div className="flex items-center gap-3">
        <button onClick={onBack}
          className="w-10 h-10 rounded-xl glass flex items-center justify-center text-gold shrink-0">
          <Icon name="ArrowLeft" size={20} />
        </button>
        <div className="flex-1">
          <h2 className="font-display text-xl font-bold">Видеопокер 🃏</h2>
          <p className="text-xs text-muted-foreground">Держи нужные карты — меняй остальные</p>
        </div>
        <button onClick={() => setShowPay(p => !p)}
          className="w-10 h-10 rounded-xl glass flex items-center justify-center text-muted-foreground hover:text-gold transition-colors shrink-0">
          <Icon name="List" size={18} />
        </button>
        <button onClick={() => setMuted(m => !m)}
          className="w-10 h-10 rounded-xl glass flex items-center justify-center text-muted-foreground hover:text-gold transition-colors shrink-0">
          <Icon name={muted ? 'VolumeX' : 'Volume2'} size={18} />
        </button>
      </div>

      {/* Таблица выплат (раскрывается) */}
      {showPay && (
        <div className="glass rounded-2xl p-4 animate-float-up">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Таблица выплат</p>
          <div className="space-y-1.5">
            {PAYTABLE.map(row => (
              <div key={row.name} className={`flex justify-between items-center text-sm px-2 py-1 rounded-lg
                ${combo?.name.startsWith(row.name.split(' ')[0]) && phase === 'result' ? 'bg-gold/15 border border-gold/30' : ''}`}>
                <span className="text-muted-foreground">{row.name}</span>
                <span className="font-display font-bold gold-text">×{row.mult}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Карты */}
      <div className="glass rounded-2xl p-5">
        <div className="flex justify-center gap-2 mb-6 mt-1">
          {phase === 'idle'
            ? [0,1,2,3,4].map(i => <CardBack key={i} />)
            : hand.map((card, i) => (
                <CardView
                  key={i}
                  card={card}
                  held={held[i]}
                  flipped={flipped[i]}
                  delay={0}
                  onClick={() => toggleHold(i)}
                />
              ))
          }
        </div>

        {/* Результат комбинации */}
        <div className="h-10 flex items-center justify-center">
          {phase === 'result' && combo && (
            <div className={`animate-win-pop text-center px-4 py-1.5 rounded-xl font-display font-bold text-lg
              ${isBig ? 'gold-text glow-gold bg-gold/10' : isWin ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'}`}>
              {combo.name}
              {isWin && <span className="ml-2 text-base">+{payout.toLocaleString('ru')} ₽</span>}
            </div>
          )}
          {phase === 'dealt' && (
            <p className="text-xs text-muted-foreground">Нажми на карту чтобы оставить • затем «Заменить»</p>
          )}
          {phase === 'idle' && (
            <p className="text-xs text-muted-foreground">Нажми «Раздать» чтобы начать</p>
          )}
        </div>
      </div>

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

      {/* Кнопки действий */}
      {phase === 'idle' && (
        <button onClick={deal} disabled={parsedBet > balance}
          className="w-full h-14 rounded-2xl font-display font-bold text-xl gold-gradient text-background glow-gold disabled:opacity-50 flex items-center justify-center gap-3">
          <Icon name="Shuffle" size={22} /> Раздать карты
        </button>
      )}

      {phase === 'dealt' && (
        <div className="space-y-3">
          {/* Подсказка по hold */}
          <div className="glass rounded-xl px-4 py-2.5 flex items-center gap-2 text-xs text-muted-foreground">
            <Icon name="Info" size={14} className="text-gold shrink-0" />
            Тапни по картам чтобы оставить их (HOLD), остальные будут заменены
          </div>

          {/* Быстрый hold-all / fold */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setHeld([true,true,true,true,true])}
              className="glass rounded-xl py-2.5 text-sm font-semibold text-muted-foreground hover:text-gold transition-colors flex items-center justify-center gap-1.5">
              <Icon name="Lock" size={14} /> Оставить всё
            </button>
            <button onClick={() => setHeld([false,false,false,false,false])}
              className="glass rounded-xl py-2.5 text-sm font-semibold text-muted-foreground hover:text-red-400 transition-colors flex items-center justify-center gap-1.5">
              <Icon name="Trash2" size={14} /> Сбросить всё
            </button>
          </div>

          <button onClick={draw}
            className="w-full h-14 rounded-2xl font-display font-bold text-xl flex items-center justify-center gap-3"
            style={{ background: 'linear-gradient(135deg, hsl(var(--emerald)), hsl(158 50% 35%))', color: 'white' }}>
            <Icon name="RefreshCw" size={22} /> Заменить карты
          </button>
        </div>
      )}

      {phase === 'result' && (
        <button onClick={reset}
          className="w-full h-14 rounded-2xl font-display font-bold text-xl gold-gradient text-background glow-gold flex items-center justify-center gap-3">
          <Icon name="RotateCcw" size={22} /> Новая игра
        </button>
      )}
    </div>
  );
}
