# 名前照合と設定解析のテスト契約確認 — 2026-10-07

ユーザーが指示した全テストの因果関係整理・封印のうち、既存2ファイル7ケースの回帰範囲を固定する。テスト、実装、採用済み規則は変更しない。診断合格は規則の採用根拠にしない。

## 名前照合（3ケース）

要件 F-CHR-03c (`docs/requirements.md:112`) の表示名・本名の正規化衝突照合を根拠とする。`character-name-uniqueness.ts` の NFKC、大小文字・空白・記号の正規化、予約名との衝突検出と非衝突、テスト用mockの決定的suffix割当を確認する。最後のケースは内部fixture用で、実LLMによる名前生成規則を採用しない。

このファイルだけで保存、CAS競合、衝突後の再生成を証明しない。現在のconfirm経路の409による調整要求と、要件の再生成要求の全経路適合は別の確認事項である。この封印をその適合主張に使わない。

## 設定解析（4ケース）

ADR0008の副作用を持たないshadow境界、ADR0018の通常の設定権限と隔離Stage override・不変deployment identityを根拠とする。ADR0017の既存public clockと既知の候補識別子は文脈として参照する。テストは `config.ts` の解析関数だけを呼ぶ。

確認範囲は current既定値と既知candidate-12-v2名、off/shadow名、未指定/legacy/compact名、それ以外の拒否、override有無に対応する完全commit SHAとdigest-bound artifact形式の確認である。候補の数値採択・実際の有効化、隔離Stageの実証や実行許可、永続設定の変更は証明しない。型による解析結果の契約に型逃げは見つかっていない。

## 検証と独立レビュー

元の全7ケースを保持してローカル診断で7 pass / 0 fail / 0 skipped。`docs/evidence/names-config-preseal-2026-10-07.tap` に保存した。独立レビュー担当 `/root/llm_boundary_seal_audit` は全ファイルを上記の回帰範囲で封印可能と確認した。全251ファイルの目標や正式テスト合格は未完了。
