import * as THREE from 'three'

const SKINS = {
  standard: { metal: '#8a9096', wood: '#6b4b31', accent: '#d6a354', cloth: '#c47a3a' },
  night: { metal: '#2c3644', wood: '#1c2128', accent: '#7eb6d6', cloth: '#3d5c7a' },
  brass: { metal: '#b08d57', wood: '#4e3b2a', accent: '#e6c27a', cloth: '#a56b3c' }
}

function mat(color, rough = 0.55, metal = 0.2) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })
}

/** First-person weapon grouped so it sits in front of the camera. */
export function makeViewmodel(id, skinName = 'standard') {
  const skin = SKINS[skinName] || SKINS.standard
  const group = new THREE.Group()
  const metal = mat(skin.metal, 0.35, 0.75)
  const wood = mat(skin.wood, 0.8, 0.05)
  const accent = mat(skin.accent, 0.4, 0.4)
  const arm = mat('#d7b39a', 0.7, 0)
  const add = (w, h, d, x, y, z, material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
    mesh.position.set(x, y, z)
    mesh.castShadow = false
    group.add(mesh)
    return mesh
  }
  add(0.08, 0.08, 0.34, 0.16, -0.18, -0.28, arm)
  add(0.08, 0.08, 0.3, 0.02, -0.2, -0.22, arm)
  if (id === 'knife') {
    add(0.02, 0.045, 0.28, 0.1, -0.12, -0.48, metal)
    add(0.03, 0.05, 0.08, 0.1, -0.13, -0.32, wood)
  } else if (id === 'awp') {
    add(0.035, 0.04, 0.72, 0.1, -0.12, -0.62, metal)
    add(0.05, 0.06, 0.16, 0.1, -0.1, -0.42, wood)
    add(0.04, 0.05, 0.12, 0.1, -0.05, -0.48, accent)
  } else if (id === 'nova') {
    add(0.05, 0.05, 0.42, 0.08, -0.12, -0.48, metal)
    add(0.05, 0.05, 0.42, 0.13, -0.12, -0.48, metal)
    add(0.09, 0.07, 0.16, 0.1, -0.13, -0.3, wood)
  } else if (id === 'deagle' || id === 'glock' || id === 'usp' || id === 'p250') {
    add(0.04, 0.07, 0.22, 0.1, -0.12, -0.38, metal)
    add(0.03, 0.08, 0.08, 0.1, -0.18, -0.3, accent)
  } else if (id === 'he' || id === 'flash' || id === 'smoke' || id === 'molotov') {
    const color = id === 'flash' ? '#d8d2bf' : id === 'smoke' ? '#6d7670' : id === 'molotov' ? '#c4552a' : '#4d6a3a'
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), mat(color, 0.45, 0.1))
    ball.position.set(0.1, -0.12, -0.4)
    group.add(ball)
  } else if (id === 'c4') {
    add(0.12, 0.16, 0.22, 0.1, -0.14, -0.4, mat('#202124', 0.6, 0.3))
    add(0.02, 0.02, 0.02, 0.1, -0.05, -0.28, mat('#ff3b30', 0.4, 0.2))
  } else {
    add(0.035, 0.045, 0.5, 0.1, -0.12, -0.5, metal)
    add(0.05, 0.07, 0.18, 0.1, -0.13, -0.32, id === 'ak47' ? wood : metal)
    add(0.02, 0.08, 0.08, 0.1, -0.2, -0.28, accent)
  }
  group.userData.muzzle = new THREE.Vector3(0.1, -0.12, -0.78)
  return group
}

export function makeCharacter(team) {
  const group = new THREE.Group()
  const shirt = team === 'CT' ? '#3f5f7d' : '#c47a3a'
  const pants = team === 'CT' ? '#2a3138' : '#4a3b30'
  const head = team === 'CT' ? '#6d7c89' : '#e0b090'
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.7, 4, 8), mat(shirt, 0.7, 0.05))
  body.position.y = 0.95
  body.castShadow = true
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), mat(head, 0.45, 0.2))
  helm.position.y = 1.58
  helm.castShadow = true
  const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.35, 3, 6), mat(pants, 0.8, 0))
  const legR = legL.clone()
  legL.position.set(-0.1, 0.32, 0)
  legR.position.set(0.1, 0.32, 0)
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.45), mat('#222', 0.4, 0.6))
  gun.position.set(0.18, 1.15, 0.28)
  group.add(body, helm, legL, legR, gun)
  group.userData.parts = { body, helm, legL, legR, gun }
  return group
}

export { SKINS }
