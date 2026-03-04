/* app.js */

const DEFAULT_CONFIG = {
  mode: "range",               // "range" | "single"
  paramStartName: "조회시작일",
  paramEndName: "조회종료일",
  dateFormat: "Y-m-d",
};

let cfg = { ...DEFAULT_CONFIG };
let fp = null;

let startDate = null;
let endDate = null;

function pad2(n){ return String(n).padStart(2, "0"); }
function fmtDate(d){
  if(!d) return "-";
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function setStatus(msg){
  document.getElementById("statusText").textContent = msg || "";
}

function renderSummary(){
  const rangeText = document.getElementById("rangeText");
  if (cfg.mode === "single") {
    rangeText.textContent = startDate ? fmtDate(startDate) : "-";
  } else {
    const s = startDate ? fmtDate(startDate) : "-";
    const e = endDate ? fmtDate(endDate) : "-";
    rangeText.textContent = `${s} ~ ${e}`;
  }
}

function renderSide(){
  document.getElementById("startText").textContent = fmtDate(startDate);
  document.getElementById("endText").textContent = (cfg.mode === "single") ? "-" : fmtDate(endDate);
}

function openEditor(){
  const app = document.getElementById("app");
  app.classList.remove("mode-summary");
  app.classList.add("mode-edit");
  setStatus("");
}

function closeEditor(){
  const app = document.getElementById("app");
  app.classList.remove("mode-edit");
  app.classList.add("mode-summary");
  renderSummary(); // 닫힐 때 조회기간 다시 표시
}

/**
 * Tableau 파라미터 적용
 */
async function applyToTableau(){
  if (!window.tableau || !tableau.extensions || !tableau.extensions.dashboardContent) {
    setStatus("Tableau 연결 없음(로컬 테스트)");
    return;
  }

  const dashboard = tableau.extensions.dashboardContent.dashboard;
  const params = await dashboard.getParametersAsync();

  const findParam = (name) => params.find(p => p.name === name);

  const pStart = findParam(cfg.paramStartName);
  const pEnd   = (cfg.mode === "single") ? null : findParam(cfg.paramEndName);

  if (!pStart) throw new Error(`시작 파라미터 없음: ${cfg.paramStartName}`);
  if (cfg.mode !== "single" && !pEnd) throw new Error(`종료 파라미터 없음: ${cfg.paramEndName}`);

  if (!startDate) throw new Error("시작일이 선택되지 않았습니다.");
  if (cfg.mode !== "single" && !endDate) throw new Error("종료일이 선택되지 않았습니다.");

  await pStart.changeValueAsync(fmtDate(startDate));
  if (cfg.mode !== "single") {
    await pEnd.changeValueAsync(fmtDate(endDate));
  }
}

/**
 * ✅ “닫기 기능 추가”
 * - 너가 말한 팝오버/다이얼로그가 tableau displayDialogAsync 기반이면 closeDialog가 맞고
 * - 인라인이면 closeEditor로 충분
 * 여기서는 둘 다 안전하게 처리.
 */
function closeTableauDialogIfAny(){
  try {
    if (tableau?.extensions?.ui?.closeDialog) {
      tableau.extensions.ui.closeDialog("applied");
    }
  } catch (_) {
    // ignore
  }
}

function initFlatpickr(){
  const ko = (window.flatpickr && flatpickr.l10ns && flatpickr.l10ns.ko) ? flatpickr.l10ns.ko : undefined;

  // 기존 인스턴스가 있으면 제거
  if (fp) {
    fp.destroy();
    fp = null;
  }

  fp = flatpickr("#fp", {
    mode: (cfg.mode === "single") ? "single" : "range",
    inline: true,
    showMonths: 1,
    dateFormat: cfg.dateFormat,
    locale: ko,
    defaultDate: (cfg.mode === "single")
      ? (startDate ? [startDate] : null)
      : ((startDate && endDate) ? [startDate, endDate] : null),
    onChange: (selectedDates) => {
      if (cfg.mode === "single") {
        startDate = selectedDates[0] || null;
        endDate = null;
      } else {
        startDate = selectedDates[0] || null;
        endDate   = selectedDates[1] || null;
      }
      renderSide();
    }
  });
}

function bindEvents(){
  document.getElementById("btnEdit").addEventListener("click", openEditor);

  document.getElementById("btnClose").addEventListener("click", () => {
    closeEditor();
    setStatus("");
  });

  document.getElementById("btnApply").addEventListener("click", async () => {
    try {
      setStatus("적용 중...");
      await applyToTableau();

      // ✅ 적용 완료 후: 편집 화면 닫고(조회기간 다시 표시)
      closeEditor();
      setStatus("적용 완료");

      // ✅ tableau 다이얼로그/팝오버로 띄운 구성이라면 자동 닫기
      closeTableauDialogIfAny();
    } catch (e) {
      setStatus(String(e?.message || e));
    }
  });
}

async function bootstrap(){
  bindEvents();

  // 초기값: 오늘~오늘
  const today = new Date();
  startDate = today;
  endDate = (cfg.mode === "single") ? null : today;

  renderSummary();
  renderSide();
  initFlatpickr();

  // Tableau 초기화는 가능하면 시도
  try {
    if (window.tableau && tableau.extensions) {
      await tableau.extensions.initializeAsync();
      setStatus("");
    }
  } catch (_) {
    setStatus("Tableau 초기화 실패(로컬 테스트일 수 있음)");
  }
}

bootstrap();
