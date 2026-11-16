// ============================================================
//  sound.js — Le moteur de sons : tout est fabriqué par le navigateur (aucun fichier audio à télécharger)
// ============================================================
// Chaque son est une petite « recette » : quelques couches (un souffle de bruit filtré pour le mouvement de l'air, un coup grave pour le poids,
// une cloche métallique pour l'éclat, des étincelles aiguës pour la magie...) posées les unes sur les autres, chacune avec sa courbe de volume
// et son glissement de hauteur. Tout passe ensuite par une chaîne commune : volume général → compresseur (pour que dix coups d'affilée ne
// saturent jamais) → sortie, avec une petite salle de réverbération que les sons « magiques » ou « solennels » peuvent solliciter.
//
// Désactivés par défaut (on peut jouer en cours sans faire de bruit). Le joueur les active avec le bouton « haut-parleur » de la partie ;
// le « banc d'essai » (menu) permet de les écouter un par un.
//
// Ce fichier n'utilise le navigateur qu'au moment de jouer : on peut l'importer sans navigateur (les tests lisent seulement la liste des sons).
//
//   play('hit_slash', { element: 'fire', vol: 0.8, pan: -0.3 })     joue un son (ne fait rien si les sons sont coupés)
//   renderSound('hit_slash')                                         le fabrique hors ligne (OfflineAudioContext) → AudioBuffer : tests, banc d'essai

let enabled = false;
let volume = 0.7; // le réglage du joueur, de 0 à 1
let live = null; // la chaîne audio « en direct » (créée au premier son)
let active = 0; // sources sonores en cours (on s'allège si ça s'emballe)
const lastAt = new Map(); // quand chaque son a été joué la dernière fois (anti-doublon)

export function setSoundEnabled(on) {
  enabled = !!on;
}
export const isSoundEnabled = () => enabled;
/** Le volume général (0 à 1). La courbe est « douce » : le milieu du curseur est déjà bien audible, le bas reste discret. */
export function setVolume(v) {
  volume = Math.max(0, Math.min(1, Number.isFinite(+v) ? +v : 0.7));
  if (live) live.master.gain.setTargetAtTime(masterGain(), live.ctx.currentTime, 0.02);
}
export const getVolume = () => volume;
const masterGain = () => 0.95 * volume ** 1.3;

// ---------------- Petits outils ----------------

const rnd = (a, b) => a + Math.random() * (b - a);
/** La fréquence d'une note MIDI (69 = la 440 Hz ; 60 = do central). */
const note = (m) => 440 * 2 ** ((m - 69) / 12);
const FLOOR = 0.0001; // (les rampes exponentielles refusent zéro)

/** Trois sortes de bruit, fabriquées une fois par contexte : blanc (aigu, sifflant), rose (naturel), brun (grave, sourd). */
function makeNoise(ctx) {
  const len = Math.floor(ctx.sampleRate * 2);
  const make = (fill) => {
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    fill(buf.getChannelData(0));
    return buf;
  };
  return {
    white: make((d) => { for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; }),
    pink: make((d) => {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    }),
    brown: make((d) => {
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        d[i] = last * 3.5;
      }
    })
  };
}

/** La réverbération : une réponse d'impulsion fabriquée (bruit qui s'éteint, un peu étouffé) — l'écho d'une salle de pierre. */
function makeReverb(ctx, seconds = 1.6, decay = 3.2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const fall = (1 - i / len) ** decay;
      lp += ((Math.random() * 2 - 1) * fall - lp) * 0.32; // (on assombrit : une salle absorbe les aigus)
      d[i] = lp;
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = buf;
  return conv;
}

/** La chaîne commune d'un contexte audio (en direct ou hors ligne). */
function makeBus(ctx) {
  const master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 14;
  comp.ratio.value = 5;
  comp.attack.value = 0.002;
  comp.release.value = 0.2;
  // Dernier filet : un écrêtage doux (tanh) — les rares pointes qui dépassent la pleine échelle s'arrondissent au lieu de claquer.
  const soft = ctx.createWaveShaper();
  const curve = new Float32Array(2048);
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh((i / (curve.length - 1)) * 2 - 1); // (gain 1 pour les petits signaux, la pleine échelle arrive à 0,76)
  soft.curve = curve;
  soft.oversample = '2x';
  master.connect(comp);
  comp.connect(soft);
  soft.connect(ctx.destination);
  const reverb = makeReverb(ctx);
  const wet = ctx.createGain();
  wet.gain.value = 0.8;
  reverb.connect(wet);
  wet.connect(master);
  return { ctx, master, reverb, noise: makeNoise(ctx) };
}

// ---------------- La boîte à outils d'un son ----------------
// Chaque fonction ajoute UNE couche au son en cours. Les temps (`at`, `dur`) sont en secondes, depuis le début du son.

