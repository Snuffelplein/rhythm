import { BrowserVault, assertEnvelope, type Envelope } from './index';
import type { RhythmData } from '../../domain/src/index';

export const SYNC_KEY = 'rhythm.sync.v1';
export interface RemoteVault { revision: number; changeId: string; envelope: Envelope; updatedAt: string }
export interface RemoteVaultStore {
  read(userId: string): Promise<RemoteVault | null>;
  write(userId: string, envelope: Envelope, revision: number | null, changeId: string, expectedChangeId: string | null): Promise<RemoteVault | null>;
  remove(userId: string, revision: number, expectedChangeId: string): Promise<boolean>;
}
interface Pending { changeId: string; envelope: Envelope; revision: number | null; stamp: string }
interface SyncState { owner: string; enabled: boolean; revision: number | null; head: string | null; stamp: string | null; pending: Pending | null; restoring?: boolean }
export class SyncConflict extends Error {
  constructor() { super('De cloudkopie is op een ander apparaat gewijzigd. Je lokale wijzigingen zijn bewaard. Kies welke kopie je wilt gebruiken; er wordt niets overschreven.'); }
}
export class AccountMismatch extends Error {
  constructor() { super('Deze lokale kluis is aan een ander account gekoppeld. Log in met dat account. Exporteer en verwijder de lokale kluis voordat je hier een ander account gebruikt.'); }
}
const fingerprint = async (raw: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))), b => b.toString(16).padStart(2, '0')).join('');

// One encrypted snapshot per account. Revision checks stop concurrent overwrites;
// a durable pending request makes a lost HTTP response safe to retry.
export class VaultSync {
  constructor(private storage: Storage, private vault: BrowserVault, private remote: RemoteVaultStore, private active: () => boolean = () => true) {}
  private check() { if (!this.active()) throw new Error('Synchronisatie is gestopt.'); }
  private state(userId: string): SyncState {
    const raw = this.storage.getItem(SYNC_KEY);
    if (!raw) return { owner: userId, enabled: false, revision: null, head: null, stamp: null, pending: null };
    const state = JSON.parse(raw) as SyncState;
    if (!state || typeof state.owner !== 'string' || typeof state.enabled !== 'boolean' || !(state.revision === null || Number.isSafeInteger(state.revision))) throw new Error('De synchronisatiestatus is niet leesbaar. Je lokale kluis is bewaard.');
    if (state.owner !== userId) throw new AccountMismatch();
    return state;
  }
  private save(state: SyncState) {
    this.check(); this.state(state.owner);
    try { this.storage.setItem(SYNC_KEY, JSON.stringify(state)); }
    catch { throw new Error('De synchronisatiestatus kon niet lokaal worden bewaard. Mogelijk is de browseropslag vol. Je lokale dagboek is behouden; exporteer je gegevens voordat je opslag vrijmaakt.'); }
  }
  private async stamp() {
    const raw = this.vault.encrypted();
    if (!raw) throw new Error('Maak of open eerst je lokale dagboek.');
    return fingerprint(raw);
  }
  enabled(userId: string) { return this.state(userId).enabled; }
  enable(userId: string) { const state = this.state(userId); if (state.restoring) throw new Error('Een vorige ophaalactie is onderbroken. Haal je cloudkopie opnieuw op voordat je synchronisatie aanzet.'); this.save({ ...state, enabled: true }); }
  disable(userId: string) { const state = this.state(userId); this.save({ ...state, enabled: false }); }
  async inspect(userId: string) {
    this.state(userId); this.check();
    const remote = await this.remote.read(userId); this.check();
    if (remote) assertEnvelope(remote.envelope);
    return remote;
  }
  async sync(userId: string): Promise<{ status: 'saved' | 'current' | 'disabled'; updatedAt?: string }> {
    let state = this.state(userId);
    if (!state.enabled) return { status: 'disabled' };
    const remote = await this.inspect(userId);
    this.check();
    state = this.state(userId); if (!state.enabled) return { status: 'disabled' };
    if (state.pending && remote?.changeId === state.pending.changeId) {
      state = { ...state, revision: remote.revision, head: remote.changeId, stamp: state.pending.stamp, pending: null };
      this.save(state);
    }
    if ((remote?.revision ?? null) !== state.revision || (remote?.changeId ?? null) !== state.head) throw new SyncConflict();
    const stamp = await this.stamp(); this.check();
    if (!state.pending && stamp === state.stamp) return { status: 'current', updatedAt: remote?.updatedAt };
    if (!state.pending) {
      const envelope = await this.vault.forCloud(); this.check();
      const latest = this.state(userId); if (!latest.enabled) return { status: 'disabled' };
      if (latest.head !== state.head || latest.pending !== null) throw new SyncConflict();
      if (envelope.ciphertext.length > 2000000) throw new Error('Je dagboek is te groot voor deze cloudkopie. Je lokale kluis blijft bewaard.');
      state = { ...state, pending: { changeId: crypto.randomUUID(), envelope, revision: state.revision, stamp } };
      this.save(state);
    }
    const pending = state.pending!;
    const latest = this.state(userId); if (!latest.enabled) return { status: 'disabled' };
    if (latest.pending?.changeId !== pending.changeId || latest.head !== state.head) throw new SyncConflict();
    assertEnvelope(pending.envelope);
    const result = await this.remote.write(userId, pending.envelope, pending.revision, pending.changeId, state.head);
    this.check();
    if (!result) throw new SyncConflict();
    if (!this.state(userId).enabled) return { status: 'disabled' };
    this.save({ ...state, revision: result.revision, head: result.changeId, stamp: pending.stamp, pending: null });
    return { status: 'saved', updatedAt: result.updatedAt };
  }
  async restore(userId: string, password: string): Promise<RhythmData> {
    const remote = await this.inspect(userId);
    if (!remote) throw new Error('Er staat nog geen cloudkopie bij dit account.');
    const data = await this.vault.restoreCloud(remote.envelope, password, this.active, async raw => {
      this.save({ owner: userId, enabled: false, revision: remote.revision, head: remote.changeId, stamp: await fingerprint(raw), pending: null, restoring: true });
    });
    this.check();
    this.save({ owner: userId, enabled: true, revision: remote.revision, head: remote.changeId, stamp: await this.stamp(), pending: null });
    return data;
  }
  async remove(userId: string) {
    const state = this.state(userId);
    this.save({ ...state, enabled: false });
    const remote = await this.inspect(userId);
    if (remote && !await this.remote.remove(userId, remote.revision, remote.changeId)) throw new SyncConflict();
    this.check();
    this.save({ ...state, enabled: false, revision: null, head: null, stamp: null, pending: null });
  }
}
