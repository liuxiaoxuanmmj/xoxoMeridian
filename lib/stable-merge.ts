export function stableMergeBy<T>(prev: T[], next: T[], getKey: (item: T) => string): T[] {
  if (prev === next) return prev;
  if (prev.length === 0 && next.length === 0) return prev;
  const prevByKey = new Map(prev.map((item) => [getKey(item), item]));
  let identical = prev.length === next.length;
  const merged: T[] = new Array(next.length);
  for (let i = 0; i < next.length; i++) {
    const item = next[i];
    const old = prevByKey.get(getKey(item));
    if (old && JSON.stringify(old) === JSON.stringify(item)) {
      merged[i] = old;
      if (prev[i] !== old) identical = false;
    } else {
      merged[i] = item;
      identical = false;
    }
  }
  return identical ? prev : merged;
}
