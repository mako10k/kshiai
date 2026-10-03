# vt103 ローカル結合確認 — 2026-09-30

ゴールまでの見込時間: vt103の完了条件は充足し残0。Stage試行までの内部準備残1.25–3 agent時間、親csm001残4.25–10 agent時間（暫定agent見積り、低確度）。外部のrelease適用・アクセス・所有者確認待ちは上限不明。Stageで遊べる実現価値はまだ0だが、正式Neva/Rioの結合候補をローカルの実画面で使えることを確認した。

## 対象・根拠・境界

既存worktree `/home/katsumata-m/.codex/worktrees/cc304-focused-revise-kshiai`、branch `codex/cc304-focused-revise`、開始HEAD `fba69f387f058b17f2b49fcd07c61ae4ccc5d493`。開始時clean、認証付きfetch後tracking0/0、main remote `e31c487dadbe784022e5cfde80d3314ce45485b9`、matching PRなし。mainは保持。

ユーザーの「vt103のローカル結合確認」に従う。Accepted切替要件revision2 R1–R5、authoring revision5 R18、ADR0039、lifecycle design revision2の「正式な登録と統合検証」がgoverning input。現在の審査対象はローカルの登録から完走・読戻しまで。Stageの本物の所有者確定・provider生成/品質・配備・停止切替・実プレイはvt104–vt108等の次phase。判断DSL `vt103-resume-2026-09-30.think` はCLI監査fatal/error/warning0。

試験は新規・使い捨てSQLite、合成所有者、ローカルMockLlmProviderを使用。API応答、DB、engine、frontendを代替していない。Honoの実HTTP serverとVite frontendを独立のloopback portで起動し、ブラウザから実経路を呼ぶ。外部ブラウザ通信は拒否。試験DB、両server、browserは終了時に片付けた。正式候補のgeneration/対話/ルールは実経路で固定される。試験内の合成所有者確定はプロダクトオーナーのStage内容受入れではない。

## 観測した結果

- 固定Neva/Rio候補を通常authoring attemptへ保存し、実ブラウザのレビュー画面からexact digest付きconfirm。append/CASで両generation1を登録。自キャラ選択・相手候補を実APIで照合し、Match画面からNeva対Rioを作成。
- 両者の非空V3 action norm/compilerを使用。対戦途中で双方のprivate conscious guidance priorityを1増やすrevision候補を作り、編集前の不変generationとの全候補比較を表示し、実ブラウザからexact digest付きconfirm。双方のcurrentはgeneration2になり、既存対戦はgeneration1/digest/snapshot/compilerを保持。
- `?resume=1` 再開・reload、HTTP advance、SSE、action aliasの同一キー再送を確認。保存済みadvanceOperationのexact IDでservice state replayを行い、battleRevision不変を照合。HTTP/SSE IDは実routeのrequestDigestとも一致。actionのstate再送は実際に保存されたlegacy operation IDを使用し、raw HTTP keyを同一identityと扱っていない。
- 8ターンでネヴァが勝利。status finished、aftermathPending false。実況10件のinput/digestをcommitted phase receiptと照合し、workerにそのexact保存入力が渡ることを検証。worker処理後、実ブラウザの「結果」「夜航の灯守・ネヴァ の勝利」を表示・reloadで再確認。ブラウザpageerror0。
- V2×V2、両方向のV2/V3混在新規createは409。同じ正式登録から未完了対戦を作成し、HTTP/SSE/actionを進め、frozen cutover集合を固定。対象未完了1件だけ削除、finished1件の保存内容を保持。
- 削除後GET、narration snapshot/events/follow/receipt、旧HTTP/SSE/actionキー、旧createキーは404。削除前のexact state operation IDでも利用不可、遅延workerはproviderを呼ばずack。全履歴とキャラ別履歴にfinishedを保持し、削除IDが消えることを確認。finished画面は削除後もreload成功。

exact IDs/digestsとfrozen cutover planは [結果JSON](vt103-local-result-2026-09-30.json)。対戦ID `btl_538122adf2eae30e0aeecad4c732b30f`。画面は [結果スクリーンショット](vt103-neva-rio-finished-2026-09-30.png)。DBを破棄しているため、このIDは保存証拠の識別子であり、常設ローカル環境やStageに登録したIDではない。

## 発見・修正した実装不具合

途中編集のGET reviewが500。V3なら全候補をfixed-create helperへ送り、sourceTextを無条件JSON.parseする条件がplain revision instructionを拒否していた。作成modeの表示もrevisionへ流用していた。旧試験がJSONのfixed-createと別素材のbattleに分かれていたことは検出不足であり、生成原因とは別。

修正はcandidate review moduleで文章入力を保持し、revision modeではattempt.expectedGenerationIdのexact不変generationをrouteから読み、変更前と候補の全fieldを比較表示する。変更指示自体の表示をJSON quoteによる偽の変更にしない。digest、receipts、generation append/CAS、V3定義、battle schemaは変更していない。R18の既存義務への適合修正で、新しいADR方向を採用していない。CLI RCA/修正判断 `vt103-owner-review-correction-2026-09-30.think` はfatal/error/warning0。

