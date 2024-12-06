import os
import json

html_files = [f for f in os.listdir('.') if f.endswith('.html')]

with open('file-list.json', 'w') as file:
    json.dump(html_files, file, indent=4)

print("file-list.json wurde erstellt.")
