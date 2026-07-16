import { scenes } from "./scenes.js";

const canvas = document.querySelector("#space");
const ctx = canvas.getContext("2d", { alpha: false });
const intro = document.querySelector(".intro");
const narrative = document.querySelector(".narrative");
const chapterLabel = document.querySelector("#chapterLabel");
const sceneTitle = document.querySelector("#sceneTitle");
const sceneText = document.querySelector("#sceneText");
const distanceValue = document.querySelector("#distanceValue");
const scaleValue = document.querySelector("#scaleValue");
const progressFill = document.querySelector("#progressFill");
const progressSteps = document.querySelector("#progressSteps");
const startButton = document.querySelector("#startButton");
const infoButton = document.querySelector("#infoButton");
const closeInfoButton = document.querySelector("#closeInfoButton");
const infoPanel = document.querySelector("#infoPanel");
const gestureHint = document.querySelector("#gestureHint");

let width = 0;
let height = 0;
let dpr = 1;
let progress = 0;
let progressVelocity = 0;
let targetProgress = 0;
let activeSceneIndex = 0;
let pendingSceneIndex = null;
let narrativeOpacity = 0;
let narrativeDirection = 1;
let lastTime = performance.now();
let touchStartY = null;
let touchLastY = null;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const MOTION = {
  stiffness: 8.5,
  damping: 3.1,
  maxVelocity: 0.34,
  textFadeSpeed: 1.45
};

const stars = Array.from({ length: 90 }, (_, index) => ({
  x: pseudoRandom(index * 13.7),
  y: pseudoRandom(index * 29.3),
  size: 0.35 + pseudoRandom(index * 3.1) * 1.2,
  alpha: 0.08 + pseudoRandom(index * 7.9) * 0.25
}));

function pseudoRandom(seed) {
  const x = Math.sin(seed + 1) * 43758.5453;
  return x - Math.floor(x);
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0, edge1, value) {
  const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}

function scrollProgress() {
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  return maxScroll > 0 ? clamp(window.scrollY / maxScroll, 0, 1) : 0;
}

function currentSceneIndex(value) {
  let index = 0;
  for (let i = 0; i < scenes.length; i += 1) {
    if (value >= scenes[i].progress - 0.08) index = i;
  }
  return index;
}

function setScene(index) {
  activeSceneIndex = index;
  const scene = scenes[index];
  chapterLabel.textContent = scene.label;
  sceneTitle.textContent = scene.title;
  sceneText.textContent = scene.text;
}

