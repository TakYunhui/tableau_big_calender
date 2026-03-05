/* global tableau */

const KEYS = {
  start: "date_start_param",
  end: "date_end_param",
  single: "date_single_mode",
};

function $(id) { return document.getElementById(id); }

function hint(msg) { $("cfgHint").textContent = msg || ""; }

function setEndRowVisible(isVisible) {
  $("rowEnd").style.display = isVisible ? "" : "none";
}

function fillSelect(selectEl, names, selected) {
  selectEl.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "선택";
  selectEl.appendChild(opt0);

  for (const n of names) {
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent = n;
    selectEl.appendChild(opt);
  }
  if (selected) selectEl.value = selected;
}

async function init() {
  await tableau.extensions.initializeDialogAsync();

  const dash = tableau.extensions.dashboardContent.dashboard;
  $("cfgDashName").textContent = dash?.name || "-";

  const params = await dash.getParametersAsync();
  const names = params.map(p => p.name).sort((a,b) => a.localeCompare(b));

  const s = tableau.extensions.settings;

  const curStart = s.get(KEYS.start) || "";
  const curEnd = s.get(KEYS.end) || "";
  const curSingle = (s.get(KEYS.single) === "true");

  fillSelect($("selStart"), names, curStart);
  fillSelect($("selEnd"), names, curEnd);

  $("chkSingle").checked = curSingle;
  setEndRowVisible(!curSingle);

  $("chkSingle").addEventListener("change", () => {
    setEndRowVisible(!$("chkSingle").checked);
  });

  $("btnCfgCancel").addEventListener("click", () => {
    tableau.extensions.ui.closeDialog("cancel");
  });

  $("btnCfgSave").addEventListener("click", async () => {
    try {
      hint("");

      const start = $("selStart").value;
      const single = $("chkSingle").checked;
      const end = $("selEnd").value;

      if (!start) throw new Error("시작일 파라미터를 선택하세요.");
      if (!single && !end) throw new Error("종료일 파라미터를 선택하세요.");

      s.set(KEYS.start, start);
      s.set(KEYS.end, single ? "" : end);
      s.set(KEYS.single, String(single));

      await s.saveAsync();
      tableau.extensions.ui.closeDialog("saved");
    } catch (e) {
      hint(e?.message || String(e));
    }
  });
}

init().catch(e => hint(e?.message || String(e)));
