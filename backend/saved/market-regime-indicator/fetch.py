"""
Market Regime Indicator — daily quant classifier for QQQ.

Indicators (all scored -2 to +2):
  Technical: MACD, SMA50 deviation, SMA200 deviation, 50/200 cross, VIX, HY OAS, RSI (14)
  Sentiment: Claude Haiku on past-24h and past-7d financial news

Composite = weighted average of active indicator scores → [-2, +2]
Regime thresholds: Strong Sell < -1.2 < Sell < -0.4 < Hold < 0.4 < Buy < 1.2 < Strong Buy
"""

import json
import re
import math
import time
from datetime import datetime, timezone, timedelta
from os import environ

import httpx
import anthropic


# ── constants ──────────────────────────────────────────────────────────────────

YAHOO_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"

DEFAULT_WEIGHTS = {
    "sentiment_day":  2.5,
    "sentiment_week": 2.0,
    "vix":            1.5,
    "hy_oas":         1.5,
    "cross":          1.5,
    "sma50":          1.0,
    "sma200":         1.0,
    "rsi":            1.0,
    "macd":           0.5,
}

NEWS_FEEDS = [
    "https://finance.yahoo.com/rss/headline?s=QQQ",
    "https://finance.yahoo.com/rss/headline?s=SPY",
    "https://finance.yahoo.com/rss/topfinstories",
]


# ── data fetching ──────────────────────────────────────────────────────────────

def fetch_yahoo_closes(ticker: str, days: int = 260) -> list:
    """Daily close prices from Yahoo Finance v8 chart API."""
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
    params = {"range": f"{days}d", "interval": "1d", "events": "history"}
    headers = {"User-Agent": YAHOO_UA, "Accept": "application/json"}
    resp = httpx.get(url, params=params, headers=headers, timeout=15.0)
    resp.raise_for_status()
    raw = resp.json()["chart"]["result"][0]["indicators"]["quote"][0]["close"]
    return [float(c) for c in raw if c is not None]


def fetch_fred_latest(series_id: str, api_key: str):
    """Most recent value from a FRED data series."""
    resp = httpx.get(
        "https://api.stlouisfed.org/fred/series/observations",
        params={
            "series_id": series_id,
            "api_key": api_key,
            "file_type": "json",
            "sort_order": "desc",
            "limit": 5,
        },
        timeout=10.0,
    )
    resp.raise_for_status()
    for obs in resp.json().get("observations", []):
        val = obs.get("value", ".")
        if val != ".":
            return float(val)
    return None


def fetch_rss_titles(url: str, max_items: int = 20) -> list:
    """Article titles from an RSS feed."""
    from xml.etree import ElementTree as ET
    resp = httpx.get(url, headers={"User-Agent": YAHOO_UA}, timeout=12.0, follow_redirects=True)
    resp.raise_for_status()
    root = ET.fromstring(resp.text)
    titles = []
    for item in root.findall(".//item"):
        el = item.find("title")
        if el is not None and el.text:
            titles.append(el.text.strip())
        if len(titles) >= max_items:
            break
    return titles


def fetch_newsapi(api_key: str, days_back: int, max_articles: int = 40) -> list:
    """Articles from NewsAPI (requires free key from newsapi.org)."""
    from_dt = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime("%Y-%m-%dT%H:%M:%SZ")
    resp = httpx.get(
        "https://newsapi.org/v2/everything",
        params={
            "q": "stock market OR S&P 500 OR QQQ OR NASDAQ OR Federal Reserve OR recession OR inflation",
            "from": from_dt,
            "language": "en",
            "sortBy": "relevancy",
            "pageSize": max_articles,
            "apiKey": api_key,
        },
        timeout=15.0,
    )
    resp.raise_for_status()
    out = []
    for a in resp.json().get("articles", []):
        title = a.get("title", "")
        desc = a.get("description", "") or ""
        if title and not title.startswith("[Removed]"):
            out.append(f"{title}. {desc[:200]}" if desc else title)
    return out[:max_articles]


def collect_articles(newsapi_key: str, days_back: int) -> tuple:
    """Collect news headlines, preferring NewsAPI and falling back to RSS."""
    texts = []
    source = "rss"

    if newsapi_key:
        try:
            texts = fetch_newsapi(newsapi_key, days_back)
            source = "newsapi"
        except Exception:
            pass

    if len(texts) < 10:
        for feed in NEWS_FEEDS:
            try:
                texts.extend(fetch_rss_titles(feed, 20))
            except Exception:
                continue
        # Deduplicate
        seen = set()
        unique = []
        for t in texts:
            if t not in seen:
                seen.add(t)
                unique.append(t)
        texts = unique
        source = "rss"

    return texts[:50], source


# ── sentiment analysis (Claude Haiku as FinBERT-style classifier) ─────────────

