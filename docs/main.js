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
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
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

/** Tableau parameter currentValue -> Date 로 최대한 robust하게 변환 */
function paramCurrentValueToDate(p) {
  if (!p) return null;

  const cv = p.currentValue; // 보통 { value, formattedValue } 형태
  if (!cv) return null;

  const raw = (cv && typeof cv === "object" && "value" in cv) ? cv.value : cv;

  // 이미 Date
  if (raw instanceof Date) return raw;

  // 문자열이면 Date로 파싱 시도 (예: "2026-03-01" 또는 ISO)
  if (typeof raw === "string") {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // 숫자면 epoch로 간주
  if (typeof raw === "number") {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

/** ✅ 핵심: 현재 파라미터 값 읽어서 UI에 표시 */
async function syncUIFromCurrentParameterValues(settings) {
  if (!settings.startParam) {
    setValueTexts(null, null);
    return;
  }

  const map = await getParametersMap();

  const pStart = map.get(settings.startParam);
  const start = paramCurrentValueToDate(pStart);

  let end = null;
  if (settings.kind === "single") {
    end = start;
  } else if (settings.endParam) {
    const pEnd = map.get(settings.endParam);
    end = paramCurrentValueToDate(pEnd);
  }

  setValueTexts(start, end);
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
    setHint("달력 인스턴스가 없습니다(fp=null). main.js 에러 여부 확인 필요.");
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

      // 표시 즉시 업데이트
      setValueTexts(start, end);

      // range는 end 선택 전엔 적용 안 함
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
    setHint("rangeBar를 찾을 수 없습니다. index.html 구조/id 확인 필요.");
    return;
  }

  // 바 클릭 -> 달력
  bar.onclick = (e) => {
    if (e.target && e.target.id === "settingsBtn") return;
    openCalendar();
  };

  // 설정 버튼
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

  // ✅ 여기서 더 이상 null로 고정 초기화하지 않음
  // setValueTexts(null, null);

  if (!settings.startParam || (settings.kind === "range" && !settings.endParam)) {
    setHint(isAuthoringMode() ? "⚙ 설정에서 파라미터를 매핑하세요." : "조회기간 설정이 아직 완료되지 않았습니다.");
    // 설정이 없으면 값은 '-'
    setValueTexts(null, null);
  } else {
    setHint("");
  }

  initFlatpickr(settings);
  bindClickHandlers();

  // ✅ 현재 파라미터 값을 읽어서 UI에 채움
  if (settings.startParam) {
    try {
      await syncUIFromCurrentParameterValues(settings);
    } catch (e) {
      // 값 읽기 실패해도 클릭/달력은 살아있어야 해서 hint만 표시
      setHint(e?.message || String(e));
    }
  }
}

async function init() {
  await tableau.extensions.initializeAsync();

  // 스크립트가 죽으면 바로 힌트에 나오게
  window.addEventListener("error", (e) => {
    setHint(`JS 오류: ${e.message || e.type}`);
  });

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
