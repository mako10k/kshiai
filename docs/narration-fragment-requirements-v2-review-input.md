# 対戦実況 Fragment 要件候補 revision 2 — 初回オーナーレビュー入力

- 審査対象: [対戦実況 Fragment と結果表示 — 要件候補 revision 2](narration-fragment-requirements-v2.md)
- 正確な候補パス: `docs/narration-fragment-requirements-v2.md`
- 候補 SHA-256: `e2457afd8c36b2704d1769985133781491813b613a218c636b170d735cdb8ec4`
- 状態: Proposed。revision 1 のレビュー経路を引き継がず、初回オーナーレビュー経路を選ぶ段階。

## 根拠と既存権限

規範的な出所は、2026-09-29 のオーナーによる Fragment 単位の Immutable な追記、確定入力・出力・永続化後の Commit、固定入力とナレータメモリを使った再試行、Beat / Turn と独立した区切り、実況の成否から独立した Battle 正史、終局 Fragment または確定エラー後の結果カード表示、手動リトライ、および既決の旧未完了対戦破棄と30分を上限とする完了履歴移行の指示である。既存コード、試験、旧候補は要件権限の出所ではない。

既存の Accepted [ADR-0006](adr/0006-terminal-snapshot-narration-delivery.md) の公開 prose 制約、[ADR-0016](adr/0016-scene-beats-batched-narration.md) の Beat 単位実況 job は本候補と衝突する部分を持つ。[ADR-0038 候補](adr/0038-narration-fragment-commit-and-result-reveal.md)が変更案を記録するが、Accepted になるまでは既存の決定を置き換えない。Battle の Turn / Beat 自体は維持する。V3-only 切替については[切替要件候補](character-v3-battle-cutover-requirements-v1.md)との整合を審査する。

## レビュー境界

現在の対象は NF-1 から NF-12 と受入時の八つの振る舞いである。特に入力・出力の確定条件、ナレータメモリの所有権、結果公開条件、旧未完了対戦の扱い、30分の移行判断境界を評価する。例として、結果カードが一時的な生成失敗だけで表示されないことはこの要件の範囲である。具体的な DB テーブル、event 名、cut アルゴリズムは次の基本・詳細設計に属する。

完了済み旧対戦の実データ調査と30分以内の移行成立性、超過時の具体的なデータ処置、既存クライアントへの適用、結果カード以外の公開面、全ページ再読込後の未確定文字、複数接続の競合処理は未決である。これらを独断で受入条件に追加しない。

## 独立レビューに渡す質問

1. NF-1〜NF-12 はオーナーの各決定と Accepted な既存契約を正確に区別しているか。
2. 仮 Streaming、Fragment・メモリ・参照範囲の Commit、Battle 正史の Commit、結果表示を混同していないか。
3. 終局 Fragment と確定・永続化エラーの二つの結果公開条件、後続の手動リトライを矛盾なく定義しているか。
4. 旧未完了対戦の破棄と完了履歴の時間制限付き移行候補を、切替要件候補・ADR-0038 候補と整合させているか。
5. 利用者に公開する Fragment の発話・地の文の構造は、質問として残った部分を勝手に決定していないか。

初回オーナーレビューでは `REVISE`、`REVIEW_THEN_REVISE`、`REVIEW_THEN_DECIDE`、`REVIEW` のいずれかの経路を選ぶ。独立レビューは、指定された経路のもとでこの digest の候補と本入力に対して行う。候補本文の変更は新しい revision の作成から始める。
