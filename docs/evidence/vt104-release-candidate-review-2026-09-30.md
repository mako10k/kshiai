# vt104：V3 Stage試行候補のレビュー資料

- 日付：2026-09-30。状態：候補固定・ローカル確認済み、所有者の候補選定とrelease承認は未取得。vt104は未完了。
- 依頼：「vt104 を実行」。目的は所有者がNeva対Rioの実Stage対戦を試すための候補選定。Stageで使用できる価値はまだ0で、今回の成果は候補の同一性・検証証拠・実行前の不足を判断可能にしたこと。
- 正本：[子PERT](../character-v3-stage-trial.pert) vt104、親csm001/cc314。上位は[切替要件revision 2](../character-v3-battle-cutover-requirements-v2.md)、[Accepted ADR-0039](../adr/0039-v3-battle-lifecycle-and-cutover.md)、[Accepted設計revision 2](../battle-lifecycle-boundary-design-v2.md)、[cc319所有者受入](cc319-owner-acceptance-2026-09-29.md)。releaseの規則は[release_process](../release_process.md)。

## 現在の審査と後続の境界

現在はローカル証拠、正確なコード・キャラクター候補、停止・回復手順、残るリスク、merge/releaseの別途判断を審査する。コードの選定はStage配備・データ削除・キャラクター登録の許可とは別である。例えばV2で新規対戦できない互換性変更は現在の判断対象、実際のStage battle IDと所有者のプレイ結果はvt107の証拠である。

vt105は承認された候補の実配備とidentity/health読戻し、vt108は正確なStage対象・snapshot・停止収束・物理削除・保持集合の読戻し、vt106は本物の所有者による二体の候補確認と登録、vt107は実プレイを担当する。実queueと所有者の停止上限30分は確認済みだが、停止control・snapshot復元手段・30分成立の事前検証は未達で、後続へ暗黙に免除しない。

## 固定した候補

既存worktree `/home/katsumata-m/.codex/worktrees/cc304-focused-revise-kshiai`、branch `codex/cc304-focused-revise`を再利用した。作業開始HEADは `fba69f387f058b17f2b49fcd07c61ae4ccc5d493`、資格情報経路を確認してfetchした後もremote同枝とahead/behind 0/0。origin/mainは `e31c487dadbe784022e5cfde80d3314ce45485b9`、対応PRは存在しない。vt103のdirty成果を保存して作業した。以下のruntime候補manifestを保持し、今回の資料とvt103成果を同じ枝のローカルWIPコミットに固定する。mainとremoteへのwriteは行わない。WIP commitはrelease commitではない。

候補版は **0.23.0**、将来の初回試行tag案は **v0.23.0-rc.1**。V3-onlyは互換性を変えるため、1.0未満のminor bump規則を適用した。四workspaceとlockfileの版、dated changelogをローカルで揃えた。remoteのv0.23 tagは照会時に存在しなかったが、namespace予約・tag作成は行っていない。

- 候補コードのGit tree：`308a31cecc24f08612a368c339b93a2442fb696a`
- ソース526ファイルのmanifest SHA-256：`45dde4ef7384b4ea8c6ec7700b37118616770c5db778c65ae1e3cce18597eab5`
- 全ファイルidentity：[source candidate JSON](vt104-source-candidate-2026-09-30.json)。treeはHEADに列挙された実行コード・設定・試験・CHANGELOGだけを重ねたローカルオブジェクト。最新のPERTやvt103/vt104資料は別証拠であり、treeに含まれる旧資料を現在の正本へ読み替えない。
- これはrelease commitではない。mainへの統合、exact commit上の四必須CIチェック、annotated tag、backend image digest、Worker version、Cloud Run revisionは未確定。版や停止controlを修正したらmanifestを更新し、その候補を再確認する。

HEAD以後のvt103差分は、plain-text V3編集候補レビューとexact baseline比較の修正、単体試験、Neva/Rioの実ブラウザ結合試験と専用config、test authority登録。vt104差分は版・changelogと本資料だけで、Stage workflowの動作を変更していない。main以後にはV3登録、対戦binding、参加資格、INSERT/UPDATE分離、cutover/会計、関連設計・証拠が含まれる。branch全体のCI/統合レビューをvt103だけで代用しない。Narration Fragment ADR-0038はProposedのままで、今回の候補選定はその採否を変更しない。

