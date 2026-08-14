# kshiai — 要件定義書

**プロダクト名:** kshiai（試合）  
**種別:** ターン制 LLM バトルゲーム（Web アプリ）  
**版:** 1.0（2026-08-02）  
**状態:** スキャフォールド起点の親要件（詳細設計は llmthink / 実装計画は perttool）

---

## 1. プロダクト概要

### 1.1 一言

自然文から生成したキャラクター同士を、複数ユーザーがログインしてターン制で戦わせる Web ゲーム。  
戦闘の数値解決はプログラムが機械的に行い、状況演出・ナレーション・セリフは LLM が担当する。

### 1.2 体験の核

| 軸 | 方針 |
|----|------|
| キャラ作り | 自然文 → LLM が構造化生成 → 会話で微調整（生 JSON は見せない） |
| 戦闘 | ターン制。パラメータ効果はエンジンが確定適用、LLM は状況係数と物語を担当 |
| 見せ方 | 数値 UI を原則非表示。ナレータ要約と「」セリフで状況を伝える |
| 終了 | 戦闘維持パラメータ枯渇、またはターン上限時の LLM 総合判定 |

### 1.3 非目標（当面スコープ外）

- リアルタイム同時操作（同一ターン内の同時入力競争）
- 課金・課金アイテム・ガチャ経済
- 3D / 高度な物理シミュレーション
- Appleなど、Google以外の外部ログイン（後続対応）
- 完全自動プレイ専用の eSports ランキング

---

## 2. 用語

| 用語 | 意味 |
|------|------|
| キャラクター | ユーザー所有の対戦単位。外見・特技・装備・内部パラメータを持つ |
| 構造化シート | エンジンが参照するキャラの内部データ（ユーザーには直接見せない） |
| 公開プロフィール | ユーザーに見せる会話・要約表現（数値テーブルは出さない） |
| シーン | 戦場の舞台（例: 雨の路地、闘技場）。状況係数の親コンテキスト |
| 状況 (Situation) | シーン内の一時状態（炎上、夜、観客の盛り上がりなど） |
| 状況係数 | パラメータ・技への乗算/加算係数。LLM が提案、エンジンが検証・適用 |
| ターン効果 | 1 ターン分の確定ダメージ・回復・状態付与など。プログラムが計算 |
| ナレータ | ターン結果を物語調に説明する LLM ロール |
| 戦闘維持パラメータ | これが不可逆に尽きると敗北（既定: `hp`、拡張可能） |
| プロバイダ | LLM / 画像生成の実装先（xAI / Venice など） |

---

## 3. アクターと利用フロー

### 3.1 アクター

- **ゲスト:** 未ログイン。閲覧限定（将来）またはログイン誘導のみ
- **プレイヤー:** 登録ユーザー。キャラ管理・対戦・観戦
- **システム（エンジン）:** ターン解決、ルール検証、永続化
- **LLM サービス:** 生成・微調整・状況管理・ナレーション・総合判定・画像生成

### 3.2 主要ユーザーフロー

```
[ログイン]
   → [メインメニュー]
        ├─ キャラ管理
        │     ├─ 一覧 / 検索
        │     ├─ 新規生成（自然文）
        │     ├─ 会話による微調整
        │     ├─ コピー / 削除 / 編集メタ
        │     └─ 画像 AI 生成（任意）
        ├─ 対戦
        │     ├─ 自分のキャラ選択
        │     ├─ 相手選択（手動 / ランダム / 自動マッチ）
        │     └─ バトル画面（ターン進行・ナレーション）
        └─ ユーザー設定（表示・体験設定。別途設計）

[運用者設定] LLMプロバイダ優先順・管理者許可リストなどはサーバー設定で管理
```

---

## 4. 機能要件

### 4.1 認証・マルチユーザー

| ID | 要件 | 優先度 |
|----|------|--------|
| F-AUTH-01 | ユーザー登録・ログイン・ログアウトができる | Must |
| F-AUTH-02 | セッション（または Bearer トークン）で API を保護する | Must |
| F-AUTH-03 | キャラ・バトルは所有者権限で分離する | Must |
| F-AUTH-04 | 対戦は「自分のキャラ vs 他ユーザーのキャラ（または自分の別キャラ）」を許可 | Must |
| F-AUTH-05 | パスワードはハッシュ保存（平文禁止） | Must |
| F-AUTH-06 | Supabase Authでメール確認済みユーザーだけがメール／パスワードでログインできる | Must |
| F-AUTH-07 | Google OAuthで登録・ログインできる | Must |
| F-AUTH-08 | バックエンドはSupabase access tokenを公開JWKSで検証し、`iss`・`aud`・`role`・有効期限を確認する | Must |
| F-AUTH-09 | Supabase Auth IDとアプリ内ユーザーIDを一意に対応付け、既存の所有権IDを維持する | Must |

### 4.2 キャラクター

| ID | 要件 | 優先度 |
|----|------|--------|
| F-CHR-01 | キャラは構造化シートとして永続化する | Must |
| F-CHR-02 | 構造化シートの必須カテゴリ: 特徴、外見イメージ記述、パラメータ、特技、武器、防具、戦闘維持関連フラグ | Must |
| F-CHR-02a | キャラクターは固有の通常攻撃プロファイルを持ち、HP以外のMP・スタミナ・最大値・戦闘能力を主対象にできる | Must |
| F-CHR-02b | 特技と装備は一時的なパラメータ変更を持てる。利益には消費資源、自己弱体化、または行動ターンの代償を伴わせる | Must |
| F-CHR-02c | 表示名とは別に、本名・通用名・一人称名・二つ名・性別・年齢を内部プロフィールとして保持する。性別・年齢は通常UIへの明示を必須としない | Must |
| F-CHR-03 | 新規作成は「自然文プロンプト → LLM 構造化生成」 | Must |
| F-CHR-03a | キャラ生成LLMは、認証ユーザー本人が所有する他キャラのみを検索・詳細参照でき、血縁・関係性・類似点を生成へ反映できる。参照要否を自然文のパターンマッチで分岐せず、LLM自身が判断する | Must |
| F-CHR-03b | 生成・調整結果は一つの整合したプロフィールとして統合する。外見要約は視覚情報、公開紹介文は人物像・背景、traitsは短いラベル、技／装備説明は局所情報に限定し、同じ事実・弱点・代償を重複または言い換えて反復しない | Must |
| F-CHR-03c | 新規生成では所有者の既存キャラクター名を参照データとしてLLMへ提示し、既存名の流用を抑止する。保存前にも表示名・本名を正規化照合し、衝突時は異なる名前で再生成する | Must |
| F-CHR-04 | 生成後、ユーザーは会話で微調整できる（例: 「もっと防御寄りに」「剣を大剣に」） | Must |
| F-CHR-05 | **生の構造化データ（JSON 等）をユーザー向け UI に出さない** | Must |
| F-CHR-06 | 代わりに LLM/テンプレが会話・要約文で特徴を伝える | Must |
| F-CHR-07 | 一覧・検索・コピー・削除・メタ編集（名前表示・タグ等） | Must |
| F-CHR-08 | コピーは新しい所有者レコードとして複製（ID 新規） | Must |
| F-CHR-09 | キャラ画像をサーバー側の画像プロバイダ経由で AI 生成し、ローカルメディアとして永続化できる。未生成時のプレースホルダは UI 表示だけに限定し、生成失敗時はプレースホルダ URL をシートへ保存しない | Should |
| F-CHR-10 | 画像生成プロンプトは外見記述から組み立て、ユーザーが自然文で追加指示可能 | Should |
| F-CHR-11 | 対決方法は剣戟に固定せず、銃器・SF技術・精神／社会的対決・非暴力・コメディ・ゆるかわ表現など、キャラクターの設定に合う形式を維持する | Must |

