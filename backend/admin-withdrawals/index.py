import json
import os
import psycopg2
import urllib.request
from datetime import datetime

HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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
    GET ?type=cohorts&weeks=8 — когортная аналитика (retention + депозиты по неделям регистрации)
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

        # Топ игроков по депозитам
        if data_type == 'top-depositors':
            cur.execute("""
                SELECT
                    u.id,
                    u.username,
                    u.email,
                    COUNT(o.id)                AS deposits_count,
                    COALESCE(SUM(o.amount), 0) AS total_deposited,
                    MAX(o.created_at)          AS last_deposit,
                    u.balance
                FROM users u
                JOIN orders o ON o.user_id = u.id AND o.status = 'paid'
                GROUP BY u.id, u.username, u.email, u.balance
                ORDER BY total_deposited DESC
                LIMIT 30
            """)
            rows = cur.fetchall()
            cur.close(); conn.close()
            leaders = []
            for i, row in enumerate(rows):
                leaders.append({
                    'rank': i + 1,
                    'user_id': int(row[0]),
                    'username': row[1] or '',
                    'email': row[2] or '',
                    'deposits_count': int(row[3]),
                    'total_deposited': float(row[4]),
                    'last_deposit': row[5].isoformat() if row[5] else None,
                    'balance': float(row[6]),
                })
            return {'statusCode': 200, 'headers': HEADERS,
                    'body': json.dumps({'leaders': leaders}), 'isBase64Encoded': False}

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

        # ── Когортная аналитика: удержание игроков по неделям регистрации ──
        if data_type == 'cohorts':
            weeks_back = min(int(params.get('weeks', '8')), 26)  # ограничиваем разумным диапазоном

            # Размер каждой когорты (по неделе регистрации)
            cur.execute("""
                SELECT DATE_TRUNC('week', created_at)::date AS cohort_week, COUNT(*) AS cohort_size
                FROM users
                WHERE created_at >= CURRENT_DATE - INTERVAL '%s weeks'
                GROUP BY cohort_week
                ORDER BY cohort_week ASC
            """ % weeks_back)
            cohort_sizes = {row[0]: int(row[1]) for row in cur.fetchall()}

            # Активность (сыгранные игры) каждого пользователя по неделям после регистрации
            cur.execute("""
                SELECT
                    DATE_TRUNC('week', u.created_at)::date AS cohort_week,
                    FLOOR(EXTRACT(EPOCH FROM (gh.created_at - DATE_TRUNC('week', u.created_at))) / 604800)::int AS week_offset,
                    COUNT(DISTINCT gh.user_id) AS active_users
                FROM users u
                JOIN game_history gh ON gh.user_id = u.id
                WHERE u.created_at >= CURRENT_DATE - INTERVAL '%s weeks'
                GROUP BY cohort_week, week_offset
                HAVING FLOOR(EXTRACT(EPOCH FROM (gh.created_at - DATE_TRUNC('week', u.created_at))) / 604800) >= 0
                ORDER BY cohort_week ASC, week_offset ASC
            """ % weeks_back)
            retention_rows = cur.fetchall()

            # Депозиты по когортам (сумма и кол-во депозитов по неделе регистрации)
            cur.execute("""
                SELECT
                    DATE_TRUNC('week', u.created_at)::date AS cohort_week,
                    COUNT(DISTINCT o.user_id) FILTER (WHERE o.status = 'paid') AS depositors,
                    COALESCE(SUM(o.amount) FILTER (WHERE o.status = 'paid'), 0) AS total_deposited
                FROM users u
                LEFT JOIN orders o ON o.user_id = u.id
                WHERE u.created_at >= CURRENT_DATE - INTERVAL '%s weeks'
                GROUP BY cohort_week
                ORDER BY cohort_week ASC
            """ % weeks_back)
            deposit_rows = cur.fetchall()
            deposit_map = {row[0]: {'depositors': int(row[1]), 'total_deposited': float(row[2])} for row in deposit_rows}

            cur.close(); conn.close()

            # Собираем матрицу retention: cohort_week -> { week_offset: active_users }
            max_offset = 0
            retention_map: dict = {}
            for cohort_week, week_offset, active_users in retention_rows:
                if cohort_week not in retention_map:
                    retention_map[cohort_week] = {}
                retention_map[cohort_week][week_offset] = int(active_users)
                max_offset = max(max_offset, week_offset)

            cohorts = []
            for cohort_week in sorted(cohort_sizes.keys()):
                size = cohort_sizes[cohort_week]
                weeks_data = []
                offsets_available = min(max_offset, weeks_back) + 1
                for offset in range(offsets_available):
                    active = retention_map.get(cohort_week, {}).get(offset, 0)
                    pct = round(active / size * 100, 1) if size > 0 else 0.0
                    weeks_data.append({'week_offset': offset, 'active_users': active, 'retention_pct': pct})

                dep = deposit_map.get(cohort_week, {'depositors': 0, 'total_deposited': 0.0})
                cohorts.append({
                    'cohort_week': cohort_week.isoformat(),
                    'cohort_size': size,
                    'weeks': weeks_data,
                    'depositors': dep['depositors'],
                    'total_deposited': dep['total_deposited'],
                    'deposit_rate_pct': round(dep['depositors'] / size * 100, 1) if size > 0 else 0.0,
                    'avg_deposit_per_depositor': round(dep['total_deposited'] / dep['depositors'], 2) if dep['depositors'] > 0 else 0.0,
                })

            return {'statusCode': 200, 'headers': HEADERS,
                    'body': json.dumps({'cohorts': cohorts, 'max_week_offset': max_offset}),
                    'isBase64Encoded': False}

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

        # Промокоды
        if data_type == 'promos':
            cur.execute("""
                SELECT id, code, bonus_amount, max_uses, uses_count, is_active, created_at, expires_at
                FROM promo_codes ORDER BY created_at DESC
            """)
            rows = cur.fetchall()
            cur.close(); conn.close()
            promos = []
            for r in rows:
                promos.append({
                    'id': r[0], 'code': r[1], 'bonus_amount': float(r[2]),
                    'max_uses': r[3], 'uses_count': r[4], 'is_active': r[5],
                    'created_at': r[6].isoformat() if r[6] else None,
                    'expires_at': r[7].isoformat() if r[7] else None,
                })
            return {'statusCode': 200, 'headers': HEADERS,
                    'body': json.dumps({'promos': promos}), 'isBase64Encoded': False}

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

    # ── PUT: создать/обновить промокод ──
    if method == 'PUT':
        payload = json.loads(event.get('body') or '{}')
        promo_id = payload.get('id')

        if promo_id:
            # Обновить is_active
            is_active = payload.get('is_active')
            cur.execute("UPDATE promo_codes SET is_active = %s WHERE id = %s", (is_active, promo_id))
            conn.commit(); cur.close(); conn.close()
            return {'statusCode': 200, 'headers': HEADERS,
                    'body': json.dumps({'success': True}), 'isBase64Encoded': False}
        else:
            # Создать новый
            code = (payload.get('code') or '').strip().upper()
            bonus_amount = float(payload.get('bonus_amount') or 0)
            max_uses = payload.get('max_uses') or None
            expires_at = payload.get('expires_at') or None
            if not code or bonus_amount <= 0:
                cur.close(); conn.close()
                return {'statusCode': 400, 'headers': HEADERS,
                        'body': json.dumps({'error': 'Укажите код и сумму бонуса'}), 'isBase64Encoded': False}
            cur.execute("""
                INSERT INTO promo_codes (code, bonus_amount, max_uses, expires_at)
                VALUES (%s, %s, %s, %s) RETURNING id
            """, (code, bonus_amount, max_uses, expires_at))
            new_id = cur.fetchone()[0]
            conn.commit(); cur.close(); conn.close()
            return {'statusCode': 200, 'headers': HEADERS,
                    'body': json.dumps({'success': True, 'id': new_id}), 'isBase64Encoded': False}

    # ── DELETE: удалить промокод ──
    if method == 'DELETE':
        payload = json.loads(event.get('body') or '{}')
        promo_id = payload.get('id')
        if not promo_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Укажите id'}), 'isBase64Encoded': False}
        cur.execute("DELETE FROM promo_activations WHERE promo_id = %s", (promo_id,))
        cur.execute("DELETE FROM promo_codes WHERE id = %s", (promo_id,))
        conn.commit(); cur.close(); conn.close()
        return {'statusCode': 200, 'headers': HEADERS,
                'body': json.dumps({'success': True}), 'isBase64Encoded': False}

    # ── GET type=support-chats: список всех чатов ──
    if method == 'GET' and (event.get('queryStringParameters') or {}).get('type') == 'support-chats':
        cur.execute("""
            SELECT sc.id, sc.user_id, u.username, u.email, sc.status,
                   sc.unread_admin, sc.last_message_at,
                   (SELECT text FROM support_messages sm WHERE sm.chat_id = sc.id ORDER BY sm.created_at DESC LIMIT 1) as last_text
            FROM support_chats sc
            JOIN users u ON u.id = sc.user_id
            ORDER BY sc.last_message_at DESC
            LIMIT 100
        """)
        chats = []
        for r in cur.fetchall():
            chats.append({
                'id': r[0], 'user_id': r[1], 'username': r[2] or '', 'email': r[3] or '',
                'status': r[4], 'unread_admin': r[5],
                'last_message_at': r[6].isoformat() if r[6] else None,
                'last_text': r[7] or '',
            })
        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps({'chats': chats}), 'isBase64Encoded': False}

    # ── GET type=support-messages&chat_id=N: сообщения чата ──
    if method == 'GET' and (event.get('queryStringParameters') or {}).get('type') == 'support-messages':
        chat_id = (event.get('queryStringParameters') or {}).get('chat_id')
        if not chat_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS, 'body': json.dumps({'error': 'chat_id required'}), 'isBase64Encoded': False}
        cur.execute("""
            SELECT sc.id, sc.user_id, u.username, u.email, sc.status, sc.unread_admin
            FROM support_chats sc JOIN users u ON u.id = sc.user_id WHERE sc.id = %s
        """, (chat_id,))
        chat = cur.fetchone()
        if not chat:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': HEADERS, 'body': json.dumps({'error': 'Chat not found'}), 'isBase64Encoded': False}
        cur.execute("""
            SELECT id, sender, text, created_at FROM support_messages
            WHERE chat_id = %s ORDER BY created_at ASC
        """, (chat_id,))
        msgs = [{'id': r[0], 'sender': r[1], 'text': r[2], 'created_at': r[3].isoformat()} for r in cur.fetchall()]
        # Сбросить unread_admin
        cur.execute("UPDATE support_chats SET unread_admin = 0 WHERE id = %s", (chat_id,))
        conn.commit(); cur.close(); conn.close()
        return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps({
            'chat': {'id': chat[0], 'user_id': chat[1], 'username': chat[2], 'email': chat[3], 'status': chat[4]},
            'messages': msgs
        }), 'isBase64Encoded': False}

    # ── POST type=support-reply: ответ администратора ──
    if method == 'POST':
        payload = json.loads(event.get('body') or '{}')
        if payload.get('type') == 'support-reply':
            chat_id = payload.get('chat_id')
            text = (payload.get('text') or '').strip()
            if not chat_id or not text:
                cur.close(); conn.close()
                return {'statusCode': 400, 'headers': HEADERS, 'body': json.dumps({'error': 'chat_id и text обязательны'}), 'isBase64Encoded': False}
            cur.execute("""
                INSERT INTO support_messages (chat_id, sender, text) VALUES (%s, 'admin', %s) RETURNING id, created_at
            """, (chat_id, text))
            msg = cur.fetchone()
            cur.execute("""
                UPDATE support_chats SET unread_user = unread_user + 1,
                last_message_at = NOW(), status = 'answered' WHERE id = %s
            """, (chat_id,))
            conn.commit(); cur.close(); conn.close()
            return {'statusCode': 200, 'headers': HEADERS,
                    'body': json.dumps({'success': True, 'id': msg[0], 'created_at': msg[1].isoformat()}), 'isBase64Encoded': False}

    # ── POST type=support-close: закрыть чат ──
    if method == 'POST':
        payload = json.loads(event.get('body') or '{}')
        if payload.get('type') == 'support-close':
            chat_id = payload.get('chat_id')
            cur.execute("UPDATE support_chats SET status = 'closed' WHERE id = %s", (chat_id,))
            conn.commit(); cur.close(); conn.close()
            return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps({'success': True}), 'isBase64Encoded': False}

    cur.close()
    conn.close()
    return {'statusCode': 405, 'headers': HEADERS, 'body': json.dumps({'error': 'Method not allowed'}), 'isBase64Encoded': False}