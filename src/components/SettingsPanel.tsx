import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  X,
  Key,
  Bell,
  User,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Check,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  ShieldAlert,
} from "lucide-react";
import {
  getNotificationPermissionStatus,
  requestNotificationPermission,
  sendNotification,
  isAutoStartEnabled,
  enableAutoStart,
  disableAutoStart,
  isTauri,
} from "@/tauri/bridge";
import { appConfirm } from "./ConfirmDialog";
import {
  listGlobalKeys,
  addGlobalKey,
  updateGlobalKey,
  deleteGlobalKey,
  getSettings,
  updateSettings,
  getClaudeKeyStatus,
  setClaudeKey,
  deleteClaudeKey,
  type GlobalApiKey,
} from "@/api/client";

type SettingsTab = "api-keys" | "notifications" | "profile";

interface Props {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: Props) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("api-keys");

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      className="fixed right-0 top-0 h-full z-[60] flex flex-col"
      style={{
        width: 420,
        background: "var(--surface-base)",
        borderLeft: "1px solid var(--border-subtle)",
        boxShadow: "-8px 0 32px rgba(0,0,0,0.15)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 shrink-0"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <h2
          className="text-base font-display font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Settings
        </h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg transition-colors"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "var(--surface-overlay)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "transparent")
          }
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tab bar */}
      <div
        className="flex px-5 gap-1 shrink-0 pt-2"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors"
            style={{
              color:
                activeTab === tab.id
                  ? "var(--accent-primary)"
                  : "var(--text-muted)",
              borderBottom:
                activeTab === tab.id
                  ? "2px solid var(--accent-primary)"
                  : "2px solid transparent",
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {activeTab === "api-keys" && <ApiKeysTab />}
        {activeTab === "notifications" && <NotificationsTab />}
        {activeTab === "profile" && <ProfileTab />}
      </div>
    </motion.div>
  );
}

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: "api-keys", label: "API Keys", icon: <Key className="w-3.5 h-3.5" /> },
  {
    id: "notifications",
    label: "Notifications",
    icon: <Bell className="w-3.5 h-3.5" />,
  },
  { id: "profile", label: "Profile", icon: <User className="w-3.5 h-3.5" /> },
];

// ═══════════════════════════════════════════════════════════════════
// API Keys Tab
// ═══════════════════════════════════════════════════════════════════

