// main.js — stable CDN + early overlay + visible errors

// ------------ tiny inline error badge ------------
const badge = document.createElement('div');
badge.style.cssText = 'position:fixed;bottom:8px;left:8px;padding:6px 10px;border-radius:10px;background:#2b2b2b;color:#fff;font:12px/1.2 ui-sans-serif,system-ui;z-index:9999;opacity:.0;transition:opacity .2s';
document.body.appendChild(badge);
function showErr(e){ badge.textContent = '⚠️ ' + e; badge.style.opacity = '1'; console.error(e); }
window.addEventListener('error', (e)=>showErr(e.message || 'Script error'));
window.addEventListener('unhandledrejection', (e)=>showErr((e.reason&&e.reason.message)||'Unhandled promise rejection'));

// Unhide start overlay immediately
const overlay = document.getElementById('overlay');
if (overlay) overlay.hidden = false;

// ------------ CDN imports ------------
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js';

// ------------ DOM hooks ------------
const timeEl = document.getElementById('time');
const scoreEl = document.getElementById('score');
const pauseBtn = document.getElementById('pause');
const resumeBtn = document.getElementById('resume');
const restartBtn = document.getElementById('restart');
const gameover = document.getElementById('gameover');
const againBtn = document.getElementById('again');
const finalTime = document.getElementById('finalTime');
const finalScore = document.getElementById('finalScore');

// ------------ renderer / scene / camera ------------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x0a0f18, 1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 0.02, 1000);
camera.position.set(0, 0.9, 2.2);
scene.add(camera);

// lights
scene.add(new THREE.HemisphereLight(0x96c6ff, 0x0b1220, 0.5));
const dir = new THREE.DirectionalLight(0xffffff, 0.7);
dir.position.set(1,2,1); scene.add(dir);

// post FX
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.8, 0.9, 0.01);
composer.addPass(bloomPass);

// ------------ corridor ------------
function makeCorridor(){
  const g = new THREE.Group();
  const length=30, width=6, height=3.6;

  function seg(z){
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width,height,length),
      new THREE.MeshStandardMaterial({ color:0x0f1724, roughness:.95, metalness:.05, side: THREE.BackSide })
    );
    mesh.position.z = z; return mesh;
  }
  const a=seg(-length*.5), b=seg(-length*1.5);
  g.add(a,b); g.userData={length,segments:[a,b]};
  const ribs = new THREE.Group();
  for(let i=0;i<24;i++){
    const box = new THREE.Mesh(new THREE.BoxGeometry(.04,height*.9,.05), new THREE.MeshBasicMaterial({color:0x71e1ff}));
    box.position.set(-width*.5+.05,0,-i*1.2); ribs.add(box);
    const r = box.clone(); r.position.x = width*.5-.05; ribs.add(r);
  }
  g.add(ribs);
g.tick = (dz)=>{
  for(const s of g.userData.segments){
    s.position.z -= dz;
    if(s.position.z < camera.position.z - length*1.5) s.position.z += length*2;
  }
  for(const r of ribs.children){
    r.position.z -= dz;
    if(r.position.z < camera.position.z - 1) r.position.z += 24*1.2;
  }
};
  return g;
}
const corridor = makeCorridor(); scene.add(corridor);

// ------------ ship (low-poly wedge with neon) ------------
function makeShip(){
  const group = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color:0x1a2436, roughness:.9, metalness:.08 });

  const fus = new THREE.Mesh(new THREE.ConeGeometry(.15,.5,12,1,false), hullMat);
  fus.rotation.x = Math.PI/2; group.add(fus);

  const wing = new THREE.Mesh(new THREE.BoxGeometry(.26,.02,.18), hullMat);
  wing.position.set(0,-.04,-.12); group.add(wing);

  const stripMat = new THREE.MeshBasicMaterial({ color:0x71e1ff });
  const stripGeo = new THREE.BoxGeometry(.02,.02,.36);
  const L = new THREE.Mesh(stripGeo, stripMat); L.position.set(-.08,.03,-.1);
  const R = L.clone(); R.position.x = .08; group.add(L,R);

  const eng = new THREE.Mesh(new THREE.RingGeometry(.03,.06,24), new THREE.MeshBasicMaterial({ color:0x71e1ff, side:THREE.DoubleSide }));
  eng.rotation.x = Math.PI/2; eng.position.z = .24; group.add(eng);

  group.userData = { vx:0, vy:0, bank:0, speed:6, width:6, height:3.6, hit:{r:.11,h:.12}, neon:stripMat, engine:eng };
  group.tick = (dt,input)=>{
    const u = group.userData, accel = 8.5;
    u.vx += (input.tx - group.position.x)*accel*dt;
    u.vy += (input.ty - group.position.y)*accel*dt;
    u.vx *= .92; u.vy *= .92;
    group.position.x += u.vx*dt; group.position.y += u.vy*dt;
    const xMax = u.width*.5 - .35, yMax = u.height*.5 - .35;
    group.position.x = Math.max(-xMax, Math.min(xMax, group.position.x));
    group.position.y = Math.max(-yMax, Math.min(yMax, group.position.y));
    const targetBank = THREE.MathUtils.clamp(-u.vx*.25,-.35,.35);
    u.bank += (targetBank - u.bank)*8*dt; group.rotation.z = u.bank;
    const pulse = 0.5 + 0.5*Math.sin(perfTime*2.8);
    u.engine.scale.setScalar(1 + .15*pulse);
  };
  return group;
}
const ship = makeShip(); scene.add(ship);

