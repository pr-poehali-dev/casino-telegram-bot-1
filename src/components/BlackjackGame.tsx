import { useState, useRef, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';

// ─── Deck ─────────────────────────────────────────────────────────────────────
const SUITS = ['♠', '♥', '♦', '♣'] as const;
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
type Suit = typeof SUITS[number];
type Rank = typeof RANKS[number];
type Card = { suit: Suit; rank: Rank; hidden?: boolean };

function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ suit, rank });
  // shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function cardValue(rank: Rank): number {
  if (rank === 'A') return 11;
  if (['J', 'Q', 'K'].includes(rank)) return 10;
  return parseInt(rank);
}

function handTotal(cards: Card[]): number {
  let total = 0; let aces = 0;
  for (const c of cards) {
    if (c.hidden) continue;
    total += cardValue(c.rank);
    if (c.rank === 'A') aces++;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function isBust(cards: Card[]) { return handTotal(cards) > 21; }
function isBlackjack(cards: Card[]) { return cards.length === 2 && handTotal(cards) === 21; }

const isRed = (suit: Suit) => suit === '♥' || suit === '♦';

// ─── Web Audio ────────────────────────────────────────────────────────────────
function getCtx(): AudioContext | null {
  try {
    type WA = typeof window & { webkitAudioContext?: typeof AudioContext };
    const Ctor = window.AudioContext || (window as WA).webkitAudioContext;
    return Ctor ? new Ctor() : null;
  } catch { return null; }
}
function ensureCtx(ref: React.MutableRefObject<AudioContext | null>) {
  if (!ref.current || ref.current.state === 'closed') ref.current = getCtx();
  if (ref.current?.state === 'suspended') ref.current.resume();
  return ref.current;
}

function playCardDeal(ctx: AudioContext) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.09, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2) * 0.6;
  }
  const s = ctx.createBufferSource();
  s.buffer = buf;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
  const g = ctx.createGain(); g.gain.value = 0.35;
  s.connect(hp); hp.connect(g); g.connect(ctx.destination); s.start();
}

function playFlip(ctx: AudioContext) {
  [800, 600, 400].forEach((f, i) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    const t = ctx.currentTime + i * 0.04;
    g.gain.setValueAtTime(0.09, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + 0.09);
  });
}

function playWin(ctx: AudioContext, bj = false) {
  const notes = bj ? [523, 659, 784, 1047, 1319, 1568] : [440, 554, 659, 784];
  notes.forEach((freq, i) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = bj ? 'square' : 'triangle'; o.frequency.value = freq;
    const t = ctx.currentTime + i * 0.1;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(bj ? 0.18 : 0.13, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + 0.38);
  });
}

function playLose(ctx: AudioContext) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(260, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(90, ctx.currentTime + 0.4);
  g.gain.setValueAtTime(0.13, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
  o.connect(g); g.connect(ctx.destination);
  o.start(); o.stop(ctx.currentTime + 0.42);
}

function playPush(ctx: AudioContext) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = 'sine'; o.frequency.value = 440;
  g.gain.setValueAtTime(0.1, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
  o.connect(g); g.connect(ctx.destination);
  o.start(); o.stop(ctx.currentTime + 0.32);
}

function playBust(ctx: AudioContext) {
  [300, 220, 150].forEach((f, i) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = f;
    const t = ctx.currentTime + i * 0.1;
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + 0.2);
  });
}

function playClick(ctx: AudioContext) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = 'sine'; o.frequency.value = 880;
  g.gain.setValueAtTime(0.06, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
  o.connect(g); g.connect(ctx.destination);
  o.start(); o.stop(ctx.currentTime + 0.08);
}

