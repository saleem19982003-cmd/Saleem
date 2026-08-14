// =============================================================
// Resources Routes - Community resources with verification
// =============================================================
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authenticateToken, optionalAuth, requireAdmin } = require('../middleware/auth');
const { sanitizeHtml } = require('../middleware/sanitize');

const PUBLIC_CATEGORY_ALIASES = {
    health: 'healthcare',
    healthcare: 'healthcare',
    legal: 'legal',
    unhcr: 'legal',
    immigration: 'legal',
    education: 'education',
    language: 'education',
    work: 'employment',
    employment: 'employment',
    emergency: 'emergency',
    refugee: 'refugee_support',
    'refugee-support': 'refugee_support',
    support: 'refugee_support',
    pharmacy: 'pharmacy',
    pharmacies: 'pharmacy',
    clinic: 'healthcare',
    clinics: 'healthcare',
    hospital: 'healthcare',
    hospitals: 'healthcare',
    school: 'education',
    schools: 'education',
    training: 'training',
    programming: 'programming',
    ngo: 'ngo',
    government: 'government'
};

function normalizeCategory(category) {
    if (!category) return '';
    const key = String(category).toLowerCase().trim();
    return PUBLIC_CATEGORY_ALIASES[key] || key;
}

function parsePagination(query) {
    const page = Math.max(1, Math.min(parseInt(query.page, 10) || 1, 1000));
    const limit = Math.max(1, Math.min(parseInt(query.limit, 10) || 50, 100));
    return { page, limit, offset: (page - 1) * limit };
}

function parseResourceJsonFields(resource) {
    try { resource.required_documents = JSON.parse(resource.required_documents || '[]'); } catch(e) { resource.required_documents = []; }
    resource.is_demo_data = Boolean(resource.is_demo_data);
    resource.governorate = resource.governorate || resource.city || '';
    return resource;
}

