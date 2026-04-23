// Brush painting tool

class BrushTool {
  constructor(viewer) {
    this.viewer = viewer;
    this.enabled = false;
    this.size = 20;
    this.strength = 0.05;
  }

  toggle() {
    this.enabled = !this.enabled;
    const btn = document.getElementById('brushBtn');
    if (this.enabled) {
      btn.textContent = '✏️ Brush On';
      this.viewer.canvas.style.cursor = 'crosshair';
      this.saveSnapshot();
    } else {
      btn.textContent = '✏️ Brush Off';
      this.viewer.canvas.style.cursor = 'default';
    }
  }

  saveSnapshot() {
    if (this.viewer.heightMapData) {
      this.viewer.originalHeightMapData = new Float32Array(this.viewer.heightMapData);
    }
  }

  paint(event) {
    if (!this.viewer.heightMapData) return;

    const rect = this.viewer.canvas.getBoundingClientRect();
    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;

    const w = this.viewer.heightMapWidth;
    const h = this.viewer.heightMapHeight;
    const x = Math.floor((canvasX / rect.width) * w);
    const y = Math.floor((canvasY / rect.height) * h);

    // Apply brush with circular falloff
    const radius = this.size;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const px = x + dx;
        const py = y + dy;

        if (px >= 0 && px < w && py >= 0 && py < h) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= radius) {
            const falloff = Math.cos((dist / radius) * Math.PI / 2);
            const idx = py * w + px;
            this.viewer.heightMapData[idx] += this.strength * falloff;
            this.viewer.heightMapData[idx] = Math.max(this.viewer.oceanHeight, Math.min(1.0, this.viewer.heightMapData[idx]));
          }
        }
      }
    }

    this.viewer.updateHeightTexture();
  }

  reset() {
    if (this.viewer.originalHeightMapData) {
      this.viewer.heightMapData = new Float32Array(this.viewer.originalHeightMapData);
      this.viewer.updateHeightTexture();
    }
  }
}
