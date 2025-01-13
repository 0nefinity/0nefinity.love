import os
import json

# Rekursive Suche nach .html-Dateien
def find_html_files(directory):
    html_files = []
    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith('.html'):
                # Speichere den relativen Pfad
                html_files.append(os.path.relpath(os.path.join(root, file)))
    return html_files

# Dateien finden
html_files = find_html_files('.')

# Datei-Liste als JSON speichern
with open('file-list1.json', 'w') as file:
    json.dump(html_files, file, indent=4)

print("file-list.json wurde erstellt.")