function makeVoice(bus, when, opts) {
  const { ctx } = bus;
  const t0 = when;
  const pitch = opts.pitch || 1;
  const out = ctx.createGain();
  out.gain.value = opts.vol ?? 1;
  let tail = out;
  if (opts.pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, opts.pan));
    out.connect(p);
    tail = p;
  }
  tail.connect(bus.master);
  let sendNode = null;

  const track = (src) => {
    active++;
    src.onended = () => { active--; };
  };
  /** Courbe de volume : monte en `a` secondes, puis s'éteint (exponentiellement) à la fin de `dur`. */
  const shape = (g, at, dur, vol, a) => {
    const T = t0 + at;
    g.gain.setValueAtTime(FLOOR, T);
    g.gain.linearRampToValueAtTime(Math.max(FLOOR, vol), T + Math.min(a, dur * 0.9));
    g.gain.exponentialRampToValueAtTime(FLOOR, T + dur);
  };
  /** Un filtre sur le chemin d'une couche (avec un balayage de fréquence facultatif f → f2). */
  const filt = (spec, at, dur, from) => {
    const b = ctx.createBiquadFilter();
    b.type = spec.type || 'lowpass';
    b.Q.value = spec.q ?? 0.8;
    const T = t0 + at;
    b.frequency.setValueAtTime(Math.max(20, spec.f), T);
    if (spec.f2) b.frequency.exponentialRampToValueAtTime(Math.max(20, spec.f2), T + (spec.sweep ?? 1) * dur);
    from.connect(b);
    return b;
  };

  const v = {
    /** Une dose de réverbération (0 à 1) pour tout le son. */
    send(amount) {
      if (!sendNode) {
        sendNode = ctx.createGain();
        out.connect(sendNode);
        sendNode.connect(bus.reverb);
      }
      sendNode.gain.value = amount;
      return v;
    },

    /** Une note : oscillateur + courbe de volume + glissement de hauteur. `trem` = [vitesse, profondeur] (variation de volume), `vib` = [vitesse, profondeur en Hz]. */
    tone({ type = 'sine', f, f2, at = 0, dur = 0.2, vol = 0.3, a = 0.004, sweep = 1, detune = 0, lp, hp, vib, trem }) {
      const T = t0 + at;
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(f * pitch, T);
      if (f2 && f2 !== f) osc.frequency.exponentialRampToValueAtTime(f2 * pitch, T + dur * sweep);
      osc.detune.value = detune;
      let node = osc;
      if (lp) node = filt({ type: 'lowpass', f: typeof lp === 'number' ? lp : lp[0], f2: Array.isArray(lp) ? lp[1] : undefined, q: 0.7 }, at, dur, node);
      if (hp) node = filt({ type: 'highpass', f: hp, q: 0.7 }, at, dur, node);
      if (vib) {
        const lfo = ctx.createOscillator();
        const depth = ctx.createGain();
        lfo.frequency.value = vib[0];
        depth.gain.value = vib[1];
        lfo.connect(depth);
        depth.connect(osc.frequency);
        lfo.start(T);
        lfo.stop(T + dur + 0.06);
      }
      if (trem) {
        const am = ctx.createGain();
        const lfo = ctx.createOscillator();
        const depth = ctx.createGain();
        am.gain.value = 1 - trem[1] / 2;
        lfo.frequency.value = trem[0];
        depth.gain.value = trem[1] / 2;
        lfo.connect(depth);
        depth.connect(am.gain);
        node.connect(am);
        node = am;
        lfo.start(T);
        lfo.stop(T + dur + 0.06);
      }
      const g = ctx.createGain();
      shape(g, at, dur, vol, a);
      node.connect(g);
      g.connect(out);
      osc.start(T);
      osc.stop(T + dur + 0.06);
      track(osc);
      return v;
    },

    /** Un souffle de bruit filtré. `color` : white (sifflant), pink (naturel), brown (sourd). `filter` : { type, f, f2, q }. */
    noise({ color = 'white', at = 0, dur = 0.2, vol = 0.3, a = 0.003, filter, rate = 1 }) {
      const T = t0 + at;
      const src = ctx.createBufferSource();
      src.buffer = bus.noise[color];
      src.playbackRate.value = rate;
      let node = src;
      if (filter) node = filt(filter, at, dur, node);
      const g = ctx.createGain();
      shape(g, at, dur, vol, a);
      node.connect(g);
      g.connect(out);
      src.start(T, Math.random() * 1.4);
      src.stop(T + dur + 0.06);
      track(src);
      return v;
    },

    /** Un coup grave : un sinus dont la hauteur chute vite (le « poids » d'un impact). */
    thump({ f = 120, f2 = 45, at = 0, dur = 0.2, vol = 0.6, sweep = 0.35 }) {
      return v.tone({ type: 'sine', f, f2, at, dur, vol, a: 0.002, sweep });
    },

    /** Une cloche / un son métallique par modulation de fréquence : `ratio` non entier = métal, `index` = éclat. */
    bell({ f, at = 0, dur = 0.8, vol = 0.2, ratio = 2.76, index = 2.2, a = 0.002 }) {
      const T = t0 + at;
      const carrier = ctx.createOscillator();
      const mod = ctx.createOscillator();
      const modGain = ctx.createGain();
      carrier.frequency.value = f * pitch;
      mod.frequency.value = f * pitch * ratio;
      modGain.gain.setValueAtTime(f * pitch * index, T);
      modGain.gain.exponentialRampToValueAtTime(Math.max(1, f * pitch * 0.04), T + dur * 0.55); // (l'éclat s'éteint avant la note)
      mod.connect(modGain);
      modGain.connect(carrier.frequency);
      const g = ctx.createGain();
      shape(g, at, dur, vol, a);
      carrier.connect(g);
      g.connect(out);
      for (const o of [carrier, mod]) {
        o.start(T);
        o.stop(T + dur + 0.06);
      }
      track(carrier);
      return v;
    },

    /** Une corde pincée (harpe, luth) : triangle + octave, filtre qui se referme. */
    pluck({ f, at = 0, dur = 0.5, vol = 0.2 }) {
      v.tone({ type: 'triangle', f, at, dur, vol, a: 0.002, lp: [Math.min(9000, f * 9), f * 1.5] });
      v.tone({ type: 'sine', f: f * 2, at, dur: dur * 0.6, vol: vol * 0.35, a: 0.002 });
      return v;
    },

    /** Des étincelles : de petits « ping » aigus répartis dans le temps. */
    sparkle({ at = 0, n = 5, f = 3000, spread = 2000, dur = 0.4, vol = 0.08 }) {
      for (let i = 0; i < n; i++) {
        const t = at + rnd(0, dur * 0.7);
        v.tone({ type: 'sine', f: f + rnd(0, spread), at: t, dur: rnd(0.05, 0.12), vol: vol * rnd(0.6, 1), a: 0.002 });
      }
      return v;
    },

    /** Un cuivre : deux dents de scie légèrement désaccordées + un filtre qui s'ouvre à l'attaque. */
    brass({ f, at = 0, dur = 0.5, vol = 0.14, a = 0.04 }) {
      for (const detune of [-7, 7]) v.tone({ type: 'sawtooth', f, at, dur, vol: vol * 0.7, a, detune, lp: [f * 7, f * 3.2] });
      v.tone({ type: 'square', f: f / 2, at, dur, vol: vol * 0.3, a, lp: f * 2.2 });
      return v;
    },

    /** Une nappe de cordes / de voix : plusieurs dents de scie désaccordées, attaque lente. */
    pad({ f, at = 0, dur = 1, vol = 0.1, a = 0.12, type = 'sawtooth', lp = 1400 }) {
      for (const detune of [-9, 0, 9]) v.tone({ type, f, at, dur, vol: vol / 2, a, detune, lp });
      return v;
    }
  };
  return v;
}

