//! Core meeting detection logic
//!
//! Provides process monitoring and meeting detection for Zoom, Teams, and Google Meet.

use crate::meeting_detector::meeting_apps::*;
use log::{debug, info, warn, error};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use std::path::PathBuf;
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, RefreshKind, System};
use tauri::{AppHandle, Emitter, Runtime, Manager};
use tokio::sync::RwLock;

/// Represents a detected meeting
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedMeeting {
    /// Name of the meeting application (e.g., "Zoom", "Microsoft Teams", "Google Meet")
    pub app_name: String,
    /// Process name that was detected
    pub process_name: String,
    /// Timestamp when the meeting was detected
    pub detected_at: String,
    /// Whether this is an active meeting (vs just the app running)
    pub is_active_meeting: bool,
}

/// Settings for meeting detection behavior
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingDetectionSettings {
    /// Whether meeting detection is enabled
    pub enabled: bool,
    /// Automatically start recording when a meeting is detected
    pub auto_start_recording: bool,
    /// Automatically stop recording when a meeting ends
    pub auto_stop_recording: bool,
    /// Detect Zoom meetings
    pub detect_zoom: bool,
    /// Detect Microsoft Teams meetings
    pub detect_teams: bool,
    /// Detect Google Meet meetings (requires browser window inspection)
    pub detect_google_meet: bool,
    /// Show notification when a meeting is detected
    pub notify_on_detection: bool,
    /// Polling interval in seconds
    pub poll_interval_secs: u64,
}

impl Default for MeetingDetectionSettings {
    fn default() -> Self {
        Self {
            enabled: false, // Opt-in by default for privacy
            auto_start_recording: false,
            auto_stop_recording: true,
            detect_zoom: true,
            detect_teams: true,
            detect_google_meet: true,
            notify_on_detection: true,
            poll_interval_secs: 5,
        }
    }
}

impl MeetingDetectionSettings {
    /// Get the settings file path
    fn settings_path() -> Option<PathBuf> {
        dirs::data_dir().map(|p| p.join("com.meetily.ai").join("meeting_detection_settings.json"))
    }

    /// Load settings from disk
    pub fn load() -> Self {
        if let Some(path) = Self::settings_path() {
            if path.exists() {
                match std::fs::read_to_string(&path) {
                    Ok(contents) => {
                        match serde_json::from_str(&contents) {
                            Ok(settings) => {
                                info!("Loaded meeting detection settings from {:?}", path);
                                return settings;
                            }
                            Err(e) => {
                                error!("Failed to parse meeting detection settings: {}", e);
                            }
                        }
                    }
                    Err(e) => {
                        error!("Failed to read meeting detection settings: {}", e);
                    }
                }
            }
        }
        Self::default()
    }

    /// Save settings to disk
    pub fn save(&self) -> Result<(), String> {
        if let Some(path) = Self::settings_path() {
            // Ensure parent directory exists
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create settings directory: {}", e))?;
            }

            let contents = serde_json::to_string_pretty(self)
                .map_err(|e| format!("Failed to serialize settings: {}", e))?;

            std::fs::write(&path, contents)
                .map_err(|e| format!("Failed to write settings: {}", e))?;

            info!("Saved meeting detection settings to {:?}", path);
            Ok(())
        } else {
            Err("Could not determine settings path".to_string())
        }
    }
}

/// Status of the meeting detection monitor
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingDetectionStatus {
    /// Whether the monitor is currently running
    pub is_monitoring: bool,
    /// Currently detected meeting, if any
    pub current_meeting: Option<DetectedMeeting>,
    /// Current settings
    pub settings: MeetingDetectionSettings,
    /// Whether recording was auto-started by the detector
    pub auto_recording_active: bool,
}

/// Meeting detector that monitors for video conferencing applications
pub struct MeetingDetector {
    system: System,
    settings: Arc<RwLock<MeetingDetectionSettings>>,
    is_monitoring: Arc<AtomicBool>,
    current_meeting: Arc<RwLock<Option<DetectedMeeting>>>,
    auto_recording_active: Arc<AtomicBool>,
}

