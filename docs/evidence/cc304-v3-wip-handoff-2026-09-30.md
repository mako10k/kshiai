# cc304 V3 WIP引継ぎ — 2026-09-30

ゴールまでの見込時間: Stage試行まで残1.75–4.5 agent時間、親csm001残4.75–11.5 agent時間（暫定agent見積り、低確度）。外部適用・アクセス・所有者確認待ちは別で上限不明。受益者がStageでNeva対Rioを遊べる実現価値はまだ0。

## 継続先と同期範囲

- 作業先 `/home/katsumata-m/.codex/worktrees/cc304-focused-revise-kshiai`、既存branch `codex/cc304-focused-revise`。
- main worktree `/home/katsumata-m/kshiai`。credential domainもmainを使用。
- 開始HEAD `4a898d058609b163d1783e0d6ec1a932de7f3317`。closeout前の認証付きfetchでtrackingとのahead/behindは0/0。
- 本資料を含むWIPコミットが継続対象。確定SHAは `git log -1 --format=%H -- docs/evidence/cc304-v3-wip-handoff-2026-09-30.md` で取得する。
- ユーザーが資料作成・非クリーン時WIPコミット・pushを明示依頼。vt102/vt110のsource、tests、正本PERT、evidence、SealGraph provenanceだけを同期する。push後の独立remote SHA読戻し・clean確認はチャット最終報告に記録する。
- merge、PR、release、配備、Stage/productionデータ操作は実施していない。前の報告資料の「未コミット」は当時の観測であり、同期状態は本closeoutと最終読戻しを参照する。

## governing authorityと完了状態

Accepted `docs/character-v3-battle-cutover-requirements-v2.md` R1–R5、ADR0039、`docs/battle-lifecycle-boundary-design-v2.md` に従う。上流の受入れ意味を変更していない。

- vt102 done: immutable V3 generation ID/digest/snapshotとcompiler・対話・rule tupleをV4 battle manifestに固定。HTTP/SSE/action/state replay、LLM、narration、worker、reflect/resultまで束縛。norm gate、conflict receipt、resource checkpointの実経路を検証。
- vt110 done: battle-mechanics@3共通参加資格、V2新規作成409、INSERTとUPDATEの分離、revision/lease fence、共通アクセス判定。cutover planが対象ID/digest/依存件数とfinished集合を固定し、transactionで再検証して未完了payloadを削除する。最小discard receipt、finished履歴、provider実使用量を保持し、削除後の再作成・再送・遅延公開を防ぐ。
- source-owned -5/+5 staminaの合計0が疎な差分から落ちる保存不整合を、原因別帰属と明示0の保持で修正。schemaは維持。決定的試験は修正前失敗・修正後成功。元の乱数系列は未記録でunknown。

詳細: `vt102-implementation-2026-09-30.md`、`vt110-implementation-2026-09-30.md`、各validation/source JSON。本資料と同じdocs/evidence配下にある。

## 検証と限界

最終sourceでshared build、全workspace typecheck、npm test有効18ファイル138ケース成功。provisional2、disabled146は対象外。targeted11/11、engine＋zero-net47/47。隔離SQLiteとPostgreSQL16.15で同じ保存・cutover6ケースが成功。実provider会計adapterの遅延17 tokens、実況超過遅延12007 tokensの会計保持・非公開も検証。

PostgreSQLはUbuntu公式debを/tmpに展開した使い捨てcluster（loopback55439、local CAでTLS検証、全migration、試験DB各run後DROP）。serverは停止済み。実Stage DB・外部providerには接続していない。再現はdisposable DBと同じTLS・全migration条件で行う。

SealGraph fsck成功、diff check成功、独立レビューの具体的INSIDE残指摘0。これらはローカル適合証拠でありStageプレイの証明ではない。closeout時にはvt110 source manifestの全path SHAを再照合する。vt102 manifestはその時点の歴史証拠として保持する。

最新implementation/vt110 Seal: `6396326c4db3a821cc7105084829855cf99b629253ef7f7e565c3b3da9e49f40`。verification storage: `e4fa90ba7757ceefcca625db6aa65243205a3ac1bb742cd0e4007fae1b0f3bed`。source readbackは `vt110-source-readback-2026-09-30.json`。

## 正本PERT・実測・次の作業

子 `docs/character-v3-stage-trial.pert` V3_STAGE_TRIAL: vt102/vt110 done、残resource49/6p、次はvt103。親 `docs/character-semantic-migration.pert` csm001: cc314残を49/6pに更新、親残resource115/6p、next cc314。両計画のdocument check、precedence/resource analyze、nextを確認済み。歴史的PTDAG208警告は保持。

vt110測定開始11:08:20、完了11:30:53、active elapsed451/1200h（22分33秒）。person/agent投入工数は独立未計測。baseline13/12pからelapsed velocity1300p/451hを標準経路で子計画に適用した。1サンプル・委譲/ツール待ちを含む低確度throughputで、person-hour生産性ではない。子の期間参考2.486–2.833h。親は異なる後続作業のため旧velocityを保持し、期間参考4.693h。新速度の自動roll-upではない。

内部工数見積り（実績ではない、低確度）:

- vt102/vt110の内部実装・検証残0。
- vt103正式Neva/Rioローカル結合0.5–1.5 agent時間。
- Stage残1.75–4.5 = vt103 0.5–1.5 + 切替/release準備1–2.5 + プレイ証拠整理0.25–0.5。
- 親残4.75–11.5 = Stage1.75–4.5 + 後続評価/移行準備3–7。

推奨再開はvt103: 正式Neva/Rio authoring登録→選択→V3完走、途中編集/再読込/再送、discard/finished読戻しを同じローカル経路で確認する。既存Acceptedのローカル実装権限の範囲。Stage/data/release適用には別の正確な実行権限が必要。

次の測定checkpointは2026-09-30時点の次回認可済みvt103開始/完了。担当別active区間・投入工数を採取してobserve-velocityを更新する。未着手であり、仮定をactualsに書かない。

再開時はrepository-start、worktimectl agent、正本PERT check/analyze both/next、SealGraph causes/stalenessとsource manifestを確認し、CLI llmthinkで次の実行判断を監査する。closeout判断は `cc304-v3-wip-closeout-2026-09-30.think`（fatal/error/warning0）。
