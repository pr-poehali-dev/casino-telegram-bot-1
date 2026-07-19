import { useState, useCallback, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useRobokassa, openPaymentPage } from '@/components/extensions/robokassa/useRobokassa';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { exportToExcel } from '@/lib/exportExcel';
import SlotsGame from '@/components/SlotsGame';
import CoinGame from '@/components/CoinGame';
import DiceGame from '@/components/DiceGame';
import RouletteGame from '@/components/RouletteGame';
import BlackjackGame from '@/components/BlackjackGame';
import MinesGame from '@/components/MinesGame';
import CrashGame from '@/components/CrashGame';
import WheelGame from '@/components/WheelGame';
import VideoPokerGame from '@/components/VideoPokerGame';
import BullsBears from '@/components/BullsBears';
import HiLoGame from '@/components/HiLoGame';
import BingoGame from '@/components/BingoGame';
import KenoGame from '@/components/KenoGame';
import NumberGuessGame from '@/components/NumberGuessGame';
import { isPushSubscribed, subscribeToPush, unsubscribeFromPush } from '@/lib/push';

type Section = 'home' | 'deposit' | 'withdraw' | 'games' | 'stats' | 'profile' | 'support' | 'admin' | 'referral' | 'daily' | 'history' | 'leaderboard' | 'spin' | 'verify-email' | 'verify-phone' | 'achievements' | 'loyalty' | 'quests';

const GAMES = [
  { id: 'roulette', name: 'Рулетка', icon: 'CircleDot', desc: 'Красное или чёрное', accent: 'crimson', emoji: '🎡' },
  { id: 'slots', name: 'Слоты', icon: 'Cherry', desc: 'Крути барабаны', accent: 'gold', emoji: '🎰' },
  { id: 'blackjack', name: 'Блэкджек', icon: 'Spade', desc: 'Собери 21', accent: 'emerald', emoji: '🃏' },
  { id: 'dice', name: 'Кости', icon: 'Dices', desc: 'Брось кубики', accent: 'gold', emoji: '🎲' },
  { id: 'coin', name: 'Монета', icon: 'CircleDollarSign', desc: 'Орёл или решка', accent: 'crimson', emoji: '🪙' },
  { id: 'mines', name: 'Мины', icon: 'Bomb', desc: 'Открывай, не взорвись', accent: 'emerald', emoji: '💣' },
  { id: 'crash', name: 'Краш', icon: 'Rocket', desc: 'Забери до краша', accent: 'crimson', emoji: '🚀' },
  { id: 'wheel', name: 'Колесо', icon: 'CircleDot', desc: 'Крути и умножай', accent: 'gold', emoji: '🎡' },
  { id: 'videopoker', name: 'Видеопокер', icon: 'Spade', desc: 'Держи и меняй карты', accent: 'emerald', emoji: '🂱' },
  { id: 'bulls', name: 'Быки/Медведи', icon: 'TrendingUp',  desc: 'Угадай движение рынка', accent: 'emerald', emoji: '📈' },
  { id: 'hilo',  name: 'Hi-Lo',        icon: 'ChevronsUpDown', desc: 'Выше или ниже?',      accent: 'gold',    emoji: '🎴' },
  { id: 'bingo', name: 'Бинго',  icon: 'Grid3x3',   desc: 'Собери линию на карточке',   accent: 'crimson', emoji: '🎱' },
  { id: 'keno',  name: 'Кено',   icon: 'Target',    desc: 'Выбери числа и жди шары',    accent: 'gold',    emoji: '🎯' },
  { id: 'numbers', name: 'Числа', icon: 'Hash', desc: 'Угадай число от 1 до 100', accent: 'emerald', emoji: '🔢' },
];

const NAV = [
  { id: 'home' as Section, name: 'Меню', icon: 'LayoutGrid' },
  { id: 'games' as Section, name: 'Игры', icon: 'Gamepad2' },
  { id: 'deposit' as Section, name: 'Касса', icon: 'Wallet' },
  { id: 'leaderboard' as Section, name: 'Топ', icon: 'Trophy' },
  { id: 'profile' as Section, name: 'Профиль', icon: 'User' },
];

const accentColor = (a: string) =>
  a === 'crimson' ? 'hsl(var(--crimson))' : a === 'emerald' ? 'hsl(var(--emerald))' : 'hsl(var(--gold))';

const AUTH_API = 'https://functions.poehali.dev/e956557c-ce79-4797-8cec-5934cb2924d8';
const AUTH_TOKEN_KEY = 'casino_auth_token';

interface AuthUser {
  id: number; email: string; username: string; balance: number; referral_code?: string;
  vip_level?: string; vip_label?: string; vip_emoji?: string; vip_cashback_pct?: number;
  total_deposited?: number; cashback_available?: number; cashback_next_claim_at?: string | null;
  next_vip_level?: string; next_vip_label?: string; next_vip_min?: number; next_vip_emoji?: string;
  avatar_url?: string | null;
  first_deposit_bonus_claimed?: boolean;
  email_verified?: boolean;
  phone?: string | null;
  phone_verified?: boolean;
  loyalty_points?: number;
  loyalty_points_lifetime?: number;
  loyalty_level?: string;
  loyalty_label?: string;
  loyalty_emoji?: string;
  loyalty_multiplier?: number;
  loyalty_next_level?: string | null;
  loyalty_next_label?: string | null;
  loyalty_next_min?: number | null;
  loyalty_next_emoji?: string | null;
  telegram_linked?: boolean;
  telegram_username?: string | null;
}

interface Achievement {
  id: string; name: string; desc: string; icon: string; reward: number; category: string;
  unlocked?: boolean; unlocked_at?: string | null;
}

interface Quest {
  id: string; name: string; desc: string; icon: string; reward: number; game: string;
  type: string; target: number; progress?: number; completed?: boolean; completed_at?: string | null;
}

function useAnimatedNumber(value: number, duration = 600) {
  const [display, setDisplay] = useState(value);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    startRef.current = null;

    const step = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutExpo
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setDisplay(Math.round(from + (to - from) * ease));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value, duration]);

  return display;
}

const THEME_KEY = 'casino_theme';

function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    (localStorage.getItem(THEME_KEY) as 'dark' | 'light') || 'dark'
  );
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('theme-light', 'theme-dark');
    if (theme === 'light') root.classList.add('theme-light');
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);
  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark');
  return { theme, toggle };
}

