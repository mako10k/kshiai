# ADR-0028 revision 2 — V3ローカル実装と検証

2026-09-09。owner直接承認の新版を実装した。既定設定は旧版のまま、設定activation・
有料provider・Stage/本番展開・commit/pushは未実行。実モデル改善は未判定。
作業点: codex/compact-psyche-repair-integration、基点0754ca7、同名worktreeの未コミット差分。

## 実装した経路

- A: 既存キャラgeneration/digestとcompilerInputsV3、manifest/dialogue V3の明示分岐。
  保存済みV3は設定requestの版省略でも保持。legacy overrideと混在tupleは拒否。
  作成時に目標/判断をnull初期化し、旧心理自由文から補完しない。
- B: 同じ顕在callへ性格・認知済み関係・能力・合法候補・反応・目標/前の判断を渡す。
  目標を作者確認で優先しない。短い意図と行動と発話を共同生成するpromptを追加。
  心理は全V3 phaseでLLM 0回。prologueゼロ、入力欠落は保持、laterは追加tickなし。
- C: field単位のtyped decodeと部分受入。目標と意図/行動の対のwriterを一箇所にする。
  有効な発話は独立受入。後攻は同じ目標で再判断し、不正時は既存fallback。
  古い意図をfallbackの新しい意図と偽らない。新しい修復callはない。
- D: 旧V1/V2経路、同文受理、既存CAS、engine規範を維持。7タグへ対象世代と残存理由を明示。
  新状態・根拠を公開/narrator/相手へ投影しない。内部raw権限は既存のまま。
  戦後の私的plan参照は新目標を使い、旧currentGoalから戦略を取り戻さない。

主要変更: sharedのbattle/dialogue-pipeline/conscious-agency/psyche-reaction-policy、
backendのllm/conscious-agency・adapter・types・mock、battle-service、
dialogue settings repository/activation、internal-observability。
新しいテーブル、キャラenvelope、作者確認UI、目標出典による開始拒否は追加していない。

## 実測

| 検証 | 結果・限界 |
|---|---|
| 全npm test | shared329/backend352/frontend20/deployment3/release5 = 709件成功 |
| typecheck | 全workspaceとdeployment成功 |
| build | shared/backend/frontend成功。frontendの既存大chunk警告は残る |
| Lizard 1.23.0 | 188files/3244functions。CC超過116/121,max87/92、長さ67/67,max707/733、引数5/5。baseline変更なし |
| 実SQLite＋service | V3戦闘の作成・進行、受入→保存→再読込→次判断、古いrevision拒否を確認 |
| phase/adapter | prologue/turn/aftermathはactive sideで顕在1call、心理0call。disabled/入力欠落0call。laterは既存1枠 |
| 部分受入 | 不正goal/intent/actionと有効発話、goalのみ受入、null action、再目標拒否、古いrefsと現factsの区別 |
| 互換/公開 | 旧CA00の9経路、同文2件、旧currentGoal保持、immutable assets、公開DTOのprivate marker不在 |
| PERT | document check成功。PTDAG-208（完了履歴の整理提案）、PTMAC-102（既存criterion未宣言）は保持 |
| CLI ADR監査 | fatal/error/warning=0、hint37。共有根拠・近接decision・長文表記の助言であり、実動作証明ではない |
| npm adr:check | スクリプト欠落で未実施。CLI監査を同じ検証として代用済みとは報告しない |

provider応答はMockまたは通信境界を置換したfixture。Grokの性格依存の目標選択、
戦術改善、call/token/costの実課金値は未測定。既存transport/accounting回帰は通ったが、
新V3の実provider receiptまで観測したとは扱わない。F01〜F08の実モデル採点・件数・予算はt030以降。

## 作業中に検出・是正したもの

1. 内部redactionの対象を汎用のfactsキーへ広げたため、無関係な戦場の束縛factsまで
   隠していた。根本原因は所有境界を考慮しない汎用キーへの適用範囲拡大。
   新しい専用agencyキーと既存input/raw境界に限定し、既存asset integration回帰の成功で確認した。
2. Lizardは一部の式本体callbackを跨いで後続関数まで一関数と測定した。
   意味を変えずblock bodyにしたところ関数境界を正しく計測。閾値を上げず検査を通した。
   この数値低下だけを設計の複雑度改善とは呼ばない。
3. 要件v2の参照ADR番号にrevision誤記が1件あった。Accepted ADR-0027はrevision1。
   正確な承認済みbytesを変更せず、受入記録に訂正を分離。類似表記を関連資料内で検索した。

## Sealレビューの読み方

変更した10既存REFの旧headにimpactを実行して下流を列挙した。
今回のruntime編集開始より後・resealより前の採取であり、「変更前にimpact済み」とは報告しない。
旧要件/レビュー/承認のbytesを保持する。旧CA00と旧実装影響記録には歴史的適用範囲を追記。
旧証拠は旧契約の互換確認に使うだけで、今回の新実装・新承認・実モデル成功の証拠に昇格させない。
現在の計画は直接承認とローカル検証へ更新し、必要な正式チェックの未完了を残す。
新規V3モジュール・試験・承認・本記録を登録表v7へ追加する。

## 残事項と再開点

t029はactive。必要なadr:checkの実行環境/スクリプトを既存の正本と照合して復旧し、
最終差分レビューと正式確認を終えてからt030へ進む。新版の独立レビューは未実施。
候補の設定activation、有料replay、展開、commit/pushはそれぞれ別の実行指示を必要とする。
追加の期待は型・保存の成功とは別に、性格/関係別の目標・行動・セリフを実モデルで検証する。
