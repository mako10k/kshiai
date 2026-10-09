"""R: Bind the reviewed formal receipt to every executed current test Seal and the actual driver."""
from pathlib import Path
import hashlib
import json
import subprocess
import time

base = Path("docs/evidence/formal-adjudication-repair-2026-10-09")
plan = json.loads((base / "publication-plan.json").read_text())
assert plan["reviewed"] and len(plan["links"]) == 253
started = time.monotonic()

def cli(*args):
    result = subprocess.run(["sealgraph", *args], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout

def ref_head(ref):
    path = Path(".sealgraph/refs/seals") / ref / ".ref"
    return json.loads(path.read_text())["head"] if path.exists() else None

assert ref_head(plan["historicalReceiptRefUnchanged"]) == plan["historicalReceiptSealId"]
assert ref_head(plan["driverRef"]) is None and ref_head(plan["receiptRef"]) is None
for path, digest in [(plan["driverPath"], plan["driverSourceSha256"]), (plan["receiptPath"], plan["receiptSourceSha256"])]:
    assert hashlib.sha256(Path(path).read_bytes()).hexdigest() == digest
cli("add", plan["driverRef"], "--content-file", plan["driverPath"], "--bind-source", "--non-root",
    "--target", "@" + plan["registrySealId"], "--no-previous", "-m",
    "Actual repaired-cohort driver under the unchanged exact251 registry; verifies current source and HEAD identities,1473 unit cases including all original1469,10 E2E cases, exit codes and private PostgreSQL teardown. No CI or paid acceptance.")
cli("seal", plan["driverRef"])
driver = json.loads(cli("show", plan["driverRef"], "--format", "json"))["seal"]
assert not driver["draft"] and driver["cause_links"][0]["target_seal"] == plan["registrySealId"]
expected = {}
for index, link in enumerate(plan["links"]):
    target = driver["seal_id"] if link["target"] == "EXECUTED_DRIVER" else link["target"]
    expected[target] = {"previous": sorted(link["previous"]), "messages": sorted(link["messages"])}
    args = ["add", plan["receiptRef"], "--content-file", plan["receiptPath"], "--bind-source", "--non-root"] if index == 0 else ["link", plan["receiptRef"]]
    args += ["--target", "@" + target]
    args += [part for previous in link["previous"] for part in ["--previous", "@" + previous]] if link["previous"] else ["--no-previous"]
    args += [part for message in link["messages"] for part in ["-m", message]]
    cli(*args)
    if (index + 1) % 25 == 0:
        print(f"{index + 1}/253 reviewed execution Causes recorded", flush=True)
candidate = json.loads(cli("candidate", "show", plan["receiptRef"], "--format", "json"))["candidate"]
actual = {c["target_seal"]: {"previous": sorted(c["previous_revision_seal_of_target_seal"]), "messages": sorted(c["messages"])} for c in candidate["cause_links"]}
assert actual == expected and len(actual) == 253
cli("seal", plan["receiptRef"])
seal = json.loads(cli("show", plan["receiptRef"], "--format", "json"))["seal"]
actual = {c["target_seal"]: {"previous": sorted(c["previous_revision_seal_of_target_seal"]), "messages": sorted(c["messages"])} for c in seal["cause_links"]}
assert actual == expected and not seal["draft"]
compare = json.loads(cli("source", "compare", plan["receiptRef"], "--format", "json"))
assert compare["relation"] == "WORKFILE_MATCHES_HEAD" and compare["path"] == plan["receiptPath"]
assert ref_head(plan["historicalReceiptRefUnchanged"]) == plan["historicalReceiptSealId"]
result = {"schema": "kshiai/formal-execution-seal-readback/v1", "ref": plan["receiptRef"], "sealId": seal["seal_id"], "driverSealId": driver["seal_id"],
          "causeCount": len(actual), "exactCausesPreviousAndMessagesMatched": True, "sourceMatched": True, "nonDraft": True,
          "historicalReceiptRefPreserved": True, "seconds": round(time.monotonic() - started, 3)}
(base / "publication-readback.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result), flush=True)
