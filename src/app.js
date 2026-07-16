import { scenes } from "./scenes.js";

const canvas = document.querySelector("#space");
const ctx = canvas.getContext("2d", { alpha: false });
const intro = document.querySelector(".intro");
const narrative = document.querySelector(".narrative");
const chapterLabel = document.querySelector("#chapterLabel");
const sceneTitle = document.querySelector("#sceneTitle");
const sceneText = document.querySelector("#sceneText");
const distanceLabel = document.querySelector(".distance-panel__label");
const distanceValue = document.querySelector("#distanceValue");
const scaleValue = document.querySelector("#scaleValue");
const progressFill = document.querySelector("#progressFill");
const progressSteps = document.querySelector("#progressSteps");
const startButton = document.querySelector("#startButton");
const infoButton = document.querySelector("#infoButton");
const closeInfoButton = document.querySelector("#closeInfoButton");
const infoPanel = document.querySelector("#infoPanel");
const gestureHint = document.querySelector("#gestureHint");

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const earthScene = scenes.find((scene) => scene.id === "earth");
const earthLog = Math.log10(earthScene.valueMeters);
const physicalScenes = scenes.filter((scene) => scene.id !== "end");
const minLog = Math.min(...physicalScenes.map((scene) => Math.log10(scene.valueMeters)));
const maxLog = Math.max(...physicalScenes.map((scene) => Math.log10(scene.valueMeters)));
const EARTH_POSITION = 0.5;

function positionFromLog(logValue) {
  if (logValue <= earthLog) {
    return 0.5 * (logValue - minLog) / (earthLog - minLog);
  }
  return 0.5 + 0.5 * (logValue - earthLog) / (maxLog - earthLog);
}

function logFromPosition(position) {
  if (position <= 0.5) {
    return minLog + (position / 0.5) * (earthLog - minLog);
  }
  return earthLog + ((position - 0.5) / 0.5) * (maxLog - earthLog);
}

const positionedScenes = scenes.map((scene) => ({
  ...scene,
  logValue: Math.log10(scene.valueMeters),
  position: scene.id === "end" ? 1 : positionFromLog(Math.log10(scene.valueMeters))
}));

const MOTION = {
  virtualLength: 16500,
  dragMultiplier: 1.45,
  followSpeed: 12,
  kineticMultiplier: 1.9,
  friction: 0.74,
  maxVelocity: 0.5,
  wheelImpulse: 0.00022,
  keyImpulse: 0.1,
  textFadeSpeed: reducedMotion ? 6 : 1.4
};

let width = 0;
let height = 0;
let dpr = 1;
let camera = EARTH_POSITION;
let cameraTarget = EARTH_POSITION;
let velocity = 0;
let activeSceneIndex = nearestSceneIndex(camera);
let pendingSceneIndex = null;
let narrativeOpacity = 1;
let narrativeDirection = 1;
let lastFrameTime = performance.now();
let hasStarted = false;
let touching = false;
let touchLastY = 0;
let touchLastTime = 0;
let touchVelocity = 0;
let touchDirection = 0;

const stars = Array.from({ length: 90 }, (_, index) => ({
  x: pseudoRandom(index * 13.7),
  y: pseudoRandom(index * 29.3),
  size: 0.35 + pseudoRandom(index * 3.1) * 1.2,
  alpha: 0.08 + pseudoRandom(index * 7.9) * 0.25
}));

