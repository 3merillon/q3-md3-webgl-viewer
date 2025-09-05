#version 300 es
precision highp float;
precision highp sampler2D;
precision highp sampler2DShadow;

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vTexCoord;
in vec4 vLightSpacePos;
in vec3 vLocalPos; // NEW: object-space position

uniform sampler2D       UN_SAMP_TEXTURE;   // diffuse/albedo
uniform sampler2D       UN_SAMP_NORMAL;    // normal map (used for ground)
uniform sampler2DShadow UN_SAMP_SHADOW;    // hardware compare sampler
uniform sampler2D       UN_SAMP_GLOW;      // cigar glow map (additive stage)

uniform vec3  UN_VEC3_LIGHT_DIR;
uniform vec3  UN_VEC3_CAMERA_POS;
uniform bool  UN_BOOL_SHADOWS_ENABLED;

// Shadow tuning
uniform float UN_F32_SHADOW_INTENSITY;   // 0..1, how dark the shadow gets
uniform float UN_F32_SHADOW_BIAS;        // base depth bias
uniform float UN_F32_POISSON_RADIUS;     // poisson radius in texels

// Ground-only controls
uniform bool  UN_BOOL_IS_GROUND;
uniform float UN_F32_GROUND_FADE_RADIUS; // radius where fade begins
uniform float UN_F32_GROUND_FADE_WIDTH;  // width of fade band

// Material animation
uniform float UN_F32_TIME;               // global time (seconds)

// Special-case materials
uniform bool  UN_BOOL_IS_CIGAR;
uniform bool  UN_BOOL_IS_LASER;
uniform bool  UN_BOOL_IS_FLASH;          // NEW
uniform vec2  UN_VEC2_UV_SCROLL;
uniform float UN_F32_ADDITIVE_ALPHA;     // NEW: scales texture alpha for flashes

// NEW: laser fade parameters (in object space)
uniform vec3  UN_VEC3_LASER_AXIS;        // normalized axis in object space
uniform vec2  UN_VEC2_LASER_BOUNDS;      // min/max projection along axis in object space

out vec4 fragColor;

// One hardware filtered shadow tap (does 2x2 PCF internally when LINEAR)
float hwShadow(vec2 uv, float compareDepth) {
  return texture(UN_SAMP_SHADOW, vec3(uv, compareDepth));
}

vec2 texelSize() {
  return 1.0 / vec2(textureSize(UN_SAMP_SHADOW, 0));
}

// Cheap interleaved gradient noise for dithering (stable in screen space)
float ign(vec2 p) {
  return fract(52.9829189 * fract(p.x * 0.06711056 + p.y * 0.00583715));
}

