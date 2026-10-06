@echo off
rem Double-click to run the Time Tracker on this PC, then use it at http://localhost:5173
cd /d "%~dp0"
if not exist node_modules call npm install
start "" http://localhost:5173
call npm run dev -- --port 5173 --strictPort
