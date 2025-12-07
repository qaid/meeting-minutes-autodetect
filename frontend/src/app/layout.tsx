'use client'

import './globals.css'
import { Source_Sans_3 } from 'next/font/google'
import Sidebar from '@/components/Sidebar'
import { SidebarProvider } from '@/components/Sidebar/SidebarProvider'
import MainContent from '@/components/MainContent'
import AnalyticsProvider from '@/components/AnalyticsProvider'
import { Toaster } from 'sonner'
import "sonner/dist/styles.css"
import { useState, useEffect } from 'react'
import { LegacyDatabaseImport } from '@/components/DatabaseImport/LegacyDatabaseImport'
import { TooltipProvider } from '@/components/ui/tooltip'
import { RecordingStateProvider } from '@/contexts/RecordingStateContext'
import { OllamaDownloadProvider } from '@/contexts/OllamaDownloadContext'
import { ThemeProvider } from '@/contexts/ThemeContext'

const sourceSans3 = Source_Sans_3({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-source-sans-3',
})

// export { metadata } from './metadata'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [showImportDialog, setShowImportDialog] = useState(false)

  useEffect(() => {
    // Skip on server-side
    if (typeof window === 'undefined') return;
    
    let unlistenFirstLaunch: (() => void) | undefined;
    let unlistenDbInit: (() => void) | undefined;
    
    const setup = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const { listen } = await import('@tauri-apps/api/event');
        
        // Check first launch state immediately on mount (reliable)
        const isFirstLaunch = await invoke<boolean>('check_first_launch');
        console.log('First launch check result:', isFirstLaunch);
        if (isFirstLaunch) {
          console.log('First launch detected - showing import dialog');
          setShowImportDialog(true);
        }

        // Also listen for events (fallback for hot reload and edge cases)
        unlistenFirstLaunch = await listen('first-launch-detected', () => {
          console.log('First launch event received - showing import dialog');
          setShowImportDialog(true);
        });

        // Listen for database initialized event
        unlistenDbInit = await listen('database-initialized', () => {
          console.log('Database initialized - hiding import dialog');
          setShowImportDialog(false);
        });
      } catch (error) {
        console.error('Failed to setup layout listeners:', error);
      }
    };
    
    setup();

    return () => {
      if (unlistenFirstLaunch) unlistenFirstLaunch();
      if (unlistenDbInit) unlistenDbInit();
    };
  }, [])

  return (
    <html lang="en">
      <body className={`${sourceSans3.variable} font-sans bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100`}>
        <ThemeProvider>
          <AnalyticsProvider>
            <RecordingStateProvider>
              <OllamaDownloadProvider>
              <SidebarProvider>
                <TooltipProvider>
                  {/* <div className="titlebar h-8 w-full fixed top-0 left-0 bg-transparent" /> */}
                  <div className="flex">
                    <Sidebar />
                    <MainContent>{children}</MainContent>
                  </div>
                </TooltipProvider>
              </SidebarProvider>
            </OllamaDownloadProvider>
            </RecordingStateProvider>
          </AnalyticsProvider>
        </ThemeProvider>
        <Toaster position="bottom-center" richColors closeButton />
        <LegacyDatabaseImport
          isOpen={showImportDialog}
          onComplete={() => setShowImportDialog(false)}
        />
      </body>
    </html>
  )
}
