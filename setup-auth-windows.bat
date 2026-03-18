@echo off
REM Sets up the custom URI scheme handler on Windows, then runs the auth flow.

set "HANDLER_PATH=%~dp0bl-auth-handler.bat"

REM Create the callback handler
(
echo @echo off
echo echo %%1 ^> "%%TEMP%%\bl_auth_code.txt"
) > "%HANDLER_PATH%"

REM Register the URI scheme in the registry
reg add "HKCU\Software\Classes\com.gamesworkshop.bl" /ve /d "URL:BL Auth Handler" /f >nul
reg add "HKCU\Software\Classes\com.gamesworkshop.bl" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\com.gamesworkshop.bl\shell\open\command" /ve /d "\"%HANDLER_PATH%\" \"%%1\"" /f >nul

echo URI handler registered.
echo.

REM Run the auth script
node "%~dp0auth.mjs"