// ---------------- Les sons ----------------
// Chaque entrée : g = groupe (pour le banc d'essai), n = nom affiché, d = durée totale (queue comprise), k = gain de réglage (équilibre les volumes),
// gap = délai minimal entre deux déclenchements, p = priorité (0 : on peut le sacrifier quand ça s'emballe), fl = reçoit la « touche » de l'élément,
// f = la recette.

const GROUPS = {
  ui: 'Interface',
  scene: 'Donjon',
  cast: 'Gestes et sorts',
  hit: 'Impacts',
  state: 'États et soins',
  voice: 'Voix des monstres',
  jingle: 'Fins de combat'
};

/** Une touche d'élément ajoutée aux impacts et aux sorts : le feu crépite, le sacré tinte, l'ombre gronde... */
const FLAVOR = {
  fire: (v) => { for (let i = 0; i < 5; i++) v.noise({ at: rnd(0, 0.2), dur: 0.02, vol: 0.14, filter: { type: 'highpass', f: 3500 } }); },
  holy: (v) => v.bell({ f: note(88), dur: 0.6, vol: 0.06, ratio: 2, index: 0.8 }),
  shadow: (v) => v.tone({ type: 'sine', f: 90, f2: 55, dur: 0.4, vol: 0.18 }),
  frost: (v) => v.bell({ f: note(96), dur: 0.35, vol: 0.06, ratio: 1.5, index: 1.2 }),
  poison: (v) => { for (let i = 0; i < 3; i++) v.tone({ f: rnd(250, 400), f2: rnd(500, 800), at: rnd(0.02, 0.2), dur: 0.05, vol: 0.1 }); },
  nature: (v) => v.noise({ color: 'pink', at: 0.02, dur: 0.25, vol: 0.07, filter: { type: 'highpass', f: 4500 } }),
  arcane: (v) => v.sparkle({ n: 4, f: 2500, spread: 3000, dur: 0.3, vol: 0.05 }),
  blood: (v) => v.noise({ color: 'brown', dur: 0.12, vol: 0.2, filter: { type: 'lowpass', f: 600 } })
};

