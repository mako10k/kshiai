# Seal運用の開始 — 2026-09-09

ユーザー指示「これからseal運用を始めましょう」に基づく今回の運用記録。
従来の破棄可能な補助グラフから、変更前の内容・Cause関係を保持する運用へ切り替える。
原資料のauthority、ADR受入手順、既存戦闘の契約、runtime動作は変更しない。
Sealは内容・根拠の記録であり、真実性やowner承認を保証しない。

## 保存先と初期範囲

現在の作業ツリー直下の `.sealgraph/` を保持する。他の作業ツリーで同じREFを
別途初期化して、同じ履歴と称さない。初期化前に継承可能な既存ストアは確認できなかった。
今回はローカル保存のみで、push・リモート同期は未実施。
同期時にはimmutable material、provenance、REF等の履歴を保持し、
キャッシュ・ローカルsource bindingと区別する。秘密情報や実戦のprivate payloadは登録しない。

[登録表v1](sealgraph-registration-v1.json)の16資料を登録する。
`adr/psyche-boundary` は変更前ADR-0004の論理REF。今回はこれを明示的な調査範囲の
rootとし、ADR-0002/0003等のさらに上流まで完全に登録したとは主張しない。
Causeは単なるリンク一覧ではなく、資料が依拠する意味上の関係を登録する。
ADRから詳細設計への参照と、詳細設計がADRの制約に従う依存を混同して循環を作らない。
TypeScriptファイルの登録は当該責務とコメントを追跡する粒度で、ファイル全体の
正当性や全依存関係を検証したという意味ではない。

## 変更時の手順

1. `sealgraph status` と `sealgraph source compare REF` で候補・元ファイル・HEADを確認。
2. 変更する正確なSealに対し `sealgraph impact --all-paths SELECTOR --format json` を実行。
   結果は変更前の影響候補であり、将来のStale一覧と同一ではない。
3. 原資料を承認手順に従って訂正。新ADRによるsupersedeでは旧ADR本文の理由を改竄しない。
4. 原資料の新しいbytesを候補へ反映し、候補差分・Causeを確認して、そのREFだけsealする。
   論理REFの継続と新旧Sealのrevision assertionは別物。単なるファイル名変更や
   `mv`だけでは新旧revision関係は記録されない。
5. 継承時は元Sealを保存し、確認したobserverのCause Linkに新targetと
   `--previous @OLD_SEAL` を明示する。assertionの適用scopeを記録する。
   新しいADRファイルへsource bindingを変える場合も、元pathを指定してreadbackする。
6. `sealgraph stale --frontier --scan --format json` で要確認の入口を確認する。
   各資料を読み、要訂正／文面は不変だが根拠を確認／未確認に分類する。
   下流の自動一括relink/resealは禁止。確認した資料だけ、新しい根拠を明記してsealする。
7. `sealgraph stale --scan --format json` と `sealgraph fsck --format json` でreadbackする。
   未確認項目は残し、ゼロ件にするために根拠を付け替えない。

Staleがない場合でも、未登録資料、未登録Cause、未反映workfile、revision assertionの
未登録・scope不足は検出できない。登録表とテキスト検索を照合してcoverageを補う。
壊れた、または見つからないストアを自動初期化して履歴を置き換えない。

## 今回の境界

まず16資料の変更前基点を作りimpactを記録する。ADR-0004のsupersede・新ADRの
版を指定した受入・下流訂正は、その結果に基づく次の作業。未承認の設計草案は
未承認のままSealする。今回の登録は過去にSealしていたという主張ではない。

CLI LLMThink監査: `kshiai-seal-bootstrap-2026-09-09`、fatal/error/warning=0。

## 初期登録の実測結果

[変更前impact・整合性確認](evidence/sealgraph-psyche-baseline-2026-09-09.json):
16 REF／16 Seal、ADR-0004からの下流15 REF、pathsの打切りなし。
全16 sourceがHEADと一致、staleは0、fsckはok。
ADR-0004の基点Sealは
`5a65ee9aeb1c0b082985e0e320521d014a7211ff0f4d8e50da4ebc8e10e56957`。
これは変更前の状態であり、ADR訂正後の確認完了や意味整合性を証明しない。

## ADR-0027承認後の継承（2026-09-09）

上記の「今回の境界」は初期登録時の履歴。ownerはADR-0027 revision 1を承認した。
現在の登録範囲は[登録表v2](sealgraph-registration-v2.json)を用いる。
`adr/psyche-boundary`のsourceを旧0004から正本0027へrebindし、論理REFを継続した。
`proposal/adr-0027`は`adr/0027`へ移し、同じ承認済み正本を指す。
旧Sealは削除せず、Superseded表記の0004は`archive/adr-0004`として保存する。

