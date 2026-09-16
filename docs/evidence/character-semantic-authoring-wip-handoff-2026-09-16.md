# キャラクター意味作成・cc304 — WIP 引継ぎ（2026-09-16）

## 正確な再開点

- 作業ツリー: `/home/katsumata-m/.codex/worktrees/compact-psyche-repair-integration-kshiai`
- ブランチ: `codex/compact-psyche-repair-integration`
- 今回のWIP開始前HEAD: `475ff90a5a7ac42645d2ccdd7f02d9f8f8fda23c`
- 取得直後の同名remote REF: `475ff90a5a7ac42645d2ccdd7f02d9f8f8fda23c`
- WIPコミット: 本資料を含むブランチ先端。再開時はlocal HEADとremote REFを照合する。

この作業ツリーの変更を一つの未完成WIPとして保存する。計画、ADR、Seal、実装、
診断結果の存在は、cc304完了、通常ルート有効化、製品受入、配備を意味しない。

## 今回保存する変更群

### 1. Sealベースのテスト根拠選択

- owner受入済みADR-0034と日本語レビュー資料
- `scripts/test-authority.mjs`のrepository-wide選択器
- 未Seal、Cause欠落、source diverged、direct/transitive staleを無効にする判定
- 21件の既知verification REF対応表と選択器自身の回帰テスト
- cleanなSeal:
  - `acceptance/adr-0034`: `5e0e2c6339e1aa17306f57963d3f32437cec1a22903e129ece02cc90bffe368a`
  - `implementation/test-authority-selector-v2`: `ddac6d91a3948f9a51433f53f9f88603aa5792133dfb42ba99157ed71121a8cc`
  - `verification/test-authority-selector-v2`: `2a8040407b12cc9c36bd604cc2bfd3088e01c70081f425ae36b50e0451c70a51`

選択器のPASSは、除外されたテストやその対象機能の正しさを意味しない。無Sealテストを
一括Sealしておらず、stale Causeも付け替えていない。

### 2. 計画revision 8とcc304再開

- `docs/character-semantic-migration-plan-revision-8-proposal.md`はowner受入済み。
- PERTを selector → safe revise → create → migration → remaining recovery/owner flow に分割。
- `cc310`はdone、`cc304`は2026-09-16 11:43:21+09:00にactiveへresume済み。
- `plan/character-semantic-migration` Sealは
  `0f624b84b39d4715c63305355bb7290dd8ca4de484d7332e70bb3d2589772ec9`。
  sourceは一致するが、歴史的Causeにより `DRAFT, STALE_DIRECT` のまま。

### 3. cc304 controlled appearance revise

- `buildRoutes`へ明示的なlocal controlled-trial optionを追加。
- option指定時だけ、現在のimmutable V3 generationを凍結し、appearanceのfocused
  revise sourceとしてowner HTTP commandから既存worker、controlled provider driver、
  common kernel、character adapter、persistence、owner reviewへ通す。
- option省略時は既存generic revision routeとV2 compatibility checkを維持する。
  productionのroute構築はoptionを渡していない。
- controlled testでは、最初のinvalid provider replyがcandidateを進めないこと、repair後の
  appearance差分、combat保持、owner review差分、`canAccept=false`、元generation pointer保持、
  `resultGenerationId=null`を観測した。
- 実装Seal `implementation/cc304-focused-revise-route-v1`
  `76829810f6abe344a245edc43b7c513f209587d483efe7329ae085ccf9f11167` と、
  verification Seal `verification/character-focused-authoring-v1`
  `94375ea43c0365b18d1abd3f4478d25f93c86c850eb6b099e0458ab7e2647679`
  はいずれもexact source一致だが `DRAFT, STALE_TRANSITIVE`。

したがってfocused-authoringの7/7成功は診断結果であり、現在有効な合格根拠ではない。
選択器は通常の `npm test` からこのファイルを `reason=stale` で除外する。

### 4. 保持するrevision-scope実験

- scope評価器、Ollama adapter、replay script、3世代の実験出力を削除せず保存する。
- v3日本語few-shot実験は8件中7件一致、1件は
  `relationship-expression-speech / ungrounded_source_quote`。
- offline grounding reconciliationも含むが、これらは未Seal。計画選択、テスト合格、
  migration受入、製品仕様の根拠として使わない。
- 移行の正確性・厳密性を先に高める作業へ戻る根拠にしない。必要性はcreate/reviseの
  機能結果から判断する。

## 終了時の検証

```text
llmthink dsl audit cc304-focused-revise-resume...       fatal/error/warning 0
llmthink dsl audit cc304-wip-handoff-decision...        fatal/error/warning 0
focused-authoring diagnostic file                       7/7 pass; stale evidence
npm test                                                current-authority 18/18 pass
npm run typecheck                                       pass
perttool document check                                 OK; existing warnings only
perttool dag analyze --schedule both                    cc304 active; no suspended task
sealgraph fsck --format json                            ok
git diff --check                                        pass
```

`npm test`の18件成功は、Seal選択器が現在有効としたテストケースだけの結果である。
repository全体、focused-authoring、migration、revision-scopeのaggregate greenを意味しない。

## 最初の再開手順

1. `$repository-start`で、このworktree、branch tip、同名remote REF、dirty状態を確認する。
2. `worktimectl agent`を確認し、共有勤務日状態を独自に推測しない。
3. `npm test`を実行し、focused-authoringが引き続き `reason=stale` で除外されることを確認する。
4. cc304を完了扱いせず、まずstaleの根を解消するかを判断する。現在の根は、
   accepted design revision 6が依存するrevision-5 reviewのCause進行と、character adapterが
   依存する旧implementation-design Causeの進行である。
5. 現行設計に対するfresh review/acceptanceとdependent contracts/adapterの再照合が必要なら、
   上流から順に実施する。テストだけを再Sealしたり、required Causeを外したりしない。
6. exact Cause chainがcurrentになった場合のみ、今回のfocused testをcurrent evidenceとして
   再評価し、ownerが機能結果を確認してからcreateへ進むかを決める。

## 未実施・権限境界

- cc304 finish、create、migration、remaining recovery/owner flow
- final acceptance、current pointer変更、schema/policy activation
- paid provider call、Stage identity、deployment、production readbackまたはmutation
- merge、PR、tag、release
- stale Causeの付け替え、一括Seal、一括再Seal
- revision-scope実験の採用または仕様化
- `worktimectl stop` / `worktimectl end`

実現済みのエンドユーザー価値は0。将来価値への寄与は、通常ルートを変えずに一つの
appearance reviseを非currentのowner-visible review candidateまで通せることを診断観測した点。
現在の次gateは、stale authority chainの正当な再確認である。
