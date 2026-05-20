# co0rdinates — Spektrale Freiheitsgrade

**Status:** v1 spec
**Datum:** 2026-05-20
**Ziel:** Drei mathematisch orthogonale, kontinuierliche Slider zur Verzerrungs-Modulation in `co0rdinates.html`. Form-Identität bleibt, Charakter der Verzerrung wird über kontinuierliche Parameter-Familien gesteuert. Jeder Slider hat ℝ-Range — unendlich viele Werte pro Achse, ∞³ Kombinationen.

---

## Kontext

Aktuell erzeugt `generateShapeControlPoints(shapeId)` 256 Kontrollpunkte auf dem Einheitskreis, projiziert sie radial auf die Polygon-Kante und löst die zirkulante RBF-Gleichung via FFT. Ergebnis ist ein Vektor-Feld, das jeden Punkt im Inneren des Kreises in Richtung Polygon zieht.

Vorher (siehe `Kuriositäten/bitte keine Hakenkreuze/…`) wurde stattdessen Arc-Length-Mapping verwendet — das erzeugte einen unerwünschten Swirl ("Hakenkreuz-Bug"). Der Fix war reine radiale Projektion.

Die Spektrale-DOF-Erweiterung integriert den ehemaligen Swirl-Effekt als bewusstes, dosierbares Feature und fügt zwei weitere unabhängige Achsen hinzu.

## Die drei Slider

### 1. `Kernel-Breite` ε — log-Slider, Range [0.1, 5.0], Default 1.0

**Math:** `autoRadius = spacing · ε`, wobei `spacing = 2π/256`. Steuert den Gauß-Sigma der RBF-Kernel sowohl beim Solving als auch beim Rendering.

**Effekt:**
- ε → 0: Kernel-Punkte werden zu Dirac-Pins. Verzerrung kollabiert auf 256 Singularitäten am Kreisrand, Raum sonst ungestört.
- ε = 1: aktueller Default. Sauberes Polygon mit lokaler Verzerrung.
- ε → ∞: Tiefpass auf Form-Harmonics. Form rundet sich zurück zum Kreis, Verzerrung blutet in den ganzen Raum.

**Implementation-Pflicht:** Ändert die zirkulante Matrix → erfordert Re-Solve (O(N log N)) bei jeder Slider-Bewegung. Affektiert auch das Rendering (`gaussian(dist, cp_radius)`).

### 2. `Twist` α — Slider [-2π, 2π], Default 0

**Math:** Im FFT-Spektrum der Lösung jeden Bin k multiplizieren mit `e^(i·α·k)`. Lineare Phasen-Drift pro Frequenz.

**Effekt:**
- α = 0: aktuelle radiale Projektion, kein Swirl.
- α > 0: kontrollierter Drehanteil — Quadrat wird zum Pinwheel, dann zum Hakenkreuz-artigen Gebilde.
- α < 0: Gegenrotation.
- α = ±2π: volle Umdrehung der Phasen — sieht wieder ähnlich aus wie α=0 wegen Periodizität, aber mit kollektiver Verschiebung.

**Mathematische Schönheit:** `α·k` ist die natürlichste lineare Phasen-Operation auf einem zirkulanten Spektrum. Der ehemalige Arc-Length-Bug entspricht genau einem festen α≠0 — der Slider macht diesen zu einem dosierbaren Freiheitsgrad statt einem Zwangsfehler.

**Implementation-Pflicht:** Spektrum muss als komplexe Werte zwischen Solving und IFFT zwischengespeichert werden. Re-IFFT bei Slider-Move (O(N log N), billig).

### 3. `Verzerrungs-Stärke` s — Slider [-2, +2], Default 1

**Math:** Skalare Multiplikation der finalen Verschiebungs-Vektoren: `(dx, dy) → s · (dx, dy)`. Äquivalent zur Multiplikation des Spektrums mit s vor der IFFT.

