# 対戦実況 Fragment 要件候補 revision 1 — 初回オーナーレビュー入力

- 審査対象: [対戦実況 Fragment と再試行表示 — 要件候補 revision 1](narration-fragment-requirements-v1.md)
- 正確な候補パス: `docs/narration-fragment-requirements-v1.md`
- 候補 SHA-256: `1c65f8b89e04083a636872f82bc579158114a1432891ae572f9cbef36ac28ffb`
- 作成日・状態: 2026-09-29、Proposed。初回オーナーレビュー経路は未選択。

## 根拠と既存権限

規範的な出所は、2026-09-29 のオーナーによる Narration / Fragment 構成、Immutable な確定、最後まで正常受信してからの Commit、失敗時の途中表示保持、再試行案内、新しい Streaming の最初の本文チャンクでの入替え、Battle 正史からの独立という指示、および最後の「OKです。では、設計や方針に固定化してください」である。既存コード、試験、設計候補は要件権限の出所ではない。

既存の Accepted [ADR-0006](adr/0006-terminal-snapshot-narration-delivery.md) は公開 prose を terminal snapshot に限り、provider progress を非公開とする。今回の候補と矛盾する部分を [ADR-0037 候補](adr/0037-append-only-narration-fragments.md) の受入後に後継決定へ切り替える。ADR-0006 のその他の決定、[ADR-0016](adr/0016-scene-beats-batched-narration.md) と [ADR-0017](adr/0017-public-turn-intra-turn-beats.md) の Turn / Beat 契約はそのまま扱う。

## レビュー境界

対象は NF-1 から NF-8 と六つの受入時の振る舞いである。確定 Fragment と未確定表示、再試行、接続断、Battle 正史の関係を評価する。適用開始時点、既存・進行中対戦とクライアントの移行、Beat と Fragment の対応数、リロード後の未確定文字復元、再試行回数・間隔、具体的な event schema と transport は後続の判断・設計で扱う。将来判断を要件候補の欠陥に変換しない。

候補の受入条件は、各 NF がオーナー指示と整合し、失敗した試行の途中表示と確定 Fragment を混同せず、二重 Commit を防ぎつつ試行の再現を要求せず、Narration の成否が Battle の確定情報へ影響せず、ADR-0006 の処置と未決の適用範囲を明示することである。公開イベント名や DB 形式を確定させることは受入条件ではない。

## 独立レビューに渡す質問

1. 各 NF と受入時の振る舞いは、上記オーナー指示を超えて外部仕様を作っていないか。
2. 正常終了・durable Commit・画面への表示を明確に区別できているか。
3. 失敗後の表示保持、再試行案内、新試行の最初の本文チャンクでの入替え、最終失敗は一貫しているか。
4. ADR-0006 と衝突する公開本文ルール、および維持すべき権限を正しく区分しているか。
5. Beat / Fragment の対応数、既存対戦とクライアント、全ページ再読込後の途中表示を、未決事項として適切に保持しているか。

初回オーナーレビュー後の経路は `REVISE`、`REVIEW_THEN_REVISE`、`REVIEW_THEN_DECIDE`、`REVIEW` のいずれか一つを記録する。独立レビューはその経路が選択されてから、この digest の候補とこの入力に対して行う。候補本文が変われば revision を上げ、digest と初回レビューを更新する。
