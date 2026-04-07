use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconEvent,
    Manager,
};

/// Set up the system tray icon and its context menu.
pub fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let tray = app.tray_by_id("fwubbo-tray");

    if let Some(tray) = tray {
        // Build the tray context menu
        let show = MenuItemBuilder::with_id("show", "Show Fwubbo").build(app)?;
        let hide = MenuItemBuilder::with_id("hide", "Hide to Tray").build(app)?;
        let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

        let menu = MenuBuilder::new(app)
            .item(&show)
            .item(&hide)
            .separator()
            .item(&quit)
            .build()?;

        tray.set_menu(Some(menu))?;

        // Handle tray menu clicks
        tray.on_menu_event(move |app_handle, event| {
            match event.id().as_ref() {
                "show" => {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                }
                "hide" => {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.hide();
                    }
                }
                "quit" => {
                    app_handle.exit(0);
                }
                _ => {}
            }
        });

        // Double-click tray icon to show window
        tray.on_tray_icon_event(|tray, event| {
            match event {
                TrayIconEvent::DoubleClick { .. } => {
                    let app = tray.app_handle();
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                }
                _ => {}
            }
        });
    }

    Ok(())
}
