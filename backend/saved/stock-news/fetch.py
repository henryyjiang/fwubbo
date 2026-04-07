import json
import httpx
import xml.etree.ElementTree as ET
from os import environ
from datetime import datetime, timezone

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; Fwubbo/1.0)"}


def parse_pub_date(date_str):
    """Parse RSS pubDate like 'Mon, 06 Apr 2026 20:24:10 +0000' to a Unix timestamp."""
    try:
        dt = datetime.strptime(date_str.strip(), "%a, %d %b %Y %H:%M:%S %z")
        return int(dt.timestamp())
    except Exception:
        return 0


def age_label(ts, now_ts):
    diff = int(now_ts - ts)
    if diff < 3600:
        return f"{max(diff // 60, 1)}m ago"
    if diff < 86400:
        return f"{diff // 3600}h ago"
    return f"{diff // 86400}d ago"


def publisher_from_url(url):
    """Extract a short publisher name from the article URL hostname."""
    try:
        from urllib.parse import urlparse
        host = urlparse(url).hostname or ""
        # Strip www. and common suffixes for brevity
        host = host.removeprefix("www.")
        parts = host.split(".")
        return parts[0].capitalize() if parts else host
    except Exception:
        return ""


def fetch_ticker_rss(client, ticker, count):
    try:
        r = client.get(
            "https://finance.yahoo.com/rss/headline",
            params={"s": ticker},
            headers=HEADERS,
            timeout=10.0,
            follow_redirects=True,
        )
        r.raise_for_status()
        root = ET.fromstring(r.text)
        channel = root.find("channel")
        if channel is None:
            return [], "No channel in RSS"
        articles = []
        for item in channel.findall("item")[:count]:
            title = (item.findtext("title") or "").strip()
            url   = (item.findtext("link")   or "").strip()
            guid  = (item.findtext("guid")   or url).strip()
            pub   = (item.findtext("pubDate") or "").strip()
            if not title:
                continue
            articles.append({
                "ticker": ticker,
                "title": title,
                "url": url,
                "publisher": publisher_from_url(url),
                "pub_ts": parse_pub_date(pub),
                "guid": guid,
            })
        return articles, None
    except Exception as e:
        return [], str(e)


def fetch():
    config = json.loads(environ.get("FWUBBO_CONFIG", "{}"))
    tickers_raw = config.get("tickers", "AAPL,NVDA,MSFT,GOOGL,META")
    tickers = [t.strip().upper() for t in tickers_raw.split(",") if t.strip()]
    if not tickers:
        return {"status": "error", "data": {}, "notifications": [],
                "error_message": "No tickers configured"}

    news_per = max(1, min(int(config.get("news_per_ticker", 4)), 10))
    now_ts = datetime.now(timezone.utc).timestamp()

    all_articles = []
    seen_guids = set()
    errors = {}

    with httpx.Client() as client:
        for ticker in tickers:
            articles, err = fetch_ticker_rss(client, ticker, news_per)
            if err:
                errors[ticker] = err
            for a in articles:
                if a["guid"] in seen_guids:
                    continue
                seen_guids.add(a["guid"])
                all_articles.append(a)

    all_articles.sort(key=lambda a: a["pub_ts"], reverse=True)

    # Finalize: replace raw timestamp with display age, drop internal fields
    result = []
    for a in all_articles:
        result.append({
            "ticker": a["ticker"],
            "title": a["title"],
            "url": a["url"],
            "publisher": a["publisher"],
            "age": age_label(a["pub_ts"], now_ts) if a["pub_ts"] else "",
        })

    return {
        "status": "ok",
        "data": {
            "articles": result,
            "total": len(result),
            "tickers": tickers,
            "errors": errors,
        },
        "notifications": [],
    }


print(json.dumps(fetch()))
