import {build} from 'rolldown';
import {mkdir} from 'node:fs/promises';
await mkdir('test-results/coach-edge',{recursive:true});
for(const [name,input]of [['index','supabase/functions/rhythm-coach/index.ts'],['handler','supabase/functions/rhythm-coach/handler.ts'],['core','packages/coaching/src/core.ts']]){
 await build({input,platform:'neutral',resolve:{mainFields:['module','main']},output:{file:`test-results/coach-edge/${name}.mjs`,format:'esm',minify:false},external:['@supabase/supabase-js'],onwarn(warning,defaultHandler){if(warning.code==='UNRESOLVED_IMPORT')throw new Error(warning.message);defaultHandler(warning);}});
}
console.log('Coach Edge Function bundled from the same domain, validation and context sources used by the app.');