function ApiKeysTab() {
  const [keys, setKeys] = useState<GlobalApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [saving, setSaving] = useState(false);

  // Claude key state
  const [claudeKeySet, setClaudeKeySet] = useState(false);
  const [claudeKeyInput, setClaudeKeyInput] = useState("");
  const [claudeKeySaving, setClaudeKeySaving] = useState(false);
  const [showClaudeKeyEdit, setShowClaudeKeyEdit] = useState(false);

  // Which key is being edited
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Visibility toggles
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  const loadKeys = useCallback(async () => {
    try {
      const [{ secrets }, { has_key }] = await Promise.all([
        listGlobalKeys(),
        getClaudeKeyStatus(),
      ]);
      setKeys(secrets);
      setClaudeKeySet(has_key);
    } catch {
      // Backend not reachable
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleSaveClaudeKey = async () => {
    if (!claudeKeyInput.trim()) return;
    setClaudeKeySaving(true);
    try {
      await setClaudeKey(claudeKeyInput.trim());
      setClaudeKeySet(true);
      setClaudeKeyInput("");
      setShowClaudeKeyEdit(false);
    } catch (err) {
      console.error("Failed to save Claude key:", err);
    }
    setClaudeKeySaving(false);
  };

  const handleDeleteClaudeKey = async () => {
    if (!await appConfirm("Remove the Anthropic API key? AI generation will stop working.")) return;
    try {
      await deleteClaudeKey();
      setClaudeKeySet(false);
      setShowClaudeKeyEdit(false);
      setClaudeKeyInput("");
    } catch (err) {
      console.error("Failed to delete Claude key:", err);
    }
  };

  const handleAdd = async () => {
    if (!newName.trim() || !newValue.trim()) return;
    setSaving(true);
    try {
      await addGlobalKey(newName.trim(), newValue.trim());
      setNewName("");
      setNewValue("");
      setShowAdd(false);
      await loadKeys();
    } catch (err) {
      console.error("Failed to add key:", err);
    }
    setSaving(false);
  };

  const handleUpdate = async (name: string) => {
    if (!editValue.trim()) return;
    setSaving(true);
    try {
      await updateGlobalKey(name, editValue.trim());
      setEditingKey(null);
      setEditValue("");
      await loadKeys();
    } catch (err) {
      console.error("Failed to update key:", err);
    }
    setSaving(false);
  };

  const handleDelete = async (name: string) => {
    if (!await appConfirm(`Delete API key "${name}"? Widgets using this key will stop working.`))
      return;
    try {
      await deleteGlobalKey(name);
      await loadKeys();
    } catch (err) {
      console.error("Failed to delete key:", err);
    }
  };

  const toggleVisible = (name: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="text-xs py-8 text-center" style={{ color: "var(--text-muted)" }}>
        Loading API keys...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Global API keys are available to all widgets. Keys are stored in your
            local .env file and never leave your machine.
          </p>
        </div>
      </div>

      {/* Claude / Anthropic key */}
      <div
        className="rounded-lg p-3"
        style={{
          background: "var(--surface-raised)",
          border: claudeKeySet
            ? "1px solid var(--accent-primary)44"
            : "1px solid var(--status-warn)44",
        }}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold" style={{ color: "var(--text-primary)" }}>
              Anthropic API Key
            </span>
            {claudeKeySet ? (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{ background: "var(--status-ok)22", color: "var(--status-ok)" }}
              >
                set
              </span>
            ) : (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{ background: "var(--status-warn)22", color: "var(--status-warn)" }}
              >
                required
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setShowClaudeKeyEdit(!showClaudeKeyEdit); setClaudeKeyInput(""); }}
              className="p-1 rounded transition-colors"
              style={{ color: "var(--accent-primary)" }}
              title={claudeKeySet ? "Update key" : "Set key"}
            >
              <RefreshCw className="w-3 h-3" />
            </button>
            {claudeKeySet && (
              <button
                onClick={handleDeleteClaudeKey}
                className="p-1 rounded transition-colors"
                style={{ color: "var(--status-error)" }}
                title="Remove key"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
        <p className="text-[11px] font-mono" style={{ color: "var(--text-muted)" }}>
          ANTHROPIC_API_KEY — powers AI widget generation
        </p>

        {showClaudeKeyEdit && (
          <div className="mt-2 flex gap-2">
            <input
              type="password"
              value={claudeKeyInput}
              onChange={(e) => setClaudeKeyInput(e.target.value)}
              placeholder="sk-ant-..."
              className="flex-1 px-2 py-1.5 rounded text-xs font-mono"
              style={{
                background: "var(--surface-overlay)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-subtle)",
                outline: "none",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveClaudeKey();
                if (e.key === "Escape") { setShowClaudeKeyEdit(false); setClaudeKeyInput(""); }
              }}
              autoFocus
            />
            <button
              onClick={handleSaveClaudeKey}
              disabled={claudeKeySaving || !claudeKeyInput.trim()}
              className="px-2 py-1.5 rounded text-xs font-medium transition-colors"
              style={{
                background: "var(--accent-primary)",
                color: "var(--surface-base)",
                opacity: claudeKeySaving || !claudeKeyInput.trim() ? 0.5 : 1,
              }}
            >
              {claudeKeySaving ? "…" : <Check className="w-3 h-3" />}
            </button>
          </div>
        )}
      </div>

      {/* Existing keys */}
      <div className="space-y-2">
        {keys.length === 0 && !showAdd && (
          <div
            className="text-center py-6 text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            <Key className="w-8 h-8 mx-auto mb-2" style={{ opacity: 0.4 }} />
            <p>No API keys stored yet</p>
          </div>
        )}

        {keys.map((k) => (
          <div
            key={k.name}
            className="rounded-lg p-3"
            style={{
              background: "var(--surface-raised)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <span
                className="text-xs font-mono font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {k.name}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => toggleVisible(k.name)}
                  className="p-1 rounded transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  title={visibleKeys.has(k.name) ? "Hide" : "Show status"}
                >
                  {visibleKeys.has(k.name) ? (
                    <EyeOff className="w-3 h-3" />
                  ) : (
                    <Eye className="w-3 h-3" />
                  )}
                </button>
                <button
                  onClick={() => {
                    setEditingKey(editingKey === k.name ? null : k.name);
                    setEditValue("");
                  }}
                  className="p-1 rounded transition-colors"
                  style={{ color: "var(--accent-primary)" }}
                  title="Update key"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
                <button
                  onClick={() => handleDelete(k.name)}
                  className="p-1 rounded transition-colors"
                  style={{ color: "var(--status-error)" }}
                  title="Delete key"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className="text-[11px] font-mono"
                style={{ color: "var(--text-muted)" }}
              >
                {k.env_key}
              </span>
              {k.has_value && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{
                    background: "var(--status-ok)" + "22",
                    color: "var(--status-ok)",
                  }}
                >
                  set
                </span>
              )}
            </div>

            {/* Inline edit */}
            {editingKey === k.name && (
              <div className="mt-2 flex gap-2">
                <input
                  type="password"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  placeholder="New value..."
                  className="flex-1 px-2 py-1.5 rounded text-xs font-mono"
                  style={{
                    background: "var(--surface-overlay)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-subtle)",
                    outline: "none",
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleUpdate(k.name);
                    if (e.key === "Escape") setEditingKey(null);
                  }}
                  autoFocus
                />
                <button
                  onClick={() => handleUpdate(k.name)}
                  disabled={saving || !editValue.trim()}
                  className="px-2 py-1.5 rounded text-xs font-medium transition-colors"
                  style={{
                    background: "var(--accent-primary)",
                    color: "var(--surface-base)",
                    opacity: saving || !editValue.trim() ? 0.5 : 1,
                  }}
                >
                  <Check className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add new key */}
      {showAdd ? (
        <div
          className="rounded-lg p-3 space-y-2"
          style={{
            background: "var(--surface-raised)",
            border: "1px solid var(--accent-primary)" + "44",
          }}
        >
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Key name (e.g. OPENWEATHERMAP_KEY)"
            className="w-full px-2 py-1.5 rounded text-xs font-mono"
            style={{
              background: "var(--surface-overlay)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-subtle)",
              outline: "none",
            }}
            autoFocus
          />
          <input
            type="password"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="API key value"
            className="w-full px-2 py-1.5 rounded text-xs font-mono"
            style={{
              background: "var(--surface-overlay)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-subtle)",
              outline: "none",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
              if (e.key === "Escape") setShowAdd(false);
            }}
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                setShowAdd(false);
                setNewName("");
                setNewValue("");
              }}
              className="px-3 py-1.5 rounded text-xs transition-colors"
              style={{ color: "var(--text-muted)" }}
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={saving || !newName.trim() || !newValue.trim()}
              className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
              style={{
                background: "var(--accent-primary)",
                color: "var(--surface-base)",
                opacity:
                  saving || !newName.trim() || !newValue.trim() ? 0.5 : 1,
              }}
            >
              {saving ? "Saving..." : "Add Key"}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-medium transition-colors"
          style={{
            border: "1px dashed var(--border-subtle)",
            color: "var(--accent-primary)",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "var(--surface-raised)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "transparent")
          }
        >
          <Plus className="w-3.5 h-3.5" />
          Add API Key
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Notifications Tab
// ═══════════════════════════════════════════════════════════════════

function NotificationsTab() {
  const [settings, setSettings] = useState({
    enabled: true,
    when_minimized: true,
    sound: false,
  });
  const [loaded, setLoaded] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<"granted" | "denied" | "default">("default");
  const [requestingPermission, setRequestingPermission] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [autoStartEnabled, setAutoStartEnabled] = useState(false);

  useEffect(() => {
    getSettings()
      .then(({ settings: s }) => {
        if (s.notifications) {
          setSettings(s.notifications as typeof settings);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));

    getNotificationPermissionStatus()
      .then((status) => setPermissionStatus(status))
      .catch(() => setPermissionStatus("default"));

    isAutoStartEnabled()
      .then((enabled) => setAutoStartEnabled(enabled))
      .catch(() => setAutoStartEnabled(false));
  }, []);

  const save = useCallback(
    async (patch: Partial<typeof settings>) => {
      const updated = { ...settings, ...patch };
      setSettings(updated);
      try {
        await updateSettings({ notifications: updated });
      } catch {
        // silent fail
      }
    },
    [settings]
  );

  const handleRequestPermission = async () => {
    setRequestingPermission(true);
    try {
      const granted = await requestNotificationPermission();
      setPermissionStatus(granted ? "granted" : "denied");
    } finally {
      setRequestingPermission(false);
    }
  };

  const handleTestNotification = async () => {
    await sendNotification("Fwubbo Test", "Notifications are working!");
    setTestSent(true);
    setTimeout(() => setTestSent(false), 3000);
  };

  const handleAutoStartToggle = async (enabled: boolean) => {
    setAutoStartEnabled(enabled);
    try {
      if (enabled) {
        await enableAutoStart();
      } else {
        await disableAutoStart();
      }
    } catch (e) {
      console.warn("[fwubbo] Autostart toggle failed:", e);
      setAutoStartEnabled(!enabled);
    }
  };

  if (!loaded) return <LoadingPlaceholder />;

  return (
    <div className="space-y-4">
      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
        Control how and when Fwubbo sends notifications. Uses native system
        notifications in the desktop app, or browser notifications in dev mode.
      </p>

      {/* Permission status row */}
      <div
        className="rounded-lg px-3 py-2.5 space-y-2"
        style={{ background: "var(--surface-raised)" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {permissionStatus === "granted" ? (
              <ShieldCheck className="w-4 h-4 shrink-0" style={{ color: "var(--status-ok)" }} />
            ) : permissionStatus === "denied" ? (
              <ShieldOff className="w-4 h-4 shrink-0" style={{ color: "var(--status-error)" }} />
            ) : (
              <ShieldAlert className="w-4 h-4 shrink-0" style={{ color: "var(--status-warn)" }} />
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                OS permission:{" "}
                <span style={{
                  color: permissionStatus === "granted"
                    ? "var(--status-ok)"
                    : permissionStatus === "denied"
                    ? "var(--status-error)"
                    : "var(--text-muted)",
                }}>
                  {permissionStatus === "granted" ? "Granted" : permissionStatus === "denied" ? "Denied — check System Settings" : "Not yet granted"}
                </span>
              </p>
            </div>
          </div>
          {permissionStatus !== "granted" && (
            <button
              onClick={handleRequestPermission}
              disabled={requestingPermission}
              className="text-xs px-2.5 py-1 rounded shrink-0 ml-2 transition-opacity disabled:opacity-50"
              style={{
                background: "var(--accent-primary)",
                color: "var(--surface-base)",
              }}
            >
              {requestingPermission ? "Requesting…" : "Grant"}
            </button>
          )}
        </div>
        {permissionStatus === "granted" && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleTestNotification}
              className="text-xs px-2.5 py-1 rounded transition-opacity"
              style={{
                border: "1px solid var(--border-subtle)",
                color: "var(--text-secondary)",
              }}
            >
              {testSent ? "Sent!" : "Send test"}
            </button>
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              If nothing appears, check System Settings → Notifications
            </span>
          </div>
        )}
      </div>

      {isTauri() && (
        <ToggleRow
          label="Open at Login"
          description="Automatically launch Fwubbo when you log in to your Mac"
          checked={autoStartEnabled}
          onChange={handleAutoStartToggle}
        />
      )}
      <ToggleRow
        label="Enable notifications"
        description="Receive alerts from widgets that support notifications"
        checked={settings.enabled}
        onChange={(v) => save({ enabled: v })}
      />
      <ToggleRow
        label="Notify when minimized"
        description="Show notifications even when Fwubbo is in the system tray"
        checked={settings.when_minimized}
        onChange={(v) => save({ when_minimized: v })}
        disabled={!settings.enabled}
      />
      <ToggleRow
        label="Notification sound"
        description="Play a sound with notifications"
        checked={settings.sound}
        onChange={(v) => save({ sound: v })}
        disabled={!settings.enabled}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Profile Tab
// ═══════════════════════════════════════════════════════════════════

function ProfileTab() {
  const [profile, setProfile] = useState({
    name: "",
    location: "Atlanta",
    timezone: "",
    interests: [] as string[],
  });
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [interestInput, setInterestInput] = useState("");

  useEffect(() => {
    getSettings()
      .then(({ settings: s }) => {
        if (s.profile) {
          setProfile(s.profile as typeof profile);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await updateSettings({ profile });
      setDirty(false);
    } catch {
      // silent fail
    }
    setSaving(false);
  };

  const update = (patch: Partial<typeof profile>) => {
    setProfile((p) => ({ ...p, ...patch }));
    setDirty(true);
  };

  const addInterest = () => {
    const trimmed = interestInput.trim();
    if (trimmed && !profile.interests.includes(trimmed)) {
      update({ interests: [...profile.interests, trimmed] });
      setInterestInput("");
    }
  };

  const removeInterest = (i: number) => {
    update({ interests: profile.interests.filter((_, idx) => idx !== i) });
  };

  if (!loaded) return <LoadingPlaceholder />;

  return (
    <div className="space-y-4">
      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
        Your profile info is used to personalize widget generation. Claude will
        use your location, interests, and preferences when creating widgets.
      </p>

      <InputRow
        label="Name"
        value={profile.name}
        onChange={(v) => update({ name: v })}
        placeholder="Your name"
      />
      <InputRow
        label="Location"
        value={profile.location}
        onChange={(v) => update({ location: v })}
        placeholder="City, Country"
      />
      <InputRow
        label="Timezone"
        value={profile.timezone}
        onChange={(v) => update({ timezone: v })}
        placeholder="e.g. America/New_York"
      />

      {/* Interests */}
      <div>
        <label
          className="text-xs font-medium block mb-1.5"
          style={{ color: "var(--text-secondary)" }}
        >
          Interests
        </label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {profile.interests.map((interest, i) => (
            <span
              key={i}
              className="text-[11px] px-2 py-1 rounded-full flex items-center gap-1"
              style={{
                background: "var(--surface-overlay)",
                color: "var(--text-secondary)",
              }}
            >
              {interest}
              <button
                onClick={() => removeInterest(i)}
                className="ml-0.5"
                style={{ color: "var(--text-muted)" }}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={interestInput}
            onChange={(e) => setInterestInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addInterest();
            }}
            placeholder="Add an interest..."
            className="flex-1 px-2 py-1.5 rounded text-xs"
            style={{
              background: "var(--surface-overlay)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-subtle)",
              outline: "none",
            }}
          />
          <button
            onClick={addInterest}
            className="p-1.5 rounded transition-colors"
            style={{ color: "var(--accent-primary)" }}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Save button */}
      {dirty && (
        <button
          onClick={save}
          disabled={saving}
          className="w-full py-2 rounded-lg text-xs font-medium transition-colors"
          style={{
            background: "var(--accent-primary)",
            color: "var(--surface-base)",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Saving..." : "Save Profile"}
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Shared sub-components
// ═══════════════════════════════════════════════════════════════════

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="flex items-start justify-between gap-3 py-2"
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <div>
        <p
          className="text-sm font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          {label}
        </p>
        <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
          {description}
        </p>
      </div>
      <button
        onClick={() => !disabled && onChange(!checked)}
        className="shrink-0 w-9 h-5 rounded-full transition-colors relative"
        style={{
          background: checked ? "var(--accent-primary)" : "var(--surface-overlay)",
          border: "1px solid var(--border-subtle)",
        }}
        disabled={disabled}
      >
        <div
          className="w-3.5 h-3.5 rounded-full transition-transform absolute top-[2px]"
          style={{
            background: checked ? "var(--surface-base)" : "var(--text-muted)",
            transform: checked ? "translateX(17px)" : "translateX(2px)",
          }}
        />
      </button>
    </div>
  );
}

function InputRow({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label
        className="text-xs font-medium block mb-1.5"
        style={{ color: "var(--text-secondary)" }}
      >
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2.5 py-2 rounded-lg text-xs"
        style={{
          background: "var(--surface-raised)",
          color: "var(--text-primary)",
          border: "1px solid var(--border-subtle)",
          outline: "none",
        }}
      />
    </div>
  );
}

function LoadingPlaceholder() {
  return (
    <div
      className="text-xs py-8 text-center"
      style={{ color: "var(--text-muted)" }}
    >
      Loading settings...
    </div>
  );
}
