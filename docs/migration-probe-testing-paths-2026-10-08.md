# 合成移行probeのテスト専用配置

履歴generation書込helperへ依存するfixtureと隔離合成probe起動入口をbackend/src/testingへ移動した。旧src/scripts入口は現行ソースにない。元のprepare/execute引数、exact prepared proof digest、fresh tmp SQLite、XAI key注入、TLS検証、exclusive live-start、再送なし、候補非activation、V2/V3 run固定は保持する。実provider実行・prepare artifact更新は今回行っていない。

現行入口はbackend/src/testing/replay-semantic-migration.ts（V2 consumed run既定）とbackend/src/testing/replay-semantic-migration-v3.ts。古い記録のsrc/scriptsパスは当時の履歴であり改変しない。source snapshotは移動を含めて変わるため、古いprepare proofや有料実行承認を再使用しない。将来の実行は新しいexact scopeの準備・所有者判断が必要。

backend/src/testing/semantic-migration-probe-fixture.tsを元の2テストから参照する。fixtureの関数本体と元assertionを変えず、通常runtimeから歴史writerへの接続を除く。再帰検査の除外を増やして合格させる方式は取らない。
