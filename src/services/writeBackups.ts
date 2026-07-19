// Automatic pre-Write backups: before each device Write, the last state
// known to be on the device (captured at Read time) is pushed into a small
// localStorage ring. If a Write goes wrong -- partial failure, verification
// mismatch -- the user can restore one of these from the File menu and
// Write it back.
import type { KeymapProject } from '../types';

const STORAGE_KEY = 'conductor-write-backups';
const MAX_BACKUPS = 20;

export interface WriteBackupEntry {
  at: string; // ISO timestamp
  project: KeymapProject;
}

function readAll(): WriteBackupEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveWriteBackup(project: KeymapProject): void {
  const entries = readAll();
  entries.unshift({ at: new Date().toISOString(), project });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_BACKUPS)));
  } catch {
    // Quota exceeded: drop the oldest entries and retry once with just the
    // new backup -- a single latest backup beats none.
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 1)));
    } catch { /* give up silently -- backups are best-effort */ }
  }
}

export function listWriteBackups(): { at: string }[] {
  return readAll().map(e => ({ at: e.at }));
}

export function loadWriteBackup(at: string): KeymapProject | null {
  return readAll().find(e => e.at === at)?.project ?? null;
}
