use std::{
    env,
    fs,
    io::{BufRead, BufReader, Write as IoWrite},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::atomic::{AtomicBool, Ordering},
    sync::Mutex,
    thread,
    time::Duration,
};

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WebviewWindowBuilder, WebviewUrl,
};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

const ADAPTER_PORT: u16 = 39191;
const ADAPTER_HEALTH_PATH: &str = "/studio/health";
const ADAPTER_START_TIMEOUT_MS: u64 = 30_000;
const ADAPTER_POLL_INTERVAL_MS: u64 = 250;

// Global adapter process handle
static ADAPTER_PROCESS: Mutex<Option<Child>> = Mutex::new(None);
static ADAPTER_READY: AtomicBool = AtomicBool::new(false);
static ADAPTER_STARTED: AtomicBool = AtomicBool::new(false);

// --------------------------------------------------------------------------
// Adapter process management
// --------------------------------------------------------------------------

/// Find the Python interpreter to use for the adapter
fn find_python_interpreter() -> Result<String, String> {
    // Check PYTHON_HOME first
    if let Ok(python_home) = env::var("PYTHON_HOME") {
        let python_exe = Path::new(&python_home).join("bin").join("python3");
        if python_exe.exists() {
            return Ok(python_exe.to_string_lossy().to_string());
        }
        let python_exe_win = Path::new(&python_home).join("python.exe");
        if python_exe_win.exists() {
            return Ok(python_exe_win.to_string_lossy().to_string());
        }
    }

    // Try `python3` first (Linux/macOS)
    if let Ok(path) = Command::new("which").arg("python3").output() {
        if path.status.success() {
            let python_path = String::from_utf8_lossy(&path.stdout).trim().to_string();
            if !python_path.is_empty() {
                return Ok(python_path);
            }
        }
    }

    // Fall back to `python`
    if let Ok(path) = Command::new("which").arg("python").output() {
        if path.status.success() {
            let python_path = String::from_utf8_lossy(&path.stdout).trim().to_string();
            if !python_path.is_empty() {
                return Ok(python_path);
            }
        }
    }

    // Windows fallback
    for python_exe in ["python.exe", "python3.exe"] {
        if Command::new("where").arg(python_exe).output().map(|o| o.status.success()).unwrap_or(false) {
            return Ok(python_exe.to_string());
        }
    }

    Err("Python interpreter not found".to_string())
}

/// Find the adapter module path
fn find_adapter_module_path() -> Result<PathBuf, String> {
    // Check for HERMES_ADAPTER_PATH env var first
    if let Ok(adapter_path) = env::var("HERMES_ADAPTER_PATH") {
        let path = PathBuf::from(adapter_path);
        if path.exists() {
            return Ok(path);
        }
    }

    // Try to find via the hermes_adapter package location
    let workdir = env::current_dir().unwrap_or_default();
    let candidates = [
        workdir.join("packages").join("hermes_adapter").join("hermes_adapter"),
        workdir.join("hermes_adapter"),
        PathBuf::from("/home/etherman/Projects/hermes_shell/packages/hermes_adapter/hermes_adapter"),
    ];

    for candidate in &candidates {
        let server_py = candidate.join("server.py");
        let init_py = candidate.join("__init__.py");
        if server_py.exists() || init_py.exists() {
            return Ok(candidate.clone());
        }
    }

    // Try to find using `python -c "import hermes_adapter; print(...)"`
    if let Ok(python) = find_python_interpreter() {
        if let Ok(output) = Command::new(&python)
            .args(["-c", "import hermes_adapter; print(hermes_adapter.__file__)"])
            .output()
        {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    let p = PathBuf::from(&path);
                    if p.exists() {
                        return Ok(p.parent().unwrap_or(&p).to_path_buf());
                    }
                }
            }
        }
    }

    Err("Could not locate hermes_adapter module".to_string())
}

/// Check if the adapter port is already in use
fn is_port_in_use(port: u16) -> bool {
    use std::net::TcpStream;
    TcpStream::connect(format!("127.0.0.1:{port}")).is_ok()
}

