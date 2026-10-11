# Paisa

A personal expense tracker that runs only on your computer. No cloud, no login, no external services.
Your data is one SQLite file: `backend\data\paisa.db`.

**Try it without installing:** a live demo with made-up sample data runs at
<https://virajvaidya0504-sys.github.io/Paisa/>. It runs the real Python backend inside your browser, so it takes
a few seconds to start, nothing is uploaded, and changes reset when you refresh.

**Stack:** Python + FastAPI + SQLite (backend), React + Vite + Recharts (frontend).
The server listens on `127.0.0.1` only, so nothing on your network can reach it.

## Run it (Windows)

Needs Python 3.10+ and Node.js 18+ (check with `python --version` and `node --version`).

**Easiest:** double-click `run.bat`.

**Or in PowerShell:**

```powershell
cd C:\Users\hp\Paisa
powershell -ExecutionPolicy Bypass -File .\run.ps1
```

The first run creates the Python environment, installs packages, builds the web app and fills the
database with ~200 sample transactions. Later runs start in a couple of seconds. Your browser opens at
<http://127.0.0.1:8000>. Keep the window open while you use Paisa; press **Ctrl+C** to stop.

> Running `.\run.ps1` directly may fail with "running scripts is disabled". That is Windows' default
> policy; the two options above avoid it without changing any system setting.

**Start fresh (remove the sample data):** stop Paisa, delete `backend\data\paisa.db`, start again for new
sample data, or add your own transactions and delete the samples from the Transactions screen.

## Screens

| Screen | What it does |
| --- | --- |
| **Dashboard** | Spent, received and net for a day, month, year, custom range or all time, with change vs the previous period. Daily/monthly trend, spend by tag, top payees, payment methods, month-over-month, and a calendar heatmap. Every chart respects the filters. |
| **Transactions** | Search and filter (date, tag, payee, type, method, amount, status), edit or delete, **Export CSV** of exactly what the filters show. |
| **Quick Add** | Amount, payee, tag. Leave the tag empty and your auto-tag rules choose. |
| **Pay** | Enter a UPI ID, amount and tag. Paisa saves a *pending* transaction and shows a `upi://pay` link plus a QR code. Then answer **Did it go through?** Yes records it, No removes it. |
| **Import** | Upload a bank/UPI CSV, match the columns, review, import. See below. |
| **Untagged** | Imported transactions no rule recognised, grouped by payee. One tap tags the whole payee, and can remember it as a rule. |
| **Budgets** | Optional monthly limit per tag, progress bars, a warning at 80%, and an alert on the Dashboard. |
| **Tags & rules** | Create, rename, recolor and delete tags. Auto-tag rules: "if payee contains *Swiggy*, tag as *Food*". |

### About the Pay screen

Paisa never moves money. The `upi://pay` link only opens a UPI app **on a phone**. On a computer, scan
the QR code with your phone (or copy the link). Because your phone can't reach Paisa, confirm the payment on
the computer afterwards. Pending payments are not counted in any report until you confirm them.

### Importing statements

1. **Choose file.** Any CSV up to 5 MB. Lines above the header (account details) are skipped automatically.
2. **Match columns.** Paisa guesses; fix anything wrong. Pick how amounts are laid out: one signed amount
   column, an amount plus a Dr/Cr column, or separate debit and credit columns. Dates are read day-first
   (31/12/2025) unless you pick a format. "Tidy payee names" turns `UPI/DR/123/SWIGGY/okaxis` into `Swiggy`.
   Credit-card statements that list purchases as positive numbers need "Positive amounts are spending".
3. **Review.** See how every row will be read before anything is saved. Rows that can't be read are listed
   with the reason and skipped.
4. **Import.** New rows are saved and tagged by your rules; the rest go to **Untagged**.

**Duplicates:** a row is a duplicate if you already have a transaction with the same day, amount, direction
and payee (also ones you typed in by hand). Importing the same file twice adds nothing. Two genuinely identical
purchases in one file are both kept.

## Auto-tag rules

A rule is "payee contains *text* → tag". Matching ignores case. If several match, the highest priority wins,
then the newest. Rules only fill in a missing tag; a tag you pick is never overridden. **Tags & rules → Apply
rules to untagged transactions** re-runs them over old transactions.

## Tests

```powershell
cd C:\Users\hp\Paisa\backend
.\.venv\Scripts\python.exe -m pytest -q
```

Tests use temporary databases and never touch `backend\data\paisa.db`. They cover the database layer, auto-tag
logic, filters, reports, CSV parsing and duplicate detection, the pay flow and budgets.

## Working on the UI

```powershell
cd C:\Users\hp\Paisa\frontend
npm run dev        # http://127.0.0.1:5173, forwards /api to the server on :8000
npm run build      # rebuild the files the server serves (needed after UI changes)
```

## Project layout

```
Paisa\
├─ run.bat, run.ps1        start everything
├─ backend\
│  ├─ app\
│  │  ├─ main.py           FastAPI app; serves the built frontend
│  │  ├─ db.py             SQLite schema and helpers (money stored as integer paise)
│  │  ├─ autotag.py        rule matching
│  │  ├─ filters.py        shared filter-to-SQL, used by the list, export and reports
│  │  ├─ importer.py       CSV reading, column guessing, duplicate detection
│  │  ├─ seed.py           the sample data
│  │  └─ routers\          transactions, tags, reports, imports, inbox, pay, budgets
│  ├─ tests\
│  └─ data\paisa.db        your data (created on first run)
└─ frontend\src\           React app: pages\, components\, theme, formatting (₹ lakh/crore)
```

## Publishing the demo

The demo is the same app with its backend running in the browser (Pyodide). After changing the app, run
`powershell -ExecutionPolicy Bypass -File .\publish-demo.ps1` to rebuild it and update the GitHub Pages site.

## Back up your data

Copy `backend\data\paisa.db` while Paisa is stopped.

## Troubleshooting

- **Browser says unreachable:** Paisa isn't running. Start it with `run.bat` and keep the window open.
- **"Port 8000 is already in use":** Paisa is probably already running; open <http://127.0.0.1:8000>.
- **Import says a date can't be read:** pick the matching *Date format* in step 2.
- **UPI link does nothing on the computer:** expected. Scan the QR code with your phone.

Out of scope on purpose: SMS reading, bank/Account Aggregator connections, user accounts, anything cloud-hosted.
