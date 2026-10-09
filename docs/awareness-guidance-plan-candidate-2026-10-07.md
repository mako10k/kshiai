# 指針受領修復の正式PERT追加候補

対象正本：docs/speech-continuity-and-fade-recovery.pert。今回の再開指示に沿う修復と残る正式CI確認を記録する。計画の更新はまだ行っていない。

候補：awareness-guidance-repair。タイトル「現在条件の顕在指針の受領を復旧し、接続欠落を検出する」。接続AWARENESS_PUBLIC_COMPLETED→ALL_PLAN_WORK_RESOLVED、見積2point、リソースDEV1。修復対象の公開awareness実装と既存の完走証拠を基点とするが、旧完走を今回の合格証拠へ流用しない。

範囲：既存指針投影の明示受領、none/欠落の区別、非開示保持、元資料→実promptの統合試験、接続除去時の失敗、対象試験の上流契約/Cause/登録と正式CI確認。コード・23件の直接診断・2箇所のmutation検出は実施済み。正式CIは未Seal192件で実行前停止しており、現時点でtask完了にはしない。

差分と影響：完了済みの公開完走・旧試行破棄task、履歴、node、実績は変更しない。今回のtaskを追加するため、計画全体の終点は今回の検証が未完了の間未到達となる。旧試行の復活、テスト削除・無条件Seal、公開配備、料金を伴う試験は含まない。

代案：追加せず実装証跡だけ残す。その場合この修復と残作業を正式PERTで追跡・実績計測できないため推奨しない。別計画は作らない。

制約・未知：既存velocity1p/1hを実測速度として扱わない。observe-velocityはPTHIS-103で取得できない。今回2pointはagentの暫定難易度見積で、残る内部登録/検証2〜4時間（低信頼度）と別物。192件全体の復旧や公開品質の再受入はこの見積に含めず、次の登録照合で残範囲を確認する。

公式CLI previewは構造上ok=true、変更はtask1件の追加。governanceはrequired_owner_confirmations=[user]、owner_confirmation_required=true、write_authorized=false。所有者承認後にdigest guard付きで同一候補を適用・readbackし、task実績・document check・dag analyze/nextを更新する。
