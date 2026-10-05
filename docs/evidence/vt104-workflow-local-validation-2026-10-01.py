# R: Exercise extracted workflow guards and pre-start migration ordering without cloud writes.
import copy,datetime,hashlib,json,os,pathlib,re,subprocess,tempfile,yaml
root=pathlib.Path(__file__).resolve().parents[2]
workflow=yaml.safe_load((root/'.github/workflows/v3-trial.yml').read_text())
steps={s.get('name'):s for s in workflow['jobs']['trial']['steps']}
results=[]
def extracted(name):
 source=steps[name]['run']
 match=re.search(r"node[^\n]* <<'JS'\n(.*?)\nJS",source,re.S)
 assert match,name
 return match.group(1)
def run_js(source,env,directory,ok=True):
 r=subprocess.run(['node','--input-type=module','-e',source],cwd=directory,env={**os.environ,**env},capture_output=True,text=True)
 assert (r.returncode==0)==ok,r.stderr
 return r
now=datetime.datetime.now(datetime.timezone.utc)
packet={'schemaVersion':1,'commitSha':'a'*40,'releaseTag':'v0.23.0','prepareRunId':'12345','imageRef':'asia-northeast1-docker.pkg.dev/kshiai/kshiai/backend@sha256:'+'b'*64,'targets':{'project':'kshiai','region':'asia-northeast1','service':'kshiai-api','job':'kshiai-v3-trial-preflight','queue':'kshiai-narration','worker':'kshiai-web'},'stoppedAt':(now-datetime.timedelta(seconds=15)).isoformat(),'expiresAt':(now+datetime.timedelta(minutes=20)).isoformat(),'cutoverId':'fixture-cutover','cutoverAt':(now-datetime.timedelta(minutes=1)).isoformat(),'disposalReceiptId':'fixture-disposal','oldWritersClosedReceiptId':'fixture-writers','directUrlSecretVersion':3,'pendingMigrations':[],'secretVersions':[{'env':'DATABASE_URL','name':'kshiai-database-url','version':4}],'maximumWrites':{'jobDeploy':1,'jobExecute':1,'backendDeploy':1,'workerUpload':1,'queueResume':1},'providerBudgetReceiptId':'fixture-budget'}
with tempfile.TemporaryDirectory(prefix='v3-workflow-') as d:
 directory=pathlib.Path(d);env={'RUNNER_TEMP':d,'GITHUB_ENV':d+'/env','GITHUB_SHA':'a'*40,'RELEASE_TAG':'v0.23.0','IMAGE_REPOSITORY':'asia-northeast1-docker.pkg.dev/kshiai/kshiai/backend','GCP_PROJECT':'kshiai','GCP_REGION':'asia-northeast1','CLOUD_RUN_SERVICE':'kshiai-api','MIGRATION_JOB':'kshiai-v3-trial-preflight','NARRATION_TASK_QUEUE':'kshiai-narration','WORKER_NAME':'kshiai-web'}
 source=extracted('Validate reviewed execution packet before cloud authentication')
 def check_packet(p,ok,label,digest_override=None):
  raw=json.dumps(p);run_js(source,{**env,'PACKET_JSON':raw,'PACKET_SHA256':digest_override or hashlib.sha256(raw.encode()).hexdigest()},d,ok);results.append(label)
 check_packet(packet,True,'valid exact packet accepted')
 for label,mutate in [
  ('source mismatch rejected',lambda p:p.update(commitSha='c'*40)),
  ('target mismatch rejected',lambda p:p['targets'].update(service='other')),
  ('mutable image rejected',lambda p:p.update(imageRef='repo:latest')),
  ('expired window rejected',lambda p:p.update(expiresAt=(now-datetime.timedelta(seconds=1)).isoformat())),
  ('widened writes rejected',lambda p:p['maximumWrites'].update(backendDeploy=2)),
  ('latest secret rejected',lambda p:p['secretVersions'][0].update(version='latest')),
  ('unexpected token rejected',lambda p:p.update(token='fixture-only'))]:
  p=copy.deepcopy(packet);mutate(p);check_packet(p,False,label)
 check_packet(packet,False,'wrong packet hash rejected','c'*64)
 check_packet(packet,True,'valid packet restored')
 # Independently retrieved prepared artifact is required and cross-bound to source/image.
 import io,zipfile
 binding=extracted('Bind the packet to an independently read prepared artifact')
 receipt={'schemaVersion':1,'runId':'12345','commitSha':packet['commitSha'],'releaseTag':packet['releaseTag'],'imageRef':packet['imageRef']}
 run={'head_sha':packet['commitSha'],'event':'workflow_dispatch','conclusion':'success','path':'.github/workflows/v3-trial.yml'}
 def check_binding(r,rec,ok,label):
  archive=io.BytesIO()
  with zipfile.ZipFile(archive,'w') as z:z.writestr('v3-trial-image.json',json.dumps(rec))
  mock='globalThis.fetch = async url => { if(url.endsWith("/zip")) return new Response(Buffer.from('+json.dumps(archive.getvalue().hex())+', "hex")); if(url.includes("/artifacts?")) return new Response(JSON.stringify({artifacts:[{name:"v3-trial-image-12345",id:1,expired:false}]})); return new Response(JSON.stringify('+json.dumps(r)+')); };\n'
  run_js(mock+binding,{**env,'GITHUB_REPOSITORY':'fixture/repo','GITHUB_TOKEN':'fixture-not-a-real-token'},d,ok);results.append(label)
 check_binding(run,receipt,True,'prepared artifact tuple verified')
 r=copy.deepcopy(run);r['head_sha']='f'*40;check_binding(r,receipt,False,'other source prepared run rejected')
 r=copy.deepcopy(run);r['path']='.github/workflows/v3-trial.yml-other';check_binding(r,receipt,False,'lookalike workflow path rejected')
 r=copy.deepcopy(run);r['conclusion']='failure';check_binding(r,receipt,False,'failed preparation run rejected')
 rec=copy.deepcopy(receipt);rec['imageRef']='repo@sha256:'+'f'*64;check_binding(run,rec,False,'prepared artifact image mismatch rejected')
 # Execute the original Cloud Job's generated JavaScript against a SQL-count double.
 generator=extracted('Verify DB quiescence and required schema in the exact image')
 generated=run_js(generator,env,d).stdout
 import base64
 jobsource=base64.b64decode(generated).decode()
 stub=directory/'backend/dist/scripts/postgres-migrations.js';stub.parent.mkdir(parents=True)
 (directory/'package.json').write_text('{"type":"module"}')
 stub.write_text('''import fs from "node:fs";
export function createPostgresClient() { return { connect:async()=>{},end:async()=>{},query:async(sql,params)=> {
 if(sql.startsWith("SELECT to_regclass")) return {rows:[{table_name:params[0]}]};
 const table=sql.match(/FROM (\\w+)/)[1]; return {rows:[{count:table===process.env.NONEMPTY_TABLE ? 1:0}]};
}};}
export async function applyPostgresMigrations() {fs.writeFileSync("migrated","yes");}
export async function checkPostgresMigrations() {return {pending:process.env.PENDING_MIGRATION ? [process.env.PENDING_MIGRATION] : []};}
''')
 run_js(jobsource,{},d);assert (directory/'migrated').exists();results.append('zero backlog permits migration and readback')
 (directory/'migrated').unlink(missing_ok=True);run_js(jobsource,{'PENDING_MIGRATION':'0031_fixture.sql'},d,False);assert not (directory/'migrated').exists();results.append('unreviewed migration blocks before schema mutation')
 for table in ['battles','provider_operation_runs','provider_operation_attempts','battle_narration_attempts','battle_narration_entries','battle_narration_outbox','asset_authoring_outbox','character_authoring_jobs','battlefield_authoring_jobs','narration_style_authoring_jobs']:
  (directory/'migrated').unlink(missing_ok=True);run_js(jobsource,{'NONEMPTY_TABLE':table},d,False);assert not (directory/'migrated').exists();results.append(table+' nonempty blocks before migration')
 # Parse every script without executing its commands.
 for i,s in enumerate(workflow['jobs']['trial']['steps']):
  if 'run' not in s:continue
  path=directory/f'step{i}.sh';path.write_text(s['run']);r=subprocess.run(['bash','-n',str(path)],capture_output=True,text=True);assert r.returncode==0,r.stderr
  for j,src in enumerate(re.findall(r"node[^\n]* <<'JS'\n(.*?)\nJS",s['run'],re.S)):
   path=directory/f'step{i}-{j}.mjs';path.write_text(src);r=subprocess.run(['node','--check',str(path)],capture_output=True,text=True);assert r.returncode==0,r.stderr
 source=(root/'.github/workflows/v3-trial.yml').read_text()
 assert '--no-traffic' in source and '--remove-env-vars=CUTOVER_ID,CUTOVER_ARTIFACT_ID' in source
 assert 'supabase-auth-smoke' not in source and 'persistent-battle-e2e' not in source and 'versions deploy' not in source
 assert '--request POST' not in source
 results.append('workflow structure and all shell/JS syntax pass')
print(json.dumps({'passed':len(results),'failed':0,'scope':'Extracted local guards and SQL doubles; no cloud execution','cases':results},indent=2))
