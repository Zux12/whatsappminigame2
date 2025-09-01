// main.js (drop-in replacement)
// ES module; imports Three + examples via CDN.
// If you already have your own Three build, you can swap these imports later.

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { EffectComposer } from 'https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js';

// ---------- DOM refs (match your index.html) ----------
const timeEl = document.getElementById('time');
const scoreEl = document.getElementById('score');
const pauseBtn = document.getElementById('pause');

const overlay = document.getElementById('overlay');
const resumeBtn = document.getElementById('resume');
const restartBtn = document.getElementById('restart');

const gameover = document.getElementById('gameover');
const againBtn = document.getElementById('again');
const finalTime = document.getElementById('finalTime');
const finalScore = document.getElementById('finalScore');

// ---------- Renderer / Scene / Camera ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x0a0f18, 1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

// Camera: behind & slightly above player, facing forward down corridor
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.02, 1000);
camera.position.set(0, 0.9, 2.2);
scene.add(camera);

// Basic hemisphere + directional lights for physical cues (glow handled by bloom)
const hemi = new THREE.HemisphereLight(0x96c6ff, 0x0b1220, 0.5);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 0.7);
dir.position.set(1, 2, 1);
scene.add(dir);

// ---------- Postprocessing (Bloom for neon edges) ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.8,   // strength
  0.9,   // radius
  0.01   // threshold
);
composer.addPass(bloomPass);

// ---------- Corridor ----------
function makeCorridor() {
  // Long tunnel: we’ll cheat with 2 segments that recycle
  const group = new THREE.Group();
  const length = 30;
  const width = 6;
  const height = 3.6;

  function panel(zOffset) {
    const g = new THREE.BoxGeometry(width, height, length);
    const m = new THREE.MeshStandardMaterial({
      color: 0x0f1724,
      roughness: 0.95,
      metalness: 0.05
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.z = zOffset;
    mesh.receiveShadow = true;
    return mesh;
  }

  const a = panel(-length * 0.5);
  const b = panel(-length * 1.5);
  group.add(a, b);

  group.userData = { length, segments: [a, b] };

  // Soft cyan ribs on walls for speed sensation
  const ribs = new THREE.Group();
  for (let i = 0; i < 24; i++) {
    const z = -i * 1.2;
    const geom = new THREE.BoxGeometry(0.04, height * 0.9, 0.05);
    const mat = new THREE.MeshBasicMaterial({ color: 0x71e1ff });
    const left = new THREE.Mesh(geom, mat);
    left.position.set(-width * 0.5 + 0.05, 0, z);
    const right = left.clone();
    right.position.x = width * 0.5 - 0.05;
    ribs.add(left, right);
  }
  group.add(ribs);

  group.tick = (dz) => {
    for (const seg of group.userData.segments) {
      seg.position.z += dz;
      if (seg.position.z > camera.position.z + length * 0.5) {
        seg.position.z -= length * 2.0; // recycle backwards
      }
    }
    for (const rib of ribs.children) {
      rib.position.z += dz;
      if (rib.position.z > camera.position.z + 1.0) {
        rib.position.z -= 24 * 1.2; // recycle rib
      }
    }
  };

  return group;
}
const corridor = makeCorridor();
scene.add(corridor);

// ---------- Player (Spaceship) ----------
function makeShip() {
  const group = new THREE.Group();

  // Fuselage: wedge (cone) pointing forward (−Z)
  const fuselageGeo = new THREE.ConeGeometry(0.15, 0.5, 12, 1, false);
  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x1a2436,
    roughness: 0.9,
    metalness: 0.08,
    emissive: 0x000000
  });
  const fuselage = new THREE.Mesh(fuselageGeo, hullMat);
  fuselage.rotation.x = Math.PI / 2; // cone points -Z
  fuselage.position.z = 0;
  group.add(fuselage);

  // Wings: thin boxes
  const wingGeo = new THREE.BoxGeometry(0.26, 0.02, 0.18);
  const wing = new THREE.Mesh(wingGeo, hullMat);
  wing.position.set(0, -0.04, -0.12);
  group.add(wing);

  // Neon edge strips (simple planes w/ emissive)
  const stripGeo = new THREE.BoxGeometry(0.02, 0.02, 0.36);
  const neonMat = new THREE.MeshBasicMaterial({ color: 0x71e1ff });
  const stripL = new THREE.Mesh(stripGeo, neonMat);
  stripL.position.set(-0.08, 0.03, -0.1);
  const stripR = stripL.clone();
  stripR.position.x = 0.08;
  group.add(stripL, stripR);

  // Engine glow: small emissive ring (sprite-like)
  const engineGeo = new THREE.RingGeometry(0.03, 0.06, 24);
  const engineMat = new THREE.MeshBasicMaterial({ color: 0x71e1ff, side: THREE.DoubleSide });
  const engine = new THREE.Mesh(engineGeo, engineMat);
  engine.rotation.x = Math.PI / 2;
  engine.position.set(0, 0, 0.24);
  group.add(engine);

  group.position.set(0, 0, 0);
  group.userData = {
    vx: 0, vy: 0,
    bank: 0, // visual tilt
    speed: 6.0,
    width: 6.0,
    height: 3.6
  };

  // For collision: capsule-ish bounds (radius/halfHeight)
  group.userData.hit = { r: 0.11, h: 0.12 };

  group.tick = (dt, input) => {
    const u = group.userData;
    // Input target velocities from drag
    const accel = 8.5;
    u.vx += (input.tx - group.position.x) * accel * dt;
    u.vy += (input.ty - group.position.y) * accel * dt;

    // Damping
    u.vx *= 0.92;
    u.vy *= 0.92;

    // Integrate
    group.position.x += u.vx * dt;
    group.position.y += u.vy * dt;

    // Clamp to corridor bounds
    const xMax = (u.width * 0.5) - 0.35;
    const yMax = (u.height * 0.5) - 0.35;
    group.position.x = Math.max(-xMax, Math.min(xMax, group.position.x));
    group.position.y = Math.max(-yMax, Math.min(yMax, group.position.y));

    // Bank visual (tilt on X-velocity)
    const targetBank = THREE.MathUtils.clamp(-u.vx * 0.25, -0.35, 0.35);
    u.bank += (targetBank - u.bank) * 8 * dt;
    group.rotation.z = u.bank;

    // Gentle breathing pulse on neon strips
    const pulse = 0.5 + 0.5 * Math.sin(perfTime * 2.8);
    neonMat.color.setHSL(0.53, 0.7, 0.45 + 0.15 * pulse); // around cyan
    engine.scale.setScalar(1.0 + 0.15 * pulse);
  };

  return group;
}
const ship = makeShip();
scene.add(ship);