const SOUNDS = {
  // ----- Interface -----
  click: {
    g: 'ui', n: 'Clic', d: 0.12, k: 1.875, gap: 0.02, p: 0,
    f: (v) => {
      v.noise({ dur: 0.03, vol: 0.2, filter: { type: 'highpass', f: 2200 } });
      v.tone({ type: 'triangle', f: 1100, f2: 700, dur: 0.05, vol: 0.14 });
    }
  },
  turn: {
    g: 'ui', n: 'À toi de jouer', d: 1.2, k: 0.27, p: 1,
    f: (v) => {
      v.bell({ f: note(76), dur: 0.7, vol: 0.2 });
      v.bell({ f: note(83), at: 0.13, dur: 0.95, vol: 0.22 });
      v.send(0.25);
    }
  },
  dice: {
    g: 'ui', n: 'Dé qui roule', d: 0.7, k: 1.86, p: 1,
    f: (v) => {
      let t = 0;
      for (let i = 0; i < 7; i++) {
        v.noise({ at: t, dur: 0.03, vol: 0.22 * (1 - i * 0.08), a: 0.001, filter: { type: 'bandpass', f: rnd(1400, 3200), q: 2.5 } });
        v.tone({ type: 'triangle', at: t, f: rnd(500, 900), f2: rnd(250, 400), dur: 0.045, vol: 0.08 });
        t += 0.035 + i * 0.013 + rnd(0, 0.012);
      }
    }
  },
  crit: {
    g: 'ui', n: 'Critique (le dé)', d: 1.2, k: 0.413, p: 1,
    f: (v) => {
      [84, 88, 91, 96].forEach((m, i) => v.bell({ f: note(m), at: i * 0.06, dur: 0.6, vol: 0.14, ratio: 3.5, index: 1.5 }));
      v.sparkle({ at: 0.1, n: 7, f: 4000, spread: 2500, dur: 0.6, vol: 0.06 });
      v.send(0.35);
    }
  },
  fumble: {
    g: 'ui', n: 'Échec critique (le dé)', d: 1.0, k: 0.606, p: 1,
    f: (v) => {
      v.tone({ type: 'sawtooth', f: 233, f2: 220, dur: 0.32, vol: 0.2, a: 0.02, lp: 900, vib: [6, 4] });
      v.tone({ type: 'sawtooth', f: 207, f2: 156, at: 0.3, dur: 0.55, vol: 0.2, a: 0.02, lp: 800, vib: [6, 5] });
      v.thump({ f: 90, f2: 45, at: 0.3, dur: 0.3, vol: 0.4 });
    }
  },
  heal: {
    g: 'ui', n: 'Petit carillon', d: 1.2, k: 0.351, p: 1,
    f: (v) => {
      [81, 85, 88].forEach((m, i) => v.bell({ f: note(m), at: i * 0.09, dur: 0.7, vol: 0.14, ratio: 2, index: 1 }));
      v.send(0.25);
    }
  },
  loot: {
    g: 'ui', n: 'Butin', d: 0.9, k: 0.43, p: 1,
    f: (v) => {
      v.bell({ f: note(88), dur: 0.5, vol: 0.18, ratio: 3.5, index: 1.4 });
      v.bell({ f: note(93), at: 0.08, dur: 0.6, vol: 0.18, ratio: 3.5, index: 1.4 });
      v.sparkle({ at: 0.05, n: 4, f: 4500, spread: 2500, dur: 0.4, vol: 0.05 });
      v.send(0.2);
    }
  },

  // ----- Donjon -----
  step: {
    g: 'scene', n: 'Pas', d: 0.2, k: 3.271, gap: 0.05, p: 0,
    f: (v) => {
      v.noise({ color: 'brown', dur: 0.08, vol: 0.6, a: 0.002, filter: { type: 'lowpass', f: 500 } });
      v.noise({ at: 0.01, dur: 0.04, vol: 0.06, filter: { type: 'bandpass', f: 1800, q: 1 } });
    }
  },
  encounter: {
    g: 'scene', n: 'Rencontre', d: 2.0, k: 1.066, p: 2,
    f: (v) => {
      v.tone({ type: 'sawtooth', f: 55, f2: 110, dur: 0.95, vol: 0.2, a: 0.4, lp: 420 });
      v.noise({ color: 'brown', dur: 0.95, vol: 0.4, a: 0.55, filter: { type: 'lowpass', f: 300, f2: 1800 } });
      v.thump({ f: 95, f2: 35, at: 0.6, dur: 0.5, vol: 0.9 });
      v.noise({ color: 'pink', at: 0.6, dur: 0.3, vol: 0.25, filter: { type: 'lowpass', f: 1500, f2: 250 } });
      v.send(0.3);
    }
  },
  boss: {
    g: 'scene', n: 'Le boss approche', d: 2.6, k: 1.376, p: 2,
    f: (v) => {
      v.thump({ f: 80, f2: 32, dur: 0.6, vol: 1, sweep: 0.5 });
      v.thump({ f: 80, f2: 32, at: 0.3, dur: 0.7, vol: 1, sweep: 0.5 });
      v.tone({ type: 'sawtooth', f: 41, f2: 49, at: 0.1, dur: 1.6, vol: 0.22, a: 0.6, lp: 220 });
      v.tone({ type: 'sawtooth', f: 58, f2: 52, at: 0.2, dur: 1.5, vol: 0.12, a: 0.7, lp: 260 });
      v.noise({ color: 'brown', at: 0.05, dur: 1.5, vol: 0.4, a: 0.8, filter: { type: 'lowpass', f: 250, f2: 1400 } });
      v.bell({ f: 110, at: 0.62, dur: 1.6, vol: 0.2, ratio: 1.41, index: 1.4 });
      v.send(0.5);
    }
  },
  chest: {
    g: 'scene', n: 'Coffre', d: 1.8, k: 0.461, p: 1,
    f: (v) => {
      v.tone({ type: 'sawtooth', f: 80, f2: 135, dur: 0.4, vol: 0.2, a: 0.03, lp: 520, vib: [14, 9] });
      v.noise({ at: 0.02, dur: 0.36, vol: 0.06, filter: { type: 'bandpass', f: 2800, q: 5 } });
      v.thump({ f: 100, f2: 50, at: 0.45, dur: 0.25, vol: 0.6 });
      v.bell({ f: note(84), at: 0.55, dur: 0.9, vol: 0.2, ratio: 3.5, index: 1.4 });
      v.bell({ f: note(91), at: 0.65, dur: 0.9, vol: 0.18, ratio: 3.5, index: 1.4 });
      v.sparkle({ at: 0.55, n: 6, f: 4000, spread: 3000, dur: 0.7, vol: 0.06 });
      v.send(0.35);
    }
  },
  coins: {
    g: 'scene', n: 'Pièces', d: 0.9, k: 0.417, p: 1,
    f: (v) => {
      [84, 88, 91].forEach((m, i) => v.bell({ f: note(m), at: i * 0.055, dur: 0.45, vol: 0.16, ratio: 3.5, index: 1.6 }));
      v.noise({ dur: 0.03, vol: 0.12, filter: { type: 'highpass', f: 5000 } });
      v.send(0.15);
    }
  },
  trap: {
    g: 'scene', n: 'Piège', d: 0.8, k: 1.424, p: 1,
    f: (v) => {
      v.noise({ dur: 0.025, vol: 0.4, a: 0.001, filter: { type: 'highpass', f: 3500 } });
      v.tone({ type: 'square', f: 1800, f2: 400, at: 0.02, dur: 0.12, vol: 0.12 });
      v.noise({ at: 0.05, dur: 0.38, vol: 0.2, a: 0.02, filter: { type: 'bandpass', f: 3000, f2: 800, q: 4 } });
      v.thump({ f: 140, f2: 60, at: 0.06, dur: 0.22, vol: 0.38 });
    }
  },
  fountain: {
    g: 'scene', n: 'Fontaine', d: 1.2, k: 0.85, p: 1,
    f: (v) => {
      for (let i = 0; i < 7; i++) v.tone({ f: rnd(500, 900), f2: rnd(1200, 2000), at: i * 0.08 + rnd(0, 0.05), dur: 0.07, vol: 0.13 });
      v.noise({ color: 'pink', dur: 0.8, vol: 0.09, a: 0.1, filter: { type: 'bandpass', f: 2500, q: 0.7 } });
      v.sparkle({ at: 0.2, n: 5, f: 3500, spread: 2500, dur: 0.6, vol: 0.05 });
      v.send(0.3);
    }
  },
  sneak: {
    g: 'scene', n: 'Coup bas', d: 0.7, k: 1.246, p: 1,
    f: (v) => {
      for (const at of [0, 0.16]) v.noise({ color: 'pink', at, dur: 0.12, vol: 0.12, a: 0.03, filter: { type: 'bandpass', f: 2000, f2: 3200, q: 1.2 } });
      v.thump({ f: 85, f2: 50, at: 0.34, dur: 0.2, vol: 0.14 });
    }
  },

  // ----- Gestes et sorts -----
  cast_swing: {
    g: 'cast', n: 'Coup d’arme', d: 0.35, k: 1.921, p: 0, fl: true,
    f: (v) => v.noise({ color: 'pink', dur: 0.22, vol: 0.34, a: 0.06, filter: { type: 'bandpass', f: 500, f2: 2600, q: 1.1 } })
  },
  cast_pierce: {
    g: 'cast', n: 'Estoc', d: 0.25, k: 1.192, p: 0, fl: true,
    f: (v) => {
      v.noise({ dur: 0.12, vol: 0.24, a: 0.02, filter: { type: 'highpass', f: 2000, f2: 6000 } });
      v.tone({ f: 1800, f2: 2600, dur: 0.1, vol: 0.05 });
    }
  },
  cast_heavy: {
    g: 'cast', n: 'Coup lourd', d: 0.5, k: 0.727, p: 0, fl: true,
    f: (v) => {
      v.noise({ color: 'pink', dur: 0.36, vol: 0.46, a: 0.13, filter: { type: 'bandpass', f: 180, f2: 900, q: 0.9 } });
      v.tone({ f: 150, f2: 70, dur: 0.36, vol: 0.26, a: 0.1 });
    }
  },
  cast_spin: {
    g: 'cast', n: 'Tourbillon', d: 0.8, k: 1.107, p: 0, fl: true,
    f: (v) => {
      [700, 1000, 1400].forEach((f, i) => v.noise({ color: 'pink', at: i * 0.17, dur: 0.2, vol: 0.28, a: 0.05, filter: { type: 'bandpass', f: f * 0.6, f2: f * 1.8, q: 1.2 } }));
      v.tone({ f: 220, f2: 520, dur: 0.55, vol: 0.07, a: 0.1 });
    }
  },
  cast_charge: {
    g: 'cast', n: 'Charge (sort qui monte)', d: 0.8, k: 0.564, p: 1, fl: true,
    f: (v) => {
      v.tone({ type: 'sawtooth', f: 180, f2: 900, dur: 0.45, vol: 0.14, a: 0.3, lp: [300, 3000] });
      v.noise({ dur: 0.45, vol: 0.09, a: 0.35, filter: { type: 'highpass', f: 2500 } });
      v.sparkle({ at: 0.3, n: 4, f: 3000, spread: 3000, dur: 0.2, vol: 0.06 });
    }
  },
  cast_wave: {
    g: 'cast', n: 'Onde', d: 1.2, k: 1.733, p: 1, fl: true,
    f: (v) => {
      v.tone({ f: 70, f2: 45, dur: 0.42, vol: 0.5, a: 0.02 });
      v.noise({ color: 'brown', dur: 0.42, vol: 0.38, a: 0.05, filter: { type: 'lowpass', f: 400, f2: 150 } });
      v.send(0.2);
    }
  },
  cast_bolt: {
    g: 'cast', n: 'Éclair', d: 0.4, k: 2.139, p: 1, fl: true,
    f: (v) => {
      v.tone({ type: 'sawtooth', f: 3200, f2: 150, dur: 0.14, vol: 0.16, a: 0.001 });
      v.noise({ dur: 0.14, vol: 0.22, a: 0.001, filter: { type: 'highpass', f: 1500 } });
      v.tone({ type: 'square', f: 80, dur: 0.1, vol: 0.1 });
    }
  },
  cast_beam: {
    g: 'cast', n: 'Rayon', d: 0.8, k: 0.566, p: 1, fl: true,
    f: (v) => {
      v.tone({ type: 'sawtooth', f: 220, f2: 660, dur: 0.4, vol: 0.14, a: 0.1, lp: [800, 4000] });
      v.tone({ f: 880, f2: 1760, dur: 0.4, vol: 0.08, a: 0.1 });
      v.noise({ color: 'pink', dur: 0.4, vol: 0.08, a: 0.1, filter: { type: 'bandpass', f: 3000, q: 2 } });
      v.send(0.3);
    }
  },
  cast_arrow: {
    g: 'cast', n: 'Flèche / épine', d: 0.4, k: 1.234, p: 0, fl: true,
    f: (v) => {
      v.tone({ type: 'triangle', f: 330, f2: 260, dur: 0.22, vol: 0.22, a: 0.001, lp: 1200 });
      v.noise({ dur: 0.15, vol: 0.13, a: 0.01, filter: { type: 'highpass', f: 3000, f2: 6000 } });
    }
  },
  cast_buff: {
    g: 'cast', n: 'Renfort', d: 1.0, k: 0.456, p: 1, fl: true,
    f: (v) => {
      [72, 76, 79].forEach((m, i) => v.bell({ f: note(m), at: i * 0.07, dur: 0.6, vol: 0.13, ratio: 2, index: 0.9 }));
      v.noise({ dur: 0.4, vol: 0.04, a: 0.15, filter: { type: 'highpass', f: 4000 } });
      v.send(0.3);
    }
  },
  cast_heal: {
    g: 'cast', n: 'Soin (harpe)', d: 1.3, k: 0.435, p: 1, fl: true,
    f: (v) => {
      [67, 71, 74, 79].forEach((m, i) => v.pluck({ f: note(m), at: i * 0.07, dur: 0.7, vol: 0.14 }));
      v.sparkle({ at: 0.15, n: 5, f: 4000, spread: 2500, dur: 0.6, vol: 0.05 });
      v.send(0.35);
    }
  },

  // ----- Impacts -----
  hit_slash: {
    g: 'hit', n: 'Entaille', d: 0.4, k: 2.839, gap: 0.03, p: 1, fl: true,
    f: (v) => {
      v.noise({ dur: 0.09, vol: 0.55, a: 0.001, filter: { type: 'bandpass', f: 3600, f2: 1800, q: 1.2 } });
      v.bell({ f: 2300, dur: 0.24, vol: 0.1, ratio: 1.46, index: 1.2 });
      v.bell({ f: 3500, dur: 0.14, vol: 0.05, ratio: 1.9, index: 1 });
      v.thump({ f: 200, f2: 80, dur: 0.12, vol: 0.3 });
    }
  },
  hit_pierce: {
    g: 'hit', n: 'Estoc', d: 0.3, k: 4.623, gap: 0.03, p: 1, fl: true,
    f: (v) => {
      v.noise({ dur: 0.05, vol: 0.4, a: 0.001, filter: { type: 'highpass', f: 2500 } });
      v.noise({ at: 0.01, dur: 0.1, vol: 0.28, filter: { type: 'bandpass', f: 1100, f2: 500, q: 2 } });
      v.thump({ f: 160, f2: 70, dur: 0.1, vol: 0.42 });
      v.tone({ f: 3000, f2: 2000, dur: 0.06, vol: 0.06 });
    }
  },
  hit_smash: {
    g: 'hit', n: 'Coup écrasant', d: 1.4, k: 2.904, gap: 0.04, p: 2, fl: true,
    f: (v) => {
      v.thump({ f: 130, f2: 38, dur: 0.34, vol: 0.95, sweep: 0.3 });
      v.noise({ color: 'brown', dur: 0.26, vol: 0.62, a: 0.001, filter: { type: 'lowpass', f: 1800, f2: 200 } });
      v.noise({ dur: 0.04, vol: 0.5, a: 0.001, filter: { type: 'highpass', f: 1800 } });
      v.noise({ color: 'pink', at: 0.03, dur: 0.22, vol: 0.2, filter: { type: 'bandpass', f: 700, q: 0.8 } });
      v.send(0.3);
    }
  },
  hit_claw: {
    g: 'hit', n: 'Griffes', d: 0.4, k: 2.717, gap: 0.03, p: 1, fl: true,
    f: (v) => {
      [0, 0.045, 0.09].forEach((at, i) => v.noise({ at, dur: 0.07, vol: 0.32, a: 0.002, filter: { type: 'bandpass', f: 4200 - i * 500, f2: 2200, q: 1.5 } }));
      v.thump({ f: 150, f2: 70, at: 0.02, dur: 0.13, vol: 0.38 });
    }
  },
  hit_bite: {
    g: 'hit', n: 'Morsure', d: 0.4, k: 5.046, gap: 0.03, p: 1, fl: true,
    f: (v) => {
      v.noise({ color: 'pink', dur: 0.1, vol: 0.46, a: 0.004, filter: { type: 'lowpass', f: 1500, f2: 400 } });
      v.noise({ at: 0.05, dur: 0.06, vol: 0.3, filter: { type: 'bandpass', f: 2000, q: 3 } });
      v.thump({ f: 140, f2: 55, dur: 0.14, vol: 0.5 });
    }
  },
  hit_blast: {
    g: 'hit', n: 'Explosion de magie', d: 1.5, k: 2.094, gap: 0.04, p: 2, fl: true,
    f: (v) => {
      v.thump({ f: 110, f2: 42, dur: 0.4, vol: 0.85, sweep: 0.4 });
      v.noise({ dur: 0.34, vol: 0.46, a: 0.002, filter: { type: 'bandpass', f: 4200, f2: 600, q: 0.9 } });
      v.sparkle({ at: 0.02, n: 6, f: 2500, spread: 3000, dur: 0.5, vol: 0.08 });
      v.send(0.45);
    }
  },
  hit_splat: {
    g: 'hit', n: 'Éclaboussure', d: 0.4, k: 1.851, gap: 0.03, p: 1, fl: true,
    f: (v) => {
      v.noise({ color: 'pink', dur: 0.15, vol: 0.5, a: 0.003, filter: { type: 'lowpass', f: 1400, f2: 250 } });
      v.tone({ f: 520, f2: 160, at: 0.01, dur: 0.09, vol: 0.3 });
      v.tone({ f: 330, f2: 120, at: 0.07, dur: 0.12, vol: 0.2 });
    }
  },
  hit_sonic: {
    g: 'hit', n: 'Onde de choc', d: 0.6, k: 0.967, gap: 0.04, p: 1, fl: true,
    f: (v) => {
      v.tone({ f: 760, f2: 700, dur: 0.36, vol: 0.3, a: 0.01, vib: [22, 30] });
      v.noise({ dur: 0.3, vol: 0.2, filter: { type: 'bandpass', f: 1500, q: 4 } });
      v.thump({ f: 100, f2: 55, dur: 0.2, vol: 0.42 });
    }
  },
  hit_drain: {
    g: 'hit', n: 'Siphon', d: 0.7, k: 2.115, gap: 0.04, p: 1, fl: true,
    f: (v) => {
      v.tone({ type: 'sawtooth', f: 700, f2: 180, dur: 0.4, vol: 0.15, a: 0.02, lp: 1200 });
      v.noise({ color: 'pink', dur: 0.4, vol: 0.2, a: 0.05, filter: { type: 'bandpass', f: 1800, f2: 300, q: 2 } });
      v.thump({ f: 120, f2: 60, dur: 0.15, vol: 0.45 });
      v.tone({ f: 200, f2: 520, at: 0.2, dur: 0.25, vol: 0.1 });
    }
  },
  crit_hit: {
    g: 'hit', n: 'Coup critique (en plus)', d: 1.0, k: 0.942, gap: 0.05, p: 2,
    f: (v) => {
      v.bell({ f: 1500, dur: 0.55, vol: 0.18, ratio: 2.76, index: 2 });
      v.bell({ f: 2250, at: 0.02, dur: 0.4, vol: 0.1, ratio: 1.9, index: 1.4 });
      v.noise({ dur: 0.15, vol: 0.25, a: 0.001, filter: { type: 'highpass', f: 4000 } });
      v.sparkle({ at: 0.04, n: 5, f: 3500, spread: 3500, dur: 0.5, vol: 0.06 });
      v.send(0.3);
    }
  },
  block: {
    g: 'hit', n: 'Coup bloqué', d: 0.4, k: 1.367, gap: 0.03, p: 1,
    f: (v) => {
      v.bell({ f: 620, dur: 0.24, vol: 0.26, ratio: 1.58, index: 1.5 });
      v.bell({ f: 930, dur: 0.18, vol: 0.14, ratio: 2.1, index: 1.2 });
      v.thump({ f: 180, f2: 90, dur: 0.1, vol: 0.4 });
      v.noise({ dur: 0.06, vol: 0.25, filter: { type: 'bandpass', f: 1200, q: 2 } });
    }
  },
  miss: {
    g: 'hit', n: 'Raté', d: 0.35, k: 1.327, gap: 0.03, p: 0,
    f: (v) => v.noise({ color: 'pink', dur: 0.22, vol: 0.17, a: 0.08, filter: { type: 'bandpass', f: 900, f2: 300, q: 0.7 } })
  },

  // ----- États et soins -----
  shield: {
    g: 'state', n: 'Bouclier', d: 1.1, k: 0.56, p: 1,
    f: (v) => {
      [880, 1320, 1760].forEach((f, i) => v.bell({ f, at: i * 0.05, dur: 0.75, vol: 0.13 - i * 0.015, ratio: 2, index: 0.8 }));
      v.noise({ dur: 0.5, vol: 0.05, a: 0.1, filter: { type: 'highpass', f: 5000 } });
      v.send(0.3);
    }
  },
  buff: {
    g: 'state', n: 'Bonus', d: 0.8, k: 0.647, p: 1,
    f: (v) => {
      [72, 76, 79, 84].forEach((m, i) => {
        v.tone({ type: 'triangle', f: note(m), at: i * 0.05, dur: 0.35, vol: 0.13, a: 0.004 });
        v.tone({ f: note(m + 12), at: i * 0.05, dur: 0.25, vol: 0.06 });
      });
      v.sparkle({ at: 0.1, n: 4, f: 4000, spread: 2500, dur: 0.3, vol: 0.05 });
    }
  },
  debuff: {
    g: 'state', n: 'Malus', d: 0.7, k: 1.529, p: 1,
    f: (v) => {
      v.tone({ type: 'sawtooth', f: 392, f2: 196, dur: 0.45, vol: 0.13, lp: 900 });
      v.tone({ type: 'sawtooth', f: 415, f2: 208, dur: 0.45, vol: 0.1, lp: 900 });
      v.noise({ color: 'pink', dur: 0.3, vol: 0.08, filter: { type: 'bandpass', f: 600, q: 1.5 } });
    }
  },
  poison: {
    g: 'state', n: 'Poison', d: 0.6, k: 0.892, p: 1,
    f: (v) => {
      for (let i = 0; i < 4; i++) v.tone({ f: rnd(200, 350), f2: rnd(400, 700), at: i * 0.07, dur: 0.06, vol: 0.2 });
      v.noise({ dur: 0.32, vol: 0.06, a: 0.05, filter: { type: 'highpass', f: 5000 } });
    }
  },
  stun: {
    g: 'state', n: 'Étourdi', d: 0.9, k: 0.648, p: 1,
    f: (v) => {
      v.thump({ f: 160, f2: 70, dur: 0.18, vol: 0.5 });
      [1760, 1480, 1245].forEach((f, i) => v.bell({ f, at: 0.06 + i * 0.09, dur: 0.4, vol: 0.12, ratio: 2, index: 1.2 }));
    }
  },
  taunt: {
    g: 'state', n: 'Provocation', d: 0.9, k: 1.466, p: 1,
    f: (v) => {
      v.tone({ type: 'sawtooth', f: 147, f2: 131, dur: 0.5, vol: 0.2, a: 0.05, lp: 900 });
      v.tone({ type: 'sawtooth', f: 154, f2: 138, dur: 0.5, vol: 0.15, a: 0.05, lp: 900 });
      v.noise({ color: 'pink', dur: 0.4, vol: 0.12, a: 0.05, filter: { type: 'bandpass', f: 700, q: 1.5 } });
      v.thump({ f: 100, f2: 55, dur: 0.2, vol: 0.4 });
    }
  },
  roots: {
    g: 'state', n: 'Racines', d: 0.9, k: 1.304, p: 1,
    f: (v) => {
      v.noise({ color: 'brown', dur: 0.55, vol: 0.32, a: 0.15, filter: { type: 'lowpass', f: 250 } });
      v.tone({ type: 'sawtooth', f: 80, f2: 130, dur: 0.3, vol: 0.14, a: 0.03, lp: 500, vib: [18, 10] });
      v.noise({ at: 0.1, dur: 0.3, vol: 0.05, filter: { type: 'bandpass', f: 3000, q: 4 } });
    }
  },
  revive: {
    g: 'state', n: 'Résurrection', d: 2.4, k: 0.446, p: 2,
    f: (v) => {
      [60, 64, 67, 72, 76].forEach((m, i) => v.pad({ f: note(m), at: i * 0.1, dur: 1.4, vol: 0.12, a: 0.3, type: 'sine', lp: 3000 }));
      v.bell({ f: note(96), at: 0.5, dur: 1.2, vol: 0.14, ratio: 2, index: 0.9 });
      v.sparkle({ at: 0.3, n: 8, f: 4000, spread: 3000, dur: 1.0, vol: 0.06 });
      v.send(0.6);
    }
  },
  resource: {
    g: 'state', n: 'Gain de ressource', d: 0.2, k: 1.62, gap: 0.04, p: 0,
    f: (v) => {
      v.tone({ type: 'square', f: 600, f2: 950, dur: 0.06, vol: 0.08 });
      v.tone({ f: 1200, at: 0.04, dur: 0.05, vol: 0.05 });
    }
  },
  death_monster: {
    g: 'state', n: 'Monstre vaincu', d: 1.4, k: 1.676, p: 2,
    f: (v) => {
      v.thump({ f: 170, f2: 35, dur: 0.5, vol: 0.85, sweep: 0.5 });
      v.noise({ color: 'brown', dur: 0.42, vol: 0.46, filter: { type: 'lowpass', f: 700, f2: 120 } });
      [0.15, 0.22, 0.3].forEach((at) => v.noise({ at, dur: 0.025, vol: 0.1, filter: { type: 'bandpass', f: 1500, q: 2 } }));
      v.send(0.2);
    }
  },
  death_hero: {
    g: 'state', n: 'Héros à terre', d: 2.0, k: 1.572, p: 2,
    f: (v) => {
      v.tone({ type: 'triangle', f: 330, f2: 110, dur: 0.95, vol: 0.2, a: 0.02, lp: 1200 });
      v.tone({ f: 165, f2: 82, dur: 0.95, vol: 0.26 });
      v.thump({ f: 70, f2: 40, dur: 0.3, vol: 0.55 });
      v.thump({ f: 70, f2: 40, at: 0.36, dur: 0.3, vol: 0.4 });
      v.send(0.5);
    }
  },

  // ----- Voix des monstres (le cri qui annonce leur tour) -----
  voice_beast: {
    g: 'voice', n: 'Bête', d: 0.6, k: 3.051, p: 1,
    f: (v) => {
      v.tone({ type: 'sawtooth', f: 110, f2: 80, dur: 0.38, vol: 0.26, a: 0.03, lp: 700, trem: [28, 0.7] });
      v.noise({ color: 'pink', dur: 0.35, vol: 0.15, a: 0.04, filter: { type: 'bandpass', f: 600, q: 2 } });
    }
  },
  voice_undead: {
    g: 'voice', n: 'Mort-vivant', d: 1.2, k: 0.906, p: 1,
    f: (v) => {
      v.tone({ type: 'sawtooth', f: 160, f2: 120, dur: 0.62, vol: 0.18, a: 0.15, lp: 600, vib: [5, 6] });
      v.noise({ dur: 0.5, vol: 0.09, a: 0.15, filter: { type: 'bandpass', f: 900, q: 5 } });
      v.tone({ f: 80, dur: 0.6, vol: 0.12 });
      v.send(0.3);
    }
  },
  voice_humanoid: {
    g: 'voice', n: 'Humanoïde', d: 0.4, k: 2.613, p: 1,
    f: (v) => {
      v.tone({ type: 'sawtooth', f: 130, f2: 95, dur: 0.22, vol: 0.24, a: 0.02, lp: 800 });
      v.noise({ color: 'pink', dur: 0.2, vol: 0.1, filter: { type: 'bandpass', f: 800, q: 3 } });
      v.noise({ color: 'pink', dur: 0.2, vol: 0.07, filter: { type: 'bandpass', f: 1200, q: 3 } });
    }
  },
  voice_slime: {
    g: 'voice', n: 'Gelée', d: 0.5, k: 0.594, p: 1,
    f: (v) => {
      v.tone({ f: 180, f2: 520, dur: 0.12, vol: 0.32 });
      v.tone({ f: 520, f2: 220, at: 0.12, dur: 0.16, vol: 0.26 });
      v.noise({ color: 'pink', dur: 0.22, vol: 0.12, filter: { type: 'lowpass', f: 500 } });
    }
  },
  voice_demon: {
    g: 'voice', n: 'Démon', d: 1.3, k: 2.62, p: 1,
    f: (v) => {
      v.tone({ type: 'sawtooth', f: 62, f2: 50, dur: 0.62, vol: 0.32, lp: 400 });
      v.tone({ type: 'sawtooth', f: 66, f2: 52, dur: 0.62, vol: 0.22, lp: 400 });
      v.tone({ type: 'square', f: 124, f2: 96, dur: 0.42, vol: 0.08, lp: 600 });
      v.noise({ dur: 0.5, vol: 0.06, a: 0.1, filter: { type: 'highpass', f: 3000 } });
      v.send(0.2);
    }
  },
  voice_boss: {
    g: 'voice', n: 'Boss', d: 1.8, k: 2.092, p: 2,
    f: (v) => {
      v.tone({ type: 'sawtooth', f: 62, f2: 46, dur: 1.0, vol: 0.34, a: 0.1, lp: 420 });
      v.tone({ type: 'sawtooth', f: 66, f2: 48, dur: 1.0, vol: 0.24, a: 0.1, lp: 420 });
      v.tone({ f: 45, f2: 35, dur: 1.1, vol: 0.5, a: 0.08 });
      v.noise({ color: 'brown', dur: 0.9, vol: 0.4, a: 0.12, filter: { type: 'lowpass', f: 500, f2: 150 } });
      v.send(0.5);
    }
  },

  // ----- Fins de combat -----
  win: {
    g: 'jingle', n: 'Victoire', d: 2.8, k: 0.773, p: 2,
    f: (v) => {
      [[60, 0], [64, 0.14], [67, 0.28]].forEach(([m, at]) => v.brass({ f: note(m), at, dur: 0.24, vol: 0.14 }));
      [60, 64, 67, 72].forEach((m) => v.brass({ f: note(m), at: 0.46, dur: 1.2, vol: 0.12, a: 0.05 }));
      v.bell({ f: note(96), at: 0.5, dur: 1.4, vol: 0.1, ratio: 2, index: 0.8 });
      v.thump({ f: 90, f2: 45, at: 0.46, dur: 0.3, vol: 0.5 });
      v.send(0.4);
    }
  },
  lose: {
    g: 'jingle', n: 'Défaite', d: 3.2, k: 1.355, p: 2,
    f: (v) => {
      v.pad({ f: note(57), at: 0, dur: 0.7, vol: 0.18, a: 0.08, lp: 900 });
      v.pad({ f: note(53), at: 0.6, dur: 0.7, vol: 0.18, a: 0.08, lp: 800 });
      v.pad({ f: note(50), at: 1.2, dur: 1.5, vol: 0.2, a: 0.1, lp: 700 });
      v.pad({ f: note(45), at: 1.2, dur: 1.5, vol: 0.16, a: 0.1, lp: 600 });
      v.thump({ f: 75, f2: 38, at: 1.2, dur: 0.5, vol: 0.6 });
      v.send(0.5);
    }
  }
};

