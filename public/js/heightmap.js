class HeightMapViewer {
  constructor() {
    this.canvas = document.getElementById('glCanvas');
    this.gl = this.canvas.getContext('webgl2');
    
    if (!this.gl) {
      alert('WebGL2 not supported');
      return;
    }

    this.heightData = null;
    this.heightTexture = null;
    this.meshVAO = null;
    this.meshIndexBuffer = null;
    this.indexCount = 0;
    this.oceanMeshVAO = null;
    this.oceanIndexCount = 0;

    this.colorOcean = { r: 0.12, g: 0.56, b: 1.0 };
    this.colorLow = { r: 0.13, g: 0.55, b: 0.13 };
    this.colorMid = { r: 0.55, g: 0.27, b: 0.07 };
    this.colorHigh = { r: 1.0, g: 1.0, b: 1.0 };
    
    this.oceanHeight = 0.2;
    this.groundHeight = 0.4;
    this.mountainHeight = 0.7;
    this.heightScale = 1.0;

    this.rotation = { x: 0.6, y: -0.3 };
    this.zoom = 5.5;
    this.isDragging = false;
    this.lastMouse = { x: 0, y: 0 };

    this.erosionSimulating = false;
    this.erosionAnimationId = null;
    this.erosionSpeed = 1;

    this.brushMode = false;
    this.brushSize = 20;
    this.brushStrength = 0.05;
    this.originalHeightMapData = null;

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
    const vertexShader = `#version 300 es
      precision highp float;

      uniform sampler2D heightMap;
      uniform float heightScale;
      uniform float oceanHeight;
      uniform mat4 projection;
      uniform mat4 view;
      uniform mat4 model;

      in vec2 position;

      out vec3 vPosition;
      out vec3 vNormal;
      out float vHeight;

      void main() {
        float height = texture(heightMap, position).r * heightScale;
        float seaLevel = oceanHeight * heightScale;
        
        // Clamp height to ocean level (ocean is flat)
        if (height < seaLevel) {
          height = seaLevel;
        }
        
        vHeight = height;
        // Center the terrain at origin, scale X-Y properly, Z is height
        vec3 pos = vec3((position.x - 0.5) * 2.0, height, (position.y - 0.5) * 2.0);
        vPosition = pos;

        gl_Position = projection * view * model * vec4(pos, 1.0);

        // Calculate normals using height differences
        vec2 texelSize = 1.0 / vec2(textureSize(heightMap, 0));
        float h0 = height;
        float hx = texture(heightMap, position + vec2(texelSize.x, 0.0)).r * heightScale;
        float hy = texture(heightMap, position + vec2(0.0, texelSize.y)).r * heightScale;
        
        // Clamp to sea level for normal calculation
        if (hx < seaLevel) hx = seaLevel;
        if (hy < seaLevel) hy = seaLevel;

        vec3 dx = vec3(texelSize.x * 2.0, 0.0, hx - h0);
        vec3 dy = vec3(0.0, texelSize.y * 2.0, hy - h0);
        vNormal = normalize(cross(dy, dx));
      }
    `;

    const fragmentShader = `#version 300 es
      precision highp float;

      uniform vec3 colorOcean;
      uniform vec3 colorLow;
      uniform vec3 colorMid;
      uniform vec3 colorHigh;
      uniform float oceanHeight;
      uniform float groundHeight;
      uniform float mountainHeight;
      uniform float heightScale;

      in vec3 vPosition;
      in vec3 vNormal;
      in float vHeight;

      out vec4 outColor;

      void main() {
        vec3 lightDir = normalize(vec3(0.5, 1.0, 0.5));
        float diffuse = max(dot(vNormal, lightDir), 0.3);

        vec3 color;
        
        float seaLevel = oceanHeight * heightScale;
        float gLevel = groundHeight * heightScale;
        float mLevel = mountainHeight * heightScale;
        
        if (vHeight <= seaLevel) {
          // Ocean - solid color
          color = colorOcean;
        } else if (vHeight <= gLevel) {
          // Ocean to Ground transition
          float t = (vHeight - seaLevel) / (gLevel - seaLevel);
          color = mix(colorOcean, colorLow, t);
        } else if (vHeight <= mLevel) {
          // Ground to Mountain transition
          float t = (vHeight - gLevel) / (mLevel - gLevel);
          color = mix(colorLow, colorMid, t);
        } else {
          // Snow - solid color above mountain height
          color = colorHigh;
        }

        color *= diffuse;
        outColor = vec4(color, 1.0);
      }
    `;

    const program = this.gl.createProgram();
    const vs = this.compileShader(vertexShader, this.gl.VERTEX_SHADER);
    const fs = this.compileShader(fragmentShader, this.gl.FRAGMENT_SHADER);

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
    this.render();
  }

  saveHeightMapSnapshot() {
    if (this.heightMapData) {
      this.originalHeightMapData = new Float32Array(this.heightMapData);
    }
  }

  resetCamera() {
    this.rotation = { x: 0.6, y: -0.3 };
    this.zoom = 5.5;
    this.render();
  }

  applyThermalErosion(iterations = 5, talusAngle = 0.003) {
    if (!this.heightMapData) return;

    const w = this.heightMapWidth;
    const h = this.heightMapHeight;
    const seaLevel = this.oceanHeight;

    for (let iter = 0; iter < iterations; iter++) {
      const temp = new Float32Array(this.heightMapData);

      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const idx = y * w + x;
          const current = this.heightMapData[idx];

          const neighbors = [
            { idx: (y - 1) * w + x, val: this.heightMapData[(y - 1) * w + x] },
            { idx: (y + 1) * w + x, val: this.heightMapData[(y + 1) * w + x] },
            { idx: y * w + (x - 1), val: this.heightMapData[y * w + (x - 1)] },
            { idx: y * w + (x + 1), val: this.heightMapData[y * w + (x + 1)] }
          ];

          for (const neighbor of neighbors) {
            const diff = current - neighbor.val;
            if (diff > talusAngle) {
              const amount = (diff - talusAngle) * 0.3;
              temp[idx] -= amount;
              temp[neighbor.idx] += amount;
            }
          }
        }
      }

      // Copy temp back to heightMapData and clamp to sea level
      for (let i = 0; i < this.heightMapData.length; i++) {
        this.heightMapData[i] = Math.max(seaLevel, temp[i]);
      }
    }

    // Convert back to 0-255 and update texture
    const data = new Uint8Array(this.heightMapData.length);
    for (let i = 0; i < this.heightMapData.length; i++) {
      data[i] = Math.max(0, Math.min(255, Math.round(this.heightMapData[i] * 255)));
    }
    this.createHeightTexture(data, w, h);
    this.render();
  }

  startErosionSimulation() {
    if (this.erosionSimulating || !this.heightMapData) return;
    this.erosionSimulating = true;
    document.getElementById('playBtn').textContent = '⏸ Pause';
    this.simulateErosionStep();
  }

  stopErosionSimulation() {
    this.erosionSimulating = false;
    if (this.erosionAnimationId) {
      cancelAnimationFrame(this.erosionAnimationId);
      this.erosionAnimationId = null;
    }
    document.getElementById('playBtn').textContent = '▶ Play';
  }

  simulateErosionStep() {
    if (!this.erosionSimulating) return;

    this.applyThermalErosion(this.erosionSpeed, 0.003);

    this.erosionAnimationId = requestAnimationFrame(() => {
      this.simulateErosionStep();
    });
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

    document.getElementById('colorLow').addEventListener('change', (e) => {
      const hex = e.target.value;
      const rgb = this.hexToRgb(hex);
      this.colorLow = { r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255 };
      this.render();
    });

    document.getElementById('colorMid').addEventListener('change', (e) => {
      const hex = e.target.value;
      const rgb = this.hexToRgb(hex);
      this.colorMid = { r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255 };
      this.render();
    });

    document.getElementById('colorHigh').addEventListener('change', (e) => {
      const hex = e.target.value;
      const rgb = this.hexToRgb(hex);
      this.colorHigh = { r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255 };
      this.render();
    });

    document.getElementById('colorOcean').addEventListener('change', (e) => {
      const hex = e.target.value;
      const rgb = this.hexToRgb(hex);
      this.colorOcean = { r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255 };
      this.render();
    });

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

    document.getElementById('erosionSpeed').addEventListener('input', (e) => {
      this.erosionSpeed = parseInt(e.target.value);
      document.getElementById('erosionSpeedValue').textContent = this.erosionSpeed;
    });

    document.getElementById('brushSize').addEventListener('input', (e) => {
      this.brushSize = parseInt(e.target.value);
      document.getElementById('brushSizeValue').textContent = this.brushSize;
    });

    document.getElementById('brushStrength').addEventListener('input', (e) => {
      this.brushStrength = parseFloat(e.target.value);
      document.getElementById('brushStrengthValue').textContent = this.brushStrength.toFixed(2);
    });

    document.getElementById('heightScale').addEventListener('change', (e) => {
      this.heightScale = parseFloat(e.target.value);
      document.getElementById('scaleValue').textContent = this.heightScale.toFixed(1);
      this.render();
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (this.isDragging && !this.brushMode) {
        const dx = e.clientX - this.lastMouse.x;
        const dy = e.clientY - this.lastMouse.y;
        this.rotation.y += dx * 0.01;
        this.rotation.x += dy * 0.01;
        this.lastMouse = { x: e.clientX, y: e.clientY };
        this.render();
      }

      if (this.brushMode && this.isDragging) {
        this.paintBrush(e);
      }
    });

    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.lastMouse = { x: e.clientX, y: e.clientY };
      if (this.brushMode) {
        this.paintBrush(e);
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

  toggleBrushMode() {
    this.brushMode = !this.brushMode;
    const btn = document.getElementById('brushBtn');
    if (this.brushMode) {
      btn.textContent = '✏️ Brush On';
      this.canvas.style.cursor = 'crosshair';
      this.saveHeightMapSnapshot();
    } else {
      btn.textContent = '✏️ Brush Off';
      this.canvas.style.cursor = 'default';
    }
  }

  paintBrush(event) {
    if (!this.heightMapData) return;

    const rect = this.canvas.getBoundingClientRect();
    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;

    // Map canvas coordinates to heightmap coordinates
    const w = this.heightMapWidth;
    const h = this.heightMapHeight;
    const x = Math.floor((canvasX / rect.width) * w);
    const y = Math.floor((canvasY / rect.height) * h);

    // Apply brush with circular falloff
    const radius = this.brushSize;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const px = x + dx;
        const py = y + dy;

        if (px >= 0 && px < w && py >= 0 && py < h) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= radius) {
            // Smooth falloff curve
            const falloff = Math.cos((dist / radius) * Math.PI / 2);
            const idx = py * w + px;
            this.heightMapData[idx] += this.brushStrength * falloff;
            this.heightMapData[idx] = Math.max(this.oceanHeight, Math.min(1.0, this.heightMapData[idx]));
          }
        }
      }
    }

    // Update texture
    const data = new Uint8Array(this.heightMapData.length);
    for (let i = 0; i < this.heightMapData.length; i++) {
      data[i] = Math.round(this.heightMapData[i] * 255);
    }
    this.createHeightTexture(data, w, h);
    this.render();
  }

  loadSample(name) {
    let canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    let ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(256, 256);
    const data = imgData.data;

    if (name === 'circle') {
      for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 256; x++) {
          const dx = x - 128;
          const dy = y - 128;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const maxDist = 128;
          const height = Math.max(0, 255 * (1 - dist / maxDist));
          const idx = (y * 256 + x) * 4;
          data[idx] = data[idx + 1] = data[idx + 2] = height;
          data[idx + 3] = 255;
        }
      }
    } else if (name === 'corners') {
      for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 256; x++) {
          const dx = Math.min(x, 255 - x);
          const dy = Math.min(y, 255 - y);
          const dist = Math.min(dx, dy);
          const height = (dist / 128) * 255;
          const idx = (y * 256 + x) * 4;
          data[idx] = data[idx + 1] = data[idx + 2] = height;
          data[idx + 3] = 255;
        }
      }
    } else if (name === 'pyramid') {
      for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 256; x++) {
          const dx = Math.abs(x - 128);
          const dy = Math.abs(y - 128);
          const dist = Math.max(dx, dy);
          const height = Math.max(0, 255 * (1 - dist / 128));
          const idx = (y * 256 + x) * 4;
          data[idx] = data[idx + 1] = data[idx + 2] = height;
          data[idx + 3] = 255;
        }
      }
    } else if (name === 'mountains') {
      // Generate realistic mountain terrain using multiple peaks
      const peaks = [
        { x: 128, y: 80, height: 255, radius: 60 },
        { x: 80, y: 150, height: 200, radius: 50 },
        { x: 180, y: 170, height: 210, radius: 45 },
        { x: 60, y: 220, height: 120, radius: 40 },
        { x: 200, y: 120, height: 180, radius: 48 }
      ];

      for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 256; x++) {
          let height = 30; // Base elevation

          for (const peak of peaks) {
            const dx = x - peak.x;
            const dy = y - peak.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < peak.radius) {
              // Smooth falloff using gaussian-like curve
              const falloff = Math.exp(-Math.pow(dist / (peak.radius * 0.6), 2));
              height += peak.height * falloff;
            }
          }

          height = Math.max(0, Math.min(255, height));
          const idx = (y * 256 + x) * 4;
          data[idx] = data[idx + 1] = data[idx + 2] = height;
          data[idx + 3] = 255;
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
    const img = new Image();
    img.onload = () => {
      this.loadHeightMapFromImage(img);
    };
    img.src = canvas.toDataURL();
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

  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  }

  downloadHeightmap() {
    if (!this.heightMapData) return;

    const w = this.heightMapWidth;
    const h = this.heightMapHeight;

    // Create canvas and draw the heightmap
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(w, h);
    const data = imgData.data;

    // Convert height data to grayscale image
    for (let i = 0; i < this.heightMapData.length; i++) {
      const gray = Math.round(this.heightMapData[i] * 255);
      data[i * 4] = gray;
      data[i * 4 + 1] = gray;
      data[i * 4 + 2] = gray;
      data[i * 4 + 3] = 255;
    }

    ctx.putImageData(imgData, 0, 0);

    // Download as PNG
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
    let canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    let ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(256, 256);
    const data = imgData.data;

    // Generate sample data (same as loadSample)
    if (name === 'circle') {
      for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 256; x++) {
          const dx = x - 128;
          const dy = y - 128;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const maxDist = 128;
          const height = Math.max(0, 255 * (1 - dist / maxDist));
          const idx = (y * 256 + x) * 4;
          data[idx] = data[idx + 1] = data[idx + 2] = height;
          data[idx + 3] = 255;
        }
      }
    } else if (name === 'corners') {
      for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 256; x++) {
          const dx = Math.min(x, 255 - x);
          const dy = Math.min(y, 255 - y);
          const dist = Math.min(dx, dy);
          const height = (dist / 128) * 255;
          const idx = (y * 256 + x) * 4;
          data[idx] = data[idx + 1] = data[idx + 2] = height;
          data[idx + 3] = 255;
        }
      }
    } else if (name === 'pyramid') {
      for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 256; x++) {
          const dx = Math.abs(x - 128);
          const dy = Math.abs(y - 128);
          const dist = Math.max(dx, dy);
          const height = Math.max(0, 255 * (1 - dist / 128));
          const idx = (y * 256 + x) * 4;
          data[idx] = data[idx + 1] = data[idx + 2] = height;
          data[idx + 3] = 255;
        }
      }
    } else if (name === 'mountains') {
      const peaks = [
        { x: 128, y: 80, height: 255, radius: 60 },
        { x: 80, y: 150, height: 200, radius: 50 },
        { x: 180, y: 170, height: 210, radius: 45 },
        { x: 60, y: 220, height: 120, radius: 40 },
        { x: 200, y: 120, height: 180, radius: 48 }
      ];

      for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 256; x++) {
          let height = 30;

          for (const peak of peaks) {
            const dx = x - peak.x;
            const dy = y - peak.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < peak.radius) {
              const falloff = Math.exp(-Math.pow(dist / (peak.radius * 0.6), 2));
              height += peak.height * falloff;
            }
          }

          height = Math.max(0, Math.min(255, height));
          const idx = (y * 256 + x) * 4;
          data[idx] = data[idx + 1] = data[idx + 2] = height;
          data[idx + 3] = 255;
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);

    // Download as PNG
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
    const projection = this.perspective(Math.PI / 4, aspect, 0.1, 100);
    
    // Better camera setup: orbit around the center of the terrain
    const distance = this.zoom;
    const camX = Math.sin(this.rotation.y) * Math.cos(this.rotation.x) * distance;
    const camY = Math.sin(this.rotation.x) * distance;
    const camZ = Math.cos(this.rotation.y) * Math.cos(this.rotation.x) * distance;
    
    const view = this.lookAt([camX, camY + 1.0, camZ], [0, 0.5, 0], [0, 1, 0]);
    const modelMatrix = this.identity();

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

  // Matrix math utilities
  identity() {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }

  perspective(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0
    ]);
  }

  lookAt(eye, center, up) {
    const zAxis = this.normalize(this.subtract(eye, center));
    const xAxis = this.normalize(this.cross(up, zAxis));
    const yAxis = this.cross(zAxis, xAxis);

    return new Float32Array([
      xAxis[0], yAxis[0], zAxis[0], 0,
      xAxis[1], yAxis[1], zAxis[1], 0,
      xAxis[2], yAxis[2], zAxis[2], 0,
      -this.dot(xAxis, eye), -this.dot(yAxis, eye), -this.dot(zAxis, eye), 1
    ]);
  }

  rotateX(matrix, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const rot = new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
    this.multiply(matrix, rot);
  }

  rotateY(matrix, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const rot = new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
    this.multiply(matrix, rot);
  }

  multiply(a, b) {
    for (let i = 0; i < 16; i++) {
      const row = Math.floor(i / 4);
      const col = i % 4;
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[row * 4 + k] * b[k * 4 + col];
      }
      a[i] = sum;
    }
  }

  subtract(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }

  cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }

  dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  normalize(v) {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    return [v[0] / len, v[1] / len, v[2] / len];
  }
}

