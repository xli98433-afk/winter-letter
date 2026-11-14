import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

const QUERY = new URLSearchParams(location.search);
const COARSE = window.matchMedia("(pointer: coarse)").matches;
const SMALL = window.matchMedia("(max-width: 768px)").matches;
const LOW_POWER = SMALL || COARSE || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const COUNT = {
  particles: LOW_POWER ? 4200 : 9000,
  sparkles: LOW_POWER ? 700 : 1500,
  ornaments: LOW_POWER ? 130 : 230,
  gifts: 15,
  ribbon: LOW_POWER ? 110 : 180,
  photos: 12,
  snow: LOW_POWER ? 420 : 900,
  stars: LOW_POWER ? 1100 : 2200
};

const PALETTE = [0xffcf7a, 0xffcf7a, 0xffe2a6, 0xffd88a, 0xffc35c, 0xfff6e2, 0xffffff];
const ORNAMENT_COLORS = [0xd62b3f, 0x1f8f45, 0xffd34d, 0xfff4dc, 0xc8203a, 0x39a05a];
const BOX_COLORS = [0xb81f33, 0x1c7a3c, 0xd9a521, 0xa82438];

const CAPTION_FONT = '"Zhi Mang Xing", "Ma Shan Zheng", "KaiTi", "STKaiti", "Kaiti SC", Georgia, serif';

const CAPTIONS = [
  "第一次见你",
  "一起看的雪",
  "你笑的样子",
  "冬天很快乐",
  "想和你过年",
  "我们的小事",
  "记住这一刻",
  "下次还要来",
  "给你留的",
  "新年快乐",
  "一直在一起",
  "未完待续"
];

const app = {
  mode: "tree",
  progress: 0,
  target: 0,
  focusIndex: -1,
  focusAmount: 0,
  time: 0,
  started: false
};

const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
const cameraOrbit = { theta: 0.7, phi: 1.18, targetTheta: 0.7, targetPhi: 1.18 };
const hand = { x: 0.5, y: 0.5, active: false };

const $ = id => document.getElementById(id);
const toastEl = $("toast");
let toastTimer = 0;
function toast(text) {
  toastEl.textContent = text;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
}

let renderer, scene, camera, composer, bloomPass;
let starGlowTexture;
let particleSystem, sparkleSystem, ornamentSystem, giftSystem, ribbonSystem;
let starMesh, starGlow;
let snowSystem, starField;
let photoSystem;
let focusLight;
let captionGroup;
let captionSets = [];
let captionProgress = 0;
let captionIndex = -1;
const lookAt = new THREE.Vector3(0, 0.2, 0);
const cameraPosition = new THREE.Vector3(0, 1.8, 12);

function makeGlowTexture(inner = 1) {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.22, "rgba(255,255,255,0.85)"); 
  g.addColorStop(0.55, `rgba(255,255,255,${0.22 * inner})`);
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function treePosition(index, total) {
  const t = Math.pow((index + 1) / total, 0.82);
  const y = t * 8 - 4;
  const radius = 3.5 * (1 - t * 0.95) * (0.72 + Math.random() * 0.28);
  const angle = t * Math.PI * 2 * 9 + Math.random() * Math.PI * 2;
  return [Math.cos(angle) * radius, y + (Math.random() - 0.5) * 0.12, Math.sin(angle) * radius];
}

function galaxyPosition(scale = 1) {
  const radius = (2.4 + Math.pow(Math.random(), 1.7) * 5.4) * scale;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  return [
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.sin(phi) * Math.sin(theta) * 0.55,
    radius * Math.cos(phi)
  ];
}

function ornamentTreePosition(index, total) {
  const t = (index + 0.6) / total;
  const y = t * 7.4 - 3.7;
  const radius = 3.15 * (1 - t * 0.9);
  const angle = t * Math.PI * 2 * 6 + index * 1.7;
  return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
}

function ribbonTreePosition(index, total) {
  const t = index / total;
  const y = t * 7.6 - 3.8;
  const radius = 3.05 * (1 - t * 0.88) + 0.18;
  const angle = t * Math.PI * 6;
  return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
}

function buildRenderer() {
  renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(0x05070d, 1);
  $("stage").appendChild(renderer.domElement);
}

function buildScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070d);
  scene.fog = new THREE.Fog(0x05070d, 18, 46);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 400);
  camera.position.copy(cameraPosition);
  camera.lookAt(lookAt);

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), LOW_POWER ? 0.7 : 0.9, 0.5, 0.9);
  composer.addPass(bloomPass);

  focusLight = new THREE.PointLight(0xffd28a, 0, 20);
  focusLight.position.set(0, 0, 5);
  scene.add(focusLight);

  starGlowTexture = makeGlowTexture(1.2);
}

function buildStars() {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(COUNT.stars * 3);
  const colors = new Float32Array(COUNT.stars * 3);
  const warm = new THREE.Color(0xfff0cf);
  const cool = new THREE.Color(0xbfd4ff);
  for (let i = 0; i < COUNT.stars; i++) {
    const radius = 55 + Math.random() * 90;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = radius * Math.cos(phi);
    const color = Math.random() < 0.7 ? warm : cool;
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 0.42, map: starGlowTexture, vertexColors: true, transparent: true,
    opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, fog: false
  });
  starField = new THREE.Points(geometry, material);
  scene.add(starField);
}

