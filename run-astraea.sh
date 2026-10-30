#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

BASE_PORT="${ASTRAEA_PORT:-3000}"
LOG_FILE="${TMPDIR:-/tmp}/astraea-4x-dev.log"
SERVER_PID=""

fail() {
  printf '\n[Fehler] %s\n' "$*" >&2
  if [[ -t 0 ]]; then
    read -r -p "Enter zum Schließen ..." _
  fi
  exit 1
}

open_browser() {
  [[ "${ASTRAEA_NO_BROWSER:-0}" == "1" ]] && return 0
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$1" >/dev/null 2>&1 &
  elif command -v gio >/dev/null 2>&1; then
    gio open "$1" >/dev/null 2>&1 &
  elif command -v sensible-browser >/dev/null 2>&1; then
    sensible-browser "$1" >/dev/null 2>&1 &
  else
    printf 'Browser konnte nicht automatisch geöffnet werden. Bitte öffne %s manuell.\n' "$1"
  fi
}

page_is_astraea() {
  curl -fsS --max-time 2 "$1" 2>/dev/null | grep -q "Astraea 4X"
}

port_in_use() {
  ss -ltnH "sport = :$1" 2>/dev/null | grep -q .
}

command -v node >/dev/null 2>&1 || fail "Node.js ist nicht installiert."
command -v npm >/dev/null 2>&1 || fail "npm ist nicht installiert."
command -v curl >/dev/null 2>&1 || fail "curl ist nicht installiert."
command -v ss >/dev/null 2>&1 || fail "ss (iproute2) ist nicht installiert."

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$NODE_MAJOR" -ge 18 ]] || fail "Node.js >= 18 wird benötigt (gefunden: $(node --version))."

for ((port = BASE_PORT; port < BASE_PORT + 20; port++)); do
  if page_is_astraea "http://localhost:${port}/"; then
    printf 'Astraea 4X läuft bereits: http://localhost:%s/\n' "$port"
    open_browser "http://localhost:${port}/"
    exit 0
  fi
done

if [[ ! -d node_modules ]]; then
  printf 'Installiere Abhängigkeiten ...\n'
  npm install --no-audit --no-fund || fail "npm install ist fehlgeschlagen."
elif [[ package-lock.json -nt node_modules/.package-lock.json ]] || [[ package.json -nt node_modules/.package-lock.json ]]; then
  printf 'Aktualisiere Abhängigkeiten ...\n'
  npm install --no-audit --no-fund || fail "npm install ist fehlgeschlagen."
fi

PORT=""
for ((port = BASE_PORT; port < BASE_PORT + 20; port++)); do
  if ! port_in_use "$port"; then
    PORT="$port"
    break
  fi
done
[[ -n "$PORT" ]] || fail "Kein freier Port im Bereich ${BASE_PORT}-$((BASE_PORT + 19)) gefunden."

URL="http://localhost:${PORT}/"
printf 'Starte Astraea 4X auf %s ...\n' "$URL"
: > "$LOG_FILE"
setsid ./node_modules/.bin/vite --port "$PORT" --host 127.0.0.1 --strictPort >"$LOG_FILE" 2>&1 &
SERVER_PID=$!

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill -- "-$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

for _ in {1..60}; do
  if page_is_astraea "$URL"; then
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    printf '\nDer Entwicklungsserver wurde beendet. Log: %s\n' "$LOG_FILE" >&2
    tail -n 30 "$LOG_FILE" >&2 || true
    fail "Astraea 4X konnte nicht gestartet werden."
  fi
  sleep 0.5
done

page_is_astraea "$URL" || fail "Zeitüberschreitung beim Start. Log: $LOG_FILE"

printf 'Astraea 4X ist bereit: %s\n' "$URL"
printf 'Beenden: Strg+C oder dieses Fenster schließen.\n'
open_browser "$URL"

wait "$SERVER_PID"
