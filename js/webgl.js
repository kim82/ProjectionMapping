import { quadQ, toArray } from './mapping.js';

const VERTEX_SHADER = `
attribute vec2 aPos;
attribute vec3 aUV;
varying vec3 vUV;
void main() {
  vUV = aUV;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision highp float;
varying vec3 vUV;
uniform sampler2D uTex;
uniform float uAlpha;
void main() {
  gl_FragColor = vec4(texture2D(uTex, vUV.xy / vUV.z).rgb, uAlpha);
}`;

export class Renderer {
  constructor(canvas, onContextRestored) {
    this.canvas = canvas;
    this.onContextRestored = onContextRestored;

    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      this.lost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.init();
      this.lost = false;
      if (this.onContextRestored) this.onContextRestored();
    });

    if (!this.init()) {
      throw new Error('WebGL is not available in this browser.');
    }
  }

  init() {
    const gl = this.gl = this.canvas.getContext('webgl', {
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: false
    });
    if (!gl) return false;

    const compileShader = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader));
      }

      return shader;
    };

    const program = this.program = gl.createProgram();
    gl.attachShader(program, compileShader(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    gl.useProgram(program);

    this.buffer = gl.createBuffer();
    this.alphaUniform = gl.getUniformLocation(program, 'uAlpha');
    this.positionAttribute = gl.getAttribLocation(program, 'aPos');
    this.uvAttribute = gl.getAttribLocation(program, 'aUV');
    this.textures = {
      video: this.createTexture(),
      trigger: this.createTexture(),
      test: this.createTexture()
    };

    return true;
  }

  createTexture() {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Clamp and use linear filtering so non-power-of-two video sizes work in WebGL 1.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 255])
    );

    return texture;
  }

  upload(name, source) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.textures[name]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  resize() {
    const pixelRatio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(this.canvas.clientWidth * pixelRatio));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * pixelRatio));

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  draw(mapping, layers, mirrorHorizontally = false, rotationDegrees = 0) {
    if (this.lost) return;

    const gl = this.gl;
    this.resize();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!layers.length) return;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const points = toArray(mapping);
    const correctionFactors = quadQ(points);
    const textureCoordinates = [[0, 0], [1, 0], [1, 1], [0, 1]];
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(this.positionAttribute);
    gl.vertexAttribPointer(this.positionAttribute, 2, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(this.uvAttribute);
    gl.vertexAttribPointer(this.uvAttribute, 3, gl.FLOAT, false, 20, 8);

    for (const layer of layers) {
      const rotation = layer.tex === 'test'
        ? 0
        : ((Math.round(rotationDegrees / 90) % 4 + 4) % 4);
      const makeVertex = index => {
        const [x, y] = points[index];
        const [u, v] = textureCoordinates[index];
        let sourceU = u;
        let sourceV = v;
        if (rotation === 1) {
          [sourceU, sourceV] = [v, 1 - u];
        } else if (rotation === 2) {
          [sourceU, sourceV] = [1 - u, 1 - v];
        } else if (rotation === 3) {
          [sourceU, sourceV] = [1 - v, u];
        }
        if (mirrorHorizontally) sourceU = 1 - sourceU;
        const correction = correctionFactors[index];
        return [
          x * 2 - 1,
          1 - y * 2,
          sourceU * correction,
          sourceV * correction,
          correction
        ];
      };
      const vertices = [0, 1, 2, 0, 2, 3].flatMap(makeVertex);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
      gl.bindTexture(gl.TEXTURE_2D, this.textures[layer.tex]);
      gl.uniform1f(this.alphaUniform, layer.a);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  }
}