def analyze_sentiment(articles: list, period_label: str, api_key: str) -> dict:
    """
    Classify aggregate financial news sentiment on a -1 to +1 scale.
    Uses Claude Haiku for fast, cost-effective classification.
    """
    if not articles:
        return {"score": 0.0, "label": "neutral", "summary": "No articles", "article_count": 0}

    sample = articles[:35]
    headlines_text = "\n".join(f"• {a[:280]}" for a in sample)

    prompt = (
        f"You are a quantitative financial sentiment analyst. "
        f"Classify the AGGREGATE market sentiment from these {len(sample)} financial headlines "
        f"({period_label}) for US equities. Consider macro themes: Fed policy, recession risk, "
        f"earnings, credit conditions, geopolitical risk.\n\n"
        f"Scale: -1.0 (strongly bearish) to +1.0 (strongly bullish)\n"
        f"  -1.0 to -0.6: very bearish (panic, systemic risk)\n"
        f"  -0.6 to -0.2: bearish (elevated risk, negative macro)\n"
        f"  -0.2 to +0.2: neutral (mixed signals)\n"
        f"  +0.2 to +0.6: bullish (positive momentum)\n"
        f"  +0.6 to +1.0: very bullish (strong risk-on catalysts)\n\n"
        f"Headlines:\n{headlines_text}\n\n"
        f"Return ONLY valid JSON, nothing else:\n"
        f'{{\"score\": <float -1.0 to 1.0>, \"label\": \"<very bearish|bearish|neutral|bullish|very bullish>\", '
        f'\"summary\": \"<one sentence dominant theme>\"}}'
    )

    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=180,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.content[0].text.strip()
    m = re.search(r'\{[^}]+\}', raw, re.DOTALL)
    if not m:
        return {"score": 0.0, "label": "neutral", "summary": "Parse error", "article_count": len(sample)}

    result = json.loads(m.group())
    # Clamp score to valid range
    result["score"] = max(-1.0, min(1.0, float(result.get("score", 0.0))))
    result["article_count"] = len(sample)
    return result


# ── technical indicators ───────────────────────────────────────────────────────

def sma(prices: list, period: int) -> float:
    n = min(period, len(prices))
    return sum(prices[-n:]) / n


def ema_series(prices: list, period: int) -> list:
    k = 2.0 / (period + 1)
    result = [prices[0]]
    for p in prices[1:]:
        result.append(p * k + result[-1] * (1.0 - k))
    return result


def compute_rsi(closes: list, period: int = 14) -> float:
    if len(closes) < period + 2:
        return 50.0
    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains = [max(0.0, d) for d in deltas]
    losses = [max(0.0, -d) for d in deltas]
    avg_g = sum(gains[:period]) / period
    avg_l = sum(losses[:period]) / period
    for i in range(period, len(gains)):
        avg_g = (avg_g * (period - 1) + gains[i]) / period
        avg_l = (avg_l * (period - 1) + losses[i]) / period
    if avg_l == 0:
        return 100.0
    return 100.0 - (100.0 / (1.0 + avg_g / avg_l))


def compute_macd(closes: list) -> tuple:
    """Returns (macd_line, signal_line)."""
    if len(closes) < 35:
        return 0.0, 0.0
    ema12 = ema_series(closes, 12)
    ema26 = ema_series(closes, 26)
    macd_line = [ema12[i] - ema26[i] for i in range(len(closes))]
    signal = ema_series(macd_line, 9)
    return macd_line[-1], signal[-1]


# ── scoring functions: each returns float in [-2, +2] ─────────────────────────

def score_macd(macd_line: float, signal: float) -> float:
    above = macd_line > signal
    positive = macd_line > 0
    if above and positive:     return  2.0
    if above and not positive: return  1.0
    if not above and positive: return -1.0
    return -2.0


def score_sma_distance(price: float, sma_val: float) -> float:
    pct = (price - sma_val) / sma_val * 100.0
    if pct >  7.0: return  2.0
    if pct >  2.0: return  1.0
    if pct > -2.0: return  0.0
    if pct > -7.0: return -1.0
    return -2.0


def score_cross(sma50: float, sma200: float) -> float:
    pct = (sma50 - sma200) / sma200 * 100.0
    if pct >  3.0: return  2.0   # strong golden cross
    if pct >  0.0: return  1.0   # golden cross
    if pct > -3.0: return -1.0   # death cross
    return -2.0                  # strong death cross


def score_vix(vix: float) -> float:
    if vix < 13.0: return  2.0
    if vix < 18.0: return  1.0
    if vix < 23.0: return  0.0
    if vix < 30.0: return -1.0
    return -2.0


def score_hy_oas(spread: float) -> float:
    if spread < 2.5: return  2.0
    if spread < 3.5: return  1.0
    if spread < 4.5: return  0.0
    if spread < 6.0: return -1.0
    return -2.0


def score_rsi(rsi: float) -> float:
    # Contrarian: oversold → bullish signal, overbought → bearish
    if rsi < 25.0: return  2.0
    if rsi < 35.0: return  1.0
    if rsi < 55.0: return  0.0
    if rsi < 65.0: return -0.5
    if rsi < 75.0: return -1.0
    return -1.5


def classify_regime(composite: float) -> str:
    if composite >=  1.2: return "Strong Buy"
    if composite >=  0.4: return "Buy"
    if composite >= -0.4: return "Hold"
    if composite >= -1.2: return "Sell"
    return "Strong Sell"


