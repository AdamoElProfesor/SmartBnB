/** Median of a list of numbers, 0 for an empty list */
export function median(nums) {
  const a = nums.slice().sort((x, y) => x - y);
  const n = a.length;
  if (!n) return 0;
  const m = Math.floor(n / 2);
  return n % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
