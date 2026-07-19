import os
import json
from pywebpush import webpush, WebPushException


def send_push_to_user(cur, user_id: int, title: str, body: str, url: str = '/'):
    """
    Отправляет Web Push уведомление всем подпискам пользователя.
    Удаляет из БД подписки, которые больше недействительны (410/404).
    """
    vapid_private = os.environ.get('VAPID_PRIVATE_KEY', '')
    vapid_public = os.environ.get('VAPID_PUBLIC_KEY', '')
    if not vapid_private or not vapid_public:
        return

    cur.execute("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = %s", (user_id,))
    subs = cur.fetchall()

    payload = json.dumps({'title': title, 'body': body, 'url': url})

    for sub_id, endpoint, p256dh, auth in subs:
        subscription_info = {
            'endpoint': endpoint,
            'keys': {'p256dh': p256dh, 'auth': auth},
        }
        try:
            webpush(
                subscription_info=subscription_info,
                data=payload,
                vapid_private_key=vapid_private,
                vapid_claims={'sub': 'mailto:admin@example.com'},
            )
        except WebPushException as e:
            status = getattr(e.response, 'status_code', None) if e.response else None
            if status in (404, 410):
                cur.execute("DELETE FROM push_subscriptions WHERE id = %s", (sub_id,))
        except Exception:
            pass