# ── main ───────────────────────────────────────────────────────────────────────

def fetch():
    config       = json.loads(environ.get("FWUBBO_CONFIG", "{}"))
    state        = json.loads(environ.get("FWUBBO_STATE",  "{}"))
    anthropic_key = environ.get("ANTHROPIC_API_KEY", "")
    newsapi_key   = environ.get("FWUBBO_SECRET_NEWSAPI_KEY", "")
    fred_key      = environ.get("FWUBBO_SECRET_FRED_API_KEY", "")

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Return today's cached result without re-fetching (saves API calls)
    if state.get("date") == today and state.get("regime"):
        return {"status": "ok", "data": state, "notifications": []}

    # ── load weights ───────────────────────────────────────────────────────────
    weights = {}
    for key, default in DEFAULT_WEIGHTS.items():
        try:
            weights[key] = max(0.0, float(config.get(f"w_{key}", default)))
        except (ValueError, TypeError):
            weights[key] = default

    scores = {}   # active indicator scores
    meta = {}     # raw values for debugging

    # ── QQQ price data (required) ──────────────────────────────────────────────
    try:
        closes = fetch_yahoo_closes("QQQ", days=260)
        price = closes[-1]
        sma50_val  = sma(closes, 50)
        sma200_val = sma(closes, 200)
        rsi_val    = compute_rsi(closes)
        macd_line, macd_sig = compute_macd(closes)

        scores["sma50"]  = score_sma_distance(price, sma50_val)
        scores["sma200"] = score_sma_distance(price, sma200_val)
        scores["cross"]  = score_cross(sma50_val, sma200_val)
        scores["rsi"]    = score_rsi(rsi_val)
        scores["macd"]   = score_macd(macd_line, macd_sig)

        meta["price"]  = round(price, 2)
        meta["sma50"]  = round(sma50_val, 2)
        meta["sma200"] = round(sma200_val, 2)
        meta["rsi"]    = round(rsi_val, 1)
        meta["macd_hist"] = round(macd_line - macd_sig, 3)
    except Exception as e:
        return {
            "status": "error", "data": {}, "notifications": [],
            "error_message": f"QQQ fetch failed: {e}",
        }

    # ── VIX ────────────────────────────────────────────────────────────────────
    try:
        vix_closes = fetch_yahoo_closes("%5EVIX", days=5)
        vix_val = vix_closes[-1]
        scores["vix"] = score_vix(vix_val)
        meta["vix"] = round(vix_val, 2)
    except Exception:
        pass  # optional

    # ── HY OAS (FRED BAMLH0A0HYM2) ────────────────────────────────────────────
    if fred_key:
        try:
            hy_val = fetch_fred_latest("BAMLH0A0HYM2", fred_key)
            if hy_val is not None:
                scores["hy_oas"] = score_hy_oas(hy_val)
                meta["hy_oas"] = round(hy_val, 2)
        except Exception:
            pass  # optional

    # ── News sentiment via Claude Haiku ────────────────────────────────────────
    sentiment_day  = None
    sentiment_week = None

    if anthropic_key:
        try:
            articles_day, src_day = collect_articles(newsapi_key, days_back=1)
            if articles_day:
                sentiment_day = analyze_sentiment(articles_day, "past 24 hours", anthropic_key)
                # Scale sentiment [-1,+1] → indicator score [-2,+2]
                scores["sentiment_day"] = sentiment_day["score"] * 2.0
                meta["news_day_source"] = src_day
                meta["news_day_count"] = len(articles_day)
        except Exception as e:
            meta["news_day_error"] = str(e)[:100]

        try:
            articles_week, src_week = collect_articles(newsapi_key, days_back=7)
            if articles_week:
                sentiment_week = analyze_sentiment(articles_week, "past 7 days", anthropic_key)
                scores["sentiment_week"] = sentiment_week["score"] * 2.0
                meta["news_week_source"] = src_week
                meta["news_week_count"] = len(articles_week)
        except Exception as e:
            meta["news_week_error"] = str(e)[:100]

    # ── composite weighted score ───────────────────────────────────────────────
    active = {k: weights[k] for k in scores if k in weights and weights[k] > 0}
    if not active:
        return {
            "status": "error", "data": {}, "notifications": [],
            "error_message": "No active indicators — check API keys and weights",
        }

    total_w = sum(active.values())
    composite = sum(scores[k] * active[k] for k in active) / total_w
    composite = round(max(-2.0, min(2.0, composite)), 3)
    regime = classify_regime(composite)

    result = {
        "regime": regime,
        "composite": composite,
        "sentiment_day": sentiment_day,
        "sentiment_week": sentiment_week,
        "indicator_scores": {k: round(scores[k], 2) for k in scores},
        "weights_used": {k: round(v, 2) for k, v in active.items()},
        "meta": meta,
        "date": today,
        "indicators_active": len(active),
        "sentiment_available": anthropic_key != "",
    }

    return {
        "status": "ok",
        "data": result,
        "notifications": [],
        "state": result,   # cache the full result keyed by date
    }


print(json.dumps(fetch()))
