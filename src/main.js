import "./style.css";
import { OrbEngine } from "./orbEngine";
import { exportEmbedSnippet, exportPNG, exportPresetJSON, exportWebM } from "./exporters";
import { cloneState, DEFAULT_STATE, mergeState, PRESETS } from "./presets";

const STORAGE_KEY = "liquid-orb-mvp-state-v1";

const canvas = document.querySelector("#app");
const engine = new OrbEngine(canvas);

const statusLine = document.querySelector("#statusLine");
const controls = {
  animate: document.querySelector("#animate"),
  speed: document.querySelector("#speed"),
  loopDuration: document.querySelector("#loopDuration"),
  blob: document.querySelector("#blob"),
  detail: document.querySelector("#detail"),
  roundness: document.querySelector("#roundness"),
  size: document.querySelector("#size"),
  transmission: document.querySelector("#transmission"),
  thickness: document.querySelector("#thickness"),
  roughness: document.querySelector("#roughness"),
  iridescence: document.querySelector("#iridescence"),
  glow: document.querySelector("#glow"),
  colorA: document.querySelector("#colorA"),
  colorB: document.querySelector("#colorB"),
  colorC: document.querySelector("#colorC"),
  bgTransparent: document.querySelector("#bgTransparent"),
  bgA: document.querySelector("#bgA"),
  bgB: document.querySelector("#bgB"),
  fxRefraction: document.querySelector("#fxRefraction"),
  fxAberration: document.querySelector("#fxAberration"),
  fxGrain: document.querySelector("#fxGrain"),
};

let state = loadState();

function setStatus(message) {
  statusLine.textContent = message;
}

function updateBackground(nextState) {
  document.documentElement.style.setProperty("--bg-a", nextState.bgA);
  document.documentElement.style.setProperty("--bg-b", nextState.bgB);
}

function applyState() {
  engine.setState(state);
  updateBackground(state);
  updateValueLabels();
  persistState();
}

function updateValueLabels() {
  document.querySelectorAll("[data-value-for]").forEach((node) => {
    const key = node.getAttribute("data-value-for");
    if (key in state) {
      node.textContent = Number(state[key]).toFixed(2);
    }
  });
}

function syncInputsFromState() {
  Object.entries(controls).forEach(([key, input]) => {
    if (input.type === "checkbox") {
      input.checked = Boolean(state[key]);
    } else {
      input.value = state[key];
    }
  });
}

function updateState(patch) {
  state = mergeState(state, patch);
  applyState();
}

function bindControls() {
  Object.entries(controls).forEach(([key, input]) => {
    input.addEventListener("input", () => {
      let value;
      if (input.type === "checkbox") {
        value = input.checked;
      } else if (input.type === "color") {
        value = input.value;
      } else {
        value = Number(input.value);
      }
      updateState({ [key]: value });
    });
  });
}

function randomColor() {
  const hue = Math.floor(Math.random() * 360);
  const sat = 60 + Math.random() * 30;
  const light = 60 + Math.random() * 18;
  return `hsl(${hue} ${sat}% ${light}%)`;
}

function randomize() {
  const randomState = {
    blob: Math.random() * 1,
    detail: 0.55 + Math.random() * 2.65,
    roundness: 0.55 + Math.random() * 0.95,
    size: 0.75 + Math.random() * 0.65,
    transmission: 0.82 + Math.random() * 0.18,
    thickness: 0.7 + Math.random() * 2.5,
    roughness: Math.random() * 0.28,
    speed: Math.random() * 1.8,
    loopDuration: 3 + Math.random() * 10,
    iridescence: Math.random() * 2.15,
    glow: Math.random() * 1.05,
    colorA: randomColorToHex(randomColor()),
    colorB: randomColorToHex(randomColor()),
    colorC: randomColorToHex(randomColor()),
    fxRefraction: Math.random() * 0.28,
    fxAberration: Math.random() * 0.008,
    fxGrain: Math.random() * 0.22,
    seed: Math.random(),
  };
  state = mergeState(state, randomState);
  syncInputsFromState();
  applyState();
  setStatus("Random preset created.");
}

function randomColorToHex(cssColor) {
  const node = document.createElement("div");
  node.style.color = cssColor;
  document.body.append(node);
  const computed = getComputedStyle(node).color;
  node.remove();
  const parts = computed.match(/\d+/g) || ["255", "255", "255"];
  const [r, g, b] = parts.map((part) => Number(part));
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function initPresets() {
  document.querySelectorAll("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.getAttribute("data-preset");
      if (!key || !PRESETS[key]) {
        return;
      }
      state = mergeState(state, PRESETS[key]);
      syncInputsFromState();
      applyState();
      setStatus(`Preset loaded: ${key}.`);
    });
  });
}

async function bindExportActions() {
  document.querySelector("#exportPngBtn").addEventListener("click", async () => {
    try {
      engine.forceRender();
      await exportPNG(engine.getCanvas());
      setStatus("PNG exported.");
    } catch (error) {
      setStatus(error.message);
    }
  });

  document.querySelector("#exportVideoBtn").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    setStatus("Recording 6s WebM...");
    try {
      await exportWebM(engine.getCanvas(), 6);
      setStatus("WebM exported.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector("#exportJsonBtn").addEventListener("click", () => {
    exportPresetJSON(state);
    setStatus("Preset JSON exported.");
  });

  document.querySelector("#exportCodeBtn").addEventListener("click", () => {
    exportEmbedSnippet(state);
    setStatus("Embed code exported.");
  });
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  const base = cloneState(DEFAULT_STATE);
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return base;
  }
  try {
    const parsed = JSON.parse(raw);
    return mergeState(base, parsed);
  } catch {
    return base;
  }
}

document.querySelector("#randomizeBtn").addEventListener("click", randomize);
document.querySelector("#resetBtn").addEventListener("click", () => {
  state = cloneState(DEFAULT_STATE);
  syncInputsFromState();
  applyState();
  setStatus("Reset to default.");
});

bindControls();
initPresets();
bindExportActions();
syncInputsFromState();
applyState();
setStatus("Ready.");
