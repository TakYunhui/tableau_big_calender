const CONFIG = {
  PARAM_START: "pStartDate",
  PARAM_END: "pEndDate",
  DEFAULT_PRESET: "last30",
  AUTO_APPLY_DEFAULT: false
};

let fp = null;
let tableauReady = false;
let dashboard = null;
let paramStart = null;
let paramEnd = null;

let mode = "range"; // range | editStart | editEnd
let startDate = null;
let endDate = null;

let pendingStart = null;
let pendingEnd = null;

let decadeStartYear = null;

// DOM
const el = (id) => document.getElementById(id);
const setStatus = (msg) => (el("status").textContent = msg);

function pad2(n){ return String(n).padStart(2,"0"); }
function clamp(d){ return d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : null; }
function ymd(d){ return d ? `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}` : "-"; }

function parseToDate(v){
  if (!v) return null;
  if (v instanceof Date && !isNaN(v)) return clamp(v);
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3]);
  const dt = new Date(s);
  return isNaN(dt) ? null : clamp(dt);
}

function normalizeRange(s,e){
  const ss = clamp(s), ee = clamp(e);
  if (ss && ee && ss.getTime() > ee.getTime()) return { s: ee, e: ss };
  return { s: ss, e: ee };
}

function setMode(next){
  mode = next;
  el("mode").textContent = `MODE: ${mode}`;
  el("boxStart").classList.toggle("active", mode === "editStart");
  el("boxEnd").classList.toggle("active", mode === "editEnd");
}

function hidePanels(){
  el("panelYear").classList.add("hidden");
  el("panelYear").setAttribute("aria-hidden","true");
  el("panelMonth").classList.add("hidden");
  el("panelMonth").setAttribute("aria-hidden","true");
}
function showYearPanel(){
  el("panelYear").classList.remove("hidden");
  el("panelYear").setAttribute("aria-hidden","false");
  el("panelMonth").classList.add("hidden");
  el("panelMonth").setAttribute("aria-hidden","true");
}
function showMonthPanel(){
  el("panelMonth").classList.remove("hidden");
  el("panelMonth").setAttribute("aria-hidden","false");
  el("panelYear").classList.add("hidden");
  el("panelYear").setAttribute("aria-hidden","true");
}

function autoApply(){ return !!el("toggleAutoApply").checked; }

function updateUI(){
  el("txtStart").textContent = ymd(startDate);
  el("txtEnd").textContent = ymd(endDate);
  if (fp){
    if (startDate && endDate) fp.setDate([startDate, endDate], false);
    else if (startDate) fp.setDate([startDate], false);
  }
}

function today(){
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}
function addDays(d, k){
  const x = new Date(d);
  x.setDate(x.getDate()+k);
  return clamp(x);
}
function firstDayOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
function lastDayOfMonth(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0); }
function addMonths(d, m){
  const x = new Date(d.getFullYear(), d.getMonth()+m, 1);
  const day = Math.min(d.getDate(), lastDayOfMonth(x).getDate());
  return new Date(x.getFullYear(), x.getMonth(), day);
}
function preset(name){
  const t = today();
  switch(name){
    case "today": return { s:t, e:t };
    case "last7": return { s:addDays(t,-6), e:t };
    case "last30": return { s:addDays(t,-29), e:t };
    case "thisMonth": return { s:firstDayOfMonth(t), e:lastDayOfMonth(t) };
    case "last3m": return { s:addMonths(t,-3), e:t };
    case "ytd": return { s:new Date(t.getFullYear(),0,1), e:t };
    default: return { s:addDays(t,-29), e:t };
  }
}

async function applyToTableau(){
  if (!tableauReady) return setStatus("Tableau 연결 전");
  if (!startDate || !endDate) return setStatus("시작/종료일을 모두 선택하세요");

  try{
    setStatus("적용 중…");
    await paramStart.changeValueAsync(ymd(startDate));
    await paramEnd.changeValueAsync(ymd(endDate));
    setStatus("적용 완료");
  }catch(err){
    console.error(err);
    setStatus("적용 실패(권한/파라미터 확인)");
  }
}