// ------------ meteor (low-poly + emissive “veins”) ------------
function makeMeteorMaterial(){
  const base = new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 1.0,
    metalness: 0.0,
    emissive: 0x000000
  });

  base.onBeforeCompile = (shader)=>{
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uEmColor = { value: new THREE.Color(0x71e1ff) };
    shader.uniforms.uAmp = { value: 1.8 };

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `
        #include <common>
        uniform float uTime;
        uniform vec3 uEmColor;
        uniform float uAmp;

        // tiny hashed value noise (cheap)
        float hash(vec3 p){
          p = fract(p*0.3183099 + vec3(.1,.2,.3));
          p *= 17.0;
          return fract(p.x*p.y*p.z*(p.x+p.y+p.z));
        }
        float n3(vec3 p){
          vec3 i = floor(p);
          vec3 f = fract(p);
          float s = 0.0;
          for (int x=0;x<2;x++)
          for (int y=0;y<2;y++)
          for (int z=0;z<2;z++){
            vec3 o = vec3(x,y,z);
            // soft box influence
            s += mix(0.0, 1.0, dot(f-o,f-o) < 1.0) * hash(i+o);
          }
          return s/8.0;
        }
      `)
      .replace('#include <lights_fragment_begin>', `
        #include <lights_fragment_begin>
        // derive a pseudo world-space point from view position
        vec3 p = -vViewPosition * 0.25;
        float v = smoothstep(0.55, 0.60, abs(sin(n3(p*1.3 + vec3(0.0, uTime*0.08, 0.0)) * 6.2831)));
        vec3 neon = uEmColor * (v * uAmp * 0.5);

        // ✅ add glow as emissive energy (safe target for MeshStandardMaterial)
        totalEmissiveRadiance += neon;
      `);

    base.userData.shader = shader;
  };

  return base;
}

