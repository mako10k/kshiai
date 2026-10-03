# cc305 — V3対戦・切替の設計用ローカル調査

- 観測日: 2026-09-29
- ソース: `codex/cc304-focused-revise`、`05855274bb14a9a92a0e3aed614b829e213145d6`
- 範囲: ローカルのソース、canonical PERT、保存枝のADR。Stage/productionのDB、queue、配備状態は今回の観測対象外。

| 直接観測 | 一次資料 | 設計への含意 |
|---|---|---|
| createはユーザー・scope・キー・request hashから決定的IDを作り、保存応答を先に返す | `backend/src/routes.ts` 2527行以降 | 旧キーは同じIDに戻る。作成前の削除ID照合と、保存応答前の存在・認可が必要 |
| HTTP/SSE/actionのadvance入口が別に存在 | `backend/src/routes.ts` 2761、2852、2979行以降 | 同一advance use caseへ集約して再送の扱いを揃える |
| writeBattleはINSERT ON CONFLICT。revision/fenceの制約はUPDATE側 | `backend/src/repositories/battles.ts` 34–90行 | 削除済みIDに古いstateを保存した場合のINSERT分岐が残る。作成INSERTと進行UPDATEの分離を提案 |
| deleteBattleはbattle本体のDELETE | 同422行以降 | cascade外の関連データを切替transactionで扱う必要がある |
| narration attempts/events/outboxにbattle FKがない。provider/balanceも独立記録 | `backend/src/db.ts` 315–470、509–520行 | 実データ適用前に保持／削除を表単位で固定する |
| completed idempotencyはexpires_atを照合する前にreplayへ入る | `backend/src/services/distributed-guard.ts` 160–220行 | 期限だけで旧応答が無効になるという仮定は成立しない |
| 旧idempotency processing行にはabandon削除経路がある | 同261行以降 | HTTP行だけを再作成防止の唯一の根拠とする案には欠落の考慮が要る |
| 現行startBattleはV2 ready readerとcompilerInputsV2を使う。schemaVersion===3判定が各consumerに残る | `backend/src/services/battle-service.ts` 689、911、1037行以降と各consumer | 保存枝のV4型だけを持ち込むことで全consumer対応が完了するとはいえない |
| V4 character compiler/binding schemaはsharedに存在するが、完成したV4 Battle manifestは現行にない | `packages/shared/src/character-definition-v3.ts` 499–524行、shared全体の名前検索 | 新しいmanifestと全consumerの実経路試験が必要 |
| 試験importerはSQLite transactionで直接append/activateし、通常のcandidate reviewを通らない | `backend/src/repositories/local-v3-trial-characters.ts`、`character-assets-v2.ts` | vt101完了範囲を試験用登録へ訂正。R18残義務はvt109 |

以上はソースから観測した構造であり、Stageで実際に復活・削除事故が起きたという観測ではない。削除receiptとinsert/update分離は、この構造とR3の契約から選んだ設計案である。

## ADR番号衝突の正確な扱い

- 現行のAccepted ADR-0032: `docs/adr/0032-separate-authoring-time-boundaries.*`。
- 保存枝: `77ed6a01b9f6bea8d68702ab53839ef45ee78efd` の `docs/adr/0032-bind-v3-characters-to-versioned-battles.*`。そのAccepted `.think` SHA-256: `0436026338e7decb420232950eaaaf9c11d3195b9b7834ad2f9ec4fe9199c625`。
- 保存枝ADRのV4不変bindingとfull-consumer検証は継承候補。Decision 4は既存battleの非migration、ConsequencesはV2/dialogue-V3のunchanged continuationを規定する。ADR-0010は既存legacy manifestの保持と既存version-1 battleの可読性を規定する。これらの一次句自体はfinished/unfinishedを分けていない。後発のR3（切替前作成・切替時未完了）集合だけに物理削除を適用する限定差分を、新規ADR-0039へ明記する。
- authoring時間境界は別の判断として保持する。保存枝全体のmergeや、同番号の現行ファイルへの上書きは今回の作業内容に含めていない。

## 次の観測点

vt110でローカルDBの完全な削除前後比較と遅延処理試験を行う。vt104/vt108で実環境のexact release、対象件数、queue/worker停止状態、保持集合、snapshot復元と停止時間を確認する。Stage削除の実行は、これらの具体的な候補と別途権限を固定して行う。
