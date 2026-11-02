# Counter Sector 2

A browser bomb-defusal shooter. The simulation is authoritative, the camera is client-side, and bots plan on a worker so the frame stays free for rendering.

## Run

```bash
npm install
npm run dev
```

Open the local Vite URL, choose a side, and press **Deploy**. Click the view to capture the mouse.

Multiplayer:

```bash
npm run server
```

Then use **Multiplayer** in the menu (`ws://localhost:3099`). Empty slots stay bots. The server rewinds hit registration to the tick stamped on each shot.

```bash
npm run test:sim
```

## Controls

| Input | Action |
| --- | --- |
| WASD | Move |
| Mouse | Aim |
| Click | Fire |
| Right click | Aim / AWP zoom |
| Shift | Walk |
| Ctrl | Crouch |
| Space | Jump |
| R | Reload |
| 1–5 | Primary, pistol, knife, grenade, bomb |
| Q | Last weapon |
| G | Drop |
| E | Plant, defuse, or pick up |
| B | Buy menu |
| Tab | Scoreboard |
| Esc | Pause |

Buy only inside your spawn during the buy phase. Plant on the painted A or B site.

## What is in the match

- Sub-tick mouse samples decide the exact angle of a click inside a 64 Hz tick.
- Capsule movement with counter-strafe, crouch, jump, and a crouch-only vent.
- Rapier rays for world hits, with an AABB fallback, plus a mesh BVH for the visible level.
- Head, chest, stomach, and leg hitboxes, armor, helmets, recoil patterns, and spread.
- AK-47, M4A1, Galil, FAMAS, AWP, Nova, MAC-10, MP9, pistols, knife.
- HE, flash, smoke voxels that block vision and open when shot, molotov fire.
- Bomb plant, defuse kit timing, economy, loss bonus, halftime side swap.
- Bot behavior trees (buy, path, hold, trade, plant, defuse) with reaction delay.
- Kill feed, radar, damage direction, hit markers, scope, and a buy menu.
- Authoritative WebSocket server with client prediction replay and snapshot interpolation.

Movement is a deterministic capsule slide so prediction can replay inputs. Rapier is the raycast world. The navigation graph is baked from walkable surfaces on de_sector rather than a separate Recast package, so the map loads without an extra native mesh compiler.
