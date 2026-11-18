//! What is on the clipboard, for a paste that reached the page empty.
//!
//! On Linux, WebKitGTK 2.50 gives the page a paste event with nothing in it
//! when the clipboard holds a picture: no file, no type, and no text either
//! when the clipboard holds text beside the picture. (WebKitGTK 2.54 hands
//! both over, as the engines on Windows and macOS do.) The editor then asks
//! here for what was meant to be pasted.
//!
//! The page is not a trusted caller: note content, themes, snippets and
//! plugins all run in it (see `scope`). A command that returned whatever is
//! on the clipboard would let any of them read a screenshot or a password
//! the user copied for another program. So the clipboard goes out only
//! through a gate that the page cannot open. The window itself has to have
//! seen the paste keys pressed a moment ago, and one press gives one answer.
//!
//! What is left: a script in the page can ask in that moment and get what
//! the user is pasting into the app.

// Only Linux opens the gate and reads the clipboard; elsewhere the page is
// handed the paste itself, and most of this file is not called.
#![cfg_attr(not(target_os = "linux"), allow(dead_code))]

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[cfg(target_os = "linux")]
use base64::Engine as _;

use crate::AppState;

/// How long after the keys the clipboard may be asked for. The page asks as
/// soon as its paste event arrives; the rest is room for a busy machine.
const OPEN_FOR: Duration = Duration::from_millis(1500);

/// The most that is handed to the page. A picture travels as base64 in one message.
#[cfg(target_os = "linux")]
const MAX_BYTES: usize = 64 * 1024 * 1024;

/// Which windows saw the paste keys, and when.
#[derive(Default)]
pub struct PasteGate {
    opened: Mutex<HashMap<String, Instant>>,
}

impl PasteGate {
    /// The paste keys were pressed in `window` at `now`.
    pub fn open(&self, window: &str, now: Instant) {
        if let Ok(mut opened) = self.opened.lock() {
            opened.insert(window.to_string(), now);
        }
    }

    /// True once for each press, when asked by the same window soon enough.
    /// Asking closes the gate whatever the answer is.
    pub fn take(&self, window: &str, now: Instant) -> bool {
        let opened = self
            .opened
            .lock()
            .ok()
            .and_then(|mut opened| opened.remove(window));
        matches!(opened, Some(at) if now.saturating_duration_since(at) <= OPEN_FOR)
    }
}

// X11 key symbols. GDK uses them on Wayland too.
const KEY_V: u32 = 0x76;
const KEY_CAPITAL_V: u32 = 0x56;
const KEY_INSERT: u32 = 0xff63;
const KEY_KEYPAD_INSERT: u32 = 0xff9e;

/// True for the key presses that paste: Ctrl+V, with or without Shift, and
/// Shift+Insert.
///
/// `symbols` holds what the pressed key gives: the symbol it gave this time
/// and the ones it gives in the keyboard's other layouts. On a keyboard
/// switched to Russian the V key gives a Cyrillic letter, and GTK still reads
/// Ctrl with it as paste because the key is V in the Latin layout.
pub fn is_paste_press(ctrl: bool, shift: bool, symbols: &[u32]) -> bool {
    let gives = |wanted: [u32; 2]| symbols.iter().any(|symbol| wanted.contains(symbol));
    (ctrl && gives([KEY_V, KEY_CAPITAL_V]))
        || (shift && !ctrl && gives([KEY_INSERT, KEY_KEYPAD_INSERT]))
}