**Effekt:**
- s = 0: keine Verzerrung. Kreis bleibt Kreis. Form unsichtbar.
- s = 1: aktueller Default.
- s = -1: invertierte Verzerrung. Quadrat wird zu inverse-Quadrat (Kissenform/Anti-Polygon).
- s > 1: Überschuss. Form überschießt nach außen.
- s < -1: invertierter Überschuss.

**Implementation-Pflicht:** Trivial — Multiplikation der finalen Verschiebungs-Werte.

## Mathematische Operator-Kette

```
shape(θ) = Polygon-Radius bei Winkel θ
target[i] = (shape(θᵢ) - 1) · (cos θᵢ, sin θᵢ)         (radiale Verschiebung)

W(ε)[j] = exp(-(2 sin(πj/n))² / (spacing·ε)²)         (zirkulante Matrix-Erste-Zeile)
λ(ε)[k] = FFT(W(ε))[k]                                 (Eigenwerte)
T[k] = FFT(target)[k]
S_base(ε)[k] = T[k] / λ(ε)[k]                          (Basis-Spektrum, ε-abhängig)

S_modified(ε, α, s)[k] = s · e^(i·α·k) · S_base(ε)[k]  (drei orthogonale Operatoren)

solution(ε, α, s) = IFFT(S_modified)                   (Verschiebungs-Werte pro Kontrollpunkt)
```

Operatoren kommutieren. Form-Identität (Spektral-Träger) bleibt erhalten solange s≠0 und e^(iαk) keine Frequenz-Auslöschung erzeugt (was bei skalarem α nicht passiert).

## Architektur

### Neue Datenstruktur

Pro Form-State zusätzlich speichern:
- `spectrum: { dxRe, dxIm, dyRe, dyIm }` — komplexes Basis-Spektrum (vor Twist, vor Scale, mit aktuellem ε bereits eingebaut)
- `spectralParams: { kernelWidth, twist, scale }` — die drei Slider-Werte
- `cachedKernelWidth` — zum Erkennen wann Re-Solve nötig ist

### Refactor in `generateShapeControlPoints`

Statt direkt `solved.dx[i]` als Verschiebung der Kontrollpunkte zurückzugeben:

1. Solve wie bisher, aber Spektrum nicht verwerfen
2. Spektrum cachen
3. `applySpectralModifiers(spectrum, twist, scale)` aufrufen → finale dx/dy
4. Kontrollpunkte mit modifizierten dx/dy zurückgeben

### Hermitian-Symmetrie-Pflicht

Damit das IFFT-Resultat reell bleibt, muss die Phase symmetrisch angewendet werden:
- DC (k=0): unverändert.
- Niederfrequenz-Hälfte (k=1..N/2-1): F[k] *= e^(iαk)
- Hochfrequenz-Spiegel (k=N/2+1..N-1): F[k] *= e^(-iα(N-k)) — entspricht conj des Spiegelpartners
- Nyquist (k=N/2, nur falls N gerade): F[N/2] *= cos(αN/2) (Imag muss null bleiben)

Ohne diese Symmetrie würde IFFT eine imaginäre Komponente erzeugen, die das Verschiebungs-Feld verfälscht.

### Neue Funktion `applySpectralModifiers`

