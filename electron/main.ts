import { app, BrowserWindow, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { encryptionAvailable, getSecret, getSettings, readJson, setSecret, updateSettings, writeJson } from './settings';
import { complete, LLMError, type CompletionRequest } from './llm';

// ---------- Wine detection & flags (must run before app is ready) ----------
function runningUnderWine(): boolean {
  if (process.platform !== 'win32') return false;
  if (process.env.WINEPREFIX || process.env.WINELOADER || process.env.WINEDLLOVERRIDES) return true;
  try {
    const sys = path.join(process.env.SystemRoot || 'C:\\windows', 'system32');
    return fs.existsSync(path.join(sys, 'winemenubuilder.exe')) || fs.existsSync(path.join(sys, 'winebrowser.exe'));
  } catch {
    return false;
  }
}

const IS_WINE = runningUnderWine();
if (IS_WINE || process.argv.includes('--disable-gpu')) {
  // Wine's GPU/ANGLE path is unreliable; software rendering is fine for this app.
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
}
if (IS_WINE || process.argv.includes('--no-sandbox')) {
  app.commandLine.appendSwitch('no-sandbox');
}

// ---------- Paths ----------
// Tests and multi-profile setups can point user data elsewhere.
if (process.env.SAT_USER_DATA) app.setPath('userData', process.env.SAT_USER_DATA);
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const BANK_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'bank')
  : path.join(app.getAppPath(), 'data', 'bank');

const ALLOWED_STORES = new Set(['progress.json', 'ai-questions.json', 'calc-state.json']);

// ---------- IPC ----------
ipcMain.handle('bank:index', async () => {
  const raw = await fs.promises.readFile(path.join(BANK_DIR, 'index.json'), 'utf-8');
  return JSON.parse(raw);
});

ipcMain.handle('bank:question', async (_e, id: string) => {
  if (typeof id !== 'string' || !/^[0-9a-f]{8}$/.test(id)) throw new Error('Invalid question id');
  const raw = await fs.promises.readFile(path.join(BANK_DIR, 'q', id + '.json'), 'utf-8');
  return JSON.parse(raw);
});

ipcMain.handle('settings:get', () => getSettings());
ipcMain.handle('settings:update', (_e, patch) => updateSettings(patch ?? {}));
ipcMain.handle('settings:setSecret', (_e, name: 'llm' | 'desmos', value: string | null) => {
  if (name !== 'llm' && name !== 'desmos') throw new Error('Unknown secret');
  setSecret(name, typeof value === 'string' && value.trim() ? value.trim() : null);
  return getSettings();
});
// The Desmos key is a client-side key by design (it goes in the script URL), so the renderer may read it.
ipcMain.handle('settings:getDesmosKey', () => getSecret('desmos'));

ipcMain.handle('store:get', (_e, name: string) => {
  if (!ALLOWED_STORES.has(name)) throw new Error('Unknown store');
  return readJson(name, null);
});
ipcMain.handle('store:set', (_e, name: string, data: unknown) => {
  if (!ALLOWED_STORES.has(name)) throw new Error('Unknown store');
  writeJson(name, data);
  return true;
});

function llmConfig() {
  const s = getSettings();
  return { provider: s.llmProvider, model: s.llmModel, apiKey: getSecret('llm'), baseUrl: s.openaiBaseUrl };
}

ipcMain.handle('ai:complete', async (_e, req: CompletionRequest) => {
  try {
    const r = await complete(req, llmConfig());
    return { ok: true, ...r };
  } catch (err) {
    if (err instanceof LLMError) return { ok: false, error: err.toJSON() };
    return { ok: false, error: { code: 'unknown', message: (err as Error).message } };
  }
});

ipcMain.handle('ai:test', async () => {
  try {
    const r = await complete({ system: 'Reply with the single word OK.', messages: [{ role: 'user', content: 'ping' }], maxTokens: 50 }, llmConfig());
    return { ok: true, model: r.model, text: r.text.trim().slice(0, 40) };
  } catch (err) {
    if (err instanceof LLMError) return { ok: false, error: err.toJSON() };
    return { ok: false, error: { code: 'unknown', message: (err as Error).message } };
  }
});

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  wine: IS_WINE,
  secureStorage: encryptionAvailable(),
  userData: app.getPath('userData'),
  packaged: app.isPackaged,
}));

ipcMain.handle('app:openExternal', (_e, url: string) => {
  if (typeof url === 'string' && /^https?:\/\//.test(url)) return shell.openExternal(url);
  return false;
});

// ---------- Window ----------
let win: BrowserWindow | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#f3f4f6',
    title: 'DrillSAT',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  // Open external links in the system browser, never in the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (DEV_SERVER_URL ? !url.startsWith(DEV_SERVER_URL) : !url.startsWith('file:')) e.preventDefault();
  });

  if (DEV_SERVER_URL) {
    win.loadURL(DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
  win.on('closed', () => (win = null));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