/** Les noms qu'on peut aussi employer (d'anciens noms, ou des raccourcis). */
const ALIASES = { death: 'fumble' };

const resolve = (name) => SOUNDS[ALIASES[name] || name];

/** La liste des sons pour le banc d'essai : [{ id, group, groupName, label, seconds, flavored }]. */
export function soundList() {
  return Object.entries(SOUNDS).map(([id, s]) => ({ id, group: s.g, groupName: GROUPS[s.g], label: s.n, seconds: s.d, flavored: !!s.fl }));
}
export const soundGroups = () => ({ ...GROUPS });
export const hasSound = (name) => !!resolve(name);

// ---------------- Jouer ----------------

/** Pose les couches d'un son sur une chaîne (en direct ou hors ligne), à l'instant `when`. */
function schedule(bus, def, when, opts) {
  const element = opts.element;
  const pitch = (opts.pitch || 1) * (def.fl && element === 'shadow' ? 0.82 : def.fl && element === 'frost' ? 1.1 : 1);
  const v = makeVoice(bus, when, { ...opts, pitch, vol: (opts.vol ?? 1) * (def.k ?? 1) });
  def.f(v, opts);
  if (def.fl && element && FLAVOR[element]) FLAVOR[element](v);
}

function liveBus() {
  if (live) {
    if (live.ctx.state === 'suspended') live.ctx.resume().catch(() => {});
    return live;
  }
  const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
  if (!AC) return null;
  const ctx = new AC({ latencyHint: 'interactive' });
  live = makeBus(ctx);
  live.master.gain.value = masterGain();
  return live;
}