### NevaとRioの内容

[キャラクター候補の全フィールド・compiler出力](vt104-character-candidates-2026-09-30.json)を固定した。Nevaは「夜航の灯守・ネヴァ」、静かな観察者、危機では大胆、約束を守る灯籠の旅人。Rioは「潮騒の記録士・リオ」、変化を記録し、機を待ち、仲間の動きを読む記録士。表示プロフィールだけでなく、identity、外見、背景、人格傾向、話法、関係seed、combat、能力、inventory/loadout、expression、actionNorms、consciousGuidance、mechanicalConflictFallbacks、開示方針、publicPresentation、provenance、compilerCompatibility、deferredValuesが審査対象である。

| 元の固定候補 | definition digest | template envelope digest |
|---|---|---|
| Neva | `16f454b05b9139df9602bee95ba6c131af9f8fc8330446a61614fb9171bfcb18` | `50edf23389df253762378ba622537cff3d86722f613693b6a92796a7624d307f` |
| Rio | `cda72b7a82f392ce9f2e61b74a0d0eb0a0c09b9b509fed0edf5c07c9a61de5ce` | `a9ee9fda59bb0bdb1b8d77bbff300dac57ef372dfb41e1786e67691635c38252` |

vt103で途中編集に使ったpriority+1のg2候補は試験素材で、今回選定する内容に含めない。上記envelopeは固定templateであり、Stage登録済みgenerationではない。通常authoringはprovenance.attemptIdを新しいattemptへ付け替えるため、vt106でその実candidate全体のdigestを再提示し、所有者確認→immutable append/CAS→generation IDとcontentDigest読戻しを行う。ローカルのgeneration IDをStage IDと偽らず、登録前にStage generationを決めない。

## 確認済みの証拠と限界

[vt103統合証拠](vt103-local-integration-2026-09-30.md)では、実React UI・Hono HTTP・隔離SQLite・対戦engineを接続し、通常候補review/confirm→選択→Neva対Rio8turn完走→結果表示を確認した。途中編集・再読込、HTTP/SSE/action/state再送、不変binding、実況、unfinished削除後の不存在とfinished本文/履歴保持も確認した。providerはMock、所有者はsyntheticであり、本物の内容受入、実LLM品質、Cloud Tasksの稼働証拠ではない。

vt103のactive試験は19files/140cases成功、対象6cases成功、browser 1case成功、全workspace/deployment型検査成功。追加のstrict import graph probeは既存battle-serviceのundefined診断4件が残り不成功。この限界を通常typecheck成功と混同しない。vt104では候補0.23.0のbuildとrelease関連23testsが成功。frontendの500kB超chunk warningは残る。CIのvalidate/security/backend-image/workerは未取得で、ローカルbuildを四チェックの代わりにしない。

## 実行を妨げる事項と影響

**INSIDE：候補準備の未達とrelease判断の制約**

