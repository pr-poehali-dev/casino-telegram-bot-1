import json
import os
import psycopg2

HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
    'Content-Type': 'application/json'
}


def check_auth(event: dict) -> bool:
    password = os.environ.get('ADMIN_PASSWORD', '')
    if not password:
        return False
    provided = event.get('headers', {}).get('X-Admin-Password', '')
    return provided == password


def test_to_dict(row) -> dict:
    return {
        'id': row[0], 'name': row[1], 'description': row[2] or '',
        'test_type': row[3], 'status': row[4],
        'variant_a_label': row[5], 'variant_a_value': float(row[6]),
        'variant_b_label': row[7], 'variant_b_value': float(row[8]),
        'traffic_split': row[9],
        'created_at': row[10].isoformat() if row[10] else None,
        'started_at': row[11].isoformat() if row[11] else None,
        'stopped_at': row[12].isoformat() if row[12] else None,
    }


def handler(event: dict, context) -> dict:
    """
    Управление A/B тестами акций из админ-панели (требует X-Admin-Password).
    GET  / — список тестов с агрегированными результатами
    GET  ?id=N — детали одного теста
    POST / — создать тест { name, description, test_type, variant_a_label, variant_a_value,
                            variant_b_label, variant_b_value, traffic_split }
    PUT  / — обновить статус { id, status } (draft -> running -> stopped)
    DELETE / — удалить тест { id } (только если ещё draft, без участников)
    """
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': HEADERS, 'body': '', 'isBase64Encoded': False}

    if not check_auth(event):
        return {'statusCode': 401, 'headers': HEADERS,
                'body': json.dumps({'error': 'Неверный пароль'}), 'isBase64Encoded': False}

    method = event.get('httpMethod', 'GET').upper()
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()

    # ── GET: список тестов или один тест с результатами ──
    if method == 'GET':
        params = event.get('queryStringParameters') or {}
        test_id = params.get('id')

        if test_id:
            cur.execute("""
                SELECT id, name, description, test_type, status,
                       variant_a_label, variant_a_value, variant_b_label, variant_b_value,
                       traffic_split, created_at, started_at, stopped_at
                FROM ab_tests WHERE id = %s
            """, (test_id,))
            row = cur.fetchone()
            if not row:
                cur.close(); conn.close()
                return {'statusCode': 404, 'headers': HEADERS,
                        'body': json.dumps({'error': 'Тест не найден'}), 'isBase64Encoded': False}
            test = test_to_dict(row)

            # Результаты по вариантам: участники, конверсии, сумма
            cur.execute("""
                SELECT variant,
                       COUNT(*) AS participants,
                       COUNT(*) FILTER (WHERE converted) AS conversions,
                       COALESCE(SUM(conversion_value), 0) AS total_value
                FROM ab_test_assignments WHERE test_id = %s
                GROUP BY variant
            """, (test_id,))
            variants = {}
            for r in cur.fetchall():
                participants = int(r[1])
                conversions = int(r[2])
                variants[r[0]] = {
                    'participants': participants,
                    'conversions': conversions,
                    'conversion_rate': round(conversions / participants * 100, 2) if participants > 0 else 0.0,
                    'total_value': float(r[3]),
                    'avg_value': round(float(r[3]) / conversions, 2) if conversions > 0 else 0.0,
                }
            cur.close(); conn.close()
            test['results'] = {
                'A': variants.get('A', {'participants': 0, 'conversions': 0, 'conversion_rate': 0.0, 'total_value': 0.0, 'avg_value': 0.0}),
                'B': variants.get('B', {'participants': 0, 'conversions': 0, 'conversion_rate': 0.0, 'total_value': 0.0, 'avg_value': 0.0}),
            }
            return {'statusCode': 200, 'headers': HEADERS,
                    'body': json.dumps({'test': test}), 'isBase64Encoded': False}

        # Список всех тестов + краткие агрегаты
        cur.execute("""
            SELECT id, name, description, test_type, status,
                   variant_a_label, variant_a_value, variant_b_label, variant_b_value,
                   traffic_split, created_at, started_at, stopped_at
            FROM ab_tests ORDER BY created_at DESC
        """)
        rows = cur.fetchall()
        tests = [test_to_dict(r) for r in rows]

        if tests:
            cur.execute("""
                SELECT test_id, variant,
                       COUNT(*) AS participants,
                       COUNT(*) FILTER (WHERE converted) AS conversions,
                       COALESCE(SUM(conversion_value), 0) AS total_value
                FROM ab_test_assignments
                WHERE test_id = ANY(%s)
                GROUP BY test_id, variant
            """, ([t['id'] for t in tests],))
            agg_map: dict = {}
            for r in cur.fetchall():
                agg_map.setdefault(r[0], {})[r[1]] = {
                    'participants': int(r[2]),
                    'conversions': int(r[3]),
                    'conversion_rate': round(int(r[3]) / int(r[2]) * 100, 2) if int(r[2]) > 0 else 0.0,
                    'total_value': float(r[4]),
                }
            for t in tests:
                variants = agg_map.get(t['id'], {})
                t['results'] = {
                    'A': variants.get('A', {'participants': 0, 'conversions': 0, 'conversion_rate': 0.0, 'total_value': 0.0}),
                    'B': variants.get('B', {'participants': 0, 'conversions': 0, 'conversion_rate': 0.0, 'total_value': 0.0}),
                }

        cur.close(); conn.close()
        return {'statusCode': 200, 'headers': HEADERS,
                'body': json.dumps({'tests': tests}), 'isBase64Encoded': False}

    # ── POST: создать тест ──
    if method == 'POST':
        payload = json.loads(event.get('body') or '{}')
        name = str(payload.get('name', '')).strip()
        if not name:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Укажите название теста'}), 'isBase64Encoded': False}

        test_type = str(payload.get('test_type', 'first_deposit_bonus'))
        description = str(payload.get('description', ''))
        variant_a_label = str(payload.get('variant_a_label', 'A')) or 'A'
        variant_b_label = str(payload.get('variant_b_label', 'B')) or 'B'
        try:
            variant_a_value = float(payload.get('variant_a_value', 100))
            variant_b_value = float(payload.get('variant_b_value', 150))
            traffic_split = int(payload.get('traffic_split', 50))
        except (TypeError, ValueError):
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Некорректные числовые значения'}), 'isBase64Encoded': False}

        traffic_split = max(1, min(99, traffic_split))

        # Только один активный тест на тип одновременно — иначе результаты смешаются
        if test_type == 'first_deposit_bonus':
            cur.execute("""
                SELECT COUNT(*) FROM ab_tests WHERE test_type = %s AND status = 'running'
            """, (test_type,))
            if cur.fetchone()[0] > 0:
                cur.close(); conn.close()
                return {'statusCode': 400, 'headers': HEADERS,
                        'body': json.dumps({'error': 'Уже есть активный тест этого типа. Останови его перед созданием нового.'}),
                        'isBase64Encoded': False}

        cur.execute("""
            INSERT INTO ab_tests (name, description, test_type, variant_a_label, variant_a_value,
                                  variant_b_label, variant_b_value, traffic_split)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id
        """, (name, description, test_type, variant_a_label, variant_a_value,
              variant_b_label, variant_b_value, traffic_split))
        new_id = cur.fetchone()[0]
        conn.commit(); cur.close(); conn.close()
        return {'statusCode': 200, 'headers': HEADERS,
                'body': json.dumps({'success': True, 'id': new_id}), 'isBase64Encoded': False}

    # ── PUT: изменить статус (draft -> running -> stopped) ──
    if method == 'PUT':
        payload = json.loads(event.get('body') or '{}')
        test_id = payload.get('id')
        new_status = str(payload.get('status', ''))
        if not test_id or new_status not in ('draft', 'running', 'stopped'):
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Некорректные параметры'}), 'isBase64Encoded': False}

        if new_status == 'running':
            cur.execute("SELECT test_type FROM ab_tests WHERE id = %s", (test_id,))
            row = cur.fetchone()
            if not row:
                cur.close(); conn.close()
                return {'statusCode': 404, 'headers': HEADERS,
                        'body': json.dumps({'error': 'Тест не найден'}), 'isBase64Encoded': False}
            cur.execute("""
                SELECT COUNT(*) FROM ab_tests WHERE test_type = %s AND status = 'running' AND id != %s
            """, (row[0], test_id))
            if cur.fetchone()[0] > 0:
                cur.close(); conn.close()
                return {'statusCode': 400, 'headers': HEADERS,
                        'body': json.dumps({'error': 'Уже есть активный тест этого типа'}), 'isBase64Encoded': False}
            cur.execute("""
                UPDATE ab_tests SET status = 'running', started_at = NOW() WHERE id = %s
            """, (test_id,))
        elif new_status == 'stopped':
            cur.execute("UPDATE ab_tests SET status = 'stopped', stopped_at = NOW() WHERE id = %s", (test_id,))
        else:
            cur.execute("UPDATE ab_tests SET status = %s WHERE id = %s", (new_status, test_id))

        conn.commit(); cur.close(); conn.close()
        return {'statusCode': 200, 'headers': HEADERS,
                'body': json.dumps({'success': True}), 'isBase64Encoded': False}

    # ── DELETE: удалить тест (только draft без участников) ──
    if method == 'DELETE':
        payload = json.loads(event.get('body') or '{}')
        test_id = payload.get('id')
        if not test_id:
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'id обязателен'}), 'isBase64Encoded': False}

        cur.execute("SELECT status FROM ab_tests WHERE id = %s", (test_id,))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return {'statusCode': 404, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Тест не найден'}), 'isBase64Encoded': False}
        if row[0] != 'draft':
            cur.close(); conn.close()
            return {'statusCode': 400, 'headers': HEADERS,
                    'body': json.dumps({'error': 'Можно удалить только тест в статусе «черновик»'}),
                    'isBase64Encoded': False}

        cur.execute("DELETE FROM ab_tests WHERE id = %s", (test_id,))
        conn.commit(); cur.close(); conn.close()
        return {'statusCode': 200, 'headers': HEADERS,
                'body': json.dumps({'success': True}), 'isBase64Encoded': False}

    cur.close(); conn.close()
    return {'statusCode': 405, 'headers': HEADERS,
            'body': json.dumps({'error': 'Method not allowed'}), 'isBase64Encoded': False}
