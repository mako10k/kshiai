from pathlib import Path
import os,subprocess,json,hashlib,datetime,time,re
base=Path('docs/evidence'); out=base/'formal-all-tests-2026-10-09';out.mkdir(exist_ok=True)
cohort=json.loads((base/'current-source-cohort-snapshot-2026-10-09.json').read_text())
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def heads():
 root=Path('.sealgraph/refs/seals')
 return {str(p.parent.relative_to(root)):json.loads(p.read_text())['head'] for p in root.rglob('.ref')}
readback=json.loads((base/'current-source-closure-readback-r3-2026-10-09.json').read_text())
inventory=Path('scripts/test-authority-inventory.json'); invsha=sha(inventory)
assert invsha==readback['proposedInventorySha256']
h=heads(); registry='all-tests-20261009/registration/current-test-inventory';assert registry in h
assert all(h[t['ref']]==t['sealId'] for t in readback['mappedTestHeads'])
assert all(sha(f)==v for f,v in cohort['sourceSha256'].items())
env=dict(os.environ);env['PATH']='/home/katsumata-m/.nvm/versions/node/v22.22.3/bin:'+env['PATH'];env['DATABASE_URL']='';env['LLM_PROVIDER']='mock';env.pop('E2E_GUI_BASE_URL',None)
env['AWARENESS_POSTGRES_TEST_URL']='postgres://kshiai_test@127.0.0.1:55439/kshiai_awareness_test'
pg='/tmp/kshiai-test-postgres-20261009';ctl=pg+'/runtime/usr/lib/postgresql/16/bin/pg_ctl'
assert not Path(pg+'/data/postmaster.pid').exists()
def run(args,name):
 started=time.monotonic()
 with (out/name).open('w') as log:r=subprocess.run(args,env=env,stdout=log,stderr=subprocess.STDOUT)
 return {'args':args,'exitCode':r.returncode,'seconds':round(time.monotonic()-started,3),'log':str(out/name)}
result={'schema':'kshiai/formal-all-tests/v1','startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'inventorySha256':invsha,'registrySealId':h[registry],'mappedTestHeads':readback['mappedTestHeads'],'formalAuthority':True}
start=run([ctl,'-D',pg+'/data','-l',pg+'/server.log','-o','-h127.0.0.1 -p55439 -k '+pg+' -c dynamic_library_path='+pg+'/runtime/usr/lib/postgresql/16/lib','start'],'postgres-start.log');result['postgresStart']=start
assert start['exitCode']==0,start
try:result['unit']=run(['npm','test'],'unit.log')
finally:result['postgresStop']=run([ctl,'-D',pg+'/data','stop','-m','fast'],'postgres-stop.log')
unit=(out/'unit.log').read_text(); result['unitSelection']={'active':247,'provisional':0,'disabled':0} if 'TEST_SELECTION suite=unit active=247 provisional=0 disabled=0' in unit else None
result['unitCounts']={label:sum(map(int,re.findall(r'^# '+label+r' (\d+)\s*$',unit,re.M))) for label in ['tests','pass','fail','skipped']}
(out/'result.json').write_text(json.dumps(result,indent=2)+'\n')
assert result['unit']['exitCode']==0 and result['postgresStop']['exitCode']==0,result
assert result['unitSelection'] and result['unitCounts']=={'tests':1468,'pass':1468,'fail':0,'skipped':0},result['unitCounts']
result['e2e']=run(['xvfb-run','-a','npm','run','test:e2e-gui'],'e2e.log')
e2e=(out/'e2e.log').read_text();result['e2eSelection']={'active':4,'provisional':0,'disabled':0} if 'TEST_SELECTION suite=e2e active=4 provisional=0 disabled=0' in e2e else None
result['e2ePassed10']=bool(re.search(r'\b10 passed\b',e2e))
result['sourceCohortUnchanged']=all(sha(f)==v for f,v in cohort['sourceSha256'].items())
result['headsUnchanged']=heads()==h;result['inventoryUnchanged']=sha(inventory)==invsha
result['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
result['complete']=result['e2e']['exitCode']==0 and bool(result['e2eSelection']) and result['e2ePassed10'] and result['sourceCohortUnchanged'] and result['headsUnchanged'] and result['inventoryUnchanged']
(out/'result.json').write_text(json.dumps(result,indent=2)+'\n')
assert result['complete'],result
print(json.dumps({k:result[k] for k in ['complete','unitCounts','e2ePassed10','sourceCohortUnchanged','headsUnchanged','inventoryUnchanged']}),flush=True)
