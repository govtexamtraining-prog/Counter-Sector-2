import * as THREE from 'three'

const vertexShader = `
  attribute float density;
  varying float vDensity;
  varying vec2 vUv;
  void main() {
    vDensity = density;
    vUv = uv;
    vec4 center = viewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float size = 0.85 + density * 0.9;
    center.xy += position.xy * size;
    gl_Position = projectionMatrix * center;
  }
`

const fragmentShader = `
  varying float vDensity;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = dot(p, p);
    float alpha = smoothstep(1.0, 0.2, r) * vDensity * 0.42;
    if (alpha < 0.02) discard;
    vec3 col = mix(vec3(0.55, 0.57, 0.54), vec3(0.78, 0.79, 0.74), vDensity);
    gl_FragColor = vec4(col, alpha);
  }
`

/**
 * Billboard smoke quads. Densities are written from the voxel field each frame.
 * @param {number} [capacity]
 */
export function createSmokeField(capacity = 420) {
  const geo = new THREE.PlaneGeometry(1, 1)
  const density = new Float32Array(capacity)
  geo.setAttribute('density', new THREE.InstancedBufferAttribute(density, 1))
  const material = new THREE.ShaderMaterial({
    uniforms: {},
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false
  })
  const mesh = new THREE.InstancedMesh(geo, material, capacity)
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.count = 0
  mesh.frustumCulled = false
  mesh.renderOrder = 2
  const dummy = new THREE.Object3D()

  return {
    mesh,
    /**
     * @param {{cells:{x:number,y:number,z:number,d:number}[]}[]} smokes
     */
    sync(smokes) {
      let i = 0
      for (const smoke of smokes) {
        for (const cell of smoke.cells) {
          if (i >= capacity) break
          dummy.position.set(cell.x, cell.y, cell.z)
          dummy.rotation.set(0, 0, 0)
          dummy.scale.set(1, 1, 1)
          dummy.updateMatrix()
          mesh.setMatrixAt(i, dummy.matrix)
          density[i] = cell.d
          i++
        }
      }
      mesh.count = i
      geo.getAttribute('density').needsUpdate = true
      mesh.instanceMatrix.needsUpdate = true
    }
  }
}

/** Flat fire discs for molotov volumes. */
export function createFireField() {
  const mesh = new THREE.InstancedMesh(
    new THREE.CircleGeometry(1, 14),
    new THREE.MeshBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: 0.55, depthWrite: false }),
    16
  )
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.count = 0
  const dummy = new THREE.Object3D()
  return {
    mesh,
    sync(fires) {
      fires.slice(0, 16).forEach((fire, i) => {
        dummy.position.set(fire.pos.x, 0.08, fire.pos.z)
        dummy.rotation.set(-Math.PI / 2, 0, 0)
        dummy.scale.setScalar(fire.radius)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      })
      mesh.count = Math.min(16, fires.length)
      mesh.instanceMatrix.needsUpdate = true
    }
  }
}
