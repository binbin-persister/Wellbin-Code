@echo off
REM Use `bun` (not `bun run`) so Windows resolves Unicode paths in dev.ts reliably.
bun "%~dp0dev.ts" %*
exit /b %ERRORLEVEL%
