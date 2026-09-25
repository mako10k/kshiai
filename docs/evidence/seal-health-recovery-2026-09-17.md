# SealGraph全体の健全化 — 2026-09-17

状態: 作業中。全体健全化は未完了。

## 最新の再開位置: M1下流consumer照合

2026-09-18 のREF用途分類は [差分記録](seal-health-disposition-2026-09-18.md) に続けた。09-17の415件台帳は当時のsnapshotとして保持し、現在の全件完了とは扱わない。選別器の合成テストと実inventoryの根拠を分離した。V3 reader投影に続き、旧V3 schema Sealのsource不一致とchange-setの古いCauseは限定レビュー・改訂Sealで解消し、それぞれの旧Sealは履歴として保持した。さらにV2移行の初期source ledger・adapter migrate部分・typed character contractだけを別目的で限定Sealした。adapter全体のrevise/deferral/progress適合と旧portのbounded recovery適合はHOLD。本人承認したADR-0007の原文不変rootを公開し、source一致・非draft・非staleを確認した。V3定義全体の意味適合や移行主経路の完了は未確認。

2026-09-18 の続行結果は [cs316 実装・テストの由来照合](cs316-implementation-test-seal-reconciliation-2026-09-18.md)。timeout周辺の保存層・scripted portとテスト2件を現行の非draft根拠に結び付け、characterとconformanceのテスト2件はdraftとして登録した。その後、V3 schema と旧change-setの限定テスト2件を別目的の非draft検証REFに結び付けた。現在のinventory選別はactive 9/provisional 3/disabled 144。cs316全体とcc304は未完了のまま。以下の「最新」は以前の段階の記録として保持する。

最新の続行結果は [実行制御・adapter・関連テストの照合記録](seal-health-execution-consumers-2026-09-17.md)。kernel/orchestrationの限定source適合と、共通基盤テスト2件をLuna照合後にcurrent登録した。inventory2mappingとselector検証の根拠も更新。アプリ・テスト本文は変更せず、45件と選別器9件が成功。正式選別はactive5/provisional1/disabled150。

現行適合へ昇格しないものも特定した。通信portのtimeout→resource_exhausted分類はdesign7.2と不一致。キャラadapterのdeferral記録等は未完了で、型契約が参照するV3 schemaはsource不一致、change-setはstale。保留事項は上記記録に観測・未確認を分けて記載した。これらのコード・期待値は修正していない。M1全体は未完了、cc304はsuspended、ADR-0007 rootは未公開。通常の根拠照合は継続範囲だが、コード修正や新rootは今回の実行範囲外。

以下の13件と件数は、今回の追加6件より前の修復段階の記録。

所有者が確認したM1の範囲で、[下流consumer照合記録](seal-health-consumer-recovery-2026-09-17.md) に結果を追加した。ADR-0036、テスト選別器・対応表・選別器自身の検証、revision10計画記録・現行PERTの6件を個別Lunaレビュー後に公開。現行計画REFは `plan/character-semantic-migration-current`。旧plan REFは歴史として保持し、過去done/reachedやdraftテストを再認定していない。

続けてpure kernelのcontracts/accounting/proposal-decoder/progress-monitor/run-state/capability-session/scripted-portsの7件を個別Luna照合後に登録。今回合計13件登録後fsckはok（933 Seals、411 HEAD REFs）。原文・コードは不変。旧draft REFは保持する。

ハーネス9テスト成功。選別実測はunit156件のうちactive3/provisional1/disabled152で、増えた正式対象はハーネス自身の1ファイルだけ。cc304のfocused testはstaleのまま。全REFの意味分類とアプリ実装・検証の照合は未完了。[用途別一覧](seal-health-disposition-2026-09-17.json) は未確認を明示する作業台帳で、全体のadmission証明ではない。次の実作業は残るorchestration/adapterと検証の現行根拠照合であり、cc304の実装再開ではない。

追加root候補は既存Accepted ADR-0007の原文不変登録。[全文日本語訳付き本人レビュー資料](adr-0007-seal-root-review-ja-2026-09-17.md) と未公開Candidateを用意した。本人承認前に公開しない。provider-jsonテストの実装coverageと一部期待値の上位適合は別の未完了事項であり、rootだけでadmitしない。cc304実装再開、アプリコード変更、provider実行、commit/push、配備は行っていない。

