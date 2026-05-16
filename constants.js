const worldWidth = 1800;
const worldHeight = 900;
const worldCenter = [worldWidth / 2 + 120, worldHeight / 2];

const torusThickness = 75;

const maxineStart = [worldCenter[0] + 200, worldCenter[1]];

const torusOuterWidth = worldWidth - 300;
const torusOuterHeight = worldHeight;

const torusInnerWidth = torusOuterWidth - torusThickness * 2;
const torusInnerHeight = torusOuterHeight - torusThickness * 2;
const torusInnerRadius = Math.min(torusInnerWidth, torusInnerHeight) / 2;

const ringWidth = torusOuterWidth - 66;
const ringHeight = torusOuterHeight - 66;
const ringRadius = Math.min(ringWidth, ringHeight) / 2;

// For speeding up or slowing down the whole game. Doesn't work yet.
const worldSpeed = 1;

const numBoxes = 300;