// ─── Card component ───────────────────────────────────────────────────────────
function CardView({ card, index, total }: { card: Card; index: number; total: number }) {
  const red = isRed(card.suit);
  const fan = total <= 5 ? (index - (total - 1) / 2) * 18 : (index - (total - 1) / 2) * 10;
  const lift = total <= 5 ? Math.abs(index - (total - 1) / 2) * -4 : 0;

  if (card.hidden) {
    return (
      <div
        className="absolute"
        style={{
          width: 64, height: 90,
          transform: `rotate(${fan}deg) translateY(${lift}px)`,
          transformOrigin: 'bottom center',
          left: `calc(50% - 32px + ${(index - (total - 1) / 2) * 18}px)`,
          zIndex: index,
          animation: `card-deal 0.35s cubic-bezier(0.16, 1, 0.3, 1) ${index * 120}ms both`,
        }}
      >
        <div className="w-full h-full rounded-xl border border-gold/30 flex items-center justify-center overflow-hidden"
          style={{ background: 'linear-gradient(135deg, hsl(240 40% 18%), hsl(240 30% 12%))' }}>
          <div className="grid grid-cols-3 grid-rows-3 gap-0.5 w-10 h-14 opacity-30">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="rounded-sm" style={{ background: 'hsl(43 74% 52%)' }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="absolute"
      style={{
        width: 64, height: 90,
        transform: `rotate(${fan}deg) translateY(${lift}px)`,
        transformOrigin: 'bottom center',
        left: `calc(50% - 32px + ${(index - (total - 1) / 2) * 22}px)`,
        zIndex: index,
        animation: `card-deal 0.35s cubic-bezier(0.16, 1, 0.3, 1) ${index * 120}ms both`,
      }}
    >
      <div
        className="w-full h-full rounded-xl border flex flex-col justify-between px-1.5 py-1.5 shadow-lg"
        style={{
          background: 'linear-gradient(160deg, #fff 0%, #f5f0e8 100%)',
          borderColor: red ? 'hsl(var(--crimson) / 0.3)' : 'rgba(0,0,0,0.15)',
          boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
        }}
      >
        {/* Top-left */}
        <div style={{ color: red ? 'hsl(var(--crimson))' : '#111', lineHeight: 1 }}>
          <div className="font-display font-bold text-sm leading-none">{card.rank}</div>
          <div className="text-sm leading-none">{card.suit}</div>
        </div>
        {/* Center suit */}
        <div className="flex items-center justify-center text-2xl leading-none"
          style={{ color: red ? 'hsl(var(--crimson))' : '#111' }}>
          {card.suit}
        </div>
        {/* Bottom-right (rotated) */}
        <div className="self-end rotate-180" style={{ color: red ? 'hsl(var(--crimson))' : '#111', lineHeight: 1 }}>
          <div className="font-display font-bold text-sm leading-none">{card.rank}</div>
          <div className="text-sm leading-none">{card.suit}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Hand display ─────────────────────────────────────────────────────────────
function Hand({ cards, label, score, highlight }: {
  cards: Card[];
  label: string;
  score: number;
  highlight?: 'win' | 'lose' | 'push';
}) {
  const colorMap = { win: 'hsl(var(--emerald))', lose: 'hsl(var(--crimson))', push: 'hsl(var(--gold))' };
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
        <span
          className="font-display font-bold text-lg tabular-nums transition-colors"
          style={{ color: highlight ? colorMap[highlight] : 'hsl(var(--foreground))' }}
        >
          {score}
        </span>
        {highlight === 'win' && <span className="text-xs font-bold" style={{ color: colorMap.win }}>✓</span>}
        {highlight === 'lose' && <span className="text-xs font-bold" style={{ color: colorMap.lose }}>✗</span>}
        {highlight === 'push' && <span className="text-xs font-bold" style={{ color: colorMap.push }}>═</span>}
      </div>
      <div className="relative" style={{ height: 100, width: '100%', minWidth: 160 }}>
        {cards.map((c, i) => (
          <CardView key={i} card={c} index={i} total={cards.length} />
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
const BET_STEPS = [50, 100, 250, 500, 1000];
type Phase = 'betting' | 'playing' | 'dealer' | 'result';
type Outcome = 'win' | 'lose' | 'push' | 'blackjack' | null;

export default function BlackjackGame({
  balance,
  onBalanceChange,
  onBack,
}: {
  balance: number;
  onBalanceChange: (delta: number) => void;
  onBack: () => void;
}) {
  const [bet, setBet] = useState(100);
  const [phase, setPhase] = useState<Phase>('betting');
  const [deck, setDeck] = useState<Card[]>([]);
  const [playerCards, setPlayerCards] = useState<Card[]>([]);
  const [dealerCards, setDealerCards] = useState<Card[]>([]);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [message, setMessage] = useState('');
  const [doubled, setDoubled] = useState(false);
  const [muted, setMuted] = useState(false);

  const timers = useRef<number[]>([]);
  const audioCtx = useRef<AudioContext | null>(null);
  const deckRef = useRef<Card[]>([]);

  const getAudio = useCallback(() => {
    if (muted) return null;
    return ensureCtx(audioCtx);
  }, [muted]);

  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    audioCtx.current?.close();
  }, []);

  const drawCard = (hidden = false): Card => {
    const card = { ...deckRef.current.pop()!, hidden };
    return card;
  };

  const delay = (ms: number) => new Promise<void>(r => { const t = window.setTimeout(r, ms); timers.current.push(t); });

  const dealWithSound = async (setFn: (prev: Card[]) => Card[], ms = 350) => {
    const ctx = getAudio(); if (ctx) playCardDeal(ctx);
    setFn(prev => prev);// trigger re-render handled by caller
    await delay(ms);
  };

  const startGame = async () => {
    if (bet > balance) return;
    const ctx = getAudio(); if (ctx) playClick(ctx);

    const newDeck = makeDeck();
    deckRef.current = newDeck;
    setDeck(newDeck);
    setOutcome(null);
    setMessage('');
    setDoubled(false);
    onBalanceChange(-bet);

    // deal: player, dealer, player, dealer(hidden)
    const c1 = drawCard();
    setPlayerCards([c1]);
    const ctx1 = getAudio(); if (ctx1) playCardDeal(ctx1);
    await delay(350);

    const d1 = drawCard();
    setDealerCards([d1]);
    const ctx2 = getAudio(); if (ctx2) playCardDeal(ctx2);
    await delay(350);

    const c2 = drawCard();
    setPlayerCards(prev => [...prev, c2]);
    const ctx3 = getAudio(); if (ctx3) playCardDeal(ctx3);
    await delay(350);

    const d2 = drawCard(true); // hidden
    setDealerCards(prev => [...prev, d2]);
    const ctx4 = getAudio(); if (ctx4) playCardDeal(ctx4);
    await delay(350);

    setPhase('playing');

    // check player blackjack
    const pHand = [c1, c2];
    if (isBlackjack(pHand)) {
      await delay(300);
      await revealAndFinish([c1, c2], [d1, { ...d2, hidden: false }], 'blackjack');
    }
  };

  const hit = async () => {
    if (phase !== 'playing') return;
    const ctx = getAudio(); if (ctx) playCardDeal(ctx);
    const newCard = drawCard();
    setPlayerCards(prev => {
      const next = [...prev, newCard];
      if (isBust(next)) {
        delay(300).then(() => {
          const c = getAudio(); if (c) playBust(c);
          setMessage('Перебор! Больше 21');
          setPhase('result');
          setOutcome('lose');
        });
      }
      return next;
    });
  };

  const stand = async () => {
    if (phase !== 'playing') return;
    setPhase('dealer');
    await delay(300);

    // Reveal dealer hidden card
    const ctx = getAudio(); if (ctx) playFlip(ctx);
    setDealerCards(prev => prev.map(c => ({ ...c, hidden: false })));
    await delay(600);

    // Dealer draws until 17+
    let dCards: Card[] = [];
    setDealerCards(prev => { dCards = prev.map(c => ({ ...c, hidden: false })); return dCards; });

    while (handTotal(dCards) < 17) {
      await delay(500);
      const newCard = drawCard();
      const c = getAudio(); if (c) playCardDeal(c);
      dCards = [...dCards, newCard];
      setDealerCards([...dCards]);
    }

    await delay(400);
    await revealAndFinish(playerCards, dCards, null);
  };

  const double = async () => {
    if (phase !== 'playing' || playerCards.length !== 2 || bet > balance) return;
    const ctx = getAudio(); if (ctx) playClick(ctx);
    onBalanceChange(-bet);
    setDoubled(true);
    setPhase('dealer');

    // one card only
    await delay(200);
    const newCard = drawCard();
    const ctxD = getAudio(); if (ctxD) playCardDeal(ctxD);
    const pFinal = [...playerCards, newCard];
    setPlayerCards(pFinal);
    await delay(600);

    if (isBust(pFinal)) {
      const c = getAudio(); if (c) playBust(c);
      setMessage('Перебор!');
      setOutcome('lose');
      setPhase('result');
      return;
    }

    // reveal dealer
    const ctxF = getAudio(); if (ctxF) playFlip(ctxF);
    setDealerCards(prev => prev.map(c => ({ ...c, hidden: false })));
    await delay(600);

    let dCards: Card[] = [];
    setDealerCards(prev => { dCards = prev.map(c => ({ ...c, hidden: false })); return dCards; });
    while (handTotal(dCards) < 17) {
      await delay(450);
      const nc = drawCard();
      const ca = getAudio(); if (ca) playCardDeal(ca);
      dCards = [...dCards, nc];
      setDealerCards([...dCards]);
    }

    await delay(400);
    await revealAndFinish(pFinal, dCards, null);
  };

  const revealAndFinish = async (pCards: Card[], dCards: Card[], forceOutcome: Outcome) => {
    const pScore = handTotal(pCards);
    const dScore = handTotal(dCards);
    const pBJ = isBlackjack(pCards);
    const dBJ = isBlackjack(dCards);

    let result: Outcome;
    let msg = '';
    let payout = 0;
    const baseBet = doubled ? bet * 2 : bet;

    if (forceOutcome === 'blackjack') {
      if (dBJ) {
        result = 'push';
        msg = 'Оба Блэкджек — ничья!';
        payout = baseBet; // return bet
      } else {
        result = 'blackjack';
        msg = '🃏 Блэкджек! Выплата 3:2';
        payout = Math.floor(baseBet * 2.5);
      }
    } else if (isBust(dCards)) {
      result = 'win';
      msg = 'Дилер перебрал — вы победили!';
      payout = baseBet * 2;
    } else if (pScore > dScore) {
      result = 'win';
      msg = `${pScore} против ${dScore} — победа!`;
      payout = baseBet * 2;
    } else if (pScore < dScore) {
      result = 'lose';
      msg = `${pScore} против ${dScore} — проигрыш`;
      payout = 0;
    } else {
      result = 'push';
      msg = `${pScore} против ${dScore} — ничья`;
      payout = baseBet;
    }

    if (payout > 0) onBalanceChange(payout);
    setOutcome(result);
    setMessage(msg);
    setPhase('result');

    // reveal dealer hidden card if not done
    setDealerCards(dCards.map(c => ({ ...c, hidden: false })));

    const ctx = getAudio();
    if (ctx) {
      if (result === 'blackjack') playWin(ctx, true);
      else if (result === 'win') playWin(ctx, false);
      else if (result === 'lose') playLose(ctx);
      else playPush(ctx);
    }
  };

  const playerScore = handTotal(playerCards);
  const dealerScore = handTotal(dealerCards);
  const canDouble = phase === 'playing' && playerCards.length === 2 && bet <= balance;

  const outcomeHighlight = (who: 'player' | 'dealer'): 'win' | 'lose' | 'push' | undefined => {
    if (!outcome) return undefined;
    if (outcome === 'push') return 'push';
    if (who === 'player') return (outcome === 'win' || outcome === 'blackjack') ? 'win' : 'lose';
    return (outcome === 'win' || outcome === 'blackjack') ? 'lose' : 'win';
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 animate-float-up">
        <button onClick={onBack} className="w-10 h-10 rounded-xl glass flex items-center justify-center text-gold">
          <Icon name="ArrowLeft" size={20} />
        </button>
        <div>
          <h2 className="font-display text-2xl font-bold tracking-wide leading-none">Блэкджек</h2>
          <p className="text-sm text-muted-foreground">Собери 21, обыграй дилера</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setMuted(m => !m)}
            className={`w-9 h-9 rounded-xl glass flex items-center justify-center ${muted ? 'text-muted-foreground' : 'text-gold'}`}
          >
            <Icon name={muted ? 'VolumeX' : 'Volume2'} size={18} />
          </button>
          <div className="glass rounded-full px-3 py-1.5 flex items-center gap-1.5">
            <span className="font-display font-semibold text-gold tabular-nums">{balance.toLocaleString('ru')}</span>
            <span className="text-xs text-muted-foreground">₽</span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div
        className="animate-float-up relative rounded-3xl overflow-hidden p-5 flex flex-col gap-6"
        style={{
          animationDelay: '60ms',
          background: 'radial-gradient(ellipse at 50% 30%, hsl(158 50% 14%), hsl(158 40% 8%))',
          border: '2px solid hsl(43 74% 52% / 0.25)',
          boxShadow: '0 0 40px hsl(158 50% 5% / 0.8), inset 0 0 60px hsl(158 60% 5% / 0.5)',
          minHeight: 340,
        }}
      >
        {/* Felt texture overlay */}
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{ backgroundImage: 'repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)', backgroundSize: '6px 6px' }} />

        {/* Decorative oval */}
        <div className="absolute inset-6 rounded-[40%] border border-gold/10 pointer-events-none" />

        {phase === 'betting' ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 relative z-10">
            <div className="text-6xl">🃏</div>
            <h3 className="font-display text-2xl font-bold text-white/90">Сделай ставку</h3>
            <p className="text-sm text-white/50">и начни раздачу</p>
          </div>
        ) : (
          <div className="relative z-10 flex flex-col gap-6">
            {/* Dealer */}
            <Hand
              cards={dealerCards}
              label="Дилер"
              score={dealerScore}
              highlight={phase === 'result' ? outcomeHighlight('dealer') : undefined}
            />

            {/* Divider */}
            <div className="w-full h-px bg-gold/15" />

            {/* Player */}
            <Hand
              cards={playerCards}
              label="Вы"
              score={playerScore}
              highlight={phase === 'result' ? outcomeHighlight('player') : undefined}
            />
          </div>
        )}
      </div>

      {/* Result message */}
      {phase === 'result' && message && (
        <div
          className={`animate-win-pop rounded-2xl p-4 text-center font-display font-bold text-lg ${
            outcome === 'win' || outcome === 'blackjack'
              ? 'gold-gradient text-background glow-gold'
              : outcome === 'push'
              ? 'glass border-gold/30'
              : 'glass'
          }`}
          style={outcome === 'lose' ? { borderColor: 'hsl(var(--crimson) / 0.4)' } : {}}
        >
          {message}
        </div>
      )}

      {/* Action buttons */}
      {phase === 'playing' && (
        <div className="animate-float-up grid grid-cols-3 gap-2">
          <Button onClick={hit} className="gold-gradient text-background font-bold h-12">
            <Icon name="Plus" size={18} className="mr-1" /> Взять
          </Button>
          <Button onClick={stand} variant="outline" className="border-gold/30 text-gold bg-transparent h-12 font-bold hover:bg-gold/10">
            <Icon name="Hand" size={18} className="mr-1" /> Стоп
          </Button>
          <Button
            onClick={double}
            disabled={!canDouble}
            variant="outline"
            className="border-emerald/40 bg-transparent h-12 font-bold hover:bg-emerald/10 disabled:opacity-30"
            style={{ color: 'hsl(var(--emerald))', borderColor: 'hsl(var(--emerald) / 0.4)' }}
          >
            <Icon name="ChevronsUp" size={18} className="mr-1" /> ×2
          </Button>
        </div>
      )}

      {/* Bet + Deal / New game */}
      {(phase === 'betting' || phase === 'result') && (
        <div className="animate-float-up space-y-3">
          <div className="glass rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                Ставка{doubled ? ' (удвоена)' : ''}
              </span>
              <span className="font-display text-xl font-bold gold-text tabular-nums">
                {(doubled ? bet * 2 : bet).toLocaleString('ru')} ₽
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {BET_STEPS.map(v => (
                <button
                  key={v}
                  onClick={() => { setBet(v); const ctx = getAudio(); if (ctx) playClick(ctx); }}
                  className={`py-2 rounded-xl text-sm font-semibold transition-all ${
                    bet === v ? 'gold-gradient text-background' : 'bg-background/50 text-foreground/70'
                  }`}
                >
                  {v >= 1000 ? `${v / 1000}к` : v}
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={startGame}
            disabled={bet > balance}
            className="w-full gold-gradient text-background font-bold text-lg h-14 glow-gold disabled:opacity-50"
          >
            {phase === 'result' ? (
              <><Icon name="RefreshCw" size={20} className="mr-2" /> Новая игра</>
            ) : bet > balance ? (
              'Недостаточно средств'
            ) : (
              <><Icon name="Play" size={20} className="mr-2" /> Раздать карты — {bet.toLocaleString('ru')} ₽</>
            )}
          </Button>
        </div>
      )}

      {/* Waiting for dealer */}
      {phase === 'dealer' && (
        <div className="glass rounded-2xl p-4 flex items-center justify-center gap-2 text-gold">
          <Icon name="Loader" size={18} className="animate-spin" />
          <span className="font-medium">Дилер набирает карты...</span>
        </div>
      )}

      {/* Rules hint */}
      {phase === 'betting' && (
        <div className="animate-float-up glass rounded-2xl p-4 space-y-2" style={{ animationDelay: '120ms' }}>
          <h3 className="font-display font-semibold flex items-center gap-2 text-sm">
            <Icon name="BookOpen" size={16} className="text-gold" /> Правила
          </h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5"><span className="text-gold font-semibold">Блэкджек</span> → ×2.5</div>
            <div className="flex items-center gap-1.5"><span className="text-gold font-semibold">Победа</span> → ×2</div>
            <div className="flex items-center gap-1.5"><span className="text-gold font-semibold">Удвоить</span> → 1 карта</div>
            <div className="flex items-center gap-1.5"><span className="text-gold font-semibold">Дилер</span> → стоп на 17</div>
          </div>
        </div>
      )}
    </div>
  );
}
