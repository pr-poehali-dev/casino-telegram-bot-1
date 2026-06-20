import json
import os
import hashlib
import secrets
import random
import psycopg2

HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
    'Content-Type': 'application/json'
}


def get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def get_user_by_token(cur, token: str):
    cur.execute("""
        SELECT u.id, u.email, u.username, u.balance, u.referral_code
        FROM sessions s JOIN users u ON s.user_id = u.id
        WHERE s.token = %s AND s.expires_at > NOW()
    """, (token,))
    return cur.fetchone()


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
    body = json.loads(event.get('body') or '{}')

    conn = get_conn()
    cur = conn.cursor()

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
            'user': {'id': user_id, 'email': email, 'username': username, 'balance': start_balance,
                     'referral_code': new_ref_code}
        }), 'isBase64Encoded': False}

    # ── LOGIN ──
    if action == 'login' and http_method == 'POST':
        email = str(body.get('email', '')).lower().strip()
        password = str(body.get('password', ''))

        cur.execute("""
            SELECT id, email, username, balance FROM users
            WHERE email = %s AND password_hash = %s AND is_active = TRUE
        """, (email, hash_password(password)))
        user = cur.fetchone()
        if not user:
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Неверный email или пароль'}), 'isBase64Encoded': False}

        session_token = secrets.token_hex(32)
        cur.execute("INSERT INTO sessions (user_id, token) VALUES (%s, %s)", (user[0], session_token))
        cur.execute("SELECT referral_code FROM users WHERE id = %s", (user[0],))
        ref_row = cur.fetchone()
        ref_code_val = ref_row[0] if ref_row else None
        conn.commit(); cur.close(); conn.close()

        return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps({
            'token': session_token,
            'user': {'id': user[0], 'email': user[1], 'username': user[2], 'balance': float(user[3]),
                     'referral_code': ref_code_val}
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
            'user': {'id': user[0], 'email': user[1], 'username': user[2], 'balance': float(user[3]),
                     'referral_code': user[4]}
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
        cur.execute("""
            UPDATE users SET balance = GREATEST(0, balance + %s), updated_at = NOW()
            WHERE id = %s RETURNING balance
        """, (delta, user[0]))
        new_balance = float(cur.fetchone()[0])
        conn.commit(); cur.close(); conn.close()
        return {'statusCode': 200, 'headers': HEADERS,
                'body': json.dumps({'balance': new_balance}), 'isBase64Encoded': False}

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

    cur.close(); conn.close()
    return {'statusCode': 400, 'headers': HEADERS,
            'body': json.dumps({'error': 'Unknown action'}), 'isBase64Encoded': False}