/**
 * Safe Tauri API wrapper that handles SSR gracefully
 * These functions return the actual Tauri APIs only when running in browser
 */

// Check if we're in a browser environment with Tauri
export const isTauri = () => typeof window !== 'undefined' && !!(window as any).__TAURI__;

// Lazy import helpers that work during SSR
export const invoke = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
  if (typeof window === 'undefined') {
    throw new Error('invoke called during SSR');
  }
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  return tauriInvoke<T>(cmd, args);
};

export const listen = async <T>(
  event: string,
  handler: (event: { payload: T }) => void
): Promise<() => void> => {
  if (typeof window === 'undefined') {
    return () => {}; // No-op during SSR
  }
  const { listen: tauriListen } = await import('@tauri-apps/api/event');
  return tauriListen<T>(event, handler);
};

export const appDataDir = async (): Promise<string> => {
  if (typeof window === 'undefined') {
    throw new Error('appDataDir called during SSR');
  }
  const { appDataDir: tauriAppDataDir } = await import('@tauri-apps/api/path');
  return tauriAppDataDir();
};

export const downloadDir = async (): Promise<string> => {
  if (typeof window === 'undefined') {
    throw new Error('downloadDir called during SSR');
  }
  const { downloadDir: tauriDownloadDir } = await import('@tauri-apps/api/path');
  return tauriDownloadDir();
};

export const writeTextFile = async (path: string, contents: string): Promise<void> => {
  if (typeof window === 'undefined') {
    throw new Error('writeTextFile called during SSR');
  }
  const { writeTextFile: tauriWriteTextFile } = await import('@tauri-apps/plugin-fs');
  return tauriWriteTextFile(path, contents);
};

// Plugin-store load wrapper
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const loadStore = async (name: string, options?: any) => {
  if (typeof window === 'undefined') {
    throw new Error('loadStore called during SSR');
  }
  const { load } = await import('@tauri-apps/plugin-store');
  return load(name, options);
};
