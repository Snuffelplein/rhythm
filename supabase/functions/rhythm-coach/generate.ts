import {validateCoachReply,COACH_INSTRUCTIONS,COACH_REPLY_SCHEMA,type CoachContext} from '../../../packages/coaching/src/core';
export interface CoachEnvironment {get(name:string):string|undefined}
export async function generateCoachAnswer(context:CoachContext,env:CoachEnvironment,network:typeof fetch=fetch){
 const model=env.get('RHYTHM_COACH_MODEL')??'gpt-6-luna',apiKey=env.get('OPENAI_API_KEY');if(!apiKey)throw new Error('unconfigured');
 const response=await network('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model,store:false,reasoning:{effort:'low'},max_output_tokens:2200,instructions:COACH_INSTRUCTIONS,input:[{role:'user',content:JSON.stringify(context)}],text:{format:{type:'json_schema',name:'rhythm_coach_reply',strict:true,schema:COACH_REPLY_SCHEMA}}}),signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw new Error('provider:'+response.status);const result=await response.json();if(result.status!=='completed')throw new Error('incomplete');
 const texts:string[]=[];for(const item of result.output??[])if(item.type==='message')for(const part of item.content??[]){if(part.type==='refusal')throw new Error('refusal');if(part.type==='output_text')texts.push(part.text);}
 const output=JSON.parse(texts.join(''));validateCoachReply(output,context);return {reply:output,context,model};
}
