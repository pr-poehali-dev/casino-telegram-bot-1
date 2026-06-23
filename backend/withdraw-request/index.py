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
        SELECT u.id FROM sessions s JOIN users u ON s.user_id = u.id
        WHERE s.token = %s AND s.expires_at > NOW()
    """, (token,))
    row = cur.fetchone()
    return row[0] if row else None


def handler(event: dict, context) -> dict:
    """
    POST — создаёт заявку на вывод средств.
    GET ?withdrawal_id=N — возвращает статус заявки (для поллинга игроком).
    """
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': HEADERS, 'body': '', 'isBase64Encoded': False}

    token = (event.get('headers') or {}).get('X-Auth-Token') or \
            (event.get('headers') or {}).get('x-auth-token', '')
    method_http = event.get('httpMethod', 'POST').upper()

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()

    # ── GET: статус заявки ──
    if method_http == 'GET':
        params = event.get('queryStringParameters') or {}
        withdrawal_id = params.get('withdrawal_id')
        if not withdrawal_id:
            conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'withdrawal_id required'}), 'isBase64Encoded': False}

        # Проверяем что заявка принадлежит этому пользователю
        user_id = get_user_by_token(cur, token) if token else None
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
        conn.close()
        if not row:
            return {'statusCode': 404, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Not found'}), 'isBase64Encoded': False}

        return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps({
            'id': row[0],
            'status': row[1],
            'status_label': STATUS_LABELS.get(row[1], row[1]),
            'amount': float(row[2]),
            'request_number': row[3],
            'updated_at': row[4].isoformat() if row[4] else None,
        }), 'isBase64Encoded': False}

    # ── POST: создать заявку ──
    payload = json.loads(event.get('body') or '{}')

    method = str(payload.get('method', ''))
    destination = str(payload.get('destination', ''))
    amount = float(payload.get('amount', 0))
    user_name = str(payload.get('user_name', ''))
    user_email = str(payload.get('user_email', ''))
    user_telegram = str(payload.get('user_telegram', ''))

    if not method or not destination or amount <= 0:
        conn.close()
        return {'statusCode': 400, 'headers': HEADERS,
                'body': json.dumps({'error': 'method, destination и amount обязательны'}),
                'isBase64Encoded': False}

    # Получаем user_id по токену если передан
    user_id = get_user_by_token(cur, token) if token else None

    request_number = f"WD-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    amount_str = f"{amount:,.0f}".replace(',', ' ')

    cur.execute("""
        INSERT INTO withdrawals (request_number, user_name, user_email, user_telegram,
                                 method, destination, amount, status, user_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s, 'pending', %s)
        RETURNING id
    """, (request_number, user_name, user_email, user_telegram, method, destination, amount, user_id))
    withdrawal_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()

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