function validCoordinate(value, min, max) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function haversineKm(latitudeA, longitudeA, latitudeB, longitudeB) {
    const toRadians = value => value * Math.PI / 180;
    const earthRadiusKm = 6371;
    const dLatitude = toRadians(latitudeB - latitudeA);
    const dLongitude = toRadians(longitudeB - longitudeA);
    const a = Math.sin(dLatitude / 2) ** 2
        + Math.cos(toRadians(latitudeA)) * Math.cos(toRadians(latitudeB)) * Math.sin(dLongitude / 2) ** 2;
    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function resourceDistance(resource, latitude, longitude) {
    const resourceLatitude = validCoordinate(resource.latitude, -90, 90);
    const resourceLongitude = validCoordinate(resource.longitude, -180, 180);
    if (latitude === null || longitude === null || resourceLatitude === null || resourceLongitude === null) return null;
    return Number(haversineKm(latitude, longitude, resourceLatitude, resourceLongitude).toFixed(1));
}

// GET /api/resources - Get resources (with filters)
router.get('/', optionalAuth, (req, res) => {
    try {
        const db = req.app.locals.db;
        const { city, status, search } = req.query;
        const category = normalizeCategory(req.query.category);
        const includeDemo = req.query.include_demo === '1' || req.query.include_demo === 'true';
        const { limit, offset } = parsePagination(req.query);

        let query = 'SELECT * FROM resources WHERE 1=1';
        const params = [];

        // Non-admin users only see verified resources
        if (!req.user || req.user.role !== 'admin') {
            query += " AND verification_status = 'verified'";
            if (!includeDemo) {
                query += ' AND is_demo_data = 0';
            }
        } else if (status) {
            query += ' AND verification_status = ?';
            params.push(status);
        }

        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }
        if (city) {
            query += ' AND city = ?';
            params.push(city);
        }
        if (search) {
            query += ' AND (name LIKE ? OR description LIKE ? OR services LIKE ? OR address LIKE ?)';
            const searchParam = `%${search}%`;
            params.push(searchParam, searchParam, searchParam, searchParam);
        }

        query += ` ORDER BY name LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const resources = db.prepare(query).all(...params);

        resources.forEach(parseResourceJsonFields);

        // Get user's saved resources
        let savedIds = [];
        if (req.user) {
            const saved = db.prepare('SELECT resource_id FROM saved_resources WHERE user_id = ?').all(req.user.id);
            savedIds = saved.map(s => s.resource_id);
        }
        resources.forEach(r => { r.is_saved = savedIds.includes(r.id); });

        res.json({ resources });
    } catch (err) {
        console.error('Resources fetch error:', err);
        res.status(500).json({ error: 'Failed to load resources.' });
    }
});

// GET /api/resources/nearby - coarse, one-shot discovery; user coordinates are never stored or returned.
router.get('/nearby', optionalAuth, (req, res) => {
    try {
        const db = req.app.locals.db;
        const latitude = validCoordinate(req.query.latitude, -90, 90);
        const longitude = validCoordinate(req.query.longitude, -180, 180);
        const hasLatitude = req.query.latitude !== undefined && req.query.latitude !== '';
        const hasLongitude = req.query.longitude !== undefined && req.query.longitude !== '';
        if (hasLatitude !== hasLongitude || ((hasLatitude || hasLongitude) && (latitude === null || longitude === null))) {
            return res.status(400).json({ error: 'Provide both valid coordinates or choose an area manually.' });
        }
        const category = normalizeCategory(req.query.category);
        const city = String(req.query.city || '').trim();
        const governorate = String(req.query.governorate || '').trim();
        const sort = ['nearest', 'best-match', 'recently-verified'].includes(req.query.sort) ? req.query.sort : 'best-match';
        const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 20, 50));
        let query = "SELECT * FROM resources WHERE verification_status = 'verified' AND is_demo_data = 0";
        const params = [];
        if (category) { query += ' AND category = ?'; params.push(category); }
        if (city) { query += ' AND city = ?'; params.push(city); }
        const resources = db.prepare(query).all(...params).map(parseResourceJsonFields).filter(resource => !governorate || resource.governorate.toLowerCase() === governorate.toLowerCase()).map(resource => ({
            ...resource,
            distance_km: resourceDistance(resource, latitude, longitude),
            distance_source: resourceDistance(resource, latitude, longitude) === null ? null : 'straight_line',
            recommendation_reason: category && resource.category === category
                ? `Matches ${category} support`
                : city && resource.city === city
                    ? `Located in ${resource.city}`
                    : 'Verified source-backed service'
        }));
        resources.sort((a, b) => {
            if (sort === 'recently-verified') return String(b.last_verified_at || '').localeCompare(String(a.last_verified_at || '')) || a.name.localeCompare(b.name);
            if (sort === 'nearest') return (a.distance_km === null ? Number.POSITIVE_INFINITY : a.distance_km) - (b.distance_km === null ? Number.POSITIVE_INFINITY : b.distance_km) || a.name.localeCompare(b.name);
            return (b.distance_km === null ? -1 : 1) - (a.distance_km === null ? -1 : 1) || a.name.localeCompare(b.name);
        });
        res.json({ resources: resources.slice(0, limit), location_mode: latitude === null ? 'manual' : 'one-shot-gps', sort });
    } catch (err) {
        console.error('Nearby resources error:', err);
        res.status(500).json({ error: 'Failed to load nearby resources.' });
    }
});

// GET /api/resources/recommendations - Explainable service recommendations
router.get('/recommendations', optionalAuth, (req, res) => {
    try {
        const db = req.app.locals.db;
        const need = String(req.query.need || req.query.search || '').toLowerCase().trim();
        const preferredCity = String(req.query.city || '').toLowerCase().trim();
        const category = normalizeCategory(req.query.category);

        const resources = db.prepare(`
            SELECT * FROM resources
            WHERE verification_status = 'verified' AND is_demo_data = 0
            ORDER BY name
        `).all().map(parseResourceJsonFields);

        const scored = resources.map(resource => {
            let score = 0;
            const reasons = [];
            const haystack = `${resource.name} ${resource.description || ''} ${resource.services || ''} ${resource.category || ''} ${resource.address || ''}`.toLowerCase();

            if (category && resource.category === category) {
                score += 30;
                reasons.push(`Matches ${category} support`);
            }
            if (need) {
                const tokens = need.split(/\s+/).filter(Boolean);
                const matched = tokens.filter(token => haystack.includes(token));
                if (matched.length > 0) {
                    score += matched.length * 8;
                    reasons.push(`Matches your query: ${matched.slice(0, 4).join(', ')}`);
                }
            }
            if (preferredCity && String(resource.city || '').toLowerCase().includes(preferredCity)) {
                score += 10;
                reasons.push(`Located in ${resource.city}`);
            }
            if (resource.source_url) {
                score += 5;
                reasons.push('Has an official source link');
            }
            if (!reasons.length) reasons.push('Verified source-backed service');

            return { ...resource, recommendation_score: score, reasons };
        }).sort((a, b) => b.recommendation_score - a.recommendation_score || a.name.localeCompare(b.name));

        res.json({ recommendations: scored.slice(0, 5) });
    } catch (err) {
        console.error('Resource recommendations error:', err);
        res.status(500).json({ error: 'Failed to load recommendations.' });
    }
});

// GET /api/resources/:id
router.get('/:id', optionalAuth, (req, res) => {
    try {
        const db = req.app.locals.db;
        const resource = db.prepare('SELECT * FROM resources WHERE id = ?').get(req.params.id);
        if (!resource) return res.status(404).json({ error: 'Resource not found.' });
        if ((!req.user || req.user.role !== 'admin') && (resource.verification_status !== 'verified' || resource.is_demo_data)) {
            return res.status(404).json({ error: 'Resource not found.' });
        }

        parseResourceJsonFields(resource);

        // Track view
        if (req.user) {
            db.prepare('INSERT INTO analytics_events (user_id, event_type, event_data) VALUES (?, "resource_viewed", ?)').run(req.user.id, JSON.stringify({ resource_id: resource.id }));
        }

        res.json({ resource });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load resource.' });
    }
});

// POST /api/resources/:id/save - Save a resource
router.post('/:id/save', authenticateToken, (req, res) => {
    try {
        const db = req.app.locals.db;
        const existing = db.prepare('SELECT id FROM saved_resources WHERE user_id = ? AND resource_id = ?').get(req.user.id, req.params.id);

        if (existing) {
            db.prepare('DELETE FROM saved_resources WHERE id = ?').run(existing.id);
            return res.json({ saved: false, message: 'Resource removed from saved.' });
        }

        db.prepare('INSERT INTO saved_resources (id, user_id, resource_id) VALUES (?, ?, ?)').run(uuidv4(), req.user.id, req.params.id);
        db.prepare('INSERT INTO analytics_events (user_id, event_type, event_data) VALUES (?, "resource_saved", ?)').run(req.user.id, JSON.stringify({ resource_id: req.params.id }));

        res.json({ saved: true, message: 'Resource saved.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save resource.' });
    }
});

// POST /api/resources - Create resource (admin only)
router.post('/', authenticateToken, requireAdmin, (req, res) => {
    try {
        const db = req.app.locals.db;
        const { name, description, category, address, city, phone, email, website, hours, languages, latitude, longitude, services, required_documents, useful_phrase, wait_time, source_name, source_url, trust_note } = req.body;

        if (!name || !category) {
            return res.status(400).json({ error: 'Name and category are required.' });
        }

        const id = uuidv4();
        db.prepare(`
            INSERT INTO resources (id, name, description, category, address, city, phone, email, website, hours, languages, latitude, longitude, verification_status, services, required_documents, useful_phrase, wait_time, verified_by, last_verified_at, source_name, source_url, source_checked_at, trust_note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, datetime("now"), ?, ?, datetime("now"), ?)
        `).run(id, sanitizeHtml(name), sanitizeHtml(description), normalizeCategory(category), sanitizeHtml(address), sanitizeHtml(city || 'Cairo'), phone, email, website, hours, languages, latitude, longitude, services, JSON.stringify(required_documents || []), useful_phrase, wait_time, req.user.id, sanitizeHtml(source_name || ''), sanitizeHtml(source_url || ''), sanitizeHtml(trust_note || ''));

        const resource = db.prepare('SELECT * FROM resources WHERE id = ?').get(id);
        res.status(201).json({ resource });
    } catch (err) {
        console.error('Resource create error:', err);
        res.status(500).json({ error: 'Failed to create resource.' });
    }
});

// PUT /api/resources/:id/verify - Verify/update verification status (admin only)
router.put('/:id/verify', authenticateToken, requireAdmin, (req, res) => {
    try {
        const db = req.app.locals.db;
        const { verification_status } = req.body;

        if (!['verified', 'pending', 'outdated', 'rejected'].includes(verification_status)) {
            return res.status(400).json({ error: 'Invalid verification status.' });
        }

        db.prepare('UPDATE resources SET verification_status = ?, verified_by = ?, last_verified_at = datetime("now"), updated_at = datetime("now") WHERE id = ?').run(verification_status, req.user.id, req.params.id);

        res.json({ message: `Resource marked as ${verification_status}.` });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update verification.' });
    }
});

module.exports = router;
module.exports.normalizeCategory = normalizeCategory;
module.exports.haversineKm = haversineKm;
module.exports.resourceDistance = resourceDistance;
