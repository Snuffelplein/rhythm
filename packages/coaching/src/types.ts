export type CoachFocus='talk'|'today'|'plan'|'review';
export interface CoachStep {id:string;kind:'checkin'|'reflection'|'preparation'|'user_activity';title:string;timeLocal:string;optional:boolean;sourceIds:string[]}
export interface CoachReply {
  type:'support'|'question'|'plan';message:string;question:string;
  claims:{sourceId:string;field:string;value:string}[];
  plan:{title:string;goal:string;scope:'today'|'daily';steps:CoachStep[]}|null;
}
export interface CoachSource {id:string;kind:string;label:string;atUtc:string;fields:Record<string,string>}
export interface CoachContext {
  version:1;stamp:string;asOfUtc:string;timezone:string;requestId:string;focus:CoachFocus;
  sources:CoachSource[];history:{role:'user'|'assistant';text:string;atUtc:string}[];
  coverage:{sleepRecords:number;checkins:number;firstRecordUtc:string|null;recentRegisteredDays:number;windowDays:number;incomplete:true};
  activePlanId:string|null;limitations:string[];
}
export interface CoachMemory {id:string;revision:number;kind:'goal'|'preference'|'constraint'|'experience';value:string;atUtc:string;sourceMessageId:string|null}
export interface CoachMessage {id:string;threadId:string;atUtc:string;role:'user'|'assistant';text:string;focus:CoachFocus;requestId:string|null;origin:'user'|'local'|'gpt';reply:CoachReply|null;context:CoachContext|null}
export interface CoachPlan {id:string;atUtc:string;basedOn:string|null;title:string;goal:string;scope:'today'|'daily';localDate:string;steps:CoachStep[];sourceMessageId:string;sourceStamp:string}
export interface CoachingData {
  version:1;consent:{enabled:boolean;journal:boolean;atUtc:string;version:1};
  memories:CoachMemory[];messages:CoachMessage[];plans:CoachPlan[];activePlanId:string|null;
  feedback:{id:string;planId:string;stepId:string;localDate:string;outcome:'done'|'hard'|'skip';atUtc:string}[];
  forgotten:{id:string;kind:'memory'|'thread';targetId:string;atUtc:string;sourceMessageId?:string}[];
}
export const emptyCoaching=():CoachingData=>({version:1,consent:{enabled:false,journal:false,atUtc:'',version:1},memories:[],messages:[],plans:[],activePlanId:null,feedback:[],forgotten:[]});
export function cleanCoaching(c:CoachingData):CoachingData {
  const memories=new Set(c.forgotten.filter(f=>f.kind==='memory').map(f=>f.targetId)),threads=new Set(c.forgotten.filter(f=>f.kind==='thread').map(f=>f.targetId));
  const visible=c.messages.filter(m=>!threads.has(m.threadId)),messageIds=new Set(visible.map(m=>m.id));
  return {...c,memories:c.memories.filter(m=>!memories.has(m.id)&&(!m.sourceMessageId||messageIds.has(m.sourceMessageId))),messages:visible};
}
