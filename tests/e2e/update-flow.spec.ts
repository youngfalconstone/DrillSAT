/**
 * Full auto-update flow against a local feed (opt-in: SAT_UPDATE_FLOW=1, SAT_E2E_EXE=<installed DrillSAT.exe>,
 * SAT_UPDATE_URL=<http feed serving a newer latest.yml + setup exe>, SAT_UPDATE_EXPECT=<newer version>).
 * The installed app must find the update, download it, and after "Restart to update" the installed exe must be
 * the newer version. Uses a throw-away profile.
 */
import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

test.skip(!process.env.SAT_UPDATE_FLOW || !process.env.SAT_E2E_EXE || !process.env.SAT_UPDATE_URL, 'update flow is opt-in');

function exeVersion(exe: string): string {
  return execFileSync('powershell.exe', ['-NoProfile', '-Command', `(Get-Item '${exe}').VersionInfo.ProductVersion`]).toString().trim();
}

test('installed app downloads the newer release and installs it on restart', async () => {
  test.setTimeout(420000);
  const exe = process.env.SAT_E2E_EXE!;
  const want = process.env.SAT_UPDATE_EXPECT!;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drillsat-upd-'));
  const app = await electron.launch({ executablePath: exe, args: [], env: { ...process.env, SAT_USER_DATA: dir, SAT_UPDATE_URL: process.env.SAT_UPDATE_URL! } });
  const page = await app.firstWindow();
  await page.waitForSelector('.sidebar');
  await page.getByRole('button', { name: 'Settings' }).click();
  const status = page.getByTestId('update-status');
  await expect(status).toContainText(`DrillSAT ${want} is downloaded`, { timeout: 240000 });
  await expect(page.locator('.update-banner')).toContainText(`DrillSAT ${want} is ready to install`);
  console.log('status:', await status.textContent());
  const closed = new Promise((r) => app.process().once('exit', r));
  await page.getByRole('button', { name: 'Restart to update' }).first().click();
  await closed;
  await expect.poll(() => exeVersion(exe).startsWith(want), { timeout: 180000, intervals: [2000] }).toBe(true);
  console.log('installed version now', exeVersion(exe));
  fs.rmSync(dir, { recursive: true, force: true });
});
