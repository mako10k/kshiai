# R: Verify age file protection using disposable synthetic identities and data only.
import pathlib,tempfile,subprocess,os,json,hashlib,time,shutil
root=pathlib.Path('/tmp/vt104-age-verification');age=str(root/'root/usr/bin/age');keygen=str(root/'root/usr/bin/age-keygen')
d=pathlib.Path(tempfile.mkdtemp(prefix='synthetic-',dir=root));os.chmod(d,0o700)
def run(args):return subprocess.run(args,capture_output=True)
try:
 for n in ('owner','wrong'):
  p=run([keygen,'-o',str(d/(n+'.key'))]);assert p.returncode==0;os.chmod(d/(n+'.key'),0o600)
 owner=run([keygen,'-y',str(d/'owner.key')]).stdout.decode().strip();assert owner.startswith('age1')
 payload=b'{"scope":"synthetic application snapshot fixture"}\n'+os.urandom(1024*1024)
 (d/'fixture.dump').write_bytes(payload);os.chmod(d/'fixture.dump',0o600)
 start=time.monotonic();p=run([age,'-r',owner,'-o',str(d/'fixture.dump.age'),str(d/'fixture.dump')]);assert p.returncode==0;encrypt=time.monotonic()-start
 start=time.monotonic();p=run([age,'-d','-i',str(d/'owner.key'),'-o',str(d/'readback.dump'),str(d/'fixture.dump.age')]);assert p.returncode==0;decrypt=time.monotonic()-start
 assert hashlib.sha256((d/'readback.dump').read_bytes()).digest()==hashlib.sha256(payload).digest()
 wrong=run([age,'-d','-i',str(d/'wrong.key'),'-o',str(d/'wrong-readback.dump'),str(d/'fixture.dump.age')]);assert wrong.returncode!=0
 ciphertext=bytearray((d/'fixture.dump.age').read_bytes());ciphertext[-1]^=1;(d/'tampered.age').write_bytes(ciphertext)
 tamper=run([age,'-d','-i',str(d/'owner.key'),'-o',str(d/'tamper-readback.dump'),str(d/'tampered.age')]);assert tamper.returncode!=0
 j={'scope':'synthetic 1MiB fixture; not an owner key or real snapshot/recovery timing','tool':json.loads((root/'provenance.json').read_text()),'roundtripSha256':hashlib.sha256(payload).hexdigest(),'bytes':len(payload),'encryptedBytes':len(ciphertext),'roundtrip':'passed','wrongKey':'rejected','tamper':'rejected','fixtureSeconds':{'encrypt':encrypt,'decrypt':decrypt},'privateFixtureKeysPersisted':False}
 (root/'result.json').write_text(json.dumps(j,indent=2));print(json.dumps(j))
finally:shutil.rmtree(d)
