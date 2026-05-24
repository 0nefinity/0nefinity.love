# shadows.html — GEB-Modus (Design)

Datum: 2026-05-25
Status: Design, vor Implementierung
Datei: `shadows.html` (0nefinity)

## Ziel

`shadows.html` um einen **GEB-Modus** ergänzen (Gödel · Escher · Bach / Hofstadter-Cover). Heute zeigt die Seite eine Kugel, die per Raymarching drei Schatten wirft: `0` (Seite), `1` (Rückwand), `∞` (Boden). Der GEB-Modus erweitert das auf **zwei Kugeln** und **fünf Lampen**, analog zu den zwei Trip-Lets auf dem GEB-Cover.

Der bestehende Ein-Kugel-Modus bleibt unverändert der Default. GEB ist additiv (Toggle).

## Hintergrund: das Cover-Prinzip

Auf dem echten GEB-Cover stehen zwei Holz-Trip-Lets in **einem** Raum, gestapelt auf der senkrechten Achse. Eine **einzige** Lampe von oben durchleuchtet **beide** und erzeugt **einen** geteilten Schatten unten (`B`) — möglich, weil der Querschnitt beider Klötze entlang dieser Achse identisch ist. Die beiden seitlichen Buchstaben (`G`, `E`) sind zwischen den Klötzen vertauscht und brauchen je eigene Lampen.

Übertragen:

| Cover | shadows |
|-------|---------|
| `B` (geteilt, unten, 1 Lampe) | `∞` (geteilt, Boden, 1 Lampe) |
| `G` / `E` (pro Klotz getauscht) | `0` / `1` (pro Kugel getauscht) |
| Klotz 1: `G·E·B` | Kugel 1: `0·1·∞` |
| Klotz 2: `E·G·B` | Kugel 2: `1·0·∞` |

Daraus: **5 Lampen** = 1× ∞-Boden (geteilt) + 2× Wand für Kugel 1 + 2× Wand für Kugel 2.

## Aktuelle Architektur (Ist)

- `sphereMesh`: eine Kugel, `SphereGeometry` + `ShaderMaterial` (raymarching) + `customDepthMaterial` (raymarching auch für Schattenwurf).
- Glyphs global: `glyphChars = { left:'0', right:'1', floor:'∞' }`, gerendert via `createGlyphTexture()` zu `glyphTextures.{x,y,z}`, in den Shader als `uGlyphTexX/Y/Z`.
- Drei Spots: `spotFloor`, `spotBack`, `spotSide`, erzeugt via `addSpot(intensity, px,py,pz, tx,ty,tz)`. Enge Kegel (`spotAngle` default 15°), `castShadow`, eigene Shadow-Map.
- Lampen-Sichtbarkeit/-Zustand: `lampStates = {floor, back, side}`, in den Shader als `uLightsActive` (vec3).
- Lampen-Meshes: `lampFloor/Back/Side` (via `createLampMesh`), Lichtkegel-Visuals `lightConeFloor/Back/Side`.
- URL-State: `PARAMS_CONFIG` (urlKeys), Glyphs `GLYPH_URL_KEYS = {left:'g0', right:'g1', floor:'g8'}`, lights-Bitmaske `floor/back/side`.
- Default: `gebEnabled = true` ist ein **bestehender, anders gemeinter Flag** (Glyph-Cutout / "018 Mode"), NICHT der hier gemeinte GEB-Hofstadter-Modus. Neuer Modus braucht eigenen Namen, z.B. `hofstadterMode` / `dualMode`, um Verwechslung zu vermeiden.

## Design (Modus A: Toggle in shadows.html)

### Kugel 2: fest an Kugel 1 gekoppelt

Entscheidung: Kugel 2 ist **kein** frei konfigurierbares Objekt, sondern spiegelt Kugel 1:

- gleicher Radius (`sphereRadius`)
- automatischer Y-Versatz (Stapelung auf der ∞-Achse, fester Gap relativ zum Radius)
- Glyphs fest abgeleitet: Kugel 2 = Kugel 1 mit getauschtem `left`/`right` (`0`↔`1`), gleiches `floor` (`∞`)

Vorteile: weniger UI, ∞-Teilung garantiert, Cover-treu, wenige Fehlerquellen. Bei `dualMode=off` existiert Kugel 2 nicht.

### Lampen (5 im GEB-Modus)

| Lampe | Achse | Zweck | wirkt auf |
|-------|-------|-------|-----------|
| ∞-Boden (geteilt) | Y, von oben | wirft `∞` | beide Kugeln (breiter Kegel → ein geteilter Schatten) |
| Kugel1-back | Z | wirft `1` (Kugel1.right) | nur Kugel 1 |
| Kugel1-side | X | wirft `0` (Kugel1.left) | nur Kugel 1 |
| Kugel2-back | Z | wirft `0` (Kugel2.right) | nur Kugel 2 |
| Kugel2-side | X | wirft `1` (Kugel2.left) | nur Kugel 2 |

