import {buildCoachContext} from '../../../packages/coaching/src/core';
import {coachQualityFixture} from '../../../packages/coaching/src/quality-fixtures';
import {generateCoachAnswer,type CoachEnvironment} from './generate';
// Operator-only diagnostic: the database consumes a one-use, 90-second ticket first.
// Input cannot supply a prompt, model, account id or real health context.
export async function syntheticCoachProbe(scenario:number,env:CoachEnvironment,network:typeof fetch){
 const at=new Date().toISOString(),fixture=await coachQualityFixture(scenario,at);
 return {scenario:fixture.id,...await generateCoachAnswer(await buildCoachContext(fixture.data,fixture.requestId,at),env,network)};
}
