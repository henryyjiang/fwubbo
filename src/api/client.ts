/**
 * Fwubbo API Client
 * Typed wrappers for all backend endpoints.
 */

const API_BASE = "http://localhost:9120";

export interface GenerateModuleRequest {
  description: string;
  api_docs?: string;
  api_key_names?: string[];
}

export interface GenerateModuleResponse {
  module_id: string;
  manifest: Record<string, unknown>;
  files_written: string[];
  warnings: string[];
  message: string;
}

export interface ModuleFetchResult {
  status: "ok" | "error";
  data: Record<string, unknown>;
  notifications: Array<{
    id: string;
    title: string;
    body: string;
    priority: string;
    timestamp: string;
  }>;
  error_message?: string;
  fetch_ms?: number;
}

export interface ModuleListResponse {
  modules: Array<Record<string, unknown>>;
}

// ── Module Generation ──────────────────────────────────────────

export async function generateModule(
  req: GenerateModuleRequest
): Promise<GenerateModuleResponse> {
  const res = await fetch(`${API_BASE}/api/generate/module`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Generation failed: ${res.status}`);
  }

  return res.json();
}

// ── Module Data Fetching ───────────────────────────────────────

export async function fetchModuleData(
  moduleId: string
): Promise<ModuleFetchResult> {
  const res = await fetch(`${API_BASE}/api/modules/${moduleId}/fetch`, {
    method: "POST",
  });

  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status}`);
  }

  return res.json();
}

// ── Module Listing ─────────────────────────────────────────────

export async function listModules(): Promise<ModuleListResponse> {
  const res = await fetch(`${API_BASE}/api/modules/`, {
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`List failed: ${res.status}`);
  return res.json();
}

// ── Module Stats ───────────────────────────────────────────────

export async function getModuleStats(
  moduleId: string
): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}/api/modules/${moduleId}/stats`);
  if (!res.ok) throw new Error(`Stats failed: ${res.status}`);
  return res.json();
}

// ── Health Check ───────────────────────────────────────────────

export async function checkHealth(): Promise<{
  status: string;
  modules_loaded: number;
}> {
  const res = await fetch(`${API_BASE}/api/health`);
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

// ── Streaming Chat ────────────────────────────────────────────

export interface ChatStreamEvent {
  type: "text" | "module_created" | "module_updated" | "error" | "done";
  content?: string;
  module_id?: string;
  manifest?: Record<string, unknown>;
  warnings?: string[];
  error?: string;
  session_module_id?: string;  // the module this session is now bound to
}

export async function* streamChat(
  sessionId: string,
  message: string,
  moduleId?: string,
): AsyncGenerator<ChatStreamEvent> {
  const res = await fetch(`${API_BASE}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      message,
      module_id: moduleId,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Chat failed: ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const event = JSON.parse(line.slice(6)) as ChatStreamEvent;
          yield event;
        } catch {
          // skip malformed events
        }
      }
    }
  }
}

export async function resetChat(sessionId: string): Promise<void> {
  await fetch(`${API_BASE}/api/chat/reset/${sessionId}`, { method: "POST" });
}

// ── Module Config ─────────────────────────────────────────────

export interface SettingField {
  key: string;
  type: "text" | "number" | "select" | "toggle" | "password";
  label: string;
  default?: string | number | boolean;
  description?: string;
  options?: string[];
}

export async function getModuleConfig(
  moduleId: string,
): Promise<{ config: Record<string, unknown>; settings: SettingField[] }> {
  const res = await fetch(`${API_BASE}/api/chat/module/${moduleId}/config`);
  if (!res.ok) throw new Error(`Config fetch failed: ${res.status}`);
  return res.json();
}

export async function updateModuleConfig(
  moduleId: string,
  config: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/chat/module/${moduleId}/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config }),
  });
  if (!res.ok) throw new Error(`Config update failed: ${res.status}`);
}

export async function deleteModule(moduleId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/chat/module/${moduleId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
}

// ── Saved Widgets Library ────────────────────────────────────────

export async function listSavedWidgets(): Promise<{ saved: Record<string, unknown>[] }> {
  const res = await fetch(`${API_BASE}/api/saved/`);
  if (!res.ok) throw new Error(`List saved failed: ${res.status}`);
  return res.json();
}

export async function saveWidget(
  moduleId: string,
): Promise<{ status: string; module_id: string; manifest: Record<string, unknown> }> {
  const res = await fetch(`${API_BASE}/api/saved/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ module_id: moduleId }),
  });
  if (!res.ok) throw new Error(`Save widget failed: ${res.status}`);
  return res.json();
}

export async function addSavedWidget(
  savedId: string,
): Promise<{ status: string; module_id: string; manifest: Record<string, unknown> }> {
  const res = await fetch(`${API_BASE}/api/saved/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ saved_id: savedId }),
  });
  if (!res.ok) throw new Error(`Add saved widget failed: ${res.status}`);
  return res.json();
}