// ---------- Meteors ----------
const meteors = [];
const meteorPool = [];

function noise3(p) {
  // CPU-side pseudo noise for seeding only; (actual crack glow is shader-based).
  return Math.sin(p.x * 12.9898 + p.y * 78.233 + p.z * 37.719) * 43758.5453 % 1;
}

function makeMeteorMaterial() {
  // Custom shader to create vein-like emissive cracks from noise
  const base = new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 1.0,
    metalness: 0.0,
    emissive: 0x000000
  });

  base.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uEmissiveColor = { value: new THREE.Color(0x71e1ff) };
    shader.uniforms.uEmissiveAmp = { value: 1.8 };

    // 3D noise (simplex-ish) for veins
    const noiseGLSL = `
    vec3 mod289(vec3 x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
    vec4 mod289(vec4 x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
    vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
    vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
    float snoise(vec3 v){
      const vec2 C = vec2(1.0/6.0, 1.0/3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i  = floor(v + dot(v, C.yyy) );
      vec3 x0 = v - i + dot(i, C.xxx) ;
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min( g.xyz, l.zxy );
      vec3 i2 = max( g.xyz, l.zxy );
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;
      i = mod289(i);
      vec4 p = permute( permute( permute(
                 i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
               + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
               + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
      float n_ = 0.142857142857;
      vec3  ns = n_ * D.wyz - D.xzx;
      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_ );
      vec4 x = x_ *ns.x + ns.yyyy;
      vec4 y = y_ *ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
      vec4 b0 = vec4( x.xy, y.xy );
      vec4 b1 = vec4( x.zw, y.zw );
      vec4 s0 = floor(b0)*2.0 + 1.0;
      vec4 s1 = floor(b1)*2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
      vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
      vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
      vec3 p0 = vec3(a0.xy,h.x);
      vec3 p1 = vec3(a1.xy,h.y);
      vec3 p2 = vec3(a1.zw,h.z);
      vec3 p3 = vec3(a0.zw,h.w);
      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
      p0 *= norm.x;
      p1 *= norm.y;
      p2 *= norm.z;
      p3 *= norm.w;
      vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1),
                              dot(x2,x2), dot(x3,x3)), 0.0);
      m = m*m;
      return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
                                     dot(p2,x2), dot(p3,x3) ) );
    }`;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       uniform float uTime;
       uniform vec3 uEmissiveColor;
       uniform float uEmissiveAmp;
       ${noiseGLSL}
      `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_begin>',
      `
      #include <lights_fragment_begin>

      // World-space position (approx using vViewPosition)
      // vViewPosition is in view space; derive a pseudo world-ish coord by mixing with normal.
      vec3 p = -vViewPosition * 0.25;
      // Layered noise
      float n1 = snoise(p * 0.8 + vec3(0.0, uTime * 0.08, 0.0));
      float n2 = snoise(p * 2.4 - vec3(uTime * 0.05, 0.0, 0.0));
      float veins = smoothstep(0.52, 0.56, abs(sin(3.0*n1) + 0.35*n2));

      // Edge neon intensity
      float glow = veins;

      // Add emissive glow
      reflectedLight.indirectDiffuse += uEmissiveAmp * glow * vec3(0.0); // keep diffuse unchanged
      reflectedLight.directDiffuse += vec3(0.0);

      // Write emissive into outgoingLight (post-lighting)
      vec3 neon = uEmissiveColor * (glow * uEmissiveAmp * 0.5);
      outgoingLight += neon;
      `
    );

    base.userData.shader = shader;
  };

  return base;
}

function makeMeteor() {
  // Low-poly base using icosahedron, then perturb vertices for lumpy asteroid
  const radius = THREE.MathUtils.lerp(0.16, 0.28, Math.random());
  const detail = 1; // low-poly feel
  const geo = new THREE.IcosahedronGeometry(radius, detail);

  // Deform vertices
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    const k = 0.15 * Math.sin(v.x * 9 + v.y * 7 + v.z * 11);
    v.addScaledVector(v.clone().normalize(), k * radius);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  const mat = makeMeteorMaterial();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = false;
  m.receiveShadow = false;

  // Random tumble
  m.userData.rot = new THREE.Vector3(
    THREE.MathUtils.randFloat(-1.0, 1.0) * 0.7,
    THREE.MathUtils.randFloat(-1.0, 1.0) * 0.7,
    THREE.MathUtils.randFloat(-1.0, 1.0) * 0.7
  );

  // Speed/dir: move toward +Z (camera/ship)
  m.userData.vz = THREE.MathUtils.randFloat(4.8, 7.5);
  m.userData.vx = THREE.MathUtils.randFloatSpread(0.15);
  m.userData.vy = THREE.MathUtils.randFloatSpread(0.15);

  // Hitbox radius
  m.userData.r = radius * 0.85;

  return m;
}

function spawnMeteor(zStart = -30) {
  const m = meteorPool.pop() || makeMeteor();
  const laneWidth = 2.4; // roughly 5 lanes across corridor width ~6
  const x = THREE.MathUtils.randInt(-2, 2) * (laneWidth / 4);
  const y = THREE.MathUtils.randFloat(-0.9, 0.9);
  m.position.set(x, y, zStart);
  m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

  // Cyan by default; occasional magenta leader
  const magenta = Math.random() < 0.15;
  const shader = m.material.userData.shader;
  if (shader) {
    shader.uniforms.uEmissiveColor.value.set(magenta ? 0xff4fe3 : 0x71e1ff);
    shader.uniforms.uEmissiveAmp.value = magenta ? 2.3 : 1.8;
  }

  meteors.push(m);
  scene.add(m);
}

function despawnMeteor(m) {
  scene.remove(m);
  meteors.splice(meteors.indexOf(m), 1);
  meteorPool.push(m);
}

// ---------- Controls (drag/touch/mouse) ----------
const input = {
  active: false,
  tx: 0, ty: 0, // target positions in world space relative to center
  startX: 0, startY: 0,
  startTX: 0, startTY: 0
};

function screenToWorld(dx, dy) {
  // Translate pixels to corridor-local offsets
  const scaleX = 6.0 / window.innerWidth;   // corridor width ~6
  const scaleY = 3.6 / window.innerHeight;  // corridor height ~3.6
  return { wx: dx * scaleX, wy: -dy * scaleY };
}

function onPointerDown(e) {
  input.active = true;
  input.startX = ('touches' in e) ? e.touches[0].clientX : e.clientX;
  input.startY = ('touches' in e) ? e.touches[0].clientY : e.clientY;
  input.startTX = ship.position.x;
  input.startTY = ship.position.y;
}
function onPointerMove(e) {
  if (!input.active) return;
  const cx = ('touches' in e) ? e.touches[0].clientX : e.clientX;
  const cy = ('touches' in e) ? e.touches[0].clientY : e.clientY;
  const dx = cx - input.startX;
  const dy = cy - input.startY;
  const { wx, wy } = screenToWorld(dx, dy);
  input.tx = input.startTX + wx * 1.4;
  input.ty = input.startTY + wy * 1.4;
}
function onPointerUp() { input.active = false; }

window.addEventListener('pointerdown', onPointerDown, { passive: true });
window.addEventListener('pointermove', onPointerMove, { passive: true });
window.addEventListener('pointerup', onPointerUp, { passive: true });
window.addEventListener('touchstart', onPointerDown, { passive: true });
window.addEventListener('touchmove', onPointerMove, { passive: true });
window.addEventListener('touchend', onPointerUp, { passive: true });

// ---------- Game state ----------
let running = false;
let crashed = false;
let perfTime = 0;
let last = performance.now();
let playTime = 0;
let score = 0;
let spawnTimer = 0;

function setPaused(p) {
  running = !p && !crashed;
  overlay.hidden = running;
  pauseBtn.textContent = running ? '⏸' : '▶︎';
}
function resetGame() {
  crashed = false;
  playTime = 0;
  score = 0;
  spawnTimer = 0;
  timeEl.textContent = '0.0';
  scoreEl.textContent = '0';
  finalTime.textContent = '0.0';
  finalScore.textContent = '0';

  // clear meteors
  for (let i = meteors.length - 1; i >= 0; i--) {
    despawnMeteor(meteors[i]);
  }
  // spawn a gentle intro wave
  for (let i = 0; i < 6; i++) {
    spawnMeteor(-8 - i * 3.0);
  }
  ship.position.set(0, 0, 0);
  input.tx = input.ty = 0;
}

pauseBtn.addEventListener('click', () => setPaused(!overlay.hidden));
resumeBtn.addEventListener('click', () => setPaused(false));
restartBtn.addEventListener('click', () => { resetGame(); setPaused(false); });
againBtn.addEventListener('click', () => {
  gameover.hidden = true;
  resetGame();
  setPaused(false);
});

// Show overlay initially
overlay.hidden = false;
resetGame();

// ---------- Collision helpers ----------
function collidesShip(m) {
  // capsule (ship) vs sphere (meteor), approximated:
  // ship center:
  const sx = ship.position.x;
  const sy = ship.position.y;
  const sz = ship.position.z;
  const r = m.userData.r;
  const dx = m.position.x - sx;
  const dy = m.position.y - sy;
  const dz = m.position.z - (sz - 0.06); // slight offset to lenient nose
  const d2 = dx*dx + dy*dy + dz*dz;
  const minDist = r + ship.userData.hit.r;
  return d2 < (minDist * minDist);
}

// ---------- Main loop ----------
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  perfTime += dt;

  // Animate corridor drift opposite of forward speed
  const forward = ship.userData.speed * dt;
  corridor.tick(forward);

  if (running) {
    playTime += dt;
    timeEl.textContent = playTime.toFixed(1);

    // Ship sim
    ship.tick(dt, input);

    // Spawn meteors
    spawnTimer -= dt;
    const spawnInterval = THREE.MathUtils.lerp(0.9, 0.45, Math.min(1, playTime / 45)); // faster over time
    if (spawnTimer <= 0) {
      spawnMeteor(-22);
      spawnTimer = spawnInterval;
    }

    // Update meteors
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      // Shader time
      const shader = m.material.userData.shader;
      if (shader) shader.uniforms.uTime.value = perfTime;

      // Movement
      m.rotation.x += m.userData.rot.x * dt;
      m.rotation.y += m.userData.rot.y * dt;
      m.rotation.z += m.userData.rot.z * dt;

      m.position.z += m.userData.vz * dt;
      m.position.x += m.userData.vx * dt * 0.2;
      m.position.y += m.userData.vy * dt * 0.2;

      // Telegraph (brighten if on a collision lane)
      const sameLane = Math.abs(m.position.x - ship.position.x) < 0.24;
      if (shader) {
        shader.uniforms.uEmissiveAmp.value += ((sameLane ? 2.6 : 1.8) - shader.uniforms.uEmissiveAmp.value) * 5 * dt;
      }

      // Despawn if passed the camera
      if (m.position.z > camera.position.z + 1.2) {
        despawnMeteor(m);
        score += 1;
        scoreEl.textContent = String(score);
      } else if (!crashed && collidesShip(m)) {
        crashed = true;
        running = false;
        // Flash & end
        finalTime.textContent = playTime.toFixed(1);
        finalScore.textContent = String(score);
        setTimeout(() => { gameover.hidden = false; }, 120);
      }
    }
  }

  // Render
  composer.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- Resize ----------
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize, { passive: true });
