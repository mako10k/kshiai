# AI闘技場（旧称 kshiai）

自然文から生成したキャラクター同士を、複数ユーザーがターン制で戦わせる Web ゲームです。

- **数値解決**はプログラム（バトルエンジン）
- **状況・ナレーション・セリフ**は LLM
- **パラメータの生値は UI に出さない**（物語と「」セリフで伝える）

詳細要件: [docs/requirements.md](docs/requirements.md)  
設計 (llmthink): [docs/design.llmthink.dsl](docs/design.llmthink.dsl)  
実装計画 (perttool): [docs/plan.pert](docs/plan.pert)

## 技術構成

| 層 | 技術 | ポート |
|----|------|--------|
| Frontend | Vite + React + TypeScript | **5188** |
| Backend | Hono + TypeScript | **3088** |
| Shared | zod スキーマ / DTO | — |
| DB | SQLite | — |
| LLM | mock / xAI / Venice | — |

## 公開 URL

- **https://kshiai.mk10.org**（Cloudflare Tunnel → Vite `127.0.0.1:5188`、API は `/api` プロキシ）
- 手順メモ: [docs/cloudflare_tunnel.md](docs/cloudflare_tunnel.md)

### 常駐（kaix と同系）

| 役割 | 仕組み |
|------|--------|
| アプリ | PM2 `ecosystem.config.cjs`（`kshiai-backend` / `kshiai-frontend`）+ `pm2-mako10k.service` |
| Tunnel | systemd `cloudflared-kshiai.service` |

```bash
pm2 start ecosystem.config.cjs && pm2 save
sudo systemctl enable --now cloudflared-kshiai
```

## セットアップ

```bash
cp .env.example .env
npm install
npm run dev:backend   # http://127.0.0.1:3088
npm run dev:frontend  # http://127.0.0.1:5188
```

既定の `LLM_PROVIDER=mock` なら API キーなしで UI フローを通せます。  
本番相当で xAI を使う場合:

```bash
# .env
LLM_PROVIDER=xai
XAI_API_KEY=xai-...
```

## 主要画面

1. ログイン / 登録  
2. メインメニュー  
3. キャラ管理（生成・会話調整・検索・コピー・削除・画像）  
4. 戦場管理（プリセット・地形/障害ヒント・画像・試合からの保存）  
5. 相手選択（手動 / ランダム / 自動、戦場は未指定＝ランダム）  
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
