# 対戦実況 Fragment の追記と Streaming 表示 — 設計候補 revision 1

- 状態: Proposed（[要件候補](narration-fragment-requirements-v1.md)と後継 ADR の受入待ち）
- 日付: 2026-09-29
- 対象: Narration の記録境界、生成・配信 I/O、画面の未確定表示
- 上位根拠: 2026-09-29 のオーナー指示、[要件候補 revision 1](narration-fragment-requirements-v1.md)。既存の [ADR-0006](adr/0006-terminal-snapshot-narration-delivery.md) と公開途中表示が衝突するため、この文書は新方式の実装権限ではない。

## 所有権と構成要素

Battle は Turn、Beat、状態遷移、結果、確定イベントを所有する。Narration は Battle の確定情報と固定済み入力を読み、生成試行、Fragment、配信状態を所有する。Narration から Battle へは確定結果を書き戻さない。

| 概念 | Identity と責務 | 保存・変更規則 |
| --- | --- | --- |
| `Narration` | `battleId` に一意に対応する論理的な追記先 | Fragment 0 個から始められる。物理作成が Battle の成功条件にならない。 |
| `FragmentSlot` | `slotId`、Battle 側の確定参照、Narration 内の予定位置 | 一つの実況対象を指す。生成失敗後も同じ slot を再試行できる。 |
| `GenerationAttempt` | `attemptId`、`slotId`、開始・成功・失敗、仮の本文 | 再試行ごとに新しい ID。仮の Streaming 文字は確定 Fragment ではない。 |
| `NarrationFragment` | `fragmentId`、`slotId`、確定順序、完成本文、参照元 | 一つの slot に最大一つ。Commit 後は本文・順序・参照元を変更しない。 |
| `StreamDelivery` | 接続・配信試行と画面側の受信状態 | 生成試行の成否と区別する。通信断は生成失敗を意味しない。 |

`Narration` は確定 Fragment の順序付き列である。全文表示はその列から組み立て、累積した全文の上書きを正本にしない。`slotId` は再試行を同じ表示位置に結び、`attemptId` は古い試行の遅延チャンクと新しい試行を区別する。

## 入力と Commit 境界

Narration の生成入力は、Battle が確定した source event / receipt と必要な Beat の参照、作成時に固定された資産・policy の識別子または snapshot、実況用の観測安全な投影から構成する。必要な Beat と Fragment の対応数は [ADR-0016](adr/0016-scene-beats-batched-narration.md) と [ADR-0017](adr/0017-public-turn-intra-turn-beats.md) の現行契約を変更せず、別の判断までこの文書では固定しない。`sourceRefs` は正確な由来を記録できる形にする。

生成元の正常終了を確認した後、完成した本文と sourceRefs を一つの Fragment として原子的に保存し、確定順序を付ける。単なる接続 EOF、画面が最後のチャンクを受けたこと、worker が成功ログを出したことだけでは Commit しない。保存に失敗すれば Fragment は存在しない。Commit 応答が失われた場合は同じ `slotId` の確定結果を読み戻し、既存 Fragment があれば再追記しない。

## Narration → 画面のイベント契約

Transport を問わず、全イベントは少なくとも `eventId`、`battleId`、`slotId`、`kind` を持つ。試行に属するイベントは `attemptId` を、チャンクは試行内の `chunkSeq` を持つ。`occurredAt` は表示・調査用であり順序判定には使わない。確定イベントは `fragmentId` と `appendSeq` を持つ。私的 prompt、raw provider response、秘密情報は画面イベントに含めない。

| kind | 主な payload | 画面での意味 |
| --- | --- | --- |
| `attempt.started` | `attemptId` | 試行開始。古い未確定表示はここでは消さない。 |
| `attempt.chunk` | `attemptId`, `chunkSeq`, `textDelta` | 同じ試行の仮表示へ追記。新しい試行の最初の本文チャンクなら、同じ slot の古い仮表示と再試行案内を先に消す。 |
| `attempt.failed` | `attemptId`, 公開可能な失敗種別 | この試行の仮表示を保持する。失敗だけで再試行が予定済みとは主張しない。 |
| `slot.retrying` | 失敗した `attemptId` | 再試行が予定されたことを示し、保持した仮表示に案内を添える。 |
| `slot.failed` | `slotId`, 公開可能な失敗種別 | 次の再試行が予定されない。仮表示を残し、再試行案内を終えて失敗を明示する。 |
| `fragment.committed` | `fragmentId`, `appendSeq`, `attemptId`, `fullText`, `sourceRefs` | 完全な確定本文で仮表示を置き換え、確定列へ追加する。 |

