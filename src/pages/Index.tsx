import { useState, useCallback, useEffect, useRef } from 'react';
import { useRobokassa, openPaymentPage } from '@/components/extensions/robokassa/useRobokassa';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import SlotsGame from '@/components/SlotsGame';
import CoinGame from '@/components/CoinGame';
import DiceGame from '@/components/DiceGame';
import RouletteGame from '@/components/RouletteGame';
import BlackjackGame from '@/components/BlackjackGame';

type Section = 'home' | 'deposit' | 'withdraw' | 'games' | 'stats' | 'profile' | 'support' | 'admin';

const GAMES = [
  { id: 'roulette', name: 'Рулетка', icon: 'CircleDot', desc: 'Красное или чёрное', accent: 'crimson', emoji: '🎡' },
  { id: 'slots', name: 'Слоты', icon: 'Cherry', desc: 'Крути барабаны', accent: 'gold', emoji: '🎰' },
  { id: 'blackjack', name: 'Блэкджек', icon: 'Spade', desc: 'Собери 21', accent: 'emerald', emoji: '🃏' },
  { id: 'dice', name: 'Кости', icon: 'Dices', desc: 'Брось кубики', accent: 'gold', emoji: '🎲' },
  { id: 'coin', name: 'Монета', icon: 'CircleDollarSign', desc: 'Орёл или решка', accent: 'crimson', emoji: '🪙' },
];

const NAV = [
  { id: 'home' as Section, name: 'Меню', icon: 'LayoutGrid' },
  { id: 'games' as Section, name: 'Игры', icon: 'Gamepad2' },
  { id: 'deposit' as Section, name: 'Касса', icon: 'Wallet' },
  { id: 'stats' as Section, name: 'Стата', icon: 'TrendingUp' },
  { id: 'profile' as Section, name: 'Профиль', icon: 'User' },
];

const accentColor = (a: string) =>
  a === 'crimson' ? 'hsl(var(--crimson))' : a === 'emerald' ? 'hsl(var(--emerald))' : 'hsl(var(--gold))';

