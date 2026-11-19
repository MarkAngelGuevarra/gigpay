import { useEffect, useRef } from 'react';

const BG_VERT_SRC = `
  attribute vec2 a_pos;
  void main() {
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`;

// Mouse-independent Quiet Horizon tucked along the bottom edge with slow organic breathing
const BG_FRAG_SRC = `
  precision highp float;
  uniform vec2 u_res;
  uniform float u_time;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_res.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * u_res.xy) / u_res.y;

    vec2 center = vec2(0.0, -1.68);
    float d = length(p - center);
    float radius = 1.24;

    float hairline = exp(-abs(d - radius) * 68.0);
    float bloom = exp(-max(0.0, d - radius) * 10.8) * smoothstep(radius - 0.02, radius + 0.015, d);

    float t = u_time * 0.20;
    float drift = 0.74 + 0.26 * noise(vec2(p.x * 1.9 + t * 0.48, t * 0.32));
    float pulse = 0.88 + 0.12 * sin(t * 1.05 + p.x * 1.6);
    float edgeFade = smoothstep(0.96, 0.16, abs(uv.x - 0.5) * 2.0);

    vec3 base = vec3(0.035, 0.035, 0.043);
    vec3 emerald = vec3(0.063, 0.725, 0.506);
    vec3 mist = vec3(0.45, 0.90, 0.75);

    vec3 col = base;
    col += emerald * bloom * 0.28 * drift * pulse * edgeFade;
    col += mist * hairline * 0.46 * drift * pulse * edgeFade;
    col += (hash(gl_FragCoord.xy) - 0.5) * 0.011;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const PT_VERT_SRC = `
  attribute vec2 a_pos;
  attribute float a_size;
  attribute vec4 a_color;
  uniform vec2 u_res;
  varying vec4 v_color;
  void main() {
    vec2 clip = (a_pos / u_res) * 2.0 - 1.0;
    clip.y = -clip.y;
    gl_Position = vec4(clip, 0.0, 1.0);
    gl_PointSize = a_size;
    v_color = a_color;
  }
`;

const PT_FRAG_SRC = `
  precision mediump float;
  varying vec4 v_color;
  void main() {
    vec2 c = abs(gl_PointCoord - 0.5);
    float edge = max(c.x, c.y);
    float mask = 1.0 - smoothstep(0.41, 0.50, edge);
    if (mask < 0.01) discard;
    float rim = smoothstep(0.28, 0.45, edge) * 0.14;
    gl_FragColor = vec4(v_color.rgb + rim * v_color.rgb, v_color.a * mask);
  }