画面の state は `slotId` ごとに `committed`、`provisionalText`、`activeAttemptId`、`retrying`、`terminalFailure` を分ける。確定済み slot への遅延した試行イベントは無視する。古い `attemptId` のチャンクは新しい試行へ混ぜない。重複する `chunkSeq` は同じ試行内で一度だけ反映する。チャンクが欠けた場合は欠落部分を推測して連結せず、確定時の `fullText` で表示を修正する。画面側のチャンク欠落はサーバー側の Commit を妨げない。

### 代表シーケンス

```text
attempt.started(slot=S, attempt=A1)
attempt.chunk(S, A1, 1, "勇者は")          # 仮表示
attempt.failed(S, A1)                     # 「勇者は」を保持
slot.retrying(S, A1)                      # 再試行案内を追加
attempt.started(S, A2)                    # まだ「勇者は」を保持
attempt.chunk(S, A2, 1, "剣士は走る")       # この時点で旧仮表示を消し、新しい仮表示
fragment.committed(S, A2, F, 7, "剣士は走る") # 完成本文 F へ置換
```

この一連の事象で、以前に確定した Fragment と Battle の正史は変わらない。`A1` と `A2` のチャンク列・文面一致は必要ない。再試行が予定されない場合は `slot.failed` へ進み、未確定表示を残したまま失敗を示す。

## 読戻し、再接続、整合性

`readNarration(battleId)` は `battleId`、確定 Fragment の `fragmentId`・`slotId`・`appendSeq`・`fullText`・`sourceRefs` を順序付きで返す。公開識別子は既存の `(battleId, turnReceiptId)` を維持し、独立した公開 `narrationId` を追加しない。この snapshot が確定表示の基準である。live 購読は仮表示の速い更新を担う。再接続時は購読を確立してから snapshot を読み、並行して届いたイベントと `slotId` / `fragmentId` で併合する。確定イベントは全文を持つため、接続断中のチャンク再現は必要ない。

画面側の transport 断を `attempt.failed` として扱わない。同じ画面セッション内では既存の仮表示を維持し、確定 Fragment の読戻しまたは新しいイベントで更新する。ページ全体を再読込した後に未確定文字まで復元するかは未決であり、確定 Fragment の復元義務とは分ける。

サーバーは `slotId` の確定 Fragment を最大一つにし、Commit の読み戻しで二重追記を防ぐ。確定イベントの再配信は `fragmentId` で無害化する。チャンク配送の厳密な一回性、異なる試行間で同じ文面、同じ Streaming の再現は保証しない。対戦の `advance` は Narration の status、prose、retry を入力にしない。

## 現行 Accepted ADR との関係と後続判断

- [ADR-0006](adr/0006-terminal-snapshot-narration-delivery.md) の公開 terminal-snapshot-only と private provider progress は、新しい仮表示契約と両立しない。後継 ADR でこの部分を変更し、確定 receipt、対戦正史の先行 Commit、入力 snapshot、battle-local ordering、durable outbox、worker fencing、確定イベントの再接続可能性を保持する。
- [ADR-0016](adr/0016-scene-beats-batched-narration.md) の Beat close で実況 job を作る条件、[ADR-0017](adr/0017-public-turn-intra-turn-beats.md) の Turn / Beat clock は、この設計候補では変更しない。
- Beat と Fragment の 1:N / M:N、既存・進行中対戦への適用開始、ページ再読込後の未確定文字の復元は別の判断である。これらは確定 Fragment と再試行表示の契約を曖昧にする理由にはしない。
- この文書は設計候補であり、コード、データ移行、release、deployment、production 適用を承認しない。
