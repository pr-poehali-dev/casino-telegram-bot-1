import json
import os
import urllib.request
import psycopg2
from datetime import datetime

HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
    'Content-Type': 'application/json'
}

STATUS_LABELS = {
    'pending':    '⏳ На рассмотрении',
    'processing': '🔄 В обработке',
    'paid':       '✅ Выплачено',
    'rejected':   '❌ Отклонено',
}

# ── Лимиты вывода ──────────────────────────────────────────────────────────────
MIN_WITHDRAW     = 100       # минимальная сумма одной заявки (₽)
MAX_WITHDRAW     = 50_000    # максимальная сумма одной заявки (₽)
DAILY_LIMIT      = 100_000   # суточный лимит на все заявки (₽)
MIN_BALANCE_KEEP = 0         # минимальный остаток после вывода (₽)
# Минимум игр до первого вывода (защита от регистрации ради бонуса)
MIN_GAMES_BEFORE_WITHDRAW = 5


def send_telegram(chat_id: str, text: str):
    token = os.environ.get('TELEGRAM_BOT_TOKEN', '')
    if not token or not chat_id:
        return
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    data = json.dumps({'chat_id': chat_id, 'text': text, 'parse_mode': 'HTML'}).encode()
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception:
        pass


def get_user_by_token(cur, token: str):
    cur.execute("""
        SELECT u.id, u.balance, u.daily_withdrawn, u.daily_withdraw_date, u.email_verified
        FROM sessions s JOIN users u ON s.user_id = u.id
        WHERE s.token = %s AND s.expires_at > NOW()
    """, (token,))
    return cur.fetchone()


