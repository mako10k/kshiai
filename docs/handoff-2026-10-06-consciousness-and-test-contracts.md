# 2026-10-06 引継ぎ: 意識入力の設計とテスト契約

## 再開位置

- 作業ツリー: `/home/katsumata-m/.codex/worktrees/cc304-focused-revise-kshiai`
- branch: `codex/rc17-release-evidence`
- HEAD: `d7fe6df1287ee834fcdd9e9c3e0069b3f32b3696`
- 以下の変更はローカル未コミット・未同期・未配備。公開rc17の完了証拠をこれらの検証・配備へ流用しない。
- 再開時にrepository-startでGit/PRの現況を確認する。今回の終了時には新しいremote操作を行っていない。

## 最新の所有者指示と優先順位

最新の明示指示は「unsealed は、テストを通過させず止めること」。公式selectorを変更し、未登録またはSeal参照欠落があればテスト実行前にexit1となることを確認した。

その前の重要な指摘は、契約を横並びに照合し、届けるべき情報の欠落を設計・CIで見つけること。次回は顕在ラベルの機能追加より先に、情報伝達義務とその検証の接続を確認する。質問による指摘をコードやSealGraphの追加更新許可と取り違えない。

## 今日保存した方針・設計

- [潜在入力圧縮](latent-input-compression-policy-2026-10-06.md): 思考材料を入れない。キャラを潜在向け傾向へ初回翻訳し改訂に束縛・再利用する。実装未着手。
- [ナレータ入力圧縮](narrator-input-compression-policy-2026-10-06.md): 回数・文章量を維持し入力の重複を減らす。発言原文・結果・認知境界を保つ。実装未着手。
- [裁定表記圧縮](adjudication-input-compression-2026-10-06.md): 判定材料を削らず構造説明を短縮。専用 `adjudication-prompt-prose.ts` をguarded裁定に接続。合成資料の文字数2.4%減、実トークン削減は未測定。
- [顕在基本設計第2版](conscious-motivation-and-history-design-2026-10-06.md): 目的・状況認識・欲求・意思の差分、知覚したセリフ/状況/結果と未解決事項、同一call行動選択。実装未着手。
- [独立レビュー](evidence/conscious-motivation-effectiveness-review-2026-10-06.md): 上の方向を推奨。ただし既存の動機材料が届く経路と行動停滞を先に確認する。効果実証ではない。
- [比較用場面](conscious-motivation-effectiveness-cases-2026-10-06.md): 要求無視/協力/衝動と目的の衝突/約束/問い/裁定停滞。架空の確認用場面。実モデル比較未実施。

## テスト運用の変更と重大な訂正

[ADR0058](adr/0058-stop-test-runs-with-unsealed-tests.md)を所有者の明示指示に基づきAcceptedとして記録。ADR0034の集約実行方針を継承・置換し、旧決定理由は履歴として保持した。`scripts/test-authority.mjs` の `requireSealedTests` がreason=unsealed/missing_refを拒否する。`--list`は診断用に残す。他のdisabled/provisionalの扱いはこの指示で変更していない。

確認したawareness-context/request/public-observationの各テストはテスト登録表に存在せず、旧 `npm test` ではunsealedとして除外されていた。「全体テスト通過」は当時の選択対象が通った意味しかなく、パイプライン全体の適合証拠ではない。以後この限定を落とさない。旧compiler検証にCause Linkがあることやstaleがないことを、新しい経路のcoverage保証と扱わない。

[停止のreadback](evidence/test-authority-stop-readback-2026-10-06.json):

- unit: 未Seal191件、exit1、テスト開始なし。
- e2e: 未Seal1件、exit1、テスト開始なし。
- gate/分類の15件は直実行による診断成功。公式Seal準拠の合格とは扱わない。
- ADR0058 CLI audit fatal/error/warning0。
- `npm run adr:check` は既存ADR0039のAccepted受入marker不備でexit1。ADR0039は未変更。全ADR合格ではない。
- `git diff --check` 成功。

裁定変更時の型チェックは成功した。裁定関連14件の直実行も成功したが、これも診断結果として記録する。以前の選択29件成功を全体の合格へ拡張しない。

## 次回照合すべき契約経路

元資料/所有者要件 → 必要情報・許可された非開示 → compiler/role投影 → 接続先input契約 → 実送信prompt → 検証 → 受入条件を横並びにする。契約を先に直し、後から接続と検証を整える。情報を届けたと主張するテストは、非空の自覚可能な動機や適用中の指針を元資料から実promptへ通す。意図的な欠落でその検証が失敗することも確かめる。

観測済みの指針経路:

1. V4 compilerはconsciousSelf.actionPrinciplesを空にし、consciousGuidanceを別保持する。
2. `buildCharacterDecisionContext` はライブ条件でguidanceを投影し、rule metadataへ保持する。
3. 旧later-bucket経路はそのmetadataを顕在へ渡す。
4. awareness frameはavailableActions/affordance factsだけを渡し、`awareness-context.ts` は静的consciousSelfから構築するため、そのguidanceを明示転送しない。

coreNeedsもconsciousSelfへ直接投影されていない。ただし背景等に同じ意味がある可能性と、低顕在度の情報を意図して非開示にする場合を区別する。全coreNeeds/指針を無条件に渡す修正は選ばない。

これは特定経路の欠落機構の観測であり、試合の単調化の根本原因は未確認。自由行動の裁定未確定も別候補。提案 → 競合/受理 → 裁定 → 知覚結果の一場面追跡は未完了。

## PERT・工数・未完了

正本 `docs/speech-continuity-and-fade-recovery.pert` の旧公開完走経路と旧試行破棄は解決済み。今回の新しい設計・契約是正を完了済み旧taskへ押し込まず、次回の対象確定後に同じ正本への追加候補を扱う。第2計画は作らない。document checkとdag analyze/nextは確認済み、nextは空。observe-velocityは既存履歴PTHIS-103で取得できず、履歴を修正して迂回していない。

次回の限定した契約照合の内部工数は1〜3時間（agent暫定見積、信頼度低）。これは照合・対象整理までで、191件すべての根拠レビュー、再Seal、実装、公開品質確認までの総工数ではない。それらの範囲は照合結果から決める。設計/レビューと未Seal停止の今回の作業は完了。パイプライン適合の回復は未完了。

## 保存境界

無関係のdirty `AGENTS.md`、`docs/character-v3-stage-trial.pert`、旧vt104〜107・manual migrationの多数のuntracked資料、pycacheはそのまま保持。bulk add/reset/cleanを行っていない。

今回の実装・設計・ADR・引継ぎは未コミット。新しいpush/PR変更/merge/配備/Seal公開は行っていない。再開時には対象を限定して差分を確認する。共有worktimectlは既にcompletedだったため、stop/endや時刻の変更は行っていない。
