import { useState } from 'react';
import { Download, HardDrive, ShieldCheck, Square, Trash2 } from 'lucide-react';
import { loadGemma, loadWhisper, releaseModels, removeModelDownloads, useLocalAI } from './local-ai';

export function ModelControls() {
  const status = useLocalAI();
  const [error, setError] = useState(''), [removing, setRemoving] = useState(false);
  const loading = status.whisper.state === 'loading' || status.gemma.state === 'loading';
  return <div className="model-controls">
    <p className="model-privacy"><ShieldCheck size={16} /> Na de modeldownload gebeurt verwerking op dit apparaat. Audio en tekst worden niet naar een AI-server gestuurd.</p>
    {[{ id: 'whisper' as const, name: 'Whisper', description: 'Nederlandse transcriptie · Whisper Base', size: 'Grotere modeldownload dan Tiny · lokaal op dit apparaat', load: loadWhisper },
      { id: 'gemma' as const, name: 'Gemma', description: 'Klein lokaal model · korte samenvatting van je notitie', size: 'Reken op circa 1 GB vrije ruimte · WebGPU nodig', load: loadGemma }].map(model => {
        const value = status[model.id];
        return <div className="model-option" key={model.id}>
          <div><strong>{model.name}</strong><span>{model.description}</span><small><HardDrive size={12} />{model.size}</small></div>
          <p className={`model-status ${value.state}`} role="status">{value.message}</p>
          {value.state === 'loading' && <progress value={value.progress} max={1} aria-label={`${model.name}: huidige laadstap`} />}
          {value.state !== 'ready' && value.state !== 'loading' && <button type="button" className="button secondary full" disabled={loading || removing} onClick={() => void model.load()}><Download size={16} />{value.state === 'error' ? 'Opnieuw proberen' : `Download en laad ${model.name}`}</button>}
        </div>;
      })}
    <p className="field-hint">De eerste download vraagt internet en kan even duren. Daarna worden modelbestanden lokaal gecachet. Beschikbaarheid hangt af van je browser, opslag en hardware. Downloaden is jouw keuze; typen blijft altijd werken. Voor Gemma gelden de <a href="https://ai.google.dev/gemma/terms" target="_blank" rel="noreferrer">modelvoorwaarden van Google</a>.</p>
    <div className="model-actions"><button type="button" className="text-button" onClick={releaseModels}><Square size={13} />Stop lokale modellen</button>
      <button type="button" className="text-button" disabled={removing} onClick={async () => { setError(''); setRemoving(true); try { await removeModelDownloads(); } catch { setError('Niet alle modelbestanden konden worden gewist. Probeer het opnieuw.'); } finally { setRemoving(false); } }}><Trash2 size={14} />{removing ? 'Wissen…' : 'Modeldownloads wissen'}</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