/// Open the gate whenever the paste keys are pressed in `window`.
///
/// The press is heard on the window, before the page gets the key, so the
/// gate is open by the time the page's paste event runs.
#[cfg(target_os = "linux")]
pub fn watch_paste_keys(window: &tauri::WebviewWindow) {
    use gtk::prelude::*;
    use tauri::Manager;

    let on_main = window.clone();
    // GTK may only be touched on the main thread, and a pop-out is made by a
    // command that runs on another.
    let _ = window.run_on_main_thread(move || {
        let Ok(gtk_window) = on_main.gtk_window() else {
            return;
        };
        let label = on_main.label().to_string();
        let app = on_main.app_handle().clone();
        gtk_window.connect_key_press_event(move |widget, event| {
            let state = event.state();
            let mut symbols = vec![*event.keyval()];
            if let Some(keymap) = gtk::gdk::Keymap::for_display(&widget.display()) {
                symbols.extend(
                    keymap
                        .entries_for_keycode(u32::from(event.hardware_keycode()))
                        .into_iter()
                        .map(|(_, symbol)| symbol),
                );
            }
            let ctrl = state.contains(gtk::gdk::ModifierType::CONTROL_MASK);
            let shift = state.contains(gtk::gdk::ModifierType::SHIFT_MASK);
            if is_paste_press(ctrl, shift, &symbols) {
                app.state::<AppState>()
                    .paste_gate
                    .open(&label, Instant::now());
            }
            gtk::glib::Propagation::Proceed
        });
    });
}

#[cfg(not(target_os = "linux"))]
pub fn watch_paste_keys(_window: &tauri::WebviewWindow) {}

/// What a paste was meant to bring. To the page it is `{ "text": "..." }` or
/// `{ "image": "<PNG as base64>" }`.
#[derive(Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Pasted {
    Text(String),
    Image(String),
}

#[cfg(target_os = "linux")]
fn is_png(bytes: &[u8]) -> bool {
    bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a])
}

/// What is on the clipboard, or `None` when it holds neither text nor a
/// picture.
///
/// Text comes first: where the clipboard holds both, as it does for cells
/// copied from a spreadsheet, the text is what is pasted everywhere else. A
/// PNG is taken as it is, byte for byte. Any other kind of picture (a bitmap,
/// a JPEG) is decoded by GTK and written out as PNG. Everything is asked for
/// with callbacks, so the window stays alive while another program answers.
#[cfg(target_os = "linux")]
async fn read_clipboard(window: &tauri::WebviewWindow) -> Option<Pasted> {
    let (answer, answered) = tokio::sync::oneshot::channel::<Option<Pasted>>();
    window
        .run_on_main_thread(move || {
            let as_image = |bytes: Vec<u8>| {
                Pasted::Image(base64::engine::general_purpose::STANDARD.encode(bytes))
            };
            let clipboard = gtk::Clipboard::get(&gtk::gdk::SELECTION_CLIPBOARD);
            clipboard.request_text(move |clipboard, text| {
                if let Some(text) = text.filter(|text| !text.is_empty() && text.len() <= MAX_BYTES)
                {
                    let _ = answer.send(Some(Pasted::Text(text.to_string())));
                    return;
                }
                let png = gtk::gdk::Atom::intern("image/png");
                clipboard.request_contents(&png, move |clipboard, data| {
                    let bytes = data.data();
                    if is_png(&bytes) && bytes.len() <= MAX_BYTES {
                        let _ = answer.send(Some(as_image(bytes)));
                        return;
                    }
                    clipboard.request_image(move |_, picture| {
                        let bytes = picture
                            .and_then(|picture| picture.save_to_bufferv("png", &[]).ok())
                            .filter(|bytes| bytes.len() <= MAX_BYTES);
                        let _ = answer.send(bytes.map(as_image));
                    });
                });
            });
        })
        .ok()?;
    tokio::time::timeout(Duration::from_secs(5), answered)
        .await
        .ok()?
        .ok()?
}

