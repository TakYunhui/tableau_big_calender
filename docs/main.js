/* global tableau, flatpickr */

const SETTINGS_KEYS = {
  kind: "date_kind", // "range" | "single"
  startParam: "date_start_param",
  endParam: "date_end_param",
  format: "date_format", // flatpickr format (표시용)
};

const DEFAULTS = {
  kind: "range",
  format: "Y-m-d",
};

let fp = null;

function qs(id) {
  return document.getElementById(id);
}

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

function fmtForDisplay(d) {
  // 표시용은 YYYY-MM-DD 고정 (가독성)
  return toISODateOnly(d) || "-";
}

function destroyFP() {
  if (fp) {
    fp.destroy();
    fp = null;
  }
}

function ensureFlatpickrLoaded() {
  if (typeof window.flatpickr === "undefined") {
    setHint("flatpickr 로드 실패: docs/lib/flatpickr.min.js 경로를 확인하세요.");
    return false;
  }
  return true;
}

async function applyDatesToParameters(settings, start, end) {
  const { kind, startParam, endParam } = settings;

  if (!startParam) throw new Error("시작일 파라미터가 설정되지 않았습니다.");
  if (kind === "range" && !endParam) throw new Error("종료일 파라미터가 설정되지 않았습니다.");
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

function setTexts(start, end) {
  const startText = qs("startText");
  const endText = qs("endText");
  if (startText) startText.textContent = fmtForDisplay(start);
  if (endText) endText.textContent = fmtForDisplay(end);
}

function initFlatpickr(settings) {
  destroyFP();
  if (!ensureFlatpickrLoaded()) return;

  const input = qs("fpHidden");
  if (!input) {
    setHint("fpHidden input을 찾을 수 없습니다.");
    return;
  }

  const mode = settings.kind === "single" ? "single" : "range";

  fp = flatpickr(input, {
    mode,
    dateFormat: settings.format || DEFAULTS.format,
    allowInput: false,
    clickOpens: false, // 우리가 영역 클릭으로 열 거라 false
    onOpen: () => setHint(""),
    onChange: async (selectedDates) => {
      // range면 [start,end], single이면 [start]
      const start = selectedDates[0] || null;
      const end = settings.kind === "single" ? start : (selectedDates[1] || null);

      // 텍스트는 선택 즉시 업데이트
      setTexts(start, end);

      // range는 end까지 선택되기 전엔 적용하지 않음
      if (settings.kind === "range" && !end) return;

      try {
        await applyDatesToParameters(settings, start, end);
        setHint(""); // 조용히
      } catch (e) {
        setHint(e?.message || String(e));
      }
    },
  });
}

function openCalendar() {
  if (fp) fp.open();
}

async function openConfigDialog() {
  const url = new URL("config.html", window.location.href).href;
  try {
    await tableau.extensions.ui.displayDialogAsync(url, "", { height: 420, width: 520 });
  } catch (e) {
    // 닫힘도 정상
    console.warn("Config dialog closed or failed:", e);
  }
}

async function render() {
  const settings = loadSettings();

  // 설정 버튼: authoring에서만
  const settingsBtn = qs("settingsBtn");
  if (settingsBtn) settingsBtn.style.display = isAuthoringMode() ? "inline-flex" : "none";

  // settings 미설정이면 안내
  if (!settings.startParam || (settings.kind === "range" && !settings.endParam)) {
    setHint(isAuthoringMode() ? "⚙ 설정에서 파라미터를 매핑하세요." : "조회기간 설정이 아직 완료되지 않았습니다.");
  } else {
    setHint("");
  }

  // flatpickr 초기화
  initFlatpickr(settings);

  // 초기 표시(선택값 없으면 '-')
  setTexts(null, null);
}

async function init() {
  await tableau.extensions.initializeAsync();

  // 클릭 영역 전체 → 달력 오픈
  const bar = qs("rangeBar");
  if (bar) {
    bar.addEventListener("click", (e) => {
      // 설정 버튼 클릭은 달력 오픈 막기
      if (e.target && e.target.id === "settingsBtn") return;
      openCalendar();
    });
    bar.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") openCalendar();
    });
  }

  const settingsBtn = qs("settingsBtn");
  if (settingsBtn) {
    settingsBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await openConfigDialog();
      await render(); // 설정 바뀌면 재렌더
    });
  }

  tableau.extensions.settings.addEventListener(tableau.TableauEventType.SettingsChanged, async () => {
    await render();
  });

  await render();
}

init().catch((e) => {
  console.error(e);
  setHint(e?.message || String(e));
});
