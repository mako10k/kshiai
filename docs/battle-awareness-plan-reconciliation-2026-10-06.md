# 現行公開配備と保留旧試行を分離する計画修正候補

所有者の2026-10-06更新ゴールは、正式PERTを最新・正常に保ち、dag nextが妥当なら実施し、配備と一試合の完走まで実施すること。対象正本は `docs/speech-continuity-and-fade-recovery.pert`。

## 現在の不整合

`suspended awareness-verify` は「新経路全体」と「旧pinned generation/切替試行」を同じtaskで確認する。suspend理由は旧切替試行契約変更の保留。新経路の公開deployはその到達先AWARENESS_VERIFIEDに依存し、dag nextはready/recommendedとも空である。ADR0056/0057は旧切替試行を通常公開対象から明示的に除外している。一方、既存試合の読み取り・継続・アクセス・usageの保護は残るので、新経路確認全体を削除・完了扱いにはしない。

## 正確な変更候補

1. 元awareness-verifyのID、開始・suspendイベント、保留状態、3時間相当の未完了見積を保つ。taskの説明を「所有者再開後の旧V3切替試行契約確認」に限定し、到達先を独立OLD_CUTOVER_TRIAL_VERIFIEDへ変更する。旧切替試行自体の契約・workflow・既存別planは変更しない。
2. `awareness-current-verify`（0.25時間相当、DEV1）をAWARENESS_CONNECTED→AWARENESS_VERIFIEDへ追加する。完了条件はAcceptedADR0051/0054/0056/0057と現行prompt、継続、SDK usage、実況、認証、SSEの実装・必要な既存検証証拠の照合。未確認の範囲だけ追加検証する。公開完走は後段であり、このtaskの前提へ戻さない。
3. 公開deploy→公開完走の既存依存と実際の公開完走到達点AWARENESS_PUBLIC_COMPLETEDを維持する。
4. DAGは全nodeがproject.finishへ到達する必要があるので、ALL_PLAN_WORK_RESOLVEDという全計画用の共通終点を追加する。公開完走と旧試行確認から別々のzero-duration gateで接続し、project.finishだけをそこへ移す。これにより旧試行を記録し続けながら公開枝を進められる。今回の公開ゴールはAWARENESS_PUBLIC_COMPLETEDで達成するが、計画全体の閉鎖は旧保留枝の解消まで宣言しない。
5. 非推奨のduration_unit hourを、公式project migrate-unitでpointへ等価移行する。従来の1時間見積を1pointへ変換し、移行時の宣言換算値1p/1hで既存予測を維持する。履歴のplanned_valueも同じ公式変換で移行し、実際の開始・終了・effortの事実は変更しない。1p/1hは実測速度ではない。移行後にobserve-velocityを再実施し、対象作業への適合を確認する。

## 代案・リスク・未確認

混在taskをそのまま残す案は通常配備を保留旧試行で止める。旧試行を削除・doneにする案は未完了義務や履歴を失う。旧契約を再開・緩和する案は所有者の保留と矛盾するので採用しない。

提案は公開機能、出力契約、アクセス規則、provider上限、料金記録、旧切替契約を変更しない。全計画用finishが公開完走の後になり、旧枝の外部保留に期限がないため全計画の完了日は未算出。公開ゴールの残内部作業は暫定45〜90分、低確信度、CI/cloud/model待機別枠。旧保留確認は従来見積3時間相当であり、再開未許可。

CLIでbatch候補をpreviewし、構文・DAGエラー0を確認済み。独立read-only reviewもscope分離を支持する。write前にCLI llmthink audit、owner確認、digest照合を行う。write後にdocument check、precedence/resource両schedule、dag nextを再確認する。期待するnextはawareness-current-verify、証拠照合完了後はawareness-public-deploy。所有者承認前に書き換えない。

## 承認と適用

所有者は2026-10-06に候補一式を承認した。CLI batchでscope分割をdigest照合・actor codex・accepted_by_owner userの下で適用し、公式migrate-unitで等価Point移行した。両操作のreadbackは成功、document/DAGエラー0、nextはawareness-current-verify。旧保留taskとイベントを保持している。Pointへ公式変換後はSSE修正の速度観測が利用可能になり、active399秒・planned0.5pから600p/133h（約4.51p/h）が得られた。単一の小規模な検査修正サンプルなので低確信度であり、配備・公開モデル待機の予測へそのまま適用しない。移行換算1p/hも実測速度とは表示しない。次の計測はcurrent-verifyとpublic-deployの境界。

追加readback: 移行をcommitした後のobserve-velocityは、公式単位変換の既存event payload差と保留task再編をhistory conflictとして拒否した。上記の移行直後観測は現履歴の正常性や適用済み速度を示さない。計画のdocument/schedule/nextは成功を維持する。制限と保護履歴を保持する修復候補は current-verify の証拠資料に記録した。

## 所有者による旧試行の破棄（2026-10-06）

所有者の「保留ではなく破棄にできますか？」という指示により、旧切替試行の再開・検証義務を取り下げた。従来の保留方針はこの決定で終了する。対象は正式PERTのawareness-verifyとその終点のみ。既存試合、旧APIの読み取り、別のcharacter-v3-stage-trial計画、実装・workflow・公開環境は変更しない。

perttoolにcancelled状態はないため、taskにdiscarded/verification-not-performedタグと破棄理由を付け、旧試行を検証したと解釈できるOLD_CUTOVER_TRIAL_VERIFIEDをOLD_CUTOVER_TRIAL_DISCARDEDへ置換した。taskの技術上のdoneは「所有者による破棄決定の記録を終えた」という行政的終結であり、旧試験の成功ではない。元のtask ID、3p見積、開始・保留イベントを変更せず保存。計算上の残作業は0で、この破棄による終結を旧試行の作業速度サンプルとして使用しない。原状証跡はdocs/evidence/old-cutover-trial-discarded-2026-10-06.json。

公開配備・公開完走は実検証済み。全計画終点は、実証済み公開完走と今回の破棄決定の両方で解消する。document check、schedule both、dag nextはok・エラー0・実行候補なし。
