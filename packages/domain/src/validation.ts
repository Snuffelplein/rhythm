import type { RhythmData } from './index';
import { assertCoaching } from '../../coaching/src/validation';

const invalid = (): never => { throw new Error('Ongeldige dagboekgegevens. De opslag is niet gewijzigd.'); };
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 128): asserts value is string { if (typeof value !== 'string' || !value.length || value.length > max) invalid(); }
function time(value: unknown): asserts value is string { text(value, 40); const parsed = Date.parse(value); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?Z$/.test(value) || !Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0,16) !== value.slice(0,16)) invalid(); }
function zone(value: unknown) { text(value); try { new Intl.DateTimeFormat('nl', { timeZone: value }).format(0); } catch { invalid(); } }
function list(value: unknown): unknown[] { if (!Array.isArray(value) || value.length > 50000) invalid(); return value as unknown[]; }
function number(value: unknown, min: number, max: number) { if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) invalid(); }
function oneOf(value: unknown, choices: string[]) { if (typeof value !== 'string' || !choices.includes(value)) invalid(); }
function interval(value: unknown, keys = ['startUtc', 'endUtc']) { const v = record(value, keys); time(v.startUtc); time(v.endUtc); if (Date.parse(v.startUtc) >= Date.parse(v.endUtc)) invalid(); return v; }
function entities(value: unknown, validate: (item: unknown) => Record<string, unknown>) {
  const ids = new Set<string>();
  for (const item of list(value)) { const v = validate(item); text(v.id); if (ids.has(v.id)) invalid(); ids.add(v.id); }
}
export function assertData(value: unknown): asserts value is RhythmData {
  const data = record(value, ['schemaVersion', 'sessions', 'intent', 'wakeMarkers', 'checkins', 'journal', 'audit', 'settings', 'guidance', 'profile','coaching']);
  if (data.schemaVersion !== 1) invalid();
  if(data.coaching!==undefined)assertCoaching(data.coaching);
  const settings = record(data.settings, ['timezone', 'goalBed', 'goalWake', 'theme']);
  zone(settings.timezone);
  for (const goal of [settings.goalBed, settings.goalWake]) if (typeof goal !== 'string' || (goal !== '' && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(goal))) invalid();
  oneOf(settings.theme, ['dark','light']);
  if (data.profile !== undefined) {
    const p=record(data.profile,['version','givenName','birthDate','challenges','duration','context','goals','completedAtUtc','onboardingStep']);
    if(p.version!==1||typeof p.givenName!=='string'||p.givenName.length>80||(p.completedAtUtc!==''&&!p.givenName.trim()))invalid();
    if(typeof p.birthDate!=='string'||(p.birthDate!==''&&(!/^\d{4}-\d{2}-\d{2}$/.test(p.birthDate)||!Number.isFinite(Date.parse(p.birthDate))||new Date(p.birthDate).toISOString().slice(0,10)!==p.birthDate||p.birthDate>new Date().toISOString().slice(0,10)||p.birthDate<'1900-01-01')))invalid();
    for(const item of list(p.challenges))oneOf(item,['shifting','falling_asleep','split_sleep','daytime_tired','structure']);
    for(const item of list(p.goals))oneOf(item,['understand','energy','routine','professional']);
    if(list(p.challenges).length>5||new Set(list(p.challenges)).size!==list(p.challenges).length||list(p.goals).length>4||new Set(list(p.goals)).size!==list(p.goals).length)invalid();
    oneOf(p.duration,['recent','months','longer','unspecified']);if(typeof p.context!=='string'||p.context.length>2000)invalid();if(p.completedAtUtc!=='')time(p.completedAtUtc);if(p.onboardingStep!==undefined){number(p.onboardingStep,0,2);if(!Number.isInteger(p.onboardingStep))invalid();}
  }
  if (data.guidance !== undefined) {
    const g = record(data.guidance, ['windDownMinutes','checkinTime','commitments','feedback']);
    oneOf(String(g.windDownMinutes), ['15','30','60']); number(g.windDownMinutes,15,60);
    if (typeof g.checkinTime !== 'string' || (g.checkinTime !== '' && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(g.checkinTime))) invalid();
    if (list(g.commitments).length > 8) invalid();
    entities(g.commitments, item => { const v=record(item,['id','label','time']); text(v.label,80); if (typeof v.time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v.time)) invalid(); return v; });
    entities(g.feedback, item => { const v=record(item,['id','atUtc','eventId','outcome','reason']); time(v.atUtc); text(v.eventId,200); oneOf(v.outcome,['done','hard','skip']); if(v.reason!==undefined) oneOf(v.reason,['not_sleepy','very_tired','busy','other']); return v; });
  }
  if (data.intent !== null) { const v = record(data.intent, ['id', 'startedAtUtc', 'originalTimezone']); text(v.id); time(v.startedAtUtc); zone(v.originalTimezone); }
  entities(data.sessions, item => {
    const v = interval(item, ['id','startUtc','endUtc','originalTimezone','source','kind','inBedAtUtc','reviewStatus','interruptions','estimatedAwakeMinutes','createdAtUtc','updatedAtUtc']);
    zone(v.originalTimezone); time(v.createdAtUtc); time(v.updatedAtUtc);
    if (v.inBedAtUtc !== undefined) { time(v.inBedAtUtc); if (Date.parse(v.inBedAtUtc) > Date.parse(v.startUtc as string)) invalid(); }
    oneOf(v.source, ['user_reported','healthkit']); oneOf(v.kind, ['sleep','nap']); oneOf(v.reviewStatus, ['unreviewed','confirmed','corrected']);
    number(v.estimatedAwakeMinutes, 0, (Date.parse(v.endUtc as string) - Date.parse(v.startUtc as string))/60000);
    for (const gap of list(v.interruptions)) { const p = interval(gap); if (Date.parse(p.startUtc as string) < Date.parse(v.startUtc as string) || Date.parse(p.endUtc as string) > Date.parse(v.endUtc as string)) invalid(); }
    return v;
  });
  entities(data.wakeMarkers, item => { const v = record(item, ['id','atUtc','intentId']); time(v.atUtc); if (v.intentId !== undefined) text(v.intentId); return v; });
  entities(data.checkins, item => { const v = record(item, ['id','atUtc','energy','sleepiness','sleepSessionId']); time(v.atUtc); number(v.energy,1,5); number(v.sleepiness,1,5); if (!Number.isInteger(v.energy) || !Number.isInteger(v.sleepiness)) invalid(); if (v.sleepSessionId !== undefined) text(v.sleepSessionId); return v; });
  entities(data.journal, item => {
    const v = record(item, ['id','atUtc','text','sleepSessionId','audio','audioRef']); time(v.atUtc);
    if (typeof v.text !== 'string' || v.text.length > 64000) invalid(); if (v.sleepSessionId !== undefined) text(v.sleepSessionId);
    if (v.audio !== undefined) {
      const audio = record(v.audio, ['mimeType','dataUrl']); text(audio.mimeType,128); text(audio.dataUrl,14000000);
      if (!/^audio\/(webm|mp4|wav|x-wav|mpeg|ogg|aac|flac|x-flac)(?:;[a-z0-9=., "'_-]+)?$/i.test(audio.mimeType) || !audio.dataUrl.startsWith(`data:${audio.mimeType};base64,`) || !/^[A-Za-z0-9+/]*={0,2}$/.test(audio.dataUrl.slice(`data:${audio.mimeType};base64,`.length))) invalid();
    }
    if(v.audioRef!==undefined){const ref=record(v.audioRef,['path','mimeType','sha256','size']);text(ref.path,256);text(ref.mimeType,128);text(ref.sha256,64);if(!/^[0-9a-f-]{36}\/[0-9a-f]{64}\/[0-9a-f]{64}$/.test(ref.path)||!/^[a-f0-9]{64}$/.test(ref.sha256)||!/^audio\/(webm|mp4|wav|x-wav|mpeg|ogg|aac|flac|x-flac)(?:;[a-z0-9=., "'_-]+)?$/i.test(ref.mimeType))invalid();number(ref.size,1,10000000);}
    return v;
  });
  entities(data.audit, item => { const v = record(item, ['id','atUtc','type','objectIds']); time(v.atUtc); text(v.type); for (const id of list(v.objectIds)) text(id); return v; });
}
