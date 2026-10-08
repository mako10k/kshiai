# 全テスト封印の引き継ぎ — 2026-10-07 21:00 JST

ユーザー指示により本日の作業を中断。全テスト封印・合格のゴールはpaused。worktimectlは終了していない。共有の作業時間はこの引き継ぎでstop/endしない。

## 再開位置と保存範囲

- 作業場所: `/home/katsumata-m/.codex/worktrees/cc304-focused-revise-kshiai`
- branch: `codex/rc17-release-evidence`
- HEAD: `d7fe6df1287ee834fcdd9e9c3e0069b3f32b3696`
- 多数の既存WIPと今回の修正・SealGraph更新をローカルに保持。コミット、push、merge、公開反映はしていない。remote SHAは今回照合していない。
- main `/home/katsumata-m/kshiai`へ変更を移さず、reset/clean/一括stageを行わない。
- Node22: `/home/katsumata-m/.nvm/versions/node/v22.22.3/bin`。既定Node25ではSQLite診断が不適合。

## 完了した今回分

1. ADR0039の既存owner承認の受領記録だけを追記。採用済み本文・規則・権限は変更していない。115 REFを上流順に通常Sealし、対象外952 HEADと据え置き8 HEADを保持。更新前に観測された旧Seal1,405件の保持、正確なCause/previous/messages、本文一致を確認。旧試行の再開権限は追加していない。
2. 名前照合と設定解析の2ファイル・原7ケースを封印。helper/parserのみで、保存・再生成の全経路やcandidate有効化/Stage実行許可の証拠とはしない。
3. 画像Providerでnumeric URLがsourceUrl:stringへ漏れることを注入fetchで再現。JSONの型アサーションを除き、pure `backend/src/image/image-response.ts`でunknownからrecord/array/stringを検証。原2ケースの完全prefixを保持し、3回帰ケースを追加。全5pass、独立レビュー、全workspace typecheck、通常Seal/readback/fsck合格。quota休止、実Provider互換性、画像品質・保存成功は証明しない。

最新checkpoint: `docs/evidence/all-test-seal-checkpoint-2026-10-07.json`。
unitは247、E2Eは4、計251の対象を維持。最新unit分類はactive175/provisional1/disabled71（うちunsealed61）。正式npm testは未封印61を理由にテスト実行前停止、exit1。全体合格・全goal完了ではない。

主要証拠:
- `docs/evidence/adr0039-receipt-propagation-readback-2026-10-07.json`
- `docs/evidence/names-config-seal-readback-2026-10-07.json`
- `docs/evidence/image-provider-boundary-seal-readback-2026-10-07.json`
- `docs/evidence/image-provider-original-case-preservation-2026-10-07.json`
- `docs/evidence/image-response-repaired-workspace-types-2026-10-07.log`
- `docs/evidence/all-test-gate-after-image-provider-boundary-seal-2026-10-07.log`

## 明日の最初の候補 — 未封印の画像保存2ファイル

`backend/src/services/r2-storage.test.ts` 原3ケースと `image-service.test.ts` 原4ケースを全体レビュー済み。最新診断7pass/0fail/0skip。独立レビューはhelper・mock/local限定でwhole-file seal可。

- R2 case3の題名だけを、private S3アクセス実証という過剰表現からPutObject command/共有URLの観測内容へ変更。ケース/assertionは完全に保持。実装の変更はしていない。
- `image-service.ts`の既存kindキャプチャのassertionは、レビュー対象の最終payload出力への未検証castではないとのレビュー。型逃げを広げていない。今後ここを修正する場合は適用AGENTSの制約を守る。
- 規範はNFR-11/F-BF-08、F-CHR-10、Accepted0011のappearance-only compiler ceiling、Accepted0010、通常V2画像writerを除外するAccepted0043。V2 sheetはhelper互換性/失敗fixtureのみ。現在V3 routeはprojected image briefを渡す。
- R2キー/URL/ID guard、注入writerのBucket/ContentType/URL、外見prompt・秘密情報除外、local revision URL、注入provider失敗のみ。アクセス制御、実R2/S3、共有read、永続性、DB activation原子性は未検証。
- 未登録・未封印。writerはまだ作成/実行していない。まず資料・source hashes・診断・reviewを再照合し、Accepted根拠→設計→実装→全testのリンクをレビューしてから通常Sealする。

