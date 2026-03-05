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

  let mode = "summary"; // summary | edit

  let fp = null;
  let selectedStart = null;
  let selectedEnd = null;

  // tableau context
  let dashboard = null;
  let dashboardKey = "unknown";
  let allParams = [];
  let dateParams = [];

  // mapping (per dashboard)
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

  // -------- Date helpers (UTC safe) --------
  function toUTCDateLikeLocalDate(dLocal) {
    // dLocal의 Y/M/D를 그대로 UTC Date로 만든다
    if (!dLocal) return null;
    return new Date(Date.UTC(dLocal.getFullYear(), dLocal.getMonth(), dLocal.getDate()));
  }

  function valueToLocalDate(paramCurrentValue) {
    // Parameter.currentValue: DataValue (value가 Date일 수도, string일 수도)
    // 안전하게 Date로 변환
    if (!paramCurrentValue) return null;
    const v = paramCurrentValue.value;

    if (v instanceof Date) {
      // Tableau가 Date를 주는 경우: UTC 기준일 수 있으니 local로 "날짜만" 맞춤
      return new Date(v.getFullYear(), v.getMonth(), v.getDate());
    }

    if (typeof v === "string") {
      // "YYYY-MM-DD" 혹은 ISO 형태 대응
      const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      const dd = new Date(v);
      if (!isNaN(dd.getTime())) return new Date(dd.getFullYear(), dd.getMonth(), dd.getDate());
    }

    return null;
  }

  // -------- Tableau: init & parameter discovery --------
  async function initTableau() {
    if (!window.tableau || !tableau.extensions) {
      setStatus("Tableau Extensions API를 찾을 수 없습니다.");
      return;
    }

    await tableau.extensions.initializeAsync();

    dashboard = tableau.extensions.dashboardContent.dashboard;
    const dname = dashboard?.name || "대시보드";
    // 대시보드별 저장 키 (이름 기반)
    dashboardKey = `dash_${dname}`;

    cfgDashName.textContent = dname;

    allParams = await dashboard.getParametersAsync();
    dateParams = (allParams || []).filter(p => {
      const t = String(p.dataType || "").toLowerCase();
      return t.includes("date"); // date or date-time
    });

    await loadMappingFromSettings();

    // 매핑이 없으면 자동 추천만 해두고, 상태에 안내
    if (!mapStartName && dateParams.length > 0) {
      const guess = guessMapping(dateParams);
      mapStartName = guess.start || "";
      mapEndName = guess.end || "";
      mapSingle = !mapEndName; // end가 없으면 단일로
      setStatus("날짜 파라미터 매핑이 없습니다. [설정]에서 저장하세요.");
    } else {
      setStatus(" ");
    }

    // 매핑된 파라미터의 현재값을 읽어서 초기 조회기간 표시
    await syncSelectedFromParameterValues();
    renderTexts();
  }

  function guessMapping(params) {
    // 이름 기반 휴리스틱: 시작/종료 키워드
    const startKeys = ["start", "from", "begin", "시작", "조회시작", "시작일"];
    const endKeys = ["end", "to", "finish", "종료", "조회종료", "종료일"];

    const score = (name, keys) => {
      const n = String(name || "").toLowerCase();
      let s = 0;
      keys.forEach(k => {
        const kk = k.toLowerCase();
        if (n.includes(kk)) s += 10;
      });
      return s;
    };

    let bestStart = null;
    let bestEnd = null;
    let bestStartScore = -1;
    let bestEndScore = -1;

    params.forEach(p => {
      const s = score(p.name, startKeys);
      const e = score(p.name, endKeys);
      if (s > bestStartScore) { bestStartScore = s; bestStart = p; }
      if (e > bestEndScore) { bestEndScore = e; bestEnd = p; }
    });

    // 같은 파라미터가 start/end로 동시에 뽑히면 end를 비움(단일로 처리)
    if (bestStart && bestEnd && bestStart.name === bestEnd.name) {
      return { start: bestStart.name, end: "" };
    }

    // 키워드 점수가 너무 낮으면: 2개 이상이면 0/1로
    if (bestStartScore <= 0 && params.length >= 1) bestStart = params[0];
    if (bestEndScore <= 0 && params.length >= 2) bestEnd = params[1];

    return { start: bestStart?.name || "", end: bestEnd?.name || "" };
  }

  function settingKey(k) {
    // 대시보드별 키
    return `${dashboardKey}__${k}`;
  }

  async function loadMappingFromSettings() {
    try {
      const s = tableau.extensions.settings;
      mapStartName = s.get(settingKey("startParam")) || "";
      mapEndName = s.get(settingKey("endParam")) || "";
      mapSingle = (s.get(settingKey("single")) || "0") === "1";
    } catch (e) {
      // settings 접근 실패해도 UI는 동작하게
      mapStartName = "";
      mapEndName = "";
      mapSingle = false;
    }
  }

  async function saveMappingToSettings() {
    const start = selStart.value || "";
    const end = selEnd.value || "";
    const single = chkSingle.checked;

    // 단일이면 end를 비움
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

    const startLocal = valueToLocalDate(pStart.currentValue);
    const endLocal = pEnd ? valueToLocalDate(pEnd.currentValue) : startLocal;

    selectedStart = startLocal || selectedStart;
    selectedEnd = endLocal || selectedEnd;

    // 달력이 이미 생성돼 있으면 캘린더에도 반영
    if (fp && selectedStart) {
      fp.setDate(
        selectedEnd ? [selectedStart, selectedEnd] : [selectedStart],
        false
      );
    }
  }

  // -------- flatpickr --------
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

  // -------- apply --------
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

    // 단일 or 종료 미선택이면 시작=종료 처리
    if (mapSingle || !selectedEnd) selectedEnd = selectedStart;

    try {
      // Date 파라미터는 UTC Date 객체가 기대됨(안전) :contentReference[oaicite:2]{index=2}
      const startUTC = toUTCDateLikeLocalDate(selectedStart);
      const endUTC = toUTCDateLikeLocalDate(selectedEnd);

      await pStart.changeValueAsync(startUTC);
      if (pEnd) await pEnd.changeValueAsync(endUTC);

      setStatus(`적용됨: ${fmtYMD(selectedStart)} ~ ${fmtYMD(selectedEnd)}`);
    } catch (e) {
      setStatus(`적용 실패: ${String(e).slice(0, 120)}`);
    }
  }

  // -------- config UI --------
  function openConfig() {
    // 옵션 채우기
    const opts = [{ value: "", label: "선택 안 함" }]
      .concat(dateParams.map(p => ({ value: p.name, label: p.name })));

    fillSelect(selStart, opts);
    fillSelect(selEnd, opts);

    // 현재 매핑 반영
    selStart.value = mapStartName || "";
    selEnd.value = mapEndName || "";
    chkSingle.checked = !!mapSingle;

    // 단일이면 end 비활성
    selEnd.disabled = chkSingle.checked;

    // 힌트
    if (dateParams.length === 0) {
      cfgHint.innerHTML = "• 날짜/날짜시간 파라미터가 없습니다.<br/>• 대시보드에 Date/Date-Time 파라미터를 먼저 만들어야 합니다.";
    } else {
      cfgHint.innerHTML = "• 날짜/날짜시간 파라미터만 표시됩니다.<br/>• 저장하면 이 대시보드에서만 매핑이 유지됩니다.";
    }

    cfgModal.style.display = "block";
  }

  function closeConfig() {
    cfgModal.style.display = "none";
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

  // -------- calendar mode buttons --------
  btnEdit.addEventListener("click", async () => {
    // 매핑 없으면 설정 유도
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

  // -------- boot --------
  renderTexts();
  setStatus("초기화 중...");

  initTableau()
    .then(() => {
      // 매핑이 있으면 바로 조회기간 표시
      setStatus(mapStartName ? " " : "날짜 파라미터 매핑이 필요합니다. [설정]을 누르세요.");
    })
    .catch((e) => {
      setStatus(`초기화 실패: ${String(e).slice(0, 120)}`);
    });

})();
