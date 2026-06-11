// All DOM wiring lives here. index.html carries no inline on* handlers; buttons
// declare intent via data-* attributes and sliders are bound from one table.

import { brush, setTool } from './sculpt.js';
import { resetMesh } from './clay.js';
import { PHYS, applyPreset } from './physics.js';
import { DEPTH_CFG, startCalibration } from './hands.js';

// slider id → setter + value-display id. The displayed text mirrors the raw
// slider value (matching the original behavior).
const SLIDER_BINDINGS = [
  { id: 'p-radius', out: 'v-radius', set: v => { brush.radius = v; } },
  { id: 'p-strength', out: 'v-strength', set: v => { brush.strength = v; } },
  { id: 'p-falloff', out: 'v-falloff', set: v => { brush.falloff = v; } },
  { id: 'p-volume', out: 'v-volume', set: v => { brush.volumePreserve = v; } },
  { id: 'p-spring', out: 'v-spring', set: v => { PHYS.springK = v; } },
  { id: 'p-rest', out: 'v-rest', set: v => { PHYS.restK = v; } },
  { id: 'p-damp', out: 'v-damp', set: v => { PHYS.damping = v; } },
  { id: 'p-plastic', out: 'v-plastic', set: v => { PHYS.plasticity = v; } },
  { id: 'p-dbase', out: 'v-dbase', set: v => { DEPTH_CFG.baseOffset = v; } },
  { id: 'p-dgain', out: 'v-dgain', set: v => { DEPTH_CFG.gain = v; } },
  { id: 'p-drelz', out: 'v-drelz', set: v => { DEPTH_CFG.relZGain = v; } },
];

// Material sliders re-synced when a preset is applied.
const MATERIAL_SLIDERS = [
  { id: 'p-spring', out: 'v-spring', read: () => PHYS.springK },
  { id: 'p-rest', out: 'v-rest', read: () => PHYS.restK },
  { id: 'p-damp', out: 'v-damp', read: () => PHYS.damping },
  { id: 'p-plastic', out: 'v-plastic', read: () => PHYS.plasticity },
];

function syncMaterialSliders() {
  for (const { id, out, read } of MATERIAL_SLIDERS) {
    const el = document.getElementById(id);
    const vl = document.getElementById(out);
    const val = read();
    if (el) el.value = val;
    if (vl) vl.textContent = val;
  }
}

const HELP_MODAL = 'help-modal';
const setHelpOpen = open => {
  document.getElementById(HELP_MODAL)?.classList.toggle('is-open', open);
};

const ACTIONS = {
  reset: () => resetMesh(),
  calibrate: () => startCalibration(),
  'help-open': () => setHelpOpen(true),
  'help-close': () => setHelpOpen(false),
};

export function initUI() {
  for (const { id, out, set } of SLIDER_BINDINGS) {
    const el = document.getElementById(id);
    const vl = document.getElementById(out);
    if (!el) continue;
    el.addEventListener('input', () => {
      set(+el.value);
      if (vl) vl.textContent = el.value;
    });
  }

  document.querySelectorAll('[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => setTool(btn.dataset.tool));
  });

  document.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      applyPreset(btn.dataset.preset);
      syncMaterialSliders();
    });
  });

  document.querySelectorAll('[data-action]').forEach(btn => {
    const fn = ACTIONS[btn.dataset.action];
    if (fn) btn.addEventListener('click', fn);
  });

  // Close the help modal when the backdrop (not its content) is clicked.
  const modal = document.getElementById(HELP_MODAL);
  modal?.addEventListener('click', e => {
    if (e.target === modal) setHelpOpen(false);
  });
}
