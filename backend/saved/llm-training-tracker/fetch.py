import json
import math
import random
import time
from datetime import datetime, timezone
from os import environ


# ── helpers ──────────────────────────────────────────────────────────────────

def _loss_at_step(step: int, total: int = 500) -> float:
    """Deterministic loss curve: warmup → exponential decay + per-step noise."""
    rng = random.Random(step * 31337 + 7)
    warmup = 50
    if step == 0:
        return 9.8
    if step < warmup:
        base = 9.8 - step * 0.04
    else:
        progress = (step - warmup) / max(1, total - warmup)
        base = 8.5 * math.exp(-3.2 * progress) + 0.28
    noise = rng.gauss(0, base * 0.055)
    return max(0.05, base + noise)


def _lr_at_step(step: int, total: int = 500, peak_lr: float = 3e-4) -> float:
    """Cosine decay with linear warmup."""
    warmup = 50
    if step < warmup:
        return peak_lr * step / warmup
    progress = (step - warmup) / max(1, total - warmup)
    return peak_lr * 0.5 * (1.0 + math.cos(math.pi * progress))


def _format_elapsed(seconds: int) -> str:
    h = seconds // 3600
    m = (seconds % 3600) // 60
    s = seconds % 60
    if h > 0:
        return f"{h}h {m:02d}m"
    if m > 0:
        return f"{m}m {s:02d}s"
    return f"{s}s"


# ── demo mode ─────────────────────────────────────────────────────────────────

def _generate_demo_logs(current_step: int, state: dict) -> list[str]:
    """Generate new log lines for steps added since last refresh."""
    last_step: int = state.get("last_step", -1)
    new_lines: list[str] = []

    if current_step <= last_step:
        return new_lines

    rng = random.Random()  # non-deterministic for timestamps
    now_str = datetime.now(timezone.utc).strftime("%H:%M:%S")

    # Preamble on very first fetch
    if last_step < 0:
        new_lines += [
            f"[{now_str}] INFO  ─────────────────────────────────────────",
            f"[{now_str}] INFO  fwubbo-demo-run  •  llama-3-8b-instruct",
            f"[{now_str}] INFO  Optimizer: AdamW  |  Peak LR: 3e-4",
            f"[{now_str}] INFO  Batch: 32  |  Seq len: 2048  |  Grad accum: 4",
            f"[{now_str}] INFO  ─────────────────────────────────────────",
        ]

    for step in range(max(0, last_step + 1), current_step + 1):
        if step % 5 != 0:
            continue
        ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
        loss = _loss_at_step(step)
        lr = _lr_at_step(step)
        grad_norm = abs(rng.gauss(1.18, 0.25))
        tps = int(1245 + rng.gauss(0, 60))

        if step > 0 and step % 100 == 0:
            epoch = step // 100
            new_lines.append(
                f"[{ts}] EPOCH {epoch} ── avg_loss: {loss:.4f}  saving checkpoint…"
            )
            new_lines.append(
                f"[{ts}] INFO  checkpoint saved → ./checkpoints/step-{step:05d}.pt"
            )
        else:
            new_lines.append(
                f"[{ts}] step {step:>4d} | loss {loss:.4f} | lr {lr:.2e} "
                f"| gnorm {grad_norm:.3f} | {tps} tok/s"
            )

    return new_lines


