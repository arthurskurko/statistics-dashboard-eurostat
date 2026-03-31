import * as React from 'react';
import * as THREE from 'three';

export type ExplosionVisualizerProps = {
  audioData?: number[];
  maxParticles?: number;
  fullScreen?: boolean;
  explosionTrigger?: number;
  explosionSeed?: number;
  explosionColor?: string;
};

const DEFAULT_MAX_PARTICLES = 5500;

function randomRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function randomVector3(range = 1) {
  return new THREE.Vector3(randomRange(-range, range), randomRange(-range, range), randomRange(-range, range));
}

export function ExplosionVisualizer({
  audioData = [],
  maxParticles = DEFAULT_MAX_PARTICLES,
  fullScreen = false,
  explosionTrigger = 0,
  explosionSeed = 1800,
  explosionColor = '#9fe0ff',
}: ExplosionVisualizerProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const rendererRef = React.useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = React.useRef<THREE.Scene | null>(null);
  const cameraRef = React.useRef<THREE.PerspectiveCamera | null>(null);
  const animRef = React.useRef<number | null>(null);

  const particles = React.useRef({
    count: 0,
    positions: new Float32Array(DEFAULT_MAX_PARTICLES * 3),
    velocities: new Float32Array(DEFAULT_MAX_PARTICLES * 3),
    colors: new Float32Array(DEFAULT_MAX_PARTICLES * 3),
    baseColors: new Float32Array(DEFAULT_MAX_PARTICLES * 3),
    life: new Float32Array(DEFAULT_MAX_PARTICLES),
    attractors: [] as Array<{ position: THREE.Vector3; strength: number; age: number }>,
    target: new THREE.Vector3(0, 0, 0),
    attractionStrength: 0.0,
    lastExplosion: 0,
    lastAutoExplosion: 0,
  });
  const spawnExplosionRef = React.useRef<(seedValue: number, accentColor?: string) => void>(() => {});

  const audioDataRef = React.useRef<number[]>(audioData);

  React.useEffect(() => {
    audioDataRef.current = audioData;
  }, [audioData]);

  const explosionTriggerRef = React.useRef(0);
  React.useEffect(() => {
    if (explosionTrigger > explosionTriggerRef.current) {
      const seed = Math.max(8, Math.min(DEFAULT_MAX_PARTICLES, Math.floor(explosionSeed ?? 1800)));
      spawnExplosionRef.current(seed, explosionColor);
    }
    explosionTriggerRef.current = explosionTrigger;
  }, [explosionTrigger, explosionSeed, explosionColor]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020512);
    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / Math.max(1, container.clientHeight), 0.1, 260);
    camera.position.set(0, 0, 12);

    const pointCount = Math.min(DEFAULT_MAX_PARTICLES, maxParticles);

    const pointsGeometry = new THREE.BufferGeometry();
    pointsGeometry.setAttribute('position', new THREE.BufferAttribute(particles.current.positions, 3));
    pointsGeometry.setAttribute('color', new THREE.BufferAttribute(particles.current.colors, 3));

    // Initially there are no particles, but we create the buffer full size.
    for (let i = 0; i < pointCount; i += 1) {
      const baseColor = new THREE.Color().setHSL(0.58 + Math.random() * 0.15, 0.75, 0.55);
      particles.current.baseColors[i * 3] = baseColor.r;
      particles.current.baseColors[i * 3 + 1] = baseColor.g;
      particles.current.baseColors[i * 3 + 2] = baseColor.b;
      particles.current.colors[i * 3] = baseColor.r;
      particles.current.colors[i * 3 + 1] = baseColor.g;
      particles.current.colors[i * 3 + 2] = baseColor.b;
      particles.current.life[i] = 0.0;
    }

    const material = new THREE.PointsMaterial({
      size: 0.045,
      vertexColors: true,
      transparent: true,
      opacity: 0.83,
      sizeAttenuation: true,
      depthWrite: false,
    });

    const points = new THREE.Points(pointsGeometry, material);
    scene.add(points);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;

    const spawnExplosion = (seedValue: number, accentColor?: string) => {
      const clamped = Math.max(1, Math.min(DEFAULT_MAX_PARTICLES, Math.floor(seedValue)));
      // Max sensible per explosion so beats combine smoothly.
      const effectiveSpawn = Math.min(clamped, 260);
      const center = randomVector3(4.0);

      const color = new THREE.Color(accentColor || explosionColor || '#9fe0ff');

      const getFreeIndex = () => {
        if (particles.current.count < pointCount) {
          return particles.current.count++;
        }
        for (let k = 0; k < pointCount; k += 1) {
          if (particles.current.life[k] <= 0) return k;
        }
        return Math.floor(Math.random() * pointCount);
      };

      for (let i = 0; i < effectiveSpawn; i += 1) {
        const idxParticle = getFreeIndex();
        const idx = idxParticle * 3;
        const offset = randomVector3(0.8);
        const pos = center.clone().add(offset);
        particles.current.positions[idx] = pos.x;
        particles.current.positions[idx + 1] = pos.y;
        particles.current.positions[idx + 2] = pos.z;

        const direction = offset.lengthSq() > 1e-6 ? offset.normalize() : randomVector3(1.2).normalize();
        const speed = 2.2 + Math.random() * 3.2;
        particles.current.velocities[idx] = direction.x * speed;
        particles.current.velocities[idx + 1] = direction.y * speed;
        particles.current.velocities[idx + 2] = direction.z * speed;

        const shade = new THREE.Color(color).offsetHSL((Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2);
        particles.current.baseColors[idx] = shade.r;
        particles.current.baseColors[idx + 1] = shade.g;
        particles.current.baseColors[idx + 2] = shade.b;

        particles.current.colors[idx] = shade.r;
        particles.current.colors[idx + 1] = shade.g;
        particles.current.colors[idx + 2] = shade.b;

        particles.current.life[idxParticle] = 1.0;
      }

      // Add strong new attractor at the explosion center.
      particles.current.attractors.unshift({ position: center.clone(), strength: 1.4, age: 0 });
      if (particles.current.attractors.length > 8) particles.current.attractors.pop();
      // Move the global target instantly to the latest explosion center for pronounced pull.
      particles.current.target.copy(center);
      particles.current.attractionStrength = Math.min(0.070, particles.current.attractionStrength + 0.018);
      particles.current.lastExplosion = performance.now();
    };

    spawnExplosionRef.current = spawnExplosion;

    const animate = () => {
      const t = performance.now();
      const dt = 0.016; // approximate

      const audio = audioDataRef.current || [];
      const energy = audio.length
        ? audio.reduce((sum, v) => sum + Math.abs(v), 0) / audio.length
        : 0;

      const shouldAuto = energy > 0.26 && t - particles.current.lastAutoExplosion > 240;
      if (shouldAuto) {
        const seedValue = Math.min(DEFAULT_MAX_PARTICLES, Math.max(120, Math.floor(400 + energy * 5400)));
        spawnExplosion(seedValue);
        particles.current.lastAutoExplosion = t;
      }

      const posAttr = pointsGeometry.getAttribute('position') as THREE.BufferAttribute;
      const colorAttr = pointsGeometry.getAttribute('color') as THREE.BufferAttribute;

      const maxUse = particles.current.count;
      for (let i = 0; i < maxUse; i += 1) {
        const ix = i * 3;
        let px = particles.current.positions[ix];
        let py = particles.current.positions[ix + 1];
        let pz = particles.current.positions[ix + 2];

        let vx = particles.current.velocities[ix];
        let vy = particles.current.velocities[ix + 1];
        let vz = particles.current.velocities[ix + 2];

        let lifeVal = particles.current.life[i];
        if (lifeVal <= 0) {
          lifeVal = 0;
        }

        // attraction to all recent explosion points
        let attractionX = 0;
        let attractionY = 0;
        let attractionZ = 0;
        for (let a = 0; a < particles.current.attractors.length; a += 1) {
          const attractor = particles.current.attractors[a];
          const dx = attractor.position.x - px;
          const dy = attractor.position.y - py;
          const dz = attractor.position.z - pz;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.0001;
          const influence = (attractor.strength / (0.3 + dist)) * (1 - Math.min(1, attractor.age * 0.65));
          attractionX += dx * influence;
          attractionY += dy * influence;
          attractionZ += dz * influence;

          attractor.age += dt * 0.3;
          attractor.strength = Math.max(0, attractor.strength - dt * 0.16);
        }

        vx += attractionX * 0.95;
        vy += attractionY * 0.95;
        vz += attractionZ * 0.95;

        // Great attractor at origin + additional pulsing from recent explosion centers.
        const gx = -px;
        const gy = -py;
        const gz = -pz;
        const gdist = Math.sqrt(gx * gx + gy * gy + gz * gz) + 0.0001;
        const gforce = Math.min(0.12, 0.75 / (gdist * (1 + particles.current.attractors.length * 0.06)));
        vx += gx / gdist * gforce;
        vy += gy / gdist * gforce;
        vz += gz / gdist * gforce;

        // Keep target moveable, not static, to “drift to latest explosion”.
        particles.current.target.lerp(particles.current.attractors[0]?.position || particles.current.target, 0.28);


        // swirling fractal motion (per-point vortex around latest target)
        const dxT = particles.current.target.x - px;
        const dyT = particles.current.target.y - py;
        const dzT = particles.current.target.z - pz;
        const twist = 0.0014 + Math.min(0.008, particles.current.attractionStrength);
        vx += (-dyT * 0.35 + dzT * 0.14) * twist;
        vy += (dxT * 0.35 - dzT * 0.12) * twist;
        vz += (-dxT * 0.14 + dyT * 0.12) * twist;

        // Additional soft swirl based on target direction.
        const swirlStrength = 0.001 + Math.min(0.006, particles.current.attractionStrength);
        vx += (-dyT * 0.35 + dzT * 0.18) * swirlStrength;
        vy += (dxT * 0.35 - dzT * 0.14) * swirlStrength;
        vz += (-dxT * 0.18 + dyT * 0.14) * swirlStrength;

        // damping + noise
        vx *= 0.995;
        vy *= 0.995;
        vz *= 0.995;
        vx += (Math.random() - 0.5) * 0.0012;
        vy += (Math.random() - 0.5) * 0.0012;
        vz += (Math.random() - 0.5) * 0.0012;

        px += vx * dt;
        py += vy * dt;
        pz += vz * dt;

        // soft spherical boundary to avoid corners and enforce fractal flow.
        const radiusLimit = 10.8;
        const dist = Math.sqrt(px * px + py * py + pz * pz);
        if (dist > radiusLimit) {
          const inv = radiusLimit / (dist || 1);
          px *= inv;
          py *= inv;
          pz *= inv;
          vx *= 0.42;
          vy *= 0.42;
          vz *= 0.42;
        }

        // write back state
        particles.current.positions[ix] = px;
        particles.current.positions[ix + 1] = py;
        particles.current.positions[ix + 2] = pz;

        particles.current.velocities[ix] = vx;
        particles.current.velocities[ix + 1] = vy;
        particles.current.velocities[ix + 2] = vz;

        // life / fade logic per particle
        let currentLife = Math.max(0, particles.current.life[i] - 0.00012);
        particles.current.life[i] = currentLife;

        const br = particles.current.baseColors[ix];
        const bg = particles.current.baseColors[ix + 1];
        const bb = particles.current.baseColors[ix + 2];
        const fade = 0.16 + 0.84 * currentLife;

        colorAttr.array[ix] = br * fade;
        colorAttr.array[ix + 1] = bg * fade;
        colorAttr.array[ix + 2] = bb * fade;

        posAttr.array[ix] = px;
        posAttr.array[ix + 1] = py;
        posAttr.array[ix + 2] = pz;
      }

      posAttr.needsUpdate = true;
      colorAttr.needsUpdate = true;

      // spin camera slowly for interest
      if (cameraRef.current) {
        cameraRef.current.position.x = Math.sin(t * 0.00045) * 11.3;
        cameraRef.current.position.y = Math.sin(t * 0.00027) * 2.7;
        cameraRef.current.lookAt(0, 0, 0);
      }

      rendererRef.current?.render(scene, camera);
      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    const onResize = () => {
      if (!rendererRef.current || !cameraRef.current || !container) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      cameraRef.current.aspect = width / Math.max(1, height);
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };

    window.addEventListener('resize', onResize);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', onResize);
      if (rendererRef.current) rendererRef.current.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      pointsGeometry.dispose();
      material.dispose();
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
    };
  }, [maxParticles]);

  const wrapperClass = fullScreen ? 'fixed inset-0 z-50 h-screen w-screen bg-black' : 'relative h-full w-full';

  return (
    <div className={wrapperClass}>
      <div className="absolute top-3 left-3 z-20 rounded-lg bg-black/55 p-2 text-xs text-white">
        <div className="mb-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              const seed = Math.floor(1 + Math.random() * 5500);
              spawnExplosionRef.current(seed);
            }}
            className="rounded bg-white/15 px-2 py-1 text-[10px] font-bold uppercase hover:bg-white/25"
          >
            Trigger Explosion
          </button>
          <span className="text-[10px]">Particles: {particles.current.count}/{DEFAULT_MAX_PARTICLES}</span>
        </div>
        <p className="text-[10px]">Auto explosion on beat (audio energy &gt; 0.22).</p>
      </div>
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
