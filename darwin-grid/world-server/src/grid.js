require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const GRID_SIZE = 20;

const GRID = [];
for (let x = 0; x < GRID_SIZE; x++) {
  GRID[x] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    GRID[x][y] = { type: 'empty', resourceId: null };
  }
}

let _resourceCounter = 1;

function _placeResource(x, y) {
  const id = `arc_crystal_${_resourceCounter++}`;
  GRID[x][y] = { type: 'resource', resourceId: id, value: 1.00, claimed: false, position: { x, y } };
  return id;
}

// Scatter 5 starting resources across the grid (avoid agent spawn corners)
_placeResource(18, 18);
_placeResource(2,  18);
_placeResource(18,  2);
_placeResource(10, 10);
_placeResource(5,  14);

function getCell(x, y) {
  if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return null;
  return GRID[x][y];
}

function setCell(x, y, data) {
  if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return;
  GRID[x][y] = data;
}

function removeResource(resourceId) {
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      if (GRID[x][y].resourceId === resourceId) {
        GRID[x][y] = { type: 'empty', resourceId: null };
        return true;
      }
    }
  }
  return false;
}

function getAllResources() {
  const resources = [];
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      if (GRID[x][y].type === 'resource') {
        resources.push({ ...GRID[x][y], position: { x, y } });
      }
    }
  }
  return resources;
}

// Find a random empty cell away from agent spawn corners
function getRandomEmptyCell() {
  const empties = [];
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      if (GRID[x][y].type === 'empty') {
        // Avoid the 3x3 agent spawn zones
        const awayFromA = !(x <= 2 && y <= 2);
        const awayFromB = !(x >= 17 && y >= 17);
        if (awayFromA && awayFromB) empties.push({ x, y });
      }
    }
  }
  if (empties.length === 0) return null;
  return empties[Math.floor(Math.random() * empties.length)];
}

function spawnRandomResource() {
  const cell = getRandomEmptyCell();
  if (!cell) return null;
  const id = _placeResource(cell.x, cell.y);
  return { resourceId: id, position: cell, value: 1.00 };
}

module.exports = { GRID, GRID_SIZE, getCell, setCell, removeResource, getAllResources, spawnRandomResource };
