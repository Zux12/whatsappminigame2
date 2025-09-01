/* Shadow Tag — Tiny Pixel (mobile-first)
   v0.12: spawn grace, brighter start lamp, slower/farther monster,
          darkness tweak, fixed AI dy bug, and clean gating for catch.
*/

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // UI elements
  const timeEl = document.getElementById('time');
  const batteryEl = document.getElementById('battery');
  const staminaEl = document.getElementById('stamina');
  const pauseBtn = document.getElementById('pauseBtn');
  const overlay = document.getElementById('overlay');
  const resumeBtn = document.getElementById('resumeBtn');
  const restartBtn = document.getElementById('restartBtn');
  const gameover = document.getElementById('gameover');
  const againBtn = document.getElementById('againBtn');
  const finalTime = document.getElementById('finalTime');
  const actionBtn = document.getElementById('actionBtn');

  // Stick elements
  const stick = document.getElementById('stick');
  const stickBase = document.getElementById('stick-base');
  const stickKnob = document.getElementById('stick-knob');


  // Pixel grid scale
  let W = 0, H = 0;
  let pixel = 4;          // base pixel size for tiny pixel art
  const TILE = 8;         // tile size in "pixel units"
  let scale = 1;          // dynamic for screen

  function resize() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    W = Math.floor(window.innerWidth);
    H = Math.floor(window.innerHeight);
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // scale tiles so they fit nicely on mobile
    const targetTilesX = 22;
    scale = Math.max(2, Math.floor(W / (targetTilesX * TILE)));
    pixel = Math.max(2, Math.min(6, scale)); // keep pixels chunky
  }
  window.addEventListener('resize', resize, { passive: true });
  resize();

  // Simple tilemap (1=wall, 0=floor, 2=switch)
  const MAP_W = 36, MAP_H = 24;
  const map = [];
  for (let y = 0; y < MAP_H; y++) {
    map[y] = [];
    for (let x = 0; x < MAP_W; x++) {
      const edge = (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1);
      map[y][x] = edge ? 1 : 0;
    }
  }
  for (let y = 2; y < MAP_H - 2; y += 2) {
    for (let x = 2; x < MAP_W - 2; x++) map[y][x] = 1;
  }
  for (let y = 2; y < MAP_H - 2; y += 2) {
    map[y][2 + ((y * 5) % (MAP_W - 4))] = 0;
  }
  map[6][5] = 2;
  map[MAP_H - 7][MAP_W - 6] = 2;

  function isWall(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
    return map[ty][tx] === 1;
  }

  // Player
  const player = {
    x: 3.5, y: 3.5,
    vx: 0, vy: 0,
    speed: 2.6, sprint: 3.6,
    stamina: 1, // 0..1
    battery: 1, // 0..1
    lightOn: true,
    radius: 9 // light radius in tiles (base)
  };

  // Monster (slower + farther)
  const monster = {
    x: MAP_W - 6.5, y: MAP_H - 6.5,
    speed: 1.8,
    spotted: false,
    cooldown: 0
  };

  // Lamps (one ON near spawn so you can see right away)
  const lamps = [
    { x: 4, y: 4, on: true },                 // bright spawn area
    { x: 5, y: 6, on: false },
    { x: MAP_W - 6, y: MAP_H - 7, on: false }
  ];

  // Camera
  const cam = { x: 0, y: 0 };

  // Time / state
  let t0 = performance.now();
  let elapsed = 0;
  let paused = false;
  let dead = false;
  let spawnGrace = 3.0; // seconds of safety at start

  // Input (joystick)
  const stickState = {
    active: false,
    cx: 0, cy: 0,
    dx: 0, dy: 0
  };

  function setOverlay(show) { overlay.hidden = !show; paused = show; }
  function setGameOver(show) { gameover.hidden = !show; dead = show; }

  // Joystick helpers
  function within(elem, x, y) {
    const r = elem.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }
  function onPointerDown(e) {
    const x = (e.touches ? e.touches[0].clientX : e.clientX);
    const y = (e.touches ? e.touches[0].clientY : e.clientY);
    if (within(stick, x, y)) {
      stickState.active = true;
      const r = stickBase.getBoundingClientRect();
      stickState.cx = r.left + r.width / 2;
      stickState.cy = r.top + r.height / 2;
      updateStick(x, y);
    }
  }
  function onPointerMove(e) {
    if (!stickState.active) return;
    const x = (e.touches ? e.touches[0].clientX : e.clientX);
    const y = (e.touches ? e.touches[0].clientY : e.clientY);
    updateStick(x, y);
  }
  function onPointerUp() {
    stickState.active = false;
    stickState.dx = 0; stickState.dy = 0;
    stickKnob.style.left = (140/2 - 32) + 'px';
    stickKnob.style.top  = (140/2 - 32) + 'px';
  }
  function updateStick(x, y) {
    const dx = x - stickState.cx;
    const dy = y - stickState.cy;
    const max = 50;
    const mag = Math.hypot(dx, dy);
    const cl = mag > max ? max / mag : 1;
    const ndx = dx * cl, ndy = dy * cl;
    stickKnob.style.left = (140/2 - 32 + ndx) + 'px';
    stickKnob.style.top  = (140/2 - 32 + ndy) + 'px';
    stickState.dx = ndx / max;
    stickState.dy = ndy / max;
  }

  document.addEventListener('touchstart', onPointerDown, { passive: false });
  document.addEventListener('touchmove', onPointerMove, { passive: false });
  document.addEventListener('touchend', onPointerUp, { passive: true });
  document.addEventListener('mousedown', onPointerDown);
  document.addEventListener('mousemove', onPointerMove);
  document.addEventListener('mouseup', onPointerUp);

  // Pause/Resume/Restart
  pauseBtn.addEventListener('click', () => setOverlay(true));
  resumeBtn.addEventListener('click', () => setOverlay(false));
  restartBtn.addEventListener('click', () => location.reload());
  againBtn.addEventListener('click', () => location.reload());

  // Action: toggle nearby lamp via switch tile
  actionBtn.addEventListener('click', () => {
    const px = Math.round(player.x), py = Math.round(player.y);
    if (map[py]?.[px] === 2) {
      let best = null, bd = 1e9;
      for (const l of lamps) {
        const d = Math.hypot(l.x - px, l.y - py);
        if (d < bd) { bd = d; best = l; }
      }
      if (best) best.on = !best.on;
    }
  });

  // Movement & collisions
  function tryMove(obj, dt, nx, ny) {
    const rad = 0.25; // collision radius
    const samples = [
      [nx - rad, ny - rad], [nx + rad, ny - rad],
      [nx - rad, ny + rad], [nx + rad, ny + rad]
    ];
    for (const [sx, sy] of samples) {
      if (isWall(Math.floor(sx), Math.floor(sy))) return false;
    }
    obj.x = nx; obj.y = ny; return true;
  }

  // Line-of-sight (simple tile stepping)
  function hasLOS(ax, ay, bx, by) {
    let x = Math.floor(ax), y = Math.floor(ay);
    const tx = Math.floor(bx), ty = Math.floor(by);
    const dx = Math.sign(tx - x), dy = Math.sign(ty - y);
    let steps = 0;
    while (x !== tx || y !== ty) {
      if (isWall(x, y)) return false;
      const rx = Math.abs((tx + 0.5) - (x + 0.5));
      const ry = Math.abs((ty + 0.5) - (y + 0.5));
      if (rx > ry) x += dx; else y += dy;
      if (++steps > 200) break;
    }
    return true;
  }

  // Main loop
  let raf;
  function step(now) {
    const dt = Math.min(0.033, (now - t0) / 1000);
    t0 = now;
    if (!paused && !dead) update(dt);
    draw();
    raf = requestAnimationFrame(step);
  }
  requestAnimationFrame(step);

  function update(dt) {
    elapsed += dt;
    timeEl.textContent = elapsed.toFixed(1);
    spawnGrace = Math.max(0, spawnGrace - dt);

    // Player input & stamina
    const inputX = stickState.dx;
    const inputY = stickState.dy;
    const mag = Math.hypot(inputX, inputY);
    const moving = mag > 0.1;

    const wantSprint = mag > 0.6 && player.stamina > 0.05; // auto sprint on strong push
    const spd = (wantSprint ? player.sprint : player.speed);
    if (moving) {
      const nx = player.x + (inputX / (mag || 1)) * spd * dt;
      const ny = player.y + (inputY / (mag || 1)) * spd * dt;
      tryMove(player, dt, nx, ny);
      player.stamina = Math.max(0, player.stamina - (wantSprint ? 0.45 : 0.12) * dt);
    } else {
      player.stamina = Math.min(1, player.stamina + 0.35 * dt);
    }
    staminaEl.textContent = Math.round(player.stamina * 100) + '%';

    // Battery drains if lightOn
    if (player.lightOn && player.battery > 0) {
player.battery = Math.max(0, player.battery - 0.01 * dt);  // ← 5× slower
    }
    batteryEl.textContent = Math.round(player.battery * 100) + '%';

    // --- Monster AI (runs only after grace) ---
    if (spawnGrace <= 0) {
      const dist = Math.hypot(monster.x - player.x, monster.y - player.y);
      const sees = dist < 8 && hasLOS(monster.x, monster.y, player.x, player.y);
      monster.spotted = sees || monster.cooldown > 0;
      if (sees) monster.cooldown = 1.2; else monster.cooldown = Math.max(0, monster.cooldown - dt);

      const ms = monster.spotted ? monster.speed * 1.15 : monster.speed * 0.7;
      const dx = player.x - monster.x, dy = player.y - monster.y; // (fixed dy)
      const mmag = Math.hypot(dx, dy) || 1;
      const mx = monster.x + (dx / mmag) * ms * dt;
      const my = monster.y + (dy / mmag) * ms * dt;
      tryMove(monster, dt, mx, my);

      // Catch only after grace
      if (Math.hypot(monster.x - player.x, monster.y - player.y) < 0.45) {
        dead = true;
        finalTime.textContent = elapsed.toFixed(1);
        setGameOver(true);
      }
    } else {
      monster.spotted = false;
    }

    // Camera follows player
    const worldW = MAP_W * TILE * pixel;
    const worldH = MAP_H * TILE * pixel;
    const px = player.x * TILE * pixel;
    const py = player.y * TILE * pixel;
    cam.x = px - W / 2;
    cam.y = py - H / 2;
    cam.x = Math.max(0, Math.min(worldW - W, cam.x));
    cam.y = Math.max(0, Math.min(worldH - H, cam.y));
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Draw world
    const startX = Math.max(0, Math.floor((cam.x / (TILE * pixel)) - 2));
    const startY = Math.max(0, Math.floor((cam.y / (TILE * pixel)) - 2));
    const endX = Math.min(MAP_W, Math.ceil(((cam.x + W) / (TILE * pixel)) + 2));
    const endY = Math.min(MAP_H, Math.ceil(((cam.y + H) / (TILE * pixel)) + 2));

    for (let ty = startY; ty < endY; ty++) {
      for (let tx = startX; tx < endX; tx++) {
        const v = map[ty][tx];
        const sx = tx * TILE * pixel - cam.x;
        const sy = ty * TILE * pixel - cam.y;

        // floor
        ctx.fillStyle = '#0c1220';
        ctx.fillRect(sx, sy, TILE * pixel, TILE * pixel);

        if (v === 1) {
          // walls
          ctx.fillStyle = '#0a0f18';
          ctx.fillRect(sx, sy, TILE * pixel, TILE * pixel);
          ctx.fillStyle = '#101b2c';
          ctx.fillRect(sx, sy, TILE * pixel, 2 * pixel);
        } else if (v === 2) {
          // switch
          ctx.fillStyle = '#27324a';
          ctx.fillRect(sx, sy, TILE * pixel, TILE * pixel);
          ctx.fillStyle = '#ffd34d';
          ctx.fillRect(sx + 3 * pixel, sy + 3 * pixel, 2 * pixel, 2 * pixel);
        }
      }
    }

    // Lamps
    for (const l of lamps) {
      const sx = l.x * TILE * pixel - cam.x;
      const sy = l.y * TILE * pixel - cam.y;
      ctx.fillStyle = l.on ? '#8cf6ff' : '#223349';
      ctx.fillRect(sx + 3 * pixel, sy + 3 * pixel, 2 * pixel, 2 * pixel);
    }

    // Monster
    drawPixelChar(monster.x, monster.y, '#141921', '#000000', 0.6);

    // Player
    drawPixelChar(player.x, player.y, '#a8dbff', '#71e1ff', 1.0);

    // Darkness mask (brighter than before)
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; // was 0.80
    ctx.fillRect(0, 0, W, H);

    // Cut light holes
    ctx.globalCompositeOperation = 'destination-out';

    // Player light
    const baseR = player.radius * TILE * pixel;
const lightR = Math.max(300, baseR * (1.0 + player.battery * 0.6));

    radialHole(player.x, player.y, lightR, 0.85);

    // Lamp lights
    for (const l of lamps) {
      if (!l.on) continue;
radialHole(l.x + 0.5, l.y + 0.5, 260, 1.0);  // ← bigger lamp glow
    }
    ctx.restore();

    if (monster.spotted) {
      ctx.fillStyle = 'rgba(255,77,109,0.08)';
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawPixelChar(cx, cy, body, accent, pulse = 1) {
    const x = cx * TILE * pixel - cam.x;
    const y = cy * TILE * pixel - cam.y;
    const s = Math.max(1, Math.floor(TILE * pixel * 0.75));
    ctx.fillStyle = body;
    ctx.fillRect(x + s*0.25, y + s*0.10, s*0.5, s*0.65); // body
    ctx.fillRect(x + s*0.30, y + s*0.00, s*0.4, s*0.25); // head
    ctx.fillStyle = accent;
    ctx.fillRect(x + s*0.42, y + s*0.07, Math.max(1, s*0.12), Math.max(1, s*0.12)); // eye
    ctx.fillStyle = '#0a0f18';
    ctx.fillRect(x + s*0.28, y + s*0.78, s*0.16, s*0.08); // feet
    ctx.fillRect(x + s*0.56, y + s*0.78, s*0.16, s*0.08);
  }

  function radialHole(wx, wy, radiusPixels, hard = 1) {
    const x = wx * TILE * pixel - cam.x;
    const y = wy * TILE * pixel - cam.y;
    const g = ctx.createRadialGradient(x, y, 0, x, y, radiusPixels);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.6, `rgba(255,255,255,${0.45*hard})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radiusPixels, 0, Math.PI*2);
    ctx.fill();
  }

  // Prevent iOS two-finger pinch scroll
  document.addEventListener('gesturestart', e => e.preventDefault());

  // If the tab goes background, just pause (not game over)
// If the tab goes background, pause (but not during initial load)
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !dead && elapsed > 0.5) setOverlay(true);
});

})();
