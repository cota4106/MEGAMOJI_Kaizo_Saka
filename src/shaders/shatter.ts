import { WebGLEffect } from "../types";
import { webglEffectShader, webglLoadEffectShader, webglSetFloat } from "../utils/webgl";
import shaderShatter from "../shaders/shatter.glsl";

const shader = webglEffectShader(shaderShatter.sourceCode);

const webglShatter: WebGLEffect = (keyframe, width, height, params = {}) => {
  const { gridSize = 10, strength = 0.8 } = params;
  const program = webglLoadEffectShader(shader);
  webglSetFloat(program, "keyframe", keyframe);
  webglSetFloat(program, "gridSize", gridSize);
  webglSetFloat(program, "strength", strength);
  return program;
};

export default webglShatter;
