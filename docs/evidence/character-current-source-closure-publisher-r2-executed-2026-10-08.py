"""Publish the reviewed repaired closure with exact readback and a bounded stop time."""
from pathlib import Path
import datetime, hashlib, json, subprocess, time
from concurrent.futures import ThreadPoolExecutor
BASE=Path('docs/evidence')
PLAN=BASE/'character-current-source-closure-plan-r2-2026-10-08.json'
EVENTS=BASE/'character-current-source-closure-publication-events-r2-2026-10-08.json'
DEADLINE=datetime.datetime.fromisoformat('2026-10-08T20:25:00+09:00')
p=json.loads(PLAN.read_text()); old={e['oldSealId']:e for e in p['entries']}; items={}
NOTE='Current-source closure 2026-10-08: original scoped observations/limits are retained as history; current source and all affected original cases are revalidated. This link does not adopt production pacing, new STA numbers, live/deploy or paid work.'
for sid,e in old.items():
 links=[]
 for c in e['oldCauses']:
  t=c['target_seal']; changed=t in old
  links.append({'key':'old:'+t if changed else 'external:'+t,'previous':list(dict.fromkeys(c['previous_revision_seal_of_target_seal']+([t] if changed else []))),'messages':c['messages']+[NOTE]})
 for k in e['additionalParents']:links.append({'key':k,'previous':[],'messages':['Required typed producer for the current complete-character/correction path. Retain the original bounded claim; no unrelated behavior or production adoption certified.']})
 items['old:'+sid]={'ref':e['newRef'],'path':e['path'],'sourceSha256':e['sourceSha256'],'root':e['oldRoot'],'links':links,'oldSealId':sid,'test':e['test']}
for n in p['newNodes']:
 items[n['key']]={**n,'links':[{'key':k,'previous':n.get('parentPrevious',{}).get(k,[]),'messages':[n['scope']]} for k in n['parents']]}
def cli(*args):
 start=time.monotonic();r=subprocess.run(['sealgraph',*args],capture_output=True,text=True)
 if r.returncode:raise RuntimeError('sealgraph '+args[0]+': '+r.stderr)
 return r.stdout

def heads():
 root=Path('.sealgraph/refs/seals')
 return {str(f.parent.relative_to(root)):json.loads(f.read_text())['head'] for f in root.rglob('.ref')}
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def persist(events):
 tmp=EVENTS.with_suffix('.json.tmp');tmp.write_text(json.dumps(events,indent=2)+'\n');tmp.replace(EVENTS)
def group(l):
 args=['--target','@'+l['target']]
 args+= [v for s in l['previous'] for v in ['--previous','@'+s]] if l['previous'] else ['--no-previous']
 args+= [v for msg in l['messages'] for v in ['-m',msg]]
 return args
current=heads()
assert all(current.get(r)==s for r,s in p['priorRefs'].items()),'original HEAD drift'
assert all(sha(n['path'])==n['sourceSha256'] for n in items.values()),'source snapshot drift'
assert not p['externalParentsNotActiveLeaf']
unit=(BASE/'character-review-editability-all-unit-final-2026-10-08.tap').read_text()
assert '# pass 1458\n' in unit and '# fail 0\n' in unit and '# skipped 0\n' in unit
assert '1 passed' in (BASE/'character-review-editability-real-e2e-final-2026-10-08.log').read_text()
assert json.loads((BASE/'character-review-editability-all-unit-final-result-2026-10-08.json').read_text())['privatePostgresStopExit']==0
assert not Path('/tmp/kshiai-character-closure-pg-20261008/data/postmaster.pid').exists()
events=json.loads(EVENTS.read_text()) if EVENTS.exists() else json.loads((BASE/'character-current-source-closure-publication-events-2026-10-08.json').read_text())
last={e['key']:e for e in events};ids={k:e['sealId'] for k,e in last.items()}
assert all(current.get(e['ref'])==e['sealId'] for e in last.values()),'published HEAD drift'
assert len(items)==244
allowed_pending=p['pendingCandidate']
for k,n in items.items():
 if k not in ids:assert n['ref'] not in current or n['ref']==allowed_pending,('unexpected existing REF',n['ref'])
def existing_readback(e):
 shown=json.loads(cli('show','@'+e['sealId'],'--format','json'))['seal']
 assert shown['seal_id']==e['sealId'] and not shown['draft']
 assert sorted(c['target_seal'] for c in shown['cause_links'])==sorted(e['causeSealIds'])
 return e['key'],{c['target_seal']:{'previous':c['previous_revision_seal_of_target_seal'],'messages':c['messages']} for c in shown['cause_links']}
with ThreadPoolExecutor(max_workers=4) as readers:
 existing=dict(readers.map(existing_readback,last.values()))
