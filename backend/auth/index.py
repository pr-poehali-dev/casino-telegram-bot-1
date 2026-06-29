import json
import os
import hashlib
import secrets
import random
import base64
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
               u.first_deposit_bonus_claimed
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
    }


def handler(event: dict, context) -> dict:
    """
    Авторизация игроков. Роутинг через ?action=...
    POST ?action=register  { email, password, username }
    POST ?action=login     { email, password }
    GET  ?action=me        X-Auth-Token
    POST ?action=logout    X-Auth-Token
    POST ?action=balance   { delta } + X-Auth-Token
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
        conn.commit(); cur.close(); conn.close()

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
            }
        }), 'isBase64Encoded': False}

    # ── LOGIN ──
    if action == 'login' and http_method == 'POST':
        email = str(body.get('email', '')).lower().strip()
        password = str(body.get('password', ''))

        cur.execute("""
            SELECT id, email, username, balance, referral_code,
                   vip_level, total_deposited, cashback_available,
                   avatar_url, last_spin_at
            FROM users WHERE email = %s AND password_hash = %s AND is_active = TRUE
        """, (email, hash_password(password)))
        user = cur.fetchone()
        if not user:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Неверный email или пароль'}), 'isBase64Encoded': False}

        session_token = secrets.token_hex(32)
        cur.execute("INSERT INTO sessions (user_id, token) VALUES (%s, %s)", (user[0], session_token))
        conn.commit(); cur.close(); conn.close()

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

        delta = float(body.get('delta', 0))
        is_deposit = bool(body.get('is_deposit', False))

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
        conn.commit(); cur.close(); conn.close()
        return {'statusCode': 200, 'headers': HEADERS,
                'body': json.dumps({
                    'balance': new_balance,
                    'cashback_earned': cashback_earned,
                    'first_deposit_bonus': first_deposit_bonus,
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
        conn.commit(); cur.close(); conn.close()

        return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps({
            'bonus': bonus_amount,
            'balance': new_balance,
            'streak': streak,
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
        conn.commit(); cur.close(); conn.close()

        return {'statusCode': 200, 'headers': HEADERS,
                'body': json.dumps({'success': True}), 'isBase64Encoded': False}

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

    # ── STATS: статистика игрока ──
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