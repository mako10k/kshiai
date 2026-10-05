# cc305 — 独立設計レビューと対応

- 日付: 2026-09-29
- レビュアー: 独立read-only agent `cc305_design_review`。調整・修正: main agent。
- 規約: `adr-governance`、`review-phase-boundary`。一人の独立レビューで有用な指摘を得た時点で終了。
- 現フェーズ: [要件候補v2](../character-v3-battle-cutover-requirements-v2.md)、[ADR-0039](../adr/0039-v3-battle-lifecycle-and-cutover.md)、[基本・詳細設計v2](../battle-lifecycle-boundary-design-v2.md)の採否準備とPERT整合。
- 現フェーズの義務: 固定済みR1–R5、責務、I/O、保存・削除・再送、既存ADRとの整合。次フェーズ: vt102/vt109/vt110の実装証拠、vt104/vt108のexact release・Stage件数・停止時刻・実行SQL。

## 対象の同一性

初回のレビュー入力と、独立レビュアーが最後に読み戻したSHA-256は一致した。

| ファイル | 初回レビューSHA-256 |
|---|---|
| ADR-0039 `.think` | `1d339abc077f1c568aa08fd4f8467798ee1c06cb81a693a4d428d811566fdb88` |
| ADR-0039 `.md` | `0102f44ec6e911f83b0d5027d88d6f23e62c64b830c8458c3c8568cc7621ba92` |
| lifecycle設計v2 | `4de6ec566fa3681efabe1be269c4fea4ef6c7c7fa42cab0c63914a829f6c0a16` |
| 切替要件v2 | `63d78ae5adef9ddec55e3db802b44429f5f82611e6591104f7fa8cc5a4c5a2b4` |

判定は **PASS_WITH_FINDINGS**。以下の二件は今回の候補で訂正した。下記は元の指摘とmain agentの対応を区別して記録する。修正後に独立レビュー全体を通し直したという主張はしない。

## F1 — P2 INSIDE: vt109の不要な新ADR待ち

**元の指摘:** Accepted authoring v5 R18（304–316行）とADR-0010/0014は、exact candidate/receiptへの所有者確定、providerを伴わないappend/CAS、失敗時current保持、attemptとreview画面を既に定める。子PERT vt109はこれらをsourceとしている一方、`vg109b` が新しい切替パッケージ受入を必須にしている。新ADRが必要なvt102/vt110と、既存契約で実装できるvt109の権限が混ざっている。

**main agentの照合・対応:** 一次句とタスク範囲を読み直して採用。vt109を `VST_LOCAL_FIXTURE` から始める形に訂正し、不要となったjoinとgateを削除。新ADR待ちは対戦側に保持する。`dag next` がvt109を実行可能として選ぶことを最終検証する。固定候補の正式登録は既存仕様に従い、V3-onlyの全選択入口への適格性適用は新契約下のvt110が担う。

## F2 — P2 INSIDE: 旧ADR句の限定置換の出典

**元の指摘:** ADR-0010は既存legacy manifestの保持・既存version-1 battleの可読性を定める。保存枝ADR-0032は既存battleの非migrationと従来通りの継続を定める。一次句はfinished/unfinishedを文字通り区別していないため、「未完了旧対戦を保持・継続する句」とまとめると置換対象が曖昧になる。

**main agentの照合・対応:** 一次句を確認して採用。`.think`、`.md`、調査記録を訂正し、適用を置き換える正確な句とR3 predicate（切替前作成・切替時finished以外）を明記した。finished履歴の不変性・意味・可読性、authoring、現行ADR-0032の時間境界は継承する。

## OUTSIDE / BOUNDARY_DISPUTE

独立レビュアーはStage件数・SQL・release・停止時刻・実装試験結果を後続作業として妥当とした。現在の候補のブロッカーへ格上げしていない。BOUNDARY_DISPUTEはなし。

## 検証と結論の限界

- command-line LLMThink監査と `npm run adr:check` を実行。Proposedのまま確認する。
- 親子PERTは `document check`、依存・資源schedule、`dag next` で再解析する。
- `npm run typecheck`、現在有効な `npm test` は成功。test selectionはactive 11、provisional 2、disabled 147。新設計の実装完了を示す試験ではない。
- ソース・型の変更とStageデータ操作は今回の変更セットに含めていない。

現在の具体案はcc319で採否を判断できる状態である。それと独立に、次の開発候補vt109は既存Accepted契約で実行できる。新設計を採用済みにする記録は所有者の明示的な採否に従う。
