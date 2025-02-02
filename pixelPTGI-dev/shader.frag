/* 
 * pixelPTGI by nulljcd
 *
 *
 *
 *
 *
 *
 *
 *
 *
 */

#version 120

// TODO: add reprojection
// TODO: add direct illumination

uniform vec2 uResolution;
uniform sampler2D uPreviousRender;
// uniform sampler2D uImage; // the image to sample pixel colors from
uniform sampler2D uPixelIndexMap;
uniform int uCounter;

#define numBounces 6
#define numRayCastSteps 250

#define numBlockIndexes 4

int pixelStates[numBlockIndexes] = int[](
  0,
  2,
  2,
  1
);

// temp array for testing
vec3 pixelColors[numBlockIndexes] = vec3[](
  vec3(1.0, 1.0, 1.0),
  vec3(1.0, 0.0, 0.0),
  vec3(0.0, 0.0, 1.0),
  vec3(1.0, 1.0, 1.0)
);

// https://www.shadertoy.com/view/4djSRW
vec2 hash23(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

vec2 gaussianRandom23(vec3 p3) {
  vec2 x = hash23(p3);
  float theta = x.y * 6.28318531;
  return sqrt(-2.0 * log(max(x.x, 1e-6))) * vec2(cos(theta), sin(theta));
}

vec3 pass(vec2 position) {
  vec3 color = vec3(0.1); // initial ambient light
  int pixelIndex = int(texture2D(uPixelIndexMap, position / uResolution).r * 255.0);
  int pixelState = pixelStates[pixelIndex];
  vec3 pixelColor = pixelColors[pixelIndex]; // TODO: replace pixelColors[pixelIndex] with uImage colors

  if (pixelState == 0) {
    vec3 incomingLight = vec3(0.0);
    vec3 rayColor = vec3(1.0);

    vec2 rayDirection = normalize(gaussianRandom23(vec3(position, uCounter)));
    vec2 rayPosition = position;

    bool completedPath = false;

    for (int i = 0; i < numBounces; i++) {
      // https://lodev.org/cgtutor/raycasting.html
      vec2 deltaDistance = vec2(
        rayDirection.x == 0.0 ? 1e5 : abs(1.0 / rayDirection.x),
        rayDirection.y == 0.0 ? 1e5 : abs(1.0 / rayDirection.y)
      );
      ivec2 moveStep = ivec2(sign(rayDirection));
      vec2 sideDistance = deltaDistance;
      bool hit = false;
      int side = 0;
      int hitPixelIndex = 0;
      int hitPixelState = 0;

      for (int j = 0; j < numRayCastSteps; j++) {
        if (sideDistance.x < sideDistance.y) {
          sideDistance.x += deltaDistance.x;
          rayPosition.x += moveStep.x;
          side = 0;
        } else {
          sideDistance.y += deltaDistance.y;
          rayPosition.y += moveStep.y;
          side = 1;
        }

        if (rayPosition.x < 0 || rayPosition.x >= uResolution.x || rayPosition.y < 0 || rayPosition.y >= uResolution.y) {
          completedPath = true;
          break;
        }

        hitPixelIndex = int(texture2D(uPixelIndexMap, rayPosition / uResolution).r * 255.0);
        hitPixelState = pixelStates[hitPixelIndex];

        if (hitPixelState == 0)
          continue;

        if (hitPixelState == 1) {
          rayColor *= pixelColors[hitPixelIndex]; // TODO: replace pixelColors[hitPixelIndex] with uImage colors

          vec2 normal = (side == 0) ? vec2(-rayDirection.x, 0.0) : vec2(0.0, -rayDirection.y);
          vec2 gaussianRandom = normalize(gaussianRandom23(vec3(position, uCounter + j + i + 1)));
          if (dot(gaussianRandom, normal) < 0.0)
              gaussianRandom = -gaussianRandom;
          vec2 diffuseDirection = normalize(normal + gaussianRandom);

          rayDirection = diffuseDirection;
          rayPosition += normal;
          break;
        }

        if (hitPixelState == 2) {
          vec3 emittedLight = pixelColors[hitPixelIndex];
          incomingLight += emittedLight * rayColor;
          completedPath = true;
          break;
        }
      }

      if (completedPath)
        break;
    }

    color += incomingLight;

    // denoising
    // https://www.shadertoy.com/view/ldKBzG
    // https://research.nvidia.com/sites/default/files/pubs/2020-07_Spatiotemporal-reservoir-resampling/ReSTIR.pdf
    vec3 jitteredColor = vec3(0.0);
    int hits = 0;
    float totalWeight = 0.0;

    for (int i = 0; i < 12; i++) {
      vec2 offset = hash23(vec3(position, uCounter * 4 + i)) * 3.0 - 1.5;
      vec2 samplePosition = (position + offset) / uResolution;
      if (samplePosition.x < 0.0 || samplePosition.x > 1.0 || samplePosition.y < 0.0 || samplePosition.y > 1.0)
        continue;
      int samplePixelIndex = int(texture2D(uPixelIndexMap, samplePosition).r * 255.0);
      if (pixelStates[samplePixelIndex] == 0) {
        vec3 sampleColor = texture2D(uPreviousRender, samplePosition).rgb;
        float spatialWeight = exp(-length(samplePosition - position / uResolution) / 3.0);
        float colorWeight = exp(-length(sampleColor));
        float combinedWeight = spatialWeight * colorWeight;
        jitteredColor += sampleColor * combinedWeight;
        hits++;
        totalWeight += combinedWeight;
      }
    }

    if (hits > 0)
      jitteredColor /= totalWeight;
    else
      jitteredColor = texture2D(uPreviousRender, position / uResolution).rgb;

    vec3 previousRenderColor = texture2D(uPreviousRender, position / uResolution).rgb;

    float currentBlend = 0.85;
    float jitteredBlend = 0.95;

    color = mix(color, previousRenderColor, currentBlend);
    color = mix(color, jitteredColor, jitteredBlend);

    // TODO: multiply color by image color
  } else if (pixelState == 1) {
    float intensity = 0.0;
    
    for (int i = -1; i <= 1; i++) {
      for (int j = -1; j <= 1; j++) {
        vec2 offset = vec2(j, i);
        int samplePixelIndex = int(texture2D(uPixelIndexMap, (position + offset) / uResolution).r * 255.0);
        if (pixelStates[samplePixelIndex] == 0 || pixelStates[samplePixelIndex] == 2) {
          vec3 sampleColor = texture2D(uPreviousRender, (position + offset) / uResolution).rgb;
          intensity = max(intensity, length(sampleColor));
        }
      }
    }

    color = pixelColor * intensity;
  } else if (pixelState == 2) {
    color = pixelColor;
  }

  return color;
}

void main()
{
  vec3 color = pass(gl_FragCoord.xy);

  gl_FragColor = vec4(color, 1.0);
}