再現は修正前の実HTTP500で確認。plain revision sourceと変更/不変field・既存create表示のunit回帰を追加し、正式create登録試験を維持。独立read-onlyレビューでstate replay検証のraw key不一致を指摘されたため、実保存IDとrevision不変の照合へ修正した。テスト開発途中のlocator誤りやnarration requestにgeneration IDがあるとの誤ったassertは修正した。実況のidentity保持はmanifestとcommitted request/digestを各々照合し、requestの存在しないfieldを完了根拠にしていない。

## 検証・再現

- 最終ブラウザ結合1/1成功、27.6秒。create/双方revisionの確定、選択、対戦作成、paused resume、結果表示は実ブラウザ操作。残るtransport検証と進行は同じcookieの実HTTP requestを用いる。
- focused回帰6/6（候補review2、正式登録3、既存V3実経路1）。
- `npm test` active19ファイル、140ケース（107+24+9）成功。provisional2、disabled146は除外されたままで、除外範囲の完了は主張しない。
- 全workspace/backend/frontend/deploymentの `npm run typecheck` 成功。新試験・変更箇所に禁止type escapeなし。独立strict import-graph probeは新試験の型誤りを直したが、既存battle-service.tsの4件のundefined型診断を残すため、その追加probe全体の成功は主張しない。通常project checkは成功。
- SealGraph fsck result ok、source manifest一致、diff check成功。新unit/e2e verification REFはimplementation manifest→Accepted lifecycle designのCauseでseal済み。e2e authority inventoryはactive2、disabled1で新specをcurrentとして認識。

再現:

```bash
PATH=/home/katsumata-m/.local/bin:/home/katsumata-m/.nvm/versions/node/v25.1.0/bin:$PATH
E2E_CHROMIUM_EXECUTABLE=/home/katsumata-m/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome \
  npx playwright test --config playwright.v3-local.config.ts
npm test
npm run typecheck
```

Chromium executableは実行環境にあるものを指定。専用configは共有serverを使わない。既存GUIのauthority runnerでもこのspecを発見する。PostgreSQLの保存/cutover同等性はvt110の隔離試験6/6を再利用し、今回のjoined browser pathはSQLiteのみ。実provider品質、通常providerによるV3編集生成全体、Stage実経路は未検証。

## 実績・正本計画・残ゴール

vt103開始12:04:42、完了13:26:18、記録停止なし、active elapsed34/25h（81分36秒）。tool待ち・委譲を含むtask区間。担当者別投入工数は独立に採取できずunknownで、person-effortを推測して補作していない。`observe-velocity --task vt103 --evidence declared` のavailable候補25p/17hを標準preview/digest-guard apply経路で子計画に適用。一件の低確度elapsed throughputで、person-hour生産性ではない。vt110との複数task window候補はtask間空白を含むため採用せず、別JSONに保持する。

- 子V3_STAGE_TRIAL: vt103 done、残resource37/6p、precedence31/6p。新elapsed速度で期間参考3.513–4.193h。next vt104。
- 親csm001: cc314残を子resource37/6pへ更新、source/descriptionも現在証拠へ整合。親残resource103/6p、旧registration速度で参考4.204h。異なる後続評価/移行へvt103速度を自動適用していない。
- 両document check、precedence/resource analyze、nextを再確認。歴史的closure/acceptance/history警告を保持し、検査を通すために根拠のないacceptanceやforce advanceを追加していない。
- 内部工数の別枠agent見積り: Stage残1.25–3 = 切替/release準備1–2.5 + プレイ証拠整理0.25–0.5。親残4.25–10 = Stage1.25–3 + 後続評価/移行準備3–7。前回残から完了vt103を除いた暫定低確度の仮定であり、PERTのelapsed期間とは異なる。暦日・外部待ちを含む完了日はunknown。
- measured loopの残不足はperson-effort未取得。次の認可済みvt104開始時を2026-09-30時点の次checkpointとし、担当者別start/pause/finishと取得可能な投入区間を分けて記録する。未取得fieldをelapsedから実績として変換しない。

推奨次作業はvt104の正確なrelease候補・停止cutover・回復/読戻し手順の準備（暫定0.5–1 agent時間、低確度、Stage準備1–2.5内の一部）。ローカル結合証拠を実際のStageプレイへ渡すための適用候補を作る。完了checkpointはexact artifact、対象集合の観測方法、停止/回復、最大書込みと読戻しをレビュー可能に固定した時。配備・Stageデータ操作自体は別の正確な実行権限を必要とする。

今回の変更は既存worktreeに未コミットで保持。今回のvt103依頼では追加commit/push/merge/deployを実施していない。共有workdayは変更していない。
