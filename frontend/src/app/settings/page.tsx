'use client';

import React, { useState, useEffect } from 'react';
import { ArrowLeft, Settings2, Mic, Database as DatabaseIcon, SparkleIcon, Video } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { invoke } from '@/lib/tauri';
import { TranscriptSettings, TranscriptModelProps } from '@/components/TranscriptSettings';
import { RecordingSettings } from '@/components/RecordingSettings';
import { PreferenceSettings } from '@/components/PreferenceSettings';
import { SummaryModelSettings } from '@/components/SummaryModelSettings';
import { MeetingDetectionSettings } from '@/components/Settings/MeetingDetection';

type SettingsTab = 'general' | 'recording' | 'meetingDetection' | 'Transcriptionmodels' | 'summaryModels';

export default function SettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [transcriptModelConfig, setTranscriptModelConfig] = useState<TranscriptModelProps>({
    provider: 'localWhisper',
    model: 'large-v3',
    apiKey: null
  });

  const tabs = [
    { id: 'general' as const, label: 'General', icon: <Settings2 className="w-4 h-4" /> },
    { id: 'recording' as const, label: 'Recordings', icon: <Mic className="w-4 h-4" /> },
    { id: 'meetingDetection' as const, label: 'Auto-Detection', icon: <Video className="w-4 h-4" /> },
    { id: 'Transcriptionmodels' as const, label: 'Transcription', icon: <DatabaseIcon className="w-4 h-4" /> },
    { id: 'summaryModels' as const, label: 'Summary', icon: <SparkleIcon className="w-4 h-4" /> }
  ];

  // Load saved transcript configuration on mount
  useEffect(() => {
    const loadTranscriptConfig = async () => {
      try {
        const config = await invoke('api_get_transcript_config') as any;
        if (config) {
          console.log('Loaded saved transcript config:', config);
          setTranscriptModelConfig({
            provider: config.provider || 'localWhisper',
            model: config.model || 'large-v3',
            apiKey: config.apiKey || null
          });
        }
      } catch (error) {
        console.error('Failed to load transcript config:', error);
      }
    };
    loadTranscriptConfig();
  }, []);

  // Handle configuration save
  const handleSaveConfig = async (config: TranscriptModelProps) => {
    try {
      console.log('[SettingsPage] Saving transcript config:', config);
      await invoke('api_save_transcript_config', {
        provider: config.provider,
        model: config.model,
        apiKey: config.apiKey
      });
      console.log('[SettingsPage] ✅ Successfully saved transcript config');
    } catch (error) {
      console.error('[SettingsPage] ❌ Failed to save transcript config:', error);
    }
  };

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Fixed Header */}
      <div className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-6xl mx-auto px-8 py-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back</span>
            </button>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Settings</h1>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-8 pt-6">
          {/* Tabs */}
          <div className="bg-white dark:!bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:!border-gray-700 overflow-hidden">
            <div className="flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap ${activeTab === tab.id
                      ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/30'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="p-6">
              {activeTab === 'general' && <PreferenceSettings />}
              {activeTab === 'recording' && <RecordingSettings />}
              {activeTab === 'meetingDetection' && <MeetingDetectionSettings />}
              {activeTab === 'Transcriptionmodels' && (
                <TranscriptSettings
                  transcriptModelConfig={transcriptModelConfig}
                  setTranscriptModelConfig={setTranscriptModelConfig}
                  // onSave={handleSaveConfig}
                />
              )}
              {activeTab === 'summaryModels' && <SummaryModelSettings />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
