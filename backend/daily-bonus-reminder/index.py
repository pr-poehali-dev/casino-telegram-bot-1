import json
import os
import urllib.request
import psycopg2
from push_utils import send_push_to_user

HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Cron-Secret',
    'Content-Type': 'application/json'
}

REMINDER_TEXT = (
    "🎁 <b>Не забудь про ежедневный бонус!</b>\n\n"
    "Он ещё не забран сегодня — зайди в приложение и получи свою награду, "
    "чтобы не потерять серию 🔥"
)


def send_telegram(chat_id: str, text: str) -> bool:
    token = os.environ.get('TELEGRAM_BOT_TOKEN', '')
    if not token or not chat_id:
        return False
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    data = json.dumps({'chat_id': chat_id, 'text': text, 'parse_mode': 'HTML'}).encode()
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    try:
        urllib.request.urlopen(req, timeout=10)
        return True
    except Exception:
        return False


def handler(event: dict, context) -> dict:
    """
    Рассылка Telegram-напоминаний о ежедневном бонусе.
    Предназначена для вызова внешним планировщиком (например cron-job.org)
    один раз в день. Находит пользователей, у которых подключён Telegram
    и которые ещё не забирали ежедневный бонус сегодня (или не получали
    напоминание сегодня), и отправляет им сообщение.

    POST/GET с заголовком X-Cron-Secret: <CRON_SECRET> — запускает рассылку.
    """
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': HEADERS, 'body': '', 'isBase64Encoded': False}

    cron_secret = os.environ.get('CRON_SECRET', '')
    provided = (event.get('headers') or {}).get('X-Cron-Secret') or \
               (event.get('headers') or {}).get('x-cron-secret', '')
    if cron_secret and provided != cron_secret:
        return {'statusCode': 401, 'headers': HEADERS,
                'body': json.dumps({'error': 'Неверный секрет'}), 'isBase64Encoded': False}

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()

    # ── Telegram-напоминания ──
    cur.execute("""
        SELECT id, telegram_chat_id
        FROM users
        WHERE telegram_chat_id IS NOT NULL
          AND (last_daily_bonus IS NULL OR last_daily_bonus < CURRENT_DATE)
          AND (daily_reminder_sent_at IS NULL OR daily_reminder_sent_at::date < CURRENT_DATE)
    """)
    tg_rows = cur.fetchall()

    tg_sent = 0
    for user_id, chat_id in tg_rows:
        if send_telegram(chat_id, REMINDER_TEXT):
            tg_sent += 1
            cur.execute("UPDATE users SET daily_reminder_sent_at = NOW() WHERE id = %s", (user_id,))

    # ── Push-напоминания (браузер) ──
    cur.execute("""
        SELECT DISTINCT u.id
        FROM users u
        JOIN push_subscriptions ps ON ps.user_id = u.id
        WHERE (u.last_daily_bonus IS NULL OR u.last_daily_bonus < CURRENT_DATE)
          AND (u.push_reminder_sent_at IS NULL OR u.push_reminder_sent_at::date < CURRENT_DATE)
    """)
    push_rows = cur.fetchall()

    push_sent = 0
    for (user_id,) in push_rows:
        send_push_to_user(
            cur, user_id,
            title='🎁 Не забудь про ежедневный бонус!',
            body='Он ещё не забран сегодня — зайди и получи награду',
            url='/',
        )
        push_sent += 1
        cur.execute("UPDATE users SET push_reminder_sent_at = NOW() WHERE id = %s", (user_id,))

    conn.commit()
    cur.close(); conn.close()

    return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps({
        'success': True,
        'telegram_candidates': len(tg_rows),
        'telegram_sent': tg_sent,
        'push_candidates': len(push_rows),
        'push_sent': push_sent,
    }), 'isBase64Encoded': False}