# 戦闘・キャラ更新・HTTP受付の境界テスト復旧

独立レビューは docs/evidence/boundary-probe-recovery-independent-review-2026-10-08.json。対象3 wholefileは元19ケース（HTTP1、キャラ更新14、戦闘4）。5ファイル共通診断の元22ケースはpass22/fail0/skip0、全workspace型検査exit0。対象bytesを照合して復旧する。元ケース・assertionを削除しない。

## 契約と観察

Accepted ADR0039/0040のHTTP閉鎖・owner認証・受付隔離・permit終結を検査する。trial局面はwrong key/不存在generationを拒否しbattle件数0を保つ負の検査。正常trial作成や旧試行完了を宣言しない。2026-10-06破棄対象はawareness-verifyの正式旧試行検証義務であり、実装・別計画を削除していない。

Accepted ADR0043のV2履歴閲覧・V3通常更新境界を検査する。通常V2変更・provider呼出し・旧候補activationを拒否し、保存row/attempt/generationが不変であること、bound旧profileがcurrent pointerと独立すること、V3候補の検証済みactivationを確認する。会計保存は旧定義を保持する。historical writerのruntime依存検査は元の再帰assertionを維持した。fixtureと合成probe入口をtestingへ移動し、元テストを緩めず違反を修正した。

Accepted ADR0039のimmutable V3世代束縛、Accepted ADR0051の新規awareness-v5と歴史V4継続、Accepted ADR0056の最新版出力契約を根拠に、pointer変更・reload・history continuation・free-action限定・durable repair reservationとunfinished phase非commitを検査する。旧V4はtest専用fixtureで作る。新規通常V4、戦闘数値係数の新規採用、実provider品質、公開配備/完走は対象外。

## Causeと保存

実際に呼ぶroutes、auth、DB、cutover control/admission/http、character storage/assets/generations/accounting/import、V3 controlled preparation、battle service/storage/narration、conscious generation/agency/guard、歴史fixture/offline providerを現在sourceで結ぶ。共通producerは一度登録し3テストで共有する。移動した2probe入口はtesting配置の現在sourceを保存するが、有料実行・旧approval再利用を許可しない。旧HEADを不変履歴として保持し、対象3つのinventory refをcurrent bytesに置換する。