/// What is on the clipboard, for a paste that reached the page with nothing
/// in it. `None` when the paste keys were not pressed in this window a moment
/// ago, when the clipboard holds neither text nor a picture, and on systems
/// where the page is handed the paste itself.
#[tauri::command]
pub async fn clipboard_take_paste(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, AppState>,
) -> Result<Option<Pasted>, ()> {
    #[cfg(target_os = "linux")]
    {
        if !state.paste_gate.take(window.label(), Instant::now()) {
            log::warn!(
                "[clipboard] refused: the paste keys were not pressed in window \"{}\" just now",
                window.label()
            );
            return Ok(None);
        }
        Ok(read_clipboard(&window).await)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (&window, &state);
        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const CYRILLIC_EM: u32 = 0x6cd;
    const KEY_C: u32 = 0x63;
    const KEY_K: u32 = 0x6b;

    #[test]
    fn the_page_is_told_which_kind_it_got() {
        let text = serde_json::to_string(&Pasted::Text("a\nb".into())).unwrap();
        assert_eq!(text, r#"{"text":"a\nb"}"#);
        let image = serde_json::to_string(&Pasted::Image("iVBORw0KGgo=".into())).unwrap();
        assert_eq!(image, r#"{"image":"iVBORw0KGgo="}"#);
    }

    #[test]
    fn gate_is_shut_until_the_keys_are_pressed() {
        let gate = PasteGate::default();
        assert!(!gate.take("main", Instant::now()));
    }

    #[test]
    fn one_press_gives_one_answer() {
        let gate = PasteGate::default();
        let pressed = Instant::now();
        gate.open("main", pressed);
        assert!(gate.take("main", pressed + Duration::from_millis(20)));
        assert!(!gate.take("main", pressed + Duration::from_millis(40)));
    }

    #[test]
    fn a_press_does_not_last() {
        let gate = PasteGate::default();
        let pressed = Instant::now();
        gate.open("main", pressed);
        assert!(!gate.take("main", pressed + OPEN_FOR + Duration::from_millis(1)));
        // And asking too late used the press up.
        gate.open("main", pressed);
        assert!(gate.take("main", pressed + OPEN_FOR));
    }

    #[test]
    fn a_press_in_one_window_opens_nothing_in_another() {
        let gate = PasteGate::default();
        let pressed = Instant::now();
        gate.open("main", pressed);
        assert!(!gate.take("popout-1", pressed));
        assert!(gate.take("main", pressed));
    }

    #[test]
    fn a_new_press_starts_the_time_again() {
        let gate = PasteGate::default();
        let first = Instant::now();
        gate.open("main", first);
        let second = first + OPEN_FOR + Duration::from_secs(10);
        gate.open("main", second);
        assert!(gate.take("main", second + Duration::from_millis(100)));
    }

    #[test]
    fn a_clock_that_runs_backwards_does_not_panic() {
        let gate = PasteGate::default();
        let pressed = Instant::now() + Duration::from_secs(5);
        gate.open("main", pressed);
        assert!(gate.take("main", pressed - Duration::from_secs(1)));
    }

    #[test]
    fn ctrl_v_pastes_with_caps_lock_and_with_shift() {
        assert!(is_paste_press(true, false, &[KEY_V]));
        assert!(is_paste_press(true, false, &[KEY_CAPITAL_V]));
        assert!(is_paste_press(true, true, &[KEY_CAPITAL_V]));
    }

    #[test]
    fn ctrl_v_pastes_on_a_layout_without_latin_letters() {
        // The key gave a Cyrillic letter; in the Latin layout it is V.
        assert!(is_paste_press(
            true,
            false,
            &[CYRILLIC_EM, KEY_V, KEY_CAPITAL_V]
        ));
        // With no Latin layout at all it is not V, and GTK does not paste either.
        assert!(!is_paste_press(true, false, &[CYRILLIC_EM]));
    }

    #[test]
    fn shift_insert_pastes() {
        assert!(is_paste_press(false, true, &[KEY_INSERT]));
        assert!(is_paste_press(false, true, &[KEY_KEYPAD_INSERT]));
        assert!(!is_paste_press(false, false, &[KEY_INSERT]));
        assert!(!is_paste_press(true, true, &[KEY_INSERT]));
    }

    #[test]
    fn other_keys_do_not_paste() {
        assert!(!is_paste_press(false, false, &[KEY_V]));
        assert!(!is_paste_press(false, true, &[KEY_CAPITAL_V]));
        assert!(!is_paste_press(true, false, &[KEY_C]));
        assert!(!is_paste_press(true, false, &[KEY_K]));
        assert!(!is_paste_press(true, false, &[]));
    }
}