function buildParticles() {
  const count = COUNT.particles;
  const tree = new Float32Array(count * 3);
  const galaxy = new Float32Array(count * 3);
  const delays = new Float32Array(count);
  const phases = new Float32Array(count);
  const speeds = new Float32Array(count);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const t = treePosition(i, count);
    const g = galaxyPosition();
    tree[i * 3] = t[0]; tree[i * 3 + 1] = t[1]; tree[i * 3 + 2] = t[2];
    galaxy[i * 3] = g[0]; galaxy[i * 3 + 1] = g[1]; galaxy[i * 3 + 2] = g[2];
    positions[i * 3] = t[0]; positions[i * 3 + 1] = t[1]; positions[i * 3 + 2] = t[2];
    color.setHex(PALETTE[Math.floor(Math.random() * PALETTE.length)]);
    colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
    delays[i] = Math.random();
    phases[i] = Math.random() * Math.PI * 2;
    speeds[i] = 0.4 + Math.random() * 0.8;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: LOW_POWER ? 0.075 : 0.055, map: starGlowTexture, vertexColors: true,
    transparent: true, opacity: 1, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false, toneMapped: false
  });
  particleSystem = new THREE.Points(geometry, material);
  particleSystem.userData = { tree, galaxy, delays, phases, speeds, count };
  scene.add(particleSystem);

  const sparkCount = COUNT.sparkles;
  const sparkPositions = new Float32Array(sparkCount * 3);
  const sparkColors = new Float32Array(sparkCount * 3);
  const sparkDelays = new Float32Array(sparkCount);
  for (let i = 0; i < sparkCount; i++) {
    const sourceIndex = Math.floor(Math.random() * count);
    sparkPositions[i * 3] = tree[sourceIndex * 3];
    sparkPositions[i * 3 + 1] = tree[sourceIndex * 3 + 1];
    sparkPositions[i * 3 + 2] = tree[sourceIndex * 3 + 2];
    const tint = Math.random() < 0.5 ? 0xffdf9e : 0xfff9e8;
    const c = new THREE.Color(tint);
    sparkColors[i * 3] = c.r; sparkColors[i * 3 + 1] = c.g; sparkColors[i * 3 + 2] = c.b;
    sparkDelays[i] = Math.random();
  }
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute("position", new THREE.BufferAttribute(sparkPositions, 3));
  sparkGeometry.setAttribute("color", new THREE.BufferAttribute(sparkColors, 3));
  const sparkMaterial = new THREE.PointsMaterial({
    size: LOW_POWER ? 0.24 : 0.2, map: starGlowTexture, vertexColors: true,
    transparent: true, opacity: 0.7, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false, toneMapped: false
  });
  sparkleSystem = new THREE.Points(sparkGeometry, sparkMaterial);
  sparkleSystem.userData = { tree, galaxy, delays: sparkDelays, count: sparkCount, source: true };
  scene.add(sparkleSystem);
}

function buildOrnaments() {
  const count = COUNT.ornaments;
  const geometry = new THREE.SphereGeometry(1, 10, 8);
  const material = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 1 });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const dummy = new THREE.Object3D();
  const data = [];
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const treePos = ornamentTreePosition(i, count);
    const galaxyPos = galaxyPosition();
    const scale = 0.04 + Math.random() * 0.055;
    data.push({ treePos, galaxyPos, scale, delay: Math.random(), phase: Math.random() * Math.PI * 2 });
    color.setHex(ORNAMENT_COLORS[Math.floor(Math.random() * ORNAMENT_COLORS.length)]);
    mesh.setColorAt(i, color);
    dummy.position.set(treePos[0], treePos[1], treePos[2]);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceColor.needsUpdate = true;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.userData = { data, dummy };
  ornamentSystem = mesh;
  scene.add(mesh);
}

function buildGifts() {
  const count = COUNT.gifts;
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const boxMaterial = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 1 });
  const ribbonMaterial = new THREE.MeshBasicMaterial({ color: 0xffd76a, toneMapped: false, transparent: true, opacity: 1 });
  const boxes = new THREE.InstancedMesh(boxGeometry, boxMaterial, count);
  const ribbonA = new THREE.InstancedMesh(boxGeometry, ribbonMaterial, count);
  const ribbonB = new THREE.InstancedMesh(boxGeometry, ribbonMaterial, count);
  boxes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ribbonA.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ribbonB.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const dummy = new THREE.Object3D();
  const data = [];
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const t = 0.03 + Math.random() * 0.34;
    const y = t * 8 - 4;
    const radius = 3.7 * (1 - t * 0.9) * (0.82 + Math.random() * 0.3);
    const angle = Math.random() * Math.PI * 2;
    const treePos = [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
    const galaxyPos = galaxyPosition(0.85);
    const scale = 0.16 + Math.random() * 0.14;
    const rotation = Math.random() * Math.PI;
    data.push({ treePos, galaxyPos, scale, rotation, delay: Math.random(), phase: Math.random() * Math.PI * 2 });
    color.setHex(BOX_COLORS[i % BOX_COLORS.length]);
    boxes.setColorAt(i, color);
    dummy.position.set(treePos[0], treePos[1], treePos[2]);
    dummy.rotation.set(0, rotation, 0);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    boxes.setMatrixAt(i, dummy.matrix);
    dummy.scale.set(scale * 1.04, scale * 1.02, scale * 0.2);
    dummy.updateMatrix();
    ribbonA.setMatrixAt(i, dummy.matrix);
    dummy.scale.set(scale * 0.2, scale * 1.02, scale * 1.04);
    dummy.updateMatrix();
    ribbonB.setMatrixAt(i, dummy.matrix);
  }
  boxes.instanceColor.needsUpdate = true;
  [boxes, ribbonA, ribbonB].forEach(mesh => { mesh.instanceMatrix.needsUpdate = true; });
  const group = new THREE.Group();
  group.add(boxes, ribbonA, ribbonB);
  group.userData = { data, dummy, boxes, ribbonA, ribbonB };
  giftSystem = group;
  scene.add(group);
}

