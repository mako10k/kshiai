# 戦闘エンジン元ファイルのCause契約

元の全ケースと今回の追加回帰を保持する。新ADRだけで旧戦闘規則を採用した扱いにはしない。現在ソースの診断成功は正式試験・CI・配備の成功を意味しない。

|ケース群|既存根拠|検証する境界|
|---|---|---|
|攻撃・回復・状態変化・KO/余波・資源不足fallback・停滞・最大値復元・finisher|requirements F-BTL-01〜12、30〜32|サーバーが閉じた算術と確定結果を所有。個別fixture値は実装回帰であり新product閾値を採用しない|
|private continuity・識別・旧snapshot移行・world・行動再検証・held object|F-BTL-13〜15、19〜28、49〜53、ADR0022、既存world/profile/observer design|公開文を認知・正準へ逆流させず、observer別入力と正準状態を分離|
|initiative・bucket resume・順次/明示同時・双方対称性・加算合流・narration非干渉|ADR0001、既存temporal plan producer|保存済み順序と同一snapshotの明示同時を保持。commit済みbucketを再実行しない|
|provenance・遅延効果・状態/装備の減衰・継続状態|F-BTL-02/03/11/12、ADR0021、既存battle-effects design/producer|確定済み効果とdue-once、閉じた継続stateの機械的適用|
|旧cooldown・旧反復と新STA/隙receipt|ADR0062|policyのない過去snapshotの既存算術を保持。新規試合はcooldownなし、反復2/4、隙消費1回。旧1〜9を新規へ採用しない|
|4装備効果と専用STA負担|ADR0063、数値補正はADR0060|元効果を保持し、専用負担を別に適用。旧equipment decayは既存復元契約に従う|

各根拠のexact SealはR3計画から現在HEADを取得して接続する。過去verificationを新規則の権限として使わない。新規則側と上記既存規則側を現在のbattle-engine producerで合流させ、元wholefileへ渡す。全ケース保持・型整合・正式未封印停止は別に検証する。
