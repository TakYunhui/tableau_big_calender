/* global tableau, flatpickr */

const SETTINGS_KEYS = {
  kind: "date_kind",
  startParam: "date_start_param",
  endParam: "date_end_param",
  format: "date_format",
};

const DEFAULTS = { kind: "range", format: "Y-m-d" };

const FRAME_WIDTH = 480;
const H_COLLAPSED = 60;
const H_CONFIG = 270;      // 설정 패널 펼침 높이
const H_CALENDAR = 330;    // 달력 보이기 높이

let fp = null;
let unregisterParamHandlers = [];
let isConfigOpen = false;

function qs(id) { return document.getElementById(id); }

function setHint(msg) {
  const el = qs("hint");
  if (el) el.textContent = msg || "";
}

function setCfgHint(msg) {
  const el = qs("cfgHint");
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
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function setValueTexts(startDisplay, endDisplay) {
  const startEl = qs("startText");
  const endEl = qs("endText");
  if (startEl) startEl.textContent = startDisplay || "-";
  if (endEl) endEl.textContent = endDisplay || "-";
}

/** 숫자 -> 날짜(추정) */
function numberToDateDisplay(n) {
  if (typeof n !== "number" || Number.isNaN(n)) return "";

  if (n > 10_000_000_000) {
    const d = new Date(n);
    return Number.isNaN(d.getTime()) ? String(n) : toISODateOnly(d);
  }

  const base = new Date(Date.UTC(1899, 11, 30));
  const d = new Date(base.getTime() + n * 24 * 60 * 60 * 1000);
  return Number.isNaN(d.getTime()) ? String(n) : toISODateOnly(d);
}

/** Tableau currentValue -> 표시 문자열 (Cloud 대응) */
function getParamDisplay(p) {
  if (!p || !p.currentValue) return "";
  const cv = p.currentValue;

  if (typeof cv.formattedValue === "string") {
    const fv = cv.formattedValue.trim();
    if (fv !== "" && fv !== "0") return fv;
  }

  const raw = (cv && typeof cv === "object" && "value" in cv) ? cv.value : cv;

  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return toISODateOnly(raw);

  if (typeof raw === "string") {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return toISODateOnly(d);

    const n = Number(raw);
    if (!Number.isNaN(n)) return numberToDateDisplay(n);

    return raw;
  }

  if (typeof raw === "number") return numberToDateDisplay(raw);

  return "";
}

function ensureFlatpickrLoaded() {
  if (typeof window.flatpickr === "undefined") {
    setHint("flatpickr 로드 실패: ./lib/flatpickr.min.js 경로/순서 확인");
    return false;
  }
  return true;
}

function destroyFP() {
  if (fp) { fp.destroy(); fp = null; }
}

async function setFrameSize(width, height) {
  try {
    if (tableau?.extensions?.ui?.setFrameSizeAsync) {
      await tableau.extensions.ui.setFrameSizeAsync(width, height);
    } else if (tableau?.extensions?.ui?.resizeAsync) {
      await tableau.extensions.ui.resizeAsync(width, height);
    }
  } catch (e) {
    console.warn("setFrameSize failed:", e);
  }
}

/** 현재 파라미터 값 -> UI 반영 */
async function syncUIFromCurrentParameterValues(settings) {
  if (!settings.startParam) {
    setValueTexts("", "");
    return;
  }
  const map = await getParametersMap();

  const pStart = map.get(settings.startParam);
  const startDisplay = getParamDisplay(pStart);

  let endDisplay = "";
  if (settings.kind === "single") {
    endDisplay = startDisplay;
  } else {
    const pEnd = map.get(settings.endParam);
    endDisplay = getParamDisplay(pEnd);
  }

  setValueTexts(startDisplay, endDisplay);
}

/** Cloud 초기 로딩 지연 대응 */
async function syncUIWithRetry(settings, tries = 8, delayMs = 250) {
  for (let i = 0; i < tries; i++) {
    await syncUIFromCurrentParameterValues(settings);

    const s = qs("startText")?.textContent?.trim();
    const e = qs("endText")?.textContent?.trim();

    const okStart = s && s !== "-";
    const okEnd = settings.kind === "single" ? true : (e && e !== "-");

    if (okStart && okEnd) return;
    await new Promise((r) => setTimeout(r, delayMs));
  }
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

/** 달력 init */
function initFlatpickr(settings) {
  destroyFP();
  if (!ensureFlatpickrLoaded()) return;

  const input = qs("fpHidden");
  if (!input) {
    setHint("fpHidden input이 없습니다. index.html id 확인 필요");
    return;
  }

  const mode = settings.kind === "single" ? "single" : "range";

  fp = flatpickr(input, {
    mode,
    dateFormat: settings.format || DEFAULTS.format,
    allowInput: false,
    clickOpens: false,

    onOpen: () => setHint(""),

    onClose: async () => {
      // 달력 닫히면: 설정 패널 열려있으면 설정 높이, 아니면 접기
      await setFrameSize(FRAME_WIDTH, isConfigOpen ? H_CONFIG : H_COLLAPSED);
    },

    onChange: async (selectedDates) => {
      const start = selectedDates[0] || null;
      const end = settings.kind === "single" ? start : (selectedDates[1] || null);

      setValueTexts(start ? toISODateOnly(start) : "-", end ? toISODateOnly(end) : "-");

      if (settings.kind === "range" && !end) return;

      try {
        await applyDatesToParameters(settings, start, end);
        setHint("");
        await syncUIWithRetry(settings, 4, 150);
      } catch (e) {
        setHint(e?.message || String(e));
      }
    },
  });
}

/** 달력 열기: 날짜 표시 영역 클릭 시에만 */
function openCalendar() {
  if (isConfigOpen) return; // 설정 펼친 상태에선 달력 안 열리게(원하면 삭제 가능)

  if (!fp) {
    setHint("달력 인스턴스(fp)가 없습니다. 초기화 상태 확인 필요");
    return;
  }

  setFrameSize(FRAME_WIDTH, H_CALENDAR).finally(() => {
    setTimeout(() => fp.open(), 0);
  });
}

/** 설정 패널 UI 채우기 */
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

async function hydrateConfigPanel(settings) {
  const dash = await getDashboard();
  const dashNameEl = qs("cfgDashName");
  if (dashNameEl) dashNameEl.textContent = dash?.name || "-";

  const items = await loadDateParameterItems();
  if (items.length === 0) {
    setCfgHint("날짜/시간 타입 파라미터를 찾지 못했습니다. 대시보드 파라미터 타입을 확인하세요.");
  } else {
    setCfgHint("");
  }

  const kindSel = qs("kind");
  const startSel = qs("startParam");
  const endSel = qs("endParam");
  const formatInput = qs("format");
  const rowEnd = qs("rowEnd");

  if (kindSel) kindSel.value = settings.kind;
  if (formatInput) formatInput.value = settings.format || DEFAULTS.format;

  if (startSel) fillSelect(startSel, items, settings.startParam);
  if (endSel) fillSelect(endSel, items, settings.endParam);

  if (rowEnd) rowEnd.style.display = (settings.kind === "single") ? "none" : "";

  if (kindSel) {
    kindSel.onchange = () => {
      const v = kindSel.value;
      if (rowEnd) rowEnd.style.display = (v === "single") ? "none" : "";
    };
  }
}

/** 설정 저장 */
async function saveConfigFromPanel() {
  try {
    setCfgHint("");

    const kindSel = qs("kind");
    const startSel = qs("startParam");
    const endSel = qs("endParam");
    const formatInput = qs("format");

    const kind = (kindSel ? kindSel.value : DEFAULTS.kind) || DEFAULTS.kind;
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

    setCfgHint("저장 완료");
    await render(); // 저장 반영 + 파라미터 리스너 재연결
  } catch (e) {
    setCfgHint(e?.message || String(e));
  }
}

async function openConfigPanel() {
  isConfigOpen = true;
  const panel = qs("cfgPanel");
  if (panel) {
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
  }

  const settings = loadSettings();
  await hydrateConfigPanel(settings);
  await setFrameSize(FRAME_WIDTH, H_CONFIG);
}

async function closeConfigPanel() {
  isConfigOpen = false;
  const panel = qs("cfgPanel");
  if (panel) {
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
  }
  await setFrameSize(FRAME_WIDTH, H_COLLAPSED);
}

/** 파라미터 변경 동기화: dashboard가 아니라 "파라미터 객체"에 이벤트 걸어야 함 */
async function bindParameterChangedListeners(settings) {
  // 기존 해제
  unregisterParamHandlers.forEach((fn) => { try { fn(); } catch (_) {} });
  unregisterParamHandlers = [];

  if (!settings.startParam) return;

  const dash = await getDashboard();
  const params = await dash.getParametersAsync();

  const targets = new Set();
  targets.add(settings.startParam);
  if (settings.kind === "range" && settings.endParam) targets.add(settings.endParam);

  params.forEach((p) => {
    if (!targets.has(p.name)) return;

    const unregister = p.addEventListener(
      tableau.TableauEventType.ParameterChanged,
      async () => {
        const s = loadSettings();
        await syncUIWithRetry(s, 6, 200);
      }
    );

    unregisterParamHandlers.push(unregister);
  });
}

/** 클릭/버튼 바인딩 */
function bindHandlers() {
  const bar = qs("rangeBar");
  const settingsBtn = qs("settingsBtn");
  const cfgCloseBtn = qs("cfgCloseBtn");
  const cfgSaveBtn = qs("cfgSaveBtn");
  const cfgPanel = qs("cfgPanel");

  // 바 클릭 -> 달력 (설정 패널 열려있으면 무시)
  if (bar) {
    const handler = (e) => {
      if (e.target && e.target.id === "settingsBtn") return;
      openCalendar();
    };
    bar.onclick = handler;
    bar.onmousedown = handler;
  }

  // 설정 버튼: authoring에서만 열림
  if (settingsBtn) {
    settingsBtn.onclick = async (e) => {
      e.stopPropagation();
      if (!isAuthoringMode()) return;
      if (!isConfigOpen) await openConfigPanel();
      else await closeConfigPanel();
    };
  }

  // 설정 패널 내부 클릭은 바 클릭으로 전파되지 않게
  if (cfgPanel) {
    cfgPanel.onclick = (e) => e.stopPropagation();
    cfgPanel.onmousedown = (e) => e.stopPropagation();
  }

  if (cfgCloseBtn) cfgCloseBtn.onclick = async () => { await closeConfigPanel(); };
  if (cfgSaveBtn) cfgSaveBtn.onclick = async () => { await saveConfigFromPanel(); };
}

async function render() {
  const settings = loadSettings();

  // 버튼 표시 제어
  const settingsBtn = qs("settingsBtn");
  if (settingsBtn) settingsBtn.style.display = isAuthoringMode() ? "inline-flex" : "none";

  // 설정 패널은 authoring 아니면 닫기
  if (!isAuthoringMode() && isConfigOpen) {
    await closeConfigPanel();
  }

  // 값 표시 동기화
  if (!settings.startParam || (settings.kind === "range" && !settings.endParam)) {
    setHint(isAuthoringMode() ? "⚙ 설정에서 파라미터를 매핑하세요." : "조회기간 설정이 아직 완료되지 않았습니다.");
    setValueTexts("", "");
  } else {
    setHint("");
  }

  initFlatpickr(settings);
  bindHandlers();
  await bindParameterChangedListeners(settings);

  // 초기 값 불러오기
  if (settings.startParam) await syncUIWithRetry(settings);

  // 기본 프레임 높이(설정 열려있으면 유지)
  await setFrameSize(FRAME_WIDTH, isConfigOpen ? H_CONFIG : H_COLLAPSED);
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
