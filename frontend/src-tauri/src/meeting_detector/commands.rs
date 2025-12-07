//! Tauri commands for meeting detection
//!
//! Provides the interface between the frontend and the meeting detection system.

use super::detector::{MeetingDetectionSettings, MeetingDetectionStatus, MeetingDetector};
use log::info;
use std::sync::Arc;
use tauri::{AppHandle, Runtime, State};
use tokio::sync::RwLock;

/// State wrapper for the meeting detector
pub type MeetingDetectorState = Arc<RwLock<MeetingDetector>>;

/// Initialize the meeting detector state
pub fn init_meeting_detector_state() -> MeetingDetectorState {
    Arc::new(RwLock::new(MeetingDetector::new()))
}

/// Enable meeting detection and start monitoring
#[tauri::command]
pub async fn enable_meeting_detection<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, MeetingDetectorState>,
) -> Result<(), String> {
    info!("Enabling meeting detection");

    let detector = state.read().await;
    let mut settings = detector.get_settings().await;
    settings.enabled = true;
    detector.set_settings(settings).await;
    detector.start_monitoring(app).await;

    Ok(())
}

/// Disable meeting detection and stop monitoring
#[tauri::command]
pub async fn disable_meeting_detection(
    state: State<'_, MeetingDetectorState>,
) -> Result<(), String> {
    info!("Disabling meeting detection");

    let detector = state.read().await;
    let mut settings = detector.get_settings().await;
    settings.enabled = false;
    detector.set_settings(settings).await;
    detector.stop_monitoring();

    Ok(())
}

/// Get the current meeting detection status
#[tauri::command]
pub async fn get_meeting_detection_status(
    state: State<'_, MeetingDetectorState>,
) -> Result<MeetingDetectionStatus, String> {
    let detector = state.read().await;
    Ok(detector.get_status().await)
}

/// Get meeting detection settings
#[tauri::command]
pub async fn get_meeting_detection_settings(
    state: State<'_, MeetingDetectorState>,
) -> Result<MeetingDetectionSettings, String> {
    let detector = state.read().await;
    Ok(detector.get_settings().await)
}

/// Update meeting detection settings
#[tauri::command]
pub async fn set_meeting_detection_settings<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, MeetingDetectorState>,
    settings: MeetingDetectionSettings,
) -> Result<(), String> {
    info!("Updating meeting detection settings: {:?}", settings);

    let detector = state.read().await;
    let was_enabled = detector.get_settings().await.enabled;
    let now_enabled = settings.enabled;

    detector.set_settings(settings).await;

    // Handle monitoring state changes
    match (was_enabled, now_enabled) {
        (false, true) => {
            info!("Starting meeting detection monitor");
            detector.start_monitoring(app).await;
        }
        (true, false) => {
            info!("Stopping meeting detection monitor");
            detector.stop_monitoring();
        }
        _ => {}
    }

    Ok(())
}

/// Manually check for active meetings (one-time scan)
#[tauri::command]
pub async fn check_for_active_meeting(
    state: State<'_, MeetingDetectorState>,
) -> Result<Option<super::detector::DetectedMeeting>, String> {
    let mut detector = state.write().await;
    let settings = detector.get_settings().await;
    Ok(detector.detect_meeting(&settings))
}

/// Start the meeting detection monitor
#[tauri::command]
pub async fn start_meeting_monitor<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, MeetingDetectorState>,
) -> Result<(), String> {
    info!("Starting meeting detection monitor via command");

    let detector = state.read().await;
    if detector.is_monitoring() {
        return Err("Meeting detection is already running".to_string());
    }

    detector.start_monitoring(app).await;
    Ok(())
}

/// Stop the meeting detection monitor
#[tauri::command]
pub async fn stop_meeting_monitor(
    state: State<'_, MeetingDetectorState>,
) -> Result<(), String> {
    info!("Stopping meeting detection monitor via command");

    let detector = state.read().await;
    detector.stop_monitoring();
    Ok(())
}