以下は以前の修復経過を保持した記録であり、各節の「次」はその記録時点を指す。

## 作業の区切り（2026-09-17更新）

オーナーはADR-0006 rootを承認し、「切れ目が細かすぎるので、もう少し大きい目標で一気に進めたい」と指示した。全Seal健全化という対象は維持し、通常の非root修復のたびにユーザー確認を求めない。個別Lunaレビューを内部で継続し、結果は根拠チェーン単位でまとめる。次の区切りは、移行・構造化基盤が依拠するADRの根拠チェーン修復。新rootの本人レビュー条件は維持し、追加rootが見つかった場合は候補を集約する。仕様変更、実装、移行実行、commit、push、deployの権限は追加しない。

ADR-0006公開readback: `acceptance/adr-0006-existing-baseline`、Seal `78f9fec1b418020c221d67930654a6ead967fb85393603a544651cea83a61371`、非draft・非stale、Candidateなし、source一致。下記の候補準備記録は経過として保持。

### 今回のまとまり: ADRから受入済み実装設計まで

以下は本文を変更せず、各文書のLunaレビュー後に登録した根拠チェーン。0031は現行決定ではなく、0032が明示継承する固定履歴。その他も、Sealによって元の受入範囲や実行認可を拡大しない。

| REF | Seal | 直接Cause・適用範囲 |
| --- | --- | --- |
| `acceptance/adr-0006-existing-baseline` | `78f9fec1b418020c221d67930654a6ead967fb85393603a544651cea83a61371` | オーナー承認済みroot。既存耐久wake契約 |
| `acceptance/adr-0014-current` | `7e4349a9d219cac18bbb4723824fa1e5249282dd5534675730d0ed7e5ecd46aa` | ADR-0010/0011/0006。queued authoringとowner review |
| `acceptance/adr-0024-current` | `d11da35e926e202d6841f3cc7e29620d23370ba40b0e10cf005de86d2b58bd8f` | ADR-0014/0006。pure reads、耐久wake、owner fence |
| `acceptance/adr-0031-inherited-history` | `63499128ab704e86f169d3ca42fd561e1e2ca95d77ffcfe0dc44f01b88ce3b50` | 基盤v3、キャラv5、ADR-0030/0010/0011/0014/0024/0027/0028。Superseded履歴 |
| `acceptance/adr-0032-current` | `996c4d1144c9bdac462d595a9baf46e8ed29548e8044b0131e67ad940bc6b66b` | 上記0031固定履歴。時間意味を置換し残りを継承 |
| `acceptance/adr-0033-current` | `52ac744769e34ae6b7998d4bfc40fed48543f3aa9b51192a8dd51175aec23972` | 基盤v3、0032。runtime Configとdurable factsの区分 |
| `acceptance/adr-0035-current` | `137fb216bdd17be1b005ed6ec66c949dceed3b262a93daedc66a512128db5a1a` | キャラv5、基盤v3、0032。自然文からのscope推定と初回試行境界 |
| `reasoning/structured-semantic-authoring-kernel-design-v1-current` | `f9003877b68c1edbe0294442d9fef11fb6514eaeb34f357d26131b77232ca8bb` | 基盤v3、キャラv5、0032/0033。Accepted rev6 reasoning |
| `design/structured-semantic-authoring-kernel-v1-current` | `9664f17a979e36b650a466d62ba17e62a9e8962cdc36a123d67857f7f9702bf1` | 上記reasoning。Accepted rev6詳細設計 |

旧 `acceptance/adr-0031/0032/0033/0035`、旧design/reasoning REFは変更していない。古いREFを参照する計画・実装・検証・テストは、この登録だけでは現行根拠へ移らない。上表は後続の個別照合に使う対応表であり、自動承認や一括置換の指示ではない。過去のreview/verificationも元のsnapshotに対する証拠のまま保持する。

運用者が今使える増分は、キュー実行から基盤設計までの現行根拠を、旧workflowに依拠せず辿れること。アプリ利用者の移行機能の増分は0。残るまとまりは、計画・実装・テストの主張をこの根拠と照合し、現行利用と履歴を区別して修復すること。費用は不明、全体完了時期も未確定。

