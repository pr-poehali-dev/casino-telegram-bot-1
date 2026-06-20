import json
import os
import hashlib
import secrets
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
        SELECT u.id, u.email, u.username, u.balance
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

        cur.execute("""
            INSERT INTO users (email, password_hash, username, balance)
            VALUES (%s, %s, %s, 0) RETURNING id
        """, (email, hash_password(password), username))
        user_id = cur.fetchone()[0]

        session_token = secrets.token_hex(32)
        cur.execute("INSERT INTO sessions (user_id, token) VALUES (%s, %s)", (user_id, session_token))
        conn.commit(); cur.close(); conn.close()

        return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps({
            'token': session_token,
            'user': {'id': user_id, 'email': email, 'username': username, 'balance': 0}
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
        conn.commit(); cur.close(); conn.close()

        return {'statusCode': 200, 'headers': HEADERS, 'body': json.dumps({
            'token': session_token,
            'user': {'id': user[0], 'email': user[1], 'username': user[2], 'balance': float(user[3])}
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
            'user': {'id': user[0], 'email': user[1], 'username': user[2], 'balance': float(user[3])}
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

    cur.close(); conn.close()
    return {'statusCode': 400, 'headers': HEADERS,
            'body': json.dumps({'error': 'Unknown action'}), 'isBase64Encoded': False}
