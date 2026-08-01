// Force ALL on-screen date/time formatting to IST (Asia/Kolkata), regardless of
// the viewer's browser timezone. Patches only Date.prototype methods, so number
// formatting (Number.prototype.toLocaleString) is unaffected. An explicit
// timeZone passed by a caller still wins.
const IST = "Asia/Kolkata";

["toLocaleString", "toLocaleDateString", "toLocaleTimeString"].forEach((name) => {
  const original = Date.prototype[name];
  Date.prototype[name] = function (locale, options) {
    return original.call(this, locale, { timeZone: IST, ...(options || {}) });
  };
});

export {};
