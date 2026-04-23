// Terrain generation samples

class TerrainSamples {
  static generateCircle() {
    return this.createHeightmapCanvas(256, (x, y) => {
      const dx = x - 128;
      const dy = y - 128;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = 128;
      return Math.max(0, 255 * (1 - dist / maxDist));
    });
  }

  static generateCorners() {
    return this.createHeightmapCanvas(256, (x, y) => {
      const dx = Math.min(x, 255 - x);
      const dy = Math.min(y, 255 - y);
      const dist = Math.min(dx, dy);
      return (dist / 128) * 255;
    });
  }

  static generatePyramid() {
    return this.createHeightmapCanvas(256, (x, y) => {
      const dx = Math.abs(x - 128);
      const dy = Math.abs(y - 128);
      const dist = Math.max(dx, dy);
      return Math.max(0, 255 * (1 - dist / 128));
    });
  }

  static generateMountains() {
    const peaks = [
      { x: 128, y: 80, height: 255, radius: 60 },
      { x: 80, y: 150, height: 200, radius: 50 },
      { x: 180, y: 170, height: 210, radius: 45 },
      { x: 60, y: 220, height: 120, radius: 40 },
      { x: 200, y: 120, height: 180, radius: 48 }
    ];

    return this.createHeightmapCanvas(256, (x, y) => {
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

      return Math.max(0, Math.min(255, height));
    });
  }

  static createHeightmapCanvas(size, heightFunc) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const height = heightFunc(x, y);
        const idx = (y * size + x) * 4;
        data[idx] = data[idx + 1] = data[idx + 2] = height;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }
}
