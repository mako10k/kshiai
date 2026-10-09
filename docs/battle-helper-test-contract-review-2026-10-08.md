# 表示・膠着helperの原テスト契約

対象: narration-composer原1、narrative原5、drama原2、supervisor原6の4wholefile/14ケース。ファイル・期待値・assertionは変更しない。6候補20ケース診断は全pass/0fail/0skipだが、battle-pacing3とskill-cooldown3は今回Sealしない。全247単体＋4E2Eの完成目標は維持し、停止中のケースを除外して全体成功にしない。

根拠: 現行Accepted requirements F-BTL-15/17/18/27/28/54、F-UI-05、およびAccepted ADR0056が継承する実発話・表示の責任境界。独立レビュー /root/battle_helper_contract_review は本4ファイルの意味と現行callerを確認した。数値/文字列が存在するだけで別途承認必須にはしない。既存helper内部の表示上限・reaction文字列・hint閾値は新しい機械ポリシーの採用ではない。

narration-composer: action beatから語り形の出力を作り、engine event.summary/outcomeの本文を丸出しにしない、action名を含め、stock speechを作らない。battle-service/mockの現行fallback callerがあるが、この1ケースはfallback helperのlocal出力であり、全V5実況接続・任意のviewでの事実精度・故障復旧を証明しない。

narrative: 表示labelの構造補修、既存coerceCharacterSpeechの空文字reaction fallback、stage reaction検出、鍵括弧/名前表記、指定境界でのspeech interleave。120文字上限/反応文字列を永続正史や全V5の必須発話契約へ昇格しない。原文採用・物理検証・発話の正準authorityはF-BTL-15/48とADR0056に従う。このhelper Sealはそれを弱めない。stage reactionは会話の発話ではない。

drama: signatureのkind/skill抽出、明確に反復した交換/片側waitへのhint、普通のturnへのnull。状態履歴の有界性を受け取る既存hint規則として確認するが、単調化の実試合品質や機械行動の強制改善を証明しない。

supervisor: HP変化なしwait/defendをquiet、critical大変化をnon-quiet、2quiet後のinject可否とcooldown、時間経過だけでinjectしない、環境damageとactor付きexchange区別、内部分類labelをevent文へ出さない。quiet比率0.06/0.08/0.10のboundary、全happening生成・対称効果・原子的保存はこの6例だけで証明しない。

レビュー分類: INSIDE上記4wholefileはPASS、OUTSIDE全SSE/DB/provider/公開完走、BOUNDARY_DISPUTE残る2ファイルのcandidate数値mechanicsの現行採用根拠。後者を本Sealで暗黙採用しない。既存実装は変更しないため新ADRは不要。
