export function inferSortKey(periodCode: string): number {
  const annual = /^(\d{4})$/;
  const monthly = /^(\d{4})M(\d{2})$/;
  const quarterly = /^(\d{4})-?Q(\d)$/i;
  const halfYear = /^(\d{4})-?[HS](\d)$/i;
  const daily = /^(\d{4})-(\d{2})-(\d{2})$/;

  if (annual.test(periodCode)) {
    return Number(periodCode) * 100;
  }

  const monthlyMatch = periodCode.match(monthly);
  if (monthlyMatch) {
    return Number(monthlyMatch[1]) * 100 + Number(monthlyMatch[2]);
  }

  const quarterlyMatch = periodCode.match(quarterly);
  if (quarterlyMatch) {
    return Number(quarterlyMatch[1]) * 100 + Number(quarterlyMatch[2]) * 3;
  }

  const halfYearMatch = periodCode.match(halfYear);
  if (halfYearMatch) {
    return Number(halfYearMatch[1]) * 100 + Number(halfYearMatch[2]) * 6;
  }

  const dailyMatch = periodCode.match(daily);
  if (dailyMatch) {
    return Number(`${dailyMatch[1]}${dailyMatch[2]}${dailyMatch[3]}`);
  }

  return Number(periodCode.replace(/\D/g, '')) || 0;
}

export function getNextPeriodCode(periodCode: string): string | null {
  const annual = /^\d{4}$/;
  const monthly = /^(\d{4})M(\d{2})$/;
  const quarterly = /^(\d{4})-?Q(\d)$/i;
  const halfYear = /^(\d{4})S(\d)$/i;
  const daily = /^(\d{4})-(\d{2})-(\d{2})$/;

  if (annual.test(periodCode)) {
    return String(Number(periodCode) + 1);
  }

  const monthlyMatch = periodCode.match(monthly);
  if (monthlyMatch) {
    const year = Number(monthlyMatch[1]);
    const month = Number(monthlyMatch[2]);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    return `${nextYear}M${String(nextMonth).padStart(2, '0')}`;
  }

  const quarterlyMatch = periodCode.match(quarterly);
  if (quarterlyMatch) {
    const year = Number(quarterlyMatch[1]);
    const quarter = Number(quarterlyMatch[2]);
    const nextQuarter = quarter === 4 ? 1 : quarter + 1;
    const nextYear = quarter === 4 ? year + 1 : year;
    return `${nextYear}Q${nextQuarter}`;
  }

  const halfYearMatch = periodCode.match(halfYear);
  if (halfYearMatch) {
    const year = Number(halfYearMatch[1]);
    const half = Number(halfYearMatch[2]);
    const nextHalf = half === 2 ? 1 : 2;
    const nextYear = half === 2 ? year + 1 : year;
    return `${nextYear}S${nextHalf}`;
  }

  const dailyMatch = periodCode.match(daily);
  if (dailyMatch) {
    const date = new Date(`${periodCode}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return null;
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  }

  return null;
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 1;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