function pseudoRandom(seed) {
  const value = Math.sin(seed + 1) * 43758.5453;
  return value - Math.floor(value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0, edge1, value) {
  const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}

function resizeCanvas() {
  width = window.innerWidth;
  height = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function nearestSceneIndex(position) {
  let index = 0;
  let minimum = Infinity;
  positionedScenes.forEach((scene, sceneIndex) => {
    const distance = Math.abs(position - scene.position);
    if (distance < minimum) {
      minimum = distance;
      index = sceneIndex;
    }
  });
  return index;
}

function setScene(index) {
  activeSceneIndex = index;
  const scene = positionedScenes[index];
  chapterLabel.textContent = scene.label;
  sceneTitle.textContent = scene.title;
  sceneText.textContent = scene.text;
}

function updateSceneTransition(deltaSeconds) {
  const nextIndex = nearestSceneIndex(camera);
  if (nextIndex !== activeSceneIndex && pendingSceneIndex === null) {
    pendingSceneIndex = nextIndex;
    narrativeDirection = -1;
  }

  if (pendingSceneIndex !== null) {
    narrativeOpacity += narrativeDirection * MOTION.textFadeSpeed * deltaSeconds;
    if (narrativeDirection < 0 && narrativeOpacity <= 0) {
      narrativeOpacity = 0;
      setScene(pendingSceneIndex);
      pendingSceneIndex = null;
      narrativeDirection = 1;
    }
  } else {
    narrativeOpacity += MOTION.textFadeSpeed * deltaSeconds;
  }

  narrativeOpacity = clamp(narrativeOpacity, 0, 1);
}

function updateCamera(deltaSeconds) {
  if (!touching) {
    cameraTarget += velocity * deltaSeconds;
    velocity *= Math.exp(-MOTION.friction * deltaSeconds);
    if (Math.abs(velocity) < 0.00001) velocity = 0;
  }

  cameraTarget = clamp(cameraTarget, 0, 1);
  const follow = 1 - Math.exp(-MOTION.followSpeed * deltaSeconds);
  camera += (cameraTarget - camera) * follow;

  if (cameraTarget <= 0 && velocity < 0) velocity = 0;
  if (cameraTarget >= 1 && velocity > 0) velocity = 0;
  if (Math.abs(cameraTarget - camera) < 0.000001) camera = cameraTarget;
}

function moveTargetByPixels(deltaPixels) {
  hasStarted = true;
  cameraTarget = clamp(
    cameraTarget + (deltaPixels * MOTION.dragMultiplier) / MOTION.virtualLength,
    0,
    1
  );
}

function formatNumber(value) {
  const absolute = Math.abs(value);
  const digits = absolute >= 100 ? 0 : absolute >= 10 ? 1 : 2;
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(value);
}

function formatMetric(meters) {
  if (meters < 1e-12) return `${formatNumber(meters / 1e-15)} фм`;
  if (meters < 1e-9) return `${formatNumber(meters / 1e-12)} пм`;
  if (meters < 1e-6) return `${formatNumber(meters / 1e-9)} нм`;
  if (meters < 1e-3) return `${formatNumber(meters / 1e-6)} мкм`;
  if (meters < 1) return `${formatNumber(meters * 1000)} мм`;
  if (meters < 1_000) return `${formatNumber(meters)} м`;
  if (meters < 1e9) return `${formatNumber(meters / 1_000)} км`;
  if (meters < 1.496e11) return `${formatNumber(meters / 1e9)} млн км`;
  if (meters < 9.461e15) return `${formatNumber(meters / 1.496e11)} а. е.`;
  return `${formatNumber(meters / 9.461e15)} световых года`;
}

const superscriptMap = {
  "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹"
};

function superscript(value) {
  return String(value).split("").map((character) => superscriptMap[character] || character).join("");
}

function updateText() {
  const showIntro = !hasStarted && Math.abs(camera - EARTH_POSITION) < 0.01;
  intro.classList.toggle("is-hidden", !showIntro);
  narrative.classList.toggle("is-visible", !showIntro);
  narrative.style.opacity = showIntro ? "0" : String(narrativeOpacity);
  narrative.style.transform = `translateY(${(1 - narrativeOpacity) * 14}px)`;

  const currentLog = logFromPosition(camera);
  const meters = Math.pow(10, currentLog);
  const orders = currentLog - earthLog;
  const roundedExponent = Math.round(currentLog);
  const roundedOrders = Math.round(Math.abs(orders));

  distanceLabel.textContent = camera < EARTH_POSITION ? "Характерный размер" : "Расстояние";
  distanceValue.textContent = formatMetric(meters);

  if (Math.abs(orders) < 0.45) {
    scaleValue.textContent = `10${superscript(roundedExponent)} м · масштаб Земли`;
  } else {
    scaleValue.textContent = `10${superscript(roundedExponent)} м · на ${roundedOrders} порядков ${orders < 0 ? "меньше" : "больше"} Земли`;
  }

  const distanceFromCenter = Math.abs(camera - EARTH_POSITION) * 2;
  progressFill.style.width = `${distanceFromCenter * 50}%`;
  progressFill.style.left = camera < EARTH_POSITION
    ? `${50 - distanceFromCenter * 50}%`
    : "50%";

  [...progressSteps.children].forEach((item, index) => {
    item.classList.toggle("is-active", index === activeSceneIndex);
  });
}

function drawBackground() {
  ctx.fillStyle = "#050608";
  ctx.fillRect(0, 0, width, height);

  const inward = 1 - smoothstep(0.2, 0.5, camera);
  const starVisibility = 1 - inward * 0.82;
  const visualVelocity = velocity + (cameraTarget - camera) * 2;
  const stretch = reducedMotion ? 0 : Math.min(24, Math.abs(visualVelocity) * width * 0.28);

  for (const star of stars) {
    const drift = camera * width * (0.03 + star.size * 0.012);
    const x = ((star.x * width - drift) % width + width) % width;
    const y = star.y * height;
    ctx.globalAlpha = star.alpha * starVisibility;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = Math.max(0.5, star.size);
    ctx.beginPath();
    ctx.moveTo(x - Math.sign(visualVelocity) * stretch, y);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  if (inward > 0.08) {
    ctx.globalAlpha = inward * 0.1;
    ctx.strokeStyle = "#d9f1ff";
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i += 1) {
      const radius = 18 + i * 28;
      ctx.beginPath();
      ctx.arc(width * 0.5, height * 0.44, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
}

function drawActiveObject() {
  if (!hasStarted) return;

  const index = nearestSceneIndex(camera);
  const scene = positionedScenes[index];
  if (scene.radius <= 0) return;

  const distance = Math.abs(camera - scene.position);
  const previousPosition = positionedScenes[Math.max(0, index - 1)]?.position ?? scene.position;
  const nextPosition = positionedScenes[Math.min(positionedScenes.length - 1, index + 1)]?.position ?? scene.position;
  const localHalfGap = Math.max(0.025, Math.min(scene.position - previousPosition || 1, nextPosition - scene.position || 1) * 0.48);
  const visibility = 1 - smoothstep(localHalfGap * 0.35, localHalfGap, distance);
  if (visibility <= 0) return;

  const viewportRadius = Math.min(width, height) * 0.12;
  const radiusFactor = clamp(scene.radius / 12, 0.65, 1.35);
  const radius = viewportRadius * radiusFactor * (0.82 + visibility * 0.18);
  const x = width * 0.67;
  const y = height * 0.36;

  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.8);
  gradient.addColorStop(0, scene.color);
  gradient.addColorStop(0.22, `${scene.color}9f`);
  gradient.addColorStop(1, `${scene.color}00`);

  ctx.globalAlpha = visibility * 0.55;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius * 2.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = visibility;
  ctx.fillStyle = scene.color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function render(time) {
  const deltaMilliseconds = Math.min(32, time - lastFrameTime);
  const deltaSeconds = deltaMilliseconds / 1000;
  lastFrameTime = time;

  updateCamera(deltaSeconds);
  updateSceneTransition(deltaSeconds);
  drawBackground();
  drawActiveObject();
  updateText();
  requestAnimationFrame(render);
}

function buildProgress() {
  progressSteps.innerHTML = "";
  for (const scene of positionedScenes) {
    const item = document.createElement("li");
    item.textContent = scene.label;
    progressSteps.append(item);
  }
}

function setInfoOpen(open) {
  infoPanel.hidden = !open;
  infoButton.setAttribute("aria-expanded", String(open));
  if (open) closeInfoButton.focus();
}

function applyImpulse(amount) {
  hasStarted = true;
  velocity = clamp(velocity + amount, -MOTION.maxVelocity, MOTION.maxVelocity);
}

startButton.addEventListener("click", () => applyImpulse(0.14));
infoButton.addEventListener("click", () => setInfoOpen(true));
closeInfoButton.addEventListener("click", () => setInfoOpen(false));
infoPanel.addEventListener("click", (event) => {
  if (event.target === infoPanel) setInfoOpen(false);
});

window.addEventListener("wheel", (event) => {
  if (!infoPanel.hidden) return;
  event.preventDefault();
  applyImpulse(event.deltaY * MOTION.wheelImpulse);
}, { passive: false });

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !infoPanel.hidden) {
    setInfoOpen(false);
    return;
  }
  if (!infoPanel.hidden) return;

  if (["ArrowDown", "PageDown", " "].includes(event.key)) {
    event.preventDefault();
    applyImpulse(MOTION.keyImpulse);
  }
  if (["ArrowUp", "PageUp"].includes(event.key)) {
    event.preventDefault();
    applyImpulse(-MOTION.keyImpulse);
  }
});

canvas.addEventListener("touchstart", (event) => {
  if (!infoPanel.hidden) return;
  event.preventDefault();
  const y = event.touches[0]?.clientY;
  if (y == null) return;

  hasStarted = true;
  touching = true;
  touchLastY = y;
  touchLastTime = performance.now();
  touchVelocity = 0;
  touchDirection = 0;
  velocity = 0;
  cameraTarget = camera;
}, { passive: false });

canvas.addEventListener("touchmove", (event) => {
  if (!touching || !infoPanel.hidden) return;
  event.preventDefault();
  const y = event.touches[0]?.clientY;
  if (y == null) return;

  const now = performance.now();
  const elapsedSeconds = Math.max(0.008, (now - touchLastTime) / 1000);
  const deltaPixels = touchLastY - y;
  const direction = Math.sign(deltaPixels);
  const instantVelocity = ((deltaPixels * MOTION.dragMultiplier) / MOTION.virtualLength) / elapsedSeconds;

  if (direction !== 0 && touchDirection !== 0 && direction !== touchDirection) {
    touchVelocity = instantVelocity;
  } else {
    touchVelocity = touchVelocity * 0.45 + instantVelocity * 0.55;
  }

  if (direction !== 0) touchDirection = direction;
  touchLastY = y;
  touchLastTime = now;
  moveTargetByPixels(deltaPixels);
}, { passive: false });

function finishTouch() {
  if (!touching) return;
  touching = false;
  velocity = clamp(touchVelocity * MOTION.kineticMultiplier, -MOTION.maxVelocity, MOTION.maxVelocity);
  touchLastY = 0;
  touchLastTime = 0;
  touchVelocity = 0;
  touchDirection = 0;
}

canvas.addEventListener("touchend", finishTouch, { passive: true });
canvas.addEventListener("touchcancel", finishTouch, { passive: true });
window.addEventListener("resize", resizeCanvas, { passive: true });
window.addEventListener("orientationchange", resizeCanvas, { passive: true });

if (matchMedia("(pointer: coarse)").matches) {
  gestureHint.textContent = "Вверх — внутрь материи · вниз — в космос";
} else {
  gestureHint.textContent = "Колесо вверх — меньше · вниз — больше";
}

document.documentElement.style.overflow = "hidden";
document.body.style.overflow = "hidden";

buildProgress();
setScene(activeSceneIndex);
resizeCanvas();
requestAnimationFrame(render);
