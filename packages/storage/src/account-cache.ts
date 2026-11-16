import { assertData, type RhythmData } from '../../domain/src/index';

export interface AccountSnapshot {owner:string;id:string;seq:number;confirmedSeq:number;data:RhythmData;base:RhythmData|null;revision:number|null;head:string|null;syncedAt:string|null;pending:{id:string;data:RhythmData}|null}
export interface AccountCache {read(owner:string):Promise<AccountSnapshot|null>;write(next:AccountSnapshot,expectedId:string|null):Promise<void>}
type Stored={owner:string;id:string;key:CryptoKey;iv:Uint8Array<ArrayBuffer>;cipher:ArrayBuffer};
export class CacheChanged extends Error {constructor(){super('Je gegevens zijn in een ander venster gewijzigd. Je invoer is nog niet overschreven. Probeer opnieuw.');}}
const request=<T>(req:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
export class IndexedAccountCache implements AccountCache {
  private database:Promise<IDBDatabase>|null=null;
  private open(){return this.database??=new Promise<IDBDatabase>((resolve,reject)=>{const req=indexedDB.open('rhythm-accounts',1);req.onupgradeneeded=()=>req.result.createObjectStore('accounts',{keyPath:'owner'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(new Error('De browseropslag kan niet worden geopend. Je online gegevens zijn niet gewijzigd.'));req.onblocked=()=>reject(new Error('Sluit andere Rhythm-vensters en probeer opnieuw.'));});}
  private async stored(owner:string){const db=await this.open();return await request(db.transaction('accounts','readonly').objectStore('accounts').get(owner)) as Stored|undefined;}
  async read(owner:string):Promise<AccountSnapshot|null>{
    const row=await this.stored(owner);if(!row)return null;
    try {const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:row.iv,additionalData:new TextEncoder().encode(owner)},row.key,row.cipher);const value=JSON.parse(new TextDecoder().decode(bytes)) as AccountSnapshot;
      if(value.owner!==owner||value.id!==row.id||!Number.isSafeInteger(value.seq)||!Number.isSafeInteger(value.confirmedSeq))throw new Error();assertData(value.data);if(value.base)assertData(value.base);return value;
    }catch{throw new Error('De lokale kopie kon niet worden gelezen. Wis niets; je online account kan nog een kopie bevatten.');}
  }
  async write(next:AccountSnapshot,expectedId:string|null){
    assertData(next.data);if(next.base)assertData(next.base);
    const old=await this.stored(next.owner);if((old?.id??null)!==expectedId)throw new CacheChanged();
    const key=old?.key??await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
    const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(next.owner)},key,new TextEncoder().encode(JSON.stringify(next)));
    const db=await this.open();
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction('accounts','readwrite'),store=tx.objectStore('accounts');let conflict=false;
      const req=store.get(next.owner);req.onsuccess=()=>{const current=req.result as Stored|undefined;if((current?.id??null)!==expectedId){conflict=true;tx.abort();return;}store.put({owner:next.owner,id:next.id,key,iv,cipher} satisfies Stored);};
      tx.oncomplete=()=>resolve();tx.onabort=()=>reject(conflict?new CacheChanged():new Error('Opslaan op dit apparaat is niet gelukt. Houd dit scherm open; je eerdere gegevens zijn behouden.'));tx.onerror=()=>{};
    });
  }
}
export const ACCOUNT_DEVICE_KEY='rhythm.account-device.v1';
export interface RememberedAccount {owner:string;email:string}
export function rememberedAccount():RememberedAccount|null{try{const p=JSON.parse(localStorage.getItem(ACCOUNT_DEVICE_KEY)??'null');return p&&typeof p.owner==='string'&&typeof p.email==='string'?p:null;}catch{return null;}}
export function rememberAccount(account:RememberedAccount){localStorage.setItem(ACCOUNT_DEVICE_KEY,JSON.stringify(account));}
export function forgetAccount(){localStorage.removeItem(ACCOUNT_DEVICE_KEY);}
