/** Visual perimeter placement only; tile order comes from the map. */
export function boardCells(count: number) {
  const side = Math.max(5, Math.ceil(count / 4) + 1);
  const perimeter: { row: number; column: number }[] = [];
  for (let x = side; x > 1; x--) perimeter.push({ row: side, column: x });
  for (let y = side; y > 1; y--) perimeter.push({ row: y, column: 1 });
  for (let x = 1; x < side; x++) perimeter.push({ row: 1, column: x });
  for (let y = 1; y < side; y++) perimeter.push({ row: y, column: side });
  return {
    side,
    cells: Array.from(
      { length: count },
      (_, i) => perimeter[Math.floor((i * perimeter.length) / count)]!,
    ),
  };
}
