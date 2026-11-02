import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    flash: { value: 0 },
    damage: { value: 0 },
    smoke: { value: 0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float flash;
    uniform float damage;
    uniform float smoke;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float luma = dot(color.rgb, vec3(0.30, 0.45, 0.25));
      color.rgb = mix(color.rgb, vec3(luma), 0.06);
      color.rgb = pow(max(color.rgb, 0.0), vec3(0.94));
      vec2 p = vUv - 0.5;
      float vig = smoothstep(0.85, 0.28, length(p));
      color.rgb *= mix(0.62, 1.0, vig);
      float edge = smoothstep(0.05, 0.55, length(p));
      color.rgb = mix(color.rgb, vec3(0.55, 0.05, 0.03), clamp(damage, 0.0, 1.0) * edge);
      color.rgb = mix(color.rgb, vec3(0.62, 0.64, 0.63), clamp(smoke, 0.0, 0.92));
      color.rgb = mix(color.rgb, vec3(1.0), clamp(flash, 0.0, 1.0));
      gl_FragColor = color;
    }
  `
}

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 */
export function createComposer(renderer, scene, camera) {
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const grade = new ShaderPass(GradeShader)
  composer.addPass(grade)
  return { composer, grade }
}
