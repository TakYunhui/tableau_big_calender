/* global tableau, flatpickr */

const SETTINGS_KEYS = {
  kind: "date_kind", // "range" | "single"
  startParam: "date_start_param",
  endParam: "date_end_param",
  format: "date_format", // flatpickr format
};

const DEFAULTS = {
  kind: "range",
  format: "Y-m-d",
};

let fpStart = null;
let fpEnd = null;

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

  const kind = s.get(SETTINGS_KEYS.kind) || DEFAULTS.kind;
  const startParam = s.get(SETTINGS_KEYS.startParam) || "";
  const endParam = s.get(SETTINGS_KEYS.endParam) || "";
  const format = s.get(SETTINGS_KEYS.format) || DEFAULTS.format;

  return { kind, startParam, endParam, format };
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

function destroyFlatpickr() {
  if (fpStart) {
    fpStart.destroy();
    fpStart = null;
  }
  if (fpEnd) {
    fpEnd.destroy();
    fpEnd = null;
  }
}

function initFlatpickrUI({ kind, format }) {
  destroyFlatpickr();

  // flatpickr 로드 실패 방어
  if (typeof window.flatpickr === "undefined") {
    setHint("flatpickr 로드 실패(스크립트 경로 404 가능).");
    return;
  }

  // ko locale (ko.js를 넣은 경우만 동작)
  if (flatpickr?.l10ns?.ko) {
    flatpickr.localize(flatpickr.l10ns.ko);
  }

  const startEl = qs("startInput");
  const endEl = qs("endInput");
  const endRow = qs("endRow");

  if (!startEl || !endEl || !endRow) {
    setHint("필수 UI 엘리먼트를 찾을 수 없습니다. (startInput/endInput/endRow)");
    return;
  }

  fpStart = flatpickr(startEl, {
    dateFormat: format,
    allowInput: true,
  });

  fpEnd = flatpickr(endEl, {
    dateFormat: format,
    allowInput: true,
  });

  // single 모드면 종료일 숨김
  endRow.style.display = kind === "single" ? "none" : "grid";
}

function getPickedDates(kind) {
  const start = fpStart?.selectedDates?.[0] || null;
  let end = fpEnd?.selectedDates?.[0] || null;

  if (kind === "single") end = start;
  return { start, end };
}

function toISODateOnly(d) {
  if (!(d instanceof Date)) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isDateLikeType(paramObj) {
  const t = (paramObj?.dataType || paramObj?.parameterType || paramObj?.type || "")
    .toString()
    .toLowerCase();
  // 데이터 타입 문자열을 못 얻으면(공백) 여기선 판단 불가 -> true로 통과(운영 편의)
  if (!t) return true;
  return t.includes("date"); // date/datetime 둘 다 포함됨
}

async function applyToParameters({ kind, startParam, endParam }) {
  const { start, end } = getPickedDates(kind);

  if (!startParam) throw new Error("시작일 파라미터가 설정되지 않았습니다.");
  if (kind === "range" && !endParam) throw new Error("종료일 파라미터가 설정되지 않았습니다.");
  if (!start) throw new Error("시작일을 선택하세요.");
  if (kind === "range" && !end) throw new Error("종료일을 선택하세요.");

  const map = await getParametersMap();

  const pStart = map.get(startParam);
  if (!pStart) throw new Error(`파라미터를 찾을 수 없습니다: ${startParam}`);
  if (!isDateLikeType(pStart)) throw new Error(`시작일 파라미터가 날짜 타입이 아닙니다: ${startParam}`);

  await pStart.changeValueAsync(toISODateOnly(start));

  if (kind === "range") {
    const pEnd = map.get(endParam);
    if (!pEnd) throw new Error(`파라미터를 찾을 수 없습니다: ${endParam}`);
    if (!isDateLikeType(pEnd)) throw new Error(`종료일 파라미터가 날짜 타입이 아닙니다: ${endParam}`);

    await pEnd.changeValueAsync(toISODateOnly(end));
  }
}

async function openConfigDialog() {
  const url = new URL("config.html", window.location.href).href;

  try {
    await tableau.extensions.ui.displayDialogAsync(url, "", { height: 420, width: 520 });
  } catch (e) {
    // 사용자가 닫는 것도 정상 케이스로 취급
    console.warn("Config dialog closed or failed:", e);
  }
}

async function render() {
  const settings = loadSettings();

  const settingsBtn = qs("settingsBtn");
  if (settingsBtn) {
    settingsBtn.style.display = isAuthoringMode() ? "inline-flex" : "none";
  }

  initFlatpickrUI(settings);

  // 힌트: 설정 안 했을 때만 안내
  if (!settings.startParam || (settings.kind === "range" && !settings.endParam)) {
    setHint(isAuthoringMode() ? "⚙ 설정에서 파라미터를 매핑하세요." : "관리자가 조회기간 설정을 점검 중입니다.");
  } else {
    setHint("");
  }
}

async function init() {
  await tableau.extensions.initializeAsync();

  const applyBtn = qs("applyBtn");
  const closeBtn = qs("closeBtn");
  const settingsBtn = qs("settingsBtn");

  if (applyBtn) {
    applyBtn.addEventListener("click", async () => {
      try {
        setHint("");
        const settings = loadSettings();
        await applyToParameters(settings);
        setHint("적용되었습니다.");
      } catch (e) {
        setHint(e?.message || String(e));
      }
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      setHint("닫기(표시 유지).");
    });
  }

  if (settingsBtn) {
    settingsBtn.addEventListener("click", async () => {
      await openConfigDialog();
      await render();
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