function setRange(s,e, jump=true){
  const norm = normalizeRange(s,e);
  startDate = norm.s;
  endDate = norm.e;
  updateUI();
  if (fp && jump) fp.jumpToDate(endDate || startDate || today(), true);
}

function setFromPreset(name){
  const {s,e} = preset(name);
  setRange(s,e,true);
  setMode("range");
  hidePanels();
  if (autoApply()) applyToTableau();
}

function visibleYear(){ return fp ? fp.currentYear : today().getFullYear(); }
function visibleMonth(){ return fp ? fp.currentMonth : today().getMonth(); }

function setNavHeader(){
  const y = visibleYear();
  const m = visibleMonth();
  el("btnYear").textContent = `${y}년`;
  el("btnMonth").textContent = `${m+1}월`;
  decadeStartYear = Math.floor(y/10)*10;
  el("txtDecade").textContent = `${decadeStartYear}~${decadeStartYear+9}`;
}

function renderYearGrid(){
  const base = decadeStartYear ?? Math.floor(visibleYear()/10)*10;
  decadeStartYear = base;
  el("txtDecade").textContent = `${base}~${base+9}`;
  const grid = el("gridYears");
  grid.innerHTML = "";

  const active = visibleYear();
  for (let i=0;i<10;i++){
    const year = base+i;
    const b = document.createElement("button");
    b.type="button";
    b.className="cell"+(year===active?" active":"");
    b.textContent=String(year);
    b.onclick=()=>{
      fp.changeYear(year);
      setNavHeader();
      renderYearGrid();
      hidePanels();
    };
    grid.appendChild(b);
  }
}

function renderMonthGrid(){
  const grid = el("gridMonths");
  grid.innerHTML = "";
  const active = visibleMonth();
  for (let m=1;m<=12;m++){
    const b = document.createElement("button");
    b.type="button";
    b.className="cell"+((m-1)===active?" active":"");
    b.textContent=`${m}월`;
    b.onclick=()=>{
      fp.changeMonth(m-1);
      setNavHeader();
      renderMonthGrid();
      hidePanels();
    };
    grid.appendChild(b);
  }
}

function initFlatpickr(){
  fp = flatpickr("#calendar", {
    inline: true,
    mode: "range",
    dateFormat: "Y-m-d",
    defaultDate: (startDate && endDate) ? [startDate, endDate] : (startDate ? [startDate] : null),
    clickOpens: false,
    onReady: () => {
      setNavHeader();
      renderYearGrid();
      renderMonthGrid();
    },
    onMonthChange: () => { setNavHeader(); renderYearGrid(); renderMonthGrid(); },
    onYearChange: () => { setNavHeader(); renderYearGrid(); },
    onChange: (selected) => {
      if (!selected || selected.length===0) return;

      // 개별 수정 모드
      if (mode === "editStart" || mode === "editEnd"){
        const picked = clamp(selected[0]);
        let s = startDate ? new Date(startDate) : null;
        let e = endDate ? new Date(endDate) : null;
        if (mode === "editStart") s = picked;
        if (mode === "editEnd") e = picked;
        if (!s && e) s = new Date(e);
        if (!e && s) e = new Date(s);
        const norm = normalizeRange(s,e);
        setRange(norm.s, norm.e, false);
        setMode("range");
        if (autoApply()) applyToTableau();
        return;
      }

      // range 기본 선택
      if (selected.length===1){
        startDate = clamp(selected[0]);
        endDate = null;
        updateUI();
        return;
      }
      const norm = normalizeRange(selected[0], selected[1]);
      setRange(norm.s, norm.e, false);
      if (autoApply()) applyToTableau();
    }
  });
}