export default function Index() {
  const { theme, toggle: toggleTheme } = useTheme();
  const [section, setSection] = useState<Section>('home');
  const [balance, setBalance] = useState(0);
  const animatedBalance = useAnimatedNumber(balance, 700);
  const [activeGame, setActiveGame] = useState<string | null>(null);
  const [pendingWithdrawals, setPendingWithdrawals] = useState(0);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [canClaimBonus, setCanClaimBonus] = useState(false);
  const [canSpin, setCanSpin] = useState(false);

  // При старте — восстанавливаем сессию из localStorage (retry до 3 раз)
  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) { setAuthLoading(false); return; }
    const tryMe = async (attempt: number) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        const r = await fetch(`${AUTH_API}?action=me`, {
          headers: { 'X-Auth-Token': token },
          signal: controller.signal,
        });
        clearTimeout(timer);
        const data = r.ok ? await r.json() : null;
        if (data?.user) { setUser(data.user); setBalance(data.user.balance); checkDailyBonus(token); checkSpinStatus(token); }
        else localStorage.removeItem(AUTH_TOKEN_KEY);
        setAuthLoading(false);
      } catch {
        if (attempt < 3) { setTimeout(() => tryMe(attempt + 1), attempt * 1000); return; }
        localStorage.removeItem(AUTH_TOKEN_KEY);
        setAuthLoading(false);
      }
    };
    tryMe(1);
  }, []);

  const checkDailyBonus = useCallback((token: string) => {
    fetch(`${AUTH_API}?action=daily-status`, { headers: { 'X-Auth-Token': token } })
      .then(r => r.json())
      .then(d => setCanClaimBonus(d.can_claim || false))
      .catch(() => {});
  }, []);

  const checkSpinStatus = useCallback((token: string) => {
    fetch(`${AUTH_API}?action=spin-status`, { headers: { 'X-Auth-Token': token } })
      .then(r => r.json())
      .then(d => setCanSpin(d.can_spin || false))
      .catch(() => {});
  }, []);

  const handleAuthSuccess = (token: string, u: AuthUser) => {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    setUser(u);
    setBalance(u.balance);
    checkDailyBonus(token);
    checkSpinStatus(token);
  };

  const handleLogout = async () => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) {
      await fetch(`${AUTH_API}?action=logout`, { method: 'POST', headers: { 'X-Auth-Token': token } });
    }
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setUser(null);
    setBalance(0);
    setSection('home');
  };

  // Запись результата игры в историю
  // addToBalance=true — прибавить награду к локальному балансу (для эндпоинтов,
  // которые не возвращают итоговый баланс с учётом наград). Для action=balance
  // сервер уже включает награду в возвращаемый balance — там addToBalance=false.
  const notifyNewAchievements = useCallback((list?: Achievement[], addToBalance = true) => {
    if (!list || list.length === 0) return;
    list.forEach((a, i) => {
      setTimeout(() => {
        toast.success(`${a.icon} Достижение открыто: ${a.name}`, {
          description: a.reward > 0 ? `+${a.reward.toLocaleString('ru')} ₽ на баланс` : a.desc,
          duration: 5000,
        });
      }, i * 700);
    });
    if (addToBalance) {
      const totalReward = list.reduce((s, a) => s + (a.reward || 0), 0);
      if (totalReward > 0) setBalance(b => b + totalReward);
    }
  }, []);

  const notifyNewQuests = useCallback((list?: Quest[]) => {
    if (!list || list.length === 0) return;
    list.forEach((q, i) => {
      setTimeout(() => {
        toast.success(`${q.icon} Задание выполнено: ${q.name}`, {
          description: q.reward > 0 ? `+${q.reward.toLocaleString('ru')} ₽ на баланс` : q.desc,
          duration: 5000,
        });
      }, i * 700);
    });
    const totalReward = list.reduce((s, q) => s + (q.reward || 0), 0);
    if (totalReward > 0) setBalance(b => b + totalReward);
  }, []);

  const recordGame = useCallback(async (gameName: string, bet: number, result: number, isWin: boolean, details: object) => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return;
    fetch(`${AUTH_API}?action=record-game`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
      body: JSON.stringify({ game: gameName, bet, result, is_win: isWin, details }),
    }).then(r => r.json()).then(d => {
      notifyNewAchievements(d.new_achievements);
      notifyNewQuests(d.new_quests);
    }).catch(() => {});
  }, [notifyNewAchievements, notifyNewQuests]);

  // Синхронизируем баланс с БД при изменении.
  // Баланс обновляется оптимистично, но при отказе сервера (лимит ставки,
  // недостаточно средств, rate-limit) — откатывается на реальное значение из БД.
  const syncBalance = useCallback(async (delta: number, isDeposit = false) => {
    setBalance(b => b + delta);
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return;
    try {
      const res = await fetch(`${AUTH_API}?action=balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ delta, is_deposit: isDeposit }),
      });
      const data = await res.json();
      if (res.ok) {
        setBalance(data.balance);
        if (isDeposit) {
          // Показываем тост с бонусом первого депозита
          if (data.first_deposit_bonus > 0) {
            toast.success(`🎉 Бонус первого депозита: +${data.first_deposit_bonus.toLocaleString('ru')} ₽`, {
              description: 'Бонус 100% зачислен на баланс!',
              duration: 6000,
            });
          }
          notifyNewAchievements(data.new_achievements, false);
          // Обновляем данные пользователя (VIP-уровень и флаг бонуса)
          fetch(`${AUTH_API}?action=me`, { headers: { 'X-Auth-Token': token } })
            .then(r => r.json()).then(d => { if (d.user) setUser(d.user); }).catch(() => {});
        }
        // Начислены очки лояльности за ставку — обновляем локально без лишнего запроса
        if (data.loyalty_earned > 0) {
          setUser(prev => prev ? {
            ...prev,
            loyalty_points: (prev.loyalty_points || 0) + data.loyalty_earned,
            loyalty_points_lifetime: (prev.loyalty_points_lifetime || 0) + data.loyalty_earned,
          } : prev);
        }
      } else {
        // Сервер отклонил операцию — откатываем оптимистичное изменение
        // и подтягиваем реальный баланс из БД
        setBalance(b => b - delta);
        toast.error(data.error || 'Операция отклонена сервером');
        fetch(`${AUTH_API}?action=me`, { headers: { 'X-Auth-Token': token } })
          .then(r => r.json()).then(d => { if (d.user) setBalance(d.user.balance); }).catch(() => {});
      }
    } catch {
      // Сетевая ошибка — тоже откатываем, чтобы не показывать фейковый баланс
      setBalance(b => b - delta);
      toast.error('Ошибка сети, баланс не обновлён');
    }
  }, [notifyNewAchievements]);

  const notify = (msg: string) => toast(msg, { description: 'Эта функция настраивается отдельно — напишите детали.' });

  const handleUserUpdate = (updates: Partial<AuthUser>) => {
    setUser(prev => prev ? { ...prev, ...updates } : prev);
  };

  const openGame = (id: string) => {
    setActiveGame(id);
  };

  // Экран загрузки
  if (authLoading) {
    return (
      <div className="dark min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl gold-gradient flex items-center justify-center glow-gold animate-pulse">
            <Icon name="Diamond" size={28} className="text-background" />
          </div>
          <Icon name="Loader" size={24} className="animate-spin text-gold" />
        </div>
      </div>
    );
  }

  // Экран входа/регистрации
  if (!user) {
    return <AuthScreen onSuccess={handleAuthSuccess} />;
  }

  return (
    <div className={`${theme === 'dark' ? 'dark' : 'theme-light'} min-h-screen bg-background text-foreground overflow-x-hidden`}>
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
            <span className="font-display font-semibold text-gold tabular-nums">{animatedBalance.toLocaleString('ru')}</span>
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
              onBalanceChange={(delta) => syncBalance(delta)}
              onGameResult={(bet, result, isWin, details) => recordGame('Слоты', bet, result, isWin, details)}
              onBack={() => setActiveGame(null)}
            />
          ) : activeGame === 'coin' ? (
            <CoinGame
              balance={balance}
              onBalanceChange={(delta) => syncBalance(delta)}
              onGameResult={(bet, result, isWin, details) => recordGame('Монета', bet, result, isWin, details)}
              onBack={() => setActiveGame(null)}
            />
          ) : activeGame === 'dice' ? (
            <DiceGame
              balance={balance}
              onBalanceChange={(delta) => syncBalance(delta)}
              onGameResult={(bet, result, isWin, details) => recordGame('Кости', bet, result, isWin, details)}
              onBack={() => setActiveGame(null)}
            />
          ) : activeGame === 'roulette' ? (
            <RouletteGame
              balance={balance}
              onBalanceChange={(delta) => syncBalance(delta)}
              onGameResult={(bet, result, isWin, details) => recordGame('Рулетка', bet, result, isWin, details)}
              onBack={() => setActiveGame(null)}
            />
          ) : activeGame === 'blackjack' ? (
            <BlackjackGame
              balance={balance}
              onBalanceChange={(delta) => syncBalance(delta)}
              onGameResult={(bet, result, isWin, details) => recordGame('Блэкджек', bet, result, isWin, details)}
              onBack={() => setActiveGame(null)}
            />
          ) : activeGame === 'mines' ? (
            <MinesGame
              balance={balance}
              onBalanceChange={(delta) => syncBalance(delta)}
              onGameResult={(bet, result, isWin, details) => recordGame('Мины', bet, result, isWin, details)}
              onBack={() => setActiveGame(null)}
            />
          ) : activeGame === 'crash' ? (
            <CrashGame
              balance={balance}
              onBalanceChange={(delta) => syncBalance(delta)}
              onGameResult={(bet, result, isWin, details) => recordGame('Краш', bet, result, isWin, details)}
              onBack={() => setActiveGame(null)}
            />
          ) : activeGame === 'wheel' ? (
            <WheelGame
              balance={balance}
              onBalanceChange={(delta) => syncBalance(delta)}
              onGameResult={(bet, result, isWin, details) => recordGame('Колесо', bet, result, isWin, details)}
              onBack={() => setActiveGame(null)}
            />
          ) : activeGame === 'videopoker' ? (
            <VideoPokerGame
              balance={balance}
              onBalanceChange={(delta) => syncBalance(delta)}
              onGameResult={(bet, result, isWin, details) => recordGame('Видеопокер', bet, result, isWin, details)}
              onBack={() => setActiveGame(null)}
            />
          ) : activeGame === 'bulls' ? (
            <BullsBears
              balance={balance}
              onBalanceChange={(delta) => syncBalance(delta)}
              onGameResult={(bet, result, isWin, details) => recordGame('Быки/Медведи', bet, result, isWin, details)}
              onBack={() => setActiveGame(null)}
            />
          ) : activeGame === 'hilo' ? (
            <HiLoGame
              balance={balance}
              onBalanceChange={(delta) => syncBalance(delta)}
              onGameResult={(bet, result, isWin, details) => recordGame('Hi-Lo', bet, result, isWin, details)}
              onBack={() => setActiveGame(null)}
            />
          ) : activeGame === 'bingo' ? (
            <BingoGame
              balance={balance}
              onBalanceChange={(delta) => syncBalance(delta)}
              onGameResult={(bet, result, isWin, details) => recordGame('Бинго', bet, result, isWin, details)}
              onBack={() => setActiveGame(null)}
            />
          ) : activeGame === 'keno' ? (
            <KenoGame
              balance={balance}
              onBalanceChange={(delta) => syncBalance(delta)}
              onGameResult={(bet, result, isWin, details) => recordGame('Кено', bet, result, isWin, details)}
              onBack={() => setActiveGame(null)}
            />
          ) : activeGame === 'numbers' ? (
            <NumberGuessGame
              balance={balance}
              onBalanceChange={(delta) => syncBalance(delta)}
              onGameResult={(bet, result, isWin, details) => recordGame('Числа', bet, result, isWin, details)}
              onBack={() => setActiveGame(null)}
            />
          ) : (
            <>
              {section === 'home' && <HomeView balance={balance} setSection={setSection} openGame={openGame} notify={notify} canClaimBonus={canClaimBonus} user={user} canSpin={canSpin} />}
              {section === 'games' && <GamesView openGame={openGame} />}
              {section === 'deposit' && <DepositView notify={notify} onBalanceChange={syncBalance} />}
              {section === 'withdraw' && <WithdrawView balance={balance} notify={notify} user={user} setSection={setSection} />}
              {section === 'stats' && <StatsView />}
              {section === 'profile' && <ProfileView setSection={setSection} notify={notify} user={user} onLogout={handleLogout} onBalanceChange={syncBalance} onUserUpdate={handleUserUpdate} theme={theme} onToggleTheme={toggleTheme} />}
              {section === 'support' && <SupportView notify={notify} />}
              {section === 'admin' && <AdminView onPendingChange={setPendingWithdrawals} />}
              {section === 'referral' && <ReferralView user={user} onBack={() => setSection('profile')} />}
              {section === 'daily' && <DailyBonusView onBack={() => setSection('home')} onClaimed={(bonus, balance) => { syncBalance(0); setBalance(balance); setSection('home'); }} />}
              {section === 'history' && <GameHistoryView onBack={() => setSection('profile')} />}
              {section === 'leaderboard' && <LeaderboardView />}
              {section === 'spin' && <DailySpinView onBack={() => setSection('home')} onClaimed={(prize, bal) => { setBalance(bal); setCanSpin(false); }} />}
              {section === 'verify-email' && <EmailVerifyView user={user} onBack={() => setSection('profile')} onVerified={() => handleUserUpdate({ email_verified: true })} />}
              {section === 'verify-phone' && <PhoneVerifyView user={user} onBack={() => setSection('withdraw')} onVerified={() => handleUserUpdate({ phone_verified: true })} />}
              {section === 'achievements' && <AchievementsView onBack={() => setSection('profile')} />}
              {section === 'quests' && <QuestsView onBack={() => setSection('profile')} openGame={openGame} />}
              {section === 'loyalty' && <LoyaltyView onBack={() => setSection('profile')} onBalanceChange={syncBalance} onUserUpdate={handleUserUpdate} />}
            </>
          )}
        </main>

        {/* Bottom Nav */}
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-30 glass border-t border-gold/10 px-3 py-2 flex justify-around">
          {NAV.map((item) => {
            const active = section === item.id;
            const showBadge = item.id === 'profile' && pendingWithdrawals > 0;
            return (
              <button
                key={item.id}
                onClick={() => { setActiveGame(null); setSection(item.id); }}
                className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all"
              >
                <div className={`relative flex items-center justify-center transition-all ${active ? 'scale-110 text-gold' : 'opacity-50'}`}>
                  <Icon name={item.icon} size={22} />
                  {showBadge && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-1 leading-none">
                      {pendingWithdrawals > 9 ? '9+' : pendingWithdrawals}
                    </span>
                  )}
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

function HomeView({ balance, setSection, openGame, notify, canClaimBonus, user, canSpin }: { balance: number; setSection: (s: Section) => void; openGame: (id: string) => void; notify: (m: string) => void; canClaimBonus?: boolean; user?: AuthUser | null; canSpin?: boolean }) {
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

          {/* Ежедневный бонус */}
          {canClaimBonus && (
            <button onClick={() => setSection('daily')}
              className="mt-3 w-full flex items-center gap-3 rounded-2xl px-4 py-3 border border-gold/40 bg-gold/5 hover:bg-gold/10 transition-all animate-pulse-slow">
              <div className="w-9 h-9 rounded-xl gold-gradient flex items-center justify-center shrink-0 glow-gold">
                <Icon name="Gift" size={18} className="text-background" />
              </div>
              <div className="text-left flex-1">
                <div className="text-sm font-bold gold-text">Ежедневный бонус доступен!</div>
                <div className="text-xs text-muted-foreground">Нажми и получи до 100 ₽</div>
              </div>
              <Icon name="ChevronRight" size={18} className="text-gold" />
            </button>
          )}

          {/* Колесо фортуны */}
          {canSpin && (
            <button onClick={() => setSection('spin')}
              className="mt-2 w-full flex items-center gap-3 rounded-2xl px-4 py-3 border border-purple-400/40 bg-purple-500/5 hover:bg-purple-500/10 transition-all animate-pulse-slow">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xl"
                style={{ background: 'linear-gradient(135deg,#a78bfa,#7c3aed)', boxShadow: '0 0 12px #a78bfa50' }}>
                🎡
              </div>
              <div className="text-left flex-1">
                <div className="text-sm font-bold text-purple-300">Бесплатный спин готов!</div>
                <div className="text-xs text-muted-foreground">Крути колесо фортуны</div>
              </div>
              <Icon name="ChevronRight" size={18} className="text-purple-400" />
            </button>
          )}
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
            <GameCard key={g.id} game={g} delay={120 + i * 60} onClick={() => openGame(g.id)} />
          ))}
        </div>
      </div>

      {!user?.first_deposit_bonus_claimed && (
        <div className="animate-float-up relative rounded-2xl overflow-hidden p-5 glow-gold" style={{ animationDelay: '360ms', background: 'linear-gradient(120deg, hsl(348 83% 25%), hsl(240 28% 8%))' }}>
          <div className="relative z-10">
            <div className="flex items-center gap-1.5 text-gold text-xs font-semibold uppercase tracking-wider mb-1">
              <Icon name="Gift" size={14} /> Бонус новичка
            </div>
            <h3 className="font-display text-2xl font-bold">+100% на первый депозит</h3>
            <p className="text-sm text-foreground/70 mt-1">Удвой свой стартовый баланс прямо сейчас</p>
            <button onClick={() => setSection('deposit')} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-gold hover:opacity-80 transition-opacity">
              Пополнить и получить бонус <Icon name="ArrowRight" size={16} />
            </button>
          </div>
        </div>
      )}
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

function GamesView({ openGame }: { openGame: (id: string) => void }) {
  return (
    <div className="space-y-5">
      <SectionTitle title="Игры" subtitle="Выбери, во что сыграть" icon="Gamepad2" />
      <div className="grid grid-cols-2 gap-3">
        {GAMES.map((g, i) => (
          <GameCard key={g.id} game={g} delay={i * 70} onClick={() => openGame(g.id)} />
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
const ORDER_STATUS_API = 'https://functions.poehali.dev/e956557c-ce79-4797-8cec-5934cb2924d8';

type DepositStep = 'method' | 'amount' | 'user-info' | 'crypto-form' | 'redirecting' | 'waiting' | 'success';

function DepositView({ notify: _notify, onBalanceChange }: { notify: (m: string) => void; onBalanceChange: (delta: number, isDeposit?: boolean) => void }) {
  const [step, setStep] = useState<DepositStep>('method');
  const [method, setMethod] = useState<typeof DEPOSIT_METHODS[0] | null>(null);
  const [amount, setAmount] = useState(1000);
  const [customAmount, setCustomAmount] = useState('');
  const [firstDepositBonus, setFirstDepositBonus] = useState(0);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [userTelegram, setUserTelegram] = useState('');
  const [paidAmount, setPaidAmount] = useState(0);
  const [orderNumber, setOrderNumber] = useState('');
  const sessionIdRef = useRef('');
  const pollRef = useRef<number | null>(null);

  const finalAmount = customAmount ? parseInt(customAmount) || 0 : amount;

  const [promoCode, setPromoCode] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoSuccess, setPromoSuccess] = useState('');
  const [promoError, setPromoError] = useState('');

  const activatePromo = async () => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) { setPromoError('Войдите в аккаунт'); return; }
    if (!promoCode.trim()) { setPromoError('Введите промокод'); return; }
    setPromoLoading(true); setPromoError(''); setPromoSuccess('');
    try {
      const res = await fetch(`${AUTH_API}?action=promo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ code: promoCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setPromoError(data.error || 'Ошибка'); }
      else {
        setPromoSuccess(`+${data.bonus_amount.toLocaleString('ru')} ₽ зачислено на баланс!`);
        onBalanceChange(0);
        setPromoCode('');
      }
    } catch { setPromoError('Ошибка сети'); }
    finally { setPromoLoading(false); }
  };

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
        const res = await fetch(`${ORDER_STATUS_API}?action=order-status&session_id=${sid}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'paid') {
            if (pollRef.current) clearInterval(pollRef.current);
            setPaidAmount(data.amount);
            setOrderNumber(data.order_number);
            // Читаем бонус первого депозита из ответа balance API
            const token = localStorage.getItem(AUTH_TOKEN_KEY);
            if (token) {
              try {
                const br = await fetch(`${AUTH_API}?action=balance`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
                  body: JSON.stringify({ delta: data.amount, is_deposit: true }),
                });
                if (br.ok) {
                  const bd = await br.json();
                  if (bd.first_deposit_bonus > 0) setFirstDepositBonus(bd.first_deposit_bonus);
                }
              } catch { /* ignore */ }
            }
            onBalanceChange(0, true); // обновляем user (VIP, флаг бонуса), баланс уже обновлён выше
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
          {firstDepositBonus > 0 && (
            <div className="animate-win-pop w-full rounded-2xl p-4 flex items-center gap-3 text-left"
              style={{ background: 'linear-gradient(120deg, hsl(348 83% 22%), hsl(43 74% 52% / 0.15))' }}>
              <div className="w-10 h-10 rounded-full gold-gradient flex items-center justify-center shrink-0">
                <Icon name="Gift" size={20} className="text-background" />
              </div>
              <div>
                <p className="text-xs text-gold/80 font-semibold uppercase tracking-wider">Бонус новичка</p>
                <p className="font-display font-bold text-xl gold-text">+{firstDepositBonus.toLocaleString('ru')} ₽</p>
                <p className="text-xs text-muted-foreground">100% бонус за первый депозит</p>
              </div>
            </div>
          )}
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
      <div className="animate-float-up space-y-2" style={{ animationDelay: '280ms' }}>
        <p className="text-xs text-muted-foreground uppercase tracking-wider px-1">Промокод</p>
        {promoSuccess ? (
          <div className="glass rounded-2xl p-4 flex items-center gap-3 border border-emerald-500/30 bg-emerald-500/5">
            <Icon name="CheckCircle" size={20} className="text-emerald-400 shrink-0" />
            <span className="text-sm font-semibold text-emerald-400">{promoSuccess}</span>
          </div>
        ) : (
          <div className="glass rounded-2xl p-3 flex gap-2">
            <input
              value={promoCode}
              onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoError(''); }}
              onKeyDown={e => e.key === 'Enter' && activatePromo()}
              placeholder="Введите промокод"
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground/50 uppercase tracking-wider"
            />
            <button
              onClick={activatePromo}
              disabled={promoLoading || !promoCode.trim()}
              className="shrink-0 gold-gradient text-background text-xs font-bold px-4 py-2 rounded-xl disabled:opacity-50"
            >
              {promoLoading ? <Icon name="Loader" size={14} className="animate-spin" /> : 'Активировать'}
            </button>
          </div>
        )}
        {promoError && <p className="text-xs text-red-400 px-1">{promoError}</p>}
      </div>

      <div className="animate-float-up glass rounded-xl p-3 flex items-center gap-2 text-xs text-muted-foreground" style={{ animationDelay: '340ms' }}>
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

type WithdrawStep = 'method' | 'form' | 'confirm' | 'success' | 'history';

const WITHDRAW_API = 'https://functions.poehali.dev/5264284f-4bd1-4c29-9530-a9fd03734d4d';

const WD_STATUS_META: Record<string, { label: string; color: string; icon: string }> = {
  pending:    { label: 'На рассмотрении', color: 'text-amber-400',   icon: 'Clock' },
  processing: { label: 'В обработке',     color: 'text-blue-400',    icon: 'Loader' },
  paid:       { label: 'Выплачено',        color: 'text-emerald-400', icon: 'CheckCircle' },
  rejected:   { label: 'Отклонено',        color: 'text-red-400',     icon: 'XCircle' },
};

function WithdrawView({ balance, notify: _notify, user, setSection }: { balance: number; notify: (m: string) => void; user?: AuthUser | null; setSection?: (s: Section) => void }) {
  const [step, setStep] = useState<WithdrawStep>('method');
  const [method, setMethod] = useState<typeof WITHDRAW_METHODS[0] | null>(null);
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userTelegram, setUserTelegram] = useState('');
  const [requestNumber, setRequestNumber] = useState('');
  const [withdrawalId, setWithdrawalId] = useState<number | null>(null);
  const [wdStatus, setWdStatus] = useState<string>('pending');
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<number | null>(null);

  // Лимиты вывода
  const [limits, setLimits] = useState<{
    min_withdraw: number; max_withdraw: number;
    daily_limit: number; daily_used: number; daily_left: number;
    email_verified?: boolean;
    phone_verified?: boolean;
    phone_verify_threshold?: number;
  } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY) || '';
    fetch(`${WITHDRAW_API}?action=limits`, { headers: { 'X-Auth-Token': token } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setLimits(d); })
      .catch(() => {});
  }, []);

  // История выводов
  interface WdHistoryItem { id: number; request_number: string; method: string; destination: string; amount: number; status: string; created_at: string; updated_at: string; }
  const [history, setHistory] = useState<WdHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadHistory = async () => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY) || '';
    if (!token) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`${AUTH_API}?action=my-withdrawals`, { headers: { 'X-Auth-Token': token } });
      if (res.ok) { const d = await res.json(); setHistory(d.withdrawals || []); }
    } finally { setHistoryLoading(false); }
  };

  const parsedAmount = parseInt(amount) || 0;
  const inputCls = 'w-full bg-background/60 border border-gold/20 rounded-xl px-4 py-3 outline-none focus:border-gold/50 transition-colors text-foreground placeholder:text-muted-foreground/50';

  // Поллинг статуса заявки каждые 5 секунд
  useEffect(() => {
    if (step !== 'success' || !withdrawalId) return;
    const token = localStorage.getItem(AUTH_TOKEN_KEY) || '';
    const poll = async () => {
      try {
        const res = await fetch(`${WITHDRAW_API}?withdrawal_id=${withdrawalId}`, {
          headers: { 'X-Auth-Token': token },
        });
        if (res.ok) {
          const data = await res.json();
          setWdStatus(data.status);
          if (data.status === 'paid' || data.status === 'rejected') {
            if (pollRef.current) clearInterval(pollRef.current);
          }
        }
      } catch { /* молча */ }
    };
    poll();
    pollRef.current = window.setInterval(poll, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [step, withdrawalId]);

  const reset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setStep('method'); setMethod(null); setAmount(''); setDestination('');
    setUserName(''); setUserEmail(''); setUserTelegram('');
    setWithdrawalId(null); setWdStatus('pending');
  };

  const handleSubmit = async () => {
    if (!method) return;
    setLoading(true);
    try {
      const token = localStorage.getItem(AUTH_TOKEN_KEY) || '';
      const res = await fetch(WITHDRAW_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
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
        setWithdrawalId(data.withdrawal_id);
        setWdStatus('pending');
        setStep('success');
      } else if (data.error === 'phone_not_verified') {
        toast.error(data.message || 'Подтверди телефон перед выводом');
        setSection?.('verify-phone');
      } else if (data.error === 'email_not_verified') {
        toast.error(data.message || 'Подтверди email перед выводом');
        setSection?.('verify-email');
      } else {
        toast.error(data.message || data.error || 'Ошибка отправки заявки');
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

  // ── HISTORY ──
  if (step === 'history') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 animate-float-up">
          <button onClick={() => setStep('method')} className="w-10 h-10 rounded-xl glass flex items-center justify-center text-gold">
            <Icon name="ArrowLeft" size={20} />
          </button>
          <div className="flex-1">
            <h2 className="font-display text-xl font-bold">История выводов</h2>
            <p className="text-xs text-muted-foreground">{history.length} заявок</p>
          </div>
          <button onClick={loadHistory} className="w-9 h-9 glass rounded-xl flex items-center justify-center text-gold">
            <Icon name="RefreshCw" size={15} className={historyLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {historyLoading ? (
          <div className="flex justify-center py-16 text-gold">
            <Icon name="Loader" size={28} className="animate-spin" />
          </div>
        ) : history.length === 0 ? (
          <div className="glass rounded-2xl p-10 flex flex-col items-center gap-3 text-center">
            <Icon name="ArrowUpFromLine" size={36} className="text-gold/30" />
            <p className="text-muted-foreground text-sm">Заявок на вывод ещё не было</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {history.map((w, i) => {
              const meta = WD_STATUS_META[w.status] || WD_STATUS_META.pending;
              const date = new Date(w.created_at);
              const dateStr = date.toLocaleDateString('ru', { day: 'numeric', month: 'short' });
              const timeStr = date.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
              return (
                <div key={w.id} className="animate-float-up glass rounded-2xl p-4 space-y-3"
                  style={{ animationDelay: `${i * 40}ms` }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-gold/10 flex items-center justify-center shrink-0">
                        <Icon name="ArrowUpFromLine" size={16} className="text-gold" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{w.method}</p>
                        <p className="text-xs text-muted-foreground font-mono">{w.destination}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-display font-bold text-base">{w.amount.toLocaleString('ru')} ₽</p>
                      <p className="text-[10px] text-muted-foreground">{dateStr}, {timeStr}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-muted-foreground/60">{w.request_number}</span>
                    <span className={`text-xs font-semibold flex items-center gap-1 ${meta.color}`}>
                      <Icon name={meta.icon} size={12} />
                      {meta.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── SUCCESS ──
  if (step === 'success') {
    const statusMeta = WD_STATUS_META[wdStatus] || WD_STATUS_META.pending;
    const isPaid = wdStatus === 'paid';
    const isRejected = wdStatus === 'rejected';
    return (
      <div className="space-y-5">
        <SectionTitle title="Вывод средств" subtitle="Выведи выигрыш" icon="ArrowUpFromLine" />
        <div className="animate-win-pop glass rounded-3xl p-8 flex flex-col items-center gap-4 text-center glow-soft">
          {/* Иконка статуса */}
          <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500
            ${isPaid ? 'glow-gold' : isRejected ? '' : 'glow-soft'}`}
            style={{ background: isPaid
              ? 'linear-gradient(135deg, hsl(var(--gold)), hsl(40 80% 40%))'
              : isRejected
                ? 'linear-gradient(135deg, #ef4444, #991b1b)'
                : 'linear-gradient(135deg, hsl(var(--emerald)), hsl(158 50% 35%))' }}>
            <Icon name={isPaid ? 'BadgeCheck' : isRejected ? 'XCircle' : 'Check'} size={36} className="text-white" />
          </div>

          <div>
            <h3 className={`font-display text-2xl font-bold ${isPaid ? 'gold-text' : isRejected ? 'text-red-400' : 'text-emerald-400'}`}>
              {isPaid ? 'Выплачено!' : isRejected ? 'Отклонено' : 'Заявка создана!'}
            </h3>
            <p className="text-muted-foreground text-sm mt-1">
              {isPaid
                ? `${parsedAmount.toLocaleString('ru')} ₽ отправлены на ${method?.name}`
                : isRejected
                  ? 'Обратитесь в поддержку за деталями'
                  : `${parsedAmount.toLocaleString('ru')} ₽ будут отправлены в течение ${method?.time}`}
            </p>
          </div>

          {/* Карточка деталей */}
          <div className="w-full glass rounded-2xl p-4 space-y-2.5 text-sm">
            {requestNumber && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Заявка</span>
                <span className="font-mono text-xs text-muted-foreground">{requestNumber}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Метод</span>
              <span className="font-medium">{method?.name}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Реквизиты</span>
              <span className="font-medium font-mono text-xs">{destination.slice(0, 4)}••••{destination.slice(-4)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Сумма</span>
              <span className="font-display font-bold text-emerald-400">{parsedAmount.toLocaleString('ru')} ₽</span>
            </div>
            <div className="w-full h-px bg-white/5" />
            {/* Живой статус */}
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Статус</span>
              <span className={`font-semibold flex items-center gap-1.5 ${statusMeta.color}`}>
                <Icon name={statusMeta.icon} size={14}
                  className={wdStatus === 'processing' ? 'animate-spin' : ''} />
                {statusMeta.label}
              </span>
            </div>
            {!isPaid && !isRejected && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60 justify-center pt-1">
                <Icon name="RefreshCw" size={11} className="animate-spin" />
                Статус обновляется автоматически
              </div>
            )}
          </div>

          <Button onClick={reset} variant="outline"
            className="w-full border-gold/30 text-gold bg-transparent h-12 font-bold hover:bg-gold/10">
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
    const minAmt = Math.max(method.min, limits?.min_withdraw ?? method.min);
    const maxAmt = Math.min(balance, limits?.max_withdraw ?? 50000, limits?.daily_left ?? 100000);
    const phoneThreshold = limits?.phone_verify_threshold ?? 25000;
    const needsPhone = parsedAmount >= phoneThreshold && !limits?.phone_verified;
    const valid = parsedAmount >= minAmt && parsedAmount <= maxAmt && destination.length >= 8 && !needsPhone;
    const presets = [500, 1000, 2000, 5000].filter(v => v <= maxAmt);
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
            <input className={inputCls + ' font-display text-lg'} placeholder={`${minAmt.toLocaleString('ru')} – ${maxAmt.toLocaleString('ru')} ₽`}
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

          {parsedAmount > 0 && parsedAmount < minAmt && (
            <div className="flex items-center gap-2 text-xs text-red-400">
              <Icon name="AlertCircle" size={14} /> Минимальная сумма — {minAmt.toLocaleString('ru')} ₽
            </div>
          )}
          {parsedAmount > balance && (
            <div className="flex items-center gap-2 text-xs text-red-400">
              <Icon name="AlertCircle" size={14} /> Сумма превышает доступный баланс
            </div>
          )}
          {parsedAmount > 0 && parsedAmount <= balance && limits && parsedAmount > limits.max_withdraw && (
            <div className="flex items-center gap-2 text-xs text-red-400">
              <Icon name="AlertCircle" size={14} /> Максимум за одну заявку — {limits.max_withdraw.toLocaleString('ru')} ₽
            </div>
          )}
          {parsedAmount > 0 && parsedAmount <= balance && limits && parsedAmount > limits.daily_left && (
            <div className="flex items-center gap-2 text-xs text-amber-400">
              <Icon name="AlertTriangle" size={14} /> Суточный лимит почти исчерпан. Осталось {limits.daily_left.toLocaleString('ru')} ₽
            </div>
          )}

          {needsPhone && (
            <button
              onClick={() => setSection?.('verify-phone')}
              className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 border border-amber-400/40 bg-amber-400/5 hover:bg-amber-400/10 transition-all text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-amber-400/15 flex items-center justify-center shrink-0">
                <Icon name="Smartphone" size={17} className="text-amber-400" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-bold text-amber-400">Подтверди телефон</div>
                <div className="text-xs text-muted-foreground mt-0.5">Для вывода от {phoneThreshold.toLocaleString('ru')} ₽ нужен подтверждённый номер</div>
              </div>
              <Icon name="ChevronRight" size={16} className="text-amber-400 shrink-0" />
            </button>
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
          <div className="flex justify-between">
            <span className="text-muted-foreground">Мин. / Макс.</span>
            <span className="font-medium">{minAmt.toLocaleString('ru')} / {(limits?.max_withdraw ?? 50000).toLocaleString('ru')} ₽</span>
          </div>
          {limits && limits.daily_used > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Осталось сегодня</span>
              <span className={`font-medium ${limits.daily_left < 5000 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {limits.daily_left.toLocaleString('ru')} ₽
              </span>
            </div>
          )}
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
      <div className="flex items-center justify-between">
        <SectionTitle title="Вывод средств" subtitle="Выведи выигрыш" icon="ArrowUpFromLine" />
        <button
          onClick={() => { loadHistory(); setStep('history'); }}
          className="flex items-center gap-1.5 text-xs font-semibold text-gold glass rounded-xl px-3 py-2 hover:bg-gold/10 transition-colors shrink-0"
        >
          <Icon name="History" size={14} /> История
        </button>
      </div>

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

      {/* Требуется подтверждение email — блокируем вывод */}
      {limits && !limits.email_verified && (
        <button
          onClick={() => setSection?.('verify-email')}
          className="animate-float-up w-full flex items-center gap-3 rounded-2xl px-4 py-4 border border-amber-400/40 bg-amber-400/5 hover:bg-amber-400/10 transition-all text-left"
        >
          <div className="w-11 h-11 rounded-xl bg-amber-400/15 flex items-center justify-center shrink-0">
            <Icon name="ShieldAlert" size={20} className="text-amber-400" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold text-amber-400">Подтверди email перед выводом</div>
            <div className="text-xs text-muted-foreground mt-0.5">Это займёт минуту и защитит твой аккаунт</div>
          </div>
          <Icon name="ChevronRight" size={18} className="text-amber-400 shrink-0" />
        </button>
      )}

      {canWithdraw && limits?.email_verified ? (
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
      ) : canWithdraw ? null : (
        <div className="animate-float-up glass rounded-2xl p-6 flex flex-col items-center gap-3 text-center">
          <Icon name="TrendingUp" size={32} className="text-gold/40" />
          <p className="text-muted-foreground text-sm">Сыграй и выиграй, чтобы вывести средства</p>
        </div>
      )}

      {/* Лимиты */}
      {limits && (
        <div className="animate-float-up glass rounded-2xl p-4 space-y-2.5" style={{ animationDelay: '200ms' }}>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Лимиты вывода</p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Минимальная заявка</span>
              <span className="font-semibold">{limits.min_withdraw.toLocaleString('ru')} ₽</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Максимальная заявка</span>
              <span className="font-semibold">{limits.max_withdraw.toLocaleString('ru')} ₽</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Суточный лимит</span>
              <span className="font-semibold">{limits.daily_limit.toLocaleString('ru')} ₽</span>
            </div>
            <div className="w-full h-px bg-white/5" />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Использовано сегодня</span>
              <span className={limits.daily_used > 0 ? 'font-semibold text-amber-400' : 'font-semibold text-emerald-400'}>
                {limits.daily_used.toLocaleString('ru')} ₽
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Осталось сегодня</span>
              <span className="font-semibold text-emerald-400">{limits.daily_left.toLocaleString('ru')} ₽</span>
            </div>
          </div>
          {/* Прогресс-бар суточного лимита */}
          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, (limits.daily_used / limits.daily_limit) * 100)}%`,
                background: limits.daily_used / limits.daily_limit > 0.8 ? '#ef4444' : 'hsl(43 74% 52%)',
              }} />
          </div>
        </div>
      )}

      <div className="animate-float-up glass rounded-xl p-3 flex items-center gap-2 text-xs text-muted-foreground" style={{ animationDelay: '280ms' }}>
        <Icon name="ShieldCheck" size={14} className="text-gold shrink-0" />
        Выплаты обрабатываются вручную. Комиссия 0%.
      </div>
    </div>
  );
}

