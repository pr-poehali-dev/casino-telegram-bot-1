import json
import os
import smtplib
import urllib.request
import psycopg2
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
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

WEEKEND_PROMO_TG_TEXT = (
    "🎉 <b>Акция выходного дня!</b>\n\n"
    "Всю субботу и воскресенье кешбэк с проигрышей начисляется <b>x2</b> "
    "по твоему VIP-уровню. Заходи и играй с двойной выгодой! 🔥"
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


def send_email(to: str, subject: str, html: str) -> bool:
    gmail_user = os.environ.get('GMAIL_USER', '')
    gmail_pass = os.environ.get('GMAIL_APP_PASSWORD', '')
    if not gmail_user or not gmail_pass or not to:
        return False
    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From'] = f'Casino Notifications <{gmail_user}>'
    msg['To'] = to
    msg.attach(MIMEText(html, 'html', 'utf-8'))
    try:
        with smtplib.SMTP_SSL('smtp.gmail.com', 465, timeout=10) as server:
            server.login(gmail_user, gmail_pass)
            server.sendmail(gmail_user, to, msg.as_string())
        return True
    except Exception:
        return False


def daily_bonus_email_html() -> str:
    return """
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#151521;color:#fff;border-radius:16px;">
      <h2 style="color:#f5c842;margin-top:0;">🎁 Не забудь про ежедневный бонус!</h2>
      <p style="color:#bbb;font-size:14px;">Он ещё не забран сегодня. Зайди в приложение и получи свою награду, чтобы не потерять серию 🔥</p>
    </div>
    """


def weekend_promo_email_html(cashback_multiplier: int) -> str:
    return f"""
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#151521;color:#fff;border-radius:16px;">
      <h2 style="color:#f5c842;margin-top:0;">🎉 Акция выходного дня!</h2>
      <p style="color:#bbb;font-size:14px;">Всю субботу и воскресенье кешбэк с проигрышей начисляется
      <b style="color:#f5c842;">x{cashback_multiplier}</b> по твоему VIP-уровню.</p>
      <p style="color:#888;font-size:13px;">Заходи и играй с двойной выгодой!</p>
    </div>
    """


def handler(event: dict, context) -> dict:
    """
    Рассылка напоминаний и акций игрокам (Telegram / Push / Email).
    Предназначена для вызова внешним планировщиком (например cron-job.org).

    Без параметров — ежедневное напоминание про несобранный ежедневный бонус
    (всем каналам: Telegram, push, email — если подключены/подтверждены).

    ?type=weekend-promo — разовая рассылка анонса акции выходного дня
    (кешбэк x2 в сб/вс). Предполагается вызов один раз в пятницу утром.

    POST/GET с заголовком X-Cron-Secret: <CRON_SECRET> — обязателен для запуска.
    """
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': HEADERS, 'body': '', 'isBase64Encoded': False}

    cron_secret = os.environ.get('CRON_SECRET', '')
    provided = (event.get('headers') or {}).get('X-Cron-Secret') or \
               (event.get('headers') or {}).get('x-cron-secret', '')
    if cron_secret and provided != cron_secret:
        return {'statusCode': 401, 'headers': HEADERS,
                'body': json.dumps({'error': 'Неверный секрет'}), 'isBase64Encoded': False}

    params = event.get('queryStringParameters') or {}
    reminder_type = params.get('type', 'daily-bonus')

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()

    # ══ Акция выходного дня — разовый анонс (пятница утром) ══
    if reminder_type == 'weekend-promo':
        cashback_multiplier = 2

        cur.execute("""
            SELECT id, telegram_chat_id, email, email_verified
            FROM users
            WHERE (weekend_promo_sent_at IS NULL OR weekend_promo_sent_at::date < CURRENT_DATE)
              AND (telegram_chat_id IS NOT NULL OR email_verified = TRUE
                   OR id IN (SELECT DISTINCT user_id FROM push_subscriptions))
        """)
        rows = cur.fetchall()

        tg_sent = email_sent = push_sent = 0
        for user_id, chat_id, email, email_verified in rows:
            notified = False
            if chat_id and send_telegram(chat_id, WEEKEND_PROMO_TG_TEXT):
                tg_sent += 1
                notified = True
            if email_verified and email and send_email(
                email, '🎉 Акция выходного дня — кешбэк x2!', weekend_promo_email_html(cashback_multiplier)
            ):
                email_sent += 1
                notified = True
            send_push_to_user(
                cur, user_id,
                title='🎉 Акция выходного дня!',
                body=f'Кешбэк x{cashback_multiplier} в сб/вс — заходи играть',
                url='/',
            )
            push_sent += 1
            notified = True

            if notified:
                cur.execute("UPDATE users SET weekend_promo_sent_at = NOW() WHERE id = %s", (user_id,))

        conn.commit()
        cur.close(); conn.close()

        return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps({
            'success': True,
            'candidates': len(rows),
            'telegram_sent': tg_sent,
            'email_sent': email_sent,
            'push_sent': push_sent,
        }), 'isBase64Encoded': False}

    # ══ Ежедневное напоминание про несобранный бонус ══
    # ── Telegram ──
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

    # ── Push (браузер) ──
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

    # ── Email (только с подтверждённым email) ──
    cur.execute("""
        SELECT id, email
        FROM users
        WHERE email_verified = TRUE
          AND (last_daily_bonus IS NULL OR last_daily_bonus < CURRENT_DATE)
          AND (email_reminder_sent_at IS NULL OR email_reminder_sent_at::date < CURRENT_DATE)
    """)
    email_rows = cur.fetchall()

    email_sent = 0
    for user_id, email in email_rows:
        if send_email(email, '🎁 Не забудь про ежедневный бонус!', daily_bonus_email_html()):
            email_sent += 1
            cur.execute("UPDATE users SET email_reminder_sent_at = NOW() WHERE id = %s", (user_id,))

    conn.commit()
    cur.close(); conn.close()

    return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps({
        'success': True,
        'telegram_candidates': len(tg_rows),
        'telegram_sent': tg_sent,
        'push_candidates': len(push_rows),
        'push_sent': push_sent,
        'email_candidates': len(email_rows),
        'email_sent': email_sent,
    }), 'isBase64Encoded': False}
