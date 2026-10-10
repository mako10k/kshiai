# ADR-0067: 統合意識と優先順位付き記憶

- Status: Superseded
- Revision: 2
- Date: 2026-10-10
- Decision owner: Product owner
- Authority: [同名.think](0067-unified-consciousness-priority-memory.think)
- Related: [要件と設計案 第1版](../unified-consciousness-design-v1.md)、[canonical PERT](../unified-consciousness.pert)、ADR0050/0051/0057、ADR0003/0006

## Context

所有者は顕在・潜在を廃止して意識を統合し、経済性を考慮する方向を選んだ。さらに意図・注意等を優先順位1〜5の配列へ挿入し、後続を押し下げ、常に入力へ含めるよう指示した。目標・感情・注意対象・行動指針の専用領域を廃止する。2026-10-10の「今の場所からブランチを作成し、その方向に舵を切り直しましょう」は方向転換と設計作業の権限。以下の削除操作・上限・起動方式の詳細一式の受入とは区別する。

## Decision drivers

- 意識内の意味を分類する専用schemaとLLM間連携を減らす。
- 判断回数、反復入力、出力token、直列待機を減らす。
- 世界の裁定と本人の認識を混同せず、既存試合を再解釈しない。

## Considered options

1. 意識パイプライン awareness-v5を維持しpromptのみ圧縮。二系統と合流の複雑性が残る。
2. 一つの意識を毎tick呼ぶ。単純だが不要な呼出しを維持する。
3. 一つの意識と優先順位付き自然文記憶を使い、出来事で起動する。選択する設計候補。

## Decision

D1: 本人ごとの意識を一つに統合する。目標・感情・注意・行動指針は専用fieldを持たず、最大5件の優先順位付き記憶へ自然文で保持する。順位1を最上位とし、指定順位へ挿入して後続を下へ移動、6件目以降を落とす。毎回の意識入力に現在配列を必ず含める。

D2: 記憶更新は任意の操作列とする候補。操作なしは維持。複数操作は配列順。空きを超える順位指定は末尾へ追加。削除は安定ID指定とし、意味重複・重要度・矛盾の機械判定をしない。本文上限や操作数上限の値は詳細設計で提示する。

D3: 入力は不変本人資料、本人の現在知覚、未処理出来事、記憶、実行可能な行為資料。出力は行為の試み、任意発言、任意記憶操作。LLMだけが読むフィードバックは短い自然文にし、サーバーが実行・検証する部分だけ型を残す。

D4: 出来事による起動を候補とする。初回、行為の完了・失敗・無効化、受信発話、本人が知覚した変化、有限再評価で判断する。tick番号の変化だけでは起動しない。起動分類用LLMと記憶整理専用LLMは置かない。継続行為・判断待ち・入力イベントの消費境界・timeout・再送・上限は詳細設計で確定する。

D5: 意識は世界の成功を確定しない。世界裁定、本人別知覚、実況、永続attempt会計を保持する。別人格や記憶から非公開情報を漏らさない。一種類のmodelを基本候補とするが、具体model・token上限・価格は未決定。

D6: [詳細契約案 第1版](../unified-consciousness-contract-v1.md) C1〜C8を本revisionの規範候補とする。C1の記憶操作、C2の小さい出力、C3のevent/3tick起動、C4の両側並列・同期world境界、C5の原子的commitと未知送信非再送、C6の有限上限とmodel binding、C7の新規束縛形式 v6と旧試合保持、C8の比較fixtureを含む。D2〜D5の未決定事項はこの候補で具体化した。

D7: 初期実装候補は同期の統合意識とする。遅い思考の非同期合流、意欲strength/lifetime競合、介入mailboxを新pipelineへ引き継がない。本人ごとに最大1call、両側並列で必要な返答を待ち、片側のみworld commitしない。

D8: 詳細値はC6の候補policyで固定する。記憶5件×400文字、操作10、意識出力1000token/60秒、36world tickと初期境界で最大74意識call、再評価3tick、全体600秒/200attempt/同時6。価格保証なし。旧潜在transportを初期比較候補として明示bindingし、実model適合は未確認。

2026-10-10所有者はADR-0067 revision2と詳細契約案 第1版の受入質問へ「OKです。進めて下さい。」と回答。D1〜D8と詳細契約C1〜C8をAcceptedとし、runtime実装を開始する。有料試験・公開配備は別権限。

## Consequences

### Positive

- 意識の状態・出力・連携を小さくできる。記憶更新の全文再生成を不要にできる。

### Negative and risks

- 5件から落ちた記憶は失われる。記憶に誤認や矛盾が残り得る。
- 起動抑制による反応漏れ、軽量modelの品質、実料金と速度改善は未検証。

## Compatibility and migration

新規試合へ新しい不変pipeline/output/policy revisionを束縛する。識別子と保存境界の候補は詳細契約C7、DDLは実装PRで具体化する。既存の試合束縛形式 v5と意識パイプライン awareness-v5の試合は旧契約で読取・継続する。既存ADRの歴史的決定は変更しない。後継契約受入時に適用範囲を明示してsupersessionを追記する。DB/API変更は実装前に影響を提示する。

## Verification

挿入・押出し・削除・順序・空配列・不正操作の原子的拒否、常時入力、本人間分離、遅延応答・再実行の二重適用防止、イベント保持、旧試合継続を検証する。同一場面で反応漏れ・人物性・反復・SDK回数・token・行為確定時間を比較する。有料試験・配備は別権限とし、offline成功から品質・節約を断定しない。

## Implementation references

- canonical PERT: `docs/unified-consciousness.pert`。初期scopeは設計、後続に受入・実装・検証を置く。

## Supersession

ADR0069 revision1 supersedes C5/C6 only for new policy v2 bounded429 transport retries and private unsupported-action feedback; the historical revision2 decision and all other contracts remain unchanged.
