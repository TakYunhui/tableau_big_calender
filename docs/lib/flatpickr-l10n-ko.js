/* flatpickr Korean locale (ko) */
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined'
    ? factory(exports)
    : typeof define === 'function' && define.amd
    ? define(['exports'], factory)
    : factory((global.ko = {}));
})(this, function (exports) {
  'use strict';

  const fp = (typeof window !== "undefined" && window.flatpickr) ? window.flatpickr : null;
  const Korean = {
    weekdays: {
      shorthand: ["일", "월", "화", "수", "목", "금", "토"],
      longhand: ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"]
    },
    months: {
      shorthand: ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"],
      longhand: ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"]
    },
    ordinal: () => "일",
    rangeSeparator: " ~ ",
    weekAbbreviation: "주",
    scrollTitle: "스크롤하여 증가",
    toggleTitle: "클릭하여 전환",
    amPM: ["오전", "오후"],
    yearAriaLabel: "년",
    monthAriaLabel: "월",
    hourAriaLabel: "시",
    minuteAriaLabel: "분",
    time_24hr: true,
    firstDayOfWeek: 0
  };

  if (fp) {
    fp.l10ns.ko = Korean;
    fp.l10ns.default = Korean;
  }

  exports.Korean = Korean;
  Object.defineProperty(exports, '__esModule', { value: true });
});
