# 行動可否の元wholefile検証契約

対象: packages/shared/src/action-feasibility.test.ts、元14ケース。独立レビューは docs/evidence/action-feasibility-independent-review-2026-10-08.json。

規範的根拠はAccepted F-BTL49〜52とADR0020/0022。docs/battle-action-feasibility.mdとdocs/battle-world-model.mdはその実装設計として照合し、ファイル名から独立した承認を推定しない。

前回の「理由ごとに新しいfallbackを採用している」という根拠不足判定を訂正する。実装は一般的な理由→行動のpolicy tableを持たない。spacing有効かつout_of_range/target_unlocalizedの場合だけAccepted ADR0020で定めたrepositionを先に試す。続いて自身の資源が最大未満ならrest、defend、waitを順に可否判定する。相手の私的な値は選択に使わない。各assertionはこの同じ処理を異なる正準可否・自己資源で観測した結果である。

候補列挙はobserver-local labelと現在accessを使い、実行時可否はobserver frameでなく正準worldで判定する。保持物、未観測拘束、area制約、LOS、資源、actorの意識とagency、失効した必殺部分、現在のskill IDを検証する。元テストのskill_on_cooldownは現在可否と有限reasonの確認であり、待ち時間の数式を採用する試験ではない。

新しいcooldown数値、反復ペナルティ、公開quality、公開配備、実LLMの効果は証明しない。元ケース・assertionは削除/skip/緩和しない。Accepted根拠→既存設計/本契約→現在producer→元wholefileをsource-bound Causeで接続し、既存HEADを保持する。
