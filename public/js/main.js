// Main HeightMap Viewer

class HeightMapViewer {
  constructor() {
    this.canvas = document.getElementById('glCanvas');
    this.gl = this.canvas.getContext('webgl2');
    
    if (!this.gl) {
      alert('WebGL2 not supported');
      return;
    }

    // Geometry
    this.heightTexture = null;
    this.meshVAO = null;
    this.meshIndexBuffer = null;
    this.indexCount = 0;
    this.heightMapWidth = 256;
    this.heightMapHeight = 256;
    this.heightMapData = null;
    this.originalHeightMapData = null;

    // Colors
    this.colorOcean = { r: 0.12, g: 0.56, b: 1.0 };
    this.colorLow = { r: 0.13, g: 0.55, b: 0.13 };
    this.colorMid = { r: 0.55, g: 0.27, b: 0.07 };
    this.colorHigh = { r: 1.0, g: 1.0, b: 1.0 };
    
    // Height levels
    this.oceanHeight = 0.2;
    this.groundHeight = 0.4;
    this.mountainHeight = 0.7;
    this.heightScale = 1.0;

    // Camera
    this.rotation = { x: 0.6, y: -0.3 };
    this.zoom = 5.5;
    this.isDragging = false;
    this.lastMouse = { x: 0, y: 0 };

    // Tools
    this.brush = new BrushTool(this);
    this.erosion = new ErosionSimulator(this);

    this.setupGL();
    this.setupEventListeners();
    this.loadSample('circle');
  }

  setupGL() {
    this.gl.clearColor(0.1, 0.1, 0.1, 1.0);
    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.enable(this.gl.CULL_FACE);
    this.gl.cullFace(this.gl.BACK);

    this.program = this.createProgram();
    this.resizeCanvas();
    this.render();
  }

  createProgram() {
    const program = this.gl.createProgram();
    const vs = this.compileShader(Shaders.getVertexShader(), this.gl.VERTEX_SHADER);
    const fs = this.compileShader(Shaders.getFragmentShader(), this.gl.FRAGMENT_SHADER);

    this.gl.attachShader(program, vs);
    this.gl.attachShader(program, fs);
    this.gl.linkProgram(program);

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      console.error(this.gl.getProgramInfoLog(program));
    }

