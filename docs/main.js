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
  qs("hint").textContent = msg || "";
}

function isAuthoringMode() {
  // Tableau Extensions API - environment.mode: "authoring" or "viewing"
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
  // dashboardContent.dashboard (extensions dashboard)
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

  // ko locale
  if (flatpickr?.l10ns?.ko) {
    flatpickr.localize(flatpickr.l10ns.ko);
  }

  fpStart = flatpickr(qs("startInput"), {
    dateFormat: format,
    allowInput: true,
  });

  fpEnd = flatpickr(qs("endInput"), {
    dateFormat: format,
    allowInput: true,
  });

  // single 모드면 종료일 숨김
  qs("endRow").style.display = kind === "single" ? "none" : "grid";
}

function getPickedDates(kind) {
  const start = fpStart?.selectedDates?.[0] || null;
  let end = fpEnd?.selectedDates?.[0] || null;

  if (kind === "single") end = start; // 싱글이면 동일값 처리
  return { start, end };
}

function toISODateOnly(d) {
  if (!(d instanceof Date)) return "";
  // 시간은 버리고 YYYY-MM-DD만
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

  // Tableau 파라미터 타입/허용값에 따라 setValueAsync에 Date를 넣어도 되고,
  // 문자열을 넣어도 되는데(설정에 따라), 가장 안전하게 "YYYY-MM-DD" 문자열로 넣음.
  await pStart.changeValueAsync(toISODateOnly(start));

  if (kind === "range") {
    const pEnd = map.get(endParam);
    if (!pEnd) throw new Error(`파라미터를 찾을 수 없습니다: ${endParam}`);
    await pEnd.changeValueAsync(toISODateOnly(end));
  }
}

async function openConfigDialog() {
  const url = new URL("config.html", window.location.href).href;

  try {
    await tableau.extensions.ui.displayDialogAsync(
      url,
      "", // payload 필요 없으면 빈 문자열
      { height: 420, width: 520 }
    );
  } catch (e) {
    // 사용자가 X로 닫는 것도 여기로 떨어질 수 있음(정상 케이스)
    console.warn("Config dialog closed or failed:", e);
  }
}

async function render() {
  const settings = loadSettings();

  // authoring에서만 설정 버튼 노출
  qs("settingsBtn").style.display = isAuthoringMode() ? "inline-flex" : "none";

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

  // 버튼 이벤트
  qs("applyBtn").addEventListener("click", async () => {
    try {
      setHint("");
      const settings = loadSettings();
      await applyToParameters(settings);
      setHint("적용되었습니다.");
    } catch (e) {
      setHint(e?.message || String(e));
    }
  });

  qs("closeBtn").addEventListener("click", () => {
    // 확장 UI를 “닫는다”는 건 실제로는 확장 자체를 숨길 수 없어서
    // 사용자 체감상 안내만: (너가 원하면 여기서 컨테이너 높이 줄이는 방식 등 추가 가능)
    setHint("닫기(표시 유지).");
  });

  qs("settingsBtn").addEventListener("click", async () => {
    await openConfigDialog();
    // 다이얼로그 닫힌 뒤 settings 반영 재렌더
    await render();
  });

  // Configure에서 settings가 바뀌면 자동 반영
  tableau.extensions.settings.addEventListener(tableau.TableauEventType.SettingsChanged, async () => {
    await render();
  });

  await render();
}

init().catch((e) => {
  console.error(e);
  setHint(e?.message || String(e));
});
