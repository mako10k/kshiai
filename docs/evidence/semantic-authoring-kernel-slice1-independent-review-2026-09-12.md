# 構造化意味オーサリング基盤 — スライス1独立レビュー

- 実施日: 2026-09-12
- 対象: PERT `cb206`（Kernel slice 1: contracts and pure orchestration）未コミット実装
- ブランチ: `codex/compact-psyche-repair-integration`
- レビュー担当: 独立レビューエージェント（実装者とは別プロセス）
- 判定: **FAIL**
- PERT `cb206` は **done にしない**。本レビューはスライス1のゲートであり、スライス2の実装許可ではない。

## 結論

共有契約、閉じた終端結果、decoder 境界、settlement 非発明、family 非混入、scripted timeout / late / fence は方向として ADR-0031 と実装設計に沿っている。実装ゲートとしては、capability の mutation 上限（D3）と進捗の回復・停滞（D8 / 設計 7.3）が落ちているため不合格である。修正と再レビューまで `cm216` へ進まない。

## 指摘一覧

| 優先度 | 件数 | 内容 |
|---|---:|---|
| P0 | 1 | 3回失敗したあとの4回目提案が候補を置換できる |
| P1 | 2 | 回復戦略を窓内の毎観察で消費する。finalize 前に stall し得る |
| P2 | 3 | 一部終端で outstanding 予約を課金しない。stage に live map を渡す。wired hard check が空 |
| P3 | 1 | テスト decoder の `as Record<string, unknown>` |

### P0

1. `applySemanticAuthoringProposalV1` は `recordMutation` の前に staging する。失敗3回後も session は live のままなので、4回目の decode 済み提案が counted step と candidate 置換まで進む。設計 4.2 は proposal/review 最大3回、成功は1回。

### P1

2. `classifyProgressCondition` が no-progress 4〜6 で毎回 `recovery_required` を返す。orchestration はそれを毎回 recovery-strategy 消費と追加 step にする。設計 7.3 は4 counted step で回復1回、さらに3 step で stall。
3. `selectSemanticAuthoringWorkV1` は `selectWork` の前に観測して stall/cycle 終端し得る。残作業が無い候補は finalize / F10 Q&A を経ずに失敗できる。

### P2

4. `failSemanticAuthoringV1` / `terminate` は outstanding 予約を課金しない。timeout 本線以外では未知消費が落ちる。
5. `applyProposalTransactionV1` は live な obligation/finding map を `stage` に渡す。adapter が in-place 更新すると reject 時も trusted ledger が壊れる。
6. wired apply は `hardChecks` を空配列のまま通す。設計 4.4 手順4の kernel 所有検査が未配線。

### P3

7. テスト用 decoder が `unknown` を `as Record<string, unknown>` で狭めている。本番カーネル経路ではない。

## ADR-0031 D1–D9

| 条項 | 判定 | 所見 |
| --- | --- | --- |
| D1 薄いカーネル | 条件付き | family path や戦闘 cognition は無い。D3/D8 が orchestration で崩れている |
| D2 型付き契約 | 概ね合格 | 内部は TS 値。JSON 往復は既存 decoder 境界のみ |
| D3 焦点付き capability | P0 不合格 | 成功後 revoke はある。失敗3回のあと4回目が候補を置換できる |
| D4 トランザクション適用 | 条件付き | revision mismatch と stage reject は trusted を保持。隔離コピーと hard check 配線が不足 |
| D5 Q&A 五条件 | 構造は合格 | カーネルは五群の非空と既知 ID だけ見る。否定テストが弱い |
| D6 インメモリ scratch | 合格 | DB/route なし。再開は新 attempt の recipe |
| D7 有限政策 | 条件付き | 政策数値は一致。timeout は全額課金。他の terminal は outstanding を落とす |
| D8 進捗/サイクル | P1 不合格 | 散文ドリフトを進捗にしない点は正しい。回復消費と finalize 前 stall が設計と不一致 |
| D9 閉じた結果 | 合格 | resolver は `ready_for_review` / `needs_owner_answer` / `failed` のみ |

## スライス1ゲート

対象は shared 契約、kernel トランザクション、orchestration、accounting、progress monitor、scripted ports とテストに閉じている。DB migration、HTTP route、実 provider、character adapter、公開 DTO、activation の追加は無い。範囲自体は守っている。完了条件は上記 P0/P1 のため未達。

## 明示チェック

1. カーネルが adapter の候補/提案フィールドパスを見ない — 合格
2. `unknown` は decoder 入口のみ — 合格（本番）
3. 内部 JSON 文字列往復なし — 合格
4. 本番パスに `as any` / `as unknown as` なし — 合格
5. invented settlement フィールドなし — 合格
6. cancelled/expired は resolver 結果ではない — 合格
7. 無効提案は trusted を保持 — 合格（session 上限超過の4回目成功提案を除く）
8. terminal 後の late result は適用しない — 合格
9. timeout は予約全額課金 — 本線は合格、他の terminal は不足
10. 共通カーネルに character/battlefield/narration-style path なし — 合格

## 検証

```text
focused semantic-authoring tests   39 passed
npm run typecheck -w @kshiai/shared   exit 0
npm run typecheck -w @kshiai/backend  exit 0
```

テスト成功は新設計への適合証明ではない。独立レビューが指摘した欠測（4回目提案、4+3 stall、不完全な五条件証拠）は現テストでは落ちない。

Lizard は今回、対象パス引数の誤りで未実行。再レビュー時に `npm run static:lizard` を正規手順で走らせる。

## 後続

- P0 と P1 を修正し、回帰テストを足して再レビューする。
- P2 は再レビュー前に直すことを勧める（未知消費と ledger 隔離）。
- 修正前に `cb206` を完了扱いにしない。`cb216` 以降へ進まない。
- 実 provider、route、character adapter、公開 DTO は対象外のまま。

## 再レビュー（同日）

独立再レビューは **PASS**（P0/P1/P2/P3 いずれも 0）。前回 FAIL 項目は現行コード上で閉じた。詳細は `/tmp/grok-mako10k/grok-review-d0024912.md`。

検証（再レビュー時点）:

```text
focused semantic-authoring tests   45 passed
npm run typecheck -w @kshiai/backend  exit 0
npm run static:lizard                 基準超過なし
```

本記録はスライス1ゲートの合格を残す。PERT `cb206` の done 記録と `cb216` 開始は別手続とする。