window.loadSample = (name) => {
  window.viewer.loadSample(name);
};

window.resetCamera = () => {
  window.viewer.resetCamera();
};

window.applyErosion = () => {
  window.viewer.applyThermalErosion(8, 0.003);
};

window.toggleErosionSimulation = () => {
  if (window.viewer.erosionSimulating) {
    window.viewer.stopErosionSimulation();
  } else {
    window.viewer.startErosionSimulation();
  }
};

window.downloadHeightmap = () => {
  window.viewer.downloadHeightmap();
};

window.downloadSample = (name) => {
  window.viewer.downloadSample(name);
};

window.toggleBrushMode = () => {
  window.viewer.toggleBrushMode();
};

window.resetHeightmap = () => {
  if (window.viewer.originalHeightMapData) {
    window.viewer.heightMapData = new Float32Array(window.viewer.originalHeightMapData);
    const w = window.viewer.heightMapWidth;
    const h = window.viewer.heightMapHeight;
    const data = new Uint8Array(window.viewer.heightMapData.length);
    for (let i = 0; i < window.viewer.heightMapData.length; i++) {
      data[i] = Math.round(window.viewer.heightMapData[i] * 255);
    }
    window.viewer.createHeightTexture(data, w, h);
    window.viewer.render();
  }
};

window.addEventListener('DOMContentLoaded', () => {
  window.viewer = new HeightMapViewer();
});
