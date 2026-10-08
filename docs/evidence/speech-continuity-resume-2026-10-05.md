# セリフ継続性調査の再開・初回読取り

2026-10-05。記録時刻 2026-10-05T10:32:44+09:00。所有者の `3a32c2d` 引継ぎからの再開指示に基づく読取専用調査。修正、品質受入、追加provider実行、配備の記録ではない。

## 再開状態

既存 `/home/katsumata-m/.codex/worktrees/cc304-focused-revise-kshiai` の `codex/cc304-focused-revise` を直前HEADから `3a32c2deb575600f81caa0b206f2e6a2ccd319d2` へfast-forward。originとPR152のhead SHAが一致し、PRはOPEN。既存のdirtyなtrial PERTと未追跡trial資料は保全した。旧PC `/home/mako10k/kshiai` と旧一時領域はこの環境の再開場所として使わない。

公開healthは `kshiai-api-speech-9ce565d`、postgres、supabaseを返した。過去のCI37118400242はsource9ce565d、2026-10-03T11:03:06Z開始／11:05:27Z更新、successを読戻した。配備完了記録のcommit b7195d2は11:08:51Z。ただし、個別試合を処理したserving revisionはDB保存stateから直接確認できていない。

## 最大3件の終了済み試合の読取り

main repositoryのsecdat secret-layer DATABASE_URL経路を利用。既存Supabase CAでTLS検証し、BEGIN READ ONLY、statement timeout15秒、終了済み条件、作成時刻降順LIMIT3で取得した。秘密値、キャラクターの私的入力、raw provider記録は本資料に含めない。取得したstateは `/tmp/kshiai-speech-resume-20261005/battles-private.json` にmode0600で保管。

最新は `btl_8d054523d1aea5bffb18dfb39d67f29f`。created2026-10-03T11:47:51.226Z、updated11:53:31.471Z、finished、turn20、manifest schema4、consciousOutputContract dynamic-v4、dialogue revision7。配備完了記録より後の作成時刻である。最新3件内に10月4〜5日作成の終了済み試合はなかった。

集計対象はturnRecordsにcharacterAgents traceが保存された通常判断18件／side。prologue、aftermath、traceがない行、画面上の全表示を含む集計ではない。

| 指標 | A | B |
|---|---:|---:|
| 判断数 | 18 | 18 |
| 発言数 | 18 | 12 |
| null | 0 | 6 |
| 完全一致で異なる発言数 | 4 | 5 |
| 複数回現れた発言の回数 | 13、3 | 4、3、2、2 |
| providerと受理発言の相違 | 0 | 0 |
| 各判断のrecent履歴件数 | 4 | 4 |
| 各判断のgenerationTrace.calls | 1 | 1 |

発言の完全一致は診断集計のみ。意図的反復の違法判定、実行時拒否、置換、再生成規則ではない。受理speech.textとproviderOutput.nextUtteranceを比較した。providerStatusは全件fulfilled、発言のoriginはprovided、沈黙はexplicit_null。文字列比較から会話の意味的な品質や根本原因は決定していない。

## 入力経路の初回照合

両sideでfacts、decision、agencyState、turnObservation、utteranceHistoryの保存入力は18件とも異なる。履歴欠落や全入力が固定という説明は、この標本には合わない。異なるhashは意味的に有効な変化の証明ではない。reactionはA4種／B3種。

保存inputのcompact JSON文字数ではdecisionがA12,005〜12,044、B12,694〜13,200文字と最大。これは最終provider wire、token数、schema込みの値ではない。adapterはavailableActionsを外し、choicesを追加し、factsをcontentへ投影するため、保存inputサイズをHTTP入力サイズとして扱わない。

現行sourceの `projectUtteranceHistory` は直近limit件をspeaker・turn・sequence・textへ射影し、`prepareSpeechHistory` は最後のself/counterpartのindexを付す。`runConsciousGeneration` がphase/targetsに従うschemaとpromptを作成する。次の照合対象はこの射影後request、候補生成、観測と行動結果の意味的な連携、adapter/fallback/provider全経路。

## 完了範囲と残り

初回ゲートの終了済み標本取得と、反復が保存provider出力にも存在することの確認は完了。表示だけの重複では説明できない。serving revisionの直接対応、prologue/aftermath/公開narrationの照合、最終wireの責務・サイズ棚卸し、原因監査、比較条件と設計判断は未完了。試合全体の品質改善・受入は未達。

既存SPEECH_CONTINUITY_FADE PERTのdocument check、schedule both、nextを実行し、配備までの既存taskはdone、残schedule0h。今回の品質調査を完了扱いする根拠にはならない。observe-velocityも実行したがbaseline、完全なwork-event sequence、実測effortが不足し算出不可。今回の新診断task IDと実測記録はまだ正本に未登録。次の開発taskへ進む前に引継ぎどおり新診断scopeを正本へ対応させる必要がある。

次checkpointは入力経路の棚卸しと診断scopeの対応確認。残内部工数は暫定45〜90分、確度低（最終request復元15〜30分、producer/adapter/fallback経路照合20〜40分、証跡と原因未確定事項の整理10〜20分というagent見積もり）。品質改善の設計・実装・比較の総工数は原因と所有者の受入条件が未確定のため別途見積もる。追加実モデル実行・本番試合作成・DB更新・再配備の権限はこの診断から広げない。
