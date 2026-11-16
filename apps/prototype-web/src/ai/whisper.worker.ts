import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import { WHISPER_MODEL,WHISPER_OPTIONS } from './whisper-config';

env.allowLocalModels = false;
env.useBrowserCache = false;
env.useCustomCache = true;
env.customCache = {
  match: async (request: RequestInfo) => (await caches.open('rhythm-whisper-model-v1')).match(request),
  put: async (request: RequestInfo, response: Response) => (await caches.open('rhythm-whisper-model-v1')).put(request, response),
};
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.wasmPaths = `${self.location.origin}/onnx/`;
}
let transcriber: AutomaticSpeechRecognitionPipeline | null = null;
// Narrow the library's generic factory to this single task to avoid expanding every model union in TypeScript.
const createTranscriber = pipeline as (task: 'automatic-speech-recognition', model: string, options: {
  device: 'wasm'; dtype: 'q8'; progress_callback: (progress: { status: string; progress?: number }) => void;
}) => Promise<AutomaticSpeechRecognitionPipeline>;
self.addEventListener('message', async (event: MessageEvent<{ id: number; type: 'load' | 'transcribe'; audio?: Float32Array }>) => {
  const { id, type, audio } = event.data;
  try {
    if (type === 'load') {
      transcriber = await createTranscriber('automatic-speech-recognition', WHISPER_MODEL, {
        device: 'wasm', dtype: 'q8',
        progress_callback: progress => {
          if (progress.status === 'progress') self.postMessage({ id, type: 'progress', progress: (progress.progress ?? 0) / 100 });
        },
      });
      self.postMessage({ id, type: 'result' });
    } else {
      if (!transcriber || !audio) throw new Error('Whisper is nog niet geladen.');
      self.postMessage({ id, type: 'phase', message: 'Whisper transcribeert lokaal in het Nederlands…' });
      const result = await transcriber(audio, { ...WHISPER_OPTIONS });
      self.postMessage({ id, type: 'result', text: (Array.isArray(result) ? result[0]?.text : result.text)?.trim() ?? '' });
    }
  } catch {
    self.postMessage({ id, type: 'error', message: type === 'load' ? 'Whisper kon niet laden. Controleer de verbinding en vrije opslag en probeer opnieuw.' : 'Omzetten is niet gelukt. Je kunt de opname opnieuw proberen of je notitie typen.' });
  }
});
