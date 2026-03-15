"""
Parses UT Austin course schedule HTML into structured section data.
Uses BeautifulSoup to extract data from the HTML.
"""

import re
from bs4 import BeautifulSoup


def parse_days(day_str):
    """
    Parse UT day string into list of day codes.
    "MWF" -> ["M","W","F"], "TTH" -> ["T","TH"], "MWTH" -> ["M","W","TH"]
    """
    if not day_str or day_str.strip().upper() == "TBA":
        return []

    day_str = day_str.strip().upper()
    days = []
    i = 0
    while i < len(day_str):
        if i + 1 < len(day_str) and day_str[i : i + 2] == "TH":
            days.append("TH")
            i += 2
        else:
            ch = day_str[i]
            if ch in ("M", "T", "W", "F", "S"):
                days.append(ch)
            i += 1
    return days


def parse_time_range(time_str):
    """
    Parse UT time string into 24-hour start/end times.
    Examples:
        "9:30 a.m.- 11:00 a.m." -> ("09:30", "11:00")
        "2:00 p.m.- 3:30 p.m."  -> ("14:00", "15:30")
        "12:00 p.m.- 1:00 p.m." -> ("12:00", "13:00")
    """
    if not time_str or "TBA" in time_str.upper():
        return None, None

    time_str = time_str.strip()

    pattern = r"(\d{1,2}:\d{2})\s*(a\.?m\.?|p\.?m\.?)\s*-\s*(\d{1,2}:\d{2})\s*(a\.?m\.?|p\.?m\.?)"
    match = re.search(pattern, time_str, re.IGNORECASE)

    if not match:
        return None, None

    start_time_str = match.group(1)
    start_ampm = match.group(2).replace(".", "").lower()
    end_time_str = match.group(3)
    end_ampm = match.group(4).replace(".", "").lower()

    def to_24h(t, ampm):
        h, m = t.split(":")
        h = int(h)
        m = int(m)
        if ampm == "pm" and h != 12:
            h += 12
        elif ampm == "am" and h == 12:
            h = 0
        return f"{h:02d}:{m:02d}"

    return to_24h(start_time_str, start_ampm), to_24h(end_time_str, end_ampm)



def parse_course_input(user_input):
    """
    Parse user course input into UT registrar prefix and number.

    The registrar uses two formats:
    - 2-letter prefixes with a space: "C S", "E M", "B A"
    - 3+ letter prefixes without spaces: "ECE", "BME", "ASE", "ACC"

    Examples:
        "CS 314"    -> ("C S", "314")
        "M 408D"    -> ("M", "408D")
        "ECE 351K"  -> ("ECE", "351K")
        "SDS 321"   -> ("SDS", "321")
        "E E 306"   -> ("E E", "306")
        "C S 429"   -> ("C S", "429")
    """
    trimmed = user_input.strip().upper()

    match = re.match(r"^([A-Z\s]+?)\s+(\d+\w*)$", trimmed)
    if not match:
        raise ValueError(f"Invalid course format: {user_input}. Use format like 'CS 314' or 'M 408D'")

    prefix = match.group(1).strip()
    number = match.group(2)

    # If user already typed spaces (e.g., "C S" or "E E"), keep as-is
    if " " in prefix:
        return prefix, number

    # Single letter: keep as-is (e.g., "M", "E")
    if len(prefix) == 1:
        return prefix, number

    # Exactly 2 letters: split with space (CS -> C S, EE -> E E)
    if len(prefix) == 2:
        prefix = " ".join(prefix)
        return prefix, number

    # 3+ letters: keep as-is (ECE, BME, SDS, ACC, etc.)
    return prefix, number


