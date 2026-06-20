import json
import os
import psycopg2
import urllib.request
from datetime import datetime

HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
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


def check_auth(event: dict) -> bool:
    password = os.environ.get('ADMIN_PASSWORD', '')
    if not password:
        return False
    provided = event.get('headers', {}).get('X-Admin-Password', '')
    return provided == password


def handler(event: dict, context) -> dict:
    """
    Админ-панель: список заявок на вывод и смена статуса.
    GET / — список всех заявок (требует X-Admin-Password)
    POST / — смена статуса { withdrawal_id, status } (требует X-Admin-Password)
    """
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': HEADERS, 'body': '', 'isBase64Encoded': False}

    if not check_auth(event):
        return {'statusCode': 401, 'headers': HEADERS,
                'body': json.dumps({'error': 'Неверный пароль'}), 'isBase64Encoded': False}

    method = event.get('httpMethod', 'GET').upper()
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()

    # ── GET: список заявок ──
    if method == 'GET':
        params = event.get('queryStringParameters') or {}
        status_filter = params.get('status', '')
        data_type = params.get('type', 'withdrawals')

        # График пополнений по дням
        if data_type == 'chart':
            days = int(params.get('days', '30'))
            cur.execute("""
                SELECT
                    DATE(created_at) AS day,
                    COUNT(*) FILTER (WHERE status = 'paid') AS deposits_count,
                    COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) AS deposits_sum
                FROM orders
                WHERE created_at >= CURRENT_DATE - INTERVAL '%s days'
                GROUP BY DATE(created_at)
                ORDER BY day ASC
            """ % days)
            rows = cur.fetchall()
            cur.execute("""
                SELECT
                    DATE(created_at) AS day,
                    COUNT(*) AS wd_count,
                    COALESCE(SUM(amount), 0) AS wd_sum
                FROM withdrawals
                WHERE created_at >= CURRENT_DATE - INTERVAL '%s days'
                GROUP BY DATE(created_at)
                ORDER BY day ASC
            """ % days)
            wd_rows = cur.fetchall()
            cur.close(); conn.close()

            # Объединяем по дате
            chart_map = {}
            for row in rows:
                d = row[0].strftime('%d.%m')
                chart_map[d] = {'date': d, 'deposits': float(row[2]), 'deposits_count': int(row[1]), 'withdrawals': 0.0, 'wd_count': 0}
            for row in wd_rows:
                d = row[0].strftime('%d.%m')
                if d not in chart_map:
                    chart_map[d] = {'date': d, 'deposits': 0.0, 'deposits_count': 0, 'withdrawals': 0.0, 'wd_count': 0}
                chart_map[d]['withdrawals'] = float(row[2])
                chart_map[d]['wd_count'] = int(row[1])

            chart = sorted(chart_map.values(), key=lambda x: x['date'])
            return {'statusCode': 200, 'headers': HEADERS,
                    'body': json.dumps({'chart': chart}), 'isBase64Encoded': False}

        # Сводная статистика
        if data_type == 'stats':
            cur.execute("""
                SELECT
                    COUNT(*) FILTER (WHERE status = 'paid')                          AS orders_total_count,
                    COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0)          AS orders_total_sum,
                    COUNT(*) FILTER (WHERE status = 'paid' AND DATE(created_at) = CURRENT_DATE)       AS orders_today_count,
                    COALESCE(SUM(amount) FILTER (WHERE status = 'paid' AND DATE(created_at) = CURRENT_DATE), 0) AS orders_today_sum
                FROM orders
            """)
            o = cur.fetchone()
            cur.execute("""
                SELECT
                    COUNT(*)                                                          AS wd_total_count,
                    COALESCE(SUM(amount), 0)                                         AS wd_total_sum,
                    COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE)          AS wd_today_count,
                    COALESCE(SUM(amount) FILTER (WHERE DATE(created_at) = CURRENT_DATE), 0) AS wd_today_sum,
                    COUNT(*) FILTER (WHERE status = 'pending')                       AS wd_pending_count
                FROM withdrawals
            """)
            w = cur.fetchone()
            cur.close()
            conn.close()
            return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps({
                'orders_total_count':  int(o[0]),
                'orders_total_sum':    float(o[1]),
                'orders_today_count':  int(o[2]),
                'orders_today_sum':    float(o[3]),
                'wd_total_count':      int(w[0]),
                'wd_total_sum':        float(w[1]),
                'wd_today_count':      int(w[2]),
                'wd_today_sum':        float(w[3]),
                'wd_pending_count':    int(w[4]),
            }), 'isBase64Encoded': False}

        # Пополнения (orders)
        if data_type == 'orders':
            if status_filter:
                cur.execute("""
                    SELECT id, order_number, user_name, user_email,
                           order_comment, amount, status, created_at, paid_at
                    FROM orders WHERE status = %s ORDER BY created_at DESC LIMIT 100
                """, (status_filter,))
            else:
                cur.execute("""
                    SELECT id, order_number, user_name, user_email,
                           order_comment, amount, status, created_at, paid_at
                    FROM orders ORDER BY created_at DESC LIMIT 100
                """)
            rows = cur.fetchall()
            cur.close()
            conn.close()
            orders = []
            for row in rows:
                orders.append({
                    'id': row[0],
                    'order_number': row[1],
                    'user_name': row[2] or '',
                    'user_email': row[3] or '',
                    'order_comment': row[4] or '',
                    'amount': float(row[5]),
                    'status': row[6],
                    'created_at': row[7].isoformat() if row[7] else '',
                    'paid_at': row[8].isoformat() if row[8] else '',
                })
            return {'statusCode': 200, 'headers': HEADERS,
                    'body': json.dumps({'orders': orders}), 'isBase64Encoded': False}

        # Выводы (withdrawals)
        if status_filter:
            cur.execute("""
                SELECT id, request_number, user_name, user_email, user_telegram,
                       method, destination, amount, status, created_at
                FROM withdrawals WHERE status = %s ORDER BY created_at DESC LIMIT 100
            """, (status_filter,))
        else:
            cur.execute("""
                SELECT id, request_number, user_name, user_email, user_telegram,
                       method, destination, amount, status, created_at
                FROM withdrawals ORDER BY created_at DESC LIMIT 100
            """)
        rows = cur.fetchall()
        cur.close()
        conn.close()

        withdrawals = []
        for row in rows:
            withdrawals.append({
                'id': row[0],
                'request_number': row[1],
                'user_name': row[2] or '',
                'user_email': row[3] or '',
                'user_telegram': row[4] or '',
                'method': row[5],
                'destination': row[6],
                'amount': float(row[7]),
                'status': row[8],
                'created_at': row[9].isoformat() if row[9] else '',
            })
        return {'statusCode': 200, 'headers': HEADERS,
                'body': json.dumps({'withdrawals': withdrawals}), 'isBase64Encoded': False}

    # ── POST: смена статуса ──
    if method == 'POST':
        payload = json.loads(event.get('body') or '{}')
        withdrawal_id = payload.get('withdrawal_id')
        new_status = payload.get('status', '')

        ALLOWED = ('pending', 'processing', 'paid', 'rejected')
        if new_status not in ALLOWED:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': f'Статус должен быть одним из: {", ".join(ALLOWED)}'}),
                    'isBase64Encoded': False}

        cur.execute("""
            UPDATE withdrawals SET status = %s, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            RETURNING id, request_number, user_name, user_telegram, amount, method
        """, (new_status, withdrawal_id))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Заявка не найдена'}), 'isBase64Encoded': False}
        conn.commit()
        cur.close()
        conn.close()

        _, request_number, user_name, user_telegram, amount, method_name = row
        amount_str = f"{float(amount):,.0f}".replace(',', ' ')

        STATUS_LABELS = {
            'pending': '⏳ На рассмотрении',
            'processing': '🔄 В обработке',
            'paid': '✅ Выплачено',
            'rejected': '❌ Отклонено',
        }

        # Уведомление игроку в Telegram если указан username
        if user_telegram:
            tg_text = (
                f"📋 <b>Статус заявки обновлён</b>\n\n"
                f"Заявка: {request_number}\n"
                f"Сумма: <b>{amount_str} ₽</b>\n"
                f"Метод: {method_name}\n"
                f"Статус: {STATUS_LABELS.get(new_status, new_status)}"
            )
            send_telegram(f"@{user_telegram}", tg_text)

        return {'statusCode': 200, 'headers': HEADERS,
                'body': json.dumps({'success': True, 'status': new_status}),
                'isBase64Encoded': False}

    cur.close()
    conn.close()
    return {'statusCode': 405, 'headers': HEADERS, 'body': json.dumps({'error': 'Method not allowed'}), 'isBase64Encoded': False}