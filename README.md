# Height Map 3D Viewer

A WebGL-based 3D terrain visualization tool with real-time erosion simulation and interactive painting.

## Features

- 📊 **Height Map Rendering**: Visualize grayscale PNG images as 3D terrain in WebGL
- 🎨 **4-Level Color System**: Ocean (blue), Ground (green), Mountain (brown), Snow (white)
- ✏️ **Interactive Brush**: Paint terrain higher or lower with adjustable size and strength
- 🌊 **Thermal Erosion**: Simulate realistic slope erosion with continuous or single-step modes
- 📐 **Sample Terrains**: Pre-built examples including circle, corners, pyramid, and mountain ranges
- 📥 **Export/Download**: Save your terrain as a PNG grayscale image
- 🎥 **Orbit Camera**: Intuitive mouse-based camera controls

## How to Use

### Local Development
```bash
npm install
npm start
```
Then open `http://localhost:3000` in your browser.

### Online (GitHub Pages)
Visit: https://YOUR-USERNAME.github.io/heightmap-3d/

## Controls

- **Drag Mouse**: Rotate terrain camera
- **Scroll**: Zoom in/out
- **Brush Tool**: Click "✏️ Brush Off" to enable, then drag on terrain to paint

## File Structure

```
public/
├── index.html           # Main UI
├── css/
│   └── style.css       # Styling
└── js/
    ├── main.js         # Main viewer class
    ├── math-utils.js   # Matrix/vector math
    ├── shaders.js      # WebGL shaders
    ├── samples.js      # Terrain generators
    ├── brush.js        # Brush tool
    └── erosion.js      # Erosion simulator
```

## Technical Details

- **WebGL2**: Modern 3D rendering
- **256x256 Height Maps**: Normalized to 0-1 range
- **Thermal Erosion**: CPU-based simulation with configurable speed
- **Responsive Design**: Works on desktop browsers

## Browser Support

- Chrome/Chromium (recommended)
- Firefox
- Edge
- Safari (WebGL2 support may vary)

---

Created with ⛰️ by Copilot
