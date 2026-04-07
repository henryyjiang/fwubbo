"""SQLite-backed stats tracking for API calls, LLM tokens, and fetch timing."""

import sqlite3
import time
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger("fwubbo.stats")

DB_PATH = Path(__file__).parent.parent / "data" / "stats.db"


class StatsDB:
    def __init__(self):
        self.conn: sqlite3.Connection | None = None

    def initialize(self):
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS fetch_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                module_id TEXT NOT NULL,
                timestamp REAL NOT NULL,
                status TEXT NOT NULL,
                api_calls INTEGER DEFAULT 0,
                llm_tokens INTEGER DEFAULT 0,
                fetch_ms REAL DEFAULT 0,
                error TEXT
            )
        """)
        self.conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_fetch_module_ts
            ON fetch_log(module_id, timestamp)
        """)
        self.conn.commit()
        logger.info(f"Stats DB initialized at {DB_PATH}")

    def log_fetch(
        self,
        module_id: str,
        status: str,
        api_calls: int = 0,
        llm_tokens: int = 0,
        fetch_ms: float = 0,
        error: str | None = None,
    ):
        if not self.conn:
            return
        self.conn.execute(
            "INSERT INTO fetch_log (module_id, timestamp, status, api_calls, llm_tokens, fetch_ms, error) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (module_id, time.time(), status, api_calls, llm_tokens, fetch_ms, error),
        )
        self.conn.commit()

    def get_stats(self, module_id: str) -> dict[str, Any]:
        """Get usage stats for a module across different time windows."""
        if not self.conn:
            return {}

        now = time.time()
        windows = {
            "hour": now - 3600,
            "day": now - 86400,
            "month": now - 2592000,
        }

        stats: dict[str, Any] = {}
        for period, since in windows.items():
            row = self.conn.execute(
                """
                SELECT
                    COALESCE(SUM(api_calls), 0),
                    COALESCE(SUM(llm_tokens), 0),
                    COUNT(*),
                    COALESCE(AVG(fetch_ms), 0)
                FROM fetch_log
                WHERE module_id = ? AND timestamp >= ?
                """,
                (module_id, since),
            ).fetchone()

            stats[f"api_calls_{period}"] = row[0]
            stats[f"llm_tokens_{period}"] = row[1]
            stats[f"fetch_count_{period}"] = row[2]
            stats[f"avg_fetch_ms_{period}"] = round(row[3], 1)

        # Last fetch info
        last = self.conn.execute(
            "SELECT timestamp, status, fetch_ms, error FROM fetch_log WHERE module_id = ? ORDER BY timestamp DESC LIMIT 1",
            (module_id,),
        ).fetchone()

        if last:
            stats["last_fetch"] = last[0]
            stats["last_status"] = last[1]
            stats["last_fetch_ms"] = last[2]
            stats["last_error"] = last[3]

        return stats

    def close(self):
        if self.conn:
            self.conn.close()
