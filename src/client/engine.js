import * as THREE from 'three'
import { MAP } from '../sim/map.js'
import { createComposer } from './renderer/postprocess.js'
import { buildBvhMesh } from './renderer/bvh.js'
import { createFireField, createSmokeField } from './renderer/smokeShader.js'

function noiseTexture(base, speck, size = 128) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = speck
    ctx.globalAlpha = Math.random() * 0.35
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2)
  }
  ctx.globalAlpha = 1
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function materialFor(kind) {
  const maps = {
    floor: noiseTexture('#b7a078', '#8c734c'),
    wall: noiseTexture('#d7c3a1', '#b79a74'),
    crate: noiseTexture('#8a5a32', '#5c3a1e'),
    stair: noiseTexture('#9a907f', '#6e675c'),
    metal: noiseTexture('#5c656c', '#3e464c'),
    pillar: noiseTexture('#cbb892', '#9a8664'),
    sign: noiseTexture('#243042', '#d6a354'),
    antenna: noiseTexture('#4a4038', '#2a241f')
  }
  const map = maps[kind] || maps.wall
  map.repeat.set(kind === 'floor' ? 8 : 2, kind === 'floor' ? 8 : 2)
  const rough = kind === 'metal' ? 0.35 : 0.86
  const metalness = kind === 'metal' ? 0.65 : 0.02
  return new THREE.MeshStandardMaterial({ map, roughness: rough, metalness })
}

/**
 * WebGL2 scene, dusty lighting, and the sector mesh.
 */
export function createEngine() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.domElement.className = 'game-canvas'

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#9eb4c4')
  scene.fog = new THREE.Fog('#c8b79a', 28, 78)

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 200)
  camera.rotation.order = 'YXZ'

  const hemi = new THREE.HemisphereLight('#d5e4ee', '#8a7355', 0.72)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight('#ffe2b0', 1.35)
  sun.position.set(28, 42, 12)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 120
  sun.shadow.camera.left = -40
  sun.shadow.camera.right = 40
  sun.shadow.camera.top = 40
  sun.shadow.camera.bottom = -40
  scene.add(sun, sun.target)

  const library = {}
  const props = new THREE.Group()
  const addBox = (entry, shadow) => {
    if (entry.mat === 'ceil') return
    const sx = entry.max[0] - entry.min[0]
    const sy = entry.max[1] - entry.min[1]
    const sz = entry.max[2] - entry.min[2]
    if (!library[entry.mat]) library[entry.mat] = materialFor(entry.mat)
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), library[entry.mat])
    mesh.position.set(
      (entry.min[0] + entry.max[0]) / 2,
      (entry.min[1] + entry.max[1]) / 2,
      (entry.min[2] + entry.max[2]) / 2
    )
    mesh.castShadow = shadow
    mesh.receiveShadow = true
    props.add(mesh)
  }
  for (const solid of MAP.solids) addBox(solid, solid.mat !== 'floor')
  for (const decor of MAP.decor) addBox(decor, true)

  const siteMat = (color) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, transparent: true, opacity: 0.55 })
  for (const [id, site] of Object.entries(MAP.sites)) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(site.maxX - site.minX, site.maxZ - site.minZ),
      siteMat(id === 'A' ? '#6f8f62' : '#b58145')
    )
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set((site.minX + site.maxX) / 2, 0.025, (site.minZ + site.maxZ) / 2)
    mesh.receiveShadow = true
    props.add(mesh)
  }
  scene.add(props)

  const bvhMesh = buildBvhMesh(MAP.solids.filter((s) => s.mat !== 'ceil'))
  const smoke = createSmokeField()
  const fire = createFireField()
  scene.add(smoke.mesh, fire.mesh)

  const { composer, grade } = createComposer(renderer, scene, camera)

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
    composer.setSize(window.innerWidth, window.innerHeight)
  }
  window.addEventListener('resize', onResize)

  /**
   * Client-only graphics budget. Never sent to the match server.
   * Phones keep the heavy draw/AI memory locally and leave the host thin.
   * @param {'auto'|'high'|'mobile'} mode
   */
  function applyQuality(mode = 'auto') {
    const coarse =
      mode === 'mobile' ||
      (mode === 'auto' &&
        (('ontouchstart' in window && (navigator.maxTouchPoints || 0) > 0) ||
          window.matchMedia('(pointer: coarse)').matches ||
          Math.min(window.innerWidth, window.innerHeight) < 820))
    const ratio = coarse ? Math.min(window.devicePixelRatio || 1, 1.1) : Math.min(window.devicePixelRatio || 1, 1.5)
    renderer.setPixelRatio(ratio)
    renderer.shadowMap.enabled = !coarse
    sun.castShadow = !coarse
    sun.shadow.mapSize.set(coarse ? 512 : 2048, coarse ? 512 : 2048)
    scene.fog.near = coarse ? 18 : 28
    scene.fog.far = coarse ? 58 : 78
    for (const mesh of props.children) {
      mesh.castShadow = !coarse && mesh.receiveShadow
      mesh.receiveShadow = true
    }
    onResize()
    return coarse ? 'mobile' : 'high'
  }

  applyQuality('auto')

  return {
    renderer,
    scene,
    camera,
    sun,
    composer,
    grade,
    bvhMesh,
    smoke,
    fire,
    props,
    applyQuality,
    dispose() {
      window.removeEventListener('resize', onResize)
      renderer.dispose()
    }
  }
}
