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
const physicalScenes = scenes.filter((scene) => scene.id !== "end");
const earthScene = scenes.find((scene) => scene.id === "earth");
const earthLog = Math.log10(earthScene.valueMeters);
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
  virtualLength: 198000,
  dragMultiplier: 1.45,
  followSpeed: 12,
  kineticMultiplier: 1.9,
  friction: 1.48,
  maxVelocity: 0.5,
  wheelImpulse: 0.000018333333333333333,
  keyImpulse: 0.008333333333333333,
  textFadeSpeed: reducedMotion ? 7 : 1.5
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

function lerp(a, b, t) {
  return a + (b - a) * t;
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
  let result = 0;
  let minimum = Infinity;
  positionedScenes.forEach((scene, index) => {
    const distance = Math.abs(position - scene.position);
    if (distance < minimum) {
      minimum = distance;
      result = index;
    }
  });
  return result;
}

function sceneSegment(position) {
  for (let index = 0; index < positionedScenes.length - 1; index += 1) {
    const current = positionedScenes[index];
    const next = positionedScenes[index + 1];
    if (position <= next.position) {
      const span = Math.max(0.000001, next.position - current.position);
      return { current, next, t: smoothstep(0, 1, (position - current.position) / span) };
    }
  }
  const last = positionedScenes.at(-1);
  return { current: last, next: last, t: 0 };
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16)
  };
}

function mixColor(first, second, t, alpha = 1) {
  const a = hexToRgb(first);
  const b = hexToRgb(second);
  return `rgba(${Math.round(lerp(a.r, b.r, t))}, ${Math.round(lerp(a.g, b.g, t))}, ${Math.round(lerp(a.b, b.b, t))}, ${alpha})`;
}

function setScene(index) {
  activeSceneIndex = index;
  const scene = positionedScenes[index];
  chapterLabel.textContent = scene.label;
  sceneTitle.textContent = scene.title;
  sceneText.textContent = scene.text;
  progressSteps.textContent = scene.label;
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
  camera += (cameraTarget - camera) * (1 - Math.exp(-MOTION.followSpeed * deltaSeconds));

  if (cameraTarget <= 0 && velocity < 0) velocity = 0;
  if (cameraTarget >= 1 && velocity > 0) velocity = 0;
  if (Math.abs(cameraTarget - camera) < 0.000001) camera = cameraTarget;
}

function moveTargetByPixels(deltaPixels) {
  hasStarted = true;
  cameraTarget = clamp(cameraTarget + (deltaPixels * MOTION.dragMultiplier) / MOTION.virtualLength, 0, 1);
}

function formatNumber(value) {
  const absolute = Math.abs(value);
  const digits = absolute >= 100 ? 0 : absolute >= 10 ? 1 : 2;
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(value);
}

function formatMetric(meters) {
  if (meters < 1e-30) return `${formatNumber(meters / 1e-35)} × 10⁻³⁵ м`;
  if (meters < 1e-18) return `${formatNumber(meters / 1e-21)} зм`;
  if (meters < 1e-15) return `${formatNumber(meters / 1e-18)} ам`;
  if (meters < 1e-12) return `${formatNumber(meters / 1e-15)} фм`;
  if (meters < 1e-9) return `${formatNumber(meters / 1e-12)} пм`;
  if (meters < 1e-6) return `${formatNumber(meters / 1e-9)} нм`;
  if (meters < 1e-3) return `${formatNumber(meters / 1e-6)} мкм`;
  if (meters < 1) return `${formatNumber(meters * 1000)} мм`;
  if (meters < 1_000) return `${formatNumber(meters)} м`;
  if (meters < 1e9) return `${formatNumber(meters / 1_000)} км`;
  if (meters < 1.496e11) return `${formatNumber(meters / 1e9)} млн км`;
  if (meters < 9.461e15) return `${formatNumber(meters / 1.496e11)} а. е.`;
  return `${formatNumber(meters / 9.461e15)} световых лет`;
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
  const meters = 10 ** currentLog;
  const orders = currentLog - earthLog;
  const exponent = Math.round(currentLog);

  distanceLabel.textContent = camera < EARTH_POSITION ? "Характерный размер" : "Характерный масштаб";
  distanceValue.textContent = formatMetric(meters);

  if (Math.abs(orders) < 0.45) {
    scaleValue.textContent = `10${superscript(exponent)} м · центр двух логарифмических полуосей`;
  } else if (orders < 0) {
    scaleValue.textContent = `10${superscript(exponent)} м · логарифмическое расширение: равный путь уменьшает масштаб в 10 раз`;
  } else {
    scaleValue.textContent = `10${superscript(exponent)} м · логарифмическое сжатие: равный путь увеличивает масштаб в 10 раз`;
  }

  const distanceFromCenter = Math.abs(camera - EARTH_POSITION) * 2;
  progressFill.style.width = `${distanceFromCenter * 50}%`;
  progressFill.style.left = camera < EARTH_POSITION ? `${50 - distanceFromCenter * 50}%` : "50%";
}

