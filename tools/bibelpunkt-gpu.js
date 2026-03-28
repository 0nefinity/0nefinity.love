(function (global) {
  'use strict';

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function normalizeDebugVisualMode(mode) {
    if (mode === 'solid-discs') return 1;
    if (mode === 'sdf-direct') return 2;
    return 0;
  }

  function intersectsBounds(a, b) {
    return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
  }

  function expandBounds(bounds, xPad, yPad) {
    return {
      minX: bounds.minX - xPad,
      maxX: bounds.maxX + xPad,
      minY: bounds.minY - yPad,
      maxY: bounds.maxY + yPad
    };
  }

  function hashUnit(a, b = 0, c = 0) {
    let value = Math.imul((a | 0) + 1, 1597334677);
    value ^= Math.imul((b | 0) + 1, 3812015801);
    value ^= Math.imul((c | 0) + 1, 958282973);
    value ^= value >>> 16;
    return (value >>> 0) / 4294967295;
  }

  function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader) || 'Shader compile failed';
      gl.deleteShader(shader);
      throw new Error(error);
    }
    return shader;
  }

  function createProgram(gl, vertexSource, fragmentSource) {
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program) || 'Program link failed';
      gl.deleteProgram(program);
      throw new Error(error);
    }
    return program;
  }

  function glyphWeightFor(char, externalWeightGetter) {
    if (typeof externalWeightGetter === 'function') {
      return clamp(externalWeightGetter(char), 0, 1);
    }
    if (!char || char <= ' ') return 0;
    if (',.;:·`´\'"'.includes(char)) return 0.26;
    if ('-_~|/\\()[]{}'.includes(char)) return 0.42;
    if ('iljrtfI1'.includes(char)) return 0.5;
    if ('mwMW@#%&8'.includes(char)) return 0.96;
    return 0.74;
  }

  function buildGlyphAtlas({ uniqueChars, fontFamily, fontWeight, fontStyle, fontSize, buffer, radius, cutoff, atlasPadding, maxAtlasSize }) {
    if (!global.TinySDF) {
      throw new Error('TinySDF nicht verfügbar');
    }

    const sdf = new global.TinySDF({
      fontSize,
      buffer,
      radius,
      cutoff,
      fontFamily,
      fontWeight,
      fontStyle
    });

    const chars = Array.from(new Set((uniqueChars || '').split(''))).filter(char => char && char !== ' ');
    const cellSize = sdf.size + atlasPadding * 2;
    const maxCols = Math.max(1, Math.floor(maxAtlasSize / cellSize));
    const cols = Math.max(1, Math.min(maxCols, Math.ceil(Math.sqrt(Math.max(chars.length, 1)))));
    const rows = Math.max(1, Math.ceil(Math.max(chars.length, 1) / cols));
    const width = cols * cellSize;
    const height = rows * cellSize;

    if (width > maxAtlasSize || height > maxAtlasSize) {
      throw new Error(`Glyph-Atlas zu groß (${width}×${height})`);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);

    const glyphs = new Map();
    let nonEmptyGlyphCount = 0;
    let atlasMin = 255;
    let atlasMax = 0;

    for (let index = 0; index < chars.length; index++) {
      const char = chars[index];
      const glyph = sdf.draw(char);
      const col = index % cols;
      const row = Math.floor(index / cols);
      const dx = col * cellSize + atlasPadding;
      const dy = row * cellSize + atlasPadding;

      if (glyph.width > 0 && glyph.height > 0) {
        nonEmptyGlyphCount += 1;
        const imageData = ctx.createImageData(glyph.width, glyph.height);
        for (let i = 0, j = 0; i < glyph.data.length; i++, j += 4) {
          const value = glyph.data[i];
          atlasMin = Math.min(atlasMin, value);
          atlasMax = Math.max(atlasMax, value);
          imageData.data[j] = value;
          imageData.data[j + 1] = value;
          imageData.data[j + 2] = value;
          imageData.data[j + 3] = 255;
        }
        ctx.putImageData(imageData, dx, dy);
      }

      glyphs.set(char, {
        u0: dx / width,
        v0: dy / height,
        u1: (dx + glyph.width) / width,
        v1: (dy + glyph.height) / height,
        width: glyph.width,
        height: glyph.height,
        advance: glyph.glyphAdvance || 0
      });
    }

    return {
      canvas,
      width,
      height,
      glyphs,
      sdfSize: sdf.size,
      stats: {
        totalChars: chars.length,
        nonEmptyGlyphCount,
        atlasMin: Number.isFinite(atlasMin) ? atlasMin : 0,
        atlasMax: Number.isFinite(atlasMax) ? atlasMax : 0
      }
    };
  }

  class GlyphScene {
    constructor(options) {
      this.textData = options.textData || '';
      this.layout = options.layout;
      this.shapeType = options.shapeType || 'circle';
      this.baseCharWidth = options.baseCharWidth;
      this.lineHeight = options.lineHeight;
      this.weightGetter = options.weightGetter;
      this.atlas = options.atlas;
      this.chunkRows = Math.max(8, options.chunkRows || 64);
      this.lodCircleBase = options.lodCircleBase || 7.2;
      this.lodCircleMaxStride = Math.max(1, options.lodCircleMaxStride || 28);
      this.lodLineBase = options.lodLineBase || 4.8;
      this.lodLineMaxStride = Math.max(1, options.lodLineMaxStride || 12);
      this.chunks = this.buildChunks();
      this.lastBuild = { signature: '', count: 0, data: new Float32Array(0) };
    }

    getRowCount() {
      if (this.layout?.meta?.virtualRows) {
        return this.layout.meta.lineCount || 0;
      }
      return this.layout?.rows?.length || 0;
    }

    getRow(rowIndex) {
      if (this.layout?.meta?.virtualRows) {
        const charsPerLine = this.layout.meta.charsPerLine;
        const startIndex = rowIndex * charsPerLine;
        const charCount = Math.min(charsPerLine, this.textData.length - startIndex);
        return {
          x: 0,
          y: this.layout.meta.topY + rowIndex * this.lineHeight,
          startIndex,
          charCount
        };
      }
      return this.layout.rows[rowIndex];
    }

    getLineBoundsForRow(row) {
      const width = Math.max(0, row.charCount * this.baseCharWidth);
      return {
        minX: row.x - width / 2,
        maxX: row.x + width / 2,
        minY: row.y - this.lineHeight / 2,
        maxY: row.y + this.lineHeight / 2
      };
    }

    buildChunks() {
      const chunks = [];
      const rowCount = this.getRowCount();

      for (let startRow = 0; startRow < rowCount; startRow += this.chunkRows) {
        const endRow = Math.min(rowCount - 1, startRow + this.chunkRows - 1);
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        for (let rowIndex = startRow; rowIndex <= endRow; rowIndex++) {
          const row = this.getRow(rowIndex);
          if (!row || row.charCount <= 0) continue;
          const bounds = this.getLineBoundsForRow(row);
          minX = Math.min(minX, bounds.minX);
          maxX = Math.max(maxX, bounds.maxX);
          minY = Math.min(minY, bounds.minY);
          maxY = Math.max(maxY, bounds.maxY);
        }

        if (!Number.isFinite(minX)) continue;

        chunks.push({
          id: chunks.length,
          startRow,
          endRow,
          bounds: { minX, maxX, minY, maxY }
        });
      }

      return chunks;
    }

    getVisibleRowRange(worldBounds) {
      const rowCount = this.getRowCount();
      if (rowCount <= 0) return { firstRow: 0, lastRow: -1 };

      const topY = this.layout?.meta?.virtualRows
        ? this.layout.meta.topY
        : (this.layout.rows[0]?.y || 0);

      const firstRow = clamp(
        Math.floor((worldBounds.minY - topY) / this.lineHeight) - 2,
        0,
        rowCount - 1
      );
      const lastRow = clamp(
        Math.ceil((worldBounds.maxY - topY) / this.lineHeight) + 2,
        firstRow,
        rowCount - 1
      );

      return { firstRow, lastRow };
    }

    buildSignature(worldBounds, visibleChunks) {
      const { firstRow, lastRow } = this.getVisibleRowRange(worldBounds);
      const leftCol = Math.floor(worldBounds.minX / Math.max(this.baseCharWidth, 0.0001));
      const rightCol = Math.ceil(worldBounds.maxX / Math.max(this.baseCharWidth, 0.0001));
      return [
        firstRow,
        lastRow,
        leftCol,
        rightCol,
        visibleChunks.map(chunk => chunk.id).join('.')
      ].join('|');
    }

    getLodProfile(effectiveScale) {
      const projectedPx = Math.max(this.baseCharWidth, this.lineHeight) * Math.max(effectiveScale, 0.0001);
      const shapeBase = this.shapeType === 'line' ? this.lodLineBase : this.lodCircleBase;
      const shapeMax = this.shapeType === 'line' ? this.lodLineMaxStride : this.lodCircleMaxStride;
      let sampleStride = clamp(Math.floor(shapeBase / Math.max(projectedPx, 0.001)), 1, shapeMax);

      if (projectedPx < 0.9) {
        sampleStride = Math.min(shapeMax, Math.max(sampleStride, this.shapeType === 'line' ? 3 : 5));
      }
      if (projectedPx < 0.45) {
        sampleStride = Math.min(shapeMax, sampleStride * (this.shapeType === 'line' ? 2 : 3));
      }

      return {
        projectedPx,
        sampleStride,
        lodBucket: sampleStride
      };
    }

    buildInstances(worldBounds, effectiveScale) {
      const expandedBounds = expandBounds(worldBounds, this.baseCharWidth * 2, this.lineHeight * 2);
      const visibleChunks = this.chunks.filter(chunk => intersectsBounds(chunk.bounds, expandedBounds));
      const lod = this.getLodProfile(effectiveScale);
      const signature = `${this.buildSignature(expandedBounds, visibleChunks)}|lod:${lod.lodBucket}`;

      if (signature === this.lastBuild.signature) {
        return this.lastBuild;
      }

      const data = [];

      for (const chunk of visibleChunks) {
        for (let rowIndex = chunk.startRow; rowIndex <= chunk.endRow; rowIndex++) {
          const row = this.getRow(rowIndex);
          if (!row || row.charCount <= 0) continue;
          if (row.y < expandedBounds.minY || row.y > expandedBounds.maxY) continue;

          const lineLeftWorldX = row.x - (row.charCount * this.baseCharWidth) / 2;
          const visibleStart = clamp(
            Math.floor((expandedBounds.minX - lineLeftWorldX) / this.baseCharWidth) - 1,
            0,
            row.charCount
          );
          const visibleEnd = clamp(
            Math.ceil((expandedBounds.maxX - lineLeftWorldX) / this.baseCharWidth) + 1,
            visibleStart,
            row.charCount
          );
          const stride = lod.sampleStride;
          const strideOffset = stride > 1
            ? Math.floor(hashUnit(rowIndex, chunk.id, row.startIndex) * stride)
            : 0;
          let column = visibleStart;

          if (stride > 1) {
            const remainder = (visibleStart - strideOffset) % stride;
            const delta = remainder <= 0 ? -remainder : stride - remainder;
            column += delta;
          }

          for (; column < visibleEnd; column += stride) {
            const charIndex = row.startIndex + column;
            const char = this.textData[charIndex];
            const glyph = this.atlas.glyphs.get(char);
            if (!glyph) continue;

            const centerX = lineLeftWorldX + (column + 0.5) * this.baseCharWidth;
            const weight = glyphWeightFor(char, this.weightGetter);

            data.push(
              centerX,
              row.y,
              this.baseCharWidth,
              this.lineHeight,
              glyph.u0,
              glyph.v0,
              glyph.u1,
              glyph.v1,
              weight
            );
          }
        }
      }

      this.lastBuild = {
        signature,
        count: data.length / 9,
        data: new Float32Array(data)
      };
      return this.lastBuild;
    }
  }

  class BibelpunktWebGLRenderer {
    constructor(canvas, config = {}) {
      this.canvas = canvas;
      this.gl = canvas.getContext('webgl2', {
        alpha: true,
        antialias: true,
        depth: false,
        stencil: false,
        premultipliedAlpha: false
      });

      if (!this.gl) {
        throw new Error('WebGL2 nicht verfügbar');
      }

      this.config = {
        farPxStart: 10,
        farPxEnd: 1.5,
        farMinExpandPx: 0.28,
        farEnergyBoost: 0.34,
        farVisualMinPx: 1.35,
        farVisibilityFloor: 0.2,
        nearPassMinPx: 1.25,
        farPassMaxPx: 8,
        sdfEdge: 0.75,
        debugVisualMode: 'off',
        ...config
      };

      this.scene = null;
      this.instanceCount = 0;
      this.instanceSignature = '';
      this.lastDebugInfo = null;
      this.atlasCanvas = null;
      this.atlasTexture = null;
      this.program = null;
      this.uniforms = {};
      this.attribs = {};
      this.vao = null;
      this.quadBuffer = null;
      this.instanceBuffer = null;

      this.initProgram();
      this.initBuffers();
    }

    initProgram() {
      const gl = this.gl;
      const vertexSource = `#version 300 es
        precision highp float;
        precision highp int;
        in vec2 a_corner;
        in vec2 a_center;
        in vec2 a_size;
        in vec2 a_uvMin;
        in vec2 a_uvMax;
        in float a_weight;

        uniform vec2 u_viewport;
        uniform vec2 u_focusWorld;
        uniform float u_effectiveScale;
        uniform float u_farPxStart;
        uniform float u_farPxEnd;
        uniform float u_farMinExpandPx;
        uniform float u_farVisualMinPx;
        uniform int u_shapeMode;
        uniform int u_debugVisualMode;

        out vec2 v_uv;
        out vec2 v_local;
        out vec2 v_anchor;
        out float v_weight;
        out float v_farT;
        out float v_projectedPx;
        flat out int v_shapeMode;

        void main() {
          float projectedPx = max(a_size.x, a_size.y) * u_effectiveScale;
          float farT = 1.0 - smoothstep(u_farPxEnd, u_farPxStart, projectedPx);
          float expandPx = farT * u_farMinExpandPx;
          vec2 sizeWorld = a_size + vec2(expandPx / max(u_effectiveScale, 0.0001));
          if (u_debugVisualMode == 0) {
            float farMinPx = mix(0.0, u_farVisualMinPx, smoothstep(0.35, 1.0, farT));
            if (farMinPx > 0.0) {
              vec2 farMinWorld = vec2(farMinPx / max(u_effectiveScale, 0.0001));
              sizeWorld = max(sizeWorld, farMinWorld);
              projectedPx = max(projectedPx, farMinPx);
            }
          }
          if (u_debugVisualMode != 0) {
            vec2 debugMinWorld = vec2(6.0 / max(u_effectiveScale, 0.0001));
            sizeWorld = max(sizeWorld, debugMinWorld);
            projectedPx = max(max(sizeWorld.x, sizeWorld.y) * u_effectiveScale, 6.0);
          }
          vec2 worldPos = a_center + a_corner * sizeWorld;
          vec2 screenPos = u_viewport * 0.5 + (worldPos - u_focusWorld) * u_effectiveScale;
          vec2 clip = (screenPos / u_viewport) * 2.0 - 1.0;
          clip.y *= -1.0;

          gl_Position = vec4(clip, 0.0, 1.0);
          v_uv = mix(a_uvMin, a_uvMax, a_corner + 0.5);
          v_local = a_corner * 2.0;
          v_anchor = a_center;
          v_weight = a_weight;
          v_farT = farT;
          v_projectedPx = projectedPx;
          v_shapeMode = u_shapeMode;
        }
      `;

      const fragmentSource = `#version 300 es
        precision highp float;
        precision highp int;
        uniform sampler2D u_atlas;
        uniform int u_passMode;
        uniform float u_farEnergyBoost;
        uniform float u_farVisibilityFloor;
        uniform float u_sdfEdge;
        uniform int u_debugVisualMode;

        in vec2 v_uv;
        in vec2 v_local;
        in vec2 v_anchor;
        in float v_weight;
        in float v_farT;
        in float v_projectedPx;
        flat in int v_shapeMode;

        out vec4 outColor;

        float hash12(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }

        void main() {
          if (u_debugVisualMode == 1) {
            float debugAlpha = smoothstep(1.0, 0.15, length(v_local)) * 0.92;
            if (debugAlpha <= 0.01) discard;
            outColor = vec4(vec3(1.0), debugAlpha);
            return;
          }

          float sdf = texture(u_atlas, v_uv).r;
          if (u_debugVisualMode == 2) {
            float edgeBand = 1.0 - smoothstep(0.0, max(fwidth(sdf) * 2.5, 0.02), abs(sdf - u_sdfEdge));
            vec3 debugColor = vec3(sdf);
            debugColor = mix(debugColor, vec3(1.0, 0.38, 0.08), edgeBand * 0.9);
            outColor = vec4(debugColor, 0.96);
            return;
          }

          float fw = max(fwidth(sdf), 0.0015);
          float glyphAlpha = smoothstep(u_sdfEdge - fw, u_sdfEdge + fw, sdf);
          float disc = smoothstep(1.0, 0.0, length(v_local));
          float circleAura = disc * max(v_weight, 0.16) * 0.24;
          float lineAura = disc * max(v_weight, 0.12) * 0.46;
          float farAura = v_shapeMode == 1 ? lineAura : circleAura;
          float farGlyphAlpha = max(glyphAlpha * (0.62 + 0.38 * disc), glyphAlpha);
          float farAlpha = max(farGlyphAlpha, farAura);
          float projectedFade = 1.0 - clamp(v_projectedPx / 18.0, 0.0, 1.0);
          float grain = 0.76 + 0.24 * hash12(v_anchor * 0.017 + vec2(v_weight, v_farT));

          if (u_passMode == 0) {
            float alpha = glyphAlpha * (1.0 - v_farT * 0.78);
            if (alpha <= 0.001) discard;
            outColor = vec4(vec3(1.0), alpha);
            return;
          }

          float shapeBoost = v_shapeMode == 1 ? 1.05 : 0.82;
          float alpha = v_farT * farAlpha * grain * shapeBoost * (u_farVisibilityFloor + projectedFade * u_farEnergyBoost);
          if (alpha <= 0.001) discard;
          outColor = vec4(vec3(alpha), alpha);
        }
      `;

      this.program = createProgram(gl, vertexSource, fragmentSource);
      this.uniforms = {
        viewport: gl.getUniformLocation(this.program, 'u_viewport'),
        focusWorld: gl.getUniformLocation(this.program, 'u_focusWorld'),
        effectiveScale: gl.getUniformLocation(this.program, 'u_effectiveScale'),
        farPxStart: gl.getUniformLocation(this.program, 'u_farPxStart'),
        farPxEnd: gl.getUniformLocation(this.program, 'u_farPxEnd'),
        farMinExpandPx: gl.getUniformLocation(this.program, 'u_farMinExpandPx'),
        farVisualMinPx: gl.getUniformLocation(this.program, 'u_farVisualMinPx'),
        shapeMode: gl.getUniformLocation(this.program, 'u_shapeMode'),
        debugVisualMode: gl.getUniformLocation(this.program, 'u_debugVisualMode'),
        passMode: gl.getUniformLocation(this.program, 'u_passMode'),
        farEnergyBoost: gl.getUniformLocation(this.program, 'u_farEnergyBoost'),
        farVisibilityFloor: gl.getUniformLocation(this.program, 'u_farVisibilityFloor'),
        sdfEdge: gl.getUniformLocation(this.program, 'u_sdfEdge'),
        atlas: gl.getUniformLocation(this.program, 'u_atlas')
      };
      this.attribs = {
        corner: gl.getAttribLocation(this.program, 'a_corner'),
        center: gl.getAttribLocation(this.program, 'a_center'),
        size: gl.getAttribLocation(this.program, 'a_size'),
        uvMin: gl.getAttribLocation(this.program, 'a_uvMin'),
        uvMax: gl.getAttribLocation(this.program, 'a_uvMax'),
        weight: gl.getAttribLocation(this.program, 'a_weight')
      };
    }

    initBuffers() {
      const gl = this.gl;
      const quad = new Float32Array([
        -0.5, -0.5,
         0.5, -0.5,
        -0.5,  0.5,
        -0.5,  0.5,
         0.5, -0.5,
         0.5,  0.5
      ]);

      this.vao = gl.createVertexArray();
      this.quadBuffer = gl.createBuffer();
      this.instanceBuffer = gl.createBuffer();

      gl.bindVertexArray(this.vao);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(this.attribs.corner);
      gl.vertexAttribPointer(this.attribs.corner, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
      const stride = 9 * 4;

      gl.enableVertexAttribArray(this.attribs.center);
      gl.vertexAttribPointer(this.attribs.center, 2, gl.FLOAT, false, stride, 0);
      gl.vertexAttribDivisor(this.attribs.center, 1);

      gl.enableVertexAttribArray(this.attribs.size);
      gl.vertexAttribPointer(this.attribs.size, 2, gl.FLOAT, false, stride, 8);
      gl.vertexAttribDivisor(this.attribs.size, 1);

      gl.enableVertexAttribArray(this.attribs.uvMin);
      gl.vertexAttribPointer(this.attribs.uvMin, 2, gl.FLOAT, false, stride, 16);
      gl.vertexAttribDivisor(this.attribs.uvMin, 1);

      gl.enableVertexAttribArray(this.attribs.uvMax);
      gl.vertexAttribPointer(this.attribs.uvMax, 2, gl.FLOAT, false, stride, 24);
      gl.vertexAttribDivisor(this.attribs.uvMax, 1);

      gl.enableVertexAttribArray(this.attribs.weight);
      gl.vertexAttribPointer(this.attribs.weight, 1, gl.FLOAT, false, stride, 32);
      gl.vertexAttribDivisor(this.attribs.weight, 1);

      gl.bindVertexArray(null);
    }

    ensureAtlasTexture(atlasCanvas) {
      if (this.atlasCanvas === atlasCanvas && this.atlasTexture) return;

      const gl = this.gl;
      this.atlasCanvas = atlasCanvas;

      if (!this.atlasTexture) {
        this.atlasTexture = gl.createTexture();
      }

      gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);
    }

    setScene(scene) {
      this.scene = scene;
      this.instanceSignature = '';
      this.instanceCount = 0;
      if (scene?.atlas?.canvas) {
        this.ensureAtlasTexture(scene.atlas.canvas);
      }
    }

    setConfig(partial = {}) {
      Object.assign(this.config, partial);
    }

    setDebugVisualMode(mode) {
      this.setConfig({ debugVisualMode: mode || 'off' });
    }

    resize(width, height, dpr) {
      const displayWidth = Math.max(1, Math.round(width * dpr));
      const displayHeight = Math.max(1, Math.round(height * dpr));
      if (this.canvas.width !== displayWidth || this.canvas.height !== displayHeight) {
        this.canvas.width = displayWidth;
        this.canvas.height = displayHeight;
      }
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      this.gl.viewport(0, 0, displayWidth, displayHeight);
    }

    getWorldBounds(focusWorld, effectiveScale, width, height) {
      const halfW = width / Math.max(2 * effectiveScale, 0.0001);
      const halfH = height / Math.max(2 * effectiveScale, 0.0001);
      return {
        minX: focusWorld.x - halfW,
        maxX: focusWorld.x + halfW,
        minY: focusWorld.y - halfH,
        maxY: focusWorld.y + halfH
      };
    }

    syncVisibleInstances(worldBounds, effectiveScale) {
      if (!this.scene) return;
      const build = this.scene.buildInstances(worldBounds, effectiveScale);
      if (build.signature === this.instanceSignature) return;

      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, build.data, gl.DYNAMIC_DRAW);
      this.instanceSignature = build.signature;
      this.instanceCount = build.count;
    }

    render({ width, height, dpr, effectiveScale, focusWorld }) {
      if (!this.scene || !this.atlasTexture) return;

      this.resize(width, height, dpr);
      const worldBounds = this.getWorldBounds(focusWorld, effectiveScale, width, height);
      this.syncVisibleInstances(worldBounds, effectiveScale);
      const lod = this.scene.getLodProfile(effectiveScale);
      const debugVisualMode = normalizeDebugVisualMode(this.config.debugVisualMode);
      const drawNearPass = debugVisualMode === 0 && lod.projectedPx >= this.config.nearPassMinPx;
      const drawFarPass = debugVisualMode !== 0 || lod.projectedPx <= this.config.farPassMaxPx;
      this.lastDebugInfo = {
        instanceCount: this.instanceCount,
        worldBounds,
        effectiveScale,
        canvasWidth: width,
        canvasHeight: height,
        chunkCount: Array.isArray(this.scene?.chunks) ? this.scene.chunks.length : 0,
        rowCount: typeof this.scene?.getRowCount === 'function' ? this.scene.getRowCount() : 0,
        shapeType: this.scene?.shapeType || 'unknown',
        debugVisualMode: this.config.debugVisualMode,
        sampleStride: lod.sampleStride,
        projectedPx: lod.projectedPx,
        drawNearPass,
        drawFarPass
      };

      const gl = this.gl;
      const errorBefore = gl.getError();
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      if (this.instanceCount <= 0) return;

      gl.useProgram(this.program);
      gl.bindVertexArray(this.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
      gl.uniform1i(this.uniforms.atlas, 0);
      gl.uniform2f(this.uniforms.viewport, width, height);
      gl.uniform2f(this.uniforms.focusWorld, focusWorld.x, focusWorld.y);
      gl.uniform1f(this.uniforms.effectiveScale, effectiveScale);
      gl.uniform1f(this.uniforms.farPxStart, this.config.farPxStart);
      gl.uniform1f(this.uniforms.farPxEnd, this.config.farPxEnd);
      gl.uniform1f(this.uniforms.farMinExpandPx, this.config.farMinExpandPx);
      gl.uniform1f(this.uniforms.farVisualMinPx, this.config.farVisualMinPx);
      gl.uniform1i(this.uniforms.shapeMode, this.scene.shapeType === 'line' ? 1 : 0);
      gl.uniform1i(this.uniforms.debugVisualMode, debugVisualMode);
      gl.uniform1f(this.uniforms.farEnergyBoost, this.config.farEnergyBoost);
      gl.uniform1f(this.uniforms.farVisibilityFloor, this.config.farVisibilityFloor);
      gl.uniform1f(this.uniforms.sdfEdge, this.config.sdfEdge);

      gl.enable(gl.BLEND);

      if (drawNearPass) {
        gl.uniform1i(this.uniforms.passMode, 0);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.instanceCount);
      }

      if (drawFarPass) {
        gl.uniform1i(this.uniforms.passMode, 1);
        gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.instanceCount);
      }

      const errorAfter = gl.getError();
      this.lastDebugInfo.glErrorBefore = errorBefore;
      this.lastDebugInfo.glErrorAfter = errorAfter;
      gl.bindVertexArray(null);
    }

    getDebugInfo() {
      return this.lastDebugInfo;
    }
  }

  function buildGlyphScene(options) {
    const atlas = buildGlyphAtlas({
      uniqueChars: options.uniqueChars,
      fontFamily: options.fontFamily,
      fontWeight: options.fontWeight,
      fontStyle: options.fontStyle,
      fontSize: options.sdfFontSize,
      buffer: options.sdfBuffer,
      radius: options.sdfRadius,
      cutoff: options.sdfCutoff,
      atlasPadding: options.atlasPadding,
      maxAtlasSize: options.maxAtlasSize
    });

    return new GlyphScene({
      textData: options.textData,
      layout: options.layout,
      shapeType: options.shapeType,
      baseCharWidth: options.baseCharWidth,
      lineHeight: options.lineHeight,
      weightGetter: options.weightGetter,
      atlas,
      chunkRows: options.chunkRows,
      lodCircleBase: options.lodCircleBase,
      lodCircleMaxStride: options.lodCircleMaxStride,
      lodLineBase: options.lodLineBase,
      lodLineMaxStride: options.lodLineMaxStride
    });
  }

  global.BibelpunktGpu = {
    buildGlyphScene,
    createRenderer(canvas, config) {
      return new BibelpunktWebGLRenderer(canvas, config);
    }
  };
})(typeof window !== 'undefined' ? window : this);