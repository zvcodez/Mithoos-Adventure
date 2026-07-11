(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const startScreen = document.getElementById('start-screen');
  const gameoverScreen = document.getElementById('gameover-screen');
  const hud = document.getElementById('hud');
  const scoreEl = document.getElementById('score');
  const finalScoreEl = document.getElementById('final-score');
  const finalBestEl = document.getElementById('final-best');
  const startBestEl = document.getElementById('start-best');
  const muteBtn = document.getElementById('mute-btn');
  const muteSlashEl = document.getElementById('mute-slash');
  const shareBtn = document.getElementById('share-btn');

  const BEST_KEY = 'mithoo-best-score';
  const MUTED_KEY = 'mithoo-muted';

  let best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10);
  let muted = localStorage.getItem(MUTED_KEY) === '1';
  startBestEl.textContent = best;

  function renderMuteBtn() {
    muteSlashEl.classList.toggle('hidden', !muted);
  }
  renderMuteBtn();

  let W, H, DPR;
  function resize() {
    DPR = window.devicePixelRatio || 1;
    W = canvas.clientWidth = window.innerWidth;
    H = canvas.clientHeight = window.innerHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  const GRAVITY = 1800;
  const FLAP_VELOCITY = -520;
  const PIPE_GAP = 190;
  const PIPE_WIDTH = 70;
  const PIPE_SPACING = 260;
  const PIPE_SPEED = 160;
  const SPEED_STEP_EVERY = 5;
  const SPEED_STEP_AMOUNT = 15;
  const BIRD_X_RATIO = 0.3;
  const BIRD_SIZE = 34;

  const CROWN_SCORE = 15;
  const MILESTONES = [
    { score: 10, text: 'Nice flight!' },
    { score: 25, text: "Mithoo's proud!" },
    { score: 50, text: 'Soaring high!' },
    { score: 100, text: 'Incredible!' },
  ];

  let state = 'ready'; // ready | playing | dead
  let bird, pipes, score, speed, elapsed;
  let particles, trailTimer, milestone, milestonesHit;

  function reset() {
    bird = {
      x: W * BIRD_X_RATIO,
      y: H / 2,
      vy: 0,
      rot: 0,
      flapT: 0,
    };
    pipes = [];
    score = 0;
    scoreEl.textContent = '0';
    speed = PIPE_SPEED;
    elapsed = 0;
    particles = [];
    trailTimer = 0;
    milestone = null;
    milestonesHit = new Set();
    spawnPipe(W + 100);
    spawnPipe(W + 100 + PIPE_SPACING);
    spawnPipe(W + 100 + PIPE_SPACING * 2);
  }

  const BLOOM_COLORS = ['#FF6B81', '#FFC145', '#FF9F73', '#E85C8A', '#FFD3E0'];

  function spawnPipe(x) {
    const margin = 90;
    const gapY = margin + Math.random() * (H - margin * 2 - PIPE_GAP);
    const bloomColor = BLOOM_COLORS[Math.floor(Math.random() * BLOOM_COLORS.length)];
    pipes.push({ x, gapY, passed: false, bloomColor });
  }

  function flap() {
    if (state === 'ready') {
      reset();
      state = 'playing';
      startScreen.classList.add('hidden');
      hud.classList.remove('hidden');
    }
    if (state === 'dead') {
      reset();
      state = 'playing';
      gameoverScreen.classList.add('hidden');
      hud.classList.remove('hidden');
      return;
    }
    if (state === 'playing') {
      bird.vy = FLAP_VELOCITY;
      bird.flapT = 1;
      spawnFlapBurst(bird.x - BIRD_SIZE * 0.3, bird.y);
      playChirp();
    }
  }

  function die() {
    if (state !== 'playing') return;
    state = 'dead';
    if (score > best) {
      best = score;
      localStorage.setItem(BEST_KEY, String(best));
    }
    finalScoreEl.textContent = score;
    finalBestEl.textContent = best;
    hud.classList.add('hidden');
    gameoverScreen.classList.remove('hidden');
    playThud();
  }

  function update(dt) {
    if (state !== 'playing') return;
    elapsed += dt;
    speed = PIPE_SPEED + Math.floor(score / SPEED_STEP_EVERY) * SPEED_STEP_AMOUNT;

    bird.vy += GRAVITY * dt;
    bird.y += bird.vy * dt;
    bird.rot = Math.max(-0.5, Math.min(1.1, bird.vy / 600));
    bird.flapT = Math.max(0, bird.flapT - dt * 4);

    if (bird.y - BIRD_SIZE / 2 < 0) {
      bird.y = BIRD_SIZE / 2;
      bird.vy = 0;
    }
    if (bird.y + BIRD_SIZE / 2 > H) {
      die();
      return;
    }

    trailTimer -= dt;
    if (trailTimer <= 0) {
      spawnTrailParticle(bird.x - BIRD_SIZE * 0.6, bird.y + 4);
      trailTimer = 0.06;
    }
    updateParticles(dt);

    if (milestone) {
      milestone.timer -= dt;
      if (milestone.timer <= 0) milestone = null;
    }

    for (const p of pipes) {
      p.x -= speed * dt;

      if (!p.passed && p.x + PIPE_WIDTH < bird.x - BIRD_SIZE / 2) {
        p.passed = true;
        score++;
        scoreEl.textContent = score;

        for (const m of MILESTONES) {
          if (score === m.score && !milestonesHit.has(m.score)) {
            milestonesHit.add(m.score);
            milestone = { text: m.text, timer: 1.8, maxTimer: 1.8 };
            playChime();
          }
        }
      }

      const bx = bird.x, by = bird.y, r = BIRD_SIZE * 0.4;
      const withinX = bx + r > p.x && bx - r < p.x + PIPE_WIDTH;
      if (withinX) {
        const withinGap = by - r > p.gapY && by + r < p.gapY + PIPE_GAP;
        if (!withinGap) {
          die();
          return;
        }
      }
    }

    if (pipes.length && pipes[0].x < -PIPE_WIDTH) {
      pipes.shift();
      const lastX = pipes.length ? pipes[pipes.length - 1].x : W;
      spawnPipe(lastX + PIPE_SPACING);
    }
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function lerpColor(c1, c2, t) {
    return `rgb(${Math.round(lerp(c1[0], c2[0], t))},${Math.round(lerp(c1[1], c2[1], t))},${Math.round(lerp(c1[2], c2[2], t))})`;
  }

  const SKY_DAY_TOP = [126, 200, 227];
  const SKY_DAY_BOTTOM = [191, 233, 208];
  const SKY_SUNSET_TOP = [255, 183, 130];
  const SKY_SUNSET_BOTTOM = [255, 214, 204];

  function drawBackground() {
    const t = Math.min(elapsed / 60, 1);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, lerpColor(SKY_DAY_TOP, SKY_SUNSET_TOP, t));
    g.addColorStop(1, lerpColor(SKY_DAY_BOTTOM, SKY_SUNSET_BOTTOM, t));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    const cloudOffset = (elapsed * 20) % (W + 200);
    for (let i = 0; i < 3; i++) {
      const cx = ((i * 260) - cloudOffset + W + 200) % (W + 200) - 100;
      const cy = 80 + i * 120;
      drawCloud(cx, cy);
    }

    drawButterflies();

    ctx.fillStyle = '#8FBF6B';
    ctx.fillRect(0, H - 30, W, 30);
  }

  const BUTTERFLY_COLORS = ['#F7A6C4', '#F9E27D', '#B79CED'];

  function drawButterflies() {
    for (let i = 0; i < 3; i++) {
      const speed = 26 + i * 6;
      const offset = (elapsed * speed + i * 220) % (W + 160);
      const x = (W + 160) - offset - 80;
      const y = 140 + i * 110 + Math.sin(elapsed * 2.4 + i * 2) * 20;
      drawButterfly(x, y, BUTTERFLY_COLORS[i], elapsed * 10 + i * 3);
    }
  }

  function drawButterfly(x, y, color, flapPhase) {
    const wingSpan = 6 + Math.sin(flapPhase) * 3;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x - 4, y, wingSpan, 5, 0.4, 0, Math.PI * 2);
    ctx.ellipse(x + 4, y, wingSpan, 5, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(x - 0.7, y - 4, 1.4, 8);
  }

  function drawCloud(x, y) {
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.arc(x + 24, y - 8, 20, 0, Math.PI * 2);
    ctx.arc(x + 46, y, 22, 0, Math.PI * 2);
    ctx.fill();
  }

  const SCENE_SPEED = 32;
  const SCENE_CYCLE = 1150;
  const SCENE_PATTERN = [
    { type: 'house', offset: 0 },
    { type: 'pragya', offset: 460 },
    { type: 'diksha_gucci', offset: 830 },
  ];

  function drawScenery() {
    const groundTop = H - 30;
    const scroll = elapsed * SCENE_SPEED;
    for (const item of SCENE_PATTERN) {
      let wrapped = (item.offset - scroll) % SCENE_CYCLE;
      if (wrapped < 0) wrapped += SCENE_CYCLE;
      for (const x of [wrapped - SCENE_CYCLE, wrapped, wrapped + SCENE_CYCLE]) {
        if (x < -140 || x > W + 140) continue;
        if (item.type === 'house') drawHouse(x, groundTop);
        else if (item.type === 'pragya') drawPragyaGroup(x, groundTop);
        else if (item.type === 'diksha_gucci') drawDikshaGroup(x, groundTop);
      }
    }
  }

  function drawHouse(x, groundTop) {
    const w = 92, wallH = 54, roofH = 30;
    const baseY = groundTop;

    ctx.fillStyle = '#A65B4B';
    ctx.beginPath();
    ctx.moveTo(x - 10, baseY - wallH);
    ctx.lineTo(x + w / 2, baseY - wallH - roofH);
    ctx.lineTo(x + w + 10, baseY - wallH);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#F2DFC4';
    ctx.fillRect(x, baseY - wallH, w, wallH);
    ctx.strokeStyle = '#C9AD82';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, baseY - wallH, w, wallH);

    ctx.fillStyle = '#8B5E3C';
    const doorW = 18, doorH = 26;
    ctx.fillRect(x + w / 2 - doorW / 2, baseY - doorH, doorW, doorH);

    ctx.fillStyle = '#BFE3EE';
    ctx.strokeStyle = '#8B5E3C';
    ctx.lineWidth = 1.5;
    ctx.fillRect(x + 14, baseY - wallH + 12, 16, 16);
    ctx.strokeRect(x + 14, baseY - wallH + 12, 16, 16);
    ctx.fillRect(x + w - 30, baseY - wallH + 12, 16, 16);
    ctx.strokeRect(x + w - 30, baseY - wallH + 12, 16, 16);
  }

  function drawPerson(x, groundTop, opts) {
    const scale = opts.scale || 1;
    const headR = 9 * scale;
    const bodyW = 17 * scale;
    const bodyH = 26 * scale;
    const legH = 18 * scale;
    const baseY = groundTop;
    const legsY = baseY - legH;
    const bodyY = legsY - bodyH;
    const headCY = bodyY - headR + 1;

    ctx.fillStyle = opts.bottomColor;
    ctx.fillRect(x - bodyW / 2, legsY, bodyW / 2 - 2 * scale, legH);
    ctx.fillRect(x + 2 * scale, legsY, bodyW / 2 - 2 * scale, legH);

    ctx.strokeStyle = opts.skin;
    ctx.lineWidth = 4 * scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - bodyW / 2, bodyY + 4 * scale);
    ctx.lineTo(x - bodyW / 2 - 6 * scale, bodyY + bodyH - 4 * scale);
    ctx.moveTo(x + bodyW / 2, bodyY + 4 * scale);
    ctx.lineTo(x + bodyW / 2 + 6 * scale, bodyY + bodyH - 4 * scale);
    ctx.stroke();

    ctx.fillStyle = opts.topColor;
    ctx.fillRect(x - bodyW / 2, bodyY, bodyW, bodyH);

    ctx.fillStyle = opts.skin;
    ctx.beginPath();
    ctx.arc(x, headCY, headR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = opts.hairColor;
    if (opts.hairStyle === 'curly') {
      for (let i = 0; i <= 6; i++) {
        const ang = Math.PI + (i / 6) * Math.PI;
        const hx = x + Math.cos(ang) * headR * 0.95;
        const hy = headCY + Math.sin(ang) * headR * 0.95;
        ctx.beginPath();
        ctx.arc(hx, hy, headR * 0.42, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (opts.hairStyle === 'bun') {
      ctx.beginPath();
      ctx.arc(x, headCY - headR * 0.25, headR * 0.95, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, headCY - headR * 1.35, headR * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }

    if (opts.glasses) {
      ctx.strokeStyle = '#3a3a3a';
      ctx.lineWidth = 1.2 * scale;
      ctx.beginPath();
      ctx.arc(x - headR * 0.42, headCY + headR * 0.05, headR * 0.34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + headR * 0.42, headCY + headR * 0.05, headR * 0.34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - headR * 0.08, headCY + headR * 0.05);
      ctx.lineTo(x + headR * 0.08, headCY + headR * 0.05);
      ctx.stroke();
    }
  }

  function drawDog(x, groundTop) {
    const baseY = groundTop;
    const bodyR = 8;
    const cx = x, cy = baseY - bodyR;

    ctx.fillStyle = '#E3C29B';
    ctx.beginPath();
    ctx.ellipse(cx, cy, bodyR * 1.3, bodyR, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 5; i++) {
      const ang = (i / 4) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(ang) * bodyR * 0.9, cy + Math.sin(ang) * bodyR * 0.6, bodyR * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }

    const headCX = cx + bodyR * 1.15, headCY = cy - bodyR * 0.6;
    ctx.beginPath();
    ctx.arc(headCX, headCY, bodyR * 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(headCX - 4, headCY - 5, 3, 5, -0.3, 0, Math.PI * 2);
    ctx.ellipse(headCX + 5, headCY - 5, 3, 5, 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(headCX + 4, headCY, 1.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#D4AF7F';
    ctx.fillRect(cx - bodyR * 0.9, baseY - 2, 3, 4);
    ctx.fillRect(cx + bodyR * 0.4, baseY - 2, 3, 4);
  }

  function drawPragyaGroup(x, groundTop) {
    drawPerson(x, groundTop, {
      skin: '#E8B98C',
      hairColor: '#3B2A20',
      hairStyle: 'bun',
      topColor: '#8E6E53',
      bottomColor: '#4A6FA5',
      glasses: true,
      scale: 1.12,
    });
  }

  function drawDikshaGroup(x, groundTop) {
    drawPerson(x, groundTop, {
      skin: '#F5D9B8',
      hairColor: '#2E211A',
      hairStyle: 'curly',
      topColor: '#E8E4DC',
      bottomColor: '#4A6FA5',
      glasses: false,
      scale: 1,
    });
    drawDog(x + 22, groundTop);
  }

  const POT_COLOR = '#B5651D';
  const POT_RIM = '#8B4513';
  const STEM_COLOR = '#5FA052';
  const LEAF_COLOR = '#4E9F3D';

  function drawPipes() {
    for (const p of pipes) {
      const topH = p.gapY;
      const botY = p.gapY + PIPE_GAP;

      // Bottom: potted plant growing up from the ground toward the gap.
      const potH = 26;
      ctx.fillStyle = STEM_COLOR;
      ctx.fillRect(p.x, botY, PIPE_WIDTH, (H - potH) - botY);
      ctx.fillStyle = POT_COLOR;
      ctx.fillRect(p.x, H - potH, PIPE_WIDTH, potH);
      ctx.strokeStyle = POT_RIM;
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x, H - potH, PIPE_WIDTH, potH);
      ctx.fillStyle = POT_RIM;
      ctx.fillRect(p.x - 4, H - potH - 6, PIPE_WIDTH + 8, 8);
      drawLeafPair(p.x + PIPE_WIDTH / 2, botY, 1);

      // Top: hanging planter with vines trailing down toward the gap.
      const hangH = 22;
      ctx.fillStyle = POT_COLOR;
      ctx.fillRect(p.x, 0, PIPE_WIDTH, hangH);
      ctx.strokeStyle = POT_RIM;
      ctx.strokeRect(p.x, 0, PIPE_WIDTH, hangH);
      ctx.fillStyle = POT_RIM;
      ctx.fillRect(p.x - 4, hangH - 4, PIPE_WIDTH + 8, 8);
      ctx.fillStyle = STEM_COLOR;
      ctx.fillRect(p.x, hangH, PIPE_WIDTH, topH - hangH);
      drawLeafPair(p.x + PIPE_WIDTH / 2, topH, -1);
    }
  }

  function drawLeafPair(cx, edgeY, dir) {
    // dir: 1 = leaves sit below edgeY (bottom obstacle), -1 = above edgeY (top obstacle).
    // Stays entirely on the solid side of edgeY, same as a plain pipe edge would.
    const cy = edgeY + dir * 5;
    ctx.fillStyle = LEAF_COLOR;
    ctx.beginPath();
    ctx.ellipse(cx - 10, cy, 7, 4, 0.3, 0, Math.PI * 2);
    ctx.ellipse(cx + 10, cy, 7, 4, -0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFlower(cx, cy, size, color) {
    const petalR = size * 0.55;
    ctx.fillStyle = color;
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      const px = cx + Math.cos(ang) * size * 0.5;
      const py = cy + Math.sin(ang) * size * 0.5;
      ctx.beginPath();
      ctx.ellipse(px, py, petalR, petalR * 0.7, ang, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#FFF6C8';
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawForegroundFoliage() {
    // Flowers that bloom out into the gap, drawn after the bird so Mithoo
    // visually tucks behind them when he flies close to the edge. Purely
    // decorative — the actual hitbox is still just the pot/stem rectangle,
    // so this never changes what's actually safe to fly through.
    for (const p of pipes) {
      if (p.x < -60 || p.x > W + 60) continue;
      const cx = p.x + PIPE_WIDTH / 2;
      const botY = p.gapY + PIPE_GAP;
      const topH = p.gapY;

      drawFlower(cx - 10, botY - 6, 9, p.bloomColor);
      drawFlower(cx + 10, botY - 4, 8, p.bloomColor);
      drawFlower(cx, botY - 12, 7, p.bloomColor);

      drawFlower(cx - 10, topH + 6, 9, p.bloomColor);
      drawFlower(cx + 10, topH + 4, 8, p.bloomColor);
      drawFlower(cx, topH + 12, 7, p.bloomColor);
    }
  }

  function drawBird() {
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(bird.rot);

    const flap = bird.flapT > 0.5 ? -1 : 1;

    // Body: green, lovebird-style.
    ctx.fillStyle = '#5FA052';
    ctx.beginPath();
    ctx.ellipse(0, 2, BIRD_SIZE * 0.5, BIRD_SIZE * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tail: dark grey/black, trailing behind.
    ctx.fillStyle = '#3A3A3A';
    ctx.beginPath();
    ctx.moveTo(-BIRD_SIZE * 0.42, -2);
    ctx.lineTo(-BIRD_SIZE * 0.78, -8);
    ctx.lineTo(-BIRD_SIZE * 0.78, 10);
    ctx.lineTo(-BIRD_SIZE * 0.42, 10);
    ctx.closePath();
    ctx.fill();

    // Face: peach/orange, lovebird-style.
    ctx.fillStyle = '#F2924B';
    ctx.beginPath();
    ctx.ellipse(BIRD_SIZE * 0.22, -3, BIRD_SIZE * 0.28, BIRD_SIZE * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wing.
    ctx.fillStyle = '#4A7F40';
    ctx.beginPath();
    ctx.ellipse(-4, 4 * flap, BIRD_SIZE * 0.3, BIRD_SIZE * 0.17, -0.3 * flap, 0, Math.PI * 2);
    ctx.fill();

    // Beak.
    ctx.fillStyle = '#E8552B';
    ctx.beginPath();
    ctx.moveTo(BIRD_SIZE * 0.44, -3);
    ctx.lineTo(BIRD_SIZE * 0.68, 1);
    ctx.lineTo(BIRD_SIZE * 0.44, 6);
    ctx.closePath();
    ctx.fill();

    // Eye.
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(BIRD_SIZE * 0.28, -8, 2.6, 0, Math.PI * 2);
    ctx.fill();

    // Cosmetic unlock: a little flower crown once you've reached a good score.
    if (best >= CROWN_SCORE || score >= CROWN_SCORE) {
      drawFlower(BIRD_SIZE * 0.16, -BIRD_SIZE * 0.42, 7, '#FFD3E0');
    }

    ctx.restore();
  }

  function spawnFlapBurst(x, y) {
    for (let i = 0; i < 6; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * 60;
      particles.push({
        x, y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 20,
        life: 0.5,
        maxLife: 0.5,
        size: 3 + Math.random() * 2,
        color: Math.random() < 0.5 ? '#FFF6C8' : '#5FA052',
      });
    }
  }

  function spawnTrailParticle(x, y) {
    particles.push({
      x, y,
      vx: -30 - Math.random() * 20,
      vy: (Math.random() - 0.5) * 20,
      life: 0.6,
      maxLife: 0.6,
      size: 2.5 + Math.random() * 1.5,
      color: '#F2924B',
    });
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += 60 * dt;
      pt.life -= dt;
      if (pt.life <= 0) particles.splice(i, 1);
    }
  }

  function drawParticles() {
    for (const pt of particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.ellipse(pt.x, pt.y, pt.size, pt.size * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawMilestone() {
    if (!milestone) return;
    const fadeIn = Math.min(1, (milestone.maxTimer - milestone.timer) / 0.25);
    const fadeOut = Math.min(1, milestone.timer / 0.4);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(fadeIn, fadeOut));
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 6;
    ctx.fillText(milestone.text, W / 2, H * 0.32);
    ctx.restore();
  }

  function draw() {
    drawBackground();
    drawScenery();
    drawPipes();
    drawParticles();
    if (bird) drawBird();
    drawForegroundFoliage();
    drawMilestone();
  }

  let audioCtx;
  function ensureAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  function playChirp() {
    if (muted) return;
    ensureAudio();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, t);
    osc.frequency.exponentialRampToValueAtTime(2200, t + 0.06);
    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.12);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.15, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  function playThud() {
    if (muted) return;
    ensureAudio();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.25);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  function playChime() {
    if (muted) return;
    ensureAudio();
    const t = audioCtx.currentTime;
    [0, 0.12, 0.24].forEach((delay, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      const freq = [660, 880, 1100][i];
      osc.frequency.setValueAtTime(freq, t + delay);
      gain.gain.setValueAtTime(0.0001, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.12, t + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.25);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t + delay);
      osc.stop(t + delay + 0.3);
    });
  }

  let ambienceTimer = null;

  function playSoftPad() {
    if (muted) return;
    ensureAudio();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.02, t + 1.2);
    gain.gain.linearRampToValueAtTime(0.0001, t + 3.5);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 3.6);
  }

  function playSoftBirdChirp() {
    if (muted) return;
    ensureAudio();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    const base = 1800 + Math.random() * 800;
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.exponentialRampToValueAtTime(base * 1.3, t + 0.05);
    osc.frequency.exponentialRampToValueAtTime(base * 0.8, t + 0.1);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.05, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  function scheduleAmbienceTick() {
    playSoftPad();
    if (Math.random() < 0.5) {
      setTimeout(() => { if (!muted) playSoftBirdChirp(); }, 400 + Math.random() * 800);
    }
    ambienceTimer = setTimeout(scheduleAmbienceTick, 3000 + Math.random() * 2500);
  }

  function startAmbience() {
    if (muted || ambienceTimer) return;
    scheduleAmbienceTick();
  }

  function stopAmbience() {
    if (ambienceTimer) {
      clearTimeout(ambienceTimer);
      ambienceTimer = null;
    }
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.033);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  bird = { x: W * BIRD_X_RATIO, y: H / 2, vy: 0, rot: 0, flapT: 0 };
  pipes = [];
  score = 0;
  speed = PIPE_SPEED;
  elapsed = 0;
  particles = [];
  trailTimer = 0;
  milestone = null;
  milestonesHit = new Set();

  muteBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  muteBtn.addEventListener('click', () => {
    muted = !muted;
    localStorage.setItem(MUTED_KEY, muted ? '1' : '0');
    renderMuteBtn();
    if (muted) {
      stopAmbience();
    } else {
      ensureAudio();
      startAmbience();
    }
  });

  if (!navigator.share) {
    shareBtn.style.display = 'none';
  } else {
    shareBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    shareBtn.addEventListener('click', () => {
      navigator.share({
        title: "Mithoo's Adventure",
        text: `I scored ${score} in Mithoo's Adventure! 🐦`,
        url: location.href,
      }).catch(() => {});
    });
  }

  window.addEventListener('pointerdown', (e) => {
    ensureAudio();
    if (!muted) startAmbience();
    flap();
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') flap();
  });

  requestAnimationFrame(loop);
})();
