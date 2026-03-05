/* global tableau, flatpickr */

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

let fp = null;

function qs(id) { return document.getElementById(id); }

function setHint(msg) {
  const el = qs("hint");
  if (el) el.textContent = msg || "";
}

function isAuthoringMode() {
  return tableau?.extensions?.environment?.mode === "authoring";
}

function loadSettings() {
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

async function getParametersMap() {
  const dash = await getDashboard();
  const params = await dash.getParametersAsync();
  const map = new Map();
  params.forEach((p) => map.set(p.name, p));
  return map;
}

function toISODateOnly(d) {
  if (!(d instanceof Date)) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function setValueTexts(start, end) {
  const startEl = qs("startText");
  const endEl = qs("endText");
  if (startEl) startEl.textContent = start ? toISODateOnly(start) : "-";
  if (endEl) endEl.textContent = end ? toISODateOnly(end) : "-";
}

function setMappingTexts(settings) {
  const sEl = qs("startParamName");
  const eEl = qs("endParamName");

  if (sEl) sEl.textContent = settings.startParam ? settings.startParam : "(미설정)";
  if (eEl) {
    if (settings.kind === "single") {
      eEl.textContent = settings.endParam ? settings.endParam : "(단일)";
    } else {
      eEl.textContent = settings.endParam ? settings.endParam : "(미설정)";
    }
  }
}

function destroyFP() {
  if (fp) { fp.destroy(); fp = null; }
}

function ensureFlatpickrLoaded() {
  if (typeof window.flatpickr === "undefined") {
    setHint("flatpickr 로드 실패: ./lib/flatpickr.min.js 경로/순서를 확인하세요.");
    return false;
  }
  return true;
}

function openCalendar() {
  if (!fp) {
    setHint("달력 인스턴스가 없습니다. (fp=null) main.js 오류/중단 여부 확인");
    return;
  }
  fp.open();
}

async function applyDatesToParameters(settings, start, end) {
  const { kind, startParam, endParam } = settings;

  if (!startParam) throw new Error("시작 파라미터가 설정되지 않았습니다.");
  if (kind === "range" && !endParam) throw new Error("종료 파라미터가 설정되지 않았습니다.");
  if (!start) throw new Error("시작날짜를 선택하세요.");
  if (kind === "range" && !end) throw new Error("종료날짜를 선택하세요.");

  const map = await getParametersMap();

  const pStart = map.get(startParam);
  if (!pStart) throw new Error(`파라미터를 찾을 수 없습니다: ${startParam}`);
  await pStart.changeValueAsync(toISODateOnly(start));

  if (kind === "range") {
    const pEnd = map.get(endParam);
    if (!pEnd) throw new Error(`파라미터를 찾을 수 없습니다: ${endParam}`);
    await pEnd.changeValueAsync(toISODateOnly(end));
  }
}

function initFlatpickr(settings) {
  destroyFP();
  if (!ensureFlatpickrLoaded()) return;

  const input = qs("fpHidden");
  if (!input) {
    setHint("fpHidden input이 없습니다. index.html에 <input id='fpHidden'>가 있어야 합니다.");
    return;
  }

  const mode = settings.kind === "single" ? "single" : "range";

  fp = flatpickr(input, {
    mode,
    dateFormat: settings.format || DEFAULTS.format,
    allowInput: false,
    clickOpens: false,

    onOpen: () => setHint(""),

    onChange: async (selectedDates) => {
      const start = selectedDates[0] || null;
      const end = settings.kind === "single" ? start : (selectedDates[1] || null);

      setValueTexts(start, end);

      if (settings.kind === "range" && !end) return;

      try {
        await applyDatesToParameters(settings, start, end);
        setHint("");
      } catch (e) {
        setHint(e?.message || String(e));
      }
    },
  });
}

async function openConfigDialog() {
  const url = new URL("config.html", window.location.href).href;
  try {
    await tableau.extensions.ui.displayDialogAsync(url, "", { height: 420, width: 520 });
  } catch (e) {
    console.warn("Config dialog closed or failed:", e);
  }
}

function bindClickHandlers() {
  const bar = qs("rangeBar");
  const settingsBtn = qs("settingsBtn");

  if (!bar) {
    setHint("rangeBar를 찾을 수 없습니다. index.html 구조가 깨졌습니다.");
    return;
  }

  bar.onclick = (e) => {
    if (e.target && e.target.id === "settingsBtn") return;
    openCalendar();
  };

  if (settingsBtn) {
    settingsBtn.onclick = async (e) => {
      e.stopPropagation();
      await openConfigDialog();
      await render();
    };
  }
}

async function render() {
  const settings = loadSettings();

  const settingsBtn = qs("settingsBtn");
  if (settingsBtn) settingsBtn.style.display = isAuthoringMode() ? "inline-flex" : "none";

  setMappingTexts(settings);
  setValueTexts(null, null);

  if (!settings.startParam || (settings.kind === "range" && !settings.endParam)) {
    setHint(isAuthoringMode() ? "⚙ 설정에서 파라미터를 매핑하세요." : "조회기간 설정이 아직 완료되지 않았습니다.");
  } else {
    setHint("");
  }

  initFlatpickr(settings);
  bindClickHandlers();
}

async function init() {
  await tableau.extensions.initializeAsync();

  tableau.extensions.settings.addEventListener(
    tableau.TableauEventType.SettingsChanged,
    async () => { await render(); }
  );

  await render();
}

init().catch((e) => {
  console.error(e);
  setHint(e?.message || String(e));
});
