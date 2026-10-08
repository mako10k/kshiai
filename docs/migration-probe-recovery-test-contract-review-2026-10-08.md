# 合成移行probeのテスト接続復旧

対象は semantic-migration-probe-fixture.test.ts の元1ケースと semantic-migration-probe-run.test.ts の元2ケース。独立レビューは境界・probe関連5ファイル全22ケースをINSIDEと判定した。診断は元22ケースpass、fail/skipなし、全workspace型検査exit0。根拠は docs/evidence/boundary-probe-recovery-independent-review-2026-10-08.json。

Accepted ADR0030の移行契約とADR0043の通常V2書込廃止を維持する。fixtureはtesting内だけで歴史世代を作り、NODE_ENV=test・新規SQLiteを要求する。元assertionを変更せずimport先を移した。runテストは独立run/prompt identity、再seed拒否、production拒否時の件数不変、入力schemaと予約上限を検査する。実provider呼出し、通常V2更新、旧切替試行成功、配備、品質証明は対象外。

現在fixtureと実際に呼ぶcontext/merge/payload/digest/provider reservation/schema/DB/import helper/historical writerをCauseに接続する。旧HEADと旧path proofは履歴として保持し、現在テストのinventoryだけ新refへ再接続する。移動した有料probe起動入口の旧承認は再利用しない。このSealは有料実行承認ではない。
