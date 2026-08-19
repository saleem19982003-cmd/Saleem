// =============================================================
// SALEEM Analytics Center — Local / Node Server
// Serves the standalone Analytics Center on PORT (default: 3001)
// =============================================================
require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const configHandler = require('./api/config');

const PORT = process.env.PORT || 3001;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
    // Add strict security and noindex headers
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    let reqPath = req.url.split('?')[0];

    // Handle /api/config
    if (reqPath === '/api/config') {
        const mockRes = {
            setHeader: (k, v) => res.setHeader(k, v),
            status: (code) => ({
                json: (data) => {
                    res.writeHead(code, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(data));
                }
            })
        };
        return configHandler(req, mockRes);
    }

    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

    const filePath = path.join(__dirname, reqPath);
    const ext = path.extname(filePath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        return fs.createReadStream(filePath).pipe(res);
    }

    // SPA fallback to index.html
    const indexPath = path.join(__dirname, 'index.html');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(indexPath).pipe(res);
});

if (require.main === module) {
    server.listen(PORT, () => {
        console.log(`SALEEM Analytics Center running at http://localhost:${PORT}`);
    });
}

module.exports = server;