`;

const compileShader = (gl, type, source) => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
};

const createProgram = (gl, vertSrc, fragSrc) => {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
};

const hash2 = (x, y) => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

// Restrained centered QR Matrix frame with quiet graphite base, subtle multi-speed twinkling, and corner finders
const buildQrMatrixParticles = (width, height) => {
  const particles = [];
  const isCompact = width < 640;
  const step = isCompact ? 14 : 15;

  // Bound the QR matrix to a centered architectural frame so it frames the hero without spanning edge-to-edge
  const frameW = isCompact
    ? Math.min(width * 0.86, 350)
    : Math.min(width * 0.64, 780);
  const frameH = isCompact
    ? Math.min(height * 0.54, 410)
    : Math.min(height * 0.62, 500);

  const cols = Math.max(11, Math.floor(frameW / step));
  const rows = Math.max(9, Math.floor(frameH / step));
  const cx = width * 0.5;
  const cy = height * 0.48;
  const originX = cx - ((cols - 1) * step) * 0.5;
  const originY = cy - ((rows - 1) * step) * 0.5;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = originX + c * step;
      const y = originY + r * step;

      const tl = c < 5 && r < 5 && (c === 0 || c === 4 || r === 0 || r === 4 || (c === 2 && r === 2));
      const tr = c >= cols - 5 && r < 5 && (c === cols - 5 || c === cols - 1 || r === 0 || r === 4 || (c === cols - 3 && r === 2));
      const bl = c < 5 && r >= rows - 5 && (c === 0 || c === 4 || r === rows - 5 || r === rows - 1 || (c === 2 && r === rows - 3));
      const br = c >= cols - 5 && r >= rows - 5 && (c === cols - 5 || c === cols - 1 || r === rows - 5 || r === rows - 1 || (c === cols - 3 && r === rows - 3));

      const frac = hash2(c + 1, r + 1);
      const toneRand = hash2(c * 3.1 + 7, r * 2.7 + 11);
      const speedRand = hash2(c * 5.3 + 19, r * 4.1 + 23);
      const phaseRand = hash2(c * 7.7 + 31, r * 6.3 + 37);

      // Keep the center typography area calm while preserving crisp framing blocks around it
      const normX = (x - cx) / Math.max(120, frameW * 0.44);
      const normY = (y - cy) / Math.max(100, frameH * 0.42);
      const centerDist = Math.hypot(normX, normY);
      const isData = centerDist > 0.86 ? frac > 0.64 : centerDist > 0.58 ? frac > 0.85 : false;

      if (tl || tr || bl || br || isData) {
        const isFinder = tl || tr || bl || br;

        // Subtle color palette tiers: quiet graphite, cool silver glint, soft teal-mint, Signal Green
        let baseR = 0.24;
        let baseG = 0.25;
        let baseB = 0.29;
        let baseA = isFinder ? 0.22 : 0.13;
        let twinkleAmp = isFinder ? 0.09 : 0.08;

        if (br) {
          baseR = 0.07;
          baseG = 0.68;
          baseB = 0.48;
          baseA = 0.34;
          twinkleAmp = 0.18;
        } else if (!isFinder && toneRand > 0.90) {
          // Signal Green twinkling star dot
          baseR = 0.09;
          baseG = 0.74;
          baseB = 0.53;
          baseA = 0.24;
          twinkleAmp = 0.28;
        } else if (!isFinder && toneRand > 0.78) {
          // Soft teal-mint shimmer dot
          baseR = 0.14;
          baseG = 0.54;
          baseB = 0.46;
          baseA = 0.17;
          twinkleAmp = 0.18;
        } else if (!isFinder && toneRand > 0.62) {
          // Subtle cool silver-slate glint
          baseR = 0.42;
          baseG = 0.46;
          baseB = 0.53;
          baseA = 0.14;
          twinkleAmp = 0.16;
        }

        particles.push({
          hx: x,
          hy: y,
          x,
          y,
          vx: 0,
          vy: 0,
          r: baseR,
          g: baseG,
          b: baseB,
          a: baseA,
          twinkleAmp,
          twinkleSpeed: 0.45 + speedRand * 2.15,
          twinklePhase: phaseRand * Math.PI * 2,
          baseSize: isFinder ? 6.2 : 4.8 + (toneRand > 0.86 ? 0.8 : 0),
          energy: 0,
        });
      }
    }
  }

  return { particles, minSpacing: step * 0.86 };
};

const LandingShaderCanvas = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof window === 'undefined') return undefined;

    let gl = null;
    try {
      gl = canvas.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'low-power' });
    } catch {
      gl = null;
    }
    if (!gl) return undefined;

    const bgProg = createProgram(gl, BG_VERT_SRC, BG_FRAG_SRC);
    const ptProg = createProgram(gl, PT_VERT_SRC, PT_FRAG_SRC);
    if (!bgProg || !ptProg) return undefined;

    const bgLoc = {
      pos: gl.getAttribLocation(bgProg, 'a_pos'),
      res: gl.getUniformLocation(bgProg, 'u_res'),
      time: gl.getUniformLocation(bgProg, 'u_time'),
    };
    const ptLoc = {
      pos: gl.getAttribLocation(ptProg, 'a_pos'),
      size: gl.getAttribLocation(ptProg, 'a_size'),
      color: gl.getAttribLocation(ptProg, 'a_color'),
      res: gl.getUniformLocation(ptProg, 'u_res'),
    };

    const bgBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bgBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

    const ptBuf = gl.createBuffer();

    let stageW = 1;
    let stageH = 1;
    let particles = [];
    let minSpacing = 12;
    let isVisible = true;
    let rafId = 0;

    const ptr = { x: -999, y: -999, vx: 0, vy: 0, active: false };
    const reducedMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    const rebuildGrid = () => {
      const parent = canvas.parentElement;
      const rect = parent ? parent.getBoundingClientRect() : canvas.getBoundingClientRect();
      stageW = Math.max(240, Math.floor(rect.width));
      stageH = Math.max(320, Math.floor(rect.height));
      const built = buildQrMatrixParticles(stageW, stageH);
      particles = built.particles;
      minSpacing = built.minSpacing;
    };

    const handlePointerMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const nx = e.clientX - rect.left;
      const ny = e.clientY - rect.top;
      if (nx < 0 || ny < 0 || nx > rect.width || ny > rect.height) {
        ptr.active = false;
        return;
      }
      if (ptr.active) {
        ptr.vx = (nx - ptr.x) * 0.65 + ptr.vx * 0.35;
        ptr.vy = (ny - ptr.y) * 0.65 + ptr.vy * 0.35;
      }
      ptr.x = nx;
      ptr.y = ny;
      ptr.active = true;
    };

    const handlePointerLeave = () => {
      ptr.active = false;
      ptr.vx = 0;
      ptr.vy = 0;
    };

    const stepPhysics = () => {
      const speed = Math.hypot(ptr.vx, ptr.vy);
      const slashRadius = 76;
      const activeSlash = ptr.active && speed > 0.35;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (activeSlash) {
          const dx = p.x - ptr.x;
          const dy = p.y - ptr.y;
          const d = Math.hypot(dx, dy);
          if (d < slashRadius && d > 0.001) {
            const falloff = Math.pow(1 - d / slashRadius, 1.6);
            const nx = dx / d;
            const ny = dy / d;
            const impulse = Math.min(speed * 0.25, 4.8) * falloff;
            p.vx += nx * impulse + ptr.vx * 0.05 * falloff;
            p.vy += ny * impulse + ptr.vy * 0.05 * falloff;
            p.energy = Math.min(1, p.energy + falloff * 0.78);
          }
        }
        p.vx = (p.vx + (p.hx - p.x) * 0.022) * 0.87;
        p.vy = (p.vy + (p.hy - p.y) * 0.022) * 0.87;
        p.x += p.vx;
        p.y += p.vy;
        p.energy *= 0.94;
      }

      const cell = minSpacing;
      const buckets = new Map();
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const gx = Math.floor(p.x / cell);
        const gy = Math.floor(p.y / cell);
        const key = (gx + 500) * 1000 + (gy + 500);
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = [];
          buckets.set(key, bucket);
        }
        bucket.push(i);
      }

      const minSq = minSpacing * minSpacing;
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        const gx = Math.floor(a.x / cell);
        const gy = Math.floor(a.y / cell);
        for (let ox = -1; ox <= 1; ox++) {
          for (let oy = -1; oy <= 1; oy++) {
            const list = buckets.get((gx + ox + 500) * 1000 + (gy + oy + 500));
            if (!list) continue;
            for (let k = 0; k < list.length; k++) {
              const j = list[k];
              if (j <= i) continue;
              const b = particles[j];
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const dSq = dx * dx + dy * dy;
              if (dSq < minSq && dSq > 0.0001) {
                const d = Math.sqrt(dSq);
                const push = (minSpacing - d) * 0.52;
                const nx = dx / d;
                const ny = dy / d;
                a.x -= nx * push;
                a.y -= ny * push;
                b.x += nx * push;
                b.y += ny * push;
              }
            }
          }
        }
      }

      ptr.vx *= 0.78;
      ptr.vy *= 0.78;
    };

    const startTime = performance.now();
    let vertexData = new Float32Array(0);

    const draw = (now) => {
      if (!isVisible || document.hidden) {
        rafId = 0;
        return;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pw = Math.floor(stageW * dpr);
      const ph = Math.floor(stageH * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }

      if (!reducedMotion) stepPhysics();

      const elapsed = reducedMotion ? 1.0 : (now - startTime) * 0.001;

      gl.viewport(0, 0, pw, ph);
      gl.disable(gl.BLEND);

      // Pass 1: Mouse-independent Quiet Horizon background
      gl.useProgram(bgProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, bgBuf);
      if (bgLoc.pos >= 0) {
        gl.enableVertexAttribArray(bgLoc.pos);
        gl.vertexAttribPointer(bgLoc.pos, 2, gl.FLOAT, false, 0, 0);
      }
      gl.uniform2f(bgLoc.res, pw, ph);
      gl.uniform1f(bgLoc.time, elapsed);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (bgLoc.pos >= 0) gl.disableVertexAttribArray(bgLoc.pos);

      // Pass 2: Restrained Kinetic QR Matrix with varied per-dot twinkle speeds and subtle color shifts
      const neededLen = particles.length * 7;
      if (vertexData.length !== neededLen) {
        vertexData = new Float32Array(neededLen);
      }

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const o = i * 7;
        const rawWave = 0.5 + 0.5 * Math.sin(elapsed * p.twinkleSpeed + p.twinklePhase);
        const twinkle = reducedMotion ? 0.5 : Math.pow(rawWave, 1.85);
        const boost = p.energy;

        vertexData[o] = p.x * dpr;
        vertexData[o + 1] = p.y * dpr;
        vertexData[o + 2] = (p.baseSize + twinkle * 0.55 + boost * 1.1) * dpr;

        // Blend subtle resting tint toward luminous emerald when energized by cursor interaction
        vertexData[o + 3] = Math.min(1, p.r * (0.9 + twinkle * 0.25) + boost * (0.14 - p.r * 0.35));
        vertexData[o + 4] = Math.min(1, p.g * (0.9 + twinkle * 0.25) + boost * 0.52);
        vertexData[o + 5] = Math.min(1, p.b * (0.9 + twinkle * 0.25) + boost * 0.36);
        vertexData[o + 6] = Math.min(0.92, p.a + twinkle * p.twinkleAmp + boost * 0.55);
      }

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(ptProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, ptBuf);
      gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.DYNAMIC_DRAW);
      gl.uniform2f(ptLoc.res, pw, ph);

      const stride = 7 * 4;
      if (ptLoc.pos >= 0) {
        gl.enableVertexAttribArray(ptLoc.pos);
        gl.vertexAttribPointer(ptLoc.pos, 2, gl.FLOAT, false, stride, 0);
      }
      if (ptLoc.size >= 0) {
        gl.enableVertexAttribArray(ptLoc.size);
        gl.vertexAttribPointer(ptLoc.size, 1, gl.FLOAT, false, stride, 2 * 4);
      }
      if (ptLoc.color >= 0) {
        gl.enableVertexAttribArray(ptLoc.color);
        gl.vertexAttribPointer(ptLoc.color, 4, gl.FLOAT, false, stride, 3 * 4);
      }
      gl.drawArrays(gl.POINTS, 0, particles.length);
      if (ptLoc.pos >= 0) gl.disableVertexAttribArray(ptLoc.pos);
      if (ptLoc.size >= 0) gl.disableVertexAttribArray(ptLoc.size);
      if (ptLoc.color >= 0) gl.disableVertexAttribArray(ptLoc.color);

      if (!reducedMotion) {
        rafId = requestAnimationFrame(draw);
      } else {
        rafId = 0;
      }
    };

    const startLoop = () => {
      if (!rafId && isVisible && !document.hidden) {
        rafId = requestAnimationFrame(draw);
      }
    };

    const handleResize = () => {
      rebuildGrid();
      if (reducedMotion) startLoop();
    };

    let observer = null;
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          isVisible = entries[0]?.isIntersecting ?? true;
          if (isVisible) startLoop();
          else if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
          }
        },
        { threshold: 0.05 }
      );
      observer.observe(canvas);
    }

    const handleVisibilityChange = () => {
      if (!document.hidden && isVisible) startLoop();
      else if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    rebuildGrid();
    startLoop();

    window.addEventListener('resize', handleResize);
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.addEventListener('pointerleave', handlePointerLeave);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (observer) observer.disconnect();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerleave', handlePointerLeave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      gl.deleteBuffer(bgBuf);
      gl.deleteBuffer(ptBuf);
      gl.deleteProgram(bgProg);
      gl.deleteProgram(ptProg);
    };
  }, []);

  return <canvas ref={canvasRef} className="gp-landing-canvas" aria-hidden="true" />;
};

export default LandingShaderCanvas;
