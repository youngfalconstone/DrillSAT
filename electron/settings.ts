import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SETTINGS, type Settings } from '../src/shared/types';

type SecretName = 'llm' | 'desmos';

interface StoredFile {
  settings: Partial<Settings>;
  secrets: Partial<Record<SecretName, { enc: boolean; data: string }>>;
}

function filePath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

function readFile(): StoredFile {
  try {
    const raw = fs.readFileSync(filePath(), 'utf-8');
    const parsed = JSON.parse(raw);
    return { settings: parsed.settings ?? {}, secrets: parsed.secrets ?? {} };
  } catch {
    return { settings: {}, secrets: {} };
  }
}

function writeFile(data: StoredFile): void {
  const p = filePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, p);
}

export function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

export function getSettings(): Settings {
  const f = readFile();
  const s: Settings = { ...DEFAULT_SETTINGS, ...f.settings };
  s.hasLlmKey = !!f.secrets.llm?.data;
  s.hasDesmosKey = !!f.secrets.desmos?.data;
  s.secureStorage = encryptionAvailable();
  return s;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const f = readFile();
  // never persist derived fields
  const { hasLlmKey: _a, hasDesmosKey: _b, secureStorage: _c, ...rest } = patch;
  f.settings = { ...f.settings, ...rest };
  writeFile(f);
  return getSettings();
}

export function setSecret(name: SecretName, value: string | null): void {
  const f = readFile();
  if (!value) {
    delete f.secrets[name];
  } else if (encryptionAvailable()) {
    f.secrets[name] = { enc: true, data: safeStorage.encryptString(value).toString('base64') };
  } else {
    // Fallback (e.g. some Wine prefixes without a keyring): obfuscated, not encrypted.
    f.secrets[name] = { enc: false, data: Buffer.from(value, 'utf-8').toString('base64') };
  }
  writeFile(f);
}

export function getSecret(name: SecretName): string | null {
  const f = readFile();
  const s = f.secrets[name];
  if (!s?.data) return null;
  try {
    if (s.enc) return safeStorage.decryptString(Buffer.from(s.data, 'base64'));
    return Buffer.from(s.data, 'base64').toString('utf-8');
  } catch {
    return null;
  }
}

/** Generic JSON document store in userData (progress, AI questions). */
export function readJson<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), name), 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(name: string, data: unknown): void {
  const p = path.join(app.getPath('userData'), name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data), 'utf-8');
  fs.renameSync(tmp, p);
}
