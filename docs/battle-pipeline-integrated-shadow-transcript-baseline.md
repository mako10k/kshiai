# Integrated Shadow Turn Transcript Baseline

Status: frozen local transcript baseline  
Frozen on: 2026-08-06  
Plan task: `T_TRANSCRIPT_BASELINE`  
Protocol: [battle-pipeline-integrated-shadow-protocol.md](battle-pipeline-integrated-shadow-protocol.md)  
Plan: [battle-pipeline-integrated-shadow.pert](battle-pipeline-integrated-shadow.pert)

## 1. Outcome

Protocolで事前登録した7 strataについて、次を一つのversioned transcriptへ固定した。

- schema-validなturn実行前BattleState
- 現行resolver由来のactions、events、mechanical evidence、temporal result、after-state digest
- pre-authored character proposal／plan／budget
- pre-authored world process／projection／timeline input
- conflict用ConsistencySlice
- exact entity／fact／rule／process dependency refs
- observer privacy、source mutation、outcome interference、commitの禁止境界
- current authoritative call topologyとlocal capture callを分離したcall model

このbaselineは`T_INTEGRATED_RECEIPT_POC`の入力controlであり、統合receiptの有効性評価では
ない。特に`canonicalCommitCount=0`は、このtaskがcommitを実行していないことを示すだけで、
未実装の統合receiptが安全であることを示さない。

## 2. Frozen artifacts

| Artifact | SHA-256 | Role |
|---|---|---|
| [fixture contract](evidence/battle-pipeline-integrated-shadow-transcript-fixtures-v1.json) | `db07a0cd1c1e37a6da859b7a88c724295a4be71d15413e5ac7e7cd2f5b90dfe1` | strata、hypothesis、threshold、expected dependency |
| [transcript baseline](evidence/battle-pipeline-integrated-shadow-transcript-baseline-2026-08-06.json) | `1b9c9e3b502b9e32bc96e5848ab5228f9f0d1c44ab4310a7b21dd268c6ed689a` | 7件のserver-side before／authoritative control／shadow inputs |
| `backend/src/scripts/capture-battle-integrated-shadow-transcripts.ts` | `d268028853e4c25cfe330ce5563d1617ce51e43ac3ed67c7be0123509c451fa5` | repeatable capture harness |
| `backend/src/scripts/capture-battle-integrated-shadow-transcripts.test.ts` | `fe620bbbafa35d70cbcffa507c9e6411fb329dc8a925ef5dfc7285e5df91515f` | bounded regression test |

JSON artifactは296,861 bytesである。内部のcanonical content digestは
`bd047d71f4bee6736aa645a5fea690cede67b1c147654630c4f8ad63b7abd882`で、file全体の
SHA-256とは用途を分離する。内部digestは`integrity` fieldを除くcanonical JSON、上表のhashは
保存file bytesを対象とする。

provenanceはclean worktreeのcommit
`5d828f3551e4d7967619fdfd97714e1cb0c92e37`を記録し、fixture／evaluator hashは上表と一致した。

## 3. Scenario coverage

| Scenario | Frozen boundary | Exact fact refs | Result |
|---|---|---:|---|
| `ordinary_fast_action` | in-range skill、fast control | 6 | pass |
| `remote_rejection` | separate-area rejection、defense fallback | 4 | pass |
| `simultaneous_terminal_action` | equal initiative、mutual terminal snapshot | 6 | pass |
| `interrupted_expanded_action` | faster authoritative interruption、non-authoritative partial plan | 8 | pass |
| `active_world_process` | environment evidenceとfire processの分離 | 4 | pass |
| `blocking_local_conflict` | same-window token claim、conflicting holder facts | 4 | pass |
| `exhausted_budget` | restrained actor、planning budget 0、intermediate fallback | 4 | pass |

fact refsはsource BattleState graphとpre-authored component inputからpredicateを解決して固定した。
fixtureに期待predicateを書くだけでpassにはせず、対応するexact fact refが0件ならcaptureをfailする。
rule refもcharacter／consistency／world inputに実在するものだけから照合する。

## 4. Measurements

7 scenarioを各20回、合計140回構築・現行resolverで実行した。

| Metric | Result | Threshold |
|---|---:|---:|
| schema validity | `1.00` | `1.00` |
| dependency resolution | `1.00` | `1.00` |
| distinct authoritative outcome digest | 各scenario `1` | 最大`1` |
| source mutation | `0` | `0` |
| authoritative outcome mismatch | `0` | `0` |
| external LLM calls | `0` | `0` |
| canonical commits | `0` | `0` |
| hard invariant result | pass | all required |

call modelは次を明示的に分ける。

```text
current live topology model:  semantic/world/sensory 1 + A 1 + B 1 + narrator 1
local transcript capture:     external LLM 0
future shadow model:          ordinary 3, generation token/latency unmeasured
```

したがって、このtaskは4 callsから3 callsへの削減を測定していない。

## 5. Authority and privacy boundary

- source BattleStateはresolver呼び出し前にcloneとdigestを取り、呼び出し後のdigestと比較した。
- artifact内のcanonical IDはserver-side transcriptであり、character-facing DTOではない。
- 各caseはobserver schemaへ出してはならない`character.a`／`character.b`を禁止identifierとして
  記録する。
- pre-authored plan／world inputはcanonical authorityを持たず、authoritative resultを置換しない。
- artifact生成以外のfilesystem write、network、DB、provider callは行わない。

## 6. Known limitations

- character planとworld inputはLLM生成ではなく固定dataである。
- exact dependencyは固定7 caseに対するcoverageであり、未知turnのrecallを保証しない。
- interrupted caseの詳細planは現行resolverがcommitした中間状態ではなく、次PoCが
  non-interferenceを検査するためのshadow inputである。
- blocking conflictは意図的に相反factを別ConsistencySliceへ置き、BattleState自体を
  不正schemaへしていない。
- local transcriptにはnarrator output、live token、provider latency、concurrent commitがない。
- hard invariant passは、客観的な戦闘結果、全体無矛盾、production readinessを証明しない。

## 7. Reproduction

```text
npm run eval:battle-pipeline-shadow-transcripts --workspace=backend -- \
  --output docs/evidence/<new-versioned-name>.json
```

`--output`は既存fileを上書きしない。fixture、harness、threshold、scenarioを変える場合は
versionとartifact名を変更し、旧artifactを保持する。

## 8. Validation receipt

- Focused transcript test: pass (`1/1`)
- Backend typecheck: pass
- Artifact file SHA-256: verified
- Artifact canonical content digest: verified
- Clean-tree provenance: verified at `5d828f3`
- Full repository tests: `350/350 pass`（shared 225、backend 109、frontend 13、deployment 3）
- Full typecheck: pass（全workspacesとdeployment）
- Build: pass（Viteの500 kB超chunk警告はnon-blocking）
- Static runtime／authority audit: runtime integration ref `0`、network／DB／provider import
  `0`、canonical commit call `0`。artifact writeはCLI outputの`mkdir`／`writeFile`だけで、
  `flag=wx`により上書きを拒否する
- PERT format／check／DAG／Plan Assurance: pass（diagnostic `0`、current／next task
  verified、assurance withheld `0`）

これらがpassするまで`T_TRANSCRIPT_BASELINE`を完了しない。

## 9. Next gate

全検証後の次候補は`T_INTEGRATED_RECEIPT_POC`（3p）である。transcriptの固定はそのtaskの
実装権限や成功判定ではなく、accepted basisとauthoritative controlを提供するだけである。