def parse_sections_from_html(html, course_name):
    """
    Extract course sections from UT registrar HTML using BeautifulSoup.
    Tries multiple strategies to find the data table.
    """
    soup = BeautifulSoup(html, "html.parser")
    sections = []

    # Strategy 1: Find tables and check headers for course schedule patterns
    for table in soup.find_all("table"):
        header_row = table.find("tr")
        if not header_row:
            continue

        headers = []
        for cell in header_row.find_all(["th", "td"]):
            headers.append(cell.get_text(strip=True).lower())

        # Check if this looks like a course schedule table
        has_unique = any("unique" in h for h in headers)
        has_time = any("time" in h or "hour" in h for h in headers)
        has_days = any("day" in h for h in headers)

        if not has_unique and not has_time:
            continue

        # Map column indices
        col_map = {}
        for i, h in enumerate(headers):
            if "unique" in h:
                col_map["unique"] = i
            if "day" in h:
                col_map["days"] = i
            if "hour" in h or "time" in h:
                col_map["time"] = i
            if "room" in h or "building" in h or "location" in h:
                col_map["location"] = i
            if "instructor" in h:
                col_map["instructor"] = i
            if "status" in h:
                col_map["status"] = i

        # Parse data rows, tracking course_header headings for topic titles
        current_course_title = ""
        rows = table.find_all("tr")[1:]  # Skip header
        for row in rows:
            cells = row.find_all("td")

            # Detect course_header rows (topic headings):
            #   <td class="course_header" colspan="8"><h2>UGS 303 SLEEP: ...</h2></td>
            header_cell = row.find("td", class_="course_header")
            if header_cell:
                h2 = header_cell.find("h2")
                if h2:
                    heading_text = re.sub(r"\s+", " ", h2.get_text(strip=True))
                    # Extract title: everything after "PREFIX NUMBER"
                    m = re.match(r"^[A-Z\s]+\d+\w*\s+(.*)", heading_text)
                    current_course_title = m.group(1).strip() if m else ""
                continue

            if len(cells) < 3:
                continue

            texts = [cell.get_text(strip=True) for cell in cells]

            # Find unique number
            unique_num = None
            if "unique" in col_map:
                m = re.search(r"\d{5}", texts[col_map["unique"]] if col_map["unique"] < len(texts) else "")
                if m:
                    unique_num = m.group(0)
            if not unique_num:
                for t in texts:
                    m = re.match(r"^\d{5}$", t)
                    if m:
                        unique_num = m.group(0)
                        break
            if not unique_num:
                continue

            # Extract multi-row data from cells using <span> elements.
            # The registrar puts lecture + lab in the SAME <td> cell:
            #   <span>TTH</span><br><span class="second-row">W</span>
            #   <span>11:00 a.m.-12:30 p.m.</span><br><span class="second-row">12:00 p.m.-3:00 p.m.</span>
            def get_spans(col_key):
                if col_key not in col_map or col_map[col_key] >= len(cells):
                    return []
                cell = cells[col_map[col_key]]
                spans = cell.find_all("span")
                if spans:
                    return [s.get_text(strip=True) for s in spans]
                text = cell.get_text(strip=True)
                return [text] if text else []

            day_spans = get_spans("days")
            time_spans = get_spans("time")
            loc_spans = get_spans("location")

            instructor = texts[col_map["instructor"]] if "instructor" in col_map and col_map["instructor"] < len(texts) else ""
            status = texts[col_map["status"]] if "status" in col_map and col_map["status"] < len(texts) else "open"

            # Primary meeting time (first span)
            days_raw = day_spans[0] if day_spans else ""
            time_raw = time_spans[0] if time_spans else ""
            location = loc_spans[0] if loc_spans else ""

            days = parse_days(days_raw)
            start_time, end_time = parse_time_range(time_raw)

            # Build linked sections from second-row spans (labs, discussions, etc.)
            linked = []
            num_extra = max(len(day_spans), len(time_spans)) - 1
            for i in range(1, num_extra + 1):
                extra_days_raw = day_spans[i] if i < len(day_spans) else ""
                extra_time_raw = time_spans[i] if i < len(time_spans) else ""
                extra_loc = loc_spans[i] if i < len(loc_spans) else ""

                extra_days = parse_days(extra_days_raw)
                extra_start, extra_end = parse_time_range(extra_time_raw)

                if extra_days or extra_start:
                    linked.append({
                        "days": extra_days,
                        "startTime": extra_start,
                        "endTime": extra_end,
                        "location": extra_loc,
                        "instructor": instructor,
                    })

            sections.append({
                "uniqueNumber": unique_num,
                "courseName": course_name,
                "courseTitle": current_course_title,
                "instructor": instructor,
                "status": status.lower() if status else "open",
                "days": days,
                "startTime": start_time,
                "endTime": end_time,
                "location": location,
                "linkedSections": linked,
            })

        if sections:
            break  # Found the right table

    # Strategy 2: generic text-based fallback
    if not sections:
        text = soup.get_text()
        for line in text.split("\n"):
            line = line.strip()
            unique_match = re.search(r"\b(\d{5})\b", line)
            if unique_match and re.search(r"[MTWF]", line):
                time_match = re.search(
                    r"(\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?))\s*-\s*(\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?))",
                    line, re.IGNORECASE
                )
                start_time, end_time = (None, None)
                if time_match:
                    start_time, end_time = parse_time_range(time_match.group(0))

                day_match = re.search(r"([MTWTHFS]{1,6})", line)
                days = parse_days(day_match.group(1)) if day_match else []

                sections.append({
                    "uniqueNumber": unique_match.group(1),
                    "courseName": course_name,
                    "courseTitle": "",
                    "instructor": "",
                    "status": "open",
                    "days": days,
                    "startTime": start_time,
                    "endTime": end_time,
                    "location": "",
                    "linkedSections": [],
                })

    return sections
