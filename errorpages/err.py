import os
import subprocess

def create_error_folders(base_path, path_structure):
    current_path = base_path
    for folder in path_structure:
        current_path = os.path.join(current_path, folder)
        os.makedirs(current_path, exist_ok=True)
    return current_path

if __name__ == "__main__":
    base_directory = "errorpages"
    folder_structure = [
        "oh-no-i-am-not-authorized-i-trappt-into-an-error-fractal-hole",
        "ah-iam-falling!",
        "it-gets-deeper",
        "oh-or-is-there-no-ground¿",
        "yeah-floating",
        "is-this---0nefinity¿",
        "ah-the-bottom!!"
    ]
    
    final_path = create_error_folders(base_directory, folder_structure)
    final_file = os.path.join(final_path, "401.htm")  # Dateiname angepasst zu .htm

    # Einfacher HTML-Inhalt
    html_content = """<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>401 - Nicht autorisiert</title>
</head>
<body>
    <h1>401 - Nicht autorisiert</h1>
    <p>Du bist nicht berechtigt, diese Seite zu sehen.</p>
</body>
</html>
"""

    # Schreibe den HTML-Code in die Datei
    with open(final_file, "w", encoding="utf-8") as f:
        f.write(html_content)
    
    print(f"Generated structure: {final_file}")
    
    # Öffne die Datei in VS Code
    try:
        subprocess.Popen(["code", final_file])
    except Exception as e:
        print("VS Code konnte nicht automatisch geöffnet werden:", e)