#### 4.2.1 構造化シート（内部スキーマ概要）

エンジンが参照する論理フィールド（実装は `packages/shared` の型に落とす）:

```text
CharacterSheet
  id, ownerUserId, displayName, tags[], createdAt, updatedAt
  identity: { realName?, nicknames[], selfNames[], epithets[], gender?, age? }
  appearance: { summary, visualPrompt, imageUrl? }
  traits: string[]                 # 性格・背景の短いラベル
  parameters: Record<ParamKey, number>  # 内部数値。UI 非表示
  skills: Skill[]                  # 特技（コスト・効果テンプレ・フレーバー）
  weapon: Equipment | null
  armor: Equipment | null
  combatFlags: { canFight: boolean, irreversibleIncapacitated: boolean, ... }
  narrativeBlurb: string           # ユーザー向け公開紹介文
```

**パラメータ（初期セット、拡張可）**

| Key | 役割 | ユーザー表示 |
|-----|------|--------------|
| `hp` | 戦闘維持の主パラメータ | 非表示（結果のみ物語化） |
| `mp` / `stamina` | 技コスト資源 | 非表示 |
| `atk`, `def`, `spd`, `mag`, `res` | 攻防速など | 非表示 |
| `focus`, `luck` | 状況・判定補正用 | 非表示 |

数値の生値・差分は API レスポンスの **ユーザー向け DTO から除外**する。  
管理・デバッグ用にサーバーログまたは admin 専用エンドポイントでのみ可（初期実装では admin なし）。

### 4.3 対戦マッチング

| ID | 要件 | 優先度 |
|----|------|--------|
| F-MTCH-01 | 自分の出場キャラを選択できる | Must |
| F-MTCH-02 | 相手を一覧から手動選択できる | Must |
| F-MTCH-03 | 相手をランダム選択できる | Must |
| F-MTCH-04 | 自動選択は自キャラとの公開レーティング差と内部戦闘プロファイル差が小さい候補を優先し、同程度の相手を選べる | Must |
| F-MTCH-05 | 対戦開始時に初期シーンを LLM またはルールで決定する | Must |
| F-MTCH-06 | 戦場は未指定（既定）ならランダム具体化。プリセット指定も可 | Must |
| F-MTCH-07 | 対戦セットアップの再利用可能な候補（自分のキャラ、相手、戦場、語りスタイル）は種類ごとの最近使用順で表示し、名前・タグ・説明などから検索できる | Must |

### 4.3b 戦場（バトルフィールド）

| ID | 要件 | 優先度 |
|----|------|--------|
| F-BF-01 | 戦場プリセットを持てる（システム標準 + ユーザー定義） | Must |
| F-BF-02 | 標準例: 森・闘技場・海・市街地・学校 などを初期同梱 | Must |
| F-BF-03 | 試合開始時、プリセット（またはランダム）から地形・障害・状況を具体化する | Must |
| F-BF-04 | エンジンとナレーションは具体化結果を考慮する（係数は非表示） | Must |
| F-BF-05 | キャラと同様に生成・会話調整・検索・コピー・削除・画像ができる | Must |
| F-BF-06 | システムプリセットは読み取り専用（コピーして編集） | Must |
| F-BF-07 | 試合中の具体状況を気に入ったらプリセットとして保存できる | Must |
| F-BF-08 | 戦場画像は外見記述・地形・障害・環境条件から生成し、本番は共有オブジェクトストレージへ永続化する。生成失敗時は既存 imageUrl を変更しない | Must |

### 4.4 バトルエンジン（プログラム責任）