/// Check if adapter is already running at 127.0.0.1:39191
fn is_adapter_already_running() -> bool {
    is_port_in_use(ADAPTER_PORT)
}

/// Perform a quick HTTP health check against the adapter
fn check_adapter_http_health() -> bool {
    let url = format!("http://127.0.0.1:{}{}", ADAPTER_PORT, ADAPTER_HEALTH_PATH);
    if let Ok(response) = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .and_then(|client| client.get(&url).send())
    {
        response.status().is_success()
    } else {
        false
    }
}

/// Check if the adapter process is still running
fn is_adapter_process_running() -> bool {
    let guard = ADAPTER_PROCESS.lock().unwrap();
    if let Some(ref mut child) = *guard {
        child.try_wait().ok().map(|status| status.is_none()).unwrap_or(false)
    } else {
        false
    }
}

/// Log adapter stdout/stderr from a child process in a background thread
fn log_adapter_output(stdout: Option<fs::File>, stderr: Option<fs::File>, log_path: PathBuf) {
    thread::spawn(move || {
        let _ = fs::create_dir_all(&log_path);
        if let Some(mut out) = stdout {
            let path = log_path.join("adapter_stdout.log");
            if let Ok(mut file) = fs::File::create(&path) {
                let mut buf = [0u8; 4096];
                loop {
                    match out.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => { let _ = file.write_all(&buf[..n]); }
                        Err(_) => break,
                    }
                }
            }
        }
        if let Some(mut err) = stderr {
            let path = log_path.join("adapter_stderr.log");
            if let Ok(mut file) = fs::File::create(&path) {
                let mut buf = [0u8; 4096];
                loop {
                    match err.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => { let _ = file.write_all(&buf[..n]); }
                        Err(_) => break,
                    }
                }
            }
        }
    });
}

/// Wait for the adapter to become ready via polling
fn wait_for_adapter_ready(timeout_ms: u64) -> Result<(), String> {
    let start = std::time::Instant::now();
    let poll_interval = Duration::from_millis(ADAPTER_POLL_INTERVAL_MS);

    while start.elapsed().as_millis() as u64 < timeout_ms {
        if check_adapter_http_health() {
            return Ok(());
        }
        thread::sleep(poll_interval);
    }

    Err(format!(
        "Adapter did not become ready within {}ms",
        timeout_ms
    ))
}

/// Start the Python adapter as a child process
fn start_adapter_process() -> Result<Child, String> {
    let python = find_python_interpreter()?;
    let module_path = find_adapter_module_path()?;

    // Build command: python -m hermes_adapter.server
    // We run from the parent of hermes_adapter so the module resolves correctly
    let adapter_parent = module_path.parent().ok_or("Invalid adapter path")?;

    // Set PYTHONPATH to the parent of hermes_adapter so `-m hermes_adapter` resolves
    let pythonpath = adapter_parent.to_string_lossy().to_string();

    // Collect env vars to set
    let mut extra_env: Vec<(String, String)> = vec![
        ("PYTHONPATH".to_string(), pythonpath.clone()),
    ];

    // Preserve existing token or let adapter generate one
    if let Ok(token) = env::var("HERMES_STUDIO_ADAPTER_TOKEN") {
        if !token.trim().is_empty() {
            extra_env.push(("HERMES_STUDIO_ADAPTER_TOKEN".to_string(), token));
        }
    } else if let Ok(token) = env::var("HERMES_STUDIO_TOKEN") {
        if !token.trim().is_empty() {
            extra_env.push(("HERMES_STUDIO_TOKEN".to_string(), token));
        }
    }

    let mut cmd = Command::new(&python);
    cmd.current_dir(adapter_parent)
        .args(["-m", "hermes_adapter.server"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Set PYTHONPATH
    cmd.env("PYTHONPATH", &pythonpath);
    for (key, value) in extra_env {
        cmd.env(&key, &value);
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let child = cmd.spawn().map_err(|e| format!("Failed to spawn adapter process: {}", e))?;
    Ok(child)
}

/// Stop the adapter process
fn stop_adapter_process() {
    let mut guard = ADAPTER_PROCESS.lock().unwrap();
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    ADAPTER_READY.store(false, Ordering::SeqCst);
    ADAPTER_STARTED.store(false, Ordering::SeqCst);
}

/// Emit adapter status event to the frontend
fn emit_adapter_status(app: &AppHandle, status: &str, message: &str) {
    let payload = serde_json::json!({
        "status": status,
        "message": message,
        "timestamp": chrono::Utc::now().to_rfc3339(),
    });
    let _ = app.emit("adapter:status", payload);
}

// --------------------------------------------------------------------------
// Tauri commands for adapter management
// --------------------------------------------------------------------------

#[tauri::command]
fn get_adapter_status() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "running": is_adapter_process_running() || is_adapter_already_running(),
        "ready": ADAPTER_READY.load(Ordering::SeqCst),
        "started": ADAPTER_STARTED.load(Ordering::SeqCst),
        "port": ADAPTER_PORT,
    }))
}

