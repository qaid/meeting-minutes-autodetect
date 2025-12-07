//! Meeting Detection Module
//!
//! This module provides automatic detection of video conferencing applications
//! (Zoom, Microsoft Teams, Google Meet) and can trigger recording automatically
//! when a meeting is detected.
//!
//! # Supported Platforms
//! - macOS: Full support with window title detection for Google Meet
//! - Windows: Process detection (Google Meet browser detection not yet implemented)
//! - Linux: Process detection (Google Meet browser detection not yet implemented)

pub mod commands;
pub mod detector;

pub use commands::*;
pub use detector::*;

/// Meeting application identifiers for process detection
pub mod meeting_apps {
    /// Zoom process identifiers
    pub const ZOOM_PROCESSES: &[&str] = &[
        "zoom.us",
        "zoom",
        "CptHost",      // Zoom meeting window process on macOS
        "Zoom Meeting", // Windows
    ];

    /// Microsoft Teams process identifiers
    pub const TEAMS_PROCESSES: &[&str] = &[
        "Microsoft Teams",
        "Teams",
        "ms-teams",
        "msteams",
        "Teams.exe",
    ];

    /// Browser processes that might be running Google Meet
    pub const BROWSER_PROCESSES: &[&str] = &[
        "Google Chrome",
        "chrome",
        "Chromium",
        "Arc",
        "Safari",
        "Firefox",
        "firefox",
        "Microsoft Edge",
        "msedge",
        "Brave Browser",
        "brave",
    ];

    /// Google Meet URL pattern to detect in browser windows
    pub const GOOGLE_MEET_URL_PATTERN: &str = "meet.google.com";
}
