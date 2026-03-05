/* global tableau */

const SETTINGS_KEYS = {
  kind: "date_kind",
  startParam: "date_start_param",
  endParam: "date_end_param",
  format: "date_format",
};

const DEFAULTS = {
  kind: "range",
  format: "Y-m-d",
};

function qs(id) { return document.getElementById(id); }

function setHint(msg) {
  const el = qs("cfgHint");
  if (el) el.textContent = msg || "";
}

function setEndRowVisible(isVisible) {
  const row = qs("rowEnd");
  if (row) row.style.display = isVisible ? "" : "none";
}

function detectType(p) {
  return (p?.dataType || p?.parameterType || p?.type || "").toString();
}

function isDateLike(p) {
  const t = detectType(p).toLowerCase();
  if (!t) return false;
  return t.includes("date"); // date/datetime
}

function fillSelect(selectEl, items, selectedValue) {
  selectEl.innerHTML = "";

  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "선택";
  selectEl.appendChild(empty);

  items.forEach((it) => {
    const opt = document.createElement("option");
    opt.value = it.name;
    opt.textContent = it.label;
    selectEl.appendChild(opt);
  });

  if (selectedValue) selectEl.value = selectedValue;
}

function readCurrentSettings() {
  const s = tableau.extensions.settings;
  return {
    kind: s.get(SETTINGS_KEYS.kind) || DEFAULTS.kind,
    startParam: s.get(SETTINGS_KEYS.startParam) || "",
    endParam: s.get(SETTINGS_KEYS.endParam) || "",
    format: s.get(SETTINGS_KEYS.format) || DEFAULTS.format,
  };
}

async function getDashboard() {
  return tableau.extensions.dashboardContent.dashboard;
}

async function loadDateParameterItems() {
  const dash = await getDashboard();
  const params = await dash.getParametersAsync();
  const dateParams = params.filter(isDateLike);

  return dateParams
    .map((p) => {
      const t = detectType(p);
      return { name: p.name, label: t ? `${p.name} (${t})` : p.name };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function init() {
  await tableau.extensions.initializeDialogAsync();

  const dash = await getDashboard();
  const dashNameEl = qs("cfgDashName");
  if (dashNameEl) dashNameEl.textContent = dash?.name || "-";

  const items = await loadDateParameterItems();
  if (items.length === 0) {
    setHint("날짜/시간 타입 파라미터를 찾지 못했습니다. 대시보드 파라미터 타입을 확인하세요.");
  }

  const cur = readCurrentSettings();

  const kindSel = qs("kind");
  const startSel = qs("startParam");
  const endSel = qs("endParam");
  const formatInput = qs("format");

  if (kindSel) kindSel.value = cur.kind;
  if (formatInput) formatInput.value = cur.format;

  if (startSel) fillSelect(startSel, items, cur.startParam);
  if (endSel) fillSelect(endSel, items, cur.endParam);

  setEndRowVisible(cur.kind !== "single");

  if (kindSel) {
    kindSel.onchange = () => setEndRowVisible(kindSel.value !== "single");
  }

  const cancelBtn = qs("cancelBtn");
  if (cancelBtn) cancelBtn.onclick = () => tableau.extensions.ui.closeDialog("cancel");

  const saveBtn = qs("saveBtn");
  if (saveBtn) {
    saveBtn.onclick = async () => {
      try {
        setHint("");

        const kind = kindSel ? kindSel.value : DEFAULTS.kind;
        const startParam = startSel ? startSel.value : "";
        const endParam = endSel ? endSel.value : "";
        const format = (formatInput ? formatInput.value : DEFAULTS.format).trim() || DEFAULTS.format;

        if (!startParam) throw new Error("시작 파라미터를 선택하세요.");
        if (kind === "range" && !endParam) throw new Error("종료 파라미터를 선택하세요.");

        const s = tableau.extensions.settings;
        s.set(SETTINGS_KEYS.kind, kind);
        s.set(SETTINGS_KEYS.startParam, startParam);
        s.set(SETTINGS_KEYS.endParam, kind === "single" ? "" : endParam);
        s.set(SETTINGS_KEYS.format, format);

        await s.saveAsync();
        tableau.extensions.ui.closeDialog("saved");
      } catch (e) {
        setHint(e?.message || String(e));
      }
    };
  }
}

init().catch((e) => {
  console.error(e);
  setHint(e?.message || String(e));
});
