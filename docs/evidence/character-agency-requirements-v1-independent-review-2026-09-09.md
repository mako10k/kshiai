# 初回キャラ主体性要件 revision 1 — 独立レビュー結果

2026-09-09。結果: **completed**。確定的なcontradictionは検出しなかった。
要件採用・追加ADR・実装・課金・展開の承認ではない。

## 対象・経路・独立性

- 対象: `docs/character-agency-requirements-v1.md` revision 1。
- SHA-256: `f733f85a153349e4be28785fef05d93006d057e0e5d507a8423b658f9bb7f444`。
- 入力: `docs/character-agency-requirements-v1-review-input.md`。
- 入力SHA-256: `ebaa28931c71a13f458e73063426b78bf69f02b2f53eefe2a6189e1cbd2feab5`。
- 第1回owner承認: 「この候補を独立レビューし、結果を確認してから採否を決める進め方」に対し、
  ユーザーが「承認します。レビューをお願いします。」と回答。
- 経路: REVIEW_THEN_DECIDE。追加のowner質問なし。要件そのもののACCEPTとは扱わない。
- 独立レビュー担当: `/root/agency_requirement_review`、履歴を共有しない新規コンテキスト。
  正確な候補、6質問、authority、範囲を渡し、主担当の所見は渡していない。
- 主担当は並行して原ADRと入力境界を照合し、結果の根拠を確認した。
- 候補・入力とも開始時と終了時に同じdigestを確認。本文を変更していない。

入力文書の「経路選択待ち」は作成時の記録。今回の経路承認とstep 3完了を本書に記録する。
現在は**step 4・第2回ownerレビュー待ち**。変更する場合は新revisionでstep 1へ戻る。
CLI LLMThink: [レビュー実行判断](agency-independent-review-2026-09-09.think)、
`agency-independent-review-2026-09-09`、fatal/error/warning=0。

## 6質問への独立評価

| 質問 | 結論と根拠 |
|---|---|
| 1. 性格・関係による目標導出 | 候補32–35行は作者明示と自動fallbackを区別し、明示がなければ性格・関係を使う。ADR-0027 D1と整合。出典の実装上の識別はG1 |
| 2. 同じ顕在意識、writer・寿命・後攻 | 候補53–67・92–94行は顕在の所有とserver保存、採用goal/以前のintent/成立発話を区別。ADR-0027 D1/D3と整合。心理投影の具体化はG2 |
| 3. 新phaseの0callと旧互換 | 候補79–87行は新V3と旧V1/V2を分ける。ADR-0027 D5が維持する既存phaseを遡及変更しない。「ここぞ」の新triggerは範囲外 |
| 4. 部分受入・CAS・fallback | 候補103–109行は不正goal/intent/actionを採用せず、有効発話を独立検証。共同生成と別々のengine受入を混同しない。ADR-0027 D3、0025 d003と整合 |
| 5. namespace・上限・非公開・計上 | 文書revision/状態V1/dialogue V3を区別。候補20–24・91・98–99・122–123行に互換、非公開、計上を要求。具体契約はG3 |
| 6. 目標文だけの追加を除外できるか | 候補37–39・120・129–130行とCA-00採点軸は、目標→選択→発話を評価する。同じ行動/同文だけを失敗としない。実モデル改善はG5 |

## 所見の分類

### G1 — evidence-gap-or-unknown / medium: 作者明示の出典識別

候補32–35・75行は必要な区別を要求している。一方、現行
`packages/shared/src/free-action.ts:24`付近のdefaultObjectiveはid/statement/priorityであり、
それだけでは作者指定の出典を表さない。`decisionProfileForSheet`はprofile欠落時に
victoryを生成する。CA-00も享楽traitsへ変更しても既定victoryが残ることを確認した。

誤状態を作る条件は「既定値が存在することを作者明示の証拠と扱う」こと。
その場合、性格・関係による導出が常時抑止される。候補はこれを禁止しているため、
要件矛盾ではなく、出典を失わない入力契約の実現方法が未確定という所見。

### G2 — evidence-gap-or-unknown / medium: 有界な心理反応の入力投影

候補71–75行の入力列挙に、心理反応の具体的な投影項目が明記されていない。
ADR-0027正本72–74行は顕在判断へのexplicit bounded projectionを要求する。
現行V2にはexpressionStateがあるが、新世代への継承・置換はまだ具体化されていない。

71–75行を排他的な全入力一覧と解釈して反応を渡さない実装なら、ADRに反する。
しかし候補16行はADRを維持し、反応の排除も明示しないので、現時点で確定矛盾とはしない。
主担当の追加照合: ADR-0027 D6のbeliefs/appraisal/ExpressionBriefのwriter・寿命・
旧経路での残存処置も、追加契約ADRで具体化する対象として残る。全面移行を追加要求しない。

### G3 — evidence-gap-or-unknown / medium: 世代・設定・計上と上限

限定した検索では既存の対象dialogue V3/consciousAgencyV1定義は見つからなかった。
これは全外部namespaceの不存在の証明ではない。候補は内部だけを対象にしている。
管理APIでの選択、generationとprovider operationの対応、上限240文字等の十分性は未確認。
候補134–138行とレビュー入力は留保を明示しており、既承認の事実と偽っていない。

### G4 — evidence-gap-or-unknown / low: 新失敗組合せの実動作

候補103–109行の表には確定矛盾を検出しなかったが、新しい組合せは未実装・未検証。
AC4およびCA-00が示す実装時の検証事項。テスト未実施を欠陥の根本原因とはしない。

### G5 — evidence-gap-or-unknown / medium: 実モデルの改善

固定応答fixtureは品質証拠ではない。CA-00の5・73–78行はこれを明示し、判定不能と
閾値未確定を保持する。AC3は比較可能性であり、後段の品質合格を先取りしていない。
改善の件数・閾値・予算はt030で固定する既存の後続事項。

### 任意・範囲外

- optional-future / none: 長期学習、途中の上位目標変更、UI公開。今回の受入阻害条件にしない。
- out-of-scope / none: 「ここぞ」の新trigger、外部API V3公開、default切替、展開。
  今回のレビューや候補から権限を導かない。

## 読み方と次のowner判断

確定矛盾なしは、全仕様の完成や実装検証済みを意味しない。
G1–G3は既に候補が予定する追加契約ADRで具体化が残る事項、G4/G5は実装・実験の証拠不足。
任意の将来機能を必須化せず、これらを既存の要件/設計/実験段階に分けて判断する。

第2回ownerレビューは同じsnapshotと本結果を対象にする。要件を変更するならREVISE、
同じ本文へ新たな質問で再レビューするならREREVIEW、本文を受け入れるならACCEPT。
このレビューはその選択を代行しない。新しい契約ADRと実装前の承認境界も残る。

今回追加したのはレビュー記録だけ。candidate、レビュー入力、PERT、ADR、実装、
Sealのheadは変更せず、commit/push・paid call・deployは行っていない。
コードテストは本レビューでは再実行していない。CA-00の670件成功は前段の証拠として参照した。
