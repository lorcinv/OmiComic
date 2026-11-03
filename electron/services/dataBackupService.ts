import { app, BrowserWindow, dialog, ipcMain, type WebContents } from 'electron';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createDataBackup, parseDataBackup, backupFilename, MAX_BACKUP_BYTES, mergeBackup, autoMatchBackupLocations, type DataBackup, type DataImportOptions } from '../shared/dataBackup';
import { 读取应用数据, 读取备份快照, 导入备份数据, 有导入前备份, 恢复导入前数据, type OmiComicAppData } from './appDataService';

export function registerDataBackupIpc(onApplied: (data: OmiComicAppData) => void) {
  const pending = new WeakMap<WebContents, { token: string; backup: DataBackup }>();
  const error = (cause: unknown) => ({ ok: false, error: { code: 'DATA_BACKUP_FAILED', message: cause instanceof Error ? cause.message : '数据操作失败，请重试。' } });
  ipcMain.handle('数据备份:导出', async event => {
    try {
      const data = createDataBackup(await 读取备份快照(), process.platform, app.getVersion());
      const name = backupFilename(process.platform), options = { title: '导出 OmiComic 数据', defaultPath: name, filters: [{ name: 'OmiComic 数据备份', extensions: ['json'] }] };
      const parent = BrowserWindow.fromWebContents(event.sender);
      const selected = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options);
      if (selected.canceled || !selected.filePath) return { ok: true, data: null };
      const temporary = `${selected.filePath}.${randomUUID()}.tmp`;
      try { await fs.writeFile(temporary, JSON.stringify(data, null, 2) + '\n', 'utf8'); await fs.rename(temporary, selected.filePath); }
      finally { await fs.unlink(temporary).catch(() => undefined); }
      return { ok: true, data: selected.filePath };
    } catch (cause) { return error(cause); }
  });
  ipcMain.handle('数据备份:选择', async event => {
    try {
      pending.delete(event.sender);
      const options = { title: '导入 OmiComic 数据', properties: ['openFile'] as Array<'openFile'>, filters: [{ name: 'OmiComic 数据备份', extensions: ['json'] }] };
      const parent = BrowserWindow.fromWebContents(event.sender), selected = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
      if (selected.canceled || !selected.filePaths[0]) return { ok: true, data: null };
      const file = selected.filePaths[0];
      if ((await fs.stat(file)).size > MAX_BACKUP_BYTES) throw new Error('备份文件超过 64 MB，无法导入。');
      const preview = { token: randomUUID(), backup: parseDataBackup(await fs.readFile(file, 'utf8')) };
      const matches = await autoMatchBackupLocations(preview.backup, await 读取备份快照(), process.platform, async (target, directory) => {
        try { const entry = await fs.stat(target); return directory ? entry.isDirectory() : entry.isFile(); } catch { return false; }
      });
      pending.set(event.sender, preview);
      return { ok: true, data: { ...preview, matches } };
    } catch (cause) { return error(cause); }
  });
  ipcMain.handle('数据备份:导入', async (event, token: string, options: DataImportOptions) => {
    try {
      const preview = pending.get(event.sender);
      if (!preview || preview.token !== token) throw new Error('请重新选择备份文件。');
      // Validate all options and path rewrites before creating a backup or touching persisted data.
      mergeBackup(await 读取应用数据(), preview.backup, options, process.platform);
      for (const mapping of options.mappings) if (!(await fs.stat(mapping.to)).isDirectory()) throw new Error('目标目录无法访问，请重新选择目录。');
      const data = await 导入备份数据(current => {
        const grants = new Map(current.externalReadGrants.map(grant => [grant.sourcePath, grant]));
        for (const mapping of options.mappings) grants.set(mapping.to, {sourcePath:mapping.to,sourceType:'folder'});
        return { ...mergeBackup(current, preview.backup, options, process.platform), externalReadGrants:[...grants.values()] };
      });
      pending.delete(event.sender); onApplied(data);
      return { ok: true, data };
    } catch (cause) { return error(cause); }
  });
  ipcMain.handle('数据备份:可恢复', async () => ({ ok: true, data: await 有导入前备份() }));
  ipcMain.handle('数据备份:恢复', async () => {
    try { const data = await 恢复导入前数据(); onApplied(data); return { ok: true, data }; }
    catch (cause) { return error(cause); }
  });
}
