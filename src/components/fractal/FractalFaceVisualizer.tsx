import * as React from 'react';
import * as THREE from 'three';

export type FractalFaceVisualizerProps = {
  audioData?: number[];
  pointCount?: number;
  recursionDepth?: number;
  noiseAmount?: number;
  fullScreen?: boolean;
};


export function FractalFaceVisualizer({
  audioData = [],
  pointCount = 5500,
  fullScreen = false,
}: FractalFaceVisualizerProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const rendererRef = React.useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = React.useRef<THREE.Scene | null>(null);
  const cameraRef = React.useRef<THREE.PerspectiveCamera | null>(null);
  const animRef = React.useRef<number | null>(null);
  const audioDataRef = React.useRef<number[]>(audioData);
  const [mode, setMode] = React.useState<'echo' | 'gravity' | 'neon'>('gravity');
  const [surreal, setSurreal] = React.useState(false);
  const [pulseTempo, setPulseTempo] = React.useState(1.0);
  const [fullScreenMode, setFullScreenMode] = React.useState(fullScreen);
  const stateRef = React.useRef({
    seed: Math.random() * 10000,
    drift: 0.0,
    colorShift: 0.0,
    beatPulse: 0.0,
    warp: 1.0,
    scatter: 0.03,
    lastBeatTs: 0,
    glowing: 0.0,
    smoothSpeed: 0.12,
    dripLevel: 0.0,
    lastRandomEvent: 0,
    trailFrame: 0,
    beatCount: 0,
    fireBurst: 0.0,
    echoWave: 0.0,
    gravityPulse: 0.0,
    neonGlow: 0.0,
    surrealPhase: 0.0,
    surrealIntensity: 0.0,
  });

  React.useEffect(() => {
    audioDataRef.current = audioData;
  }, [audioData]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080f22);

    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / Math.max(1, container.clientHeight), 0.1, 100);
    camera.position.set(0, 0, 6);

    const pointsGeometry = new THREE.BufferGeometry();
    const pointsGhostGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(pointCount * 3);
    const ghostPositions = new Float32Array(pointCount * 3);
    const colors = new Float32Array(pointCount * 3);

    pointsGhostGeometry.setAttribute('position', new THREE.BufferAttribute(ghostPositions, 3));

    const init = () => {
      stateRef.current.trailFrame = 0;
      const s = stateRef.current;
      s.seed = Math.random() * 10000;
      s.colorShift = Math.random() * 6.28;

      if (mode === 'gravity') {
        s.warp = 1.0 + Math.random() * 0.3;
        s.drift = 0.05 + Math.random() * 0.12;
        s.scatter = 0.01 + Math.random() * 0.05;
        s.glowing = 0.35 + Math.random() * 0.2;
      } else if (mode === 'neon') {
        s.warp = 0.9 + Math.random() * 0.5;
        s.drift = 0.2 + Math.random() * 0.4;
        s.scatter = 0.04 + Math.random() * 0.09;
        s.glowing = 0.7 + Math.random() * 0.3;
      } else {
        // echo
        s.warp = 0.5 + Math.random() * 0.7;
        s.drift = 0.1 + Math.random() * 0.3;
        s.scatter = 0.015 + Math.random() * 0.12;
        s.glowing = 0.2 + Math.random() * 0.4;
      }

      for (let i = 0; i < pointCount; i += 1) {
        const t = (i / pointCount) * Math.PI * (8 + Math.random() * 24) + s.seed;
        const r = 1.2 + 1.1 * Math.sin(i * (0.008 + s.scatter * 0.1) + s.seed);
        const noise = (Math.random() - 0.5) * s.scatter;

        if (mode === 'gravity') {
          const gx = Math.sin(t * 1.3) * 0.5;
          const gy = Math.cos(t * 1.7) * 0.4;
          positions[i * 3] = (r * Math.cos(t) * s.warp + noise) * 0.7 + gx;
          positions[i * 3 + 1] = (r * Math.sin(t) * s.warp + Math.sin(i * 0.04 + s.seed) * 0.12) * 0.8 + gy;
          positions[i * 3 + 2] = Math.sin(i * 0.11 + s.seed) * 0.85 + noise * 0.85;

          const hue = ((i / pointCount) * 0.35 + 0.73 + Math.sin(s.colorShift + i * 0.01) * 0.15) % 1;
          const c = new THREE.Color().setHSL(hue, 0.7, 0.52 + (Math.cos(t * 1.1 + s.seed) * 0.08));
          colors[i * 3] = c.r;
          colors[i * 3 + 1] = c.g;
          colors[i * 3 + 2] = c.b;
        } else if (mode === 'neon') {
          const laser = Math.sin(t * 12 + i * 0.22) * 0.12;
          positions[i * 3] = (r * Math.cos(t) * s.warp + noise + laser) * 0.75;
          positions[i * 3 + 1] = (r * Math.sin(t) * s.warp + Math.sin(i * 0.09 + s.seed) * 0.13) * 0.85;
          positions[i * 3 + 2] = Math.sin(i * 0.08 + s.seed) * 0.75 + noise * 1.1;

          const hue = ((i / pointCount) * 0.5 + 0.85 + Math.cos(s.colorShift + i * 0.04) * 0.2) % 1;
          const c = new THREE.Color().setHSL(hue, 0.95, 0.58 + (Math.sin(t * 2.2 + s.seed) * 0.11));
          colors[i * 3] = c.r;
          colors[i * 3 + 1] = c.g;
          colors[i * 3 + 2] = c.b;
        } else {
          // echo
          positions[i * 3] = (r * Math.cos(t) * s.warp + noise) * 0.75;
          positions[i * 3 + 1] = (r * Math.sin(t) * s.warp + Math.sin(i * 0.06 + s.seed) * 0.1);
          positions[i * 3 + 2] = Math.sin(i * 0.09 + s.seed) * 0.8 + noise * 1.2;

          const hue = ((i / pointCount) + Math.sin(s.colorShift + i * 0.03) * 0.18 + 0.7) % 1;
          const c = new THREE.Color().setHSL(hue, 0.7, 0.52 + (Math.cos(t * 2.5 + s.seed) * 0.09));
          colors[i * 3] = c.r;
          colors[i * 3 + 1] = c.g;
          colors[i * 3 + 2] = c.b;
        }
      }
    };

    init();

    pointsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pointsGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({ size: 0.018, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.95 });
    const points = new THREE.Points(pointsGeometry, material);
    scene.add(points);

    const ghostMaterial = new THREE.PointsMaterial({ size: 0.022, vertexColors: false, color: 0xffffff, transparent: true, opacity: 0.16 });
    const ghostPoints = new THREE.Points(pointsGhostGeometry, ghostMaterial);
    scene.add(ghostPoints);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;

    const onResize = () => {
      if (!rendererRef.current || !cameraRef.current || !container) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      cameraRef.current.aspect = width / Math.max(1, height);
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };

    window.addEventListener('resize', onResize);

    const animate = () => {
      const t = performance.now() * 0.001;
      const audio = audioDataRef.current || [];
      const energy = audio.length ? audio.reduce((sum, v) => sum + Math.abs(v), 0) / audio.length : 0;
      const lowBand = audio.length ? audio.slice(0, Math.max(1, Math.floor(audio.length * 0.33))).reduce((sum, v) => sum + Math.abs(v), 0) / Math.max(1, Math.floor(audio.length * 0.33)) : 0;
      const midBand = audio.length ? audio.slice(Math.max(0, Math.floor(audio.length * 0.33)), Math.max(1, Math.floor(audio.length * 0.66))).reduce((sum, v) => sum + Math.abs(v), 0) / Math.max(1, Math.floor(audio.length * 0.33)) : 0;
      const highBand = audio.length ? audio.slice(Math.max(0, Math.floor(audio.length * 0.66))).reduce((sum, v) => sum + Math.abs(v), 0) / Math.max(1, audio.length - Math.floor(audio.length * 0.66)) : 0;
      const halfCycle = surreal && Math.floor(t * 0.4) % 2 === 1 ? -1 : 1;
      const s = stateRef.current;
      const beatGap = 200 / Math.max(0.3, Math.min(3, pulseTempo));
      const tempoWave = Math.sin(t * Math.PI * pulseTempo * 0.7);
      const isBeat = energy > 0.35 && t * 1000 - s.lastBeatTs > beatGap;
      if (isBeat) {
        s.lastBeatTs = t * 1000;
        s.colorShift = Math.random() * 6.28;
        s.beatCount += 1;
        const majorBeat = s.beatCount % 2 === 0;
        s.beatPulse = majorBeat ? 1.2 + tempoWave * 0.42 : 0.45 + tempoWave * 0.15;
        if (surreal) s.surrealIntensity = Math.min(1, s.surrealIntensity + (majorBeat ? 0.55 : 0.18));

        if (majorBeat) {
          // echo mode soft wave event
          if (mode === 'echo') {
            s.warp = 0.4 + Math.random() * 0.5;
            s.drift = 0.08 + Math.random() * 0.18;
            s.scatter = 0.02 + Math.random() * 0.08;
            s.glowing = 0.2 + Math.random() * 0.3;
          }
        } else {
          s.warp *= 0.96;
          s.drift *= 0.94;
          s.scatter *= 0.93;
        }

        // echo mode soft wave event
        if (mode === 'echo') {
          s.warp = 0.4 + Math.random() * 0.5;
          s.drift = 0.08 + Math.random() * 0.18;
          s.scatter = 0.02 + Math.random() * 0.08;
          s.glowing = 0.2 + Math.random() * 0.3;
        }

        const reverb = Math.random() * 0.35 + 0.15;
        points.scale.setScalar(0.9 + reverb);

        const posAttr = pointsGeometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < pointCount; i += 1) {
          const idx = i * 3;
          posAttr.array[idx] += (Math.random() - 0.5) * 0.20;
          posAttr.array[idx + 1] += (Math.random() - 0.5) * 0.20;
          posAttr.array[idx + 2] += (Math.random() - 0.5) * 0.20;

        }
        posAttr.needsUpdate = true;
      }

      s.beatPulse *= 0.92;
      s.dripLevel = Math.max(0, s.dripLevel - 0.02);
      s.fireBurst *= 0.84;
      s.echoWave = Math.sin(t * 2.2 * pulseTempo) * 0.25;
      s.gravityPulse = Math.max(0, s.gravityPulse * 0.9 + (mode === 'gravity' ? 0.002 : 0.0));
      s.neonGlow = Math.max(0, s.neonGlow * 0.88 + (mode === 'neon' ? 0.005 : 0.0));
      if (surreal) {
        s.surrealPhase += 0.06;
        s.surrealIntensity = Math.min(1, s.surrealIntensity * 0.91 + energy * 0.32);
      } else {
        s.surrealIntensity *= 0.76;
      }

      const posAttr = pointsGeometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pointCount; i += 1) {
        const ix = i * 3;
        const x = posAttr.array[ix];
        const y = posAttr.array[ix + 1];
        const z = posAttr.array[ix + 2];

        if (mode === 'echo') {
          const radius = Math.sqrt(x * x + z * z) + 0.00001;
          const ring = Math.sin(radius * 21 - t * 11 + i * 0.14) * 0.08 * (1 + energy * 0.8);
          const ghost = Math.sin((i / pointCount) * Math.PI * 9 + t * 1.3) * 0.056;
          posAttr.array[ix] = x + Math.cos(i * 0.09 + t * 1.9) * (0.025 + s.echoWave * 0.05);
          posAttr.array[ix + 1] = y + ring + ghost;
          posAttr.array[ix + 2] = z + Math.sin(i * 0.05 + t * 2.1) * 0.018;

          const echoShift = Math.sin(t * 4 + i * 0.145) * 0.02;
          posAttr.array[ix] += echoShift;
          posAttr.array[ix + 2] -= echoShift;
        } else if (mode === 'gravity') {
          const gravityPoints = Math.min(7, 1 + Math.floor(Math.min(1, energy) * 6));
          let totalX = 0;
          let totalY = 0;
          let totalZ = 0;

          for (let g = 0; g < gravityPoints; g += 1) {
            const phase = t * (0.42 + g * 0.03) + g * 1.2;
            const gx = Math.sin(phase) * (0.58 - g * 0.04);
            const gy = Math.cos(phase * 1.18) * (0.48 - g * 0.03);
            const gz = Math.sin(phase * 0.95) * (0.42 - g * 0.02);
            const dx = gx - x;
            const dy = gy - y;
            const dz = gz - z;
            const distSq = Math.max(0.0005, dx * dx + dy * dy + dz * dz);
            const pull = (0.002 + energy * 0.0025 + s.gravityPulse * 0.07) / distSq;
            totalX += dx * pull;
            totalY += dy * pull;
            totalZ += dz * pull;
          }

          const gravityWeight = 1 / gravityPoints;
          const repeller = Math.cos(t * 5 + i * 0.3) * 0.013 * (1 - Math.min(1, energy));

          posAttr.array[ix] = x + totalX * gravityWeight + repeller;
          posAttr.array[ix + 1] = y + totalY * gravityWeight + 0.003 * Math.sin(i + t * 6.8) * 0.9;
          posAttr.array[ix + 2] = z + totalZ * gravityWeight + repeller * 0.8;

          if (Math.random() < 0.00135) {
            s.gravityPulse = 0.85;
          }
        } else if (mode === 'neon') {          const beam = Math.sin(i * 0.42 + t * 32 + Math.cos(t * 5.5)) * 0.11;
          const shards = Math.sin(i * 0.18 + t * 8) * 0.09;
          const orbital = Math.cos(t * 2.3 + i * 0.027) * 0.3;
          posAttr.array[ix] = Math.sin(t * 2.5 + i * 0.012) * 0.92 + beam * 2.5 + shards * 0.2;
          posAttr.array[ix + 1] = Math.sin(i * 0.056 + t * 1.2) * 0.64 + Math.cos(t * 22 + i * 0.055) * 0.14 + orbital * 0.15;
          posAttr.array[ix + 2] = Math.cos(t * 2.1 + i * 0.021) * 0.95 + beam * 2.1 - shards * 0.2;

          if (Math.random() < 0.0023) {
            s.neonGlow = 1.0;
          }
          // Stair-step aliasing signature
          posAttr.array[ix + 1] += Math.sign(Math.sin((i + t * 3.8) * 0.56)) * 0.003 * (1 + energy);
        } else {
          posAttr.array[ix] += (Math.random() - 0.5) * 0.02;
          posAttr.array[ix + 1] += (Math.random() - 0.5) * 0.02;
          posAttr.array[ix + 2] += (Math.random() - 0.5) * 0.02;
        }

        if (surreal) {
          const warpAxis = Math.tan((i / pointCount) * Math.PI * 2 + t * 0.28) * 0.007 * (1 + s.surrealIntensity);
          const shearAxis = Math.sin(i * 0.12 + s.surrealPhase) * 0.02;
          const bandShift = (lowBand * 0.4 + midBand * 0.3 + highBand * 0.3) * 0.07;
          const mirror = halfCycle;

          posAttr.array[ix] += warpAxis + shearAxis * 0.4 + bandShift * mirror;
          posAttr.array[ix + 1] += Math.sin(t * 1.2 + i * 0.11) * 0.011 * (1 + s.surrealIntensity) + (midBand - lowBand) * 0.08 * mirror;
          posAttr.array[ix + 2] += (Math.cos(t * 0.95 + i * 0.09) * 0.012 + bandShift * 0.7) * (1 + s.surrealIntensity) * mirror;
        }
      }
      posAttr.needsUpdate = true;

      let rx = t * (0.08 + energy * 0.18 + tempoWave * 0.15);
      let ry = t * (0.12 + energy * 0.24 + tempoWave * 0.17);
      let rz = Math.sin(t * 0.6 * (0.6 + pulseTempo * 0.4)) * 0.04;
      if (mode === 'echo') {
        rx *= 0.35;
        ry *= 0.45;
        rz *= 0.015;
      }
      if (mode === 'gravity') {
        rx *= 0.18;
        ry *= 0.22;
        rz *= 0.1;
      }
      if (mode === 'neon') {
        rx *= 1.3;
        ry *= 1.7;
        rz *= 0.08;
      }

      points.rotation.x = THREE.MathUtils.lerp(points.rotation.x, rx, 0.08);
      points.rotation.y = THREE.MathUtils.lerp(points.rotation.y, ry, 0.08);
      points.rotation.z = THREE.MathUtils.lerp(points.rotation.z, rz, 0.07);

      const surrealGlow = surreal ? Math.min(1, s.surrealIntensity * 1.2) : 0;
      const intensity = 0.7 + Math.sin(t * 2.6 + s.colorShift) * 0.35 + energy * 0.3 + s.beatPulse * 0.22 + s.glowing * 0.18 + surrealGlow * 0.3;
      material.opacity = Math.min(1.0, 0.4 + intensity * 0.5);
      material.size = 0.02 + 0.021 * Math.min(1, 0.25 + energy + s.beatPulse * 0.3 + s.glowing * 0.12 + surrealGlow * 0.14);

      const glow = Math.min(1, Math.pow(energy + 0.15, 2) + s.beatPulse * 0.12 + s.dripLevel * 0.03 + s.fireBurst * 0.1 + s.neonGlow * 0.1 + s.glowing * 0.15 + surrealGlow * 0.15);

      if (mode === 'echo') {        material.color.set(new THREE.Color().setHSL(0.13 + 0.12 * Math.cos(t * 1.9), 0.82, 0.47 + s.echoWave * 0.22));
        scene.background = new THREE.Color(0x020a1f).lerp(new THREE.Color(0x071633), 0.35 + glow * 0.30);
      } else if (mode === 'gravity') {
        material.color.set(new THREE.Color().setHSL(0.48 + 0.10 * Math.sin(t * 1.4), 0.72, 0.45 + glow * 0.25));
        scene.background = new THREE.Color(0x0a081d).lerp(new THREE.Color(0x151c2e), 0.4 + glow * 0.28);
      } else if (mode === 'neon') {
        material.color.set(new THREE.Color().setHSL(0.88 + 0.16 * Math.sin(t * 3.2), 0.98, 0.58 + glow * 0.3));
        scene.background = new THREE.Color(0x05040a).lerp(new THREE.Color(0x1b052d), 0.5 + glow * 0.38);
      } else {
        // fallback (echo)
        material.color.set(new THREE.Color().setHSL(0.63, 0.78, 0.56));
        scene.background = new THREE.Color(0x040b14).lerp(new THREE.Color(0x0f1a2e), glow * 0.4);
      }

      // optional fade effect for trails
      if (s.trailFrame % 3 === 0) {
        const trailPos = pointsGhostGeometry.getAttribute('position') as THREE.BufferAttribute;
        trailPos.copy(pointsGeometry.getAttribute('position') as THREE.BufferAttribute);
        trailPos.needsUpdate = true;
      }

      if (surreal) {
        scene.background = scene.background.clone().lerp(new THREE.Color(0x2d002a), Math.min(0.45, surrealGlow * 0.18));
        points.scale.setScalar(0.95 + surrealGlow * 0.5);
      }
      s.trailFrame += 1;

      rendererRef.current?.render(scene, camera);
      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', onResize);
      if (rendererRef.current) rendererRef.current.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      pointsGeometry.dispose();
      material.dispose();
    };
  }, [audioData, pointCount, mode, surreal, pulseTempo]);

  const wrapperClass = fullScreenMode ? 'fixed inset-0 z-50 h-screen w-screen bg-black' : 'relative h-full w-full';

  return (
    <div className={wrapperClass}>
      <div className="absolute top-3 left-3 z-20 rounded-lg bg-black/55 p-2 text-xs text-white">
        <div className="mb-2 flex flex-wrap gap-2">
          {(['echo', 'gravity', 'neon'] as const).map((candidate) => (
            <button
              key={candidate}
              type="button"
              onClick={() => setMode(candidate)}
              className={`rounded px-2 py-1 font-semibold transition ${mode === candidate ? 'bg-amber-300/90 text-slate-950' : 'bg-white/10 hover:bg-white/25'}`}
            >
              {candidate === 'echo'
                ? 'Echo'
                : candidate === 'gravity'
                ? 'Gravity'
                : 'Neon'}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setSurreal((v) => !v)}
            className={`rounded px-2 py-1 text-[10px] font-bold uppercase transition ${surreal ? 'bg-fuchsia-500/85 text-white' : 'bg-white/10 text-slate-100 hover:bg-white/25'}`}
          >
            {surreal ? 'Surreal ON' : 'Surreal OFF'}
          </button>
          <button
            type="button"
            onClick={() => setFullScreenMode((v) => !v)}
            className={`rounded px-2 py-1 text-[10px] font-bold uppercase transition ${fullScreenMode ? 'bg-sky-500/85 text-white' : 'bg-white/10 text-slate-100 hover:bg-white/25'}`}
          >
            {fullScreenMode ? 'Exit fullscreen' : 'Fullscreen'}
          </button>
          <label className="flex flex-col text-[10px]">
            <span className="mb-1">Pulse Tempo: {pulseTempo.toFixed(2)}x</span>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.05}
              value={pulseTempo}
              onChange={(e) => setPulseTempo(Number(e.target.value))}
              className="h-1 w-full cursor-pointer appearance-none rounded bg-white/25"
            />
          </label>
        </div>
      </div>
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