#[tauri::command]
fn ensure_adapter_running(app: AppHandle) -> Result<serde_json::Value, String> {
    // Already running and ready
    if (is_adapter_already_running() || is_adapter_process_running()) && ADAPTER_READY.load(Ordering::SeqCst) {
        return Ok(serde_json::json!({
            "status": "ready",
            "message": "Adapter already running",
            "running": true,
            "ready": true,
        }));
    }

    // Already started but not ready yet - poll until ready or timeout
    if ADAPTER_STARTED.load(Ordering::SeqCst) {
        match wait_for_adapter_ready(5_000) {
            Ok(()) => {
                ADAPTER_READY.store(true, Ordering::SeqCst);
                emit_adapter_status(&app, "ready", "Adapter is ready");
                return Ok(serde_json::json!({
                    "status": "ready",
                    "message": "Adapter is ready",
                    "running": true,
                    "ready": true,
                }));
            }
            Err(e) => {
                return Ok(serde_json::json!({
                    "status": "starting",
                    "message": e,
                    "running": false,
                    "ready": false,
                }));
            }
        }
    }

    emit_adapter_status(&app, "starting", "Starting Hermes adapter...");
    ADAPTER_STARTED.store(true, Ordering::SeqCst);

    // Start the adapter process
    let child = start_adapter_process().map_err(|e| {
        ADAPTER_STARTED.store(false, Ordering::SeqCst);
        emit_adapter_status(&app, "error", &format!("Failed to start adapter: {}", e));
        e
    })?;

    // Set up logging
    let log_dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("hermes-desktop-studio")
        .join("logs");
    let _ = fs::create_dir_all(&log_dir);

    // Log output in background - take stdout/stderr before storing child
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    log_adapter_output(stdout, stderr, log_dir);

    // Store the child process handle
    {
        let mut guard = ADAPTER_PROCESS.lock().unwrap();
        *guard = Some(child);
    }

    // Wait for adapter to become ready
    match wait_for_adapter_ready(ADAPTER_START_TIMEOUT_MS) {
        Ok(()) => {
            ADAPTER_READY.store(true, Ordering::SeqCst);
            emit_adapter_status(&app, "ready", "Adapter started successfully");
            Ok(serde_json::json!({
                "status": "ready",
                "message": "Adapter started successfully",
                "running": true,
                "ready": true,
            }))
        }
        Err(e) => {
            ADAPTER_STARTED.store(false, Ordering::SeqCst);
            emit_adapter_status(&app, "error", &format!("Adapter failed to start: {}", e));
            Err(e)
        }
    }
}

#[tauri::command]
fn stop_adapter() -> Result<(), String> {
    stop_adapter_process();
    Ok(())
}

#[tauri::command]
fn run_hermes_cli(args: Vec<String>) -> Result<String, String> {
    let output = Command::new("hermes")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to run hermes CLI: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        Err(if stderr.is_empty() {
            format!("hermes {} failed (exit {}): {}", args.join(" "), output.status.code().unwrap_or(-1), stdout)
        } else {
            format!("hermes {} failed (exit {}): {}", args.join(" "), output.status.code().unwrap_or(-1), stderr)
        })
    }
}