1. `stage-release.yml:74`と`promote-release.yml:48`はともに`kshiai-api`。Stageは同serviceのtag付き`--no-traffic` revisionであり、別serviceへの隔離証拠ではない。Stageのmigration `:195–214`は`kshiai-direct-url:latest`、smoke `:416/:451`は`kshiai-database-url:latest`、Supabase projectも固定。再認証後の観測では、100% trafficの`kshiai-api-00141-vis`と最新Stageの`kshiai-api-00144-hir`が同じ`DATABASE_URL` secret=`kshiai-database-url:latest`、同じqueue=`kshiai-narration`を参照する。DB secretのversionはENABLEDの1だけで、同一の接続設定を共有している。その後のREAD ONLY棚卸しで共有PostgreSQL17.6の186対戦（unfinished18/finished168）を確認した。削除対象をStageだけへ限定する保証はない。
2. Accepted設計の入口閉鎖・旧revision/worker収束・遅延配送のfence・provider会計確定・snapshot・物理削除・登録後開放を、既存workflowは実現しない。queueは`:150–156`でRUNNINGを要求し、`:291/:314`でtask投入する。`--no-traffic`は旧writer停止ではない。
3. 既存functional smokeは`persistent-battle-e2e.ts:737–765`→`e2e-observer.ts:253–279`のV2 fixture生成/再import→新規対戦を使い、V3-only条件と不一致。V3の通常登録・選択・対戦を観測する経路が必要。
4. Worker `:356–370`は既存`kshiai-web`のsubdomain preview設定を書き換える。preview uploadはproductionversion100%切替と別だが、共有設定writeの影響を承認対象から落とせない。
5. 2026-09-30に既存account `mako10k@mk10.org`でCloud Run describeとqueue describeを試みたが、両方とも`Reauthentication failed. cannot prompt during non-interactive execution.`で失敗。当時はtraffic、queue state/backlog、旧配送先等が未知だった。再認証失敗は解消済みで、現在の観測は次項に記す。認証失敗を「queue停止」「対象なし」の証拠としない。
6. 所有者の再認証連絡後、Cloud Run/queue/旧revision/移行job/secret version metadataの読み取りに成功した。[live metadata記録](vt104-live-metadata-2026-09-30.json)が現在の証拠であり、前項の認証失敗は過去の観測である。queueはRUNNING、上限100件のtask一覧は観測時点で空。これはwriter停止や以後の投入なしを保証しない。productionは`kshiai-api-00141-vis`へ100% traffic、tag=`stage-34201323064-1`。最新Stageは`kshiai-api-00144-hir`、tag=`stage-34832214571-1`。両者のtask targetは各自のtag URLで、古いrevisionが多数tag付きで残る。両者にMAINTENANCE/CUTOVER/GATE名のenv設定はない。移行jobは正確な既存名`kshiai-migrate`で、`kshiai-direct-url:latest`参照を確認した。このmetadata読取ではsecret payloadやDB内容を取得しなかった。その後credentialをRAM内だけで扱うTLS検証付きREAD ONLY transactionでDB identity、ID/count/state hashとmigration checksumを取得した。credentialやraw private stateは資料へ保存していない。停止上限30分は所有者の準備方針として確定したが、成立実測・Worker live state・snapshot復元は未確認。
7. Git treeはローカル候補で、正確なmain release commitと四CIチェックはまだない。既存workflowをそのままdispatchする案は推薦しない。タグ・merge・配備を実施せず、停止切替のcontrolと資源境界を確定して候補を更新する。

**OUTSIDE：後続で取得する実施証拠**

承認後のvt105配備identity/health、vt108直前snapshot・対象件数・削除/再送/finished保持readback、vt106実所有者のcandidate confirmとStage二体generation、vt107実プレイreceipt。事前手段の未確定を、この分類によって免除しない。

**BOUNDARY_DISPUTE：現在の争点**

現時点の仕様審査境界に新しい争点はない。Stageとproductionの接続設定/queue共有が観測されたため、所有者は共有productionの停止切替案と上限30分の準備を選択した。これは資源境界の準備方針であり、実行許可ではない。production全体の切替許可または別環境の新設許可を推測しない。別環境の新設が必要なら配備topologyの所有者判断/ADRへ戻す。

## 停止・切替・回復の候補手順

以下はAccepted設計を実行前の判定へ写した手順である。未実装の制御を実在するコマンドとして扱わず、実際のCLI/job、対象resource、snapshot identity、許容停止時間、operator、最大writesを固定した後にだけ実行可能となる。

