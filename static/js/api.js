/**
 * API client for the Schedule Planner backend.
 */
const API = {
    async checkAuth() {
        const res = await fetch('/api/auth/status');
        return res.json();
    },

    async verifySession() {
        const res = await fetch('/api/auth/verify', { method: 'POST' });
        return res.json();
    },

    async login() {
        const res = await fetch('/api/auth/login', { method: 'POST' });
        return res.json();
    },

    async scrapeCourses(courseObjects, semester) {
        const res = await fetch('/api/courses/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ courses: courseObjects, semester }),
        });
        return res.json();
    },

    async generateSchedules(coursesSections, includeClosed = false, courseNames = []) {
        const res = await fetch('/api/schedules/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ coursesSections, includeClosed, courseNames }),
        });
        return res.json();
    },

    async searchCourses(query, semester, searchType = 'keyword') {
        const res = await fetch('/api/courses/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, semester, searchType }),
        });
        return res.json();
    },

    async getSemesters() {
        const res = await fetch('/api/semesters');
        return res.json();
    },

    async clearCache() {
        const res = await fetch('/api/courses/cache/clear', { method: 'POST' });
        return res.json();
    },

    async getGrades(courses) {
        const res = await fetch('/api/grades', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ courses }),
        });
        return res.json();
    },

    async shutdown() {
        const res = await fetch('/api/shutdown', { method: 'POST' });
        return res.json();
    },
};
