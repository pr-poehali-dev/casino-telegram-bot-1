import json
import os
import hashlib
import secrets
import random
import base64
import re
import smtplib
import urllib.request
import urllib.parse
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import psycopg2
import boto3

HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
    'Content-Type': 'application/json'
}


VIP_LEVELS = [
    {'name': 'none',     'label': 'Нет уровня', 'min': 0,       'cashback_pct': 0,    'color': '#888888', 'emoji': '⬜'},
    {'name': 'bronze',   'label': 'Bronze',      'min': 5000,    'cashback_pct': 3,    'color': '#cd7f32', 'emoji': '🥉'},
    {'name': 'silver',   'label': 'Silver',      'min': 25000,   'cashback_pct': 5,    'color': '#c0c0c0', 'emoji': '🥈'},
    {'name': 'gold',     'label': 'Gold',        'min': 100000,  'cashback_pct': 8,    'color': '#f5c842', 'emoji': '🥇'},
    {'name': 'platinum', 'label': 'Platinum',    'min': 500000,  'cashback_pct': 12,   'color': '#e5e4e2', 'emoji': '💎'},
]

# ── Лимиты ставок и защита от злоупотреблений ──────────────────────────────
MIN_BET             = 1        # минимальная ставка (₽)
MAX_BET              = 20_000  # максимальная ставка за одну игру (₽)
MAX_WIN_MULTIPLIER   = 200     # максимально допустимый множитель выигрыша (защита от подделки result)
BET_RATE_WINDOW_SEC  = 10      # окно анти-спама
BET_RATE_MAX_COUNT   = 15      # макс. ставок за окно

# ── Email-верификация ───────────────────────────────────────────────────────
EMAIL_CODE_TTL_MIN   = 15   # время жизни кода (минут)
EMAIL_CODE_MAX_ATTEMPTS = 5  # макс. попыток ввода кода
EMAIL_RESEND_COOLDOWN_SEC = 60  # антиспам на повторную отправку

# ── Защита от подбора пароля (brute-force) ──────────────────────────────────
LOGIN_MAX_ATTEMPTS_ACCOUNT = 5    # неудачных попыток на аккаунт до блокировки
LOGIN_LOCKOUT_MIN_ACCOUNT  = 15   # на сколько минут блокируется аккаунт
LOGIN_MAX_ATTEMPTS_IP      = 20   # неудачных попыток с одного IP за окно
LOGIN_IP_WINDOW_MIN        = 15   # окно наблюдения по IP (минут)
LOGIN_LOCKOUT_MIN_IP       = 30   # на сколько минут блокируется IP

# ── Phone-верификация ────────────────────────────────────────────────────────
PHONE_CODE_TTL_MIN        = 15   # время жизни кода (минут)
PHONE_CODE_MAX_ATTEMPTS   = 5    # макс. попыток ввода кода
PHONE_RESEND_COOLDOWN_SEC = 60   # антиспам на повторную отправку
PHONE_VERIFY_WITHDRAW_THRESHOLD = 25_000  # сумма вывода, с которой требуется телефон (₽)

# ── Достижения и бейджи ──────────────────────────────────────────────────────
# Каждое достижение: id, name, description, icon (эмодзи), reward (₽), category
ACHIEVEMENTS = [
    # Игровая активность
    {'id': 'first_game',      'name': 'Первая ставка',     'desc': 'Сыграй свою первую игру',              'icon': '🎮', 'reward': 20,  'category': 'games'},
    {'id': 'games_10',        'name': 'Разогрев',          'desc': 'Сыграй 10 игр',                        'icon': '🔥', 'reward': 30,  'category': 'games'},
    {'id': 'games_50',        'name': 'Завсегдатай',       'desc': 'Сыграй 50 игр',                        'icon': '🎯', 'reward': 75,  'category': 'games'},
    {'id': 'games_200',       'name': 'Ветеран казино',    'desc': 'Сыграй 200 игр',                       'icon': '🏆', 'reward': 200, 'category': 'games'},
    {'id': 'games_1000',      'name': 'Легенда',           'desc': 'Сыграй 1000 игр',                      'icon': '👑', 'reward': 1000,'category': 'games'},
    {'id': 'all_games',       'name': 'Исследователь',     'desc': 'Попробуй все 13 игр казино',           'icon': '🗺️', 'reward': 150, 'category': 'games'},
    # Победы
    {'id': 'first_win',       'name': 'Первая победа',     'desc': 'Выиграй свою первую игру',             'icon': '✅', 'reward': 25,  'category': 'wins'},
    {'id': 'wins_25',         'name': 'Везунчик',          'desc': 'Выиграй 25 раз',                       'icon': '🍀', 'reward': 60,  'category': 'wins'},
    {'id': 'wins_100',        'name': 'Мастер удачи',      'desc': 'Выиграй 100 раз',                      'icon': '🌟', 'reward': 250, 'category': 'wins'},
    {'id': 'win_streak_5',    'name': 'Полоса везения',    'desc': '5 побед подряд',                       'icon': '⚡', 'reward': 100, 'category': 'wins'},
    # Крупные выигрыши
    {'id': 'big_win_500',     'name': 'Крупный улов',      'desc': 'Выиграй 500 ₽ за одну игру',           'icon': '💰', 'reward': 50,  'category': 'bigwin'},
    {'id': 'big_win_2000',    'name': 'Джекпот',           'desc': 'Выиграй 2000 ₽ за одну игру',          'icon': '💎', 'reward': 150, 'category': 'bigwin'},
    {'id': 'big_win_10000',   'name': 'Королевский куш',   'desc': 'Выиграй 10 000 ₽ за одну игру',        'icon': '👑', 'reward': 500, 'category': 'bigwin'},
    # Депозиты
    {'id': 'first_deposit',   'name': 'Старт положен',     'desc': 'Сделай первый депозит',                'icon': '💳', 'reward': 30,  'category': 'deposit'},
    {'id': 'deposit_5000',    'name': 'Инвестор',          'desc': 'Пополни баланс суммарно на 5000 ₽',    'icon': '📈', 'reward': 100, 'category': 'deposit'},
    {'id': 'deposit_25000',   'name': 'Капиталист',        'desc': 'Пополни баланс суммарно на 25 000 ₽',  'icon': '🏦', 'reward': 300, 'category': 'deposit'},
    # Ежедневная активность
    {'id': 'daily_streak_3',  'name': 'Три дня подряд',    'desc': 'Забирай бонус 3 дня подряд',           'icon': '📅', 'reward': 40,  'category': 'daily'},
    {'id': 'daily_streak_7',  'name': 'Неделя с нами',     'desc': 'Забирай бонус 7 дней подряд',          'icon': '🗓️', 'reward': 120, 'category': 'daily'},
    {'id': 'daily_streak_30', 'name': 'Верный игрок',      'desc': 'Забирай бонус 30 дней подряд',         'icon': '🏅', 'reward': 500, 'category': 'daily'},
    # Рефералы
    {'id': 'first_referral',  'name': 'Пригласил друга',   'desc': 'Пригласи первого друга',               'icon': '🤝', 'reward': 50,  'category': 'referral'},
    {'id': 'referral_5',      'name': 'Амбассадор',        'desc': 'Пригласи 5 друзей',                    'icon': '📣', 'reward': 200, 'category': 'referral'},
    # VIP
    {'id': 'vip_bronze',      'name': 'Бронзовый статус',  'desc': 'Достигни VIP-уровня Bronze',           'icon': '🥉', 'reward': 50,  'category': 'vip'},
    {'id': 'vip_gold',        'name': 'Золотой статус',    'desc': 'Достигни VIP-уровня Gold',             'icon': '🥇', 'reward': 300, 'category': 'vip'},
]

ALL_GAME_NAMES = {'Слоты', 'Монета', 'Кости', 'Рулетка', 'Блэкджек', 'Мины', 'Краш',
                   'Колесо', 'Видеопокер', 'Быки/Медведи', 'Hi-Lo', 'Бинго', 'Кено'}


