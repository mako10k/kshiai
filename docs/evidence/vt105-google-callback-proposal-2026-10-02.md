# Googleログイン用callbackの追加案（未実行）

対象はSupabase project `cvrbhpkfqkpqdegxfrlq` の認証redirect許可リストです。RC2のimmutable Worker version `26ff9223-7732-47e4-ac2b-f4a3f9b191cf` のpreviewから既存Google認証を使うため、次のURLを1件追加します。

`https://26ff9223-kshiai-web.mako10k.workers.dev/auth/callback`

現在の3件（公開サイト、localhost:5188、127.0.0.1:5188）は維持します。PATCHは隣接するJSONの `uri_allow_list` だけ、最大1回です。Google provider、認証鍵、site_url、PKCE、ユーザー対応関係は変更しません。実行直前のGETがbaselineと一致しなければ停止し、実行後GETで4件の完全一致とGoogle有効・site_url維持を確認します。通信結果が不明なら再送せず読み戻します。

代替はpreviewでGoogleログインを行わず待機することです。公開サイトは旧サービス停止中で、この試行の代替にはなりません。追加URLで認証後のリダイレクトを許可する効果があり、配備済みpreviewが到達先になります。追加自体は可逆ですが、取り消しは別の書き込みです。

今回のレビュー範囲はこの許可リスト追加のみです。INSIDE: URL・project・既存設定保持・1回上限と読み戻し。OUTSIDE: 実ユーザーのGoogleログイン、Neva/Rio確認・有効化、実対戦と有料provider予算。BOUNDARY_DISPUTE: なし。実ログイン成功は未検証です。

前回の承認はauthSettingsChange=0で、この認証設定変更を含みません。AGENTS.mdの “Approval follows the disclosed scope” に基づき、この追加だけを承認対象とします。
