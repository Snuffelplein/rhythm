import { describe, it, expect } from 'vitest';
import { assertData, emptyData } from '../packages/domain/src/index';
import { BrowserVault, VAULT_KEY, assertEnvelope } from '../packages/storage/src/index';
import { SYNC_KEY, VaultSync } from '../packages/storage/src/cloud-sync';
import { validatePublicConfig } from '../scripts/validate-public-config';

class MemoryStorage implements Storage {
  private values = new Map<string,string>();
  get length() { return this.values.size; } key(i: number) { return [...this.values.keys()][i] ?? null; }
  clear() { this.values.clear(); } getItem(k: string) { return this.values.get(k) ?? null; }
  setItem(k: string,v: string) { this.values.set(k,v); } removeItem(k: string) { this.values.delete(k); }
}
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
async function legacy(data: unknown, password = 'legacy-8') {
  const salt=crypto.getRandomValues(new Uint8Array(16)), iv=crypto.getRandomValues(new Uint8Array(12));
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',iterations:310000,salt},material,{name:'AES-GCM',length:256},false,['encrypt']);
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(data)));
  return {version:1 as const,salt:b64(salt),iv:b64(iv),ciphertext:b64(new Uint8Array(ciphertext))};
}
describe('security regression', () => {
  it('rejects privileged client configuration and unexpected connection origins',()=>{
    const csp="connect-src 'self' https://safe.supabase.co";
    expect(()=>validatePublicConfig({VITE_SUPABASE_PUBLISHABLE_KEY:'sb_secret_SYNTHETIC'},csp)).toThrow('publishable key');
    expect(()=>validatePublicConfig({VITE_SUPABASE_PUBLISHABLE_KEY:'eyJ-SYNTHETIC-JWT'},csp)).toThrow();
    expect(()=>validatePublicConfig({VITE_SUPABASE_URL:'https://attacker.invalid'},csp)).toThrow();
    expect(()=>validatePublicConfig({VITE_SUPABASE_URL:'https://safe.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_example'},csp)).not.toThrow();
  });
  it('reads and upgrades a real legacy v1 vault without losing data or accepting a wrong key',async()=>{
    const store=new MemoryStorage(), data=emptyData();data.journal.push({id:'legacy-note',atUtc:'2026-11-15T10:00:00Z',text:'PRIVATE-LEGACY'});
    const raw=JSON.stringify(await legacy(data));store.setItem(VAULT_KEY,raw);
    await expect(new BrowserVault(store).unlock('wrong-password')).rejects.toThrow();expect(store.getItem(VAULT_KEY)).toBe(raw);
    expect(await new BrowserVault(store).unlock('legacy-8')).toEqual(data);
    const upgraded=store.getItem(VAULT_KEY)!;expect(JSON.parse(upgraded).version).toBe(2);expect(upgraded).not.toContain('PRIVATE-LEGACY');
    expect(await new BrowserVault(store).unlock('legacy-8')).toEqual(data);
  });
  it('uses 600000 PBKDF2 iterations and authenticated version context for new encryption',async()=>{
    const store=new MemoryStorage(), vault=new BrowserVault(store);await vault.unlock('new-security-key');await vault.save(emptyData());
    const envelope=JSON.parse(store.getItem(VAULT_KEY)!);
    const material=await crypto.subtle.importKey('raw',new TextEncoder().encode('new-security-key'),'PBKDF2',false,['deriveKey']);
    const key=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',iterations:600000,salt:Uint8Array.from(atob(envelope.salt),c=>c.charCodeAt(0))},material,{name:'AES-GCM',length:256},false,['decrypt']);
    const iv=Uint8Array.from(atob(envelope.iv),c=>c.charCodeAt(0)), cipher=Uint8Array.from(atob(envelope.ciphertext),c=>c.charCodeAt(0));
    expect(JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('rhythm.vault.v2')},key,cipher))).schemaVersion).toBe(1);
    await expect(crypto.subtle.decrypt({name:'AES-GCM',iv},key,cipher)).rejects.toThrow();
  });
  it('rejects malformed decrypted cloud data before replacing a local vault',async()=>{
    const store=new MemoryStorage(), vault=new BrowserVault(store);await vault.unlock('local-security-key');await vault.save(emptyData());const before=vault.encrypted();
    const data=emptyData();data.journal.push({id:'tracking',atUtc:'2026-11-15T10:00:00Z',text:'note',audio:{mimeType:'audio/wav',dataUrl:'https://attacker.invalid/leak'}});
    await expect(vault.restoreCloud(await legacy(data,'local-security-key'),'local-security-key')).rejects.toThrow();expect(vault.encrypted()).toBe(before);
  });
  it.each([
    { ...emptyData(), settings:{timezone:'Not/AZone',goalBed:'',goalWake:'',theme:'dark'} },
    { ...emptyData(), settings:{timezone:'UTC',goalBed:'',goalWake:'',theme:['dark']} },
    { ...emptyData(), journal:[{id:'x',atUtc:'yesterday',text:'bad'}] },
    { ...emptyData(), journal:[{id:'x',atUtc:'2026-02-30T10:00:00Z',text:'invalid calendar date'}] },
    { ...emptyData(), journal:[{id:'x',atUtc:'2026-11-15T10:00:00Z',text:42}] },
    { ...emptyData(), checkins:[{id:'x',atUtc:'2026-11-15T10:00:00Z',energy:Infinity,sleepiness:2}] },
    { ...emptyData(), extra:{__proto__:{polluted:true}} },
  ])('rejects untrusted data shapes',data=>{expect(()=>assertData(data)).toThrow();});
  it('validates envelope fields and bounds before expensive key derivation',()=>{
    for(const value of [{version:999}, {version:2,salt:'x',iv:'y',ciphertext:'z'}, {version:2,salt:'a'.repeat(24),iv:'a'.repeat(16),ciphertext:'a'.repeat(8000001)}]) expect(()=>assertEnvelope(value)).toThrow();
  });
  it('does not replace the local vault if the durable restore marker cannot be stored',async()=>{
    const store=new MemoryStorage(), vault=new BrowserVault(store);await vault.unlock('local-security-key');await vault.save(emptyData());const before=vault.encrypted();
    const envelope=await vault.forCloud(); const set=store.setItem.bind(store);store.setItem=(key,value)=>{if(key===SYNC_KEY)throw new Error('quota');set(key,value);};
    const sync=new VaultSync(store,vault,{read:async()=>({revision:1,changeId:'remote',envelope,updatedAt:new Date().toISOString()}),write:async()=>null,remove:async()=>false});
    await expect(sync.restore('account','local-security-key')).rejects.toThrow('browseropslag vol');expect(vault.encrypted()).toBe(before);
  });
  it('persists a snapshot instead of accidentally exposing later caller mutations',async()=>{
    const store=new MemoryStorage(),vault=new BrowserVault(store);await vault.unlock('snapshot-security-key');
    const data=emptyData();data.journal.push({id:'snapshot',atUtc:'2026-11-15T10:00:00Z',text:'Confirmed text'});
    const pending=vault.save(data);data.journal[0]!.text='UNSAVED PRIVATE DRAFT';await pending;
    expect((await vault.load())?.journal[0]?.text).toBe('Confirmed text');
    expect((await new BrowserVault(store).unlock('snapshot-security-key'))?.journal[0]?.text).toBe('Confirmed text');
  });
  it('fails closed after interruption between restore checkpoint and local replacement',async()=>{
    const store=new MemoryStorage(),vault=new BrowserVault(store);await vault.unlock('checkpoint-security-key');await vault.save(emptyData());const before=vault.encrypted();
    const envelope=await vault.forCloud();const restore=vault.restoreCloud.bind(vault);
    vault.restoreCloud=(value,password,active,checkpoint)=>restore(value,password,active,async raw=>{await checkpoint?.(raw);throw new Error('simulated interruption');});
    const sync=new VaultSync(store,vault,{read:async()=>({revision:1,changeId:'remote',envelope,updatedAt:new Date().toISOString()}),write:async()=>null,remove:async()=>false});
    await expect(sync.restore('account','checkpoint-security-key')).rejects.toThrow('interruption');
    expect(vault.encrypted()).toBe(before);expect(sync.enabled('account')).toBe(false);expect(()=>sync.enable('account')).toThrow('onderbroken');
    expect((await sync.sync('account')).status).toBe('disabled');
    vault.restoreCloud=restore;await sync.restore('account','checkpoint-security-key');expect(sync.enabled('account')).toBe(true);
  });
});
