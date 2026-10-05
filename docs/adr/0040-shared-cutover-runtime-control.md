# ADR-0040: 同一release revisionを保つ共有本番の切替control

- Status: Accepted
- Revision: 1
- Date: 2026-09-30
- Decision owner: プロダクトオーナー
- Acceptance: [所有者受入記録](../evidence/vt104-control-owner-acceptance-2026-09-30.md)
- Authority: 所有者がrevision 1とlinked詳細候補を受入れ、local実装・隔離試験を許可。cloud/本番/remote操作は別途。
- Related: [Accepted ADR-0039 D3](0039-v3-battle-lifecycle-and-cutover.md)、[Accepted基本・詳細設計revision 2の切替](../battle-lifecycle-boundary-design-v2.md)、[release規則](../release_process.md)、vt104 / cc314 / csm001
- Reasoning: [CLI監査済み判断](../evidence/vt104-recovery-control-2026-09-30.think)

## Context

C1：所有者は共有本番の停止切替と上限30分の**準備**を選んだ。停止・migration・削除・promotionの実行許可は別である。[既存提案と決定記録](../evidence/vt104-shared-production-cutover-proposal-2026-09-30.md)がE1。

C2：Accepted設計は旧writerの収束、snapshot、unfinished削除、二体登録を経て開放する。release規則はStageの認証・DB・R2・SSE試験を経て、同じCloud Run revisionとWorker versionを本番promotionする。環境変数を変更して閉鎖から開放すると別revisionになり、未試験revisionのpromotionとなる。E2はrelease_processの「Build once and promote」とRelease flow 5–7、workflow `promote-release.yml`のexact revision検証と`--to-revisions`である。

C3：現indexはmiddlewareより前にpreset/style seedとtask dispatch/wakeを行う。routeだけの閉鎖では不足する。E3は[control調査・詳細候補](../cutover-runtime-control-design-proposed.md)。runtime controlの永続化・認可・遷移と外部503応答を定めるため、新しいADR候補にした。ADR-0039の既決の商品判断を変更しない。

## Decision drivers

- 新旧writerを区別して閉じ、provider実績とfinished・世代・新規V3データを保持する。
- Stageで検証したexact revision/artifactsを公開まで維持する。
- owner通常review/confirmと限定Stage smokeを、一般ユーザーの開放から区別する。
- gate確認とside effect開始の競合を防ぎ、障害・未知のcontrol状態で進行を許可しない。

## Considered options

1. **提案：DBにoperator所有の切替controlを持ち、同じruntimeでclosed / trial / openを遷移する。** revisionの作り直しを避けられるが、新schema・CAS・認可・競合の実装が必要。
2. 環境変数で閉鎖・開放する。単純だがrevisionが変わる。採用するならexact revisionのStage再受入と追加配備write/time、またはrelease規則を所有者の上位改訂へ戻す必要がある。黙って免除しない。
3. Workerだけで公開入口を閉じる。direct tag、startup、internal task、jobのwriteは閉じないので単独では採用しない。旧writer停止の補助としては使用可能。
4. 共有本番案を延期する。現productionを保持できる。所有者が選んだ準備を取り消す判断が必要であり、停止枠が成立しない場合の選択肢として残す。

## Decision

**候補はoption 1。未受入。** operator controlは対戦・asset正史から分け、immutable control revisionをappendしてactive pointerをCASする。cutover ID・artifact identities・旧writer閉鎖証拠・snapshot/plan identity・owner・二体のattempt/digest・trial request identity・provider上限・全release flow5（health/PG/email・Google認証/ownership/R2/SSE/direct保護）のStage受入receipt・promotion許可receiptを結び、遷移を監査可能にする。保存するのはID/hash/操作メタデータで、credentialやprofile本文を含めない。

