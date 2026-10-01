# vt104 複雑度適正化の結果

所有者指示「複雑度を適正化」に従い、現行の検査基準を維持した内部整理を完了した。基準変更候補v1は未採用で、基準設定・閾値・走査範囲・除外・Lizardバージョンは変更していない。

| 指標 | 整理前 | 整理後 | 許容上限 |
| --- | ---: | ---: | ---: |
| CC超過関数数 | 134 | 119 | 121 |
| CC最大値 | 96 | 77 | 92 |
| CC超過総量 | 1623 | 1357 | 1369 |
| 関数長超過関数数 | 72 | 66 | 67 |
| 関数長超過総量 | 7571 | 6247 | 7390 |

引数は5/11/10のまま、関数長最大585/733。280ファイル・4308関数。数値はpinned Lizard1.23.0による走査。template式の一部では関数区間の認識に限界があり、個々の関数の実際の責任はコード比較でも確認した。

公開戦闘データを専用projectionへ分け、戦闘開始のreplay/participant解決を区分した。切替受付はauth/trial/responseを分け、control repositoryの許可・遷移・receipt検証を整理した。ナレーションは取得/claim/生成会計/結果公開を区分し、character authoringは新規対象検査/有効化済み結果/移行/期限切れ/候補検証を区分した。fixtureハッシュ生成は共通化し、Neva/Rioの全生成JSONは変更前後でバイト一致した。

証跡更新中の途中runでは20件のscript検査がstaleによって選択から外れ、実行208件だった。228件という途中報告を訂正した。verificationを現在の実装Sealへ更新した後、全39 activeファイルのテストを再実行し、最終175+24+29=228件・失敗0を確認した。provisional2、disabled141は通常の選択対象外のまま。

Node22.22.3でnpm run lint（全型検査・重複検査・複雑度検査）、npm testの228件、npm run buildが成功。変更した処理の直接検査もcharacter27件、cutover18件、公開戦闘15件、ナレーション16件成功。直接検査は通常テストと重複するため合計に加算しない。新規provider会計の2テストをinventory/verificationへ登録した。独立の差分レビューでは、外部動作、処理順序、SQL/transaction、型契約の回帰を検出しなかった。統合中の参加者型の広がりは、combat-ready sheet型への修正後に全検査した。ビルドの既存chunk size警告は残る。

選択対象外のbattle-create-idempotency/conscious-agency-persistence計4件は、前後とも2成功・2失敗。整理前b9af55eでも同じMY_CHARACTER_V3_CAPABILITY_BLOCKEDが再現した。これを今回の回帰や、実対戦の成功証拠とは扱わない。別途対戦証拠の取得が必要。

ソース569パスのaggregate SHA-256: 6edaf6c726a6154f5534100ce0c4d955a1d9e3ad299847d0ec50a9514d6c2dfa。実装Seal ba7134b678cb624b4b97129d58f2a9428563ff3d3045421a85aad16d4f2203f5。対象verificationを更新してsource一致・staleなしを確認、fsck成功。CLI llmthink監査はfatal/error/warning0。詳細値とログdigestは同名JSONを参照。

PR151は必要な4CI成功後933e6aeでmainへmerge済み。workflow登録とundici7.29.1は完了。今回のWIPはmainへ統合しない。試用deploy、DB処分、共有停止、Googleログイン、課金LLM呼出しは未実施。

ゴールまでの見込時間: 複雑度整理は残0時間。vt104残0.5〜1.5 agent h、ログイン直前まで1〜3h、初回試用1.75〜5h、親csm0014.75〜12h（暫定・低確度、外部判断待ちを含まない）。vt104準備0.5〜1.5h＋起動/認証設定0.5〜1.5hをログイン前の仮定とし、初回試用は追加0.75〜2h、親は追加3〜7hの従前残作業を含む。実利用価値は現時点0、今回の寄与は既存品質ゲートを満たす試用ソースの準備。

PERT vt104の観測resumeは2026-10-01T15:00:05+09:00。この部分作業でvt104全体を完了扱いしない。observe-velocityはvt103の単一標本25p/17hを再観測したがperson-hourと混同しない。次の測定点は、exact hosted sourceの4CIと準備packetが揃いvt104を完了できる時点。残る次の行動は現在ソースのCI用PR/annotated tag/prepareの正確な対象と権限を固定し、後続の停止・処分・認証変更候補を提示すること。
