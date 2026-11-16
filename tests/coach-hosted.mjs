import assert from 'node:assert/strict';
// No real account, health data, credentials or paid model request in this check.
const url='https://hphwmhmssexnrhkcxdpi.supabase.co/functions/v1/rhythm-coach';
for(const [method,headers,status]of [['GET',{},401],['POST',{Authorization:'Bearer invalid-synthetic-token'},401],['POST',{Origin:'https://attacker.invalid'},403],['POST',{'x-rhythm-probe':crypto.randomUUID()},401]]){
 const response=await fetch(url,{method,headers,signal:AbortSignal.timeout(20000)});assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'no-store');const body=await response.text();assert.ok(!/sk-[A-Za-z0-9]{12}/.test(body));
}
const response=await fetch(url,{method:'OPTIONS',headers:{Origin:'https://rhythm-rho-bice.vercel.app','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,apikey,content-type'},signal:AbortSignal.timeout(20000)});assert.equal(response.status,204);assert.equal(response.headers.get('access-control-allow-origin'),'https://rhythm-rho-bice.vercel.app');
console.log('Hosted coach: unauthenticated/invalid session/foreign origin/unknown probe denied, no-store and production CORS passed. No paid requests.');
