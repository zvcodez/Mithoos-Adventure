(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const startScreen = document.getElementById('start-screen');
  const gameoverScreen = document.getElementById('gameover-screen');
  const pauseScreen = document.getElementById('pause-screen');
  const hud = document.getElementById('hud');
  const scoreEl = document.getElementById('score');
  const finalScoreEl = document.getElementById('final-score');
  const finalBestEl = document.getElementById('final-best');
  const finalTodayEl = document.getElementById('final-today');
  const startBestEl = document.getElementById('start-best');
  const startTodayEl = document.getElementById('start-today');
  const unlockHintEl = document.getElementById('unlock-hint');
  const newBestEl = document.getElementById('new-best');
  const medalRowEl = document.getElementById('medal-row');
  const medalCircleEl = document.getElementById('medal-circle');
  const medalNameEl = document.getElementById('medal-name');
  const muteBtn = document.getElementById('mute-btn');
  const muteSlashEl = document.getElementById('mute-slash');
  const shareBtn = document.getElementById('share-btn');

  const BEST_KEY = 'mithoo-best-score';
  const MUTED_KEY = 'mithoo-muted';
  const DAILY_KEY = 'mithoo-daily-best';

  function todayStr() {
    // Local date (not UTC) so "today" rolls over at the player's midnight.
    return new Date().toLocaleDateString('en-CA');
  }

  let best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10);
  let muted = localStorage.getItem(MUTED_KEY) === '1';
  let daily = { date: todayStr(), score: 0 };
  try {
    const saved = JSON.parse(localStorage.getItem(DAILY_KEY));
    if (saved && saved.date === todayStr()) daily = saved;
  } catch (_) {}

  startBestEl.textContent = best;
  startTodayEl.textContent = daily.score;

  function renderMuteBtn() {
    muteSlashEl.classList.toggle('hidden', !muted);
  }
  renderMuteBtn();

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
  const DEATH_LOCKOUT_MS = 600;
  const BERRY_CHANCE = 0.35;
  const BERRY_EDGE_OFFSET = 26;
  const BERRY_POINTS = 2;

  const MILESTONES = [
    { score: 10, text: 'Nice flight!' },
    { score: 25, text: "Mithoo's proud!" },
    { score: 50, text: 'Soaring high!' },
    { score: 100, text: 'Incredible!' },
  ];

  const MEDALS = [
    { score: 50, name: 'Gold medal', cls: 'gold' },
    { score: 25, name: 'Silver medal', cls: 'silver' },
    { score: 10, name: 'Bronze medal', cls: 'bronze' },
  ];

  const UNLOCKS = [
    { score: 15, name: 'Flower crown' },
    { score: 30, name: 'Cozy scarf' },
    { score: 50, name: 'Cool shades' },
    { score: 75, name: 'Golden trail' },
  ];

  let state = 'ready'; // ready | playing | paused | countdown | dead
  let bird, pipes, berries, score, speed, elapsed;
  let particles, floaters, trailTimer, milestone, milestonesHit;
  let countdownT = 0;
  let deathAt = 0;

  function hasUnlock(s) {
    return best >= s || score >= s;
  }

  function renderUnlockHint() {
    const next = UNLOCKS.find((u) => best < u.score);
    unlockHintEl.textContent = next
      ? `Next unlock: ${next.name} at ${next.score}`
      : 'All cosmetics unlocked! 🌟';
  }
  renderUnlockHint();

  let W, H, DPR;
  function resize() {
    DPR = window.devicePixelRatio || 1;
    W = canvas.clientWidth = window.innerWidth;
    H = canvas.clientHeight = window.innerHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // Keep the bird and pipe gaps sane if the phone rotates mid-run.
    if (bird) bird.x = W * BIRD_X_RATIO;
    if (pipes) {
      for (const p of pipes) {
        p.gapY = Math.max(90, Math.min(p.gapY, H - 90 - PIPE_GAP));
      }
    }
  }
  window.addEventListener('resize', resize);
  resize();

  function reset() {
    bird = {
      x: W * BIRD_X_RATIO,
      y: H / 2,
      vy: 0,
      rot: 0,
      flapT: 0,
    };
    pipes = [];
    berries = [];
    score = 0;
    scoreEl.textContent = '0';
    speed = PIPE_SPEED;
    elapsed = 0;
    particles = [];
    floaters = [];
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

    // Risk/reward berry: sits inside the gap, hugging one edge.
    if (Math.random() < BERRY_CHANCE) {
      const nearTop = Math.random() < 0.5;
      berries.push({
        x: x + PIPE_WIDTH / 2,
        y: nearTop ? gapY + BERRY_EDGE_OFFSET : gapY + PIPE_GAP - BERRY_EDGE_OFFSET,
      });
    }
  }

  function beginResume() {
    pauseScreen.classList.add('hidden');
    state = 'countdown';
    countdownT = 3;
  }

  function pauseGame() {
    if (state !== 'playing' && state !== 'countdown') return;
    state = 'paused';
    pauseScreen.classList.remove('hidden');
    stopAmbience();
  }

  function flap() {
    if (state === 'paused') {
      beginResume();
      return;
    }
    if (state === 'countdown') return;
    if (state === 'ready') {
      reset();
      state = 'playing';
      startScreen.classList.add('hidden');
      hud.classList.remove('hidden');
    }
    if (state === 'dead') {
      // Ignore the frantic taps that come right after crashing, so the
      // game-over screen is actually seen before a restart.
      if (performance.now() - deathAt < DEATH_LOCKOUT_MS) return;
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
    deathAt = performance.now();

    const isNewBest = score > 0 && score > best;
    if (isNewBest) {
      best = score;
      localStorage.setItem(BEST_KEY, String(best));
      spawnConfetti();
    }

    if (daily.date !== todayStr()) daily = { date: todayStr(), score: 0 };
    if (score > daily.score) {
      daily.score = score;
      localStorage.setItem(DAILY_KEY, JSON.stringify(daily));
    }

    finalScoreEl.textContent = score;
    finalBestEl.textContent = best;
    finalTodayEl.textContent = daily.score;
    newBestEl.classList.toggle('hidden', !isNewBest);

    const medal = MEDALS.find((m) => score >= m.score);
    medalRowEl.classList.toggle('hidden', !medal);
    if (medal) {
      medalCircleEl.className = 'medal ' + medal.cls;
      medalNameEl.textContent = medal.name;
    }

    renderUnlockHint();
    hud.classList.add('hidden');
    gameoverScreen.classList.remove('hidden');
    playThud();
  }

  function checkMilestones() {
    for (const m of MILESTONES) {
      if (score >= m.score && !milestonesHit.has(m.score)) {
        milestonesHit.add(m.score);
        milestone = { text: m.text, timer: 1.8, maxTimer: 1.8 };
        playChime();
      }
    }
  }

  function update(dt) {
    updateParticles(dt);
    updateFloaters(dt);

    if (state === 'countdown') {
      countdownT -= dt;
      if (countdownT <= 0) {
        countdownT = 0;
        state = 'playing';
      }
      return;
    }
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
        checkMilestones();
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

    for (let i = berries.length - 1; i >= 0; i--) {
      const b = berries[i];
      b.x -= speed * dt;
      if (b.x < -30) {
        berries.splice(i, 1);
        continue;
      }
      const dx = b.x - bird.x, dy = b.y - bird.y;
      const rr = BIRD_SIZE * 0.4 + 11;
      if (dx * dx + dy * dy < rr * rr) {
        berries.splice(i, 1);
        score += BERRY_POINTS;
        scoreEl.textContent = score;
        spawnBerryBurst(b.x, b.y);
        floaters.push({ x: b.x, y: b.y - 14, vy: -46, life: 0.9, maxLife: 0.9, text: '+' + BERRY_POINTS });
        playPop();
        checkMilestones();
      }
    }

    if (pipes.length && pipes[0].x < -PIPE_WIDTH) {
      pipes.shift();
      const lastX = pipes.length ? pipes[pipes.length - 1].x : W;
      spawnPipe(lastX + PIPE_SPACING);
    }
  }

  // Sky shifts from day to sunset to starry night as the score climbs.
  const SKY_DAY = [[126, 200, 227], [191, 233, 208]];
  const SKY_SUNSET = [[95, 74, 139], [255, 166, 107]];
  const SKY_NIGHT = [[18, 32, 66], [58, 80, 120]];
  const GROUND_DAY = [143, 191, 107];
  const GROUND_NIGHT = [74, 107, 69];

  function mixC(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function cssC(c) {
    return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
  }

  function computeSky() {
    const s = score || 0;
    if (s < 20) return { top: SKY_DAY[0], bot: SKY_DAY[1], night: 0 };
    if (s < 25) {
      const t = (s - 20) / 5;
      return { top: mixC(SKY_DAY[0], SKY_SUNSET[0], t), bot: mixC(SKY_DAY[1], SKY_SUNSET[1], t), night: 0 };
    }
    if (s < 45) return { top: SKY_SUNSET[0], bot: SKY_SUNSET[1], night: 0 };
    if (s < 50) {
      const t = (s - 45) / 5;
      return { top: mixC(SKY_SUNSET[0], SKY_NIGHT[0], t), bot: mixC(SKY_SUNSET[1], SKY_NIGHT[1], t), night: t };
    }
    return { top: SKY_NIGHT[0], bot: SKY_NIGHT[1], night: 1 };
  }

  const stars = [];
  for (let i = 0; i < 40; i++) {
    stars.push({
      rx: Math.random(),
      ry: Math.random() * 0.6,
      tw: Math.random() * Math.PI * 2,
      r: 0.8 + Math.random() * 1.4,
    });
  }

  function drawStars(night) {
    if (night <= 0) return;
    ctx.fillStyle = '#FFF8DC';
    for (const st of stars) {
      ctx.globalAlpha = night * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(elapsed * 1.5 + st.tw)));
      ctx.beginPath();
      ctx.arc(st.rx * W, st.ry * H, st.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawBackground() {
    const sky = computeSky();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, cssC(sky.top));
    g.addColorStop(1, cssC(sky.bot));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    drawStars(sky.night);

    ctx.fillStyle = `rgba(255,255,255,${0.55 - 0.3 * sky.night})`;
    const cloudOffset = (elapsed * 20) % (W + 200);
    for (let i = 0; i < 3; i++) {
      const cx = ((i * 260) - cloudOffset + W + 200) % (W + 200) - 100;
      const cy = 80 + i * 120;
      drawCloud(cx, cy);
    }

    drawButterflies();

    ctx.fillStyle = cssC(mixC(GROUND_DAY, GROUND_NIGHT, sky.night));
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

  function roundRectPath(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  function drawPerson(x, groundTop, opts) {
    const scale = opts.scale || 1;
    const headR = 9.5 * scale;
    const bodyW = 16 * scale;
    const bodyH = 25 * scale;
    const legH = 18 * scale;
    const legW = 5.5 * scale;
    const legGap = 3 * scale;
    const baseY = groundTop;
    const legsY = baseY - legH;
    const bodyY = legsY - bodyH;
    const headCY = bodyY - headR + 1.5 * scale;

    ctx.fillStyle = opts.bottomColor;
    roundRectPath(x - legGap / 2 - legW, legsY, legW, legH, legW / 2);
    ctx.fill();
    roundRectPath(x + legGap / 2, legsY, legW, legH, legW / 2);
    ctx.fill();

    ctx.strokeStyle = opts.skin;
    ctx.lineWidth = 3.6 * scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - bodyW / 2 + 1 * scale, bodyY + 4 * scale);
    ctx.quadraticCurveTo(x - bodyW / 2 - 5 * scale, bodyY + bodyH * 0.5, x - bodyW / 2 - 2 * scale, bodyY + bodyH - 3 * scale);
    ctx.moveTo(x + bodyW / 2 - 1 * scale, bodyY + 4 * scale);
    ctx.quadraticCurveTo(x + bodyW / 2 + 5 * scale, bodyY + bodyH * 0.5, x + bodyW / 2 + 2 * scale, bodyY + bodyH - 3 * scale);
    ctx.stroke();

    ctx.fillStyle = opts.topColor;
    roundRectPath(x - bodyW / 2, bodyY, bodyW, bodyH, bodyW * 0.35);
    ctx.fill();

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

    ctx.fillStyle = '#F2E8D0';
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

    ctx.fillStyle = '#E3D5AC';
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

  function drawBerries() {
    for (const b of berries) {
      if (b.x < -30 || b.x > W + 30) continue;
      ctx.fillStyle = '#C0392B';
      ctx.beginPath();
      ctx.arc(b.x - 4, b.y + 2, 5.5, 0, Math.PI * 2);
      ctx.arc(b.x + 4, b.y + 2, 5.5, 0, Math.PI * 2);
      ctx.arc(b.x, b.y - 4, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(b.x - 5, b.y - 5, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = LEAF_COLOR;
      ctx.beginPath();
      ctx.ellipse(b.x + 3, b.y - 10, 5, 2.5, -0.5, 0, Math.PI * 2);
      ctx.fill();
    }
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

    // Cosmetic unlock: cozy scarf.
    if (hasUnlock(30)) {
      ctx.strokeStyle = '#D64545';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 2, BIRD_SIZE * 0.36, -0.15 * Math.PI, 0.55 * Math.PI);
      ctx.stroke();
      ctx.fillStyle = '#D64545';
      roundRectPath(-2, BIRD_SIZE * 0.3, 6, 12, 3);
      ctx.fill();
    }

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

    // Cosmetic unlock: cool shades over the eye.
    if (hasUnlock(50)) {
      ctx.fillStyle = '#222';
      roundRectPath(BIRD_SIZE * 0.12, -12, BIRD_SIZE * 0.32, 8, 3);
      ctx.fill();
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(BIRD_SIZE * 0.12, -9);
      ctx.lineTo(-BIRD_SIZE * 0.05, -11);
      ctx.stroke();
    }

    // Cosmetic unlock: flower crown.
    if (hasUnlock(15)) {
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

  function spawnBerryBurst(x, y) {
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 50 + Math.random() * 70;
      particles.push({
        x, y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 30,
        life: 0.5,
        maxLife: 0.5,
        size: 2.5 + Math.random() * 2,
        color: Math.random() < 0.5 ? '#C0392B' : '#FFC145',
      });
    }
  }

  function spawnConfetti() {
    const colors = ['#FF6B81', '#FFC145', '#5FA052', '#4A6FA5', '#FFD700', '#B79CED'];
    for (let i = 0; i < 70; i++) {
      const l = 1.6 + Math.random() * 1.2;
      particles.push({
        x: Math.random() * W,
        y: -10 - Math.random() * H * 0.3,
        vx: (Math.random() - 0.5) * 60,
        vy: 80 + Math.random() * 120,
        life: l,
        maxLife: l,
        size: 3 + Math.random() * 3,
        color: colors[Math.floor(Math.random() * colors.length)],
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
      // Cosmetic unlock: golden trail.
      color: hasUnlock(75) ? '#FFD700' : '#F2924B',
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

  function updateFloaters(dt) {
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.y += f.vy * dt;
      f.life -= dt;
      if (f.life <= 0) floaters.splice(i, 1);
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

  function drawFloaters() {
    if (!floaters.length) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, sans-serif';
    for (const f of floaters) {
      ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
      ctx.fillStyle = '#fff';
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 4;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
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

  function drawCountdown() {
    if (state !== 'countdown') return;
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 72px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 8;
    ctx.fillText(String(Math.max(1, Math.ceil(countdownT))), W / 2, H * 0.42);
    ctx.restore();
  }

  function draw() {
    drawBackground();
    drawScenery();
    drawPipes();
    drawBerries();
    drawParticles();
    if (bird) drawBird();
    drawForegroundFoliage();
    drawFloaters();
    drawMilestone();
    drawCountdown();
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

  function playPop() {
    if (muted) return;
    ensureAudio();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(1600, t + 0.08);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.14, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.13);
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
  berries = [];
  score = 0;
  speed = PIPE_SPEED;
  elapsed = 0;
  particles = [];
  floaters = [];
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

  // Auto-pause when the app is backgrounded (switching apps, notifications,
  // locking the phone) so a commute interruption never costs a run.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseGame();
  });
  window.addEventListener('pagehide', pauseGame);
  window.addEventListener('blur', pauseGame);

  window.addEventListener('pointerdown', () => {
    ensureAudio();
    if (!muted) startAmbience();
    flap();
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat) flap();
  });

  requestAnimationFrame(loop);
})();