export async function duplicateSavedWidget(
  savedId: string,
): Promise<{ status: string; saved_id: string; manifest: Record<string, unknown> }> {
  const res = await fetch(`${API_BASE}/api/saved/duplicate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ saved_id: savedId }),
  });
  if (!res.ok) throw new Error(`Duplicate saved widget failed: ${res.status}`);
  return res.json();
}

export async function deleteSavedWidget(savedId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/saved/${savedId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Delete saved widget failed: ${res.status}`);
}

export async function renameSavedWidget(
  savedId: string,
  newName: string,
): Promise<{ status: string; saved_id: string; manifest: Record<string, unknown> }> {
  const res = await fetch(`${API_BASE}/api/saved/rename`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ saved_id: savedId, new_name: newName }),
  });
  if (!res.ok) throw new Error(`Rename saved widget failed: ${res.status}`);
  return res.json();
}

// ── Global API Keys (Secrets) ────────────────────────────────────

export interface GlobalApiKey {
  env_key: string;
  name: string;
  has_value: boolean;
}

export async function listGlobalKeys(): Promise<{ secrets: GlobalApiKey[] }> {
  const res = await fetch(`${API_BASE}/api/secrets/`);
  if (!res.ok) throw new Error(`List secrets failed: ${res.status}`);
  return res.json();
}

export async function addGlobalKey(
  name: string,
  value: string,
): Promise<{ status: string; env_key: string; name: string }> {
  const res = await fetch(`${API_BASE}/api/secrets/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, value }),
  });
  if (!res.ok) throw new Error(`Add secret failed: ${res.status}`);
  return res.json();
}

export async function updateGlobalKey(
  name: string,
  value: string,
): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/api/secrets/${name}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) throw new Error(`Update secret failed: ${res.status}`);
  return res.json();
}

export async function deleteGlobalKey(name: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/secrets/${name}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Delete secret failed: ${res.status}`);
}

// ── Theme Chat (Streaming) ────────────────────────────────────────

export interface ThemeChatStreamEvent {
  type: "text" | "theme_created" | "theme_updated" | "error" | "done";
  content?: string;
  theme_id?: string;
  theme?: Record<string, unknown>;
  warnings?: string[];
  error?: string;
  session_theme_id?: string;
}

export async function* streamThemeChat(
  sessionId: string,
  message: string,
  themeId?: string,
): AsyncGenerator<ThemeChatStreamEvent> {
  const res = await fetch(`${API_BASE}/api/theme-chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      message,
      theme_id: themeId,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Theme chat failed: ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const event = JSON.parse(line.slice(6)) as ThemeChatStreamEvent;
          yield event;
        } catch {
          // skip malformed events
        }
      }
    }
  }
}

export async function resetThemeChat(sessionId: string): Promise<void> {
  await fetch(`${API_BASE}/api/theme-chat/reset/${sessionId}`, { method: "POST" });
}

// ── Custom Themes CRUD ───────────────────────────────────────────

export async function listCustomThemes(): Promise<{ themes: Record<string, unknown>[] }> {
  const res = await fetch(`${API_BASE}/api/theme-chat/custom`);
  if (!res.ok) throw new Error(`List custom themes failed: ${res.status}`);
  return res.json();
}

export async function renameCustomTheme(
  themeId: string,
  newName: string,
): Promise<{ status: string; theme_id: string; theme: Record<string, unknown> }> {
  const res = await fetch(`${API_BASE}/api/theme-chat/rename`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ theme_id: themeId, new_name: newName }),
  });
  if (!res.ok) throw new Error(`Rename theme failed: ${res.status}`);
  return res.json();
}

export async function duplicateCustomTheme(
  themeId: string,
): Promise<{ status: string; theme_id: string; theme: Record<string, unknown> }> {
  const res = await fetch(`${API_BASE}/api/theme-chat/duplicate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ theme_id: themeId }),
  });
  if (!res.ok) throw new Error(`Duplicate theme failed: ${res.status}`);
  return res.json();
}

export async function deleteCustomTheme(themeId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/theme-chat/${themeId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Delete theme failed: ${res.status}`);
}

// ── Claude / Anthropic API key ────────────────────────────────────

export async function getClaudeKeyStatus(): Promise<{ has_key: boolean }> {
  const res = await fetch(`${API_BASE}/api/secrets/claude-key`);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export async function setClaudeKey(value: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/secrets/claude-key`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
}

export async function deleteClaudeKey(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/secrets/claude-key`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
}

// ── App Settings ─────────────────────────────────────────────────

export async function getSettings(): Promise<{ settings: Record<string, unknown> }> {
  const res = await fetch(`${API_BASE}/api/settings/`);
  if (!res.ok) throw new Error(`Get settings failed: ${res.status}`);
  return res.json();
}

export async function updateSettings(
  settings: Record<string, unknown>,
): Promise<{ status: string; settings: Record<string, unknown> }> {
  const res = await fetch(`${API_BASE}/api/settings/`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings }),
  });
  if (!res.ok) throw new Error(`Update settings failed: ${res.status}`);
  return res.json();
}

export async function resetSettings(): Promise<{ settings: Record<string, unknown> }> {
  const res = await fetch(`${API_BASE}/api/settings/reset`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Reset settings failed: ${res.status}`);
  return res.json();
}
