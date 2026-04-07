import React, { useRef, useEffect, useCallback } from "react";
import type { ParticleConfig, ThemeBackground } from "@/types";

// ─── Background Router ────────────────────────────────────────────

export function ThemeBackgroundRenderer({ background }: { background: ThemeBackground }) {
  switch (background.type) {
    case "solid":
      return <div className="fixed inset-0 -z-10" style={{ backgroundColor: background.color }} />;
    case "gradient":
      return <div className="fixed inset-0 -z-10" style={{ background: background.css }} />;
    case "particle":
      return <ParticleBackground config={background.config} />;
    case "animated":
      if (background.component === "AuroraBackground") return <AuroraBackground />;
      return null;
    case "canvas":
      if (background.setup === "frutiger-aero") return <FrutigerAeroBackground />;
      if (background.setup === "matrix-terminal") return <MatrixBackground />;
      if (background.setup === "xp-bliss") return <XpBlissBackground />;
      if (background.setup === "jarvis-hud") return <JarvisBackground />;
      return null;
    default:
      return null;
  }
}

// ─── Particle System ──────────────────────────────────────────────

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  color: string;
  phase: number; // for firefly pulsing
}

function ParticleBackground({ config }: { config: ParticleConfig }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const frameRef = useRef<number>(0);

  const resolveColor = useCallback((c: string) => {
    if (c.startsWith("var(")) {
      const varName = c.slice(4, -1);
      return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || "#ffffff";
    }
    return c;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d")!;
    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);

    // Initialize particles
    const particles: Particle[] = [];
    for (let i = 0; i < config.count; i++) {
      const speed =
        config.speed_range[0] + Math.random() * (config.speed_range[1] - config.speed_range[0]);
      const angle = Math.random() * Math.PI * 2;
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size:
          config.size_range[0] + Math.random() * (config.size_range[1] - config.size_range[0]),
        opacity:
          config.opacity_range[0] +
          Math.random() * (config.opacity_range[1] - config.opacity_range[0]),
        color: resolveColor(config.colors[Math.floor(Math.random() * config.colors.length)]),
        phase: Math.random() * Math.PI * 2,
      });
    }
    particlesRef.current = particles;

    const onResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", onResize);

    const onMouse = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    if (config.mouse_interact) window.addEventListener("mousemove", onMouse);

    let t = 0;
    const animate = () => {
      ctx.clearRect(0, 0, w, h);
      t += 0.016;

      for (const p of particles) {
        // Movement
        if (config.behavior === "firefly") {
          p.vx += (Math.random() - 0.5) * 0.05;
          p.vy += (Math.random() - 0.5) * 0.05;
          p.vx *= 0.98;
          p.vy *= 0.98;
          const pulse = 0.5 + 0.5 * Math.sin(t * 2 + p.phase);
          p.opacity =
            config.opacity_range[0] +
            pulse * (config.opacity_range[1] - config.opacity_range[0]);
        } else if (config.behavior === "float") {
          p.vy -= 0.01; // gentle upward drift
        }

        // Mouse interaction
        if (config.mouse_interact) {
          const dx = mouseRef.current.x - p.x;
          const dy = mouseRef.current.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            const force = (150 - dist) / 150;
            p.vx -= (dx / dist) * force * 0.3;
            p.vy -= (dy / dist) * force * 0.3;
          }
        }

        p.x += p.vx;
        p.y += p.vy;

        // Wrap around
        if (p.x < -20) p.x = w + 20;
        if (p.x > w + 20) p.x = -20;
        if (p.y < -20) p.y = h + 20;
        if (p.y > h + 20) p.y = -20;

        // Draw
        ctx.save();
        ctx.globalAlpha = p.opacity;
        if (config.blur) {
          ctx.filter = `blur(${p.size * 0.5}px)`;
        }
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        // Glow
        ctx.globalAlpha = p.opacity * 0.3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
        grad.addColorStop(0, p.color);
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
      }

      // Connect lines
      if (config.connect_lines) {
        const maxDist = config.connect_distance ?? 120;
        for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < maxDist) {
              ctx.strokeStyle = particles[i].color;
              ctx.globalAlpha = (1 - dist / maxDist) * 0.15;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(particles[i].x, particles[i].y);
              ctx.lineTo(particles[j].x, particles[j].y);
              ctx.stroke();
            }
          }
        }
        ctx.globalAlpha = 1;
      }

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", onResize);
      if (config.mouse_interact) window.removeEventListener("mousemove", onMouse);
    };
  }, [config, resolveColor]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10"
      style={{ background: "var(--surface-base)" }}
    />
  );
}

