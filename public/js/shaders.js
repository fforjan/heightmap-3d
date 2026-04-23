// Shader definitions

class Shaders {
  static getVertexShader() {
    return `#version 300 es
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
  }

  static getFragmentShader() {
    return `#version 300 es
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
  }
}
