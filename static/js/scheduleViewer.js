/**
 * Schedule navigation and comparison viewer.
 * Manages flipping through schedule options and side-by-side comparison.
 */
const ScheduleViewer = (() => {
    let schedules = [];
    let currentIndex = 0;
    let compareIndex = 0;
    let compareMode = false;
    let courseColorMap = {};
    let semesterCode = '20269';
    let onChangeCallback = null;
    let lockedSectionsRef = {};
    let onLockToggleRef = null;

    function setSchedules(newSchedules, colorMap, semester, locked, onLockToggle) {
        schedules = newSchedules;
        courseColorMap = colorMap;
        if (semester) semesterCode = semester;
        lockedSectionsRef = locked || {};
        onLockToggleRef = onLockToggle || null;
        currentIndex = 0;
        compareIndex = Math.min(1, schedules.length - 1);
        renderCurrent();
    }

    function getColorForCourse(courseName) {
        return courseColorMap[courseName] || 'var(--course-1)';
    }

    function sort(mode) {
        if (mode === 'earliest') {
            schedules.sort((a, b) => getEarliestTime(a) - getEarliestTime(b));
        } else if (mode === 'latest') {
            schedules.sort((a, b) => getEarliestTime(b) - getEarliestTime(a));
        } else if (mode === 'compact') {
            schedules.sort((a, b) => getSpan(a) - getSpan(b));
        }
        currentIndex = 0;
        compareIndex = Math.min(1, schedules.length - 1);
        renderCurrent();
    }

    function getEarliestTime(schedule) {
        let earliest = 24 * 60;
        schedule.forEach(s => {
            if (s.startTime) {
                const [h, m] = s.startTime.split(':').map(Number);
                earliest = Math.min(earliest, h * 60 + m);
            }
        });
        return earliest;
    }

    function getSpan(schedule) {
        // Sum of per-day spans (first class to last class on each day).
        // This correctly ranks compact schedules where classes are clustered.
        const dayMap = {};
        const addSlot = (days, start, end) => {
            if (!days || !start || !end) return;
            const [sh, sm] = start.split(':').map(Number);
            const [eh, em] = end.split(':').map(Number);
            const startMin = sh * 60 + sm;
            const endMin = eh * 60 + em;
            days.forEach(d => {
                if (!dayMap[d]) dayMap[d] = { earliest: 24 * 60, latest: 0 };
                dayMap[d].earliest = Math.min(dayMap[d].earliest, startMin);
                dayMap[d].latest = Math.max(dayMap[d].latest, endMin);
            });
        };
        schedule.forEach(s => {
            addSlot(s.days, s.startTime, s.endTime);
            (s.linkedSections || []).forEach(ls => {
                addSlot(ls.days, ls.startTime, ls.endTime);
            });
        });
        let total = 0;
        for (const d of Object.values(dayMap)) {
            total += d.latest - d.earliest;
        }
        return total;
    }

    function setCompareMode(enabled) {
        compareMode = enabled;
        renderCurrent();
    }

    function navigate(delta, isCompare = false) {
        if (isCompare) {
            compareIndex = Math.max(0, Math.min(schedules.length - 1, compareIndex + delta));
        } else {
            currentIndex = Math.max(0, Math.min(schedules.length - 1, currentIndex + delta));
        }
        renderCurrent();
        if (onChangeCallback) onChangeCallback();
    }

    function renderCurrent() {
        const container = document.getElementById('calendarsContainer');
        const nav = document.getElementById('scheduleNav');
        const counter = document.getElementById('scheduleCounter');

        if (schedules.length === 0) {
            nav.classList.add('hidden');
            container.innerHTML = '<div class="empty-state"><p>No valid schedules found. Try different courses or include closed sections.</p></div>';
            return;
        }

        nav.classList.remove('hidden');
        counter.textContent = `Schedule ${currentIndex + 1} of ${schedules.length}`;

        // Update button states
        document.getElementById('prevBtn').disabled = currentIndex === 0;
        document.getElementById('nextBtn').disabled = currentIndex === schedules.length - 1;

        container.innerHTML = '';
        container.classList.toggle('compare-mode', compareMode);

        // Primary calendar
        const wrapper1 = document.createElement('div');
        wrapper1.className = 'calendar-wrapper';

        Calendar.render(schedules[currentIndex], wrapper1, getColorForCourse, semesterCode, lockedSectionsRef, onLockToggleRef);
        // Info bar goes after render (render clears container)
        const info1 = buildInfoBar(schedules[currentIndex]);
        wrapper1.prepend(info1);
        container.appendChild(wrapper1);

        // Compare calendar
        if (compareMode && schedules.length > 1) {
            const wrapper2 = document.createElement('div');
            wrapper2.className = 'calendar-wrapper';

            // Inline nav above the second calendar
            const compareNavEl = document.createElement('div');
            compareNavEl.className = 'compare-nav-inline';
            compareNavEl.innerHTML = `
                <button class="btn btn-nav" id="prevBtn2">&larr; Prev</button>
                <span class="schedule-counter" id="scheduleCounter2">Schedule ${compareIndex + 1} of ${schedules.length}</span>
                <button class="btn btn-nav" id="nextBtn2">Next &rarr;</button>
            `;
            compareNavEl.querySelector('#prevBtn2').disabled = compareIndex === 0;
            compareNavEl.querySelector('#nextBtn2').disabled = compareIndex === schedules.length - 1;
            compareNavEl.querySelector('#prevBtn2').addEventListener('click', () => navigate(-1, true));
            compareNavEl.querySelector('#nextBtn2').addEventListener('click', () => navigate(1, true));
            wrapper2.appendChild(compareNavEl);

            Calendar.render(schedules[compareIndex], wrapper2, getColorForCourse, semesterCode, lockedSectionsRef, onLockToggleRef);
            const info2 = buildInfoBar(schedules[compareIndex]);
            // Insert info bar after the nav but before the calendar grid
            const grid2 = wrapper2.querySelector('.calendar-grid');
            wrapper2.insertBefore(info2, grid2);
            container.appendChild(wrapper2);
        }
    }

    function buildInfoBar(schedule) {
        const info = document.createElement('div');
        info.className = 'schedule-info';

        schedule.forEach(section => {
            const item = document.createElement('div');
            item.className = 'info-item';
            const status = section.status || 'open';
            const infoClass = /closed|waitlisted/i.test(status) ? 'info-status-bad' : 'info-status-default';
            const statusTag = ` <span class="info-status ${infoClass}">${status}</span>`;
            item.innerHTML = `
                <span class="info-color" style="background:${getColorForCourse(section.courseName)}"></span>
                <span>${section.courseName} (<span class="unique-num" title="Click to copy">#${section.uniqueNumber}</span>)${statusTag}</span>
            `;
            item.querySelector('.unique-num').addEventListener('click', () => {
                navigator.clipboard.writeText(section.uniqueNumber);
                const el = item.querySelector('.unique-num');
                el.classList.add('copied');
                el.dataset.original = el.textContent;
                el.textContent = 'copied!';
                setTimeout(() => { el.textContent = el.dataset.original; el.classList.remove('copied'); }, 1000);
            });
            info.appendChild(item);
        });

        return info;
    }

    function getCurrentSchedule() {
        if (schedules.length === 0) return null;
        return {
            sections: schedules[currentIndex],
            colorMap: { ...courseColorMap },
        };
    }

    function onChange(cb) { onChangeCallback = cb; }

    return { setSchedules, navigate, setCompareMode, sort, getCurrentSchedule, onChange };
})();