// ─── Aurora Background ────────────────────────────────────────────

function AuroraBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden" style={{ background: "#080818" }}>
      <div className="aurora-layer aurora-1" />
      <div className="aurora-layer aurora-2" />
      <div className="aurora-layer aurora-3" />
      <style>{`
        .aurora-layer {
          position: absolute;
          inset: -50%;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.4;
          mix-blend-mode: screen;
          animation: aurora-drift 12s ease-in-out infinite alternate;
        }
        .aurora-1 {
          background: radial-gradient(ellipse at 30% 50%, #a855f7 0%, transparent 70%);
          animation-duration: 14s;
        }
        .aurora-2 {
          background: radial-gradient(ellipse at 70% 30%, #06b6d4 0%, transparent 70%);
          animation-duration: 18s;
          animation-delay: -4s;
        }
        .aurora-3 {
          background: radial-gradient(ellipse at 50% 70%, #34d399 0%, transparent 70%);
          animation-duration: 22s;
          animation-delay: -8s;
        }
        @keyframes aurora-drift {
          0% { transform: translate(-5%, -5%) rotate(0deg) scale(1); }
          33% { transform: translate(5%, 3%) rotate(3deg) scale(1.05); }
          66% { transform: translate(-3%, 5%) rotate(-2deg) scale(0.95); }
          100% { transform: translate(5%, -5%) rotate(4deg) scale(1.02); }
        }
      `}</style>
    </div>
  );
}

// ─── XP Bliss Background ─────────────────────────────────────────

function XpBlissBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);

    const onResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      draw();
    };
    window.addEventListener("resize", onResize);

    // Gentle cloud drift state
    const clouds: { x: number; y: number; r: number; speed: number; opacity: number }[] = [];
    const NUM_CLOUDS = 7;
    for (let i = 0; i < NUM_CLOUDS; i++) {
      clouds.push({
        x: Math.random() * w,
        y: h * 0.05 + Math.random() * h * 0.3,
        r: 60 + Math.random() * 80,
        speed: 0.08 + Math.random() * 0.12,
        opacity: 0.82 + Math.random() * 0.18,
      });
    }

    function drawCloud(x: number, y: number, r: number, alpha: number) {
      ctx.save();
      ctx.globalAlpha = alpha;
      // Main puff
      const puffs = [
        { dx: 0,      dy: 0,    dr: r },
        { dx: r * 0.6,dy: r * 0.15, dr: r * 0.75 },
        { dx: -r * 0.55, dy: r * 0.1, dr: r * 0.65 },
        { dx: r * 1.1, dy: r * 0.3, dr: r * 0.55 },
        { dx: -r * 1.0, dy: r * 0.3, dr: r * 0.5 },
      ];
      for (const p of puffs) {
        const g = ctx.createRadialGradient(x + p.dx, y + p.dy, 0, x + p.dx, y + p.dy, p.dr);
        g.addColorStop(0, "rgba(255,255,255,0.95)");
        g.addColorStop(0.5, "rgba(240,245,255,0.7)");
        g.addColorStop(1, "rgba(200,220,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x + p.dx, y + p.dy, p.dr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    function draw() {
      // Sky gradient — deep azure top to lighter blue horizon
      const sky = ctx.createLinearGradient(0, 0, 0, h * 0.62);
      sky.addColorStop(0, "#1a6bbf");
      sky.addColorStop(0.35, "#3d96e8");
      sky.addColorStop(0.7, "#6db8f5");
      sky.addColorStop(1, "#a8d4f7");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // Horizon haze
      const haze = ctx.createLinearGradient(0, h * 0.55, 0, h * 0.65);
      haze.addColorStop(0, "rgba(168,212,247,0)");
      haze.addColorStop(1, "rgba(190,230,200,0.4)");
      ctx.fillStyle = haze;
      ctx.fillRect(0, h * 0.55, w, h * 0.1);

      // Clouds
      for (const c of clouds) {
        drawCloud(c.x, c.y, c.r, c.opacity);
      }

      // === Hills ===
      // Back hill — large, pale green dome (center, rising from h*0.58)
      const hillBack = ctx.createLinearGradient(0, h * 0.42, 0, h * 0.65);
      hillBack.addColorStop(0, "#7ec87e");
      hillBack.addColorStop(0.4, "#5db85d");
      hillBack.addColorStop(1, "#4aaa4a");
      ctx.fillStyle = hillBack;
      ctx.beginPath();
      ctx.moveTo(0, h);
      // left foothills
      ctx.bezierCurveTo(w * 0.05, h, w * 0.1, h * 0.72, w * 0.18, h * 0.65);
      // main dome arc
      ctx.bezierCurveTo(w * 0.3, h * 0.46, w * 0.7, h * 0.44, w * 0.82, h * 0.63);
      // right descent
      ctx.bezierCurveTo(w * 0.9, h * 0.73, w * 0.95, h, w, h);
      ctx.closePath();
      ctx.fill();

      // Foreground — rolling green hills at bottom
      const hillFore = ctx.createLinearGradient(0, h * 0.62, 0, h);
      hillFore.addColorStop(0, "#52b952");
      hillFore.addColorStop(0.3, "#3da03d");
      hillFore.addColorStop(1, "#2d8c2d");
      ctx.fillStyle = hillFore;
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.bezierCurveTo(w * 0.0, h * 0.7, w * 0.15, h * 0.62, w * 0.3, h * 0.68);
      ctx.bezierCurveTo(w * 0.45, h * 0.74, w * 0.55, h * 0.65, w * 0.7, h * 0.7);
      ctx.bezierCurveTo(w * 0.82, h * 0.74, w * 0.92, h * 0.72, w, h * 0.78);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();

      // Subtle foreground highlight sheen
      const sheen = ctx.createLinearGradient(0, h * 0.62, 0, h * 0.75);
      sheen.addColorStop(0, "rgba(160,255,120,0.18)");
      sheen.addColorStop(1, "rgba(160,255,120,0)");
      ctx.fillStyle = sheen;
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.bezierCurveTo(w * 0.0, h * 0.7, w * 0.15, h * 0.62, w * 0.3, h * 0.68);
      ctx.bezierCurveTo(w * 0.45, h * 0.74, w * 0.55, h * 0.65, w * 0.7, h * 0.7);
      ctx.bezierCurveTo(w * 0.82, h * 0.74, w * 0.92, h * 0.72, w, h * 0.78);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    }

    let t = 0;
    const animate = () => {
      t += 0.016;
      // Drift clouds slowly left-to-right
      for (const c of clouds) {
        c.x += c.speed;
        if (c.x - c.r * 2 > w) {
          c.x = -c.r * 2;
          c.y = h * 0.05 + Math.random() * h * 0.28;
        }
      }
      draw();
      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 -z-10" />;
}

// ─── Frutiger Aero Background ────────────────────────────────────

function FrutigerAeroBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);

    interface Bubble {
      x: number;
      y: number;
      vx: number;
      vy: number;
      baseVy: number; // natural upward drift speed
      r: number;
      wobble: number;
      wobbleSpeed: number;
      opacity: number;
    }

    const bubbles: Bubble[] = [];
    const mouse = { x: -9999, y: -9999 };
    const REPULSE_DIST = 220;
    const REPULSE_STRENGTH = 0.65;
    let spawnTimer = 0;
    let t = 0;

    function makeBubble(startY?: number): Bubble {
      const r = 22 + Math.random() * 58;
      const baseVy = -(0.22 + Math.random() * 0.55);
      return {
        x: r + Math.random() * (w - r * 2),
        y: startY ?? h + r * 2,
        vx: 0,
        vy: baseVy,
        baseVy,
        r,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.007 + Math.random() * 0.016,
        opacity: 0.38 + Math.random() * 0.42,
      };
    }

    for (let i = 0; i < 24; i++) {
      bubbles.push(makeBubble(Math.random() * h));
    }

    function drawBubble(b: Bubble) {
      const { x, y, r, opacity: alpha } = b;

      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.clip();

      const body = ctx.createRadialGradient(x - r * 0.2, y + r * 0.1, r * 0.05, x, y, r);
      body.addColorStop(0, `rgba(190, 245, 255, ${alpha * 0.4})`);
      body.addColorStop(0.55, `rgba(80, 195, 240, ${alpha * 0.22})`);
      body.addColorStop(1, `rgba(0, 140, 215, ${alpha * 0.52})`);
      ctx.fillStyle = body;
      ctx.fill();

      const hl = ctx.createRadialGradient(
        x - r * 0.28, y - r * 0.3, r * 0.02,
        x - r * 0.12, y - r * 0.16, r * 0.72,
      );
      hl.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.96})`);
      hl.addColorStop(0.28, `rgba(255, 255, 255, ${alpha * 0.48})`);
      hl.addColorStop(1, `rgba(255, 255, 255, 0)`);
      ctx.fillStyle = hl;
      ctx.fill();

      const hl2 = ctx.createRadialGradient(
        x + r * 0.38, y + r * 0.42, 0,
        x + r * 0.38, y + r * 0.42, r * 0.24,
      );
      hl2.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.65})`);
      hl2.addColorStop(1, `rgba(255, 255, 255, 0)`);
      ctx.fillStyle = hl2;
      ctx.fill();

      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.78})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    function drawBackground() {
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0,    "#5bbef2");
      bg.addColorStop(0.38, "#a8dff8");
      bg.addColorStop(0.5,  "#2db8e8");
      bg.addColorStop(0.7,  "#0090cc");
      bg.addColorStop(1,    "#00508a");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.globalAlpha = 0.055;
      for (let i = 0; i < 11; i++) {
        const rx = w * 0.04 + i * w * 0.095;
        const spread = 35 + i * 6 + Math.sin(t * 0.5 + i * 1.3) * 10;
        const rayTop = h * 0.5 + Math.sin(t * 0.6 + i) * 8;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(rx, rayTop);
        ctx.lineTo(rx - spread, h);
        ctx.lineTo(rx + spread, h);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.13;
      ctx.fillStyle = "#ffffff";
      for (let x = 0; x < w; x += 3) {
        const waveY =
          h * 0.5 +
          Math.sin(x * 0.025 + t * 1.6) * 3.5 +
          Math.sin(x * 0.055 + t * 2.4) * 1.5;
        ctx.fillRect(x, waveY, 2, 1.5);
      }
      ctx.restore();
    }

    const onMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    window.addEventListener("mousemove", onMouseMove);

    const onResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", onResize);

    const animate = () => {
      t += 0.016;
      spawnTimer++;
      ctx.clearRect(0, 0, w, h);
      drawBackground();

      if (spawnTimer > 80 && bubbles.length < 32) {
        bubbles.push(makeBubble());
        spawnTimer = 0;
      }

      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];

        // Mouse repulsion
        const dx = b.x - mouse.x;
        const dy = b.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < REPULSE_DIST && dist > 0) {
          const force = (REPULSE_DIST - dist) / REPULSE_DIST;
          b.vx += (dx / dist) * force * REPULSE_STRENGTH;
          b.vy += (dy / dist) * force * REPULSE_STRENGTH;
        }

        // Damp vx toward 0, damp vy back toward natural float speed
        b.vx *= 0.92;
        b.vy = b.vy * 0.92 + b.baseVy * 0.08;

        // Gentle side wobble
        b.wobble += b.wobbleSpeed;
        b.x += b.vx + Math.sin(b.wobble) * 0.35;
        b.y += b.vy;

        if (b.y + b.r < 0) {
          bubbles.splice(i, 1);
          continue;
        }

        drawBubble(b);
      }

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 -z-10" />;
}

