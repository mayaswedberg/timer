(() => {
  "use strict";

  // All data lives in this browser's localStorage under one key.
  // Shape: { version: 1, unit: "lb"|"kg", workouts: [{ date: "YYYY-MM-DD", exercises: [{ name, sets: [{ weight, reps }] }] }] }
  const KEY = "workoutLog.v1";
  const EXPORT_KEY = "workoutLog.lastExport";

  const $ = (id) => document.getElementById(id);
  const el = {
    date: $("date"),
    today: $("today"),
    status: $("status"),
    exercises: $("exercises"),
    empty: $("empty"),
    addForm: $("add-form"),
    exName: $("ex-name"),
    exNames: $("ex-names"),
    history: $("history"),
    unit: $("unit"),
    exportBtn: $("export"),
    importBtn: $("import"),
    importFile: $("import-file"),
    backupNote: $("backup-note"),
  };

  // ---------- Dates ----------
  function todayISO() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  function formatDate(iso, withYear) {
    const d = new Date(iso + "T00:00:00");
    const opts = { weekday: "short", month: "short", day: "numeric" };
    if (withYear || d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
    return d.toLocaleDateString(undefined, opts);
  }

  // ---------- Storage ----------
  function emptyData() {
    return { version: 1, unit: "lb", workouts: [] };
  }

  const toNum = (v) => (v === "" || v == null || !isFinite(+v) ? null : +v);

  // Validates and cleans data from storage or an imported file. Throws if it isn't a workout log.
  function normalize(obj) {
    if (!obj || typeof obj !== "object" || !Array.isArray(obj.workouts)) {
      throw new Error("This file isn't a workout log backup.");
    }
    const byDate = new Map();
    for (const w of obj.workouts) {
      if (!w || !/^\d{4}-\d{2}-\d{2}$/.test(w.date) || !Array.isArray(w.exercises)) continue;
      const exercises = w.exercises
        .filter((e) => e && typeof e.name === "string" && e.name.trim())
        .map((e) => ({
          name: e.name.trim(),
          sets: (Array.isArray(e.sets) ? e.sets : []).map((s) => ({
            weight: toNum(s && s.weight),
            reps: toNum(s && s.reps),
          })),
        }));
      byDate.set(w.date, { date: w.date, exercises });
    }
    return {
      version: 1,
      unit: obj.unit === "kg" ? "kg" : "lb",
      workouts: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  function load() {
    let raw = null;
    try {
      raw = localStorage.getItem(KEY);
      return raw ? normalize(JSON.parse(raw)) : emptyData();
    } catch {
      // Keep unreadable data aside instead of overwriting it on the next save.
      if (raw) {
        try { localStorage.setItem(KEY + ".unreadable-" + Date.now(), raw); } catch { /* ignore */ }
      }
      return emptyData();
    }
  }

  let statusTimer;
  function setStatus(msg, isError) {
    clearTimeout(statusTimer);
    el.status.textContent = msg;
    el.status.classList.toggle("is-error", !!isError);
    if (!isError) statusTimer = setTimeout(() => (el.status.textContent = ""), 2500);
  }

  function save() {
    data.workouts = data.workouts
      .filter((w) => w.exercises.length)
      .sort((a, b) => a.date.localeCompare(b.date));
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch {
      setStatus("Couldn't save. Browser storage is full or blocked. Export a backup now.", true);
      return false;
    }
  }

  // Ask the browser not to evict our data under storage pressure.
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persisted().then((p) => p || navigator.storage.persist()).catch(() => {});
  }

  // ---------- State ----------
  let data = load();
  let currentDate = todayISO();

  function getWorkout(date, create) {
    let w = data.workouts.find((x) => x.date === date);
    if (!w && create) {
      w = { date, exercises: [] };
      data.workouts.push(w);
    }
    return w;
  }

  const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();
  const hasNumbers = (sets) => sets.some((s) => s.reps != null || s.weight != null);

  // Most recent session of this exercise before `beforeDate` that has any numbers in it.
  function lastFor(name, beforeDate) {
    for (let i = data.workouts.length - 1; i >= 0; i--) {
      const w = data.workouts[i];
      if (w.date >= beforeDate) continue;
      const ex = w.exercises.find((e) => sameName(e.name, name));
      if (ex && hasNumbers(ex.sets)) return { date: w.date, sets: ex.sets };
    }
    return null;
  }

  function fmtSet(s) {
    const unit = data.unit;
    if (s.weight != null && s.reps != null) return `${s.weight} ${unit} × ${s.reps}`;
    if (s.reps != null) return `${s.reps} reps`;
    if (s.weight != null) return `${s.weight} ${unit}`;
    return "–";
  }

  // ---------- Rendering ----------
  function h(tag, props, ...children) {
    const node = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
        else if (k === "class") node.className = v;
        else if (v != null) node.setAttribute(k, v);
      }
    }
    node.append(...children.filter((c) => c != null));
    return node;
  }

  function numberInput(set, field, placeholder, label) {
    const input = h("input", {
      type: "number",
      min: "0",
      step: "any",
      inputmode: field === "reps" ? "numeric" : "decimal",
      "aria-label": label,
      placeholder: placeholder != null ? String(placeholder) : "",
    });
    if (set[field] != null) input.value = set[field];
    input.addEventListener("input", () => {
      set[field] = toNum(input.value);
      save();
    });
    return input;
  }

  function exerciseCard(workout, ex) {
    const last = lastFor(ex.name, workout.date);

    const lastLine = last
      ? `Last time (${formatDate(last.date)}): ${last.sets.filter((s) => s.reps != null || s.weight != null).map(fmtSet).join(", ")}`
      : "First time logging this exercise.";

    const rows = h("div", { class: "sets" });
    ex.sets.forEach((set, i) => {
      const prev = last && last.sets[i];
      rows.append(
        h("div", { class: "set-row" },
          h("span", { class: "set-num" }, String(i + 1)),
          numberInput(set, "weight", prev && prev.weight, `Set ${i + 1} weight`),
          numberInput(set, "reps", prev && prev.reps, `Set ${i + 1} reps`),
          h("button", {
            type: "button",
            class: "icon-btn",
            "aria-label": `Remove set ${i + 1}`,
            onclick: () => { ex.sets.splice(i, 1); save(); render(); },
          }, "×"),
        ),
      );
    });

    return h("article", { class: "card exercise" },
      h("header", null,
        h("h2", null, ex.name),
        h("button", {
          type: "button",
          class: "icon-btn",
          "aria-label": `Remove ${ex.name}`,
          onclick: () => {
            if (!confirm(`Remove ${ex.name} from this workout?`)) return;
            workout.exercises.splice(workout.exercises.indexOf(ex), 1);
            save();
            render();
          },
        }, "×"),
      ),
      h("p", { class: "last" }, lastLine),
      h("div", { class: "set-row set-head", "aria-hidden": "true" },
        h("span", null, "Set"), h("span", null, data.unit), h("span", null, "Reps"), h("span"),
      ),
      rows,
      h("button", {
        type: "button",
        class: "btn secondary add-set",
        onclick: () => {
          const prev = ex.sets[ex.sets.length - 1];
          ex.sets.push(prev ? { ...prev } : { weight: null, reps: null });
          save();
          render();
          const card = el.exercises.children[workout.exercises.indexOf(ex)];
          card?.querySelector(".sets .set-row:last-child input")?.focus();
        },
      }, "+ Set"),
    );
  }

  function renderHistory() {
    el.history.replaceChildren();
    const list = data.workouts.slice().reverse();
    if (!list.length) {
      el.history.append(h("li", { class: "note" }, "No workouts logged yet."));
      return;
    }
    for (const w of list) {
      const names = w.exercises.map((e) => e.name);
      const summary = names.slice(0, 3).join(", ") + (names.length > 3 ? ` +${names.length - 3}` : "");
      el.history.append(
        h("li", null,
          h("button", {
            type: "button",
            class: "history-item",
            "aria-current": w.date === currentDate ? "date" : null,
            onclick: () => { currentDate = w.date; render(); window.scrollTo({ top: 0, behavior: "smooth" }); },
          },
            h("strong", null, formatDate(w.date)),
            h("small", null, summary),
          ),
        ),
      );
    }
  }

  function renderNames() {
    const seen = new Map();
    for (let i = data.workouts.length - 1; i >= 0; i--) {
      for (const e of data.workouts[i].exercises) {
        const k = e.name.toLowerCase();
        if (!seen.has(k)) seen.set(k, e.name);
      }
    }
    el.exNames.replaceChildren(...[...seen.values()].map((n) => h("option", { value: n })));
  }

  function renderBackupNote() {
    const last = localStorage.getItem(EXPORT_KEY);
    el.backupNote.textContent = last
      ? `Last backup: ${formatDate(last, true)}.`
      : "Your log is saved in this browser only. Export a backup now and then.";
  }

  function render() {
    el.date.value = currentDate;
    el.unit.value = data.unit;
    const w = getWorkout(currentDate, false);
    const exercises = w ? w.exercises : [];
    el.exercises.replaceChildren(...exercises.map((ex) => exerciseCard(w, ex)));
    el.empty.hidden = exercises.length > 0;
    renderHistory();
    renderNames();
    renderBackupNote();
  }

  // ---------- Events ----------
  el.addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = el.exName.value.trim().replace(/\s+/g, " ");
    if (!name) return;
    const w = getWorkout(currentDate, true);
    if (w.exercises.some((x) => sameName(x.name, name))) {
      setStatus(`${name} is already in this workout.`, true);
      return;
    }
    // Reuse the spelling from history so "squat" and "Squat" stay one exercise.
    const known = [...el.exNames.options].map((o) => o.value).find((n) => sameName(n, name));
    const last = lastFor(name, currentDate);
    w.exercises.push({
      name: known || name,
      sets: last ? last.sets.map((s) => ({ ...s })) : [{ weight: null, reps: null }],
    });
    save();
    el.exName.value = "";
    render();
  });

  el.date.addEventListener("change", () => {
    currentDate = el.date.value || todayISO();
    render();
  });

  el.today.addEventListener("click", () => {
    currentDate = todayISO();
    render();
  });

  el.unit.addEventListener("change", () => {
    data.unit = el.unit.value === "kg" ? "kg" : "lb";
    save();
    render();
  });

  el.exportBtn.addEventListener("click", () => {
    save();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: `workout-log-${todayISO()}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    try { localStorage.setItem(EXPORT_KEY, todayISO()); } catch { /* ignore */ }
    renderBackupNote();
    setStatus("Backup downloaded.");
  });

  el.importBtn.addEventListener("click", () => el.importFile.click());

  el.importFile.addEventListener("change", async () => {
    const file = el.importFile.files[0];
    el.importFile.value = "";
    if (!file) return;
    try {
      const imported = normalize(JSON.parse(await file.text()));
      const n = imported.workouts.length;
      const ok = confirm(
        `Replace your current log (${data.workouts.length} workouts) with this backup (${n} workouts)?\n\nThis can't be undone. Export first if you want to keep the current log.`,
      );
      if (!ok) return;
      data = imported;
      if (save()) setStatus(`Imported ${n} workouts.`);
      render();
    } catch (err) {
      setStatus(err instanceof SyntaxError ? "That file isn't valid JSON." : err.message, true);
    }
  });

  // Keep several open tabs in sync.
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      data = load();
      render();
    }
  });

  render();
})();