```js
function applySpectralModifiers(spectrum, twist, scale) {
    const n = spectrum.dxRe.length;
    const dxRe = new Float64Array(n);
    const dxIm = new Float64Array(n);
    const dyRe = new Float64Array(n);
    const dyIm = new Float64Array(n);

    // DC bleibt reell, nur skaliert
    dxRe[0] = scale * spectrum.dxRe[0];
    dyRe[0] = scale * spectrum.dyRe[0];

    const half = n >> 1;
    for (let k = 1; k < half; k++) {
        const c = Math.cos(twist * k);
        const s = Math.sin(twist * k);
        // Niederfrequenz: F[k] *= e^(iαk)
        dxRe[k] = scale * (spectrum.dxRe[k] * c - spectrum.dxIm[k] * s);
        dxIm[k] = scale * (spectrum.dxRe[k] * s + spectrum.dxIm[k] * c);
        dyRe[k] = scale * (spectrum.dyRe[k] * c - spectrum.dyIm[k] * s);
        dyIm[k] = scale * (spectrum.dyRe[k] * s + spectrum.dyIm[k] * c);
        // Spiegel: F[n-k] = conj(F[k]) für reelles Resultat
        dxRe[n - k] =  dxRe[k];
        dxIm[n - k] = -dxIm[k];
        dyRe[n - k] =  dyRe[k];
        dyIm[n - k] = -dyIm[k];
    }
    // Nyquist (N gerade): nur reell, mit cos-Faktor
    if ((n & 1) === 0) {
        const cn = Math.cos(twist * half);
        dxRe[half] = scale * spectrum.dxRe[half] * cn;
        dyRe[half] = scale * spectrum.dyRe[half] * cn;
    }

    fftInPlace(dxRe, dxIm, true);
    fftInPlace(dyRe, dyIm, true);
    return { dx: Array.from(dxRe), dy: Array.from(dyRe) };
}
```

**Geometrische Deutung des Twist:** Die Multiplikation mit `e^(iαk)` ist via FFT-Shift-Theorem äquivalent zu einer **zirkulären Verschiebung der Lösungs-Werte** im Ortsraum um `α·N/(2π)` Positionen — fraktional, via band-limited Sinc-Interpolation. Praktisch: Kontrollpunkt i bekommt die Verschiebung, die ursprünglich zu Position i+shift gehört hat. Da der Kontrollpunkt selbst aber nicht mitwandert, entsteht ein Swirl — exakt der ehemalige Arc-Length-Effekt, jetzt kontinuierlich dosierbar. Bei α = 2π·m/N (m ganzzahlig) ergibt sich eine exakte Punkt-Rotation; dazwischen smoothe Interpolation.

### Slider-Handler

- **ε ändern:** `generateShapeControlPoints` mit neuem ε neu aufrufen → komplettes Re-Solve, neues Spektrum, Re-Render
- **α oder s ändern:** Cache verwenden → `applySpectralModifiers` → Kontrollpunkte mit neuen dx/dy aktualisieren → Re-Render

### Solver-Anpassung

`solveCirculantRBF` muss zusätzlich das Eigenwert-Inverse-Spektrum zurückgeben können (für späteren Twist), oder einfacher: das Roh-Spektrum `S_base[k] = T[k] / λ[k]` separat speichern und IFFT in eine separate Funktion ausgliedern.

Vorschlag: `solveCirculantRBF` zerlegen in:
1. `computeBaseSpectrum(n, targetDx, targetDy, radius)` → gibt `{ dxRe, dxIm, dyRe, dyIm }`
2. `applySpectralModifiers(spectrum, twist, scale)` → gibt `{ dx, dy }`
3. Default-Aufruf-Pfad: `applySpectralModifiers(computeBaseSpectrum(...), 0, 1)` reproduziert exakt das aktuelle Verhalten.

## UI-Layout

Drei neue Slider direkt unter den Shape-Buttons im bestehenden Control-Panel. Beschriftung deutsch:

- **Kernel-Breite** (ε) — Wertebereich `0.1` bis `5.0`, log-Skala
- **Twist** (α) — Wertebereich `-2π` bis `+2π`, lineare Skala, Beschriftung in Bruchteilen von π (`-π/2`, `0`, `+π`)
- **Stärke** (s) — Wertebereich `-2` bis `+2`, lineare Skala

Sliders sichtbar/aktiv **nur wenn `activeShape !== null`**. Bei freiem Control-Point-Modus disabled mit Tooltip "Erst eine Form aktivieren".

Reset-Button: setzt alle drei auf Default zurück.

URL-State: Slider-Werte als Query-Params `?eps=1.5&twist=0.785&scale=1.0` (Back-Button-Prinzip — Form + Slider zusammen navigierbar).

## Defaults & Backwards-Compat