// ─── Matrix Background ────────────────────────────────────────────

function MatrixBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);

    const FONT_SIZE = 14;
    const CHARS =
      "ｦｧｨｩｪｫｬｭｮｯｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    let cols = Math.floor(w / FONT_SIZE);

    // Each column tracks: y position of the "head" (in rows), speed, and whether active
    interface Column {
      y: number;       // current head row
      speed: number;   // rows per frame (fractional)
      frac: number;    // fractional accumulator
      length: number;  // trail length in rows
      active: boolean;
      delay: number;   // frames before activating
    }

    let columns: Column[] = [];

    function initColumns(numCols: number) {
      columns = [];
      for (let i = 0; i < numCols; i++) {
        columns.push({
          y: 0,
          speed: 0.15 + Math.random() * 0.35,
          frac: Math.random(),
          length: 8 + Math.floor(Math.random() * 20),
          active: false,
          delay: Math.floor(Math.random() * 180),
        });
      }
    }
    initColumns(cols);

    // Off-screen character buffer — one char per cell
    let charGrid: string[][] = Array.from({ length: cols }, () => []);
    function getChar(col: number, row: number): string {
      if (!charGrid[col]) charGrid[col] = [];
      if (!charGrid[col][row]) charGrid[col][row] = CHARS[Math.floor(Math.random() * CHARS.length)];
      return charGrid[col][row];
    }

    const onResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      const newCols = Math.floor(w / FONT_SIZE);
      if (newCols !== cols) {
        cols = newCols;
        initColumns(cols);
        charGrid = Array.from({ length: cols }, () => []);
      }
    };
    window.addEventListener("resize", onResize);

    let frame = 0;
    const rows = () => Math.ceil(h / FONT_SIZE);

    const animate = () => {
      frame++;

      // Fade trail: semi-transparent black overlay each frame
      ctx.fillStyle = "rgba(0, 0, 0, 0.055)";
      ctx.fillRect(0, 0, w, h);

      ctx.font = `${FONT_SIZE}px "JetBrains Mono", monospace`;

      for (let c = 0; c < cols; c++) {
        const col = columns[c];
        if (!col) continue;

        if (!col.active) {
          col.delay--;
          if (col.delay <= 0) col.active = true;
          else continue;
        }

        col.frac += col.speed;
        if (col.frac < 1) continue;
        col.frac -= 1;

        const headRow = Math.floor(col.y);
        const x = c * FONT_SIZE;

        // Draw head — bright white-green
        if (headRow >= 0 && headRow < rows()) {
          // Occasionally scramble the char at head
          charGrid[c] = charGrid[c] || [];
          charGrid[c][headRow] = CHARS[Math.floor(Math.random() * CHARS.length)];
          const ch = getChar(c, headRow);
          ctx.fillStyle = "#ccffcc";
          ctx.shadowColor = "#39ff14";
          ctx.shadowBlur = 8;
          ctx.fillText(ch, x, (headRow + 1) * FONT_SIZE);
          ctx.shadowBlur = 0;
        }

        // Draw one row of trail just behind head (brightest green)
        const trail1 = headRow - 1;
        if (trail1 >= 0) {
          ctx.fillStyle = "#39ff14";
          ctx.fillText(getChar(c, trail1), x, (trail1 + 1) * FONT_SIZE);
        }

        col.y += 1;

        // Reset when the tail has passed the bottom
        if (col.y - col.length > rows()) {
          col.y = 0;
          col.speed = 0.15 + Math.random() * 0.35;
          col.length = 8 + Math.floor(Math.random() * 20);
          col.frac = Math.random();
          col.delay = Math.floor(Math.random() * 120);
          col.active = false;
          charGrid[c] = [];
        }
      }

      frameRef.current = requestAnimationFrame(animate);
    };

    // Initial black fill
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, w, h);

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="fixed inset-0 -z-10" style={{ background: "#0a0a0a" }} />
      <div
        className="fixed inset-0 -z-10"
        style={{
          background: "radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.5) 100%)",
          pointerEvents: "none",
        }}
      />
    </>
  );
}

