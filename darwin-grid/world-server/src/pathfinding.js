const GRID_SIZE = 20;
const TRAVEL_COST_PER_TILE = 0.005;

function findPath(x1, y1, x2, y2) {
  if (x1 === x2 && y1 === y2) return [];

  const key = (x, y) => `${x},${y}`;
  const h = (x, y) => Math.abs(x - x2) + Math.abs(y - y2);

  const openSet = [];
  const closedSet = new Set();
  const gScore = {};
  const fScore = {};
  const cameFrom = {};

  const startKey = key(x1, y1);
  gScore[startKey] = 0;
  fScore[startKey] = h(x1, y1);
  openSet.push({ x: x1, y: y1, f: fScore[startKey] });

  while (openSet.length > 0) {
    openSet.sort((a, b) => a.f - b.f);
    const current = openSet.shift();
    const currentKey = key(current.x, current.y);

    if (current.x === x2 && current.y === y2) {
      const path = [];
      let k = currentKey;
      while (cameFrom[k]) {
        const [cx, cy] = k.split(',').map(Number);
        path.unshift({ x: cx, y: cy });
        k = cameFrom[k];
      }
      return path;
    }

    closedSet.add(currentKey);

    const neighbors = [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ];

    for (const nb of neighbors) {
      if (nb.x < 0 || nb.x >= GRID_SIZE || nb.y < 0 || nb.y >= GRID_SIZE) continue;
      const nbKey = key(nb.x, nb.y);
      if (closedSet.has(nbKey)) continue;

      const tentativeG = (gScore[currentKey] || 0) + 1;
      if (gScore[nbKey] === undefined || tentativeG < gScore[nbKey]) {
        cameFrom[nbKey] = currentKey;
        gScore[nbKey] = tentativeG;
        fScore[nbKey] = tentativeG + h(nb.x, nb.y);

        const existing = openSet.find(n => key(n.x, n.y) === nbKey);
        if (!existing) {
          openSet.push({ x: nb.x, y: nb.y, f: fScore[nbKey] });
        } else {
          existing.f = fScore[nbKey];
        }
      }
    }
  }

  return [];
}

function travelCost(steps) {
  return steps.length * TRAVEL_COST_PER_TILE;
}

module.exports = { findPath, travelCost, TRAVEL_COST_PER_TILE };
