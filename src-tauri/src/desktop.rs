//! Integration with the desktop environment.

use tauri::Theme;

/// The desktop's light/dark preference, read from the XDG settings portal
/// (`org.freedesktop.appearance` → `color-scheme`). This works on the host and
/// inside Flatpak and Snap sandboxes. `None` means the desktop states no
/// preference or has no portal.
#[cfg(target_os = "linux")]
pub fn system_theme() -> Option<Theme> {
    use dbus::arg::Variant;
    use dbus::blocking::Connection;
    use std::time::Duration;

    let conn = Connection::new_session().ok()?;
    let proxy = conn.with_proxy(
        "org.freedesktop.portal.Desktop",
        "/org/freedesktop/portal/desktop",
        Duration::from_millis(1500),
    );
    let key = ("org.freedesktop.appearance", "color-scheme");
    let value = proxy
        .method_call::<(Variant<u32>,), _, _, _>("org.freedesktop.portal.Settings", "ReadOne", key)
        .map(|(v,)| v.0)
        // Portals older than version 2 only have the double-wrapped `Read`.
        .or_else(|_| {
            proxy
                .method_call::<(Variant<Variant<u32>>,), _, _, _>("org.freedesktop.portal.Settings", "Read", key)
                .map(|(v,)| v.0.0)
        })
        .ok()?;
    theme_from_color_scheme(value)
}

#[cfg(not(target_os = "linux"))]
pub fn system_theme() -> Option<Theme> {
    None
}

/// `color-scheme`: 0 = no preference, 1 = prefer dark, 2 = prefer light.
fn theme_from_color_scheme(value: u32) -> Option<Theme> {
    match value {
        1 => Some(Theme::Dark),
        2 => Some(Theme::Light),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_portal_color_scheme() {
        assert_eq!(theme_from_color_scheme(1), Some(Theme::Dark));
        assert_eq!(theme_from_color_scheme(2), Some(Theme::Light));
        assert_eq!(theme_from_color_scheme(0), None);
        assert_eq!(theme_from_color_scheme(7), None);
    }

    /// Talks to the real desktop session: `cargo test live_portal -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn live_portal() {
        println!("desktop colour preference: {:?}", system_theme());
    }
}
