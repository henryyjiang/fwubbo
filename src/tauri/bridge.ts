/**
 * Tauri Bridge — safe wrappers for all Tauri APIs.
 *
 * When running in a browser (npm run dev without Tauri), all calls
 * gracefully degrade to no-ops or mock values. This lets the app
 * run in both modes without conditional imports everywhere.
 */

// Detect if we're running inside Tauri
export const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// ─── System Info (Rust command) ────────────────────────────────

export interface SystemInfo {
  hostname: string;
  os_name: string;
  os_version: string;
  cpu_count: number;
  total_memory_mb: number;
  used_memory_mb: number;
  cpu_usage_percent: number;
  uptime_secs: number;
}

export async function getSystemInfo(): Promise<SystemInfo> {
  if (!isTauri()) {
    return {
      hostname: "browser-dev",
      os_name: navigator.platform || "Browser",
      os_version: "",
      cpu_count: navigator.hardwareConcurrency || 4,
      total_memory_mb: 0,
      used_memory_mb: 0,
      cpu_usage_percent: 0,
      uptime_secs: 0,
    };
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<SystemInfo>("get_system_info");
}

// ─── Backend Health ────────────────────────────────────────────

export async function checkBackendHealth(): Promise<boolean> {
  if (!isTauri()) {
    // In browser mode, just do a fetch
    try {
      const res = await fetch("http://localhost:9120/api/health", {
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("check_backend_health");
}

// ─── Backend Management ────────────────────────────────────────

export async function restartBackend(): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("restart_backend");
}

// ─── Notifications ─────────────────────────────────────────────

export async function sendNotification(
  title: string,
  body: string,
): Promise<void> {
  if (!isTauri()) {
    // Browser fallback: use the Web Notifications API
    if ("Notification" in window) {
      if (Notification.permission === "granted") {
        new Notification(title, { body });
      } else if (Notification.permission !== "denied") {
        const perm = await Notification.requestPermission();
        if (perm === "granted") {
          new Notification(title, { body });
        }
      }
    }
    return;
  }

  try {
    const notification = await import("@tauri-apps/plugin-notification");
    let granted = await notification.isPermissionGranted();
    if (!granted) {
      const result = await notification.requestPermission();
      granted = result === "granted";
    }
    if (granted) {
      notification.sendNotification({ title, body });
    }
  } catch (e) {
    console.warn("[fwubbo] Notification failed:", e);
  }
}

export async function isNotificationPermissionGranted(): Promise<boolean> {
  if (!isTauri()) {
    return "Notification" in window && Notification.permission === "granted";
  }
  try {
    const notification = await import("@tauri-apps/plugin-notification");
    return notification.isPermissionGranted();
  } catch {
    return false;
  }
}

/**
 * Returns the granular notification permission state:
 * - "granted"  — permission confirmed
 * - "denied"   — explicitly blocked by user/OS
 * - "default"  — never asked yet (browser) or unknown (Tauri)
 */
export async function getNotificationPermissionStatus(): Promise<"granted" | "denied" | "default"> {
  if (!isTauri()) {
    if (!("Notification" in window)) return "denied";
    return Notification.permission as "granted" | "denied" | "default";
  }
  try {
    const notification = await import("@tauri-apps/plugin-notification");
    const granted = await notification.isPermissionGranted();
    // Tauri doesn't distinguish "denied" from "default"; treat false as "default"
    // so the UI shows "Grant" rather than "Denied" and the user can try the button.
    return granted ? "granted" : "default";
  } catch {
    return "default";
  }
}

/**
 * Request notification permission. Must be called from a user gesture (button click)
 * so that browsers allow the permission dialog to appear.
 * Returns true if permission was granted.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isTauri()) {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    const result = await Notification.requestPermission();
    return result === "granted";
  }
  try {
    const notification = await import("@tauri-apps/plugin-notification");
    let granted = await notification.isPermissionGranted();
    if (!granted) {
      const result = await notification.requestPermission();
      granted = result === "granted";
    }
    return granted;
  } catch {
    return false;
  }
}

// ─── Autostart ─────────────────────────────────────────────────

export async function isAutoStartEnabled(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const autostart = await import("@tauri-apps/plugin-autostart");
    return autostart.isEnabled();
  } catch {
    return false;
  }
}

export async function enableAutoStart(): Promise<void> {
  if (!isTauri()) return;
  const autostart = await import("@tauri-apps/plugin-autostart");
  await autostart.enable();
}

export async function disableAutoStart(): Promise<void> {
  if (!isTauri()) return;
  const autostart = await import("@tauri-apps/plugin-autostart");
  await autostart.disable();
}

// ─── Window Management ─────────────────────────────────────────

export async function showWindow(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const win = getCurrentWebviewWindow();
    await win.show();
    await win.unminimize();
    await win.setFocus();
  } catch (e) {
    console.warn("[fwubbo] Show window failed:", e);
  }
}

export async function hideWindow(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    await getCurrentWebviewWindow().hide();
  } catch (e) {
    console.warn("[fwubbo] Hide window failed:", e);
  }
}

// ─── OS Info ───────────────────────────────────────────────────

export async function getOsInfo(): Promise<{
  platform: string;
  arch: string;
  hostname: string;
}> {
  if (!isTauri()) {
    return {
      platform: navigator.platform || "browser",
      arch: "unknown",
      hostname: "browser-dev",
    };
  }
  try {
    const os = await import("@tauri-apps/plugin-os");
    return {
      platform: os.platform(),
      arch: os.arch(),
      hostname: await os.hostname(),
    };
  } catch {
    return { platform: "unknown", arch: "unknown", hostname: "unknown" };
  }
}

// ─── Event Listening ───────────────────────────────────────────

export async function listenToEvent(
  event: string,
  callback: (payload: unknown) => void,
): Promise<() => void> {
  if (!isTauri()) return () => {};
  try {
    const { listen } = await import("@tauri-apps/api/event");
    const unlisten = await listen(event, (e) => callback(e.payload));
    return unlisten;
  } catch {
    return () => {};
  }
}
