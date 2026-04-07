use serde::Serialize;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{
    Emitter, Manager, RunEvent, WindowEvent,
};

#[cfg(unix)]
use std::os::unix::process::CommandExt as _;

mod tray;

/// Global handle to the Python backend process so we can kill it on exit.
struct BackendProcess(Mutex<Option<Child>>);

/// System information returned to the frontend.
#[derive(Serialize, Clone)]
pub struct SystemInfo {
    pub hostname: String,
    pub os_name: String,
    pub os_version: String,
    pub cpu_count: usize,
    pub total_memory_mb: u64,
    pub used_memory_mb: u64,
    pub cpu_usage_percent: f32,
    pub uptime_secs: u64,
}

/// Tauri command: get live system information for dashboard widgets.
#[tauri::command]
fn get_system_info() -> SystemInfo {
    use sysinfo::System;

    let mut sys = System::new_all();
    sys.refresh_all();

    SystemInfo {
        hostname: System::host_name().unwrap_or_else(|| "unknown".into()),
        os_name: System::name().unwrap_or_else(|| "unknown".into()),
        os_version: System::os_version().unwrap_or_else(|| "unknown".into()),
        cpu_count: sys.cpus().len(),
        total_memory_mb: sys.total_memory() / 1_048_576,
        used_memory_mb: sys.used_memory() / 1_048_576,
        cpu_usage_percent: sys.global_cpu_usage(),
        uptime_secs: System::uptime(),
    }
}

/// Tauri command: check if the Python backend is running (health check).
#[tauri::command]
async fn check_backend_health() -> Result<bool, String> {
    match reqwest::get("http://127.0.0.1:9120/api/health").await {
        Ok(resp) => Ok(resp.status().is_success()),
        Err(_) => Ok(false),
    }
}

/// Tauri command: kill the existing backend process and restart it.
#[tauri::command]
async fn restart_backend(state: tauri::State<'_, BackendProcess>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut child) = *guard {
        eprintln!("[fwubbo] Restarting backend (killing pid {})", child.id());
        let _ = child.kill();
        let _ = child.wait();
    }
    *guard = None;
    // Brief pause so the port is released before re-binding.
    std::thread::sleep(std::time::Duration::from_millis(800));
    *guard = spawn_backend();
    Ok(())
}

/// Spawn the Python FastAPI backend as a child process.
fn spawn_backend() -> Option<Child> {
    // Highest-priority candidate: path baked in at compile time.
    // This is the absolute path to backend/ on the machine where the app was
    // built, so launching the .app from Finder (cwd="/") still works.
    let compiled_path = std::path::PathBuf::from(env!("FWUBBO_BACKEND_PATH"));

    // Runtime fallbacks for dev mode and relocated bundles.
    let runtime_candidates = {
        let cwd = std::env::current_dir().unwrap_or_default();
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .unwrap_or_default();

        vec![
            cwd.join("backend"),                          // project_root/backend
            cwd.parent().map(|p| p.join("backend")).unwrap_or_default(),
            // macOS .app bundle: Contents/MacOS/../Resources/backend
            exe_dir.join("../Resources/backend"),
            // dev: exe is src-tauri/target/release/fwubbo → 3 levels up
            exe_dir.join("../../../backend"),
            exe_dir.join("backend"),
        ]
    };

    let all_candidates = std::iter::once(compiled_path).chain(runtime_candidates);

    let backend_dir = match all_candidates.into_iter().find(|p| p.is_dir()) {
        Some(p) => p,
        None => {
            eprintln!("[fwubbo] Backend directory not found (checked cwd, parent, exe dir)");
            return None;
        }
    };

    eprintln!("[fwubbo] Starting backend from: {:?}", backend_dir);

    // Prefer the venv python (absolute path, works even with minimal $PATH at login).
    // Fall back to system python3/python if venv isn't present.
    let venv_python = backend_dir.join("venv/bin/python3");
    let python: std::ffi::OsString = if venv_python.exists() {
        venv_python.into_os_string()
    } else {
        "python3".into()
    };

    let mut cmd = Command::new(&python);
    cmd.args(["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "9120"])
        .current_dir(&backend_dir)
        // Broad PATH for the autostart/LaunchAgent scenario (minimal env at login)
        .env("PATH", "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin")
        // Suppress output — prevents macOS from opening Terminal.app
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .stdin(Stdio::null());

    // Detach from parent's process group so macOS doesn't associate
    // the child with a terminal window.
    #[cfg(unix)]
    cmd.process_group(0);

    match cmd.spawn() {
        Ok(child) => {
            eprintln!("[fwubbo] Backend started (pid {})", child.id());
            Some(child)
        }
        Err(e) => {
            eprintln!("[fwubbo] Failed to start backend: {}", e);
            None
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Spawn backend before Tauri starts
    let backend_child = spawn_backend();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::AppleScript,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .manage(BackendProcess(Mutex::new(backend_child)))
        .invoke_handler(tauri::generate_handler![
            get_system_info,
            check_backend_health,
            restart_backend,
        ])
        .setup(|app| {
            // Check for --minimized flag (autostart scenario)
            let start_minimized = std::env::args().any(|a| a == "--minimized");

            if start_minimized {
                // Hide the window, it's running from tray
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            // Set up the tray icon menu
            tray::setup_tray(app)?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Error building Fwubbo");

    app.run(|app_handle, event| match event {
        // When the user clicks the X button, hide to tray instead of quitting
        RunEvent::WindowEvent {
            label,
            event: WindowEvent::CloseRequested { api, .. },
            ..
        } => {
            if label == "main" {
                api.prevent_close();
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.hide();
                }
                // Emit event so frontend knows we're in tray mode
                let _ = app_handle.emit("window-hidden", ());
            }
        }

        // Clean up backend on exit
        RunEvent::Exit => {
            let state = app_handle.state::<BackendProcess>();
            if let Ok(mut guard) = state.0.lock() {
                if let Some(ref mut child) = *guard {
                    eprintln!("[fwubbo] Killing backend (pid {})", child.id());
                    let _ = child.kill();
                    let _ = child.wait();
                }
            };
        }

        _ => {}
    });
}
