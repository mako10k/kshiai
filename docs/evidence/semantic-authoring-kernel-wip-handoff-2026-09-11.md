# 構造化意味オーサリング基盤 — WIP 引継ぎ

2026-09-11。対象は worktree
`/home/katsumata-m/.codex/worktrees/compact-psyche-repair-integration-kshiai`、
ブランチ `codex/compact-psyche-repair-integration` である。本資料作成前の HEAD は
`cda9d2c`。この日の先行コミットは `8b9949b`（ADR-0031／D11受理内容）と
`cda9d2c`（レビュー資料の末尾空白修正）である。

このWIPは、受理済みADR-0031と実装設計D11に従う5スライス中、スライス1
「contracts and pure kernel」の途中である。DB、公開route、provider呼出し、
character adapter、activation、release、deploymentは変更していない。`cb206`は
`active`のままであり、完了扱いしてはならない。

## 今回の計画変更

`docs/character-semantic-migration.pert`をrevision 3／version 8へ更新した。旧B6/B7を、
次の実装順へ置き換えた。

1. `cb206`: 共通contractとpure orchestration（進行中）
2. `cb216`: durable ports
3. `cb217`: V3 character adapter
4. `cb218`: public mappingとconformance
5. `cb207`: integration review

`cb208`以降のprovider、実移行、受理、pointer、cutover境界は変更していない。
計画Sealは `13763362c4a3...`。

## 実装済みWIP

- `packages/shared/src/semantic-authoring.ts`
  - create／revise／migrate、対象family、run identity、execution fence
  - `semantic_authoring_policy_v1`の数値上限
  - accounting／reservation、proposal provenance／uncertainty、progress observation
  - run status、Skill／capability role
  - strict proposal envelope factory
  - strict focused-query input/resultとcompact submission issue factory
- `backend/src/services/semantic-authoring/accounting.ts`
  - provider reservationのper-call／cumulative／concurrency admission
  - counted stepを48まで単調増加させ、超過時に状態を変えないpure transition
- `backend/src/services/semantic-authoring/kernel.ts`
  - base revision確認、isolated staging、hard checks、原子的candidate置換
  - 不正proposal時のtrusted candidate保持とfinding重複排除
- `backend/src/services/semantic-authoring/progress-monitor.ts`
  - 4 step停滞後のrecovery、さらに3 step後のfailure
  - last 6中同一digest 3回、またはA-B-A-Bのcycle検出
- `backend/src/services/semantic-authoring/capability-session.ts`
  - queryと現在work item用mutationだけを公開
  - query 4回、mutation 3回、一度成功したmutation後の失効
  - run／work item／session／selector／proposal schema identityの結合検査
  - 結合不一致ではinvocation countを消費しない
- `backend/src/services/semantic-authoring/proposal-decoder.ts`
  - provider由来JSON文字列を一度だけunknownへdecode
  - 6 KiB実バイト上限、JSON不正、schema不一致を分離
  - 内部のtyped valueを文字列化して再parseする経路はない
- `backend/src/services/semantic-authoring/run-state.ts`
  - pendingからclaimed、claimedからterminalへのclosed transition
  - terminal stateの再開／再ラベル禁止
- `backend/src/services/semantic-authoring/kernel-foundation.test.ts`
  - 上記を24件のfocused testで検証

## 最終検証

```text
npm test                                      exit 0
  shared                                     339 tests
  backend                                    423 tests
  frontend                                    20 tests
  deployment                                   3 tests
  release                                      5 tests
npm run build -w @kshiai/shared               exit 0
npm run typecheck -w @kshiai/backend          exit 0
focused semantic-authoring tests               24 passed
lizard（変更対象）                            threshold exceed なし
git diff --check                              exit 0
sealgraph fsck                                result=ok, unreferenced blob=0
```

Sealgraphの対象実装・検証REFはすべてdraftで、確認時点ではself／direct／transitiveの
Staleなし。検証REFの最新prefixは `4e49f54c2ba7...`。draftなのはスライス1が未完了なため
であり、品質不合格を意味しない。

## 未完了と再開点

次は `cb206` のまま、以下の順で進める。

1. `progress-monitor.ts`へ、policyの`maxProgressObservations=8`に従うpureな履歴appendを
   追加する。直前に試したpatchはcontext不一致で全体が適用されておらず、ソース変更は
   残っていない。
2. typed `SemanticAuthoringAdapterV1`とkernel state／closed terminal result contractを、
   実装設計3.2～3.4から具体化する。未決のprovider settlement fieldは推測で作らない。
3. work selection、proposal staging、reconciliation、progress、terminationを結ぶpure
   orchestrationを実装する。
4. DBやnetworkを使わないscripted portsで、timeout、late result、trusted-state corruption、
   resource exhaustionを検証する。
5. スライス1全体の独立レビューを終えるまで`cm216`到達／`cb206 done`にしない。

## 境界と注意事項

- 新しいroute、DB migration、provider実行、有料評価、public DTO、activationは未着手。
- character／battlefield／narration-style固有pathをcommon kernelへ入れない。
- 外部境界以外のJSON文字列往復、`as unknown as`、unchecked castを追加しない。
- proposal修正範囲はエラー箇所だけに限定せず、登録済みwrite closure内の意味的依存変更を
  許す。ただしgeneric JSON Patchや任意pathは導入しない。
- 勤務記録は予定終了22:30に対して21:59:11の終了値が残っている。今回の終了指示前には
  実績値を置換していない。終了処理時に`worktimectl`の読み戻しを記録する。
