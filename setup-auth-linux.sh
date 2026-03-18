#!/bin/bash
# Sets up the custom URI scheme handler on Linux, then runs the auth flow.
set -e

HANDLER_PATH="$HOME/.local/bin/bl-auth-handler.sh"
DESKTOP_PATH="$HOME/.local/share/applications/bl-auth.desktop"

mkdir -p "$(dirname "$HANDLER_PATH")" "$(dirname "$DESKTOP_PATH")"

# Create the handler script
cat > "$HANDLER_PATH" << 'SCRIPT'
#!/bin/bash
echo "$1" > /tmp/bl_auth_code.txt
SCRIPT
chmod +x "$HANDLER_PATH"

# Register the URI scheme
cat > "$DESKTOP_PATH" << DESKTOP
[Desktop Entry]
Name=BL Auth Handler
Exec=$HANDLER_PATH %u
Type=Application
MimeType=x-scheme-handler/com.gamesworkshop.bl;
DESKTOP

xdg-mime default bl-auth.desktop x-scheme-handler/com.gamesworkshop.bl
update-desktop-database "$(dirname "$DESKTOP_PATH")" 2>/dev/null || true

echo "URI handler registered."
echo ""

# Run the auth script
node "$(dirname "$0")/auth.mjs"
