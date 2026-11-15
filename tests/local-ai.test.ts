import { describe, expect, it } from 'vitest';
import { buildSummaryPrompt, releaseModels, summarizeNote, transcribeAudio } from '../apps/prototype-web/src/ai/local-ai';
import { emptyData } from '../packages/domain/src/index';
import { exportJson } from '../packages/exports/src/index';

describe('local AI boundaries and linked diary records', () => {
  it('uses only the explicitly supplied note as summary context', () => {
    const prompt = buildSummaryPrompt('Mijn eigen notitie');
    expect(prompt).toContain('<notitie>\nMijn eigen notitie\n</notitie>');
    expect(prompt).toContain('geen feiten, tijden, diagnoses');
    expect(buildSummaryPrompt('a'.repeat(6000) + 'PRIVATE-TAIL')).not.toContain('PRIVATE-TAIL');
  });
  it('does not pretend inference works before a model is loaded', async () => {
    releaseModels();
    await expect(summarizeNote('notitie')).rejects.toThrow('Laad eerst Gemma');
    await expect(transcribeAudio(new Blob())).rejects.toThrow('Laad eerst Whisper');
  });
  it('keeps linked check-ins and audio private by default without changing schema 1', () => {
    const data = emptyData();
    data.checkins.push({ id: 'c', atUtc: '2026-11-15T18:00:00Z', energy: 2, sleepiness: 4, sleepSessionId: 's' });
    data.journal.push({ id: 'j', atUtc: '2026-11-15T18:00:00Z', text: 'PRIVATE', sleepSessionId: 's', audio: { dataUrl: 'data:audio/wav;base64,PRIVATE-AUDIO', mimeType: 'audio/wav' } });
    const redacted = exportJson(data);
    expect(redacted).not.toContain('PRIVATE');
    expect(JSON.parse(redacted).checkins[0].sleepSessionId).toBe('s');
    expect(JSON.parse(redacted).schemaVersion).toBe(1);
    expect(exportJson(data, true)).toContain('PRIVATE-AUDIO');
  });
});