    return program;
  }

  compileShader(source, type) {
    const shader = this.gl.createShader(type);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error(this.gl.getShaderInfoLog(shader));
    }

    return shader;
  }

  createMesh(width, height) {
    const positions = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        positions.push(x / (width - 1), y / (height - 1));
      }
    }

    const indices = [];
    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        const a = y * width + x;
        const b = a + 1;
        const c = a + width;
        const d = c + 1;

        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    const posBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, posBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(positions), this.gl.STATIC_DRAW);

    this.meshIndexBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.meshIndexBuffer);
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), this.gl.STATIC_DRAW);

    this.meshVAO = this.gl.createVertexArray();
    this.gl.bindVertexArray(this.meshVAO);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, posBuffer);

    const posLoc = this.gl.getAttribLocation(this.program, 'position');
    this.gl.enableVertexAttribArray(posLoc);
    this.gl.vertexAttribPointer(posLoc, 2, this.gl.FLOAT, false, 8, 0);

    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.meshIndexBuffer);
    this.gl.bindVertexArray(null);

    this.indexCount = indices.length;
  }

  createHeightTexture(data, width, height) {
    if (this.heightTexture) {
      this.gl.deleteTexture(this.heightTexture);
    }

    this.heightTexture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.heightTexture);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.R8, width, height, 0,
      this.gl.RED, this.gl.UNSIGNED_BYTE, new Uint8Array(data));
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
  }

  updateHeightTexture() {
    const data = new Uint8Array(this.heightMapData.length);
    for (let i = 0; i < this.heightMapData.length; i++) {
      data[i] = Math.round(this.heightMapData[i] * 255);
    }
    this.createHeightTexture(data, this.heightMapWidth, this.heightMapHeight);
    this.render();
  }

  loadHeightMap(imageData, width, height) {
    const data = new Uint8Array(width * height);
    for (let i = 0; i < imageData.length; i += 4) {
      const gray = Math.round((imageData[i] + imageData[i + 1] + imageData[i + 2]) / 3);
      data[i / 4] = gray;
    }

    this.heightMapWidth = width;
    this.heightMapHeight = height;
    this.heightMapData = new Float32Array(width * height);
    for (let i = 0; i < data.length; i++) {
      this.heightMapData[i] = data[i] / 255;
    }

    this.createHeightTexture(data, width, height);
    this.createMesh(width, height);
    this.brush.saveSnapshot();
    this.render();
  }

  loadHeightMapFromImage(img) {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    this.loadHeightMap(imageData.data, img.width, img.height);
  }

  setupEventListeners() {
    document.getElementById('fileInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            this.loadHeightMapFromImage(img);
          };
          img.src = event.target.result;
        };
        reader.readAsDataURL(file);
      }
    });

    // Color pickers
    ['colorOcean', 'colorLow', 'colorMid', 'colorHigh'].forEach(colorName => {
      const elemName = colorName === 'colorOcean' ? 'colorOcean' : colorName;
      document.getElementById(elemName).addEventListener('change', (e) => {
        const rgb = MathUtils.hexToRgb(e.target.value);
        this[colorName] = { r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255 };
        this.render();
      });
    });

    // Height levels
    document.getElementById('oceanHeight').addEventListener('input', (e) => {
      this.oceanHeight = parseFloat(e.target.value) / 100;
      document.getElementById('oceanHeightValue').textContent = e.target.value + '%';
      this.render();
    });

    document.getElementById('groundHeight').addEventListener('input', (e) => {
      this.groundHeight = parseFloat(e.target.value) / 100;
      document.getElementById('groundHeightValue').textContent = e.target.value + '%';
      this.render();
    });

    document.getElementById('mountainHeight').addEventListener('input', (e) => {
      this.mountainHeight = parseFloat(e.target.value) / 100;
      document.getElementById('mountainHeightValue').textContent = e.target.value + '%';
      this.render();
    });

    document.getElementById('heightScale').addEventListener('change', (e) => {
      this.heightScale = parseFloat(e.target.value);
      document.getElementById('scaleValue').textContent = this.heightScale.toFixed(1);
      this.render();
    });

    // Erosion speed
    document.getElementById('erosionSpeed').addEventListener('input', (e) => {
      this.erosion.speed = parseInt(e.target.value);
      document.getElementById('erosionSpeedValue').textContent = this.erosion.speed;
    });

    // Brush controls
    document.getElementById('brushSize').addEventListener('input', (e) => {
      this.brush.size = parseInt(e.target.value);
      document.getElementById('brushSizeValue').textContent = this.brush.size;
    });

    document.getElementById('brushStrength').addEventListener('input', (e) => {
      this.brush.strength = parseFloat(e.target.value);
      document.getElementById('brushStrengthValue').textContent = this.brush.strength.toFixed(2);
    });

    // Canvas mouse events
    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.lastMouse = { x: e.clientX, y: e.clientY };
      if (this.brush.enabled) {
        this.brush.paint(e);
      }
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (this.isDragging && !this.brush.enabled) {
        const dx = e.clientX - this.lastMouse.x;
        const dy = e.clientY - this.lastMouse.y;
        this.rotation.y += dx * 0.01;
        this.rotation.x += dy * 0.01;
        this.lastMouse = { x: e.clientX, y: e.clientY };
        this.render();
      }

      if (this.brush.enabled && this.isDragging) {
        this.brush.paint(e);
      }
    });

    this.canvas.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom += e.deltaY * 0.002;
      this.zoom = Math.max(1, Math.min(20, this.zoom));
      this.render();
    });

    window.addEventListener('resize', () => {
      this.resizeCanvas();
      this.render();
    });
  }

  loadSample(name) {
    let canvas;
    
    if (name === 'circle') {
      canvas = TerrainSamples.generateCircle();
    } else if (name === 'corners') {
      canvas = TerrainSamples.generateCorners();
    } else if (name === 'pyramid') {
      canvas = TerrainSamples.generatePyramid();
    } else if (name === 'mountains') {
      canvas = TerrainSamples.generateMountains();
    }

    const img = new Image();
    img.onload = () => {
      this.loadHeightMapFromImage(img);
    };
    img.src = canvas.toDataURL();
  }

  resetCamera() {
    this.rotation = { x: 0.6, y: -0.3 };
    this.zoom = 5.5;
    this.render();
  }

  downloadHeightmap() {
    if (!this.heightMapData) return;

    const w = this.heightMapWidth;
    const h = this.heightMapHeight;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(w, h);
    const data = imgData.data;

    for (let i = 0; i < this.heightMapData.length; i++) {
      const gray = Math.round(this.heightMapData[i] * 255);
      data[i * 4] = gray;
      data[i * 4 + 1] = gray;
      data[i * 4 + 2] = gray;
      data[i * 4 + 3] = 255;
    }

    ctx.putImageData(imgData, 0, 0);

    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'heightmap.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  downloadSample(name) {
    let canvas = TerrainSamples['generate' + name.charAt(0).toUpperCase() + name.slice(1)]();
    
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sample-${name}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  render() {
    if (!this.heightTexture || !this.meshVAO) return;

    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    this.gl.useProgram(this.program);

    const aspect = this.canvas.width / this.canvas.height;
    const projection = MathUtils.perspective(Math.PI / 4, aspect, 0.1, 100);
    
    const distance = this.zoom;
    const camX = Math.sin(this.rotation.y) * Math.cos(this.rotation.x) * distance;
    const camY = Math.sin(this.rotation.x) * distance;
    const camZ = Math.cos(this.rotation.y) * Math.cos(this.rotation.x) * distance;
    
    const view = MathUtils.lookAt([camX, camY + 1.0, camZ], [0, 0.5, 0], [0, 1, 0]);
    const modelMatrix = MathUtils.identity();

    this.gl.uniformMatrix4fv(this.gl.getUniformLocation(this.program, 'projection'), false, projection);
    this.gl.uniformMatrix4fv(this.gl.getUniformLocation(this.program, 'view'), false, view);
    this.gl.uniformMatrix4fv(this.gl.getUniformLocation(this.program, 'model'), false, modelMatrix);
    this.gl.uniform1f(this.gl.getUniformLocation(this.program, 'heightScale'), this.heightScale);
    this.gl.uniform1f(this.gl.getUniformLocation(this.program, 'oceanHeight'), this.oceanHeight);
    this.gl.uniform1f(this.gl.getUniformLocation(this.program, 'groundHeight'), this.groundHeight);
    this.gl.uniform1f(this.gl.getUniformLocation(this.program, 'mountainHeight'), this.mountainHeight);
    this.gl.uniform3f(this.gl.getUniformLocation(this.program, 'colorOcean'), this.colorOcean.r, this.colorOcean.g, this.colorOcean.b);
    this.gl.uniform3f(this.gl.getUniformLocation(this.program, 'colorLow'), this.colorLow.r, this.colorLow.g, this.colorLow.b);
    this.gl.uniform3f(this.gl.getUniformLocation(this.program, 'colorMid'), this.colorMid.r, this.colorMid.g, this.colorMid.b);
    this.gl.uniform3f(this.gl.getUniformLocation(this.program, 'colorHigh'), this.colorHigh.r, this.colorHigh.g, this.colorHigh.b);

    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.heightTexture);
    this.gl.uniform1i(this.gl.getUniformLocation(this.program, 'heightMap'), 0);

    this.gl.bindVertexArray(this.meshVAO);
    this.gl.drawElements(this.gl.TRIANGLES, this.indexCount, this.gl.UNSIGNED_INT, 0);
  }
}

// Global functions
window.loadSample = (name) => {
  window.viewer.loadSample(name);
};

window.resetCamera = () => {
  window.viewer.resetCamera();
};

window.applyErosion = () => {
  window.viewer.erosion.apply(8, 0.003);
};

window.toggleErosionSimulation = () => {
  if (window.viewer.erosion.simulating) {
    window.viewer.erosion.stop();
  } else {
    window.viewer.erosion.start();
  }
};

window.downloadHeightmap = () => {
  window.viewer.downloadHeightmap();
};

window.downloadSample = (name) => {
  window.viewer.downloadSample(name);
};

window.toggleBrushMode = () => {
  window.viewer.brush.toggle();
};

window.resetHeightmap = () => {
  window.viewer.brush.reset();
};

window.addEventListener('DOMContentLoaded', () => {
  window.viewer = new HeightMapViewer();
});
