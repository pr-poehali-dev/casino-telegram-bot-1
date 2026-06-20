import json
import os
import hashlib
import smtplib
import urllib.request
import psycopg2
from urllib.parse import parse_qs
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


def calculate_signature(*args) -> str:
    """Создание MD5 подписи по документации Robokassa"""
    joined = ':'.join(str(arg) for arg in args)
    return hashlib.md5(joined.encode()).hexdigest().upper()


def get_db_connection():
    """Получение подключения к БД"""
    dsn = os.environ.get('DATABASE_URL')
    if not dsn:
        raise ValueError('DATABASE_URL not configured')
    return psycopg2.connect(dsn)


def send_telegram(chat_id: str, text: str):
    """Отправка сообщения в Telegram"""
    token = os.environ.get('TELEGRAM_BOT_TOKEN', '')
    if not token:
        return
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    data = json.dumps({'chat_id': chat_id, 'text': text, 'parse_mode': 'HTML'}).encode()
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception:
        pass


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


HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'text/plain'
}


def handler(event: dict, context) -> dict:
    '''
    Result URL вебхук от Robokassa для подтверждения оплаты.
    После успешной оплаты отправляет уведомления в Telegram и Email.
    Robokassa отправляет: OutSum, InvId, SignatureValue
    Returns: OK{InvId} если подпись верна и заказ обновлён
    '''
    method = event.get('httpMethod', 'GET').upper()

    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': HEADERS, 'body': '', 'isBase64Encoded': False}

    password_2 = os.environ.get('ROBOKASSA_PASSWORD_2')
    if not password_2:
        return {'statusCode': 500, 'headers': HEADERS, 'body': 'Configuration error', 'isBase64Encoded': False}

    # Парсинг параметров из body или query string
    params = {}
    body = event.get('body', '')

    if method == 'POST' and body:
        if event.get('isBase64Encoded', False):
            import base64
            body = base64.b64decode(body).decode('utf-8')
        parsed = parse_qs(body)
        params = {k: v[0] for k, v in parsed.items()}

    if not params:
        params = event.get('queryStringParameters') or {}

    out_sum = params.get('OutSum', params.get('out_summ', ''))
    inv_id = params.get('InvId', params.get('inv_id', ''))
    signature_value = params.get('SignatureValue', params.get('crc', '')).upper()

    if not out_sum or not inv_id or not signature_value:
        return {'statusCode': 400, 'headers': HEADERS, 'body': 'Missing required parameters', 'isBase64Encoded': False}

    # Проверка подписи
    expected_signature = calculate_signature(out_sum, inv_id, password_2)
    if signature_value != expected_signature:
        return {'statusCode': 400, 'headers': HEADERS, 'body': 'Invalid signature', 'isBase64Encoded': False}

    # Обновление статуса заказа
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        UPDATE orders
        SET status = 'paid', paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE robokassa_inv_id = %s AND status = 'pending'
        RETURNING id, order_number, user_email, user_name, amount
    """, (int(inv_id),))

    result = cur.fetchone()

    if not result:
        cur.execute("SELECT status FROM orders WHERE robokassa_inv_id = %s", (int(inv_id),))
        existing = cur.fetchone()
        conn.close()
        if existing and existing[0] == 'paid':
            return {'statusCode': 200, 'headers': HEADERS, 'body': f'OK{inv_id}', 'isBase64Encoded': False}
        return {'statusCode': 404, 'headers': HEADERS, 'body': 'Order not found', 'isBase64Encoded': False}

    conn.commit()
    cur.close()
    conn.close()

    order_id, order_number, user_email, user_name, amount = result
    amount_str = f"{float(amount):,.0f}".replace(',', ' ')

    # ── Уведомление владельцу в Telegram ──
    owner_chat_id = os.environ.get('TELEGRAM_OWNER_CHAT_ID', '')
    if owner_chat_id:
        tg_owner = (
            f"💰 <b>Новая оплата!</b>\n\n"
            f"👤 Игрок: {user_name} ({user_email})\n"
            f"💵 Сумма: <b>{amount_str} ₽</b>\n"
            f"🧾 Заказ: {order_number}\n"
            f"✅ Статус: Оплачено"
        )
        send_telegram(owner_chat_id, tg_owner)

    # ── Уведомление игроку в Telegram (если есть user_phone как chat_id — пропускаем) ──
    # Email игроку
    if user_email:
        email_html = f"""
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#1a1a2e;color:#fff;border-radius:16px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#f5c842,#e0a800);padding:32px;text-align:center;">
            <div style="font-size:48px;">✅</div>
            <h1 style="margin:12px 0 4px;font-size:24px;color:#1a1a2e;">Баланс пополнен!</h1>
            <p style="margin:0;color:#1a1a2e;opacity:0.8;">Платёж успешно подтверждён</p>
          </div>
          <div style="padding:32px;">
            <div style="background:#ffffff10;border-radius:12px;padding:20px;margin-bottom:20px;text-align:center;">
              <div style="font-size:36px;font-weight:bold;color:#f5c842;">{amount_str} ₽</div>
              <div style="color:#aaa;font-size:14px;margin-top:4px;">зачислено на счёт</div>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:8px 0;color:#aaa;">Игрок</td><td style="text-align:right;">{user_name}</td></tr>
              <tr><td style="padding:8px 0;color:#aaa;border-top:1px solid #ffffff15;">Заказ</td><td style="text-align:right;font-family:monospace;font-size:12px;">{order_number}</td></tr>
              <tr><td style="padding:8px 0;color:#aaa;border-top:1px solid #ffffff15;">Статус</td><td style="text-align:right;color:#4ade80;font-weight:bold;">✓ Оплачено</td></tr>
            </table>
            <p style="color:#666;font-size:12px;margin-top:24px;text-align:center;">
              Если у вас возникли вопросы — обратитесь в поддержку.
            </p>
          </div>
        </div>
        """
        send_email(user_email, f'✅ Баланс пополнен на {amount_str} ₽', email_html)

    # Email владельцу
    owner_email = os.environ.get('GMAIL_USER', '')
    if owner_email:
        owner_html = f"""
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;">
          <h2 style="color:#16a34a;">💰 Новая оплата #{order_number}</h2>
          <table style="border-collapse:collapse;width:100%;">
            <tr><td style="padding:6px 12px;background:#f9f9f9;font-weight:bold;">Игрок</td><td style="padding:6px 12px;">{user_name}</td></tr>
            <tr><td style="padding:6px 12px;background:#f9f9f9;font-weight:bold;">Email</td><td style="padding:6px 12px;">{user_email}</td></tr>
            <tr><td style="padding:6px 12px;background:#f9f9f9;font-weight:bold;">Сумма</td><td style="padding:6px 12px;font-size:20px;color:#16a34a;"><b>{amount_str} ₽</b></td></tr>
            <tr><td style="padding:6px 12px;background:#f9f9f9;font-weight:bold;">Заказ</td><td style="padding:6px 12px;font-family:monospace;">{order_number}</td></tr>
          </table>
        </div>
        """
        send_email(owner_email, f'💰 Новая оплата {amount_str} ₽ — {user_name}', owner_html)

    return {'statusCode': 200, 'headers': HEADERS, 'body': f'OK{inv_id}', 'isBase64Encoded': False}