async function findParams(){
  const params = await dashboard.getParametersAsync();
  paramStart = params.find(p=>p.name===CONFIG.PARAM_START);
  paramEnd = params.find(p=>p.name===CONFIG.PARAM_END);
  if (!paramStart || !paramEnd) throw new Error(`파라미터 없음: ${CONFIG.PARAM_START}, ${CONFIG.PARAM_END}`);

  paramStart.addEventListener(tableau.TableauEventType.ParameterChanged, ()=>syncFromTableau("start"));
  paramEnd.addEventListener(tableau.TableauEventType.ParameterChanged, ()=>syncFromTableau("end"));
}

async function syncFromTableau(reason){
  if (!tableauReady) return;
  try{
    const s = parseToDate(paramStart.currentValue.value);
    const e = parseToDate(paramEnd.currentValue.value);
    const norm = normalizeRange(s,e);
    startDate = norm.s;
    endDate = norm.e;
    updateUI();
    if (fp) fp.jumpToDate(endDate || startDate || today(), true);
    setNavHeader(); renderYearGrid(); renderMonthGrid();
    setStatus(`동기화됨(${reason})`);
  }catch(err){
    console.error(err);
    setStatus("동기화 실패");
  }
}

function wireUI(){
  el("toggleAutoApply").checked = CONFIG.AUTO_APPLY_DEFAULT;

  el("btnApply").onclick = applyToTableau;
  el("btnReset").onclick = () => setFromPreset(CONFIG.DEFAULT_PRESET);

  el("btnPrevMonth").onclick = () => { fp && fp.changeMonth(fp.currentMonth-1); hidePanels(); };
  el("btnNextMonth").onclick = () => { fp && fp.changeMonth(fp.currentMonth+1); hidePanels(); };

  el("btnYear").onclick = () => { if(!fp) return; showYearPanel(); decadeStartYear = Math.floor(visibleYear()/10)*10; renderYearGrid(); };
  el("btnMonth").onclick = () => { if(!fp) return; showMonthPanel(); renderMonthGrid(); };
  el("btnPrevDecade").onclick = () => { decadeStartYear = (decadeStartYear ?? Math.floor(visibleYear()/10)*10) - 10; renderYearGrid(); };
  el("btnNextDecade").onclick = () => { decadeStartYear = (decadeStartYear ?? Math.floor(visibleYear()/10)*10) + 10; renderYearGrid(); };
  el("btnCloseMonth").onclick = hidePanels;

  el("boxStart").onclick = () => { setMode("editStart"); hidePanels(); };
  el("boxEnd").onclick = () => { setMode("editEnd"); hidePanels(); };
  el("btnBackToRange").onclick = () => { setMode("range"); hidePanels(); };

  document.querySelectorAll(".chip").forEach(b=>{
    b.onclick = () => setFromPreset(b.getAttribute("data-preset"));
  });

  document.addEventListener("click", (e)=>{
    const inside = el("panelYear").contains(e.target) || el("panelMonth").contains(e.target) ||
                   el("btnYear").contains(e.target) || el("btnMonth").contains(e.target);
    if (!inside) hidePanels();
  });
}

async function init(){
  wireUI();
  setMode("range");

  try{
    setStatus("Tableau 초기화…");
    await tableau.extensions.initializeAsync();
    tableauReady = true;
    dashboard = tableau.extensions.dashboardContent.dashboard;

    await findParams();

    // 초기 파라미터 읽기
    const s = parseToDate(paramStart.currentValue.value);
    const e = parseToDate(paramEnd.currentValue.value);
    const norm = normalizeRange(s,e);
    startDate = norm.s;
    endDate = norm.e;

    // 빈 값이면 기본 프리셋
    if (!startDate || !endDate){
      const {s:ds, e:de} = preset(CONFIG.DEFAULT_PRESET);
      setRange(ds,de,true);
    }

    initFlatpickr();
    updateUI();
    setStatus("준비 완료");
  }catch(err){
    console.error(err);
    // Tableau 연결 실패해도 UI만이라도 뜨게
    const {s,e} = preset(CONFIG.DEFAULT_PRESET);
    setRange(s,e,true);
    initFlatpickr();
    updateUI();
    setStatus("Tableau 연결 실패(권한/URL/manifest 확인)");
  }
}

init();