function updateSceneTransition(deltaSeconds) {
  const nextIndex = currentSceneIndex(progress);

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

function interpolateDistance(value) {
  for (let i = 0; i < scenes.length - 1; i += 1) {
    const a = scenes[i];
    const b = scenes[i + 1];
    if (value <= b.progress) {
      const local = clamp((value - a.progress) / (b.progress - a.progress), 0, 1);
      if (a.distanceMeters === 0) return b.distanceMeters * Math.pow(local, 2.2);
      const logA = Math.log10(Math.max(1, a.distanceMeters));
      const logB = Math.log10(Math.max(1, b.distanceMeters));
      return Math.pow(10, logA + (logB - logA) * smoothstep(0, 1, local));
    }
  }
  return scenes.at(-1).distanceMeters;
}

function formatDistance(meters) {
  if (meters < 1_000) return `${Math.round(meters)} м`;
  if (meters < 1e9) return `${formatNumber(meters / 1_000)} км`;
  if (meters < 1.496e11) return `${formatNumber(meters / 1e9)} млн км`;
  if (meters < 9.461e15) return `${formatNumber(meters / 1.496e11)} а. е.`;
  return `${formatNumber(meters / 9.461e15)} световых года`;
}

function formatNumber(value) {
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(value);
}

function scaleLabel(value) {
  if (value < 0.18) return "почти линейный масштаб";
  if (value < 0.52) return "пространство ускоряется";
  if (value < 0.88) return "логарифмическое сжатие";
  return "возвращение к объекту";
}

function updateText() {
  const started = progress > 0.015;
  intro.classList.toggle("is-hidden", started);
  narrative.classList.toggle("is-visible", started);
  narrative.style.opacity = started ? String(narrativeOpacity) : "0";
  narrative.style.transform = `translateY(${(1 - narrativeOpacity) * 14}px)`;

  distanceValue.textContent = formatDistance(interpolateDistance(progress));
  scaleValue.textContent = scaleLabel(progress);
  progressFill.style.width = `${progress * 100}%`;

  [...progressSteps.children].forEach((item, index) => {
    item.classList.toggle("is-active", index === activeSceneIndex);
  });
}

function updateMotion(deltaSeconds) {
  targetProgress = scrollProgress();

  if (reduceMotion) {
    progress = targetProgress;
    progressVelocity = 0;
    return;
  }

  const displacement = targetProgress - progress;
  const acceleration = displacement * MOTION.stiffness;
  progressVelocity += acceleration * deltaSeconds;
  progressVelocity *= Math.exp(-MOTION.damping * deltaSeconds);
  progressVelocity = clamp(progressVelocity, -MOTION.maxVelocity, MOTION.maxVelocity);
  progress += progressVelocity * deltaSeconds;

  if (Math.abs(displacement) < 0.000003 && Math.abs(progressVelocity) < 0.000003) {
    progress = targetProgress;
    progressVelocity = 0;
  }

  progress = clamp(progress, 0, 1);
}

function drawBackground() {
  ctx.fillStyle = "#050608";
  ctx.fillRect(0, 0, width, height);

  const fade = 1 - smoothstep(0.72, 1, progress) * 0.55;
  const motionStretch = Math.min(18, Math.abs(progressVelocity) * width * 0.09);

  for (const star of stars) {
    const drift = progress * width * (0.03 + star.size * 0.012);
    const x = ((star.x * width - drift) % width + width) % width;
    const y = star.y * height;
    ctx.globalAlpha = star.alpha * fade;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = Math.max(0.5, star.size);
    ctx.beginPath();
    ctx.moveTo(x - Math.sign(progressVelocity) * motionStretch, y);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawSceneObject(scene, sceneIndex) {
  if (scene.radius <= 0) return;
  const distance = Math.abs(progress - scene.progress);
  if (distance > 0.22) return;

  const side = sceneIndex % 2 === 0 ? 0.72 : 0.28;
  const travel = (scene.progress - progress) * width * 3.4;
  const x = width * side + travel;
  const y = height * (sceneIndex === 2 ? 0.35 : 0.48);
  const visibility = 1 - smoothstep(0.08, 0.22, distance);
  const softArrival = smoothstep(0, 1, visibility);
  const approach = 1 + Math.pow(softArrival, 5) * 4.5;
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

function drawVoidIndicator() {
  const nearest = Math.min(...scenes.slice(0, -1).map((scene) => Math.abs(progress - scene.progress)));
  const emptiness = smoothstep(0.035, 0.14, nearest);
  if (emptiness <= 0) return;

  ctx.globalAlpha = emptiness * 0.22;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  const y = height * 0.5;
  const gap = Math.max(36, Math.min(110, width * 0.11));
  ctx.beginPath();
  ctx.moveTo(width / 2 - gap, y);
  ctx.lineTo(width / 2 + gap, y);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function render(time) {
  const deltaMilliseconds = Math.min(32, time - lastTime);
  const deltaSeconds = deltaMilliseconds / 1000;
  lastTime = time;

  updateMotion(deltaSeconds);
  updateSceneTransition(deltaSeconds);
  drawBackground();
  drawVoidIndicator();
  scenes.forEach(drawSceneObject);
  updateText();
  requestAnimationFrame(render);
}

function buildProgress() {
  for (const scene of scenes) {
    const li = document.createElement("li");
    li.textContent = scene.label;
    progressSteps.append(li);
  }
}

function setInfoOpen(open) {
  infoPanel.hidden = !open;
  infoButton.setAttribute("aria-expanded", String(open));
  document.body.style.overflow = open ? "hidden" : "";
  if (open) closeInfoButton.focus();
}

startButton.addEventListener("click", () => {
  window.scrollTo({ top: window.innerHeight * 1.5, behavior: reduceMotion ? "auto" : "smooth" });
});

infoButton.addEventListener("click", () => setInfoOpen(true));
closeInfoButton.addEventListener("click", () => setInfoOpen(false));
infoPanel.addEventListener("click", (event) => {
  if (event.target === infoPanel) setInfoOpen(false);
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !infoPanel.hidden) setInfoOpen(false);
  if (["ArrowDown", "PageDown", " "].includes(event.key) && infoPanel.hidden) {
    event.preventDefault();
    window.scrollBy({ top: window.innerHeight * 0.75, behavior: reduceMotion ? "auto" : "smooth" });
  }
  if (["ArrowUp", "PageUp"].includes(event.key) && infoPanel.hidden) {
    event.preventDefault();
    window.scrollBy({ top: -window.innerHeight * 0.75, behavior: reduceMotion ? "auto" : "smooth" });
  }
});

canvas.addEventListener("touchstart", (event) => {
  touchStartY = event.touches[0]?.clientY ?? null;
  touchLastY = touchStartY;
}, { passive: true });

canvas.addEventListener("touchmove", (event) => {
  const currentY = event.touches[0]?.clientY;
  if (currentY == null || touchLastY == null) return;
  const deltaY = touchLastY - currentY;
  touchLastY = currentY;
  window.scrollBy(0, deltaY * 1.1);
}, { passive: true });

canvas.addEventListener("touchend", (event) => {
  if (touchStartY === null) return;
  const endY = event.changedTouches[0]?.clientY ?? touchStartY;
  const deltaY = touchStartY - endY;
  if (Math.abs(deltaY) > 28) {
    window.scrollBy({ top: deltaY * 1.25, behavior: reduceMotion ? "auto" : "smooth" });
  }
  touchStartY = null;
  touchLastY = null;
}, { passive: true });

window.addEventListener("resize", resizeCanvas, { passive: true });
window.addEventListener("orientationchange", resizeCanvas, { passive: true });

if (matchMedia("(pointer: coarse)").matches) {
  gestureHint.textContent = "Проведите пальцем вверх";
}

buildProgress();
setScene(0);
resizeCanvas();
requestAnimationFrame(render);
