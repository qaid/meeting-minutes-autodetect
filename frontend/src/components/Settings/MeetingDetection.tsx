'use client';

import { useEffect, useState, useCallback } from 'react';
import { invoke, listen } from '@/lib/tauri';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Video, Monitor, Users, Bell, Play, Square } from 'lucide-react';

interface MeetingDetectionSettings {
  enabled: boolean;
  auto_start_recording: boolean;
  auto_stop_recording: boolean;
  detect_zoom: boolean;
  detect_teams: boolean;
  detect_google_meet: boolean;
  notify_on_detection: boolean;
  poll_interval_secs: number;
}

interface DetectedMeeting {
  app_name: string;
  process_name: string;
  detected_at: string;
  is_active_meeting: boolean;
}

interface MeetingDetectionStatus {
  is_monitoring: boolean;
  current_meeting: DetectedMeeting | null;
  settings: MeetingDetectionSettings;
  auto_recording_active: boolean;
}

const defaultSettings: MeetingDetectionSettings = {
  enabled: false,
  auto_start_recording: false,
  auto_stop_recording: true,
  detect_zoom: true,
  detect_teams: true,
  detect_google_meet: true,
  notify_on_detection: true,
  poll_interval_secs: 5,
};

export function MeetingDetectionSettings() {
  const [settings, setSettings] = useState<MeetingDetectionSettings>(defaultSettings);
  const [status, setStatus] = useState<MeetingDetectionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Load settings on mount
  useEffect(() => {
    // Skip on server-side
    if (typeof window === 'undefined') return;
    
    const loadSettings = async () => {
      try {
        const [loadedSettings, loadedStatus] = await Promise.all([
          invoke<MeetingDetectionSettings>('get_meeting_detection_settings'),
          invoke<MeetingDetectionStatus>('get_meeting_detection_status'),
        ]);
        setSettings(loadedSettings);
        setStatus(loadedStatus);
      } catch (error) {
        console.error('Failed to load meeting detection settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  // Listen for meeting detection events
  useEffect(() => {
    // Skip on server-side
    if (typeof window === 'undefined') return;
    
    const unsubscribers: (() => void)[] = [];

    const setupListeners = async () => {
      const unlistenDetected = await listen<DetectedMeeting>('meeting-detected', (event) => {
        console.log('Meeting detected:', event.payload);
        setStatus((prev) =>
          prev ? { ...prev, current_meeting: event.payload } : null
        );
      });
      unsubscribers.push(unlistenDetected);

      const unlistenEnded = await listen('meeting-ended', () => {
        console.log('Meeting ended');
        setStatus((prev) =>
          prev ? { ...prev, current_meeting: null, auto_recording_active: false } : null
        );
      });
      unsubscribers.push(unlistenEnded);
    };

    setupListeners();

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, []);

  // Save settings when they change
  const updateSettings = useCallback(
    async (newSettings: MeetingDetectionSettings) => {
      setIsSaving(true);
      try {
        await invoke('set_meeting_detection_settings', { settings: newSettings });
        setSettings(newSettings);

        // Refresh status after settings change
        const newStatus = await invoke<MeetingDetectionStatus>('get_meeting_detection_status');
        setStatus(newStatus);
      } catch (error) {
        console.error('Failed to save meeting detection settings:', error);
      } finally {
        setIsSaving(false);
      }
    },
    []
  );

  const handleToggle = (key: keyof MeetingDetectionSettings) => {
    const newSettings = { ...settings, [key]: !settings[key] };
    updateSettings(newSettings);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Meeting Auto-Detection</h3>
          <p className="text-sm text-gray-500">
            Automatically detect when you join a video meeting and start recording
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Switch
            id="meeting-detection-enabled"
            checked={settings.enabled}
            onCheckedChange={() => handleToggle('enabled')}
            disabled={isSaving}
          />
          <Label htmlFor="meeting-detection-enabled" className="font-medium">
            {settings.enabled ? 'Enabled' : 'Disabled'}
          </Label>
        </div>
      </div>

      {/* Status indicator */}
      {settings.enabled && status && (
        <div
          className={`p-4 rounded-lg border ${
            status.current_meeting
              ? 'bg-green-50 border-green-200'
              : 'bg-gray-50 border-gray-200'
          }`}
        >
          <div className="flex items-center space-x-3">
            {status.current_meeting ? (
              <>
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                <div>
                  <p className="font-medium text-green-800">
                    {status.current_meeting.app_name} Meeting Detected
                  </p>
                  <p className="text-sm text-green-600">
                    {status.auto_recording_active
                      ? 'Recording in progress...'
                      : 'Click to start recording'}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
                <div>
                  <p className="font-medium text-gray-700">Monitoring for meetings...</p>
                  <p className="text-sm text-gray-500">
                    Checking every {settings.poll_interval_secs} seconds
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Settings sections */}
      <div className="space-y-4 pt-4 border-t">
        <h4 className="font-medium text-gray-900">Applications to Detect</h4>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Video className="w-5 h-5 text-blue-500" />
              <div>
                <Label htmlFor="detect-zoom" className="font-medium">
                  Zoom
                </Label>
                <p className="text-sm text-gray-500">Detect Zoom meetings</p>
              </div>
            </div>
            <Switch
              id="detect-zoom"
              checked={settings.detect_zoom}
              onCheckedChange={() => handleToggle('detect_zoom')}
              disabled={isSaving || !settings.enabled}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Users className="w-5 h-5 text-purple-500" />
              <div>
                <Label htmlFor="detect-teams" className="font-medium">
                  Microsoft Teams
                </Label>
                <p className="text-sm text-gray-500">Detect Teams meetings</p>
              </div>
            </div>
            <Switch
              id="detect-teams"
              checked={settings.detect_teams}
              onCheckedChange={() => handleToggle('detect_teams')}
              disabled={isSaving || !settings.enabled}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Monitor className="w-5 h-5 text-green-500" />
              <div>
                <Label htmlFor="detect-google-meet" className="font-medium">
                  Google Meet
                </Label>
                <p className="text-sm text-gray-500">
                  Detect Google Meet in browser (limited support)
                </p>
              </div>
            </div>
            <Switch
              id="detect-google-meet"
              checked={settings.detect_google_meet}
              onCheckedChange={() => handleToggle('detect_google_meet')}
              disabled={isSaving || !settings.enabled}
            />
          </div>
        </div>
      </div>

      {/* Recording behavior */}
      <div className="space-y-4 pt-4 border-t">
        <h4 className="font-medium text-gray-900">Recording Behavior</h4>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Play className="w-5 h-5 text-red-500" />
              <div>
                <Label htmlFor="auto-start" className="font-medium">
                  Auto-start Recording
                </Label>
                <p className="text-sm text-gray-500">
                  Automatically start recording when a meeting is detected
                </p>
              </div>
            </div>
            <Switch
              id="auto-start"
              checked={settings.auto_start_recording}
              onCheckedChange={() => handleToggle('auto_start_recording')}
              disabled={isSaving || !settings.enabled}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Square className="w-5 h-5 text-gray-500" />
              <div>
                <Label htmlFor="auto-stop" className="font-medium">
                  Auto-stop Recording
                </Label>
                <p className="text-sm text-gray-500">
                  Automatically stop recording when the meeting ends
                </p>
              </div>
            </div>
            <Switch
              id="auto-stop"
              checked={settings.auto_stop_recording}
              onCheckedChange={() => handleToggle('auto_stop_recording')}
              disabled={isSaving || !settings.enabled}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Bell className="w-5 h-5 text-yellow-500" />
              <div>
                <Label htmlFor="notify" className="font-medium">
                  Show Notifications
                </Label>
                <p className="text-sm text-gray-500">
                  Show a notification when a meeting is detected
                </p>
              </div>
            </div>
            <Switch
              id="notify"
              checked={settings.notify_on_detection}
              onCheckedChange={() => handleToggle('notify_on_detection')}
              disabled={isSaving || !settings.enabled}
            />
          </div>
        </div>
      </div>

      {/* Privacy notice */}
      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-sm text-blue-800">
          <strong>Privacy Note:</strong> Meeting detection only monitors running process names
          to identify video conferencing applications. No meeting content, audio, or video is
          accessed until you explicitly start recording.
        </p>
      </div>
    </div>
  );
}

export default MeetingDetectionSettings;