| ID | 要件 | 優先度 |
|----|------|--------|
| F-BTL-01 | ターン制。各ターンは「行動宣言 → 解決 → ナレーション確定 → 終了判定」 | Must |
| F-BTL-02 | **ターン効果（ダメージ・回復・状態異常の数値適用）はプログラムが機械的に決定・適用** | Must |
| F-BTL-03 | LLM は状況係数や技の「意図」を提案できるが、**最終数値はスキーマ検証後にエンジンが確定** | Must |
| F-BTL-04 | 戦闘維持に必要なパラメータが尽きた、または不可逆的戦闘不能ならその時点で決着 | Must |
| F-BTL-04a | 決着後の行く末や余韻はLLMが対戦内容・戦場・語りスタイルに沿って生成し、勝者表示へ固定の後日談文を重ねない | Must |
| F-BTL-05 | ターン上限（設定可能、既定例: 20）に達したら、独立した裁定LLMが公開ナレーションを含まない確定済み行動・イベント・状態から勝者と事実ベースの理由を生判断する。その後ナレータが裁定を変更せず、直前までのユーザー向け公開ナレーションを文体・連続性のコンテキストとして判定発表を表現する | Must |
| F-BTL-06 | 同一イニシアチブ窓で双方が戦闘不能になった場合は、双方の効果を確定したうえで引き分けとする | Must |
| F-BTL-07 | 乱数を使う場合はシード可能にし、再現テスト可能にする | Should |
| F-BTL-08 | 攻撃技のコストを払えない場合は通常攻撃、通常攻撃も困難なら休息へフォールバックし、資源枯渇による永久待機を防ぐ | Must |
| F-BTL-09 | キャラクター由来の攻撃・回復がないターンが2回続いた場合、次ターンは双方を通常攻撃へ切り替えて膠着を解消する | Must |
| F-BTL-10 | ターン上限の直前に判定を予告し、上限到達時は通常ターン実況とは別に判定理由を物語ログへ永続化する | Must |
| F-BTL-11 | 戦闘開始時のシート値を基準値として保持し、2ターン目以降は現在HPを除くパラメータを毎ターン差分の20%（最低1）ずつ基準値へ戻す | Must |
| F-BTL-12 | 復元対象にはMP・スタミナとHPを含む各最大値を含める。失った現在HPは自動復元せず、回復効果でのみ戻す | Must |
| F-BTL-13 | 各キャラは戦闘ごとに独立した非公開エージェント状態（短い継続メモ・目標・感情・認識・話し方・一人称・直前の発話）を持ち、ターン間で保存する | Must |
| F-BTL-14 | エンジンは各キャラ別の最新観測スナップショット、直前revisionからの観測差分、明示的なself/counterpartスロットを持つ最新知覚frameを生成・保存し、それを対応するキャラエージェントへ注入する。旧frame履歴は保持せず、contactの現在の識別状態だけを有界registryに保持する。その他の古い主観的継続性は必要な場合だけキャラの有界な内面記憶へ要約し、逐語的な思考過程は保存・公開しない | Must |
| F-BTL-15 | 各キャラエージェントは自分の非公開継続状態と最新知覚frameから、更新済み非公開状態・次行動・実際に発した台詞または反応を生成する。ナレータは採用済み実発話と確定イベントを受け取り、台詞の配置と事実・意図・話者・発話種別を変えない表層加工、および地の文だけを担当する。検証できない加工は実発話原文へ戻し、公開表示をキャラ状態へ書き戻さない。戦闘効果と勝敗は引き続きエンジンのみが確定する | Must |
| F-BTL-16 | 対決方針はLLMが3つ程度のジャンル非依存な観点を生成し、各観点を「相反する2案 + お任せ」の排他的三択として提示する。お任せは方針未指定として保存する | Must |
| F-BTL-17 | 戦場由来の異変は2ターン以上の膠着を検出した場合だけ生成する。固定テンプレートを使わず、戦場設定と過去の異変履歴から、以前と異なり、流れを変え、双方へ対称な条件または機会を与える内容をLLM生成する。生成失敗時は注入を見送る | Must |
| F-BTL-18 | 異変は物語内の出来事として自然に描写し、ユーザー向けナレーションへ「ハプニング」などの内部分類ラベルを表示しない | Must |
| F-BTL-19 | 戦闘開始時に、シーン・相互作用可能な物体・A/B双方の観測可能状態を、安定IDを持つ構造化セマンティック状態として生成・保存する | Must |
| F-BTL-20 | セマンティック状態は厳密な外枠と浅く柔軟な facts を持ち、同一性のある可変要素は配列位置ではなくID付きマップで管理する | Must |
| F-BTL-21 | 各ターンは、確定した行動・イベントを安定IDで記録し、解決後にシーン・物体・外見への意味的影響をJSON Pointer差分として提案・検証・原子的に適用する | Must |
| F-BTL-22 | セマンティック差分はHP・能力値・勝敗・行動可否・非公開内面・過去記録を編集できず、自然文のパターンマッチでメカニクスを選択しない | Must |
| F-BTL-23 | 各キャラは適用済みの機械結果と観測可能なセマンティック結果を受け取った後、同一形式・同一段階で非公開内面状態を更新する。語り視点によってこの更新を省略しない | Must |
| F-BTL-24 | 拾得は物体の所在変更、破損・消費・除去は削除ではなく状態・所在・activeの変更として保存し、生成物や破片は新しい安定IDの実体として保存する | Must |
| F-BTL-25 | BattleStateは最新セマンティックスナップショット、直前revisionからの最新遷移、A/B/publicの最新観測と観測差分、A/Bの最新知覚frame、有界な現在contact registryだけを保持する。ターン記録へ状態・パッチ・過去frame・内面差分を複製せず、旧バトルはLLM移行なしの決定論的revision-0状態で読み込める | Must |
| F-BTL-26 | 観測可否は構造化されたvisibleTo、所在、確定イベント、検証済み知覚根拠からサーバーが投影し、自然文から「見えた」「隠れた」等をパターン判定しない。各キャラframeはselfとcounterpartを必須スロットとして持つが、counterpartは現在知覚不能・痕跡のみ・粗く知覚・明瞭の状態と、未知・推定・識別済みの知識状態を独立して表せる | Must |
| F-BTL-27 | ナレータは確定済み行動から構築した短い行動beat、技・通常攻撃の説明、直近の公開台詞・地の文、今回の採用済み実発話を受け取り、開始・接触・結果が分かる行動中心の地の文と実発話の表示位置を生成する。地の文は反復を避けるが、キャラが実際に反復した台詞を別内容へ置換しない | Must |
| F-BTL-28 | BattleStateは全履歴を増やさず、直前行動の署名、反復回数、場所・環境変化からの経過ターン、物語段階だけを有界なDramaStateとして保持する | Must |
| F-BTL-29 | 機械効果を伴わない環境beatは通常ターンにも定期的に提案できる。機械効果を伴う戦場異変はF-BTL-17の膠着条件と双方対称性を引き続き必要とする | Must |
| F-BTL-30 | 10ターン目以降は全攻撃の決定論的クリティカル機会を段階的に高める。補正は10ターン目で通常、20ターン目で設定上限に達し、20ターン未満の上限設定でも同じ傾斜を保つ | Must |
| F-BTL-31 | 各キャラは1戦闘に1回だけ使える固定必殺技候補を持つ。明示的なspecial技を優先し、なければ既存の最強攻撃技を候補として固定する。キャラエージェントへ次ターン、残りターン、解禁まで、現在・最大倍率、最大まで、クリティカル機会、残回数、使用可能行動を構造化して渡し、次ターン行動を予約させる。エンジンは技ID・解禁・残回数・コストを検証し、不正・失敗時は既存ポリシーへフォールバックする | Must |
| F-BTL-32 | 確定した効果量は、生値を渡さず、パラメータ種別ごとの固定基準に対する絶対bandと対象最大値に対する相対bandの両方へ決定論的に量子化する。自己の現在reserve、ターン内消耗、回復、無効、戦闘不能、複数対象、環境効果を別々に表現する | Must |
| F-BTL-33 | 非機械的な音・匂い・接触・雰囲気等は、既存semantic reconcilerの同一応答に独立検証可能な知覚根拠として同梱する構成を優先する。ただし固定fixtureで世界差分または知覚根拠の精度が基準を下回るprovider/modelでは、世界更新と知覚生成を別プロンプト・別呼出しに分離する。構成は設定として固定し、ターンごとの場当たり的な追加呼出しを行わない | Must |
| F-BTL-34 | observer-local contactは再利用しない単調IDを持ち、現在accessと識別知識を分離する。識別済み知識は見失っても消去せず、未識別contactの統合・分割・消失・容量超過を有界な現在registryで処理し、過去frameを書き換えない | Must |
| F-BTL-35 | ナレータ入力は語り視点ごとに変換する。一人称はself、相手限定は相手側viewpoint、全知は全IDと表示ラベル、第三者は表示ラベルのみ、流動視点は既存focus決定後の対応viewを使う。IDは制御メタデータであり文章へ出力しないよう強く指示し、出力後もサーバーが既知IDを表示ラベルへ完全一致置換する | Must |
| F-BTL-36 | semanticまたは知覚LLM失敗時は新しい非機械知覚を捏造しない。projection失敗時も正準worldStateからcounterpart accessを決定し、worldStateが利用不能なら直前accessを知覚内容なしで保持する。旧registryの識別知識とaccessも保持し、旧バトルはsetup由来の識別済みcounterpartと補完済みworldStateから決定論的に初期化する | Must |
| F-BTL-37 | キャラが実際に発した台詞とユーザー向け公開レンダリングを別データとして扱う。他キャラへの伝達は実発話を距離・遮蔽・騒音・聴覚・意識・言語理解等から観測者別に投影し、公開レンダリングやナレータ文を知覚入力に使わない | Must |
| F-BTL-38 | 2者対戦では、A/B双方の行動意図を同じターン開始snapshotから凍結し、確定済みの開始時補正を含む実効速度を整数へ丸めてイニシアチブとする。差が1以内なら同一バケットで原子的に同時解決し、差が2以上なら高い側から順次解決する。Side名、ナレータ文、provider応答順、乱数を順序決定に使わない | Must |
| F-BTL-39 | 順次解決の後続バケットは直前commit後の正準状態で行動可能性・対象・距離・資源を再検証し、不成立なら理由付きskip、部分成立、または事前定義済みの認知安全な代替へ落とす | Must |
| F-BTL-40 | 同時バケットは同一開始snapshotから全効果を計算して原子的にmergeする。同一バケットの防御は被攻撃へ適用し、相互作用で同時行動を遡及取消ししない。排他的な位置・物体の競合は明示規則がなければ双方 `contested` とし、Side固定順で勝者を作らない | Must |
| F-BTL-41 | BattleStateは、厳密座標を使わず、area、存在、露出、相対距離、視線・音の遮蔽、向き、意識・移動・拘束・姿勢、視覚・聴覚、精神明瞭度・agency、held/worn/attached、使用可否・排他性・遮蔽作用を有限値で表すサーバー所有の粗いworldStateを持つ | Must |
| F-BTL-42 | worldStateの変更はbase revision、turn、確定event ID、構造化operationを持つ原子的transitionだけで行う。参照欠落、配置循環、不在と距離の矛盾、未確定event、古いrevisionを拒否し、失敗時は部分適用しない。pair格納順は安定IDで正規化するが、Sideの処理優先順位には使わない | Must |
| F-BTL-43 | worldStateを知覚・行動可否・因果効果・時間解決の機械的正準入力とし、LLM提案を受けるsemanticStateと分離する。自然文、公開セリフ、ナレータ文はworldStateを直接変更できず、意味的提案を機械状態へ反映する場合は確定eventに結び付けてサーバーが別途検証する | Must |
| F-BTL-44 | 各キャラエージェントには、そのキャラ自身の正準プロフィールから作る凍結済み・機械パラメータ非搭載の自己プロフィールanchorを渡す。表示名、identity、外見、traits、設定、基本行動、技能、装備の確定値は過去のprivate continuityやprovider補完より優先し、未設定値は未知のままにする。profile由来objectが戦闘中に着脱・移動した場合は、永続CharacterSheetを変更せず、正準worldStateからbattle-timeの`currentStateOverrides`を導出して現在描写だけを上書きし、元配置へ戻ればoverrideを除去する。一人称は対峙コンテキストが`identity.selfNames`内から選んだ関係別候補を優先し、なければ先頭をサーバーが正準化し、配列が空なら新規に推測しない | Must |
| F-BTL-45 | 通常ターン、プロローグ、決着後のナレータには、キャラ自己プロフィールとは別の表示専用profile anchorを視点に応じて渡す。さらに、正準worldState上の昇格・具体化object配置をID非公開の自然文`sceneStateFacts`へ投影し、profile側の現在overrideと同じ正準entityから「本人は未着用」と「物は場面内」の両面を供給する。外部・全知視点は正準label、キャラ限定視点はobserver-local labelだけを使い、未観測objectを含めない。anchorとscene factは人物像・呼称・現在配置の矛盾回避だけに使い、それだけを根拠とした属性の公開、キャラ認知・記憶・worldState・効果・勝敗への書戻しを禁止する。キャラ限定視点では相手anchorを渡さず、anchor欠落または性別等が未設定なら表示名か中立表現を使って推測しない | Must |
| F-BTL-46 | 初期および各ターンのcounterpart accessは正準worldStateの存在・露出・相対距離・視線・向き・場面照明・観測者の意識・視覚・精神明瞭度からサーバーが決定する。選択済みの通常対戦は互いを識別済みで開始し、匿名・偽装等が明示された場合だけ正体を自動識別せず存在と概略位置のみを認知可能にする。provider無応答だけでは直前accessを低下させず、低下はworldState上の隠密・不可視・遮蔽・不在・距離離脱・観測者阻害、または確定eventに結び付いた明示的な知覚喪失だけで行い、識別知識はcurrent accessと独立して保持する | Must |
| F-BTL-47 | 正準identityとobserver-localな見かけを分離し、各知覚slotは観測された姿、推定identity、確信度、正準実体との継続beliefを保持できるようにする。変身・偽装を目撃した側と未目撃側は別beliefを持ち、幻覚は正準entityへ昇格させず該当observerだけの現象またはcontactにする。キャラ限定ナレーションとキャラ入力はunlinkedな見かけから正準名を復元しない | Must |
| F-BTL-48 | キャラが生成した実発話・可視反応は、発話能力・意識状態をサーバーが検証してから正準utterance eventとしてturn recordへ保存する。対キャラ知覚はevent原文だけから、距離、音の遮蔽、騒音、音量、明瞭度、聴覚、意識、精神明瞭度、言語理解を使ってfull・partial・意味不明・話者未帰属・非知覚をSide別に投影する。公開レンダリングとナレータ文はevent生成および知覚投影の入力にしない | Must |
| F-BTL-49 | キャラへ渡す使用可能行動は、自己資源だけでなく正準worldStateのpresence、意識、agency、移動・拘束、場面移動制約、対象との距離・視線、発話能力、保持中オブジェクトの使用可否と、observer別frameの対象accessからサーバーが算出する。候補は自己情報、skill ID、observer-localな対象ラベルだけを含み、未認知の正準名・entity ID・位置を漏らさない | Must |
| F-BTL-50 | 選択済み意図は実行時の正準状態で再検証し、結果をaccepted、partial、substituted、failedと有限の理由でturn recordへ保存する。代替は休息・防御・待機等の自己完結行動から決定し、相手の正確なHP・資源・非公開状態を選択に使わない。providerが候補外行動を返した場合は実発話とは独立に行動だけを拒否する | Must |
| F-BTL-51 | サーバーはarea状態、キャラ自身の意識・移動・拘束・姿勢・感覚・精神・agencyと、held/worn/attachedまたはareaに作用するobject・terrain・effectの有限属性から有効actor状態、遮蔽、効果量係数を決定的に導出する。これを対象集合・行動可否・実行時再検証・正準効果へ適用し、自然文、semantic facts、公開セリフ、ナレータ文を機械判定へ使わない | Must |
| F-BTL-52 | 未認知の原因も正準worldState上の制約・係数として作用するが、そのsource IDと非公開属性はサーバー内の因果receiptに留める。キャラframeにはobserverが知覚できる確定結果だけを投影し、原因の帰属は別途検証済みsensory evidenceが許す範囲に限定する。検証済みsemantic location・active・entity追加は確定eventに結び付いた原子的world transitionへ変換し、変換またはworld検証失敗時はsemantic/worldを部分commitしない | Must |
| F-BTL-53 | 新規戦闘では戦場、双方の正準プロフィール、過去対戦情報から戦闘単位で不変の対峙コンテキストを構築し、正式表示名、衝突しない短い戦闘内ラベル、A→B/B→Aの関係、相手への呼称、関係に応じた許可済み一人称、初期identity knowledgeを保存する。LLMは候補を提案できるが、選択済みの通常対戦は明示的な匿名・偽装設定がない限り互いを識別済みとし、検証失敗時はサーバーの決定論的既定値を使う | Must |
| F-BTL-54 | 正準speechはキャラAgent由来の本文とサーバー所有のsource Sideを保持し、正準話者名を主観ナレータ入力へ漏らさない。ナレータは現在の語り視点に射影済みのview、observer-localな見かけ・帰属確度・関係呼称・表示継続状態だけから表示話者ラベルを自由に構成し、サーバーはラベル内容を候補集合で再フィルタしない。source Side不一致と実発話の事実変更だけは正準値へ戻す。場面状態が第三者・場面entityの存在と能動性を支える場合、ナレータはsource Sideを持たない表示専用の発話・反応を構成できる。いずれの表示もキャラ認知、正準event、worldStateへ書き戻さない | Must |
| F-BTL-55 | BattleStateは読者用とA視点用とB視点用の有界なナレータ継続状態を分離して保持する。A/B状態は現在の選択視点にかかわらず毎ターン両方更新し、fluid focusは今回公開するviewだけを選ぶ。読者が知る正式名・公開済み情報、各キャラのidentity memory、現在accessを相互に昇格・逆流させない | Must |
| F-BTL-56 | キャラの非公開継続状態は、主感情、隠した感情、未発話の意図、現在の懸念、相手への態度、確信度、関係性の緊張を有界な構造化結論として保持できる。逐語的な思考過程は要求・保存せず、ナレータへは現在視点で許可されたdigestだけを渡し、主観・全知視点では利用可能な内面beatを描写へ反映し、外部視点では観測可能な表出だけに限定する | Must |
| F-BTL-57 | ナレータ継続状態は、視点ごとに安定した対象参照、戦闘内で認識した呼び名、identity knowledge、`same_entity`・`possibly_same_entity`・`unlinked`の同一性を有界に保持する。`identified + same_entity`の対象は一時的な遮蔽、声だけの知覚、ターン変更、表示視点切替だけで未知へ戻さない。ナレータLLMは既存の通常・プロローグ・余波呼び出しと同じ応答内で認識差分を提案し、サーバーは現在view内の安定対象だけをナレータ専用状態へ保存する。追加LLM呼び出し、公開文からの逆算、キャラ認知・正準event・worldStateへの書戻しを行わない | Must |
| F-BTL-58 | 各キャラはサーバー既定の「この対戦に勝つ」をbattle-scopedな既定目的として持つ。正準プロフィールは、自然文の価値principle、0〜100の優先度、`preference`・`commitment`・`constraint`の最小区分により、人情、安全、約束、自己表現等を勝利より優先できる。価値内容自体はenum化せず、既定目的の優先度は変更できるが削除せず、公式勝敗・終了条件・レーティングを変更しない | Must |
| F-BTL-59 | キャラAgentは既定目的、凍結価値、選択policy、私的継続状態、observer別frame、利用可能な標準行動とscene affordanceから、1〜3ターンの有界な目的・方針・再考条件と次の1行動を同じ既存呼び出し内で更新する。逐語的思考過程や確定成功の主張を保存せず、provider失敗時は機械検証可能なconstraintを守り、解釈不能な場合は自己完結した保守的fallbackを使う | Must |
| F-BTL-60 | `free_action`は自然文の試み、望む結果、observer-safeな対象・道具参照を持ち、通常ターンの1行動を消費する。行動動詞の大規模enumは作らず、失敗・競合・部分成立後に別の攻撃や防御を追加実行しない。free actionはHP・MP・能力値・戦闘不能・勝敗を直接変更せず、配置、距離、拘束、姿勢、露出、遮蔽、物体・場面状態等を介して後続行動へ影響できる | Must |
| F-BTL-61 | どちらかが`free_action`を予約したターンでは、server-only調停LLMをA/Bまとめて最大1回呼び、自然文intentを根拠参照、promotion候補、汎用world/semantic operation候補、成功・失敗候補、定性的causal envelopeへ解釈させる。調停LLMは提案だけを行い、サーバーはactor authority、到達可能性、能力根拠、保護field、変更量、競合、revision、event bindingを検証し、エンジンが最終結果を確定する。対象・operationごとの追加呼び出しや無制限retryを行わない | Must |
| F-BTL-62 | 操作対象が未正準の場合、サーバーは正準appearance・equipment、battlefield、既存semantic entity・検証済みfact、確定event、または正準場面から導出できる低価値の通常物体へbindingできるときだけ、安定candidate keyで正準objectへの遅延昇格を許す。free action本文、公開ナレーション、表示専用発話、private belief、幻覚・誤認だけを存在根拠にせず、同じ潜在objectを重複昇格しない | Must |
| F-BTL-63 | 遅延昇格と対象操作は論理的に分けて判定し、promotion後の仮snapshotで操作・競合・失敗penaltyを評価したうえで一つの検証済みtransitionとしてcommitする。既に存在した潜在objectは昇格成功・操作失敗でも元配置で残し、成功操作によって初めて生じる派生物は元操作失敗時に生成しない。transition検証自体の失敗時はpromotionを含め部分適用しない | Must |
| F-BTL-64 | 汎用自由行動validatorは自然文キーワードではなく、提案された前後状態差と正準因果contextを検証する。free actionからHP・MP・能力値、canFight、winner、identity、過去event、private cognitionを変更できず、完全な意識喪失・agency剥奪・entity消滅等の決定的変更は専用mechanicsなしに拒否する。相手への拘束・移動阻害等は有界な段階変更と競合解決を要求する | Must |
| F-BTL-65 | 昇格objectは自由記述affordanceと、エンジンが読む検証済みcausal envelopeを分離する。取得・着用・配置・準備はfree actionで行えるが、保持物による直接damageは`basic_attack`または`skill`、防御効果は`defend`または防御skillへ検証済み`instrumentRef`を付けて解決する。damage、defense、reach、control、mobility、vision、hearing、cover等の有限チャネルと上限はサーバーが決め、即席物体をLLM提案だけで特殊武器・防具・回復物へ変えない | Must |
| F-BTL-66 | 自由行動は通常actionと同じinitiative bucketで解決する。順次bucketは先行commit後に再検証し、同時bucketは同じ開始snapshotから評価する。同じ潜在objectのpromotionは一度に正規化し、排他的取得は`contested`とし、一方の同時結果で他方を遡及取消ししない | Must |
| F-BTL-67 | free action失敗penaltyは調停LLMが自由に確定せず、検証済み失敗候補からエンジンが選択する。初期範囲は姿勢、露出、距離、保持物の落下、一時的移動阻害等のworldState操作とし、数値resource penaltyは専用ルールなしに追加しない。provider全失敗時は確定可能な構造化操作以外を`adjudication_unavailable`として状態変更なしで消費し、成功事実やobjectを補完しない | Must |
| F-BTL-68 | turn recordは自然文intent、active objective、参照したprinciple ID、promotion結果、`accepted`・`partial`・`failed`・`contested`、有限理由、確定event ID、world operation種別、penalty種別を有界receiptとして保存する。chain-of-thought、未認知の正準対象、調停用server-only根拠を公開せず、保存済みintent・proposal・receiptからLLM再呼び出しなしでreplayできる | Must |
| F-BTL-69 | サーバーは自己reserve、直近に知覚できた被影響、自分の行動による知覚可能な結果、残りturn等の正準情報から、survival pressure、直近と同程度の影響を再び無防備で受けた場合のrisk、offense/defense adequacy、control/resource/time pressureを定性的な`TacticalNeedFrame`としてSide別に導出する。相手の次行動を予知せず、正確なHP・能力・未認知skill等を入力せず、observer根拠がない項目は`unknown`とする | Must |
| F-BTL-70 | battle setupおよび既存semantic reconciliationは同じ応答内で、正準profile、battlefield、semantic entity、確定eventへbinding可能な潜在affordance候補を提案できる。サーバーは候補を有界registryへ保存し、各Sideには知覚・自己知識の範囲で、observer-local参照、自然文の準備方法、互換性のある既存action kind、定性的causal potentialだけを投影する。この投影はobjectの存在、promotion、操作成功、mechanical effectを確定せず、他Sideだけの観測やprivate正準情報を漏らさない | Must |
| F-BTL-71 | サーバーは`TacticalNeedFrame`とlatent affordanceから、自然文free-action前提、後続の既存action kindと`instrumentRef`、準備turn数、定性的な期待進展・因果potential・riskを結ぶ1〜3turnのobserver-safeな`OpportunityChain`を導出する。Agentは価値profileと戦術的必要性に照らしてchainまたは即時行動を選べるが、成功は保証せず、各段階を実行時snapshotで再検証する | Must |

