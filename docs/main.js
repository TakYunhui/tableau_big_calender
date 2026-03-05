(function () {
  const app = document.getElementById("app");
  const rangeText = document.getElementById("rangeText");
  const startText = document.getElementById("startText");
  const endText = document.getElementById("endText");
  const statusEl = document.getElementById("status");

  const btnEdit = document.getElementById("btnEdit");
  const btnApply = document.getElementById("btnApply");
  const btnClose = document.getElementById("btnClose");

  // ----------------------------
  // 0) 대시보드 배경색 맞추기(눈속임 품질 핵심)
  //   - URL: .../index.html?bg=#F4F4F4
  // ----------------------------
  try {
    const params = new URLSearchParams(location.search);
    const bg = params.get("bg");
    if (bg) {
      document.documentElement.style.setProperty("--dash-bg", decodeURIComponent(bg));
      document.body.style.background = "transparent"; // body 투명 유지
    }
  } catch (_) {}

  // ----------------------------
  // 1) 상태/모드
  // ----------------------------
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

  // ----------------------------
  // 2) flatpickr (inline range)
  // ----------------------------
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
        // range: [start, end]
        selectedStart = dates[0] || null;
        selectedEnd = dates[1] || null;

        // end가 아직 없으면 start로 임시 표기(사용자 혼란 방지)
        renderTexts();
      }
    });
  }

  // ----------------------------
  // 3) Tableau 파라미터 적용 (있으면 적용, 없으면 무시)
  //    - 네 기존 코드에서 파라미터 이름만 맞춰서 연결하면 됨
  // ----------------------------
  async function applyToTableau(start, end) {
    try {
      if (!window.tableau || !tableau.extensions) return;

      // 초기화 안 됐으면 시도
      if (!tableau.extensions.dashboardContent) {
        await tableau.extensions.initializeAsync();
      }

      const dashboard = tableau.extensions.dashboardContent.dashboard;
      const params = await dashboard.getParametersAsync();

      // ✅ 여기 파라미터 이름을 네 환경에 맞춰 바꿔
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
      // Tableau 환경/권한/파라미터명 불일치 등
      setStatus(`적용 실패(파라미터/권한 확인): ${String(e).slice(0, 120)}`);
    }
  }

  // ----------------------------
  // 4) 버튼 동작
  // ----------------------------
  btnEdit.addEventListener("click", () => {
    ensureFlatpickr();
    setMode("edit");

    // 편집 진입 시 기존 선택이 있으면 캘린더에도 반영
    if (fp) {
      const ds = [];
      if (selectedStart) ds.push(selectedStart);
      if (selectedEnd) ds.push(selectedEnd);
      if (ds.length) fp.setDate(ds, false);
    }

    setStatus("기간을 선택 후 [적용]하세요.");
  });

  btnClose.addEventListener("click", () => {
    // 취소: 선택 유지할지/롤백할지 결정 가능. 지금은 유지.
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

  // ----------------------------
  // 5) 초기 렌더
  // ----------------------------
  renderTexts();
  setStatus(" ");
  setMode("summary");
})();
