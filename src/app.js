import { scenes, EARTH_PROGRESS } from "./scenes.js";

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

const MOTION = {
  virtualLength: 15000,
  dragMultiplier: 1.4,
  followSpeed: 13,
  kineticMultiplier: 1.9,
  friction: 0.72,
  maxVelocity: 0.52,
  wheelImpulse: 0.00022,
  keyImpulse: 0.11,
  textFadeSpeed: reducedMotion ? 6 : 1.4
};

let width = 0;
let height = 0;
let dpr = 1;
let camera = EARTH_PROGRESS;
let cameraTarget = EARTH_PROGRESS;
let velocity = 0;
let activeSceneIndex = scenes.findIndex((scene) => scene.id === "earth");
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

function currentSceneIndex(value) {
  let nearestIndex = 0;
  let nearestDistance = Infinity;

  scenes.forEach((scene, index) => {
    const distance = Math.abs(value - scene.progress);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}

function setScene(index) {
  activeSceneIndex = index;
  const scene = scenes[index];
  chapterLabel.textContent = scene.label;
  sceneTitle.textContent = scene.title;
  sceneText.textContent = scene.text;
}

function updateSceneTransition(deltaSeconds) {
  const nextIndex = currentSceneIndex(camera);

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

function interpolateMetric(value) {
  for (let i = 0; i < scenes.length - 1; i += 1) {
    const a = scenes[i];
    const b = scenes[i + 1];

    if (value <= b.progress) {
      const local = clamp((value - a.progress) / (b.progress - a.progress), 0, 1);
      const logA = Math.log10(Math.max(Number.MIN_VALUE, a.valueMeters));
      const logB = Math.log10(Math.max(Number.MIN_VALUE, b.valueMeters));
      return {
        meters: Math.pow(10, logA + (logB - logA) * smoothstep(0, 1, local)),
        metric: value < EARTH_PROGRESS ? "size" : b.metric
      };
    }
  }

  return {
    meters: scenes.at(-1).valueMeters,
    metric: scenes.at(-1).metric
  };
}

function formatNumber(value) {
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
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

function scaleLabel(value) {
  if (value < 0.10) return "ядерный масштаб";
  if (value < 0.28) return "атомный масштаб";
  if (value < 0.45) return "биологический масштаб";
  if (value < 0.56) return "человеческий масштаб";
  if (value < 0.80) return "межпланетный масштаб";
  return "межзвёздный масштаб";
}

function updateText() {
  const showIntro = !hasStarted && Math.abs(camera - EARTH_PROGRESS) < 0.01;
  intro.classList.toggle("is-hidden", !showIntro);
  narrative.classList.toggle("is-visible", !showIntro);
  narrative.style.opacity = showIntro ? "0" : String(narrativeOpacity);
  narrative.style.transform = `translateY(${(1 - narrativeOpacity) * 14}px)`;

  const metric = interpolateMetric(camera);
  distanceLabel.textContent = metric.metric === "size" ? "Характерный размер" : "Расстояние";
  distanceValue.textContent = formatMetric(metric.meters);
  scaleValue.textContent = scaleLabel(camera);
  progressFill.style.width = `${camera * 100}%`;

  [...progressSteps.children].forEach((item, index) => {
    item.classList.toggle("is-active", index === activeSceneIndex);
  });
}

function drawBackground() {
  ctx.fillStyle = "#050608";
  ctx.fillRect(0, 0, width, height);

  const smallScale = 1 - smoothstep(0.12, 0.5, camera);
  const fade = 1 - smallScale * 0.72;
  const visualVelocity = velocity + (cameraTarget - camera) * 2;
  const motionStretch = reducedMotion ? 0 : Math.min(28, Math.abs(visualVelocity) * width * 0.3);

  for (const star of stars) {
    const drift = camera * width * (0.03 + star.size * 0.012);
    const x = ((star.x * width - drift) % width + width) % width;
    const y = star.y * height;

    ctx.globalAlpha = star.alpha * fade;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = Math.max(0.5, star.size);
    ctx.beginPath();
    ctx.moveTo(x - Math.sign(visualVelocity) * motionStretch, y);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  if (smallScale > 0.15) {
    ctx.globalAlpha = smallScale * 0.12;
    ctx.strokeStyle = "#d9f1ff";
    for (let i = 0; i < 18; i += 1) {
      const radius = 20 + i * 24 + camera * 30;
      ctx.beginPath();
      ctx.arc(width * 0.5, height * 0.48, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
}

function drawSceneObject(scene, sceneIndex) {
  if (scene.radius <= 0) return;
  const distance = Math.abs(camera - scene.progress);
  if (distance > 0.18) return;

  const side = sceneIndex % 2 === 0 ? 0.70 : 0.30;
  const travel = (scene.progress - camera) * width * 4.2;
  const x = width * side + travel;
  const y = height * (sceneIndex % 3 === 0 ? 0.36 : 0.49);
  const visibility = 1 - smoothstep(0.06, 0.18, distance);
  const softArrival = smoothstep(0, 1, visibility);
  const approach = 1 + Math.pow(softArrival, 5) * 4.2;
  const radius = scene.radius * approach;

  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 3.5);
  gradient.addColorStop(0, scene.color);
  gradient.addColorStop(0.2, `${scene.color}cc`);
  gradient.addColorStop(1, `${scene.color}00`);

  ctx.globalAlpha = softArrival;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius * 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = scene.color;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(1, radius), 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawCenterMarker() {
  const centerDistance = Math.abs(camera - EARTH_PROGRESS);
  const visibility = 1 - smoothstep(0.015, 0.08, centerDistance);
  if (visibility <= 0) return;

  ctx.globalAlpha = visibility * 0.45;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(width / 2, height * 0.28);
  ctx.lineTo(width / 2, height * 0.68);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function render(time) {
  const deltaMilliseconds = Math.min(32, time - lastFrameTime);
  const deltaSeconds = deltaMilliseconds / 1000;
  lastFrameTime = time;

  updateCamera(deltaSeconds);
  updateSceneTransition(deltaSeconds);
  drawBackground();
  drawCenterMarker();
  scenes.forEach(drawSceneObject);
  updateText();
  requestAnimationFrame(render);
}

function buildProgress() {
  for (const scene of scenes) {
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

startButton.addEventListener("click", () => applyImpulse(0.16));

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
  velocity = clamp(
    touchVelocity * MOTION.kineticMultiplier,
    -MOTION.maxVelocity,
    MOTION.maxVelocity
  );
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
