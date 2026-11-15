import { useState, type FormEvent } from 'react';
import { Cloud, LockKeyhole } from 'lucide-react';
import type { CloudController } from './use-cloud';

export function CloudPanel({ cloud, onUnlock }: { cloud: CloudController; onUnlock: () => void }) {
  const [tab, setTab] = useState<'login' | 'signup' | 'reset'>('login');
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [vaultPassword, setVaultPassword] = useState('');
  const [consent, setConsent] = useState(false), [replace, setReplace] = useState(false);
  const disabled = cloud.busy || cloud.saving;
  async function auth(event: FormEvent) { event.preventDefault(); await cloud.authenticate(tab, email.trim(), password); setPassword(''); }
  async function restore(event: FormEvent) { event.preventDefault(); await cloud.restore(vaultPassword); setVaultPassword(''); }
  return <section className="panel spaced cloud-panel" aria-labelledby="cloud-heading">
    <div className="section-heading"><h2 id="cloud-heading">Account & synchronisatie</h2><Cloud size={22} /></div>
    <p>Je account verbindt je apparaten. Je kluiswachtwoord ontsleutelt je dagboek en wordt niet naar de server gestuurd.</p>
    {!cloud.configured ? <p>Accounts zijn voor deze versie nog niet ingesteld. Je kunt lokaal blijven loggen.</p> : cloud.demo ? <p>Sluit de demo om met je eigen account en dagboek te werken. Voorbeeldgegevens worden niet geüpload.</p> : <>
      {!cloud.session ? <>
        <div className="cloud-tabs" aria-label="Accountactie">{([['login', 'Inloggen'], ['signup', 'Account maken'], ['reset', 'Wachtwoord vergeten']] as const).map(([id, text]) => <button type="button" className="text-button" aria-pressed={tab === id} disabled={disabled} key={id} onClick={() => { setTab(id); setPassword(''); }}>{text}</button>)}</div>
        <form onSubmit={auth}>
          <label>E-mailadres<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
          {tab !== 'reset' && <label>Accountwachtwoord<input type="password" autoComplete={tab === 'signup' ? 'new-password' : 'current-password'} minLength={tab === 'signup' ? 12 : 1} required value={password} onChange={event => setPassword(event.target.value)} /></label>}
          {tab === 'signup' && <p className="field-hint">Kies minstens 12 tekens. Je kluiswachtwoord blijft een aparte sleutel: een accountreset kan je versleutelde dagboek niet ontsleutelen.</p>}
          <button className="button primary full" disabled={disabled}>{cloud.busy ? 'Even geduld…' : tab === 'login' ? 'Log in op mijn account' : tab === 'signup' ? 'Maak mijn account' : 'Stuur herstellink'}</button>
        </form>
      </> : <>
        <p className="cloud-account">Ingelogd als <strong>{cloud.session.user.email}</strong></p>
        {cloud.recovery && <form onSubmit={async event => { event.preventDefault(); await cloud.updatePassword(password); setPassword(''); }}>
          <label>Nieuw accountwachtwoord<input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={event => setPassword(event.target.value)} /></label>
          <button className="button primary full" disabled={disabled}>Bewaar mijn accountwachtwoord</button>
        </form>}
        {!cloud.personal && <button className="button secondary full" disabled={disabled} onClick={onUnlock}><LockKeyhole size={17} />{cloud.hasLocal ? 'Ontgrendel lokaal dagboek' : 'Maak lokaal dagboek'}</button>}
        {!cloud.enabled ? <div className="cloud-enable">
          <label className="checkbox-label"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /><span>Synchroniseer mijn slaap, energie, tekstnotities en dagankers versleuteld. Audio blijft op dit apparaat.</span></label>
          <button className="button primary full" disabled={disabled || !consent || !cloud.personal} onClick={() => void cloud.enable()}>Zet synchronisatie aan</button>
        </div> : <div className="cloud-actions"><button className="button primary full" disabled={disabled || !cloud.personal} onClick={() => void cloud.syncNow()}>Synchroniseer nu</button><button className="text-button" disabled={disabled} onClick={() => void cloud.disable()}>Stop synchronisatie op dit apparaat</button></div>}
        <details className="cloud-restore"><summary>Cloudkopie ophalen op dit apparaat</summary>
          <form onSubmit={restore}>
            <p className="field-hint">Gebruik het kluiswachtwoord waarmee de cloudkopie is gemaakt. Dit is niet je accountwachtwoord. Een nieuwe cloudkopie wordt nooit automatisch over een lokaal dagboek gezet. Na ophalen staat versleutelde synchronisatie aan; audio blijft lokaal.</p>
            <label>Kluiswachtwoord voor cloudkopie<input type="password" autoComplete="off" required value={vaultPassword} onChange={event => setVaultPassword(event.target.value)} /></label>
            {cloud.hasLocal && <label className="checkbox-label"><input type="checkbox" required checked={replace} onChange={event => setReplace(event.target.checked)} /><span>Ik wil mijn lokale dagboek vervangen door de cloudkopie. Ik heb eventuele lokale wijzigingen eerst geëxporteerd.</span></label>}
            <button className="button secondary full" disabled={disabled || (cloud.hasLocal && !replace)}>Ontgrendel en haal cloudkopie op</button>
          </form>
        </details>
        <div className="cloud-actions"><button className="text-button" disabled={disabled} onClick={() => { if (window.confirm('Je cloudkopie verwijderen? Synchronisatie stopt op dit apparaat. Andere apparaten kunnen later opnieuw uploaden. Je lokale dagboek blijft behouden.')) void cloud.remove(); }}>Verwijder cloudkopie</button><button className="button secondary full" onClick={() => void cloud.logout()}>Uitloggen en dagboek vergrendelen</button></div>
      </>}
    </>}
    {cloud.message && <p className="cloud-status" role="status">{cloud.message}</p>}
    {cloud.error && <p className="form-error" role="alert">{cloud.error}</p>}
  </section>;
}
