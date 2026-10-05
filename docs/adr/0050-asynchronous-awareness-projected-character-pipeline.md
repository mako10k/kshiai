# ADR-0050: 顕在度に応じた自然文コンテキストと非同期キャラ意識パイプライン

- Status: Superseded
- Revision: 5
- Date: 2026-10-05
- Decision owner: Product owner
- Authority: [同名.think](0050-asynchronous-awareness-projected-character-pipeline.think)
- Related: [議論の要件投影v2](../battle-consciousness-requirements-2026-10-05.md)、[基本設計v2](../battle-consciousness-basic-design-2026-10-05.md)、ADR0022/0027/0028/0033/0045/0047、既存計画 `docs/dialogue-expression-realization.pert`（上位整合未更新）、`docs/speech-continuity-and-fade-recovery.pert`（policy-draft設計作業のみ追加、製品受入は別）
- Authoring authority: 所有者の「ここまでの議論で、パイプラインを焼き直す設計を考えて」。受入・実装指示ではない。

- Direction acknowledgment: 所有者の「OK」と「進めてください」は経済性の方針と契約具体化の作成指示。新しい数値・ADR revision3の受入とは区別する。
- Operating policy: [v1](../battle-consciousness-operating-policy-2026-10-05.md)

Superseded by [ADR0051](0051-observed-llm-usage-accounting.md), which explicitly inherits this pipeline and replaces the compulsory pre-dispatch accounting proof. Original decisions below are historical and remain unchanged.

## Context

現行は潜在心理の通常LLM no-callと、phaseごとの顕在判断を中心とする。所有者は、軽量LLMによる潜在反応と遅い顕在思考、顕在度で分けたコンテキスト、行動意欲の競合、顕在から潜在への働きかけを求めた。model入力は自然文、outputはJSONとし、潜在側には現在状態と少数の反応傾向を渡し、履歴と論理的説明を要求しない。

このMarkdownは.thinkのD01–D12を投影する。revision5は所有者が実接続前の動作契約候補v1一式を採用した決定を反映する。旧世代の束縛済み契約は維持し、新規awareness-v5にだけ適用する。自然さ、反復改善、費用・速度改善は未検証。

## Decision drivers

- 思考による行動と、反射・感情由来の非熟考的行動を分けて継続させる。
- 無自覚な状態と本人が思考できる情報を分け、原因を露出させない。
- 反射・感情・投影を1つの潜在callへまとめ、不要な追加callを抑える。
- 遅い判断の合流と現在の世界裁定を両立し、古いstate上書きを防ぐ。
- 正準状態、知覚、公開情報、immutable asset、再試行の各ownerを維持する。

## Considered options

1. 現行のルール心理と同期顕在判断を維持。変更量は小さいが、要求された潜在LLMと遅延合流を満たさない。
2. 全役割を一つの全文コンテキストへ統合。隠れた原因の露出と世界／内面の責務混在がある。
3. 反射・感情・投影・状態書換えを別々のLLMへ分ける。呼出し数と待ち時間が増える。
4. **潜在1callと遅い顕在jobを分け、role別文章投影と機械的な合流・競合・世界裁定でつなぐ。** 提案。

## Decision

D01：六つの継続状態とwriterを分ける。内部構造とJSON outputは維持し、model-facing inputを役割別の自然文へ変換する。変換処理に別LLMは要求しない。

D02：顕在思考は固定した知覚から開始し、他の進行を待たせず、実応答後の定義済み境界で行動意欲として合流する候補。世界revisionの変化だけでは失効せず、job generationの有効性と元の入力を照合する。現在の知覚や世界を古いstateで上書きしない。

D03：潜在入力は短い現在状態・知覚・反応特性・少数の反応傾向・未配送の顕在の働きかけ。応答は感覚の続き、反射と感情由来の意欲、本人向け感覚投影、注意要求、限定傾向差分を含められる。相反する感情を整合させない。顕在度を意欲強度・正確さ・公開権限と混同しない。

D04：行動意識は同時に相反する意欲の強さを比較し、正準ownerが最新の身体・世界で成立を裁定する。ナレータは許された確定結果から認知と描写を継続し、意欲を成功へ変換しない。

D05：Aの知覚と、最後に受理した本人向け感覚投影から顕在を並行開始する候補。投影の由来時点を明示し、今回の潜在応答の完了は待たない。新知覚は次jobまたは明示中断後のgenerationへ渡す。

D06：現在顕在度は潜在stateのメタデータとし、潜在LLMを意味更新writerとする候補。顕在は自覚の変化を働きかけとして提案する。orchestratorが意味判断で値を変更しない。owner配分はQ03として未受入。

D07：経済性の所有者指示に基づき、潜在は知覚・働きかけ・期限などで必要なframeだけを更新し、顕在はjobがないことだけでは再起動しない候補へ改訂。中断を抑え、実況は確定した場面単位でまとめる。呼出し要否の別LLM、要約・critic・感情書換えの追加LLMは置かない。重要刺激、定期再評価、公開待ちを保つ具体条件は未決定。

