# ADR-0037: Append-only Narration Fragments and provisional Streaming

- Status: Rejected
- Date: 2026-09-29
- Decision owner: Product owner
- Related: [要件候補 revision 1](../narration-fragment-requirements-v1.md), [設計候補 revision 1](../narration-fragment-stream-design-v1.md), [ADR-0006](0006-terminal-snapshot-narration-delivery.md), [ADR-0016](0016-scene-beats-batched-narration.md), [ADR-0017](0017-public-turn-intra-turn-beats.md)
- Authoritative record: [0037-append-only-narration-fragments.think](0037-append-only-narration-fragments.think)

この ADR は一度も Accepted になっていない。オーナーの後続指示により、過去の候補として保存し、現在の審査候補は ADR-0038 とする。以下の提案内容は履歴であり、Accepted ADR-0006/0016 の効力を変更しない。

## Context

Accepted ADR-0006 は生成途中の本文を画面へ公開せず、完成した terminal snapshot だけを公開する。2026-09-29 のオーナー指示は Fragment 単位の Immutable な確定、途中 Streaming の表示、失敗中の途中表示の保持、再試行の最初の本文チャンクでの入替えを求める。公開本文の扱いが衝突するため、この ADR を ADR-0006 の後継候補として作成する。オーナーの「設計や方針に固定化」は候補の作成指示であり、この正確な ADR 版の Acceptance ではない。

## Decision drivers

- 完全に受信した本文だけを確定 Fragment とする。
- 失敗と再試行を利用者が識別でき、前回の途中表示を新しい本文の開始まで読める。
- 同じ位置に複数回の試行や配信があっても、確定 Fragment は一つにする。
- Narration の成否を Battle の正史から分離する。
- ADR-0006 の確定入力、battle-local 順序、再接続、耐久配信と fencing を保つ。

## Considered options

1. **ADR-0006 の terminal-only 表示を維持。** 確定表示の復旧は単純だが、合意された途中 Streaming 表示を満たさない。
2. **累積本文を随時上書き。** 途中表示を早く出せるが、確定 Fragment と失敗した生成試行の境界を表現しにくい。
3. **試行ごとの未確定 Streaming と、完了後の Fragment 追記。** 合意された表示と Immutable な記録を両立する。画面側に試行識別と入替え、再接続の処理が必要になる。

## Proposed decision

Option 3 を提案する。一つの Battle は一つの論理的な Narration に対応し、Narration は確定 Fragment を順に追記する。各 Fragment の本文、順序、参照元は Commit 後 Immutable とする。Streaming のチャンクは生成試行に属する未確定表示であり、生成元の正常終了と完成本文の durable な原子的保存を経て Fragment を Commit する。一つの表示位置には最大一つの確定 Fragment を許す。試行や配信の再実行で同じチャンク列・本文を再現する義務はない。

失敗した試行の途中表示を残す。再試行が予定されたら再試行案内を添える。新しい試行を開始した時点では旧表示を維持し、最初の本文チャンクを受けた時に、同じ位置の旧途中表示と案内を消して新しい Streaming を表示する。再試行が終わっても Commit できないときは途中表示を残して失敗を明示する。Commit 済み Fragment は完成本文で当該位置の仮表示を置き換える。

本 ADR が Accepted になった場合、ADR-0006 の「公開 prose は terminal snapshot のみ」「provider progress は非公開」「terminal block で receipt を置換」の選択を、この範囲で置き換える。ADR-0006 の Battle 正史の先行確定、固定入力、公開 `(battleId, turnReceiptId)` 識別子と battle-local 順序、物理的に有限な認証付き再接続、durable cursor と outbox、at-least-once 配信、queue wake-up、worker と Battle 書込みの fencing は維持する。独立した公開 `narrationId` は追加しない。通信断は生成失敗と区別し、再接続時に確定 Fragment を読み戻す。ADR-0016/0017 の Turn と Beat の意味は維持する。

## Consequences

### Positive

- 利用者は生成中の本文を読み、失敗後の再試行開始を見分けられる。
- 確定本文は Fragment ごとに追記・再読込できる。
- Battle の確定結果は生成や配信の失敗から独立する。

### Negative and risks

- 画面は `slotId` と `attemptId` を区別し、古い試行の遅延チャンクを混ぜずに表示する必要がある。
- 未確定表示は確定履歴ではない。通信断後の見え方と最終的な確定本文の整合を分けて扱う。
- 既存の terminal block と新方式を併存させる範囲は適用開始の判断によって変わる。

## Compatibility and migration

適用開始時点、既存・進行中対戦、既存クライアント、履歴読戻しの扱いはオーナー判断として残す。その判断後に移行または切替の設計を定める。Beat と Fragment の対応数、ページ全体を再読込した後の未確定文字の復元、再試行回数・間隔もこの ADR では固定しない。ADR-0006 の状態を変更するのは、この ADR の Acceptance 後である。production データ変更、release、deployment は別の権限境界に置く。

## Verification

- 完了・保存された試行だけが一つの確定 Fragment を作り、読戻しで同じ本文・順序・参照元を返す。
- 失敗した試行は Fragment を作らず、再試行の最初の本文チャンクまで途中表示と案内を保持する。
- 異なる再試行本文、遅延チャンク、重複 Commit、重複配信でも確定列と表示が混ざらない。
- 通信断だけでは生成を失敗扱いせず、再接続後に確定 Fragment を読み戻せる。
- 生成・配信の成功失敗によって Battle の Turn、Beat、状態、結果が変わらない。

## Implementation references

- [詳細な設計候補](../narration-fragment-stream-design-v1.md)
- 実装 commit、検証結果、移行判断は各段階で追記する。
