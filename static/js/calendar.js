/**
 * Weekly calendar grid renderer.
 * Draws a 5-day (Mon-Fri) grid with course blocks positioned by time.
 */
const Calendar = (() => {
    const DAYS = ['M', 'T', 'W', 'TH', 'F'];
    const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const START_HOUR = 7;   // 7 AM
    const END_HOUR = 22;    // 10 PM
    const PX_PER_HOUR = 48; // pixels per hour row

    function dayIndex(day) {
        return DAYS.indexOf(day);
    }

    function timeToOffset(timeStr) {
        if (!timeStr) return 0;
        const [h, m] = timeStr.split(':').map(Number);
        const hours = h + m / 60 - START_HOUR;
        return hours * PX_PER_HOUR;
    }

    function timeDuration(startStr, endStr) {
        if (!startStr || !endStr) return 0;
        const [sh, sm] = startStr.split(':').map(Number);
        const [eh, em] = endStr.split(':').map(Number);
        return ((eh * 60 + em) - (sh * 60 + sm)) / 60 * PX_PER_HOUR;
    }

    function formatTime12(timeStr) {
        if (!timeStr) return 'TBA';
        const [h, m] = timeStr.split(':').map(Number);
        const ampm = h >= 12 ? 'pm' : 'am';
        const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
        return `${h12}:${m.toString().padStart(2, '0')}${ampm}`;
    }


    /**
     * Render a calendar into the given container element.
     * @param {Array} sections - Array of section objects to display
     * @param {HTMLElement} container - DOM element to render into
     * @param {Function} colorFn - Function(courseName) -> CSS color string
     * @param {string} semesterCode - Semester code for registrar links (e.g. '20269')
     * @param {Object} lockedSections - Map of courseName -> locked uniqueNumber
     * @param {Function} onLockToggle - Callback(courseName, uniqueNumber) when lock clicked
     */
    function render(sections, container, colorFn, semesterCode, lockedSections, onLockToggle) {
        container.innerHTML = '';

        const grid = document.createElement('div');
        grid.className = 'calendar-grid';

        // Header row
        const header = document.createElement('div');
        header.className = 'calendar-header';
        header.innerHTML = `<div class="corner"></div>` +
            DAY_LABELS.map(d => `<div class="day-header">${d}</div>`).join('');
        grid.appendChild(header);

        // Body
        const body = document.createElement('div');
        body.className = 'calendar-body';

        // Time column
        const timeCol = document.createElement('div');
        timeCol.className = 'time-column';
        for (let h = START_HOUR; h <= END_HOUR; h++) {
            const label = document.createElement('div');
            label.className = 'time-label';
            const ampm = h >= 12 ? 'pm' : 'am';
            const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
            label.textContent = `${h12}${ampm}`;
            timeCol.appendChild(label);
        }
        body.appendChild(timeCol);

        const totalHours = END_HOUR - START_HOUR;

        // Day columns
        DAYS.forEach((day, di) => {
            const col = document.createElement('div');
            col.className = 'day-column';

            // Hour grid lines
            for (let h = 0; h <= totalHours; h++) {
                const line = document.createElement('div');
                line.className = 'hour-line';
                col.appendChild(line);
            }

            // Course blocks for this day
            getAllBlocks(sections, day).forEach(block => {
                const el = document.createElement('a');
                el.className = 'course-block';
                el.dataset.unique = block.uniqueNumber;
                el.href = `https://utdirect.utexas.edu/apps/registrar/course_schedule/${semesterCode || '20269'}/${block.uniqueNumber}/`;
                el.target = '_blank';
                el.rel = 'noopener';

                const top = timeToOffset(block.startTime);
                const height = timeDuration(block.startTime, block.endTime);

                el.style.top = top + 'px';
                el.style.height = Math.max(height, 20) + 'px';
                el.style.background = colorFn(block.courseName);

                // Mark short blocks as compact to hide overflow details
                if (height < 38) {
                    el.classList.add('compact');
                }

                const status = block.status || 'open';
                const statusClass = /closed|waitlisted/i.test(status) ? 'block-status-bad' : 'block-status-default';
                const statusBadge = `<span class="block-status ${statusClass}">${status}</span>`;

                const isLocked = lockedSections && lockedSections[block.courseName] === block.uniqueNumber;

                el.innerHTML = `
                    ${statusBadge}
                    <div class="block-title">${block.courseName}</div>
                    <div class="block-time">${formatTime12(block.startTime)} - ${formatTime12(block.endTime)}</div>
                    <div class="block-location">${block.location || ''}</div>
                    <div class="block-instructor">${block.instructor || ''}</div>
                    <div class="block-unique">#${block.uniqueNumber}</div>
                `;

                // Lock button
                if (onLockToggle) {
                    const lockBtn = document.createElement('button');
                    lockBtn.className = 'block-lock-btn' + (isLocked ? ' locked' : '');
                    lockBtn.title = isLocked ? 'Click to unlock this section' : 'Click to lock this section';
                    lockBtn.innerHTML = isLocked
                        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1"/></svg>'
                        : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0" transform="translate(4,-2)"/></svg>';
                    lockBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onLockToggle(block.courseName, block.uniqueNumber);
                    });
                    el.appendChild(lockBtn);
                }

                const copyBtn = el.querySelector('.block-unique');
                copyBtn.addEventListener('click', e => {
                    e.preventDefault();
                    e.stopPropagation();
                    navigator.clipboard.writeText(block.uniqueNumber);
                    copyBtn.textContent = 'copied!';
                    copyBtn.classList.add('copied');
                    setTimeout(() => { copyBtn.textContent = '#' + block.uniqueNumber; copyBtn.classList.remove('copied'); }, 1000);
                });

                el.title = `${block.courseName}\n${formatTime12(block.startTime)} - ${formatTime12(block.endTime)}\n${block.location || 'TBA'}\n${block.instructor || ''}\nUnique: ${block.uniqueNumber || ''}`;

                // Show lock on all sibling blocks (same unique number) on hover
                el.addEventListener('mouseenter', () => {
                    document.querySelectorAll(`.course-block[data-unique="${block.uniqueNumber}"] .block-lock-btn`).forEach(btn => btn.classList.add('sibling-hover'));
                });
                el.addEventListener('mouseleave', () => {
                    document.querySelectorAll('.block-lock-btn.sibling-hover').forEach(btn => btn.classList.remove('sibling-hover'));
                });

                col.appendChild(el);
            });

            body.appendChild(col);
        });

        grid.appendChild(body);
        container.appendChild(grid);
    }

    /**
     * Get all time blocks for a specific day from a list of sections.
     * Includes linked sections (labs/discussions).
     */
    function getAllBlocks(sections, day) {
        const blocks = [];

        sections.forEach(section => {
            // Main section times
            if (section.days && section.days.includes(day) && section.startTime && section.endTime) {
                blocks.push({
                    courseName: section.courseName,
                    startTime: section.startTime,
                    endTime: section.endTime,
                    location: section.location,
                    instructor: section.instructor,
                    uniqueNumber: section.uniqueNumber,
                    status: section.status,
                });
            }

            // Linked sections (labs, discussions)
            if (section.linkedSections) {
                section.linkedSections.forEach(linked => {
                    if (linked.days && linked.days.includes(day) && linked.startTime && linked.endTime) {
                        blocks.push({
                            courseName: section.courseName,
                            startTime: linked.startTime,
                            endTime: linked.endTime,
                            location: linked.location || '',
                            instructor: linked.instructor || section.instructor,
                            uniqueNumber: section.uniqueNumber,
                            status: section.status,
                            isLinked: true,
                        });
                    }
                });
            }
        });

        return blocks;
    }

    return { render, formatTime12 };
})();
