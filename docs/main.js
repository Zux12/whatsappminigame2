// Neon Corridor — 3D Runner (mobile-friendly, no assets)
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

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

let W = innerWidth, H = innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setPixelRatio(dpr);
renderer.setSize(W, H);
renderer.setClearColor(0x0a0f18, 1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0a0f18, 8, 32);

const camera = new THREE.PerspectiveCamera(60, W/H, 0.1, 100);
camera.position.set(0, 0, 6);

const ambient = new THREE.AmbientLight(0x88aaff, 0.5);
scene.add(ambient);
const headLight = new THREE.PointLight(0x77ddff, 1.1, 6, 2);
headLight.position.set(0, 0.4, 1);
scene.add(headLight);

// Corridor (single long box walls/floor/ceiling)
const CW = 6, CH = 3.4, CL = 100;
const wallMat = new THREE.MeshStandardMaterial({ color:0x172237, metalness:0.1, roughness:0.9 });
function makePanel(dx, dy, sx, sy, sz){
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), wallMat);
  m.position.set(dx, dy, -sz/2);
  m.receiveShadow = true;
  scene.add(m);
  return m;
}
makePanel(0, -CH/2, CW, 0.2, CL);   // floor
makePanel(0,  CH/2, CW, 0.2, CL);   // ceiling
makePanel(-CW/2,0, 0.2, CH, CL);    // left wall
makePanel( CW/2,0, 0.2, CH, CL);    // right wall

// Player (small glowing ship)
const shipGeo = new THREE.ConeGeometry(0.25, 0.6, 12);
shipGeo.rotateX(Math.PI/2);
const shipMat = new THREE.MeshStandardMaterial({ color:0x8ee6ff, emissive:0x2ad8ff, emissiveIntensity:0.6, metalness:0.2, roughness:0.4 });
const ship = new THREE.Mesh(shipGeo, shipMat);
ship.position.set(0, 0, 4.6);
scene.add(ship);

const shipGlow = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 16),
                                new THREE.MeshBasicMaterial({ color:0x8ee6ff, transparent:true, opacity:0.15 }));
shipGlow.position.copy(ship.position);
scene.add(shipGlow);

// Obstacles
const OB_COUNT = 40;
const obstacles = [];
const boxGeo = new THREE.BoxGeometry(1,1,1);
const obMat = new THREE.MeshStandardMaterial({ color:0x2e3e5c, metalness:0.1, roughness:0.6, emissive:0x0, emissiveIntensity:0.2 });

function rand(min,max){ return min + Math.random()*(max-min); }

for (let i=0;i<OB_COUNT;i++){
  const b = new THREE.Mesh(boxGeo, obMat.clone());
  resetObstacle(b, true);
  scene.add(b);
  obstacles.push({ mesh:b, r:0.7 });
}

function resetObstacle(b, initial=false){
  const sx = rand(0.4, 1.2), sy = rand(0.4, 1.2), sz = rand(0.4, 1.2);
  b.scale.set(sx, sy, sz);
  b.material.emissive = new THREE.Color(0x112233);
  b.position.x = rand(-CW/2 + 0.5, CW/2 - 0.5);
  b.position.y = rand(-CH/2 + 0.5, CH/2 - 0.5);
  const ahead = initial ? rand(8, 90) : rand(40, 90);
  b.position.z = -ahead;
  b.rotation.set(rand(0,Math.PI), rand(0,Math.PI), rand(0,Math.PI));
}

let running = false, dead = false;
let t0 = performance.now(), elapsed = 0, score = 0;
let speed = 8;  // world scroll speed (units/sec)
let driftX = 0, driftY = 0; // input deltas

// Touch/mouse drag to move
let dragging = false, lastX=0, lastY=0;
const sensitivity = 0.012;
function onDown(e){
  dragging = true;
  const p = point(e);
  lastX = p.x; lastY = p.y;
}
function onMove(e){
  if(!dragging) return;
  const p = point(e);
  driftX += (p.x - lastX) * sensitivity;
  driftY -= (p.y - lastY) * sensitivity;
  lastX = p.x; lastY = p.y;
}
function onUp(){ dragging = false; }
function point(e){
  if (e.touches && e.touches[0]) return { x:e.touches[0].clientX, y:e.touches[0].clientY };
  return { x:e.clientX, y:e.clientY };
}
addEventListener('touchstart', onDown, {passive:false});
addEventListener('touchmove', onMove, {passive:false});
addEventListener('touchend', onUp, {passive:true});
addEventListener('mousedown', onDown);
addEventListener('mousemove', onMove);
addEventListener('mouseup', onUp);

// Pause/overlays
function setOverlay(show){ overlay.hidden = !show; running = !show && !dead; }
function setOver(show){ gameover.hidden = !show; if(show) running = false; }
pauseBtn.onclick = () => setOverlay(true);
resumeBtn.onclick = () => setOverlay(false);
restartBtn.onclick = () => location.reload();
againBtn.onclick = () => location.reload();

// Start unpaused on first interaction
setOverlay(false);

function resize(){
  W = innerWidth; H = innerHeight; dpr = Math.min(2, devicePixelRatio||1);
  renderer.setPixelRatio(dpr); renderer.setSize(W, H);
  camera.aspect = W/H; camera.updateProjectionMatrix();
}
addEventListener('resize', resize, {passive:true});

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

// Main loop
function loop(now){
  const dt = Math.min(0.033, (now - t0)/1000); t0 = now;
  if (running && !dead){
    elapsed += dt;
    score += dt * 100; // basic score
    timeEl.textContent = elapsed.toFixed(1);
    scoreEl.textContent = Math.floor(score);

    // move player by drift with easing
    ship.position.x = clamp(ship.position.x + driftX, -CW/2+0.6, CW/2-0.6);
    ship.position.y = clamp(ship.position.y + driftY, -CH/2+0.6, CH/2-0.6);
    driftX *= 0.85; driftY *= 0.85;
    shipGlow.position.copy(ship.position);
    headLight.position.set(ship.position.x, ship.position.y+0.4, ship.position.z+0.8);

    // scroll world: obstacles move toward camera
    const zStop = camera.position.z + 0.5;
    for (const o of obstacles){
      o.mesh.position.z += speed * dt;
      o.mesh.rotation.x += 0.2*dt; o.mesh.rotation.y += 0.15*dt;

      // recycle when past camera
      if (o.mesh.position.z > zStop) resetObstacle(o.mesh);

      // collision (sphere vs box approximated as sphere)
      const dx = o.mesh.position.x - ship.position.x;
      const dy = o.mesh.position.y - ship.position.y;
      const dz = o.mesh.position.z - ship.position.z;
      if ((dx*dx + dy*dy + dz*dz) < (o.r + 0.35) ** 2){
        dead = true;
        finalTime.textContent = elapsed.toFixed(1);
        finalScore.textContent = Math.floor(score);
        setOver(true);
      }
    }

    // slight speed ramp
    speed = Math.min(16, speed + 0.05*dt);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
