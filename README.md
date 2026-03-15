# UT Schedule Planner

Did anyone else notice that UT's official schedule planner just... vanished? No announcement, no replacement, just gone. So I vibe coded one.

This is a local app that scrapes the UT course registrar and generates every valid, conflict-free schedule for your courses. Filter by professor, compare options side by side, check grade distributions, and export straight to Google Calendar.

## Download

Click the green **Code** button at the top of this page, then **Download ZIP**. Extract it anywhere.

## Quick Start

### Windows

1. Install [Python](https://www.python.org/downloads/) (check **"Add Python to PATH"** during install)
2. Double-click **`UT Schedule Planner.vbs`**

Your browser opens automatically. No terminal window.

### macOS

1. Install Python 3 (`brew install python3`, or download from [python.org](https://www.python.org/downloads/))
2. One-time setup — open Terminal in the project folder and run:
   ```
   chmod +x "UT Schedule Planner.app/Contents/MacOS/launcher"
   ```
3. Double-click **`UT Schedule Planner.app`**

No terminal window. If Python is missing, a native dialog tells you.

### Linux

1. Install Python 3 (`sudo apt install python3 python3-venv` on Ubuntu/Debian)
2. Run:
   ```
   chmod +x run.sh
   ./run.sh
   ```

The first run takes a minute to install dependencies. After that, it starts in seconds.

## How It Works

1. **Connect to UT** — A Chrome window opens for you to log in with your EID and Duo. You only need to do this once — the session is saved across restarts.
2. **Add courses** — Type course codes like `CS 314` or `M 408D`, or use Search to find courses by keyword or instructor name.
3. **Generate Schedules** — The app pulls every section from the registrar, then finds all valid combinations with no time conflicts.
4. **Browse & refine** — Flip through results, filter by professor, set preferences, and narrow down your options.
5. **Save & export** — Save your favorites, compare them, and export to Google Calendar when you're ready to register.

## Features

### Schedule Generation
- Finds every conflict-free combination of your courses automatically
- Handles lectures, labs, and discussion sections as linked groups
- Detects and reports which specific courses conflict when no valid schedule exists
- Results capped at 5,000 to keep things fast

### Professor Filters
- Filter sections by instructor after scraping — uncheck a professor to exclude all their sections
- Per-instructor section counts so you can see who teaches the most sections
- Filters auto-save and persist between sessions
- Changing a filter instantly regenerates schedules (no need to click Generate again)

### Grade Distributions
- Average GPA for every course and instructor, color-coded (green/yellow/red)
- Click any GPA badge to see the full letter-grade histogram (A through F)
- Data sourced from UT Registration Plus (thousands of past semesters)
- Grade database auto-downloads on first run

### Rate My Professors
- RMP link next to every instructor name (opens their UT Austin search page)
- TBA instructors are excluded from RMP links

### Schedule Browsing
- Arrow keys to flip through schedules (or use the Prev/Next buttons)
- Sort by earliest start, latest start, or most compact (least time on campus)
- Weekly calendar view with color-coded course blocks
- Hover any course block to see full details; click it to open the registrar page for that section
- Click any unique number to copy it to your clipboard

### Schedule Comparison
- Toggle "Compare side by side" to view two schedules at once
- Each calendar has independent navigation
- Same color scheme across both so courses are easy to track

### Saving Schedules
- Save any schedule with a custom name
- Saved schedules persist in your browser (per semester)
- Click a saved schedule to view it; use "Back to results" to return to generated results
- Rename or delete saved schedules (delete shows an undo toast)
- Each saved schedule remembers the course list it was created with

### Preferences & Filters
- **Days off** — Toggle M/T/W/Th/F to exclude schedules with classes on those days
- **Time window** — Set earliest start and latest end times (e.g., no classes before 10 AM)
- **Breaks** — Block out recurring time slots (e.g., lunch 12–1 PM every day). Each break supports multi-day selection so you don't need to add one per day
- **Include closed sections** — Optionally include closed/waitlisted sections in generation
- All preferences are applied client-side after generation, so changing them is instant

### Course Search
- Search the registrar by keyword (e.g., "algorithms", "data structures") or by instructor name
- Results show the course name, title, and a link to the registrar page
- Add courses directly from search results with one click
- Handles topic-based courses (e.g., UGS 303 with specific topics) correctly

### Export
- **Google Calendar** — Export any schedule as an `.ics` file with recurring weekly events. Prompts for semester start/end dates, then download and import into Google Calendar.
- **Copy Unique Numbers** — One click copies all unique numbers for the current schedule, comma-separated, ready to paste into registration.

### Other Details
- Semester selector in the header — supports Spring, Summer, and Fall for the current and next year
- Course list, saved schedules, and filter preferences are all stored per-semester in your browser's local storage
- Credit hour total updates automatically (uses UT's convention: first digit of the course number = credit hours)
- Edit any course in your list inline (click the pencil icon)
- Removing a course shows an undo toast in case you didn't mean to
- The app validates available semesters against the registrar once connected

## Requirements

- Python 3.9+
- Google Chrome (the app uses it to access the UT registrar)

## Manual Setup

If you prefer not to use the launcher scripts:

```
python -m venv .venv
source .venv/bin/activate        # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
playwright install chromium
python app.py
```

Then open http://localhost:5000.

## Troubleshooting

**"Python is not installed"** — Download from [python.org](https://www.python.org/downloads/). On Windows, make sure to check "Add Python to PATH" during installation.

**Chrome doesn't open for login** — Make sure Google Chrome is installed. The app uses your system Chrome, not a built-in browser.

**"Session expired"** — Your UT login session lasts a while, but if it expires, just click Generate Schedules again and log in when Chrome opens.

**Port 5000 in use** — Another app is using port 5000. Close it, or edit `app.py` to change the port number.

**First run is slow** — It's installing Python packages and downloading a browser. Subsequent launches are fast.