D08：役割ごとに品質を満たす最小model tier、短い自然文入力と出力、投影準備の再利用、利用可能なprovider prefix cacheを候補とする。physical attemptごとにtoken・費用を事前予約し、repair/fallback/取消/使用量不明も会計する。予算不足時の有限休止/失敗契約は未決定で、反応を捏造して代替しない。品質・遅延・費用を同時比較し、実際の料金や節約効果は未測定。

D09：公開12ターン×内部3beatを維持し、tickを1beatへ対応付ける。最小1秒間隔、イベント起動と3tick潜在再評価、条件付き顕在起動、中断上限、永続deadlineを運用候補へ具体化。必須潜在失敗時に片側の行為結果だけcommitしない。数値は未測定。

D10：36tick・180秒・200 physical attempt・0.50 USDとrole別予約を試行候補とする。必須機能の予算/期限失敗は勝者を捏造せずincompleteとする。実況不完了でも確定済み結果を保持。ADR0006の正準先行commit・実況独立と公開battleId/turnReceiptIdを継承する。最大3receiptを1回の実況生成で扱い、receipt別のterminal snapshotを返すsource coverageとADR0016 eligibilityを変更候補とする。既存試合を変更しない。

D11：所有者は潜在をGPT-6 Luna none、顕在・裁定・実況をGrokと選択し、互換性準備を指示した。この配分は所有者決定として記録する。既存transportのSDK/optionを準備し、configured Grok世代を維持。新しいrole dispatchと潜在state実行は残るpipeline契約の確定後とする。

D12：所有者は[実接続前の動作契約候補v1](../battle-consciousness-implementation-decisions-2026-10-05.md)の1〜8と運用候補v1を一式採用し、実装継続を指示した。この候補がQ01〜Q08の製品動作を確定する。顕在度/強さ0〜1、潜在writer、身体行為1件と独立発声、同値既受理優先、寿命1〜3tick、反射声、新規試合のみawareness-v5。顕在/裁定はconfigured Grok engine、実況fast、潜在Luna none。旧世代の保存・読取・継続を維持する。候補の尺度の品質校正は実測課題であり、未決定の動作契約ではない。

- Acceptance evidence: 2026-10-05、このチャットで所有者が「候補v1一式を採用して実装を続ける」と明示回答。実装を許可し、有料試行・配備・旧試合移行を許可したとは扱わない。

## Consequences

### Positive

- 反射が先に作用し、後から思考が衝動を抑えたり方向を変えたりする表現が可能になる設計。
- 自覚していない反応と本人の解釈が一致しない状態を保持できる。
- 入力責務と更新ownerが見え、役割ごとに負担・品質を比較できる。

### Negative and risks

- event起動でも、現行no-callから潜在callを追加するため、全体call数・費用は増え得る。刺激の多い試合では潜在callが減るとは限らない。
- 実際のprovider/通信遅延が判断の到着順へ影響し、公平性と再現性に制約が生じる。
- 潜在の曖昧な表現から顕在への投影が隠れた原因を露出する可能性。構造検査だけでは意味品質を保証しない。
- job中断・古い結果・意欲の寿命・強度校正・再開に新しい永続契約が必要。

## Compatibility and migration

ADR0022の唯一の世界と観測の区別、ADR0027の私的内面・意図と結果の区別、ADR0045の生成意味非合成、asset bindingと会計・一度だけのcommitは保持する。

ADR0027の通常潜在no-call、潜在から直接行動意欲への責務、顕在→潜在未定義、およびADR0047詳細設計のphase-owned CASは後継の置換対象候補。現在は旧記録を編集・Superseded化しない。

新規試合へ新pipeline revisionを束縛する案。新番号・キャラ特性schema・旧試合読取／移行／進行の範囲はQ06。DB削除、旧戦闘の書換え、既存キャラへの無断特性追加は本提案に含めない。ADR0038のProposed Fragment案は自動採用しない。

## Verification

基本設計§14のシナリオを候補とし、反射・遅延合流・中断・認識非開示・競合・現在の物理成立・再試行・配送・実況の責務をLLM-freeで検証する。実モデルの自然さ、顕在度投影、会話・行動連携、速度・費用は別比較契約で評価する。意味品質の閾値・provider予算は未受入。

## Implementation references

- 六状態runtimeの実装なし。配備なし。新方式の有料provider実行なし。
- [Luna/Grokモデル互換性準備](../battle-consciousness-model-compatibility-2026-10-05.md)：既存transportのSDKとrequest optionのみ準備。
- [運用契約候補v1のレビュー記録](../evidence/battle-consciousness-operating-policy-review-2026-10-05.md)
- [経済性改訂v2のレビュー記録](../evidence/battle-consciousness-economy-review-2026-10-05.md)
- [基本設計と計画整合のレビュー記録](../evidence/battle-consciousness-design-review-2026-10-05.md)
