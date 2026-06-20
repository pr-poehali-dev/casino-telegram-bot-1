import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import SlotsGame from '@/components/SlotsGame';
import CoinGame from '@/components/CoinGame';

type Section = 'home' | 'deposit' | 'withdraw' | 'games' | 'stats' | 'profile' | 'support';

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
    if (id === 'slots' || id === 'coin') {
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
          ) : (
            <>
              {section === 'home' && <HomeView balance={balance} setSection={setSection} openGame={openGame} notify={notify} />}
              {section === 'games' && <GamesView openGame={openGame} />}
              {section === 'deposit' && <DepositView notify={notify} />}
              {section === 'withdraw' && <WithdrawView balance={balance} notify={notify} />}
              {section === 'stats' && <StatsView />}
              {section === 'profile' && <ProfileView setSection={setSection} notify={notify} />}
              {section === 'support' && <SupportView notify={notify} />}
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

function DepositView({ notify }: { notify: (m: string) => void }) {
  const [amount, setAmount] = useState(1000);
  const methods = [
    { name: 'Банковская карта', icon: 'CreditCard' },
    { name: 'СБП', icon: 'Smartphone' },
    { name: 'Крипто (USDT)', icon: 'Bitcoin' },
    { name: 'ЮMoney', icon: 'Wallet' },
  ];
  return (
    <div className="space-y-5">
      <SectionTitle title="Пополнение" subtitle="Пополни баланс мгновенно" icon="ArrowDownToLine" />
      <div className="glass rounded-2xl p-5 animate-float-up">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">Сумма пополнения</span>
        <div className="flex items-end gap-1 mt-1 mb-4">
          <span className="font-display text-4xl font-bold gold-text tabular-nums">{amount.toLocaleString('ru')}</span>
          <span className="text-gold/70 mb-1">₽</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[500, 1000, 5000, 10000].map((v) => (
            <button
              key={v}
              onClick={() => setAmount(v)}
              className={`py-2 rounded-xl text-sm font-semibold transition-all ${amount === v ? 'gold-gradient text-background' : 'glass text-foreground/70'}`}
            >
              {v >= 1000 ? `${v / 1000}к` : v}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2.5">
        {methods.map((m, i) => (
          <button
            key={m.name}
            onClick={() => notify(`Пополнение через ${m.name}`)}
            className="animate-float-up w-full glass rounded-2xl p-4 flex items-center gap-3 hover-lift"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center text-gold">
              <Icon name={m.icon} size={20} />
            </div>
            <span className="font-medium flex-1 text-left">{m.name}</span>
            <Icon name="ChevronRight" size={18} className="text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}

function WithdrawView({ balance, notify }: { balance: number; notify: (m: string) => void }) {
  return (
    <div className="space-y-5">
      <SectionTitle title="Вывод средств" subtitle="Выведи выигрыш на карту" icon="ArrowUpFromLine" />
      <div className="glass rounded-2xl p-5 animate-float-up text-center">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">Доступно к выводу</span>
        <div className="font-display text-4xl font-bold gold-text my-2 tabular-nums">{balance.toLocaleString('ru')} ₽</div>
        <input
          placeholder="Введите сумму"
          className="w-full bg-background/50 border border-gold/20 rounded-xl px-4 py-3 text-center font-display text-lg outline-none focus:border-gold/50 transition-colors mt-2"
        />
        <input
          placeholder="Номер карты / кошелька"
          className="w-full bg-background/50 border border-gold/20 rounded-xl px-4 py-3 text-center outline-none focus:border-gold/50 transition-colors mt-3"
        />
        <Button onClick={() => notify('Запрос на вывод отправлен')} className="w-full gold-gradient text-background font-semibold h-12 mt-4 glow-gold">
          <Icon name="Send" size={18} className="mr-1.5" /> Запросить вывод
        </Button>
        <p className="text-[11px] text-muted-foreground mt-3 flex items-center justify-center gap-1">
          <Icon name="Clock" size={12} /> Обработка до 15 минут
        </p>
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
          <div className="w-20 h-20 rounded-2xl gold-gradient mx-auto flex items-center justify-center glow-gold mb-3">
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