export function computeProsperity({
  unemployment = 0,
  revolution = 0,
  poverty = 0,
  population = 0,
}: {
  unemployment?: number;
  revolution?: number;
  poverty?: number;
  population?: number;
} = {}) {
  const employScore = Math.max(0, 1 - unemployment / 100);
  const stabilityScore = Math.max(0, 1 - revolution / 100);
  const wealthScore = Math.max(0, 1 - poverty / 100);
  const popScore = Math.min(1, population / 20000);
  return employScore * 0.35 + stabilityScore * 0.25 + wealthScore * 0.25 + popScore * 0.15;
}
