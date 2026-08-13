// =============================================================
// Input Sanitization Utility
// =============================================================

// Strip HTML tags to prevent XSS
function sanitizeHtml(str) {
    if (!str || typeof str !== 'string') return '';
    return str.replace(/<[^>]*>/g, '').trim();
}

// Validate email format
function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// Validate string length
function isValidLength(str, min = 1, max = 5000) {
    if (!str || typeof str !== 'string') return false;
    const trimmed = str.trim();
    return trimmed.length >= min && trimmed.length <= max;
}

// Sanitize for SQL (additional safety layer)
function sanitizeInput(str) {
    if (!str || typeof str !== 'string') return '';
    return sanitizeHtml(str).substring(0, 10000);
}

module.exports = { sanitizeHtml, isValidEmail, isValidLength, sanitizeInput };