def check_and_unlock_achievements(cur, user_id: int) -> list:
    """
    Пересчитывает статистику пользователя и открывает новые достижения.
    Возвращает список только что открытых достижений (с начисленной наградой).
    """
    cur.execute("SELECT achievement_id FROM user_achievements WHERE user_id = %s", (user_id,))
    unlocked = {row[0] for row in cur.fetchall()}

    to_unlock = []

    # Статистика по играм
    cur.execute("""
        SELECT COUNT(*), COUNT(*) FILTER (WHERE is_win),
               COALESCE(MAX(result) FILTER (WHERE is_win), 0),
               COUNT(DISTINCT game)
        FROM game_history WHERE user_id = %s
    """, (user_id,))
    total_games, total_wins, max_win, distinct_games = cur.fetchone()
    total_games = total_games or 0
    total_wins = total_wins or 0
    max_win = float(max_win or 0)
    distinct_games = distinct_games or 0

    # Текущая полоса побед подряд (последние записи)
    cur.execute("""
        SELECT is_win FROM game_history WHERE user_id = %s
        ORDER BY created_at DESC LIMIT 20
    """, (user_id,))
    streak = 0
    for (win,) in cur.fetchall():
        if win:
            streak += 1
        else:
            break

    # Пользователь: депозиты, VIP, дневная серия
    cur.execute("""
        SELECT total_deposited, vip_level, daily_streak FROM users WHERE id = %s
    """, (user_id,))
    total_deposited, vip_level, daily_streak = cur.fetchone()
    total_deposited = float(total_deposited or 0)
    daily_streak = daily_streak or 0

    # Рефералы
    cur.execute("SELECT COUNT(DISTINCT referee_id) FROM referral_bonuses WHERE referrer_id = %s", (user_id,))
    total_referrals = cur.fetchone()[0] or 0

    checks = {
        'first_game':      total_games >= 1,
        'games_10':        total_games >= 10,
        'games_50':        total_games >= 50,
        'games_200':       total_games >= 200,
        'games_1000':      total_games >= 1000,
        'all_games':       distinct_games >= len(ALL_GAME_NAMES),
        'first_win':       total_wins >= 1,
        'wins_25':         total_wins >= 25,
        'wins_100':        total_wins >= 100,
        'win_streak_5':    streak >= 5,
        'big_win_500':     max_win >= 500,
        'big_win_2000':    max_win >= 2000,
        'big_win_10000':   max_win >= 10000,
        'first_deposit':   total_deposited > 0,
        'deposit_5000':    total_deposited >= 5000,
        'deposit_25000':   total_deposited >= 25000,
        'daily_streak_3':  daily_streak >= 3,
        'daily_streak_7':  daily_streak >= 7,
        'daily_streak_30': daily_streak >= 30,
        'first_referral':  total_referrals >= 1,
        'referral_5':      total_referrals >= 5,
        'vip_bronze':      vip_level in ('bronze', 'silver', 'gold', 'platinum'),
        'vip_gold':        vip_level in ('gold', 'platinum'),
    }

    for ach in ACHIEVEMENTS:
        aid = ach['id']
        if aid in unlocked:
            continue
        if checks.get(aid):
            cur.execute("""
                INSERT INTO user_achievements (user_id, achievement_id)
                VALUES (%s, %s) ON CONFLICT (user_id, achievement_id) DO NOTHING
            """, (user_id, aid))
            if ach['reward'] > 0:
                cur.execute("""
                    UPDATE users SET balance = balance + %s, updated_at = NOW() WHERE id = %s
                """, (ach['reward'], user_id))
                cur.execute("""
                    UPDATE user_achievements SET reward_claimed = TRUE
                    WHERE user_id = %s AND achievement_id = %s
                """, (user_id, aid))
            to_unlock.append(ach)

    return to_unlock


def normalize_phone(raw: str) -> str:
    """Приводим телефон к формату 7XXXXXXXXXX (для SMS.ru)"""
    digits = re.sub(r'\D', '', raw or '')
    if len(digits) == 11 and digits.startswith('8'):
        digits = '7' + digits[1:]
    if len(digits) == 10:
        digits = '7' + digits
    return digits


def send_sms(phone: str, text: str) -> bool:
    """Отправка SMS через SMS.ru"""
    api_key = os.environ.get('SMS_RU_API_KEY', '')
    if not api_key or not phone:
        return False
    params = urllib.parse.urlencode({
        'api_id': api_key,
        'to': phone,
        'msg': text,
        'json': 1,
    })
    url = f'https://sms.ru/sms/send?{params}'
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            return data.get('status') == 'OK'
    except Exception:
        return False


def get_client_ip(event: dict) -> str:
    headers = event.get('headers') or {}
    # Пробуем стандартные заголовки прокси, затем requestContext
    ip = headers.get('X-Forwarded-For') or headers.get('x-forwarded-for', '')
    if ip:
        return ip.split(',')[0].strip()
    ctx = event.get('requestContext') or {}
    identity = ctx.get('identity') or {}
    return identity.get('sourceIp', 'unknown')


def send_email(to: str, subject: str, html: str):
    """Отправка email через Gmail SMTP"""
    gmail_user = os.environ.get('GMAIL_USER', '')
    gmail_pass = os.environ.get('GMAIL_APP_PASSWORD', '')
    if not gmail_user or not gmail_pass or not to:
        return
    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From'] = f'Casino Notifications <{gmail_user}>'
    msg['To'] = to
    msg.attach(MIMEText(html, 'html', 'utf-8'))
    try:
        with smtplib.SMTP_SSL('smtp.gmail.com', 465, timeout=10) as server:
            server.login(gmail_user, gmail_pass)
            server.sendmail(gmail_user, to, msg.as_string())
    except Exception:
        pass


