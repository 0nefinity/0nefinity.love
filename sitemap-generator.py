import os
import json
from datetime import datetime

def find_html_files(directory):
    html_files = []
    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith('.html'):
                file_path = os.path.relpath(os.path.join(root, file))
                mod_time = os.path.getmtime(os.path.join(root, file))
                html_files.append((file_path, mod_time))
    return html_files

html_files = find_html_files('.')

# JSON speichern
with open('file-list1.json', 'w') as file:
    json.dump([f[0] for f in html_files], file, indent=4)

# Kompakte Sitemap mit Datum am Anfang
sitemap = ['<?xml version="1.0" encoding="UTF-8"?>']
sitemap.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')

for file_path, mod_time in sorted(html_files):
    clean_path = file_path.replace('\\', '/')
    lastmod = datetime.fromtimestamp(mod_time).strftime('%Y-%m-%d %H:%M:%S')
    
    # Nur spezielle Prioritäten
    priority_attr = ''
    if clean_path == 'index.html':
        priority_attr = ' <priority>1.0</priority>'
    elif clean_path == 'die0.html':
        priority_attr = ' <priority>0</priority>'
    
    sitemap.append(f'  <url><lastmod>{lastmod}</lastmod><loc>https://0nefinity.love/{clean_path}</loc>{priority_attr}</url>')

sitemap.append('</urlset>')

with open('sitemap.xml', 'w', encoding='utf-8') as f:
    f.write('\n'.join(sitemap))

print(f"Sitemap mit {len(html_files)} URLs erstellt.")