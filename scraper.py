"""
Scraper for UT Austin course registrar.
Uses Playwright with a persistent Chrome profile for scraping.
Login only needed once — Duo "remember me" is saved across runs.

All Playwright operations run on a dedicated thread to avoid
thread-affinity issues with Flask.
"""

import os
import re
import threading
from queue import Queue

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

from course_parser import parse_course_input, parse_sections_from_html

REGISTRAR_BASE = "https://utdirect.utexas.edu/apps/registrar/course_schedule"
DEFAULT_SEMESTER = "20269"
LOGIN_HOST = "enterprise.login.utexas.edu"


def _semester_url(semester_code=None):
    """Build the registrar base URL for a given semester code (e.g. '20269' = Fall 2026)."""
    return f"{REGISTRAR_BASE}/{semester_code or DEFAULT_SEMESTER}/"
BROWSER_DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "browser-data")


def log(msg):
    print(f"[scraper] {msg}", flush=True)



def _parse_search_results(html):
    """Parse search results from the registrar.

    Handles two formats:
    1. Keyword search results — table id="kw_results_table" with course links
    2. Instructor/course results — course_header cells with <h2>PREFIX NUMBER TITLE</h2>

    Returns a list of course summaries (no section details — just name and title).
    """
    soup = BeautifulSoup(html, "html.parser")
    courses = []
    seen = set()

    # Format 1: keyword results table
    table = soup.find("table", id="kw_results_table")
    if table:
        for row in table.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) < 2:
                continue
            link = cells[0].find("a")
            if not link:
                continue
            course_text = link.get_text(strip=True)
            course_text = re.sub(r'\s+', ' ', course_text)
            title = cells[1].get_text(strip=True)
            if course_text not in seen:
                seen.add(course_text)
                courses.append({
                    "courseName": course_text,
                    "courseTitle": title,
                    "resultUrl": link.get("href", ""),
                    "sections": [],
                    "sectionCount": 0,
                    "instructors": [],
                })
        return courses

    # Format 2: course_header cells (instructor search, course number search)
    # <td class="course_header" colspan="8"><h2>ECE  351K PROBABILITY/RANDOM PROCESSES</h2></td>
    for td in soup.find_all("td", class_="course_header"):
        h2 = td.find("h2")
        if not h2:
            continue
        text = h2.get_text(strip=True)
        # Split "ECE  351K PROBABILITY/RANDOM PROCESSES" into prefix+number and title
        # Prefix and number are separated by 2+ spaces in the raw HTML,
        # but may be collapsed to 1 space by the browser's DOM serialization
        m = re.match(r'^([A-Z][A-Z ]*?)\s+(\d+\w*)\s+(.*)', text)
        if not m:
            continue
        prefix = m.group(1).strip()
        number = m.group(2).strip()
        title = m.group(3).strip()
        course_text = f"{prefix} {number}"
        if course_text not in seen:
            seen.add(course_text)
            courses.append({
                "courseName": course_text,
                "courseTitle": title,
                "resultUrl": "",
                "sections": [],
                "sectionCount": 0,
                "instructors": [],
            })

    return courses


