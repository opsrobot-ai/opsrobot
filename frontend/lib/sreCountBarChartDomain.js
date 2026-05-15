/**
 * 横向条形图（数值在 X 轴）：domain 上限 = 当前序列最大值的向上取整 + 右侧留白，
 * 避免 Recharts 自动刻度扩大到与单图数据无关的范围，同时柱子不贴绘图区右缘。
 *
 * @param {{ value?: unknown }[]} rows
 * @returns {[number, number]}
 */
export function countLikeBarChartXDomain(rows) {
  let max = 0;
  if (Array.isArray(rows)) {
    for (const row of rows) {
      const v = Number(row?.value);
      if (Number.isFinite(v) && v > max) max = v;
    }
  }
  const hi = max <= 0 ? 1 : Math.ceil(max);
  // 右侧留白：柱子不贴绘图区右缘（小数值时额外保证最小空隙）
  const bump = Math.max(hi * 0.12, hi <= 2 ? 0.35 : 0);
  return [0, hi + bump];
}