impl MeetingDetector {
    /// Create a new meeting detector with settings loaded from disk
    pub fn new() -> Self {
        // Load persisted settings or use defaults
        let loaded_settings = MeetingDetectionSettings::load();
        info!("MeetingDetector initialized with settings: enabled={}, auto_start={}", 
              loaded_settings.enabled, loaded_settings.auto_start_recording);
        
        Self {
            system: System::new_with_specifics(
                RefreshKind::new().with_processes(ProcessRefreshKind::everything()),
            ),
            settings: Arc::new(RwLock::new(loaded_settings)),
            is_monitoring: Arc::new(AtomicBool::new(false)),
            current_meeting: Arc::new(RwLock::new(None)),
            auto_recording_active: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Get current settings
    pub async fn get_settings(&self) -> MeetingDetectionSettings {
        self.settings.read().await.clone()
    }

    /// Update settings and persist to disk
    pub async fn set_settings(&self, settings: MeetingDetectionSettings) {
        // Save to disk first
        if let Err(e) = settings.save() {
            error!("Failed to save meeting detection settings: {}", e);
        }
        
        let mut current = self.settings.write().await;
        *current = settings;
    }

    /// Check if monitoring is active
    pub fn is_monitoring(&self) -> bool {
        self.is_monitoring.load(Ordering::SeqCst)
    }

    /// Get current detection status
    pub async fn get_status(&self) -> MeetingDetectionStatus {
        MeetingDetectionStatus {
            is_monitoring: self.is_monitoring(),
            current_meeting: self.current_meeting.read().await.clone(),
            settings: self.get_settings().await,
            auto_recording_active: self.auto_recording_active.load(Ordering::SeqCst),
        }
    }

    /// Detect if any meeting application is running
    pub fn detect_meeting(&mut self, settings: &MeetingDetectionSettings) -> Option<DetectedMeeting> {
        self.system.refresh_processes(ProcessesToUpdate::All, true);

        for (_pid, process) in self.system.processes() {
            let name = process.name().to_string_lossy().to_lowercase();

            // Check for Zoom - only detect ACTIVE meetings, not just the app being open
            if settings.detect_zoom {
                // CptHost is the process that runs during an active Zoom meeting on macOS
                // This is more reliable than just detecting zoom.us which runs when app is open
                if name.contains("cpthost") {
                    info!("Detected active Zoom meeting via CptHost process");
                    return Some(DetectedMeeting {
                        app_name: "Zoom".to_string(),
                        process_name: process.name().to_string_lossy().to_string(),
                        detected_at: chrono::Local::now().to_rfc3339(),
                        is_active_meeting: true,
                    });
                }
            }

            // Check for Microsoft Teams
            if settings.detect_teams {
                for teams_process in TEAMS_PROCESSES {
                    if name.contains(&teams_process.to_lowercase()) {
                        return Some(DetectedMeeting {
                            app_name: "Microsoft Teams".to_string(),
                            process_name: process.name().to_string_lossy().to_string(),
                            detected_at: chrono::Local::now().to_rfc3339(),
                            is_active_meeting: true, // Teams process usually means active meeting
                        });
                    }
                }
            }

            // Check for Google Meet (browser-based)
            // This requires platform-specific window title detection
            if settings.detect_google_meet {
                if let Some(meeting) = self.detect_google_meet_in_browser(&name, process) {
                    return Some(meeting);
                }
            }
        }

        None
    }

    /// Detect Google Meet running in a browser
    /// This is a simplified check - full implementation requires window title inspection
    #[cfg(target_os = "macos")]
    fn detect_google_meet_in_browser(
        &self,
        process_name: &str,
        _process: &sysinfo::Process,
    ) -> Option<DetectedMeeting> {
        // On macOS, we can use accessibility APIs to check window titles
        // For now, we'll use a simplified approach that checks for browser processes
        // A full implementation would use the Accessibility framework

        for browser in BROWSER_PROCESSES {
            if process_name.contains(&browser.to_lowercase()) {
                // TODO: Implement window title checking via Accessibility API
                // For now, we can't reliably detect Google Meet without window inspection
                // This would require checking if any window title contains "meet.google.com"
                debug!(
                    "Browser detected: {} - Google Meet detection requires window title inspection",
                    browser
                );
            }
        }

        None
    }

    #[cfg(not(target_os = "macos"))]
    fn detect_google_meet_in_browser(
        &self,
        _process_name: &str,
        _process: &sysinfo::Process,
    ) -> Option<DetectedMeeting> {
        // On Windows/Linux, window title detection requires platform-specific APIs
        // Windows: EnumWindows + GetWindowText
        // Linux: X11/Wayland APIs
        None
    }

    /// Start the background monitoring task
    pub async fn start_monitoring<R: Runtime>(&self, app: AppHandle<R>) {
        if self.is_monitoring.load(Ordering::SeqCst) {
            warn!("Meeting detection is already running");
            return;
        }

        self.is_monitoring.store(true, Ordering::SeqCst);
        info!("Starting meeting detection monitor");

        let is_monitoring = self.is_monitoring.clone();
        let settings = self.settings.clone();
        let current_meeting = self.current_meeting.clone();
        let auto_recording_active = self.auto_recording_active.clone();

        tokio::spawn(async move {
            let mut system = System::new_with_specifics(
                RefreshKind::new().with_processes(ProcessRefreshKind::everything()),
            );
            let mut was_in_meeting = false;

            while is_monitoring.load(Ordering::SeqCst) {
                let current_settings = settings.read().await.clone();

                if !current_settings.enabled {
                    tokio::time::sleep(Duration::from_secs(current_settings.poll_interval_secs))
                        .await;
                    continue;
                }

                system.refresh_processes(ProcessesToUpdate::All, true);

                // Detect meeting using inline logic (can't call &mut self in spawned task)
                let meeting = detect_meeting_from_system(&system, &current_settings);

                match (was_in_meeting, meeting.is_some()) {
                    (false, true) => {
                        // Meeting started
                        let meeting_info = meeting.unwrap();
                        info!(
                            "Meeting detected: {} ({})",
                            meeting_info.app_name, meeting_info.process_name
                        );

                        // Store current meeting
                        {
                            let mut current = current_meeting.write().await;
                            *current = Some(meeting_info.clone());
                        }

                        // Emit event to frontend
                        let _ = app.emit("meeting-detected", &meeting_info);

                        // Show notification if enabled
                        if current_settings.notify_on_detection {
                            let _ = app.emit(
                                "meeting-detection-notification",
                                serde_json::json!({
                                    "title": format!("{} Meeting Detected", meeting_info.app_name),
                                    "body": "Click to start recording"
                                }),
                            );
                        }

                        // Auto-start recording if enabled
                        if current_settings.auto_start_recording {
                            let meeting_name =
                                format!("{} Meeting", meeting_info.app_name);
                            info!("Auto-starting recording for: {}", meeting_name);

                            // Emit event for frontend to handle recording start
                            let _ = app.emit(
                                "auto-start-recording",
                                serde_json::json!({
                                    "meeting_name": meeting_name,
                                    "app_name": meeting_info.app_name
                                }),
                            );

                            auto_recording_active.store(true, Ordering::SeqCst);
                        }

                        was_in_meeting = true;
                    }
                    (true, false) => {
                        // Meeting ended
                        info!("Meeting ended");

                        // Clear current meeting
                        {
                            let mut current = current_meeting.write().await;
                            *current = None;
                        }

                        // Emit event to frontend
                        let _ = app.emit("meeting-ended", ());

                        // Auto-stop recording if enabled and we auto-started
                        if current_settings.auto_stop_recording
                            && auto_recording_active.load(Ordering::SeqCst)
                        {
                            info!("Auto-stopping recording");
                            let _ = app.emit("auto-stop-recording", ());
                            auto_recording_active.store(false, Ordering::SeqCst);
                        }

                        was_in_meeting = false;
                    }
                    _ => {} // No state change
                }

                tokio::time::sleep(Duration::from_secs(current_settings.poll_interval_secs)).await;
            }

            info!("Meeting detection monitor stopped");
        });
    }

    /// Stop the background monitoring task
    pub fn stop_monitoring(&self) {
        info!("Stopping meeting detection monitor");
        self.is_monitoring.store(false, Ordering::SeqCst);
    }
}

impl Default for MeetingDetector {
    fn default() -> Self {
        Self::new()
    }
}

/// Helper function to detect meetings from a System instance
/// Used in the spawned monitoring task
fn detect_meeting_from_system(
    system: &System,
    settings: &MeetingDetectionSettings,
) -> Option<DetectedMeeting> {
    for (_pid, process) in system.processes() {
        let name = process.name().to_string_lossy().to_lowercase();

        // Check for Zoom - only detect ACTIVE meetings via CptHost process
        if settings.detect_zoom {
            // CptHost is the process that runs during an active Zoom meeting on macOS
            if name.contains("cpthost") {
                return Some(DetectedMeeting {
                    app_name: "Zoom".to_string(),
                    process_name: process.name().to_string_lossy().to_string(),
                    detected_at: chrono::Local::now().to_rfc3339(),
                    is_active_meeting: true,
                });
            }
        }

        // Check for Microsoft Teams
        if settings.detect_teams {
            for teams_process in TEAMS_PROCESSES {
                if name.contains(&teams_process.to_lowercase()) {
                    return Some(DetectedMeeting {
                        app_name: "Microsoft Teams".to_string(),
                        process_name: process.name().to_string_lossy().to_string(),
                        detected_at: chrono::Local::now().to_rfc3339(),
                        is_active_meeting: true,
                    });
                }
            }
        }
    }

    None
}
