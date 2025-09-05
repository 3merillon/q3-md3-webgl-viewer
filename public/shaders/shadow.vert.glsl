#version 300 es
precision highp float;

// Frame A attributes
in vec3 IN0_VEC3_POSITION;
in vec3 IN0_VEC3_NORMAL;

// Frame B attributes  
in vec3 IN1_VEC3_POSITION;
in vec3 IN1_VEC3_NORMAL;

// Shared
in vec2 IN_VEC2_ST;

uniform mat4 UN_MAT4_PROJECTION;
uniform mat4 UN_MAT4_MODELVIEW;
uniform mat4 UN_MAT4_MODEL;
uniform mat4 UN_MAT4_LIGHT_VP; // Light view-projection matrix
uniform mat4 UN_MAT4_NORMAL;   // Normal matrix

uniform float UN_F32_LERP;

out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vTexCoord;
out vec4 vLightSpacePos;
// NEW: local (object-space) position used for laser fade
out vec3 vLocalPos;

void main() {
    // Linear blend positions and normals
    vec3 pos = mix(IN0_VEC3_POSITION, IN1_VEC3_POSITION, UN_F32_LERP);
    vec3 nrm = mix(IN0_VEC3_NORMAL, IN1_VEC3_NORMAL, UN_F32_LERP);
    
    // Transform to world space
    vec4 worldPos = UN_MAT4_MODEL * vec4(pos, 1.0);
    vWorldPos = worldPos.xyz;
    
    // Transform normal
    vNormal = normalize((UN_MAT4_NORMAL * vec4(nrm, 0.0)).xyz);
    
    vTexCoord = IN_VEC2_ST;
    vLocalPos = pos; // object-space position for stable laser fade

    // Light space position for shadow mapping
    vLightSpacePos = UN_MAT4_LIGHT_VP * worldPos;
    
    gl_Position = UN_MAT4_PROJECTION * UN_MAT4_MODELVIEW * worldPos;
}