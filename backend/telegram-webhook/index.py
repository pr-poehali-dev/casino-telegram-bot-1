import json
import os
import urllib.request
import psycopg2

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


WEBHOOK_URL = 'https://functions.poehali.dev/b62aa56d-bbf4-4743-a621-9f7a0242136c'


def handler(event: dict, context) -> dict:
    """
    Webhook для Telegram-бота. Принимает апдейты от Telegram Bot API.
    Обрабатывает команду /start <code> для привязки Telegram-аккаунта игрока
    к его аккаунту в казино (по одноразовому коду из личного кабинета).

    GET ?action=setup + заголовок X-Admin-Password — одноразовая регистрация
    этого URL как webhook в Telegram Bot API (запускается один раз вручную).
    """
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': HEADERS, 'body': '', 'isBase64Encoded': False}

    params = event.get('queryStringParameters') or {}
    if event.get('httpMethod') == 'GET' and params.get('action') == 'setup':
        admin_password = os.environ.get('ADMIN_PASSWORD', '')
        provided = (event.get('headers') or {}).get('X-Admin-Password') or \
                   (event.get('headers') or {}).get('x-admin-password', '')
        if not admin_password or provided != admin_password:
            return {'statusCode': 401, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Неверный пароль администратора'}), 'isBase64Encoded': False}

        token = os.environ.get('TELEGRAM_BOT_TOKEN', '')
        if not token:
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'TELEGRAM_BOT_TOKEN не задан'}), 'isBase64Encoded': False}

        api_url = f"https://api.telegram.org/bot{token}/setWebhook"
        payload = json.dumps({'url': WEBHOOK_URL}).encode()
        req = urllib.request.Request(api_url, data=payload, headers={'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                result = json.loads(resp.read().decode())
        except Exception as e:
            return {'statusCode': 500, 'headers': HEADERS,
                    'body': json.dumps({'error': str(e)}), 'isBase64Encoded': False}

        return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps({
            'success': True,
            'webhook_url': WEBHOOK_URL,
            'telegram_response': result,
        }), 'isBase64Encoded': False}

    try:
        update = json.loads(event.get('body') or '{}')
    except Exception:
        update = {}

    message = update.get('message') or {}
    text = str(message.get('text', '')).strip()
    chat = message.get('chat') or {}
    chat_id = str(chat.get('id', ''))
    username = message.get('from', {}).get('username')

    if not chat_id or not text.startswith('/start'):
        return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps({'ok': True}), 'isBase64Encoded': False}

    parts = text.split(maxsplit=1)
    code = parts[1].strip() if len(parts) > 1 else ''

    if not code:
        send_telegram(chat_id, '👋 Привет! Чтобы подключить уведомления, открой профиль в приложении казино и нажми «Подключить Telegram».')
        return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps({'ok': True}), 'isBase64Encoded': False}

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()

    cur.execute("SELECT id FROM users WHERE telegram_link_code = %s", (code,))
    row = cur.fetchone()

    if not row:
        send_telegram(chat_id, '⚠️ Код недействителен или устарел. Получи новую ссылку в профиле приложения.')
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps({'ok': True}), 'isBase64Encoded': False}

    user_id = row[0]
    cur.execute("""
        UPDATE users SET telegram_chat_id = %s, telegram_username = %s, telegram_link_code = NULL
        WHERE id = %s
    """, (chat_id, username, user_id))
    conn.commit()
    cur.close(); conn.close()

    send_telegram(chat_id, '✅ Telegram успешно подключен! Теперь я буду напоминать тебе забирать ежедневный бонус 🎁')

    return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps({'ok': True}), 'isBase64Encoded': False}