"""
Flask web server for UT Austin Schedule Planner.
Connects to the user's running Chrome via CDP for scraping.
"""

import os
import signal

from flask import Flask, render_template, jsonify, request

from scraper import Scraper
from scheduler import generate_schedules, analyze_conflicts
from grades import get_grades_for_courses, ensure_db, refresh_db

app = Flask(__name__)

scraper = Scraper()


def log(msg):
    print(f"[server] {msg}", flush=True)


# ── Pages ──────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


# ── Auth endpoints ─────────────────────────────────────────

@app.route("/api/auth/status")
def auth_status():
    """Quick check — doesn't open browser or navigate."""
    auth = scraper.check_auth_quick()
    return jsonify({
        "authenticated": True if auth is True else False,
        "maybeAuthenticated": auth == "maybe",
        "browserLaunched": scraper.is_browser_launched(),
    })


@app.route("/api/auth/verify", methods=["POST"])
def auth_verify():
    """Launch browser and verify saved session without waiting for login."""
    log("Verifying saved session...")
    try:
        is_valid = scraper.verify_session()
        log(f"Session verification: {'valid' if is_valid else 'expired'}")
        return jsonify({"authenticated": is_valid})
    except Exception as e:
        log(f"Verification error: {e}")
        return jsonify({"authenticated": False, "error": str(e)}), 500


@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    """Launch Chrome and wait for UT login."""
    log("Login requested")
    try:
        scraper.init_browser()
        success = scraper.wait_for_login(timeout_seconds=180)
        if success:
            log("Login succeeded!")
            return jsonify({"success": True, "message": "Connected to UT!"})
        else:
            log("Login timed out")
            return jsonify({"success": False, "message": "Login timed out. Try again."}), 408
    except Exception as e:
        log(f"Login error: {e}")
        return jsonify({"success": False, "message": str(e)}), 500


# ── Course scraping endpoints ──────────────────────────────

@app.route("/api/courses/scrape", methods=["POST"])
def scrape_courses():
    data = request.get_json()
    courses = data.get("courses", [])
    if not courses:
        return jsonify({"error": "No courses provided"}), 400

    semester = data.get("semester")
    log(f"Scraping: {courses} (semester={semester})")
    try:
        results = scraper.scrape_courses(courses, semester_code=semester)
        return jsonify({"success": True, "courses": results})
    except Exception as e:
        log(f"Scrape error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/courses/search", methods=["POST"])
def search_courses():
    data = request.get_json()
    query = data.get("query", "").strip()
    if not query:
        return jsonify({"error": "No search query provided"}), 400

    semester = data.get("semester")
    search_type = data.get("searchType", "keyword")
    log(f"Searching: {query} (type={search_type}, semester={semester})")
    try:
        results = scraper.search(query, semester_code=semester, search_type=search_type)
        return jsonify({"success": True, "courses": results})
    except Exception as e:
        log(f"Search error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/semesters")
def get_semesters():
    try:
        semesters = scraper.get_available_semesters()
        return jsonify({"success": True, "semesters": semesters})
    except Exception as e:
        log(f"Semester check error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/courses/cache/clear", methods=["POST"])
def clear_cache():
    scraper.clear_cache()
    return jsonify({"success": True})


# ── Schedule generation ────────────────────────────────────

@app.route("/api/schedules/generate", methods=["POST"])
def gen_schedules():
    data = request.get_json()
    courses_sections = data.get("coursesSections", [])
    course_names = data.get("courseNames", [])
    include_closed = data.get("includeClosed", False)
    max_results = data.get("maxResults", 5000)

    if not courses_sections:
        return jsonify({"error": "No course sections provided"}), 400

    if not include_closed:
        filtered = []
        for sections in courses_sections:
            filtered.append(
                [s for s in sections if s.get("status", "").lower() not in ("closed", "cancelled")]
            )
        courses_sections = filtered

    # Detect courses with 0 sections (will be silently dropped by scheduler)
    dropped = []
    for i, sections in enumerate(courses_sections):
        if not sections:
            name = course_names[i] if i < len(course_names) else f"Course {i+1}"
            dropped.append(name)

    schedules = generate_schedules(courses_sections, max_results=max_results)

    result = {
        "success": True,
        "scheduleCount": len(schedules),
        "schedules": schedules,
        "capped": len(schedules) >= max_results,
        "droppedCourses": dropped,
    }

    # When no valid schedules, analyze which course pairs conflict
    if not schedules:
        result["conflicts"] = analyze_conflicts(courses_sections, course_names)

    return jsonify(result)


# ── Grade distributions ───────────────────────────────────

@app.route("/api/grades", methods=["POST"])
def get_grades():
    data = request.get_json()
    courses = data.get("courses", [])
    if not courses:
        return jsonify({"error": "No courses provided"}), 400

    log(f"Grade lookup: {courses}")
    try:
        results = get_grades_for_courses(courses)
        return jsonify({"success": True, "grades": results})
    except Exception as e:
        log(f"Grade lookup error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500



@app.route("/api/grades/refresh", methods=["POST"])
def refresh_grades():
    try:
        success = refresh_db()
        return jsonify({"success": success})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ── Shutdown ───────────────────────────────────────────────

@app.route("/api/shutdown", methods=["POST"])
def shutdown():
    """Gracefully shut down the server, browser, and all background threads."""
    log("Shutdown requested from UI")
    scraper.close()
    # Send response before killing the process
    response = jsonify({"success": True, "message": "Shutting down..."})
    # Use os._exit in a background thread to let the response flush first
    import threading
    threading.Timer(0.5, lambda: os._exit(0)).start()
    return response


# ── Debug ──────────────────────────────────────────────────

@app.route("/api/debug/raw-html")
def debug_raw_html():
    prefix = request.args.get("prefix", "")
    number = request.args.get("number", "")
    if not prefix or not number:
        return jsonify({"error": "prefix and number required"}), 400
    try:
        result = scraper.scrape_course(f"{prefix} {number}")
        return jsonify({
            "rawHtml": result.get("rawHtmlPreview", ""),
            "sections": result.get("sections", []),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    # Pre-download grade database in background so first lookup is fast
    import threading
    import atexit
    threading.Thread(target=ensure_db, daemon=True).start()
    atexit.register(scraper.close)
    log("Starting Schedule Planner...")
    log("Open http://localhost:5000 in your browser")
    app.run(port=5000, threaded=True)
