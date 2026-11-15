import { useEffect, useRef, useState } from 'react';
import { Check, FileAudio, Mic, Sparkles, Square, Trash2, X } from 'lucide-react';
import { ModelControls } from './model-controls';
import { summarizeNote, transcribeAudio, useLocalAI } from './local-ai';

export function VoiceComposer({ text, onText, onAudio, onBusy }: {
  text: string; onText: (text: string) => void; onAudio: (blob: Blob | null) => void; onBusy: (busy: boolean) => void;
}) {
  const models = useLocalAI();
  const [audio, setAudio] = useState<Blob | null>(null), [audioUrl, setAudioUrl] = useState('');
  const [recording, setRecording] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [transcript, setTranscript] = useState<string | null>(null), [summary, setSummary] = useState<string | null>(null), [summarySource, setSummarySource] = useState('');
  const recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; if (timer.current) clearTimeout(timer.current); if (recorder.current?.state === 'recording') recorder.current.stop(); stream.current?.getTracks().forEach(track => track.stop()); }; }, []);
  useEffect(() => { onBusy(recording || busy); }, [recording, busy, onBusy]);
  useEffect(() => { if (!audio) { setAudioUrl(''); return; } const url = URL.createObjectURL(audio); setAudioUrl(url); return () => URL.revokeObjectURL(url); }, [audio]);
  function useAudio(value: Blob | null) { setAudio(value); onAudio(value); setTranscript(null); }
  async function startRecording() {
    setError(''); setBusy(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Opnemen is niet beschikbaar in deze browser. Je kunt een audiobestand kiezen of typen.');
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      const chunks: Blob[] = [];
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
      const device = new MediaRecorder(media, mimeType ? { mimeType, audioBitsPerSecond: 64000 } : undefined);
      recorder.current = device;
      device.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      device.onstop = () => {
        if (timer.current) clearTimeout(timer.current);
        media.getTracks().forEach(track => track.stop());
        if (!alive.current) return;
        setRecording(false); useAudio(new Blob(chunks, { type: device.mimeType }));
      };
      device.onerror = () => { media.getTracks().forEach(track => track.stop()); if (alive.current) { setRecording(false); setError('Opnemen is gestopt door een fout. Je kunt opnieuw opnemen of typen.'); } };
      device.start(); setRecording(true);
      timer.current = setTimeout(() => { if (device.state === 'recording') device.stop(); }, 60000);
    } catch (reason) {
      stream.current?.getTracks().forEach(track => track.stop());
      setError(reason instanceof DOMException && reason.name === 'NotAllowedError' ? 'Geen microfoontoegang. Je kunt toestemming aanpassen, een audiobestand kiezen of typen.' : reason instanceof Error ? reason.message : 'Opnemen is niet gelukt.');
    } finally { if (alive.current) setBusy(false); }
  }
  async function transcribe() {
    if (!audio) return; setBusy(true); setError('');
    try { const value = await transcribeAudio(audio); if (alive.current) setTranscript(value); }
    catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : 'Omzetten is niet gelukt.'); }
    finally { if (alive.current) setBusy(false); }
  }
  async function summarize() {
    setBusy(true); setError(''); const source = text;
    try { const value = await summarizeNote(source); if (alive.current) { setSummarySource(source); setSummary(value); } }
    catch { if (alive.current) setError('Gemma kon geen samenvatting maken. Je oorspronkelijke tekst is behouden.'); }
    finally { if (alive.current) setBusy(false); }
  }
  return <div className="voice-composer">
    <div className="compose-actions"><button type="button" className={`button secondary ${recording ? 'recording' : ''}`} disabled={busy} onClick={() => recording ? recorder.current?.stop() : void startRecording()}>{recording ? <Square size={16} /> : <Mic size={17} />}{recording ? 'Stop opname' : 'Inspreken'}</button>
      <label className="audio-file-button"><FileAudio size={16} />Audiobestand<input aria-label="Audiobestand kiezen" type="file" accept="audio/*" disabled={recording || busy} onChange={event => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 10 * 1024 * 1024) { setError('Kies een audiobestand kleiner dan 10 MB.'); return; } useAudio(file); event.target.value = ''; }} /></label>
      <button type="button" className="button secondary" disabled={!text.trim() || busy || recording || models.gemma.state !== 'ready'} onClick={() => void summarize()}><Sparkles size={16} />Samenvatten met Gemma</button></div>
    {recording && <p className="recording-status" role="status"><span />Je microfoon neemt op. De opname stopt uiterlijk na één minuut.</p>}
    {audio && <div className="audio-preview"><audio controls src={audioUrl || undefined} aria-label="Je opname terugluisteren" /><button type="button" className="icon-button" disabled={busy} aria-label="Opname verwijderen" onClick={() => useAudio(null)}><Trash2 size={16} /></button><button type="button" className="button secondary full" disabled={busy || models.whisper.state !== 'ready'} onClick={() => void transcribe()}><Mic size={16} />{busy ? 'Lokaal verwerken…' : 'Omzetten met Whisper'}</button>{models.whisper.state !== 'ready' && <p className="field-hint">Laad Whisper hieronder om de opname naar tekst om te zetten. Je kunt de opname ook zonder transcriptie bij je notitie bewaren.</p>}</div>}
    {busy && <p className="field-hint" role="status">Lokaal verwerken… Dit kan even duren. Je tekst blijft bewaard in dit venster.</p>}
    {transcript !== null && <section className="ai-draft"><div className="inline-label"><Mic size={16} />Whisper · concepttranscriptie</div><p>Controleer wat er is verstaan. Pas namen, tijden en woorden zo nodig aan.</p><label>Transcriptie controleren<textarea aria-label="Transcriptie controleren" rows={4} value={transcript} onChange={event => setTranscript(event.target.value)} /></label><div className="form-actions"><button type="button" className="text-button" onClick={() => setTranscript(null)}><X size={14} />Verwerpen</button><button type="button" className="button secondary" disabled={!transcript.trim()} onClick={() => { onText([text, transcript.trim()].filter(Boolean).join('\n\n')); setTranscript(null); }}><Check size={16} />Voeg gecontroleerde tekst toe</button></div></section>}
    {summary !== null && <section className="ai-draft"><div className="inline-label"><Sparkles size={16} />Gemma · conceptsamenvatting</div><p>Lees het voorstel na. Alleen jij bepaalt of deze tekst in je dagboek komt.</p><label>Samenvatting controleren<textarea aria-label="Samenvatting controleren" rows={4} value={summary} onChange={event => setSummary(event.target.value)} /></label>{text !== summarySource && <p className="field-hint">Je notitie is intussen aangepast. Maak een nieuwe samenvatting voor de huidige tekst.</p>}<div className="form-actions"><button type="button" className="text-button" onClick={() => setSummary(null)}><X size={14} />Verwerpen</button><button type="button" className="button secondary" disabled={!summary.trim() || text !== summarySource} onClick={() => { onText([text, `Mijn samenvatting:\n${summary.trim()}`].filter(Boolean).join('\n\n')); setSummary(null); }}><Check size={16} />Voeg samenvatting toe</button></div></section>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <details className="form-details"><summary>Spraak en AI op dit apparaat instellen</summary><ModelControls /></details>
  </div>;
}
