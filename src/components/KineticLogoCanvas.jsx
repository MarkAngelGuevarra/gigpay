import { useEffect, useRef, useState } from 'react';
import { BrandLockup } from './BrandMark';

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
    float mask = 1.0 - smoothstep(0.40, 0.50, edge);
    if (mask < 0.01) discard;
    gl_FragColor = vec4(v_color.rgb, v_color.a * mask);
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

// Rasterize Verified Payout Seal + GigPay wordmark into crisp non-overlapping square particles
const sampleBrandParticles = (width, height) => {
  const off = document.createElement('canvas');
  off.width = width;
  off.height = height;
  const ctx = off.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { particles: [], spacing: 5 };

  const isCompact = width < 640;
  const sealSize = isCompact ? Math.min(86, width * 0.23) : Math.min(154, width * 0.145);
  const fontSize = isCompact ? Math.min(64, width * 0.17) : Math.min(138, width * 0.125);
  const gap = isCompact ? 18 : 34;

  ctx.font = `700 ${fontSize}px Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  const textMetrics = ctx.measureText('GigPay');
  const textW = textMetrics.width;
  const totalW = sealSize + gap + textW;
  const startX = (width - totalW) * 0.5;
  const centerY = height * 0.5;

  // Draw Verified Payout Seal ring in pure red channel (255, 0, 0) and emerald check in green channel (0, 255, 0)
  const scale = sealSize / 64;
  ctx.save();
  ctx.translate(startX, centerY - sealSize * 0.5);
  ctx.scale(scale, scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Open circular seal ring matching public/logo.svg geometry (exact 2 o'clock negative-space gap)
  ctx.strokeStyle = '#ff0000';
  ctx.lineWidth = 5.8;
  ctx.beginPath();
  ctx.arc(32, 32, 16, 0.15, 5.27, false);
  ctx.stroke();

  // Emerald checkmark breaking cleanly through 2 o'clock negative-space gap
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 5.5;
  ctx.beginPath();
  ctx.moveTo(25.5, 32.5);
  ctx.lineTo(30.5, 37.5);
  ctx.lineTo(47.2, 19.8);
  ctx.stroke();
  ctx.restore();

  // Draw bold geometric GigPay wordmark in pure red channel so sampler distinguishes ring/text vs emerald check
  ctx.fillStyle = '#ff0000';
  ctx.textBaseline = 'middle';
  ctx.fillText('GigPay', startX + sealSize + gap, centerY + fontSize * 0.04);

  const img = ctx.getImageData(0, 0, width, height).data;
  const spacing = isCompact ? 4 : 5;
  const particles = [];

  for (let y = spacing; y < height - spacing; y += spacing) {
    for (let x = spacing; x < width - spacing; x += spacing) {
      const idx = (y * width + x) * 4;
      const r = img[idx];
      const g = img[idx + 1];
      const a = img[idx + 3];
      if (a < 110) continue;

      const isCheck = g > r;
      const rand = hash2(x, y);
      const speedRand = hash2(x * 1.7 + 9, y * 2.3 + 5);
      const phaseRand = hash2(x * 3.1 + 17, y * 1.9 + 29);

      particles.push({
        hx: x,
        hy: y,
        x,
        y,
        vx: 0,
        vy: 0,
        isCheck,
        r: isCheck ? 0.063 : 0.78 + rand * 0.16,
        g: isCheck ? 0.74 + rand * 0.14 : 0.80 + rand * 0.15,
        b: isCheck ? 0.52 + rand * 0.12 : 0.84 + rand * 0.14,
        a: isCheck ? 0.78 : 0.50 + rand * 0.22,
        twinkleAmp: isCheck ? 0.20 : 0.18,
        twinkleSpeed: 0.65 + speedRand * 2.1,
        twinklePhase: phaseRand * Math.PI * 2,
        baseSize: isCompact ? (isCheck ? 3.2 : 2.8) : (isCheck ? 3.8 : 3.3),
        energy: 0,
      });
    }
  }

  return { particles, spacing };
};

const KineticLogoCanvas = () => {
  const canvasRef = useRef(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof window === 'undefined') return undefined;

    let gl = null;
    try {
      gl = canvas.getContext('webgl', { antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      gl = null;
    }
    if (!gl) {
      setFallback(true);
      return undefined;
    }

    const ptProg = createProgram(gl, PT_VERT_SRC, PT_FRAG_SRC);
    if (!ptProg) {
      setFallback(true);
      return undefined;
    }

    const ptLoc = {
      pos: gl.getAttribLocation(ptProg, 'a_pos'),
      size: gl.getAttribLocation(ptProg, 'a_size'),
      color: gl.getAttribLocation(ptProg, 'a_color'),
      res: gl.getUniformLocation(ptProg, 'u_res'),
    };
    const ptBuf = gl.createBuffer();

    let stageW = 320;
    let stageH = 220;
    let particles = [];
    let isVisible = true;
    let rafId = 0;

    const ptr = { x: -999, y: -999, vx: 0, vy: 0, active: false };
    const reducedMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    const rebuild = () => {
      const parent = canvas.parentElement;
      const rect = parent ? parent.getBoundingClientRect() : canvas.getBoundingClientRect();
      stageW = Math.max(280, Math.floor(rect.width));
      stageH = Math.max(180, Math.floor(rect.height));
      const built = sampleBrandParticles(stageW, stageH);
      particles = built.particles;
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
      const radius = 84;
      const active = ptr.active;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (active) {
          const dx = p.x - ptr.x;
          const dy = p.y - ptr.y;
          const d = Math.hypot(dx, dy);
          if (d < radius && d > 0.001) {
            const falloff = Math.pow(1 - d / radius, 1.65);
            const nx = dx / d;
            const ny = dy / d;
            const push = (1.6 + Math.min(speed * 0.32, 6.2)) * falloff;
            p.vx += nx * push + ptr.vx * 0.08 * falloff;
            p.vy += ny * push + ptr.vy * 0.08 * falloff;
            p.energy = Math.min(1, p.energy + falloff * 0.85);
          }
        }
        p.vx = (p.vx + (p.hx - p.x) * 0.045) * 0.82;
        p.vy = (p.vy + (p.hy - p.y) * 0.045) * 0.82;
        p.x += p.vx;
        p.y += p.vy;
        p.energy *= 0.92;
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
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      const needed = particles.length * 7;
      if (vertexData.length !== needed) vertexData = new Float32Array(needed);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const o = i * 7;
        const tw = reducedMotion ? 0.5 : Math.pow(0.5 + 0.5 * Math.sin(elapsed * p.twinkleSpeed + p.twinklePhase), 1.8);
        const boost = p.energy;

        vertexData[o] = p.x * dpr;
        vertexData[o + 1] = p.y * dpr;
        vertexData[o + 2] = (p.baseSize + boost * 1.15) * dpr;

        if (p.isCheck) {
          vertexData[o + 3] = Math.min(1, p.r + boost * 0.25);
          vertexData[o + 4] = Math.min(1, p.g + boost * 0.2);
          vertexData[o + 5] = Math.min(1, p.b + boost * 0.22);
          vertexData[o + 6] = Math.min(1, p.a + tw * p.twinkleAmp + boost * 0.25);
        } else {
          // Shift energized wordmark particles smoothly into emerald glint
          vertexData[o + 3] = Math.max(0.08, p.r - boost * 0.65);
          vertexData[o + 4] = Math.min(1, p.g + boost * 0.14);
          vertexData[o + 5] = Math.max(0.45, p.b - boost * 0.22);
          vertexData[o + 6] = Math.min(0.95, p.a + tw * p.twinkleAmp + boost * 0.35);
        }
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
      rebuild();
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

    let fontReadyCancelled = false;
    rebuild();
    startLoop();

    // Re-sample once Geist finishes loading so the particle wordmark uses exact Geist geometry
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        if (!fontReadyCancelled) {
          rebuild();
          if (reducedMotion) startLoop();
        }
      });
    }

    window.addEventListener('resize', handleResize);
    canvas.addEventListener('pointermove', handlePointerMove, { passive: true });
    canvas.addEventListener('pointerleave', handlePointerLeave);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      fontReadyCancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (observer) observer.disconnect();
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      gl.deleteBuffer(ptBuf);
      gl.deleteProgram(ptProg);
    };
  }, []);

  if (fallback) {
    return (
      <div className="flex h-48 w-full items-center justify-center">
        <BrandLockup size={44} variant="dark" />
      </div>
    );
  }

  return (
    <div className="relative h-48 w-full sm:h-68 lg:h-80 select-none" aria-hidden="true">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
};

export default KineticLogoCanvas;