- closed：一般APIのゲーム利用とprovider/dispatcherを拒否。healthと既存認証、指定ownerによるexact二authoring attempt ID/digestの通常character review/confirmだけを許す。確認は新generationのappend/CASを行うため、snapshot前の無write区間とは別のphaseにする。
- character以外のasset confirm、任意attempt、一般read/history/SSEもclosedでは許可しない案。readを維持する代案はowner判断でscopeを改訂する。
- trial：削除readbackと二体登録成立後、指定owner・固定generation・固定requestだけのV3 Stage smokeを許す。他owner・任意battle/asset操作は閉じたまま。providerの許可上限も実行packetで固定する。
- open：同じartifact/revisionのStage受入、別途protected production承認・typed confirmation・promotion読戻しが揃ってから一般利用を再開する。
- 不正なcontrol、artifact不一致、未知phase、制御読取失敗では拒否する。通常運転の未導入deploymentまで停止させる変更はしない。
- closedへの遷移は新規operationの予約を原子的に止め、既存operationを収束させる。closedは新規予約拒否の状態で、収束証拠stopped barrierとは分ける。送信前予約・送信中・結果/会計待ち・確定・unknownの詳細はlinked設計に固定する。gateの単純な一回読取を停止証拠にはしない。

trialも新しいV3対戦を作る最初のゲーム開放である。**trial開始後は旧snapshot全体への自動復元をしない。** 新V3データを保持する前進復旧を選ぶ。30分枠にはこの回復分岐も実測で含める。

## Consequences

### Positive

C4：同じrevisionの通常owner確認・限定Stage受入・本番promotionを可能にし、Accepted切替とrelease規則を同時に満たす候補となる。実装成功・30分成立は未証明。

### Negative and risks

control schema、認可、CAS、operation fenceが増える。全write入口の閉包を漏らすと停止中のwriteが残る。operator IDやtrial上限を誤ると意図外の操作を許す。queue pauseは投入を止めず、503だけでtaskを放置するとretry上限を消費する。trial後の回復はsnapshot復元より複雑で、30分の根拠がまだない。

Cloud Run manual scaling0はtag-only revisionを止めない。[公式仕様](https://docs.cloud.google.com/run/docs/configuring/services/manual-scaling)はこの例外を明示する。旧tagを全て閉じ、唯一の候補tagを作る構成は準備候補であり、実serviceでの効果は未試験。scaleを戻して旧traffic writerを再起動する操作はStage受入の代わりにしない。

## Compatibility and migration

追加control schemaはforward-only migration候補（番号は実装着手時に再確認）。旧unfinishedの削除predicate・minimal discard receipt・finished/世代/会計保持・V3-onlyは変更しない。ADR-0033のruntime Configをrun identityへ混ぜない方針も維持し、このcontrolは切替の正確性を担うfenceとして扱う。

閉鎖時の拒否は503 / `cutover_unavailable` / no-storeを提案する。拒否された新規commandはidempotency receiptを保存せず、既存receiptを返して処理を迂回しない。owner認可失敗は既存403/404方針を保つ。internal taskは既存認証の後にfenceで止め、成功ACKを捏造しない。retry/backlogを監視し、配送をpauseした上で扱う。これらの新外部動作も本ADRの所有者受入対象である。

## Verification

[詳細候補](../cutover-runtime-control-design-proposed.md)のsource/route閉包、startup/provider side effectゼロ、exact-owner confirm、trial key/世代/上限、遷移競合、全alias、queue再送、artifact一致、公開promotionを検証する。local成功だけでcloud停止や本番復元を証明しない。

[PG17隔離rehearsal](../evidence/vt104-pg17-rehearsal-result-2026-09-30.json)は合成データのdump/restoreとcutover保持を確認した。production snapshot取得、Supabase role/extension topology、実復元時間、30分成立は未検証。

## Review and owner decision

INSIDE：本候補のschema責務・遷移・認可・503契約・trial後回復を選択する。OUTSIDE：vt105/108の実cloud操作・本番snapshot/復元・削除・release/promotion許可。BOUNDARY_DISPUTE：上位で細部が未決のread閉鎖・asset-family例外・task503契約を本候補で明示的に提示し、owner受入を必要とする。release規則を変更するoption 2を選ぶなら、上位規則の改訂判断へ戻す。

所有者への判断は「option 1とlinked詳細候補を受入れ、指定file setのローカル実装・試験へ進む」または「option 2のStage再受入手順を具体化する」、または「共有本番案を延期する」。受入だけではcloud/resource/DB/remote writeを許可しない。

## Implementation references

実装なし。次のAction A1は所有者受入、A2はAccepted ADR→C1–C4→E1–E3を入力とするlocal実装、A3は別途exact execution packetの審査である。
