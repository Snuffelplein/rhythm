import { Share, Smartphone } from 'lucide-react';

export function HomeScreenCard() {
  return <section className="panel spaced home-screen-card" aria-labelledby="home-screen-title">
    <div className="section-heading"><h2 id="home-screen-title">Rhythm op je beginscherm</h2><Smartphone size={21} /></div>
    <p>Start Rhythm via het appicoon, in een eigen venster zonder Safari-adresbalk.</p>
    <details>
      <summary>Toevoegen op je iPhone</summary>
      <ol>
        <li>Open het Rhythm-adres in Safari.</li>
        <li>Tik op <Share size={16} aria-hidden="true" /> <strong>Deel</strong> en kies <strong>Zet op beginscherm</strong>.</li>
        <li>Laat <strong>Open als webapp</strong> aan staan als die keuze verschijnt en tik op <strong>Voeg toe</strong>.</li>
        <li>Open Rhythm daarna via het icoon op je beginscherm.</li>
      </ol>
    </details>
    <p className="field-hint">Gebruik voor je dagboek steeds hetzelfde adres en hetzelfde appicoon.</p>
  </section>;
}
