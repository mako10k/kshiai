# AI闘技場（旧称 kshiai）

自然文から生成したキャラクター同士を、複数ユーザーがターン制で戦わせる Web ゲームです。

- **数値解決**はプログラム（バトルエンジン）
- **状況・ナレーション・セリフ**は LLM
- **パラメータの生値は UI に出さない**（物語と「」セリフで伝える）

詳細要件: [docs/requirements.md](docs/requirements.md)  
設計 (llmthink): [docs/design.llmthink.dsl](docs/design.llmthink.dsl)  
実装計画 (perttool): [docs/plan.pert](docs/plan.pert)

戦闘中の構造化状態設計: [docs/battle-semantic-state.md](docs/battle-semantic-state.md)

キャラ別知覚・自己フィードバック設計: [docs/battle-perception.md](docs/battle-perception.md)

同修正計画 (perttool): [docs/battle-semantic-state.pert](docs/battle-semantic-state.pert)

キャラ別知覚・自己フィードバック修正計画 (perttool): [docs/battle-perception.pert](docs/battle-perception.pert)

仮説優先の本番戦闘パイプライン実装・試行計画: [docs/battle-pipeline-production-rollout.md](docs/battle-pipeline-production-rollout.md) / [PERT](docs/battle-pipeline-causal-slice.pert) / [実績・Velocity](docs/battle-pipeline-actuals.md)

価値駆動の自由行動・遅延object昇格設計: [docs/battle-free-action-objectives.md](docs/battle-free-action-objectives.md)

同実装計画 (perttool): [docs/battle-free-action-objectives.pert](docs/battle-free-action-objectives.pert)

PostgreSQL 移行: [docs/postgres_migration.md](docs/postgres_migration.md)
旧アカウント移管: [docs/legacy_account_migration.md](docs/legacy_account_migration.md)
クラウド実行環境: [docs/cloud_runtime.md](docs/cloud_runtime.md)
本番切替記録: [docs/cloud_cutover.md](docs/cloud_cutover.md)
リリース規約: [docs/release_process.md](docs/release_process.md)
CI/CD運用: [docs/cicd.md](docs/cicd.md)
変更履歴: [CHANGELOG.md](CHANGELOG.md)

## 技術構成

| 層 | 技術 | ポート |
|----|------|--------|
| Frontend | Vite + React + TypeScript | **5188** |
| Backend | Hono + TypeScript | **3088** |
| Shared | zod スキーマ / DTO | — |
| DB | PostgreSQL / Supabase（本番）、SQLite（ローカル開発） | — |
| LLM | mock / xAI / Venice | — |

## 公開 URL

- **https://kshiai.mk10.org**（Cloudflare Worker静的配信 → `/api` はCloud Runへストリーミングプロキシ）
- 旧Tunnel手順・ロールバック: [docs/cloudflare_tunnel.md](docs/cloudflare_tunnel.md)

### 本番常駐

| 役割 | 仕組み |
|------|--------|
| Frontend / edge proxy | Cloudflare Worker `kshiai-web` |
| Backend | Cloud Run `kshiai-api`（東京、0〜3インスタンス） |
| 旧ローカルアプリ | PM2 `kshiai-backend` / `kshiai-frontend` は停止済み |
| ロールバックTunnel | systemd `cloudflared-kshiai.service`（設定保持） |

```bash
gcloud run services describe kshiai-api --project=kshiai --region=asia-northeast1
CLOUDFLARE_API_TOKEN="$(secdat get CLOUDFLARE_WORKERS_API_TOKEN --stdout)" \
  npx wrangler deployments list --config infra/cloudflare-worker/wrangler.jsonc
```

## セットアップ

```bash
cp .env.example .env
npm install
npm run dev:backend   # http://127.0.0.1:3088
npm run dev:frontend  # http://127.0.0.1:5188
```

既定の `LLM_PROVIDER=mock` なら API キーなしで UI フローを通せます。  
本番では `LLM_PROVIDER_ORDER` の順に試行します。利用枠／レート上限になった
プロバイダは既定で1時間スキップし、次へフォールバックします。mock は実プロバイダ
列へ暗黙追加されず、`NODE_ENV=production` では選択できません。
キャラクター本体の生成・調整と最終審判は engine モデルを使い、実況、キャラ状態、
人物メタデータ、戦場、ケース方針などは fast モデルを使います。

```bash
# .env
LLM_PROVIDER=xai
LLM_PROVIDER_ORDER=xai,openai,venice
ALLOW_MOCK_FALLBACK=false
LLM_QUOTA_COOLDOWN_MS=3600000
IMAGE_PROVIDER_ORDER=xai,venice
XAI_API_KEY=xai-...
XAI_IMAGE_MODEL=grok-imagine-image
OPENAI_API_KEY=sk-...
VENICEAI_API_KEY=...
# Venice を画像フォールバックにも使う場合だけ設定
VENICE_IMAGE_MODEL=...
```

本番では PostgreSQL と共有 R2 メディア設定も必須です。必要な環境変数、
マイグレーション、複数インスタンス時の挙動は
[`docs/distributed_runtime.md`](docs/distributed_runtime.md) を参照してください。

本番認証はSupabase Authを使い、確認済みメールとGoogleログインに対応します。
設定と検証手順は [`docs/supabase_auth.md`](docs/supabase_auth.md) を参照してください。

## 主要画面

1. ログイン / 登録  
2. メインメニュー  
3. キャラ管理（生成・会話調整・検索・コピー・削除・画像）  
4. 戦場管理（プリセット・地形/障害ヒント・画像・試合からの保存）  
5. 相手選択（手動 / ランダム、戦場は未指定＝ランダム）  
6. バトル（ナレータ + セリフログ + 戦場表示）

## 開発メモ

```bash
# 共有型のビルド
npm run build --workspace=@kshiai/shared

# テスト
npm test

# 設計監査
llmthink dsl audit docs/design.llmthink.dsl

# 計画検証
perttool document check docs/plan.pert
perttool dag analyze docs/plan.pert
```

## ライセンス

Private / TBD
