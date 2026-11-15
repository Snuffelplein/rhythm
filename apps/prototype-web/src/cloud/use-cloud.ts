import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Session } from '@supabase/supabase-js';
import { BrowserVault } from '../../../../packages/storage/src/index';
import { VaultSync } from '../../../../packages/storage/src/cloud-sync';
import type { RhythmData } from '../../../../packages/domain/src/index';
import { cloudClient, remoteVaultStore } from './client';

interface Props {
  vault: RefObject<BrowserVault | null>; mode: 'new' | 'personal' | 'demo'; data: RhythmData; saving: boolean;
  onLock: () => void; onRestore: (data: RhythmData) => void; onRecovery: () => void;
  viewGeneration: RefObject<number>; beginRestore: () => () => void;
}
export function useCloud(props: Props) {
  const client = cloudClient();
  const latest = useRef(props); latest.current = props;
  const sessionRef = useRef<Session | null>(null), generation = useRef(0), mounted = useRef(false);
  const controller = useRef<AbortController | null>(null), working = useRef(false);
  const [session, setSession] = useState<Session | null>(null), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(''), [error, setError] = useState(''), [enabled, setEnabled] = useState(false), [recovery, setRecovery] = useState(false);

  useEffect(() => {
    mounted.current = true;
    if (!client) return;
    const { data: { subscription } } = client.auth.onAuthStateChange((event, next) => {
      if (!mounted.current) return;
      if (sessionRef.current?.user.id !== next?.user.id) {
        generation.current++; controller.current?.abort();
        if (event !== 'INITIAL_SESSION') latest.current.onLock();
        setEnabled(false); setMessage(''); setError('');
      }
      sessionRef.current = next; setSession(next);
      if (event === 'PASSWORD_RECOVERY') { setRecovery(true); latest.current.onRecovery(); }
    });
    return () => { mounted.current = false; generation.current++; controller.current?.abort(); subscription.unsubscribe(); };
  }, [client]);

  async function action(task: (engine: VaultSync | null, userId: string | null) => Promise<void>, quiet = false) {
    if (working.current) return;
    working.current = true; setBusy(true); setError(''); if (!quiet) setMessage('');
    const epoch = generation.current, viewEpoch = latest.current.viewGeneration.current, startedData = latest.current.data, userId = sessionRef.current?.user.id ?? null;
    const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 20000);
    const active = () => mounted.current && generation.current === epoch && latest.current.viewGeneration.current === viewEpoch && !abort.signal.aborted;
    try {
      const vault = latest.current.vault.current;
      const engine = client && vault ? new VaultSync(localStorage, vault, remoteVaultStore(client, abort.signal), active) : null;
      await task(engine, userId);
      if (active() && engine && userId) setEnabled(engine.enabled(userId));
    } catch (reason) {
      if (mounted.current && generation.current === epoch) setError(abort.signal.aborted ? 'De verbinding duurt te lang. Je lokale gegevens zijn bewaard; probeer opnieuw.' : reason instanceof Error ? reason.message : 'Dit is niet gelukt. Probeer opnieuw.');
    } finally {
      clearTimeout(timeout); working.current = false;
      if (mounted.current) setBusy(false);
      if (active() && latest.current.data !== startedData) setTimeout(() => { if (mounted.current) void syncRef.current(); }, 0);
    }
  }
  function syncNow() {
    if (latest.current.mode !== 'personal' || latest.current.saving) return Promise.resolve();
    return action(async (engine, userId) => {
      if (!engine || !userId || !engine.enabled(userId)) return;
      const result = await engine.sync(userId);
      const text = result.status === 'disabled' ? 'Synchronisatie staat uit.' : 'Je versleutelde dagboek is gesynchroniseerd. Audio blijft op dit apparaat.';
      setMessage(previous => result.status === 'current' && previous ? previous : text);
    }, true);
  }
  const syncRef = useRef(syncNow); syncRef.current = syncNow;
  useEffect(() => {
    if (!session?.user.id || props.mode !== 'personal' || props.saving) return;
    const timer = setTimeout(() => { void syncRef.current(); }, 650);
    return () => clearTimeout(timer);
  }, [session?.user.id, props.mode, props.data, props.saving]);
  useEffect(() => {
    const online = () => { void syncRef.current(); };
    const visible = () => { if (!document.hidden) online(); };
    window.addEventListener('online', online); document.addEventListener('visibilitychange', visible);
    return () => { window.removeEventListener('online', online); document.removeEventListener('visibilitychange', visible); };
  }, []);

  async function authenticate(kind: 'login' | 'signup' | 'reset', email: string, password: string) {
    if (!client) return;
    await action(async () => {
      const response = kind === 'login' ? await client.auth.signInWithPassword({ email, password }) : kind === 'signup' ? await client.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } }) : await client.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      if (response.error) throw new Error(response.error.code === 'email_not_confirmed' ? 'Bevestig eerst je e-mailadres via de ontvangen e-mail.' : response.error.status === 429 ? 'Er zijn te veel pogingen gedaan. Wacht even en probeer opnieuw.' : 'Aanmelden is niet gelukt. Controleer je gegevens en verbinding.');
      setMessage(kind === 'signup' ? 'Controleer je e-mail om je account te bevestigen. Log daarna in met je accountwachtwoord.' : kind === 'reset' ? 'Als dit adres bij een account hoort, ontvang je een e-mail voor je accountwachtwoord. Je kluiswachtwoord blijft hetzelfde.' : 'Je bent ingelogd. Ontgrendel je lokale dagboek of haal je cloudkopie op.');
    });
  }
  return {
    configured: Boolean(client), session, busy, message, error, enabled, recovery,
    personal: props.mode === 'personal', demo: props.mode === 'demo', hasLocal: Boolean(props.vault.current?.exists()), saving: props.saving,
    authenticate, syncNow,
    enable: () => action(async (engine, id) => {
      if (!engine || !id || latest.current.mode !== 'personal') throw new Error('Ontgrendel eerst je eigen lokale dagboek.');
      engine.enable(id); setEnabled(true); await engine.sync(id);
      setMessage('Synchronisatie staat aan. Je inhoud wordt versleuteld verzonden; audio blijft lokaal.');
    }),
    disable: () => action(async (engine, id) => { if (engine && id) engine.disable(id); setEnabled(false); setMessage('Synchronisatie staat uit. Je lokale dagboek en bestaande cloudkopie blijven bewaard.'); }),
    restore: (password: string) => action(async (engine, id) => {
      if (!engine || !id || latest.current.mode === 'demo' || latest.current.saving) throw new Error('Sluit de demo en wacht tot lokale wijzigingen zijn opgeslagen.');
      const release = latest.current.beginRestore();
      try {
        const data = await engine.restore(id, password);
        latest.current.onRestore(data); setEnabled(true); setMessage('Je cloudkopie is ontgrendeld en lokaal beschikbaar.');
      } finally { release(); }
    }),
    remove: () => action(async (engine, id) => {
      if (!engine || !id) return;
      await engine.remove(id); setEnabled(false); setMessage('Je cloudkopie is verwijderd en synchronisatie staat uit. Je lokale dagboek is behouden.');
    }),
    logout: async () => {
      if (!client) return;
      controller.current?.abort();
      latest.current.onLock();
      const { error: failure } = await client.auth.signOut({ scope: 'local' });
      if (failure) setError('Je dagboek is vergrendeld. Uitloggen van je account is niet gelukt; probeer opnieuw zodra je verbinding hebt.');
      else setRecovery(false);
    },
    updatePassword: (password: string) => action(async () => {
      if (!client) return;
      const { error: failure } = await client.auth.updateUser({ password });
      if (failure) throw new Error('Je accountwachtwoord kon niet worden gewijzigd. Probeer opnieuw.');
      setRecovery(false); setMessage('Je accountwachtwoord is gewijzigd. Je kluiswachtwoord is niet veranderd.');
    }),
  };
}
export type CloudController = ReturnType<typeof useCloud>;