/**
 * Joue un son.  Options : vol (0 à 1+), element (la couleur du sort : fire, holy...), pan (-1 gauche, 1 droite), pitch (1 = normal),
 * force (joue même si les sons sont coupés : le banc d'essai).
 */
export function play(name, opts = {}) {
  if (globalThis.__soundLog) globalThis.__soundLog.push({ name, opts: { ...opts }, t: performance.now() }); // (outil de mise au point : un script peut noter chaque son demandé)
  if (!enabled && !opts.force) return;
  const def = resolve(name);
  if (!def) return;
  try {
    const bus = liveBus();
    if (!bus || bus.ctx.state !== 'running') return; // (le navigateur n'a pas encore autorisé le son : on ne met rien en attente, ça sortirait d'un coup)
    const now = bus.ctx.currentTime;
    if (!opts.force) {
      if (now - (lastAt.get(name) ?? -9) < (def.gap ?? 0.03)) return; // (deux fois le même son au même instant : un seul suffit)
      if (active > 60 && (def.p ?? 1) < 2) return; // (ça s'emballe : on sacrifie les petits sons)
    }
    lastAt.set(name, now);
    schedule(bus, def, now + 0.005, { ...opts, pitch: (opts.pitch || 1) * rnd(0.97, 1.03) });
  } catch {
    /* un son raté n'est pas grave */
  }
}

/** Fabrique un son hors ligne (sans le jouer) : renvoie une promesse d'AudioBuffer stéréo. Sert aux tests et au banc d'essai. */
export async function renderSound(name, opts = {}) {
  const def = resolve(name);
  if (!def) throw new Error(`Son inconnu : ${name}`);
  const sampleRate = opts.sampleRate || 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * (def.d + 0.25)), sampleRate);
  const bus = makeBus(ctx);
  bus.master.gain.value = opts.master ?? masterGain();
  schedule(bus, def, 0.005, opts);
  return ctx.startRendering();
}