const GAME_META: Record<string, { name: string; emoji: string; icon: string }> = {
  roulette:  { name: 'Рулетка',  emoji: '🎡', icon: 'CircleDot' },
  slots:     { name: 'Слоты',    emoji: '🎰', icon: 'Cherry' },
  blackjack: { name: 'Блэкджек', emoji: '🃏', icon: 'Spade' },
  dice:      { name: 'Кости',    emoji: '🎲', icon: 'Dices' },
  coin:      { name: 'Монета',   emoji: '🪙', icon: 'CircleDollarSign' },
  mines:     { name: 'Мины',     emoji: '💣', icon: 'Bomb' },
  crash:     { name: 'Краш',     emoji: '🚀', icon: 'Rocket' },
};

interface GameStats {
  total_games: number; total_wins: number; total_losses: number; winrate: number;
  total_bet: number; total_won: number; total_lost: number; biggest_win: number; profit: number;
  favorite_game: string | null; current_streak: number; streak_type: 'win' | 'loss' | null;
  max_win_streak: number;
  games_stats: { game: string; total: number; wins: number; losses: number; winrate: number; total_bet: number; total_won: number }[];
  recent_games: { game: string; bet: number; result: number; is_win: boolean; created_at: string }[];
}

function WinrateRing({ pct }: { pct: number }) {
  const r = 28; const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width="72" height="72" className="-rotate-90">
      <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
      <circle cx="36" cy="36" r={r} fill="none" stroke="hsl(var(--gold))" strokeWidth="6"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 1s ease' }} />
    </svg>
  );
}

function StatsView() {
  const [data, setData] = useState<GameStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'games' | 'history'>('overview');

  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY) || '';
    if (!token) { setLoading(false); return; }
    fetch(`${AUTH_API}?action=stats`, { headers: { 'X-Auth-Token': token } })
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const fmt = (n: number) => n.toLocaleString('ru');
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  if (loading) return (
    <div className="flex justify-center py-24 text-gold">
      <Icon name="Loader" size={32} className="animate-spin" />
    </div>
  );

  if (!data || data.total_games === 0) return (
    <div className="space-y-5">
      <SectionTitle title="Статистика" subtitle="Твои результаты" icon="TrendingUp" />
      <div className="glass rounded-3xl p-12 flex flex-col items-center gap-4 text-center">
        <Icon name="Dices" size={48} className="text-gold/30" />
        <p className="text-muted-foreground">Сыграй первую игру — здесь появится твоя статистика</p>
      </div>
    </div>
  );

  const favMeta = data.favorite_game ? (GAME_META[data.favorite_game] || { name: data.favorite_game, emoji: '🎮', icon: 'Gamepad2' }) : null;
  const profit = data.profit;

  return (
    <div className="space-y-5">
      <SectionTitle title="Статистика" subtitle="Твои результаты" icon="TrendingUp" />

      {/* Главная карточка — винрейт */}
      <div className="animate-float-up glass rounded-3xl p-5 flex items-center gap-5">
        <div className="relative shrink-0">
          <WinrateRing pct={data.winrate} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display font-bold text-lg leading-none gold-text">{data.winrate}%</span>
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider">win</span>
          </div>
        </div>
        <div className="flex-1 grid grid-cols-3 gap-3">
          <div className="text-center">
            <div className="font-display text-xl font-bold">{fmt(data.total_games)}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Игр</div>
          </div>
          <div className="text-center">
            <div className="font-display text-xl font-bold text-emerald-400">{fmt(data.total_wins)}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Побед</div>
          </div>
          <div className="text-center">
            <div className="font-display text-xl font-bold text-red-400">{fmt(data.total_losses)}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Проигр.</div>
          </div>
        </div>
      </div>

      {/* Серия + любимая игра */}
      <div className="grid grid-cols-2 gap-3">
        {/* Текущая серия */}
        <div className="animate-float-up glass rounded-2xl p-4 space-y-1" style={{ animationDelay: '60ms' }}>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wider mb-2">
            <Icon name="Flame" size={12} className={data.streak_type === 'win' ? 'text-amber-400' : 'text-blue-400'} />
            Текущая серия
          </div>
          <div className={`font-display text-3xl font-bold ${data.streak_type === 'win' ? 'text-amber-400' : 'text-blue-400'}`}>
            {data.current_streak}
          </div>
          <div className="text-xs text-muted-foreground">
            {data.streak_type === 'win' ? '🔥 побед подряд' : '❄️ поражений подряд'}
          </div>
        </div>

        {/* Лучшая серия */}
        <div className="animate-float-up glass rounded-2xl p-4 space-y-1" style={{ animationDelay: '80ms' }}>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wider mb-2">
            <Icon name="Trophy" size={12} className="text-gold" />
            Рекорд серии
          </div>
          <div className="font-display text-3xl font-bold gold-text">{data.max_win_streak}</div>
          <div className="text-xs text-muted-foreground">побед подряд</div>
        </div>

        {/* Любимая игра */}
        {favMeta && (
          <div className="animate-float-up glass rounded-2xl p-4 space-y-1 col-span-2" style={{ animationDelay: '100ms' }}>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wider mb-2">
              <Icon name="Star" size={12} className="text-gold" /> Любимая игра
            </div>
            <div className="flex items-center gap-3">
              <span className="text-3xl">{favMeta.emoji}</span>
              <div>
                <div className="font-display text-xl font-bold">{favMeta.name}</div>
                <div className="text-xs text-muted-foreground">
                  {data.games_stats.find(g => g.game === data.favorite_game)?.total ?? 0} партий сыграно
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Финансы */}
      <div className="animate-float-up grid grid-cols-3 gap-2" style={{ animationDelay: '120ms' }}>
        <div className="glass rounded-2xl p-3 text-center space-y-0.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Поставлено</div>
          <div className="font-display font-bold text-sm">{fmt(Math.round(data.total_bet))} ₽</div>
        </div>
        <div className="glass rounded-2xl p-3 text-center space-y-0.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Лучший выигрыш</div>
          <div className="font-display font-bold text-sm text-emerald-400">+{fmt(Math.round(data.biggest_win))} ₽</div>
        </div>
        <div className="glass rounded-2xl p-3 text-center space-y-0.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Итого</div>
          <div className={`font-display font-bold text-sm ${profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {profit >= 0 ? '+' : ''}{fmt(Math.round(profit))} ₽
          </div>
        </div>
      </div>

      {/* Вкладки */}
      <div className="grid grid-cols-2 gap-2">
        {(['games', 'history'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`py-2.5 rounded-2xl text-sm font-semibold transition-all ${tab === t ? 'gold-gradient text-background glow-gold' : 'glass text-muted-foreground'}`}>
            {t === 'games' ? 'По играм' : 'Последние игры'}
          </button>
        ))}
      </div>

      {/* По играм */}
      {tab === 'games' && (
        <div className="space-y-2">
          {data.games_stats.map((g, i) => {
            const meta = GAME_META[g.game] || { name: g.game, emoji: '🎮', icon: 'Gamepad2' };
            const wr = g.winrate;
            return (
              <div key={g.game} className="animate-float-up glass rounded-2xl p-4" style={{ animationDelay: `${i * 40}ms` }}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">{meta.emoji}</span>
                  <div className="flex-1">
                    <div className="font-semibold">{meta.name}</div>
                    <div className="text-xs text-muted-foreground">{g.total} партий</div>
                  </div>
                  <div className={`font-display font-bold text-lg ${wr >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {wr}%
                  </div>
                </div>
                {/* Прогресс-бар */}
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${wr}%`, background: wr >= 50 ? 'hsl(var(--emerald))' : 'hsl(var(--crimson))' }} />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5">
                  <span>✅ {g.wins} побед</span>
                  <span>❌ {g.losses} поражений</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Последние игры */}
      {tab === 'history' && (
        <div className="space-y-2">
          {data.recent_games.map((h, i) => {
            const meta = GAME_META[h.game] || { name: h.game, emoji: '🎮', icon: 'Gamepad2' };
            const delta = h.is_win ? h.result : -h.bet;
            return (
              <div key={i} className="animate-float-up glass rounded-xl px-4 py-3 flex items-center gap-3"
                style={{ animationDelay: `${i * 30}ms` }}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-base
                  ${h.is_win ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                  {meta.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{meta.name}</div>
                  <div className="text-[10px] text-muted-foreground">{fmtDate(h.created_at)}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`font-display font-bold text-sm ${h.is_win ? 'text-emerald-400' : 'text-red-400'}`}>
                    {delta >= 0 ? '+' : ''}{fmt(Math.round(delta))} ₽
                  </div>
                  <div className="text-[10px] text-muted-foreground">ставка {fmt(Math.round(h.bet))} ₽</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const VIP_COLORS: Record<string, string> = {
  none: '#888888', bronze: '#cd7f32', silver: '#c0c0c0', gold: '#f5c842', platinum: '#e5e4e2',
};
const VIP_LEVELS_ORDER = ['none', 'bronze', 'silver', 'gold', 'platinum'];

function ProfileView({ setSection, notify, user, onLogout, onBalanceChange, onUserUpdate, theme, onToggleTheme }: {
  setSection: (s: Section) => void; notify: (m: string) => void;
  user: AuthUser | null; onLogout: () => void; onBalanceChange: (d: number) => void;
  onUserUpdate: (u: Partial<AuthUser>) => void;
  theme: 'dark' | 'light'; onToggleTheme: () => void;
}) {
  const [tapCount, setTapCount] = useState(0);
  const tapTimer = useRef<number | null>(null);
  const [cashbackLoading, setCashbackLoading] = useState(false);
  const [localCashback, setLocalCashback] = useState<number | null>(null);

  // Telegram
  const [tgLoading, setTgLoading] = useState(false);
  const [tgDeepLink, setTgDeepLink] = useState<string | null>(null);

  const connectTelegram = async () => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return;
    setTgLoading(true);
    const res = await fetch(`${AUTH_API}?action=telegram-link-code`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
    });
    const data = await res.json();
    if (res.ok && data.deep_link) {
      setTgDeepLink(data.deep_link);
      window.open(data.deep_link, '_blank');
    } else if (res.ok) {
      toast.error('Бот ещё не настроен, попробуй позже');
    } else {
      toast.error(data.error || 'Ошибка');
    }
    setTgLoading(false);
  };

  const disconnectTelegram = async () => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return;
    setTgLoading(true);
    const res = await fetch(`${AUTH_API}?action=telegram-unlink`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
    });
    if (res.ok) {
      onUserUpdate({ telegram_linked: false, telegram_username: null });
      toast.success('Telegram отключен');
    } else {
      toast.error('Ошибка');
    }
    setTgLoading(false);
  };

  // Пока открыта ссылка на бота — периодически проверяем, подключился ли Telegram
  useEffect(() => {
    if (!tgDeepLink || user?.telegram_linked) return;
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return;
    const iv = setInterval(() => {
      fetch(`${AUTH_API}?action=me`, { headers: { 'X-Auth-Token': token } })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d?.user?.telegram_linked) {
            onUserUpdate({ telegram_linked: true, telegram_username: d.user.telegram_username });
            setTgDeepLink(null);
            toast.success('Telegram подключен!');
          }
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(iv);
  }, [tgDeepLink, user?.telegram_linked, onUserUpdate]);

  // Push-уведомления браузера
  const [pushSupported] = useState(() => 'serviceWorker' in navigator && 'PushManager' in window);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  useEffect(() => {
    if (!pushSupported) return;
    isPushSubscribed().then(setPushSubscribed);
  }, [pushSupported]);

  const enablePush = async () => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return;
    setPushLoading(true);
    const ok = await subscribeToPush(token);
    if (ok) {
      setPushSubscribed(true);
      toast.success('Уведомления в браузере подключены!');
    } else {
      toast.error('Не удалось включить уведомления — проверь разрешения браузера');
    }
    setPushLoading(false);
  };

  const disablePush = async () => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return;
    setPushLoading(true);
    await unsubscribeFromPush(token);
    setPushSubscribed(false);
    toast.success('Уведомления отключены');
    setPushLoading(false);
  };

  // Аватар
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [localAvatar, setLocalAvatar] = useState<string | null>(null);

  // Никнейм
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState('');

  const cashbackAvailable = localCashback ?? (user?.cashback_available || 0);
  const vipLevel = user?.vip_level || 'none';
  const vipColor = VIP_COLORS[vipLevel] || VIP_COLORS.none;
  const totalDeposited = user?.total_deposited || 0;
  const nextMin = user?.next_vip_min || 0;
  const progressPct = vipLevel === 'platinum' ? 100
    : nextMin > 0 ? Math.min(100, Math.round((totalDeposited / nextMin) * 100)) : 0;
  const avatarSrc = localAvatar || user?.avatar_url || null;

  const handleSecretTap = () => {
    const next = tapCount + 1;
    setTapCount(next);
    if (tapTimer.current) clearTimeout(tapTimer.current);
    if (next >= 5) { setTapCount(0); setSection('admin'); return; }
    tapTimer.current = window.setTimeout(() => setTapCount(0), 1500);
  };

  const handleAvatarPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Фото не более 2 МБ'); return; }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const b64 = ev.target?.result as string;
      setLocalAvatar(b64);
      setAvatarLoading(true);
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (!token) { setAvatarLoading(false); return; }
      const res = await fetch(`${AUTH_API}?action=upload-avatar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ image_b64: b64, content_type: file.type }),
      });
      const data = await res.json();
      if (res.ok) {
        setLocalAvatar(data.avatar_url);
        onUserUpdate({ avatar_url: data.avatar_url });
        toast.success('Аватар обновлён!');
      } else {
        toast.error(data.error || 'Ошибка загрузки');
        setLocalAvatar(null);
      }
      setAvatarLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const startEditName = () => {
    setNameValue(user?.username || '');
    setNameError('');
    setEditingName(true);
  };

  const saveName = async () => {
    const trimmed = nameValue.trim();
    if (!trimmed) { setNameError('Никнейм не может быть пустым'); return; }
    if (trimmed.length > 32) { setNameError('Не более 32 символов'); return; }
    setNameSaving(true); setNameError('');
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    const res = await fetch(`${AUTH_API}?action=update-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token! },
      body: JSON.stringify({ username: trimmed }),
    });
    const data = await res.json();
    if (res.ok) {
      onUserUpdate({ username: trimmed });
      setEditingName(false);
      toast.success('Никнейм изменён!');
    } else {
      setNameError(data.error || 'Ошибка');
    }
    setNameSaving(false);
  };

  const claimCashback = async () => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return;
    setCashbackLoading(true);
    const res = await fetch(`${AUTH_API}?action=cashback`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
    });
    const data = await res.json();
    if (res.ok) {
      onBalanceChange(data.cashback);
      setLocalCashback(0);
      onUserUpdate({ cashback_next_claim_at: data.next_claim_at });
      toast.success(`Кешбэк ${data.cashback.toLocaleString('ru')} ₽ зачислен!`);
    } else {
      if (data.next_claim_at) onUserUpdate({ cashback_next_claim_at: data.next_claim_at });
      toast.error(data.error || 'Ошибка');
    }
    setCashbackLoading(false);
  };

  // Таймер до следующего доступного получения кешбэка (раз в неделю)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const nextClaimAt = user?.cashback_next_claim_at ? new Date(user.cashback_next_claim_at).getTime() : 0;
  const cashbackLocked = nextClaimAt > now;
  const cashbackTimeLeft = cashbackLocked ? nextClaimAt - now : 0;
  const cashbackTimeLeftLabel = (() => {
    if (!cashbackLocked) return '';
    const totalMin = Math.ceil(cashbackTimeLeft / 60000);
    const days = Math.floor(totalMin / 1440);
    const hours = Math.floor((totalMin % 1440) / 60);
    const mins = totalMin % 60;
    if (days > 0) return `${days} д ${hours} ч`;
    if (hours > 0) return `${hours} ч ${mins} мин`;
    return `${mins} мин`;
  })();

  const items: { name: string; icon: string; action: () => void; danger?: boolean; highlight?: boolean }[] = [
    { name: 'Пополнить баланс', icon: 'Wallet', action: () => setSection('deposit') },
    { name: 'Вывод средств', icon: 'ArrowUpFromLine', action: () => setSection('withdraw') },
    { name: 'Колесо фортуны 🎡', icon: 'RefreshCw', action: () => setSection('spin'), highlight: true },
    { name: 'История игр', icon: 'History', action: () => setSection('history') },
    { name: 'Достижения 🏆', icon: 'Award', action: () => setSection('achievements') },
    { name: 'Задания 📋', icon: 'ListChecks', action: () => setSection('quests') },
    { name: 'Программа лояльности ⭐', icon: 'Star', action: () => setSection('loyalty'), highlight: true },
    { name: 'Пригласить друга', icon: 'UserPlus', action: () => setSection('referral'), highlight: true },
    { name: 'Статистика', icon: 'TrendingUp', action: () => setSection('stats') },
    { name: 'Поддержка', icon: 'Headphones', action: () => setSection('support') },
    { name: 'Выйти из аккаунта', icon: 'LogOut', action: onLogout, danger: true },
  ];

  return (
    <div className="space-y-4">
      {/* Шапка профиля */}
      <div className="animate-float-up glass rounded-3xl p-6 text-center relative overflow-hidden glow-soft">
        <div className="absolute inset-x-0 top-0 h-24 opacity-20" style={{ background: `linear-gradient(to bottom, ${vipColor}, transparent)` }} />
        <div className="relative">
          {/* Аватар */}
          <div className="relative w-20 h-20 mx-auto mb-3">
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center overflow-hidden cursor-pointer select-none"
              style={{ border: `2px solid ${vipColor}66` }}
              onClick={handleSecretTap}
            >
              {avatarSrc
                ? <img src={avatarSrc} alt="avatar" className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${vipColor}cc, ${vipColor}44)` }}>
                    <Icon name="User" size={36} className="text-background" />
                  </div>
              }
              {avatarLoading && (
                <div className="absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center">
                  <Icon name="Loader" size={20} className="animate-spin text-white" />
                </div>
              )}
            </div>
            {/* Кнопка смены фото */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-xl flex items-center justify-center shadow-lg"
              style={{ background: vipColor }}
            >
              <Icon name="Camera" size={13} className="text-background" />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarPick} />
          </div>

          {/* Никнейм */}
          {editingName ? (
            <div className="flex items-center justify-center gap-2 mt-1 mb-1">
              <input
                autoFocus
                value={nameValue}
                onChange={e => { setNameValue(e.target.value); setNameError(''); }}
                onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
                maxLength={32}
                className="bg-background/60 border border-gold/30 rounded-xl px-3 py-1.5 text-center font-display font-bold text-lg outline-none focus:border-gold/70 w-44"
              />
              <button onClick={saveName} disabled={nameSaving}
                className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center hover:bg-emerald-500/30 transition-all disabled:opacity-50">
                {nameSaving ? <Icon name="Loader" size={14} className="animate-spin" /> : <Icon name="Check" size={14} />}
              </button>
              <button onClick={() => setEditingName(false)}
                className="w-8 h-8 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition-all">
                <Icon name="X" size={14} />
              </button>
            </div>
          ) : (
            <button onClick={startEditName} className="group flex items-center justify-center gap-1.5 mx-auto mt-1 mb-0.5">
              <h2 className="font-display text-xl font-bold group-hover:text-gold transition-colors">{user?.username || 'Игрок'}</h2>
              <Icon name="Pencil" size={13} className="text-muted-foreground/50 group-hover:text-gold transition-colors" />
            </button>
          )}
          {nameError && <p className="text-xs text-red-400 mb-1">{nameError}</p>}

          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
            {user?.email}
            {user?.email_verified ? (
              <span className="inline-flex items-center gap-0.5 text-emerald-400 text-[10px] font-semibold">
                <Icon name="BadgeCheck" size={12} /> подтверждён
              </span>
            ) : (
              <button onClick={() => setSection('verify-email')}
                className="inline-flex items-center gap-0.5 text-amber-400 text-[10px] font-semibold hover:underline">
                <Icon name="AlertTriangle" size={12} /> не подтверждён
              </button>
            )}
          </p>
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5 mt-0.5">
            <Icon name="Smartphone" size={11} className="opacity-60" />
            {user?.phone_verified ? (
              <span className="inline-flex items-center gap-0.5 text-emerald-400 text-[10px] font-semibold">
                <Icon name="BadgeCheck" size={12} /> телефон подтверждён
              </span>
            ) : (
              <button onClick={() => setSection('verify-phone')}
                className="inline-flex items-center gap-0.5 text-muted-foreground text-[10px] font-semibold hover:text-amber-400 hover:underline transition-colors">
                телефон не подтверждён
              </button>
            )}
          </p>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap justify-center">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full"
              style={{ color: vipColor, background: `${vipColor}18`, border: `1px solid ${vipColor}44` }}>
              {user?.vip_emoji || '⬜'} {user?.vip_label || 'Нет уровня'}
              {(user?.vip_cashback_pct || 0) > 0 && <span className="opacity-70">· {user?.vip_cashback_pct}% кешбэк</span>}
            </span>
            <button onClick={() => setSection('loyalty')}
              className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full bg-gold/15 text-gold border border-gold/30 hover:bg-gold/25 transition-colors">
              ⭐ {(user?.loyalty_points || 0).toLocaleString('ru')} очков
            </button>
          </div>
        </div>
      </div>

      {/* VIP-прогресс */}
      <div className="animate-float-up glass rounded-2xl p-4 space-y-3" style={{ animationDelay: '60ms' }}>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">VIP-прогресс</p>
          <span className="text-xs font-semibold" style={{ color: vipColor }}>
            {totalDeposited.toLocaleString('ru')} ₽ задепозитировано
          </span>
        </div>
        {/* Шкала уровней */}
        <div className="flex items-center gap-1">
          {VIP_LEVELS_ORDER.filter(l => l !== 'none').map((lvl) => {
            const isActive = VIP_LEVELS_ORDER.indexOf(lvl) <= VIP_LEVELS_ORDER.indexOf(vipLevel);
            const isCurrent = lvl === vipLevel;
            const color = VIP_COLORS[lvl];
            return (
              <div key={lvl} className={`flex-1 flex flex-col items-center gap-1`}>
                <div className={`w-full h-1.5 rounded-full transition-all ${isActive ? '' : 'bg-white/10'}`}
                  style={isActive ? { background: color } : {}} />
                <span className="text-[10px] font-bold transition-all"
                  style={{ color: isCurrent ? color : isActive ? color : '#555' }}>
                  {lvl === 'bronze' ? '🥉' : lvl === 'silver' ? '🥈' : lvl === 'gold' ? '🥇' : '💎'}
                </span>
              </div>
            );
          })}
        </div>
        {vipLevel !== 'platinum' && user?.next_vip_label && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>До {user.next_vip_emoji} {user.next_vip_label}</span>
            <span className="font-semibold">{Math.max(0, (nextMin - totalDeposited)).toLocaleString('ru')} ₽</span>
          </div>
        )}
        {vipLevel !== 'platinum' && (
          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%`, background: vipColor }} />
          </div>
        )}
        {vipLevel === 'platinum' && (
          <p className="text-xs text-center font-semibold" style={{ color: vipColor }}>
            💎 Максимальный уровень — 12% кешбэк
          </p>
        )}
      </div>

      {/* Кешбэк */}
      {(user?.vip_cashback_pct || 0) > 0 && (
        <div className="animate-float-up glass rounded-2xl p-4 flex items-center gap-4" style={{ animationDelay: '100ms' }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${vipColor}18`, border: `1px solid ${vipColor}44` }}>
            <Icon name="RotateCcw" size={22} style={{ color: vipColor }} />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">Кешбэк {user?.vip_cashback_pct}% · раз в неделю</p>
            <p className="text-xs text-muted-foreground">
              {cashbackAvailable > 0
                ? `Доступно: ${cashbackAvailable.toLocaleString('ru')} ₽`
                : 'Накапливается с каждого проигрыша'}
              {cashbackLocked && ` · след. выплата через ${cashbackTimeLeftLabel}`}
            </p>
          </div>
          {cashbackAvailable > 0 && (
            <button onClick={claimCashback} disabled={cashbackLoading || cashbackLocked}
              className="shrink-0 font-bold text-sm px-4 py-2 rounded-xl transition-all disabled:opacity-50"
              style={{ background: `${vipColor}22`, color: vipColor, border: `1px solid ${vipColor}55` }}>
              {cashbackLoading
                ? <Icon name="Loader" size={16} className="animate-spin" />
                : cashbackLocked ? cashbackTimeLeftLabel : `Забрать`}
            </button>
          )}
        </div>
      )}

      {/* Telegram-уведомления */}
      <div className="animate-float-up glass rounded-2xl p-4 flex items-center gap-4" style={{ animationDelay: '110ms' }}>
        <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-[#229ED9]/15 border border-[#229ED9]/40">
          <Icon name="Send" size={20} className="text-[#229ED9]" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-sm">Telegram-уведомления</p>
          <p className="text-xs text-muted-foreground">
            {user?.telegram_linked
              ? `Подключено${user.telegram_username ? ` · @${user.telegram_username}` : ''}`
              : 'Напомним забрать ежедневный бонус'}
          </p>
        </div>
        {user?.telegram_linked ? (
          <button onClick={disconnectTelegram} disabled={tgLoading}
            className="shrink-0 font-bold text-sm px-4 py-2 rounded-xl transition-all disabled:opacity-50 glass text-muted-foreground hover:text-red-400">
            {tgLoading ? <Icon name="Loader" size={16} className="animate-spin" /> : 'Отключить'}
          </button>
        ) : (
          <button onClick={connectTelegram} disabled={tgLoading}
            className="shrink-0 font-bold text-sm px-4 py-2 rounded-xl transition-all disabled:opacity-50 bg-[#229ED9]/20 text-[#229ED9] border border-[#229ED9]/50">
            {tgLoading ? <Icon name="Loader" size={16} className="animate-spin" /> : 'Подключить'}
          </button>
        )}
      </div>

      {/* Push-уведомления браузера */}
      {pushSupported && (
        <div className="animate-float-up glass rounded-2xl p-4 flex items-center gap-4" style={{ animationDelay: '115ms' }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-gold/15 border border-gold/40">
            <Icon name="Bell" size={20} className="text-gold" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">Push-уведомления</p>
            <p className="text-xs text-muted-foreground">
              {pushSubscribed
                ? 'Подключено в этом браузере'
                : 'Одобренный вывод и бонус — прямо на устройство'}
            </p>
          </div>
          {pushSubscribed ? (
            <button onClick={disablePush} disabled={pushLoading}
              className="shrink-0 font-bold text-sm px-4 py-2 rounded-xl transition-all disabled:opacity-50 glass text-muted-foreground hover:text-red-400">
              {pushLoading ? <Icon name="Loader" size={16} className="animate-spin" /> : 'Отключить'}
            </button>
          ) : (
            <button onClick={enablePush} disabled={pushLoading}
              className="shrink-0 font-bold text-sm px-4 py-2 rounded-xl transition-all disabled:opacity-50 bg-gold/20 text-gold border border-gold/50">
              {pushLoading ? <Icon name="Loader" size={16} className="animate-spin" /> : 'Подключить'}
            </button>
          )}
        </div>
      )}

      {/* Переключатель темы */}
      <button onClick={onToggleTheme}
        className="animate-float-up w-full glass rounded-2xl p-4 flex items-center gap-3 hover-lift"
        style={{ animationDelay: '80ms' }}>
        <div className="w-10 h-10 rounded-xl bg-gold/10 text-gold flex items-center justify-center">
          <Icon name={theme === 'dark' ? 'Sun' : 'Moon'} size={20} />
        </div>
        <span className="font-medium flex-1 text-left">
          {theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
        </span>
        {/* Тогл */}
        <div className={`w-12 h-6 rounded-full transition-colors duration-300 relative shrink-0
          ${theme === 'light' ? 'bg-gold' : 'bg-white/10'}`}>
          <div className={`absolute top-1 w-4 h-4 rounded-full transition-all duration-300 shadow
            ${theme === 'light' ? 'left-7 bg-background' : 'left-1 bg-muted-foreground'}`} />
        </div>
      </button>

      {/* Меню */}
      <div className="space-y-2.5">
        {items.map((it, i) => (
          <button key={it.name} onClick={it.action}
            className="animate-float-up w-full glass rounded-2xl p-4 flex items-center gap-3 hover-lift"
            style={{ animationDelay: `${(i + 3) * 40}ms` }}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${it.danger ? 'bg-red-500/10 text-red-400' : it.highlight ? 'gold-gradient text-background' : 'bg-gold/10 text-gold'}`}>
              <Icon name={it.icon} size={20} />
            </div>
            <span className={`font-medium flex-1 text-left ${it.danger ? 'text-red-400' : it.highlight ? 'gold-text font-semibold' : ''}`}>{it.name}</span>
            <Icon name="ChevronRight" size={18} className="text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}

interface SupportMessage { id: number; sender: 'user' | 'admin'; text: string; created_at: string; }

function SupportView({ notify: _notify }: { notify: (m: string) => void }) {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [chatId, setChatId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('open');
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<number | null>(null);
  const lastMsgRef = useRef<string>('');

  const token = localStorage.getItem(AUTH_TOKEN_KEY) || '';

  const loadMessages = async () => {
    if (!token) { setLoading(false); return; }
    const res = await fetch(`${AUTH_API}?action=support-messages`, {
      headers: { 'X-Auth-Token': token },
    });
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages || []);
      setChatId(data.chat_id);
      setStatus(data.status);
      if (data.messages?.length) lastMsgRef.current = data.messages[data.messages.length - 1].created_at;
    }
    setLoading(false);
  };

  const pollNew = async () => {
    if (!token || !lastMsgRef.current) return;
    const res = await fetch(`${AUTH_API}?action=support-poll&since=${encodeURIComponent(lastMsgRef.current)}`, {
      headers: { 'X-Auth-Token': token },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.messages?.length) {
        setMessages(prev => {
          const ids = new Set(prev.map(m => m.id));
          const fresh = data.messages.filter((m: SupportMessage) => !ids.has(m.id));
          if (!fresh.length) return prev;
          lastMsgRef.current = fresh[fresh.length - 1].created_at;
          return [...prev, ...fresh];
        });
      }
    }
  };

  useEffect(() => {
    loadMessages();
    pollRef.current = window.setInterval(pollNew, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const t = text.trim();
    if (!t || sending || !token) return;
    setSending(true);
    const optimistic: SupportMessage = { id: Date.now(), sender: 'user', text: t, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, optimistic]);
    setText('');
    const res = await fetch(`${AUTH_API}?action=support-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
      body: JSON.stringify({ text: t }),
    });
    if (res.ok) {
      const data = await res.json();
      lastMsgRef.current = data.created_at;
      setMessages(prev => prev.map(m => m.id === optimistic.id ? { ...m, id: data.id, created_at: data.created_at } : m));
    }
    setSending(false);
  };

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  };

  if (!token) {
    return (
      <div className="space-y-5">
        <SectionTitle title="Поддержка" subtitle="Мы на связи 24/7" icon="Headphones" />
        <div className="glass rounded-2xl p-8 text-center text-muted-foreground">
          Войдите в аккаунт чтобы написать в поддержку
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)]">
      {/* Заголовок */}
      <div className="animate-float-up flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-2xl gold-gradient flex items-center justify-center glow-gold shrink-0">
          <Icon name="Headphones" size={20} className="text-background" />
        </div>
        <div className="flex-1">
          <h2 className="font-display font-bold text-lg">Поддержка</h2>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full inline-block ${status === 'closed' ? 'bg-red-400' : 'bg-emerald-400'}`} />
            {status === 'closed' ? 'Закрыто' : status === 'answered' ? 'Ответили' : 'На связи 24/7'}
          </p>
        </div>
      </div>

      {/* Сообщения */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
        {loading ? (
          <div className="flex justify-center py-12 text-gold"><Icon name="Loader" size={24} className="animate-spin" /></div>
        ) : messages.length === 0 ? (
          <div className="glass rounded-2xl p-6 text-center text-muted-foreground text-sm">
            <Icon name="MessageCircle" size={32} className="text-gold/40 mx-auto mb-2" />
            Напишите нам — ответим быстро
          </div>
        ) : messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 ${
              msg.sender === 'user'
                ? 'gold-gradient text-background rounded-br-sm'
                : 'glass text-foreground rounded-bl-sm border border-white/10'
            }`}>
              {msg.sender === 'admin' && (
                <p className="text-[10px] font-bold text-gold mb-1 uppercase tracking-wider">Поддержка</p>
              )}
              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>
              <p className={`text-[10px] mt-1 ${msg.sender === 'user' ? 'text-background/60 text-right' : 'text-muted-foreground'}`}>
                {fmt(msg.created_at)}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Поле ввода */}
      <div className="mt-3 flex gap-2 items-end">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Напишите сообщение..."
          rows={1}
          className="flex-1 bg-background/60 border border-gold/20 rounded-2xl px-4 py-3 outline-none focus:border-gold/50 transition-colors text-sm resize-none placeholder:text-muted-foreground/50"
          style={{ maxHeight: '96px', overflowY: 'auto' }}
        />
        <button
          onClick={send}
          disabled={!text.trim() || sending}
          className="w-12 h-12 rounded-2xl gold-gradient flex items-center justify-center glow-gold disabled:opacity-40 shrink-0"
        >
          {sending ? <Icon name="Loader" size={18} className="animate-spin text-background" /> : <Icon name="Send" size={18} className="text-background" />}
        </button>
      </div>
    </div>
  );
}

