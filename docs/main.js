/* global tableau, flatpickr */

const SETTINGS_KEYS = {
  kind: "date_kind",
  startParam: "date_start_param",
  endParam: "date_end_param",
  format: "date_format",
};

const DEFAULTS = { kind: "range", format: "Y-m-d" };

// ✅ 프레임 고정 480x200 (확장/축소 금지)
const FRAME_WIDTH = 480;
const FRAME_HEIGHT = 200;

let fp = null;
let unregisterParamHandlers = [];

let isConfigOpen = false;
let isCalendarOpen = false;

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

async function setFrameSizeFixed() {
  try {
    if (tableau?.extensions?.ui?.setFrameSizeAsync) {
      await tableau.extensions.ui.setFrameSizeAsync(FRAME_WIDTH, FRAME_HEIGHT);
    } else if (tableau?.extensions?.ui?.resizeAsync) {
      await tableau.extensions.ui.resizeAsync(FRAME_WIDTH, FRAME_HEIGHT);
    }
  } catch (e) {
    console.warn("setFrameSizeFixed failed:", e);
  }
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

function numberToDateDisplay(n) {
  if (typeof n !== "number" || Number.isNaN(n)) return "";

  if (n > 10_000_000_000) {
    const d = new Date(n);
    return Number.isNaN(d.getTime()) ? String(n) : toISODateOnly(d);
  }

  // 엑셀/테이블로 "일수" 들어온 경우 추정(Cloud에서 0 문제 회피용)
  const base = new Date(Date.UTC(1899, 11, 30));
  const d = new Date(base.getTime() + n * 24 * 60 * 60 * 1000);
  return Number.isNaN(d.getTime()) ? String(n) : toISODateOnly(d);
}

function getParamDisplay(p) {
  if (!p || !p.currentValue) return "";
  const cv = p.currentValue;

  // formattedValue가 가장 안정적
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

function closeConfigPanelUI() {
  isConfigOpen = false;
  const p = qs("cfgPanel");
  if (p) p.classList.remove("open");
}

function openConfigPanelUI() {
  isConfigOpen = true;
  const p = qs("cfgPanel");
  if (p) p.classList.add("open");
}

function closeCalendarUI() {
  isCalendarOpen = false;
  const h = qs("calHost");
  if (h) h.classList.remove("open");
}

function openCalendarUI() {
  isCalendarOpen = true;
  const h = qs("calHost");
  if (h) h.classList.add("open");
}


function getKoLocale() {
  return {
    weekdays: {
      shorthand: ["일", "월", "화", "수", "목", "금", "토"],
      longhand: ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"]
    },
    months: {
      shorthand: ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"],
      longhand: ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"]
    },
    firstDayOfWeek: 0,
    rangeSeparator: " ~ ",
    scrollTitle: "스크롤하여 증가",
    toggleTitle: "클릭하여 전환",
    time_24hr: true
  };
}

/** ✅ 200 고정이므로 달력은 calHost(하단 140) 안에 inline으로 박는다 */
function initFlatpickr(settings) {
  destroyFP();
  if (!ensureFlatpickrLoaded()) return;

  const input = qs("fpHidden");
  const host = qs("calHost");
  if (!input || !host) {
    setHint("fpHidden 또는 calHost가 없습니다. index.html id 확인 필요");
    return;
  }

  // host 초기화(중복 방지)
  host.innerHTML = "";

  const mode = settings.kind === "single" ? "single" : "range";

  // 한글 locale 직접 정의
  const koLocale = {
    weekdays: {
      shorthand: ["일", "월", "화", "수", "목", "금", "토"],
      longhand: ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"]
    },
    months: {
      shorthand: ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"],
      longhand: ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"]
    },
    firstDayOfWeek: 0,
    rangeSeparator: " ~ ",
    scrollTitle: "스크롤하여 증가",
    toggleTitle: "클릭하여 전환",
    time_24hr: true
  };

  fp = flatpickr(input, {
    mode: mode,
    dateFormat: settings.format || DEFAULTS.format,

    allowInput: false,
    clickOpens: false,

    inline: true,
    appendTo: host,

    locale: koLocale,

    monthSelectorType: "static",
    prevArrow: "<",
    nextArrow: ">",

    onOpen: () => setHint(""),

    onChange: async (selectedDates) => {
      const start = selectedDates[0] || null;
      const end = settings.kind === "single" ? start : (selectedDates[1] || null);

      setValueTexts(
        start ? toISODateOnly(start) : "-",
        end ? toISODateOnly(end) : "-"
      );

      if (settings.kind === "range" && !end) return;

      try {
        await applyDatesToParameters(settings, start, end);
        setHint("");
        await syncUIWithRetry(settings, 4, 150);
      } catch (e) {
        setHint(e?.message || String(e));
      }
    }
  });

  // 기본: 닫힘
  closeCalendarUI();
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

/** 상단 바 클릭 => 달력 토글 (설정 열려있으면 달력 금지) */
function toggleCalendar() {
  if (isConfigOpen) return;
  if (!fp) return;

  if (isCalendarOpen) {
    closeCalendarUI();
  } else {
    closeConfigPanelUI();
    openCalendarUI();
  }
}

/** ===== 설정 패널 ===== */
function detectType(p) {
  return (p?.dataType || p?.parameterType || p?.type || "").toString();
}

function isDateLike(p) {
  const t = detectType(p).toLowerCase();
  if (!t) return false;
  return t.includes("date");
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
  return params.filter(isDateLike)
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
  setCfgHint(items.length ? "" : "날짜/시간 타입 파라미터를 찾지 못했습니다.");

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
    await render();
  } catch (e) {
    setCfgHint(e?.message || String(e));
  }
}

async function toggleConfigPanel() {
  if (!isAuthoringMode()) return;

  if (isConfigOpen) {
    closeConfigPanelUI();
    setHint("");
  } else {
    closeCalendarUI();
    openConfigPanelUI();
    const settings = loadSettings();
    await hydrateConfigPanel(settings);
  }
}

/** 파라미터 외부 변경 => UI 동기화(파라미터 객체 이벤트) */
async function bindParameterChangedListeners(settings) {
  unregisterParamHandlers.forEach((fn) => { try { fn(); } catch (_) {} });
  unregisterParamHandlers = [];

  if (!settings.startParam) return;

  const dash = await getDashboard();
  const params = await dash.getParametersAsync();

  const targets = new Set([settings.startParam]);
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

function bindHandlers() {
  const bar = qs("rangeBar");
  const settingsBtn = qs("settingsBtn");
  const cfgCloseBtn = qs("cfgCloseBtn");
  const cfgSaveBtn = qs("cfgSaveBtn");
  const cfgPanel = qs("cfgPanel");
  const calHost = qs("calHost");

  // bar 클릭 => 달력 토글
  if (bar) {
    const handler = (e) => {
      if (e.target && e.target.id === "settingsBtn") return;
      toggleCalendar();
    };
    bar.onclick = handler;
    bar.onmousedown = handler;
  }

  // 설정 버튼
  if (settingsBtn) {
    settingsBtn.onclick = async (e) => {
      e.stopPropagation();
      await toggleConfigPanel();
    };
  }

  // 내부 클릭 전파 방지
  if (cfgPanel) {
    cfgPanel.onclick = (e) => e.stopPropagation();
    cfgPanel.onmousedown = (e) => e.stopPropagation();
  }
  if (calHost) {
    calHost.onclick = (e) => e.stopPropagation();
    calHost.onmousedown = (e) => e.stopPropagation();
  }

  if (cfgCloseBtn) cfgCloseBtn.onclick = async () => { closeConfigPanelUI(); };
  if (cfgSaveBtn) cfgSaveBtn.onclick = async () => { await saveConfigFromPanel(); };
}

async function render() {
  await setFrameSizeFixed();

  const settings = loadSettings();

  // settings 버튼 표시 제어
  const settingsBtn = qs("settingsBtn");
  if (settingsBtn) settingsBtn.style.display = isAuthoringMode() ? "inline-flex" : "none";

  // viewing이면 설정 패널 닫기
  if (!isAuthoringMode()) closeConfigPanelUI();

  // 설정 미완료 안내
  if (!settings.startParam || (settings.kind === "range" && !settings.endParam)) {
    setHint(isAuthoringMode() ? "⚙ 설정에서 파라미터를 매핑하세요." : "조회기간 설정이 아직 완료되지 않았습니다.");
    setValueTexts("", "");
  } else {
    setHint("");
  }

  initFlatpickr(settings);
  bindHandlers();
  await bindParameterChangedListeners(settings);

  if (settings.startParam) await syncUIWithRetry(settings);
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
