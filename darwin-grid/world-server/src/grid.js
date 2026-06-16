require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const GRID_SIZE = 20;

const GRID = [];
for (let x = 0; x < GRID_SIZE; x++) {
  GRID[x] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    GRID[x][y] = { type: 'empty', resourceId: null };
  }
}

GRID[18][18] = {
  type: 'resource',
  resourceId: 'arc_crystal_1',
  value: 1.00,
  claimed: false,
  position: { x: 18, y: 18 }
};

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

module.exports = { GRID, GRID_SIZE, getCell, setCell, removeResource, getAllResources };
