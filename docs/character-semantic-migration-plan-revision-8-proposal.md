# キャラクター意味作成・移行計画 revision 8 提案 — 現行根拠と安全な機能試行を優先する

- Status: Accepted
- Date: 2026-09-16
- Governing decision: Accepted ADR-0034 revision 1
- Reconsideration reasoning:
  `docs/evidence/test-authority-and-cc304-plan-reconsideration-2026-09-16.think`
- Supersedes: plan revision 7

## 再検討の結論

`cc304` を従来の一つの6ポイント作業のまま再開しない。テストの緑化や移行精度の
事前証明を目的にせず、次の順序で小さく機能結果を確認する。

1. ADR-0034 のテスト根拠選択を実装する。
2. `revise` の一つの安全な候補生成を実経路で通す。
3. その結果から共通経路の適否を判断する。
4. 問題がなければ `create` へ広げる。
5. `migration` は create/revise の結果で具体化した必要だけを反映して最後に接続する。

2026-09-16のowner承認により、この順序をPERTへ反映する。`cc304` は suspended のまま維持する。

## 1. テスト根拠選択の実装

### 目的

以後の pass/fail が、未 Seal テストや古い Cause に依存していないことを明示する。

### 完了条件

- inventory にないテストを active `ungoverned` ではなく disabled `unsealed` とする。
- verification Seal に明示的 Cause Link がない場合は disabled `missing_basis` とする。
- ソース不一致、direct stale、transitive stale の既存判定を維持する。
- 歴史的 Seal を削除・上書きしない。
- セレクタ自身のテストを accepted ADR-0034 の下流に Seal し、そのテストだけを根拠として
  上記挙動を確認する。

### 完了としないもの

- 既存テストの一括 Seal または一括再 Seal
- repository 全体の緑化
- disabled テスト対象の機能が正しい、誤っている、または不要という判断
- エンドユーザー価値の実現

## 2. 最初の機能試行 — revise 候補を一つ実経路で生成する

### 選択理由

`revise` は既存WIPで最も接続が進んでおり、候補生成と final acceptance が分離されている。
現行キャラクターを変更せず、所有者が差分を見てから次を判断できるため、機能結果を得る
最初の試行として扱える。

### 対象

- 変更範囲が明確な一つの appearance revision
- local の controlled provider reply
- 実APIまたは実UI、worker、provider driver、persistence、review diff を通る一経路
- 非 current のreview candidate作成まで

### 完了条件

- request が永続runとwork itemへ結び付く。
- controlled reply が共通kernelとcharacter adapterを通る。
- 候補と意味差分が永続化され、owner reviewで読み戻せる。
- 現行character revisionとpointerは変化しない。
- この経路に直接必要なverificationだけが、正確な実装・設計Causeに対してcurrentである。

### 除外

- final acceptance
- paid provider call
- deployment、Stage identity、production readback
- policyまたはpointer activation
- create、migration
- process-lossなど、今回の経路で発生していない全回復分岐の網羅

## 3. 結果からの分岐

revise 結果を所有者が確認し、次を判断する。

- 機能的に問題がない: 同じ共通経路を `create` に拡張する。
- 経路上の具体的欠陥がある: その欠陥を作った最小の実装・契約だけを直して再確認する。
- 出力品質に問題がある: 実結果に現れた問題だけを評価対象にし、移行全体の厳密性を
  先回りして追加しない。

テスト数、Seal数、aggregate PASS、移行分類精度そのものを分岐条件にはしない。

## 4. create 拡張

revise で確認済みの共通経路を再利用し、新規character candidateを作る。既存characterを
変更しない点は維持する。revise で未観測だったcreate固有の入力・永続化・review差分だけを
追加確認する。

## 5. migration 接続

create/revise の共通経路が機能した後に接続する。移行の正確性・厳密性は、上位の受入済み
最低条件を維持しつつ、優先順位を下げる。事前に網羅的な分類規則を作るのではなく、実際の
移行結果で発生した具体的な欠落、過剰変更、質問必要性を見て次の修正を決める。

未 Seal の revision-scope/Ollama 実験と結果は削除しないが、計画選択、合格根拠、migration
受入根拠には使わない。必要になった場合だけ、根拠と対象を先に確定して別スライスで扱う。

## PERT変更

受理により、次の構造へ変更する。

- 新規のテスト根拠選択タスクを `cc304` の前提に置く。
- `cc304` は revise の安全な一経路へ縮小して resume する。
- create と migration を別タスクに分離する。
- 現在の `cc305` Stage review は三モードの局所接続後に維持する。
- 各タスクのverificationは、そのタスクの exact Cause に current なものだけを数える。

タスクIDと計画枠は `cc310` selector 1p、`cc304` revise 6p、`cc311` create 1p、
`cc312` migration 1p、`cc313` recovery/owner flow 1pとする。`cc304`の6pは既存start eventの
当初planned valueを履歴上維持するための値であり、revise残作業が6pという再見積りではない。
追加タスクの1pも納期または実績値ではなく、結果後に再評価する最小計画枠である。既存の
開始・suspend履歴を保持し、`cc304` のresume eventは追加しない。

## 価値、コスト、未確定

- 現時点の実現済みエンドユーザー価値: 0。計画と根拠起点のみを整えた段階。
- 最初の将来価値: ownerが実経路で生成されたrevise候補差分を確認できること。
- コスト: テスト根拠選択の実装と、revise一経路の接続・検証。所要時間は未見積り。
- 未確定: controlled replyで露出する実欠陥、create固有差分、migrationで必要になる最小修正。
