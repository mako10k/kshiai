# リポジトリ履歴・実況保存の契約レビュー

独立レビュー battle_helper_contract_review の INSIDE 判定対象は battle-presentations.test.ts 元1ケース、battles-improvement.test.ts 元4ケース。3ファイル全11ケースの診断はpass11/fail0/skip0。workspace typecheck exit0。正式全体合格ではない。

実況保存は Accepted ADR0006 の receipt identity・battle内sequenceに基づく。確認範囲はsequence順readbackと同じreceiptで異なるinput digestの拒否。same-digest上書き不可、SSE、worker fencing、認可の成立をこのケースから主張しない。

履歴は Accepted ADR0039 の完了履歴・記録値・binding保持、ADR0043 の歴史読込保持、ADR0006 のbattle revision CASに基づく。search/detail、legacy revision0、stale revision拒否、壊れた履歴のdegraded表示と再開不可、schema-invalid書込拒否を確認する。characterId指定repository境界であり、公開route認可全体の証明ではない。

型修正はテストのみ。壊れた保存データを正しいBattleStateから別のcorruptedState objectとして組み立てる。NaNはnumber型を満たすがschema不正であり、write拒否テストのcastは不要なので除去。元4ケース・assertion・破損シナリオを保持する。

characters.test.ts 元6ケースは未封印。owner参照・識別名・相手別記憶・近いrating/profileの自動マッチ・test realm隔離には根拠がある。公開レート再中心化と削除時処理はAccepted方針未確認。実装や診断合格を採用根拠にしない。
