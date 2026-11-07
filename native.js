// iPhone glue (Capacitor). On the web this file does nothing.
// Haptics: window.HB_HAPTIC(kind) with kind "light" | "medium" | "heavy" | "success" | "warning" | "error".
(function () {
  var C = window.Capacitor, native = !!(C && C.isNativePlatform && C.isNativePlatform());
  window.HB_NATIVE = native;
  if (!native) { window.HB_HAPTIC = function () {}; return; }
  document.documentElement.classList.add("native");
  // No bundler here, so use the bridge's own call rather than @capacitor/core's registerPlugin.
  var call = function (method, opts) {
    if (C.nativePromise) return C.nativePromise("Haptics", method, opts);
    var P = C.Plugins && C.Plugins.Haptics; if (P && P[method]) return P[method](opts);
  };
  var H = { impact: function (o) { return call("impact", o); }, notification: function (o) { return call("notification", o); } }, last = 0;
  window.HB_HAPTIC = function (kind) {
    var now = Date.now(); if (now - last < 35) return; last = now; // don't machine-gun the Taptic Engine
    try {
      var pr = (kind === "success" || kind === "warning" || kind === "error") ? H.notification({ type: kind.toUpperCase() }) : H.impact({ style: (kind || "light").toUpperCase() });
      if (pr && pr.catch) pr.catch(function () {});
    } catch (e) {}
  };
  try { var settings = JSON.parse(localStorage.getItem("hb_haptics") || "true"); window.HB_HAPTICS_ON = settings !== false; } catch (e) { window.HB_HAPTICS_ON = true; }
})();
