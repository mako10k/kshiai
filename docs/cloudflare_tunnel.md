# Cloudflare Tunnel — kshiai.mk10.org

kaix.mk10.org と同じ構成で、ローカル Vite（`127.0.0.1:5188`）を Cloudflare Tunnel 経由で公開する。

## 前提

- `cloudflared` インストール済み
- `mk10.org` が Cloudflare DNS 管理下
- アプリ: backend `3088` / frontend `5188`（API は Vite proxy `/api`）

## セットアップ（初回）

```bash
cloudflared login
cloudflared tunnel create kshiai
# credentials: ~/.cloudflared/<TUNNEL_ID>.json

# config.yml の tunnel / credentials-file を更新
# 例: tunnel: <TUNNEL_ID>
#     credentials-file: /home/mako10k/.cloudflared/<TUNNEL_ID>.json

cloudflared tunnel route dns kshiai kshiai.mk10.org
```

## systemd

```bash
sudo cp /home/mako10k/kshiai/infra/cloudflare/cloudflared-kshiai.service \
  /etc/systemd/system/cloudflared-kshiai.service
sudo systemctl daemon-reload
sudo systemctl enable --now cloudflared-kshiai
systemctl status cloudflared-kshiai
```

## アプリ常駐（PM2 — kaix と同系）

フロントは **本番ビルド + `vite preview`**（Cloudflare / iOS 向け。dev サーバは不安定になりやすい）。

```bash
cd /home/mako10k/kshiai
npm run build --workspace=@kshiai/shared
npm run build --workspace=@kshiai/frontend
pm2 start ecosystem.config.cjs
# または再起動
pm2 restart kshiai-backend kshiai-frontend
pm2 save
# 既に pm2-mako10k.service が enable なら reboot 後も復帰
```

## 確認

```bash
curl -I http://127.0.0.1:5188/
curl -I https://kshiai.mk10.org/
cloudflared tunnel info kshiai
```

## トラブル

| 症状 | 確認 |
|------|------|
| 530 / 1033 | tunnel connector 未接続、`systemctl status cloudflared-kshiai` |
| ログインできない | `CORS_ORIGIN` に `https://kshiai.mk10.org`、`COOKIE_SECURE=true` |
| Host not allowed | `vite.config.ts` の `allowedHosts` |
