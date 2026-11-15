import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertEnvelope } from '../../../../packages/storage/src/index';
import type { RemoteVault, RemoteVaultStore } from '../../../../packages/storage/src/cloud-sync';

// These are intentionally public browser credentials. Access is enforced by Auth + RLS.
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'https://hphwmhmssexnrhkcxdpi.supabase.co';
export const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_vPTUZQn9GkbCAx9e67pobg_zt3Im8QC';
let instance: SupabaseClient | null = null;
export function cloudClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabasePublishableKey) return null;
  if (!instance) instance = createClient(supabaseUrl, supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'rhythm.auth.v1' },
  });
  return instance;
}
const columns = 'revision,change_id,envelope,updated_at';
function row(value: Record<string, unknown>): RemoteVault {
  assertEnvelope(value.envelope);
  if (!Number.isSafeInteger(value.revision) || Number(value.revision) < 1 || typeof value.change_id !== 'string' || typeof value.updated_at !== 'string') throw new Error('De cloudkopie heeft een onbekend formaat.');
  return { revision: Number(value.revision), changeId: value.change_id, envelope: value.envelope, updatedAt: value.updated_at };
}
function failed(code?: string): never {
  throw new Error(code === '42501' ? 'Je account heeft geen toegang tot deze cloudkopie.' : 'Verbinden met je cloudkopie is niet gelukt. Je lokale gegevens zijn bewaard. Controleer je verbinding en probeer opnieuw.');
}
export function remoteVaultStore(client: SupabaseClient, signal: AbortSignal): RemoteVaultStore {
  return {
    async read(userId) {
      const { data, error } = await client.from('encrypted_vaults').select(columns).eq('user_id', userId).abortSignal(signal).maybeSingle();
      if (error) failed(error.code);
      return data ? row(data) : null;
    },
    async write(userId, envelope, revision, changeId) {
      const payload = { user_id: userId, envelope, revision: (revision ?? 0) + 1, change_id: changeId };
      const query = revision === null ? client.from('encrypted_vaults').insert(payload) : client.from('encrypted_vaults').update(payload).eq('user_id', userId).eq('revision', revision);
      const { data, error } = await query.select(columns).abortSignal(signal).maybeSingle();
      if (error?.code === '23505') return null;
      if (error) failed(error.code);
      return data ? row(data) : null;
    },
    async remove(userId, revision) {
      const { data, error } = await client.from('encrypted_vaults').delete().eq('user_id', userId).eq('revision', revision).select('user_id').abortSignal(signal);
      if (error) failed(error.code);
      return Boolean(data?.length);
    },
  };
}
