import json
import httpx
from os import environ

# Workday company configurations: id -> (tenant, wday_instance, job_board_path)
# Each company's Workday API lives at:
#   POST https://{tenant}.{instance}.myworkdayjobs.com/wday/cxs/{tenant}/{board}/jobs
COMPANY_CONFIGS = {
    "apple":      ("apple",      "wd1",  "Jobs"),
    "nvidia":     ("nvidia",     "wd5",  "NVIDIAExternalCareerSite"),
    "salesforce": ("salesforce", "wd12", "External_Career_Site"),
    "adobe":      ("adobe",      "wd5",  "external"),
    "snap":       ("snap",       "wd1",  "snap"),
    "paypal":     ("paypal",     "wd1",  "paypal"),
    "qualcomm":   ("qualcomm",   "wd5",  "External"),
    "intuit":     ("intuit",     "wd1",  "careers"),
    "autodesk":   ("autodesk",   "wd1",  "Ext"),
    "zendesk":    ("zendesk",    "wd5",  "Zendesk_Jobs"),
    "box":        ("box",        "wd5",  "box"),
    "twilio":     ("twilio",     "wd5",  "twilio"),
    "workday":    ("workday",    "wd5",  "workday"),
    "vmware":     ("vmware",     "wd1",  "VMware_Jobs"),
    "ebay":       ("ebay",       "wd5",  "External"),
}

HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}


def fetch_company(client, company_id, keywords, limit):
    if company_id not in COMPANY_CONFIGS:
        return [], f"Unknown company: {company_id}"
    tenant, instance, board = COMPANY_CONFIGS[company_id]
    url = f"https://{tenant}.{instance}.myworkdayjobs.com/wday/cxs/{tenant}/{board}/jobs"
    try:
        resp = client.post(
            url,
            json={"appliedFacets": {}, "limit": limit, "offset": 0, "searchText": keywords},
            headers=HEADERS,
            timeout=12.0,
        )
        resp.raise_for_status()
        payload = resp.json()
        jobs = []
        for job in payload.get("jobPostings", []):
            ext_path = job.get("externalPath", "")
            job_url = f"https://{tenant}.{instance}.myworkdayjobs.com/en-US/{board}{ext_path}"
            # Normalize "Posted X Days Ago" / "Posted Today"
            posted_raw = job.get("postedOn", "")
            jobs.append({
                "id": job.get("bulletFields", [company_id])[0] if job.get("bulletFields") else company_id,
                "company": tenant.capitalize(),
                "company_id": company_id,
                "title": job.get("title", ""),
                "location": job.get("locationsText", ""),
                "posted_raw": posted_raw,
                "url": job_url,
            })
        return jobs, None
    except Exception as e:
        return [], str(e)


def fetch():
    config = json.loads(environ.get("FWUBBO_CONFIG", "{}"))
    keywords = config.get("keywords", "software engineer").strip()
    companies_raw = config.get("companies", "apple,nvidia,salesforce,adobe,snap")
    location_filter = config.get("location_filter", "").strip().lower()
    max_per = max(1, min(int(config.get("max_per_company", 8)), 20))

    selected = [c.strip().lower() for c in companies_raw.split(",") if c.strip()]
    if not selected:
        return {"status": "error", "data": {}, "notifications": [],
                "error_message": "No companies configured"}

    all_jobs = []
    fetch_errors = {}

    with httpx.Client(follow_redirects=True) as client:
        for company_id in selected:
            jobs, err = fetch_company(client, company_id, keywords, max_per)
            if err:
                fetch_errors[company_id] = err
            all_jobs.extend(jobs)

    # Client-side location filter
    if location_filter:
        all_jobs = [j for j in all_jobs if location_filter in j["location"].lower()]

    # Sort: jobs posted most recently first (crude: "Today" before "1 Days Ago", etc.)
    def sort_key(j):
        raw = j.get("posted_raw", "").lower()
        if "today" in raw:
            return 0
        try:
            import re as _re
            m = _re.search(r"(\d+)", raw)
            return int(m.group(1)) if m else 999
        except Exception:
            return 999

    all_jobs.sort(key=sort_key)

    companies_ok = [c for c in selected if c not in fetch_errors]
    notifications = []
    if all_jobs:
        notifications.append({
            "title": "New Jobs Found",
            "body": f"{len(all_jobs)} {keywords} jobs across {len(companies_ok)} companies",
        })

    return {
        "status": "ok",
        "data": {
            "jobs": all_jobs,
            "keywords": keywords,
            "total": len(all_jobs),
            "companies_queried": len(selected),
            "companies_ok": len(companies_ok),
            "fetch_errors": fetch_errors,
            "location_filter": config.get("location_filter", ""),
            "available_companies": sorted(COMPANY_CONFIGS.keys()),
        },
        "notifications": notifications,
    }


print(json.dumps(fetch()))
