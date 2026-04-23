// Thermal erosion simulation

class ErosionSimulator {
  constructor(viewer) {
    this.viewer = viewer;
    this.simulating = false;
    this.animationId = null;
    this.speed = 1;
  }

  start() {
    if (this.simulating || !this.viewer.heightMapData) return;
    this.simulating = true;
    document.getElementById('playBtn').textContent = '⏸ Pause';
    this.step();
  }

  stop() {
    this.simulating = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    document.getElementById('playBtn').textContent = '▶ Play';
  }

  step() {
    if (!this.simulating) return;
    this.apply(this.speed, 0.003);
    this.animationId = requestAnimationFrame(() => this.step());
  }

  apply(iterations = 5, talusAngle = 0.003) {
    if (!this.viewer.heightMapData) return;

    const w = this.viewer.heightMapWidth;
    const h = this.viewer.heightMapHeight;

    for (let iter = 0; iter < iterations; iter++) {
      const temp = new Float32Array(this.viewer.heightMapData);

      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const idx = y * w + x;
          const current = this.viewer.heightMapData[idx];

          const neighbors = [
            { idx: (y - 1) * w + x, val: this.viewer.heightMapData[(y - 1) * w + x] },
            { idx: (y + 1) * w + x, val: this.viewer.heightMapData[(y + 1) * w + x] },
            { idx: y * w + (x - 1), val: this.viewer.heightMapData[y * w + (x - 1)] },
            { idx: y * w + (x + 1), val: this.viewer.heightMapData[y * w + (x + 1)] }
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
      for (let i = 0; i < this.viewer.heightMapData.length; i++) {
        this.viewer.heightMapData[i] = Math.max(this.viewer.oceanHeight, temp[i]);
      }
    }

    this.viewer.updateHeightTexture();
  }
}