function AuthScreen({ onSuccess }: { onSuccess: (token: string, user: AuthUser) => void }) {
  // Читаем реферальный код из URL ?ref=XXXXXXXX
  const urlRef = new URLSearchParams(window.location.search).get('ref') || '';
  const [mode, setMode] = useState<'login' | 'register'>(urlRef ? 'register' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const inputCls = 'w-full bg-white/5 border border-gold/20 rounded-xl px-4 py-3 outline-none focus:border-gold/60 transition-colors text-foreground placeholder:text-muted-foreground/50';

  const handleSubmit = async () => {
    setError('');
    if (!email || !password) { setError('Заполни все поля'); return; }
    setLoading(true);

    const action = mode === 'login' ? 'login' : 'register';
    const body: Record<string, string> = { email, password };
    if (mode === 'register' && username) body.username = username;
    if (mode === 'register' && urlRef) body.ref_code = urlRef;

    // Retry до 3 раз с таймаутом 15с — на случай cold start
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(`${AUTH_API}?action=${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timer);
        const data = await res.json();
        if (!res.ok) { setError(data.error || 'Ошибка'); setLoading(false); return; }
        onSuccess(data.token, data.user);
        setLoading(false);
        return;
      } catch {
        if (attempt < MAX_ATTEMPTS) {
          // Пауза перед следующей попыткой: 1с, 2с
          await new Promise(r => setTimeout(r, attempt * 1000));
        } else {
          setError('Ошибка сети, попробуй снова');
          setLoading(false);
        }
      }
    }
  };

  return (
    <div className="dark min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-5">
      <div className="w-full max-w-sm space-y-6">
        {/* Лого */}
        <div className="flex flex-col items-center gap-3 mb-2">
          <div className="w-20 h-20 rounded-3xl gold-gradient flex items-center justify-center glow-gold">
            <Icon name="Diamond" size={36} className="text-background" />
          </div>
          <div className="text-center">
            <h1 className="font-display text-4xl font-bold gold-text tracking-wide">LUXE</h1>
            <p className="text-xs text-muted-foreground tracking-[0.3em] uppercase mt-1">Casino</p>
          </div>
        </div>

        {/* Баннер реферала */}
        {urlRef && (
          <div className="glass rounded-2xl p-4 flex items-center gap-3 border border-gold/30">
            <div className="w-10 h-10 rounded-xl gold-gradient flex items-center justify-center shrink-0">
              <Icon name="Gift" size={18} className="text-background" />
            </div>
            <div>
              <div className="font-semibold text-sm gold-text">Тебя пригласил друг!</div>
              <div className="text-xs text-muted-foreground">Зарегистрируйся и получи <span className="text-gold font-bold">50 ₽</span> на баланс</div>
            </div>
          </div>
        )}

        {/* Переключатель */}
        <div className="grid grid-cols-2 gap-1 glass rounded-2xl p-1">
          {(['login', 'register'] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setError(''); }}
              className={`py-2.5 rounded-xl text-sm font-semibold transition-all
                ${mode === m ? 'gold-gradient text-background' : 'text-muted-foreground'}`}>
              {m === 'login' ? 'Войти' : 'Регистрация'}
            </button>
          ))}
        </div>

        {/* Форма */}
        <div className="glass rounded-3xl p-6 space-y-4">
          {mode === 'register' && (
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Имя игрока</label>
              <input className={inputCls} placeholder="Например: Lucky777" value={username}
                onChange={e => setUsername(e.target.value)} />
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Email</label>
            <input className={inputCls} type="email" inputMode="email" placeholder="your@email.com"
              value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Пароль</label>
            <input className={inputCls} type="password" placeholder={mode === 'register' ? 'Минимум 6 символов' : '••••••••'}
              value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-400">
              <Icon name="AlertCircle" size={14} /> {error}
            </div>
          )}

          <Button onClick={handleSubmit} disabled={loading}
            className="w-full gold-gradient text-background font-bold h-12 glow-gold text-base disabled:opacity-50">
            {loading
              ? <><Icon name="Loader" size={18} className="mr-2 animate-spin" /> {mode === 'login' ? 'Входим...' : 'Регистрируем...'}</>
              : mode === 'login' ? 'Войти в аккаунт' : 'Создать аккаунт'
            }
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground/60">
          Продолжая, вы соглашаетесь с правилами казино. 18+
        </p>
      </div>
    </div>
  );
}

const PERIOD_LABELS = { week: 'Неделя', month: 'Месяц', alltime: 'Всё время' };

function LeaderboardView() {
  const [period, setPeriod] = useState<'week' | 'month' | 'alltime'>('week');
  const [data, setData] = useState<{
    leaders: { rank: number; username: string; games: number; wins: number; profit: number }[];
    my_rank: number | null;
    my_profit: number | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p: string) => {
    setLoading(true);
    const token = localStorage.getItem('casino_auth_token') || '';
    try {
      const res = await fetch(`${AUTH_API}?action=leaderboard&period=${p}`,
        { headers: token ? { 'X-Auth-Token': token } : {} });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(period); }, [period, load]);

  return (
    <div className="space-y-5">
      <SectionTitle title="Таблица лидеров" subtitle="Топ игроков по выигрышу" icon="Trophy" />

      {/* Период */}
      <div className="grid grid-cols-3 gap-2">
        {(Object.entries(PERIOD_LABELS) as [typeof period, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setPeriod(key)}
            className={`py-2.5 rounded-xl text-xs font-semibold transition-all
              ${period === key ? 'gold-gradient text-background glow-gold' : 'glass text-muted-foreground'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Моя позиция */}
      {data?.my_rank && (
        <div className="glass rounded-2xl p-4 flex items-center justify-between border border-gold/30">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl gold-gradient flex items-center justify-center text-background font-bold text-sm glow-gold">
              #{data.my_rank}
            </div>
            <div>
              <div className="text-sm font-semibold">Твоя позиция</div>
              <div className="text-xs text-muted-foreground">из {data.leaders.length}+ игроков</div>
            </div>
          </div>
          <div className={`font-display font-bold text-lg ${(data.my_profit || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {(data.my_profit || 0) >= 0 ? '+' : ''}{(data.my_profit || 0).toLocaleString('ru')} ₽
          </div>
        </div>
      )}

      {/* Список */}
      {loading ? (
        <div className="flex justify-center py-16 text-gold">
          <Icon name="Loader" size={28} className="animate-spin" />
        </div>
      ) : !data || data.leaders.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <div className="text-4xl mb-3">🏆</div>
          <p className="text-muted-foreground text-sm">Сыграй первым и возглавь рейтинг!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Топ-3 подиум */}
          {data.leaders.length >= 3 && (
            <div className="glass rounded-3xl p-5 mb-2">
              <div className="flex items-end justify-center gap-3">
                {/* 2 место */}
                <div className="flex flex-col items-center gap-2 flex-1">
                  <div className="text-2xl">🥈</div>
                  <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-lg font-bold">
                    {data.leaders[1].username.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="text-center">
                    <div className="text-xs font-semibold truncate max-w-[60px]">{data.leaders[1].username}</div>
                    <div className="text-xs text-emerald-400 font-bold">+{data.leaders[1].profit.toLocaleString('ru')} ₽</div>
                  </div>
                  <div className="w-full h-12 bg-white/5 rounded-t-xl" />
                </div>
                {/* 1 место */}
                <div className="flex flex-col items-center gap-2 flex-1">
                  <div className="text-3xl animate-bounce">🥇</div>
                  <div className="w-16 h-16 rounded-2xl gold-gradient flex items-center justify-center text-xl font-bold text-background glow-gold">
                    {data.leaders[0].username.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="text-center">
                    <div className="text-xs font-bold gold-text truncate max-w-[70px]">{data.leaders[0].username}</div>
                    <div className="text-sm text-emerald-400 font-display font-bold">+{data.leaders[0].profit.toLocaleString('ru')} ₽</div>
                  </div>
                  <div className="w-full h-20 bg-gold/10 rounded-t-xl" />
                </div>
                {/* 3 место */}
                <div className="flex flex-col items-center gap-2 flex-1">
                  <div className="text-2xl">🥉</div>
                  <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-lg font-bold">
                    {data.leaders[2].username.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="text-center">
                    <div className="text-xs font-semibold truncate max-w-[60px]">{data.leaders[2].username}</div>
                    <div className="text-xs text-emerald-400 font-bold">+{data.leaders[2].profit.toLocaleString('ru')} ₽</div>
                  </div>
                  <div className="w-full h-8 bg-white/5 rounded-t-xl" />
                </div>
              </div>
            </div>
          )}

          {/* Остальные */}
          {data.leaders.slice(3).map((l) => (
            <div key={l.rank} className="glass rounded-2xl p-3.5 flex items-center gap-3">
              <div className="w-8 text-center text-sm font-bold text-muted-foreground">#{l.rank}</div>
              <div className="w-9 h-9 rounded-xl bg-white/8 flex items-center justify-center text-sm font-bold shrink-0">
                {l.username.slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{l.username}</div>
                <div className="text-xs text-muted-foreground">{l.games} игр · {l.wins} побед</div>
              </div>
              <div className={`font-display font-bold text-sm shrink-0 ${l.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {l.profit >= 0 ? '+' : ''}{l.profit.toLocaleString('ru')} ₽
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const GAME_ICONS: Record<string, string> = {
  'Слоты': 'Cherry', 'Монета': 'CircleDollarSign',
  'Кости': 'Dices', 'Рулетка': 'CircleDot', 'Блэкджек': 'Spade',
};

function GameHistoryView({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<{
    games: { game: string; bet: number; result: number; is_win: boolean; created_at: string }[];
    stats: { total: number; wins: number; total_bet: number; total_won: number; total_lost: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'wins' | 'losses'>('all');

  useEffect(() => {
    const token = localStorage.getItem('casino_auth_token');
    if (!token) { setLoading(false); return; }
    fetch(`${AUTH_API}?action=history`, { headers: { 'X-Auth-Token': token } })
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const filtered = data?.games.filter(g =>
    filter === 'all' ? true : filter === 'wins' ? g.is_win : !g.is_win
  ) || [];

  const winRate = data?.stats.total ? Math.round((data.stats.wins / data.stats.total) * 100) : 0;
  const profit = data ? data.stats.total_won - data.stats.total_bet : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="w-10 h-10 rounded-xl glass flex items-center justify-center text-gold">
          <Icon name="ArrowLeft" size={20} />
        </button>
        <div>
          <h2 className="font-display text-xl font-bold">История игр</h2>
          <p className="text-sm text-muted-foreground">Все твои ставки и результаты</p>
        </div>
      </div>

      {/* Статистика */}
      {data && (
        <div className="grid grid-cols-2 gap-2">
          <div className="glass rounded-2xl p-4 space-y-1">
            <div className="text-xs text-muted-foreground">Игр сыграно</div>
            <div className="font-display text-2xl font-bold gold-text">{data.stats.total}</div>
            <div className="text-xs text-muted-foreground">побед: {data.stats.wins} ({winRate}%)</div>
          </div>
          <div className="glass rounded-2xl p-4 space-y-1">
            <div className="text-xs text-muted-foreground">Чистый результат</div>
            <div className={`font-display text-2xl font-bold ${profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {profit >= 0 ? '+' : ''}{profit.toLocaleString('ru')} ₽
            </div>
            <div className="text-xs text-muted-foreground">поставлено: {data.stats.total_bet.toLocaleString('ru')} ₽</div>
          </div>
        </div>
      )}

      {/* Фильтр */}
      <div className="grid grid-cols-3 gap-2">
        {(['all', 'wins', 'losses'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`py-2 rounded-xl text-xs font-semibold transition-all
              ${filter === f ? 'gold-gradient text-background' : 'glass text-muted-foreground'}`}>
            {f === 'all' ? 'Все' : f === 'wins' ? '✅ Победы' : '❌ Проигрыши'}
          </button>
        ))}
      </div>

      {/* Список */}
      {loading ? (
        <div className="flex justify-center py-12"><Icon name="Loader" size={24} className="animate-spin text-gold" /></div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-muted-foreground text-sm">
          {data?.stats.total === 0 ? 'Сыграй первую игру — история появится здесь' : 'Нет записей'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((g, i) => {
            const delta = g.is_win ? g.result - g.bet : -g.bet;
            return (
              <div key={i} className="glass rounded-2xl p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
                  ${g.is_win ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                  <Icon name={GAME_ICONS[g.game] || 'Dices'} size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-sm">{g.game}</span>
                    <span className={`font-display font-bold ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {delta >= 0 ? '+' : ''}{delta.toLocaleString('ru')} ₽
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
                    <span>Ставка: {g.bet.toLocaleString('ru')} ₽</span>
                    <span>{new Date(g.created_at).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
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

// ── Секторы колеса (должны совпадать с бэкендом) ─────────────────────────────
const SPIN_SECTORS = [
  { label: '10 ₽',   color: '#f5c842', textColor: '#1a1a2e', type: 'coins'      },
  { label: '×2',      color: '#a78bfa', textColor: '#fff',    type: 'multiplier' },
  { label: '25 ₽',   color: '#34d399', textColor: '#1a1a2e', type: 'coins'      },
  { label: 'Ничего',  color: '#374151', textColor: '#9ca3af', type: 'nothing'    },
  { label: '50 ₽',   color: '#f97316', textColor: '#fff',    type: 'coins'      },
  { label: '×1.5',   color: '#60a5fa', textColor: '#fff',    type: 'multiplier' },
  { label: '5 ₽',    color: '#fbbf24', textColor: '#1a1a2e', type: 'coins'      },
  { label: 'Ничего',  color: '#374151', textColor: '#9ca3af', type: 'nothing'    },
  { label: '100 ₽',  color: '#ef4444', textColor: '#fff',    type: 'coins'      },
  { label: '×3',      color: '#10b981', textColor: '#fff',    type: 'multiplier' },
  { label: '15 ₽',   color: '#f59e0b', textColor: '#1a1a2e', type: 'coins'      },
  { label: 'Ничего',  color: '#374151', textColor: '#9ca3af', type: 'nothing'    },
];
const N_SECTORS = SPIN_SECTORS.length;
const SECTOR_ANGLE = 360 / N_SECTORS;

function SpinWheelSvg({ rotation, size = 288 }: { rotation: number; size?: number }) {
  const cx = size / 2, cy = size / 2, r = size / 2 - 3;
  return (
    <svg width={size} height={size} style={{ transform: `rotate(${rotation}deg)`, display: 'block' }}>
      {SPIN_SECTORS.map((s, i) => {
        const a1 = (i * SECTOR_ANGLE - 90) * (Math.PI / 180);
        const a2 = ((i + 1) * SECTOR_ANGLE - 90) * (Math.PI / 180);
        const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
        const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
        const ma = ((i + 0.5) * SECTOR_ANGLE - 90) * (Math.PI / 180);
        const tr = r * 0.67, tx = cx + tr * Math.cos(ma), ty = cy + tr * Math.sin(ma);
        const rot = (i + 0.5) * SECTOR_ANGLE;
        return (
          <g key={i}>
            <path d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`}
              fill={s.color} stroke="rgba(0,0,0,0.2)" strokeWidth="1.5" />
            <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle"
              fill={s.textColor} fontSize={size * 0.048} fontWeight="bold"
              fontFamily="Oswald,sans-serif"
              transform={`rotate(${rot},${tx},${ty})`}>
              {s.label}
            </text>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={size * 0.065} fill="#1a1a2e" stroke="hsl(43 74% 52%)" strokeWidth="3" />
      <circle cx={cx} cy={cy} r={size * 0.028} fill="hsl(43 74% 52%)" />
    </svg>
  );
}

function EmailVerifyView({ user, onBack, onVerified }: { user: AuthUser | null; onBack: () => void; onVerified: () => void }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const sendCode = async () => {
    setResending(true); setError('');
    const token = localStorage.getItem(AUTH_TOKEN_KEY) || '';
    try {
      const res = await fetch(`${AUTH_API}?action=send-verification`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
      });
      const data = await res.json();
      if (res.ok) {
        setSent(true);
        setCooldown(60);
        toast.success('Код отправлен на почту');
      } else {
        setError(data.error || 'Не удалось отправить код');
        if (res.status === 429) setCooldown(60);
      }
    } catch {
      setError('Ошибка сети, попробуй снова');
    } finally {
      setResending(false);
    }
  };

  // Автоматически отправляем код при первом открытии экрана
  useEffect(() => { sendCode(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const handleVerify = async () => {
    if (code.length !== 6) { setError('Введи 6-значный код'); return; }
    setLoading(true); setError('');
    const token = localStorage.getItem(AUTH_TOKEN_KEY) || '';
    try {
      const res = await fetch(`${AUTH_API}?action=verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Email подтверждён!');
        onVerified();
        onBack();
      } else {
        setError(data.error || 'Неверный код');
      }
    } catch {
      setError('Ошибка сети, попробуй снова');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5 animate-float-up">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="w-10 h-10 rounded-xl glass flex items-center justify-center text-gold shrink-0">
          <Icon name="ArrowLeft" size={20} />
        </button>
        <div>
          <h2 className="font-display text-xl font-bold">Подтверждение email</h2>
          <p className="text-xs text-muted-foreground">Защита от мошенничества при выводе</p>
        </div>
      </div>

      <div className="glass rounded-2xl p-5 flex flex-col items-center gap-3 text-center">
        <div className="w-14 h-14 rounded-2xl gold-gradient flex items-center justify-center glow-gold">
          <Icon name="Mail" size={26} className="text-background" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Код отправлен на</p>
          <p className="font-semibold">{user?.email}</p>
        </div>
        {sent && (
          <p className="text-xs text-emerald-400 flex items-center gap-1">
            <Icon name="CheckCircle" size={13} /> Письмо отправлено, проверь папку «Спам»
          </p>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Код из письма</label>
          <input
            className="w-full bg-background/60 border border-gold/20 rounded-xl px-4 py-3 outline-none focus:border-gold/50 transition-colors text-foreground text-center font-display text-2xl tracking-[0.5em] placeholder:tracking-normal placeholder:text-base"
            placeholder="000000"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            maxLength={6}
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-400">
            <Icon name="AlertCircle" size={14} /> {error}
          </div>
        )}

        <Button onClick={handleVerify} disabled={loading || code.length !== 6}
          className="w-full gold-gradient text-background font-bold text-lg h-14 glow-gold disabled:opacity-50">
          {loading ? <Icon name="Loader" size={20} className="animate-spin" /> : 'Подтвердить'}
        </Button>

        <button onClick={sendCode} disabled={resending || cooldown > 0}
          className="w-full text-center text-sm text-muted-foreground hover:text-gold transition-colors disabled:opacity-50 py-2">
          {cooldown > 0 ? `Повторить через ${cooldown} сек.` : resending ? 'Отправка...' : 'Отправить код повторно'}
        </button>
      </div>
    </div>
  );
}

function PhoneVerifyView({ user, onBack, onVerified }: { user: AuthUser | null; onBack: () => void; onVerified: () => void }) {
  const [step, setStep] = useState<'phone' | 'code'>(user?.phone ? 'code' : 'phone');
  const [phone, setPhone] = useState(user?.phone || '');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const formatPhone = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 11);
    if (!digits) return '';
    let d = digits;
    if (d[0] === '8') d = '7' + d.slice(1);
    if (d[0] !== '7') d = '7' + d;
    let out = '+7';
    if (d.length > 1) out += ' (' + d.slice(1, 4);
    if (d.length >= 4) out += ') ' + d.slice(4, 7);
    if (d.length >= 7) out += '-' + d.slice(7, 9);
    if (d.length >= 9) out += '-' + d.slice(9, 11);
    return out;
  };

  const sendCode = async () => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) { setError('Введи корректный номер телефона'); return; }
    setResending(true); setError('');
    const token = localStorage.getItem(AUTH_TOKEN_KEY) || '';
    try {
      const res = await fetch(`${AUTH_API}?action=send-phone-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ phone: digits }),
      });
      const data = await res.json();
      if (res.ok) {
        setStep('code');
        setCooldown(60);
        toast.success('Код отправлен по SMS');
      } else {
        setError(data.error || 'Не удалось отправить код');
        if (res.status === 429) setCooldown(60);
      }
    } catch {
      setError('Ошибка сети, попробуй снова');
    } finally {
      setResending(false);
    }
  };

  const handleVerify = async () => {
    if (code.length !== 6) { setError('Введи 6-значный код'); return; }
    setLoading(true); setError('');
    const token = localStorage.getItem(AUTH_TOKEN_KEY) || '';
    try {
      const res = await fetch(`${AUTH_API}?action=verify-phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Телефон подтверждён!');
        onVerified();
        onBack();
      } else {
        setError(data.error || 'Неверный код');
      }
    } catch {
      setError('Ошибка сети, попробуй снова');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5 animate-float-up">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="w-10 h-10 rounded-xl glass flex items-center justify-center text-gold shrink-0">
          <Icon name="ArrowLeft" size={20} />
        </button>
        <div>
          <h2 className="font-display text-xl font-bold">Подтверждение телефона</h2>
          <p className="text-xs text-muted-foreground">Требуется для крупных выводов</p>
        </div>
      </div>

      <div className="glass rounded-2xl p-5 flex flex-col items-center gap-3 text-center">
        <div className="w-14 h-14 rounded-2xl gold-gradient flex items-center justify-center glow-gold">
          <Icon name="Smartphone" size={26} className="text-background" />
        </div>
        {step === 'phone' ? (
          <p className="text-sm text-muted-foreground">Введи номер телефона — пришлём код по SMS</p>
        ) : (
          <div>
            <p className="text-sm text-muted-foreground">Код отправлен на</p>
            <p className="font-semibold">{formatPhone(phone)}</p>
          </div>
        )}
      </div>

      {step === 'phone' ? (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Номер телефона</label>
            <input
              className="w-full bg-background/60 border border-gold/20 rounded-xl px-4 py-3 outline-none focus:border-gold/50 transition-colors text-foreground text-lg"
              placeholder="+7 (___) ___-__-__"
              value={formatPhone(phone)}
              onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
              inputMode="tel"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-400">
              <Icon name="AlertCircle" size={14} /> {error}
            </div>
          )}

          <Button onClick={sendCode} disabled={resending}
            className="w-full gold-gradient text-background font-bold text-lg h-14 glow-gold disabled:opacity-50">
            {resending ? <Icon name="Loader" size={20} className="animate-spin" /> : 'Получить код'}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Код из SMS</label>
            <input
              className="w-full bg-background/60 border border-gold/20 rounded-xl px-4 py-3 outline-none focus:border-gold/50 transition-colors text-foreground text-center font-display text-2xl tracking-[0.5em] placeholder:tracking-normal placeholder:text-base"
              placeholder="000000"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              maxLength={6}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-400">
              <Icon name="AlertCircle" size={14} /> {error}
            </div>
          )}

          <Button onClick={handleVerify} disabled={loading || code.length !== 6}
            className="w-full gold-gradient text-background font-bold text-lg h-14 glow-gold disabled:opacity-50">
            {loading ? <Icon name="Loader" size={20} className="animate-spin" /> : 'Подтвердить'}
          </Button>

          <button onClick={sendCode} disabled={resending || cooldown > 0}
            className="w-full text-center text-sm text-muted-foreground hover:text-gold transition-colors disabled:opacity-50 py-2">
            {cooldown > 0 ? `Повторить через ${cooldown} сек.` : resending ? 'Отправка...' : 'Отправить код повторно'}
          </button>

          <button onClick={() => { setStep('phone'); setCode(''); setError(''); }}
            className="w-full text-center text-xs text-muted-foreground hover:text-gold transition-colors">
            Изменить номер телефона
          </button>
        </div>
      )}
    </div>
  );
}

const ACHIEVEMENT_CATEGORY_LABELS: Record<string, string> = {
  games: 'Игровая активность',
  wins: 'Победы',
  bigwin: 'Крупные выигрыши',
  deposit: 'Депозиты',
  daily: 'Ежедневная активность',
  referral: 'Рефералы',
  vip: 'VIP-статус',
};

function AchievementsView({ onBack }: { onBack: () => void }) {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalUnlocked, setTotalUnlocked] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY) || '';
    fetch(`${AUTH_API}?action=achievements`, { headers: { 'X-Auth-Token': token } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setAchievements(d.achievements || []);
          setTotalUnlocked(d.total_unlocked || 0);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const total = achievements.length;
  const progressPct = total > 0 ? Math.round((totalUnlocked / total) * 100) : 0;

  const categories = Array.from(new Set(achievements.map(a => a.category)));

  return (
    <div className="space-y-5 animate-float-up">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="w-10 h-10 rounded-xl glass flex items-center justify-center text-gold shrink-0">
          <Icon name="ArrowLeft" size={20} />
        </button>
        <div>
          <h2 className="font-display text-xl font-bold">Достижения</h2>
          <p className="text-xs text-muted-foreground">Бейджи за активность и награды</p>
        </div>
      </div>

      {/* Общий прогресс */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold">Прогресс</span>
          <span className="text-sm text-gold font-bold">{totalUnlocked} / {total}</span>
        </div>
        <div className="w-full h-2.5 bg-white/5 rounded-full overflow-hidden">
          <div className="h-full gold-gradient rounded-full transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Icon name="Loader" size={24} className="animate-spin text-gold" />
        </div>
      ) : (
        categories.map(cat => (
          <div key={cat} className="space-y-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              {ACHIEVEMENT_CATEGORY_LABELS[cat] || cat}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {achievements.filter(a => a.category === cat).map(a => (
                <div key={a.id}
                  className={`glass rounded-2xl p-4 flex flex-col items-center text-center gap-2 transition-all ${
                    a.unlocked ? 'border border-gold/30 glow-gold' : 'opacity-50 grayscale'
                  }`}
                >
                  <div className="text-3xl">{a.icon}</div>
                  <div className="text-sm font-bold leading-tight">{a.name}</div>
                  <div className="text-[11px] text-muted-foreground leading-tight">{a.desc}</div>
                  {a.reward > 0 && (
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      a.unlocked ? 'bg-gold/15 text-gold' : 'bg-white/5 text-muted-foreground'
                    }`}>
                      +{a.reward.toLocaleString('ru')} ₽
                    </span>
                  )}
                  {a.unlocked && (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold">
                      <Icon name="CheckCircle" size={11} /> Получено
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function QuestsView({ onBack, openGame }: { onBack: () => void; openGame: (id: string) => void }) {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCompleted, setTotalCompleted] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY) || '';
    fetch(`${AUTH_API}?action=quests`, { headers: { 'X-Auth-Token': token } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setQuests(d.quests || []);
          setTotalCompleted(d.total_completed || 0);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const total = quests.length;
  const progressPct = total > 0 ? Math.round((totalCompleted / total) * 100) : 0;

  return (
    <div className="space-y-5 animate-float-up">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="w-10 h-10 rounded-xl glass flex items-center justify-center text-gold shrink-0">
          <Icon name="ArrowLeft" size={20} />
        </button>
        <div>
          <h2 className="font-display text-xl font-bold">Задания</h2>
          <p className="text-xs text-muted-foreground">Ежедневные цели с наградой</p>
        </div>
      </div>

      {/* Общий прогресс */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold">Выполнено сегодня</span>
          <span className="text-sm text-gold font-bold">{totalCompleted} / {total}</span>
        </div>
        <div className="w-full h-2.5 bg-white/5 rounded-full overflow-hidden">
          <div className="h-full gold-gradient rounded-full transition-all" style={{ width: `${progressPct}%` }} />
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">Задания обновляются каждый день в полночь</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Icon name="Loader" size={24} className="animate-spin text-gold" />
        </div>
      ) : (
        <div className="space-y-3">
          {quests.map(q => {
            const progress = q.completed ? q.target : (q.progress || 0);
            const pct = Math.min(100, Math.round((progress / q.target) * 100));
            return (
              <div key={q.id}
                className={`glass rounded-2xl p-4 flex flex-col gap-2.5 transition-all ${
                  q.completed ? 'border border-gold/30 glow-gold' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="text-3xl shrink-0">{q.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold leading-tight">{q.name}</div>
                    <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">{q.desc}</div>
                  </div>
                  {q.reward > 0 && (
                    <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      q.completed ? 'bg-gold/15 text-gold' : 'bg-white/5 text-muted-foreground'
                    }`}>
                      +{q.reward.toLocaleString('ru')} ₽
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${q.completed ? 'gold-gradient' : 'bg-gold/50'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                    {progress}/{q.target}
                  </span>
                </div>

                {q.completed ? (
                  <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
                    <Icon name="CheckCircle" size={12} /> Выполнено
                  </span>
                ) : (
                  <button
                    onClick={() => openGame(GAMES.find(g => g.name === q.game)?.id || '')}
                    className="text-[11px] font-semibold text-gold flex items-center gap-1 hover:underline w-fit"
                  >
                    <Icon name="Play" size={12} /> Играть в «{q.game}»
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface LoyaltyLevelInfo { name: string; label: string; min_points: number; multiplier: number; color: string; emoji: string; }
interface LoyaltyData {
  points: number; points_lifetime: number;
  level: string; level_label: string; level_emoji: string; multiplier: number;
  next_level: string | null; next_level_label: string | null; next_level_min: number | null; next_level_emoji: string | null;
  points_per_rub: number; redeem_rate: number; min_redeem: number;
  all_levels: LoyaltyLevelInfo[];
  history: { points: number; amount: number; created_at: string }[];
}

function LoyaltyView({ onBack, onBalanceChange, onUserUpdate }: {
  onBack: () => void;
  onBalanceChange: (delta: number) => void;
  onUserUpdate: (u: Partial<AuthUser>) => void;
}) {
  const [data, setData] = useState<LoyaltyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [redeemAmount, setRedeemAmount] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  const load = () => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY) || '';
    fetch(`${AUTH_API}?action=loyalty`, { headers: { 'X-Auth-Token': token } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const parsedPoints = parseInt(redeemAmount) || 0;
  const redeemValue = data ? Math.round(parsedPoints * data.redeem_rate * 100) / 100 : 0;
  const canRedeem = !!data && parsedPoints >= data.min_redeem && parsedPoints <= data.points;

  const handleRedeem = async () => {
    if (!canRedeem) return;
    setRedeeming(true);
    const token = localStorage.getItem(AUTH_TOKEN_KEY) || '';
    try {
      const res = await fetch(`${AUTH_API}?action=redeem-loyalty`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ points: parsedPoints }),
      });
      const d = await res.json();
      if (res.ok) {
        toast.success(`Обменяно на ${d.amount.toLocaleString('ru')} ₽`);
        onBalanceChange(d.amount);
        onUserUpdate({ loyalty_points: d.remaining_points });
        setRedeemAmount('');
        load();
      } else {
        toast.error(d.error || 'Не удалось обменять очки');
      }
    } catch {
      toast.error('Ошибка сети, попробуй снова');
    } finally {
      setRedeeming(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Icon name="Loader" size={24} className="animate-spin text-gold" />
      </div>
    );
  }

  if (!data) return null;

  const progressPct = data.next_level_min
    ? Math.min(100, Math.round((data.points_lifetime / data.next_level_min) * 100))
    : 100;

  return (
    <div className="space-y-5 animate-float-up">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="w-10 h-10 rounded-xl glass flex items-center justify-center text-gold shrink-0">
          <Icon name="ArrowLeft" size={20} />
        </button>
        <div>
          <h2 className="font-display text-xl font-bold">Программа лояльности</h2>
          <p className="text-xs text-muted-foreground">Очки за каждую ставку</p>
        </div>
      </div>

      {/* Карточка уровня */}
      <div className="glass rounded-2xl p-5 relative overflow-hidden">
        <div className="absolute inset-0 shimmer-line opacity-20 pointer-events-none" />
        <div className="relative">
          <div className="flex items-center justify-between mb-3">
            <span className="inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1 rounded-full bg-gold/15 text-gold">
              {data.level_emoji} {data.level_label}
            </span>
            <span className="text-xs text-muted-foreground">×{data.multiplier} очков</span>
          </div>
          <div className="font-display text-4xl font-bold gold-text tabular-nums">{data.points.toLocaleString('ru')}</div>
          <p className="text-xs text-muted-foreground mt-1">доступно очков</p>

          {data.next_level_label && data.next_level_min && (
            <>
              <div className="flex items-center justify-between text-xs text-muted-foreground mt-4 mb-1.5">
                <span>До {data.next_level_emoji} {data.next_level_label}</span>
                <span className="font-semibold">{data.points_lifetime.toLocaleString('ru')} / {data.next_level_min.toLocaleString('ru')}</span>
              </div>
              <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full gold-gradient rounded-full transition-all" style={{ width: `${progressPct}%` }} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Как начисляются очки */}
      <div className="glass rounded-xl p-4 flex items-center gap-3">
        <Icon name="Info" size={16} className="text-gold shrink-0" />
        <p className="text-xs text-muted-foreground">
          За каждую ставку начисляется <span className="text-foreground font-semibold">{data.points_per_rub} очко за 1 ₽</span>, умноженное на множитель твоего уровня
        </p>
      </div>

      {/* Обмен очков */}
      <div className="glass rounded-2xl p-4 space-y-3">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Обменять очки на баланс</p>
        <div>
          <input
            className="w-full bg-background/60 border border-gold/20 rounded-xl px-4 py-3 outline-none focus:border-gold/50 transition-colors text-foreground font-display text-lg"
            placeholder={`Минимум ${data.min_redeem} очков`}
            value={redeemAmount}
            onChange={e => setRedeemAmount(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
          />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Курс обмена</span>
          <span className="font-medium">1 очко = {data.redeem_rate} ₽</span>
        </div>
        {parsedPoints > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Получишь</span>
            <span className="font-bold text-emerald-400">{redeemValue.toLocaleString('ru')} ₽</span>
          </div>
        )}
        {parsedPoints > 0 && parsedPoints < data.min_redeem && (
          <div className="flex items-center gap-2 text-xs text-red-400">
            <Icon name="AlertCircle" size={14} /> Минимум для обмена — {data.min_redeem} очков
          </div>
        )}
        {parsedPoints > data.points && (
          <div className="flex items-center gap-2 text-xs text-red-400">
            <Icon name="AlertCircle" size={14} /> Недостаточно очков
          </div>
        )}
        <Button onClick={handleRedeem} disabled={!canRedeem || redeeming}
          className="w-full gold-gradient text-background font-bold text-lg h-14 glow-gold disabled:opacity-50">
          {redeeming ? <Icon name="Loader" size={20} className="animate-spin" /> : 'Обменять'}
        </Button>
      </div>

      {/* Уровни лояльности */}
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Уровни программы</p>
        <div className="space-y-2">
          {data.all_levels.map(lv => (
            <div key={lv.name}
              className={`glass rounded-xl p-3 flex items-center gap-3 ${lv.name === data.level ? 'border border-gold/40' : ''}`}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                style={{ background: `${lv.color}18`, border: `1px solid ${lv.color}44` }}>
                {lv.emoji}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold">{lv.label}</div>
                <div className="text-xs text-muted-foreground">от {lv.min_points.toLocaleString('ru')} очков</div>
              </div>
              <span className="text-xs font-bold text-gold">×{lv.multiplier}</span>
            </div>
          ))}
        </div>
      </div>

      {/* История обменов */}
      {data.history.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">История обменов</p>
          <div className="space-y-2">
            {data.history.map((h, i) => (
              <div key={i} className="glass rounded-xl p-3 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{h.points.toLocaleString('ru')} очков</span>
                <span className="font-semibold text-emerald-400">+{h.amount.toLocaleString('ru')} ₽</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DailySpinView({ onBack, onClaimed }: { onBack: () => void; onClaimed: (prize: number, balance: number) => void }) {
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'result'>('idle');
  const [rotation, setRotation] = useState(0);
  const [sectorIdx, setSectorIdx] = useState<number | null>(null);
  const [prize, setPrize] = useState(0);
  const [newBalance, setNewBalance] = useState(0);
  const [error, setError] = useState('');
  const [canSpin, setCanSpin] = useState(true);
  const rotRef = useRef(0);
  const rafRef = useRef<number>(0);
  const ctxRef = useRef<AudioContext | null>(null);

  // Проверяем статус при открытии
  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return;
    fetch(`${AUTH_API}?action=spin-status`, { headers: { 'X-Auth-Token': token } })
      .then(r => r.json())
      .then(d => setCanSpin(d.can_spin ?? true))
      .catch(() => {});
  }, []);

  function audio() {
    if (!ctxRef.current) {
      try {
        const C = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        ctxRef.current = C ? new C() : null;
      } catch { ctxRef.current = null; }
    }
    return ctxRef.current;
  }
  function playTick() {
    const ctx = audio(); if (!ctx) return;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'triangle'; o.frequency.value = 800 + Math.random() * 200;
    g.gain.setValueAtTime(0.06, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
    o.start(); o.stop(ctx.currentTime + 0.04);
  }
  function playWinSound(big: boolean) {
    const ctx = audio(); if (!ctx) return;
    const notes = big ? [523,659,784,1047,1319] : [523,659,784];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine'; o.frequency.value = f;
      const t = ctx.currentTime + i * 0.09;
      g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.start(t); o.stop(t + 0.25);
    });
  }

  async function doSpin() {
    if (phase !== 'idle' || !canSpin) return;
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) { setError('Войдите в аккаунт'); return; }

    setPhase('spinning'); setError('');

    // Запрос к бэкенду
    let targetIdx = Math.floor(Math.random() * N_SECTORS); // fallback
    let prizeVal = 0, balanceVal = 0;
    try {
      const res = await fetch(`${AUTH_API}?action=spin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || 'Ошибка');
        setPhase('idle');
        if (data.error === 'already_spun') setCanSpin(false);
        return;
      }
      targetIdx = data.sector_idx;
      prizeVal  = data.prize;
      balanceVal = data.balance;
    } catch {
      setError('Ошибка сети');
      setPhase('idle');
      return;
    }

    // Анимация — рассчитываем угол остановки
    const targetAngle = 360 - ((targetIdx + 0.5) * SECTOR_ANGLE) % 360;
    const extraSpins = (5 + Math.floor(Math.random() * 3)) * 360;
    const finalAngle = rotRef.current + extraSpins + ((targetAngle - rotRef.current % 360) + 360) % 360;
    const duration = 4500;
    const startRot = rotRef.current;
    const startTime = performance.now();
    let lastTick = startRot;

    const animate = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const ease = t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2;
      const cur = startRot + (finalAngle - startRot) * ease;
      rotRef.current = cur;
      setRotation(cur);
      if (Math.floor(cur / SECTOR_ANGLE) !== Math.floor(lastTick / SECTOR_ANGLE)) {
        playTick(); lastTick = cur;
      }
      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        rotRef.current = finalAngle;
        setRotation(finalAngle);
        setSectorIdx(targetIdx);
        setPrize(prizeVal);
        setNewBalance(balanceVal);
        setCanSpin(false);
        setPhase('result');
        playWinSound(prizeVal >= 50);
        onClaimed(prizeVal, balanceVal);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
  }

  useEffect(() => () => { cancelAnimationFrame(rafRef.current); }, []);

  const resultSector = sectorIdx !== null ? SPIN_SECTORS[sectorIdx] : null;

  return (
    <div className="space-y-4 animate-float-up">
      {/* Шапка */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="w-10 h-10 rounded-xl glass flex items-center justify-center text-gold shrink-0">
          <Icon name="ArrowLeft" size={20} />
        </button>
        <div className="flex-1">
          <h2 className="font-display text-xl font-bold">Колесо фортуны 🎡</h2>
          <p className="text-xs text-muted-foreground">Бесплатный спин каждый день</p>
        </div>
        {!canSpin && (
          <span className="text-xs text-muted-foreground glass px-3 py-1.5 rounded-lg">Завтра</span>
        )}
      </div>

      {/* Колесо */}
      <div className="flex flex-col items-center gap-2">
        {/* Стрелка */}
        <div className="w-0 h-0" style={{ borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: '22px solid hsl(43 74% 52%)' }} />
        <div className="rounded-full p-1" style={{ background: 'radial-gradient(circle, hsl(43 74% 52% / 0.12), transparent 70%)', boxShadow: phase === 'spinning' ? '0 0 40px hsl(43 74% 52% / 0.4)' : '0 0 18px hsl(43 74% 52% / 0.15)' }}>
          <SpinWheelSvg rotation={rotation} size={288} />
        </div>
      </div>

      {/* Результат */}
      {phase === 'result' && resultSector && (
        <div className={`animate-win-pop glass rounded-2xl p-4 text-center border ${
          resultSector.type === 'nothing' ? 'border-white/10' :
          resultSector.type === 'multiplier' ? 'border-purple-400/40' : 'border-gold/40 glow-gold'
        }`}>
          {resultSector.type === 'nothing' ? (
            <p className="text-muted-foreground font-display text-lg font-bold">Ничего не выпало 😔</p>
          ) : resultSector.type === 'multiplier' ? (
            <>
              <p className="text-purple-400 font-display text-xl font-bold">🎉 {resultSector.label} к балансу!</p>
              {prize > 0 && <p className="text-emerald-400 font-bold text-lg mt-1">+{prize.toLocaleString('ru')} ₽</p>}
            </>
          ) : (
            <p className="gold-text font-display text-2xl font-bold">🎉 +{prize.toLocaleString('ru')} ₽</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">Баланс: {newBalance.toLocaleString('ru')} ₽</p>
        </div>
      )}

      {/* Ошибка */}
      {error && (
        <div className="glass rounded-xl p-3 flex items-center gap-2 text-sm text-red-400 border border-red-500/20">
          <Icon name="AlertCircle" size={15} /> {error}
        </div>
      )}

      {/* Кнопка */}
      {phase !== 'result' && (
        <button onClick={doSpin} disabled={phase === 'spinning' || !canSpin}
          className="w-full h-14 rounded-2xl font-display font-bold text-xl gold-gradient text-background glow-gold disabled:opacity-50 flex items-center justify-center gap-3 transition-all">
          {phase === 'spinning'
            ? <><Icon name="Loader" size={22} className="animate-spin" /> Крутим...</>
            : canSpin
              ? <><Icon name="RefreshCw" size={22} /> Крутить бесплатно!</>
              : <><Icon name="Clock" size={22} /> Спин уже использован</>
          }
        </button>
      )}
      {phase === 'result' && (
        <button onClick={onBack}
          className="w-full h-14 rounded-2xl font-display font-bold text-xl gold-gradient text-background glow-gold flex items-center justify-center gap-3">
          <Icon name="Check" size={22} /> Отлично!
        </button>
      )}

      {/* Легенда */}
      <div className="glass rounded-2xl p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Возможные призы</p>
        <div className="grid grid-cols-2 gap-y-2 gap-x-4">
          {[
            { label: '100 ₽', color: '#ef4444' },
            { label: '×3 к балансу', color: '#10b981' },
            { label: '50 ₽', color: '#f97316' },
            { label: '×2 к балансу', color: '#a78bfa' },
            { label: '25 ₽', color: '#34d399' },
            { label: '×1.5 к балансу', color: '#60a5fa' },
          ].map(r => (
            <div key={r.label} className="flex items-center gap-2 text-sm">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.color }} />
              <span className="text-muted-foreground">{r.label}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground/60 mt-3">Множители применяются к текущему балансу (макс. 500 ₽)</p>
      </div>
    </div>
  );
}

function DailyBonusView({ onBack, onClaimed }: { onBack: () => void; onClaimed: (bonus: number, balance: number) => void }) {
  const [step, setStep] = useState<'idle' | 'spinning' | 'result'>('idle');
  const [bonus, setBonus] = useState(0);
  const [newBalance, setNewBalance] = useState(0);
  const [error, setError] = useState('');
  const [displayNum, setDisplayNum] = useState(0);

  const handleClaim = async () => {
    const token = localStorage.getItem('casino_auth_token');
    if (!token) return;
    setStep('spinning');
    setError('');

    // Анимация счётчика до 100
    let frame = 0;
    const spin = setInterval(() => {
      setDisplayNum(Math.floor(Math.random() * 100) + 1);
      frame++;
      if (frame > 20) clearInterval(spin);
    }, 60);

    try {
      const res = await fetch(`${AUTH_API}?action=daily`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({}),
      });
      const data = await res.json();

      setTimeout(() => {
        clearInterval(spin);
        if (res.ok) {
          setBonus(data.bonus);
          setNewBalance(data.balance);
          setDisplayNum(data.bonus);
          setStep('result');
        } else {
          setError(data.message || 'Ошибка');
          setStep('idle');
        }
      }, 1400);
    } catch {
      clearInterval(spin);
      setError('Ошибка сети');
      setStep('idle');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="w-10 h-10 rounded-xl glass flex items-center justify-center text-gold">
          <Icon name="ArrowLeft" size={20} />
        </button>
        <div>
          <h2 className="font-display text-xl font-bold">Ежедневный бонус</h2>
          <p className="text-sm text-muted-foreground">Заходи каждый день за наградой</p>
        </div>
      </div>

      <div className="glass rounded-3xl p-8 flex flex-col items-center gap-6 text-center glow-soft">
        {step === 'result' ? (
          <>
            <div className="w-24 h-24 rounded-full gold-gradient flex items-center justify-center glow-gold animate-win-pop">
              <Icon name="Gift" size={40} className="text-background" />
            </div>
            <div>
              <p className="text-muted-foreground text-sm mb-1">Ты получил</p>
              <div className="font-display text-5xl font-bold gold-text">+{bonus.toFixed(2)} ₽</div>
              <p className="text-xs text-muted-foreground mt-2">Баланс: {newBalance.toLocaleString('ru')} ₽</p>
            </div>
            <Button onClick={() => onClaimed(bonus, newBalance)}
              className="w-full gold-gradient text-background font-bold h-12 glow-gold">
              <Icon name="Check" size={18} className="mr-2" /> Отлично!
            </Button>
          </>
        ) : (
          <>
            <div className={`w-24 h-24 rounded-full gold-gradient flex items-center justify-center glow-gold ${step === 'spinning' ? 'animate-spin' : ''}`}>
              <Icon name="Gift" size={40} className="text-background" />
            </div>

            {step === 'spinning' ? (
              <div className="font-display text-6xl font-bold gold-text tabular-nums">
                {displayNum} ₽
              </div>
            ) : (
              <div>
                <p className="text-muted-foreground text-sm">Нажми и получи</p>
                <div className="font-display text-5xl font-bold gold-text mt-1">до 100 ₽</div>
                <p className="text-xs text-muted-foreground mt-2">Бонус доступен раз в сутки</p>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-400">
                <Icon name="AlertCircle" size={14} /> {error}
              </div>
            )}

            <Button onClick={handleClaim} disabled={step === 'spinning'}
              className="w-full gold-gradient text-background font-bold h-14 text-lg glow-gold disabled:opacity-60">
              {step === 'spinning'
                ? <><Icon name="Loader" size={20} className="mr-2 animate-spin" /> Крутим барабан...</>
                : <><Icon name="Gift" size={20} className="mr-2" /> Получить бонус</>}
            </Button>
          </>
        )}
      </div>

      <div className="glass rounded-2xl p-4 flex items-center gap-3 text-sm text-muted-foreground">
        <Icon name="Info" size={16} className="text-gold shrink-0" />
        Бонус начисляется случайно. Заходи каждый день — не пропускай!
      </div>
    </div>
  );
}

function ReferralView({ user, onBack }: { user: AuthUser | null; onBack: () => void }) {
  const [stats, setStats] = useState<{ referral_code: string; total_referrals: number; total_earned: number; bonuses: { username: string; email: string; amount: number; type: string; created_at: string }[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const refLink = `${window.location.origin}${window.location.pathname}?ref=${user?.referral_code || ''}`;

  useEffect(() => {
    const token = localStorage.getItem('casino_auth_token');
    if (!token) { setLoading(false); return; }
    fetch(`${AUTH_API}?action=referral`, { headers: { 'X-Auth-Token': token } })
      .then(r => r.json())
      .then(setStats)
      .finally(() => setLoading(false));
  }, []);

  const copyLink = () => {
    navigator.clipboard.writeText(refLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="w-10 h-10 rounded-xl glass flex items-center justify-center text-gold">
          <Icon name="ArrowLeft" size={20} />
        </button>
        <div>
          <h2 className="font-display text-xl font-bold">Пригласить друга</h2>
          <p className="text-sm text-muted-foreground">Зарабатывай с каждого реферала</p>
        </div>
      </div>

      {/* Условия */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass rounded-2xl p-4 text-center space-y-1">
          <div className="w-10 h-10 rounded-xl gold-gradient flex items-center justify-center mx-auto">
            <Icon name="UserPlus" size={18} className="text-background" />
          </div>
          <div className="font-display font-bold text-lg gold-text">50 ₽</div>
          <div className="text-xs text-muted-foreground">другу при регистрации</div>
        </div>
        <div className="glass rounded-2xl p-4 text-center space-y-1">
          <div className="w-10 h-10 rounded-xl gold-gradient flex items-center justify-center mx-auto">
            <Icon name="Percent" size={18} className="text-background" />
          </div>
          <div className="font-display font-bold text-lg gold-text">15%</div>
          <div className="text-xs text-muted-foreground">тебе с каждого пополнения</div>
        </div>
      </div>

      {/* Ссылка */}
      <div className="glass rounded-2xl p-4 space-y-3">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Твоя реферальная ссылка</p>
        <div className="bg-background/40 rounded-xl px-3 py-2.5 text-xs font-mono text-muted-foreground break-all">
          {refLink}
        </div>
        <button onClick={copyLink}
          className={`w-full h-11 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2
            ${copied ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'gold-gradient text-background glow-gold'}`}>
          <Icon name={copied ? 'Check' : 'Copy'} size={16} />
          {copied ? 'Ссылка скопирована!' : 'Скопировать ссылку'}
        </button>
        <button onClick={() => {
          if (navigator.share) navigator.share({ title: 'LUXE Casino', text: 'Заходи в казино по моей ссылке и получи 50 ₽!', url: refLink });
        }} className="w-full h-11 rounded-xl font-semibold text-sm glass text-muted-foreground flex items-center justify-center gap-2 hover:text-foreground transition-colors">
          <Icon name="Share2" size={16} /> Поделиться
        </button>
      </div>

      {/* Статистика */}
      {loading ? (
        <div className="flex justify-center py-8"><Icon name="Loader" size={24} className="animate-spin text-gold" /></div>
      ) : stats && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="glass rounded-2xl p-4 text-center">
              <div className="font-display text-3xl font-bold gold-text">{stats.total_referrals}</div>
              <div className="text-xs text-muted-foreground mt-1">рефералов</div>
            </div>
            <div className="glass rounded-2xl p-4 text-center">
              <div className="font-display text-3xl font-bold text-emerald-400">+{stats.total_earned.toLocaleString('ru')} ₽</div>
              <div className="text-xs text-muted-foreground mt-1">заработано</div>
            </div>
          </div>

          {stats.bonuses.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wider px-1">История начислений</p>
              {stats.bonuses.map((b, i) => (
                <div key={i} className="glass rounded-xl p-3 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${b.type === 'signup' ? 'bg-gold/10' : 'bg-emerald-500/10'}`}>
                    <Icon name={b.type === 'signup' ? 'UserPlus' : 'ArrowDownToLine'} size={14} className={b.type === 'signup' ? 'text-gold' : 'text-emerald-400'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{b.username || b.email}</div>
                    <div className="text-xs text-muted-foreground">
                      {b.type === 'signup' ? 'Регистрация' : '15% с пополнения'} · {new Date(b.created_at).toLocaleDateString('ru')}
                    </div>
                  </div>
                  <span className="text-emerald-400 font-display font-bold shrink-0">+{b.amount.toLocaleString('ru')} ₽</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
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
const AB_TESTS_API = 'https://functions.poehali.dev/cb635d45-413c-4c9a-9279-91ca31d6f5c6';

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

function AdminView({ onPendingChange }: { onPendingChange?: (n: number) => void }) {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [tab, setTab] = useState<'withdrawals' | 'orders' | 'top' | 'promos' | 'support' | 'cohorts' | 'abtests'>('withdrawals');
  const [topDepositors, setTopDepositors] = useState<{ rank: number; user_id: number; username: string; email: string; deposits_count: number; total_deposited: number; last_deposit: string | null; balance: number }[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [chartData, setChartData] = useState<{ date: string; deposits: number; withdrawals: number }[]>([]);
  const [chartDays, setChartDays] = useState(14);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [updating, setUpdating] = useState<number | null>(null);
  const [selected, setSelected] = useState<Withdrawal | null>(null);
  const passwordRef = useRef('');

  // Промокоды
  const [promos, setPromos] = useState<{id:number;code:string;bonus_amount:number;max_uses:number|null;uses_count:number;is_active:boolean;created_at:string;expires_at:string|null}[]>([]);
  const [promoForm, setPromoForm] = useState({ code: '', bonus_amount: '', max_uses: '', expires_at: '' });
  const [promoSaving, setPromoSaving] = useState(false);
  const [promoError, setPromoError] = useState('');

  const fetchPromos = useCallback(async (pwd: string) => {
    const res = await fetch(`${ADMIN_API}?type=promos`, { headers: { 'X-Admin-Password': pwd } });
    if (res.ok) { const d = await res.json(); setPromos(d.promos || []); }
  }, []);

  const createPromo = async () => {
    if (!promoForm.code || !promoForm.bonus_amount) { setPromoError('Укажите код и сумму'); return; }
    setPromoSaving(true); setPromoError('');
    const res = await fetch(ADMIN_API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Password': passwordRef.current },
      body: JSON.stringify({
        code: promoForm.code.trim().toUpperCase(),
        bonus_amount: parseFloat(promoForm.bonus_amount),
        max_uses: promoForm.max_uses ? parseInt(promoForm.max_uses) : null,
        expires_at: promoForm.expires_at || null,
      }),
    });
    const d = await res.json();
    if (!res.ok) { setPromoError(d.error || 'Ошибка'); }
    else { setPromoForm({ code: '', bonus_amount: '', max_uses: '', expires_at: '' }); fetchPromos(passwordRef.current); }
    setPromoSaving(false);
  };

  const togglePromo = async (id: number, is_active: boolean) => {
    await fetch(ADMIN_API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Password': passwordRef.current },
      body: JSON.stringify({ id, is_active }),
    });
    fetchPromos(passwordRef.current);
  };

  const deletePromo = async (id: number) => {
    if (!confirm('Удалить промокод?')) return;
    await fetch(ADMIN_API, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Password': passwordRef.current },
      body: JSON.stringify({ id }),
    });
    fetchPromos(passwordRef.current);
  };

  // Поддержка — чаты
  interface AdminChat { id: number; user_id: number; username: string; email: string; status: string; unread_admin: number; last_message_at: string | null; last_text: string; }
  const [supportChats, setSupportChats] = useState<AdminChat[]>([]);
  const [selectedChat, setSelectedChat] = useState<{ id: number; username: string; email: string; status: string } | null>(null);
  const [chatMessages, setChatMessages] = useState<SupportMessage[]>([]);
  const [replyText, setReplyText] = useState('');
  const [replySending, setReplySending] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const fetchSupportChats = useCallback(async (pwd: string) => {
    const res = await fetch(`${ADMIN_API}?type=support-chats`, { headers: { 'X-Admin-Password': pwd } });
    if (res.ok) { const d = await res.json(); setSupportChats(d.chats || []); }
  }, []);

  const openChat = async (chat: AdminChat) => {
    setSelectedChat({ id: chat.id, username: chat.username, email: chat.email, status: chat.status });
    const res = await fetch(`${ADMIN_API}?type=support-messages&chat_id=${chat.id}`, { headers: { 'X-Admin-Password': passwordRef.current } });
    if (res.ok) {
      const d = await res.json();
      setChatMessages(d.messages || []);
      setSelectedChat({ id: d.chat.id, username: d.chat.username, email: d.chat.email, status: d.chat.status });
      setSupportChats(prev => prev.map(c => c.id === chat.id ? { ...c, unread_admin: 0 } : c));
    }
    setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const sendReply = async () => {
    const t = replyText.trim();
    if (!t || replySending || !selectedChat) return;
    setReplySending(true);
    const res = await fetch(ADMIN_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Password': passwordRef.current },
      body: JSON.stringify({ type: 'support-reply', chat_id: selectedChat.id, text: t }),
    });
    if (res.ok) {
      const d = await res.json();
      setChatMessages(prev => [...prev, { id: d.id, sender: 'admin', text: t, created_at: d.created_at }]);
      setReplyText('');
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
    setReplySending(false);
  };

  const closeChat = async (chatId: number) => {
    await fetch(ADMIN_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Password': passwordRef.current },
      body: JSON.stringify({ type: 'support-close', chat_id: chatId }),
    });
    setSelectedChat(prev => prev ? { ...prev, status: 'closed' } : null);
    setSupportChats(prev => prev.map(c => c.id === chatId ? { ...c, status: 'closed' } : c));
  };

  const fetchStats = useCallback(async (pwd: string) => {
    const res = await fetch(`${ADMIN_API}?type=stats`, { headers: { 'X-Admin-Password': pwd } });
    if (res.ok) {
      const data = await res.json();
      setStats(data);
      onPendingChange?.(data.wd_pending_count || 0);
    }
  }, [onPendingChange]);

  const fetchChart = useCallback(async (pwd: string, days: number) => {
    const res = await fetch(`${ADMIN_API}?type=chart&days=${days}`, { headers: { 'X-Admin-Password': pwd } });
    if (res.ok) {
      const data = await res.json();
      setChartData(data.chart || []);
    }
  }, []);

  const fetchTopDepositors = useCallback(async (pwd: string) => {
    const res = await fetch(`${ADMIN_API}?type=top-depositors`, { headers: { 'X-Admin-Password': pwd } });
    if (res.ok) {
      const data = await res.json();
      setTopDepositors(data.leaders || []);
    }
  }, []);

  // Когортная аналитика
  interface CohortWeek { week_offset: number; active_users: number; retention_pct: number; }
  interface Cohort {
    cohort_week: string; cohort_size: number; weeks: CohortWeek[];
    depositors: number; total_deposited: number; deposit_rate_pct: number; avg_deposit_per_depositor: number;
  }
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [cohortMaxOffset, setCohortMaxOffset] = useState(0);
  const [cohortWeeksRange, setCohortWeeksRange] = useState(8);
  const [cohortLoading, setCohortLoading] = useState(false);

  const fetchCohorts = useCallback(async (pwd: string, weeks: number) => {
    setCohortLoading(true);
    try {
      const res = await fetch(`${ADMIN_API}?type=cohorts&weeks=${weeks}`, { headers: { 'X-Admin-Password': pwd } });
      if (res.ok) {
        const data = await res.json();
        setCohorts(data.cohorts || []);
        setCohortMaxOffset(data.max_week_offset || 0);
      }
    } finally {
      setCohortLoading(false);
    }
  }, []);

  // A/B тесты акций
  interface AbVariantResult { participants: number; conversions: number; conversion_rate: number; total_value: number; avg_value?: number; }
  interface AbTest {
    id: number; name: string; description: string; test_type: string; status: 'draft' | 'running' | 'stopped';
    variant_a_label: string; variant_a_value: number; variant_b_label: string; variant_b_value: number;
    traffic_split: number; created_at: string; started_at: string | null; stopped_at: string | null;
    results: { A: AbVariantResult; B: AbVariantResult };
  }
  const [abTests, setAbTests] = useState<AbTest[]>([]);
  const [abLoading, setAbLoading] = useState(false);
  const [abForm, setAbForm] = useState({
    name: '', description: '',
    variant_a_label: 'Без изменений', variant_a_value: '100',
    variant_b_label: 'Тест', variant_b_value: '150',
    traffic_split: '50',
  });
  const [abSaving, setAbSaving] = useState(false);
  const [abError, setAbError] = useState('');
  const [abFormOpen, setAbFormOpen] = useState(false);

  const fetchAbTests = useCallback(async (pwd: string) => {
    setAbLoading(true);
    try {
      const res = await fetch(AB_TESTS_API, { headers: { 'X-Admin-Password': pwd } });
      if (res.ok) {
        const data = await res.json();
        setAbTests(data.tests || []);
      }
    } finally {
      setAbLoading(false);
    }
  }, []);

  const createAbTest = async () => {
    if (!abForm.name.trim()) { setAbError('Укажи название теста'); return; }
    setAbSaving(true); setAbError('');
    try {
      const res = await fetch(AB_TESTS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': passwordRef.current },
        body: JSON.stringify({
          name: abForm.name.trim(),
          description: abForm.description.trim(),
          test_type: 'first_deposit_bonus',
          variant_a_label: abForm.variant_a_label.trim() || 'A',
          variant_a_value: parseFloat(abForm.variant_a_value) || 0,
          variant_b_label: abForm.variant_b_label.trim() || 'B',
          variant_b_value: parseFloat(abForm.variant_b_value) || 0,
          traffic_split: parseInt(abForm.traffic_split) || 50,
        }),
      });
      const d = await res.json();
      if (!res.ok) { setAbError(d.error || 'Ошибка'); return; }
      setAbForm({ name: '', description: '', variant_a_label: 'Без изменений', variant_a_value: '100', variant_b_label: 'Тест', variant_b_value: '150', traffic_split: '50' });
      setAbFormOpen(false);
      fetchAbTests(passwordRef.current);
    } finally {
      setAbSaving(false);
    }
  };

  const setAbTestStatus = async (id: number, status: 'running' | 'stopped') => {
    const res = await fetch(AB_TESTS_API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Password': passwordRef.current },
      body: JSON.stringify({ id, status }),
    });
    const d = await res.json();
    if (!res.ok) { toast.error(d.error || 'Ошибка'); return; }
    fetchAbTests(passwordRef.current);
  };

  const deleteAbTest = async (id: number) => {
    if (!confirm('Удалить тест?')) return;
    const res = await fetch(AB_TESTS_API, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Password': passwordRef.current },
      body: JSON.stringify({ id }),
    });
    const d = await res.json();
    if (!res.ok) { toast.error(d.error || 'Ошибка'); return; }
    fetchAbTests(passwordRef.current);
  };

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
      fetchChart(password, 14);
      fetchTopDepositors(password);
      fetchPromos(password);
      fetchSupportChats(password);
    } finally {
      setLoading(false);
    }
  };

  const switchTab = (t: 'withdrawals' | 'orders' | 'top' | 'promos' | 'support' | 'cohorts' | 'abtests') => {
    setTab(t);
    setFilter('');
    setSelected(null);
    setSelectedChat(null);
    if (t === 'withdrawals' || t === 'orders') fetchData(passwordRef.current, t);
    if (t === 'top') fetchTopDepositors(passwordRef.current);
    if (t === 'promos') fetchPromos(passwordRef.current);
    if (t === 'support') fetchSupportChats(passwordRef.current);
    if (t === 'cohorts') fetchCohorts(passwordRef.current, cohortWeeksRange);
    if (t === 'abtests') fetchAbTests(passwordRef.current);
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
      fetchData(passwordRef.current, tab, filter);
      const res = await fetch(`${ADMIN_API}?type=stats`, { headers: { 'X-Admin-Password': passwordRef.current } });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
        onPendingChange?.(data.wd_pending_count || 0);
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

  const exportCurrentTab = () => {
    if (tab === 'withdrawals') {
      if (withdrawals.length === 0) { toast.error('Нет данных для экспорта'); return; }
      exportToExcel(withdrawals.map(w => ({
        'Заявка': w.request_number,
        'Пользователь': w.user_name || '—',
        'Email': w.user_email || '—',
        'Telegram': w.user_telegram || '—',
        'Способ': w.method,
        'Реквизиты': w.destination,
        'Сумма ₽': w.amount,
        'Статус': STATUS_META[w.status]?.label || w.status,
        'Дата': new Date(w.created_at).toLocaleString('ru'),
      })), 'Выводы', 'Выводы');
      toast.success('Отчёт по выводам скачан');
    } else if (tab === 'orders') {
      if (orders.length === 0) { toast.error('Нет данных для экспорта'); return; }
      exportToExcel(orders.map(o => ({
        'Заказ': o.order_number,
        'Пользователь': o.user_name || '—',
        'Email': o.user_email || '—',
        'Комментарий': o.order_comment || '—',
        'Сумма ₽': o.amount,
        'Статус': ORDER_STATUS_META[o.status]?.label || o.status,
        'Создан': new Date(o.created_at).toLocaleString('ru'),
        'Оплачен': o.paid_at ? new Date(o.paid_at).toLocaleString('ru') : '—',
      })), 'Пополнения', 'Пополнения');
      toast.success('Отчёт по пополнениям скачан');
    } else if (tab === 'top') {
      if (topDepositors.length === 0) { toast.error('Нет данных для экспорта'); return; }
      exportToExcel(topDepositors.map(t => ({
        '#': t.rank,
        'Пользователь': t.username,
        'Email': t.email,
        'Депозитов': t.deposits_count,
        'Сумма ₽': t.total_deposited,
        'Баланс ₽': t.balance,
        'Последний депозит': t.last_deposit ? new Date(t.last_deposit).toLocaleString('ru') : '—',
      })), 'Топ_депозитов', 'Топ');
      toast.success('Отчёт по топу депозитов скачан');
    } else if (tab === 'promos') {
      if (promos.length === 0) { toast.error('Нет данных для экспорта'); return; }
      exportToExcel(promos.map(p => ({
        'Код': p.code,
        'Бонус ₽': p.bonus_amount,
        'Лимит использований': p.max_uses ?? 'Без лимита',
        'Использовано': p.uses_count,
        'Активен': p.is_active ? 'Да' : 'Нет',
        'Создан': new Date(p.created_at).toLocaleString('ru'),
        'Истекает': p.expires_at ? new Date(p.expires_at).toLocaleString('ru') : '—',
      })), 'Промокоды', 'Промокоды');
      toast.success('Отчёт по промокодам скачан');
    }
  };

  const exportableTab = tab === 'withdrawals' || tab === 'orders' || tab === 'top' || tab === 'promos';

  return (
    <div className="space-y-4">
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <SectionTitle title="Админ" subtitle="Панель управления" icon="ShieldCheck" />
        <div className="flex items-center gap-2">
          {exportableTab && (
            <button onClick={exportCurrentTab}
              className="h-9 px-3 glass rounded-xl flex items-center gap-1.5 text-emerald-400 text-xs font-semibold">
              <Icon name="FileSpreadsheet" size={15} />
              Excel
            </button>
          )}
          <button onClick={() => { fetchData(passwordRef.current, tab, filter); fetchStats(passwordRef.current); }}
            className="w-9 h-9 glass rounded-xl flex items-center justify-center text-gold">
            <Icon name="RefreshCw" size={16} />
          </button>
        </div>
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

      {/* График */}
      <div className="glass rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">График пополнений</p>
          <div className="flex gap-1">
            {[7, 14, 30].map(d => (
              <button key={d} onClick={() => { setChartDays(d); fetchChart(passwordRef.current, d); }}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all
                  ${chartDays === d ? 'gold-gradient text-background' : 'glass text-muted-foreground'}`}>
                {d}д
              </button>
            ))}
          </div>
        </div>
        {chartData.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
            Нет данных за этот период
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="gDeposit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f5c842" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f5c842" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gWithdraw" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f87171" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: '#888', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#888', fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(245,200,66,0.2)', borderRadius: 12, fontSize: 12 }}
                formatter={(val: number, name: string) => [`${Number(val).toLocaleString('ru')} ₽`, name === 'deposits' ? 'Пополнения' : 'Выводы']}
              />
              <Area type="monotone" dataKey="deposits" stroke="#f5c842" strokeWidth={2} fill="url(#gDeposit)" dot={false} />
              <Area type="monotone" dataKey="withdrawals" stroke="#f87171" strokeWidth={2} fill="url(#gWithdraw)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-gold inline-block rounded" /> Пополнения</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-red-400 inline-block rounded" /> Выводы</span>
        </div>
      </div>

      {/* Вкладки */}
      <div className="grid grid-cols-4 gap-1.5">
        <button onClick={() => switchTab('withdrawals')}
          className={`py-2.5 rounded-2xl font-semibold text-xs flex flex-col items-center justify-center gap-1 transition-all
            ${tab === 'withdrawals' ? 'gold-gradient text-background glow-gold' : 'glass text-muted-foreground'}`}>
          <Icon name="ArrowUpFromLine" size={14} />
          <span>Выводы</span>
          {withdrawals.length > 0 && <span className="bg-background/20 rounded-full px-1.5 text-[10px]">{withdrawals.length}</span>}
        </button>
        <button onClick={() => switchTab('orders')}
          className={`py-2.5 rounded-2xl font-semibold text-xs flex flex-col items-center justify-center gap-1 transition-all
            ${tab === 'orders' ? 'gold-gradient text-background glow-gold' : 'glass text-muted-foreground'}`}>
          <Icon name="ArrowDownToLine" size={14} />
          <span>Депо</span>
          {orders.length > 0 && <span className="bg-background/20 rounded-full px-1.5 text-[10px]">{orders.length}</span>}
        </button>
        <button onClick={() => switchTab('top')}
          className={`py-2.5 rounded-2xl font-semibold text-xs flex flex-col items-center justify-center gap-1 transition-all
            ${tab === 'top' ? 'gold-gradient text-background glow-gold' : 'glass text-muted-foreground'}`}>
          <Icon name="Crown" size={14} />
          <span>Топ</span>
        </button>
        <button onClick={() => switchTab('promos')}
          className={`py-2.5 rounded-2xl font-semibold text-xs flex flex-col items-center justify-center gap-1 transition-all
            ${tab === 'promos' ? 'gold-gradient text-background glow-gold' : 'glass text-muted-foreground'}`}>
          <Icon name="Ticket" size={14} />
          <span>Промо</span>
        </button>
        <button onClick={() => switchTab('support')}
          className={`py-2.5 rounded-2xl font-semibold text-xs flex flex-col items-center justify-center gap-1 transition-all relative
            ${tab === 'support' ? 'gold-gradient text-background glow-gold' : 'glass text-muted-foreground'}`}>
          <Icon name="MessageCircle" size={14} />
          <span>Чаты</span>
          {supportChats.some(c => c.unread_admin > 0) && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-400" />
          )}
        </button>
        <button onClick={() => switchTab('cohorts')}
          className={`py-2.5 rounded-2xl font-semibold text-xs flex flex-col items-center justify-center gap-1 transition-all
            ${tab === 'cohorts' ? 'gold-gradient text-background glow-gold' : 'glass text-muted-foreground'}`}>
          <Icon name="Users" size={14} />
          <span>Когорты</span>
        </button>
        <button onClick={() => switchTab('abtests')}
          className={`py-2.5 rounded-2xl font-semibold text-xs flex flex-col items-center justify-center gap-1 transition-all relative
            ${tab === 'abtests' ? 'gold-gradient text-background glow-gold' : 'glass text-muted-foreground'}`}>
          <Icon name="FlaskConical" size={14} />
          <span>A/B тесты</span>
          {abTests.some(t => t.status === 'running') && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-400" />
          )}
        </button>
      </div>

      {/* Итого */}
      {tab !== 'top' && tab !== 'promos' && tab !== 'support' && tab !== 'cohorts' && tab !== 'abtests' && currentList.length > 0 && (
        <div className="glass rounded-2xl p-4 flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Сумма ({currentList.length} записей)</span>
          <span className="font-display font-bold gold-text text-lg">{totalAmount.toLocaleString('ru')} ₽</span>
        </div>
      )}

      {/* Фильтр */}
      {tab !== 'top' && tab !== 'promos' && tab !== 'support' && tab !== 'cohorts' && tab !== 'abtests' && <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {[{ key: '', label: 'Все' }, ...Object.entries(filterMeta).map(([k, v]) => ({ key: k, label: v.label }))].map(f => (
          <button key={f.key} onClick={() => applyFilter(f.key)}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all
              ${filter === f.key ? 'gold-gradient text-background' : 'glass text-muted-foreground'}`}>
            {f.label}{f.key && counts[f.key] ? ` (${counts[f.key]})` : ''}
          </button>
        ))}
      </div>}

      {loading && tab !== 'top' && tab !== 'promos' && tab !== 'support' && tab !== 'cohorts' && tab !== 'abtests' ? (
        <div className="flex justify-center py-12 text-gold">
          <Icon name="Loader" size={28} className="animate-spin" />
        </div>
      ) : !loading && tab !== 'top' && tab !== 'promos' && tab !== 'support' && tab !== 'cohorts' && tab !== 'abtests' && currentList.length === 0 ? (
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
      ) : tab === 'orders' ? (
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
      ) : tab === 'top' ? (
        <div className="space-y-2">
          {topDepositors.length === 0 ? (
            <div className="glass rounded-2xl p-10 text-center text-muted-foreground text-sm">Нет данных</div>
          ) : topDepositors.map((p) => (
            <div key={p.user_id} className="glass rounded-2xl p-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-display font-bold text-sm
                ${p.rank === 1 ? 'gold-gradient text-background glow-gold' :
                  p.rank === 2 ? 'bg-white/15 text-foreground' :
                  p.rank === 3 ? 'bg-amber-700/40 text-amber-300' : 'glass text-muted-foreground'}`}>
                {p.rank <= 3 ? ['🥇','🥈','🥉'][p.rank - 1] : `#${p.rank}`}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm truncate">{p.username || p.email || `ID ${p.user_id}`}</span>
                  <span className="font-display font-bold text-emerald-400 shrink-0">+{p.total_deposited.toLocaleString('ru')} ₽</span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-xs text-muted-foreground truncate">{p.email}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{p.deposits_count} пополн.</span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-xs text-muted-foreground/50">Баланс: {p.balance.toLocaleString('ru')} ₽</span>
                  {p.last_deposit && (
                    <span className="text-xs text-muted-foreground/50">{new Date(p.last_deposit).toLocaleDateString('ru')}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : tab === 'promos' ? (
        <div className="space-y-4">
          {/* Форма создания */}
          <div className="glass rounded-2xl p-4 space-y-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Новый промокод</p>
            <div className="grid grid-cols-2 gap-2">
              <input value={promoForm.code} onChange={e => setPromoForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="Код (напр. BONUS100)" className={inputCls} />
              <input value={promoForm.bonus_amount} onChange={e => setPromoForm(f => ({ ...f, bonus_amount: e.target.value }))}
                placeholder="Сумма ₽" type="number" min="1" className={inputCls} />
              <input value={promoForm.max_uses} onChange={e => setPromoForm(f => ({ ...f, max_uses: e.target.value }))}
                placeholder="Макс. использований (пусто = ∞)" type="number" min="1" className={inputCls} />
              <input value={promoForm.expires_at} onChange={e => setPromoForm(f => ({ ...f, expires_at: e.target.value }))}
                type="datetime-local" className={inputCls} />
            </div>
            {promoError && <p className="text-xs text-red-400">{promoError}</p>}
            <button onClick={createPromo} disabled={promoSaving}
              className="w-full gold-gradient text-background font-bold h-11 rounded-xl glow-gold disabled:opacity-50 flex items-center justify-center gap-2">
              {promoSaving ? <Icon name="Loader" size={16} className="animate-spin" /> : <Icon name="Plus" size={16} />}
              Создать промокод
            </button>
          </div>

          {/* Список промокодов */}
          {promos.length === 0 ? (
            <div className="glass rounded-2xl p-10 text-center text-muted-foreground text-sm">Промокодов нет</div>
          ) : promos.map(p => (
            <div key={p.id} className={`glass rounded-2xl p-4 space-y-2 border ${p.is_active ? 'border-transparent' : 'border-red-500/20 opacity-60'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-display font-bold tracking-widest text-lg gold-text">{p.code}</span>
                <span className="font-display font-bold text-emerald-400">+{p.bonus_amount.toLocaleString('ru')} ₽</span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Использований: {p.uses_count}{p.max_uses ? ` / ${p.max_uses}` : ' / ∞'}</span>
                {p.expires_at && <span>До: {new Date(p.expires_at).toLocaleDateString('ru')}</span>}
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => togglePromo(p.id, !p.is_active)}
                  className={`flex-1 text-xs font-semibold h-9 rounded-xl transition-all flex items-center justify-center gap-1.5
                    ${p.is_active ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25' : 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'}`}>
                  <Icon name={p.is_active ? 'PauseCircle' : 'PlayCircle'} size={14} />
                  {p.is_active ? 'Деактивировать' : 'Активировать'}
                </button>
                <button onClick={() => deletePromo(p.id)}
                  className="w-9 h-9 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center justify-center transition-all">
                  <Icon name="Trash2" size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : tab === 'support' ? (
        <div className="space-y-3">
          {/* Если открыт конкретный чат */}
          {selectedChat ? (
            <div className="flex flex-col" style={{ height: 'calc(100vh - 22rem)' }}>
              {/* Шапка чата */}
              <div className="flex items-center gap-3 mb-3">
                <button onClick={() => setSelectedChat(null)}
                  className="w-9 h-9 rounded-xl glass flex items-center justify-center text-gold shrink-0">
                  <Icon name="ArrowLeft" size={18} />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{selectedChat.username || selectedChat.email}</p>
                  <p className="text-xs text-muted-foreground truncate">{selectedChat.email}</p>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-xl shrink-0
                  ${selectedChat.status === 'closed' ? 'bg-red-500/15 text-red-400' :
                    selectedChat.status === 'answered' ? 'bg-emerald-500/15 text-emerald-400' :
                    'bg-amber-500/15 text-amber-400'}`}>
                  {selectedChat.status === 'closed' ? 'Закрыт' : selectedChat.status === 'answered' ? 'Отвечено' : 'Открыт'}
                </span>
                {selectedChat.status !== 'closed' && (
                  <button onClick={() => closeChat(selectedChat.id)}
                    className="shrink-0 text-xs text-muted-foreground glass px-3 py-1.5 rounded-xl hover:text-red-400 transition-colors">
                    Закрыть
                  </button>
                )}
              </div>

              {/* Сообщения */}
              <div className="flex-1 overflow-y-auto space-y-2 min-h-0 pr-1">
                {chatMessages.length === 0 ? (
                  <div className="glass rounded-2xl p-8 text-center text-muted-foreground text-sm">Нет сообщений</div>
                ) : chatMessages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.sender === 'admin' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 ${
                      msg.sender === 'admin'
                        ? 'gold-gradient text-background rounded-br-sm'
                        : 'glass text-foreground rounded-bl-sm border border-white/10'
                    }`}>
                      {msg.sender === 'user' && (
                        <p className="text-[10px] font-bold text-gold mb-1 uppercase tracking-wider">
                          {selectedChat.username || 'Игрок'}
                        </p>
                      )}
                      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>
                      <p className={`text-[10px] mt-1 ${msg.sender === 'admin' ? 'text-background/60 text-right' : 'text-muted-foreground'}`}>
                        {new Date(msg.created_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={chatBottomRef} />
              </div>

              {/* Поле ответа */}
              {selectedChat.status !== 'closed' && (
                <div className="mt-3 flex gap-2 items-end">
                  <textarea
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                    placeholder="Ответить игроку..."
                    rows={1}
                    className="flex-1 bg-background/60 border border-gold/20 rounded-2xl px-4 py-3 outline-none focus:border-gold/50 transition-colors text-sm resize-none placeholder:text-muted-foreground/50"
                    style={{ maxHeight: '80px', overflowY: 'auto' }}
                  />
                  <button onClick={sendReply} disabled={!replyText.trim() || replySending}
                    className="w-11 h-11 rounded-2xl gold-gradient flex items-center justify-center glow-gold disabled:opacity-40 shrink-0">
                    {replySending
                      ? <Icon name="Loader" size={16} className="animate-spin text-background" />
                      : <Icon name="Send" size={16} className="text-background" />}
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Список чатов */
            supportChats.length === 0 ? (
              <div className="glass rounded-2xl p-10 text-center text-muted-foreground text-sm">
                Обращений пока нет
              </div>
            ) : supportChats.map(chat => (
              <button key={chat.id} onClick={() => openChat(chat)}
                className="w-full glass rounded-2xl p-4 flex items-center gap-3 text-left hover:border-gold/20 border border-transparent transition-all">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
                  ${chat.unread_admin > 0 ? 'gold-gradient' : 'bg-gold/10'}`}>
                  <Icon name="MessageCircle" size={18} className={chat.unread_admin > 0 ? 'text-background' : 'text-gold'} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm truncate">{chat.username || chat.email}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0
                      ${chat.status === 'closed' ? 'bg-red-500/15 text-red-400' :
                        chat.status === 'answered' ? 'bg-emerald-500/15 text-emerald-400' :
                        'bg-amber-500/15 text-amber-400'}`}>
                      {chat.status === 'closed' ? 'Закрыт' : chat.status === 'answered' ? 'Отвечено' : 'Новое'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {chat.last_text || 'Нет сообщений'}
                  </p>
                  {chat.last_message_at && (
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                      {new Date(chat.last_message_at).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>
                {chat.unread_admin > 0 && (
                  <span className="shrink-0 w-5 h-5 rounded-full bg-red-400 text-white text-[10px] font-bold flex items-center justify-center">
                    {chat.unread_admin}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      ) : tab === 'cohorts' ? (
        <div className="space-y-4">
          {/* Выбор периода */}
          <div className="flex gap-2">
            {[4, 8, 12, 26].map(w => (
              <button key={w}
                onClick={() => { setCohortWeeksRange(w); fetchCohorts(passwordRef.current, w); }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all
                  ${cohortWeeksRange === w ? 'gold-gradient text-background' : 'glass text-muted-foreground'}`}>
                {w} нед.
              </button>
            ))}
          </div>

          {cohortLoading ? (
            <div className="flex justify-center py-12 text-gold">
              <Icon name="Loader" size={28} className="animate-spin" />
            </div>
          ) : cohorts.length === 0 ? (
            <div className="glass rounded-2xl p-10 text-center text-muted-foreground text-sm">
              Недостаточно данных для когортного анализа
            </div>
          ) : (
            <>
              {/* Пояснение */}
              <div className="glass rounded-xl p-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Icon name="Info" size={14} className="text-gold shrink-0" />
                Retention — доля игроков когорты, сыгравших хотя бы раз на N-й неделе после регистрации
              </div>

              {/* Heatmap retention */}
              <div className="glass rounded-2xl p-3 overflow-x-auto">
                <table className="w-full text-xs border-separate" style={{ borderSpacing: '3px' }}>
                  <thead>
                    <tr>
                      <th className="text-left text-muted-foreground font-medium px-2 py-1 sticky left-0 bg-[hsl(var(--card))] z-10">Когорта</th>
                      <th className="text-center text-muted-foreground font-medium px-2 py-1">Размер</th>
                      {Array.from({ length: Math.min(cohortMaxOffset, cohortWeeksRange) + 1 }, (_, i) => (
                        <th key={i} className="text-center text-muted-foreground font-medium px-2 py-1 min-w-[44px]">Н{i}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cohorts.map(c => (
                      <tr key={c.cohort_week}>
                        <td className="text-left font-medium px-2 py-1.5 whitespace-nowrap sticky left-0 bg-[hsl(var(--card))] z-10">
                          {new Date(c.cohort_week).toLocaleDateString('ru', { day: '2-digit', month: '2-digit' })}
                        </td>
                        <td className="text-center px-2 py-1.5 text-muted-foreground">{c.cohort_size}</td>
                        {Array.from({ length: Math.min(cohortMaxOffset, cohortWeeksRange) + 1 }, (_, i) => {
                          const wd = c.weeks.find(w => w.week_offset === i);
                          const pct = wd?.retention_pct ?? null;
                          const bg = pct === null ? 'transparent'
                            : pct >= 50 ? `hsl(43 74% 52% / ${0.25 + pct / 200})`
                            : pct >= 20 ? `hsl(43 60% 45% / ${0.15 + pct / 300})`
                            : pct > 0   ? 'hsl(0 60% 50% / 0.15)'
                            : 'rgba(255,255,255,0.03)';
                          return (
                            <td key={i} className="text-center px-2 py-1.5 rounded-lg font-semibold"
                              style={{ background: bg, color: pct && pct >= 20 ? 'hsl(43 74% 62%)' : undefined }}>
                              {pct === null ? '—' : `${pct}%`}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Депозиты по когортам */}
              <p className="text-xs text-muted-foreground uppercase tracking-wider mt-2">Депозиты по когортам</p>
              <div className="space-y-2">
                {cohorts.map(c => (
                  <div key={c.cohort_week} className="glass rounded-xl p-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">
                        {new Date(c.cohort_week).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {c.cohort_size} игроков · {c.depositors} с депозитом ({c.deposit_rate_pct}%)
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-display font-bold gold-text text-sm">{c.total_deposited.toLocaleString('ru')} ₽</div>
                      {c.depositors > 0 && (
                        <div className="text-[11px] text-muted-foreground">~{c.avg_deposit_per_depositor.toLocaleString('ru')} ₽/чел</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ) : tab === 'abtests' ? (
        <div className="space-y-4">
          {/* Кнопка создания */}
          <Button onClick={() => setAbFormOpen(v => !v)}
            className="w-full gold-gradient text-background font-bold h-11 glow-gold flex items-center justify-center gap-2">
            <Icon name={abFormOpen ? 'X' : 'Plus'} size={16} />
            {abFormOpen ? 'Отмена' : 'Новый тест бонуса депозита'}
          </Button>

          {/* Форма создания */}
          {abFormOpen && (
            <div className="glass rounded-2xl p-4 space-y-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Новый A/B тест</p>
              <input className="w-full bg-background/60 border border-gold/20 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gold/50"
                placeholder="Название теста" value={abForm.name}
                onChange={e => setAbForm(f => ({ ...f, name: e.target.value }))} />
              <input className="w-full bg-background/60 border border-gold/20 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gold/50"
                placeholder="Описание (необязательно)" value={abForm.description}
                onChange={e => setAbForm(f => ({ ...f, description: e.target.value }))} />

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <label className="text-[11px] text-muted-foreground">Вариант A — название</label>
                  <input className="w-full bg-background/60 border border-gold/20 rounded-xl px-3 py-2 text-sm outline-none focus:border-gold/50"
                    value={abForm.variant_a_label} onChange={e => setAbForm(f => ({ ...f, variant_a_label: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] text-muted-foreground">Вариант A — бонус, %</label>
                  <input type="number" className="w-full bg-background/60 border border-gold/20 rounded-xl px-3 py-2 text-sm outline-none focus:border-gold/50"
                    value={abForm.variant_a_value} onChange={e => setAbForm(f => ({ ...f, variant_a_value: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] text-muted-foreground">Вариант B — название</label>
                  <input className="w-full bg-background/60 border border-gold/20 rounded-xl px-3 py-2 text-sm outline-none focus:border-gold/50"
                    value={abForm.variant_b_label} onChange={e => setAbForm(f => ({ ...f, variant_b_label: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] text-muted-foreground">Вариант B — бонус, %</label>
                  <input type="number" className="w-full bg-background/60 border border-gold/20 rounded-xl px-3 py-2 text-sm outline-none focus:border-gold/50"
                    value={abForm.variant_b_value} onChange={e => setAbForm(f => ({ ...f, variant_b_value: e.target.value }))} />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] text-muted-foreground">Доля трафика на вариант B: {abForm.traffic_split}%</label>
                <input type="range" min={1} max={99} value={abForm.traffic_split}
                  onChange={e => setAbForm(f => ({ ...f, traffic_split: e.target.value }))}
                  className="w-full accent-[hsl(43,74%,52%)]" />
              </div>

              {abError && (
                <div className="flex items-center gap-2 text-xs text-red-400">
                  <Icon name="AlertCircle" size={14} /> {abError}
                </div>
              )}

              <Button onClick={createAbTest} disabled={abSaving}
                className="w-full gold-gradient text-background font-bold h-11 glow-gold disabled:opacity-50">
                {abSaving ? <Icon name="Loader" size={16} className="animate-spin" /> : 'Создать тест'}
              </Button>
            </div>
          )}

          {/* Список тестов */}
          {abLoading ? (
            <div className="flex justify-center py-12 text-gold">
              <Icon name="Loader" size={28} className="animate-spin" />
            </div>
          ) : abTests.length === 0 ? (
            <div className="glass rounded-2xl p-10 text-center text-muted-foreground text-sm">
              Тестов пока нет — создай первый
            </div>
          ) : (
            <div className="space-y-3">
              {abTests.map(t => {
                const { A, B } = t.results;
                const winner = A.conversion_rate === B.conversion_rate ? null
                  : A.conversion_rate > B.conversion_rate ? 'A' : 'B';
                const statusMeta = {
                  draft:   { label: 'Черновик', color: 'text-muted-foreground', bg: 'bg-white/5' },
                  running: { label: 'Активен',  color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
                  stopped: { label: 'Остановлен', color: 'text-red-400', bg: 'bg-red-400/10' },
                }[t.status];
                return (
                  <div key={t.id} className="glass rounded-2xl p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-sm">{t.name}</div>
                        {t.description && <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>}
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${statusMeta.color} ${statusMeta.bg}`}>
                        {statusMeta.label}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {(['A', 'B'] as const).map(v => {
                        const r = v === 'A' ? A : B;
                        const label = v === 'A' ? t.variant_a_label : t.variant_b_label;
                        const value = v === 'A' ? t.variant_a_value : t.variant_b_value;
                        return (
                          <div key={v}
                            className={`rounded-xl p-3 border ${winner === v ? 'border-gold/50 bg-gold/5' : 'border-white/10'}`}>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-bold">{v} · {label}</span>
                              {winner === v && <Icon name="Trophy" size={12} className="text-gold" />}
                            </div>
                            <div className="text-[11px] text-muted-foreground">Бонус {value}%</div>
                            <div className="text-lg font-display font-bold gold-text mt-1">{r.conversion_rate}%</div>
                            <div className="text-[11px] text-muted-foreground">
                              {r.conversions} из {r.participants} конверсий
                            </div>
                            {r.total_value > 0 && (
                              <div className="text-[11px] text-emerald-400 mt-0.5">{r.total_value.toLocaleString('ru')} ₽ депозитов</div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex gap-2">
                      {t.status === 'draft' && (
                        <button onClick={() => setAbTestStatus(t.id, 'running')}
                          className="flex-1 py-2 rounded-xl text-xs font-semibold bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-all flex items-center justify-center gap-1.5">
                          <Icon name="Play" size={13} /> Запустить
                        </button>
                      )}
                      {t.status === 'running' && (
                        <button onClick={() => setAbTestStatus(t.id, 'stopped')}
                          className="flex-1 py-2 rounded-xl text-xs font-semibold bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-all flex items-center justify-center gap-1.5">
                          <Icon name="Square" size={13} /> Остановить
                        </button>
                      )}
                      {t.status === 'draft' && (
                        <button onClick={() => deleteAbTest(t.id)}
                          className="w-11 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center justify-center transition-all">
                          <Icon name="Trash2" size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}