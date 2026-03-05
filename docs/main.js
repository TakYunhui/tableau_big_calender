(function () {
  const app = document.getElementById("app");

  const rangeText = document.getElementById("rangeText");
  const startText = document.getElementById("startText");
  const endText = document.getElementById("endText");
  const statusEl = document.getElementById("status");

  const btnSettings = document.getElementById("btnSettings");
  const btnEdit = document.getElementById("btnEdit");
  const btnApply = document.getElementById("btnApply");
  const btnClose = document.getElementById("btnClose");

  const cfgModal = document.getElementById("cfgModal");
  const cfgDashName = document.getElementById("cfgDashName");
  const selStart = document.getElementById("selStart");
  const selEnd = document.getElementById("selEnd");
  const chkSingle = document.getElementById("chkSingle");
  const btnCfgCancel = document.getElementById("btnCfgCancel");
  const btnCfgSave = document.getElementById("btnCfgSave");
  const cfgHint = document.getElementById("cfgHint");

  let mode = "summary";

  let fp = null;
  let selectedStart = null;
  let selectedEnd = null;

  let dashboard = null;
  let dashboardKey = "unknown";

  let allParams = [];
  let candidateParams = [];

  let mapStartName = "";
  let mapEndName = "";
  let mapSingle = false;

  function setMode(next) {
    mode = next;
    app.classList.toggle("mode-summary", mode === "summary");
    app.classList.toggle("mode-edit", mode === "edit");
  }

  function setStatus(msg) {
    statusEl.textContent = msg || " ";
  }

  function fmtYMD(d) {
    if (!d) return "-";
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function renderTexts() {
    startText.textContent = fmtYMD(selectedStart);
    endText.textContent = fmtYMD(selectedEnd);

    if (selectedStart && selectedEnd) {
      rangeText.textContent = `조회기간: ${fmtYMD(selectedStart)} ~ ${fmtYMD(selectedEnd)}`;
    } else if (selectedStart && !selectedEnd) {
      rangeText.textContent = `조회기간: ${fmtYMD(selectedStart)} ~ ${fmtYMD(selectedStart)}`;
    } else {
      rangeText.textContent = `조회기간: -`;
    }
  }

  function toUTCDateLikeLocalDate(dLocal) {
    if (!dLocal) return null;
    return new Date(Date.UTC(dLocal.getFullYear(), dLocal.getMonth(), dLocal.getDate()));
  }

  function tryParseToLocalDate(v) {
    if (v == null) return null;

    if (v instanceof Date && !isNaN(v.getTime())) {
      return new Date(v.getFullYear(), v.getMonth(), v.getDate());
    }

    if (typeof v === "string") {
      const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      const d = new Date(v);
      if (!isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }

    return null;
  }

  function getAllowableType(p) {
    return p?.allowableValues?.type || "unknown";
  }

  function isDateCandidate(p) {
    const dt = String(p?.dataType || "").toLowerCase();
    if (dt === "date" || dt === "date-time" || dt === "datetime" || dt.includes("date")) return true;

    const cv = p?.currentValue?.value;
    if (tryParseToLocalDate(cv)) return true;

    const av = p?.allowableValues;
    if (av?.type === "list" && Array.isArray(av.values) && av.values.length > 0) {
      const first = av.values[0]?.value ?? av.values[0];
      if (tryParseToLocalDate(first)) return true;
    }
    if (av?.type === "range" && av.min && av.max) {
      const minV = av.min?.value ?? av.min;
      const maxV = av.max?.value ?? av.max;
      if (tryParseToLocalDate(minV) || tryParseToLocalDate(maxV)) return true;
    }

    return false;
  }

  function settingKey(k) {
    return `${dashboardKey}__${k}`;
  }

  async function loadMappingFromSettings() {
    try {
      const s = tableau.extensions.settings;
      mapStartName = s.get(settingKey("startParam")) || "";
      mapEndName = s.get(settingKey("endParam")) || "";
      mapSingle = (s.get(settingKey("single")) || "0") === "1";
    } catch (_) {
      mapStartName = "";
      mapEndName = "";
      mapSingle = false;
    }
  }

  async function saveMappingToSettings() {
    const start = selStart.value || "";
    const end = selEnd.value || "";
    const single = chkSingle.checked;

    mapStartName = start;
    mapEndName = single ? "" : end;
    mapSingle = single;

    try {
      const s = tableau.extensions.settings;
      s.set(settingKey("startParam"), mapStartName);
      s.set(settingKey("endParam"), mapEndName);
      s.set(settingKey("single"), mapSingle ? "1" : "0");
      await s.saveAsync();
      setStatus("설정 저장 완료");
    } catch (e) {
      setStatus("설정 저장 실패(권한/환경 확인)");
    }
  }

  function getParamByName(name) {
    if (!name) return null;
    return (allParams || []).find(p => p.name === name) || null;
  }

  async function syncSelectedFromParameterValues() {
    const pStart = getParamByName(mapStartName);
    const pEnd = mapSingle ? null : getParamByName(mapEndName);

    if (!pStart) return;

    const startLocal = tryParseToLocalDate(pStart.currentValue?.value);
    const endLocal = pEnd ? tryParseToLocalDate(pEnd.currentValue?.value) : startLocal;

    if (startLocal) selectedStart = startLocal;
    if (endLocal) selectedEnd = endLocal;

    if (fp && selectedStart) {
      fp.setDate(selectedEnd ? [selectedStart, selectedEnd] : [selectedStart], false);
    }
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

  async function applyToTableau() {
    const pStart = getParamByName(mapStartName);
    const pEnd = mapSingle ? null : getParamByName(mapEndName);

    if (!pStart) {
      setStatus("시작일 파라미터 매핑이 없습니다. [설정]에서 지정하세요.");
      return;
    }
    if (!selectedStart) {
      setStatus("시작일을 먼저 선택하세요.");
      return;
    }
    if (mapSingle || !selectedEnd) selectedEnd = selectedStart;

    try {
      const startUTC = toUTCDateLikeLocalDate(selectedStart);
      const endUTC = toUTCDateLikeLocalDate(selectedEnd);

      await pStart.changeValueAsync(startUTC);
      if (pEnd) await pEnd.changeValueAsync(endUTC);

      setStatus(`적용됨: ${fmtYMD(selectedStart)} ~ ${fmtYMD(selectedEnd)}`);
    } catch (e) {
      setStatus(`적용 실패: ${String(e).slice(0, 120)}`);
    }
  }

  function fillSelect(sel, options) {
    sel.innerHTML = "";
    options.forEach(o => {
      const op = document.createElement("option");
      op.value = o.value;
      op.textContent = o.label;
      sel.appendChild(op);
    });
  }

  function openConfig() {
    const opts = [{ value: "", label: "선택 안 함" }].concat(
      candidateParams.map(p => {
        const dt = String(p.dataType || "unknown");
        const at = getAllowableType(p);
        return { value: p.name, label: `${p.name}  (${dt}, ${at})` };
      })
    );

    fillSelect(selStart, opts);
    fillSelect(selEnd, opts);

    selStart.value = mapStartName || "";
    selEnd.value = mapEndName || "";
    chkSingle.checked = !!mapSingle;

    selEnd.disabled = chkSingle.checked;
    if (chkSingle.checked) selEnd.value = "";

    if ((allParams || []).length === 0) {
      cfgHint.innerHTML =
        "• 파라미터를 찾지 못했습니다.<br/>" +
        "• 이 메시지가 뜨면: (1) Tableau 안이 아닌 곳에서 열었거나, (2) Extensions API 스크립트 로드가 실패했거나, (3) 대시보드에 실제 파라미터가 없는 상태입니다.";
    } else {
      cfgHint.innerHTML = `• 전체 파라미터 ${allParams.length}개 중 날짜 후보 ${candidateParams.length}개 표시 중.`;
    }

    cfgModal.style.display = "block";
  }

  function closeConfig() {
    cfgModal.style.display = "none";
  }

  chkSingle.addEventListener("change", () => {
    selEnd.disabled = chkSingle.checked;
    if (chkSingle.checked) selEnd.value = "";
  });

  btnSettings.addEventListener("click", () => openConfig());
  btnCfgCancel.addEventListener("click", () => closeConfig());

  btnCfgSave.addEventListener("click", async () => {
    await saveMappingToSettings();
    closeConfig();
    await syncSelectedFromParameterValues();
    renderTexts();
  });

  btnEdit.addEventListener("click", async () => {
    if (!mapStartName) {
      openConfig();
      setStatus("먼저 [설정]에서 시작/종료 파라미터를 지정하세요.");
      return;
    }
    ensureFlatpickr();
    setMode("edit");

    await syncSelectedFromParameterValues();
    renderTexts();
    setStatus("기간을 선택 후 [적용]하세요.");
  });

  btnClose.addEventListener("click", () => {
    setMode("summary");
    setStatus(" ");
  });

  btnApply.addEventListener("click", async () => {
    await applyToTableau();
    setMode("summary");
  });

  async function initTableau() {
    // ✅ Extensions API 로드 실패 / Tableau 밖에서 열린 경우
    if (!window.tableau || !window.tableau.extensions) {
      setStatus("Tableau 안에서 열리지 않았거나 Extensions API 스크립트가 로드되지 않았습니다.");
      return;
    }

    await tableau.extensions.initializeAsync();
    dashboard = tableau.extensions.dashboardContent.dashboard;

    const dname = dashboard?.name || "대시보드";
    dashboardKey = `dash_${dname}`;
    cfgDashName.textContent = dname;

    allParams = await dashboard.getParametersAsync();
    candidateParams = (allParams || []).filter(isDateCandidate);

    await loadMappingFromSettings();
    await syncSelectedFromParameterValues();
    renderTexts();

    setStatus(`대시보드: ${dname} / 파라미터: ${(allParams || []).length}개`);
  }

  renderTexts();
  setStatus("초기화 중...");
  initTableau().catch(e => setStatus(`초기화 실패: ${String(e).slice(0, 120)}`));
})();