function buildRibbon() {
  const count = COUNT.ribbon;
  const geometry = new THREE.TetrahedronGeometry(1, 0);
  const material = new THREE.MeshBasicMaterial({ color: 0xffe2a8, toneMapped: false, transparent: true, opacity: 0.6 });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const dummy = new THREE.Object3D();
  const data = [];
  for (let i = 0; i < count; i++) {
    const treePos = ribbonTreePosition(i, count);
    const galaxyPos = galaxyPosition();
    data.push({ treePos, galaxyPos, delay: i / count, angle: (i / count) * Math.PI * 6, phase: Math.random() * Math.PI * 2 });
    dummy.position.set(treePos[0], treePos[1], treePos[2]);
    dummy.rotation.set(Math.PI * 0.15, data[i].angle, 0);
    dummy.scale.setScalar(0.045);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.userData = { data, dummy };
  ribbonSystem = mesh;
  scene.add(mesh);
}

function buildStar() {
  const shape = new THREE.Shape();
  const outer = 1;
  const inner = 0.42;
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + i * Math.PI / 5;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
  geometry.center();
  const material = new THREE.MeshBasicMaterial({ color: 0xffe6a3, toneMapped: false, transparent: true, opacity: 1 });
  starMesh = new THREE.Mesh(geometry, material);
  starMesh.position.set(0, 4.62, 0);
  starMesh.scale.setScalar(0.42);
  scene.add(starMesh);

  const glowMaterial = new THREE.SpriteMaterial({
    map: starGlowTexture, color: 0xffd88a, transparent: true,
    opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
  });
  starGlow = new THREE.Sprite(glowMaterial);
  starGlow.position.copy(starMesh.position);
  starGlow.scale.setScalar(1.9);
  scene.add(starGlow);
}

function buildSnow() {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(COUNT.snow * 3);
  const speeds = new Float32Array(COUNT.snow);
  const phases = new Float32Array(COUNT.snow);
  for (let i = 0; i < COUNT.snow; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 34;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 26;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 24;
    speeds[i] = 0.35 + Math.random() * 0.9;
    phases[i] = Math.random() * Math.PI * 2;
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    size: 0.075, color: 0xfff4e2, map: starGlowTexture, transparent: true,
    opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false
  });
  snowSystem = new THREE.Points(geometry, material);
  snowSystem.userData = { positions, speeds, phases, count: COUNT.snow };
  scene.add(snowSystem);
}

function roundedCardGeometry(width, height, radius) {
  const shape = new THREE.Shape();
  const w = width / 2;
  const h = height / 2;
  shape.moveTo(-w + radius, -h);
  shape.lineTo(w - radius, -h);
  shape.quadraticCurveTo(w, -h, w, -h + radius);
  shape.lineTo(w, h - radius);
  shape.quadraticCurveTo(w, h, w - radius, h);
  shape.lineTo(-w + radius, h);
  shape.quadraticCurveTo(-w, h, -w, h - radius);
  shape.lineTo(-w, -h + radius);
  shape.quadraticCurveTo(-w, -h, -w + radius, -h);
  return new THREE.ShapeGeometry(shape, 8);
}

function makeWhiteTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 512, 512);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function photoTreePosition(index, total) {
  const t = (index + 0.5) / total;
  const y = t * 6.4 - 3.2 + 0.4;
  const radius = 2.75 * (1 - t * 0.82);
  const angle = t * Math.PI * 10 + index * Math.PI * 0.55;
  return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
}

function buildPhotos() {
  const white = makeWhiteTexture();
  const cardGeometry = roundedCardGeometry(1, 1.25, 0.045);
  const photoGeometry = new THREE.PlaneGeometry(0.82, 0.72);
  const hitGeometry = new THREE.PlaneGeometry(1.06, 1.32);
  const cards = [];
  const group = new THREE.Group();
  for (let i = 0; i < COUNT.photos; i++) {
    const card = new THREE.Group();
    const frameMaterial = new THREE.MeshBasicMaterial({
      color: 0xd9cfba, side: THREE.DoubleSide, transparent: true, opacity: 0.96, toneMapped: true
    });
    const photoMaterial = new THREE.MeshBasicMaterial({
      map: white, color: 0xededed, side: THREE.DoubleSide, transparent: true, opacity: 1, toneMapped: true, depthTest: false
    });
    const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const frame = new THREE.Mesh(cardGeometry, frameMaterial);
    const photoMesh = new THREE.Mesh(photoGeometry, photoMaterial);
    photoMesh.position.set(0, 0.115, 0.006);
    const hit = new THREE.Mesh(hitGeometry, hitMaterial);
    hit.position.z = 0.01;
    card.add(frame, photoMesh, hit);
    frame.renderOrder = 10;
    photoMesh.renderOrder = 11;
    const treePos = photoTreePosition(i, COUNT.photos);
    const galaxyPos = galaxyPosition(0.72);
    card.position.set(treePos[0], treePos[1], treePos[2]);
    card.scale.setScalar(0.34);
    hit.userData.index = i;
    const data = {
      index: i,
      group: card,
      frameMaterial,
      photoMaterial,
      hit,
      treePos: new THREE.Vector3(...treePos),
      galaxyPos: new THREE.Vector3(...galaxyPos),
      position: new THREE.Vector3(...treePos),
      velocity: new THREE.Vector3(),
      scale: 0.34,
      scaleVelocity: 0,
      placeholder: true,
      frameMesh: frame,
      photoMesh,
      phase: Math.random() * Math.PI * 2
    };
    card.userData.data = data;
    group.add(card);
    cards.push(data);
  }
  scene.add(group);
  photoSystem = { group, cards, hitMeshes: cards.map(card => card.hit) };
}

function makeCaptionSet(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 300;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if ("letterSpacing" in ctx) ctx.letterSpacing = "4px";
  let fontSize = 72;
  ctx.font = '400 ' + fontSize + 'px ' + CAPTION_FONT;
  const measured = ctx.measureText(text).width;
  if (measured > 1450) {
    fontSize = Math.floor(fontSize * 1450 / measured);
    ctx.font = '400 ' + fontSize + 'px ' + CAPTION_FONT;
  }
  ctx.fillText(text, 800, 150);

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const raw = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const step = LOW_POWER ? 2 : 1;
  for (let y = 0; y < canvas.height; y += step) {
    for (let x = 0; x < canvas.width; x += step) {
      if (data[(y * canvas.width + x) * 4 + 3] > 110) {
        raw.push([x, y]);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!raw.length) return null;
  const widthPx = Math.max(1, maxX - minX);
  const heightPx = Math.max(1, maxY - minY);
  const scale = Math.min(3.0 / widthPx, 0.8 / heightPx, 0.01);
  const cap = LOW_POWER ? 4000 : 7000;
  const stride = Math.max(1, Math.floor(raw.length / cap));
  const chosen = [];
  for (let i = 0; i < raw.length; i += stride) chosen.push(raw[i]);
  const count = chosen.length;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const positions = new Float32Array(count * 3);
  const sources = new Float32Array(count * 3);
  const targets = new Float32Array(count * 3);
  const delays = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const light = new THREE.Color(0xfff5d8);
  const deep = new THREE.Color(0xffb35c);
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const px = chosen[i][0];
    const py = chosen[i][1];
    const tx = (px - cx) * scale;
    const ty = (cy - py) * scale + 2.35;
    targets[i3] = tx;
    targets[i3 + 1] = ty;
    targets[i3 + 2] = 2.65;
    sources[i3] = (Math.random() - 0.5) * 5.2;
    sources[i3 + 1] = 2.35 + (Math.random() - 0.5) * 2.4;
    sources[i3 + 2] = 2.1 + Math.random() * 1.3;
    positions[i3] = sources[i3];
    positions[i3 + 1] = sources[i3 + 1];
    positions[i3 + 2] = sources[i3 + 2];
    const mix = THREE.MathUtils.clamp((ty - 1.95) / 0.8, 0, 1);
    const color = deep.clone().lerp(light, mix);
    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;
    delays[i] = Math.random();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: LOW_POWER ? 0.042 : 0.03, map: starGlowTexture, vertexColors: true,
    transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false, toneMapped: false
  });
  const points = new THREE.Points(geometry, material);
  points.visible = false;
  points.frustumCulled = false;
  return { points, material, sources, targets, delays, count };
}

