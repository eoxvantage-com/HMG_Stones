export function toggleComparison(ids: string[], id: string): string[] {
  return ids.includes(id)
    ? ids.filter((value) => value !== id)
    : ids.length < 3
    ? [...ids, id]
    : ids;
}
export function moveOption(
  ids: string[],
  id: string,
  direction: -1 | 1
): string[] {
  const index = ids.indexOf(id),
    target = index + direction;
  if (index < 0 || target < 0 || target >= ids.length) return [...ids];
  const result = [...ids];
  [result[index], result[target]] = [result[target], result[index]];
  return result;
}
