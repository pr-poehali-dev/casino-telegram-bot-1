import json
import os
import psycopg2

HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Session-Id',
    'Content-Type': 'application/json'
}


def handler(event: dict, context) -> dict:
    """
    Проверяет статус платежа по session_id.
    GET /?session_id=xxx
    Returns: { status: 'pending'|'paid', amount: float, order_number: str }
    """
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': HEADERS, 'body': '', 'isBase64Encoded': False}

    params = event.get('queryStringParameters') or {}
    session_id = params.get('session_id') or event.get('headers', {}).get('X-Session-Id', '')

    if not session_id:
        return {'statusCode': 400, 'headers': HEADERS,
                'body': json.dumps({'error': 'session_id required'}), 'isBase64Encoded': False}

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()
    cur.execute(
        "SELECT status, amount, order_number FROM orders WHERE session_id = %s ORDER BY created_at DESC LIMIT 1",
        (session_id,)
    )
    row = cur.fetchone()
    cur.close()
    conn.close()

    if not row:
        return {'statusCode': 404, 'headers': HEADERS,
                'body': json.dumps({'error': 'order not found'}), 'isBase64Encoded': False}

    return {
        'statusCode': 200,
        'headers': HEADERS,
        'body': json.dumps({'status': row[0], 'amount': float(row[1]), 'order_number': row[2]}),
        'isBase64Encoded': False
    }