function drawBackground() {
  ctx.fillStyle = "#050608";
  ctx.fillRect(0, 0, width, height);

  const inward = 1 - smoothstep(0.18, 0.5, camera);
  const outward = smoothstep(0.5, 0.9, camera);
  const visualVelocity = velocity + (cameraTarget - camera) * 2;
  const stretch = reducedMotion ? 0 : Math.min(24, Math.abs(visualVelocity) * width * 0.28);

  for (const star of stars) {
    const x = ((star.x * width - camera * width * (0.03 + star.size * 0.012)) % width + width) % width;
    const y = star.y * height;
    ctx.globalAlpha = star.alpha * (0.18 + outward * 0.82);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = Math.max(0.5, star.size);
    ctx.beginPath();
    ctx.moveTo(x - Math.sign(visualVelocity) * stretch, y);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  if (inward > 0.03) {
    ctx.strokeStyle = "rgba(217, 241, 255, 0.11)";
    ctx.lineWidth = 1;
    for (let ring = 0; ring < 11; ring += 1) {
      ctx.beginPath();
      ctx.arc(width * 0.62, height * 0.37, 18 + ring * 27, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
}

function drawContinuousObject(time) {
  if (!hasStarted) return;

  const { current, next, t } = sceneSegment(camera);
  const x = width * 0.66;
  const y = height * 0.36;
  const base = Math.min(width, height) * 0.13;
  const radius = base * lerp(clamp(current.radius / 12, 0.55, 1.35), clamp(next.radius / 12, 0.55, 1.35), t);
  const inward = 1 - smoothstep(0.22, 0.5, camera);
  const biological = 1 - Math.min(1, Math.abs(logFromPosition(camera) + 5) / 7);
  const irregularity = reducedMotion ? 0 : 0.025 + biological * 0.065 + inward * 0.025;
  const pointCount = 72;
  const phase = time * 0.00035;
  const color = mixColor(current.color, next.color, t);

  const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 3.1);
  glow.addColorStop(0, mixColor(current.color, next.color, t, 0.62));
  glow.addColorStop(0.3, mixColor(current.color, next.color, t, 0.22));
  glow.addColorStop(1, mixColor(current.color, next.color, t, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, radius * 3.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.beginPath();
  for (let index = 0; index <= pointCount; index += 1) {
    const angle = (index / pointCount) * Math.PI * 2;
    const wave = Math.sin(angle * 3 + phase) * 0.55 + Math.sin(angle * 7 - phase * 1.4) * 0.45;
    const localRadius = radius * (1 + wave * irregularity);
    const px = x + Math.cos(angle) * localRadius;
    const py = y + Math.sin(angle) * localRadius;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  const internalDensity = clamp(0.15 + inward * 0.75, 0, 1);
  ctx.globalAlpha = internalDensity * 0.35;
  ctx.fillStyle = "#ffffff";
  const dots = 8 + Math.round(internalDensity * 20);
  for (let index = 0; index < dots; index += 1) {
    const angle = pseudoRandom(index * 17.2) * Math.PI * 2 + phase * 0.2;
    const distance = Math.sqrt(pseudoRandom(index * 9.1)) * radius * 0.72;
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, 0.8 + pseudoRandom(index) * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function render(time) {
  const deltaSeconds = Math.min(0.032, (time - lastFrameTime) / 1000);
  lastFrameTime = time;

  updateCamera(deltaSeconds);
  updateSceneTransition(deltaSeconds);
  drawBackground();
  drawContinuousObject(time);
  updateText();
  requestAnimationFrame(render);
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

startButton.addEventListener("click", () => applyImpulse(0.011666666666666667));
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
  if (event.key === "Escape" && !infoPanel.hidden) return setInfoOpen(false);
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

  touchVelocity = direction && touchDirection && direction !== touchDirection
    ? instantVelocity
    : touchVelocity * 0.45 + instantVelocity * 0.55;

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
progressSteps.innerHTML = "";
setScene(activeSceneIndex);
resizeCanvas();
requestAnimationFrame(render);
