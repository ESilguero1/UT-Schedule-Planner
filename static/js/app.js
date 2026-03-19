/**
 * Main application controller.
 */
document.addEventListener('DOMContentLoaded', () => {
    const courseInput = document.getElementById('courseInput');
    const addBtn = document.getElementById('addCourseBtn');
    const generateBtn = document.getElementById('generateBtn');
    const loginBtn = document.getElementById('loginBtn');
    const statusArea = document.getElementById('statusArea');
    const includeClosedCb = document.getElementById('includeClosedCb');
    const compareCb = document.getElementById('compareCb');
    const sortSelect = document.getElementById('sortSelect');
    const authHelp = document.getElementById('authHelp');
    const professorFilterPanel = document.getElementById('professorFilterPanel');
    const professorFiltersDiv = document.getElementById('professorFilters');

    const timeStartSelect = document.getElementById('timeStart');
    const timeEndSelect = document.getElementById('timeEnd');

    // ── Custom prompt modal ──────────────────────────────
    const promptModal = document.getElementById('promptModal');
    const promptTitle = document.getElementById('promptTitle');
    const promptFields = document.getElementById('promptFields');
    const promptError = document.getElementById('promptError');
    const promptOk = document.getElementById('promptOk');
    const promptCancel = document.getElementById('promptCancel');
    const promptClose = document.getElementById('promptClose');

    /**
     * Show a custom prompt dialog.
     * @param {string} title - Modal title
     * @param {Array} fields - Array of { label, placeholder?, defaultValue?, type? }
     * @param {Function} [validate] - Optional validator, receives values object, return error string or null
     * @returns {Promise<object|null>} - Resolves with { fieldLabel: value } or null if cancelled
     */
    function showPrompt(title, fields, validate, hint) {
        return new Promise(resolve => {
            promptTitle.textContent = title;
            promptError.textContent = '';
            promptError.classList.add('hidden');
            promptFields.innerHTML = '';

            if (hint) {
                const hintEl = document.createElement('div');
                hintEl.className = 'prompt-hint';
                hintEl.innerHTML = hint;
                promptFields.appendChild(hintEl);
            }

            fields.forEach((f, i) => {
                const div = document.createElement('div');
                div.className = 'prompt-field';
                div.innerHTML = `<label>${f.label}</label>`;
                const input = document.createElement('input');
                input.type = f.type || 'text';
                input.placeholder = f.placeholder || '';
                input.value = f.defaultValue || '';
                input.dataset.key = f.key || f.label;
                div.appendChild(input);
                promptFields.appendChild(div);
                if (i === 0) setTimeout(() => { input.focus(); input.select(); }, 50);
            });

            promptModal.classList.remove('hidden');

            const getValues = () => {
                const vals = {};
                promptFields.querySelectorAll('input').forEach(inp => {
                    vals[inp.dataset.key] = inp.value;
                });
                return vals;
            };

            const cleanup = () => {
                promptModal.classList.add('hidden');
                promptOk.removeEventListener('click', onOk);
                promptCancel.removeEventListener('click', onCancel);
                promptClose.removeEventListener('click', onCancel);
                document.removeEventListener('keydown', onKey);
            };

            const onOk = () => {
                const vals = getValues();
                if (validate) {
                    const err = validate(vals);
                    if (err) {
                        promptError.textContent = err;
                        promptError.classList.remove('hidden');
                        return;
                    }
                }
                cleanup();
                resolve(vals);
            };

            const onCancel = () => { cleanup(); resolve(null); };

            const onKey = (e) => {
                if (e.key === 'Enter') onOk();
                if (e.key === 'Escape') onCancel();
            };

            promptOk.addEventListener('click', onOk);
            promptCancel.addEventListener('click', onCancel);
            promptClose.addEventListener('click', onCancel);
            document.addEventListener('keydown', onKey);
        });
    }

    // ── Toast notification helper ───────────────────────
    const toastContainer = document.getElementById('toastContainer');
    function showToast(message, undoFn, duration = 5000) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `<span>${message}</span>`;
        if (undoFn) {
            const btn = document.createElement('button');
            btn.className = 'toast-undo';
            btn.textContent = 'Undo';
            btn.addEventListener('click', () => {
                undoFn();
                toast.remove();
            });
            toast.appendChild(btn);
        }
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('toast-out');
            toast.addEventListener('animationend', () => toast.remove());
        }, duration);
    }

    // ── Inline input error helper ────────────────────────
    const inputError = document.getElementById('inputError');
    function showInputError(msg) {
        inputError.textContent = msg;
        setTimeout(() => { if (inputError.textContent === msg) inputError.textContent = ''; }, 4000);
    }

    // Populate time dropdowns (7 AM to 10 PM)
    for (let h = 7; h <= 22; h++) {
        const ampm = h < 12 ? 'AM' : 'PM';
        const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
        const display = `${h12}:00 ${ampm}`;
        const val = `${h}:00`;
        timeStartSelect.insertAdjacentHTML('beforeend', `<option value="${val}">${display}</option>`);
        timeEndSelect.insertAdjacentHTML('beforeend', `<option value="${val}">${display}</option>`);
    }

    const FILTER_STORAGE_KEY = 'sp_prof_filters';
    const SEMESTER_STORAGE_KEY = 'sp_semester';
    const SAVED_STORAGE_KEY = 'sp_saved';
    const semesterSelect = document.getElementById('semesterSelect');
    const savedPanel = document.getElementById('savedPanel');
    const savedList = document.getElementById('savedList');
    const saveBtn = document.getElementById('saveBtn');
    const backToResultsBtn = document.getElementById('backToResultsBtn');
    const refreshStatusBtn = document.getElementById('refreshStatusBtn');

    // ── Semester selector ────────────────────────────────
    function buildSemesterOptions() {
        const now = new Date();
        const year = now.getFullYear();
        const semesters = [];
        for (let y = year; y <= year + 1; y++) {
            semesters.push({ code: `${y}2`, label: `Spring ${y}` });
            semesters.push({ code: `${y}6`, label: `Summer ${y}` });
            semesters.push({ code: `${y}9`, label: `Fall ${y}` });
        }
        return semesters;
    }

    function initSemesterSelect() {
        const options = buildSemesterOptions();
        const saved = localStorage.getItem(SEMESTER_STORAGE_KEY);
        // Default: Fall of current year
        const defaultCode = saved || `${new Date().getFullYear()}9`;

        options.forEach(opt => {
            const el = document.createElement('option');
            el.value = opt.code;
            el.textContent = opt.label;
            if (opt.code === defaultCode) el.selected = true;
            semesterSelect.appendChild(el);
        });

        // If saved/default doesn't match any option, select the first
        if (!semesterSelect.value) semesterSelect.selectedIndex = 0;
        localStorage.setItem(SEMESTER_STORAGE_KEY, semesterSelect.value);

        // Update page title
        updateTitle();
    }

    function getSelectedSemester() {
        return semesterSelect.value;
    }

    function updateTitle() {
        const opt = semesterSelect.options[semesterSelect.selectedIndex];
        document.title = `UT Schedule Planner - ${opt ? opt.text : ''}`;
    }

    semesterSelect.addEventListener('change', () => {
        localStorage.setItem(SEMESTER_STORAGE_KEY, semesterSelect.value);
        updateTitle();
        // Switch semester and start with a blank course list
        CourseInput.setSemester(semesterSelect.value);
        CourseInput.setCourses([]);
        // Clear scrape data — sections differ per semester
        lastScrapeData = null;
        lastGenResult = null;
        lastColorMap = null;
        lastGradeData = null;
        viewingSaved = false;
        professorFilterPanel.classList.add('hidden');
        ScheduleViewer.setSchedules([], {}, semesterSelect.value);
        showStatus('', '');
        // Backend cache is keyed by semester, no need to clear it
        renderSavedList();
        syncSaveButton();
    });

    initSemesterSelect();

    // Stores scraped course data so we can re-generate without re-scraping
    let lastScrapeData = null;
    let lastGenResult = null;
    let lastColorMap = null;
    let viewingSaved = false;
    let lastGradeData = null; // grade distributions keyed by "PREFIX NUMBER"



    function saveFilterState() {
        const state = {};
        professorFiltersDiv.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            const course = cb.dataset.course;
            const instructor = cb.dataset.instructor;
            if (!state[course]) state[course] = {};
            state[course][instructor] = cb.checked;
        });
        localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(state));
    }

    function getSavedFilterState() {
        try {
            return JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY) || '{}');
        } catch { return {}; }
    }

    // Clear scrape cache and refresh search buttons whenever course list changes
    CourseInput.onChange(() => {
        lastScrapeData = null;
        professorFilterPanel.classList.add('hidden');
        // Re-enable search Add buttons for courses no longer in the list
        const existing = CourseInput.getCourses();
        searchResults.querySelectorAll('.search-result').forEach(div => {
            const btn = div.querySelector('.search-add-btn');
            if (!btn) return;
            const srName = (div.dataset.courseName || '').toUpperCase();
            const srTopic = (div.dataset.courseTopic || '').toUpperCase();
            const stillExists = existing.some(c =>
                c.name.toUpperCase() === srName &&
                (c.topic || '').toUpperCase() === srTopic
            );
            if (!stillExists) {
                btn.textContent = 'Add';
                btn.disabled = false;
            }
        });
    });

    // ── Undo toast for course removal ──────────────────
    document.addEventListener('courseRemoved', (e) => {
        const { course } = e.detail;
        const name = course.topic ? `${course.name}: ${course.topic}` : course.name;
        showToast(`Removed ${name}`, () => {
            CourseInput.addCourse(course);
        });
    });

    // ── Add course ──────────────────────────────────────
    function handleAddCourse() {
        const val = courseInput.value.trim();
        if (!val) return;

        // Check format before attempting add to give specific error
        const cleaned = val.trim().toUpperCase();
        if (!/^[A-Z\s]+\s+\d+\w*$/.test(cleaned)) {
            showInputError('Invalid format. Use e.g. "CS 314" or "M 408D"');
            return;
        }

        if (CourseInput.addCourse(val)) {
            courseInput.value = '';
            courseInput.focus();
            inputError.textContent = '';
        } else {
            showInputError('This course is already in your list.');
        }
    }

    addBtn.addEventListener('click', handleAddCourse);
    courseInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleAddCourse();
    });

    // ── Connect / Login ─────────────────────────────────
    loginBtn.addEventListener('click', async () => {
        loginBtn.disabled = true;
        loginBtn.textContent = 'Waiting for login...';
        authHelp.textContent = 'Complete the login in the Chrome window that opened. You only need to do this once.';

        try {
            const result = await API.login();
            if (result.success) {
                setAuthStatus(true);
                authHelp.textContent = 'Session saved. You won\'t need to log in again.';
                loginBtn.textContent = 'Connected';
            } else {
                setAuthStatus(false);
                authHelp.textContent = result.message || 'Login timed out. Click to try again.';
                loginBtn.textContent = 'Connect to UT';
            }
        } catch (e) {
            setAuthStatus(false);
            authHelp.textContent = 'Connection error. Click to try again.';
            loginBtn.textContent = 'Connect to UT';
        } finally {
            loginBtn.disabled = false;
        }
    });

    // ── Professor filter helpers ─────────────────────────

    async function regenerateFromFilters() {
        if (!lastScrapeData) return;

        const filteredSections = getFilteredSections(lastScrapeData);
        const courseNames = lastScrapeData.map(c => c.courseName);
        const filteredCounts = filteredSections.map((s, i) => `${courseNames[i]}: ${s.length}`).join(', ');
        showStatus(`<span class="spinner"></span> Generating schedules (${filteredCounts})...`, '');

        const colorMap = {};
        lastScrapeData.forEach((c, i) => {
            colorMap[c.courseName] = CourseInput.getColorForIndex(i);
        });

        try {
            const includeClosed = includeClosedCb.checked;
            const genResult = await API.generateSchedules(filteredSections, includeClosed, courseNames);

            if (!genResult.success) {
                showStatus('Error: ' + (genResult.error || 'Unknown'), 'error');
                return;
            }

            showScheduleResult(genResult, colorMap);
        } catch (e) {
            showStatus('Error: ' + e.message, 'error');
        }
    }

    /** Build a Rate My Professors search URL for UT Austin (school ID 1255).
     *  Instructor format: "LASTNAME, FIRSTNAME M" → "Firstname Lastname" */
    function rmpUrl(instructor) {
        const parts = instructor.split(',');
        const last = parts[0].trim();
        const first = parts.length > 1 ? parts[1].trim().split(/\s+/)[0] : '';
        const toTitle = s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
        const query = first ? `${toTitle(first)} ${toTitle(last)}` : toTitle(last);
        return `https://www.ratemyprofessors.com/search/professors/1255?q=${encodeURIComponent(query)}`;
    }

    /** Extract last name from registrar format "LASTNAME, FIRSTNAME M" */
    function extractLastName(instructor) {
        if (!instructor || instructor === 'TBA') return null;
        return instructor.split(',')[0].trim().toUpperCase();
    }

    /** Format GPA as a colored badge class */
    function gpaClass(gpa) {
        if (gpa >= 3.5) return 'gpa-high';
        if (gpa < 2.5) return 'gpa-low';
        return 'gpa-mid';
    }

    /** Show a grade distribution popup with histogram */
    function showGradePopup(title, gradeData) {
        // Remove any existing popup
        document.querySelector('.grade-popup-overlay')?.remove();

        const dist = gradeData.distribution;
        const gpa = gradeData.gpa;
        const total = gradeData.totalStudents;

        // Grade categories for histogram (in order)
        const categories = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'];
        const maxCount = Math.max(...categories.map(g => dist[g] || 0), 1);

        let barsHtml = '';
        categories.forEach(grade => {
            const count = dist[grade] || 0;
            const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
            const height = Math.max((count / maxCount) * 100, 2);
            barsHtml += `
                <div class="grade-bar-col">
                    <div class="grade-bar-value">${pct}%</div>
                    <div class="grade-bar" style="height:${height}%"></div>
                    <div class="grade-bar-label">${grade}</div>
                </div>
            `;
        });

        const overlay = document.createElement('div');
        overlay.className = 'grade-popup-overlay';
        overlay.innerHTML = `
            <div class="grade-popup">
                <div class="grade-popup-header">
                    <h3>${title}</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="grade-popup-stats">
                    <div class="grade-stat">
                        <span class="grade-stat-label">Average GPA</span>
                        <span class="grade-stat-value ${gpaClass(gpa)}">${gpa != null ? gpa.toFixed(2) : 'N/A'}</span>
                    </div>
                    <div class="grade-stat">
                        <span class="grade-stat-label">Total Students</span>
                        <span class="grade-stat-value">${total.toLocaleString()}</span>
                    </div>
                </div>
                <div class="grade-histogram">
                    ${barsHtml}
                </div>
            </div>
        `;

        overlay.addEventListener('click', e => {
            if (e.target === overlay || e.target.closest('.modal-close')) overlay.remove();
        });
        document.addEventListener('keydown', function esc(e) {
            if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', esc); }
        });

        document.body.appendChild(overlay);
    }

    /** Fetch grade data for the current courses (non-blocking) */
    async function fetchGradeData(courseData) {
        const courses = courseData.map(c => ({
            prefix: c.prefix,
            number: c.number,
        }));
        try {
            const result = await API.getGrades(courses);
            if (result.success) {
                lastGradeData = result.grades;
                applyGradeDataToFilters();
            }
        } catch (e) {
            console.warn('Grade data fetch failed:', e);
        }
    }

    /** Apply fetched grade data to already-rendered professor filter items */
    function applyGradeDataToFilters() {
        if (!lastGradeData) return;
        professorFiltersDiv.querySelectorAll('.prof-filter-course').forEach(block => {
            const courseName = block.querySelector('.prof-filter-name')?.textContent;
            if (!courseName) return;
            const baseName = courseName.split(':')[0].trim();
            const gradeInfo = lastGradeData[courseName] || lastGradeData[baseName];
            if (!gradeInfo) return;

            // Add course-level GPA button to header
            const header = block.querySelector('.prof-filter-header');
            if (header && !header.querySelector('.gpa-btn')) {
                const btn = document.createElement('button');
                btn.className = `gpa-btn ${gpaClass(gradeInfo.gpa)}`;
                btn.textContent = gradeInfo.gpa != null ? gradeInfo.gpa.toFixed(2) : '—';
                btn.title = 'View grade distribution';
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    showGradePopup(`${courseName} — All Instructors`, gradeInfo);
                });
                header.appendChild(btn);
            }

            // Add per-instructor GPA buttons
            block.querySelectorAll('.prof-filter-item').forEach(item => {
                if (item.querySelector('.gpa-btn')) return;
                const instrName = item.querySelector('input')?.dataset.instructor;
                if (!instrName || instrName === 'TBA') return;
                const lastName = extractLastName(instrName);
                if (!lastName) return;
                const instrGrade = gradeInfo.instructors?.[lastName];
                if (instrGrade) {
                    const btn = document.createElement('button');
                    btn.className = `gpa-btn ${gpaClass(instrGrade.gpa)}`;
                    btn.textContent = instrGrade.gpa != null ? instrGrade.gpa.toFixed(2) : '—';
                    btn.title = 'View grade distribution';
                    btn.addEventListener('click', e => {
                        e.stopPropagation();
                        e.preventDefault();
                        const displayName = instrGrade.displayName || instrName;
                        showGradePopup(`${courseName} — ${displayName}`, instrGrade);
                    });
                    // Insert before RMP link if present, else at end
                    const rmpLink = item.querySelector('.rmp-btn');
                    if (rmpLink) item.insertBefore(btn, rmpLink);
                    else item.appendChild(btn);
                }
            });
        });
    }

    function buildProfessorFilters(courseData) {
        professorFiltersDiv.innerHTML = '';
        const saved = getSavedFilterState();

        courseData.forEach((course, i) => {
            // Collect unique instructors for this course
            const instructors = new Map(); // instructor name -> section count
            course.sections.forEach(s => {
                const name = (s.instructor || 'TBA').trim();
                instructors.set(name, (instructors.get(name) || 0) + 1);
            });

            if (instructors.size === 0) return;

            const courseBlock = document.createElement('div');
            courseBlock.className = 'prof-filter-course';

            const header = document.createElement('div');
            header.className = 'prof-filter-header';
            header.innerHTML = `
                <span class="course-color" style="background:${CourseInput.getColorForIndex(i)}"></span>
                <span class="prof-filter-name">${course.courseName}</span>
                <span class="prof-filter-count">${course.sections.length} sections</span>
            `;
            courseBlock.appendChild(header);

            const list = document.createElement('div');
            list.className = 'prof-filter-list';

            // Sort: TBA last, then alphabetical
            const sorted = [...instructors.entries()].sort((a, b) => {
                if (a[0] === 'TBA') return 1;
                if (b[0] === 'TBA') return -1;
                return a[0].localeCompare(b[0]);
            });

            sorted.forEach(([name, count]) => {
                // Restore saved state if available, default to checked
                const isChecked = saved[course.courseName]?.[name] ?? true;
                const label = document.createElement('label');
                label.className = 'prof-filter-item';

                const rmpLink = name !== 'TBA' ? `<a class="rmp-btn" href="${rmpUrl(name)}" target="_blank" rel="noopener" title="Rate My Professors">RMP</a>` : '';

                label.innerHTML = `
                    <input type="checkbox" ${isChecked ? 'checked' : ''}
                        data-course="${course.courseName}"
                        data-instructor="${name}">
                    <span class="prof-name">${name}</span>
                    <span class="prof-sections">(${count})</span>
                    ${rmpLink}
                `;
                list.appendChild(label);
            });

            courseBlock.appendChild(list);
            professorFiltersDiv.appendChild(courseBlock);
        });

        // Auto re-generate and save when any filter checkbox changes
        professorFiltersDiv.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                saveFilterState();
                regenerateFromFilters();
            });
        });

        professorFilterPanel.classList.toggle('hidden', courseData.length === 0);

        // If grade data already loaded, apply immediately; otherwise fetch
        if (lastGradeData) {
            applyGradeDataToFilters();
        }
    }

    function getFilteredSections(courseData) {
        // Get checked instructors per course
        const allowed = {}; // courseName -> Set of instructor names
        professorFiltersDiv.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            const course = cb.dataset.course;
            const instructor = cb.dataset.instructor;
            if (!allowed[course]) allowed[course] = { checked: new Set(), hasAny: false };
            allowed[course].hasAny = true;
            if (cb.checked) allowed[course].checked.add(instructor);
        });

        return courseData.map(course => {
            const filter = allowed[course.courseName];
            if (!filter || !filter.hasAny) return course.sections;
            return course.sections.filter(s => {
                const name = (s.instructor || 'TBA').trim();
                return filter.checked.has(name);
            });
        });
    }

    // ── Day/time preference filters ────────────────────────
    function getDaysOff() {
        const days = [];
        document.querySelectorAll('.day-toggle input:checked').forEach(cb => {
            days.push(cb.dataset.day);
        });
        return days;
    }

    function getTimeWindow() {
        const start = timeStartSelect.value;
        const end = timeEndSelect.value;
        return {
            start: start ? toMinutes(start) : null,
            end: end ? toMinutes(end) : null,
        };
    }

    function toMinutes(t) {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + (m || 0);
    }

    // ── Breaks management ────────────────────────────────
    const breaksList = document.getElementById('breaksList');
    const addBreakBtn = document.getElementById('addBreakBtn');
    const breaks = [];

    function timeOptionsHtml() {
        let html = '';
        for (let h = 7; h <= 22; h++) {
            const ampm = h < 12 ? 'AM' : 'PM';
            const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
            for (const m of ['00', '15', '30', '45']) {
                const val = `${h}:${m}`;
                html += `<option value="${val}">${h12}:${m} ${ampm}</option>`;
            }
        }
        return html;
    }

    function addBreak() {
        const id = Date.now();
        breaks.push({ id, days: ['M', 'T', 'W', 'TH', 'F'], start: '12:00', end: '13:00' });
        renderBreaks();
    }

    function removeBreak(id) {
        const idx = breaks.findIndex(b => b.id === id);
        if (idx >= 0) breaks.splice(idx, 1);
        renderBreaks();
    }

    function renderBreaks() {
        breaksList.innerHTML = '';
        const timeOpts = timeOptionsHtml();
        const dayOpts = [
            ['M', 'M'], ['T', 'T'], ['W', 'W'], ['TH', 'Th'], ['F', 'F'],
        ];

        breaks.forEach(b => {
            const div = document.createElement('div');
            div.className = 'break-entry';

            // Day checkboxes
            const daysHtml = dayOpts.map(([v, l]) =>
                `<label class="break-day-toggle"><input type="checkbox" value="${v}" ${b.days.includes(v) ? 'checked' : ''}><span>${l}</span></label>`
            ).join('');

            div.innerHTML = `
                <div class="break-days">${daysHtml}</div>
                <div class="break-times">
                    <select class="break-time break-start">${timeOpts}</select>
                    <span class="break-sep">to</span>
                    <select class="break-time break-end">${timeOpts}</select>
                </div>
                <button class="break-remove">&times;</button>
            `;
            // Set selected times
            div.querySelector('.break-start').value = b.start;
            div.querySelector('.break-end').value = b.end;

            div.querySelectorAll('.break-day-toggle input').forEach(cb => {
                cb.addEventListener('change', () => {
                    b.days = [...div.querySelectorAll('.break-day-toggle input:checked')].map(c => c.value);
                });
            });
            div.querySelector('.break-start').addEventListener('change', e => { b.start = e.target.value; });
            div.querySelector('.break-end').addEventListener('change', e => { b.end = e.target.value; });
            div.querySelector('.break-remove').addEventListener('click', () => removeBreak(b.id));

            breaksList.appendChild(div);
        });
    }

    addBreakBtn.addEventListener('click', addBreak);

    function getBreaks() {
        const result = [];
        breaks.forEach(b => {
            (b.days || []).forEach(day => {
                result.push({
                    day,
                    start: toMinutes(b.start),
                    end: toMinutes(b.end),
                });
            });
        });
        return result;
    }

    function filterSchedulesByPrefs(schedules) {
        const daysOff = getDaysOff();
        const time = getTimeWindow();
        const brks = getBreaks();
        if (daysOff.length === 0 && time.start === null && time.end === null && brks.length === 0) return schedules;

        return schedules.filter(sections => {
            for (const s of sections) {
                const allSlots = [s, ...(s.linkedSections || [])];
                for (const slot of allSlots) {
                    if (!slot.days || !slot.startTime || !slot.endTime) continue;
                    const slotStart = toMinutes(slot.startTime);
                    const slotEnd = toMinutes(slot.endTime);

                    for (const d of slot.days) {
                        // Check days off
                        if (daysOff.includes(d)) return false;
                        // Check breaks (overlapping blockouts)
                        for (const brk of brks) {
                            if (brk.day === d && slotStart < brk.end && slotEnd > brk.start) return false;
                        }
                    }
                    // Check time window
                    if (time.start !== null && slotStart < time.start) return false;
                    if (time.end !== null && slotEnd > time.end) return false;
                }
            }
            return true;
        });
    }

    // ── Schedule result display ────────────────────────────
    function showScheduleResult(genResult, colorMap) {
        lastGenResult = genResult;
        lastColorMap = colorMap;
        viewingSaved = false;

        const count = genResult.scheduleCount;
        const capped = genResult.capped ? ' (capped)' : '';
        const dropped = genResult.droppedCourses || [];
        const conflicts = genResult.conflicts || [];

        // Apply day-off and time-window filters
        const filtered = filterSchedulesByPrefs(genResult.schedules);
        const prefFiltered = genResult.schedules.length - filtered.length;

        let msg = '';
        if (dropped.length > 0) {
            msg += `<span class="error">No available sections for: ${dropped.join(', ')}</span><br>`;
        }
        if (count === 0 && conflicts.length > 0) {
            msg += `<span class="error">No valid schedules — these courses conflict:</span>`;
            msg += '<ul class="conflict-list">';
            conflicts.forEach(c => {
                msg += `<li>${c.courseA} &harr; ${c.courseB}</li>`;
            });
            msg += '</ul>';
        } else if (filtered.length === 0 && count > 0) {
            msg += `<span class="error">Found ${count} schedule(s), but none match your day/time preferences.</span>`;
        } else if (count === 0 && dropped.length === 0) {
            msg += `<span class="error">No valid schedules found — all combinations have time conflicts.</span>`;
        } else if (count === 0) {
            msg += `<span class="error">No valid schedules found with remaining courses.</span>`;
        } else {
            msg += `<span class="success">Found ${filtered.length} valid schedule(s)${capped}!</span>`;
            if (prefFiltered > 0) {
                msg += ` <span class="text-muted">(${prefFiltered} filtered by preferences)</span>`;
            }
        }
        showStatus(msg, '');
        ScheduleViewer.setSchedules(filtered, colorMap, getSelectedSemester());
        syncSaveButton();
    }

    // ── Generate Schedules ──────────────────────────────
    generateBtn.addEventListener('click', async () => {
        const courses = CourseInput.getCourses();
        if (courses.length === 0) {
            showStatus('Add at least one course first.', 'error');
            return;
        }

        generateBtn.disabled = true;

        // If not connected, trigger login first
        const auth = await API.checkAuth();
        if (!auth.authenticated) {
            if (auth.maybeAuthenticated) {
                showStatus('<span class="spinner"></span> Verifying session...', '', true);
                authHelp.textContent = 'Checking your saved session...';
            } else {
                showStatus('<span class="spinner"></span> Opening Chrome for login...', '');
                authHelp.textContent = 'Complete the login in the Chrome window, then schedules will generate automatically.';
            }
            loginBtn.disabled = true;
            loginBtn.textContent = 'Connecting...';

            try {
                const loginResult = await API.login();
                if (!loginResult.success) {
                    setAuthStatus(false);
                    showStatus('Not logged in. Log into UT in Chrome, then try again.', 'error');
                    loginBtn.textContent = 'Connect to UT';
                    loginBtn.disabled = false;
                    generateBtn.disabled = false;
                    return;
                }
                setAuthStatus(true);
                authHelp.textContent = 'Session saved. You won\'t need to log in again.';
                loginBtn.textContent = 'Connected';
                loginBtn.disabled = false;
            } catch (e) {
                showStatus('Login error: ' + e.message, 'error');
                loginBtn.textContent = 'Connect to UT';
                loginBtn.disabled = false;
                generateBtn.disabled = false;
                return;
            }
        }

        try {
            // Only re-scrape if course list changed
            if (!lastScrapeData) {
                showStatus(`<span class="spinner"></span> Scraping ${courses.length} course(s)...`, '', true);
                const scrapeResult = await API.scrapeCourses(courses, getSelectedSemester());

                if (!scrapeResult.success) {
                    showStatus('Scrape error: ' + (scrapeResult.error || 'Unknown'), 'error');
                    generateBtn.disabled = false;
                    return;
                }

                lastScrapeData = scrapeResult.courses;
                CourseInput.setTitles(lastScrapeData);
                buildProfessorFilters(lastScrapeData);
                // Fetch grade distributions in background (non-blocking)
                fetchGradeData(lastScrapeData);
            }

            const courseData = lastScrapeData;
            const courseNames = courseData.map(c => c.courseName);

            // Apply professor filters
            const filteredSections = getFilteredSections(courseData);
            const filteredCounts = filteredSections.map((s, i) => `${courseNames[i]}: ${s.length}`).join(', ');
            showStatus(`<span class="spinner"></span> Generating schedules (${filteredCounts})...`, '');

            // Build color map
            const colorMap = {};
            courseData.forEach((c, i) => {
                colorMap[c.courseName] = CourseInput.getColorForIndex(i);
            });

            // Generate schedules with filtered sections
            const includeClosed = includeClosedCb.checked;
            const genResult = await API.generateSchedules(filteredSections, includeClosed, courseNames);

            if (!genResult.success) {
                showStatus('Error: ' + (genResult.error || 'Unknown'), 'error');
                generateBtn.disabled = false;
                return;
            }

            showScheduleResult(genResult, colorMap);

        } catch (e) {
            showStatus('Error: ' + e.message, 'error');
        } finally {
            generateBtn.disabled = false;
        }
    });

    // ── ICS Export ────────────────────────────────────────
    const exportIcsBtn = document.getElementById('exportIcsBtn');

    const ICS_DAYS = { M: 'MO', T: 'TU', W: 'WE', TH: 'TH', F: 'FR' };
    const JS_DAY_MAP = { M: 1, T: 2, W: 3, TH: 4, F: 5 };

    function formatIcsDate(date, time) {
        const [h, m] = time.split(':').map(Number);
        const d = new Date(date);
        d.setHours(h, m, 0, 0);
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    }

    function findFirstDay(semesterStart, dayCode) {
        const target = JS_DAY_MAP[dayCode];
        const d = new Date(semesterStart);
        while (d.getDay() !== target) d.setDate(d.getDate() + 1);
        return d;
    }

    function generateIcs(sections, startDate, endDate) {
        const start = startDate;
        const end = endDate;
        const pad = n => String(n).padStart(2, '0');
        const untilStr = `${end.getFullYear()}${pad(end.getMonth() + 1)}${pad(end.getDate())}T235959`;

        let ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//UT Schedule Planner//EN\r\n`;

        const addEvent = (courseName, slot, uniqueNumber) => {
            if (!slot.days || !slot.startTime || !slot.endTime) return;
            const rrDays = slot.days.map(d => ICS_DAYS[d]).join(',');
            const firstDay = findFirstDay(start, slot.days[0]);
            const dtStart = formatIcsDate(firstDay, slot.startTime);
            const dtEnd = formatIcsDate(firstDay, slot.endTime);

            ics += `BEGIN:VEVENT\r\n`;
            ics += `SUMMARY:${courseName}\r\n`;
            ics += `DTSTART:${dtStart}\r\n`;
            ics += `DTEND:${dtEnd}\r\n`;
            ics += `RRULE:FREQ=WEEKLY;BYDAY=${rrDays};UNTIL=${untilStr}\r\n`;
            if (slot.location) ics += `LOCATION:${slot.location}\r\n`;
            if (slot.instructor) ics += `DESCRIPTION:${slot.instructor}\\nUnique: ${uniqueNumber}\r\n`;
            ics += `END:VEVENT\r\n`;
        };

        sections.forEach(section => {
            addEvent(section.courseName, section, section.uniqueNumber);
            (section.linkedSections || []).forEach(linked => {
                addEvent(section.courseName + ' (Lab/Disc)', linked, section.uniqueNumber);
            });
        });

        ics += `END:VCALENDAR\r\n`;
        return ics;
    }

    document.getElementById('copyUniquesBtn').addEventListener('click', () => {
        const current = ScheduleViewer.getCurrentSchedule();
        if (!current) return;
        const uniques = current.sections.map(s => s.uniqueNumber);
        const text = uniques.join(', ');
        navigator.clipboard.writeText(text);
        const btn = document.getElementById('copyUniquesBtn');
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy Unique #s'; }, 1500);
    });

    exportIcsBtn.addEventListener('click', async () => {
        const current = ScheduleViewer.getCurrentSchedule();
        if (!current) return;

        const result = await showPrompt('Export to Google Calendar', [
            { key: 'start', label: 'First day of classes', type: 'date' },
            { key: 'end', label: 'Last day of classes', type: 'date' },
        ], vals => {
            if (!vals.start || !vals.end) return 'Both dates are required.';
            const s = new Date(vals.start + 'T00:00:00');
            const e = new Date(vals.end + 'T00:00:00');
            if (isNaN(s) || isNaN(e)) return 'Invalid date.';
            if (e <= s) return 'End date must be after start date.';
            return null;
        },
            'This will download an .ics file. To import into Google Calendar:'
            + '<ol>'
            + '<li>Go to <b>calendar.google.com</b></li>'
            + '<li>Click the <b>+</b> next to "Other calendars"</li>'
            + '<li>Select <b>Import</b></li>'
            + '<li>Upload the downloaded .ics file</li>'
            + '</ol>'
        );
        if (!result) return;

        const startDate = new Date(result.start + 'T00:00:00');
        const endDate = new Date(result.end + 'T00:00:00');

        const ics = generateIcs(current.sections, startDate, endDate);
        const blob = new Blob([ics], { type: 'text/calendar' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `schedule_${getSelectedSemester()}.ics`;
        a.click();
        URL.revokeObjectURL(url);
    });

    // ── Search Modal ─────────────────────────────────────
    const searchModal = document.getElementById('searchModal');
    const searchStatus = document.getElementById('searchStatus');
    const searchResults = document.getElementById('searchResults');
    const searchTabs = document.querySelectorAll('.search-tab');
    const searchTabContents = document.querySelectorAll('.search-tab-content');
    let activeSearchTab = 'keyword';

    // Tab switching
    searchTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            activeSearchTab = tab.dataset.tab;
            searchTabs.forEach(t => t.classList.toggle('active', t === tab));
            searchTabContents.forEach(c => c.classList.toggle('active', c.dataset.tab === activeSearchTab));
            // Focus the input in the active tab
            const input = document.querySelector(`.search-tab-content[data-tab="${activeSearchTab}"] input`);
            if (input) input.focus();
        });
    });

    document.getElementById('searchBtn').addEventListener('click', () => {
        searchModal.classList.remove('hidden');
        const input = document.querySelector(`.search-tab-content[data-tab="${activeSearchTab}"] input`);
        if (input) input.focus();
    });

    document.getElementById('searchModalClose').addEventListener('click', () => {
        searchModal.classList.add('hidden');
    });

    searchModal.addEventListener('click', (e) => {
        if (e.target === searchModal) searchModal.classList.add('hidden');
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !searchModal.classList.contains('hidden')) {
            searchModal.classList.add('hidden');
        }
    });

    function renderSearchResult(course, container) {
        const div = document.createElement('div');
        div.className = 'search-result';
        div.dataset.courseName = course.courseName;
        div.dataset.courseTopic = course.courseTitle || '';

        // Build registrar link — use resultUrl if available, otherwise construct from course name
        let registrarUrl = '';
        if (course.resultUrl) {
            registrarUrl = course.resultUrl.startsWith('http')
                ? course.resultUrl
                : `https://utdirect.utexas.edu${course.resultUrl}`;
        } else {
            const parts = course.courseName.match(/^([A-Z][A-Z ]*?)\s+(\S+)$/);
            if (parts) {
                const sem = getSelectedSemester() || '20269';
                registrarUrl = `https://utdirect.utexas.edu/apps/registrar/course_schedule/${sem}/results/?search_type_main=COURSE&fos_cn=${encodeURIComponent(parts[1])}&course_number=${encodeURIComponent(parts[2])}`;
            }
        }

        const nameHtml = registrarUrl
            ? `<a href="${registrarUrl}" target="_blank" rel="noopener" class="search-result-link">${course.courseName}</a>`
            : course.courseName;

        div.innerHTML = `
            <div class="search-result-info">
                <div class="search-result-name">${nameHtml}</div>
                <div class="search-result-title">${course.courseTitle || ''}</div>
            </div>
            <button class="btn btn-primary search-add-btn">Add</button>
        `;

        const addBtn = div.querySelector('.search-add-btn');
        addBtn.addEventListener('click', () => {
            const entry = course.courseTitle
                ? { name: course.courseName, topic: course.courseTitle, resultUrl: course.resultUrl }
                : course.courseName;
            if (CourseInput.addCourse(entry)) {
                addBtn.textContent = 'Added';
                addBtn.disabled = true;
            } else {
                addBtn.textContent = 'Already added';
                addBtn.disabled = true;
            }
        });

        container.appendChild(div);
    }

    async function doSearch() {
        const input = document.querySelector(`.search-tab-content[data-tab="${activeSearchTab}"] input`);
        const query = input ? input.value.trim() : '';
        if (!query) return;

        // Disable all search buttons during search
        const allBtns = document.querySelectorAll('.search-go-btn');
        allBtns.forEach(b => b.disabled = true);
        searchStatus.innerHTML = '<span class="spinner"></span> Searching...';
        searchResults.innerHTML = '';

        try {
            const result = await API.searchCourses(query, getSelectedSemester(), activeSearchTab);

            if (result.success && result.courses.length > 0) {
                result.courses.forEach(course => {
                    renderSearchResult(course, searchResults);
                });
                searchStatus.innerHTML = `<span class="success">Found ${result.courses.length} course(s)</span>`;
            } else {
                searchStatus.innerHTML = '<span class="error">No results found.</span>';
            }
        } catch (e) {
            searchStatus.innerHTML = `<span class="error">Error: ${e.message}</span>`;
        } finally {
            allBtns.forEach(b => b.disabled = false);
        }
    }

    // Bind search buttons and Enter key for all tabs
    document.querySelectorAll('.search-go-btn').forEach(btn => {
        btn.addEventListener('click', doSearch);
    });
    document.querySelectorAll('.search-tab-content input').forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doSearch();
        });
    });

    // ── Saved Schedules ─────────────────────────────────

    function getSavedSchedules() {
        try {
            const all = JSON.parse(localStorage.getItem(SAVED_STORAGE_KEY) || '{}');
            return all[getSelectedSemester()] || [];
        } catch { return []; }
    }

    function setSavedSchedules(list) {
        try {
            const all = JSON.parse(localStorage.getItem(SAVED_STORAGE_KEY) || '{}');
            all[getSelectedSemester()] = list;
            localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(all));
        } catch {}
    }

    /** Get the unique-number fingerprint for a schedule. */
    function scheduleFingerprint(sections) {
        return sections.map(s => s.uniqueNumber).sort().join(',');
    }

    /** Check if the currently displayed schedule is already saved. Returns index or -1. */
    function currentSavedIndex() {
        const current = ScheduleViewer.getCurrentSchedule();
        if (!current) return -1;
        const fp = scheduleFingerprint(current.sections);
        return getSavedSchedules().findIndex(
            s => scheduleFingerprint(s.sections) === fp
        );
    }

    function syncSaveButton() {
        if (viewingSaved) {
            saveBtn.classList.add('hidden');
            backToResultsBtn.classList.remove('hidden');
            refreshStatusBtn.classList.remove('hidden');
            return;
        }
        backToResultsBtn.classList.add('hidden');
        refreshStatusBtn.classList.add('hidden');
        const idx = currentSavedIndex();
        if (idx >= 0) {
            saveBtn.textContent = 'Unsave';
            saveBtn.classList.add('is-saved');
        } else {
            saveBtn.textContent = 'Save';
            saveBtn.classList.remove('is-saved');
        }
        saveBtn.classList.remove('hidden');
    }

    async function saveCurrentSchedule() {
        const current = ScheduleViewer.getCurrentSchedule();
        if (!current) return;

        const result = await showPrompt('Save Schedule', [
            { key: 'name', label: 'Schedule name', placeholder: 'e.g. Morning Classes' },
        ]);
        if (!result) return;
        const label = result.name.trim() || `Schedule ${getSavedSchedules().length + 1}`;

        const saved = getSavedSchedules();
        saved.push({
            name: label,
            sections: current.sections,
            colorMap: current.colorMap,
            courses: CourseInput.getCourses(),
            savedAt: Date.now(),
        });
        setSavedSchedules(saved);
        renderSavedList();
        syncSaveButton();
    }

    function removeCurrentSchedule() {
        const idx = currentSavedIndex();
        if (idx < 0) return;
        const saved = getSavedSchedules();
        saved.splice(idx, 1);
        setSavedSchedules(saved);
        renderSavedList();
        syncSaveButton();
    }

    async function renameSavedSchedule(index) {
        const saved = getSavedSchedules();
        if (index >= saved.length) return;
        const currentName = saved[index].name || `Schedule ${index + 1}`;
        const result = await showPrompt('Rename Schedule', [
            { key: 'name', label: 'Schedule name', defaultValue: currentName },
        ]);
        if (!result) return;
        saved[index].name = result.name.trim() || currentName;
        setSavedSchedules(saved);
        renderSavedList();
    }

    function deleteSavedSchedule(index) {
        const saved = getSavedSchedules();
        const removed = saved[index];
        saved.splice(index, 1);
        setSavedSchedules(saved);
        renderSavedList();
        syncSaveButton();

        if (removed) {
            const label = removed.name || `Schedule ${index + 1}`;
            showToast(`Deleted "${label}"`, () => {
                // Undo: re-insert at original position
                const current = getSavedSchedules();
                current.splice(index, 0, removed);
                setSavedSchedules(current);
                renderSavedList();
                syncSaveButton();
            });
        }
    }

    function viewSavedSchedule(index) {
        const saved = getSavedSchedules();
        if (index >= saved.length) return;
        const s = saved[index];
        viewingSaved = true;
        viewingSavedIndex = index;

        // Restore the course list that was active when this schedule was saved
        if (s.courses) {
            CourseInput.setCourses(s.courses);
            lastScrapeData = null;
        }

        ScheduleViewer.setSchedules([s.sections], s.colorMap, getSelectedSemester());

        // Override counter with saved schedule name and position
        const label = s.name || `Schedule ${index + 1}`;
        document.getElementById('scheduleCounter').textContent =
            `${label} (${index + 1} of ${saved.length})`;
        document.getElementById('prevBtn').disabled = index === 0;
        document.getElementById('nextBtn').disabled = index === saved.length - 1;

        showStatus('Viewing saved schedules.', '');
        syncSaveButton();
        renderSavedList();
    }

    function backToResults() {
        viewingSaved = false;
        viewingSavedIndex = -1;
        if (lastGenResult && lastColorMap) {
            showScheduleResult(lastGenResult, lastColorMap);
        } else {
            ScheduleViewer.setSchedules([], {}, getSelectedSemester());
            showStatus('', '');
        }
        syncSaveButton();
        renderSavedList();
    }

    let viewingSavedIndex = -1;

    function renderSavedList() {
        const saved = getSavedSchedules();
        if (saved.length === 0) {
            savedPanel.classList.add('hidden');
            return;
        }

        savedPanel.classList.remove('hidden');
        savedList.innerHTML = '';

        saved.forEach((s, i) => {
            const label = s.name || `Schedule ${i + 1}`;
            const courses = [...new Set(s.sections.map(sec => sec.courseName))];
            const credits = courses.reduce((sum, c) => {
                const m = c.match(/\d/);
                return sum + (m ? parseInt(m[0]) : 3);
            }, 0);

            const div = document.createElement('div');
            div.className = 'saved-item' + (viewingSaved && viewingSavedIndex === i ? ' active' : '');
            div.innerHTML = `
                <div class="saved-info">
                    <div class="saved-name">${label}</div>
                </div>
                <span class="saved-meta">${courses.length} courses · ${credits}h</span>
                <button class="saved-rename" data-index="${i}" title="Rename">&#9998;</button>
                <button class="saved-remove" data-index="${i}" title="Remove">&times;</button>
            `;

            // Click anywhere on the row to view
            div.addEventListener('click', (e) => {
                if (e.target.closest('.saved-remove') || e.target.closest('.saved-rename')) return;
                viewSavedSchedule(i);
            });

            savedList.appendChild(div);
        });

        savedList.querySelectorAll('.saved-rename').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                renameSavedSchedule(parseInt(btn.dataset.index));
            });
        });
        savedList.querySelectorAll('.saved-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteSavedSchedule(parseInt(btn.dataset.index));
            });
        });
    }

    saveBtn.addEventListener('click', () => {
        if (currentSavedIndex() >= 0) {
            removeCurrentSchedule();
        } else {
            saveCurrentSchedule();
        }
    });

    backToResultsBtn.addEventListener('click', backToResults);

    // ── Refresh Status (re-scrape to update open/closed/waitlisted) ──
    refreshStatusBtn.addEventListener('click', async () => {
        if (!viewingSaved || viewingSavedIndex < 0) return;

        const saved = getSavedSchedules();
        const s = saved[viewingSavedIndex];
        if (!s) return;

        // Use the course list that was saved with this schedule
        const courses = s.courses || [];
        if (courses.length === 0) {
            showStatus('No course data saved with this schedule.', 'error');
            return;
        }

        refreshStatusBtn.disabled = true;
        refreshStatusBtn.textContent = 'Refreshing...';
        showStatus('<span class="spinner"></span> Refreshing section statuses...', '', true);

        try {
            // Ensure we're authenticated
            const auth = await API.checkAuth();
            if (!auth.authenticated) {
                showStatus('<span class="spinner"></span> Verifying session...', '', true);
                const loginResult = await API.login();
                if (!loginResult.success) {
                    showStatus('Not logged in. Connect to UT first.', 'error');
                    refreshStatusBtn.disabled = false;
                    refreshStatusBtn.textContent = 'Refresh Status';
                    return;
                }
                setAuthStatus(true);
            }

            // Clear cache so we get fresh data from the registrar
            await API.clearCache();
            lastScrapeData = null;
            const scrapeResult = await API.scrapeCourses(courses, getSelectedSemester());
            if (!scrapeResult.success) {
                showStatus('Refresh error: ' + (scrapeResult.error || 'Unknown'), 'error');
                refreshStatusBtn.disabled = false;
                refreshStatusBtn.textContent = 'Refresh Status';
                return;
            }

            // Build a lookup from unique number to new status
            const statusMap = {};
            scrapeResult.courses.forEach(course => {
                (course.sections || []).forEach(sec => {
                    statusMap[sec.uniqueNumber] = sec.status || 'open';
                    // Also update linked sections
                    (sec.linkedSections || []).forEach(ls => {
                        statusMap[ls.uniqueNumber] = ls.status || 'open';
                    });
                });
            });

            // Update saved schedule sections with new statuses
            const changes = [];
            s.sections.forEach(sec => {
                const newStatus = statusMap[sec.uniqueNumber];
                if (newStatus && newStatus !== sec.status) {
                    changes.push(`${sec.courseName} (#${sec.uniqueNumber}): ${sec.status} → ${newStatus}`);
                    sec.status = newStatus;
                }
                (sec.linkedSections || []).forEach(ls => {
                    const lsStatus = statusMap[ls.uniqueNumber];
                    if (lsStatus && lsStatus !== ls.status) {
                        changes.push(`${sec.courseName} linked (#${ls.uniqueNumber}): ${ls.status} → ${lsStatus}`);
                        ls.status = lsStatus;
                    }
                });
            });

            // Persist updated saved schedule
            setSavedSchedules(saved);

            // Re-render the saved schedule view
            ScheduleViewer.setSchedules([s.sections], s.colorMap, getSelectedSemester());
            const label = s.name || `Schedule ${viewingSavedIndex + 1}`;
            document.getElementById('scheduleCounter').textContent =
                `${label} (${viewingSavedIndex + 1} of ${saved.length})`;

            if (changes.length > 0) {
                const details = changes.map(c => `<li>${c}</li>`).join('');
                showStatus(`<span class="success">Updated ${changes.length} section(s):</span><ul class="status-changes">${details}</ul>`, '');
            } else {
                showStatus('All section statuses are up to date.', 'success');
            }
        } catch (e) {
            showStatus('Refresh error: ' + e.message, 'error');
        } finally {
            refreshStatusBtn.disabled = false;
            refreshStatusBtn.textContent = 'Refresh Status';
        }
    });

    // Sync save button when navigating between schedules
    ScheduleViewer.onChange(() => syncSaveButton());

    // Render saved list on load
    renderSavedList();
    syncSaveButton();

    // ── Compare toggle ──────────────────────────────────
    compareCb.addEventListener('change', () => {
        ScheduleViewer.setCompareMode(compareCb.checked);
    });

    // ── Sort ────────────────────────────────────────────
    sortSelect.addEventListener('change', () => {
        ScheduleViewer.sort(sortSelect.value);
    });

    // ── Navigation ──────────────────────────────────────
    function navigatePrimary(delta) {
        if (viewingSaved) {
            const saved = getSavedSchedules();
            const next = viewingSavedIndex + delta;
            if (next >= 0 && next < saved.length) {
                viewSavedSchedule(next);
            }
        } else {
            ScheduleViewer.navigate(delta);
        }
    }

    document.getElementById('prevBtn').addEventListener('click', () => navigatePrimary(-1));
    document.getElementById('nextBtn').addEventListener('click', () => navigatePrimary(1));

    // Keyboard navigation for schedules (arrow keys)
    document.addEventListener('keydown', (e) => {
        // Don't navigate when typing in an input/select/textarea
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        // Don't navigate when a modal is open
        if (!searchModal.classList.contains('hidden')) return;
        if (!promptModal.classList.contains('hidden')) return;
        if (document.querySelector('.grade-popup-overlay')) return;

        const nav = document.getElementById('scheduleNav');
        if (nav.classList.contains('hidden')) return;

        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            navigatePrimary(-1);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            navigatePrimary(1);
        }
    });

    // Note: prevBtn2/nextBtn2 are now created dynamically in ScheduleViewer.renderCurrent()

    // ── Helpers ─────────────────────────────────────────
    function showStatus(html, type, showProgress = false) {
        let content = type ? `<span class="${type}">${html}</span>` : html;
        if (showProgress) {
            content += '<div class="progress-bar"><div class="progress-bar-fill"></div></div>';
        }
        statusArea.innerHTML = content;
    }

    let semestersValidated = false;

    function setAuthStatus(connected) {
        const dot = document.querySelector('.auth-dot');
        const text = document.getElementById('authText');
        const authPanel = document.querySelector('.auth-panel-v2');
        dot.className = 'auth-dot ' + (connected ? 'connected' : 'disconnected');
        text.textContent = connected ? 'Connected to UT' : 'Not connected';
        // Promote auth panel to top of sidebar when not connected
        authPanel.classList.toggle('needs-auth', !connected);
        if (connected && !semestersValidated) {
            semestersValidated = true;
            validateSemesters();
        }
    }

    async function validateSemesters() {
        try {
            const result = await API.getSemesters();
            console.log('Semester validation result:', result);
            if (result.success && result.semesters.length > 0) {
                const currentValue = semesterSelect.value;
                semesterSelect.innerHTML = '';
                result.semesters.forEach(s => {
                    const el = document.createElement('option');
                    el.value = s.code;
                    el.textContent = s.label;
                    if (s.code === currentValue) el.selected = true;
                    semesterSelect.appendChild(el);
                });
                // If previous selection is gone, pick the first option
                if (!semesterSelect.value) semesterSelect.selectedIndex = 0;
                localStorage.setItem(SEMESTER_STORAGE_KEY, semesterSelect.value);
                updateTitle();
            }
        } catch (e) {
            console.error('Semester validation failed:', e);
        }
    }

    // ── Initial check — auto-verify and generate if possible ──
    API.checkAuth().then(async (res) => {
        if (res.authenticated) {
            setAuthStatus(true);
            authHelp.textContent = 'Session active from previous login.';
            loginBtn.textContent = 'Connected';
            if (CourseInput.getCourses().length > 0) {
                generateBtn.click();
            }
        } else if (res.maybeAuthenticated) {
            // Session data exists but not verified yet — show optimistic state.
            // Chrome will launch and verify when the user clicks Generate.
            document.querySelector('.auth-dot').className = 'auth-dot connected';
            document.getElementById('authText').textContent = 'Session saved';
            document.querySelector('.auth-panel-v2').classList.remove('needs-auth');
            authHelp.textContent = 'Your previous login session was found.';
            loginBtn.textContent = 'Connected';
        }
    }).catch(() => {});
});
