import json
import os
import urllib.request
import psycopg2
from datetime import datetime

HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
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


def handler(event: dict, context) -> dict:
    """
    Создаёт заявку на вывод средств и отправляет уведомление владельцу в Telegram.
    POST body: { method, destination, amount, user_name, user_email, user_telegram }
    """
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': HEADERS, 'body': '', 'isBase64Encoded': False}

    payload = json.loads(event.get('body') or '{}')

    method = str(payload.get('method', ''))
    destination = str(payload.get('destination', ''))
    amount = float(payload.get('amount', 0))
    user_name = str(payload.get('user_name', ''))
    user_email = str(payload.get('user_email', ''))
    user_telegram = str(payload.get('user_telegram', ''))

    if not method or not destination or amount <= 0:
        return {'statusCode': 400, 'headers': HEADERS,
                'body': json.dumps({'error': 'method, destination и amount обязательны'}),
                'isBase64Encoded': False}

    request_number = f"WD-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    amount_str = f"{amount:,.0f}".replace(',', ' ')

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO withdrawals (request_number, user_name, user_email, user_telegram, method, destination, amount, status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, 'pending')
        RETURNING id
    """, (request_number, user_name, user_email, user_telegram, method, destination, amount))
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
        'body': json.dumps({'success': True, 'request_number': request_number}),
        'isBase64Encoded': False
    }
