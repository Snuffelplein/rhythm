import {cloudClient,supabaseUrl,supabasePublishableKey} from '../cloud/client';
import type {CoachContext,CoachReply} from '../../../../packages/coaching/src/types';
import {assertCoachContext,validateCoachReply} from '../../../../packages/coaching/src/core';
async function headers(owner:string){
 const client=cloudClient();if(!client)throw new Error('Accounts zijn niet ingesteld.');
 const {data:{session}}=await client.auth.getSession();
 if(!session||session.user.id!==owner)throw new Error('Log opnieuw in om de online coach te gebruiken.');
 return {Authorization:`Bearer ${session.access_token}`,apikey:supabasePublishableKey,'Content-Type':'application/json'};
}
export async function coachRequest(owner:string,signal:AbortSignal,input?:{requestId:string;expectedStamp:string}){
 const response=await fetch(`${supabaseUrl}/functions/v1/rhythm-coach`,{method:input?'POST':'GET',headers:await headers(owner),...(input?{body:JSON.stringify(input)}:{}),signal:AbortSignal.any([signal,AbortSignal.timeout(input?60000:15000)])});
 const body=await response.json();if(!response.ok)throw new Error(typeof body.error==='string'?body.error:'De online coach is even niet beschikbaar.');return body;
}
export function checkedAnswer(value:{reply:CoachReply;context:CoachContext;model:string},requestId:string,stamp:string){
 assertCoachContext(value.context);if(value.context.requestId!==requestId||value.context.stamp!==stamp)throw new Error('Het antwoord hoort bij een andere versie van je gegevens.');validateCoachReply(value.reply,value.context);return value;
}
export async function forgetServerCoach(owner:string,threadId:string|null){
 const response=await fetch(`${supabaseUrl}/rest/v1/rpc/rhythm_coach_forget`,{method:'POST',headers:await headers(owner),body:JSON.stringify({p_thread_id:threadId}),signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error('De tijdelijke antwoordcache is nog niet gewist. Open begeleiding opnieuw met internet om dit te hervatten.');
}