候補資料:
- `docs/image-storage-test-contract-review-2026-10-07.md`
- `docs/evidence/image-storage-independent-review-2026-10-07.json`
- `docs/evidence/image-storage-original-case-preservation-2026-10-07.json`
- `docs/evidence/image-storage-cohort-preseal-2026-10-07.tap`
- `docs/evidence/image-storage-seal-reasoning-2026-10-07.think` / audit JSON: fatal/error/warning0

`image-archive.test.ts`は先頭caseが実サービスを呼ばずfs.copyFileだけを実行している。合格だけで封印せず、実接続を確認する試験へ修正する。既存mediadataへ書き込まず、実装を検証できるprivate fixture/seamを準備する。

## 未解決の制約

- Proposed ADR0059（完全focused profile、one-run10回上限等）は未採用。checkpointの正確なrevision/hashを確認し、採用前に依存実装へ適用しない。
- quota1h休止とLLM role別terminal/fallback、visibility tier、rating/balance/改善値など、個別の規範不足・契約矛盾は推測で埋めない。
- scene-beat旧later-bucket caseは新V5作成経路で生成されない。assertionを削除せず、Acceptedに従うimmutable V4 continuation/pure seamで検証する設計が必要。
- source-diverged/stale/draftの既存testは残っている。unsealedだけゼロにして全体合格とはしない。E2E4も含む本来の目標を保持する。
- 旧切替試行は破棄済みで、再開しない。rootreceipt更新で保留試行やlive権限が復活したとは扱わない。

## statusと作業効率の実測

20:57前後の1,079 REF: stale251/draft166/source差分41（差分39・source missing2）。重複を除く注意状態322。candidate残存0。未束縛NO_SOURCE435はそれだけで異常とはしない。
`docs/evidence/sealgraph-current-state-summary-2026-10-07.json`に集計。

これには過去版・旧試行も混在する。ユーザーの質問はstatusへの懸念と残時間の質問で、全REFの清掃・削除・権限再採用を認可したものではない。現行251テストと必要根拠のclosureを優先する。

- ADR0039 receiptの112件再開writerは2,694秒（44.9分）。115件の最初の3件は別の初回attemptで完了。
- 非rootで唯一のCauseをunlinkしてからreplacementをlinkすると中間状態で拒否。新link→旧unlinkにし、成功済みHEADとinflight candidateを再確認して再開した。
- graphは現在観測するreachabilityで、全retention inventoryではない。旧leaf52件はgraphから外れても正確な@ID showで読み出し・元内容一致を確認した。
- 現repo形式でformat7専用dumpは拒否された。migrate/形式変更をしていない。
- 全体ゲートは多数のCLI source compare/showを同時起動するためCPUと待ち時間が増える。効率改善を試す権限はあるが、選択・停止契約や診断範囲を弱めない。ライブの同一handleを追い、timeoutだけでwriterを再起動しない。

全体残見積6〜10作業時間は粗い。未決契約のowner判断とstatus全件清掃は含めた確約ではなく、全体終了時刻は未確定。

## 再開用の入力

「`docs/all-test-seal-handoff-2026-10-07.md`から再開。worktimectlとWIPを確認し、全251ファイルと原ケース/assertionを保持。画像保存2ファイルの未封印候補を再照合して進める。未封印を除外して正式テストを合格扱いにしない。」

実行中の検証・Seal writerは残っていない。独立レビューagentも完了を確認。/tmpの補助スクリプトを唯一の根拠にせず、repo内の証拠と現在のCLI stateを再確認する。