F-BTL-58〜71は完全受け入れ時の規範要件である。2026-08-05時点のvertical sliceで
実装済みの境界と、同一ターン内の順次反映・失敗penalty・完全replay等の残作業は
[`battle-free-action-objectives.md`](battle-free-action-objectives.md#11-2026-08-05-vertical-slice実装状況)
を正とする。

#### 4.4.1 ターン・パイプライン（論理）

```text
1. サーバー: 前ターンに予約されたA/B意図を凍結し、価値profile・計画参照と安定action IDを記録する。標準行動だけなら次へ進み、free actionがあれば両Sideを一つのserver-only調停要求へまとめる
2. 自由行動調停LLM（条件付き最大1回）: 自然文intentを正準根拠へbindingし、promotion、汎用operation、成功・失敗、定性的causal envelopeを提案する。結果を確定せず、privateな正準情報をキャラへ返さない
3. サーバー: 調停提案をactor authority、到達可能性、能力、保護field、効果上限、promotion provenance、重複、revision、event bindingで検証し、同じターン開始snapshotに対して双方の実行候補とイニシアチブバケットを固定する
4. エンジン: worldStateからarea・キャラ・object/effect干渉を有効状態と係数へ導出してバケットごとに行動を再検証する。同時bucketは同一開始snapshotからpromotion・operation・penalty候補を原子的にmergeし、順次bucketは直前commit後状態から解決して終了条件・機械状態を確定する
5. サーバー: 確定前後状態、promotion/action receiptから機械的な知覚根拠と絶対・相対bandを生成する
6. セマンティック調停LLM: 選択済みprompt構成に従い、確定済み自由行動を含むJSON Pointer世界差分、独立検証可能な非機械的知覚根拠、正準根拠へbinding可能なlatent affordance候補を同一応答または分離応答で提案する
7. サーバー: semantic世界差分と知覚根拠を独立検証し、正準free-action transitionと競合しないlocation・active・entity追加だけを構造化world transitionへ変換してsemantic/worldを原子的に適用する。latent候補は正準根拠、重複、observer access、因果上限を検証して有界registryへ保存するが、この時点では正準objectへ昇格しない
8. サーバー: 正準worldStateからA/Bの初期・継続accessを決め、確定event・検証済み知覚根拠で補強または明示的喪失を反映してcontact registryを更新する。自己reserveと知覚済み因果から`TacticalNeedFrame`を、latent registryからSide別affordance投影と短い`OpportunityChain`を導出し、self/counterpartを含むA/B知覚frameを凍結する
9. キャラLLM（各キャラ独立・並列）: 自分の凍結済み正準プロフィールanchorと正準worldStateから導出したbattle-timeの自己状態override、価値profile、現在plan、知覚frame、関係性情報、`TacticalNeedFrame`、利用可能な標準行動、observer-safeなlatent affordanceと`OpportunityChain`から、有界な目的・計画結論、次の1行動、実発話を更新する。結果を先取りせず、関係別一人称は`identity.selfNames`内へサーバーが再固定する
10. サーバー: 発話・反応の物理的成立を検証し、成立したキャラ出力だけを正準utterance eventへ確定して、実発話からobserver別の聴覚・視覚知覚を更新する
11. サーバー: A/B双方の知覚frameと非公開状態の構造化結論から、A視点用・B視点用ナレータ継続状態を現在選択視点にかかわらず両方更新する。以前に`identified + same_entity`となった安定対象の戦闘内認識名は現在accessと分離して引き継ぎ、読者用公開継続状態とは混同しない
12. サーバー: 語り視点または既存fluid focusに対応する一時的ナレーションview、該当するナレータ継続状態、その視点で安定参照できる認識対象、その視点に許可された表示専用profile anchorとbattle-time override、同じworld object配置から導出したID非公開のscene state fact、実発話ごとのobserver-localな表示コンテキストを生成し、正準話者名を除いてナレータへ渡す
13. ナレータLLM: 許可されたview・表示専用profile anchor・内面digest・表示継続状態・採用済み実発話・確定済みfree-action receiptから、人物像に矛盾しない地の文、実発話の配置、視点上の認知・誤認知を反映した自由な話者ラベル、事実不変な表層加工と構造化された人物同定差分を同一応答で生成する。場面状態が存在と能動性を支える第三者・場面entityについては、表示専用の発話・反応を追加できる
14. サーバー: 人物同定差分は現在view内の安定対象参照だけをナレータ専用継続状態へ保存し、`same_entity`の既知名を一時的知覚低下だけでは置換しない。A/Bの実発話について追加・欠落・source Side不一致・事実変更を正準値へ戻し、制御IDと形式だけを修復する。表示ラベルの内容は再判定せず、source Sideを持たない場面由来発話を公開レンダリングとして保持する。実発話、目的・計画結論、free-action receipt、公開レンダリングを分離して、最新状態・frame・current registry・promotion registry・A/Bナレータ継続状態・短いDramaStateを保存する
```

### 4.5 LLM 役割分担

自由記述の意味解釈は LLM の構造化出力を介する。サーバー・戦闘エンジンは、
自然文のキーワードや正規表現から能力・戦場効果・処理経路を選択してはならない。
明示的検索、安全フィルター、プロトコル／エラー分類、出力形式補正はこの制約の対象外だが、
それらを戦闘メカニクスの選択に利用してはならない。

| ロール | 入力 | 出力 | 禁止 |
|--------|------|------|------|
| キャラ生成器 | 自然文 | CharacterSheet JSON + 公開 blurb | ユーザーに JSON をそのまま返すこと |
| キャラ調整器 | 現行シート + ユーザー発話 | パッチ JSON + 会話応答 | 数値をユーザー文に裸出しする（「HP が 42」等） |
| 状況監督 | バトル状態要約（数値はサーバー側のみ） | シーン/状況更新、係数提案 | エンジン未検証の即時数値確定 |
| ナレータ | 確定ターン結果 + 語り視点別ナレーションview + 視点で絞った表示専用profile anchor + 該当する表示専用ナレータ継続状態と安定参照可能な認識対象 + 許可された内面digest + 正準話者名を除いた採用済み実発話とobserver-localな表示コンテキスト + IDごとの表示ラベル。上限判定時は確定済み裁定 + 直近の公開ナレーション | profileと矛盾しない地の文 + 実発話の配置・視点上の認知や誤認知を反映した自由な話者ラベル・事実不変な表層レンダリング + 同一応答内のナレータ専用人物同定差分 + 場面状態が存在と能動性を支える第三者・場面entityの表示専用発話。上限判定時は裁定を不変のまま囲むユーザー向け表現 | anchorだけを根拠にした属性公開、未設定属性の推測、A/B実発話の新規生成・欠落、正準話者Side・事実・意図・肯否・対象・発話種別の変更、安定対象参照なしの人物同定保存、場面状態が支えない第三者・object能動性の創作、裁定勝者・理由の変更、キャラ状態への書戻し、状態変更、生パラメータ表の読み上げ、許可されない内面の参照、制御IDの文章出力 |
| 自由行動調停LLM | 凍結済みA/B free-action intent + server-only正準world/semantic snapshot + actor能力anchor + promotion根拠候補 | 根拠binding + promotion候補 + 汎用operation候補 + 成功・失敗候補 + 定性的causal envelope | 成否・damage・勝敗の確定、未根拠objectの具現化、自然文からの直接commit、private正準情報のキャラ・公開表示への漏えい、対象ごとの追加呼出し |
| キャラエージェント（各キャラ独立） | 自分の凍結済み正準プロフィールanchor + battle-scoped価値profile + 有界plan + 非公開継続状態 + self/counterpart明示の最新知覚frame + 現在対象と結び付けられる範囲の凍結済み関係・呼称 + `TacticalNeedFrame` + 使用可能標準行動 + observer-safe latent affordance + `OpportunityChain` | プロフィールと整合する更新済み有界な非公開結論状態 + 目的・計画結論 + 次の標準行動または自然文free action + 実発話または反応 | 自己プロフィール確定値との矛盾や未設定値の推測、戦闘効果・free-action成功の確定、未識別対象の正体推定を事実化、公開表示位置・地の文の決定、逐語的思考過程の保存・公開、他キャラ専用観測の直接参照 |
| 審判（上限時） | 確定済み行動・イベントから作る有界な正準ターン事実 + エンジン仮判定（公開ナレータ文・公開レンダリングを含めない） | 勝者 + 事実ベースの生の理由 | エンジン終了条件の上書き（上限時のみ権限）、公開表現を勝敗根拠にすること、ユーザー向けの語り口を決めること |
| 画像生成 | visualPrompt + 追加指示 | 画像 URL / バイナリ保存 | キーのフロント露出 |

### 4.6 プレゼンテーション（UI/ナラティブ）

| ID | 要件 | 優先度 |
|----|------|--------|
| F-UI-01 | メインメニュー画面 | Must |
| F-UI-02 | キャラ管理画面（閲覧・検索・コピー・削除・編集導線） | Must |
| F-UI-03 | 戦闘相手選択画面（手動・ランダム・自動） | Must |
| F-UI-04 | バトル画面: ナレータ文をターンごとに表示 | Must |
| F-UI-05 | キャラのセリフは **「」** で囲み、話者名が分かるようにする | Must |
| F-UI-06 | パラメータ数値は通常 UI に出さない。影響は LLM 要約で伝える | Must |
| F-UI-07 | 決着時は勝敗と短い講評を表示 | Must |
| F-UI-08 | ローディング・エラー・再試行を明示 | Must |

#### 4.6.1 セリフ表記規約

```text
ナレータ: 夕闇の闘技場に、二人の影が対峙する。

【炎の剣士】「この炎で道を開け！」
【氷の魔導】「…熱に浮かれるな。」
```

- キャラセリフは必ず鍵括弧 `「」`
- 話者は表示名または肩書きで直前/同一行に明示
- ナレータは鍵括弧を使わない（地の文）

### 4.7 設定・運用

| ID | 要件 | 優先度 |
|----|------|--------|
| F-CFG-01 | 運用者はサーバー設定で LLM プロバイダを xAI / OpenAI / Venice から優先順付きで設定可能 | Must |
| F-CFG-02 | API キーはサーバー側のみ。フロントバンドルに含めない | Must |
| F-CFG-03 | デフォルトポート（5173 / 3000 等）を避け、ずらしポートを使う | Must |
| F-CFG-04 | 開発用 `.env.example` を同梱 | Must |
| F-CFG-05 | 利用枠・クレジット・レート上限時は当該プロバイダを1時間休止し、次順位へフォールバックする | Must |
| F-CFG-06 | mock LLM は明示的に選択した開発・テスト用途だけで有効にする。実プロバイダ列の末尾へ暗黙追加せず、本番表示用データへ固定 mock 文を保存しない | Must |
| F-CFG-07 | 画像生成は LLM テキスト生成と独立した ImageProvider と優先順を持ち、利用可能な画像プロバイダがなければ API は明示的に失敗する | Must |
| F-CFG-08 | 運用・バランス観測APIは管理者許可リストに含まれる認証ユーザーだけが利用でき、許可リスト未設定時は拒否する | Must |

**初期ポート案（空きを確認して確定）**

| サービス | ポート |
|----------|--------|
| Frontend (Vite) | **5188** |
| Backend API | **3088** |

---

## 5. 非機能要件

| ID | 要件 |
|----|------|
| NFR-01 | フロント・バックは TypeScript |
| NFR-02 | フロントは Vite。バックエンドも同一 monorepo で Vite ツールチェーン（または tsx 開発サーバ）と整合 |
| NFR-03 | 共有型は `packages/shared` に置き FE/BE で参照 |
| NFR-04 | ユニットテスト: バトル解決ロジックは LLM なしで検証可能 |
| NFR-05 | LLM 呼び出しはタイムアウト・リトライ・フォールバック方針を持つ |
| NFR-06 | ログに API キー・パスワードを出さない |
| NFR-07 | 日本語 UI を既定とする |
| NFR-08 | 精度が勝敗やキャラクターシートの整合性へ直結しない抽出・戦場具体化・方針生成・物語生成は fast モデルを使い、engine モデルはキャラクター生成／調整と最終審判へ限定する | Must |
| NFR-09 | 本番バックエンドはローカル永続状態を持たず、複数インスタンスをロードバランサー配下で実行できる | Must |
| NFR-10 | 課金・利用枠・バトル進行は PostgreSQL のトランザクション、冪等キー、期限付きリースで二重処理を防ぐ | Must |
| NFR-11 | 生成画像は共有オブジェクトストレージへ保存し、任意のバックエンドインスタンスから同じURLで参照できる | Must |

---

## 6. 技術スタック（決定）

| 層 | 選択 | 理由 |
|----|------|------|
| Monorepo | npm workspaces | 単純・追加ツール最小 |
| Frontend | Vite + React + TypeScript | 要件の Vite、SPA 画面遷移に十分 |
| Backend | Hono + Node + TypeScript | 軽量、OpenAPI しやすい |
| DB | PostgreSQL 17 (Supabase 東京) | 共有永続状態、トランザクション、複数バックエンド対応。SQLite は移行元とローカル開発に限定 |
| Auth | Supabase Auth + backend JWT 検証 | メール確認、OIDC、複数インスタンスで共有できる認証基盤 |
| LLM | xAI (OpenAI 互換) 既定 / Venice 代替 | 要件どおり |
| 画像 | OpenAI 互換 ImageProvider（xAI / 設定済み Venice） | キャラ・戦場画像生成 |
| 画像保存 | Cloudflare R2 | ローカルディスク依存を除去し、複数インスタンスで共有 |
| 設計記録 | llmthink DSL | 要件 (13) |
| 実装計画 | perttool | 要件 (13) |

### 6.1 LLM 接続方針

- **SpaceXAI / xAI:** `XAI_API_KEY`, base `https://api.x.ai/v1`, 既定モデルは docs 確認後に固定（スキャフォールド時は設定可能に）
- **Venice:** `VENICE_API_KEY` + 公式 base URL。アダプタ同一 IF
- テキスト生成は `LlmProvider`、画像生成は `ImageProvider` を経由し、ルートからベンダー固有 HTTP を呼ばない

---

## 7. 画面一覧（初期）

1. **ログイン / 登録**
2. **メインメニュー** — キャラ管理 / 対戦 / 設定
3. **キャラ一覧** — 検索・カード表示（画像 or プレースホルダ、blurb のみ）
4. **キャラ生成ウィザード** — 自然文入力 → 会話レビュー → 確定
5. **キャラ詳細** — 会話編集・画像生成・コピー・削除
6. **相手選択** — 手動 / ランダム / 自動
7. **バトル** — ログストリーム（ナレータ + セリフ）、行動 UI、結果モーダル

---

## 8. API 概要（論理）

| Method | Path | 概要 |
|--------|------|------|
| Supabase Auth | `/auth/v1/*` | メール登録・確認、Google OAuth、ログイン、ログアウト、パスワード再設定 |
| GET | `/api/me` | Bearer JWTを検証し、対応するアプリ内ユーザーを返す |
| GET | `/api/me` | 自分 |
| GET | `/api/characters` | 自分のキャラ一覧（公開 DTO） |
| POST | `/api/characters/generate` | 自然文から V2 authoring candidate を生成 |
| GET | `/api/character-drafts/latest` | 自分の最新 V2 authoring candidate |
| POST | `/api/character-drafts/:id/chat` | V2 authoring candidate の会話調整 |
| DELETE | `/api/character-drafts/:id` | V2 authoring candidate の破棄 |
| POST | `/api/characters/:id/chat` | V2 immutable revision candidate の生成 |
| POST | `/api/characters/:id/confirm` | V2 candidate を immutable generation として確定 |
| POST | `/api/characters/:id/upgrade` | 既存キャラから V2 upgrade candidate を生成 |
| POST | `/api/characters/:id/copy` | コピー |
| DELETE | `/api/characters/:id` | 削除 |
| POST | `/api/characters/:id/image` | ready V2 キャラの画像を immutable generation として生成 |
| POST | `/api/characters/:id/image/toggle` | ready V2 キャラの画像を immutable generation として切替 |
| POST | `/api/characters/:id/restore-revision` | ready V2 キャラの前世代を新しい immutable generation として復元 |
| POST | `/api/battlefields/:id/image` | 戦場画像生成 |
| GET | `/api/match/candidates` | 相手候補 |
| POST | `/api/match/random` | ランダム相手 |
| POST | `/api/match/auto` | 同程度の相手を自動選択 |
| POST | `/api/battles` | バトル開始 |
| GET | `/api/battles/:id` | 状態取得（数値なし DTO） |
| POST | `/api/battles/:id/action` | 行動送信 → 解決 + ナレーション |

詳細 OpenAPI は実装フェーズで `docs/api.md` に分離してよい。

---

## 9. 受け入れ条件（初期リリース）

1. 2 ユーザーを登録し、それぞれキャラを自然文生成・会話調整できる  
2. UI 上どこにも生パラメータ JSON / HP 数値が表示されない  
3. 対戦を開始し、各ターンにナレータ文と `「」` セリフが出る  
4. HP 相当が尽きた場合に勝敗が付き、ターン上限時は総合評価で勝敗が付く  
5. キャラの検索・コピー・削除ができる  
6. ランダム相手選択ができる  
7. `XAI_API_KEY` なしでもモック LLM で UI フローを通せる  
8. フロント 5188 / API 3088 で起動する  

---

## 10. 設計・計画ドキュメント

| 成果物 | パス | ツール |
|--------|------|--------|
| 本要件（親） | `docs/requirements.md` | — |
| 設計判断 | `docs/design.llmthink.dsl` | llmthink |
| 実装計画 | `docs/plan.pert` | perttool |
| 戦闘セマンティック状態 詳細設計 | `docs/battle-semantic-state.md` | Markdown + Zod/JSON Pointer設計 |
| 戦闘セマンティック状態 修正計画 | `docs/battle-semantic-state.pert` | perttool |
| キャラ別知覚・自己フィードバック詳細設計 | `docs/battle-perception.md` | Markdown + llmthink決定 |
| キャラ別知覚・自己フィードバック修正計画 | `docs/battle-perception.pert` | perttool |
| 戦闘内呼称・ナレータ継続状態 詳細設計 | `docs/battle-social-narrator-continuity.md` | Markdown + llmthink決定 |
| 戦闘内呼称・ナレータ継続状態 実装計画 | `docs/battle-social-narrator-continuity.pert` | perttool |
| 価値駆動自由行動・遅延object昇格 詳細設計 | `docs/battle-free-action-objectives.md` | Markdown + llmthink決定 |
| 価値駆動自由行動・遅延object昇格 実装計画 | `docs/battle-free-action-objectives.pert` | perttool |

設計変更は llmthink の decision を更新し、タスク境界は perttool の DAG で管理する。

---

## 11. リスクと方針

| リスク | 緩和 |
|--------|------|
| LLM が不正 JSON / 過大係数を返す | JSON スキーマ検証 + 係数 clamp + エンジン最終決定 |
| トークン費用 | モックモード、短いプロンプト、ターン要約の圧縮 |
| 数値隠蔽とデバッグ困難 | サーバー側トレースログ（開発時のみ詳細） |
| プロバイダ差異 | `LlmProvider` アダプタ |
| 同時対戦の状態競合 | バトル単位の直列化ロック（メモリ or DB） |

---

## 12. 改訂履歴

| 版 | 日付 | 内容 |
|----|------|------|
| 0.1 | （草案） | 箇条書き要望のみ |
| 1.0 | 2026-08-02 | 全面書き直し。スコープ・IF・受け入れ条件を定義 |
| 1.1 | 2026-08-04 | 戦闘中の構造化セマンティック状態、差分適用、外見・物体・内面の因果的継続性を追加 |
| 1.2 | 2026-08-04 | 状態履歴の複製を廃止し、最新状態・最新差分・A/B別有界観測へ整理 |
| 1.3 | 2026-08-04 | observer-relative知覚、絶対・相対band、未識別contact、語り視点別ID境界、prompt分離判断を追加 |
| 1.4 | 2026-08-05 | キャラ起点の実発話、表示専任ナレータ、独立裁定LLM、Side中立のイニシアチブ窓と同時競合規則を追加 |
| 1.5 | 2026-08-05 | サーバー所有の粗い正準worldState、有限の位置・状態・物体関係、原子的transition境界を追加 |
| 1.6 | 2026-08-05 | キャラ自身の正準プロフィールanchorと、視点制限されたナレータ表示専用anchorを分離し、未設定属性の推測禁止を追加 |
| 1.7 | 2026-08-05 | 正準worldStateによる現実的な初期認知、access継続、明示的喪失、provider・projection失敗時の保持規則を追加 |
| 1.8 | 2026-08-05 | 正準identityと見かけbeliefを分離し、キャラ起点の実発話eventを物理・聴覚・言語条件からobserver別知覚へ投影する規則を追加 |
| 1.9 | 2026-08-05 | worldStateとobserver別frameからの実行可能行動候補、正準再検証、部分成立・自己完結代替・理由付き失敗を追加 |
| 1.10 | 2026-08-05 | area・キャラ・object/effectの構造化因果を有効状態・係数・world transitionへ接続し、未認知原因と認知可能な結果の投影を分離 |
| 1.11 | 2026-08-05 | 戦闘開始時の対峙・関係性コンテキスト、正準話者と表示話者ラベルの分離、A/B視点別ナレータ継続状態、構造化内面結論を追加 |
| 1.12 | 2026-08-05 | 話者ラベルの有限候補制限を撤廃し、語り視点に射影済みの情報を唯一の内容境界として自由な構造化ラベルと場面根拠の第三者発話を許可 |
| 1.13 | 2026-08-05 | 追加LLM呼び出しなしで視点別ナレータ人物同定を同一応答から更新し、`identified + same_entity`の戦闘内認識名を一時的知覚低下から保護 |
| 1.14 | 2026-08-05 | プロフィール由来の価値優先順位と有界な行動計画、戦術的必要性・潜在affordance・複数turnの機会認知、自然文free action、汎用LLM調停、遅延object昇格、即席物体の検証済み攻防利用を追加 |
| 1.15 | 2026-08-05 | profile由来objectの戦闘中状態を永続profileへ書き戻さず、正準worldStateから現在profile overrideと視点別scene state factを二重投影する規則を追加 |

---

## 付録 A. 元要望との対応

| # | 元要望 | 本要件 |
|---|--------|--------|
| 1 | キャラ構造化 | §4.2 / 4.2.1 |
| 2 | 自然文生成 + レビュー微調整 | F-CHR-03, 04 |
| 3 | 生データ非表示・会話伝達 | F-CHR-05, 06 / F-UI-06 |
| 4 | 複数ユーザー・ターン制対戦 | §4.1, §4.4 |
| 5 | シーン係数は LLM、ターン効果はプログラム | F-BTL-02, 03 / §4.5 |
| 6 | 維持パラメータ枯渇で終了 | F-BTL-04 |
| 7 | ターン上限 + LLM 総合評価 | F-BTL-05 |
| 8 | パラメータ非表示・結果要約 | F-UI-06 |
| 9 | ナレータ | F-UI-04 / §4.5 |
| 10 | セリフ「」と話者明示 | F-UI-05 / §4.6.1 |
| 11 | Vite FE/BE | §6 |
| 12 | 非デフォルトポート | F-CFG-03 / 5188・3088 |
| 13 | llmthink + perttool | §10 |
| 14 | メニュー / キャラ管理 / 相手選択 | §7 |
| 15 | キャラ画像 AI 生成 | F-CHR-09, 10 |
