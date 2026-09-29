//! Integration with the desktop environment.

use crate::settings::ThemePreference;
use tauri::Theme;
use tauri::window::Color;

/// The theme the window opens in, before the frontend has loaded the settings.
pub fn initial_theme(preference: ThemePreference) -> Theme {
    match preference {
        ThemePreference::Light => Theme::Light,
        ThemePreference::Dark => Theme::Dark,
        ThemePreference::System | ThemePreference::Unknown => system_theme().unwrap_or(Theme::Light),
    }
}

/// The app background for a theme (`--ln-bg` in `src/styles/globals.css`), shown
/// until the page paints so the window never flashes a different colour.
pub fn background_color(theme: Theme) -> Color {
    if theme == Theme::Dark { Color(0x1b, 0x1b, 0x1b, 0xff) } else { Color(0xfa, 0xf9, 0xf6, 0xff) }
}

/// The `data-theme` value the page uses for a theme.
pub fn theme_name(theme: Theme) -> &'static str {
    if theme == Theme::Dark { "dark" } else { "light" }
}

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

    #[test]
    fn explicit_theme_preferences_ignore_the_desktop() {
        assert_eq!(initial_theme(ThemePreference::Light), Theme::Light);
        assert_eq!(initial_theme(ThemePreference::Dark), Theme::Dark);
        assert_eq!(theme_name(Theme::Dark), "dark");
        assert_eq!(theme_name(Theme::Light), "light");
    }

    #[test]
    fn background_matches_the_css_tokens() {
        let css = include_str!("../../src/styles/globals.css");
        for theme in [Theme::Light, Theme::Dark] {
            let Color(r, g, b, _) = background_color(theme);
            let token = format!("--ln-bg: #{r:02x}{g:02x}{b:02x};");
            assert!(css.contains(&token), "globals.css has no `{token}`");
        }
    }

    /// Talks to the real desktop session: `cargo test live_portal -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn live_portal() {
        println!("desktop colour preference: {:?}", system_theme());
    }
}
