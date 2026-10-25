/**
 * Minimaler GIF89a-Encoder (same-origin, ohne Worker, ohne Bibliothek).
 * Alle Frames teilen eine globale 256-Farben-Palette; Pixel sind Palettenindizes.
 *
 *   const enc = new GifEncoder(width, height, palette /* Uint8Array 256*3 *\/, { loop: 0 });
 *   enc.addFrame(indices /* Uint8Array width*height *\/, delayCentiseconds);
 *   const blob = enc.finish();   // Blob image/gif
 */
(function () {
    'use strict';

    class GifEncoder {
        constructor(width, height, palette, options = {}) {
            if (!(width > 0 && height > 0 && width < 65536 && height < 65536)) {
                throw new Error(`GifEncoder: ungueltige Groesse ${width}x${height}`);
            }
            if (!palette || palette.length !== 768) {
                throw new Error('GifEncoder: Palette muss 256*3 Bytes haben');
            }
            this.width = width;
            this.height = height;
            this.frameCount = 0;
            this._chunks = [];
            const loop = options.loop ?? 0; // 0 = endlos
            const header = [
                0x47, 0x49, 0x46, 0x38, 0x39, 0x61,
                width & 255, width >> 8, height & 255, height >> 8,
                0xF7, 0, 0 // globale Farbtabelle, 256 Eintraege, 8 Bit
            ];
            this._chunks.push(new Uint8Array(header), new Uint8Array(palette));
            this._chunks.push(new Uint8Array([
                0x21, 0xFF, 0x0B, 0x4E, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2E, 0x30,
                0x03, 0x01, loop & 255, loop >> 8, 0x00
            ]));
        }

        addFrame(indices, delayCs) {
            if (!indices || indices.length !== this.width * this.height) {
                throw new Error(`GifEncoder: Frame hat ${indices && indices.length} Pixel, erwartet ${this.width * this.height}`);
            }
            const delay = Math.max(2, Math.round(delayCs || 2));
            this._chunks.push(new Uint8Array([
                0x21, 0xF9, 0x04, 0x04, delay & 255, delay >> 8, 0, 0, // Disposal 1, keine Transparenz
                0x2C, 0, 0, 0, 0, this.width & 255, this.width >> 8, this.height & 255, this.height >> 8, 0,
                8 // LZW minimum code size
            ]));
            this._chunks.push(lzw(indices));
            this._chunks.push(new Uint8Array([0x00]));
            this.frameCount++;
        }

        finish() {
            if (this.frameCount === 0) throw new Error('GifEncoder: keine Frames');
            this._chunks.push(new Uint8Array([0x3B]));
            return new Blob(this._chunks, { type: 'image/gif' });
        }
    }

    // LZW (min code size 8) mit Daten in 255-Byte-Unterbloecken
    function lzw(pixels) {
        const CLEAR = 256, EOI = 257;
        const out = [];
        let block = new Uint8Array(255);
        let blockLen = 0;
        let acc = 0, accBits = 0;

        function pushByte(b) {
            block[blockLen++] = b;
            if (blockLen === 255) {
                out.push(Uint8Array.of(255), block);
                block = new Uint8Array(255);
                blockLen = 0;
            }
        }
        function emit(code, size) {
            acc |= code << accBits;
            accBits += size;
            while (accBits >= 8) {
                pushByte(acc & 255);
                acc >>>= 8;
                accBits -= 8;
            }
        }

        const table = new Int32Array(4096 * 256);
        let nextCode, codeSize;
        function reset() {
            table.fill(-1);
            nextCode = 258;
            codeSize = 9;
        }
        reset();
        emit(CLEAR, codeSize);

        let prefix = pixels[0];
        for (let i = 1; i < pixels.length; i++) {
            const k = pixels[i];
            const idx = (prefix << 8) | k;
            const found = table[idx];
            if (found !== -1) {
                prefix = found;
                continue;
            }
            emit(prefix, codeSize);
            if (nextCode < 4096) {
                table[idx] = nextCode++;
                if (nextCode > (1 << codeSize) && codeSize < 12) codeSize++;
            } else {
                emit(CLEAR, codeSize);
                reset();
            }
            prefix = k;
        }
        emit(prefix, codeSize);
        emit(EOI, codeSize);
        if (accBits > 0) pushByte(acc & 255);
        if (blockLen > 0) out.push(Uint8Array.of(blockLen), block.slice(0, blockLen));

        let total = 0;
        out.forEach((c) => { total += c.length; });
        const res = new Uint8Array(total);
        let o = 0;
        out.forEach((c) => { res.set(c, o); o += c.length; });
        return res;
    }

    window.GifEncoder = GifEncoder;
})();
