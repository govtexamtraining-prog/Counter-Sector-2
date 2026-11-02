import * as THREE from 'three'
import { makeCharacter, makeViewmodel } from './weapons3d.js'

const _look = new THREE.Vector3()
const _proj = new THREE.Vector3()

/**
 * Syncs the simulation (or a network snapshot) to meshes, viewmodels, and decals.
 * @param {ReturnType<import('./engine.js').createEngine>} engine
 */
export function createView(engine) {
  const { scene, camera, sun } = engine
  const actors = new Map()
  const viewmodels = new Map()
  let currentWeapon = ''
  let skin = 'standard'
  const viewRig = new THREE.Group()
  camera.add(viewRig)
  scene.add(camera)
  viewRig.position.set(0.18, -0.22, -0.42)

  const bomb = new THREE.Group()
  const bombBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.16, 0.48),
    new THREE.MeshStandardMaterial({ color: '#1b1c1f', roughness: 0.55, metalness: 0.4 })
  )
  const led = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.04, 0.04),
    new THREE.MeshBasicMaterial({ color: '#ff2a1a' })
  )
  led.position.set(0, 0.1, 0.16)
  const lamp = new THREE.PointLight('#ff4422', 0, 6, 2)
  lamp.position.y = 0.3
  bomb.add(bombBody, led, lamp)
  scene.add(bomb)

  const nadeGeo = new THREE.SphereGeometry(0.09, 10, 8)
  const nadeMat = {
    he: new THREE.MeshStandardMaterial({ color: '#4e6b38' }),
    flash: new THREE.MeshStandardMaterial({ color: '#ddd6c4' }),
    smoke: new THREE.MeshStandardMaterial({ color: '#66706a' }),
    molotov: new THREE.MeshStandardMaterial({ color: '#c4552a' })
  }
  const nadeMeshes = []

  const pickupMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.35, 0.12, 0.12),
    new THREE.MeshStandardMaterial({ color: '#9aa3a8', metalness: 0.6, roughness: 0.35 }),
    24
  )
  pickupMesh.count = 0
  scene.add(pickupMesh)
  const dummy = new THREE.Object3D()

  const decals = []
  const decalGeo = new THREE.PlaneGeometry(0.12, 0.12)
  const decalMat = new THREE.MeshBasicMaterial({ color: '#1a120e', transparent: true, opacity: 0.85, depthWrite: false })
  const tracers = []

  const spec = { on: false, anchor: new THREE.Vector3() }
  let kick = 0

  function actor(p) {
    let group = actors.get(p.id)
    if (!group) {
      group = makeCharacter(p.team)
      group.userData.draw = new THREE.Vector3()
      group.userData.ready = false
      scene.add(group)
      actors.set(p.id, group)
    }
    return group
  }

  function weaponMesh(id) {
    if (!viewmodels.has(id)) viewmodels.set(id, makeViewmodel(id, skin))
    return viewmodels.get(id)
  }

  return {
    setSkin(name) {
      skin = name || 'standard'
      for (const mesh of viewmodels.values()) viewRig.remove(mesh)
      viewmodels.clear()
      currentWeapon = ''
    },
    absorb(events) {
      for (const event of events || []) {
        if (event.type !== 'shot' || !event.end) continue
        if (event.id === 'local') kick = 1
        const origin = event.origin || event.end
        const lineGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(origin.x, origin.y, origin.z),
          new THREE.Vector3(event.end.x, event.end.y, event.end.z)
        ])
        const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#ffe1a8', transparent: true, opacity: 0.7 }))
        line.userData.life = 0.06
        scene.add(line)
        tracers.push(line)
        if (!event.hit && event.normal) {
          const decal = new THREE.Mesh(decalGeo, decalMat.clone())
          decal.position.set(event.end.x, event.end.y, event.end.z)
          decal.lookAt(
            event.end.x + event.normal.x,
            event.end.y + event.normal.y,
            event.end.z + event.normal.z
          )
          decal.position.addScaledVector(new THREE.Vector3(event.normal.x, event.normal.y, event.normal.z), 0.02)
          scene.add(decal)
          decals.push(decal)
          if (decals.length > 48) {
            const old = decals.shift()
            scene.remove(old)
            old.material.dispose()
          }
        }
      }
    },
    /**
     * @param {object} frame
     * @param {number} dt
     * @param {{yaw:number,pitch:number}} freeLook
     */
    update(frame, dt, freeLook) {
      const local = frame.players.find((p) => p.id === frame.localId)
      const aliveIds = new Set(frame.players.map((p) => p.id))
      for (const [id, group] of actors) {
        if (!aliveIds.has(id)) {
          scene.remove(group)
          actors.delete(id)
        }
      }

      for (const p of frame.players) {
        const group = actor(p)
        const draw = group.userData.draw
        if (!group.userData.ready || Math.hypot(draw.x - p.pos.x, draw.z - p.pos.z) > 6) {
          draw.set(p.pos.x, p.pos.y, p.pos.z)
          group.userData.ready = true
        } else if (p.id === frame.localId) {
          draw.set(p.pos.x, p.pos.y, p.pos.z)
        } else {
          const k = 1 - Math.exp(-16 * dt)
          draw.x += (p.pos.x - draw.x) * k
          draw.y += (p.pos.y - draw.y) * k
          draw.z += (p.pos.z - draw.z) * k
        }
        group.position.copy(draw)
        group.rotation.y = p.lookYaw
        const crouch = p.height < 1.45
        group.scale.set(1, crouch ? 0.72 : 1, 1)
        group.visible = !(p.id === frame.localId && p.alive)
      }

      if (local?.alive) {
        spec.on = false
        const eyeY = local.pos.y + local.height - 0.18
        camera.rotation.order = 'YXZ'
        camera.position.set(local.pos.x, eyeY, local.pos.z)
        camera.rotation.y = local.lookYaw + (local.punchYaw || 0) + Math.PI
        camera.rotation.x = (local.lookPitch || 0) + (local.punchPitch || 0)
        const bob = Math.hypot(local.vel?.x || 0, local.vel?.z || 0)
        viewRig.position.y = -0.22 + Math.sin(frame.time * 9) * bob * 0.004
        viewRig.position.x = 0.18 + Math.cos(frame.time * 6) * bob * 0.003
        kick = Math.max(0, kick - dt * 8)
        viewRig.position.z = -0.42 - kick * 0.06
        const weapon = local.weapon || 'knife'
        if (weapon !== currentWeapon) {
          if (currentWeapon && viewmodels.get(currentWeapon)) viewRig.remove(viewmodels.get(currentWeapon))
          currentWeapon = weapon
          viewRig.add(weaponMesh(weapon))
        }
        viewRig.visible = !local.scoped
        const fov = local.scoped === 2 ? 18 : local.scoped === 1 ? 40 : 75
        if (Math.abs(camera.fov - fov) > 0.1) {
          camera.fov = fov
          camera.updateProjectionMatrix()
        }
      } else if (local) {
        if (!spec.on) {
          spec.on = true
          spec.anchor.set(local.pos.x, local.pos.y + 1.4, local.pos.z)
        }
        camera.position.copy(spec.anchor)
        camera.rotation.y = freeLook.yaw + Math.PI
        camera.rotation.x = freeLook.pitch
        viewRig.visible = false
        if (camera.fov !== 75) {
          camera.fov = 75
          camera.updateProjectionMatrix()
        }
      }

      sun.position.set((local?.pos.x || 0) + 22, 40, (local?.pos.z || 0) + 8)
      sun.target.position.set(local?.pos.x || 0, 0, local?.pos.z || 0)
      sun.target.updateMatrixWorld()

      const bombState = frame.bomb
      const showBomb = bombState && (bombState.state === 'dropped' || bombState.state === 'planted' || bombState.state === 'defused')
      bomb.visible = !!showBomb
      if (showBomb) {
        bomb.position.set(bombState.pos.x, 0.12, bombState.pos.z)
        const blink = bombState.state === 'planted' ? 0.5 + 0.5 * Math.sin(frame.time * (8 + (40 - (bombState.timer || 40)))) : 0.2
        led.material.color.setScalar(1)
        lamp.intensity = bombState.state === 'planted' ? blink * 2.2 : 0
      }

      while (nadeMeshes.length < frame.grenades.length) {
        const mesh = new THREE.Mesh(nadeGeo, nadeMat.he)
        scene.add(mesh)
        nadeMeshes.push(mesh)
      }
      nadeMeshes.forEach((mesh, i) => {
        const g = frame.grenades[i]
        mesh.visible = !!g
        if (!g) return
        mesh.material = nadeMat[g.kind] || nadeMat.he
        mesh.position.set(g.pos.x, g.pos.y, g.pos.z)
      })

      const picks = frame.pickups || []
      picks.slice(0, 24).forEach((item, i) => {
        dummy.position.set(item.pos.x, 0.2, item.pos.z)
        dummy.rotation.set(0, frame.time, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        pickupMesh.setMatrixAt(i, dummy.matrix)
      })
      pickupMesh.count = Math.min(24, picks.length)
      pickupMesh.instanceMatrix.needsUpdate = true

      engine.smoke.sync(frame.smokes || [])
      engine.fire.sync(frame.fires || [])

      for (let i = tracers.length - 1; i >= 0; i--) {
        tracers[i].userData.life -= dt
        tracers[i].material.opacity = Math.max(0, tracers[i].userData.life / 0.06)
        if (tracers[i].userData.life <= 0) {
          scene.remove(tracers[i])
          tracers[i].geometry.dispose()
          tracers.splice(i, 1)
        }
      }

      let smokeVis = 0
      const eye = camera.position
      for (const smoke of frame.smokes || []) {
        for (const cell of smoke.cells) {
          const d = Math.hypot(cell.x - eye.x, cell.y - eye.y, cell.z - eye.z)
          if (d < 0.9) smokeVis = Math.max(smokeVis, cell.d * (1 - d / 0.9))
        }
      }
      engine.grade.uniforms.smoke.value = smokeVis
      engine.grade.uniforms.flash.value = local?.flash || 0
      engine.grade.uniforms.damage.value = local?.alive ? local.hurt || 0 : 0
    },
    labels(frame) {
      const out = []
      const local = frame.players.find((p) => p.id === frame.localId)
      if (!local?.alive) return out
      for (const p of frame.players) {
        if (!p.alive || p.id === local.id || p.team !== local.team) continue
        _proj.set(p.pos.x, p.pos.y + p.height + 0.25, p.pos.z).project(camera)
        if (_proj.z > 1) continue
        out.push({
          name: p.name,
          hp: Math.max(0, Math.min(100, p.health)),
          x: (_proj.x * 0.5 + 0.5) * 100,
          y: (-_proj.y * 0.5 + 0.5) * 100
        })
      }
      return out
    },
    cinematic(time) {
      const ang = time * 0.12
      camera.position.set(Math.sin(ang) * 26, 16, Math.cos(ang) * 18)
      _look.set(0, 1.2, -4)
      camera.lookAt(_look)
      camera.fov = 55
      camera.updateProjectionMatrix()
      viewRig.visible = false
      engine.grade.uniforms.flash.value = 0
      engine.grade.uniforms.damage.value = 0
      engine.grade.uniforms.smoke.value = 0
    }
  }
}
