# Deploy-Sync (Host-Files)

Folgende Host-Files leben **außerhalb** des Git-Repos in `/home/timbr/0nefinity/`
und müssen nach Merge von `feat/enternity-login` manuell synchronisiert werden:

| Repo-Kopie (im Branch) | Host-Pfad |
|---|---|
| `docs/deploy/Dockerfile.host` | `/home/timbr/0nefinity/Dockerfile` |
| `docs/deploy/docker-compose.yml.host` | `/home/timbr/0nefinity/docker-compose.yml` |
| `docs/deploy/entrypoint.sh.host` | `/home/timbr/0nefinity/entrypoint.sh` |

Sync-Befehl (nach `git pull origin main`):

```bash
cd /home/timbr/0nefinity/0nefinity.love
cp docs/deploy/Dockerfile.host         ../Dockerfile
cp docs/deploy/docker-compose.yml.host ../docker-compose.yml
cp docs/deploy/entrypoint.sh.host      ../entrypoint.sh
chmod +x ../entrypoint.sh
cd ..
docker compose build live
docker compose up -d live
docker compose logs live | tail -30
```

Nach erfolgreichem Live-Start: Setup-Token auslesen und Setup auf
`https://0nefinity.love/enternity` durchführen.

```bash
docker exec 0nefinity-live cat /var/www/html/.auth/setup-token
```

Token einmalig kopieren, auf `/enternity` einfügen, neues PW setzen.
Token-Datei wird nach erfolgreichem Setup automatisch gelöscht.
