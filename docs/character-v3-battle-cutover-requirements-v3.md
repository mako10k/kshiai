# 未リリース共用環境の初回V3試行 — 要件 revision 3

- 状態: Accepted（下記の所有者による基本方針の明示と計画再修正指示）
- 日付: 2026-09-30
- 決定者: user
- 前版: [revision 2](character-v3-battle-cutover-requirements-v2.md)。前版は歴史的受入記録として保持する。
- 根拠: [所有者指示・修正範囲](evidence/vt104-unreleased-trial-rescope-2026-09-30.md)、[監査済み判断](evidence/vt104-unreleased-trial-rescope-2026-09-30.think)

## 現在の到達条件

受益者はGoogleログインを使う所有者。未リリースの本番/Stage共用環境で、Neva/Rioを通常の候補review/confirmでV3として有効化し、自分のキャラクターを選び、V3対戦を進行・再読込し、結果まで確認できることを初回試行の完了条件とする。

- R1/R2: 前版のV3参加資格と不変generation/battle bindingを継承する。新しい対戦の正しさは既存データとの互換性とは別である。
- R3: 既決の旧未完了対戦の物理削除方針は継続。実対象・旧処理停止・削除読戻しはvt108で扱う。snapshot/復旧証明を開始条件にしない。
- R4: 既存完了履歴・旧generation・旧版API/対戦の互換性と可読性保証、旧データの移行・維持を初回試行の受入条件から外して後続へ置く。既存の保持機能をわざわざ削除する仕事は追加しない。この方針は全DB初期化・finished履歴・Google認証ユーザ削除の実行許可ではない。
- R5: 現在必要な証拠は実配備identity、起動/DB接続、Googleログインと自分の所有物へのアクセス、V3候補確定/選択、作成/進行/SSE/再読込/結果。メディアを使う実画面ではその表示を確認する。メール認証、旧完了履歴保持、暗号化snapshot、鍵の予備コピー、実restore時間、旧版へのrollback保証、一般公開production promotionを初回試行のブロッカーにしない。

通常review/confirm・所有権・秘密情報保護・新規V3の永続化/会計上限は継続。現在のruntimeが必要とするschema migrationは新規機能の起動に必要な作業として扱い、後回しにしたV2→V3データ移行と区別する。

## 後続と実行境界

基本方針は今回確定済み。実装に必要な具体的なworkflow/control変更の詳細は[ADR-0042候補](adr/0042-unreleased-v3-trial-scope.md)へ渡す。新しい詳細を受入済みと偽らず、旧設計の八receipt制御をそのまま新受入条件の証拠に使わない。

今回の指示は計画・関連文書の再修正。実配備・DB削除・クラウド資源操作は対象が具体化した後の実行範囲で扱う。本番という名称だけから稼働中利用者・SLA・旧データ価値を推定しない。
