# セリフの継続性・単調さの再調査に向けた引継ぎ（WIP）

2026-10-05。フェード削除と会話継続を促す修正のデプロイは完了。試合全体で繰り返しや単調さが改善したかは未確認であり、この品質課題はWIPとして引き継ぐ。今回は引継ぎ資料の作成・コミット・pushのみ。下記の次作業は提案であり、実施済みや新しい設計の承認済みとは扱わない。

## 再開場所

- repository／唯一のworktree: `/home/mako10k/kshiai`
- branch: `codex/cc304-focused-revise`。新しいbranch／worktreeは作らず再利用する。
- この資料作成前のHEAD: `b7195d2dde9fa51dcd2c93d1ccd7d0af177ffdaa`。fetch後、origin同branchとの左右差は0／0、未コミット変更なし。
- 製品コードsource: `9ce565dd9522c281320ed50697ddf41839ebab91`
- 引継ぎcommitのSHAはpush後にHEADとremote refを独立して照合する。製品sourceの検証を引継ぎcommitの検証へ読み替えない。
- [PR152](https://github.com/mako10k/kshiai/pull/152) は現在OPEN。今回はmerge、release、tagの公開を行わない。

## 完了済みと稼働証跡

[修正・検証記録](evidence/speech-continuity-and-fade-recovery-2026-10-03.md)、[配備receipt](evidence/speech-continuity-and-fade-recovery-2026-10-03.json)、[完了済みPERT](speech-continuity-and-fade-recovery.pert)を参照。

フェードは所有者の指示により完全削除した。セリフの段階表示state、タイマー、表示数によるfilter、CSS class、重複していたkeyframeを削除。初回とSSEで届く複数セリフを全文・opacity1・animationなしで確認した。再開時にフェードを再実装しない。

プロンプトには、履歴はコピー例ではなく既発言であること、直前の双方の発言と現在の観測からやり取りを継続すること、毎ターン同じ周辺状況の言い換えや出会い直しをしないことを追加した。決着後には締めの反応を求める。サーバーは履歴配列をそのまま保持し、speaker roleから直前の双方の発言位置を添える。出力スキーマは変更していない。

これはプロンプトへの補修であり、根本原因解消を証明した変更ではない。繰り返しを抑える明示的な指示を追加した事実を隠さない。文字列一致／類似度による重複拒否、出力の削除・置換、定型発言補完、反復を理由にした再生成は追加していない。意図的な反復と沈黙は合法のまま。

製品sourceのbuild／typecheck／static成功。governed unit215件成功、active40／provisional2／disabled154。disabledは成功数に含めない。直接実行したdynamic provider12件とブラウザー3件も成功。[CI37118400242](https://github.com/mako10k/kshiai/actions/runs/37118400242) は4job成功。

Cloud Build `8fc4655b-35e7-4512-9871-5633f3130fcb`、image digest `sha256:163bfb5e36cf32f1e50eab1c9347ac65deb5351985366a332994b5c8d16e9170`。GCP project `kshiai`、region `asia-northeast1`、service `kshiai-api`、revision `kshiai-api-speech-9ce565d`。Worker version `48e290c4-fca2-4132-9428-bec0ff216163`、deployment `643b03bb-fd4f-4610-bc4e-9af805af7ebe`。配備時に両者100%、preview health、runtime設定一致、public smoke、frontend9ファイルのSHA一致、限定ERRORログ0件、調査対象の保存済み試合不変を確認した。

2026-10-05T01:15:08Zにpublic `/api/health` を再確認し、HTTP200、revision `kshiai-api-speech-9ce565d`、database postgres、auth supabase。これは疎通・稼働revisionの確認であり、現在の全traffic設定や新しい試合の品質を再確認したものではない。次回は時点の異なる記録を現在値と混同せず読戻す。

## 未確認事項

直近に詳しく調査したのは配備前の終了済み試合 `btl_d5ac2372aceca61f7a8f53b8949ebddc`（2026-10-03T10:26:31.502Z、turn10、dynamic-v4）。同じ周辺状況の発言が一方で9回、他方で8回出ており、providerOutput自体に反復がある。履歴は渡っていた。turn8には新しい身体的な結果があっても、発言は波や滑りやすさの説明を繰り返した。入力の欠落だけでは説明できない。

修正後の実モデル確認は、同試合の固定turn8入力を使った2判断のみ。各1論理生成・構造エラー0件。一方はnull、他方は相手の滑りやすさへの具体的な返答だった。この結果から試合全体の改善、適切な沈黙率、行動の多様化、因果関係の一貫性は主張できない。2026-10-05の最新試合ログは今回取得していない。

現在のコードで上記試合入力を再構成したサイズは下表。修復なし、system指示・user JSON・response_format JSONを合計した文字数であり、モデルのtoken数やHTTP全体のサイズではない。

| phase | 指示文 | 入力・schema込み | UTF-8合計 |
|---|---:|---:|---:|
| prologue | 2,140文字 | 17,436〜25,216文字 | 25,538〜33,100 bytes |
| turn | 1,913文字 | 20,650〜25,208文字 | 28,768〜32,480 bytes |
| aftermath | 1,759文字 | 8,552〜9,305文字 | 13,021〜14,062 bytes |

大部分は入力JSON。サイズが原因だと断定したり、文字数からtoken数を確定したりしない。動的な出力契約を採用したことだけでは、入力情報とLLMの責務が十分に軽くなった証明にはならない。

## 次作業の提案と順序

1. **配備後の試合を確認する。** 最新の終了済み試合を少数・読取専用で取得し、作成時刻、契約世代、固定asset revision、実際に処理したserving revisionを可能な範囲で対応付ける。観測、履歴、LLM出力、受理・公開されたセリフを追い、表示重複と生成反復を区別する。反復回数は診断値に限り、実行時の拒否規則へ使わない。未終了試合を完了させる操作はしない。
2. **入力と責務を棚卸しする。** system、user JSON各部、候補、output schema、修復情報のサイズと目的を整理する。既知の状態・目標・履歴が何度再提示されるか、LLMが転記や再解釈を負担していないかを確認する。行動候補や観測が実際に更新されているか、会話・行動・結果の連携がどこで薄れるかをproducer→adapter→fallback→provider→受理の全経路で追う。
3. **原因に対応する設計案を作る。** パターンマッチングや禁止文の追加を先行させない。機械的に保持・準備できる情報はサーバーへ、意味的な目標・意図・発言判断はキャラクター側へ残す。削減で観測・関係・出典・合法な選択を失わないことを比較する。accepted ADR0027／0047から責務、永続状態、契約、retry境界を変える場合は新しいADRをProposedとして先に作り、決定境界を越えて実装しない。
4. **比較条件を決めてから検証する。** 同じ固定入力で変更前後を比較し、意図的な反復、自然な沈黙、問いへの返答、被った結果への反応、決着後を含める。単に前回と文字が違うだけでは改善としない。品質評価の条件・モデル・論理呼出数・費用上限を記録し、追加のprovider実行や本番試合作成は承認済み範囲を確認してから行う。
5. **実装・検証・配備を段階で行う。** 診断を完了後、所有者が進める範囲にcanonical PERTを合わせ、document check、schedule both、nextを確認する。変更に応じて回帰テストとrequired checksを実行。commit→push→同一sourceのCI／image／preview確認→公開切替→public readbackと進める。現行配備が完了しているため、資料作成だけを理由に再配備しない。

最初のゲートは「配備後に何が起きているかを証跡付きで確認する」こと。診断の内部作業は暫定1〜2時間、確度低。設計・実装・比較試合の総時間は原因と受入条件の確定後に見積もる。試合全体の品質確認は未着手のまま記録する。

## 再開手順と主なコード

```sh
cd /home/mako10k/kshiai
git status --short
git fetch --prune origin
git rev-list --left-right --count HEAD...origin/codex/cc304-focused-revise
git worktree list
```

dirty状態や履歴差があれば内容を照合し、reset／force push／新worktreeで隠さない。`AGENTS.md`、ADR0027／0047、今回の証跡と計画を読む。新しい診断・修正のscopeを次作業用のPERTへ明示し、完了済み修正を品質受入済みへ読み替えない。

- `backend/src/llm/conscious-dynamic.ts`: generationPlan、generationPrompt、prepareSpeechHistory、動的requestと修復。
- `backend/src/services/battle-service.ts`: 固定contextの組立、projectUtteranceHistory、通常／later／aftermathの入力。
- `backend/src/llm/openai-compatible.ts`、`fallback.ts`、`types.ts`: 実際のprovider request、会計、fallback、契約。
- `frontend/src/pages/BattlePage.tsx`、`BattlePageView.tsx`、`frontend/src/styles.css`: 即時表示。会話生成の問題を表示側の重複除去で隠さない。
- `backend/src/llm/conscious-dynamic.test.ts`、`e2e/battle-screen.spec.ts`: 現行修正の直接回帰検査。

コードを変更した場合はsharedを先にbuildし、`npm run build`、`npm run typecheck`、`npm test`、`npm run static`を実行。governed selectorでdisabledの検査は必要に応じて直接実行し、成功と未実行を区別する。static基準を緩めない。ブラウザー検査はfixture APIとローカルViteで行い、本番の有料生成へ接続しない。

## ローカル整理と保全

`poc/battle-pipeline-projection` のローカルブランチは所有者指示で削除済み。未pushだった5コミットのUI実装はPR94で取り込まれており、当時のPoCと計画記録はローカルのannotated tag `archive/poc-battle-pipeline-projection-20261005`、commit `c134a226f1f72fdbc23287f34306b1de87f6ccff` に保全した。タグは未push、リモートブランチは変更していない。ほかの旧branchやbackup branchは削除していない。

私的な入力・raw provider記録・一時スクリプトは `/tmp/kshiai-repeat-fade-inspect`、前回portrait／無発言調査は `/tmp/kshiai-regression-inspect`。一時領域は消える可能性があり、再開時に存在を確認する。これらをGitへ一括追加しない。`.env`、secdat、SQLite、生成dist、画像、非公開character入力や推論過程はcommit対象外。今回の資料以外に開始時のdirtyファイルはない。

今回の停止理由は所有者の引継ぎ・WIP commit・push指示。技術的な障害による停止ではない。今回の外部操作はGitの通常pushと公開APIの読取りのみ。追加のLLM呼出し、本番試合作成、DB更新、配備、mergeは実施していない。
