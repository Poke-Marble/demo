/** Visual perimeter placement only; tile order comes from the map. */
export function boardCells(count: number) {
  const side = Math.max(3, Math.ceil(count / 4) + 1);
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
export function validateLobby(
  players: readonly { name: string; pokemonId: string }[],
) {
  if (players.length < 2 || players.length > 4)
    return '2~4명의 트레이너가 필요합니다.';
  if (players.some((player) => !player.name.trim()))
    return '모든 트레이너의 이름을 입력하세요.';
  if (
    new Set(players.map((player) => player.pokemonId)).size !== players.length
  )
    return '서로 다른 파트너를 선택하세요.';
  return null;
}
