# ADR-0060: テスト契約回復における公開範囲・履歴・疲労・fallback

- Status: Accepted
- Date: 2026-10-08
- Decision owner: Product owner
- Related: [所有者決定revision1](../battle-test-contract-owner-decisions-2026-10-08.md)、ADR0059、F-CFG05、ADR0010/0011

## Context

残13ファイルに未採用の具体ルールがあり、所有者が会話で方針を選択した。実装/過去合格からの採用推測をやめ、直接指示を規範とする。

## Decision drivers

不明な公開設定による意図しない公開を防ぐ。履歴の当時値を固定する。機械的待ち時間から疲労と自覚へ移す。装備効果を失わず代償を付ける。429切替を既存要件へ一致させる。

## Considered options

現行assertionを無変更で採用する案に対し、所有者は公開不明値/履歴表示/クールタイム/装備切詰め/429の修正を選んだ。

## Decision

所有者決定revision1の項目1〜5を採用する。項目6はADR0059の受入として記録する。STA増加の数式、自由行動ペナルティの具体種類、履歴snapshot欠落の取扱いは詳細化が必要。未決部分を現行数値や仮実装で埋めない。改善分析5/10条件は未採用。

## Consequences

不明設定は非公開へ閉じ、履歴表示は現在母集団の変化で書き換わらない。STA疲労の自覚を実際の意識入力へ届ける義務が生じる。元効果と自動代償の両立は装備効果schema上限とも照合する。

## Compatibility and migration

保存済み試合のfrozen契約/世代は自動改変しない。履歴snapshotの保存と旧欠落値の方針を設計してから実装する。route receiptへrate_limitを追加。public/private正規化の欠落値も非公開となる。新規作成の明示public既定は維持。配備・本番DB更新・有料実行は別許可。

## Verification

元ケースを明示仕様変更へ対応し保持。非公開正規化/friend方向、snapshot固定、STA/自覚契約、効果保持、4291時間切替とreceiptを検証。型検査・正式全体ゲートと原251範囲を維持。

## Implementation references

所有者決定revision1を根拠に段階実装。STA/penaltyとsnapshot設計は次工程。
