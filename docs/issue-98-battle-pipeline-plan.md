# Issue #98 — 戦闘パイプライン変更の対応計画

対象: [GitHub Issue #98](https://github.com/mako10k/kshiai/issues/98) `戦闘パイプラインの変更`

作成日: 2026-08-12 (JST)
再計画基準: `97b5bbe` (`Bind battles to immutable asset snapshots`)

心理reaction policy詳細: [lightweight-psyche-reaction-policy.md](lightweight-psyche-reaction-policy.md)

対応 PERT: [issue-98-battle-pipeline-plan.pert](issue-98-battle-pipeline-plan.pert)（`97b5bbe` 基準の再計画版、owner gateを含む）

## 監査後の結論

「先行側の確定・可視結果を後攻側が読んで同ターンに判断する」には、agent 呼出しを動かすだけでは足りない。現在は A/B 両方の予約 action を `resolveTurn` の開始時に読み、同じ呼出し内で全 bucket を解決してから、両 agent を並列に呼ぶ構造である。

したがって最初の実装対象は、**再開可能な bucket 状態機械**である。`prepare → order checkpoint → bucket commit → observer projection → later decision → validation → next bucket commit → finalize` を durable checkpoint とともに設計・実装する。ADR-0001により通常行動の同時 bucket は廃止し、同値時は前回順、履歴がなければ既存比率または50/50の一度限りの抽選結果を永続化する。

## 現在確認できる事実と訂正

- `initiative-window-v1` は速度差 2 以上を順次 bucket、差 0–1 を同時 bucket として扱うが、両 action は先に決められるため、後攻が先行結果を読んで行動する経路はない。
- narrator は mechanics を直接変更しない一方、recognition continuity を永続化する既存 feedback を持つ。また、turn limit の既存 adjudicator には winner を決定する LLM edge がある。これらを「read-only」とは扱わず、Phase 0 の authority matrix で今回の対象外として保持するか、server-validated 化するかを決める。
- 現行の action/evidence モデルには start-turn restoration のような system-origin の合法イベントがある。すべてを action 起点とはせず、provenance を `action | scheduled-effect | system/rules | environment/world` として明示する。
- 完全な semantic/full-turn replay は現行の受入契約ではない。今回の replay は pending effect schedule の純粋な再解決に限定する。
- 既存完了 PERT が次軸として記録していた `OBS-20260807-09`（表層提案と canonical operation の意味差）は、新計画で暗黙に消さない。Phase 0 で defer / replace / integrate を owner が決定する。

## 実装順序と受入境界

| Phase | 成果 | owner decision | 受入の要点 |
| --- | --- | --- | --- |
| 0: 契約ドラフト (4p) | authority matrix、state machine、checkpoint、visibility/SSE、retry、OBS-09 disposition | 次 phase の仕様を承認 | LLM→永続 state/winner edge と public/private trace を全列挙 |
| 1a: bucket engine (4p) | pure prepare/resolve-bucket/finalize、再入可能な order checkpoint | - | ADR-0001の前回順/一度限り抽選、A/B swap、retry時非再抽選を維持 |
| 1b0: asset snapshot baseline (完了) | 新規battleへ固定manifestを埋込み、advanceと管理画面から参照 | - | `97b5bbe`。これは永続世代管理の完成ではない |
| 1b1: asset generations (4p) | append-only世代/current pointer、最小戦闘用snapshot、正規化digest、legacy境界 | - | ADR-0003。current assetを権威入力として再読込しない。完全CharacterSheet埋込みを解消 |
| 1c: psyche/call contract (2p + owner 1p) | 正規化入力、明示心理パラメータ、consumer別projection、呼出し予算とskip条件 | 契約を承認 | ADR-0004。削減目的のcontext統合を禁止 |
| 1d: deterministic psyche (4p) | LLM deep-psycheを有界・決定的な状態遷移へ置換 | - | reason receipt、replay、モデル失敗なし、行動/表現は独立consumer |
| 1e: 順次判断 (5p) | turn N finalize→N+1 order→first reservation、first commit→later decision/validation/commit | action/表現の発火条件 | private intentを渡さず、通常時LLM予算を固定。KO/invalid/timeoutを理由付き処理 |
| 1f: durability/SSE/可視化 (3p) | lease/idempotency/outbox、reconnect、durable public event、管理者向け causal DAG | - | save後応答失敗でも二重commitなし。世代、心理receipt、呼出しskip理由も表示 |
| 1g: narration API (4p) | immutable narration job、read/stream API、ordered UI placeholder | - | ADR-0002。narration失敗中も次advance可、再接続でprovider再実行なし |
| 1h: psyche learning shadow (3p) | 明示モデルを基準に学習/evaluation形式と軽量NN shadow adapter | authoritative化は別承認 | psyche-only正規化文字列embedding、重み/normalizer世代固定。第三者モデルは比較のみ |
| 2: effect scope (1p) | predicate、cancel/expiry、visibility、2 combatant制限 | effect contract を承認 | 援軍・新 combat participant は今回の範囲外 |
| 3: provenance/effect (7p) | tagged receipt、bounded pending effect、limited replay | - | delayed hit と condition の各1 fixture。proseから effect を作らない |
| 4: local pacing (3p) | policy snapshot、最大12 candidate の局所計測 | retain/revise/adopt を承認 | forced terminal/KO率を含む比較。平均8は仮説 |
| 5: local acceptance (3p) | 全検証と release-decision evidence | - | production release は別途承認 |

## 固定する不変条件

1. Engine、server validation、semantic/world reconciliation が canonical mechanics を所有する。speech/narration/proposal は、それぞれ authority matrix に明記された既存 edge を除き、直接 state を変更しない。
2. 後攻へ渡すのは、先行 bucket の durable commit 後に observer が知覚可能な事実だけ。private psyche、intent、未成立 effect、診断 trace は渡さない。
3. 通常行動は常に順次 bucket とする。同値時は前回順を再利用し、履歴がなければ同じ確率比、比率がなければ50/50で一度だけ抽選し、その根拠と結果を最初の durable checkpoint に保存する。
4. 新しい public causal event は durable commit 後にだけ SSE へ送る。ephemeral progress、private trace、未確定 proposal は replayable public stream に混ぜない。
5. retry は同じ idempotency key と battle version/lease に結び、既に commit 済みの receipt を返す。LLM・effect・action を二重実行しない。
6. 既存 battle / turn record は additive に読む。新 phase detail や provenance を旧記録へ推測補完しない。
7. deferred effect は既存の二戦闘者・既存 world entity に限定する。援軍など参加者 lifecycle を変える例は別設計・別承認とする。
8. LLM削減のためにprivate psyche、action、expression、semantic/world、narrationの入力を一つに統合しない。文脈構成、知覚投影、正規化、検証はローカル処理とする。
9. deep psycheはまず明示パラメータの決定的状態遷移とし、学習モデルはshadow受入後だけ候補にする。キャラ埋め込みは正規化済み`PsycheTraitProfile`だけを入力とし、キャラ全体を埋め込まない。

## `97b5bbe` 基線の評価

完了しているのは、新規戦闘へcharacter、narration style、concrete battlefield、dialogue settings、ruleset labelのsnapshotとdigest風generation IDを埋め、advanceがcharacterのcurrent rowよりsnapshotを優先し、管理画面でIDを表示する最小スライスである。全テストとtypecheckはこの基線で通過している。

ただし次は未完であり、再計画上は完了扱いにしない。

- 編集資産のappend-only世代レコードとcurrent pointer。
- generation番号の単調性、transactional edit、旧世代read API、retention。
- `JSON.stringify`ではないschema-versioned canonical normalizationとdigest。
- battle-authoritative fieldsだけを持つ最小character snapshot。現在の完全`CharacterSheet`にはrecord、owner memory、revision buffer等が含まれる。
- battlefield preset自体の世代とconcrete instance derivation receipt。
- narration job、psyche feature/model、pacing policyを含む完全manifest。
- active legacy battleをcurrent characterで補完する既存fallbackの廃止または明示隔離。

## LLM呼出し予算の再計画原則

文脈分離を最優先し、複数consumerを一回のLLMへ束ねない。その代わり、deep-psycheはLLMから外し、observer projection、正規化、available-action構成、validationをすべてローカル化する。actionとexpressionは独立consumerのままとし、expressionは決定的な`expressionImpulse`等の条件を満たす時だけ個別に呼ぶ。semantic LLMは既知canonical operationで表せない候補だけ、narrationは確定turnごとに非同期で一回とする。

定常turnでは、前回advance末尾で次turnのorderを確定してfirst actorのactionを予約し、次advanceでfirst bucketをcommitしてからlater actorを呼ぶ。initiative確定前の予約は禁止する。呼出し回数、token、skip/fallback理由はreceiptへ記録するが、private prompt/outputをpublic traceへ出さない。

## 実装開始前に owner が決めること

- 各 bucket の action source: first actor の旧予約を暫定維持するか、両者とも同ターン decision へ移すか。
- 先行 mechanics 後の semantic/world transition を後攻の可視入力へ含める時点と、既存 narrator recognition / terminal adjudication の authority をどう扱うか。
- `OBS-20260807-09` を本計画へ統合するか、別軸として defer するか。
- 同値時抽選はADR-0001の範囲に限定する。initiative全体のランダム化と、新しい戦術的 `wait` は初回 scope 外のままにする。
- delayed/condition effect の server-defined predicate、cancel/expiry/visibility と、二戦闘者制限。
- action consumerとexpression consumerの通常時上限、expressionを省略できる`expressionImpulse`等の決定的条件、provider failure時に無発話とするか定型反応にするか。
- 明示psyche stateの次元、trait parameterの範囲、正規化語彙、unknown/absent/neutralの区別、学習shadowの採否指標。
- 12-turn candidate を局所 evidence 後に retain / revise / adopt のいずれにするか。production observation はこの計画に含まない。

## 検証とリリース境界

最終受入では `npm test`、`npm run typecheck`、`npm run build` に加え、migration、限定 replay、checkpoint recovery、save 成功後の response failure、concurrent advance、SSE reconnect、A/B swap、同値時前回順、初回重み付き/50対50抽選、retry時非再抽選、DTO/SSE/DB trace/LLM payload の privacy、provider failure を確認する。管理者向け内部戦闘観測では、永続 checkpoint と turn record だけを根拠に initiative score、bucket の reads-from/commit mode、active/committed 状態、判断・検証・結果・semantic/world transition・narrator の順序を表示し、旧記録は推測せず unavailable とする。

tag、deploy、Cloud Run/Worker promotion、production E2E、Issue 更新・close は含まない。local acceptance の証拠と rollback target を揃えた後、別途 owner が承認する。