float computeShadow(vec3 projCoord, vec3 N, vec3 L) {
  if (!UN_BOOL_SHADOWS_ENABLED) return 1.0;
  // Outside light frustum
  if (projCoord.z <= 0.0 || projCoord.z >= 1.0) return 1.0;

  // Fixed internal helpers (no UI)
  const float kSlopeBiasScale    = 1.0;  // scales (1-ndl)
  const float kReceiverBiasScale = 1.0;  // derivative-based bias scale
  const float kDitherStrength    = 0.35; // in texels

  // Base + slope-scaled bias (helps self-shadowing on grazing angles)
  float ndl = max(dot(N, L), 0.0);
  float bias = UN_F32_SHADOW_BIAS + UN_F32_SHADOW_BIAS * kSlopeBiasScale * (1.0 - ndl);

  // Receiver-plane depth bias using derivatives of light-space depth
  float dzdx = dFdx(projCoord.z);
  float dzdy = dFdy(projCoord.z);
  float rpb = kReceiverBiasScale * (abs(dzdx) + abs(dzdy));

  float depth = projCoord.z - (bias + rpb);

  // Poisson disk (16 taps) with per-fragment rotation and small uv dithering
  const vec2 poisson[16] = vec2[](
    vec2(-0.94201624, -0.39906216),
    vec2( 0.94558609, -0.76890725),
    vec2(-0.09418410, -0.92938870),
    vec2( 0.34495938,  0.29387760),
    vec2(-0.91588581,  0.45771432),
    vec2(-0.81544232, -0.87912464),
    vec2(-0.38277543,  0.27676845),
    vec2( 0.97484398,  0.75648379),
    vec2( 0.44323325, -0.97511554),
    vec2( 0.53742981, -0.47373420),
    vec2(-0.26496911, -0.41893023),
    vec2( 0.79197514,  0.19090188),
    vec2(-0.24188840,  0.99706507),
    vec2(-0.81409955,  0.91437590),
    vec2( 0.19984126,  0.78641367),
    vec2( 0.14383161, -0.14100790)
  );

  vec2 ts = texelSize();

  // Dither/jitter in uv to break up banding, scaled in texels
  float n0 = ign(gl_FragCoord.xy);
  float n1 = ign(gl_FragCoord.yx * 1.37);
  vec2 jitter = (vec2(n0, n1) - 0.5) * ts * kDitherStrength;

  // Per-fragment rotation to avoid patterns
  float rnd = fract(sin(dot(projCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float ang = rnd * 6.2831853;
  float s = sin(ang), c = cos(ang);
  mat2 R = mat2(c, -s, s, c);

  // Slight adapt by grazing angle
  float radius = UN_F32_POISSON_RADIUS * (1.0 + 0.75 * (1.0 - max(dot(N, L), 0.0))); // in texels

  float sum = 0.0;
  for (int i = 0; i < 16; ++i) {
    vec2 o = (R * poisson[i]) * ts * radius;
    sum += hwShadow(projCoord.xy + jitter + o, depth);
  }
  return sum / 16.0;
}

void main() {
  // Animated UVs (laser scroll)
  vec2 uv = vTexCoord + UN_VEC2_UV_SCROLL * UN_F32_TIME;
  vec4 texColor = texture(UN_SAMP_TEXTURE, uv);

  // Transparent additive passes (laser and muzzle flashes)
  if (UN_BOOL_IS_LASER || UN_BOOL_IS_FLASH) {
    float alpha = texColor.a;

    // Laser: fade along object-space axis irrespective of UV animation
    if (UN_BOOL_IS_LASER) {
      // Project local position onto provided axis and normalize into [0..1] using bounds
      vec3 axis = normalize(UN_VEC3_LASER_AXIS);
      float proj = dot(vLocalPos, axis);
      float t01 = clamp((proj - UN_VEC2_LASER_BOUNDS.x) / max(1e-6, (UN_VEC2_LASER_BOUNDS.y - UN_VEC2_LASER_BOUNDS.x)), 0.0, 1.0);

      // Start fading at 70% of the length, fully transparent at the end
      float fade = 1.0 - smoothstep(0.7, 1.0, t01);
      alpha *= fade;

      // Subtle core boost near the origin (does not change hue)
      float coreBoost = 1.0 + (1.0 - t01) * 0.35;
      texColor.rgb *= coreBoost;
    }

    // Scale alpha for flash to implement fade over time
    if (UN_BOOL_IS_FLASH) {
      alpha *= UN_F32_ADDITIVE_ALPHA;
    }

    if (alpha < 0.01) discard;

    // Fullbright additive (blending is handled in GL state by the caller)
    fragColor = vec4(texColor.rgb, alpha);
    return;
  }

  vec3 N = normalize(vNormal);

  // Normal mapping for ground
  if (UN_BOOL_IS_GROUND) {
    vec3 nTex = texture(UN_SAMP_NORMAL, uv).xyz * 2.0 - 1.0;
    mat3 TBN = mat3(
      vec3(1.0, 0.0, 0.0),
      vec3(0.0, 0.0, 1.0),
      vec3(0.0, 1.0, 0.0)
    );
    N = normalize(TBN * nTex);
  }

  vec3 L = normalize(-UN_VEC3_LIGHT_DIR);
  vec3 V = normalize(UN_VEC3_CAMERA_POS - vWorldPos);
  vec3 H = normalize(L + V);

  float diff = max(dot(N, L), 0.0);
  float spec = pow(max(dot(N, H), 0.0), 32.0);

  vec3 ambient = vec3(0.15);
  vec3 diffuse = diff * vec3(0.80);
  vec3 specular = spec * vec3(0.30);

  // Light-space projection -> [0,1]
  vec3 proj = vLightSpacePos.xyz / vLightSpacePos.w;
  proj = proj * 0.5 + 0.5;

  // Shadowing
  float lit = computeShadow(proj, N, L);

  // Apply shadow intensity control
  float shadowFactor = mix(1.0 - UN_F32_SHADOW_INTENSITY, 1.0, lit);

  vec3 lighting = ambient + (diffuse + specular) * shadowFactor;
  vec3 color = texColor.rgb * lighting;

  // Ground radial fade
  if (UN_BOOL_IS_GROUND) {
    float d = length(vWorldPos.xz);
    float fade = 1.0 - smoothstep(UN_F32_GROUND_FADE_RADIUS,
                                  UN_F32_GROUND_FADE_RADIUS + UN_F32_GROUND_FADE_WIDTH, d);
    color *= fade;
  }

  // Sarge cigar glow
  if (UN_BOOL_IS_CIGAR) {
    float t = UN_F32_TIME;
    float w1 = 0.25;
    float w2 = 0.32;
    float pulse1 = 0.5 * (sin(6.2831853 * w1 * t) + 1.0);
    float pulse2 = 0.5 * (sin(6.2831853 * w2 * t + 1.7) + 1.0);
    float base = 0.25;
    float amp  = 0.6;
    float noise = mix(0.95, 1.05, ign(gl_FragCoord.xy * 0.33 + t * 3.7));
    float pulse = clamp(base + amp * (0.75 * pulse1 + 0.25 * pulse2) * noise, 0.0, 1.0);

    vec3 glowTex = texture(UN_SAMP_GLOW, vTexCoord).rgb;
    float mask = dot(glowTex, vec3(0.299, 0.587, 0.114));
    vec3 warm = vec3(1.0, 0.45, 0.12);
    color += warm * mask * pulse;
    color = min(color, vec3(1.0));
  }

  fragColor = vec4(color, texColor.a);
}