class Scraper:
    def __init__(self):
        self._authenticated = False
        self._browser_launched = False
        self._launch_error = None
        self._course_cache = {}
        # Playwright thread + queue
        self._thread = None
        self._queue = Queue()

    # ── Playwright thread ─────────────────────────────────

    def _pw_thread_main(self):
        """Dedicated thread that owns all Playwright objects."""
        log("Playwright thread started")
        try:
            os.makedirs(BROWSER_DATA_DIR, exist_ok=True)
            pw = sync_playwright().start()
            context = pw.chromium.launch_persistent_context(
                BROWSER_DATA_DIR,
                headless=False,
                channel="chrome",
                viewport={"width": 1280, "height": 900},
                args=["--window-position=200,100", "--window-size=1300,900"],
            )
            page = context.pages[0] if context.pages else context.new_page()
            self._browser_launched = True
            log("Chrome launched")
        except Exception as e:
            log(f"Failed to launch Chrome: {e}")
            self._launch_error = e
            return

        # Process commands from the queue
        while True:
            cmd, args, result_q = self._queue.get()
            if cmd == "stop":
                break
            try:
                result = cmd(page, *args)
                result_q.put(("ok", result))
            except Exception as e:
                result_q.put(("error", e))

        context.close()
        pw.stop()
        log("Playwright thread stopped")

    @staticmethod
    def _is_browser_closed_error(error):
        """Check if an error indicates the browser/page was closed."""
        msg = str(error).lower()
        return any(phrase in msg for phrase in [
            "has been closed",
            "target closed",
            "connection closed",
            "browser closed",
            "not connected",
        ])

    def _start_browser_thread(self):
        """Start a fresh Playwright thread and wait for browser launch."""
        self._browser_launched = False
        self._launch_error = None
        self._queue = Queue()  # fresh queue in case old one had stale items
        self._thread = threading.Thread(target=self._pw_thread_main, daemon=True)
        self._thread.start()
        import time
        while not self._browser_launched:
            if not self._thread.is_alive():
                err = getattr(self, '_launch_error', None)
                raise Exception(f"Failed to launch Chrome: {err or 'thread exited unexpectedly'}")
            time.sleep(0.1)

    def _run_on_pw_thread(self, func, *args):
        """Send a function to the Playwright thread and wait for the result."""
        if not self._thread or not self._thread.is_alive():
            self._start_browser_thread()

        result_q = Queue()
        self._queue.put((func, args, result_q))
        status, result = result_q.get()
        if status == "error":
            # If browser was closed/crashed, reset thread so next call restarts fresh
            if self._is_browser_closed_error(result):
                log(f"Browser closed unexpectedly: {result}")
                self._stop_thread()
            raise result
        return result

    # ── Commands (run on Playwright thread) ───────────────

    @staticmethod
    def _bring_browser_to_front(page):
        """Bring the Chrome window to the OS foreground using CDP."""
        try:
            cdp_session = page.context.new_cdp_session(page)
            info = cdp_session.send("Browser.getWindowForTarget")
            window_id = info["windowId"]
            # Minimize then restore forces the OS to bring the window to front
            cdp_session.send("Browser.setWindowBounds", {
                "windowId": window_id,
                "bounds": {"windowState": "minimized"},
            })
            cdp_session.send("Browser.setWindowBounds", {
                "windowId": window_id,
                "bounds": {"windowState": "normal"},
            })
            cdp_session.detach()
            page.bring_to_front()
        except Exception:
            pass

    @staticmethod
    def _minimize_browser(page):
        """Minimize the Chrome window so it's out of the way."""
        try:
            cdp_session = page.context.new_cdp_session(page)
            info = cdp_session.send("Browser.getWindowForTarget")
            cdp_session.send("Browser.setWindowBounds", {
                "windowId": info["windowId"],
                "bounds": {"windowState": "minimized"},
            })
            cdp_session.detach()
        except Exception:
            pass

    @staticmethod
    def _cmd_get_semesters(page):
        """Check which semester codes are valid by fetching each URL from the browser."""
        import datetime
        year = datetime.datetime.now().year
        candidates = []
        for y in range(year - 1, year + 2):
            for sem in ["2", "6", "9"]:
                candidates.append(f"{y}{sem}")

        urls = [f"{REGISTRAR_BASE}/{code}/" for code in candidates]

        # Ensure we're on a UT page so fetch sends session cookies (same-origin)
        if "utdirect.utexas.edu" not in page.url:
            page.goto(_semester_url(), wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(1000)

        if LOGIN_HOST in page.url:
            raise Exception("Session expired. Please log in first.")

        # Check all URLs in parallel using fetch from within the authenticated browser
        results = page.evaluate("""
            async (urls) => {
                const checks = await Promise.allSettled(
                    urls.map(url =>
                        fetch(url, { redirect: 'follow' })
                            .then(r => r.text())
                            .then(html => html.includes('crs_nbrSearch'))
                            .catch(() => false)
                    )
                );
                return checks.map(r => r.status === 'fulfilled' ? r.value : false);
            }
        """, urls)

        sem_names = {"2": "Spring", "6": "Summer", "9": "Fall"}
        valid = []
        for i, is_valid in enumerate(results):
            if is_valid:
                code = candidates[i]
                label = f"{sem_names[code[4]]} {code[:4]}"
                valid.append({"code": code, "label": label})

        log(f"Valid semesters: {[s['label'] for s in valid]}")
        return valid

    @staticmethod
    def _cmd_wait_for_login(page, timeout_seconds):
        page.goto(_semester_url(), wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(2000)

        current_url = page.url
        log(f"Initial URL: {current_url}")

        if LOGIN_HOST not in current_url:
            log("Already authenticated!")
            Scraper._minimize_browser(page)
            return True

        # Only bring browser to front when user actually needs to log in
        Scraper._bring_browser_to_front(page)
        log("On login page. Waiting for user to log in...")
        elapsed = 0
        last_url = current_url
        while elapsed < timeout_seconds:
            page.wait_for_timeout(2000)
            elapsed += 2

            try:
                current_url = page.url
            except Exception:
                log("Browser closed")
                return False

            if current_url != last_url:
                log(f"URL changed: {current_url}")
                last_url = current_url

            if LOGIN_HOST not in current_url:
                page.wait_for_timeout(2000)
                final_url = page.url
                log(f"Left login page. Final URL: {final_url}")
                Scraper._minimize_browser(page)
                return True

            if elapsed % 30 == 0:
                log(f"Still waiting... ({elapsed}s)")

        log(f"Timed out after {timeout_seconds}s")
        return False

    @staticmethod
    def _cmd_scrape_course(page, course_name, prefix, number, result_url=None, semester_code=None):
        log(f"Scraping {course_name} (fos_cn={prefix}, number={number}, semester={semester_code})...")
        base_url = _semester_url(semester_code)

        if result_url:
            # Navigate directly to a search result URL (has next_unique for pagination)
            full_url = "https://utdirect.utexas.edu" + result_url if result_url.startswith("/") else result_url
            log(f"Using direct URL: {full_url}")
            page.goto(full_url, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(3000)
        else:
            # Navigate to the search page and use the course number form
            page.goto(base_url, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(2000)

            if LOGIN_HOST in page.url:
                raise Exception("Session expired. Please log in again.")

            # Check if this semester is actually available
            if not page.query_selector('form[name="crs_nbrSearch"]'):
                sem_code = semester_code or DEFAULT_SEMESTER
                raise Exception(f"Semester {sem_code} is not currently available on the registrar.")

            # Use the COURSE NUMBER search form (form name="crs_nbrSearch")
            page.select_option('form[name="crs_nbrSearch"] select#fos_cn', prefix)
            page.fill('form[name="crs_nbrSearch"] input#course_number', number)
            page.click('form[name="crs_nbrSearch"] input[type="image"]')
            page.wait_for_load_state("domcontentloaded")
            page.wait_for_timeout(3000)

        if LOGIN_HOST in page.url:
            raise Exception("Session expired. Please log in again.")

        html = page.content()

        sections = parse_sections_from_html(html, course_name)
        log(f"Found {len(sections)} sections for {course_name}")
        for s in sections:
            log(f"  {s['uniqueNumber']}: {s['days']} {s['startTime']}-{s['endTime']} ({s['instructor']}) linked={len(s['linkedSections'])}")

        # Extract course title from the first section's courseTitle (from course_header)
        course_title = sections[0]["courseTitle"] if sections else ""

        return {
            "courseName": course_name,
            "courseTitle": course_title,
            "prefix": prefix,
            "number": number,
            "sections": sections,
            "sectionCount": len(sections),
            "rawHtmlPreview": html[:5000],
        }

    @staticmethod
    def _cmd_search(page, query, semester_code=None, search_type="keyword"):
        """Search the registrar using the specified search type.

        search_type: "course" | "keyword" | "instructor"
        """
        query = query.strip()
        log(f"Searching: {query} (type={search_type}, semester={semester_code})")
        base_url = _semester_url(semester_code)

        # Navigate to the main search page
        page.goto(base_url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(2000)

        if LOGIN_HOST in page.url:
            raise Exception("Session expired. Please log in again.")

        if search_type == "instructor":
            log(f"Instructor search: {query}")
            page.fill('form[name="instrSearch"] input#instr_last_name', query)
            page.click('form[name="instrSearch"] input[type="image"]')

        else:
            log(f"Keyword search: {query}")
            page.fill('form[name="kwsSearch"] input#keywords', query)
            page.click('form[name="kwsSearch"] input[type="image"]')

        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(3000)

        html = page.content()

        results = _parse_search_results(html)
        log(f"Parsed {len(results)} courses from search results")
        return results

    # ── Public API ────────────────────────────────────────

    def is_browser_launched(self):
        return self._browser_launched

    def check_auth_quick(self):
        """Quick auth check. If we haven't verified yet but the browser data
        directory exists with cookies, try a real check."""
        if self._authenticated:
            return True
        # If browser-data exists, we might still have a valid session
        # but we only know for sure after a login check
        if os.path.isdir(BROWSER_DATA_DIR) and os.listdir(BROWSER_DATA_DIR):
            return "maybe"
        return False

    def init_browser(self):
        """Ensure the Playwright thread and browser are running."""
        if not self._thread or not self._thread.is_alive():
            self._run_on_pw_thread(lambda page: None)

    def verify_session(self):
        """Launch browser and check if the saved session is still valid.
        Does NOT wait for the user to log in — just returns True/False.
        If the session is expired, closes the browser so that a fresh
        login attempt launches Chrome cleanly (visible, in foreground)."""
        try:
            is_valid = self._run_on_pw_thread(self._cmd_verify_session)
            self._authenticated = is_valid
            if not is_valid:
                log("Session expired — closing browser for clean re-login")
                self.close()
            return is_valid
        except Exception as e:
            log(f"Session verification error: {e}")
            self._authenticated = False
            self.close()
            return False

    @staticmethod
    def _cmd_verify_session(page):
        """Navigate to registrar and check if session redirects to login."""
        page.goto(_semester_url(), wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(1500)
        is_valid = LOGIN_HOST not in page.url
        if is_valid:
            Scraper._minimize_browser(page)
        return is_valid

    def wait_for_login(self, timeout_seconds=180):
        try:
            success = self._run_on_pw_thread(self._cmd_wait_for_login, timeout_seconds)
            self._authenticated = success
            return success
        except Exception as e:
            log(f"Login error: {e}")
            self._authenticated = False
            return False

    def scrape_course(self, course_input, topic=None, result_url=None, semester_code=None):
        sem = semester_code or DEFAULT_SEMESTER
        cache_key = f"{sem}::{course_input.strip().upper()}"
        if topic:
            cache_key += "::" + topic.strip().upper()
        if cache_key in self._course_cache:
            return self._course_cache[cache_key]

        if not self._authenticated:
            raise Exception("Not authenticated. Please log in first.")

        prefix, number = parse_course_input(course_input)
        course_name = f"{prefix} {number}"

        try:
            result = self._run_on_pw_thread(self._cmd_scrape_course, course_name, prefix, number, result_url, sem)
            result["courseInput"] = course_input

            # Filter sections by topic title (for multi-topic courses like UGS 303)
            if topic:
                normalized_topic = re.sub(r"\s+", " ", topic.strip().upper())
                # Check if this is actually a multi-topic course
                all_titles = set(
                    re.sub(r"\s+", " ", s.get("courseTitle", "").strip().upper())
                    for s in result["sections"]
                )
                if len(all_titles) > 1:
                    log(f"Multi-topic course detected. {len(all_titles)} topics: {all_titles}")
                    # Multi-topic course: filter by exact match first, then substring fallback
                    filtered = [
                        s for s in result["sections"]
                        if re.sub(r"\s+", " ", s.get("courseTitle", "").strip().upper()) == normalized_topic
                    ]
                    if not filtered:
                        # Fallback: substring match (search title might abbreviate)
                        filtered = [
                            s for s in result["sections"]
                            if normalized_topic in re.sub(r"\s+", " ", s.get("courseTitle", "").strip().upper())
                            or re.sub(r"\s+", " ", s.get("courseTitle", "").strip().upper()) in normalized_topic
                        ]
                        if filtered:
                            log(f"Used substring fallback for topic matching")
                    result["sections"] = filtered
                    display_name = f"{course_name}: {topic}"
                    result["courseName"] = display_name
                    result["topic"] = topic
                    for s in result["sections"]:
                        s["courseName"] = display_name
                    result["sectionCount"] = len(result["sections"])
                    log(f"Multi-topic: filtered to {len(result['sections'])} sections for: {topic}")
                else:
                    log(f"Single-topic course, no filtering needed")

            self._course_cache[cache_key] = result
            return result
        except Exception as e:
            if "Session expired" in str(e):
                self._authenticated = False
                raise
            raise Exception(f"Error scraping {course_name}: {e}")

    def scrape_courses(self, course_list, semester_code=None):
        results = []
        for course in course_list:
            if isinstance(course, dict):
                result = self.scrape_course(
                    course["name"],
                    topic=course.get("topic"),
                    result_url=course.get("resultUrl"),
                    semester_code=semester_code,
                )
            else:
                result = self.scrape_course(course, semester_code=semester_code)
            results.append(result)
        return results

    def search(self, query, semester_code=None, search_type="keyword"):
        if not self._authenticated:
            raise Exception("Not authenticated. Please log in first.")
        return self._run_on_pw_thread(self._cmd_search, query, semester_code, search_type)

    def get_available_semesters(self):
        """Return list of semester codes that have valid course schedules."""
        if not self._authenticated:
            raise Exception("Not authenticated. Please log in first.")
        return self._run_on_pw_thread(self._cmd_get_semesters)

    def clear_cache(self):
        self._course_cache = {}

    def _stop_thread(self):
        """Stop the Playwright thread and reset state for fresh restart."""
        if self._thread and self._thread.is_alive():
            try:
                self._queue.put(("stop", (), None))
                self._thread.join(timeout=10)
            except Exception:
                pass
        self._thread = None
        self._browser_launched = False

    def close(self):
        self._stop_thread()
        self._authenticated = False
