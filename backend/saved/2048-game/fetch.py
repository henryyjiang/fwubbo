import json
from os import environ


def fetch():
    return {"status": "ok", "data": {}}


print(json.dumps(fetch()))