// ─── JARVIS HUD Background ────────────────────────────────────────

function JarvisBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);
    let t = 0;
    let scanY = 0;

    // Ambient particles
    interface Dot { x: number; y: number; vx: number; vy: number; r: number; alpha: number; }
    const dots: Dot[] = Array.from({ length: 50 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.22,
      vy: (Math.random() - 0.5) * 0.22,
      r: 0.8 + Math.random() * 1.6,
      alpha: 0.15 + Math.random() * 0.4,
    }));

    // Ring definitions — rx/ry are multipliers of baseR
    // rotSpeed: ring plane rotates around center; dotSpeed: dot orbits inside ring
    interface RingDef {
      rx: number; ry: number;
      rotSpeed: number; dotSpeed: number;
      alpha: number; width: number;
      rgb: string; dotCount: number;
    }
    const ringDefs: RingDef[] = [
      { rx: 1.85, ry: 0.45, rotSpeed:  0.28, dotSpeed:  0.75, alpha: 0.65, width: 1.5, rgb: "0,229,255",   dotCount: 2 },
      { rx: 2.55, ry: 0.85, rotSpeed: -0.16, dotSpeed: -0.45, alpha: 0.40, width: 1.0, rgb: "0,170,255",   dotCount: 1 },
      { rx: 3.30, ry: 0.22, rotSpeed:  0.10, dotSpeed:  0.28, alpha: 0.28, width: 1.0, rgb: "0,229,255",   dotCount: 3 },
      { rx: 1.45, ry: 1.25, rotSpeed: -0.42, dotSpeed: -1.05, alpha: 0.55, width: 2.0, rgb: "80,240,255",  dotCount: 1 },
    ];

    // ── Helpers ──────────────────────────────────────────────────

    function drawBackground(cx: number, cy: number) {
      const bg = ctx.createRadialGradient(cx, cy * 0.75, 0, cx, cy, Math.max(w, h) * 0.78);
      bg.addColorStop(0,   "#071628");
      bg.addColorStop(0.5, "#030c18");
      bg.addColorStop(1,   "#010508");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
    }

    function drawGrid(cx: number, cy: number) {
      const maxR = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy));
      ctx.save();
      ctx.strokeStyle = "rgba(0,229,255,0.032)";
      ctx.lineWidth = 1;
      for (let r = 80; r < maxR; r += 80) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * maxR, cy + Math.sin(a) * maxR);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawSphere(cx: number, cy: number, r: number) {
      const pulse = 1 + Math.sin(t * 1.4) * 0.022;
      const pr = r * pulse;

      // Outer ambient glow
      const outerGlow = ctx.createRadialGradient(cx, cy, pr * 0.6, cx, cy, pr * 4.5);
      outerGlow.addColorStop(0,   "rgba(0,160,255,0.14)");
      outerGlow.addColorStop(0.45,"rgba(0, 80,200,0.06)");
      outerGlow.addColorStop(1,   "rgba(0, 30,120,0)");
      ctx.fillStyle = outerGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, pr * 4.5, 0, Math.PI * 2);
      ctx.fill();

      // Sphere body
      const body = ctx.createRadialGradient(cx - pr * 0.28, cy - pr * 0.28, pr * 0.04, cx, cy, pr);
      body.addColorStop(0,    "rgba(210,248,255,0.96)");
      body.addColorStop(0.22, "rgba(40, 205,255,0.88)");
      body.addColorStop(0.62, "rgba(0,  100,200,0.72)");
      body.addColorStop(1,    "rgba(0,   25, 90,0.92)");
      ctx.beginPath();
      ctx.arc(cx, cy, pr, 0, Math.PI * 2);
      ctx.fillStyle = body;
      ctx.fill();

      // Surface grid lines (latitude + longitude), clipped to sphere
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, pr, 0, Math.PI * 2);
      ctx.clip();
      ctx.strokeStyle = "rgba(0,229,255,0.22)";
      ctx.lineWidth = 0.75;
      // Latitude ellipses
      for (let i = -3; i <= 3; i++) {
        const ly = cy + (i / 3.8) * pr;
        const lr = Math.sqrt(Math.max(0, pr * pr - (ly - cy) ** 2));
        ctx.beginPath();
        ctx.ellipse(cx, ly, lr, lr * 0.28, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Longitude ellipses — slowly rotating
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * Math.PI + t * 0.06;
        ctx.beginPath();
        ctx.ellipse(cx, cy, pr * 0.28, pr, ang, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      // Crisp border
      ctx.beginPath();
      ctx.arc(cx, cy, pr, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0,229,255,0.88)";
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // Inner core highlight
      const coreAlpha = 0.82 + Math.sin(t * 2.2) * 0.12;
      const core = ctx.createRadialGradient(cx - pr * 0.12, cy - pr * 0.12, 0, cx, cy, pr * 0.52);
      core.addColorStop(0,   `rgba(255,255,255,${coreAlpha})`);
      core.addColorStop(0.25,"rgba(180,242,255,0.65)");
      core.addColorStop(1,   "rgba(0,200,255,0)");
      ctx.beginPath();
      ctx.arc(cx, cy, pr * 0.52, 0, Math.PI * 2);
      ctx.fillStyle = core;
      ctx.fill();
    }

    function drawRings(cx: number, cy: number, baseR: number) {
      for (const [ri, ring] of ringDefs.entries()) {
        const rx = baseR * ring.rx;
        const ry = baseR * ring.ry;
        const rot = t * ring.rotSpeed;

        // Ring arc
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0.06, Math.PI * 2 - 0.06);
        ctx.strokeStyle = `rgba(${ring.rgb},${ring.alpha})`;
        ctx.lineWidth = ring.width;
        ctx.stroke();

        // Bright moving segment
        const seg = t * ring.dotSpeed * 0.65;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, seg, seg + 0.38);
        ctx.strokeStyle = `rgba(${ring.rgb},0.95)`;
        ctx.lineWidth = ring.width + 1.8;
        ctx.stroke();
        ctx.restore();

        // Orbiting dots (world-space position)
        for (let d = 0; d < ring.dotCount; d++) {
          const θ = t * ring.dotSpeed + (d / ring.dotCount) * Math.PI * 2;
          const dotX = cx + rx * Math.cos(θ) * Math.cos(rot) - ry * Math.sin(θ) * Math.sin(rot);
          const dotY = cy + rx * Math.cos(θ) * Math.sin(rot) + ry * Math.sin(θ) * Math.cos(rot);

          const glow = ctx.createRadialGradient(dotX, dotY, 0, dotX, dotY, 16);
          glow.addColorStop(0, `rgba(${ring.rgb},0.55)`);
          glow.addColorStop(1, `rgba(${ring.rgb},0)`);
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(dotX, dotY, 16, 0, Math.PI * 2);
          ctx.fill();

          ctx.beginPath();
          ctx.arc(dotX, dotY, 2.8, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${ring.rgb},1)`;
          ctx.fill();
        }

        void ri; // silence unused warning
      }
    }

    function drawCornerHUD() {
      const arm = 72;
      const pad = 22;
      const tick = 9;
      ctx.strokeStyle = "rgba(0,229,255,0.62)";
      ctx.fillStyle   = "rgba(0,229,255,0.88)";
      ctx.lineWidth   = 1.5;

      const corners: [number, number, number, number][] = [
        [pad,     pad,     1,  1],
        [w - pad, pad,    -1,  1],
        [pad,     h - pad, 1, -1],
        [w - pad, h - pad,-1, -1],
      ];
      for (const [x, y, sx, sy] of corners) {
        // L bracket
        ctx.beginPath();
        ctx.moveTo(x + sx * arm, y);
        ctx.lineTo(x, y);
        ctx.lineTo(x, y + sy * arm);
        ctx.stroke();
        // End ticks
        ctx.beginPath();
        ctx.moveTo(x + sx * arm, y - sy * tick * 0.5);
        ctx.lineTo(x + sx * arm, y + sy * tick * 0.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - sx * tick * 0.5, y + sy * arm);
        ctx.lineTo(x + sx * tick * 0.5, y + sy * arm);
        ctx.stroke();
        // Corner dot
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawEdgeDecor() {
      ctx.save();
      // Static top/bottom horizontal rules
      ctx.strokeStyle = "rgba(0,229,255,0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(110, 18);  ctx.lineTo(w - 110, 18);  ctx.stroke();
      ctx.beginPath(); ctx.moveTo(110, h-18); ctx.lineTo(w - 110, h-18); ctx.stroke();
      // Left/right vertical rules
      ctx.beginPath(); ctx.moveTo(18, 110);  ctx.lineTo(18, h - 110);  ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w-18, 110); ctx.lineTo(w-18, h - 110); ctx.stroke();

      // Animated sliding segment — top
      const slide1 = ((t * 55) % (w - 280)) + 140;
      ctx.strokeStyle = "rgba(0,229,255,0.75)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(slide1, 18); ctx.lineTo(slide1 + 90, 18); ctx.stroke();

      // Animated sliding segment — bottom (opposite direction)
      const slide2 = w - 140 - ((t * 38) % (w - 280));
      ctx.beginPath(); ctx.moveTo(slide2, h-18); ctx.lineTo(slide2 - 90, h-18); ctx.stroke();

      // Vertical slider — left side
      const slideV = ((t * 30) % (h - 260)) + 130;
      ctx.beginPath(); ctx.moveTo(18, slideV); ctx.lineTo(18, slideV + 60); ctx.stroke();

      ctx.restore();
    }

    function drawScanLine() {
      scanY += 1.1;
      if (scanY > h + 40) scanY = -40;
      const sg = ctx.createLinearGradient(0, scanY - 30, 0, scanY + 30);
      sg.addColorStop(0,    "rgba(0,229,255,0)");
      sg.addColorStop(0.45, "rgba(0,229,255,0.022)");
      sg.addColorStop(0.5,  "rgba(0,229,255,0.048)");
      sg.addColorStop(0.55, "rgba(0,229,255,0.022)");
      sg.addColorStop(1,    "rgba(0,229,255,0)");
      ctx.fillStyle = sg;
      ctx.fillRect(0, scanY - 30, w, 60);
    }

    function drawParticles() {
      for (const p of dots) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,229,255,${p.alpha * 0.38})`;
        ctx.fill();
      }
    }

    const onResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", onResize);

    const animate = () => {
      t += 0.016;
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const baseR = Math.min(w, h) * 0.1;

      drawBackground(cx, cy);
      drawGrid(cx, cy);
      drawParticles();
      drawEdgeDecor();
      drawRings(cx, cy, baseR);
      drawSphere(cx, cy, baseR);
      drawCornerHUD();
      drawScanLine();

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 -z-10" />;
}
