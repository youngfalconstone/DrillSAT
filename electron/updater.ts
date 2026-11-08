/**
 * Auto-update from GitHub Releases (electron-updater). The installed (NSIS) app downloads a newer release in the
 * background and installs it on restart or quit. The portable exe cannot replace itself, so it only reports that a
 * new version exists and links to the download page.
 *
 * Off when: not packaged; running under the e2e tests (SAT_USER_DATA) unless SAT_UPDATE_URL points at a test
 * feed; or SAT_NO_UPDATE is set. SAT_UPDATE_URL switches to a generic feed (used to test the full update flow
 * against a local server).
 */
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { autoUpdater } from 'electron-updater';

export type UpdateStatus = 'disabled' | 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error';
export interface UpdateState {
  status: UpdateStatus;
  version?: string;
  percent?: number;
  message?: string;
  portable: boolean;
  checkedAt?: number;
}

const RELEASES_URL = 'https://github.com/youngfalconstone/DrillSAT/releases/latest';
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

let state: UpdateState = { status: 'idle', portable: !!process.env.PORTABLE_EXECUTABLE_FILE };

function publish(win: () => BrowserWindow | null, patch: Partial<UpdateState>) {
  state = { ...state, ...patch };
  win()?.webContents.send('update:state', state);
}

export function initUpdater(win: () => BrowserWindow | null) {
  const testFeed = process.env.SAT_UPDATE_URL;
  const disabled = !app.isPackaged || !!process.env.SAT_NO_UPDATE || (!!process.env.SAT_USER_DATA && !testFeed);
  if (disabled) state = { ...state, status: 'disabled' };

  ipcMain.handle('update:get', () => state);
  ipcMain.handle('update:check', async () => {
    if (state.status === 'disabled') return state;
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      publish(win, { status: 'error', message: (err as Error).message });
    }
    return state;
  });
  ipcMain.handle('update:install', () => {
    if (state.status === 'ready') {
      setImmediate(() => autoUpdater.quitAndInstall(true, true));
      return true;
    }
    if (state.portable && state.status === 'available') void shell.openExternal(RELEASES_URL);
    return false;
  });
  if (disabled) return;

  autoUpdater.logger = null;
  autoUpdater.autoDownload = !state.portable;
  autoUpdater.autoInstallOnAppQuit = !state.portable;
  if (testFeed) autoUpdater.setFeedURL({ provider: 'generic', url: testFeed });

  autoUpdater.on('checking-for-update', () => publish(win, { status: 'checking', message: undefined }));
  autoUpdater.on('update-not-available', () => publish(win, { status: 'none', checkedAt: Date.now() }));
  autoUpdater.on('update-available', (info) => publish(win, { status: state.portable ? 'available' : 'downloading', version: info.version, percent: 0, checkedAt: Date.now() }));
  autoUpdater.on('download-progress', (p) => publish(win, { status: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => publish(win, { status: 'ready', version: info.version, percent: 100 }));
  autoUpdater.on('error', (err) => publish(win, { status: 'error', message: err?.message ?? String(err) }));

  const check = () => autoUpdater.checkForUpdates().catch((err) => publish(win, { status: 'error', message: (err as Error).message }));
  setTimeout(check, testFeed ? 1500 : 8000);
  setInterval(check, CHECK_EVERY_MS);
}