function buildCaptions() {
  captionGroup = new THREE.Group();
  captionSets = CAPTIONS.map(text => {
    const set = makeCaptionSet(text);
    if (!set) return { points: new THREE.Points(), material: { opacity: 0 }, sources: new Float32Array(0), targets: new Float32Array(0), delays: new Float32Array(0), count: 0 };
    captionGroup.add(set.points);
    return set;
  });
  scene.add(captionGroup);
}

function rebuildCaptions() {
  const keepIndex = captionIndex;
  const keepProgress = captionProgress;
  if (captionGroup) {
    captionGroup.children.forEach(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    scene.remove(captionGroup);
  }
  captionSets = [];
  buildCaptions();
  if (keepIndex >= 0) {
    activateCaption(keepIndex, true);
    captionProgress = keepProgress;
    applyCaption(captionProgress);
  }
}

async function loadCaptionFont() {
  if (!document.fonts || !document.fonts.load) return;
  const text = CAPTIONS.join("");
  try {
    await document.fonts.load('72px "Zhi Mang Xing"', text);
    const ready = document.fonts.check('72px "Zhi Mang Xing"', text);
    if (ready) rebuildCaptions();
  } catch (error) {}
}

function activateCaption(index, instant) {
  const i = Math.max(0, Math.min(captionSets.length - 1, index));
  captionIndex = i;
  captionSets.forEach((set, n) => {
    if (!set.points) return;
    set.points.visible = n === i;
    set.material.opacity = 0;
  });
  captionProgress = instant ? 1 : 0;
  if (instant) applyCaption(1);
}

function applyCaption(progress) {
  const set = captionSets[captionIndex];
  if (!set || !set.points.geometry) return;
  const attr = set.points.geometry.attributes.position;
  if (!attr) return;
  const array = attr.array;
  for (let i = 0; i < set.count; i++) {
    const i3 = i * 3;
    const local = Math.min(1, Math.max(0, (progress - set.delays[i] * 0.3) / 0.7));
    const eased = local * local * (3 - 2 * local);
    array[i3] = set.sources[i3] + (set.targets[i3] - set.sources[i3]) * eased;
    array[i3 + 1] = set.sources[i3 + 1] + (set.targets[i3 + 1] - set.sources[i3 + 1]) * eased;
    array[i3 + 2] = set.sources[i3 + 2] + (set.targets[i3 + 2] - set.sources[i3 + 2]) * eased;
  }
  attr.needsUpdate = true;
  set.material.opacity = THREE.MathUtils.smoothstep(progress, 0.05, 0.45);
}

function updateCaption(dt) {
  if (captionIndex < 0) return;
  const target = app.mode === "focus" ? 1 : 0;
  captionProgress = Math.min(1, Math.max(0, captionProgress + (target ? dt / 1.1 : -dt / 0.5)));
  if (captionProgress > 0) applyCaption(captionProgress);
  if (captionProgress <= 0 && target === 0) {
    captionSets.forEach(set => { if (set.points) set.points.visible = false; });
    captionIndex = -1;
  }
}


function buildAll() {
  buildRenderer();
  buildScene();
  buildStars();
  buildParticles();
  buildOrnaments();
  buildGifts();
  buildRibbon();
  buildStar();
  buildSnow();
  buildPhotos();
  buildCaptions();
  bindUI();
  bindPointer();
  onResize();
  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", () => { paused = document.hidden; });
  applyQueryState();
  requestAnimationFrame(loop);
  setTimeout(() => $("loader").classList.add("hidden"), 500);
}

let paused = false;

function applyQueryState() {
  const requested = QUERY.get("state");
  if (QUERY.get("nobloom") === "1" && bloomPass) bloomPass.enabled = false;
  if (!requested) return;
  if (requested === "galaxy" || requested === "focus") {
    if (requested === "galaxy") updateHint();
    if (requested === "focus") updateHint();
    app.mode = requested;
    app.progress = 1;
    app.target = 1;
    if (requested === "focus") {
      app.focusIndex = Math.min(COUNT.photos - 1, Math.max(0, Number(QUERY.get("photo") || 0)));
      app.focusAmount = 1;
      activateCaption(app.focusIndex, true);
    }
    snapScene();
  }
  if (requested === "tree") {
    app.mode = "tree";
    app.progress = 0;
    app.target = 0;
  }
}

function snapScene() {
  photoSystem.cards.forEach(card => {
    const target = photoTarget(card);
    card.position.copy(target.position);
    card.scale = target.scale;
    card.velocity.set(0, 0, 0);
    card.scaleVelocity = 0;
    card.group.position.copy(card.position);
    card.group.scale.setScalar(card.scale);
    card.group.lookAt(camera.position);
  });
  updateTransforms(0);
}

function onResize() {
  if (!renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.resolution.set(window.innerWidth / 2, window.innerHeight / 2);
}

function setMode(mode) {
  if (app.mode === mode) return;
  app.mode = mode;
  if (mode === "tree") {
    app.target = 0;
    app.focusIndex = -1;
    updateHint();
  } else if (mode === "galaxy") {
    app.target = 1;
    app.focusIndex = -1;
    updateHint();
  } else if (mode === "focus") {
    app.target = 1;
    updateHint();
  }
}

function updateHint() {
  const gestures = !!camStream;
  let text = "";
  if (app.mode === "focus") text = gestures ? "捏合或点击任意处返回" : "点击任意处返回";
  else if (app.mode === "galaxy") text = gestures ? "张开手掌环绕 · 捏合放大 · 握拳收回" : "拖拽旋转 · 点击照片放大";
  else text = gestures ? "张开手掌散开 · 握拳收回 · 捏合放大" : "点击空白处散开 · 点击照片查看";
  $("hint").textContent = text;
}

function focusPhoto(index) {
  if (index < 0 || index >= COUNT.photos) return;
  app.focusIndex = index;
  setMode("focus");
  app.mode = "focus";
  activateCaption(index, false);
  updateHint();
}

function clearFocus() {
  if (app.mode !== "focus") return;
  app.focusIndex = -1;
  app.mode = "galaxy";
  app.target = 1;
  updateHint();
}

function photoTarget(card) {
  if (app.mode === "tree") return { position: card.treePos, scale: 0.34, opacity: card.placeholder ? 0 : 1 };
  if (app.mode === "focus" && app.focusIndex === card.index) return { position: FOCUS_POS, scale: 2.95, opacity: 1 };
  const dim = app.mode === "focus" ? 0.08 : 1;
  return { position: card.galaxyPos, scale: 0.62, opacity: dim };
}

const FOCUS_POS = new THREE.Vector3(0, 0, 2.4);

function updatePhotos(dt) {
  const stiffness = 26;
  const damping = 8.4;
  const scaleStiffness = 30;
  const scaleDamping = 9.5;
  const dimTarget = app.focusIndex >= 0 ? 1 : 0;
  app.focusAmount += (dimTarget - app.focusAmount) * Math.min(1, dt * 5);
  photoSystem.cards.forEach(card => {
    const target = photoTarget(card);
    const displacement = card.position.clone().sub(target.position);
    const acceleration = displacement.multiplyScalar(-stiffness).add(card.velocity.clone().multiplyScalar(-damping));
    card.velocity.add(acceleration.multiplyScalar(dt));
    card.position.add(card.velocity.clone().multiplyScalar(dt));
    const scaleDelta = card.scale - target.scale;
    card.scaleVelocity += (-scaleStiffness * scaleDelta - scaleDamping * card.scaleVelocity) * dt;
    card.scale += card.scaleVelocity * dt;
    card.group.position.copy(card.position);
    card.group.position.y += Math.sin(app.time * 0.9 + card.phase) * 0.012;
    card.group.scale.setScalar(card.scale);
    card.group.lookAt(camera.position);
    const focusedCard = app.mode === "focus" && app.focusIndex === card.index;
    card.group.visible = app.mode !== "focus" || focusedCard;
    card.hit.visible = !(app.mode === "tree" && card.placeholder);
    card.frameMesh.renderOrder = focusedCard ? 20 : 10;
    card.photoMesh.renderOrder = focusedCard ? 21 : 11;
    card.frameMaterial.opacity = 0.96 * (target.opacity ?? 1);
    card.photoMaterial.opacity = (target.opacity ?? 1);
  });
}

function updateTransforms(dt) {
  const progress = app.progress;
  const focusDim = 1 - 0.85 * app.focusAmount;
  const particles = particleSystem.userData;
  const pos = particleSystem.geometry.attributes.position.array;
  const time = app.time;
  const idle = app.mode === "tree";
  for (let i = 0; i < particles.count; i++) {
    const i3 = i * 3;
    const local = Math.min(1, Math.max(0, (progress - particles.delays[i] * 0.5) / 0.62));
    const eased = local * local * (3 - 2 * local);
    const breathe = idle ? Math.sin(time * particles.speeds[i] + particles.phases[i]) * 0.02 : 0;
    pos[i3] = particles.tree[i3] + (particles.galaxy[i3] - particles.tree[i3]) * eased;
    pos[i3 + 1] = particles.tree[i3 + 1] + (particles.galaxy[i3 + 1] - particles.tree[i3 + 1]) * eased + breathe;
    pos[i3 + 2] = particles.tree[i3 + 2] + (particles.galaxy[i3 + 2] - particles.tree[i3 + 2]) * eased;
  }
  particleSystem.geometry.attributes.position.needsUpdate = true;
  particleSystem.material.opacity = focusDim;

  const spark = sparkleSystem.userData;
  const sparkPos = sparkleSystem.geometry.attributes.position.array;
  for (let i = 0; i < spark.count; i++) {
    const i3 = i * 3;
    const local = Math.min(1, Math.max(0, (progress - spark.delays[i] * 0.5) / 0.62));
    const eased = local * local * (3 - 2 * local);
    const source = Math.floor(i * (COUNT.particles / spark.count)) % COUNT.particles;
    sparkPos[i3] = spark.tree[source * 3] + (spark.galaxy[source * 3] - spark.tree[source * 3]) * eased;
    sparkPos[i3 + 1] = spark.tree[source * 3 + 1] + (spark.galaxy[source * 3 + 1] - spark.tree[source * 3 + 1]) * eased;
    sparkPos[i3 + 2] = spark.tree[source * 3 + 2] + (spark.galaxy[source * 3 + 2] - spark.tree[source * 3 + 2]) * eased;
  }
  sparkleSystem.geometry.attributes.position.needsUpdate = true;
  sparkleSystem.material.opacity = 0.7 * focusDim;

  const ornament = ornamentSystem.userData;
  const dummy = ornament.dummy;
  for (let i = 0; i < ornament.data.length; i++) {
    const item = ornament.data[i];
    const local = Math.min(1, Math.max(0, (progress - item.delay * 0.4) / 0.65));
    const eased = local * local * (3 - 2 * local);
    const x = item.treePos[0] + (item.galaxyPos[0] - item.treePos[0]) * eased;
    const y = item.treePos[1] + (item.galaxyPos[1] - item.treePos[1]) * eased;
    const z = item.treePos[2] + (item.galaxyPos[2] - item.treePos[2]) * eased;
    dummy.position.set(x, y + (idle ? Math.sin(time * 0.7 + item.phase) * 0.02 : 0), z);
    dummy.rotation.set(time * 0.2, time * 0.3 + item.phase, 0);
    dummy.scale.setScalar(item.scale);
    dummy.updateMatrix();
    ornamentSystem.setMatrixAt(i, dummy.matrix);
  }
  ornamentSystem.instanceMatrix.needsUpdate = true;
  ornamentSystem.material.opacity = focusDim;

  const gift = giftSystem.userData;
  const giftDummy = gift.dummy;
  for (let i = 0; i < gift.data.length; i++) {
    const item = gift.data[i];
    const local = Math.min(1, Math.max(0, (progress - item.delay * 0.4) / 0.65));
    const eased = local * local * (3 - 2 * local);
    const x = item.treePos[0] + (item.galaxyPos[0] - item.treePos[0]) * eased;
    const y = item.treePos[1] + (item.galaxyPos[1] - item.treePos[1]) * eased;
    const z = item.treePos[2] + (item.galaxyPos[2] - item.treePos[2]) * eased;
    giftDummy.position.set(x, y + (idle ? Math.sin(time * 0.6 + item.phase) * 0.015 : 0), z);
    giftDummy.rotation.set(0, item.rotation + time * 0.12, 0);
    giftDummy.scale.setScalar(item.scale);
    giftDummy.updateMatrix();
    gift.boxes.setMatrixAt(i, giftDummy.matrix);
    giftDummy.scale.set(item.scale * 1.04, item.scale * 1.02, item.scale * 0.2);
    giftDummy.updateMatrix();
    gift.ribbonA.setMatrixAt(i, giftDummy.matrix);
    giftDummy.scale.set(item.scale * 0.2, item.scale * 1.02, item.scale * 1.04);
    giftDummy.updateMatrix();
    gift.ribbonB.setMatrixAt(i, giftDummy.matrix);
  }
  gift.boxes.instanceMatrix.needsUpdate = true;
  gift.ribbonA.instanceMatrix.needsUpdate = true;
  gift.ribbonB.instanceMatrix.needsUpdate = true;
  gift.boxes.material.opacity = focusDim;
  gift.ribbonA.material.opacity = focusDim;

  const ribbon = ribbonSystem.userData;
  for (let i = 0; i < ribbon.data.length; i++) {
    const item = ribbon.data[i];
    const local = Math.min(1, Math.max(0, (progress - item.delay * 0.5) / 0.6));
    const eased = local * local * (3 - 2 * local);
    ribbon.dummy.position.set(
      item.treePos[0] + (item.galaxyPos[0] - item.treePos[0]) * eased,
      item.treePos[1] + (item.galaxyPos[1] - item.treePos[1]) * eased,
      item.treePos[2] + (item.galaxyPos[2] - item.treePos[2]) * eased
    );
    ribbon.dummy.rotation.set(Math.PI * 0.15 + time * 0.1, item.angle + time * 0.25, 0);
    ribbon.dummy.scale.setScalar(0.04);
    ribbon.dummy.updateMatrix();
    ribbonSystem.setMatrixAt(i, ribbon.dummy.matrix);
  }
  ribbonSystem.instanceMatrix.needsUpdate = true;
  ribbonSystem.material.opacity = 0.5 * focusDim;

  const starFade = 1 - Math.min(1, progress * 1.6);
  starMesh.material.opacity = starFade;
  starGlow.material.opacity = 0.34 * starFade;
  starMesh.visible = starFade > 0.01;
  starGlow.visible = starMesh.visible;
  if (starMesh.visible) {
    starMesh.rotation.z = Math.sin(time * 0.5) * 0.12;
    const pulse = 0.42 + Math.sin(time * 1.8) * 0.015;
    starMesh.scale.setScalar(pulse);
    starGlow.scale.setScalar(1.9 + Math.sin(time * 1.6) * 0.09);
  }
  focusLight.intensity = app.focusAmount * 2.2;
  const isolate = app.focusAmount > 0.5;
  particleSystem.visible = !isolate;
  sparkleSystem.visible = !isolate;
  ornamentSystem.visible = !isolate;
  giftSystem.visible = !isolate;
  ribbonSystem.visible = !isolate;
  snowSystem.visible = !isolate;
}

function updateSnow(dt) {
  const data = snowSystem.userData;
  const positions = data.positions;
  for (let i = 0; i < data.count; i++) {
    const i3 = i * 3;
    positions[i3 + 1] -= data.speeds[i] * dt;
    positions[i3] += Math.sin(app.time * 0.4 + data.phases[i]) * 0.004;
    if (positions[i3 + 1] < -13) {
      positions[i3 + 1] = 13;
      positions[i3] = (Math.random() - 0.5) * 34;
      positions[i3 + 2] = (Math.random() - 0.5) * 24;
    }
  }
  snowSystem.geometry.attributes.position.needsUpdate = true;
}

function updateCamera(dt) {
  const targetPos = new THREE.Vector3();
  const targetLook = new THREE.Vector3(0, 0.1, 0);
  if (app.mode === "focus") {
    targetPos.set(0, 0.35, 9.8);
    targetLook.copy(FOCUS_POS);
  } else if (app.mode === "galaxy") {
    const radius = camera.aspect > 1.15 ? 20 : (LOW_POWER ? 17 : 16.5);
    const phi = cameraOrbit.phi;
    targetPos.set(
      radius * Math.sin(phi) * Math.sin(cameraOrbit.theta),
      radius * Math.cos(phi) + 1.2,
      radius * Math.sin(phi) * Math.cos(cameraOrbit.theta)
    );
    targetLook.set(0, 0, 0);
  } else {
    const wide = camera.aspect > 1.15;
    const radius = wide ? 14.8 : (LOW_POWER ? 12.5 : 11.8);
    targetPos.set(
      Math.sin(cameraOrbit.theta) * radius,
      1.6 + Math.sin(app.time * 0.25) * 0.2,
      Math.cos(cameraOrbit.theta) * radius
    );
    targetLook.set(0, wide ? -0.9 : 0.15, 0);
  }
  targetPos.x += pointer.x * 0.35;
  targetPos.y += pointer.y * 0.25;
  const smooth = 1 - Math.exp(-(app.mode === "focus" ? 3.4 : 2.2) * dt);
  cameraPosition.lerp(targetPos, smooth);
  lookAt.lerp(targetLook, smooth);
  camera.position.copy(cameraPosition);
  camera.lookAt(lookAt);
}

function updateOrbit(dt) {
  if (app.mode === "focus") return;
  if (app.mode === "galaxy" && hand.active) {
    cameraOrbit.theta += ((0.7 + (hand.x - 0.5) * 2.6) - cameraOrbit.theta) * Math.min(1, dt * 3.5);
    cameraOrbit.phi += ((1.15 - (hand.y - 0.5) * 0.7) - cameraOrbit.phi) * Math.min(1, dt * 3.5);
    return;
  }
  cameraOrbit.theta += dt * (app.mode === "tree" ? 0.11 : 0.06);
}

function loop(now) {
  requestAnimationFrame(loop);
  if (paused) return;
  const dt = Math.min(0.033, (now - (loop.last || now)) / 1000 || 0.016);
  loop.last = now;
  app.time += dt;

  if (app.mode === "tree") {
    app.progress = Math.max(0, app.progress - dt / 1.4);
  } else {
    app.progress = Math.min(1, app.progress + dt / 1.7);
  }

  pointer.x += (pointer.tx - pointer.x) * 0.05;
  pointer.y += (pointer.ty - pointer.y) * 0.05;

  updateOrbit(dt);
  updateCamera(dt);
  updateTransforms(dt);
  updatePhotos(dt);
  updateCaption(dt);
  updateSnow(dt);

  if (starField) starField.rotation.y += dt * 0.004;

  composer.render();
}

function bindUI() {
  $("addBtn").addEventListener("click", () => $("fileInput").click());
  $("fileInput").addEventListener("change", handleUpload);
  $("closeShot").addEventListener("click", () => $("shotModal").classList.add("hidden"));
  $("saveBtn").addEventListener("click", takeShot);
  $("shareBtn").addEventListener("click", sharePage);
  $("soundBtn").addEventListener("click", () => {
    if (music.playing) { music.stop(); $("soundBtn").classList.add("off"); }
    else { music.start(); $("soundBtn").classList.remove("off"); }
  });
  $("camBtn").addEventListener("click", startGestures);
}

let pendingFocusTimer = 0;

function handleUpload(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  const loader = new THREE.TextureLoader();
  const slots = photoSystem.cards.filter(card => card.placeholder).slice(0, files.length);
  if (!slots.length) {
    toast("照片已满，最多 12 张");
    event.target.value = "";
    return;
  }
  slots.forEach((slot, index) => {
    const file = files[index];
    if (!file) return;
    slot.placeholder = false;
    const reader = new FileReader();
    reader.onload = () => {
      loader.load(String(reader.result), texture => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        coverTexture(texture, 0.82 / 0.72);
        slot.photoMaterial.map = texture;
        slot.photoMaterial.color.setHex(0xffffff);
        slot.photoMaterial.needsUpdate = true;
        toast("照片已添加");
      }, undefined, () => {
        slot.placeholder = true;
        toast("有一张照片读取失败");
      });
    };
    reader.onerror = () => {
      slot.placeholder = true;
      toast("有一张照片读取失败");
    };
    reader.readAsDataURL(file);
  });
  event.target.value = "";
}

function coverTexture(texture, targetAspect) {
  const image = texture.image;
  if (!image || !image.width || !image.height) return;
  const aspect = image.width / image.height;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  if (aspect > targetAspect) {
    texture.repeat.x = targetAspect / aspect;
    texture.offset.x = (1 - texture.repeat.x) / 2;
  } else {
    texture.repeat.y = aspect / targetAspect;
    texture.offset.y = (1 - texture.repeat.y) / 2;
  }
}

function bindPointer() {
  const element = renderer.domElement;
  let down = null;
  let dragged = false;
  let lastX = 0, lastY = 0;
  const raycaster = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2();

  element.addEventListener("pointerdown", event => {
    down = { x: event.clientX, y: event.clientY, t: performance.now() };
    dragged = false;
    lastX = event.clientX;
    lastY = event.clientY;
    element.setPointerCapture(event.pointerId);
  });

  element.addEventListener("pointermove", event => {
    pointer.tx = (event.clientX / window.innerWidth - 0.5) * 2;
    pointer.ty = (event.clientY / window.innerHeight - 0.5) * 2;
    if (!down) return;
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 8) dragged = true;
    if (dragged && app.mode === "galaxy") {
      cameraOrbit.theta -= (event.clientX - lastX) * 0.006;
      cameraOrbit.phi = Math.min(1.55, Math.max(0.75, cameraOrbit.phi - (event.clientY - lastY) * 0.004));
      lastX = event.clientX;
      lastY = event.clientY;
    }
  });

  element.addEventListener("pointerup", event => {
    if (!down) return;
    const elapsed = performance.now() - down.t;
    const wasDrag = dragged;
    down = null;
    if (wasDrag || elapsed > 700) return;
    pointerNDC.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObjects(photoSystem.hitMeshes, false);
    if (hits.length) {
      const index = hits[0].object.userData.index;
      if (app.mode === "focus") { clearFocus(); return; }
      if (app.mode === "tree") {
        setMode("galaxy");
        setTimeout(() => focusPhoto(index), 850);
      } else {
        focusPhoto(index);
      }
      return;
    }
    if (app.mode === "focus") clearFocus();
    else if (app.mode === "tree") setMode("galaxy");
    else setMode("tree");
  });

  element.addEventListener("pointerleave", () => { down = null; });
}

