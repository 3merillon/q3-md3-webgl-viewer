export async function loadShaders(gl) {
  const shaderFiles = [
    { name: 'shadow.vert', type: 'vertex' },
    { name: 'shadow.frag', type: 'fragment' },
    { name: 'depth.vert', type: 'vertex' },
    { name: 'depth.frag', type: 'fragment' }
  ];

  const shaderSources = {};
  
  // Load all shader files
  await Promise.all(
    shaderFiles.map(async ({ name, type }) => {
      const response = await fetch(`/shaders/${name}.glsl`);
      shaderSources[name] = await response.text();
    })
  );

  // Create shaders
  const shadowVert = createShader(gl, gl.VERTEX_SHADER, shaderSources['shadow.vert']);
  const shadowFrag = createShader(gl, gl.FRAGMENT_SHADER, shaderSources['shadow.frag']);
  const depthVert = createShader(gl, gl.VERTEX_SHADER, shaderSources['depth.vert']);
  const depthFrag = createShader(gl, gl.FRAGMENT_SHADER, shaderSources['depth.frag']);

  // Create programs
  const shadowProgram = createProgram(gl, shadowVert, shadowFrag);
  const depthProgram = createProgram(gl, depthVert, depthFrag);

  return { 
    shadow: shadowProgram,
    depth: depthProgram
  };
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

function createProgram(gl, vertShader, fragShader) {
  const program = gl.createProgram();
  gl.attachShader(program, vertShader);
  gl.attachShader(program, fragShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    throw new Error(gl.getProgramInfoLog(program));
  }
  return program;
}