import json
from datetime import date
from os import environ


def fetch():
    config = json.loads(environ.get("FWUBBO_CONFIG", "{}"))
    try:
        mm = int(config.get("mm", 12))
        dd = int(config.get("dd", 25))
        yyyy = int(config.get("yyyy", 2026))

        target = date(yyyy, mm, dd)
        today = date.today()
        delta = (target - today).days

        return {
            "status": "ok",
            "data": {
                "days_remaining": delta,
                "target_date": target.strftime("%-m/%-d/%Y"),
            },
        }
    except Exception as e:
        return {"status": "error", "data": {"message": str(e)}}


print(json.dumps(fetch()))
