# ADR-0042: 未リリース共用環境の初回V3試行を優先する

- Status: Proposed
- Date: 2026-09-30
- Decision owner: user
- Authority: 基本方針は[要件v3](../character-v3-battle-cutover-requirements-v3.md)の所有者指示で確定済み。本ADRの具体的なworkflow/control配分は候補。
- Related: vt104–vt108 / cc314 / csm001、ADR-0039 D3/D4、ADR-0040、ADR-0041、release_process flow5–7

## Context

C1: 未リリース環境でGoogleログインからV3実対戦までを優先する。既存データの保全・互換性は後回しという所有者の明示をE1とする。旧設計のsnapshot回復、八receipt、production promotionはこの新しい初回試行の範囲にそのまま適用できない。

## Decision drivers

- V3を実際に試すまでの未達経路を短くする。
- 新規V3の正しさと旧データ維持を分ける。
- 既存のローカル実装を再利用し、作った制御の撤去自体を新しい大仕事にしない。

## Considered options

1. 推奨: 初回試行の配備経路を限定し、Google/所有権/V3実経路の受入を使う。既存runtime/controlの再利用を調査して必要な変更だけを決める。
2. 旧八receipt・snapshot回復の経路を完成する。所有者が後回しにした保全作業を初回試行の前提へ戻すため、現方針と合わない。
3. 全DBを初期化して作り直す。Googleユーザや会計を含む作用が広く、現在の計画修正指示からは選択しない。

## Decision

候補option1。具体的なworkflow file set、runtime control遷移との接続、配備identityの固定・実試験をvt104で詳細化する。一般公開のpromotionと初回の共用環境試行を区別する。詳細候補の受入前に実装を変更しない。所有者の基本方針自体の再承認は求めない。

## Consequences

旧データ・旧版継続・復旧可用性を初回試行で保証しない。旧データに不具合が見つかっても試行を止める互換性補修へ自動拡張しない。Googleログインや新しい対戦自体の不具合は初回試行の修正対象。実装済み旧制御はまだ旧設計を守っているため、計画修正だけでは実Stage受入を達成できない。

## Compatibility and migration

要件v3 R4/R5で既存データ維持・メール・snapshotを初回試行から外した。ADR0039の新規binding/旧未完了削除は継続。ADR0040/0041の旧理由本文とSeal履歴は保存し、今回を旧sourceから導ける受入として登録しない。本ADRの具体設計受入時に旧ADRの適用範囲/後継リンクを更新する。

## Verification

exact source/deployment identity、Google login/ownership、通常review/confirm、V3作成/進行/SSE/再読込/結果の実経路証拠。local test結果は準備証拠であり実配備後の成功へ読み替えない。

## Implementation references

未実装。現在の作用は文書と正本PERTの再修正のみ。[修正計画](../evidence/vt104-unreleased-trial-rescope-2026-09-30.md)。
