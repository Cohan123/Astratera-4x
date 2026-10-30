#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}"
APP_DIR="$DATA_DIR/applications"
ICON_DIR="$DATA_DIR/icons/hicolor/scalable/apps"
ICON_PATH="$ICON_DIR/astraea-4x.svg"
DESKTOP_PATH="$APP_DIR/astraea-4x.desktop"

chmod +x "$PROJECT_DIR/run-astraea.sh"
mkdir -p "$APP_DIR" "$ICON_DIR"
install -m 0644 "$PROJECT_DIR/assets/astraea-4x.svg" "$ICON_PATH"

cat > "$DESKTOP_PATH" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=Astraea 4X
GenericName=Weltraum-Strategiespiel
Comment=Galaktische Foundations starten und im Browser spielen
Exec="$PROJECT_DIR/run-astraea.sh"
TryExec=$PROJECT_DIR/run-astraea.sh
Path=$PROJECT_DIR
Icon=astraea-4x
Terminal=true
StartupNotify=true
Categories=Game;StrategyGame;
Keywords=4X;Strategie;Science-Fiction;Weltraum;
EOF

chmod +x "$DESKTOP_PATH"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APP_DIR" >/dev/null 2>&1 || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -f -t "$DATA_DIR/icons/hicolor" >/dev/null 2>&1 || true
fi

printf 'Launcher installiert: %s\n' "$DESKTOP_PATH"
printf 'Astraea 4X ist jetzt im Anwendungsmenü unter „Spiele“ zu finden.\n'
printf 'Direkt starten: %s\n' "$PROJECT_DIR/run-astraea.sh"