function makeMeteor(){
  const r = THREE.MathUtils.lerp(.16,.28,Math.random());
  const geo = new THREE.IcosahedronGeometry(r,1);
  const pos = geo.attributes.position;
  for(let i=0;i<pos.count;i++){
    const v = new THREE.Vector3().fromBufferAttribute(pos,i);
    const k = 0.15*Math.sin(v.x*9+v.y*7+v.z*11);
    v.addScaledVector(v.clone().normalize(), k*r);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const mat = makeMeteorMaterial();
  const m = new THREE.Mesh(geo, mat);
  m.userData = {
    rot: new THREE.Vector3(THREE.MathUtils.randFloatSpread(.7),THREE.MathUtils.randFloatSpread(.7),THREE.MathUtils.randFloatSpread(.7)),
    vx: THREE.MathUtils.randFloatSpread(.15), vy: THREE.MathUtils.randFloatSpread(.15), vz: THREE.MathUtils.randFloat(4.8,7.5),
    r: r*.85
  };
  return m;
}
const meteors = [], pool = [];
function spawnMeteor(zStart=-22){
  const m = pool.pop() || makeMeteor();
  const laneW = 2.4, x = THREE.MathUtils.randInt(-2,2)*(laneW/4), y = THREE.MathUtils.randFloat(-.9,.9);
  m.position.set(x,y,zStart);
  const magenta = Math.random()<0.15, sh=m.material.userData.shader;
  if (sh){ sh.uniforms.uEmColor.value.set(magenta?0xff4fe3:0x71e1ff); sh.uniforms.uAmp.value = magenta?2.3:1.8; }
  meteors.push(m); scene.add(m);
}
function despawn(m){ scene.remove(m); meteors.splice(meteors.indexOf(m),1); pool.push(m); }

// ------------ input ------------
const input = { active:false, tx:0, ty:0, startX:0, startY:0, startTX:0, startTY:0 };
function screenToWorld(dx,dy){ return { wx: dx*(6/innerWidth), wy: -dy*(3.6/innerHeight) }; }
function pd(e){ input.active=true; const t=('touches'in e)?e.touches[0]:e; input.startX=t.clientX; input.startY=t.clientY; input.startTX=ship.position.x; input.startTY=ship.position.y; }
function pm(e){ if(!input.active) return; const t=('touches'in e)?e.touches[0]:e; const {wx,wy}=screenToWorld(t.clientX-input.startX,t.clientY-input.startY); input.tx=input.startTX+wx*1.4; input.ty=input.startTY+wy*1.4; }
function pu(){ input.active=false; }
addEventListener('pointerdown',pd,{passive:true}); addEventListener('pointermove',pm,{passive:true}); addEventListener('pointerup',pu,{passive:true});
addEventListener('touchstart',pd,{passive:true}); addEventListener('touchmove',pm,{passive:true}); addEventListener('touchend',pu,{passive:true});

// ------------ game state / UI wiring ------------
let running=false, crashed=false, perfTime=0, last=performance.now(), playTime=0, score=0, spawnT=0;
function setPaused(p){ running=!p && !crashed; if(overlay) overlay.hidden = running; if(pauseBtn) pauseBtn.textContent = running?'⏸':'▶︎'; }
function resetGame(){
  crashed=false; playTime=0; score=0; spawnT=0;
  if(timeEl) timeEl.textContent='0.0'; if(scoreEl) scoreEl.textContent='0';
  if(finalTime) finalTime.textContent='0.0'; if(finalScore) finalScore.textContent='0';
  for(let i=meteors.length-1;i>=0;i--) despawn(meteors[i]);
  for(let i=0;i<6;i++) spawnMeteor(-8 - i*3);
  ship.position.set(0,0,0); input.tx=input.ty=0;
}
if (pauseBtn) pauseBtn.addEventListener('click', ()=> setPaused(!running));
if (resumeBtn) resumeBtn.addEventListener('click', ()=>setPaused(false));
if (restartBtn) restartBtn.addEventListener('click', ()=>{ resetGame(); setPaused(false); });
if (againBtn) againBtn.addEventListener('click', ()=>{ if(gameover) gameover.hidden=true; resetGame(); setPaused(false); });

resetGame(); setPaused(true); // start on overlay

// ------------ collision ------------
function hit(m){
  const dx=m.position.x-ship.position.x, dy=m.position.y-ship.position.y, dz=m.position.z-(ship.position.z-.06);
  const minR = m.userData.r + ship.userData.hit.r;
  return (dx*dx+dy*dy+dz*dz) < (minR*minR);
}

// ------------ main loop ------------
function frame(now){
  const dt = Math.min(.033, (now-last)/1000); last=now; perfTime+=dt;
  const forward = ship.userData.speed*dt; corridor.tick(forward);

  if (running){
    playTime += dt; if(timeEl) timeEl.textContent = playTime.toFixed(1);
    ship.tick(dt, input);
    spawnT -= dt;
    const interval = THREE.MathUtils.lerp(.9,.45, Math.min(1, playTime/45));
    if (spawnT<=0){ spawnMeteor(-22); spawnT=interval; }
    for (let i=meteors.length-1;i>=0;i--){
      const m=meteors[i]; const sh=m.material.userData.shader; if(sh) sh.uniforms.uTime.value = perfTime;
      m.rotation.x += m.userData.rot.x*dt; m.rotation.y += m.userData.rot.y*dt; m.rotation.z += m.userData.rot.z*dt;
      m.position.z += m.userData.vz*dt; m.position.x += m.userData.vx*dt*.2; m.position.y += m.userData.vy*dt*.2;
      if (m.position.z > camera.position.z + 1.2){ despawn(m); score++; if(scoreEl) scoreEl.textContent=String(score); }
      else if (!crashed && hit(m)){
        crashed=true; running=false;
        if(finalTime) finalTime.textContent = playTime.toFixed(1);
        if(finalScore) finalScore.textContent = String(score);
        setTimeout(()=>{ if(gameover) gameover.hidden=false; },120);
      }
    }
  }

  // render
  try{ composer.render(); }catch(err){ showErr('Render: '+err.message); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ------------ resize ------------
addEventListener('resize', ()=>{
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
}, {passive:true});
