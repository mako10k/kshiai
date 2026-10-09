# 因果関係・遅延効果の既存契約レビュー

対象は battle-causality.test.ts の元3ケースと battle-effects.test.ts の元2ケース。元ケース・assertion・実装を変更しない。独立レビュー担当 battle_helper_contract_review は両ファイルを INSIDE と判定した。51ケースの既存診断は合格・失敗0・skip0であり、正式全体合格ではない。

因果関係は F-BTL-41/43/51/52 と Accepted ADR0022 に基づき、正準世界の actor/area/held/worn/attached 効果合成、A/B対称性、未知の原因が機械結果に影響しても観測者へ識別情報を漏らさない境界を確認する。0.5係数は採用済み係数機構内の実装値であり、独立したゲーム方針の採用とは扱わない。

遅延効果は Accepted ADR0001 の明示的な効果・provenance と ADR0021 の pendingEffects 継続・閉じた状態契約、F-BTL-02/03 のサーバ算術に基づく。一度だけの実行、重複ID拒否、条件、取消、期限、scheduled_effect provenance を確認する。モデル品質・公開完走の証明ではない。

battle-engine.test.ts の元46ケースは保持し未封印とする。威力由来1〜9ターンのクールダウン、通常攻撃連続時のスタミナ・ダメージ減衰には Accepted 根拠が未確認。F-BTL-09 の2受動ターン強制攻撃と F-BTL-30 の10〜20ターン必殺進行は明文であり、この不足に含めない。
