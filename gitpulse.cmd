@echo off
"%~dp0node_modules\.bin\tsx.cmd" --tsconfig "%~dp0tsconfig.json" "%~dp0cli\index.ts" %*
