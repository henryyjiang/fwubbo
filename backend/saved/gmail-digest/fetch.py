import json
import imaplib
import email
from email.utils import parsedate_to_datetime, parseaddr
from email.header import decode_header as _decode_header
import re
import anthropic
from os import environ
from datetime import datetime, timezone, timedelta


def decode_str(raw):
    """Decode an encoded email header string."""
    if raw is None:
        return ""
    parts = _decode_header(raw)
    decoded = []
    for part, charset in parts:
        if isinstance(part, bytes):
            decoded.append(part.decode(charset or "utf-8", errors="replace"))
        else:
            decoded.append(part)
    return "".join(decoded)


def extract_text(msg):
    """Extract plain text body from an email message."""
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            cd = str(part.get("Content-Disposition", ""))
            if ct == "text/plain" and "attachment" not in cd:
                try:
                    return part.get_payload(decode=True).decode(
                        part.get_content_charset() or "utf-8", errors="replace"
                    )
                except Exception:
                    pass
        # Fallback: try text/html, strip tags
        for part in msg.walk():
            if part.get_content_type() == "text/html":
                try:
                    raw_html = part.get_payload(decode=True).decode(
                        part.get_content_charset() or "utf-8", errors="replace"
                    )
                    return re.sub(r"<[^>]+>", " ", raw_html)
                except Exception:
                    pass
    else:
        try:
            return msg.get_payload(decode=True).decode(
                msg.get_content_charset() or "utf-8", errors="replace"
            )
        except Exception:
            pass
    return ""


def fetch_emails(address, app_password, days_back, max_count):
    """Connect to Gmail via IMAP and return a list of recent email dicts."""
    cutoff = (datetime.now() - timedelta(days=days_back)).strftime("%d-%b-%Y")

    mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
    try:
        mail.login(address, app_password)
        mail.select("INBOX")

        _, data = mail.search(None, f'(SINCE "{cutoff}")')
        uids = data[0].split()
        # Newest first, cap at max_count
        uids = uids[-max_count:][::-1]

        emails = []
        for uid in uids:
            try:
                _, msg_data = mail.fetch(uid, "(RFC822)")
                raw = msg_data[0][1]
                msg = email.message_from_bytes(raw)

                subject = decode_str(msg.get("Subject", "(no subject)"))
                from_raw = msg.get("From", "")
                sender_name, sender_addr = parseaddr(decode_str(from_raw))
                sender = sender_name or sender_addr

                date_str = msg.get("Date", "")
                try:
                    dt = parsedate_to_datetime(date_str)
                    date_label = dt.strftime("%b %-d, %-I:%M %p")
                except Exception:
                    date_label = date_str[:16]

                body = extract_text(msg)[:800]

                emails.append({
                    "subject": subject[:120],
                    "sender": sender[:60],
                    "sender_addr": sender_addr[:80],
                    "date": date_label,
                    "snippet": body.strip()[:400],
                })
            except Exception:
                continue

        return emails
    finally:
        try:
            mail.logout()
        except Exception:
            pass


def fetch():
    config = json.loads(environ.get("FWUBBO_CONFIG", "{}"))
    state = json.loads(environ.get("FWUBBO_STATE", "{}"))
    api_key = environ.get("ANTHROPIC_API_KEY", "")

    address = config.get("gmail_address", "").strip()
    app_password = (
        environ.get("FWUBBO_SECRET_GMAIL_APP_PASSWORD", "")
        or config.get("gmail_app_password", "")
    ).strip()
    days_back = max(1, min(int(config.get("days_back", 2)), 14))
    max_emails = max(5, min(int(config.get("max_emails", 40)), 100))

    now = datetime.now(timezone.utc)

    # Return cached digest if less than 1 hour old
    last_gen = state.get("last_generated", "")
    cached = state.get("digest", None)
    if last_gen and cached:
        try:
            last_dt = datetime.fromisoformat(last_gen)
            if last_dt.tzinfo is None:
                last_dt = last_dt.replace(tzinfo=timezone.utc)
            if (now - last_dt).total_seconds() < 3600:
                return {
                    "status": "ok",
                    "data": {**cached, "from_cache": True},
                    "notifications": [],
                }
        except Exception:
            pass

    if not address or not app_password:
        if cached:
            return {
                "status": "ok",
                "data": {**cached, "from_cache": True, "warning": "Gmail credentials not configured"},
                "notifications": [],
            }
        return {
            "status": "error",
            "data": {},
            "error": "Set gmail_address and gmail_app_password in widget settings",
        }

    if not api_key:
        if cached:
            return {
                "status": "ok",
                "data": {**cached, "from_cache": True, "warning": "ANTHROPIC_API_KEY not set"},
                "notifications": [],
            }
        return {
            "status": "error",
            "data": {},
            "error": "ANTHROPIC_API_KEY not configured in backend/.env",
        }

    # Fetch emails
    try:
        emails = fetch_emails(address, app_password, days_back, max_emails)
    except imaplib.IMAP4.error as e:
        return {
            "status": "error",
            "data": {},
            "error": f"Gmail login failed: {e}. Make sure you're using an App Password, not your account password.",
        }
    except Exception as e:
        return {
            "status": "error",
            "data": {},
            "error": f"Could not connect to Gmail: {e}",
        }

    if not emails:
        result = {
            "summary": f"No emails in the last {days_back} day(s).",
            "important": [],
            "total_scanned": 0,
            "generated_at": now.isoformat(),
            "from_cache": False,
        }
        return {
            "status": "ok",
            "data": result,
            "notifications": [],
            "state": {"last_generated": now.isoformat(), "digest": result},
        }

    # Build prompt
    email_list = "\n\n".join(
        f"[{i+1}] From: {e['sender']} <{e['sender_addr']}>\n"
        f"Date: {e['date']}\nSubject: {e['subject']}\nSnippet: {e['snippet']}"
        for i, e in enumerate(emails)
    )

    prompt = f"""You are reviewing {len(emails)} recent emails (last {days_back} day(s)) for someone.

{email_list}

Identify the emails that actually need attention — things like: replies needed, deadlines, important news, bills/statements, meeting requests, or anything time-sensitive or personally significant.

Ignore: newsletters, marketing, automated notifications, receipts (unless unusually important), and social media alerts.

Return a JSON object:
{{
  "summary": "2-3 sentence overview of the inbox",
  "important": [
    {{
      "index": <1-based number from above>,
      "subject": "email subject",
      "sender": "sender name",
      "date": "date label",
      "reason": "one sentence: why this needs attention",
      "action": "reply | read | deadline | info | other"
    }}
  ]
}}

Return only valid JSON, no markdown fences."""

    try:
        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1500,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text.strip()
        # Strip markdown fences if present
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        parsed = json.loads(raw)

        result = {
            "summary": parsed.get("summary", ""),
            "important": parsed.get("important", []),
            "total_scanned": len(emails),
            "generated_at": now.isoformat(),
            "from_cache": False,
        }

        important_count = len(result["important"])
        notif_body = (
            f"{important_count} email(s) need your attention"
            if important_count > 0
            else "Inbox looks quiet"
        )

        return {
            "status": "ok",
            "data": result,
            "notifications": [{"title": "Gmail Digest", "body": notif_body}],
            "state": {"last_generated": now.isoformat(), "digest": result},
        }

    except Exception as e:
        if cached:
            return {
                "status": "ok",
                "data": {**cached, "from_cache": True, "warning": f"Update failed: {str(e)[:100]}"},
                "notifications": [],
            }
        return {
            "status": "error",
            "data": {},
            "error": f"Failed to analyze emails: {e}",
        }


print(json.dumps(fetch()))