fn adapter_token_path() -> Result<PathBuf, String> {
    let home = env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .ok_or_else(|| "Home directory is unavailable; cannot locate adapter auth token".to_string())?;

    Ok(PathBuf::from(home)
        .join(".hermes-local-shell")
        .join("runtime")
        .join("token"))
}

#[tauri::command]
fn get_adapter_auth_token() -> Result<String, String> {
    for key in ["HERMES_STUDIO_ADAPTER_TOKEN", "HERMES_STUDIO_TOKEN"] {
        if let Ok(token) = env::var(key) {
            let trimmed = token.trim();
            if !trimmed.is_empty() {
                return Ok(trimmed.to_string());
            }
        }
    }

    let path = adapter_token_path()?;
    let token = fs::read_to_string(&path)
        .map_err(|err| format!("Adapter auth token unavailable at {}: {err}", path.display()))?;
    let trimmed = token.trim();
    if trimmed.is_empty() {
        return Err(format!("Adapter auth token file is empty: {}", path.display()));
    }

    Ok(trimmed.to_string())
}

#[tauri::command]
fn send_notification(app: AppHandle, title: String, body: String) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| format!("Failed to send notification: {e}"))
}

#[tauri::command]
fn open_preview_window(
    app: AppHandle,
    url: String,
    html: Option<String>,
    title: Option<String>,
) -> Result<String, String> {
    let label = "preview";
    let window_title = title.unwrap_or_else(|| "Preview – Hermes Studio".to_string());

    if let Some(window) = app.get_webview_window(label) {
        let _ = window.show();
        let _ = window.set_focus();
        if let Some(html) = html.as_ref().filter(|value| !value.is_empty()) {
            let _ = app.emit("preview:html", html);
        } else if !url.is_empty() {
            let _ = app.emit("preview:navigate", &url);
        }
        return Ok(label.to_string());
    }

    let has_html = html.as_ref().is_some_and(|value| !value.is_empty());
    if !has_html && !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("Preview windows only support http and https URLs or sanitized artifact HTML".to_string());
    }

    let encoded_url = serde_json::to_string(&url)
        .map_err(|e| format!("Failed to encode preview URL: {e}"))?;
    let encoded_html = serde_json::to_string(&html.unwrap_or_default())
        .map_err(|e| format!("Failed to encode preview HTML: {e}"))?;
    let init_script = format!(
        "window.__PREVIEW_INITIAL_URL = {encoded_url}; window.__PREVIEW_INITIAL_HTML = {encoded_html};"
    );

    let _window = WebviewWindowBuilder::new(&app, label, WebviewUrl::App("/".into()))
        .title(&window_title)
        .inner_size(800.0, 600.0)
        .min_inner_size(400.0, 300.0)
        .resizable(true)
        .initialization_script(&init_script)
        .build()
        .map_err(|e| format!("Failed to create preview window: {e}"))?;

    Ok(label.to_string())
}

#[tauri::command]
fn close_preview_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("preview") {
        window.close().map_err(|e| format!("Failed to close preview window: {e}"))?;
    }
    Ok(())
}

