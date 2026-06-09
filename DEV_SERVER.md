# Running the Dev Server

## Quick start

**Linux/macOS:**
```bash
# From the project root (Mtheory/)
.venv/bin/python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Windows (PowerShell):**
```powershell
# From the project root (Mtheory/)
.venv\Scripts\python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Open [http://localhost:8000](http://localhost:8000) in your browser.

`--reload` watches for file changes and restarts automatically — no manual restart needed when editing Python files. Static files (JS, CSS) are served directly and take effect on the next browser refresh.

## First-time setup

If the venv is missing packages (e.g. after a fresh clone):

**Linux/macOS:**
```bash
.venv/bin/pip install -r requirements.txt
```

**Windows (PowerShell):**
```powershell
.venv\Scripts\pip install -r requirements.txt
```

If `.venv` doesn't exist yet:

**Linux/macOS:**
```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

**Windows (PowerShell):**
```powershell
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
```

## Why use `.venv/bin/python -m uvicorn` (Linux) or `.venv\Scripts\python -m uvicorn` (Windows) instead of just `uvicorn`

The venv's `uvicorn` wrapper script may fail with `No module named 'uvicorn'` if the venv's
site-packages aren't on the path. Calling Python directly with `-m uvicorn` bypasses the wrapper
and works reliably on both platforms.

## Common options

| Flag | Purpose |
|------|---------|
| `--reload` | Auto-restart on Python file changes |
| `--host 0.0.0.0` | Expose on LAN (useful for testing on a phone/tablet) |
| `--port 8000` | Change port if 8000 is taken |

## Stopping the server

`Ctrl+C` in the terminal running the server, or kill it by process:

**Linux/macOS:**
```bash
pkill -f "uvicorn main:app"
```

**Windows (PowerShell):**
```powershell
Get-Process python | Where-Object { $_.MainWindowTitle -eq "" } | Stop-Process
```
Or more precisely, find and kill by port:
```powershell
(Get-NetTCPConnection -LocalPort 8000).OwningProcess | ForEach-Object { Stop-Process -Id $_ }
```
