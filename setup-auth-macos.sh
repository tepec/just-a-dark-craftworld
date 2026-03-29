#!/bin/bash
# Sets up the custom URI scheme handler on macOS, then runs the auth flow.
set -euo pipefail

APP_NAME="BL Auth Handler.app"
APP_DIR="$HOME/Applications/$APP_NAME"
PLIST_PATH="$APP_DIR/Contents/Info.plist"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
CODE_FILE="$(node -p "require('node:path').join(require('node:os').tmpdir(), 'bl_auth_code.txt')")"

mkdir -p "$HOME/Applications"
rm -rf "$APP_DIR"

# Build a real macOS app so the custom URI is delivered via `open location`.
osacompile -o "$APP_DIR" <<APPLESCRIPT
on open location callbackUrl
	if callbackUrl is missing value then return
	if (callbackUrl as text) is "" then return

	set callbackFile to POSIX file "$CODE_FILE"
	set fileRef to missing value

	try
		set fileRef to open for access callbackFile with write permission
		set eof fileRef to 0
		write (callbackUrl as text) to fileRef starting at 1
		close access fileRef
	on error
		try
			if fileRef is not missing value then close access fileRef
		end try
	end try
end open location
APPLESCRIPT

# Replace the generated plist so URL scheme registration is deterministic.
cat > "$PLIST_PATH" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>applet</string>
  <key>CFBundleIconFile</key>
  <string>applet</string>
  <key>CFBundleIdentifier</key>
  <string>com.gamesworkshop.bl.authhandler</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>BL Auth Handler</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSUIElement</key>
  <true/>
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLName</key>
      <string>com.gamesworkshop.bl</string>
      <key>CFBundleURLSchemes</key>
      <array>
        <string>com.gamesworkshop.bl</string>
      </array>
    </dict>
  </array>
</dict>
</plist>
PLIST

if [ -x "$LSREGISTER" ]; then
  "$LSREGISTER" -f "$APP_DIR" >/dev/null
else
  echo "Warning: lsregister not found; the handler app was created but may not be registered yet." >&2
fi

echo "URI handler registered."
echo ""

# Run the auth script
node "$(dirname "$0")/auth.mjs"
