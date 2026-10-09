# R: Publish the reviewed current-source Cause closure without changing prior refs or source files.
from pathlib import Path
import json, hashlib, subprocess, time, sys, re
PLAN=Path('docs/evidence/character-current-source-closure-plan-2026-10-08.json')
EVENTS=Path('docs/evidence/character-current-source-closure-publication-events-2026-10-08.json')
p=json.loads(PLAN.read_text()); old={e['oldSealId']:e for e in p['entries']}
items={}
for sid,e in old.items():
    links=[]
    for c in e['oldCauses']:
        target=c['target_seal']; changed=target in old
        links.append({'key':'old:'+target if changed else 'external:'+target,
          'previous':list(dict.fromkeys(c['previous_revision_seal_of_target_seal']+([target] if changed else []))),
          'messages':c['messages']+['Current-source closure 2026-10-08: original scoped observations/limits are retained as history; current source and all affected original cases are revalidated. This link does not adopt production pacing, new STA numbers, live/deploy or paid work.']})
    for key in e['additionalParents']:
        links.append({'key':key,'previous':[], 'messages':['Required typed producer for the current complete-character/correction path. Retain the original bounded claim; no unrelated behavior or production adoption certified.']})
    items['old:'+sid]={'ref':e['newRef'],'path':e['path'],'sourceSha256':e['sourceSha256'],
      'root':e['oldRoot'],'links':links,'oldSealId':sid,'test':e['test']}
for n in p['newNodes']:
    items[n['key']]={**n,'links':[{'key':k,'previous':[], 'messages':[n['scope']]} for k in n['parents']]}

def cli(*args):
    r=subprocess.run(['sealgraph',*args],capture_output=True,text=True)
    if r.returncode: raise RuntimeError('sealgraph '+args[0]+': '+r.stderr)
    return r.stdout

def heads():
    return {str(x.parent.relative_to(Path('.sealgraph/refs/seals'))):json.loads(x.read_text())['head']
      for x in Path('.sealgraph/refs/seals').rglob('.ref')}

def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def persist(events): EVENTS.write_text(json.dumps(events,indent=2)+'\n')

# Every source and prior target is observed before the first write.
current=heads()
for ref,sid in p['priorRefs'].items(): assert current.get(ref)==sid,('prior head drift',ref)
for n in items.values(): assert sha(n['path'])==n['sourceSha256'],('source drift',n['path'])
assert '# pass 470\n' in Path('docs/evidence/character-feature-closure-final-diagnostic-2026-10-08.tap').read_text()
assert '# pass 106\n' in Path('docs/evidence/character-closure-extra-producer-diagnostic-2026-10-08.tap').read_text()
assert '5 passed' in Path('docs/evidence/character-feature-closure-focused-e2e-final-2026-10-08.log').read_text()
assert '1 passed' in Path('docs/evidence/character-feature-closure-e2e-diagnostic-2026-10-08.log').read_text()
assert 'ADR checks passed' in Path('docs/evidence/character-feature-adr-check-2026-10-08.log').read_text()
events=json.loads(EVENTS.read_text()) if EVENTS.exists() else []
ids={e['key']:e['sealId'] for e in events}
for e in events:
    assert current.get(e['ref'])==e['sealId'],('published head drift',e['ref'])
# An unexpected existing new ref is a stop, not an automatic retry.
for key,n in items.items():
    if key not in ids: assert n['ref'] not in current,('unexpected pending/new ref',n['ref'])
start=time.monotonic(); print('preflight valid; nodes='+str(len(items)),flush=True)
for key in p['publishOrder']:
    if key in ids: continue
    n=items[key]
    links=[]
    for link in n['links']:
        target=link['key'][9:] if link['key'].startswith('external:') else ids[link['key']]
        links.append({**link,'target':target})
    def group(link):
        args=['--target','@'+link['target']]
        args += [v for sid in link['previous'] for v in ['--previous','@'+sid]] if link['previous'] else ['--no-previous']
        args += [v for message in link['messages'] for v in ['-m',message]]
        return args
    args=['add',n['ref'],'--content-file',n['path'],'--bind-source']
    if n['root']:
        assert not links; args += ['--root','--clear-cause-links']
    else:
        assert links; args += ['--non-root']+group(links[0])
    cli(*args)
    for link in links[1:]: cli('link',n['ref'],*group(link))
    cli('seal',n['ref'])
    # Read the exact newly published Seal; journal before moving to the next writer action.
    shown=json.loads(cli('show',n['ref'],'--format','json'))['seal']
    assert not shown['draft'] and shown['root']==n['root']
    expected={x['target']:{'previous':sorted(x['previous']),'messages':sorted(x['messages'])} for x in links}
    assert len(expected)==len(links),'duplicate Cause target'
    actual={x['target_seal']:{'previous':x['previous_revision_seal_of_target_seal'],'messages':x['messages']} for x in shown['cause_links']}
    assert actual==expected,('Cause readback mismatch',n['ref'])
    ids[key]=shown['seal_id']
    events.append({'key':key,'ref':n['ref'],'sealId':shown['seal_id'],'path':n['path'],
      'sourceSha256':n['sourceSha256'],'oldSealId':n.get('oldSealId'), 'causeSealIds':list(expected),
      'test':n.get('test'),'secondsSinceStart':round(time.monotonic()-start,3)})
    persist(events); print(str(len(events))+'/'+str(len(items))+' sealed '+n['ref'],flush=True)
    if '--first-three' in sys.argv and len(events)>=3: break
print('published this invocation; cumulative='+str(len(events)),flush=True)
