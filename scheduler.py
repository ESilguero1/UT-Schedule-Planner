"""
Schedule conflict detection and combination generator.
Finds all valid (non-conflicting) schedule combinations.
"""


def time_to_minutes(time_str):
    """Convert "09:30" to 570 minutes from midnight."""
    h, m = time_str.split(":")
    return int(h) * 60 + int(m)


def get_all_time_slots(section):
    """Get all time slots for a section, including linked sections (labs/discussions)."""
    slots = []

    if section.get("startTime") and section.get("endTime") and section.get("days"):
        start = time_to_minutes(section["startTime"])
        end = time_to_minutes(section["endTime"])
        for day in section["days"]:
            slots.append({"day": day, "start": start, "end": end})

    for linked in section.get("linkedSections", []):
        if linked.get("startTime") and linked.get("endTime") and linked.get("days"):
            start = time_to_minutes(linked["startTime"])
            end = time_to_minutes(linked["endTime"])
            for day in linked["days"]:
                slots.append({"day": day, "start": start, "end": end})

    return slots


def sections_conflict(section_a, section_b):
    """Check if two sections have any time overlap."""
    slots_a = get_all_time_slots(section_a)
    slots_b = get_all_time_slots(section_b)

    for a in slots_a:
        for b in slots_b:
            if a["day"] == b["day"]:
                if a["start"] < b["end"] and b["start"] < a["end"]:
                    return True
    return False


def conflicts_with_any(section, current_schedule):
    """Check if a section conflicts with any section already in the schedule."""
    for existing in current_schedule:
        if sections_conflict(section, existing):
            return True
    return False


def analyze_conflicts(courses_sections, course_names=None):
    """
    When no valid schedules exist, find which course pairs conflict.
    Returns a list of {courseA, courseB} objects for pairs with ZERO
    compatible section combinations.
    """
    if not course_names:
        course_names = [f"Course {i+1}" for i in range(len(courses_sections))]

    pair_conflicts = []

    for i in range(len(courses_sections)):
        for j in range(i + 1, len(courses_sections)):
            # Check if ANY section from course i can coexist with ANY from course j
            compatible = False
            for sec_a in courses_sections[i]:
                for sec_b in courses_sections[j]:
                    if not sections_conflict(sec_a, sec_b):
                        compatible = True
                        break
                if compatible:
                    break

            if not compatible and courses_sections[i] and courses_sections[j]:
                pair_conflicts.append({
                    "courseA": course_names[i] if i < len(course_names) else f"Course {i+1}",
                    "courseB": course_names[j] if j < len(course_names) else f"Course {j+1}",
                })

    return pair_conflicts


def generate_schedules(courses_sections, max_results=5000):
    """
    Find all valid schedule combinations using backtracking.

    Args:
        courses_sections: list of lists, where each inner list contains
                         section objects for one course.
        max_results: cap on number of results to prevent runaway computation.

    Returns:
        List of valid schedules, where each schedule is a list of sections
        (one per course).
    """
    results = []

    # Filter out courses with no sections
    courses_sections = [sections for sections in courses_sections if sections]

    if not courses_sections:
        return results

    def backtrack(course_index, current_schedule):
        if len(results) >= max_results:
            return

        if course_index == len(courses_sections):
            results.append(list(current_schedule))
            return

        for section in courses_sections[course_index]:
            # Skip cancelled sections
            if section.get("status", "").lower() == "cancelled":
                continue

            if not conflicts_with_any(section, current_schedule):
                current_schedule.append(section)
                backtrack(course_index + 1, current_schedule)
                current_schedule.pop()

    backtrack(0, [])
    return results