function takeShot() {
  composer.render();
  $("shotImg").src = renderer.domElement.toDataURL("image/png");
  $("shotModal").classList.remove("hidden");
}

async function sharePage() {
  const payload = { title: "Merry Christmas", text: "张开手掌，让圣诞树散开。", url: location.href };
  if (navigator.share) {
    try { await navigator.share(payload); return; } catch (error) { if (error && error.name === "AbortError") return; }
  }
  try {
    await navigator.clipboard.writeText(location.href);
    toast("链接已复制");
  } catch (error) {
    toast("复制失败，请手动复制地址栏链接");
  }
}

class MusicBox {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.bellTimer = 0;
    this.playing = false;
  }
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 760;
    filter.connect(master);
    [146.83, 220.0, 293.66, 369.99].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      osc.type = index % 2 ? "sine" : "triangle";
      osc.frequency.value = freq;
      osc.detune.value = index * 4 - 6;
      const gain = ctx.createGain();
      gain.gain.value = 0.05 / (1 + index * 0.35);
      osc.connect(gain).connect(filter);
      osc.start();
    });
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 240;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    this.ctx = ctx;
    this.master = master;
  }
  start() {
    this.ensure();
    if (!this.ctx) return;
    this.playing = true;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setTargetAtTime(0.15, this.ctx.currentTime, 1.2);
    this.scheduleBell();
  }
  stop() {
    if (!this.ctx) return;
    this.playing = false;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
    clearTimeout(this.bellTimer);
  }
  scheduleBell() {
    clearTimeout(this.bellTimer);
    if (!this.playing) return;
    this.bellTimer = setTimeout(() => {
      if (!this.playing) return;
      this.bell();
      this.scheduleBell();
    }, 2100 + Math.random() * 3200);
  }
  bell() {
    const notes = [587.33, 659.25, 739.99, 880.0, 987.77, 1174.66];
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = notes[Math.floor(Math.random() * notes.length)];
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.085, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.0);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 3.2);
  }
}

