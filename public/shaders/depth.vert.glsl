#version 300 es
precision highp float;

in vec3 IN0_VEC3_POSITION;
in vec3 IN1_VEC3_POSITION;

uniform mat4 UN_MAT4_LIGHT_VP;
uniform mat4 UN_MAT4_MODEL;
uniform float UN_F32_LERP;

void main() {
    vec3 pos = mix(IN0_VEC3_POSITION, IN1_VEC3_POSITION, UN_F32_LERP);
    gl_Position = UN_MAT4_LIGHT_VP * UN_MAT4_MODEL * vec4(pos, 1.0);
}