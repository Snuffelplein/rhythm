import { describe, it, expect } from 'vitest';
import { BrowserVault, VAULT_KEY, type Envelope } from '../packages/storage/src/index';
import { AccountMismatch, SyncConflict, SYNC_KEY, VaultSync, type RemoteVault, type RemoteVaultStore } from '../packages/storage/src/cloud-sync';
import { emptyData } from '../packages/domain/src/index';

class MemoryStorage implements Storage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  key(i: number) { return [...this.values.keys()][i] ?? null; }
  getItem(k: string) { return this.values.get(k) ?? null; }
  setItem(k: string, v: string) { this.values.set(k, v); }
  removeItem(k: string) { this.values.delete(k); }
}
class Remote implements RemoteVaultStore {
  rows = new Map<string, RemoteVault>();
  loseResponse = false; offline = false;
  async read(id: string) { if (this.offline) throw new Error('offline'); return structuredClone(this.rows.get(id) ?? null); }
  async write(id: string, envelope: Envelope, revision: number | null, changeId: string) {
    if (this.offline) throw new Error('offline');
    if ((this.rows.get(id)?.revision ?? null) !== revision) return null;
    const row = { revision: (revision ?? 0) + 1, changeId, envelope, updatedAt: new Date().toISOString() };
    this.rows.set(id, structuredClone(row));
    if (this.loseResponse) { this.loseResponse = false; throw new Error('Response lost after commit'); }
    return row;
  }
  async remove(id: string, revision: number) { if (this.rows.get(id)?.revision !== revision) return false; return this.rows.delete(id); }
}
async function device(remote: Remote) {
  const storage = new MemoryStorage(), vault = new BrowserVault(storage);
  await vault.unlock('only-on-device-key');
  const data = emptyData(); data.journal.push({ id: 'note', atUtc: '2026-11-15T12:00:00Z', text: 'PRIVATE-CLOUD-SENTINEL', audio: { dataUrl: 'data:audio/wav;base64,PRIVATE-AUDIO', mimeType: 'audio/wav' } });
  await vault.save(data);
  return { storage, vault, data, sync: new VaultSync(storage, vault, remote) };
}
describe('encrypted account sync', () => {
  it('requires explicit opt-in, encrypts content and leaves recordings local', async () => {
    const remote = new Remote(), a = await device(remote);
    expect(await a.sync.sync('user-a')).toEqual({ status: 'disabled' });
    expect(remote.rows.size).toBe(0);
    a.sync.enable('user-a'); await a.sync.sync('user-a');
    expect(JSON.stringify([...remote.rows.values()])).not.toMatch(/PRIVATE|only-on-device-key/);
    const b = await device(remote);
    b.storage.removeItem(VAULT_KEY); b.vault.lock();
    const restored = await b.sync.restore('user-a', 'only-on-device-key');
    expect(restored.journal[0]?.text).toBe('PRIVATE-CLOUD-SENTINEL');
    expect(restored.journal[0]?.audio).toBeUndefined();
    expect((await a.vault.load())?.journal[0]?.audio).toBeDefined();
  });
  it('does not modify a local vault on wrong key or corrupted ciphertext', async () => {
    const remote = new Remote(), a = await device(remote), b = await device(remote);
    a.sync.enable('user-a'); await a.sync.sync('user-a');
    const before = b.vault.encrypted();
    await expect(b.sync.restore('user-a', 'wrong-key')).rejects.toThrow('ontgrendeld');
    expect(b.vault.encrypted()).toBe(before);
    remote.rows.get('user-a')!.envelope.ciphertext = btoa('corrupted ciphertext payload');
    await expect(b.sync.restore('user-a', 'only-on-device-key')).rejects.toThrow();
    expect(b.vault.encrypted()).toBe(before);
  });
  it('resumes offline edits after restart without sending plaintext or duplicating data', async () => {
    const remote = new Remote(), a = await device(remote);
    a.sync.enable('user-a'); await a.sync.sync('user-a');
    remote.offline = true;
    a.data.journal[0]!.text = 'OFFLINE-PRIVATE-EDIT'; await a.vault.save(a.data);
    await expect(a.sync.sync('user-a')).rejects.toThrow('offline');
    a.vault.lock(); const vault = new BrowserVault(a.storage); await vault.unlock('only-on-device-key');
    remote.offline = false;
    const restarted = new VaultSync(a.storage, vault, remote);
    await restarted.sync('user-a'); await restarted.sync('user-a');
    expect(remote.rows.get('user-a')?.revision).toBe(2);
    expect(a.storage.getItem(SYNC_KEY)).not.toContain('OFFLINE-PRIVATE-EDIT');
  });
  it('recognizes an accepted write after a lost HTTP response instead of replaying it', async () => {
    const remote = new Remote(), a = await device(remote);
    a.sync.enable('user-a'); remote.loseResponse = true;
    await expect(a.sync.sync('user-a')).rejects.toThrow('Response lost');
    const restarted = new VaultSync(a.storage, a.vault, remote);
    await restarted.sync('user-a');
    expect(remote.rows.get('user-a')?.revision).toBe(1);
    expect(JSON.parse(a.storage.getItem(SYNC_KEY)!).pending).toBeNull();
  });
  it('stops conflicting device edits and preserves both copies', async () => {
    const remote = new Remote(), a = await device(remote), b = await device(remote);
    a.sync.enable('user-a'); await a.sync.sync('user-a');
    await b.sync.restore('user-a', 'only-on-device-key');
    a.data.journal[0]!.text = 'DEVICE-A-EDIT'; await a.vault.save(a.data); await a.sync.sync('user-a');
    b.data.journal[0]!.text = 'DEVICE-B-EDIT'; await b.vault.save(b.data);
    const before = b.vault.encrypted(), cloud = structuredClone(remote.rows.get('user-a'));
    await expect(b.sync.sync('user-a')).rejects.toBeInstanceOf(SyncConflict);
    expect(b.vault.encrypted()).toBe(before); expect(remote.rows.get('user-a')).toEqual(cloud);
  });
  it('blocks uploading or restoring a locally bound vault through a different account', async () => {
    const remote = new Remote(), a = await device(remote);
    a.sync.enable('user-a'); await a.sync.sync('user-a');
    await expect(a.sync.sync('user-b')).rejects.toBeInstanceOf(AccountMismatch);
    await expect(a.sync.restore('user-b', 'only-on-device-key')).rejects.toBeInstanceOf(AccountMismatch);
    expect(remote.rows.has('user-b')).toBe(false);
  });
  it('does not upload stale in-memory data after another tab changed the stored vault', async () => {
    const remote = new Remote(), a = await device(remote);
    const otherTab = new BrowserVault(a.storage); await otherTab.unlock('only-on-device-key');
    await otherTab.save({ ...a.data, settings: { ...a.data.settings, goalWake: '08:00' } });
    await expect(a.vault.save(a.data)).rejects.toThrow('ander venster');
    a.sync.enable('user-a');
    await expect(a.sync.sync('user-a')).rejects.toThrow('ander venster');
    expect(remote.rows.size).toBe(0);
  });
  it('aborts restore after account/session changes and removes cloud without deleting local logs', async () => {
    const remote = new Remote(), a = await device(remote), b = await device(remote);
    a.sync.enable('user-a'); await a.sync.sync('user-a');
    const before = b.vault.encrypted();
    await expect(b.vault.restoreCloud(remote.rows.get('user-a')!.envelope, 'only-on-device-key', () => false)).rejects.toThrow('gestopt');
    expect(b.vault.encrypted()).toBe(before);
    await a.sync.remove('user-a');
    expect(remote.rows.size).toBe(0); expect(a.vault.encrypted()).not.toBeNull(); expect(a.sync.enabled('user-a')).toBe(false);
  });
});