export default function Index() {
  const [section, setSection] = useState<Section>('home');
  const [balance, setBalance] = useState(14250);
  const [activeGame, setActiveGame] = useState<string | null>(null);

  const notify = (msg: string) => toast(msg, { description: 'Эта функция настраивается отдельно — напишите детали.' });

  const openGame = (id: string, name: string) => {
    if (id === 'slots' || id === 'coin' || id === 'dice' || id === 'roulette' || id === 'blackjack') {
      setActiveGame(id);
    } else {
      notify(`Открываю «${name}»`);
    }
  };

  return (
    <div className="dark min-h-screen bg-background text-foreground overflow-x-hidden">
      <div className="mx-auto max-w-md min-h-screen flex flex-col relative">
        {/* Header */}
        <header className="sticky top-0 z-30 glass px-5 py-4 flex items-center justify-between border-b border-gold/10">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl gold-gradient flex items-center justify-center glow-gold">
              <Icon name="Diamond" size={20} className="text-background" />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold tracking-wide leading-none gold-text">LUXE</h1>
              <span className="text-[10px] text-muted-foreground tracking-[0.3em] uppercase">Casino</span>
            </div>
          </div>
          <button
            onClick={() => setSection('deposit')}
            className="flex items-center gap-2 glass rounded-full pl-3 pr-1.5 py-1.5 border-gold/30 hover:border-gold/60 transition-colors"
          >
            <span className="font-display font-semibold text-gold tabular-nums">{balance.toLocaleString('ru')}</span>
            <span className="text-xs text-muted-foreground">₽</span>
            <span className="w-6 h-6 rounded-full gold-gradient flex items-center justify-center">
              <Icon name="Plus" size={14} className="text-background" />
            </span>
          </button>
        </header>

        <main className="flex-1 px-5 py-6 pb-28">
          {activeGame === 'slots' ? (
            <SlotsGame
              balance={balance}
              onBalanceChange={(delta) => setBalance((b) => b + delta)}
              onBack={() => setActiveGame(null)}
            />
          ) : activeGame === 'coin' ? (
            <CoinGame
              balance={balance}
              onBalanceChange={(delta) => setBalance((b) => b + delta)}
              onBack={() => setActiveGame(null)}
            />
          ) : activeGame === 'dice' ? (
            <DiceGame
              balance={balance}
              onBalanceChange={(delta) => setBalance((b) => b + delta)}
              onBack={() => setActiveGame(null)}
            />
          ) : activeGame === 'roulette' ? (
            <RouletteGame
              balance={balance}
              onBalanceChange={(delta) => setBalance((b) => b + delta)}
              onBack={() => setActiveGame(null)}
            />
          ) : activeGame === 'blackjack' ? (
            <BlackjackGame
              balance={balance}
              onBalanceChange={(delta) => setBalance((b) => b + delta)}
              onBack={() => setActiveGame(null)}
            />
          ) : (
            <>
              {section === 'home' && <HomeView balance={balance} setSection={setSection} openGame={openGame} notify={notify} />}
              {section === 'games' && <GamesView openGame={openGame} />}
              {section === 'deposit' && <DepositView notify={notify} onBalanceChange={(delta) => setBalance((b) => b + delta)} />}
              {section === 'withdraw' && <WithdrawView balance={balance} notify={notify} />}
              {section === 'stats' && <StatsView />}
              {section === 'profile' && <ProfileView setSection={setSection} notify={notify} />}
              {section === 'support' && <SupportView notify={notify} />}
              {section === 'admin' && <AdminView />}
            </>
          )}
        </main>

        {/* Bottom Nav */}
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-30 glass border-t border-gold/10 px-3 py-2 flex justify-around">
          {NAV.map((item) => {
            const active = section === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { setActiveGame(null); setSection(item.id); }}
                className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all"
              >
                <div className={`flex items-center justify-center transition-all ${active ? 'scale-110 text-gold' : 'opacity-50'}`}>
                  <Icon name={item.icon} size={22} />
                </div>
                <span className={`text-[10px] font-medium ${active ? 'text-gold' : 'text-muted-foreground'}`}>
                  {item.name}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function HomeView({ balance, setSection, openGame, notify }: { balance: number; setSection: (s: Section) => void; openGame: (id: string, name: string) => void; notify: (m: string) => void }) {
  return (
    <div className="space-y-6">
      <div className="animate-float-up relative rounded-3xl glass glow-soft overflow-hidden p-6">
        <div className="absolute inset-0 shimmer-line opacity-30 pointer-events-none" />
        <div className="absolute -right-8 -top-8 w-32 h-32 chip-pattern opacity-[0.06] rounded-full" />
        <div className="relative">
          <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Ваш баланс</span>
          <div className="flex items-end gap-2 mt-1">
            <span className="font-display text-5xl font-bold gold-text leading-none tabular-nums">{balance.toLocaleString('ru')}</span>
            <span className="text-xl text-gold/70 mb-1">₽</span>
          </div>
          <div className="flex gap-3 mt-5">
            <Button onClick={() => setSection('deposit')} className="flex-1 gold-gradient text-background font-semibold hover:opacity-90 glow-gold h-11">
              <Icon name="ArrowDownToLine" size={18} className="mr-1" /> Пополнить
            </Button>
            <Button onClick={() => setSection('withdraw')} variant="outline" className="flex-1 border-gold/30 text-gold hover:bg-gold/10 h-11 bg-transparent">
              <Icon name="ArrowUpFromLine" size={18} className="mr-1" /> Вывести
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Игр сыграно', value: '328', icon: 'Dices' },
          { label: 'Побед', value: '186', icon: 'Trophy' },
          { label: 'Винрейт', value: '57%', icon: 'Percent' },
        ].map((s, i) => (
          <div key={s.label} className="animate-float-up glass rounded-2xl p-3 text-center" style={{ animationDelay: `${80 + i * 60}ms` }}>
            <Icon name={s.icon} size={18} className="text-gold mx-auto mb-1.5" />
            <div className="font-display text-lg font-semibold">{s.value}</div>
            <div className="text-[10px] text-muted-foreground leading-tight">{s.label}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xl font-semibold tracking-wide">Популярные игры</h2>
          <button onClick={() => setSection('games')} className="text-xs text-gold flex items-center gap-0.5">
            Все <Icon name="ChevronRight" size={14} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {GAMES.slice(0, 4).map((g, i) => (
            <GameCard key={g.id} game={g} delay={120 + i * 60} onClick={() => openGame(g.id, g.name)} />
          ))}
        </div>
      </div>

      <div className="animate-float-up relative rounded-2xl overflow-hidden p-5 glow-gold" style={{ animationDelay: '360ms', background: 'linear-gradient(120deg, hsl(348 83% 25%), hsl(240 28% 8%))' }}>
        <div className="relative z-10">
          <div className="flex items-center gap-1.5 text-gold text-xs font-semibold uppercase tracking-wider mb-1">
            <Icon name="Gift" size={14} /> Бонус
          </div>
          <h3 className="font-display text-2xl font-bold">+100% на первый депозит</h3>
          <p className="text-sm text-foreground/70 mt-1">Удвой свой стартовый баланс прямо сейчас</p>
          <button onClick={() => notify('Активирую бонус')} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-gold">
            Забрать бонус <Icon name="ArrowRight" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function GameCard({ game, delay, onClick }: { game: typeof GAMES[number]; delay: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="animate-float-up hover-lift glass rounded-2xl p-4 text-left relative overflow-hidden group"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="absolute -right-4 -bottom-4 text-6xl opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-all duration-500">
        {game.emoji}
      </div>
      <div className="relative">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center mb-3"
          style={{ background: `${accentColor(game.accent)}22`, color: accentColor(game.accent) }}
        >
          <Icon name={game.icon} size={22} />
        </div>
        <h3 className="font-display font-semibold text-base">{game.name}</h3>
        <p className="text-xs text-muted-foreground">{game.desc}</p>
      </div>
    </button>
  );
}

function GamesView({ openGame }: { openGame: (id: string, name: string) => void }) {
  return (
    <div className="space-y-5">
      <SectionTitle title="Игры" subtitle="Выбери, во что сыграть" icon="Gamepad2" />
      <div className="grid grid-cols-2 gap-3">
        {GAMES.map((g, i) => (
          <GameCard key={g.id} game={g} delay={i * 70} onClick={() => openGame(g.id, g.name)} />
        ))}
        <button
          onClick={() => toast('Скоро новые игры')}
          className="animate-float-up glass rounded-2xl p-4 flex flex-col items-center justify-center text-center border-dashed border-gold/20 min-h-[130px]"
          style={{ animationDelay: `${GAMES.length * 70}ms` }}
        >
          <Icon name="Sparkles" size={24} className="text-gold/50 mb-2" />
          <span className="text-xs text-muted-foreground">Скоро<br />новинки</span>
        </button>
      </div>
    </div>
  );
}

const DEPOSIT_AMOUNTS = [500, 1000, 2000, 5000, 10000, 25000];

const DEPOSIT_METHODS = [
  {
    id: 'card',
    name: 'Банковская карта',
    desc: 'Visa, Mastercard, МИР',
    icon: 'CreditCard',
    min: 500,
    instant: true,
  },
  {
    id: 'sbp',
    name: 'СБП',
    desc: 'Система быстрых платежей',
    icon: 'Zap',
    min: 100,
    instant: true,
  },
  {
    id: 'ymoney',
    name: 'ЮMoney',
    desc: 'Электронный кошелёк',
    icon: 'Wallet',
    min: 100,
    instant: true,
  },
  {
    id: 'crypto',
    name: 'Крипто (USDT)',
    desc: 'TRC-20 / ERC-20',
    icon: 'Bitcoin',
    min: 1000,
    instant: false,
  },
];

const ROBOKASSA_API = 'https://functions.poehali.dev/ed14271a-993b-4abb-a021-fd5ba53c863d';
const ORDER_STATUS_API = 'https://functions.poehali.dev/c33b0e83-4616-4a6e-a9fd-18de4f0b2b09';

type DepositStep = 'method' | 'amount' | 'user-info' | 'crypto-form' | 'redirecting' | 'waiting' | 'success';

function DepositView({ notify: _notify, onBalanceChange }: { notify: (m: string) => void; onBalanceChange: (delta: number) => void }) {
  const [step, setStep] = useState<DepositStep>('method');
  const [method, setMethod] = useState<typeof DEPOSIT_METHODS[0] | null>(null);
  const [amount, setAmount] = useState(1000);
  const [customAmount, setCustomAmount] = useState('');
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [userTelegram, setUserTelegram] = useState('');
  const [paidAmount, setPaidAmount] = useState(0);
  const [orderNumber, setOrderNumber] = useState('');
  const sessionIdRef = useRef('');
  const pollRef = useRef<number | null>(null);

  const finalAmount = customAmount ? parseInt(customAmount) || 0 : amount;

  const { createPayment, isLoading } = useRobokassa({
    apiUrl: ROBOKASSA_API,
    onError: (err) => toast.error('Ошибка создания платежа: ' + err.message),
  });

  // Поллинг статуса после редиректа
  const startPolling = useCallback((sid: string) => {
    setStep('waiting');
    let attempts = 0;
    const poll = async () => {
      try {
        const res = await fetch(`${ORDER_STATUS_API}?session_id=${sid}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'paid') {
            if (pollRef.current) clearInterval(pollRef.current);
            setPaidAmount(data.amount);
            setOrderNumber(data.order_number);
            onBalanceChange(data.amount);
            setStep('success');
            return;
          }
        }
      } catch { /* сеть — пробуем снова */ }
      attempts++;
      if (attempts >= 60) { // 5 минут (5s * 60)
        if (pollRef.current) clearInterval(pollRef.current);
        setStep('method');
        toast.error('Платёж не подтверждён. Обратитесь в поддержку.');
      }
    };
    pollRef.current = window.setInterval(poll, 5000);
    poll();
  }, [onBalanceChange]);

  useEffect(() => {
    // При возврате со страницы Robokassa — запускаем поллинг
    const sid = sessionIdRef.current;
    const onFocus = () => { if (sid && step === 'redirecting') startPolling(sid); };
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [step, startPolling]);

  const handlePay = useCallback(async () => {
    if (!method) return;
    const sid = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    sessionIdRef.current = sid;
    try {
      setStep('redirecting');
      const result = await createPayment({
        amount: finalAmount,
        userName: userName || 'Игрок',
        userEmail,
        userPhone,
        sessionId: sid,
        cartItems: [{ id: 'deposit', name: `Пополнение баланса (${method.name})`, price: finalAmount, quantity: 1 }],
        successUrl: window.location.href,
        failUrl: window.location.href,
        orderComment: `Пополнение через ${method.name}${userTelegram ? ` | tg:${userTelegram.replace('@', '')}` : ''}`,
      });
      openPaymentPage(result.payment_url);
      // Через 3 сек запускаем поллинг (пользователь ушёл на оплату)
      setTimeout(() => startPolling(sid), 3000);
    } catch {
      setStep('user-info');
    }
  }, [method, finalAmount, userName, userEmail, userPhone, createPayment, startPolling]);

  const reset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setStep('method');
    setMethod(null);
    setCustomAmount('');
    setAmount(1000);
    setUserName(''); setUserEmail(''); setUserPhone(''); setUserTelegram('');
    sessionIdRef.current = '';
  };

  const inputCls = 'w-full bg-background/60 border border-gold/20 rounded-xl px-4 py-3 outline-none focus:border-gold/50 transition-colors text-foreground placeholder:text-muted-foreground/50';

  // ── SUCCESS ──
  if (step === 'success') {
    return (
      <div className="space-y-5">
        <SectionTitle title="Пополнение" subtitle="Баланс пополнен" icon="ArrowDownToLine" />
        <div className="animate-win-pop glass rounded-3xl p-8 flex flex-col items-center gap-5 text-center glow-soft">
          <div className="w-24 h-24 rounded-full gold-gradient flex items-center justify-center glow-gold">
            <Icon name="CheckCheck" size={40} className="text-background" />
          </div>
          <div>
            <h3 className="font-display text-3xl font-bold gold-text">Оплачено!</h3>
            <p className="text-muted-foreground text-sm mt-1">Баланс пополнен успешно</p>
          </div>
          <div className="w-full glass rounded-2xl p-5 space-y-3">
            <div className="font-display text-4xl font-bold gold-text tabular-nums">
              +{paidAmount.toLocaleString('ru')} ₽
            </div>
            <div className="text-xs text-muted-foreground">зачислено на счёт</div>
            <div className="w-full h-px bg-gold/10" />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Заказ</span>
              <span className="font-mono text-xs">{orderNumber}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Способ</span>
              <span className="font-medium">{method?.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Статус</span>
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <Icon name="Check" size={13} /> Подтверждено
              </span>
            </div>
          </div>
          <Button onClick={reset} className="w-full gold-gradient text-background font-bold h-12 glow-gold">
            <Icon name="Plus" size={18} className="mr-2" /> Пополнить ещё
          </Button>
        </div>
      </div>
    );
  }

  // ── WAITING (поллинг после оплаты) ──
  if (step === 'waiting') {
    return (
      <div className="space-y-5">
        <SectionTitle title="Пополнение" subtitle="Ожидаем подтверждения" icon="ArrowDownToLine" />
        <div className="glass rounded-3xl p-10 flex flex-col items-center gap-5 text-center glow-soft">
          <div className="relative w-24 h-24">
            <div className="absolute inset-0 rounded-full gold-gradient opacity-20 animate-ping" />
            <div className="relative w-24 h-24 rounded-full gold-gradient flex items-center justify-center glow-gold">
              <Icon name="Clock" size={36} className="text-background" />
            </div>
          </div>
          <div>
            <h3 className="font-display text-xl font-bold gold-text">Ждём подтверждения</h3>
            <p className="text-muted-foreground text-sm mt-1">Проверяем статус платежа каждые 5 секунд</p>
          </div>
          <div className="w-full glass rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Сумма</span>
              <span className="font-display font-bold gold-text">{finalAmount.toLocaleString('ru')} ₽</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Способ</span>
              <span>{method?.name}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-gold/70 text-xs">
            <Icon name="Loader" size={14} className="animate-spin" />
            Баланс зачислится автоматически после оплаты
          </div>
          <button onClick={reset} className="text-xs text-muted-foreground underline underline-offset-2 mt-2">
            Отменить и вернуться
          </button>
        </div>
      </div>
    );
  }

  // ── REDIRECTING ──
  if (step === 'redirecting') {
    return (
      <div className="space-y-5">
        <SectionTitle title="Пополнение" subtitle="Переходим к оплате" icon="ArrowDownToLine" />
        <div className="glass rounded-3xl p-10 flex flex-col items-center gap-5 text-center glow-soft">
          <div className="w-20 h-20 rounded-full gold-gradient flex items-center justify-center glow-gold animate-pulse">
            <Icon name="ExternalLink" size={32} className="text-background" />
          </div>
          <div>
            <h3 className="font-display text-xl font-bold gold-text">Открываем страницу оплаты</h3>
            <p className="text-muted-foreground text-sm mt-1">Сейчас вы будете перенаправлены на Robokassa</p>
          </div>
          <div className="flex items-center gap-2 text-gold text-sm">
            <Icon name="Loader" size={16} className="animate-spin" /> Создаём заказ...
          </div>
          <button onClick={reset} className="text-xs text-muted-foreground underline underline-offset-2">
            Отменить
          </button>
        </div>
      </div>
    );
  }

  // ── CRYPTO FORM (без шлюза, ручной) ──
  if (step === 'crypto-form') {
    const WALLET_ADDR = 'TRx9dK2mQpLvXcYh8NbwAeR5sJfU3gZqP';
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3 animate-float-up">
          <button onClick={() => setStep('amount')} className="w-10 h-10 rounded-xl glass flex items-center justify-center text-gold">
            <Icon name="ArrowLeft" size={20} />
          </button>
          <div>
            <h2 className="font-display text-xl font-bold">USDT</h2>
            <p className="text-sm text-muted-foreground">≈ {(finalAmount / 90).toFixed(2)} USDT</p>
          </div>
        </div>
        <div className="animate-float-up glass rounded-2xl p-5 flex flex-col items-center gap-4 text-center" style={{ animationDelay: '60ms' }}>
          <div className="w-40 h-40 rounded-2xl flex items-center justify-center" style={{ background: 'white' }}>
            <div className="grid grid-cols-5 grid-rows-5 gap-1 w-32 h-32 p-2">
              {Array.from({ length: 25 }).map((_, i) => (
                <div key={i} className="rounded-[2px]"
                  style={{ background: [0,1,2,3,4,5,9,10,14,15,19,20,21,22,23,24,7,12,17].includes(i) ? '#111' : 'white' }} />
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Адрес кошелька TRC-20</div>
            <div className="font-mono text-xs break-all text-foreground/80 bg-background/50 rounded-lg px-3 py-2">{WALLET_ADDR}</div>
          </div>
          <button onClick={() => { navigator.clipboard.writeText(WALLET_ADDR); toast('Адрес скопирован'); }}
            className="flex items-center gap-2 glass rounded-xl px-4 py-2 text-sm font-medium text-gold">
            <Icon name="Copy" size={16} /> Скопировать адрес
          </button>
        </div>
        <div className="animate-float-up glass rounded-xl p-4 space-y-2 text-sm" style={{ animationDelay: '100ms' }}>
          <div className="flex justify-between"><span className="text-muted-foreground">USDT</span><span className="font-bold gold-text">{(finalAmount / 90).toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Сеть</span><span>TRC-20</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Зачисление</span><span className="text-amber-400">3–10 мин</span></div>
        </div>
        <div className="glass rounded-xl p-3 flex items-start gap-2 text-xs text-muted-foreground">
          <Icon name="AlertTriangle" size={14} className="text-amber-400 shrink-0 mt-0.5" />
          Только USDT TRC-20. Другие сети не поддерживаются.
        </div>
        <Button onClick={reset} className="w-full gold-gradient text-background font-bold text-lg h-14 glow-gold">
          <Icon name="Check" size={20} className="mr-2" /> Я отправил USDT
        </Button>
      </div>
    );
  }

  // ── USER INFO (email обязателен для Robokassa) ──
  if (step === 'user-info' && method) {
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail);
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3 animate-float-up">
          <button onClick={() => setStep('amount')} className="w-10 h-10 rounded-xl glass flex items-center justify-center text-gold">
            <Icon name="ArrowLeft" size={20} />
          </button>
          <div>
            <h2 className="font-display text-xl font-bold">{method.name}</h2>
            <p className="text-sm text-muted-foreground">{finalAmount.toLocaleString('ru')} ₽</p>
          </div>
        </div>

        <div className="animate-float-up glass rounded-2xl p-4 flex items-center gap-3" style={{ animationDelay: '40ms' }}>
          <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center text-gold shrink-0">
            <Icon name={method.icon} size={20} />
          </div>
          <div className="text-sm">
            <div className="font-semibold">{method.name}</div>
            <div className="text-muted-foreground">Оплата через Robokassa</div>
          </div>
          <div className="ml-auto font-display font-bold gold-text tabular-nums">{finalAmount.toLocaleString('ru')} ₽</div>
        </div>

        <div className="animate-float-up space-y-3" style={{ animationDelay: '80ms' }}>
          <p className="text-xs text-muted-foreground">Robokassa требует email для отправки чека</p>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Email <span className="text-red-400">*</span></label>
            <input className={inputCls} placeholder="your@email.com" value={userEmail}
              onChange={e => setUserEmail(e.target.value)} type="email" inputMode="email" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Имя (необязательно)</label>
            <input className={inputCls} placeholder="Иван Иванов" value={userName}
              onChange={e => setUserName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Телефон (необязательно)</label>
            <input className={inputCls} placeholder="+7 999 000-00-00" value={userPhone}
              onChange={e => setUserPhone(e.target.value)} inputMode="tel" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Telegram (необязательно)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/60 text-sm">@</span>
              <input
                className={inputCls + ' pl-8'}
                placeholder="username"
                value={userTelegram}
                onChange={e => setUserTelegram(e.target.value.replace('@', ''))}
              />
            </div>
            <div className="mt-2 glass rounded-xl p-3 flex items-center gap-3">
              <Icon name="MessageCircle" size={16} className="text-[#29a0d8] shrink-0" />
              <p className="text-xs text-muted-foreground flex-1">
                Чтобы бот смог написать тебе — сначала нажми <span className="text-foreground font-medium">Старт</span>
              </p>
              <a
                href="https://t.me/Luxxeecassinnobot"
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#29a0d8]/20 text-[#29a0d8] hover:bg-[#29a0d8]/30 transition-colors flex items-center gap-1"
              >
                <Icon name="Send" size={12} /> Открыть бота
              </a>
            </div>
          </div>
        </div>

        <div className="animate-float-up glass rounded-xl p-3 flex items-center gap-2 text-xs text-muted-foreground" style={{ animationDelay: '120ms' }}>
          <Icon name="ShieldCheck" size={14} className="text-gold shrink-0" />
          Платёж обрабатывает Robokassa. Карта вводится на их защищённой странице.
        </div>

        <Button onClick={handlePay} disabled={!emailValid || isLoading}
          className="w-full gold-gradient text-background font-bold text-lg h-14 glow-gold disabled:opacity-50">
          {isLoading
            ? <><Icon name="Loader" size={20} className="mr-2 animate-spin" /> Создаём заказ...</>
            : <><Icon name="ExternalLink" size={20} className="mr-2" /> Перейти к оплате</>}
        </Button>
      </div>
    );
  }

  // ── AMOUNT STEP ──
  if (step === 'amount' && method) {
    const nextStep = () => {
      if (method.id === 'crypto') setStep('crypto-form');
      else setStep('user-info');
    };
    const valid = finalAmount >= method.min;
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3 animate-float-up">
          <button onClick={() => setStep('method')} className="w-10 h-10 rounded-xl glass flex items-center justify-center text-gold">
            <Icon name="ArrowLeft" size={20} />
          </button>
          <div>
            <h2 className="font-display text-xl font-bold">{method.name}</h2>
            <p className="text-sm text-muted-foreground">Минимум {method.min.toLocaleString('ru')} ₽</p>
          </div>
        </div>

        <div className="animate-float-up glass rounded-2xl p-5 space-y-4" style={{ animationDelay: '60ms' }}>
          <div>
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Сумма пополнения</span>
            <div className="flex items-end gap-1 mt-1">
              <span className="font-display text-4xl font-bold gold-text tabular-nums">
                {finalAmount > 0 ? finalAmount.toLocaleString('ru') : '—'}
              </span>
              <span className="text-gold/70 mb-1">₽</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {DEPOSIT_AMOUNTS.map(v => (
              <button key={v}
                onClick={() => { setAmount(v); setCustomAmount(''); }}
                className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${amount === v && !customAmount ? 'gold-gradient text-background' : 'bg-background/50 text-foreground/70'}`}>
                {v >= 1000 ? `${v / 1000}к` : v}
              </button>
            ))}
          </div>
          <div>
            <input
              className={inputCls + ' text-center font-display text-lg'}
              placeholder="Своя сумма"
              value={customAmount}
              onChange={e => setCustomAmount(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
            />
          </div>
        </div>

        <div className="animate-float-up glass rounded-xl p-4 space-y-2 text-sm" style={{ animationDelay: '100ms' }}>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Комиссия</span>
            <span className="text-emerald-400 font-medium">0 ₽</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Зачисление</span>
            <span className="font-medium">{method.instant ? 'Мгновенно' : '3–10 минут'}</span>
          </div>
          <div className="w-full h-px bg-gold/10" />
          <div className="flex justify-between font-bold">
            <span>К зачислению</span>
            <span className="gold-text">{finalAmount > 0 ? finalAmount.toLocaleString('ru') : '—'} ₽</span>
          </div>
        </div>

        <Button onClick={nextStep} disabled={!valid}
          className="w-full gold-gradient text-background font-bold text-lg h-14 glow-gold disabled:opacity-50">
          Продолжить →
        </Button>
      </div>
    );
  }

  // ── METHOD STEP (default) ──
  return (
    <div className="space-y-5">
      <SectionTitle title="Пополнение" subtitle="Выбери удобный способ" icon="ArrowDownToLine" />
      <div className="space-y-3">
        {DEPOSIT_METHODS.map((m, i) => (
          <button
            key={m.id}
            onClick={() => { setMethod(m); setStep('amount'); }}
            className="animate-float-up w-full glass rounded-2xl p-4 flex items-center gap-4 hover-lift transition-all"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center text-gold shrink-0">
              <Icon name={m.icon} size={22} />
            </div>
            <div className="flex-1 text-left">
              <div className="font-semibold">{m.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{m.desc}</div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {m.instant && (
                <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-400/10 rounded-full px-2 py-0.5">Мгновенно</span>
              )}
              <span className="text-xs text-muted-foreground">от {m.min.toLocaleString('ru')} ₽</span>
            </div>
          </button>
        ))}
      </div>
      <div className="animate-float-up glass rounded-xl p-3 flex items-center gap-2 text-xs text-muted-foreground" style={{ animationDelay: '280ms' }}>
        <Icon name="ShieldCheck" size={14} className="text-gold shrink-0" />
        Все платежи защищены. Данные не передаются третьим лицам.
      </div>
    </div>
  );
}

const WITHDRAW_METHODS = [
  { id: 'card', name: 'Банковская карта', desc: 'Visa, Mastercard, МИР', icon: 'CreditCard', time: '15 минут', min: 500 },
  { id: 'sbp',  name: 'СБП',              desc: 'По номеру телефона',    icon: 'Zap',        time: '5 минут',  min: 100  },
  { id: 'ymoney', name: 'ЮMoney',         desc: 'На кошелёк',           icon: 'Wallet',     time: '15 минут', min: 100  },
  { id: 'crypto', name: 'Крипто (USDT)',  desc: 'TRC-20 / ERC-20',      icon: 'Bitcoin',    time: '30 минут', min: 1000 },
];

type WithdrawStep = 'method' | 'form' | 'confirm' | 'success';

const WITHDRAW_API = 'https://functions.poehali.dev/5264284f-4bd1-4c29-9530-a9fd03734d4d';

function WithdrawView({ balance, notify: _notify }: { balance: number; notify: (m: string) => void }) {
  const [step, setStep] = useState<WithdrawStep>('method');
  const [method, setMethod] = useState<typeof WITHDRAW_METHODS[0] | null>(null);
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userTelegram, setUserTelegram] = useState('');
  const [requestNumber, setRequestNumber] = useState('');
  const [loading, setLoading] = useState(false);

  const parsedAmount = parseInt(amount) || 0;
  const inputCls = 'w-full bg-background/60 border border-gold/20 rounded-xl px-4 py-3 outline-none focus:border-gold/50 transition-colors text-foreground placeholder:text-muted-foreground/50';

  const reset = () => {
    setStep('method'); setMethod(null); setAmount(''); setDestination('');
    setUserName(''); setUserEmail(''); setUserTelegram('');
  };

  const handleSubmit = async () => {
    if (!method) return;
    setLoading(true);
    try {
      const res = await fetch(WITHDRAW_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: method.name,
          destination,
          amount: parsedAmount,
          user_name: userName,
          user_email: userEmail,
          user_telegram: userTelegram,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRequestNumber(data.request_number);
        setStep('success');
      } else {
        toast.error(data.error || 'Ошибка отправки заявки');
      }
    } catch {
      toast.error('Ошибка сети, попробуй ещё раз');
    } finally {
      setLoading(false);
    }
  };

  const destPlaceholder = method?.id === 'card' ? '0000 0000 0000 0000'
    : method?.id === 'sbp' ? '+7 (999) 000-00-00'
    : method?.id === 'ymoney' ? '4100 1234 5678 90'
    : 'Адрес кошелька USDT TRC-20';

  const destLabel = method?.id === 'card' ? 'Номер карты'
    : method?.id === 'sbp' ? 'Номер телефона'
    : method?.id === 'ymoney' ? 'Номер кошелька'
    : 'Адрес кошелька';

  // ── SUCCESS ──
  if (step === 'success') {
    return (
      <div className="space-y-5">
        <SectionTitle title="Вывод средств" subtitle="Выведи выигрыш" icon="ArrowUpFromLine" />
        <div className="animate-win-pop glass rounded-3xl p-8 flex flex-col items-center gap-4 text-center glow-soft">
          <div className="w-20 h-20 rounded-full flex items-center justify-center glow-gold"
            style={{ background: 'linear-gradient(135deg, hsl(var(--emerald)), hsl(158 50% 35%))' }}>
            <Icon name="Check" size={36} className="text-white" />
          </div>
          <div>
            <h3 className="font-display text-2xl font-bold text-emerald-400">Заявка создана!</h3>
            <p className="text-muted-foreground text-sm mt-1">
              {parsedAmount.toLocaleString('ru')} ₽ будут отправлены в течение {method?.time}
            </p>
          </div>
          <div className="w-full glass rounded-2xl p-4 space-y-2 text-sm">
            {requestNumber && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Заявка</span>
                <span className="font-mono text-xs">{requestNumber}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Метод</span>
              <span className="font-medium">{method?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Реквизиты</span>
              <span className="font-medium font-mono text-xs">{destination.slice(0, 4)}••••{destination.slice(-4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Сумма</span>
              <span className="font-display font-bold text-emerald-400">{parsedAmount.toLocaleString('ru')} ₽</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Статус</span>
              <span className="text-amber-400 font-medium flex items-center gap-1">
                <Icon name="Clock" size={13} /> Обработка
              </span>
            </div>
          </div>
          <Button onClick={reset} variant="outline" className="w-full border-gold/30 text-gold bg-transparent h-12 font-bold hover:bg-gold/10">
            <Icon name="ArrowLeft" size={18} className="mr-2" /> Назад к кассе
          </Button>
        </div>
      </div>
    );
  }

  // ── CONFIRM ──
  if (step === 'confirm' && method) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3 animate-float-up">
          <button onClick={() => setStep('form')} className="w-10 h-10 rounded-xl glass flex items-center justify-center text-gold">
            <Icon name="ArrowLeft" size={20} />
          </button>
          <h2 className="font-display text-xl font-bold">Подтверждение</h2>
        </div>

        <div className="animate-float-up glass rounded-2xl p-5 space-y-3" style={{ animationDelay: '60ms' }}>
          <h3 className="font-display font-semibold text-muted-foreground text-xs uppercase tracking-wider">Детали вывода</h3>
          {[
            { label: 'Метод', value: method.name },
            { label: destLabel, value: `${destination.slice(0, 4)} •••• ${destination.slice(-4)}` },
            { label: 'Сумма вывода', value: `${parsedAmount.toLocaleString('ru')} ₽`, bold: true },
            { label: 'Комиссия', value: '0 ₽', green: true },
            { label: 'Получите', value: `${parsedAmount.toLocaleString('ru')} ₽`, gold: true },
            { label: 'Время', value: method.time },
          ].map(row => (
            <div key={row.label} className="flex justify-between items-center py-1 border-b border-gold/5 last:border-0">
              <span className="text-sm text-muted-foreground">{row.label}</span>
              <span className={`text-sm font-medium ${row.gold ? 'gold-text font-display font-bold text-base' : row.green ? 'text-emerald-400' : row.bold ? 'font-semibold' : ''}`}>
                {row.value}
              </span>
            </div>
          ))}
        </div>

        <div className="animate-float-up glass rounded-xl p-3 flex items-center gap-2 text-xs text-muted-foreground" style={{ animationDelay: '100ms' }}>
          <Icon name="ShieldCheck" size={14} className="text-gold shrink-0" />
          После подтверждения средства будут отправлены и не подлежат отмене.
        </div>

        <Button onClick={handleSubmit} disabled={loading}
          className="w-full font-bold text-lg h-14 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, hsl(var(--emerald)), hsl(158 50% 35%))', color: 'white' }}>
          {loading
            ? <><Icon name="Loader" size={20} className="mr-2 animate-spin" /> Отправляем...</>
            : <><Icon name="Send" size={20} className="mr-2" /> Подтвердить вывод</>}
        </Button>
      </div>
    );
  }

  // ── FORM ──
  if (step === 'form' && method) {
    const valid = parsedAmount >= method.min && parsedAmount <= balance && destination.length >= 8;
    const presets = [500, 1000, 2000, 5000].filter(v => v <= balance);
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3 animate-float-up">
          <button onClick={() => setStep('method')} className="w-10 h-10 rounded-xl glass flex items-center justify-center text-gold">
            <Icon name="ArrowLeft" size={20} />
          </button>
          <div>
            <h2 className="font-display text-xl font-bold">{method.name}</h2>
            <p className="text-sm text-muted-foreground">Доступно {balance.toLocaleString('ru')} ₽</p>
          </div>
        </div>

        {/* Balance card */}
        <div className="animate-float-up glass rounded-2xl p-4 flex items-center justify-between" style={{ animationDelay: '60ms' }}>
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Доступно к выводу</div>
            <div className="font-display text-2xl font-bold gold-text tabular-nums mt-0.5">{balance.toLocaleString('ru')} ₽</div>
          </div>
          <button
            onClick={() => setAmount(String(balance))}
            className="text-xs font-semibold text-gold glass rounded-xl px-3 py-1.5"
          >
            Всё
          </button>
        </div>

        <div className="animate-float-up space-y-3" style={{ animationDelay: '80ms' }}>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Сумма вывода</label>
            <input className={inputCls + ' font-display text-lg'} placeholder={`Минимум ${method.min.toLocaleString('ru')} ₽`}
              value={amount} onChange={e => setAmount(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
          </div>
          {presets.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {presets.map(v => (
                <button key={v}
                  onClick={() => setAmount(String(v))}
                  className={`py-2 rounded-xl text-sm font-semibold transition-all ${amount === String(v) ? 'gold-gradient text-background' : 'bg-background/50 text-foreground/70'}`}>
                  {v >= 1000 ? `${v / 1000}к` : v}
                </button>
              ))}
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">{destLabel}</label>
            <input className={inputCls} placeholder={destPlaceholder}
              value={destination} onChange={e => setDestination(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Имя (необязательно)</label>
            <input className={inputCls} placeholder="Иван Иванов" value={userName}
              onChange={e => setUserName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Email (необязательно)</label>
            <input className={inputCls} placeholder="your@email.com" value={userEmail}
              onChange={e => setUserEmail(e.target.value)} type="email" inputMode="email" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Telegram (необязательно)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/60 text-sm">@</span>
              <input className={inputCls + ' pl-8'} placeholder="username"
                value={userTelegram} onChange={e => setUserTelegram(e.target.value.replace('@', ''))} />
            </div>
            <div className="mt-2 glass rounded-xl p-3 flex items-center gap-3">
              <Icon name="MessageCircle" size={16} className="text-[#29a0d8] shrink-0" />
              <p className="text-xs text-muted-foreground flex-1">Получишь статус заявки в Telegram — сначала нажми <span className="text-foreground font-medium">Старт</span></p>
              <a href="https://t.me/Luxxeecassinnobot" target="_blank" rel="noopener noreferrer"
                className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#29a0d8]/20 text-[#29a0d8] hover:bg-[#29a0d8]/30 transition-colors flex items-center gap-1">
                <Icon name="Send" size={12} /> Открыть бота
              </a>
            </div>
          </div>

          {parsedAmount > balance && (
            <div className="flex items-center gap-2 text-xs text-red-400">
              <Icon name="AlertCircle" size={14} /> Сумма превышает доступный баланс
            </div>
          )}
        </div>

        <div className="animate-float-up glass rounded-xl p-4 space-y-1.5 text-sm" style={{ animationDelay: '120ms' }}>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Комиссия</span>
            <span className="text-emerald-400 font-medium">0 ₽</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Время обработки</span>
            <span className="font-medium">{method.time}</span>
          </div>
        </div>

        <Button onClick={() => setStep('confirm')} disabled={!valid}
          className="w-full gold-gradient text-background font-bold text-lg h-14 glow-gold disabled:opacity-50">
          Продолжить →
        </Button>
      </div>
    );
  }

  // ── METHOD (default) ──
  const canWithdraw = balance >= 100;
  return (
    <div className="space-y-5">
      <SectionTitle title="Вывод средств" subtitle="Выведи выигрыш" icon="ArrowUpFromLine" />

      {/* Balance */}
      <div className="animate-float-up relative glass rounded-2xl p-5 overflow-hidden">
        <div className="absolute inset-0 shimmer-line opacity-20 pointer-events-none" />
        <div className="relative">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Доступно к выводу</span>
          <div className="font-display text-4xl font-bold gold-text tabular-nums mt-1">{balance.toLocaleString('ru')} ₽</div>
          {!canWithdraw && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-400">
              <Icon name="AlertTriangle" size={13} /> Минимальная сумма вывода — 100 ₽
            </div>
          )}
        </div>
      </div>

      {canWithdraw ? (
        <div className="space-y-3">
          {WITHDRAW_METHODS.map((m, i) => (
            <button
              key={m.id}
              onClick={() => { setMethod(m); setStep('form'); }}
              disabled={balance < m.min}
              className="animate-float-up w-full glass rounded-2xl p-4 flex items-center gap-4 hover-lift transition-all disabled:opacity-40"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center text-gold shrink-0">
                <Icon name={m.icon} size={22} />
              </div>
              <div className="flex-1 text-left">
                <div className="font-semibold">{m.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{m.desc}</div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="text-[10px] font-semibold text-amber-400 bg-amber-400/10 rounded-full px-2 py-0.5">{m.time}</span>
                <span className="text-xs text-muted-foreground">от {m.min.toLocaleString('ru')} ₽</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="animate-float-up glass rounded-2xl p-6 flex flex-col items-center gap-3 text-center">
          <Icon name="TrendingUp" size={32} className="text-gold/40" />
          <p className="text-muted-foreground text-sm">Сыграй и выиграй, чтобы вывести средства</p>
        </div>
      )}

      <div className="animate-float-up glass rounded-xl p-3 flex items-center gap-2 text-xs text-muted-foreground" style={{ animationDelay: '280ms' }}>
        <Icon name="ShieldCheck" size={14} className="text-gold shrink-0" />
        Выплаты обрабатываются вручную. Комиссия 0%.
      </div>
    </div>
  );
}

function StatsView() {
  const stats = [
    { label: 'Всего ставок', value: '328', icon: 'Dices', accent: 'gold' },
    { label: 'Побед', value: '186', icon: 'Trophy', accent: 'emerald' },
    { label: 'Поражений', value: '142', icon: 'X', accent: 'crimson' },
    { label: 'Выиграно', value: '47 800 ₽', icon: 'TrendingUp', accent: 'emerald' },
  ];
  const history = [
    { game: 'Слоты', result: '+1 200 ₽', win: true },
    { game: 'Рулетка', result: '−500 ₽', win: false },
    { game: 'Блэкджек', result: '+3 400 ₽', win: true },
    { game: 'Кости', result: '+800 ₽', win: true },
    { game: 'Монета', result: '−1 000 ₽', win: false },
  ];
  return (
    <div className="space-y-5">
      <SectionTitle title="Статистика" subtitle="Твои результаты" icon="TrendingUp" />
      <div className="grid grid-cols-2 gap-3">
        {stats.map((s, i) => (
          <div key={s.label} className="animate-float-up glass rounded-2xl p-4" style={{ animationDelay: `${i * 60}ms` }}>
            <Icon name={s.icon} size={20} style={{ color: accentColor(s.accent) }} className="mb-2" />
            <div className="font-display text-2xl font-bold">{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>
      <div>
        <h3 className="font-display text-lg font-semibold mb-3">История игр</h3>
        <div className="space-y-2">
          {history.map((h, i) => (
            <div key={i} className="animate-float-up glass rounded-xl px-4 py-3 flex items-center justify-between" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${h.win ? 'bg-emerald/15' : 'bg-crimson/15'}`}>
                  <Icon name={h.win ? 'ArrowUp' : 'ArrowDown'} size={16} style={{ color: h.win ? 'hsl(var(--emerald))' : 'hsl(var(--crimson))' }} />
                </div>
                <span className="font-medium">{h.game}</span>
              </div>
              <span className="font-display font-semibold" style={{ color: h.win ? 'hsl(var(--emerald))' : 'hsl(var(--crimson))' }}>{h.result}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProfileView({ setSection, notify }: { setSection: (s: Section) => void; notify: (m: string) => void }) {
  const [tapCount, setTapCount] = useState(0);
  const tapTimer = useRef<number | null>(null);

  const handleSecretTap = () => {
    const next = tapCount + 1;
    setTapCount(next);
    if (tapTimer.current) clearTimeout(tapTimer.current);
    if (next >= 5) {
      setTapCount(0);
      setSection('admin');
      return;
    }
    tapTimer.current = window.setTimeout(() => setTapCount(0), 1500);
  };

  const items = [
    { name: 'Пополнить баланс', icon: 'Wallet', action: () => setSection('deposit') },
    { name: 'Вывод средств', icon: 'ArrowUpFromLine', action: () => setSection('withdraw') },
    { name: 'Статистика', icon: 'TrendingUp', action: () => setSection('stats') },
    { name: 'Поддержка', icon: 'Headphones', action: () => setSection('support') },
    { name: 'Настройки', icon: 'Settings', action: () => notify('Открываю настройки') },
  ];
  return (
    <div className="space-y-5">
      <div className="animate-float-up glass rounded-3xl p-6 text-center relative overflow-hidden glow-soft">
        <div className="absolute inset-x-0 top-0 h-24 gold-gradient opacity-20" />
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl gold-gradient mx-auto flex items-center justify-center glow-gold mb-3 cursor-pointer select-none"
            onClick={handleSecretTap}>
            <Icon name="User" size={36} className="text-background" />
          </div>
          <h2 className="font-display text-xl font-bold">Александр</h2>
          <span className="inline-flex items-center gap-1 mt-1 text-xs text-gold bg-gold/10 px-3 py-1 rounded-full">
            <Icon name="Crown" size={12} /> VIP статус
          </span>
        </div>
      </div>
      <div className="space-y-2.5">
        {items.map((it, i) => (
          <button
            key={it.name}
            onClick={it.action}
            className="animate-float-up w-full glass rounded-2xl p-4 flex items-center gap-3 hover-lift"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center text-gold">
              <Icon name={it.icon} size={20} />
            </div>
            <span className="font-medium flex-1 text-left">{it.name}</span>
            <Icon name="ChevronRight" size={18} className="text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}

function SupportView({ notify }: { notify: (m: string) => void }) {
  const faqs = [
    { q: 'Как пополнить баланс?', icon: 'Wallet' },
    { q: 'Сколько идёт вывод?', icon: 'Clock' },
    { q: 'Не пришёл выигрыш', icon: 'CircleAlert' },
  ];
  return (
    <div className="space-y-5">
      <SectionTitle title="Поддержка" subtitle="Мы на связи 24/7" icon="Headphones" />
      <button onClick={() => notify('Открываю чат с поддержкой')} className="animate-float-up w-full gold-gradient text-background rounded-2xl p-5 flex items-center gap-4 glow-gold">
        <Icon name="MessageCircle" size={28} />
        <div className="text-left">
          <div className="font-display font-bold text-lg">Написать в чат</div>
          <div className="text-sm opacity-80">Ответим в течение минуты</div>
        </div>
      </button>
      <div className="space-y-2.5">
        {faqs.map((f, i) => (
          <button key={f.q} onClick={() => notify(f.q)} className="animate-float-up w-full glass rounded-2xl p-4 flex items-center gap-3 hover-lift" style={{ animationDelay: `${i * 60}ms` }}>
            <Icon name={f.icon} size={20} className="text-gold" />
            <span className="font-medium flex-1 text-left">{f.q}</span>
            <Icon name="ChevronRight" size={18} className="text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}

function SectionTitle({ title, subtitle, icon }: { title: string; subtitle: string; icon: string }) {
  return (
    <div className="animate-float-up flex items-center gap-3">
      <div className="w-11 h-11 rounded-xl glass flex items-center justify-center text-gold">
        <Icon name={icon} size={22} />
      </div>
      <div>
        <h2 className="font-display text-2xl font-bold tracking-wide leading-none">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

const ADMIN_API = 'https://functions.poehali.dev/fc579833-522a-4863-abbc-24eece05648f';

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending:    { label: 'На рассмотрении', color: 'text-amber-400' },
  processing: { label: 'В обработке',     color: 'text-blue-400'  },
  paid:       { label: 'Выплачено',        color: 'text-emerald-400' },
  rejected:   { label: 'Отклонено',        color: 'text-red-400'   },
};

interface Withdrawal {
  id: number;
  request_number: string;
  user_name: string;
  user_email: string;
  user_telegram: string;
  method: string;
  destination: string;
  amount: number;
  status: string;
  created_at: string;
}

interface Order {
  id: number;
  order_number: string;
  user_name: string;
  user_email: string;
  order_comment: string;
  amount: number;
  status: string;
  created_at: string;
  paid_at: string;
}

const ORDER_STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: 'Ожидает',   color: 'text-amber-400'   },
  paid:    { label: 'Оплачено',  color: 'text-emerald-400' },
  failed:  { label: 'Ошибка',    color: 'text-red-400'     },
};

function AdminView() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [tab, setTab] = useState<'withdrawals' | 'orders'>('withdrawals');
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [updating, setUpdating] = useState<number | null>(null);
  const [selected, setSelected] = useState<Withdrawal | null>(null);
  const passwordRef = useRef('');

  const fetchStats = useCallback(async (pwd: string) => {
    const res = await fetch(`${ADMIN_API}?type=stats`, { headers: { 'X-Admin-Password': pwd } });
    if (res.ok) setStats(await res.json());
  }, []);

  const fetchData = useCallback(async (pwd: string, type: 'withdrawals' | 'orders', statusFilter = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type });
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`${ADMIN_API}?${params}`, { headers: { 'X-Admin-Password': pwd } });
      if (res.status === 401) { setAuthed(false); return; }
      const data = await res.json();
      if (type === 'withdrawals') setWithdrawals(data.withdrawals || []);
      else setOrders(data.orders || []);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleLogin = async () => {
    setAuthError('');
    setLoading(true);
    try {
      const res = await fetch(`${ADMIN_API}?type=withdrawals`, { headers: { 'X-Admin-Password': password } });
      if (res.status === 401) { setAuthError('Неверный пароль'); return; }
      const data = await res.json();
      passwordRef.current = password;
      setWithdrawals(data.withdrawals || []);
      setAuthed(true);
      fetchData(password, 'orders');
      fetchStats(password);
    } finally {
      setLoading(false);
    }
  };

  const switchTab = (t: 'withdrawals' | 'orders') => {
    setTab(t);
    setFilter('');
    setSelected(null);
    fetchData(passwordRef.current, t);
  };

  // Запрос разрешения на push-уведомления при входе
  useEffect(() => {
    if (authed && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [authed]);

  const prevWdCountRef = useRef<number | null>(null);

  const playBeep = () => {
    try {
      const AudioCtx = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.6);
    } catch { /* браузер заблокировал */ }
  };

  const notifyNewWithdrawal = (count: number) => {
    playBeep();
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('💸 Новая заявка на вывод!', {
        body: `Всего ожидает: ${count} заявок`,
        icon: '/favicon.ico',
      });
    }
    toast('💸 Новая заявка на вывод!', { description: `Ожидает обработки: ${count}` });
  };

  // Автообновление каждые 30 секунд пока залогинен
  useEffect(() => {
    if (!authed) return;
    const interval = window.setInterval(async () => {
      // Загружаем данные
      fetchData(passwordRef.current, tab, filter);
      // Проверяем статистику и сравниваем кол-во pending
      const res = await fetch(`${ADMIN_API}?type=stats`, { headers: { 'X-Admin-Password': passwordRef.current } });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
        const newPending: number = data.wd_pending_count || 0;
        if (prevWdCountRef.current !== null && newPending > prevWdCountRef.current) {
          notifyNewWithdrawal(newPending);
        }
        prevWdCountRef.current = newPending;
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [authed, tab, filter, fetchData]);

  const updateStatus = async (id: number, status: string) => {
    setUpdating(id);
    try {
      const res = await fetch(ADMIN_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': passwordRef.current },
        body: JSON.stringify({ withdrawal_id: id, status }),
      });
      if (res.ok) {
        setWithdrawals(prev => prev.map(w => w.id === id ? { ...w, status } : w));
        if (selected?.id === id) setSelected(prev => prev ? { ...prev, status } : null);
        toast.success('Статус обновлён');
      }
    } finally {
      setUpdating(null);
    }
  };

  const applyFilter = (f: string) => {
    setFilter(f);
    fetchData(passwordRef.current, tab, f);
  };

  const inputCls = 'w-full bg-background/60 border border-gold/20 rounded-xl px-4 py-3 outline-none focus:border-gold/50 transition-colors text-foreground placeholder:text-muted-foreground/50';

  // ── LOGIN ──
  if (!authed) {
    return (
      <div className="space-y-5">
        <SectionTitle title="Администратор" subtitle="Панель управления" icon="ShieldCheck" />
        <div className="glass rounded-3xl p-8 flex flex-col gap-5">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="w-16 h-16 rounded-2xl gold-gradient flex items-center justify-center glow-gold">
              <Icon name="Lock" size={28} className="text-background" />
            </div>
            <p className="text-sm text-muted-foreground">Введи пароль администратора</p>
          </div>
          <input
            className={inputCls}
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
          />
          {authError && (
            <div className="flex items-center gap-2 text-sm text-red-400">
              <Icon name="AlertCircle" size={14} /> {authError}
            </div>
          )}
          <Button onClick={handleLogin} disabled={loading || !password}
            className="w-full gold-gradient text-background font-bold h-12 glow-gold disabled:opacity-50">
            {loading ? <><Icon name="Loader" size={18} className="mr-2 animate-spin" /> Вход...</> : 'Войти'}
          </Button>
        </div>
      </div>
    );
  }

  // ── DETAIL ──
  if (selected) {
    const meta = STATUS_META[selected.status] || { label: selected.status, color: 'text-foreground' };
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelected(null)} className="w-10 h-10 rounded-xl glass flex items-center justify-center text-gold">
            <Icon name="ArrowLeft" size={20} />
          </button>
          <div>
            <h2 className="font-display text-xl font-bold">Заявка</h2>
            <p className="text-xs font-mono text-muted-foreground">{selected.request_number}</p>
          </div>
        </div>

        <div className="glass rounded-2xl p-5 space-y-3 text-sm">
          {[
            { label: 'Игрок', value: selected.user_name || '—' },
            { label: 'Email', value: selected.user_email || '—' },
            { label: 'Telegram', value: selected.user_telegram ? `@${selected.user_telegram}` : '—' },
            { label: 'Метод', value: selected.method },
            { label: 'Реквизиты', value: selected.destination },
            { label: 'Сумма', value: `${selected.amount.toLocaleString('ru')} ₽`, bold: true },
            { label: 'Дата', value: new Date(selected.created_at).toLocaleString('ru') },
          ].map(row => (
            <div key={row.label} className="flex justify-between gap-4 py-1 border-b border-gold/5 last:border-0">
              <span className="text-muted-foreground shrink-0">{row.label}</span>
              <span className={`text-right break-all ${row.bold ? 'font-display font-bold gold-text' : ''}`}>{row.value}</span>
            </div>
          ))}
          <div className="flex justify-between py-1">
            <span className="text-muted-foreground">Статус</span>
            <span className={`font-semibold ${meta.color}`}>{meta.label}</span>
          </div>
        </div>

        <div className="glass rounded-2xl p-4 space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Сменить статус</p>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(STATUS_META).map(([key, { label, color }]) => (
              <button
                key={key}
                disabled={selected.status === key || updating === selected.id}
                onClick={() => updateStatus(selected.id, key)}
                className={`py-2.5 px-3 rounded-xl text-sm font-semibold border transition-all disabled:opacity-40
                  ${selected.status === key ? 'border-gold/40 gold-gradient text-background' : 'border-gold/10 glass hover:border-gold/30'}`}
              >
                {updating === selected.id ? <Icon name="Loader" size={14} className="animate-spin mx-auto" /> : <span className={selected.status === key ? '' : color}>{label}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── LIST ──
  const currentList = tab === 'withdrawals' ? withdrawals : orders;
  const filterMeta = tab === 'withdrawals' ? STATUS_META : ORDER_STATUS_META;
  const counts = currentList.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalAmount = currentList.reduce((s, item) => s + item.amount, 0);

  return (
    <div className="space-y-4">
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <SectionTitle title="Админ" subtitle="Панель управления" icon="ShieldCheck" />
        <button onClick={() => { fetchData(passwordRef.current, tab, filter); fetchStats(passwordRef.current); }}
          className="w-9 h-9 glass rounded-xl flex items-center justify-center text-gold">
          <Icon name="RefreshCw" size={16} />
        </button>
      </div>

      {/* Статистика */}
      {stats && (
        <div className="grid grid-cols-2 gap-2">
          <div className="glass rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
              <Icon name="ArrowDownToLine" size={12} className="text-emerald-400" /> Пополнения
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Сегодня</div>
              <div className="font-display font-bold text-emerald-400">+{(stats.orders_today_sum || 0).toLocaleString('ru')} ₽</div>
              <div className="text-xs text-muted-foreground/60">{stats.orders_today_count} платежей</div>
            </div>
            <div className="w-full h-px bg-gold/10" />
            <div>
              <div className="text-xs text-muted-foreground">Всё время</div>
              <div className="font-display font-bold gold-text">+{(stats.orders_total_sum || 0).toLocaleString('ru')} ₽</div>
              <div className="text-xs text-muted-foreground/60">{stats.orders_total_count} платежей</div>
            </div>
          </div>
          <div className="glass rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
              <Icon name="ArrowUpFromLine" size={12} className="text-red-400" /> Выводы
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Сегодня</div>
              <div className="font-display font-bold text-red-400">−{(stats.wd_today_sum || 0).toLocaleString('ru')} ₽</div>
              <div className="text-xs text-muted-foreground/60">{stats.wd_today_count} заявок</div>
            </div>
            <div className="w-full h-px bg-gold/10" />
            <div>
              <div className="text-xs text-muted-foreground">Всё время</div>
              <div className="font-display font-bold gold-text">−{(stats.wd_total_sum || 0).toLocaleString('ru')} ₽</div>
              <div className="text-xs text-muted-foreground/60 flex items-center gap-1">
                {stats.wd_total_count} заявок
                {stats.wd_pending_count > 0 && (
                  <span className="text-amber-400 font-semibold">· {stats.wd_pending_count} ожидают</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Вкладки */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => switchTab('withdrawals')}
          className={`py-3 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition-all
            ${tab === 'withdrawals' ? 'gold-gradient text-background glow-gold' : 'glass text-muted-foreground'}`}>
          <Icon name="ArrowUpFromLine" size={16} /> Выводы
          {withdrawals.length > 0 && <span className="bg-background/20 rounded-full px-1.5 py-0.5 text-xs">{withdrawals.length}</span>}
        </button>
        <button onClick={() => switchTab('orders')}
          className={`py-3 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition-all
            ${tab === 'orders' ? 'gold-gradient text-background glow-gold' : 'glass text-muted-foreground'}`}>
          <Icon name="ArrowDownToLine" size={16} /> Пополнения
          {orders.length > 0 && <span className="bg-background/20 rounded-full px-1.5 py-0.5 text-xs">{orders.length}</span>}
        </button>
      </div>

      {/* Итого */}
      {currentList.length > 0 && (
        <div className="glass rounded-2xl p-4 flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Сумма ({currentList.length} записей)</span>
          <span className="font-display font-bold gold-text text-lg">{totalAmount.toLocaleString('ru')} ₽</span>
        </div>
      )}

      {/* Фильтр */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {[{ key: '', label: 'Все' }, ...Object.entries(filterMeta).map(([k, v]) => ({ key: k, label: v.label }))].map(f => (
          <button key={f.key} onClick={() => applyFilter(f.key)}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all
              ${filter === f.key ? 'gold-gradient text-background' : 'glass text-muted-foreground'}`}>
            {f.label}{f.key && counts[f.key] ? ` (${counts[f.key]})` : ''}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12 text-gold">
          <Icon name="Loader" size={28} className="animate-spin" />
        </div>
      ) : currentList.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-muted-foreground text-sm">
          Записей нет
        </div>
      ) : tab === 'withdrawals' ? (
        <div className="space-y-2">
          {withdrawals.map(w => {
            const meta = STATUS_META[w.status] || { label: w.status, color: 'text-foreground' };
            return (
              <button key={w.id} onClick={() => setSelected(w)}
                className="w-full glass rounded-2xl p-4 flex items-center gap-3 hover:border-gold/20 border border-transparent transition-all text-left">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                  <Icon name="ArrowUpFromLine" size={18} className="text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center gap-2">
                    <span className="font-display font-bold gold-text">{w.amount.toLocaleString('ru')} ₽</span>
                    <span className={`text-xs font-semibold ${meta.color}`}>{meta.label}</span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate mt-0.5">
                    {w.user_name || w.user_email || '—'} · {w.method}
                  </div>
                  <div className="text-xs text-muted-foreground/50 mt-0.5">
                    {new Date(w.created_at).toLocaleString('ru')}
                  </div>
                </div>
                <Icon name="ChevronRight" size={16} className="text-muted-foreground shrink-0" />
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map(o => {
            const meta = ORDER_STATUS_META[o.status] || { label: o.status, color: 'text-foreground' };
            return (
              <div key={o.id} className="glass rounded-2xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <Icon name="ArrowDownToLine" size={18} className="text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center gap-2">
                    <span className="font-display font-bold text-emerald-400">+{o.amount.toLocaleString('ru')} ₽</span>
                    <span className={`text-xs font-semibold ${meta.color}`}>{meta.label}</span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate mt-0.5">
                    {o.user_name || o.user_email || '—'}
                  </div>
                  <div className="flex justify-between mt-0.5">
                    <span className="text-xs font-mono text-muted-foreground/50">{o.order_number}</span>
                    <span className="text-xs text-muted-foreground/50">{new Date(o.created_at).toLocaleString('ru')}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}