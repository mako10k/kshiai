// R: Rehearse the actual Stage PG adapter only in a newly created disposable local database.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const root=process.cwd();
const require=createRequire(root+'/package.json');const {Client}=require('pg');
const b='/tmp/vt104-pg17-rehearsal';const ca=b+'/data/server.crt';
const dbName='vt104_stage_smoke_'+process.pid;const schema='kshiai_smoke_vt104_exact';
const base='postgresql://katsumata-m@127.0.0.1:55441/postgres?sslmode=verify-full&sslrootcert='+ca;
const url=new URL(base);url.pathname='/'+dbName;
const admin=new Client({connectionString:base});await admin.connect();
let created=false;
try{
 await admin.query('CREATE DATABASE '+dbName);created=true;
 process.env.DATABASE_URL=url.toString();process.env.DIRECT_URL=url.toString();
 process.env.POSTGRES_CA_CERT_PATH=ca;process.env.CUTOVER_ID='stage-smoke-pg17';process.env.CUTOVER_ARTIFACT_ID='local-stage-smoke-artifact';process.env.AUTH_PROVIDER='legacy';process.env.LLM_PROVIDER='mock';process.env.DATABASE_SCHEMA='public';process.env.SUPABASE_URL='';process.env.SUPABASE_JWKS_URL='';process.env.SUPABASE_PROJECT_REF='127.0.0.1';process.env.STAGE_SMOKE_FIXED_SCHEMA=schema;
 const {applyPostgresMigrations}=await import(root+'/backend/src/scripts/postgres-migrations.ts');await applyPostgresMigrations(url.toString());
 const storage=await import(root+'/backend/src/repositories/cutover-control.ts');
 const database=await import(root+'/backend/src/db.ts');
 const sha=x=>createHash('sha256').update(x).digest('hex');
 const names=fs.readdirSync(root+'/backend/migrations').filter(n=>/^\d+_[a-z0-9_-]+\.sql$/i.test(n)).sort();
 const md=sha(JSON.stringify(names.map(name=>({name,sha256:sha(fs.readFileSync(root+'/backend/migrations/'+name))}))));
 const sd=sha(fs.readFileSync(root+'/backend/src/scripts/postgres-runtime-smoke.ts'));
 const target='127.0.0.1:55441:'+dbName;
 const manifest={runId:'pg17-full-runtime',ownerUserId:'owner',kind:'postgres',steps:[
  {name:'runtime-fixture',target:`postgres-runtime:${target}:${target}:${schema}:${sd}:${md}`,method:'RUN',minimumCalls:1,maximumCalls:1},
  {name:'schema-readback',target:`postgres-schema:${target}:${schema}`,method:'SELECT',minimumCalls:1,maximumCalls:1},
 ]};
 const smoke=await import(root+'/backend/src/services/cutover-stage-smoke.ts');const op=smoke.stageSmokeOperation(manifest);const {actorId,...request}=op;
 const policy={cutoverId:process.env.CUTOVER_ID,artifactId:process.env.CUTOVER_ARTIFACT_ID,ownerUserId:'owner',ownerCandidates:[{attemptId:'a',candidateDigest:'a'.repeat(64)},{attemptId:'b',candidateDigest:'b'.repeat(64)}],trialBindings:null,taskBattleIds:[],productionReceipt:null,stageAcceptance:{health:null,postgres:null,email:null,google:null,ownership:null,r2:null,sse:null,directProtection:null}};
 await storage.initializeCutoverControl({policy,phase:'closed',operationId:'init',operatorId:'operator'});
 // Isolated admission fixture, not evidence of the actual owner-confirm transition.
 policy.trialBindings={generationIds:['a','b'],ownerConfirmationReceiptIds:['a','b'],cutoverReadbackReceiptId:'fixture',stoppedBarrierReceiptId:'fixture',requests:[{...request,maximumReservations:1}]};
 await database.query("UPDATE cutover_control_revisions SET phase='trial',policy_json=$1",[JSON.stringify(policy)]);
 const manifestPath='/tmp/vt104-stage-pg-manifest.json';fs.writeFileSync(manifestPath,JSON.stringify(manifest));process.env.STAGE_SMOKE_MANIFEST_FILE=manifestPath;
 let exit=0,stdout='';try{stdout=execFileSync(process.execPath,['--import','tsx',root+'/backend/src/scripts/stage-postgres-smoke.ts'],{env:process.env,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:150000});}catch(e){exit=e.status??1;stdout=String(e.stderr??'');}
 const permits=(await database.query('SELECT binding_operation_id,state,result_digest FROM cutover_operation_permits')).rows;
 const after=(await database.query('SELECT nspname FROM pg_namespace WHERE nspname=$1',[schema])).rows;
 const result={scope:'isolated PG17 full disposable-schema runtime adapter; trial admission fixture only',database:dbName,schema,exit,output:stdout,permits,residualSchema:after};fs.writeFileSync('/tmp/vt104-stage-pg-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 await database.closeDatabase();process.exitCode=exit;
}finally{if(created)await admin.query('DROP DATABASE '+dbName+' WITH (FORCE)');await admin.end();}
