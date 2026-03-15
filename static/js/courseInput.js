/**
 * Course input management — add/remove courses from the list.
 * Persists to localStorage, scoped per semester.
 *
 * Each course is stored as an object: { name: "UGS 303", topic: "SLEEP: ARE WE..." }
 * The topic field is optional (null for normal courses, set for topic-based courses).
 *
 * Storage format: { "20269": [ ...courses ], "20262": [ ...courses ] }
 */
const CourseInput = (() => {
    const STORAGE_KEY = 'sp_courses';
    let onChangeCallback = null;
    let currentSemester = localStorage.getItem('sp_semester') || `${new Date().getFullYear()}9`;
    const COURSE_COLORS = [
        'var(--course-1)', 'var(--course-2)', 'var(--course-3)',
        'var(--course-4)', 'var(--course-5)', 'var(--course-6)',
        'var(--course-7)', 'var(--course-8)', 'var(--course-9)',
        'var(--course-10)',
    ];

    // Load all semesters, migrating from old format if needed
    function loadAll() {
        try {
            const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            if (Array.isArray(raw)) {
                // Migrate: old format was a flat array — assign to current semester
                const migrated = {};
                migrated[currentSemester] = raw.map(c =>
                    typeof c === 'string' ? { name: c, topic: null } : c
                );
                localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
                return migrated;
            }
            return raw;
        } catch { return {}; }
    }

    function saveAll(all) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    }

    // Active course list for the current semester
    const courses = [];

    function loadCoursesForSemester() {
        const all = loadAll();
        const list = all[currentSemester] || [];
        courses.length = 0;
        list.forEach(c => {
            courses.push(typeof c === 'string' ? { name: c, topic: null } : c);
        });
    }

    // Initial load
    loadCoursesForSemester();

    function save() {
        const all = loadAll();
        all[currentSemester] = courses;
        saveAll(all);
    }

    function setSemester(code) {
        save(); // persist current semester's courses
        currentSemester = code;
        loadCoursesForSemester();
        render();
    }

    function getCourses() {
        return courses.map(c => ({ ...c }));
    }

    function setCourses(list) {
        courses.length = 0;
        list.forEach(c => courses.push({ ...c }));
        save();
        render();
    }

    /** Display name for a course entry. */
    function displayName(course) {
        if (course.topic) return `${course.name}: ${course.topic}`;
        return course.name;
    }

    function getColorForIndex(index) {
        return COURSE_COLORS[index % COURSE_COLORS.length];
    }

    function onChange(cb) {
        onChangeCallback = cb;
    }

    /**
     * Add a course. Accepts either:
     *   - a string like "CS 314" (manual entry, no topic)
     *   - an object { name: "UGS 303", topic: "SLEEP: ARE WE..." }
     */
    function addCourse(input) {
        let entry;

        if (typeof input === 'string') {
            const cleaned = input.trim().toUpperCase();
            if (!cleaned) return false;
            if (!/^[A-Z\s]+\s+\d+\w*$/.test(cleaned)) return false;
            entry = { name: cleaned, topic: null };
        } else {
            if (!input || !input.name) return false;
            entry = {
                name: input.name.trim().toUpperCase(),
                topic: input.topic || null,
                resultUrl: input.resultUrl || null,
            };
        }

        // Duplicate check:
        // - If either has no topic, same name alone is a duplicate
        // - If both have topics, name + topic must match
        const isDuplicate = courses.some(c => {
            if (c.name.toUpperCase() !== entry.name.toUpperCase()) return false;
            if (!entry.topic || !c.topic) return true;
            return c.topic.toUpperCase() === entry.topic.toUpperCase();
        });
        if (isDuplicate) return false;

        courses.push(entry);
        save();
        render();
        if (onChangeCallback) onChangeCallback();
        return true;
    }

    function removeCourse(index) {
        courses.splice(index, 1);
        save();
        render();
        if (onChangeCallback) onChangeCallback();
    }

    function editCourse(index, newName) {
        const cleaned = newName.trim().toUpperCase();
        if (!cleaned) return false;
        if (!/^[A-Z\s]+\s+\d+\w*$/.test(cleaned)) return false;
        // Duplicate check (skip self)
        const isDup = courses.some((c, i) => i !== index && c.name.toUpperCase() === cleaned);
        if (isDup) return false;
        courses[index].name = cleaned;
        courses[index].title = null; // clear stale title
        save();
        render();
        if (onChangeCallback) onChangeCallback();
        return true;
    }

    /**
     * Update course titles from scrape results.
     * Sets a display-only `title` on entries that don't already have a topic.
     */
    function setTitles(scrapeResults) {
        scrapeResults.forEach((result, i) => {
            if (i < courses.length && !courses[i].topic && result.courseTitle) {
                courses[i].title = result.courseTitle;
            }
        });
        save();
        render();
    }

    /** Extract credit hours from a course name using UT convention:
     *  the first digit of the course number = credit hours.
     *  e.g. "CS 314" → 3, "M 408D" → 4, "UGS 303" → 3 */
    function getCredits(courseName) {
        const m = courseName.match(/\d/);
        return m ? parseInt(m[0]) : 3;
    }

    function startEdit(li, index) {
        const nameSpan = li.querySelector('.course-name');
        const oldName = courses[index].name;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'course-edit-input';
        input.value = oldName;

        const finish = () => {
            const ok = editCourse(index, input.value);
            if (!ok) {
                courses[index].name = oldName; // revert on failure
                render();
            }
        };
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); finish(); }
            if (e.key === 'Escape') { render(); }
        });
        input.addEventListener('blur', finish);

        nameSpan.textContent = '';
        nameSpan.appendChild(input);
        input.focus();
        input.select();
    }

    function render() {
        const list = document.getElementById('courseList');
        list.innerHTML = '';

        courses.forEach((course, i) => {
            const li = document.createElement('li');
            const subtitle = course.topic || course.title || '';
            const subtitleHtml = subtitle
                ? `<span class="course-topic">${subtitle}</span>`
                : '';
            li.innerHTML = `
                <span class="course-color" style="background:${getColorForIndex(i)}"></span>
                <span class="course-name">${course.name}${subtitleHtml}</span>
                <button class="edit-btn" data-index="${i}" title="Edit course">&#9998;</button>
                <button class="remove-btn" data-index="${i}">&times;</button>
            `;
            list.appendChild(li);
        });

        list.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index);
                startEdit(btn.closest('li'), idx);
            });
        });

        list.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index);
                const removed = courses[idx] ? { ...courses[idx] } : null;
                removeCourse(idx);
                // Dispatch a custom event so app.js can show undo toast
                if (removed) {
                    document.dispatchEvent(new CustomEvent('courseRemoved', {
                        detail: { course: removed, index: idx }
                    }));
                }
            });
        });

        // Update total credit hours
        const totalEl = document.getElementById('totalHours');
        if (totalEl) {
            if (courses.length > 0) {
                const total = courses.reduce((sum, c) => sum + getCredits(c.name), 0);
                totalEl.textContent = `${courses.length} course(s) · ${total} credit hours`;
                totalEl.classList.remove('hidden');
            } else {
                totalEl.classList.add('hidden');
            }
        }
    }

    // Render saved courses on load
    render();

    return { getCourses, setCourses, getColorForIndex, addCourse, removeCourse, editCourse, onChange, displayName, setTitles, setSemester };
})();
