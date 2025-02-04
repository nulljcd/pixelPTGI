precision highp float;

uniform vec2 uResolution;
uniform sampler2D uPreviousRender;
uniform sampler2D uImage;
uniform sampler2D uPixelIndexMap;
uniform int uCounter;

vec2 hash23(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

vec2 gaussianRandom23(vec3 p3) {
  vec2 x = hash23(p3);
  float theta = x.y * 6.28318531;
  return sqrt(-2.0 * log(x.x)) * vec2(cos(theta), sin(theta));
}

vec3 pass(vec2 position) {
  vec3 color = vec3(0.0);
  int pixelIndex = int(texture2D(uPixelIndexMap, position / uResolution).r * 255.0);
  if (pixelIndex == 0) {
    vec3 incomingLight = vec3(0.0);
    vec3 rayColor = texture2D(uImage, position / uResolution).rgb;
  
    vec2 rayDirection = normalize(gaussianRandom23(vec3(position, uCounter)));
    vec2 rayPosition = position;
  
    bool completedPath = false;
  
    for (int i = 0; i < 4; i++) {
      // https://lodev.org/cgtutor/raycasting.html
      vec2 deltaDistance = vec2(
        rayDirection.x == 0.0 ? 1e5 : abs(1.0 / rayDirection.x),
        rayDirection.y == 0.0 ? 1e5 : abs(1.0 / rayDirection.y));
      vec2 moveStep = vec2(sign(rayDirection));
      vec2 sideDistance = deltaDistance;
      int side;
  
      for (int j = 0; j < 250; j++) {
        if (sideDistance.x < sideDistance.y) {
          sideDistance.x += deltaDistance.x;
          rayPosition.x += moveStep.x;
          side = 0;
        } else {
          sideDistance.y += deltaDistance.y;
          rayPosition.y += moveStep.y;
          side = 1;
        }
  
        if (rayPosition.x < 0.0 || rayPosition.x >= uResolution.x || rayPosition.y < 0.0 || rayPosition.y >= uResolution.y) {
          completedPath = true;
          break;
        }
  
        int hitPixelIndex = int(texture2D(uPixelIndexMap, rayPosition / uResolution).r * 255.0);
  
        if (hitPixelIndex == 0)
          continue;
        else if (hitPixelIndex == 1) {
          rayColor *= texture2D(uImage, rayPosition / uResolution).rgb;
  
          if (length(rayColor) < 0.01) {
            completedPath = true;
            break;
          }
  
          vec2 normal = (side == 0) ? vec2(-rayDirection.x, 0.0) : vec2(0.0, -rayDirection.y);
          vec2 gaussianRandom = normalize(gaussianRandom23(vec3(position, uCounter + j + i + 1)));
          if (dot(gaussianRandom, normal) < 0.0)
            gaussianRandom = -gaussianRandom;
          vec2 diffuseDirection = normalize(normal + gaussianRandom);
  
          rayDirection = diffuseDirection;
          rayPosition += normal;
          break;
        } else if (hitPixelIndex == 2) {
          // vec3 emittedLight = texture2D(uImage, rayPosition / uResolution).rgb * texture2D(uPixelIndexMap, rayPosition / uResolution).g;
          vec3 emittedLight = texture2D(uImage, rayPosition / uResolution).rgb * 30.0;
          incomingLight += emittedLight * rayColor;
  
          completedPath = true;
          break;
        }
      }
  
      if (completedPath)
        break;
    }
  
    color += incomingLight;

    // tonemapping and gamma correction
    color = color / (color + 0.155) * 1.019;

    // denoising
    // https://www.shadertoy.com/view/ldKBzG
    // https://research.nvidia.com/sites/default/files/pubs/2020-07_Spatiotemporal-reservoir-resampling/ReSTIR.pdf
    vec3 jitteredColor = vec3(0.0);
    int hits = 0;
    float totalWeight = 0.0;

    for (int i = 0; i < 8; i++) {
      vec2 offset;
      if (i == 0) offset = vec2(1.0, 0.0);
      if (i == 1) offset = vec2(-1.0, 0.0);
      if (i == 2) offset = vec2(0.0, 1.0);
      if (i == 3) offset = vec2(0.0, -1.0);
      if (i == 4) offset = vec2(1.0, 1.0);
      if (i == 5) offset = vec2(-1.0, 1.0);
      if (i == 6) offset = vec2(1.0, -1.0);
      if (i == 7) offset = vec2(-1.0, -1.0);
      vec2 samplePosition = (position + offset) / uResolution;
      if (samplePosition.x < 0.0 || samplePosition.x > 1.0 || samplePosition.y < 0.0 || samplePosition.y > 1.0)
        continue;
      if (int(texture2D(uPixelIndexMap, samplePosition).r * 255.0) == 0) {
        vec3 sampleColor = texture2D(uPreviousRender, samplePosition).rgb;
        float spatialWeight = exp(-length(offset) * 0.5);
        float colorWeight = exp(-length(sampleColor - texture2D(uPreviousRender, position / uResolution).rgb));
        float combinedWeight = spatialWeight * colorWeight;
        jitteredColor += sampleColor * combinedWeight;
        totalWeight += combinedWeight;
        hits++;
      }
    }

    if (hits > 0)
      jitteredColor /= totalWeight;
    else
      jitteredColor = texture2D(uPreviousRender, position / uResolution).rgb;

    float previousFrameBlend = 0.85;
    float jitteredBlend = 0.95;

    vec3 previousRenderColor = texture2D(uPreviousRender, position / uResolution).rgb;

    color = mix(color, previousRenderColor, previousFrameBlend);
    color = mix(color, jitteredColor, jitteredBlend);
  } else if (pixelIndex == 1) {
    float intensity = 0.0;
  
    for (int i = -1; i <= 1; i++) {
      for (int j = -1; j <= 1; j++) {
        vec2 offset = vec2(j, i);
        int samplePixelIndex = int(texture2D(uPixelIndexMap, (position + offset) / uResolution).r * 255.0);
        
        if (samplePixelIndex == 0 || samplePixelIndex == 2) {
          vec3 sampleColor = texture2D(uPreviousRender, (position + offset) / uResolution).rgb;
          intensity = max(intensity, length(sampleColor));
        }
      }
    }
    
    color = texture2D(uImage, position / uResolution).rgb * intensity;
  
  } else if (pixelIndex == 2) {
    color = texture2D(uImage, position / uResolution).rgb;
  }
        
  return color;
}

void main() {
  vec3 color = pass(gl_FragCoord.xy);

  gl_FragColor = vec4(color, 1.0);
}