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

// UI 사이즈
const FRAME_WIDTH = 480;
const FRAME_HEIGHT_COLLAPSED = 60;
const FRAME_HEIGHT_EXPANDED = 330; // 달력 보이는 높이

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

  // epoch ms로 보이면
  if (n > 10_000_000_000) {
    const d = new Date(n);
    return Number.isNaN(d.getTime()) ? String(n) : toISODateOnly(d);
  }

  // serial day(1899-12-30 기준) 추정
  const base = new Date(Date.UTC(1899, 11, 30));
  const d = new Date(base.getTime() + n * 24 * 60 * 60 * 1000);
  return Number.isNaN(d.getTime()) ? String(n) : toISODateOnly(d);
}

/** Tableau currentValue -> 표시 문자열 (Cloud 대응) */
function getParamDisplay(p) {
  if (!p || !p.currentValue) return "";

  const cv = p.currentValue;

  // 1) formattedValue 우선
  if (typeof cv.formattedValue === "string") {
    const fv = cv.formattedValue.trim();
    if (fv !== "" && fv !== "0") return fv;
  }

  // 2) raw value fallback
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

/** Tableau 확장 프레임 크기 조절 (환경별 함수명 차이 대응) */
async function setFrameSize(width, height) {
  try {
    if (tableau?.extensions?.ui?.setFrameSizeAsync) {
      await tableau.extensions.ui.setFrameSizeAsync(width, height);
      return;
    }
    if (tableau?.extensions?.ui?.resizeAsync) {
      await tableau.extensions.ui.resizeAsync(width, height);
      return;
    }
    // 함수가 없으면 그냥 무시 (일부 환경)
  } catch (e) {
    console.warn("setFrameSize failed:", e);
  }
}

async function expandForCalendar() {
  await setFrameSize(FRAME_WIDTH, FRAME_HEIGHT_EXPANDED);
}

async function collapseAfterCalendar() {
  await setFrameSize(FRAME_WIDTH, FRAME_HEIGHT_COLLAPSED);
}

function openCalendar() {
  if (!fp) {
    setHint("달력 인스턴스가 없습니다(fp=null). 설정/초기화 상태 확인 필요");
    return;
  }
  // 프레임 확장 후 열기(잘림 방지)
  expandForCalendar().finally(() => {
    // iFrame 리사이즈 직후 바로 open이 씹히는 케이스 방어
    setTimeout(() => fp.open(), 0);
  });
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

/** 현재 파라미터 값 -> UI 반영 (동기화) */
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

/** Cloud에서 currentValue가 늦게 잡히는 케이스 재시도 */
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

    onClose: () => {
      // 닫히면 프레임 다시 줄이기
      collapseAfterCalendar();
    },

    onChange: async (selectedDates) => {
      const start = selectedDates[0] || null;
      const end = settings.kind === "single" ? start : (selectedDates[1] || null);

      // UI 즉시
      setValueTexts(start ? toISODateOnly(start) : "-", end ? toISODateOnly(end) : "-");

      // range는 end 선택 전엔 적용 안 함
      if (settings.kind === "range" && !end) return;

      try {
        await applyDatesToParameters(settings, start, end);
        setHint("");
        // 적용 후 현재값 재동기화(서버 반영/형식 맞추기)
        await syncUIWithRetry(settings, 4, 150);
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
    setHint("rangeBar를 찾을 수 없습니다. index.html 구조/id 확인 필요");
    return;
  }

  const handler = (e) => {
    if (e.target && e.target.id === "settingsBtn") return;
    openCalendar();
  };

  // click만 가끔 씹히는 환경 방어
  bar.onclick = handler;
  bar.onmousedown = handler;

  if (settingsBtn) {
    settingsBtn.onclick = async (e) => {
      e.stopPropagation();
      await openConfigDialog();
      await render();
    };
  }
}

/** 파라미터가 외부에서 바뀌면 UI도 따라가도록 이벤트 구독 */
function bindParameterChangedListener() {
  const dash = tableau.extensions.dashboardContent.dashboard;

  // 중복 등록 방지 위해 한번만(간단히 flag 사용)
  if (bindParameterChangedListener._bound) return;
  bindParameterChangedListener._bound = true;

  dash.addEventListener(tableau.TableauEventType.ParameterChanged, async () => {
    const settings = loadSettings();
    if (!settings.startParam) return;
    await syncUIWithRetry(settings, 6, 200);
  });
}

async function render() {
  const settings = loadSettings();

  const settingsBtn = qs("settingsBtn");
  if (settingsBtn) settingsBtn.style.display = isAuthoringMode() ? "inline-flex" : "none";

  if (!settings.startParam || (settings.kind === "range" && !settings.endParam)) {
    setHint(isAuthoringMode() ? "⚙ 설정에서 파라미터를 매핑하세요." : "조회기간 설정이 아직 완료되지 않았습니다.");
    setValueTexts("", "");
  } else {
    setHint("");
  }

  initFlatpickr(settings);
  bindClickHandlers();
  bindParameterChangedListener();

  // 초기 값 동기화
  if (settings.startParam) {
    await syncUIWithRetry(settings);
  }

  // 기본 프레임 높이(달력 닫힌 상태)
  await setFrameSize(FRAME_WIDTH, FRAME_HEIGHT_COLLAPSED);
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
