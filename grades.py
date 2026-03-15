"""
Grade distribution data from UT Austin.

Uses a SQLite database (sourced from UT Registration Plus / UT_Grade_Parser)
that contains per-section grade breakdowns with instructor names.

Provides lookup by course (prefix + number) and optionally by instructor last name.
"""

import os
import sqlite3
import urllib.request

DB_URL = (
    "https://github.com/Longhorn-Developers/UT-Registration-Plus"
    "/raw/main/public/database/grade_distributions.db"
)
DB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "grade-data")
DB_PATH = os.path.join(DB_DIR, "grade_distributions.db")

GPA_MAP = {
    "A": 4.0, "A_Minus": 3.67,
    "B_Plus": 3.33, "B": 3.0, "B_Minus": 2.67,
    "C_Plus": 2.33, "C": 2.0, "C_Minus": 1.67,
    "D_Plus": 1.33, "D": 1.0, "D_Minus": 0.67,
    "F": 0.0,
}

GRADE_COLS = ["A", "A_Minus", "B_Plus", "B", "B_Minus",
              "C_Plus", "C", "C_Minus", "D_Plus", "D", "D_Minus", "F", "Other"]

# Display names for grade columns
GRADE_DISPLAY = {
    "A": "A", "A_Minus": "A-", "B_Plus": "B+", "B": "B", "B_Minus": "B-",
    "C_Plus": "C+", "C": "C", "C_Minus": "C-", "D_Plus": "D+", "D": "D",
    "D_Minus": "D-", "F": "F", "Other": "Other",
}


def log(msg):
    print(f"[grades] {msg}", flush=True)


def ensure_db():
    """Download the grade database if it doesn't exist locally."""
    if os.path.exists(DB_PATH):
        return True
    os.makedirs(DB_DIR, exist_ok=True)
    log("Downloading grade distribution database...")
    try:
        urllib.request.urlretrieve(DB_URL, DB_PATH)
        log(f"Downloaded ({os.path.getsize(DB_PATH) / 1e6:.1f} MB)")
        return True
    except Exception as e:
        log(f"Download failed: {e}")
        return False


def _get_conn():
    """Get a read-only SQLite connection."""
    if not os.path.exists(DB_PATH):
        return None
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def _prefix_variants(prefix):
    """Generate department code variants for matching.

    The DB uses old-style codes like 'C S' for older semesters and 'CS' for none,
    or 'E E' for old and 'ECE' for new.
    The registrar uses current codes like 'CS', 'ECE', 'M', 'PHY'.
    """
    variants = [prefix]
    # If prefix is 2+ uppercase letters with no space, try inserting a space
    # e.g. 'CS' -> 'C S', 'EE' -> 'E E', 'ME' -> 'M E'
    if len(prefix) == 2 and prefix.isalpha():
        spaced = f"{prefix[0]} {prefix[1]}"
        variants.append(spaced)
    # Special case: ECE was formerly E E
    if prefix == "ECE":
        variants.append("E E")
    if prefix == "E E":
        variants.append("ECE")
    return variants


def _calc_distribution(rows):
    """Aggregate grade counts from multiple rows into a distribution summary."""
    totals = {col: 0 for col in GRADE_COLS}
    for row in rows:
        for col in GRADE_COLS:
            totals[col] += row[col] or 0

    # Calculate GPA (exclude "Other")
    total_points = 0.0
    total_graded = 0
    for col in GRADE_COLS:
        if col == "Other":
            continue
        count = totals[col]
        total_points += GPA_MAP.get(col, 0) * count
        total_graded += count

    total_all = sum(totals.values())
    gpa = round(total_points / total_graded, 2) if total_graded > 0 else None

    # Simplified distribution for display (combine +/- into letter groups)
    display = {GRADE_DISPLAY[col]: totals[col] for col in GRADE_COLS}

    return {
        "gpa": gpa,
        "totalStudents": total_all,
        "totalGraded": total_graded,
        "distribution": display,
    }


def _extract_last_name(instructor_str):
    """Extract last name from registrar format 'LASTNAME, FIRSTNAME M'."""
    if not instructor_str or instructor_str.upper() == "TBA":
        return None
    parts = instructor_str.split(",")
    return parts[0].strip()


def get_course_grades(prefix, number):
    """Get aggregate grade distribution for a course.

    Returns { gpa, totalStudents, distribution, instructors: { name: { gpa, ... } } }
    """
    conn = _get_conn()
    if not conn:
        return None

    try:
        variants = _prefix_variants(prefix)
        placeholders = ",".join("?" for _ in variants)

        # Get all rows for this course across all department code variants
        query = f"""
            SELECT * FROM grade_distributions
            WHERE Department_Code COLLATE NOCASE IN ({placeholders})
            AND Course_Number COLLATE NOCASE = ?
        """
        rows = conn.execute(query, [*variants, number]).fetchall()

        if not rows:
            return None

        # Overall course distribution
        result = _calc_distribution(rows)

        # Per-instructor distributions
        instructor_rows = {}
        for row in rows:
            last = row["Instructor_Last"]
            if not last:
                continue
            key = last.strip()
            if key not in instructor_rows:
                instructor_rows[key] = []
            instructor_rows[key].append(row)

        instructors = {}
        for last_name, irows in instructor_rows.items():
            dist = _calc_distribution(irows)
            # Get first name from any row for display
            first = irows[0]["Instructor_First"] or ""
            instructors[last_name.upper()] = {
                "gpa": dist["gpa"],
                "totalStudents": dist["totalStudents"],
                "distribution": dist["distribution"],
                "displayName": f"{first} {last_name}".strip(),
            }

        result["instructors"] = instructors
        return result

    finally:
        conn.close()


def get_grades_for_courses(course_list):
    """Get grade data for multiple courses.

    Args:
        course_list: list of {"prefix": "CS", "number": "314"} dicts

    Returns:
        dict mapping "PREFIX NUMBER" -> grade data
    """
    if not ensure_db():
        return {}

    results = {}
    for course in course_list:
        prefix = course["prefix"]
        number = course["number"]
        key = f"{prefix} {number}"
        data = get_course_grades(prefix, number)
        if data:
            results[key] = data

    return results


def refresh_db():
    """Force re-download of the grade database."""
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
    return ensure_db()
