import type { FractalBranch, Vec2 } from './fractalTypes';

const FRACTAL_CENTER: Vec2 = { x: 88, y: 88 };

export type MainBranchDrawOptions = {
  lightweight?: boolean;
};

export function computeTempoPulse(timestampMs: number, tempoBpm?: number): number {
  if (typeof tempoBpm === 'number' && Number.isFinite(tempoBpm)) {
    const freq = Math.max(30, Math.min(240, tempoBpm)) / 60;
    return 0.5 + 0.5 * Math.sin((timestampMs / 1000) * Math.PI * 2 * freq);
  }
  return 0.5 + 0.5 * Math.sin(timestampMs * 0.01);
}

export function clearMainCanvas(ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
}

export function clearModalCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(2, 10, 26, 0.92)';
  ctx.fillRect(0, 0, width, height);
}

export function drawMainBranch(
  ctx: CanvasRenderingContext2D,
  branch: FractalBranch,
  options: MainBranchDrawOptions = {},
): void {
  if (branch.points.length < 2 || branch.life <= 0) return;
  const lightweight = options.lightweight === true;
  ctx.beginPath();
  ctx.moveTo(branch.points[0].x, branch.points[0].y);
  for (let i = 1; i < branch.points.length; i += 1) {
    const p = branch.points[i];
    ctx.lineTo(p.x, p.y);
  }
  const alpha = Math.max(0, Math.min(1, branch.life));
  const { r, g, b } = branch.colorRgb;
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${lightweight ? 0.12 + alpha * 0.42 : 0.16 + alpha * 0.62})`;
  ctx.shadowColor = lightweight ? 'rgba(0, 0, 0, 0)' : `rgba(${r}, ${g}, ${b}, ${0.18 + alpha * 0.3})`;
  ctx.shadowBlur = lightweight ? 0 : 4 + alpha * 5;
  ctx.lineWidth = lightweight ? Math.max(0.8, branch.width * 0.9) : branch.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  const tip = branch.points[branch.points.length - 1];
  if (tip && !lightweight) {
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, branch.tipSize * (0.7 + alpha * 0.65), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.32 + alpha * 0.6})`;
    ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${0.2 + alpha * 0.34})`;
    ctx.shadowBlur = 3 + alpha * 4;
    ctx.fill();
  }
}

export function drawModalHorizontalBranch(
  ctx: CanvasRenderingContext2D,
  branch: FractalBranch,
  width: number,
  height: number,
  pulse: number,
): void {
  if (branch.points.length < 2 || branch.life <= 0) return;

  let pathLength = 0;
  for (let i = 1; i < branch.points.length; i += 1) {
    const a = branch.points[i - 1];
    const b = branch.points[i];
    pathLength += Math.hypot(b.x - a.x, b.y - a.y);
  }
  // Keep smaller branches too so trees read as fractals, not only trunk sticks.
  if (pathLength < 4.2) return;

  const alpha = Math.max(0, Math.min(1, branch.life));
  const { r, g, b } = branch.colorRgb;
  const centerX = width * 0.5;
  const baselineY = height * 0.5;
  const pulseScale = 0.9 + pulse * 0.14;
  const seedRoot = branch.seedRoot ?? branch.points[0];
  const seedAngle = Math.atan2(seedRoot.y - FRACTAL_CENTER.y, seedRoot.x - FRACTAL_CENTER.x);
  const rootX = centerX + Math.cos(seedAngle) * width * 0.54 + Math.sin(seedAngle) * width * 0.08;
  const direction = Math.sin(seedAngle) >= 0 ? -1 : 1;
  const targetAngle = direction < 0 ? -Math.PI / 2 : Math.PI / 2;
  const rotateBy = targetAngle - seedAngle;
  const cosR = Math.cos(rotateBy);
  const sinR = Math.sin(rotateBy);
  const scaleX = 2.4;
  const scaleY = 2.75;

  ctx.save();
  ctx.translate(rootX, baselineY);
  ctx.scale(scaleX, scaleY);
  ctx.rotate(rotateBy);
  ctx.translate(-seedRoot.x, -seedRoot.y);

  ctx.beginPath();
  ctx.moveTo(branch.points[0].x, branch.points[0].y);
  for (let i = 1; i < branch.points.length; i += 1) {
    const p = branch.points[i];
    ctx.lineTo(p.x, p.y);
  }

  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${(0.21 + alpha * 0.56) * pulseScale})`;
  ctx.shadowColor = 'rgba(0, 0, 0, 0)';
  ctx.shadowBlur = 0;
  ctx.lineWidth = Math.max(0.4, (branch.width * 1.24) / Math.max(scaleX, Math.abs(scaleY)));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  ctx.restore();

  const tip = branch.points[branch.points.length - 1];
  if (tip && alpha > 0.26 && branch.generation <= 1) {
    const tx = tip.x - seedRoot.x;
    const ty = tip.y - seedRoot.y;
    const rx = tx * cosR - ty * sinR;
    const ry = tx * sinR + ty * cosR;
    const tipX = rootX + rx * scaleX;
    const tipY = baselineY + ry * scaleY;
    ctx.beginPath();
    ctx.arc(tipX, tipY, Math.max(0.95, branch.tipSize * 0.68 * pulseScale), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${(0.2 + alpha * 0.3) * pulseScale})`;
    ctx.shadowColor = 'rgba(0, 0, 0, 0)';
    ctx.shadowBlur = 0;
    ctx.fill();
  }
}