Im Ein-Kugel-Modus bleibt es bei 3 Lampen (floor/back/side), unverändert.

### Datenstruktur-Änderungen

- `sphereMesh` → Array/Objekt `spheres` (1 Eintrag normal, 2 im GEB-Modus). Jede Kugel trägt eigene `glyphTextures` + Material + customDepthMaterial.
- `glyphChars` bleibt für Kugel 1; Kugel 2 leitet ab (Swap left/right).
- `lampStates` → erweitert um die 4 Wand-Lampen-Slots im GEB-Modus (z.B. `{infinity, s1back, s1side, s2back, s2side}` aktiv nur im GEB-Modus; im Normalmodus weiter `{floor,back,side}`). Mapping sauber halten.
- `addSpot()` wird wiederverwendet; im GEB-Modus 5 Aufrufe mit den o.g. Positionen/Targets pro Kugel-Zentrum.

### Schatten-Isolation pro Kugel

Damit Kugel-1-`1` und Kugel-2-`0` auf der Rückwand nicht überlappen/mischen:

1. **Primär (geometrisch):** Kugeln vertikal versetzt + enge Spot-Kegel (15°) je auf das Kugel-Zentrum gezielt → Schatten landen in verschiedenen Wandhöhen, getrennt. Genau wie die einzeln gezielten Cover-Lampen.
2. **Fallback (falls Streuschatten):** THREE.js-Layers — Kugel 1 + ihre 2 Wand-Lampen auf Layer A, Kugel 2 + ihre 2 auf Layer B, ∞-Lampe auf beide. Im Plan-Stadium prüfen, ob THREE.js Shadow-Mapping Layers respektiert; sonst per Spot-Range/Frustum eng begrenzen.

Entscheid im Plan-Stadium nach visuellem Test.

### UI

- Neuer Toggle „GEB-Modus" (analog `invertMode`-Toggle), schaltet 1↔2 Kugeln + 3↔5 Lampen.
- Lampen-Toggles: im GEB-Modus 5 statt 3 (∞ + 2×2 Wand). `.geb-row` (existiert im CSS) als Container für die zusätzlichen Reihen.
- Kugel-2-Glyphs werden NICHT separat eingegeben (gekoppelt) — evtl. read-only Anzeige des abgeleiteten Swaps.
- Kamera-Default fürs Stapel-Framing: leicht herausgezoomt/zentriert auf die Mitte zwischen beiden Kugeln (im Plan festlegen).

### URL-State

- Neuer Key `geb=1` (Modus an).
- Lights-Bitmaske erweitern: im GEB-Modus 5 Bits statt 3 (Reihenfolge dokumentieren).
- Kugel-2-Glyphs: nicht nötig (abgeleitet). `g0/g1/g8` von Kugel 1 reichen.
- Back-Button-Prinzip beachten: Modus-Toggle + Lampen-Zustände in URL, navigierbar.

## Verifikation (Self-Test-Plan)

Nach Implementierung via Playwright gegen `dev.0nefinity.love/shadows` (Test-User vorhanden):

1. Default-Load: 1 Kugel, 3 Lampen, Schatten `0·1·∞` — wie vorher (Regression).
2. GEB-Toggle an: 2 Kugeln sichtbar, gestapelt; 5 Lampen-Toggles da.
3. Boden zeigt **einen** `∞`-Schatten (nicht zwei, nicht überlappend).
4. Rückwand/Seitenwand: Kugel1 `1`/`0`, Kugel2 `0`/`1` — getrennt lesbar, kein Mischmasch.
5. Einzelne Lampen-Toggles schalten den jeweiligen Schatten korrekt.
6. URL `?geb=1...` reproduziert den Zustand (Reload + Back-Button).
7. Mobile-Check: Tap-Targets ≥40px, Panel-Overflow, kein Hover-only.
8. Dark-Mode korrekt (meta.css-Variablen).
9. Performance auf schwacher Hardware: 5 Shadow-Maps + 2 raymarching-Kugeln — FPS prüfen, ggf. `shadowMapSize` defaulten.

Kein „fertig"-Claim ohne Playwright-Verify + Screenshot/DOM/Network.

## Außerhalb Scope (YAGNI)

- Generische N-Kugeln/N-Lampen-Engine (Modus C) — bewusst nicht jetzt.
- Eigene Seite (Modus B) — verworfen wegen Code-Duplikation.
- Frei konfigurierbare Kugel 2 — verworfen zugunsten Kopplung.
- 3+ Kugeln, andere Buchstaben-Sets.

## Offene Punkte fürs Plan-Stadium

- Schatten-Isolation: enge Kegel vs. THREE.js-Layers (nach Test entscheiden).
- Y-Gap/Stapel-Abstand + Kamera-Default-Werte.
- Exakte Bit-Reihenfolge der erweiterten lights-URL-Maske.
- Namensgebung neuer Flag (`dualMode`/`hofstadterMode`) zur Abgrenzung vom bestehenden `gebEnabled`.
