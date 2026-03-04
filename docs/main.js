<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Big Calendar Date Picker</title>

  <!-- 캐시 완화(선택) -->
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
  <meta http-equiv="Pragma" content="no-cache" />
  <meta http-equiv="Expires" content="0" />

  <script src="./lib/tableau.extensions.1.latest.min.js"></script>
  <link rel="stylesheet" href="./lib/flatpickr.min.css" />
  <script src="./lib/flatpickr.min.js"></script>

  <link rel="stylesheet" href="./styles.css" />
</head>

<body>
  <div class="app">
    <!-- 상단: 기간 표시(항상 보임) -->
    <div class="rangeBar" id="rangeBar" role="button" tabindex="0" aria-label="기간 선택 열기">
      <div class="rangeLeft">
        <div class="rangeTitle">조회 기간</div>
        <div class="rangeValue">
          <span id="txtStart">-</span>
          <span class="rangeSep">~</span>
          <span id="txtEnd">-</span>
        </div>
      </div>
      <div class="rangeRight">
        <span class="caret" id="caret">▼</span>
      </div>
    </div>

    <!-- 펼침 패널(기본 숨김) -->
    <div class="panel hidden" id="pickerPanel" aria-hidden="true">
      <div class="panelTop">
        <div class="modeHint" id="modeHint">범위 선택</div>
        <div class="actions">
          <label class="toggle">
            <input id="toggleAutoApply" type="checkbox" />
            <span>즉시 적용</span>
          </label>
          <button id="btnApply" class="btn primary" type="button">적용</button>
          <button id="btnReset" class="btn" type="button">초기화</button>
        </div>
      </div>

      <div class="seRow">
        <button id="boxStart" class="seBox" type="button">
          <div class="seLabel">시작일</div>
          <div id="txtStartBox" class="seValue">-</div>
        </button>

        <button id="boxEnd" class="seBox" type="button">
          <div class="seLabel">종료일</div>
          <div id="txtEndBox" class="seValue">-</div>
        </button>
      </div>

      <div class="navHeader">
        <button id="btnPrevMonth" class="navBtn" title="이전 달" type="button">◀</button>
        <div class="navCenter">
          <button id="btnYear" class="navPill" type="button">2026년</button>
          <button id="btnMonth" class="navPill" type="button">3월</button>
        </div>
        <button id="btnNextMonth" class="navBtn" title="다음 달" type="button">▶</button>
      </div>

      <div id="panelYear" class="subPanel hidden" aria-hidden="true">
        <div class="subHead">
          <button id="btnPrevDecade" class="btn sm" type="button">이전 10년</button>
          <div id="txtDecade" class="subTitle">2020~2029</div>
          <button id="btnNextDecade" class="btn sm" type="button">다음 10년</button>
        </div>
        <div id="gridYears" class="grid years"></div>
      </div>

      <div id="panelMonth" class="subPanel hidden" aria-hidden="true">
        <div class="subHead">
          <div class="subTitle">월 선택</div>
          <button id="btnCloseMonth" class="btn sm" type="button">닫기</button>
        </div>
        <div id="gridMonths" class="grid months"></div>
      </div>

      <div class="calendarWrap">
        <div id="calendar"></div>
      </div>

      <div class="quickRow">
        <button class="chip" data-preset="today" type="button">오늘</button>
        <button class="chip" data-preset="last7" type="button">최근 7일</button>
        <button class="chip" data-preset="last30" type="button">최근 30일</button>
        <button class="chip" data-preset="thisMonth" type="button">이번달</button>
        <button class="chip" data-preset="last3m" type="button">최근 3개월</button>
        <button class="chip" data-preset="ytd" type="button">YTD</button>
      </div>

      <div class="statusRow">
        <div id="status" class="status">Tableau 연결 중…</div>
      </div>
    </div>
  </div>

  <script src="./main.js"></script>
</body>
</html>