fn setup_system_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let show_item = MenuItemBuilder::with_id("show", "Show Window").build(app)?;
    let hide_item = MenuItemBuilder::with_id("hide", "Hide Window").build(app)?;
    let quick_create_item = MenuItemBuilder::with_id("quick_create", "Quick Create").build(app)?;
    let quick_code_item = MenuItemBuilder::with_id("quick_code", "Quick Code").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show_item)
        .item(&hide_item)
        .separator()
        .item(&quick_create_item)
        .item(&quick_code_item)
        .separator()
        .item(&quit_item)
        .build()?;

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .tooltip("Hermes Desktop Studio")
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "hide" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            "quick_create" => {
                let payload = serde_json::json!({"mode": "create"});
                let _ = app.emit("tray:quick-create", payload);
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quick_code" => {
                let payload = serde_json::json!({"mode": "code"});
                let _ = app.emit("tray:quick-code", payload);
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

/// Handle deep-link URLs in the format: hermes-studio://studio/{mode}/{surface}
/// Example: hermes-studio://studio/code/runs -> mode=code, surface=runs
fn handle_deep_link(app: &AppHandle, urls: Vec<String>) {
    for url in urls {
        if let Some(path) = url.strip_prefix("hermes-studio://studio/") {
            let parts: Vec<&str> = path.split('/').collect();
            if parts.len() == 2 {
                let mode = parts[0];
                let surface = parts[1];
                let payload = serde_json::json!({
                    "mode": mode,
                    "surface": surface
                });
                let _ = app.emit("deep-link:navigate", payload);
            }
        }
    }
}

fn setup_global_shortcut(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let shortcut: Shortcut = "CmdOrCtrl+Shift+H".parse()?;

    app.global_shortcut().on_shortcut(shortcut, move |app, _shortcut, _event| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        }
    })?;

    Ok(())
}

// --------------------------------------------------------------------------
// Auto-start the adapter when the Tauri app starts
// --------------------------------------------------------------------------

fn auto_start_adapter(app: &AppHandle) {
    // Skip if already running
    if is_adapter_already_running() {
        eprintln!("[adapter] Adapter already running on port {}, skipping auto-start", ADAPTER_PORT);
        ADAPTER_READY.store(true, Ordering::SeqCst);
        ADAPTER_STARTED.store(true, Ordering::SeqCst);
        emit_adapter_status(app, "ready", "Adapter already running");
        return;
    }

    eprintln!("[adapter] Auto-starting Hermes adapter...");
    emit_adapter_status(app, "starting", "Auto-starting Hermes adapter...");

    // Spawn adapter in background thread
    let app_handle = app.clone();
    thread::spawn(move || {
        match start_adapter_process() {
            Ok(child) => {
                // Log output before storing handle
                let log_dir = dirs::data_local_dir()
                    .unwrap_or_else(|| PathBuf::from("."))
                    .join("hermes-desktop-studio")
                    .join("logs");
                let _ = fs::create_dir_all(&log_dir);
                let stdout = child.stdout.take();
                let stderr = child.stderr.take();
                log_adapter_output(stdout, stderr, log_dir);

                {
                    let mut guard = ADAPTER_PROCESS.lock().unwrap();
                    *guard = Some(child);
                }
                ADAPTER_STARTED.store(true, Ordering::SeqCst);

                match wait_for_adapter_ready(ADAPTER_START_TIMEOUT_MS) {
                    Ok(()) => {
                        ADAPTER_READY.store(true, Ordering::SeqCst);
                        emit_adapter_status(&app_handle, "ready", "Adapter auto-started and ready");
                        eprintln!("[adapter] Auto-started adapter is ready");
                    }
                    Err(e) => {
                        ADAPTER_READY.store(false, Ordering::SeqCst);
                        emit_adapter_status(&app_handle, "error", &format!("Adapter failed to become ready: {}", e));
                        eprintln!("[adapter] Adapter failed to become ready: {}", e);
                    }
                }
            }
            Err(e) => {
                ADAPTER_STARTED.store(false, Ordering::SeqCst);
                emit_adapter_status(&app_handle, "error", &format!("Failed to start adapter: {}", e));
                eprintln!("[adapter] Failed to auto-start adapter: {}", e);
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .deep_link_handler(handle_deep_link)
        .invoke_handler(tauri::generate_handler![
            get_adapter_auth_token,
            send_notification,
            open_preview_window,
            close_preview_window,
            get_adapter_status,
            ensure_adapter_running,
            stop_adapter,
            run_hermes_cli
        ])
        .setup(|app| {
            setup_system_tray(app.handle())?;
            setup_global_shortcut(app.handle())?;

            // Auto-start the adapter
            auto_start_adapter(app.handle());

            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}