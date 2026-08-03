#!/usr/bin/env bash
# Pull LLM API keys from secdat into gitignored .env (values never echoed).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v secdat >/dev/null; then
  echo "secdat not found" >&2
  exit 1
fi

if ! secdat get XAI_API_KEY --stdout >/dev/null 2>&1; then
  echo "secdat domain is locked or XAI_API_KEY missing." >&2
  echo "Run: secdat --dir /home/mako10k unlock" >&2
  echo "Then re-run: npm run sync:secdat" >&2
  exit 1
fi

XAI="$(secdat get XAI_API_KEY --stdout)"
OPENAI=""
if secdat get OPENAI_API_KEY --stdout >/dev/null 2>&1; then
  OPENAI="$(secdat get OPENAI_API_KEY --stdout)"
fi
VENICE=""
if secdat get VENICEAI_API_KEY --stdout >/dev/null 2>&1; then
  VENICE="$(secdat get VENICEAI_API_KEY --stdout)"
elif secdat get VENICE_API_KEY --stdout >/dev/null 2>&1; then
  VENICE="$(secdat get VENICE_API_KEY --stdout)"
fi

ENV_FILE="$ROOT/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ROOT/.env.example" "$ENV_FILE"
fi

set_kv() {
  local key="$1" value="$2" file="$3"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    # portable in-place replace without printing value
    python3 - "$key" "$value" "$file" <<'PY'
import re, sys
key, value, path = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(path).read()
pat = re.compile(rf"^{re.escape(key)}=.*$", re.M)
line = f"{key}={value}"
text = pat.sub(line, text) if pat.search(text) else text.rstrip("\n") + "\n" + line + "\n"
open(path, "w").write(text if text.endswith("\n") else text + "\n")
PY
  else
    printf '%s=%s\n' "$key" "$value" >>"$file"
  fi
}

set_kv LLM_PROVIDER xai "$ENV_FILE"
set_kv LLM_PROVIDER_ORDER "xai,openai,venice" "$ENV_FILE"
set_kv ALLOW_MOCK_FALLBACK "false" "$ENV_FILE"
set_kv LLM_QUOTA_COOLDOWN_MS "3600000" "$ENV_FILE"
set_kv IMAGE_PROVIDER_ORDER "xai,venice" "$ENV_FILE"
set_kv XAI_API_KEY "$XAI" "$ENV_FILE"
set_kv XAI_BASE_URL "https://api.x.ai/v1" "$ENV_FILE"
set_kv XAI_MODEL "grok-4.5" "$ENV_FILE"
set_kv XAI_IMAGE_MODEL "grok-imagine-image" "$ENV_FILE"
if [[ -n "$OPENAI" ]]; then
  set_kv OPENAI_API_KEY "$OPENAI" "$ENV_FILE"
  set_kv OPENAI_BASE_URL "https://api.openai.com/v1" "$ENV_FILE"
  set_kv OPENAI_MODEL_ENGINE "gpt-4.1" "$ENV_FILE"
  set_kv OPENAI_MODEL_FAST "gpt-4.1-mini" "$ENV_FILE"
fi
if [[ -n "$VENICE" ]]; then
  set_kv VENICE_API_KEY "$VENICE" "$ENV_FILE"
  set_kv VENICEAI_API_KEY "$VENICE" "$ENV_FILE"
fi

DEPLOYMENT_KEYS=(
  SUPABASE_URL
  SUPABASE_PROJECT_REF
  SUPABASE_PUBLISHABLE_KEY
  SUPABASE_SECRET_KEY
  DATABASE_URL
  DIRECT_URL
  R2_ACCOUNT_ID
  R2_ACCESS_KEY_ID
  R2_SECRET_ACCESS_KEY
  R2_BUCKET
  R2_PUBLIC_BASE_URL
)
SYNCED_DEPLOYMENT_KEYS=()
for key in "${DEPLOYMENT_KEYS[@]}"; do
  if secdat get "$key" --stdout >/dev/null 2>&1; then
    value="$(secdat get "$key" --stdout)"
    set_kv "$key" "$value" "$ENV_FILE"
    SYNCED_DEPLOYMENT_KEYS+=("$key")
  fi
done

R2_READY=true
for key in R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET R2_PUBLIC_BASE_URL; do
  if ! secdat get "$key" --stdout >/dev/null 2>&1; then
    R2_READY=false
    break
  fi
done
if [[ "$R2_READY" == true ]]; then
  set_kv MEDIA_STORAGE r2 "$ENV_FILE"
fi

echo "Updated $ENV_FILE from secdat"
echo "  LLM_PROVIDER=xai"
echo "  XAI_API_KEY=*** (len=${#XAI})"
if [[ -n "$OPENAI" ]]; then
  echo "  OPENAI_API_KEY=*** (len=${#OPENAI})"
else
  echo "  OPENAI_API_KEY=(not found in secdat)"
fi
if [[ -n "$VENICE" ]]; then
  echo "  VENICE_API_KEY=*** (len=${#VENICE})"
else
  echo "  VENICE_API_KEY=(not found in secdat)"
fi
if [[ ${#SYNCED_DEPLOYMENT_KEYS[@]} -gt 0 ]]; then
  echo "  deployment keys synced: ${SYNCED_DEPLOYMENT_KEYS[*]}"
fi
if [[ "$R2_READY" == true ]]; then
  echo "  MEDIA_STORAGE=r2"
else
  echo "  MEDIA_STORAGE unchanged (R2 key set incomplete)"
fi
