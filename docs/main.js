(function () {
  const app = document.getElementById("app");
  const rangeText = document.getElementById("rangeText");
  const startText = document.getElementById("startText");
  const endText = document.getElementById("endText");
  const statusEl = document.getElementById("status");

  const btnEdit = document.getElementById("btnEdit");
  const btnApply = document.getElementById("btnApply");
  const btnClose = document.getElementById("btnClose");

  let mode = "summary"; // summary | edit
  let selectedStart = null;
  let selectedEnd = null;
  let fp = null;

  function setMode(next) {
    mode = next;
    app.classList.toggle("mode-summary", mode === "summary");
    app.classList.toggle("mode-edit", mode === "edit");
  }

  function fmt(d) {
    if (!d) return "-";
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function renderTexts() {
    startText.textContent = fmt(selectedStart);
    endText.textContent = fmt(selectedEnd);

    if (selectedStart && selectedEnd) {
      rangeText.textContent = `조회기간: ${fmt(selectedStart)} ~ ${fmt(selectedEnd)}`;
    } else if (selectedStart && !selectedEnd) {
      rangeText.textContent = `조회기간: ${fmt(selectedStart)} ~ ${fmt(selectedStart)}`;
    } else {
      rangeText.textContent = `조회기간: -`;
    }
  }

  function setStatus(msg) {
    statusEl.textContent = msg || " ";
  }

  function ensureFlatpickr() {
    if (fp) return;

    const input = document.getElementById("fp");

    fp = flatpickr(input, {
      mode: "range",
      inline: true,
      locale: (window.flatpickr && window.flatpickr.l10ns && window.flatpickr.l10ns.ko) ? "ko" : undefined,
      dateFormat: "Y-m-d",
      defaultDate: [],
      onChange: (dates) => {
        selectedStart = dates[0] || null;
        selectedEnd = dates[1] || null;
        renderTexts();
      }
    });
  }

  async function applyToTableau(start, end) {
    try {
      if (!window.tableau || !tableau.extensions) return;

      if (!tableau.extensions.dashboardContent) {
        await tableau.extensions.initializeAsync();
      }

      const dashboard = tableau.extensions.dashboardContent.dashboard;
      const params = await dashboard.getParametersAsync();

      // ✅ 너 대시보드 파라미터 이름으로 바꿔
      const START_PARAM = "P_시작일";
      const END_PARAM = "P_종료일";

      const pStart = params.find(p => p.name === START_PARAM);
      const pEnd = params.find(p => p.name === END_PARAM);

      const startStr = fmt(start);
      const endStr = fmt(end || start);

      if (pStart) await pStart.changeValueAsync(startStr);
      if (pEnd) await pEnd.changeValueAsync(endStr);

      setStatus(`적용됨: ${startStr} ~ ${endStr}`);
    } catch (e) {
      setStatus(`적용 실패(파라미터/권한 확인): ${String(e).slice(0, 120)}`);
    }
  }

  // 버튼 동작
  btnEdit.addEventListener("click", () => {
    ensureFlatpickr();
    setMode("edit");

    // 편집 진입 시 기존 선택 반영
    if (fp) {
      const ds = [];
      if (selectedStart) ds.push(selectedStart);
      if (selectedEnd) ds.push(selectedEnd);
      if (ds.length) fp.setDate(ds, false);
    }

    setStatus("기간을 선택 후 [적용]하세요.");
  });

  btnClose.addEventListener("click", () => {
    setMode("summary");
    renderTexts();
    setStatus(" ");
  });

  btnApply.addEventListener("click", async () => {
    if (!selectedStart) {
      setStatus("시작일을 먼저 선택하세요.");
      return;
    }
    if (!selectedEnd) selectedEnd = selectedStart;

    renderTexts();
    await applyToTableau(selectedStart, selectedEnd);

    setMode("summary");
  });

  // 초기
  renderTexts();
  setStatus(" ");
  setMode("summary");
})();