const music = new MusicBox();

let camStream = null;
let handsInstance = null;
let gestureFrame = 0;
let handsBusy = false;

async function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-src="${src}"]`);
    if (existing) { resolve(); return; }
    const script = document.createElement("script");
    script.src = src;
    script.crossOrigin = "anonymous";
    script.dataset.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error("load failed"));
    document.head.appendChild(script);
  });
}

async function startGestures() {
  const button = $("camBtn");
  const state = $("camState");
  if (camStream) {
    stopGestures();
    button.classList.remove("on");
    button.textContent = "启用摄像头手势";
    state.textContent = "";
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    state.textContent = "此浏览器不支持摄像头";
    return;
  }
  if (!window.isSecureContext) {
    state.textContent = "摄像头需要 HTTPS，本机预览请用 localhost";
    return;
  }
  state.textContent = "正在请求摄像头…";
  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: LOW_POWER ? 320 : 640 }, height: { ideal: LOW_POWER ? 240 : 480 } },
      audio: false
    });
    music.ensure();
  } catch (error) {
    state.textContent = "摄像头被拒绝，可点击/拖拽体验";
    return;
  }
  button.classList.add("on");
  button.textContent = "关闭手势";
  state.textContent = "手势已开启";
  updateHint();
  const video = document.createElement("video");
  video.playsInline = true;
  video.muted = true;
  video.autoplay = true;
  video.srcObject = camStream;
  video.style.display = "none";
  document.body.appendChild(video);
  video.play().catch(() => {});
  let retries = 0;
  while ((video.videoWidth === 0 || video.videoHeight === 0) && retries < 40) {
    await new Promise(resolve => setTimeout(resolve, 100));
    retries++;
  }
  if (!video.videoWidth) {
    state.textContent = "摄像头未就绪";
    stopGestures();
    button.classList.remove("on");
    button.textContent = "启用摄像头手势";
    return;
  }
  const sources = [
    "https://fastly.jsdelivr.net/npm/@mediapipe/hands/hands.js",
    "https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js",
    "https://unpkg.com/@mediapipe/hands/hands.js"
  ];
  let loaded = false;
  let base = "https://cdn.jsdelivr.net/npm/@mediapipe/hands";
  for (const src of sources) {
    try {
      await loadScript(src);
      loaded = true;
      base = src.replace(/\/hands\.js$/, "");
      break;
    } catch (error) {}
  }
  if (!loaded || !window.Hands) {
    state.textContent = "手势库加载失败，可点击/拖拽体验";
    stopGestures();
    button.classList.remove("on");
    button.textContent = "启用摄像头手势";
    return;
  }
  const hands = new window.Hands({ locateFile: file => `${base}/${file}` });
  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: LOW_POWER ? 0 : 1,
    minDetectionConfidence: 0.55,
    minTrackingConfidence: 0.45
  });
  let candidate = "none";
  let candidateSince = 0;
  let lastFired = 0;
  hands.onResults(results => {
    const marks = results.multiHandLandmarks;
    if (!marks || !marks.length) {
      hand.active = false;
      state.textContent = "手势已开启 · 把手放进画面";
      return;
    }
    hand.active = true;
    const lm = marks[0];
    hand.x = 1 - lm[9].x;
    hand.y = lm[9].y;
    const spread = (a, b) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y, lm[a].z - lm[b].z);
    const pinch = spread(4, 8);
    const extended = [8, 12, 16, 20].filter((tip, index) => lm[tip].y < lm[[5, 9, 13, 17][index]].y).length;
    let gesture = "none";
    if (pinch < 0.055) gesture = "pinch";
    else if (extended >= 3) gesture = "open";
    else if (extended <= 1) gesture = "fist";
    const now = performance.now();
    if (gesture !== candidate) {
      candidate = gesture;
      candidateSince = now;
    }
    if (gesture !== "none" && now - candidateSince > 180 && now - lastFired > 900) {
      lastFired = now;
      if (gesture === "open" && app.mode === "tree") setMode("galaxy");
      else if (gesture === "fist" && app.mode !== "tree") setMode("tree");
      else if (gesture === "pinch") {
        if (app.mode === "galaxy") {
          const index = Math.floor(Math.random() * COUNT.photos);
          focusPhoto(index);
        } else if (app.mode === "focus") {
          clearFocus();
        }
      }
    }
    const labels = { open: "张开手掌", fist: "握拳", pinch: "捏合", none: "识别中" };
    state.textContent = "手势已开启 · " + (labels[gesture] || "");
  });
  handsInstance = hands;
  const processFrame = async () => {
    if (!camStream || !handsInstance) return;
    if (!handsBusy && !paused && video.readyState >= 2) {
      handsBusy = true;
      try { await hands.send({ image: video }); } catch (error) {}
      handsBusy = false;
    }
    gestureFrame = requestAnimationFrame(processFrame);
  };
  processFrame();
}

function stopGestures() {
  cancelAnimationFrame(gestureFrame);
  if (camStream) {
    camStream.getTracks().forEach(track => track.stop());
    camStream = null;
  }
  document.querySelectorAll("video").forEach(video => video.remove());
  handsInstance = null;
  hand.active = false;
  updateHint();
}

try { buildAll(); } catch (error) { const loader = document.getElementById('loader'); loader.querySelector('p').textContent = '浏览器不支持 WebGL，换一个浏览器试试'; console.error(error); }
updateHint();
loadCaptionFont();
