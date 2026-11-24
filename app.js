(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const STORAGE_KEY = "interval-timer-settings";
  const DEFAULTS = { work: 30, rest: 15, rounds: 8, prep: 5 };

  // Times in seconds. Presets don't change the "Get ready" value.
  const PRESETS = [
    { name: "Core Workout", work: 40, rest: 20, rounds: 10 },
  ];

  const RING_RADIUS = 45;
  const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

  // ---------- Elements ----------
  const el = {
    setup: $("setup"),
    timer: $("timer"),
    presets: $("presets"),
    form: $("setup-form"),
    workMin: $("work-min"),
    workSec: $("work-sec"),
    restMin: $("rest-min"),
    restSec: $("rest-sec"),
    rounds: $("rounds"),
    prep: $("prep"),
    total: $("total"),
    error: $("error"),
    round: $("round"),
    sound: $("sound"),
    progress: $("progress"),
    phaseLabel: $("phase-label"),
    time: $("time"),
    next: $("next"),
    totalLeft: $("total-left"),
    reset: $("reset"),
    toggle: $("toggle"),
    skip: $("skip"),
  };

  el.progress.style.strokeDasharray = String(RING_CIRCUMFERENCE);

  // ---------- State ----------
  let settings = loadSettings();
  let phases = [];
  let idx = 0;
  let running = false;
  let finished = false;
  let endAt = 0;          // timestamp (ms) when the current phase ends, while running
  let remainingMs = 0;    // remaining time in the current phase, while paused
  let tickId = null;
  let lastBeepSecond = null;
  let soundOn = true;

  // ---------- Helpers ----------
  function fmt(totalSeconds) {
    const s = Math.max(0, Math.round(totalSeconds));
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, "0")}`;
  }

  function clampInt(value, min, max) {
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function totalDuration(s) {
    return s.prep + s.rounds * s.work + Math.max(0, s.rounds - 1) * s.rest;
  }

  // ---------- Settings ----------
  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return { ...DEFAULTS, ...saved };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function saveSettings(s) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      /* storage unavailable; ignore */
    }
  }

  function readForm() {
    return {
      work: clampInt(el.workMin.value, 0, 99) * 60 + clampInt(el.workSec.value, 0, 59),
      rest: clampInt(el.restMin.value, 0, 99) * 60 + clampInt(el.restSec.value, 0, 59),
      rounds: clampInt(el.rounds.value, 1, 99),
      prep: clampInt(el.prep.value, 0, 60),
    };
  }

  function writeForm(s) {
    el.workMin.value = Math.floor(s.work / 60);
    el.workSec.value = String(s.work % 60).padStart(2, "0");
    el.restMin.value = Math.floor(s.rest / 60);
    el.restSec.value = String(s.rest % 60).padStart(2, "0");
    el.rounds.value = s.rounds;
    el.prep.value = s.prep;
  }

  function updateTotal() {
    const s = readForm();
    el.total.textContent = fmt(totalDuration(s));
    updatePresetHighlight(s);
  }

  // ---------- Presets ----------
  function fmtShort(seconds) {
    return seconds < 60 ? `${seconds}s` : fmt(seconds);
  }

  function presetMatches(p, s) {
    return p.work === s.work && p.rest === s.rest && p.rounds === s.rounds;
  }

  function updatePresetHighlight(s) {
    el.presets.querySelectorAll(".preset").forEach((btn, i) => {
      btn.setAttribute("aria-pressed", String(presetMatches(PRESETS[i], s)));
    });
  }

  function renderPresets() {
    PRESETS.forEach((p) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "preset";
      btn.setAttribute("aria-pressed", "false");

      const name = document.createElement("span");
      name.className = "preset-name";
      name.textContent = p.name;

      const detail = document.createElement("span");
      detail.className = "preset-detail";
      detail.textContent = `${fmtShort(p.work)} work · ${fmtShort(p.rest)} rest · ${p.rounds} rounds`;

      btn.append(name, detail);
      btn.addEventListener("click", () => {
        writeForm({ ...readForm(), work: p.work, rest: p.rest, rounds: p.rounds });
        el.error.hidden = true;
        updateTotal();
      });
      el.presets.append(btn);
    });
  }

  // ---------- Audio ----------
  let audioCtx = null;

  function ensureAudio() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
  }

  function beep(freq, duration = 0.12, delay = 0) {
    if (!soundOn || !audioCtx) return;
    const t = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  const sounds = {
    countdown: () => beep(660, 0.1),
    work: () => { beep(1046, 0.15); beep(1046, 0.3, 0.2); },
    rest: () => beep(523, 0.5),
    done: () => { beep(784, 0.2); beep(988, 0.2, 0.22); beep(1318, 0.5, 0.44); },
  };

  // ---------- Screen wake lock (keeps phone screen on) ----------
  let wakeLock = null;

  async function requestWakeLock() {
    try {
      if ("wakeLock" in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => { wakeLock = null; });
      }
    } catch {
      /* not supported or denied */
    }
  }

  function releaseWakeLock() {
    if (wakeLock) wakeLock.release().catch(() => {});
    wakeLock = null;
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && running) requestWakeLock();
  });

  // ---------- Timer logic ----------
  function buildPhases(s) {
    const list = [];
    if (s.prep > 0) list.push({ type: "prep", label: "Get ready", duration: s.prep, round: 1 });
    for (let r = 1; r <= s.rounds; r++) {
      list.push({ type: "work", label: "Work", duration: s.work, round: r });
      if (r < s.rounds && s.rest > 0) {
        list.push({ type: "rest", label: "Rest", duration: s.rest, round: r });
      }
    }
    return list;
  }

  function currentRemainingMs() {
    return running ? endAt - Date.now() : remainingMs;
  }

  function startWorkout() {
    phases = buildPhases(settings);
    idx = 0;
    finished = false;
    remainingMs = phases[0].duration * 1000;
    lastBeepSecond = phases[0].duration;
    el.setup.hidden = true;
    el.timer.hidden = false;
    el.skip.disabled = false;
    playPhaseSound(phases[0]);
    resume();
  }

  function resume() {
    if (finished) return;
    ensureAudio();
    endAt = Date.now() + remainingMs;
    running = true;
    clearInterval(tickId);
    tickId = setInterval(tick, 100);
    requestWakeLock();
    tick();
  }

  function pause() {
    if (!running) return;
    remainingMs = Math.max(0, endAt - Date.now());
    running = false;
    clearInterval(tickId);
    releaseWakeLock();
    render();
  }

  function tick() {
    // Advance through any phases that have elapsed (handles throttled background tabs).
    while (running && endAt - Date.now() <= 0) {
      idx++;
      if (idx >= phases.length) {
        finish();
        return;
      }
      endAt += phases[idx].duration * 1000; // carry over drift, no time lost
      lastBeepSecond = phases[idx].duration;
      playPhaseSound(phases[idx]);
    }

    // 3-2-1 countdown beeps
    const secLeft = Math.ceil(currentRemainingMs() / 1000);
    if (running && secLeft <= 3 && secLeft >= 1 && secLeft !== lastBeepSecond) {
      lastBeepSecond = secLeft;
      sounds.countdown();
    }

    render();
  }

  function playPhaseSound(phase) {
    if (phase.type === "work") sounds.work();
    else if (phase.type === "rest") sounds.rest();
  }

  function skip() {
    if (finished) return;
    idx++;
    if (idx >= phases.length) {
      finish();
      return;
    }
    const phase = phases[idx];
    remainingMs = phase.duration * 1000;
    lastBeepSecond = phase.duration;
    if (running) {
      endAt = Date.now() + remainingMs;
      playPhaseSound(phase);
    }
    render();
  }

  function finish() {
    running = false;
    finished = true;
    clearInterval(tickId);
    releaseWakeLock();
    idx = phases.length - 1;
    remainingMs = 0;
    sounds.done();
    render();
  }

  function reset() {
    running = false;
    finished = false;
    clearInterval(tickId);
    releaseWakeLock();
    phases = [];
    document.body.dataset.phase = "idle";
    el.timer.hidden = true;
    el.setup.hidden = false;
  }

  // ---------- Rendering ----------
  function render() {
    if (!phases.length) return;

    if (finished) {
      document.body.dataset.phase = "done";
      el.phaseLabel.textContent = "Done!";
      el.time.textContent = fmt(totalDuration(settings));
      el.next.textContent = "Great work";
      el.round.textContent = `Round ${settings.rounds} / ${settings.rounds}`;
      el.totalLeft.textContent = fmt(0);
      el.progress.style.strokeDashoffset = "0";
      el.toggle.textContent = "Again";
      el.skip.disabled = true;
      return;
    }

    const phase = phases[idx];
    const remaining = Math.max(0, currentRemainingMs());
    const fraction = phase.duration > 0 ? remaining / (phase.duration * 1000) : 0;

    document.body.dataset.phase = phase.type;
    el.phaseLabel.textContent = running ? phase.label : `${phase.label} · Paused`;
    el.time.textContent = fmt(Math.ceil(remaining / 1000));
    el.round.textContent = `Round ${phase.round} / ${settings.rounds}`;

    const upcoming = phases[idx + 1];
    el.next.textContent = upcoming ? `Next: ${upcoming.label}` : "Last one!";

    let totalLeftMs = remaining;
    for (let i = idx + 1; i < phases.length; i++) totalLeftMs += phases[i].duration * 1000;
    el.totalLeft.textContent = fmt(Math.ceil(totalLeftMs / 1000));

    el.progress.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - fraction));
    el.toggle.textContent = running ? "Pause" : "Resume";
  }

  // ---------- Events ----------
  renderPresets();
  writeForm(settings);
  updateTotal();

  el.form.addEventListener("input", () => {
    el.error.hidden = true;
    updateTotal();
  });

  // Normalize values when a field loses focus (e.g. "90" seconds -> "59").
  el.form.addEventListener("change", () => writeForm(readForm()));

  el.form.querySelectorAll(".step").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = $(btn.dataset.target);
      const min = Number(input.min);
      const max = Number(input.max);
      input.value = clampInt(Number(input.value) + Number(btn.dataset.step), min, max);
      updateTotal();
    });
  });

  el.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const s = readForm();
    if (s.work < 1) {
      el.error.textContent = "Work time must be at least 1 second.";
      el.error.hidden = false;
      return;
    }
    settings = s;
    saveSettings(s);
    writeForm(s);
    ensureAudio(); // must happen inside a user gesture for mobile browsers
    startWorkout();
  });

  el.toggle.addEventListener("click", () => {
    if (finished) startWorkout();
    else if (running) pause();
    else resume();
  });

  el.skip.addEventListener("click", skip);
  el.reset.addEventListener("click", reset);

  el.sound.addEventListener("click", () => {
    soundOn = !soundOn;
    el.sound.textContent = soundOn ? "Sound on" : "Sound off";
    el.sound.setAttribute("aria-pressed", String(soundOn));
    if (soundOn) ensureAudio();
  });

  document.addEventListener("keydown", (e) => {
    if (el.timer.hidden) return;
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "BUTTON") {
      // Let focused buttons handle Space/Enter natively to avoid double-triggering.
      if (e.key === " " || e.key === "Enter") return;
    }
    if (e.key === " ") {
      e.preventDefault();
      el.toggle.click();
    } else if (e.key === "s" || e.key === "S") {
      skip();
    } else if (e.key === "Escape") {
      reset();
    }
  });
})();