### まとまりの検証結果

独立Luna最終readbackは上記9REFすべてPASS。期待ID・原文bytes・事前レビューのCause対応が一致し、非draft・非stale・候補なし。fsckはok、920 Seals/401 REFs。`git diff --check` 成功。全体ADR検査は、今回変更していないADR-0015/0016/0017/0019の形式・受入記録チェックでexit 1。対象のthink監査とstatus projectionは通過。詳しい観測と限界は [独立レビュー記録](seal-health-independent-review-2026-09-17.md) に記載した。検査エラーを根拠に既存Acceptedの意味を書き換えていない。

再開点は上表を上位根拠として、現行consumerである計画・実装・テストの根拠対応を確認すること。追加の通常修復許可は不要。新rootや仕様判断が必要になった場合のみ本人判断対象をまとめる。今回commit/pushは実施していない。

全REF最終観測: HEAD401、Candidate0、draft150、stale239（direct/transitiveを含む）、bindingなし0、source本文不一致30。今回の9登録で旧REFを改変していないため、draft/stale件数は減っていない。旧記録の履歴分類と現行consumer修復は未完了であり、件数を隠したり全体完了と扱ったりしない。

## 目的と対象

オーナー指示「まずは、Sealをすべて健全化しましょう」に基づき、現在の作業ツリーにあるSealGraph全体を対象とする。V2キャラクタをV3へ移行して試すために、文書・設計・実装・テストが依拠する根拠を再び追跡できる状態にする。

対象は389件の現行REFと、その参照先として保存された908件のSeal。全REFの初期状態は [JSON一覧](seal-health-inventory-2026-09-17.json) に記録した。この一覧は構造観測であり、意味上の承認やテストadmissionではない。

## 初期観測

| 項目 | 件数・結果 |
| --- | --- |
| 現行REF | 389 |
| draft | 150 |
| stale | 239 |
| source bindingなし | 17 |
| binding先の現在本文とSealが不一致 | 26 |
| 未Seal Candidate | 0 |
| fsck | ok、参照されないblob 0 |

各件数には重複がある。staleは再確認の必要性を示す。本文不一致には作業中の変更と歴史的snapshotの両方が含まれ得る。bindingなしだけでは、元来ファイルを持たない証拠の欠陥と判定しない。

## 完了判定

- すべてのREFについて、現行利用・歴史的記録・未受入提案のどれとして扱うかを一次資料と現行consumerから確認する。
- 現行利用する主張には、必要な上位根拠への正しいCauseと、現行本文の対応を確認する。構造上cleanでも、意味上の根拠確認は別途必要。
- 過去のSealと当時の有効範囲を保持する。歴史的draft/staleを機械的に消去しない。
- 未受入提案は未受入のまま識別する。現行consumerがそれをAccepted根拠として使っていないかを確認する。
- 上流から各件をLunaレビューし、既存承認の範囲で修復する。新rootの判断はオーナーレビュー対象として具体化する。
- テストは、期待値と現行上位根拠の意味対応を確認してから有効根拠として扱う。

## 現在の進捗

全389件の構造一覧と保存整合性を確認した。以前の旧workflow影響115件に限定せず、残りのREFも対象に含めた。

共通基盤v3の現行根拠は既存の `requirement/structured-semantic-foundation-v3-accepted-snapshot`。

### 完了した局所修復

1. source bindingの欠落17件を復元した。13件はSeal本文とファイルのSHA-256完全一致、残り4件は元の `add --content-file` 実行記録からパスを復元した。全件readback済み。4件の本文不一致は未解決として可視化し、Seal本文を上書きしていない。[対応表](seal-health-source-matches-2026-09-17.json) は新しいcheckoutでの再確認にも使う。binding自体はローカルmetadataでGit同期されない。
2. キャラクタ要件v5の現行根拠を修復した。Lunaが構成と、旧workflow全文supersede・基盤v3・保全されたV2/ADR制約との限定意味適合をレビューし、具体的矛盾なしとした。既存Accepted本文は変更していない。