def handler(event: dict, context) -> dict:
    """
    POST — создаёт заявку на вывод средств с проверкой лимитов.
    GET ?withdrawal_id=N — статус заявки.
    GET ?action=limits — текущие лимиты и дневной остаток пользователя.
    """
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': HEADERS, 'body': '', 'isBase64Encoded': False}

    token = (event.get('headers') or {}).get('X-Auth-Token') or \
            (event.get('headers') or {}).get('x-auth-token', '')
    method_http = event.get('httpMethod', 'POST').upper()
    params = event.get('queryStringParameters') or {}

    try:
        conn = psycopg2.connect(os.environ['DATABASE_URL'])
        cur = conn.cursor()
    except Exception as e:
        return {'statusCode': 503, 'headers': HEADERS,
                'body': json.dumps({'error': 'Сервер временно недоступен'}), 'isBase64Encoded': False}

    # ── GET: лимиты пользователя ──
    if method_http == 'GET' and params.get('action') == 'limits':
        user = get_user_by_token(cur, token) if token else None
        cur.execute("SELECT CURRENT_DATE")
        today = cur.fetchone()[0]
        cur.close(); conn.close()

        daily_used = 0.0
        email_verified = False
        if user:
            last_date = user[3]
            daily_used = float(user[2]) if last_date and last_date >= today else 0.0
            email_verified = bool(user[4])

        return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps({
            'min_withdraw':  MIN_WITHDRAW,
            'max_withdraw':  MAX_WITHDRAW,
            'daily_limit':   DAILY_LIMIT,
            'daily_used':    daily_used,
            'daily_left':    max(0.0, DAILY_LIMIT - daily_used),
            'email_verified': email_verified,
        }), 'isBase64Encoded': False}

    # ── GET: статус заявки ──
    if method_http == 'GET':
        withdrawal_id = params.get('withdrawal_id')
        if not withdrawal_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'withdrawal_id required'}), 'isBase64Encoded': False}

        user = get_user_by_token(cur, token) if token else None
        user_id = user[0] if user else None
        if user_id:
            cur.execute("""
                SELECT id, status, amount, request_number, updated_at
                FROM withdrawals WHERE id = %s AND user_id = %s
            """, (withdrawal_id, user_id))
        else:
            cur.execute("""
                SELECT id, status, amount, request_number, updated_at
                FROM withdrawals WHERE id = %s
            """, (withdrawal_id,))

        row = cur.fetchone()
        cur.close(); conn.close()
        if not row:
            return {'statusCode': 404, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Not found'}), 'isBase64Encoded': False}

        return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps({
            'id': row[0], 'status': row[1],
            'status_label': STATUS_LABELS.get(row[1], row[1]),
            'amount': float(row[2]), 'request_number': row[3],
            'updated_at': row[4].isoformat() if row[4] else None,
        }), 'isBase64Encoded': False}

    # ── POST: создать заявку ──
    try:
        payload = json.loads(event.get('body') or '{}')
    except Exception:
        payload = {}

    method   = str(payload.get('method', ''))
    destination = str(payload.get('destination', ''))
    user_name   = str(payload.get('user_name', ''))
    user_email  = str(payload.get('user_email', ''))
    user_telegram = str(payload.get('user_telegram', ''))

    try:
        amount = float(payload.get('amount', 0))
    except (ValueError, TypeError):
        amount = 0.0

    # Базовая валидация полей
    if not method or not destination or amount <= 0:
        cur.close(); conn.close()
        return {'statusCode': 400, 'headers': HEADERS,
                'body': json.dumps({'error': 'method, destination и amount обязательны'}),
                'isBase64Encoded': False}

    # ── Проверки лимитов ──────────────────────────────────────────────────────
    if amount < MIN_WITHDRAW:
        cur.close(); conn.close()
        return {'statusCode': 400, 'headers': HEADERS,
                'body': json.dumps({'error': f'Минимальная сумма вывода — {MIN_WITHDRAW:,} ₽'.replace(',', ' ')}),
                'isBase64Encoded': False}

    if amount > MAX_WITHDRAW:
        cur.close(); conn.close()
        return {'statusCode': 400, 'headers': HEADERS,
                'body': json.dumps({'error': f'Максимальная сумма одной заявки — {MAX_WITHDRAW:,} ₽'.replace(',', ' ')}),
                'isBase64Encoded': False}

    # Вывод средств доступен только авторизованным пользователям
    # (анонимные заявки запрещены — иначе проверку email легко обойти)
    user = get_user_by_token(cur, token) if token else None
    if not user:
        cur.close(); conn.close()
        return {'statusCode': 401, 'headers': HEADERS,
                'body': json.dumps({'error': 'Войдите в аккаунт, чтобы вывести средства'}),
                'isBase64Encoded': False}

    if user:
        user_id    = user[0]
        balance    = float(user[1])
        daily_used = float(user[2])
        last_date  = user[3]
        email_verified = bool(user[4])

        # Email должен быть подтверждён перед выводом средств (защита от фрода)
        if not email_verified:
            cur.close(); conn.close()
            return {'statusCode': 403, 'headers': HEADERS,
                    'body': json.dumps({
                        'error': 'email_not_verified',
                        'message': 'Подтверди email перед выводом средств'
                    }), 'isBase64Encoded': False}

        # Получаем сегодняшнюю дату из БД
        cur.execute("SELECT CURRENT_DATE")
        today = cur.fetchone()[0]

        # Сбрасываем суточный счётчик если новый день
        if not last_date or last_date < today:
            daily_used = 0.0

        # Проверка баланса
        if amount > balance - MIN_BALANCE_KEEP:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Недостаточно средств на балансе'}),
                    'isBase64Encoded': False}

        # Суточный лимит
        if daily_used + amount > DAILY_LIMIT:
            left = max(0.0, DAILY_LIMIT - daily_used)
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({
                        'error': f'Суточный лимит вывода {DAILY_LIMIT:,} ₽ превышен. Сегодня осталось: {left:,.0f} ₽'.replace(',', ' ')
                    }), 'isBase64Encoded': False}

        # Минимум игр до вывода
        cur.execute("SELECT COUNT(*) FROM game_history WHERE user_id = %s", (user_id,))
        games_count = cur.fetchone()[0]
        if games_count < MIN_GAMES_BEFORE_WITHDRAW:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({
                        'error': f'Для вывода нужно сыграть минимум {MIN_GAMES_BEFORE_WITHDRAW} игр (сыграно: {games_count})'
                    }), 'isBase64Encoded': False}

        # Списываем с баланса и обновляем суточный счётчик
        cur.execute("""
            UPDATE users
            SET balance             = balance - %s,
                daily_withdrawn     = CASE WHEN daily_withdraw_date = CURRENT_DATE
                                          THEN daily_withdrawn + %s
                                          ELSE %s END,
                daily_withdraw_date = CURRENT_DATE,
                updated_at          = NOW()
            WHERE id = %s
        """, (amount, amount, amount, user_id))

    else:
        user_id = None

    request_number = f"WD-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    amount_str = f"{amount:,.0f}".replace(',', ' ')

    cur.execute("""
        INSERT INTO withdrawals (request_number, user_name, user_email, user_telegram,
                                 method, destination, amount, status, user_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s, 'pending', %s)
        RETURNING id
    """, (request_number, user_name, user_email, user_telegram,
          method, destination, amount, user_id))
    withdrawal_id = cur.fetchone()[0]
    conn.commit()
    cur.close(); conn.close()

    # Уведомление владельцу в Telegram
    owner_chat_id = os.environ.get('TELEGRAM_OWNER_CHAT_ID', '')
    dest_masked = destination[:4] + '••••' + destination[-4:] if len(destination) >= 8 else destination
    tg_text = (
        f"💸 <b>Новая заявка на вывод!</b>\n\n"
        f"👤 Игрок: {user_name or '—'}"
        + (f" (@{user_telegram})" if user_telegram else "") + "\n"
        f"📧 Email: {user_email or '—'}\n"
        f"💵 Сумма: <b>{amount_str} ₽</b>\n"
        f"🏦 Метод: {method}\n"
        f"💳 Реквизиты: <code>{dest_masked}</code>\n"
        f"🧾 Заявка: {request_number}\n"
        f"⏳ Статус: На рассмотрении"
    )
    send_telegram(owner_chat_id, tg_text)

    return {
        'statusCode': 200,
        'headers': HEADERS,
        'body': json.dumps({
            'success': True,
            'request_number': request_number,
            'withdrawal_id': withdrawal_id,
        }),
        'isBase64Encoded': False
    }