start=time.monotonic();reused=0;published=0;verified=set()
print('preflight valid; logical nodes=244; preserved published history='+str(len(events)),flush=True)
for key in p['publishOrder']:
 n=items[key]; links=[]
 for l in n['links']:
  target=l['key'][9:] if l['key'].startswith('external:') else ids[l['key']]
  previous=list(l['previous'])
  predecessor=last.get(l['key'])
  # Retain the immediately superseded producer as an observed previous revision.
  frozen=next((e for e in reversed(events) if e['key']==l['key'] and e['sealId']!=target),None)
  if frozen and frozen['sealId'] not in previous:previous.append(frozen['sealId'])
  links.append({**l,'target':target,'previous':previous})
 expected={l['target']:{'previous':sorted(l['previous']),'messages':sorted(l['messages'])} for l in links}
 assert len(expected)==len(links),'duplicate Cause target'
 prior=last.get(key)
 if prior and prior['sourceSha256']==n['sourceSha256'] and existing.get(key)==expected:
  compare=json.loads(cli('source','compare',n['ref'],'--format','json'))
  assert compare['relation']=='WORKFILE_MATCHES_HEAD' and compare['path']==n['path'],compare
  reused+=1;verified.add(key);continue
 reserve=max(15,(len(links)+5)*3)
 if datetime.datetime.now(datetime.timezone.utc).timestamp()+reserve>=DEADLINE.timestamp():
  print('bounded stop before '+n['ref'],flush=True);break
 assert sha(n['path'])==n['sourceSha256'],('source drift',n['path'])
 candidate=json.loads(cli('candidate','show',n['ref'],'--format','json')) if n['ref']==allowed_pending and not prior else None
 if n['ref']==allowed_pending and not prior:
  compare=json.loads(cli('source','compare',n['ref'],'--format','json'))
  assert compare['path']==n['path'] and compare['relation']=='WORKFILE_MATCHES_CANDIDATE',compare
  pending=candidate['candidate']; actual={c['target_seal']:{'previous':c['previous_revision_seal_of_target_seal'],'messages':c['messages']} for c in pending['cause_links']}
  assert all(t in expected and value==expected[t] for t,value in actual.items()),'interrupted candidate differs from plan'
 args=['add',n['ref'],'--content-file',n['path'],'--bind-source']
 if n['root']:assert not links;args+=['--root','--clear-cause-links']
 else:assert links;args+=['--non-root']+group(links[0])
 cli(*args)
 for l in links[1:]:cli('link',n['ref'],*group(l))
 candidate=json.loads(cli('candidate','show',n['ref'],'--format','json'))['candidate']
 extra={c['target_seal'] for c in candidate['cause_links']}-set(expected)
 assert not extra or prior and extra<=set(prior['causeSealIds']),('unexpected extra Cause',extra)
 for target in sorted(extra):cli('unlink',n['ref'],'--target','@'+target)
 cli('seal',n['ref'])
 shown=json.loads(cli('show',n['ref'],'--format','json'))['seal']
 actual={c['target_seal']:{'previous':c['previous_revision_seal_of_target_seal'],'messages':c['messages']} for c in shown['cause_links']}
 assert actual==expected and not shown['draft'] and shown['root']==n['root'],('exact readback mismatch',n['ref'])
 compare=json.loads(cli('source','compare',n['ref'],'--format','json'));assert compare['relation']=='WORKFILE_MATCHES_HEAD' and compare['path']==n['path'],compare
 event={'key':key,'ref':n['ref'],'sealId':shown['seal_id'],'path':n['path'],'sourceSha256':n['sourceSha256'],'oldSealId':n.get('oldSealId'),'causeSealIds':list(expected),'test':n.get('test'),'secondsSinceStart':round(time.monotonic()-start,3),'revision':2,'supersedesPublishedSeal':prior['sealId'] if prior else None}
 ids[key]=event['sealId'];last[key]=event;existing[key]=actual;events.append(event);persist(events);current[n['ref']]=event['sealId'];published+=1;verified.add(key)
 print(str(len(verified))+'/244 verified; '+str(published)+' new or repaired this run; '+n['ref'],flush=True)
assert all(heads().get(r)==s for r,s in p['priorRefs'].items()),'original HEAD drift after publication'
summary={'schema':'kshiai/repaired-source-closure-run/v1','reused':reused,'newOrRepaired':published,'verifiedLogicalNodes':len(verified),'plannedNodes':244,'publishedHistoryEvents':len(events),'priorHeadsUnchanged':True,'seconds':round(time.monotonic()-start,3),'complete':len(verified)==244,'inventorySwitched':False,'deadline':DEADLINE.isoformat()}
(BASE/'character-current-source-closure-run-r2-2026-10-08.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary),flush=True)
