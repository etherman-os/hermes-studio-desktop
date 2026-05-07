use std::{env, fs, path::PathBuf};

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WebviewWindowBuilder, WebviewUrl,
};

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
    title: Option<String>,
) -> Result<String, String> {
    let label = "preview";
    let window_title = title.unwrap_or_else(|| "Preview – Hermes Studio".to_string());

    if let Some(window) = app.get_webview_window(label) {
        let _ = window.show();
        let _ = window.set_focus();
        if !url.is_empty() {
            let _ = app.emit("preview:navigate", &url);
        }
        return Ok(label.to_string());
    }

    let escaped_url = url.replace('\\', "\\\\").replace('\'', "\\'");
    let init_script = format!(
        "window.__PREVIEW_INITIAL_URL = '{}';",
        escaped_url
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
    let new_run_item = MenuItemBuilder::with_id("new_run", "New Run").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show_item)
        .item(&hide_item)
        .separator()
        .item(&new_run_item)
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
            "new_run" => {
                let _ = app.emit("tray:new-run", ());
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            get_adapter_auth_token,
            send_notification,
            open_preview_window,
            close_preview_window
        ])
        .setup(|app| {
            setup_system_tray(app.handle())?;

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
