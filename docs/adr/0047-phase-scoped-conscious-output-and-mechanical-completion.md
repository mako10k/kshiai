# ADR-0047: 動的な顕在出力契約と機械的補完

- Status: Accepted
- Date: 2026-10-03
- Decision owner: Product owner
- Supersedes: ADR-0028 response/repair rules for new dynamic-v4 battles; historical contracts remain readable.
- Related: [動的契約詳細設計](../conscious-dynamic-output-design-2026-10-03.md)、[設計案](../conscious-server-responsibility-proposal-2026-10-03.md)、[LLMTHINK正本](0047-phase-scoped-conscious-output-and-mechanical-completion.think)、[欠落RCA](../conscious-required-fields-rca-2026-10-03.think)、ADR-0027、ADR-0028 D5/D6、ADR-0044、ADR-0045、ADR-0046
- Authority: 2026-10-03 所有者指示「では、実装を進めましょう。」
- Scope: 新規試合の動的契約・修復・検証のローカル実装。既存試合の移行と実環境の比較・展開は別作業。

## Context

最新試合の通常判断34件中11件が、既存目標に対するinitialGoal:null等の省略で棄却された。複数フェーズの規則を毎回提示し、初期化済み目標や固定メタデータの再出力を要求する契約は、不要な転記と判断の負担を増やしている。所有者は必須項目の再精査、サーバーの補完・準備・継続、意味のパターンマッチング禁止、欠落/null互換と低負担な修復を指示した。

## Decision drivers

- 意味判断の所有者を維持し、不要な生成・転記を減らす。
- 任意の省略を、意味内容の不正や必要な新判断の欠落と区別する。
- 正確な構造情報により修復負担を減らし、回数と副作用を制限する。
- 不変snapshot、世代固定、CAS、独立した発話受理を維持する。

## Considered options

1. 毎回全キーを要求し、長い共通規則で矯正する。不要な責務が残る。
2. すべての欠落をnullや定型文で埋める。必要な意味判断を失う。
3. 今回の最小契約をサーバーが選び、型付き候補・状態保持・限定正規化・具体的修復を担う。提案する。

## Decision

サーバーが状態の不足・phaseの判断枠・検証結果から型付きGenerationPlanを構成し、今回必要な部品だけの指示・出力スキーマ・正規化・差分適用を同じplanから生成する。部品は初期目標、意図/行動の組、発言、発現、同じ選択を保持できる行動payload修復に限定する。対象が空ならproviderを呼ばない。詳しい対象選択・依存閉包・再開規則は動的契約詳細設計を提案の具体的内容とする。

詳細設計案を採用する。初期目標は未確定時のみ生成し、確定後はサーバーが保持する。通常・later・aftermathを別契約にし、候補なしの発現フィールドは除く。任意表現や通常の新提案なしは省略とnullを互換に扱い、診断では由来を保持する。初期目標やlaterの具体的行動、行動に付随する意味的意図の欠落は補完せず修復する。

intent.rationaleの毎回必須を撤廃する案と、準備済み候補キーからの型付き復元を含む。目標/意図の根拠はLLMが選択し、所属はサーバーが検証する。自由行動・reflectの新しい意味内容は生成元に残す。文字列の類似や内容から行動・理由を合成しない。

アプリケーション修復は論理判断あたり1回を候補上限とし、具体的な欠落パス・期待型・許可キー・前回応答と修復対象だけを渡す。選択変更は意図/行動の組を修復する。独立受理済み表現を変更せず、同じ凍結コンテキスト・検証・会計・フェンスを維持する。

所有者が認めた設計方向は上記責務分離である。具体的な新契約版、rationaleの扱い、修復上限、候補参照形式、移行対象は本ADRの設計であり、今回の承認により新契約に限り既存ADR-0028の応答・修復規則を置き換える。ADR-0028の決定を編集して既存承認を変えない。

## Consequences

### Positive

- 冗長な目標再出力と行動メタデータ転記を減らせる。
- 任意省略による無用な棄却・再試行を減らす。
- 修復箇所の探索をサーバーが担い、意味判断だけをLLMへ残す。

### Negative and risks

- 新しい出力・意図契約版と候補表束縛が必要。
- 修復は呼び出し時間と費用を増やす可能性がある。
- 構造的な採用率向上だけでは、待機や戦術反復は解決しない。

## Compatibility and migration

新規試合へ新契約を固定する案を基本とする。旧記録・旧デコーダー・履歴は保持し、進行中の旧試合を暗黙に変更しない。既存試合移行は別の明示判断とする。実装着手時は正本PERTの目標・依存・完了条件を整合させる。

## Verification

動的契約詳細設計の第10節と責務再精査案の第7節を受入条件とする。特に欠落/null/不正の区別、型付き復元、意味内容非生成、修復1回の上限、部分受理、CAS再開、旧世代継続を確認する。実モデルでの品質と負担の比較は別の検証であり、この提案作成では実施していない。

## Implementation references

- `packages/shared/src/conscious-dynamic.ts`: versioned state decoding and acceptance.
- `backend/src/llm/conscious-dynamic.ts`: dynamic targets, schema, restoration and bounded repair.
- `backend/src/repositories/battles.ts`: transactional repair reservations under existing revision/fence.
- [実装検証](../evidence/conscious-dynamic-output-implementation-2026-10-03.md)
