// Alle Seiten, die Panel (tools/controls.js) und meta.js einbinden: ueber das Head-Include oder per direktem Script-Tag.
// Gleiche Liste fuer alle Panel-Tests. Archiv, Fehlerseiten und Werkzeugordner zaehlen nicht.
const fs = require('fs');
const path = require('path');

const SKIP_TOP = new Set(['00_Archiv', '.git', 'tools', 'editor', 'tests', 'includes', 'errorpages', 'node_modules']);
const PANEL_RE = /something-in-the-head|src="[^"]*(meta\.js|controls\.js)/;

function panelPages(root) {
    const out = [];
    const walk = (dir, rel) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const r = rel ? rel + '/' + e.name : e.name;
            if (e.isDirectory()) {
                if (!rel && SKIP_TOP.has(e.name)) continue;
                walk(path.join(dir, e.name), r);
            } else if (e.name.endsWith('.html') && PANEL_RE.test(fs.readFileSync(path.join(dir, e.name), 'utf8'))) {
                let u = r.slice(0, -5);
                if (u === 'index') u = '';
                else if (u.endsWith('/index')) u = u.slice(0, -5);
                out.push('/' + u.split('/').map(encodeURIComponent).join('/'));
            }
        }
    };
    walk(root, '');
    return out.sort();
}

module.exports = { panelPages };