def send_verification_code(email: str, code: str):
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#151521;color:#fff;border-radius:16px;">
      <h2 style="color:#f5c842;margin-top:0;">Подтверждение email</h2>
      <p style="color:#bbb;font-size:14px;">Твой код подтверждения:</p>
      <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#f5c842;text-align:center;padding:20px 0;">{code}</div>
      <p style="color:#888;font-size:13px;">Код действителен {EMAIL_CODE_TTL_MIN} минут. Если ты не запрашивал код — просто проигнорируй письмо.</p>
    </div>
    """
    send_email(email, f'{code} — код подтверждения', html)


def calc_vip(total_deposited: float) -> dict:
    level = VIP_LEVELS[0]
    for v in VIP_LEVELS:
        if total_deposited >= v['min']:
            level = v
    return level


def next_vip(total_deposited: float) -> dict | None:
    for v in VIP_LEVELS:
        if total_deposited < v['min']:
            return v
    return None


def get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def get_s3():
    return boto3.client(
        's3',
        endpoint_url='https://bucket.poehali.dev',
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
    )


def get_user_by_token(cur, token: str):
    cur.execute("""
        SELECT u.id, u.email, u.username, u.balance, u.referral_code,
               u.vip_level, u.total_deposited, u.cashback_available, u.avatar_url,
               u.first_deposit_bonus_claimed, u.email_verified, u.phone, u.phone_verified
        FROM sessions s JOIN users u ON s.user_id = u.id
        WHERE s.token = %s AND s.expires_at > NOW()
    """, (token,))
    return cur.fetchone()


def user_to_dict(u) -> dict:
    vip = calc_vip(float(u[6]))
    nxt = next_vip(float(u[6]))
    return {
        'id': u[0], 'email': u[1], 'username': u[2], 'balance': float(u[3]),
        'referral_code': u[4],
        'vip_level': vip['name'],
        'vip_label': vip['label'],
        'vip_emoji': vip['emoji'],
        'vip_cashback_pct': vip['cashback_pct'],
        'total_deposited': float(u[6]),
        'cashback_available': float(u[7]),
        'next_vip_level': nxt['name'] if nxt else None,
        'next_vip_label': nxt['label'] if nxt else None,
        'next_vip_min': nxt['min'] if nxt else None,
        'next_vip_emoji': nxt['emoji'] if nxt else None,
        'avatar_url': u[8],
        'first_deposit_bonus_claimed': bool(u[9]) if len(u) > 9 else False,
        'email_verified': bool(u[10]) if len(u) > 10 else False,
        'phone': u[11] if len(u) > 11 else None,
        'phone_verified': bool(u[12]) if len(u) > 12 else False,
    }


def handler(event: dict, context) -> dict:
    """
    Авторизация игроков. Роутинг через ?action=...
    POST ?action=register  { email, password, username }
    POST ?action=login     { email, password }
    GET  ?action=me        X-Auth-Token
    POST ?action=logout    X-Auth-Token
    POST ?action=balance   { delta } + X-Auth-Token
    POST ?action=send-verification  X-Auth-Token — отправить/повторить код на email
    POST ?action=verify-email       { code } + X-Auth-Token — подтвердить код
    POST ?action=send-phone-code    { phone } + X-Auth-Token — отправить SMS-код
    POST ?action=verify-phone       { code } + X-Auth-Token — подтвердить телефон
    GET  ?action=achievements       X-Auth-Token — список достижений с прогрессом
    GET  ?action=order-status&session_id=...
    """
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': HEADERS, 'body': '', 'isBase64Encoded': False}

    http_method = event.get('httpMethod', 'GET').upper()
    params = event.get('queryStringParameters') or {}
    action = params.get('action', '')
    token = event.get('headers', {}).get('X-Auth-Token', '')
    try:
        body = json.loads(event.get('body') or '{}')
    except Exception:
        body = {}

    try:
        conn = get_conn()
        cur = conn.cursor()
    except Exception as e:
        print(f'DB connection error: {e}')
        return {'statusCode': 503, 'headers': HEADERS,
                'body': json.dumps({'error': 'Сервер временно недоступен, попробуйте снова'}),
                'isBase64Encoded': False}

    # ── REGISTER ──
    if action == 'register' and http_method == 'POST':
        email = str(body.get('email', '')).lower().strip()
        password = str(body.get('password', ''))
        username = str(body.get('username', '')).strip() or email.split('@')[0]
        ref_code = str(body.get('ref_code', '')).strip().upper()

        if not email or not password:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Email и пароль обязательны'}), 'isBase64Encoded': False}
        if len(password) < 6:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Пароль минимум 6 символов'}), 'isBase64Encoded': False}

        cur.execute("SELECT id FROM users WHERE email = %s", (email,))
        if cur.fetchone():
            cur.close(); conn.close()
            return {'statusCode': 409, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Этот email уже зарегистрирован'}), 'isBase64Encoded': False}

        # Ищем реферера по коду
        referrer_id = None
        if ref_code:
            cur.execute("SELECT id FROM users WHERE referral_code = %s", (ref_code,))
            ref_row = cur.fetchone()
            if ref_row:
                referrer_id = ref_row[0]

        # Стартовый бонус: 50₽ новому если пришёл по ссылке
        start_balance = 50.0 if referrer_id else 0.0

        # Генерируем уникальный реферальный код для нового пользователя
        new_ref_code = secrets.token_hex(4).upper()

        cur.execute("""
            INSERT INTO users (email, password_hash, username, balance, referred_by, referral_code)
            VALUES (%s, %s, %s, %s, %s, %s) RETURNING id
        """, (email, hash_password(password), username, start_balance, referrer_id, new_ref_code))
        user_id = cur.fetchone()[0]

        # Записываем бонус новому игроку
        if referrer_id:
            cur.execute("""
                INSERT INTO referral_bonuses (referrer_id, referee_id, amount, type)
                VALUES (%s, %s, 50, 'signup')
            """, (referrer_id, user_id))
            # Рефереру начисляем 50₽ за регистрацию друга
            cur.execute("""
                UPDATE users SET balance = balance + 50, updated_at = NOW() WHERE id = %s
            """, (referrer_id,))

        session_token = secrets.token_hex(32)
        cur.execute("INSERT INTO sessions (user_id, token) VALUES (%s, %s)", (user_id, session_token))

        # Генерируем и отправляем код подтверждения email (не блокирует регистрацию)
        code = f"{random.randint(0, 999999):06d}"
        cur.execute("""
            INSERT INTO email_verifications (user_id, code, expires_at)
            VALUES (%s, %s, NOW() + make_interval(mins => %s))
        """, (user_id, code, EMAIL_CODE_TTL_MIN))

        conn.commit(); cur.close(); conn.close()

        try:
            send_verification_code(email, code)
        except Exception:
            pass

        return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps({
            'token': session_token,
            'user': {
                'id': user_id, 'email': email, 'username': username, 'balance': start_balance,
                'referral_code': new_ref_code,
                'vip_level': 'none', 'vip_label': 'Нет уровня', 'vip_emoji': '⬜',
                'vip_cashback_pct': 0, 'total_deposited': 0.0, 'cashback_available': 0.0,
                'next_vip_level': 'bronze', 'next_vip_label': 'Bronze',
                'next_vip_min': 5000, 'next_vip_emoji': '🥉',
                'avatar_url': None, 'can_spin': True, 'last_spin_at': None,
                'email_verified': False,
            }
        }), 'isBase64Encoded': False}

    # ── LOGIN ──
    if action == 'login' and http_method == 'POST':
        email = str(body.get('email', '')).lower().strip()
        password = str(body.get('password', ''))
        client_ip = get_client_ip(event)

        # ── Проверка блокировки по IP (защита от перебора по разным аккаунтам) ──
        cur.execute("""
            SELECT window_start, attempt_count, locked_until,
                   EXTRACT(EPOCH FROM (NOW() - window_start))
            FROM login_rate_limits WHERE ip_address = %s
        """, (client_ip,))
        ip_row = cur.fetchone()
        if ip_row:
            _, ip_attempts, ip_locked_until, ip_window_age = ip_row
            if ip_locked_until:
                cur.execute("SELECT %s::timestamp > NOW()", (ip_locked_until,))
                if cur.fetchone()[0]:
                    cur.close(); conn.close()
                    return {'statusCode': 429, 'headers': HEADERS,
                            'body': json.dumps({'error': 'Слишком много попыток входа. Попробуй позже.'}),
                            'isBase64Encoded': False}
            # Если окно истекло — сбрасываем счётчик
            if ip_window_age is not None and ip_window_age > LOGIN_IP_WINDOW_MIN * 60:
                cur.execute("""
                    UPDATE login_rate_limits SET window_start = NOW(), attempt_count = 0, locked_until = NULL
                    WHERE ip_address = %s
                """, (client_ip,))

        # ── Ищем пользователя и проверяем блокировку аккаунта ──
        cur.execute("""
            SELECT id, email, username, balance, referral_code,
                   vip_level, total_deposited, cashback_available,
                   avatar_url, first_deposit_bonus_claimed, email_verified,
                   phone, phone_verified,
                   password_hash, failed_login_attempts, login_locked_until
            FROM users WHERE email = %s AND is_active = TRUE
        """, (email,))
        row = cur.fetchone()

        if row and row[15]:
            cur.execute("SELECT %s::timestamp > NOW()", (row[15],))
            if cur.fetchone()[0]:
                cur.close(); conn.close()
                return {'statusCode': 429, 'headers': HEADERS,
                        'body': json.dumps({'error': 'Аккаунт временно заблокирован из-за неудачных попыток входа. Попробуй позже.'}),
                        'isBase64Encoded': False}

        password_ok = bool(row) and row[13] == hash_password(password)

        if not password_ok:
            # Увеличиваем счётчик неудач по IP (upsert)
            cur.execute("""
                INSERT INTO login_rate_limits (ip_address, window_start, attempt_count)
                VALUES (%s, NOW(), 1)
                ON CONFLICT (ip_address) DO UPDATE
                SET attempt_count = login_rate_limits.attempt_count + 1,
                    locked_until = CASE
                        WHEN login_rate_limits.attempt_count + 1 >= %s THEN NOW() + make_interval(mins => %s)
                        ELSE login_rate_limits.locked_until
                    END
            """, (client_ip, LOGIN_MAX_ATTEMPTS_IP, LOGIN_LOCKOUT_MIN_IP))

            # Увеличиваем счётчик неудач по аккаунту (если email существует)
            if row:
                cur.execute("""
                    UPDATE users SET
                        failed_login_attempts = failed_login_attempts + 1,
                        login_locked_until = CASE
                            WHEN failed_login_attempts + 1 >= %s THEN NOW() + make_interval(mins => %s)
                            ELSE login_locked_until
                        END
                    WHERE id = %s
                """, (LOGIN_MAX_ATTEMPTS_ACCOUNT, LOGIN_LOCKOUT_MIN_ACCOUNT, row[0]))

            conn.commit(); cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Неверный email или пароль'}), 'isBase64Encoded': False}

        # Успешный вход — сбрасываем счётчик неудач по аккаунту
        cur.execute("""
            UPDATE users SET failed_login_attempts = 0, login_locked_until = NULL WHERE id = %s
        """, (row[0],))

        session_token = secrets.token_hex(32)
        cur.execute("INSERT INTO sessions (user_id, token) VALUES (%s, %s)", (row[0], session_token))
        conn.commit(); cur.close(); conn.close()

        user = row[:13]  # обрезаем служебные поля (password_hash, attempts, locked_until)
        return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps({
            'token': session_token,
            'user': user_to_dict(user)
        }), 'isBase64Encoded': False}

    # ── ME ──
    if action == 'me' and http_method == 'GET':
        if not token:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Не авторизован'}), 'isBase64Encoded': False}
        user = get_user_by_token(cur, token)
        cur.close(); conn.close()
        if not user:
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Сессия истекла, войдите снова'}), 'isBase64Encoded': False}
        return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps({
            'user': user_to_dict(user)
        }), 'isBase64Encoded': False}

    # ── SEND VERIFICATION (запросить/повторно отправить код) ──
    if action == 'send-verification' and http_method == 'POST':
        if not token:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Не авторизован'}), 'isBase64Encoded': False}
        user = get_user_by_token(cur, token)
        if not user:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Сессия истекла'}), 'isBase64Encoded': False}

        if bool(user[10]):
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Email уже подтверждён'}), 'isBase64Encoded': False}

        # Антиспам: не чаще одного письма в EMAIL_RESEND_COOLDOWN_SEC секунд
        cur.execute("""
            SELECT EXTRACT(EPOCH FROM (NOW() - created_at)) FROM email_verifications
            WHERE user_id = %s ORDER BY created_at DESC LIMIT 1
        """, (user[0],))
        last = cur.fetchone()
        if last and last[0] is not None and last[0] < EMAIL_RESEND_COOLDOWN_SEC:
            wait = int(EMAIL_RESEND_COOLDOWN_SEC - last[0])
            cur.close(); conn.close()
            return {'statusCode': 429, 'headers': HEADERS,
                    'body': json.dumps({'error': f'Подожди {wait} сек. перед повторной отправкой'}),
                    'isBase64Encoded': False}

        code = f"{random.randint(0, 999999):06d}"
        cur.execute("""
            INSERT INTO email_verifications (user_id, code, expires_at)
            VALUES (%s, %s, NOW() + make_interval(mins => %s))
        """, (user[0], code, EMAIL_CODE_TTL_MIN))
        conn.commit(); cur.close(); conn.close()

        try:
            send_verification_code(user[1], code)
        except Exception:
            pass

        return {'statusCode': 200, 'headers': HEADERS,
                'body': json.dumps({'success': True}), 'isBase64Encoded': False}

    # ── VERIFY EMAIL (ввод кода) ──
    if action == 'verify-email' and http_method == 'POST':
        if not token:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Не авторизован'}), 'isBase64Encoded': False}
        user = get_user_by_token(cur, token)
        if not user:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Сессия истекла'}), 'isBase64Encoded': False}

        if bool(user[10]):
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Email уже подтверждён'}), 'isBase64Encoded': False}

        code_input = str(body.get('code', '')).strip()
        if not code_input:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Введите код'}), 'isBase64Encoded': False}

        cur.execute("""
            SELECT id, code, expires_at, attempts FROM email_verifications
            WHERE user_id = %s AND used = FALSE
            ORDER BY created_at DESC LIMIT 1
        """, (user[0],))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Код не найден, запроси новый'}), 'isBase64Encoded': False}

        verification_id, real_code, expires_at, attempts = row

        if attempts >= EMAIL_CODE_MAX_ATTEMPTS:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Превышено число попыток. Запроси новый код'}),
                    'isBase64Encoded': False}

        cur.execute("SELECT NOW() > %s", (expires_at,))
        is_expired = cur.fetchone()[0]
        if is_expired:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Код истёк, запроси новый'}), 'isBase64Encoded': False}

        if code_input != real_code:
            cur.execute("UPDATE email_verifications SET attempts = attempts + 1 WHERE id = %s", (verification_id,))
            conn.commit(); cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Неверный код'}), 'isBase64Encoded': False}

        cur.execute("UPDATE email_verifications SET used = TRUE WHERE id = %s", (verification_id,))
        cur.execute("UPDATE users SET email_verified = TRUE, updated_at = NOW() WHERE id = %s", (user[0],))
        conn.commit(); cur.close(); conn.close()

        return {'statusCode': 200, 'headers': HEADERS,
                'body': json.dumps({'success': True}), 'isBase64Encoded': False}

    # ── SEND PHONE CODE (запросить/повторно отправить SMS-код) ──
    if action == 'send-phone-code' and http_method == 'POST':
        if not token:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Не авторизован'}), 'isBase64Encoded': False}
        user = get_user_by_token(cur, token)
        if not user:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Сессия истекла'}), 'isBase64Encoded': False}

        if bool(user[12]):
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Телефон уже подтверждён'}), 'isBase64Encoded': False}

        raw_phone = str(body.get('phone', '')).strip()
        phone = normalize_phone(raw_phone)
        if len(phone) != 11 or not phone.startswith('7'):
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Введите корректный номер телефона'}), 'isBase64Encoded': False}

        # Антиспам: не чаще одного SMS в PHONE_RESEND_COOLDOWN_SEC секунд
        cur.execute("""
            SELECT EXTRACT(EPOCH FROM (NOW() - created_at)) FROM phone_verifications
            WHERE user_id = %s ORDER BY created_at DESC LIMIT 1
        """, (user[0],))
        last = cur.fetchone()
        if last and last[0] is not None and last[0] < PHONE_RESEND_COOLDOWN_SEC:
            wait = int(PHONE_RESEND_COOLDOWN_SEC - last[0])
            cur.close(); conn.close()
            return {'statusCode': 429, 'headers': HEADERS,
                    'body': json.dumps({'error': f'Подожди {wait} сек. перед повторной отправкой'}),
                    'isBase64Encoded': False}

        code = f"{random.randint(0, 999999):06d}"
        cur.execute("""
            INSERT INTO phone_verifications (user_id, phone, code, expires_at)
            VALUES (%s, %s, %s, NOW() + make_interval(mins => %s))
        """, (user[0], phone, code, PHONE_CODE_TTL_MIN))
        cur.execute("UPDATE users SET phone = %s, updated_at = NOW() WHERE id = %s", (phone, user[0]))
        conn.commit(); cur.close(); conn.close()

        try:
            send_sms(phone, f'{code} — код подтверждения телефона')
        except Exception:
            pass

        return {'statusCode': 200, 'headers': HEADERS,
                'body': json.dumps({'success': True}), 'isBase64Encoded': False}

    # ── VERIFY PHONE (ввод SMS-кода) ──
    if action == 'verify-phone' and http_method == 'POST':
        if not token:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Не авторизован'}), 'isBase64Encoded': False}
        user = get_user_by_token(cur, token)
        if not user:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Сессия истекла'}), 'isBase64Encoded': False}

        if bool(user[12]):
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Телефон уже подтверждён'}), 'isBase64Encoded': False}

        code_input = str(body.get('code', '')).strip()
        if not code_input:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Введите код'}), 'isBase64Encoded': False}

        cur.execute("""
            SELECT id, code, expires_at, attempts FROM phone_verifications
            WHERE user_id = %s AND used = FALSE
            ORDER BY created_at DESC LIMIT 1
        """, (user[0],))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Код не найден, запроси новый'}), 'isBase64Encoded': False}

        verification_id, real_code, expires_at, attempts = row

        if attempts >= PHONE_CODE_MAX_ATTEMPTS:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Превышено число попыток. Запроси новый код'}),
                    'isBase64Encoded': False}

        cur.execute("SELECT NOW() > %s", (expires_at,))
        is_expired = cur.fetchone()[0]
        if is_expired:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Код истёк, запроси новый'}), 'isBase64Encoded': False}

        if code_input != real_code:
            cur.execute("UPDATE phone_verifications SET attempts = attempts + 1 WHERE id = %s", (verification_id,))
            conn.commit(); cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Неверный код'}), 'isBase64Encoded': False}

        cur.execute("UPDATE phone_verifications SET used = TRUE WHERE id = %s", (verification_id,))
        cur.execute("UPDATE users SET phone_verified = TRUE, updated_at = NOW() WHERE id = %s", (user[0],))
        conn.commit(); cur.close(); conn.close()

        return {'statusCode': 200, 'headers': HEADERS,
                'body': json.dumps({'success': True}), 'isBase64Encoded': False}

    # ── BALANCE ──
    if action == 'balance' and http_method == 'POST':
        if not token:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Не авторизован'}), 'isBase64Encoded': False}
        user = get_user_by_token(cur, token)
        if not user:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Сессия истекла'}), 'isBase64Encoded': False}

        try:
            delta = float(body.get('delta', 0))
        except (TypeError, ValueError):
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Некорректная сумма'}), 'isBase64Encoded': False}
        is_deposit = bool(body.get('is_deposit', False))
        current_balance = float(user[3])

        # ── Защита от накрутки: депозиты не лимитируем (уже подтверждены оплатой),
        # игровые операции (ставки/выигрыши) проверяем жёстко ──
        if not is_deposit:
            # Anti-spam: не более BET_RATE_MAX_COUNT операций за BET_RATE_WINDOW_SEC секунд
            cur.execute("""
                SELECT bet_window_start, bet_window_count, EXTRACT(EPOCH FROM (NOW() - bet_window_start))
                FROM users WHERE id = %s
            """, (user[0],))
            bw_start, bw_count, bw_age = cur.fetchone()
            if bw_start is None or bw_age is None or bw_age > BET_RATE_WINDOW_SEC:
                cur.execute("""
                    UPDATE users SET bet_window_start = NOW(), bet_window_count = 1 WHERE id = %s
                """, (user[0],))
            else:
                if bw_count + 1 > BET_RATE_MAX_COUNT:
                    conn.commit(); cur.close(); conn.close()
                    return {'statusCode': 429, 'headers': HEADERS,
                            'body': json.dumps({'error': 'Слишком много ставок подряд. Подожди немного.'}),
                            'isBase64Encoded': False}
                cur.execute("UPDATE users SET bet_window_count = bet_window_count + 1 WHERE id = %s", (user[0],))

            if delta < 0:
                # Списание ставки — сумма должна быть в разумных пределах и не превышать баланс
                stake = abs(delta)
                if stake < MIN_BET:
                    cur.close(); conn.close()
                    return {'statusCode': 400, 'headers': HEADERS,
                            'body': json.dumps({'error': f'Минимальная ставка — {MIN_BET} ₽'}), 'isBase64Encoded': False}
                if stake > MAX_BET:
                    cur.close(); conn.close()
                    return {'statusCode': 400, 'headers': HEADERS,
                            'body': json.dumps({'error': f'Максимальная ставка — {MAX_BET:,} ₽'.replace(',', ' ')}),
                            'isBase64Encoded': False}
                if stake > current_balance:
                    cur.close(); conn.close()
                    return {'statusCode': 400, 'headers': HEADERS,
                            'body': json.dumps({'error': 'Недостаточно средств на балансе'}), 'isBase64Encoded': False}
            elif delta > 0:
                # Начисление выигрыша — не должно превышать разумный максимум
                max_possible_win = MAX_BET * MAX_WIN_MULTIPLIER
                if delta > max_possible_win:
                    cur.close(); conn.close()
                    return {'statusCode': 400, 'headers': HEADERS,
                            'body': json.dumps({'error': 'Некорректная сумма выигрыша'}), 'isBase64Encoded': False}

        # При проигрыше (delta < 0) начисляем кешбэк согласно VIP-уровню
        vip = calc_vip(float(user[6]))
        cashback_earned = 0.0
        if delta < 0 and vip['cashback_pct'] > 0:
            cashback_earned = round(abs(delta) * vip['cashback_pct'] / 100, 2)

        # Проверяем бонус первого депозита
        first_deposit_bonus = 0.0
        if is_deposit and delta > 0:
            cur.execute("SELECT first_deposit_bonus_claimed FROM users WHERE id = %s", (user[0],))
            claimed = cur.fetchone()[0]
            if not claimed:
                first_deposit_bonus = round(delta * 1.0, 2)  # +100%

        # При депозите обновляем total_deposited и пересчитываем vip_level
        total_credit = delta + first_deposit_bonus
        if is_deposit and delta > 0:
            cur.execute("""
                UPDATE users
                SET balance = GREATEST(0, balance + %s),
                    total_deposited = total_deposited + %s,
                    first_deposit_bonus_claimed = CASE WHEN %s > 0 THEN TRUE ELSE first_deposit_bonus_claimed END,
                    vip_level = CASE
                        WHEN total_deposited + %s >= 500000 THEN 'platinum'
                        WHEN total_deposited + %s >= 100000 THEN 'gold'
                        WHEN total_deposited + %s >= 25000  THEN 'silver'
                        WHEN total_deposited + %s >= 5000   THEN 'bronze'
                        ELSE 'none'
                    END,
                    updated_at = NOW()
                WHERE id = %s RETURNING balance, total_deposited, vip_level
            """, (total_credit, delta, first_deposit_bonus, delta, delta, delta, delta, user[0]))
        elif cashback_earned > 0:
            cur.execute("""
                UPDATE users
                SET balance = GREATEST(0, balance + %s),
                    cashback_available = cashback_available + %s,
                    updated_at = NOW()
                WHERE id = %s RETURNING balance, total_deposited, vip_level
            """, (delta, cashback_earned, user[0]))
        else:
            cur.execute("""
                UPDATE users SET balance = GREATEST(0, balance + %s), updated_at = NOW()
                WHERE id = %s RETURNING balance, total_deposited, vip_level
            """, (delta, user[0]))

        row = cur.fetchone()
        new_balance = float(row[0])

        new_achievements = []
        if is_deposit and delta > 0:
            new_achievements = check_and_unlock_achievements(cur, user[0])
            if new_achievements:
                cur.execute("SELECT balance FROM users WHERE id = %s", (user[0],))
                new_balance = float(cur.fetchone()[0])

        conn.commit(); cur.close(); conn.close()
        return {'statusCode': 200, 'headers': HEADERS,
                'body': json.dumps({
                    'balance': new_balance,
                    'cashback_earned': cashback_earned,
                    'first_deposit_bonus': first_deposit_bonus,
                    'new_achievements': new_achievements,
                }), 'isBase64Encoded': False}

    # ── LOGOUT ──
    if action == 'logout' and http_method == 'POST':
        if token:
            cur.execute("UPDATE sessions SET expires_at = NOW() WHERE token = %s", (token,))
            conn.commit()
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': HEADERS,
                'body': json.dumps({'success': True}), 'isBase64Encoded': False}

    # ── ORDER STATUS ──
    if action == 'order-status' and http_method == 'GET':
        session_id = params.get('session_id', '')
        if not session_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'session_id required'}), 'isBase64Encoded': False}
        cur.execute(
            "SELECT status, amount, order_number FROM orders WHERE session_id = %s ORDER BY created_at DESC LIMIT 1",
            (session_id,)
        )
        row = cur.fetchone()
        cur.close(); conn.close()
        if not row:
            return {'statusCode': 404, 'headers': HEADERS,
                    'body': json.dumps({'error': 'order not found'}), 'isBase64Encoded': False}
        return {'statusCode': 200, 'headers': HEADERS,
                'body': json.dumps({'status': row[0], 'amount': float(row[1]), 'order_number': row[2]}),
                'isBase64Encoded': False}

    # ── REFERRAL STATS ──
    if action == 'referral' and http_method == 'GET':
        if not token:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Не авторизован'}), 'isBase64Encoded': False}
        user = get_user_by_token(cur, token)
        if not user:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Сессия истекла'}), 'isBase64Encoded': False}

        # Кол-во рефералов и сумма начислений
        cur.execute("""
            SELECT COUNT(DISTINCT referee_id), COALESCE(SUM(amount), 0)
            FROM referral_bonuses WHERE referrer_id = %s
        """, (user[0],))
        stats = cur.fetchone()

        # Список рефералов
        cur.execute("""
            SELECT u.username, u.email, rb.amount, rb.type, rb.created_at
            FROM referral_bonuses rb JOIN users u ON rb.referee_id = u.id
            WHERE rb.referrer_id = %s ORDER BY rb.created_at DESC LIMIT 50
        """, (user[0],))
        bonuses = []
        for row in cur.fetchall():
            bonuses.append({
                'username': row[0], 'email': row[1],
                'amount': float(row[2]), 'type': row[3],
                'created_at': row[4].isoformat()
            })

        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps({
            'referral_code': user[4],
            'total_referrals': int(stats[0]),
            'total_earned': float(stats[1]),
            'bonuses': bonuses,
        }), 'isBase64Encoded': False}

    # ── DAILY BONUS ──
    if action == 'daily' and http_method == 'POST':
        if not token:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Не авторизован'}), 'isBase64Encoded': False}
        user = get_user_by_token(cur, token)
        if not user:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Сессия истекла'}), 'isBase64Encoded': False}

        # Проверяем, брал ли сегодня
        cur.execute("""
            SELECT last_daily_bonus, daily_streak FROM users WHERE id = %s
        """, (user[0],))
        row = cur.fetchone()
        last_bonus = row[0]
        streak = row[1] or 0

        cur.execute("SELECT CURRENT_DATE")
        today = cur.fetchone()[0]

        if last_bonus and last_bonus >= today:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'already_claimed', 'message': 'Бонус уже получен сегодня'}),
                    'isBase64Encoded': False}

        # Сбрасываем серию если пропустил день
        import datetime
        if last_bonus and (today - last_bonus).days > 1:
            streak = 0
        streak += 1

        # Реальная сумма: 1–10 ₽ (показываем "до 100 ₽")
        bonus_amount = round(random.uniform(1, 10), 2)

        cur.execute("""
            UPDATE users
            SET balance = balance + %s,
                last_daily_bonus = %s,
                daily_streak = %s,
                updated_at = NOW()
            WHERE id = %s
            RETURNING balance
        """, (bonus_amount, today, streak, user[0]))
        new_balance = float(cur.fetchone()[0])

        new_achievements = check_and_unlock_achievements(cur, user[0])
        if new_achievements:
            cur.execute("SELECT balance FROM users WHERE id = %s", (user[0],))
            new_balance = float(cur.fetchone()[0])

        conn.commit(); cur.close(); conn.close()

        return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps({
            'bonus': bonus_amount,
            'balance': new_balance,
            'streak': streak,
            'new_achievements': new_achievements,
        }), 'isBase64Encoded': False}

    # ── DAILY STATUS (можно ли получить) ──
    if action == 'daily-status' and http_method == 'GET':
        if not token:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Не авторизован'}), 'isBase64Encoded': False}
        user = get_user_by_token(cur, token)
        if not user:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Сессия истекла'}), 'isBase64Encoded': False}

        cur.execute("SELECT last_daily_bonus, daily_streak, CURRENT_DATE FROM users WHERE id = %s", (user[0],))
        row = cur.fetchone()
        cur.close(); conn.close()

        last_bonus = row[0]
        streak = row[1] or 0
        today = row[2]
        can_claim = not last_bonus or last_bonus < today

        return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps({
            'can_claim': can_claim,
            'streak': streak,
            'last_bonus': last_bonus.isoformat() if last_bonus else None,
        }), 'isBase64Encoded': False}

    # ── SPIN STATUS ──
    if action == 'spin-status' and http_method == 'GET':
        if not token:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Не авторизован'}), 'isBase64Encoded': False}
        user = get_user_by_token(cur, token)
        if not user:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Сессия истекла'}), 'isBase64Encoded': False}

        cur.execute("SELECT last_daily_spin, CURRENT_DATE FROM users WHERE id = %s", (user[0],))
        row = cur.fetchone()
        cur.close(); conn.close()
        last_spin = row[0]
        today = row[1]
        can_spin = not last_spin or last_spin < today
        return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps({
            'can_spin': can_spin,
            'last_spin': last_spin.isoformat() if last_spin else None,
        }), 'isBase64Encoded': False}

    # ── SPIN (крутим колесо) ──
    if action == 'spin' and http_method == 'POST':
        if not token:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Не авторизован'}), 'isBase64Encoded': False}
        user = get_user_by_token(cur, token)
        if not user:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Сессия истекла'}), 'isBase64Encoded': False}

        cur.execute("SELECT last_daily_spin, CURRENT_DATE FROM users WHERE id = %s", (user[0],))
        row = cur.fetchone()
        last_spin, today = row[0], row[1]

        if last_spin and last_spin >= today:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'already_spun', 'message': 'Спин уже использован сегодня'}),
                    'isBase64Encoded': False}

        # Секторы колеса: (label, prize_type, value)
        # prize_type: 'coins' | 'multiplier' | 'nothing'
        WHEEL_SECTORS = [
            {'label': '10 ₽',   'type': 'coins',      'value': 10},
            {'label': '×2',      'type': 'multiplier', 'value': 2},
            {'label': '25 ₽',   'type': 'coins',      'value': 25},
            {'label': 'Ничего',  'type': 'nothing',    'value': 0},
            {'label': '50 ₽',   'type': 'coins',      'value': 50},
            {'label': '×1.5',    'type': 'multiplier', 'value': 1.5},
            {'label': '5 ₽',    'type': 'coins',      'value': 5},
            {'label': 'Ничего',  'type': 'nothing',    'value': 0},
            {'label': '100 ₽',  'type': 'coins',      'value': 100},
            {'label': '×3',      'type': 'multiplier', 'value': 3},
            {'label': '15 ₽',   'type': 'coins',      'value': 15},
            {'label': 'Ничего',  'type': 'nothing',    'value': 0},
        ]
        # Веса: монеты чаще, ничего реже, большие множители редко
        weights = [8, 3, 6, 4, 4, 4, 10, 4, 2, 1, 7, 4]
        sector_idx = random.choices(range(len(WHEEL_SECTORS)), weights=weights, k=1)[0]
        sector = WHEEL_SECTORS[sector_idx]

        # Вычисляем приз
        current_balance = float(user[3])
        prize = 0.0
        if sector['type'] == 'coins':
            prize = float(sector['value'])
        elif sector['type'] == 'multiplier':
            # Множитель к текущему балансу, но не более 500 ₽
            prize = min(round(current_balance * (sector['value'] - 1), 2), 500.0)
            prize = max(prize, 0.0)

        cur.execute("""
            UPDATE users SET balance = balance + %s, last_daily_spin = %s, updated_at = NOW()
            WHERE id = %s RETURNING balance
        """, (prize, today, user[0]))
        new_balance = float(cur.fetchone()[0])
        conn.commit(); cur.close(); conn.close()

        return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps({
            'sector_idx': sector_idx,
            'sector': sector,
            'prize': prize,
            'balance': new_balance,
        }), 'isBase64Encoded': False}

    # ── RECORD GAME (запись ставки) ──
    if action == 'record-game' and http_method == 'POST':
        if not token:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Не авторизован'}), 'isBase64Encoded': False}
        user = get_user_by_token(cur, token)
        if not user:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Сессия истекла'}), 'isBase64Encoded': False}

        game = str(body.get('game', ''))
        bet = float(body.get('bet', 0))
        result = float(body.get('result', 0))
        is_win = bool(body.get('is_win', False))
        details = body.get('details', {})

        cur.execute("""
            INSERT INTO game_history (user_id, game, bet, result, is_win, details)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (user[0], game, bet, result, is_win, json.dumps(details)))

        new_achievements = check_and_unlock_achievements(cur, user[0])
        conn.commit(); cur.close(); conn.close()

        return {'statusCode': 200, 'headers': HEADERS,
                'body': json.dumps({
                    'success': True,
                    'new_achievements': new_achievements,
                }), 'isBase64Encoded': False}

    # ── HISTORY (история ставок) ──
    if action == 'history' and http_method == 'GET':
        if not token:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Не авторизован'}), 'isBase64Encoded': False}
        user = get_user_by_token(cur, token)
        if not user:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Сессия истекла'}), 'isBase64Encoded': False}

        cur.execute("""
            SELECT game, bet, result, is_win, details, created_at
            FROM game_history WHERE user_id = %s
            ORDER BY created_at DESC LIMIT 100
        """, (user[0],))
        rows = cur.fetchall()

        # Считаем статистику
        cur.execute("""
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE is_win) AS wins,
                COALESCE(SUM(bet), 0) AS total_bet,
                COALESCE(SUM(result) FILTER (WHERE is_win), 0) AS total_won,
                COALESCE(SUM(bet) FILTER (WHERE NOT is_win), 0) AS total_lost
            FROM game_history WHERE user_id = %s
        """, (user[0],))
        stat = cur.fetchone()
        cur.close(); conn.close()

        games = []
        for row in rows:
            games.append({
                'game': row[0], 'bet': float(row[1]), 'result': float(row[2]),
                'is_win': row[3], 'details': row[4] or {},
                'created_at': row[5].isoformat()
            })

        return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps({
            'games': games,
            'stats': {
                'total': int(stat[0]), 'wins': int(stat[1]),
                'total_bet': float(stat[2]), 'total_won': float(stat[3]),
                'total_lost': float(stat[4]),
            }
        }), 'isBase64Encoded': False}

    # ── LEADERBOARD ──
    if action == 'leaderboard' and http_method == 'GET':
        period = (params.get('period') or 'week')  # week | month | alltime

        if period == 'week':
            date_filter = "AND gh.created_at >= NOW() - INTERVAL '7 days'"
        elif period == 'month':
            date_filter = "AND gh.created_at >= NOW() - INTERVAL '30 days'"
        else:
            date_filter = ""

        cur.execute(f"""
            SELECT
                u.id,
                u.username,
                COUNT(gh.id) AS games,
                COUNT(gh.id) FILTER (WHERE gh.is_win) AS wins,
                COALESCE(SUM(gh.result) FILTER (WHERE gh.is_win), 0) -
                COALESCE(SUM(gh.bet), 0) AS profit
            FROM users u
            JOIN game_history gh ON gh.user_id = u.id
            WHERE TRUE {date_filter}
            GROUP BY u.id, u.username
            HAVING COUNT(gh.id) >= 1
            ORDER BY profit DESC
            LIMIT 50
        """)
        rows = cur.fetchall()

        # Позиция текущего пользователя
        my_rank = None
        my_stats = None
        if token:
            user = get_user_by_token(cur, token)
            if user:
                for i, row in enumerate(rows):
                    if row[0] == user[0]:
                        my_rank = i + 1
                        my_stats = row
                        break

        cur.close(); conn.close()

        leaders = []
        for i, row in enumerate(rows):
            name = row[1] or 'Игрок'
            # Маскируем имя: первые 2 символа + звёздочки
            masked = name[:2] + '*' * max(0, len(name) - 2) if len(name) > 2 else name
            leaders.append({
                'rank': i + 1,
                'username': masked,
                'games': int(row[2]),
                'wins': int(row[3]),
                'profit': float(row[4]),
            })

        return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps({
            'leaders': leaders,
            'my_rank': my_rank,
            'my_profit': float(my_stats[4]) if my_stats else None,
        }), 'isBase64Encoded': False}

    # ── PROMO ACTIVATE ──
    if action == 'promo' and http_method == 'POST':
        if not token:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Не авторизован'}), 'isBase64Encoded': False}
        user = get_user_by_token(cur, token)
        if not user:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Сессия истекла'}), 'isBase64Encoded': False}

        code = (body.get('code') or '').strip().upper()
        if not code:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Введите промокод'}), 'isBase64Encoded': False}

        cur.execute("""
            SELECT id, bonus_amount, max_uses, uses_count, is_active, expires_at
            FROM promo_codes WHERE code = %s
        """, (code,))
        promo = cur.fetchone()
        if not promo:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Промокод не найден'}), 'isBase64Encoded': False}

        promo_id, bonus_amount, max_uses, uses_count, is_active, expires_at = promo

        if not is_active:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Промокод деактивирован'}), 'isBase64Encoded': False}

        if expires_at:
            cur.execute("SELECT NOW()")
            if cur.fetchone()[0] > expires_at:
                cur.close(); conn.close()
                return {'statusCode': 400, 'headers': HEADERS,
                        'body': json.dumps({'error': 'Срок действия промокода истёк'}), 'isBase64Encoded': False}

        if max_uses is not None and uses_count >= max_uses:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Промокод исчерпан'}), 'isBase64Encoded': False}

        cur.execute("SELECT id FROM promo_activations WHERE promo_id = %s AND user_id = %s", (promo_id, user[0]))
        if cur.fetchone():
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Вы уже использовали этот промокод'}), 'isBase64Encoded': False}

        cur.execute("INSERT INTO promo_activations (promo_id, user_id) VALUES (%s, %s)", (promo_id, user[0]))
        cur.execute("UPDATE promo_codes SET uses_count = uses_count + 1 WHERE id = %s", (promo_id,))
        cur.execute("UPDATE users SET balance = balance + %s, updated_at = NOW() WHERE id = %s RETURNING balance",
                    (bonus_amount, user[0]))
        new_balance = float(cur.fetchone()[0])
        conn.commit(); cur.close(); conn.close()

        return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps({
            'success': True,
            'bonus_amount': float(bonus_amount),
            'new_balance': new_balance,
        }), 'isBase64Encoded': False}

    # ── CASHBACK CLAIM ──
    if action == 'cashback' and http_method == 'POST':
        if not token:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Не авторизован'}), 'isBase64Encoded': False}
        user = get_user_by_token(cur, token)
        if not user:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Сессия истекла'}), 'isBase64Encoded': False}

        cashback = float(user[7])
        if cashback <= 0:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Нет доступного кешбэка'}), 'isBase64Encoded': False}

        cur.execute("""
            UPDATE users
            SET balance = balance + %s,
                cashback_available = 0,
                cashback_claimed_at = NOW(),
                updated_at = NOW()
            WHERE id = %s RETURNING balance
        """, (cashback, user[0]))
        new_balance = float(cur.fetchone()[0])

        cur.execute("""
            INSERT INTO cashback_history (user_id, amount, period_start, period_end, losses, vip_level, pct)
            VALUES (%s, %s, NOW() - INTERVAL '7 days', NOW(), %s, %s, %s)
        """, (user[0], cashback, cashback, user[5], calc_vip(float(user[6]))['cashback_pct']))

        conn.commit(); cur.close(); conn.close()
        return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps({
            'success': True,
            'cashback': cashback,
            'new_balance': new_balance,
        }), 'isBase64Encoded': False}

    # ── VIP STATUS ──
    if action == 'vip' and http_method == 'GET':
        if not token:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Не авторизован'}), 'isBase64Encoded': False}
        user = get_user_by_token(cur, token)
        if not user:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Сессия истекла'}), 'isBase64Encoded': False}

        cur.execute("""
            SELECT amount, vip_level, pct, created_at FROM cashback_history
            WHERE user_id = %s ORDER BY created_at DESC LIMIT 10
        """, (user[0],))
        history = [{'amount': float(r[0]), 'vip_level': r[1], 'pct': float(r[2]),
                    'created_at': r[3].isoformat()} for r in cur.fetchall()]
        cur.close(); conn.close()

        vip_info = user_to_dict(user)
        vip_info['cashback_history'] = history
        vip_info['all_levels'] = VIP_LEVELS
        return {'statusCode': 200, 'headers': HEADERS,
                'body': json.dumps(vip_info), 'isBase64Encoded': False}

    # ── UPDATE PROFILE (смена никнейма) ──
    if action == 'update-profile' and http_method == 'POST':
        if not token:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Не авторизован'}), 'isBase64Encoded': False}
        user = get_user_by_token(cur, token)
        if not user:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Сессия истекла'}), 'isBase64Encoded': False}

        new_username = (body.get('username') or '').strip()
        if not new_username:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Никнейм не может быть пустым'}), 'isBase64Encoded': False}
        if len(new_username) > 32:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Никнейм не более 32 символов'}), 'isBase64Encoded': False}

        cur.execute("""
            UPDATE users SET username = %s, updated_at = NOW() WHERE id = %s
        """, (new_username, user[0]))
        conn.commit(); cur.close(); conn.close()
        return {'statusCode': 200, 'headers': HEADERS,
                'body': json.dumps({'success': True, 'username': new_username}), 'isBase64Encoded': False}

    # ── UPLOAD AVATAR ──
    if action == 'upload-avatar' and http_method == 'POST':
        if not token:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Не авторизован'}), 'isBase64Encoded': False}
        user = get_user_by_token(cur, token)
        if not user:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Сессия истекла'}), 'isBase64Encoded': False}

        image_b64 = body.get('image_b64', '')
        content_type = body.get('content_type', 'image/jpeg')
        if not image_b64:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Нет изображения'}), 'isBase64Encoded': False}

        # Декодируем base64 и ограничиваем размер (макс 2 МБ)
        if ',' in image_b64:
            image_b64 = image_b64.split(',', 1)[1]
        img_bytes = base64.b64decode(image_b64)
        if len(img_bytes) > 2 * 1024 * 1024:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Размер фото не более 2 МБ'}), 'isBase64Encoded': False}

        ext = 'jpg' if 'jpeg' in content_type else content_type.split('/')[-1]
        key = f'avatars/user_{user[0]}.{ext}'
        s3 = get_s3()
        s3.put_object(Bucket='files', Key=key, Body=img_bytes, ContentType=content_type)

        cdn_url = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"

        cur.execute("UPDATE users SET avatar_url = %s, updated_at = NOW() WHERE id = %s", (cdn_url, user[0]))
        conn.commit(); cur.close(); conn.close()
        return {'statusCode': 200, 'headers': HEADERS,
                'body': json.dumps({'success': True, 'avatar_url': cdn_url}), 'isBase64Encoded': False}

    # ── SUPPORT: получить/создать чат + сообщения ──
    if action == 'support-messages' and http_method == 'GET':
        if not token:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Не авторизован'}), 'isBase64Encoded': False}
        user = get_user_by_token(cur, token)
        if not user:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Сессия истекла'}), 'isBase64Encoded': False}

        # Найти или создать чат
        cur.execute("SELECT id, status, unread_user FROM support_chats WHERE user_id = %s ORDER BY id DESC LIMIT 1", (user[0],))
        chat = cur.fetchone()
        if not chat:
            cur.execute("INSERT INTO support_chats (user_id) VALUES (%s) RETURNING id, status, unread_user", (user[0],))
            chat = cur.fetchone()
            conn.commit()
        chat_id, chat_status, unread_user = chat

        # Сбросить счётчик непрочитанных для пользователя
        cur.execute("UPDATE support_chats SET unread_user = 0 WHERE id = %s", (chat_id,))
        conn.commit()

        cur.execute("""
            SELECT id, sender, text, created_at FROM support_messages
            WHERE chat_id = %s ORDER BY created_at ASC LIMIT 200
        """, (chat_id,))
        msgs = [{'id': r[0], 'sender': r[1], 'text': r[2], 'created_at': r[3].isoformat()} for r in cur.fetchall()]
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': HEADERS,
                'body': json.dumps({'chat_id': chat_id, 'status': chat_status, 'messages': msgs}), 'isBase64Encoded': False}

    # ── SUPPORT: отправить сообщение от игрока ──
    if action == 'support-send' and http_method == 'POST':
        if not token:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Не авторизован'}), 'isBase64Encoded': False}
        user = get_user_by_token(cur, token)
        if not user:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Сессия истекла'}), 'isBase64Encoded': False}

        text = (body.get('text') or '').strip()
        if not text:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Сообщение не может быть пустым'}), 'isBase64Encoded': False}
        if len(text) > 2000:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Сообщение слишком длинное'}), 'isBase64Encoded': False}

        # Найти или создать чат
        cur.execute("SELECT id FROM support_chats WHERE user_id = %s ORDER BY id DESC LIMIT 1", (user[0],))
        chat = cur.fetchone()
        if not chat:
            cur.execute("INSERT INTO support_chats (user_id) VALUES (%s) RETURNING id", (user[0],))
            chat = cur.fetchone()
        chat_id = chat[0]

        cur.execute("""
            INSERT INTO support_messages (chat_id, sender, text) VALUES (%s, 'user', %s) RETURNING id, created_at
        """, (chat_id, text))
        msg = cur.fetchone()
        cur.execute("""
            UPDATE support_chats SET unread_admin = unread_admin + 1,
            last_message_at = NOW(), status = 'open' WHERE id = %s
        """, (chat_id,))
        conn.commit(); cur.close(); conn.close()
        return {'statusCode': 200, 'headers': HEADERS,
                'body': json.dumps({'id': msg[0], 'created_at': msg[1].isoformat()}), 'isBase64Encoded': False}

    # ── SUPPORT: проверить новые сообщения (polling) ──
    if action == 'support-poll' and http_method == 'GET':
        if not token:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Не авторизован'}), 'isBase64Encoded': False}
        user = get_user_by_token(cur, token)
        if not user:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Сессия истекла'}), 'isBase64Encoded': False}

        cur.execute("SELECT id, unread_user FROM support_chats WHERE user_id = %s ORDER BY id DESC LIMIT 1", (user[0],))
        chat = cur.fetchone()
        if not chat:
            cur.close(); conn.close()
            return {'statusCode': 200, 'headers': HEADERS,
                    'body': json.dumps({'unread': 0, 'messages': []}), 'isBase64Encoded': False}

        chat_id, unread = chat
        since = params.get('since', '')
        if since:
            cur.execute("""
                SELECT id, sender, text, created_at FROM support_messages
                WHERE chat_id = %s AND created_at > %s ORDER BY created_at ASC
            """, (chat_id, since))
        else:
            cur.execute("""
                SELECT id, sender, text, created_at FROM support_messages
                WHERE chat_id = %s ORDER BY created_at ASC LIMIT 200
            """, (chat_id,))

        msgs = [{'id': r[0], 'sender': r[1], 'text': r[2], 'created_at': r[3].isoformat()} for r in cur.fetchall()]
        if msgs:
            cur.execute("UPDATE support_chats SET unread_user = 0 WHERE id = %s", (chat_id,))
            conn.commit()
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': HEADERS,
                'body': json.dumps({'unread': unread, 'messages': msgs}), 'isBase64Encoded': False}

    # ── MY-WITHDRAWALS: история заявок на вывод ──
    if action == 'my-withdrawals' and http_method == 'GET':
        if not token:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Не авторизован'}), 'isBase64Encoded': False}
        user = get_user_by_token(cur, token)
        if not user:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Сессия истекла'}), 'isBase64Encoded': False}
        cur.execute("""
            SELECT id, request_number, method, destination, amount, status, created_at, updated_at
            FROM withdrawals
            WHERE user_id = %s
            ORDER BY created_at DESC
            LIMIT 50
        """, (user[0],))
        rows = cur.fetchall()
        cur.close(); conn.close()
        withdrawals = [{
            'id': r[0],
            'request_number': r[1],
            'method': r[2],
            'destination': r[3][:4] + '••••' + r[3][-4:] if len(r[3]) >= 8 else r[3],
            'amount': float(r[4]),
            'status': r[5],
            'created_at': r[6].isoformat() if r[6] else None,
            'updated_at': r[7].isoformat() if r[7] else None,
        } for r in rows]
        return {'statusCode': 200, 'headers': HEADERS,
                'body': json.dumps({'withdrawals': withdrawals}), 'isBase64Encoded': False}

    # ── ACHIEVEMENTS (список достижений с прогрессом) ──
    if action == 'achievements' and http_method == 'GET':
        if not token:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Не авторизован'}), 'isBase64Encoded': False}
        user = get_user_by_token(cur, token)
        if not user:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Сессия истекла'}), 'isBase64Encoded': False}

        # На случай если достижение стало доступно, но ещё не зафиксировано
        # (например пользователь просто зашёл на страницу после ручного изменения БД)
        newly = check_and_unlock_achievements(cur, user[0])
        conn.commit()

        cur.execute("""
            SELECT achievement_id, unlocked_at FROM user_achievements WHERE user_id = %s
        """, (user[0],))
        unlocked_map = {row[0]: row[1].isoformat() for row in cur.fetchall()}
        cur.close(); conn.close()

        items = []
        for ach in ACHIEVEMENTS:
            items.append({
                **ach,
                'unlocked': ach['id'] in unlocked_map,
                'unlocked_at': unlocked_map.get(ach['id']),
            })

        return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps({
            'achievements': items,
            'total_unlocked': len(unlocked_map),
            'total_count': len(ACHIEVEMENTS),
            'newly_unlocked': newly,
        }), 'isBase64Encoded': False}

    # ── STATS ──
    if action == 'stats' and http_method == 'GET':
        if not token:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Не авторизован'}), 'isBase64Encoded': False}
        user = get_user_by_token(cur, token)
        if not user:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Сессия истекла'}), 'isBase64Encoded': False}
        uid = user[0]

        # Общая статистика
        cur.execute("""
            SELECT
                COUNT(*) AS total_games,
                SUM(CASE WHEN is_win THEN 1 ELSE 0 END) AS total_wins,
                SUM(CASE WHEN NOT is_win THEN 1 ELSE 0 END) AS total_losses,
                SUM(bet) AS total_bet,
                SUM(CASE WHEN is_win THEN result ELSE 0 END) AS total_won,
                SUM(CASE WHEN NOT is_win THEN bet ELSE 0 END) AS total_lost,
                MAX(CASE WHEN is_win THEN result ELSE 0 END) AS biggest_win
            FROM game_history WHERE user_id = %s
        """, (uid,))
        row = cur.fetchone()
        total_games = int(row[0] or 0)
        total_wins  = int(row[1] or 0)
        total_losses= int(row[2] or 0)
        total_bet   = float(row[3] or 0)
        total_won   = float(row[4] or 0)
        total_lost  = float(row[5] or 0)
        biggest_win = float(row[6] or 0)
        winrate = round(total_wins / total_games * 100, 1) if total_games > 0 else 0

        # Любимая игра (по количеству сессий)
        cur.execute("""
            SELECT game, COUNT(*) AS cnt
            FROM game_history WHERE user_id = %s
            GROUP BY game ORDER BY cnt DESC LIMIT 1
        """, (uid,))
        fav_row = cur.fetchone()
        favorite_game = fav_row[0] if fav_row else None

        # Статистика по каждой игре
        cur.execute("""
            SELECT game,
                COUNT(*) AS total,
                SUM(CASE WHEN is_win THEN 1 ELSE 0 END) AS wins,
                SUM(bet) AS total_bet,
                SUM(CASE WHEN is_win THEN result ELSE 0 END) AS total_won
            FROM game_history WHERE user_id = %s
            GROUP BY game ORDER BY total DESC
        """, (uid,))
        games_stats = [{
            'game': r[0],
            'total': int(r[1]),
            'wins': int(r[2]),
            'losses': int(r[1]) - int(r[2]),
            'winrate': round(int(r[2]) / int(r[1]) * 100, 1) if int(r[1]) > 0 else 0,
            'total_bet': float(r[3] or 0),
            'total_won': float(r[4] or 0),
        } for r in cur.fetchall()]

        # Текущая серия (последовательность побед или поражений подряд)
        cur.execute("""
            SELECT is_win FROM game_history
            WHERE user_id = %s ORDER BY created_at DESC LIMIT 50
        """, (uid,))
        recent = [r[0] for r in cur.fetchall()]
        current_streak = 0
        streak_type = None
        if recent:
            streak_type = 'win' if recent[0] else 'loss'
            for r in recent:
                if r == recent[0]:
                    current_streak += 1
                else:
                    break

        # Максимальная серия побед
        cur.execute("""
            SELECT is_win FROM game_history
            WHERE user_id = %s ORDER BY created_at ASC
        """, (uid,))
        all_results = [r[0] for r in cur.fetchall()]
        max_win_streak = 0
        cur_streak = 0
        for r in all_results:
            if r:
                cur_streak += 1
                max_win_streak = max(max_win_streak, cur_streak)
            else:
                cur_streak = 0

        # Последние 20 игр
        cur.execute("""
            SELECT game, bet, result, is_win, created_at
            FROM game_history WHERE user_id = %s
            ORDER BY created_at DESC LIMIT 20
        """, (uid,))
        recent_games = [{
            'game': r[0],
            'bet': float(r[1]),
            'result': float(r[2]),
            'is_win': r[3],
            'created_at': r[4].isoformat() if r[4] else None,
        } for r in cur.fetchall()]

        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps({
            'total_games': total_games,
            'total_wins': total_wins,
            'total_losses': total_losses,
            'winrate': winrate,
            'total_bet': total_bet,
            'total_won': total_won,
            'total_lost': total_lost,
            'biggest_win': biggest_win,
            'profit': total_won - total_lost,
            'favorite_game': favorite_game,
            'games_stats': games_stats,
            'current_streak': current_streak,
            'streak_type': streak_type,
            'max_win_streak': max_win_streak,
            'recent_games': recent_games,
        }), 'isBase64Encoded': False}

    cur.close(); conn.close()
    return {'statusCode': 400, 'headers': HEADERS,
            'body': json.dumps({'error': 'Unknown action'}), 'isBase64Encoded': False}