Default `ε=1.0, α=0, s=1` reproduziert die aktuelle Verzerrung **bit-exakt**. Wer die Seite ohne Interaktion lädt, sieht den Status quo.

## Mobile

- Slider-Tap-Target ≥40px (siehe Mobile-Check-Memory)
- Slider-Werte-Label gut lesbar (mind. 14px)
- Keine Hover-only-Interaktion

## Erweiterung: Text-Modus Linien vs. Umrisse

Zusätzlich zur Spektral-DOF wird im Text-Eingabe-Modus ein Toggle eingeführt:

- **Umriss-Modus (Default, aktuelles Verhalten):** `extractCharContour` rasterisiert das Zeichen via `fillText` und traced via Moore-Neighbor die Außenkontur des gefüllten Glyphen. Resultat: geschlossener Außen-Polygonzug.
- **Linien-Modus (neu):** Rasterisiertes Zeichen wird via **Zhang-Suen-Thinning** auf eine 1-Pixel-Skelett-Linie reduziert (klassische morphologische Skelettierung). Skelett-Pixel werden via DFS in zusammenhängende Pfad-Segmente getrennt; offene Pfade werden via `connectContours` mit Brücken verbunden so wie bei Multi-Glyphen.

UI: kleiner Toggle-Button "Linie / Umriss" oberhalb oder neben dem Text-Eingabefeld. Sichtbar wenn Text-Eingabe aktiv. Default: Umriss (Status quo).

Mathematische Konsequenz: Die nachgelagerte RBF-/Spektral-Pipeline ist unverändert — sie verarbeitet beliebige Kontroll-Punkt-Sequenzen. Spektral-Slider funktionieren in beiden Modi gleich.

## Out-of-Scope (v1)

- Per-Kontrollpunkt-Variation (würde FFT-Circulant-Annahme brechen)
- Form-Algebra (Linearkombination mehrerer Polygone)
- Custom-Shape-Import
- Twist/Scale-Anwendung auf freie (nicht-Shape) Kontrollpunkte — math definierbar, aber UX unklar
- Animation/Auto-Cycling der Slider
- Hershey-Vektor-Font-Integration (Linien-Modus nutzt Skelettierung der gerasterten System-Schrift)

## Verifikations-Plan

1. **Bit-Exakt-Default:** Default-Werte ε=1, α=0, s=1 → Screenshot identisch zum aktuellen Stand (Quadrat-Form, gleiche Verzerrung).
2. **ε-Extreme:**
   - ε=0.1: Form-Konturen schärfer, Ringing zwischen Kontrollpunkten sichtbar.
   - ε=5.0: Form rundet sich, Verzerrung erstreckt sich weiter in den Raum.
3. **Twist-Test:**
   - α=π/4: Quadrat wird sichtbar gedreht/spiralisiert (Pinwheel-Effekt).
   - α=-π/4: Gegen-Drehung.
4. **Scale-Test:**
   - s=0: keine Verzerrung, Gitter ungestört, Kreis bleibt Kreis.
   - s=-1: invertierte Form (Kissen statt Quadrat).
   - s=2: Form überschießt nach außen.
5. **Orthogonalität:** Slider unabhängig moven → kein gegenseitiges Drift.
6. **Slider-Reset:** Reset-Button → Default-State exakt wieder hergestellt.
7. **Mobile (375×812):** Slider bedienbar, kein Layout-Bruch.
8. **Playwright-Verify:** Headless-Screenshots der oben genannten Test-States, visueller Diff zur Spec.

## Phasen

1. **Refactor:** `solveCirculantRBF` zerlegen in `computeBaseSpectrum` + `applySpectralModifiers`. Verhalten unverändert.
2. **State:** Spektrum + spectralParams in State-Struktur aufnehmen.
3. **UI:** Drei Slider + Reset-Button in Control-Panel.
4. **Handler:** Slider-Events → Re-Solve oder Re-Modifier.
5. **URL-State:** Query-Param-Sync.
6. **Verify:** Playwright-Tests + Mobile-Check.