後継はこの調査範囲のrootであり、継承した旧ADRの節と旧Sealを原資料で指定する。
新rootのCauseとして旧rootを残して自己Staleにするのではなく、下流のreview済み
observerに新targetと旧Sealのrevision assertionを記録する。旧proposalの確定関係も
0027投影のobserverに記録した。REF移動だけでrevision継承済みとは扱わない。

各対象では新targetのCauseを先に追加し、旧targetのCauseをunlinkしてから候補を確認する。
唯一のCauseを先にunlinkするとnon-root候補の契約に反するためCLIが拒否する。
`add --target`は他のCauseを消さないので、旧targetが残っていないか必ず確認する。
実装ファイルのresealは旧契約の存続と要移行箇所の確認であり、新設計の実装完了ではない。

変更直後のStaleは[15件の記録](evidence/adr-0027-stale-before-reseal-2026-09-09.json)を保持する。
訂正7件と互換維持8件の根拠は既存の全件レビューに対応する。
新たに見つかったpromptとmockも登録対象に加える。実装影響の詳細は
[実装影響調査](evidence/adr-0027-implementation-impact-2026-09-09.md)を参照。
保存は引き続きこの作業ツリーのローカルのみで、remote同期済みとは扱わない。

## 修正計画の影響拡張（2026-09-09）

現在の一覧は[登録表v3](sealgraph-registration-v3.json)。v1/v2は歴史として保持する。
目標投影・既定目的・契約世代・decoder・保存・operation分類・非公開除去・replayの
追加8実装ファイルを静的調査の範囲で登録した。実payloadの確認や新設計適合を保証しない。
[修正計画](character-agency-implementation-plan-v1.md)はAccepted責務と実装Sealを根拠とし、
責務設計資料と実行PERTはこの詳細化を参照する。計画と設計の循環Causeは作らない。
設計資料の変更前impactはbacklogとPERTの2件。新旧revisionを下流observerへ記録し、
各文書の適合性を確認してresealする。t026のfixture作業を完了扱いにしない。

## Gitへの保存境界

2026-09-09のcommit指示により、format 5のconfig、objects、refsのみをGitへ保存する。
index（候補・source binding）、cache、logs、locks、tmpはローカル専用として除外する。
元のローカルデータは削除しない。別checkoutでは登録表v3以降のpathからsourceを
明示的にbindし直す。正本オブジェクトを再生成して旧履歴に代えない。
これはローカルcommitであり、push・remote同期・実装承認ではない。

## CA-00実測と要件候補（2026-09-09）

0754ca7のcommit後、登録表は[revision 4](sealgraph-registration-v4.json)へ更新。
型付きfixture/test、CA-00結果、未承認要件候補、正確なdigestのレビュー入力を追加した。
変更前impactで計画の下流は責務設計・backlog・PERTの3件。各本文を確認し、
CA-00完了と未承認契約を分け、専用発話履歴の欠如と直前発話の知覚を区別して更新した。
残っていた旧進捗文も訂正し、確認済み依存だけに新旧revisionを記録した。
候補のSealは内容固定であり、requirement lifecycleの受入ではない。
要件候補の初回owner経路は未選択。追加の契約ADR、runtime変更、課金、pushは未実施。

## 要件承認とADR-0028具体案（2026-09-09）

上記はCA-00直後の履歴。現在は独立要件レビュー後にrevision 1をowner承認済み。
原本bytesと旧Sealを維持し、レビューと承認記録を別REFとして登録した。
現行一覧は[登録表v5](sealgraph-registration-v5.json)。ADR-0028の正本と投影はProposedとしてSeal。
依存する実装計画・設計・backlog・PERTを個別確認し、新旧Causeを記録してresealした。
詳細な結果と検証限界は[今回の検証記録](evidence/agency-contract-detail-verification-2026-09-09.md)を参照。
全41参照で原本一致、stale 0、fsck正常。既存ADRの受入やSupersede状態は変更していない。
補助検証ログと登録表自体を自己参照のSealへ組み込まない。新契約実装とremote同期は未実施。

## 目標判断基準の訂正（2026-09-09）

現在の一覧は[登録表v6](sealgraph-registration-v6.json)。owner指示に基づき作者確認優先を撤回。
訂正記録、要件revision 2候補、同レビュー入力を追加し、Proposed ADR-0028をrevision 2へ訂正した。
旧要件・レビュー・受入のbytesは保持するが、訂正されたR1を現行の実装authorityにしない。
新ADRと計画のCauseを要件v2へ接続し、旧承認の無条件な継承をやめた。
変更前impactの下流6参照を個別確認してreseal。44参照で原本一致、Stale 0、fsck正常。
[readback](evidence/agency-goal-correction-readback-2026-09-09.json)に正確な新旧Sealと検証限界を保存。
新要件／ADRは未承認、runtime変更・commit/pushは未実施。
