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

  const BEST_KEY = 'mithoo-best-score';
  let best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10);
  startBestEl.textContent = best;

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

  let state = 'ready'; // ready | playing | dead
  let bird, pipes, score, speed, elapsed;

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
    spawnPipe(W + 100);
    spawnPipe(W + 100 + PIPE_SPACING);
    spawnPipe(W + 100 + PIPE_SPACING * 2);
  }

  function spawnPipe(x) {
    const margin = 90;
    const gapY = margin + Math.random() * (H - margin * 2 - PIPE_GAP);
    pipes.push({ x, gapY, passed: false });
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

    for (const p of pipes) {
      p.x -= speed * dt;

      if (!p.passed && p.x + PIPE_WIDTH < bird.x - BIRD_SIZE / 2) {
        p.passed = true;
        score++;
        scoreEl.textContent = score;
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

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#7EC8E3');
    g.addColorStop(1, '#BFE9D0');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    const cloudOffset = (elapsed * 20) % (W + 200);
    for (let i = 0; i < 3; i++) {
      const cx = ((i * 260) - cloudOffset + W + 200) % (W + 200) - 100;
      const cy = 80 + i * 120;
      drawCloud(cx, cy);
    }

    ctx.fillStyle = '#8FBF6B';
    ctx.fillRect(0, H - 30, W, 30);
  }

  function drawCloud(x, y) {
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.arc(x + 24, y - 8, 20, 0, Math.PI * 2);
    ctx.arc(x + 46, y, 22, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPipes() {
    ctx.fillStyle = '#4E9F3D';
    ctx.strokeStyle = '#2E6B1F';
    ctx.lineWidth = 3;
    for (const p of pipes) {
      const topH = p.gapY;
      ctx.fillRect(p.x, 0, PIPE_WIDTH, topH);
      ctx.strokeRect(p.x, 0, PIPE_WIDTH, topH);
      ctx.fillRect(p.x - 5, topH - 24, PIPE_WIDTH + 10, 24);
      ctx.strokeRect(p.x - 5, topH - 24, PIPE_WIDTH + 10, 24);

      const botY = p.gapY + PIPE_GAP;
      ctx.fillRect(p.x, botY, PIPE_WIDTH, H - botY);
      ctx.strokeRect(p.x, botY, PIPE_WIDTH, H - botY);
      ctx.fillRect(p.x - 5, botY, PIPE_WIDTH + 10, 24);
      ctx.strokeRect(p.x - 5, botY, PIPE_WIDTH + 10, 24);
    }
  }

  function drawBird() {
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(bird.rot);

    const flap = bird.flapT > 0.5 ? -1 : 1;

    ctx.fillStyle = '#F2C94C';
    ctx.beginPath();
    ctx.ellipse(0, 0, BIRD_SIZE * 0.5, BIRD_SIZE * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#4FA37A';
    ctx.beginPath();
    ctx.ellipse(-4, 2 * flap, BIRD_SIZE * 0.32, BIRD_SIZE * 0.18, -0.3 * flap, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#EB5757';
    ctx.beginPath();
    ctx.moveTo(BIRD_SIZE * 0.45, -3);
    ctx.lineTo(BIRD_SIZE * 0.75, 2);
    ctx.lineTo(BIRD_SIZE * 0.45, 7);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(BIRD_SIZE * 0.18, -6, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function draw() {
    drawBackground();
    drawPipes();
    if (bird) drawBird();
  }

  let audioCtx;
  function ensureAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  function playChirp() {
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

  window.addEventListener('pointerdown', (e) => {
    ensureAudio();
    flap();
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') flap();
  });

  requestAnimationFrame(loop);
})();