1. 認証回復後、project=`kshiai`/region=`asia-northeast1`のservice traffic/tag/revision、database secret参照と実DB identity、queue/遅延配送先、Worker route/preview設定、active provider run、snapshot/restore手段を読取確認する。DB資格情報を資料へ出力しない。production共有なら、その利用者・資産を含む正確な停止/削除スコープを所有者へ示す。
2. code identity、main release commit、四CIチェック、backend digest、Worker version、Stage aliasを固定する。V3登録・対戦smokeを用意し、共有設定writeを含む最大作用と回復手順をレビューする。ownerが停止可能時間を決めるまで日時や停止予算を捏造しない。
3. vt105の別途配備許可下で、ゲーム入口とtask投入を閉じたまま候補を配備する。すべての旧writerとqueue配送を停止・収束させ、既送信provider要求の帰結/会計を確定する。入口閉鎖の正確な実装と観測条件は未確定。
4. vt108で回復snapshotを保存し、復元可能性を確認する。`planBattleCutover({cutoverId, cutoverAt})`のtargets ID/stateDigest、finished集合、関連counts、inventoryDigest/planDigestを固定する。unknown statusや対象の変化は停止条件。共有DBの暫定inventoryは取得済みだが、停止後の実行対象inventoryはまだ作っていない。
5. exact対象/停止/snapshotの別途データ操作許可を得た一人のexecutorが、`discardBattleCutover({plan,operatorId,stopped:true,recoverySnapshotIdentity})`を一回実行する。この関数のbooleanは実環境の停止確認を代行しない。対象不一致はtransaction rollback。同じcutoverの再実行は読戻しであり、曖昧な失敗を新cutoverとして再送しない。
6. 不存在、旧HTTP/stateキー、遅延worker、従属payload、finished保持集合と本文、世代/current pointer、会計を独立に読み戻す。vt106の二体を通常owner-reviewで登録し、そのexact generation/digestを確認する。削除と登録の両条件成立後、operator限定Stage受入を行う。公開再開はexact artifactのprotected production promotion承認・typed confirmation・公開smokeを追加条件にする。
7. vt107の実Neva対Rio完走を記録する。開放前の失敗は入口を閉じたまま原因を調べ、必要な回復候補を提示。開放後は新V3データを保持する前進復旧を基本とし、旧snapshotによる新規データ消去や単純旧version戻しを許可済みと扱わない。共有DBのrestoreは別途の正確な影響承認が必要。

## 選択肢・推奨・所有者の判断

所有者は「共有本番の停止切替案を準備」「上限30分の案を準備」を選択した。[共有本番の30分停止切替案](vt104-shared-production-cutover-proposal-2026-09-30.md)に暫定18対戦の影響、保持集合、停止control候補、回復の不足、Stage受入と本番promotionを含む時間配分・最大writesを記録した。現状では30分成立を証明していない。

元の選択肢は専用Stage DB/queue/jobへの隔離と共有production切替だった。隔離案は今回選択されていない。既存workflowのそのまま実行はV3-only smokeと停止controlの不一致があるため採用しない。

推奨する次の準備はsnapshot/restoreの隔離rehearsalとstartup/旧tag/dispatcher停止controlの検証である。実データsnapshot取得・本番復元、control実装の正確なfile set、外部writeは必要な対象・影響・許可を別途固定する。0.23.0コードと元のNeva/Rioの内容選定も未受入である。

停止日時、exact main commit/tag/artifacts、四CI、最終削除対象と最大writes、実測回復時間が揃った後に、merge/release・本番promotion・停止・データ操作の正確な候補を提示する。今の準備方針からこれらの実行を推測しない。

別途承認が必要な根拠はvt104正本descriptionの `obtain the separate approval needed for any merge or release write` と `Plan inclusion does not authorize push, merge, or release`、およびAccepted設計の停止切替条件である。実行依頼を所有者の内容acceptanceや外部write承認へ読み替えない。

## 残作業・測定・checkpoint

vt104の測定開始は13:44:30 JST。準備区間は終端にcanonical suspendで記録し、待ち時間をworkday stop/endへ変換しない。task未完了なので完了velocityへ追加しない。独立person effortは未測定で、経過時間から作らない。

vt103のelapsed一標本からobserve-velocityした25p/17hを子PERTは保持し、異なる配備control作業へ高確度で転用しない。子PERTの資源schedule残37/6p、換算約4.193 elapsed h、親残103/6p/既存velocity換算約4.204 elapsed hは参考で、agent工数や承認待ちを表さない。新しく確認したworkflow不足による追加作業量は所有者の資源境界判断後に正本PERTへ反映する候補であり、先にAccepted範囲を変更しない。

内部agent工数の暫定見積もり（低確度）：vt104残1–2.5時間＝control準備0.5–1.25＋回復手段準備/レビュー0.5–1.25。Stage試行cc314残3–7時間＝vt104＋後続control/smoke・配備/削除/登録/プレイ証拠2–4.5。親csm001残6–14時間＝Stage＋後続評価/移行準備3–7。これはagent概算であり、実績や受入済みdurationの上書きではない。所有者判断・外部待ち時間は未知で、全体完了日は未算出。

再認証・準備方針・30分上限の選択は解消済み。次checkpointは2026-09-30の候補レビュー後、回復手段とcontrol候補の準備範囲を確定する時点。vt104は未完了で、vt105以降の実行を開始していない。