| 新REF | Seal | 根拠 |
| --- | --- | --- |
| `acceptance/character-v3-authoring-v5-current` | `d4827ddffae7ca5d6680c5fa0eb062295ed2f1be377e639f215eda930179c7fd` | 基盤v3 snapshot、Accepted V2互換要件v6、Accepted ADR-0030 |
| `requirement/character-v3-authoring-v5-accepted-snapshot` | `3942057ff54a50c9ba7330f8069242d637aa62302b067be0d9796198f1932f01` | 上記の現行受入記録 |

両REFは非root・非draft・非stale、source一致。Lunaの作成後readbackも一致した。受入記録sourceは `docs/character-v3-authoring-requirements-v5-acceptance.md`、要件sourceは `docs/character-v3-authoring-requirements-v5.md`。新rootや新しい製品仕様の承認は追加していない。旧draft REFは当時の履歴として保持する。

次の個別確認はADR-0032と、それが明示継承するADR-0031の固定された決定内容。全239件のstaleや未確認のsource不一致の解消を意味しない。

### オーナー承認済みのADR-0010 root

ADR-0032の継承根拠を追い、既存Accepted ADR-0010に対応Sealがないことを確認した。原文を変更せず、`acceptance/adr-0010-existing-baseline` にroot Candidateを作成。予定Sealは `c18419afb42060d887b3f7f86970b45312cb77a7665dfbc7398a697e3e3d7ad5`。未Sealであり現行Causeには使用しない。[全文日本語訳付きレビュー資料](adr-0010-seal-root-review-ja-2026-09-17.md) が今回のレビュー対象。

上記は提示時の状態。2026-09-17、オーナーがこの候補に「承認します。」と回答した後、提示時と同じ原文・予定Sealを再確認して公開した。公開後は非draft・非stale、Candidateなし、source本文一致。新rootを個人レビュー後に公開する条件を満たした。本文・仕様・実装は変更していない。

現在点: ADR-0010の公開完了。ADR-0014/0024など未登録の上流、ADR-0032/0033/0035、kernel設計、計画、実装、検証の依存関係を各件確認する。ここに示す順序は新たな製品意味や下流の自動昇格を認可しない。独立レビューの所見と主担当の指摘処理は [レビュー記録](seal-health-independent-review-2026-09-17.md) に記載した。

ADR-0010公開後readback: 現行HEAD392、Seals911、fsck ok、binding欠落0、draft150、stale239、source本文不一致30、未Seal Candidateなし。不一致が26から30へ増えたのは、binding復元で既存4件の差分が見えるようになったためであり、その本文は変更していない。staleはselfだけでなくdirect/transitiveを含む239件。stale/draftの歴史的記録と現行consumerの区別・修復は引き続き必要。

### 次のrootレビュー: ADR-0006

ADR-0014の個別Lunaレビューで、ADR-0010/0011に加え、耐久wake・専用fenceの根拠である既存Accepted ADR-0006のSeal欠落を確認した。ADR-0014/0024は未登録のまま保持。ADR-0006を原文不変rootとして登録する構成を別途Lunaがレビューし、PASS（オーナーレビュー用）。`acceptance/adr-0006-existing-baseline` の未Seal Candidateを作成した。予定Seal `78f9fec1b418020c221d67930654a6ead967fb85393603a544651cea83a61371`。本文・仕様・実装の変更なし。

具体的なレビュー対象は [ADR-0006全文日本語訳付き資料](adr-0006-seal-root-review-ja-2026-09-17.md)。承認後の再開点は、この候補と原文の一致を再確認して公開し、ADR-0014の必要Causeを揃えた非root登録を個別レビューすること。ADR-0005の歴史や旧workflowを現行権威に復活させない。root登録の個人レビュー条件以外の追加許可は求めない。

追加Luna起動はセッションのthread limitに達したため、進行中のLunaに全体分類後の個別レビューを引き継いだ。レビュー実行不能を理由に、主担当のみの判断で昇格することはしない。

現時点でこの作業によるアプリケーションの利用可能機能の増分はない。全体健全化後も、移行実装・検証・実行の残工程がある。完了時期と実利用までの所要時間は未確定。
