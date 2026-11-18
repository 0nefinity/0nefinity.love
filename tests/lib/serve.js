// Mini-Server fuer Tests: liefert das Repo aus, loest <!--#include virtual--> und <!--#flastmod--> auf, Clean URLs (/1c0de -> 1c0de.html).
// Kein Ersatz fuer Apache: #if/#config werden entfernt, die dev-Zweige zaehlen nicht.
const http = require('http');
const fs = require('fs');
const path = require('path');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' };

function start(root, port = 0) {
    const ssi = (txt, depth = 0) => txt
        .replace(/<!--#include virtual="([^"]+)"\s*-->/g, (_, v) => {
            const f = path.join(root, v);
            return depth < 4 && fs.existsSync(f) ? ssi(fs.readFileSync(f, 'utf8'), depth + 1) : '';
        })
        .replace(/<!--#flastmod virtual="([^"]+)"\s*-->/g, (_, v) => { try { return String(Math.floor(fs.statSync(path.join(root, v)).mtimeMs / 1000)); } catch (e) { return '0'; } })
        .replace(/<!--#(config|if|endif|else|elif)\b[^>]*-->/g, '');
    const server = http.createServer((req, res) => {
        let p = decodeURIComponent(req.url.split('?')[0]);
        let f = path.join(root, p);
        if (!f.startsWith(root)) { res.writeHead(403); res.end(); return; }
        if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, p.replace(/\/$/, '') + '.html');
        if (!fs.existsSync(f)) { res.writeHead(404); res.end('404'); return; }
        const ext = path.extname(f);
        res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(ext === '.html' ? ssi(fs.readFileSync(f, 'utf8')) : fs.readFileSync(f));
    });
    return new Promise(r => server.listen(port, '127.0.0.1', () => r({ server, base: 'http://127.0.0.1:' + server.address().port })));
}

module.exports = { start };
