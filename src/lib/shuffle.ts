/** Fisher–Yates shuffle. Returns a new array. */
export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function orderItems<T>(items: T[], shuffled: boolean): T[] {
  return shuffled ? shuffle(items) : [...items];
}