def _build_demo_data(state: dict, max_log_lines: int) -> dict:
    now = time.time()

    # Cycle through a 500-step run every 40 minutes so demo is always "live".
    # Use a stable per-cycle offset so log accumulation doesn't reset constantly.
    total_steps = 500
    cycle_seconds = 2400  # 40-minute cycle
    steps_per_second = total_steps / cycle_seconds

    # Which cycle are we in?
    cycle_index = int(now // cycle_seconds)
    cycle_start = cycle_index * cycle_seconds
    elapsed_in_cycle = int(now - cycle_start)
    current_step = min(int(elapsed_in_cycle * steps_per_second), total_steps - 1)

    # If the cycle changed since last state, reset log buffer
    last_cycle = state.get("cycle_index", cycle_index)
    if cycle_index != last_cycle:
        state = {**state, "log_lines": [], "last_step": -1, "cycle_index": cycle_index}

    elapsed = elapsed_in_cycle  # elapsed within current cycle

    is_active = True  # demo is always training
    status = "training"

    # Loss chart — 100 uniformly sampled points up to current_step
    chart_data: list[dict] = []
    if current_step > 0:
        sample_count = min(100, current_step + 1)
        for i in range(sample_count):
            s = int(i * current_step / max(1, sample_count - 1))
            chart_data.append({
                "step": s,
                "loss": round(_loss_at_step(s, total_steps), 4),
                "lr": round(_lr_at_step(s, total_steps) * 1e4, 5),
            })

    # Metrics
    current_loss = _loss_at_step(current_step, total_steps) if current_step >= 0 else None
    current_lr = _lr_at_step(current_step, total_steps)
    rng_now = random.Random(int(now / 10))
    gpu_util = round(max(0.0, min(100.0, 93.8 + rng_now.gauss(0, 1.2))), 1)
    tokens_per_sec = int(1245 + rng_now.gauss(0, 55))
    epoch = current_step // 100
    epoch_progress = round((current_step % 100) / 100.0, 3)

    # Terminal logs
    new_logs = _generate_demo_logs(current_step, state)
    existing_logs: list[str] = state.get("log_lines", [])
    all_logs = (existing_logs + new_logs)[-max_log_lines:]

    return {
        "mode": "demo",
        "status": status,
        "is_active": is_active,
        "job_label": "fwubbo-demo-run",
        "current_step": current_step,
        "total_steps": total_steps,
        "epoch": epoch,
        "epoch_progress": epoch_progress,
        "current_loss": round(current_loss, 4) if current_loss is not None else None,
        "current_lr": current_lr,
        "gpu_util": gpu_util,
        "tokens_per_sec": tokens_per_sec,
        "elapsed_seconds": elapsed,
        "chart_data": chart_data,
        "log_lines": all_logs,
    }, all_logs, current_step, cycle_index


# ── prometheus mode ───────────────────────────────────────────────────────────

def _query_scalar(client, base_url: str, promql: str):
    """Query a single current value from Prometheus. Returns float or None."""
    try:
        resp = client.get(f"{base_url}/api/v1/query", params={"query": promql}, timeout=8.0)
        resp.raise_for_status()
        result = resp.json().get("data", {}).get("result", [])
        if result:
            return float(result[0]["value"][1])
    except Exception:
        pass
    return None


def _fetch_prometheus(
    prometheus_url: str,
    loki_url: str,
    job_label: str,
    loss_metric: str,
    history_minutes: int,
    idle_threshold: int,
    max_log_lines: int,
    state: dict,
) -> dict:
    import httpx

    now_ts = int(time.time())
    start_ts = now_ts - history_minutes * 60
    step_secs = max(15, (history_minutes * 60) // 100)
    job_sel = f'{{job="{job_label}"}}'

    with httpx.Client(timeout=12.0) as client:
        # ── loss time-series for chart ─────────────────────────────────────
        chart_data: list[dict] = []
        try:
            resp = client.get(
                f"{prometheus_url}/api/v1/query_range",
                params={
                    "query": f"{loss_metric}{job_sel}",
                    "start": start_ts,
                    "end": now_ts,
                    "step": step_secs,
                },
            )
            resp.raise_for_status()
            for series in resp.json().get("data", {}).get("result", [])[:1]:
                for ts, val in series.get("values", []):
                    chart_data.append({
                        "step": int(ts - start_ts),
                        "loss": round(float(val), 4),
                    })
        except Exception:
            pass

        # ── scalar metrics ─────────────────────────────────────────────────
        current_loss = _query_scalar(client, prometheus_url, f"{loss_metric}{job_sel}")
        current_step_f = _query_scalar(client, prometheus_url, f"training_step{job_sel}")
        current_lr = _query_scalar(client, prometheus_url, f"training_learning_rate{job_sel}")
        gpu_util = _query_scalar(client, prometheus_url, f"gpu_utilization{job_sel}")
        tps = _query_scalar(client, prometheus_url, f"training_tokens_per_second{job_sel}")
        current_epoch_f = _query_scalar(client, prometheus_url, f"training_epoch{job_sel}")

        # Idle check: see if the last sample timestamp is recent
        is_active = False
        try:
            resp2 = client.get(
                f"{prometheus_url}/api/v1/query",
                params={"query": f"timestamp({loss_metric}{job_sel})"},
            )
            resp2.raise_for_status()
            result2 = resp2.json().get("data", {}).get("result", [])
            if result2:
                last_ts = float(result2[0]["value"][1])
                is_active = (now_ts - last_ts) < idle_threshold
        except Exception:
            is_active = current_step_f is not None

        # ── optional Loki logs ─────────────────────────────────────────────
        existing_logs: list[str] = state.get("log_lines", [])
        new_logs: list[str] = []

        if loki_url:
            try:
                last_loki_ts = state.get("last_loki_ts_ns", (now_ts - 30) * 1_000_000_000)
                loki_resp = client.get(
                    f"{loki_url}/loki/api/v1/query_range",
                    params={
                        "query": f'{{{job_sel}}}',
                        "start": last_loki_ts,
                        "end": now_ts * 1_000_000_000,
                        "limit": 30,
                        "direction": "forward",
                    },
                )
                loki_resp.raise_for_status()
                max_ts_seen = last_loki_ts
                for stream in loki_resp.json().get("data", {}).get("result", []):
                    for ts_ns, line in stream.get("values", []):
                        ts_ns_int = int(ts_ns)
                        if ts_ns_int > last_loki_ts:
                            new_logs.append(line)
                            if ts_ns_int > max_ts_seen:
                                max_ts_seen = ts_ns_int
                state["last_loki_ts_ns"] = max_ts_seen
            except Exception:
                pass

        all_logs = (existing_logs + new_logs)[-max_log_lines:]

        return {
            "mode": "prometheus",
            "status": "training" if is_active else "idle",
            "is_active": is_active,
            "job_label": job_label,
            "current_step": int(current_step_f) if current_step_f is not None else None,
            "total_steps": None,
            "epoch": int(current_epoch_f) if current_epoch_f is not None else None,
            "epoch_progress": None,
            "current_loss": round(current_loss, 4) if current_loss is not None else None,
            "current_lr": current_lr,
            "gpu_util": round(gpu_util, 1) if gpu_util is not None else None,
            "tokens_per_sec": int(tps) if tps is not None else None,
            "elapsed_seconds": None,
            "chart_data": chart_data,
            "log_lines": all_logs,
        }, all_logs


# ── entry point ───────────────────────────────────────────────────────────────

def fetch():
    config = json.loads(environ.get("FWUBBO_CONFIG", "{}"))
    state = json.loads(environ.get("FWUBBO_STATE", "{}"))

    prometheus_url = config.get("prometheus_url", "").strip().rstrip("/")
    loki_url = config.get("loki_url", "").strip().rstrip("/")
    job_label = config.get("job_label", "llm_training").strip()
    loss_metric = config.get("loss_metric", "training_loss").strip()
    max_log_lines = max(20, min(int(config.get("max_log_lines", 100)), 500))
    history_minutes = max(5, min(int(config.get("history_minutes", 60)), 1440))
    idle_threshold = max(30, int(config.get("idle_threshold_seconds", 120)))

    if not prometheus_url:
        # Demo mode
        data, all_logs, current_step, cycle_index = _build_demo_data(state, max_log_lines)
        new_state = {**state, "log_lines": all_logs, "last_step": current_step, "cycle_index": cycle_index}
        return {"status": "ok", "data": data, "notifications": [], "state": new_state}

    try:
        data, all_logs = _fetch_prometheus(
            prometheus_url, loki_url, job_label, loss_metric,
            history_minutes, idle_threshold, max_log_lines, state,
        )
        new_state = {**state, "log_lines": all_logs}
        return {"status": "ok", "data": data, "notifications": [], "state": new_state}
    except Exception as e:
        return {
            "status": "error",
            "data": {},
            "notifications": [],
            "error_message": f"Prometheus fetch failed: {e}",
        }


print(json.dumps(fetch()))
