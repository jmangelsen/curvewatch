function Rm(O) {
  return O && O.__esModule && Object.prototype.hasOwnProperty.call(O, "default") ? O.default : O;
}
var Ff = { exports: {} }, G = {};
/**
 * @license React
 * react.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var Ir;
function wm() {
  if (Ir) return G;
  Ir = 1;
  var O = Symbol.for("react.transitional.element"), K = Symbol.for("react.portal"), C = Symbol.for("react.fragment"), g = Symbol.for("react.strict_mode"), Sl = Symbol.for("react.profiler"), ol = Symbol.for("react.consumer"), L = Symbol.for("react.context"), Tl = Symbol.for("react.forward_ref"), R = Symbol.for("react.suspense"), A = Symbol.for("react.memo"), x = Symbol.for("react.lazy"), ul = Symbol.iterator;
  function W(s) {
    return s === null || typeof s != "object" ? null : (s = ul && s[ul] || s["@@iterator"], typeof s == "function" ? s : null);
  }
  var Nl = {
    isMounted: function() {
      return !1;
    },
    enqueueForceUpdate: function() {
    },
    enqueueReplaceState: function() {
    },
    enqueueSetState: function() {
    }
  }, rl = Object.assign, $l = {};
  function Rl(s, T, D) {
    this.props = s, this.context = T, this.refs = $l, this.updater = D || Nl;
  }
  Rl.prototype.isReactComponent = {}, Rl.prototype.setState = function(s, T) {
    if (typeof s != "object" && typeof s != "function" && s != null)
      throw Error(
        "takes an object of state variables to update or a function which returns an object of state variables."
      );
    this.updater.enqueueSetState(this, s, T, "setState");
  }, Rl.prototype.forceUpdate = function(s) {
    this.updater.enqueueForceUpdate(this, s, "forceUpdate");
  };
  function Tt() {
  }
  Tt.prototype = Rl.prototype;
  function it(s, T, D) {
    this.props = s, this.context = T, this.refs = $l, this.updater = D || Nl;
  }
  var Al = it.prototype = new Tt();
  Al.constructor = it, rl(Al, Rl.prototype), Al.isPureReactComponent = !0;
  var jl = Array.isArray, j = { H: null, A: null, T: null, S: null, V: null }, wl = Object.prototype.hasOwnProperty;
  function Hl(s, T, D, _, w, $) {
    return D = $.ref, {
      $$typeof: O,
      type: s,
      key: T,
      ref: D !== void 0 ? D : null,
      props: $
    };
  }
  function yl(s, T) {
    return Hl(
      s.type,
      T,
      void 0,
      void 0,
      void 0,
      s.props
    );
  }
  function Vl(s) {
    return typeof s == "object" && s !== null && s.$$typeof === O;
  }
  function fl(s) {
    var T = { "=": "=0", ":": "=2" };
    return "$" + s.replace(/[=:]/g, function(D) {
      return T[D];
    });
  }
  var st = /\/+/g;
  function hl(s, T) {
    return typeof s == "object" && s !== null && s.key != null ? fl("" + s.key) : T.toString(36);
  }
  function Ut() {
  }
  function xt(s) {
    switch (s.status) {
      case "fulfilled":
        return s.value;
      case "rejected":
        throw s.reason;
      default:
        switch (typeof s.status == "string" ? s.then(Ut, Ut) : (s.status = "pending", s.then(
          function(T) {
            s.status === "pending" && (s.status = "fulfilled", s.value = T);
          },
          function(T) {
            s.status === "pending" && (s.status = "rejected", s.reason = T);
          }
        )), s.status) {
          case "fulfilled":
            return s.value;
          case "rejected":
            throw s.reason;
        }
    }
    throw s;
  }
  function zl(s, T, D, _, w) {
    var $ = typeof s;
    ($ === "undefined" || $ === "boolean") && (s = null);
    var Y = !1;
    if (s === null) Y = !0;
    else
      switch ($) {
        case "bigint":
        case "string":
        case "number":
          Y = !0;
          break;
        case "object":
          switch (s.$$typeof) {
            case O:
            case K:
              Y = !0;
              break;
            case x:
              return Y = s._init, zl(
                Y(s._payload),
                T,
                D,
                _,
                w
              );
          }
      }
    if (Y)
      return w = w(s), Y = _ === "" ? "." + hl(s, 0) : _, jl(w) ? (D = "", Y != null && (D = Y.replace(st, "$&/") + "/"), zl(w, T, D, "", function(Kt) {
        return Kt;
      })) : w != null && (Vl(w) && (w = yl(
        w,
        D + (w.key == null || s && s.key === w.key ? "" : ("" + w.key).replace(
          st,
          "$&/"
        ) + "/") + Y
      )), T.push(w)), 1;
    Y = 0;
    var Fl = _ === "" ? "." : _ + ":";
    if (jl(s))
      for (var il = 0; il < s.length; il++)
        _ = s[il], $ = Fl + hl(_, il), Y += zl(
          _,
          T,
          D,
          $,
          w
        );
    else if (il = W(s), typeof il == "function")
      for (s = il.call(s), il = 0; !(_ = s.next()).done; )
        _ = _.value, $ = Fl + hl(_, il++), Y += zl(
          _,
          T,
          D,
          $,
          w
        );
    else if ($ === "object") {
      if (typeof s.then == "function")
        return zl(
          xt(s),
          T,
          D,
          _,
          w
        );
      throw T = String(s), Error(
        "Objects are not valid as a React child (found: " + (T === "[object Object]" ? "object with keys {" + Object.keys(s).join(", ") + "}" : T) + "). If you meant to render a collection of children, use an array instead."
      );
    }
    return Y;
  }
  function b(s, T, D) {
    if (s == null) return s;
    var _ = [], w = 0;
    return zl(s, _, "", "", function($) {
      return T.call(D, $, w++);
    }), _;
  }
  function d(s) {
    if (s._status === -1) {
      var T = s._result;
      T = T(), T.then(
        function(D) {
          (s._status === 0 || s._status === -1) && (s._status = 1, s._result = D);
        },
        function(D) {
          (s._status === 0 || s._status === -1) && (s._status = 2, s._result = D);
        }
      ), s._status === -1 && (s._status = 0, s._result = T);
    }
    if (s._status === 1) return s._result.default;
    throw s._result;
  }
  var M = typeof reportError == "function" ? reportError : function(s) {
    if (typeof window == "object" && typeof window.ErrorEvent == "function") {
      var T = new window.ErrorEvent("error", {
        bubbles: !0,
        cancelable: !0,
        message: typeof s == "object" && s !== null && typeof s.message == "string" ? String(s.message) : String(s),
        error: s
      });
      if (!window.dispatchEvent(T)) return;
    } else if (typeof process == "object" && typeof process.emit == "function") {
      process.emit("uncaughtException", s);
      return;
    }
    console.error(s);
  };
  function J() {
  }
  return G.Children = {
    map: b,
    forEach: function(s, T, D) {
      b(
        s,
        function() {
          T.apply(this, arguments);
        },
        D
      );
    },
    count: function(s) {
      var T = 0;
      return b(s, function() {
        T++;
      }), T;
    },
    toArray: function(s) {
      return b(s, function(T) {
        return T;
      }) || [];
    },
    only: function(s) {
      if (!Vl(s))
        throw Error(
          "React.Children.only expected to receive a single React element child."
        );
      return s;
    }
  }, G.Component = Rl, G.Fragment = C, G.Profiler = Sl, G.PureComponent = it, G.StrictMode = g, G.Suspense = R, G.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = j, G.__COMPILER_RUNTIME = {
    __proto__: null,
    c: function(s) {
      return j.H.useMemoCache(s);
    }
  }, G.cache = function(s) {
    return function() {
      return s.apply(null, arguments);
    };
  }, G.cloneElement = function(s, T, D) {
    if (s == null)
      throw Error(
        "The argument must be a React element, but you passed " + s + "."
      );
    var _ = rl({}, s.props), w = s.key, $ = void 0;
    if (T != null)
      for (Y in T.ref !== void 0 && ($ = void 0), T.key !== void 0 && (w = "" + T.key), T)
        !wl.call(T, Y) || Y === "key" || Y === "__self" || Y === "__source" || Y === "ref" && T.ref === void 0 || (_[Y] = T[Y]);
    var Y = arguments.length - 2;
    if (Y === 1) _.children = D;
    else if (1 < Y) {
      for (var Fl = Array(Y), il = 0; il < Y; il++)
        Fl[il] = arguments[il + 2];
      _.children = Fl;
    }
    return Hl(s.type, w, void 0, void 0, $, _);
  }, G.createContext = function(s) {
    return s = {
      $$typeof: L,
      _currentValue: s,
      _currentValue2: s,
      _threadCount: 0,
      Provider: null,
      Consumer: null
    }, s.Provider = s, s.Consumer = {
      $$typeof: ol,
      _context: s
    }, s;
  }, G.createElement = function(s, T, D) {
    var _, w = {}, $ = null;
    if (T != null)
      for (_ in T.key !== void 0 && ($ = "" + T.key), T)
        wl.call(T, _) && _ !== "key" && _ !== "__self" && _ !== "__source" && (w[_] = T[_]);
    var Y = arguments.length - 2;
    if (Y === 1) w.children = D;
    else if (1 < Y) {
      for (var Fl = Array(Y), il = 0; il < Y; il++)
        Fl[il] = arguments[il + 2];
      w.children = Fl;
    }
    if (s && s.defaultProps)
      for (_ in Y = s.defaultProps, Y)
        w[_] === void 0 && (w[_] = Y[_]);
    return Hl(s, $, void 0, void 0, null, w);
  }, G.createRef = function() {
    return { current: null };
  }, G.forwardRef = function(s) {
    return { $$typeof: Tl, render: s };
  }, G.isValidElement = Vl, G.lazy = function(s) {
    return {
      $$typeof: x,
      _payload: { _status: -1, _result: s },
      _init: d
    };
  }, G.memo = function(s, T) {
    return {
      $$typeof: A,
      type: s,
      compare: T === void 0 ? null : T
    };
  }, G.startTransition = function(s) {
    var T = j.T, D = {};
    j.T = D;
    try {
      var _ = s(), w = j.S;
      w !== null && w(D, _), typeof _ == "object" && _ !== null && typeof _.then == "function" && _.then(J, M);
    } catch ($) {
      M($);
    } finally {
      j.T = T;
    }
  }, G.unstable_useCacheRefresh = function() {
    return j.H.useCacheRefresh();
  }, G.use = function(s) {
    return j.H.use(s);
  }, G.useActionState = function(s, T, D) {
    return j.H.useActionState(s, T, D);
  }, G.useCallback = function(s, T) {
    return j.H.useCallback(s, T);
  }, G.useContext = function(s) {
    return j.H.useContext(s);
  }, G.useDebugValue = function() {
  }, G.useDeferredValue = function(s, T) {
    return j.H.useDeferredValue(s, T);
  }, G.useEffect = function(s, T, D) {
    var _ = j.H;
    if (typeof D == "function")
      throw Error(
        "useEffect CRUD overload is not enabled in this build of React."
      );
    return _.useEffect(s, T);
  }, G.useId = function() {
    return j.H.useId();
  }, G.useImperativeHandle = function(s, T, D) {
    return j.H.useImperativeHandle(s, T, D);
  }, G.useInsertionEffect = function(s, T) {
    return j.H.useInsertionEffect(s, T);
  }, G.useLayoutEffect = function(s, T) {
    return j.H.useLayoutEffect(s, T);
  }, G.useMemo = function(s, T) {
    return j.H.useMemo(s, T);
  }, G.useOptimistic = function(s, T) {
    return j.H.useOptimistic(s, T);
  }, G.useReducer = function(s, T, D) {
    return j.H.useReducer(s, T, D);
  }, G.useRef = function(s) {
    return j.H.useRef(s);
  }, G.useState = function(s) {
    return j.H.useState(s);
  }, G.useSyncExternalStore = function(s, T, D) {
    return j.H.useSyncExternalStore(
      s,
      T,
      D
    );
  }, G.useTransition = function() {
    return j.H.useTransition();
  }, G.version = "19.1.1", G;
}
var Pr;
function ui() {
  return Pr || (Pr = 1, Ff.exports = wm()), Ff.exports;
}
var Gl = ui();
const z = /* @__PURE__ */ Rm(Gl);
var If = { exports: {} }, gu = {}, Pf = { exports: {} }, li = {};
/**
 * @license React
 * scheduler.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var ld;
function Hm() {
  return ld || (ld = 1, (function(O) {
    function K(b, d) {
      var M = b.length;
      b.push(d);
      l: for (; 0 < M; ) {
        var J = M - 1 >>> 1, s = b[J];
        if (0 < Sl(s, d))
          b[J] = d, b[M] = s, M = J;
        else break l;
      }
    }
    function C(b) {
      return b.length === 0 ? null : b[0];
    }
    function g(b) {
      if (b.length === 0) return null;
      var d = b[0], M = b.pop();
      if (M !== d) {
        b[0] = M;
        l: for (var J = 0, s = b.length, T = s >>> 1; J < T; ) {
          var D = 2 * (J + 1) - 1, _ = b[D], w = D + 1, $ = b[w];
          if (0 > Sl(_, M))
            w < s && 0 > Sl($, _) ? (b[J] = $, b[w] = M, J = w) : (b[J] = _, b[D] = M, J = D);
          else if (w < s && 0 > Sl($, M))
            b[J] = $, b[w] = M, J = w;
          else break l;
        }
      }
      return d;
    }
    function Sl(b, d) {
      var M = b.sortIndex - d.sortIndex;
      return M !== 0 ? M : b.id - d.id;
    }
    if (O.unstable_now = void 0, typeof performance == "object" && typeof performance.now == "function") {
      var ol = performance;
      O.unstable_now = function() {
        return ol.now();
      };
    } else {
      var L = Date, Tl = L.now();
      O.unstable_now = function() {
        return L.now() - Tl;
      };
    }
    var R = [], A = [], x = 1, ul = null, W = 3, Nl = !1, rl = !1, $l = !1, Rl = !1, Tt = typeof setTimeout == "function" ? setTimeout : null, it = typeof clearTimeout == "function" ? clearTimeout : null, Al = typeof setImmediate < "u" ? setImmediate : null;
    function jl(b) {
      for (var d = C(A); d !== null; ) {
        if (d.callback === null) g(A);
        else if (d.startTime <= b)
          g(A), d.sortIndex = d.expirationTime, K(R, d);
        else break;
        d = C(A);
      }
    }
    function j(b) {
      if ($l = !1, jl(b), !rl)
        if (C(R) !== null)
          rl = !0, wl || (wl = !0, hl());
        else {
          var d = C(A);
          d !== null && zl(j, d.startTime - b);
        }
    }
    var wl = !1, Hl = -1, yl = 5, Vl = -1;
    function fl() {
      return Rl ? !0 : !(O.unstable_now() - Vl < yl);
    }
    function st() {
      if (Rl = !1, wl) {
        var b = O.unstable_now();
        Vl = b;
        var d = !0;
        try {
          l: {
            rl = !1, $l && ($l = !1, it(Hl), Hl = -1), Nl = !0;
            var M = W;
            try {
              t: {
                for (jl(b), ul = C(R); ul !== null && !(ul.expirationTime > b && fl()); ) {
                  var J = ul.callback;
                  if (typeof J == "function") {
                    ul.callback = null, W = ul.priorityLevel;
                    var s = J(
                      ul.expirationTime <= b
                    );
                    if (b = O.unstable_now(), typeof s == "function") {
                      ul.callback = s, jl(b), d = !0;
                      break t;
                    }
                    ul === C(R) && g(R), jl(b);
                  } else g(R);
                  ul = C(R);
                }
                if (ul !== null) d = !0;
                else {
                  var T = C(A);
                  T !== null && zl(
                    j,
                    T.startTime - b
                  ), d = !1;
                }
              }
              break l;
            } finally {
              ul = null, W = M, Nl = !1;
            }
            d = void 0;
          }
        } finally {
          d ? hl() : wl = !1;
        }
      }
    }
    var hl;
    if (typeof Al == "function")
      hl = function() {
        Al(st);
      };
    else if (typeof MessageChannel < "u") {
      var Ut = new MessageChannel(), xt = Ut.port2;
      Ut.port1.onmessage = st, hl = function() {
        xt.postMessage(null);
      };
    } else
      hl = function() {
        Tt(st, 0);
      };
    function zl(b, d) {
      Hl = Tt(function() {
        b(O.unstable_now());
      }, d);
    }
    O.unstable_IdlePriority = 5, O.unstable_ImmediatePriority = 1, O.unstable_LowPriority = 4, O.unstable_NormalPriority = 3, O.unstable_Profiling = null, O.unstable_UserBlockingPriority = 2, O.unstable_cancelCallback = function(b) {
      b.callback = null;
    }, O.unstable_forceFrameRate = function(b) {
      0 > b || 125 < b ? console.error(
        "forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported"
      ) : yl = 0 < b ? Math.floor(1e3 / b) : 5;
    }, O.unstable_getCurrentPriorityLevel = function() {
      return W;
    }, O.unstable_next = function(b) {
      switch (W) {
        case 1:
        case 2:
        case 3:
          var d = 3;
          break;
        default:
          d = W;
      }
      var M = W;
      W = d;
      try {
        return b();
      } finally {
        W = M;
      }
    }, O.unstable_requestPaint = function() {
      Rl = !0;
    }, O.unstable_runWithPriority = function(b, d) {
      switch (b) {
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
          break;
        default:
          b = 3;
      }
      var M = W;
      W = b;
      try {
        return d();
      } finally {
        W = M;
      }
    }, O.unstable_scheduleCallback = function(b, d, M) {
      var J = O.unstable_now();
      switch (typeof M == "object" && M !== null ? (M = M.delay, M = typeof M == "number" && 0 < M ? J + M : J) : M = J, b) {
        case 1:
          var s = -1;
          break;
        case 2:
          s = 250;
          break;
        case 5:
          s = 1073741823;
          break;
        case 4:
          s = 1e4;
          break;
        default:
          s = 5e3;
      }
      return s = M + s, b = {
        id: x++,
        callback: d,
        priorityLevel: b,
        startTime: M,
        expirationTime: s,
        sortIndex: -1
      }, M > J ? (b.sortIndex = M, K(A, b), C(R) === null && b === C(A) && ($l ? (it(Hl), Hl = -1) : $l = !0, zl(j, M - J))) : (b.sortIndex = s, K(R, b), rl || Nl || (rl = !0, wl || (wl = !0, hl()))), b;
    }, O.unstable_shouldYield = fl, O.unstable_wrapCallback = function(b) {
      var d = W;
      return function() {
        var M = W;
        W = d;
        try {
          return b.apply(this, arguments);
        } finally {
          W = M;
        }
      };
    };
  })(li)), li;
}
var td;
function qm() {
  return td || (td = 1, Pf.exports = Hm()), Pf.exports;
}
var ti = { exports: {} }, Cl = {};
/**
 * @license React
 * react-dom.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var ed;
function Bm() {
  if (ed) return Cl;
  ed = 1;
  var O = ui();
  function K(R) {
    var A = "https://react.dev/errors/" + R;
    if (1 < arguments.length) {
      A += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var x = 2; x < arguments.length; x++)
        A += "&args[]=" + encodeURIComponent(arguments[x]);
    }
    return "Minified React error #" + R + "; visit " + A + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  function C() {
  }
  var g = {
    d: {
      f: C,
      r: function() {
        throw Error(K(522));
      },
      D: C,
      C,
      L: C,
      m: C,
      X: C,
      S: C,
      M: C
    },
    p: 0,
    findDOMNode: null
  }, Sl = Symbol.for("react.portal");
  function ol(R, A, x) {
    var ul = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
    return {
      $$typeof: Sl,
      key: ul == null ? null : "" + ul,
      children: R,
      containerInfo: A,
      implementation: x
    };
  }
  var L = O.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  function Tl(R, A) {
    if (R === "font") return "";
    if (typeof A == "string")
      return A === "use-credentials" ? A : "";
  }
  return Cl.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = g, Cl.createPortal = function(R, A) {
    var x = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
    if (!A || A.nodeType !== 1 && A.nodeType !== 9 && A.nodeType !== 11)
      throw Error(K(299));
    return ol(R, A, null, x);
  }, Cl.flushSync = function(R) {
    var A = L.T, x = g.p;
    try {
      if (L.T = null, g.p = 2, R) return R();
    } finally {
      L.T = A, g.p = x, g.d.f();
    }
  }, Cl.preconnect = function(R, A) {
    typeof R == "string" && (A ? (A = A.crossOrigin, A = typeof A == "string" ? A === "use-credentials" ? A : "" : void 0) : A = null, g.d.C(R, A));
  }, Cl.prefetchDNS = function(R) {
    typeof R == "string" && g.d.D(R);
  }, Cl.preinit = function(R, A) {
    if (typeof R == "string" && A && typeof A.as == "string") {
      var x = A.as, ul = Tl(x, A.crossOrigin), W = typeof A.integrity == "string" ? A.integrity : void 0, Nl = typeof A.fetchPriority == "string" ? A.fetchPriority : void 0;
      x === "style" ? g.d.S(
        R,
        typeof A.precedence == "string" ? A.precedence : void 0,
        {
          crossOrigin: ul,
          integrity: W,
          fetchPriority: Nl
        }
      ) : x === "script" && g.d.X(R, {
        crossOrigin: ul,
        integrity: W,
        fetchPriority: Nl,
        nonce: typeof A.nonce == "string" ? A.nonce : void 0
      });
    }
  }, Cl.preinitModule = function(R, A) {
    if (typeof R == "string")
      if (typeof A == "object" && A !== null) {
        if (A.as == null || A.as === "script") {
          var x = Tl(
            A.as,
            A.crossOrigin
          );
          g.d.M(R, {
            crossOrigin: x,
            integrity: typeof A.integrity == "string" ? A.integrity : void 0,
            nonce: typeof A.nonce == "string" ? A.nonce : void 0
          });
        }
      } else A == null && g.d.M(R);
  }, Cl.preload = function(R, A) {
    if (typeof R == "string" && typeof A == "object" && A !== null && typeof A.as == "string") {
      var x = A.as, ul = Tl(x, A.crossOrigin);
      g.d.L(R, x, {
        crossOrigin: ul,
        integrity: typeof A.integrity == "string" ? A.integrity : void 0,
        nonce: typeof A.nonce == "string" ? A.nonce : void 0,
        type: typeof A.type == "string" ? A.type : void 0,
        fetchPriority: typeof A.fetchPriority == "string" ? A.fetchPriority : void 0,
        referrerPolicy: typeof A.referrerPolicy == "string" ? A.referrerPolicy : void 0,
        imageSrcSet: typeof A.imageSrcSet == "string" ? A.imageSrcSet : void 0,
        imageSizes: typeof A.imageSizes == "string" ? A.imageSizes : void 0,
        media: typeof A.media == "string" ? A.media : void 0
      });
    }
  }, Cl.preloadModule = function(R, A) {
    if (typeof R == "string")
      if (A) {
        var x = Tl(A.as, A.crossOrigin);
        g.d.m(R, {
          as: typeof A.as == "string" && A.as !== "script" ? A.as : void 0,
          crossOrigin: x,
          integrity: typeof A.integrity == "string" ? A.integrity : void 0
        });
      } else g.d.m(R);
  }, Cl.requestFormReset = function(R) {
    g.d.r(R);
  }, Cl.unstable_batchedUpdates = function(R, A) {
    return R(A);
  }, Cl.useFormState = function(R, A, x) {
    return L.H.useFormState(R, A, x);
  }, Cl.useFormStatus = function() {
    return L.H.useHostTransitionStatus();
  }, Cl.version = "19.1.1", Cl;
}
var ad;
function Ym() {
  if (ad) return ti.exports;
  ad = 1;
  function O() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(O);
      } catch (K) {
        console.error(K);
      }
  }
  return O(), ti.exports = Bm(), ti.exports;
}
/**
 * @license React
 * react-dom-client.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var ud;
function Gm() {
  if (ud) return gu;
  ud = 1;
  var O = qm(), K = ui(), C = Ym();
  function g(l) {
    var t = "https://react.dev/errors/" + l;
    if (1 < arguments.length) {
      t += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var e = 2; e < arguments.length; e++)
        t += "&args[]=" + encodeURIComponent(arguments[e]);
    }
    return "Minified React error #" + l + "; visit " + t + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  function Sl(l) {
    return !(!l || l.nodeType !== 1 && l.nodeType !== 9 && l.nodeType !== 11);
  }
  function ol(l) {
    var t = l, e = l;
    if (l.alternate) for (; t.return; ) t = t.return;
    else {
      l = t;
      do
        t = l, (t.flags & 4098) !== 0 && (e = t.return), l = t.return;
      while (l);
    }
    return t.tag === 3 ? e : null;
  }
  function L(l) {
    if (l.tag === 13) {
      var t = l.memoizedState;
      if (t === null && (l = l.alternate, l !== null && (t = l.memoizedState)), t !== null) return t.dehydrated;
    }
    return null;
  }
  function Tl(l) {
    if (ol(l) !== l)
      throw Error(g(188));
  }
  function R(l) {
    var t = l.alternate;
    if (!t) {
      if (t = ol(l), t === null) throw Error(g(188));
      return t !== l ? null : l;
    }
    for (var e = l, a = t; ; ) {
      var u = e.return;
      if (u === null) break;
      var n = u.alternate;
      if (n === null) {
        if (a = u.return, a !== null) {
          e = a;
          continue;
        }
        break;
      }
      if (u.child === n.child) {
        for (n = u.child; n; ) {
          if (n === e) return Tl(u), l;
          if (n === a) return Tl(u), t;
          n = n.sibling;
        }
        throw Error(g(188));
      }
      if (e.return !== a.return) e = u, a = n;
      else {
        for (var c = !1, f = u.child; f; ) {
          if (f === e) {
            c = !0, e = u, a = n;
            break;
          }
          if (f === a) {
            c = !0, a = u, e = n;
            break;
          }
          f = f.sibling;
        }
        if (!c) {
          for (f = n.child; f; ) {
            if (f === e) {
              c = !0, e = n, a = u;
              break;
            }
            if (f === a) {
              c = !0, a = n, e = u;
              break;
            }
            f = f.sibling;
          }
          if (!c) throw Error(g(189));
        }
      }
      if (e.alternate !== a) throw Error(g(190));
    }
    if (e.tag !== 3) throw Error(g(188));
    return e.stateNode.current === e ? l : t;
  }
  function A(l) {
    var t = l.tag;
    if (t === 5 || t === 26 || t === 27 || t === 6) return l;
    for (l = l.child; l !== null; ) {
      if (t = A(l), t !== null) return t;
      l = l.sibling;
    }
    return null;
  }
  var x = Object.assign, ul = Symbol.for("react.element"), W = Symbol.for("react.transitional.element"), Nl = Symbol.for("react.portal"), rl = Symbol.for("react.fragment"), $l = Symbol.for("react.strict_mode"), Rl = Symbol.for("react.profiler"), Tt = Symbol.for("react.provider"), it = Symbol.for("react.consumer"), Al = Symbol.for("react.context"), jl = Symbol.for("react.forward_ref"), j = Symbol.for("react.suspense"), wl = Symbol.for("react.suspense_list"), Hl = Symbol.for("react.memo"), yl = Symbol.for("react.lazy"), Vl = Symbol.for("react.activity"), fl = Symbol.for("react.memo_cache_sentinel"), st = Symbol.iterator;
  function hl(l) {
    return l === null || typeof l != "object" ? null : (l = st && l[st] || l["@@iterator"], typeof l == "function" ? l : null);
  }
  var Ut = Symbol.for("react.client.reference");
  function xt(l) {
    if (l == null) return null;
    if (typeof l == "function")
      return l.$$typeof === Ut ? null : l.displayName || l.name || null;
    if (typeof l == "string") return l;
    switch (l) {
      case rl:
        return "Fragment";
      case Rl:
        return "Profiler";
      case $l:
        return "StrictMode";
      case j:
        return "Suspense";
      case wl:
        return "SuspenseList";
      case Vl:
        return "Activity";
    }
    if (typeof l == "object")
      switch (l.$$typeof) {
        case Nl:
          return "Portal";
        case Al:
          return (l.displayName || "Context") + ".Provider";
        case it:
          return (l._context.displayName || "Context") + ".Consumer";
        case jl:
          var t = l.render;
          return l = l.displayName, l || (l = t.displayName || t.name || "", l = l !== "" ? "ForwardRef(" + l + ")" : "ForwardRef"), l;
        case Hl:
          return t = l.displayName || null, t !== null ? t : xt(l.type) || "Memo";
        case yl:
          t = l._payload, l = l._init;
          try {
            return xt(l(t));
          } catch {
          }
      }
    return null;
  }
  var zl = Array.isArray, b = K.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, d = C.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, M = {
    pending: !1,
    data: null,
    method: null,
    action: null
  }, J = [], s = -1;
  function T(l) {
    return { current: l };
  }
  function D(l) {
    0 > s || (l.current = J[s], J[s] = null, s--);
  }
  function _(l, t) {
    s++, J[s] = l.current, l.current = t;
  }
  var w = T(null), $ = T(null), Y = T(null), Fl = T(null);
  function il(l, t) {
    switch (_(Y, t), _($, l), _(w, null), t.nodeType) {
      case 9:
      case 11:
        l = (l = t.documentElement) && (l = l.namespaceURI) ? Mr(l) : 0;
        break;
      default:
        if (l = t.tagName, t = t.namespaceURI)
          t = Mr(t), l = _r(t, l);
        else
          switch (l) {
            case "svg":
              l = 1;
              break;
            case "math":
              l = 2;
              break;
            default:
              l = 0;
          }
    }
    D(w), _(w, l);
  }
  function Kt() {
    D(w), D($), D(Y);
  }
  function qn(l) {
    l.memoizedState !== null && _(Fl, l);
    var t = w.current, e = _r(t, l.type);
    t !== e && (_($, l), _(w, e));
  }
  function bu(l) {
    $.current === l && (D(w), D($)), Fl.current === l && (D(Fl), du._currentValue = M);
  }
  var Bn = Object.prototype.hasOwnProperty, Yn = O.unstable_scheduleCallback, Gn = O.unstable_cancelCallback, od = O.unstable_shouldYield, rd = O.unstable_requestPaint, At = O.unstable_now, dd = O.unstable_getCurrentPriorityLevel, ni = O.unstable_ImmediatePriority, ci = O.unstable_UserBlockingPriority, Su = O.unstable_NormalPriority, md = O.unstable_LowPriority, fi = O.unstable_IdlePriority, vd = O.log, yd = O.unstable_setDisableYieldValue, Ea = null, Il = null;
  function Jt(l) {
    if (typeof vd == "function" && yd(l), Il && typeof Il.setStrictMode == "function")
      try {
        Il.setStrictMode(Ea, l);
      } catch {
      }
  }
  var Pl = Math.clz32 ? Math.clz32 : bd, hd = Math.log, gd = Math.LN2;
  function bd(l) {
    return l >>>= 0, l === 0 ? 32 : 31 - (hd(l) / gd | 0) | 0;
  }
  var Eu = 256, pu = 4194304;
  function ge(l) {
    var t = l & 42;
    if (t !== 0) return t;
    switch (l & -l) {
      case 1:
        return 1;
      case 2:
        return 2;
      case 4:
        return 4;
      case 8:
        return 8;
      case 16:
        return 16;
      case 32:
        return 32;
      case 64:
        return 64;
      case 128:
        return 128;
      case 256:
      case 512:
      case 1024:
      case 2048:
      case 4096:
      case 8192:
      case 16384:
      case 32768:
      case 65536:
      case 131072:
      case 262144:
      case 524288:
      case 1048576:
      case 2097152:
        return l & 4194048;
      case 4194304:
      case 8388608:
      case 16777216:
      case 33554432:
        return l & 62914560;
      case 67108864:
        return 67108864;
      case 134217728:
        return 134217728;
      case 268435456:
        return 268435456;
      case 536870912:
        return 536870912;
      case 1073741824:
        return 0;
      default:
        return l;
    }
  }
  function Tu(l, t, e) {
    var a = l.pendingLanes;
    if (a === 0) return 0;
    var u = 0, n = l.suspendedLanes, c = l.pingedLanes;
    l = l.warmLanes;
    var f = a & 134217727;
    return f !== 0 ? (a = f & ~n, a !== 0 ? u = ge(a) : (c &= f, c !== 0 ? u = ge(c) : e || (e = f & ~l, e !== 0 && (u = ge(e))))) : (f = a & ~n, f !== 0 ? u = ge(f) : c !== 0 ? u = ge(c) : e || (e = a & ~l, e !== 0 && (u = ge(e)))), u === 0 ? 0 : t !== 0 && t !== u && (t & n) === 0 && (n = u & -u, e = t & -t, n >= e || n === 32 && (e & 4194048) !== 0) ? t : u;
  }
  function pa(l, t) {
    return (l.pendingLanes & ~(l.suspendedLanes & ~l.pingedLanes) & t) === 0;
  }
  function Sd(l, t) {
    switch (l) {
      case 1:
      case 2:
      case 4:
      case 8:
      case 64:
        return t + 250;
      case 16:
      case 32:
      case 128:
      case 256:
      case 512:
      case 1024:
      case 2048:
      case 4096:
      case 8192:
      case 16384:
      case 32768:
      case 65536:
      case 131072:
      case 262144:
      case 524288:
      case 1048576:
      case 2097152:
        return t + 5e3;
      case 4194304:
      case 8388608:
      case 16777216:
      case 33554432:
        return -1;
      case 67108864:
      case 134217728:
      case 268435456:
      case 536870912:
      case 1073741824:
        return -1;
      default:
        return -1;
    }
  }
  function ii() {
    var l = Eu;
    return Eu <<= 1, (Eu & 4194048) === 0 && (Eu = 256), l;
  }
  function si() {
    var l = pu;
    return pu <<= 1, (pu & 62914560) === 0 && (pu = 4194304), l;
  }
  function Xn(l) {
    for (var t = [], e = 0; 31 > e; e++) t.push(l);
    return t;
  }
  function Ta(l, t) {
    l.pendingLanes |= t, t !== 268435456 && (l.suspendedLanes = 0, l.pingedLanes = 0, l.warmLanes = 0);
  }
  function Ed(l, t, e, a, u, n) {
    var c = l.pendingLanes;
    l.pendingLanes = e, l.suspendedLanes = 0, l.pingedLanes = 0, l.warmLanes = 0, l.expiredLanes &= e, l.entangledLanes &= e, l.errorRecoveryDisabledLanes &= e, l.shellSuspendCounter = 0;
    var f = l.entanglements, i = l.expirationTimes, v = l.hiddenUpdates;
    for (e = c & ~e; 0 < e; ) {
      var S = 31 - Pl(e), p = 1 << S;
      f[S] = 0, i[S] = -1;
      var y = v[S];
      if (y !== null)
        for (v[S] = null, S = 0; S < y.length; S++) {
          var h = y[S];
          h !== null && (h.lane &= -536870913);
        }
      e &= ~p;
    }
    a !== 0 && oi(l, a, 0), n !== 0 && u === 0 && l.tag !== 0 && (l.suspendedLanes |= n & ~(c & ~t));
  }
  function oi(l, t, e) {
    l.pendingLanes |= t, l.suspendedLanes &= ~t;
    var a = 31 - Pl(t);
    l.entangledLanes |= t, l.entanglements[a] = l.entanglements[a] | 1073741824 | e & 4194090;
  }
  function ri(l, t) {
    var e = l.entangledLanes |= t;
    for (l = l.entanglements; e; ) {
      var a = 31 - Pl(e), u = 1 << a;
      u & t | l[a] & t && (l[a] |= t), e &= ~u;
    }
  }
  function Qn(l) {
    switch (l) {
      case 2:
        l = 1;
        break;
      case 8:
        l = 4;
        break;
      case 32:
        l = 16;
        break;
      case 256:
      case 512:
      case 1024:
      case 2048:
      case 4096:
      case 8192:
      case 16384:
      case 32768:
      case 65536:
      case 131072:
      case 262144:
      case 524288:
      case 1048576:
      case 2097152:
      case 4194304:
      case 8388608:
      case 16777216:
      case 33554432:
        l = 128;
        break;
      case 268435456:
        l = 134217728;
        break;
      default:
        l = 0;
    }
    return l;
  }
  function Cn(l) {
    return l &= -l, 2 < l ? 8 < l ? (l & 134217727) !== 0 ? 32 : 268435456 : 8 : 2;
  }
  function di() {
    var l = d.p;
    return l !== 0 ? l : (l = window.event, l === void 0 ? 32 : Kr(l.type));
  }
  function pd(l, t) {
    var e = d.p;
    try {
      return d.p = l, t();
    } finally {
      d.p = e;
    }
  }
  var kt = Math.random().toString(36).slice(2), Xl = "__reactFiber$" + kt, Ll = "__reactProps$" + kt, qe = "__reactContainer$" + kt, jn = "__reactEvents$" + kt, Td = "__reactListeners$" + kt, Ad = "__reactHandles$" + kt, mi = "__reactResources$" + kt, Aa = "__reactMarker$" + kt;
  function Zn(l) {
    delete l[Xl], delete l[Ll], delete l[jn], delete l[Td], delete l[Ad];
  }
  function Be(l) {
    var t = l[Xl];
    if (t) return t;
    for (var e = l.parentNode; e; ) {
      if (t = e[qe] || e[Xl]) {
        if (e = t.alternate, t.child !== null || e !== null && e.child !== null)
          for (l = Nr(l); l !== null; ) {
            if (e = l[Xl]) return e;
            l = Nr(l);
          }
        return t;
      }
      l = e, e = l.parentNode;
    }
    return null;
  }
  function Ye(l) {
    if (l = l[Xl] || l[qe]) {
      var t = l.tag;
      if (t === 5 || t === 6 || t === 13 || t === 26 || t === 27 || t === 3)
        return l;
    }
    return null;
  }
  function za(l) {
    var t = l.tag;
    if (t === 5 || t === 26 || t === 27 || t === 6) return l.stateNode;
    throw Error(g(33));
  }
  function Ge(l) {
    var t = l[mi];
    return t || (t = l[mi] = { hoistableStyles: /* @__PURE__ */ new Map(), hoistableScripts: /* @__PURE__ */ new Map() }), t;
  }
  function _l(l) {
    l[Aa] = !0;
  }
  var vi = /* @__PURE__ */ new Set(), yi = {};
  function be(l, t) {
    Xe(l, t), Xe(l + "Capture", t);
  }
  function Xe(l, t) {
    for (yi[l] = t, l = 0; l < t.length; l++)
      vi.add(t[l]);
  }
  var zd = RegExp(
    "^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
  ), hi = {}, gi = {};
  function Od(l) {
    return Bn.call(gi, l) ? !0 : Bn.call(hi, l) ? !1 : zd.test(l) ? gi[l] = !0 : (hi[l] = !0, !1);
  }
  function Au(l, t, e) {
    if (Od(t))
      if (e === null) l.removeAttribute(t);
      else {
        switch (typeof e) {
          case "undefined":
          case "function":
          case "symbol":
            l.removeAttribute(t);
            return;
          case "boolean":
            var a = t.toLowerCase().slice(0, 5);
            if (a !== "data-" && a !== "aria-") {
              l.removeAttribute(t);
              return;
            }
        }
        l.setAttribute(t, "" + e);
      }
  }
  function zu(l, t, e) {
    if (e === null) l.removeAttribute(t);
    else {
      switch (typeof e) {
        case "undefined":
        case "function":
        case "symbol":
        case "boolean":
          l.removeAttribute(t);
          return;
      }
      l.setAttribute(t, "" + e);
    }
  }
  function Nt(l, t, e, a) {
    if (a === null) l.removeAttribute(e);
    else {
      switch (typeof a) {
        case "undefined":
        case "function":
        case "symbol":
        case "boolean":
          l.removeAttribute(e);
          return;
      }
      l.setAttributeNS(t, e, "" + a);
    }
  }
  var Vn, bi;
  function Qe(l) {
    if (Vn === void 0)
      try {
        throw Error();
      } catch (e) {
        var t = e.stack.trim().match(/\n( *(at )?)/);
        Vn = t && t[1] || "", bi = -1 < e.stack.indexOf(`
    at`) ? " (<anonymous>)" : -1 < e.stack.indexOf("@") ? "@unknown:0:0" : "";
      }
    return `
` + Vn + l + bi;
  }
  var Ln = !1;
  function Kn(l, t) {
    if (!l || Ln) return "";
    Ln = !0;
    var e = Error.prepareStackTrace;
    Error.prepareStackTrace = void 0;
    try {
      var a = {
        DetermineComponentFrameRoot: function() {
          try {
            if (t) {
              var p = function() {
                throw Error();
              };
              if (Object.defineProperty(p.prototype, "props", {
                set: function() {
                  throw Error();
                }
              }), typeof Reflect == "object" && Reflect.construct) {
                try {
                  Reflect.construct(p, []);
                } catch (h) {
                  var y = h;
                }
                Reflect.construct(l, [], p);
              } else {
                try {
                  p.call();
                } catch (h) {
                  y = h;
                }
                l.call(p.prototype);
              }
            } else {
              try {
                throw Error();
              } catch (h) {
                y = h;
              }
              (p = l()) && typeof p.catch == "function" && p.catch(function() {
              });
            }
          } catch (h) {
            if (h && y && typeof h.stack == "string")
              return [h.stack, y.stack];
          }
          return [null, null];
        }
      };
      a.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
      var u = Object.getOwnPropertyDescriptor(
        a.DetermineComponentFrameRoot,
        "name"
      );
      u && u.configurable && Object.defineProperty(
        a.DetermineComponentFrameRoot,
        "name",
        { value: "DetermineComponentFrameRoot" }
      );
      var n = a.DetermineComponentFrameRoot(), c = n[0], f = n[1];
      if (c && f) {
        var i = c.split(`
`), v = f.split(`
`);
        for (u = a = 0; a < i.length && !i[a].includes("DetermineComponentFrameRoot"); )
          a++;
        for (; u < v.length && !v[u].includes(
          "DetermineComponentFrameRoot"
        ); )
          u++;
        if (a === i.length || u === v.length)
          for (a = i.length - 1, u = v.length - 1; 1 <= a && 0 <= u && i[a] !== v[u]; )
            u--;
        for (; 1 <= a && 0 <= u; a--, u--)
          if (i[a] !== v[u]) {
            if (a !== 1 || u !== 1)
              do
                if (a--, u--, 0 > u || i[a] !== v[u]) {
                  var S = `
` + i[a].replace(" at new ", " at ");
                  return l.displayName && S.includes("<anonymous>") && (S = S.replace("<anonymous>", l.displayName)), S;
                }
              while (1 <= a && 0 <= u);
            break;
          }
      }
    } finally {
      Ln = !1, Error.prepareStackTrace = e;
    }
    return (e = l ? l.displayName || l.name : "") ? Qe(e) : "";
  }
  function Md(l) {
    switch (l.tag) {
      case 26:
      case 27:
      case 5:
        return Qe(l.type);
      case 16:
        return Qe("Lazy");
      case 13:
        return Qe("Suspense");
      case 19:
        return Qe("SuspenseList");
      case 0:
      case 15:
        return Kn(l.type, !1);
      case 11:
        return Kn(l.type.render, !1);
      case 1:
        return Kn(l.type, !0);
      case 31:
        return Qe("Activity");
      default:
        return "";
    }
  }
  function Si(l) {
    try {
      var t = "";
      do
        t += Md(l), l = l.return;
      while (l);
      return t;
    } catch (e) {
      return `
Error generating stack: ` + e.message + `
` + e.stack;
    }
  }
  function ot(l) {
    switch (typeof l) {
      case "bigint":
      case "boolean":
      case "number":
      case "string":
      case "undefined":
        return l;
      case "object":
        return l;
      default:
        return "";
    }
  }
  function Ei(l) {
    var t = l.type;
    return (l = l.nodeName) && l.toLowerCase() === "input" && (t === "checkbox" || t === "radio");
  }
  function _d(l) {
    var t = Ei(l) ? "checked" : "value", e = Object.getOwnPropertyDescriptor(
      l.constructor.prototype,
      t
    ), a = "" + l[t];
    if (!l.hasOwnProperty(t) && typeof e < "u" && typeof e.get == "function" && typeof e.set == "function") {
      var u = e.get, n = e.set;
      return Object.defineProperty(l, t, {
        configurable: !0,
        get: function() {
          return u.call(this);
        },
        set: function(c) {
          a = "" + c, n.call(this, c);
        }
      }), Object.defineProperty(l, t, {
        enumerable: e.enumerable
      }), {
        getValue: function() {
          return a;
        },
        setValue: function(c) {
          a = "" + c;
        },
        stopTracking: function() {
          l._valueTracker = null, delete l[t];
        }
      };
    }
  }
  function Ou(l) {
    l._valueTracker || (l._valueTracker = _d(l));
  }
  function pi(l) {
    if (!l) return !1;
    var t = l._valueTracker;
    if (!t) return !0;
    var e = t.getValue(), a = "";
    return l && (a = Ei(l) ? l.checked ? "true" : "false" : l.value), l = a, l !== e ? (t.setValue(l), !0) : !1;
  }
  function Mu(l) {
    if (l = l || (typeof document < "u" ? document : void 0), typeof l > "u") return null;
    try {
      return l.activeElement || l.body;
    } catch {
      return l.body;
    }
  }
  var Dd = /[\n"\\]/g;
  function rt(l) {
    return l.replace(
      Dd,
      function(t) {
        return "\\" + t.charCodeAt(0).toString(16) + " ";
      }
    );
  }
  function Jn(l, t, e, a, u, n, c, f) {
    l.name = "", c != null && typeof c != "function" && typeof c != "symbol" && typeof c != "boolean" ? l.type = c : l.removeAttribute("type"), t != null ? c === "number" ? (t === 0 && l.value === "" || l.value != t) && (l.value = "" + ot(t)) : l.value !== "" + ot(t) && (l.value = "" + ot(t)) : c !== "submit" && c !== "reset" || l.removeAttribute("value"), t != null ? kn(l, c, ot(t)) : e != null ? kn(l, c, ot(e)) : a != null && l.removeAttribute("value"), u == null && n != null && (l.defaultChecked = !!n), u != null && (l.checked = u && typeof u != "function" && typeof u != "symbol"), f != null && typeof f != "function" && typeof f != "symbol" && typeof f != "boolean" ? l.name = "" + ot(f) : l.removeAttribute("name");
  }
  function Ti(l, t, e, a, u, n, c, f) {
    if (n != null && typeof n != "function" && typeof n != "symbol" && typeof n != "boolean" && (l.type = n), t != null || e != null) {
      if (!(n !== "submit" && n !== "reset" || t != null))
        return;
      e = e != null ? "" + ot(e) : "", t = t != null ? "" + ot(t) : e, f || t === l.value || (l.value = t), l.defaultValue = t;
    }
    a = a ?? u, a = typeof a != "function" && typeof a != "symbol" && !!a, l.checked = f ? l.checked : !!a, l.defaultChecked = !!a, c != null && typeof c != "function" && typeof c != "symbol" && typeof c != "boolean" && (l.name = c);
  }
  function kn(l, t, e) {
    t === "number" && Mu(l.ownerDocument) === l || l.defaultValue === "" + e || (l.defaultValue = "" + e);
  }
  function Ce(l, t, e, a) {
    if (l = l.options, t) {
      t = {};
      for (var u = 0; u < e.length; u++)
        t["$" + e[u]] = !0;
      for (e = 0; e < l.length; e++)
        u = t.hasOwnProperty("$" + l[e].value), l[e].selected !== u && (l[e].selected = u), u && a && (l[e].defaultSelected = !0);
    } else {
      for (e = "" + ot(e), t = null, u = 0; u < l.length; u++) {
        if (l[u].value === e) {
          l[u].selected = !0, a && (l[u].defaultSelected = !0);
          return;
        }
        t !== null || l[u].disabled || (t = l[u]);
      }
      t !== null && (t.selected = !0);
    }
  }
  function Ai(l, t, e) {
    if (t != null && (t = "" + ot(t), t !== l.value && (l.value = t), e == null)) {
      l.defaultValue !== t && (l.defaultValue = t);
      return;
    }
    l.defaultValue = e != null ? "" + ot(e) : "";
  }
  function zi(l, t, e, a) {
    if (t == null) {
      if (a != null) {
        if (e != null) throw Error(g(92));
        if (zl(a)) {
          if (1 < a.length) throw Error(g(93));
          a = a[0];
        }
        e = a;
      }
      e == null && (e = ""), t = e;
    }
    e = ot(t), l.defaultValue = e, a = l.textContent, a === e && a !== "" && a !== null && (l.value = a);
  }
  function je(l, t) {
    if (t) {
      var e = l.firstChild;
      if (e && e === l.lastChild && e.nodeType === 3) {
        e.nodeValue = t;
        return;
      }
    }
    l.textContent = t;
  }
  var Ud = new Set(
    "animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(
      " "
    )
  );
  function Oi(l, t, e) {
    var a = t.indexOf("--") === 0;
    e == null || typeof e == "boolean" || e === "" ? a ? l.setProperty(t, "") : t === "float" ? l.cssFloat = "" : l[t] = "" : a ? l.setProperty(t, e) : typeof e != "number" || e === 0 || Ud.has(t) ? t === "float" ? l.cssFloat = e : l[t] = ("" + e).trim() : l[t] = e + "px";
  }
  function Mi(l, t, e) {
    if (t != null && typeof t != "object")
      throw Error(g(62));
    if (l = l.style, e != null) {
      for (var a in e)
        !e.hasOwnProperty(a) || t != null && t.hasOwnProperty(a) || (a.indexOf("--") === 0 ? l.setProperty(a, "") : a === "float" ? l.cssFloat = "" : l[a] = "");
      for (var u in t)
        a = t[u], t.hasOwnProperty(u) && e[u] !== a && Oi(l, u, a);
    } else
      for (var n in t)
        t.hasOwnProperty(n) && Oi(l, n, t[n]);
  }
  function Wn(l) {
    if (l.indexOf("-") === -1) return !1;
    switch (l) {
      case "annotation-xml":
      case "color-profile":
      case "font-face":
      case "font-face-src":
      case "font-face-uri":
      case "font-face-format":
      case "font-face-name":
      case "missing-glyph":
        return !1;
      default:
        return !0;
    }
  }
  var xd = /* @__PURE__ */ new Map([
    ["acceptCharset", "accept-charset"],
    ["htmlFor", "for"],
    ["httpEquiv", "http-equiv"],
    ["crossOrigin", "crossorigin"],
    ["accentHeight", "accent-height"],
    ["alignmentBaseline", "alignment-baseline"],
    ["arabicForm", "arabic-form"],
    ["baselineShift", "baseline-shift"],
    ["capHeight", "cap-height"],
    ["clipPath", "clip-path"],
    ["clipRule", "clip-rule"],
    ["colorInterpolation", "color-interpolation"],
    ["colorInterpolationFilters", "color-interpolation-filters"],
    ["colorProfile", "color-profile"],
    ["colorRendering", "color-rendering"],
    ["dominantBaseline", "dominant-baseline"],
    ["enableBackground", "enable-background"],
    ["fillOpacity", "fill-opacity"],
    ["fillRule", "fill-rule"],
    ["floodColor", "flood-color"],
    ["floodOpacity", "flood-opacity"],
    ["fontFamily", "font-family"],
    ["fontSize", "font-size"],
    ["fontSizeAdjust", "font-size-adjust"],
    ["fontStretch", "font-stretch"],
    ["fontStyle", "font-style"],
    ["fontVariant", "font-variant"],
    ["fontWeight", "font-weight"],
    ["glyphName", "glyph-name"],
    ["glyphOrientationHorizontal", "glyph-orientation-horizontal"],
    ["glyphOrientationVertical", "glyph-orientation-vertical"],
    ["horizAdvX", "horiz-adv-x"],
    ["horizOriginX", "horiz-origin-x"],
    ["imageRendering", "image-rendering"],
    ["letterSpacing", "letter-spacing"],
    ["lightingColor", "lighting-color"],
    ["markerEnd", "marker-end"],
    ["markerMid", "marker-mid"],
    ["markerStart", "marker-start"],
    ["overlinePosition", "overline-position"],
    ["overlineThickness", "overline-thickness"],
    ["paintOrder", "paint-order"],
    ["panose-1", "panose-1"],
    ["pointerEvents", "pointer-events"],
    ["renderingIntent", "rendering-intent"],
    ["shapeRendering", "shape-rendering"],
    ["stopColor", "stop-color"],
    ["stopOpacity", "stop-opacity"],
    ["strikethroughPosition", "strikethrough-position"],
    ["strikethroughThickness", "strikethrough-thickness"],
    ["strokeDasharray", "stroke-dasharray"],
    ["strokeDashoffset", "stroke-dashoffset"],
    ["strokeLinecap", "stroke-linecap"],
    ["strokeLinejoin", "stroke-linejoin"],
    ["strokeMiterlimit", "stroke-miterlimit"],
    ["strokeOpacity", "stroke-opacity"],
    ["strokeWidth", "stroke-width"],
    ["textAnchor", "text-anchor"],
    ["textDecoration", "text-decoration"],
    ["textRendering", "text-rendering"],
    ["transformOrigin", "transform-origin"],
    ["underlinePosition", "underline-position"],
    ["underlineThickness", "underline-thickness"],
    ["unicodeBidi", "unicode-bidi"],
    ["unicodeRange", "unicode-range"],
    ["unitsPerEm", "units-per-em"],
    ["vAlphabetic", "v-alphabetic"],
    ["vHanging", "v-hanging"],
    ["vIdeographic", "v-ideographic"],
    ["vMathematical", "v-mathematical"],
    ["vectorEffect", "vector-effect"],
    ["vertAdvY", "vert-adv-y"],
    ["vertOriginX", "vert-origin-x"],
    ["vertOriginY", "vert-origin-y"],
    ["wordSpacing", "word-spacing"],
    ["writingMode", "writing-mode"],
    ["xmlnsXlink", "xmlns:xlink"],
    ["xHeight", "x-height"]
  ]), Nd = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
  function _u(l) {
    return Nd.test("" + l) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : l;
  }
  var $n = null;
  function Fn(l) {
    return l = l.target || l.srcElement || window, l.correspondingUseElement && (l = l.correspondingUseElement), l.nodeType === 3 ? l.parentNode : l;
  }
  var Ze = null, Ve = null;
  function _i(l) {
    var t = Ye(l);
    if (t && (l = t.stateNode)) {
      var e = l[Ll] || null;
      l: switch (l = t.stateNode, t.type) {
        case "input":
          if (Jn(
            l,
            e.value,
            e.defaultValue,
            e.defaultValue,
            e.checked,
            e.defaultChecked,
            e.type,
            e.name
          ), t = e.name, e.type === "radio" && t != null) {
            for (e = l; e.parentNode; ) e = e.parentNode;
            for (e = e.querySelectorAll(
              'input[name="' + rt(
                "" + t
              ) + '"][type="radio"]'
            ), t = 0; t < e.length; t++) {
              var a = e[t];
              if (a !== l && a.form === l.form) {
                var u = a[Ll] || null;
                if (!u) throw Error(g(90));
                Jn(
                  a,
                  u.value,
                  u.defaultValue,
                  u.defaultValue,
                  u.checked,
                  u.defaultChecked,
                  u.type,
                  u.name
                );
              }
            }
            for (t = 0; t < e.length; t++)
              a = e[t], a.form === l.form && pi(a);
          }
          break l;
        case "textarea":
          Ai(l, e.value, e.defaultValue);
          break l;
        case "select":
          t = e.value, t != null && Ce(l, !!e.multiple, t, !1);
      }
    }
  }
  var In = !1;
  function Di(l, t, e) {
    if (In) return l(t, e);
    In = !0;
    try {
      var a = l(t);
      return a;
    } finally {
      if (In = !1, (Ze !== null || Ve !== null) && (mn(), Ze && (t = Ze, l = Ve, Ve = Ze = null, _i(t), l)))
        for (t = 0; t < l.length; t++) _i(l[t]);
    }
  }
  function Oa(l, t) {
    var e = l.stateNode;
    if (e === null) return null;
    var a = e[Ll] || null;
    if (a === null) return null;
    e = a[t];
    l: switch (t) {
      case "onClick":
      case "onClickCapture":
      case "onDoubleClick":
      case "onDoubleClickCapture":
      case "onMouseDown":
      case "onMouseDownCapture":
      case "onMouseMove":
      case "onMouseMoveCapture":
      case "onMouseUp":
      case "onMouseUpCapture":
      case "onMouseEnter":
        (a = !a.disabled) || (l = l.type, a = !(l === "button" || l === "input" || l === "select" || l === "textarea")), l = !a;
        break l;
      default:
        l = !1;
    }
    if (l) return null;
    if (e && typeof e != "function")
      throw Error(
        g(231, t, typeof e)
      );
    return e;
  }
  var Rt = !(typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u"), Pn = !1;
  if (Rt)
    try {
      var Ma = {};
      Object.defineProperty(Ma, "passive", {
        get: function() {
          Pn = !0;
        }
      }), window.addEventListener("test", Ma, Ma), window.removeEventListener("test", Ma, Ma);
    } catch {
      Pn = !1;
    }
  var Wt = null, lc = null, Du = null;
  function Ui() {
    if (Du) return Du;
    var l, t = lc, e = t.length, a, u = "value" in Wt ? Wt.value : Wt.textContent, n = u.length;
    for (l = 0; l < e && t[l] === u[l]; l++) ;
    var c = e - l;
    for (a = 1; a <= c && t[e - a] === u[n - a]; a++) ;
    return Du = u.slice(l, 1 < a ? 1 - a : void 0);
  }
  function Uu(l) {
    var t = l.keyCode;
    return "charCode" in l ? (l = l.charCode, l === 0 && t === 13 && (l = 13)) : l = t, l === 10 && (l = 13), 32 <= l || l === 13 ? l : 0;
  }
  function xu() {
    return !0;
  }
  function xi() {
    return !1;
  }
  function Kl(l) {
    function t(e, a, u, n, c) {
      this._reactName = e, this._targetInst = u, this.type = a, this.nativeEvent = n, this.target = c, this.currentTarget = null;
      for (var f in l)
        l.hasOwnProperty(f) && (e = l[f], this[f] = e ? e(n) : n[f]);
      return this.isDefaultPrevented = (n.defaultPrevented != null ? n.defaultPrevented : n.returnValue === !1) ? xu : xi, this.isPropagationStopped = xi, this;
    }
    return x(t.prototype, {
      preventDefault: function() {
        this.defaultPrevented = !0;
        var e = this.nativeEvent;
        e && (e.preventDefault ? e.preventDefault() : typeof e.returnValue != "unknown" && (e.returnValue = !1), this.isDefaultPrevented = xu);
      },
      stopPropagation: function() {
        var e = this.nativeEvent;
        e && (e.stopPropagation ? e.stopPropagation() : typeof e.cancelBubble != "unknown" && (e.cancelBubble = !0), this.isPropagationStopped = xu);
      },
      persist: function() {
      },
      isPersistent: xu
    }), t;
  }
  var Se = {
    eventPhase: 0,
    bubbles: 0,
    cancelable: 0,
    timeStamp: function(l) {
      return l.timeStamp || Date.now();
    },
    defaultPrevented: 0,
    isTrusted: 0
  }, Nu = Kl(Se), _a = x({}, Se, { view: 0, detail: 0 }), Rd = Kl(_a), tc, ec, Da, Ru = x({}, _a, {
    screenX: 0,
    screenY: 0,
    clientX: 0,
    clientY: 0,
    pageX: 0,
    pageY: 0,
    ctrlKey: 0,
    shiftKey: 0,
    altKey: 0,
    metaKey: 0,
    getModifierState: uc,
    button: 0,
    buttons: 0,
    relatedTarget: function(l) {
      return l.relatedTarget === void 0 ? l.fromElement === l.srcElement ? l.toElement : l.fromElement : l.relatedTarget;
    },
    movementX: function(l) {
      return "movementX" in l ? l.movementX : (l !== Da && (Da && l.type === "mousemove" ? (tc = l.screenX - Da.screenX, ec = l.screenY - Da.screenY) : ec = tc = 0, Da = l), tc);
    },
    movementY: function(l) {
      return "movementY" in l ? l.movementY : ec;
    }
  }), Ni = Kl(Ru), wd = x({}, Ru, { dataTransfer: 0 }), Hd = Kl(wd), qd = x({}, _a, { relatedTarget: 0 }), ac = Kl(qd), Bd = x({}, Se, {
    animationName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  }), Yd = Kl(Bd), Gd = x({}, Se, {
    clipboardData: function(l) {
      return "clipboardData" in l ? l.clipboardData : window.clipboardData;
    }
  }), Xd = Kl(Gd), Qd = x({}, Se, { data: 0 }), Ri = Kl(Qd), Cd = {
    Esc: "Escape",
    Spacebar: " ",
    Left: "ArrowLeft",
    Up: "ArrowUp",
    Right: "ArrowRight",
    Down: "ArrowDown",
    Del: "Delete",
    Win: "OS",
    Menu: "ContextMenu",
    Apps: "ContextMenu",
    Scroll: "ScrollLock",
    MozPrintableKey: "Unidentified"
  }, jd = {
    8: "Backspace",
    9: "Tab",
    12: "Clear",
    13: "Enter",
    16: "Shift",
    17: "Control",
    18: "Alt",
    19: "Pause",
    20: "CapsLock",
    27: "Escape",
    32: " ",
    33: "PageUp",
    34: "PageDown",
    35: "End",
    36: "Home",
    37: "ArrowLeft",
    38: "ArrowUp",
    39: "ArrowRight",
    40: "ArrowDown",
    45: "Insert",
    46: "Delete",
    112: "F1",
    113: "F2",
    114: "F3",
    115: "F4",
    116: "F5",
    117: "F6",
    118: "F7",
    119: "F8",
    120: "F9",
    121: "F10",
    122: "F11",
    123: "F12",
    144: "NumLock",
    145: "ScrollLock",
    224: "Meta"
  }, Zd = {
    Alt: "altKey",
    Control: "ctrlKey",
    Meta: "metaKey",
    Shift: "shiftKey"
  };
  function Vd(l) {
    var t = this.nativeEvent;
    return t.getModifierState ? t.getModifierState(l) : (l = Zd[l]) ? !!t[l] : !1;
  }
  function uc() {
    return Vd;
  }
  var Ld = x({}, _a, {
    key: function(l) {
      if (l.key) {
        var t = Cd[l.key] || l.key;
        if (t !== "Unidentified") return t;
      }
      return l.type === "keypress" ? (l = Uu(l), l === 13 ? "Enter" : String.fromCharCode(l)) : l.type === "keydown" || l.type === "keyup" ? jd[l.keyCode] || "Unidentified" : "";
    },
    code: 0,
    location: 0,
    ctrlKey: 0,
    shiftKey: 0,
    altKey: 0,
    metaKey: 0,
    repeat: 0,
    locale: 0,
    getModifierState: uc,
    charCode: function(l) {
      return l.type === "keypress" ? Uu(l) : 0;
    },
    keyCode: function(l) {
      return l.type === "keydown" || l.type === "keyup" ? l.keyCode : 0;
    },
    which: function(l) {
      return l.type === "keypress" ? Uu(l) : l.type === "keydown" || l.type === "keyup" ? l.keyCode : 0;
    }
  }), Kd = Kl(Ld), Jd = x({}, Ru, {
    pointerId: 0,
    width: 0,
    height: 0,
    pressure: 0,
    tangentialPressure: 0,
    tiltX: 0,
    tiltY: 0,
    twist: 0,
    pointerType: 0,
    isPrimary: 0
  }), wi = Kl(Jd), kd = x({}, _a, {
    touches: 0,
    targetTouches: 0,
    changedTouches: 0,
    altKey: 0,
    metaKey: 0,
    ctrlKey: 0,
    shiftKey: 0,
    getModifierState: uc
  }), Wd = Kl(kd), $d = x({}, Se, {
    propertyName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  }), Fd = Kl($d), Id = x({}, Ru, {
    deltaX: function(l) {
      return "deltaX" in l ? l.deltaX : "wheelDeltaX" in l ? -l.wheelDeltaX : 0;
    },
    deltaY: function(l) {
      return "deltaY" in l ? l.deltaY : "wheelDeltaY" in l ? -l.wheelDeltaY : "wheelDelta" in l ? -l.wheelDelta : 0;
    },
    deltaZ: 0,
    deltaMode: 0
  }), Pd = Kl(Id), l0 = x({}, Se, {
    newState: 0,
    oldState: 0
  }), t0 = Kl(l0), e0 = [9, 13, 27, 32], nc = Rt && "CompositionEvent" in window, Ua = null;
  Rt && "documentMode" in document && (Ua = document.documentMode);
  var a0 = Rt && "TextEvent" in window && !Ua, Hi = Rt && (!nc || Ua && 8 < Ua && 11 >= Ua), qi = " ", Bi = !1;
  function Yi(l, t) {
    switch (l) {
      case "keyup":
        return e0.indexOf(t.keyCode) !== -1;
      case "keydown":
        return t.keyCode !== 229;
      case "keypress":
      case "mousedown":
      case "focusout":
        return !0;
      default:
        return !1;
    }
  }
  function Gi(l) {
    return l = l.detail, typeof l == "object" && "data" in l ? l.data : null;
  }
  var Le = !1;
  function u0(l, t) {
    switch (l) {
      case "compositionend":
        return Gi(t);
      case "keypress":
        return t.which !== 32 ? null : (Bi = !0, qi);
      case "textInput":
        return l = t.data, l === qi && Bi ? null : l;
      default:
        return null;
    }
  }
  function n0(l, t) {
    if (Le)
      return l === "compositionend" || !nc && Yi(l, t) ? (l = Ui(), Du = lc = Wt = null, Le = !1, l) : null;
    switch (l) {
      case "paste":
        return null;
      case "keypress":
        if (!(t.ctrlKey || t.altKey || t.metaKey) || t.ctrlKey && t.altKey) {
          if (t.char && 1 < t.char.length)
            return t.char;
          if (t.which) return String.fromCharCode(t.which);
        }
        return null;
      case "compositionend":
        return Hi && t.locale !== "ko" ? null : t.data;
      default:
        return null;
    }
  }
  var c0 = {
    color: !0,
    date: !0,
    datetime: !0,
    "datetime-local": !0,
    email: !0,
    month: !0,
    number: !0,
    password: !0,
    range: !0,
    search: !0,
    tel: !0,
    text: !0,
    time: !0,
    url: !0,
    week: !0
  };
  function Xi(l) {
    var t = l && l.nodeName && l.nodeName.toLowerCase();
    return t === "input" ? !!c0[l.type] : t === "textarea";
  }
  function Qi(l, t, e, a) {
    Ze ? Ve ? Ve.push(a) : Ve = [a] : Ze = a, t = Sn(t, "onChange"), 0 < t.length && (e = new Nu(
      "onChange",
      "change",
      null,
      e,
      a
    ), l.push({ event: e, listeners: t }));
  }
  var xa = null, Na = null;
  function f0(l) {
    pr(l, 0);
  }
  function wu(l) {
    var t = za(l);
    if (pi(t)) return l;
  }
  function Ci(l, t) {
    if (l === "change") return t;
  }
  var ji = !1;
  if (Rt) {
    var cc;
    if (Rt) {
      var fc = "oninput" in document;
      if (!fc) {
        var Zi = document.createElement("div");
        Zi.setAttribute("oninput", "return;"), fc = typeof Zi.oninput == "function";
      }
      cc = fc;
    } else cc = !1;
    ji = cc && (!document.documentMode || 9 < document.documentMode);
  }
  function Vi() {
    xa && (xa.detachEvent("onpropertychange", Li), Na = xa = null);
  }
  function Li(l) {
    if (l.propertyName === "value" && wu(Na)) {
      var t = [];
      Qi(
        t,
        Na,
        l,
        Fn(l)
      ), Di(f0, t);
    }
  }
  function i0(l, t, e) {
    l === "focusin" ? (Vi(), xa = t, Na = e, xa.attachEvent("onpropertychange", Li)) : l === "focusout" && Vi();
  }
  function s0(l) {
    if (l === "selectionchange" || l === "keyup" || l === "keydown")
      return wu(Na);
  }
  function o0(l, t) {
    if (l === "click") return wu(t);
  }
  function r0(l, t) {
    if (l === "input" || l === "change")
      return wu(t);
  }
  function d0(l, t) {
    return l === t && (l !== 0 || 1 / l === 1 / t) || l !== l && t !== t;
  }
  var lt = typeof Object.is == "function" ? Object.is : d0;
  function Ra(l, t) {
    if (lt(l, t)) return !0;
    if (typeof l != "object" || l === null || typeof t != "object" || t === null)
      return !1;
    var e = Object.keys(l), a = Object.keys(t);
    if (e.length !== a.length) return !1;
    for (a = 0; a < e.length; a++) {
      var u = e[a];
      if (!Bn.call(t, u) || !lt(l[u], t[u]))
        return !1;
    }
    return !0;
  }
  function Ki(l) {
    for (; l && l.firstChild; ) l = l.firstChild;
    return l;
  }
  function Ji(l, t) {
    var e = Ki(l);
    l = 0;
    for (var a; e; ) {
      if (e.nodeType === 3) {
        if (a = l + e.textContent.length, l <= t && a >= t)
          return { node: e, offset: t - l };
        l = a;
      }
      l: {
        for (; e; ) {
          if (e.nextSibling) {
            e = e.nextSibling;
            break l;
          }
          e = e.parentNode;
        }
        e = void 0;
      }
      e = Ki(e);
    }
  }
  function ki(l, t) {
    return l && t ? l === t ? !0 : l && l.nodeType === 3 ? !1 : t && t.nodeType === 3 ? ki(l, t.parentNode) : "contains" in l ? l.contains(t) : l.compareDocumentPosition ? !!(l.compareDocumentPosition(t) & 16) : !1 : !1;
  }
  function Wi(l) {
    l = l != null && l.ownerDocument != null && l.ownerDocument.defaultView != null ? l.ownerDocument.defaultView : window;
    for (var t = Mu(l.document); t instanceof l.HTMLIFrameElement; ) {
      try {
        var e = typeof t.contentWindow.location.href == "string";
      } catch {
        e = !1;
      }
      if (e) l = t.contentWindow;
      else break;
      t = Mu(l.document);
    }
    return t;
  }
  function ic(l) {
    var t = l && l.nodeName && l.nodeName.toLowerCase();
    return t && (t === "input" && (l.type === "text" || l.type === "search" || l.type === "tel" || l.type === "url" || l.type === "password") || t === "textarea" || l.contentEditable === "true");
  }
  var m0 = Rt && "documentMode" in document && 11 >= document.documentMode, Ke = null, sc = null, wa = null, oc = !1;
  function $i(l, t, e) {
    var a = e.window === e ? e.document : e.nodeType === 9 ? e : e.ownerDocument;
    oc || Ke == null || Ke !== Mu(a) || (a = Ke, "selectionStart" in a && ic(a) ? a = { start: a.selectionStart, end: a.selectionEnd } : (a = (a.ownerDocument && a.ownerDocument.defaultView || window).getSelection(), a = {
      anchorNode: a.anchorNode,
      anchorOffset: a.anchorOffset,
      focusNode: a.focusNode,
      focusOffset: a.focusOffset
    }), wa && Ra(wa, a) || (wa = a, a = Sn(sc, "onSelect"), 0 < a.length && (t = new Nu(
      "onSelect",
      "select",
      null,
      t,
      e
    ), l.push({ event: t, listeners: a }), t.target = Ke)));
  }
  function Ee(l, t) {
    var e = {};
    return e[l.toLowerCase()] = t.toLowerCase(), e["Webkit" + l] = "webkit" + t, e["Moz" + l] = "moz" + t, e;
  }
  var Je = {
    animationend: Ee("Animation", "AnimationEnd"),
    animationiteration: Ee("Animation", "AnimationIteration"),
    animationstart: Ee("Animation", "AnimationStart"),
    transitionrun: Ee("Transition", "TransitionRun"),
    transitionstart: Ee("Transition", "TransitionStart"),
    transitioncancel: Ee("Transition", "TransitionCancel"),
    transitionend: Ee("Transition", "TransitionEnd")
  }, rc = {}, Fi = {};
  Rt && (Fi = document.createElement("div").style, "AnimationEvent" in window || (delete Je.animationend.animation, delete Je.animationiteration.animation, delete Je.animationstart.animation), "TransitionEvent" in window || delete Je.transitionend.transition);
  function pe(l) {
    if (rc[l]) return rc[l];
    if (!Je[l]) return l;
    var t = Je[l], e;
    for (e in t)
      if (t.hasOwnProperty(e) && e in Fi)
        return rc[l] = t[e];
    return l;
  }
  var Ii = pe("animationend"), Pi = pe("animationiteration"), ls = pe("animationstart"), v0 = pe("transitionrun"), y0 = pe("transitionstart"), h0 = pe("transitioncancel"), ts = pe("transitionend"), es = /* @__PURE__ */ new Map(), dc = "abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(
    " "
  );
  dc.push("scrollEnd");
  function St(l, t) {
    es.set(l, t), be(t, [l]);
  }
  var as = /* @__PURE__ */ new WeakMap();
  function dt(l, t) {
    if (typeof l == "object" && l !== null) {
      var e = as.get(l);
      return e !== void 0 ? e : (t = {
        value: l,
        source: t,
        stack: Si(t)
      }, as.set(l, t), t);
    }
    return {
      value: l,
      source: t,
      stack: Si(t)
    };
  }
  var mt = [], ke = 0, mc = 0;
  function Hu() {
    for (var l = ke, t = mc = ke = 0; t < l; ) {
      var e = mt[t];
      mt[t++] = null;
      var a = mt[t];
      mt[t++] = null;
      var u = mt[t];
      mt[t++] = null;
      var n = mt[t];
      if (mt[t++] = null, a !== null && u !== null) {
        var c = a.pending;
        c === null ? u.next = u : (u.next = c.next, c.next = u), a.pending = u;
      }
      n !== 0 && us(e, u, n);
    }
  }
  function qu(l, t, e, a) {
    mt[ke++] = l, mt[ke++] = t, mt[ke++] = e, mt[ke++] = a, mc |= a, l.lanes |= a, l = l.alternate, l !== null && (l.lanes |= a);
  }
  function vc(l, t, e, a) {
    return qu(l, t, e, a), Bu(l);
  }
  function We(l, t) {
    return qu(l, null, null, t), Bu(l);
  }
  function us(l, t, e) {
    l.lanes |= e;
    var a = l.alternate;
    a !== null && (a.lanes |= e);
    for (var u = !1, n = l.return; n !== null; )
      n.childLanes |= e, a = n.alternate, a !== null && (a.childLanes |= e), n.tag === 22 && (l = n.stateNode, l === null || l._visibility & 1 || (u = !0)), l = n, n = n.return;
    return l.tag === 3 ? (n = l.stateNode, u && t !== null && (u = 31 - Pl(e), l = n.hiddenUpdates, a = l[u], a === null ? l[u] = [t] : a.push(t), t.lane = e | 536870912), n) : null;
  }
  function Bu(l) {
    if (50 < uu)
      throw uu = 0, pf = null, Error(g(185));
    for (var t = l.return; t !== null; )
      l = t, t = l.return;
    return l.tag === 3 ? l.stateNode : null;
  }
  var $e = {};
  function g0(l, t, e, a) {
    this.tag = l, this.key = e, this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null, this.index = 0, this.refCleanup = this.ref = null, this.pendingProps = t, this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null, this.mode = a, this.subtreeFlags = this.flags = 0, this.deletions = null, this.childLanes = this.lanes = 0, this.alternate = null;
  }
  function tt(l, t, e, a) {
    return new g0(l, t, e, a);
  }
  function yc(l) {
    return l = l.prototype, !(!l || !l.isReactComponent);
  }
  function wt(l, t) {
    var e = l.alternate;
    return e === null ? (e = tt(
      l.tag,
      t,
      l.key,
      l.mode
    ), e.elementType = l.elementType, e.type = l.type, e.stateNode = l.stateNode, e.alternate = l, l.alternate = e) : (e.pendingProps = t, e.type = l.type, e.flags = 0, e.subtreeFlags = 0, e.deletions = null), e.flags = l.flags & 65011712, e.childLanes = l.childLanes, e.lanes = l.lanes, e.child = l.child, e.memoizedProps = l.memoizedProps, e.memoizedState = l.memoizedState, e.updateQueue = l.updateQueue, t = l.dependencies, e.dependencies = t === null ? null : { lanes: t.lanes, firstContext: t.firstContext }, e.sibling = l.sibling, e.index = l.index, e.ref = l.ref, e.refCleanup = l.refCleanup, e;
  }
  function ns(l, t) {
    l.flags &= 65011714;
    var e = l.alternate;
    return e === null ? (l.childLanes = 0, l.lanes = t, l.child = null, l.subtreeFlags = 0, l.memoizedProps = null, l.memoizedState = null, l.updateQueue = null, l.dependencies = null, l.stateNode = null) : (l.childLanes = e.childLanes, l.lanes = e.lanes, l.child = e.child, l.subtreeFlags = 0, l.deletions = null, l.memoizedProps = e.memoizedProps, l.memoizedState = e.memoizedState, l.updateQueue = e.updateQueue, l.type = e.type, t = e.dependencies, l.dependencies = t === null ? null : {
      lanes: t.lanes,
      firstContext: t.firstContext
    }), l;
  }
  function Yu(l, t, e, a, u, n) {
    var c = 0;
    if (a = l, typeof l == "function") yc(l) && (c = 1);
    else if (typeof l == "string")
      c = Sm(
        l,
        e,
        w.current
      ) ? 26 : l === "html" || l === "head" || l === "body" ? 27 : 5;
    else
      l: switch (l) {
        case Vl:
          return l = tt(31, e, t, u), l.elementType = Vl, l.lanes = n, l;
        case rl:
          return Te(e.children, u, n, t);
        case $l:
          c = 8, u |= 24;
          break;
        case Rl:
          return l = tt(12, e, t, u | 2), l.elementType = Rl, l.lanes = n, l;
        case j:
          return l = tt(13, e, t, u), l.elementType = j, l.lanes = n, l;
        case wl:
          return l = tt(19, e, t, u), l.elementType = wl, l.lanes = n, l;
        default:
          if (typeof l == "object" && l !== null)
            switch (l.$$typeof) {
              case Tt:
              case Al:
                c = 10;
                break l;
              case it:
                c = 9;
                break l;
              case jl:
                c = 11;
                break l;
              case Hl:
                c = 14;
                break l;
              case yl:
                c = 16, a = null;
                break l;
            }
          c = 29, e = Error(
            g(130, l === null ? "null" : typeof l, "")
          ), a = null;
      }
    return t = tt(c, e, t, u), t.elementType = l, t.type = a, t.lanes = n, t;
  }
  function Te(l, t, e, a) {
    return l = tt(7, l, a, t), l.lanes = e, l;
  }
  function hc(l, t, e) {
    return l = tt(6, l, null, t), l.lanes = e, l;
  }
  function gc(l, t, e) {
    return t = tt(
      4,
      l.children !== null ? l.children : [],
      l.key,
      t
    ), t.lanes = e, t.stateNode = {
      containerInfo: l.containerInfo,
      pendingChildren: null,
      implementation: l.implementation
    }, t;
  }
  var Fe = [], Ie = 0, Gu = null, Xu = 0, vt = [], yt = 0, Ae = null, Ht = 1, qt = "";
  function ze(l, t) {
    Fe[Ie++] = Xu, Fe[Ie++] = Gu, Gu = l, Xu = t;
  }
  function cs(l, t, e) {
    vt[yt++] = Ht, vt[yt++] = qt, vt[yt++] = Ae, Ae = l;
    var a = Ht;
    l = qt;
    var u = 32 - Pl(a) - 1;
    a &= ~(1 << u), e += 1;
    var n = 32 - Pl(t) + u;
    if (30 < n) {
      var c = u - u % 5;
      n = (a & (1 << c) - 1).toString(32), a >>= c, u -= c, Ht = 1 << 32 - Pl(t) + u | e << u | a, qt = n + l;
    } else
      Ht = 1 << n | e << u | a, qt = l;
  }
  function bc(l) {
    l.return !== null && (ze(l, 1), cs(l, 1, 0));
  }
  function Sc(l) {
    for (; l === Gu; )
      Gu = Fe[--Ie], Fe[Ie] = null, Xu = Fe[--Ie], Fe[Ie] = null;
    for (; l === Ae; )
      Ae = vt[--yt], vt[yt] = null, qt = vt[--yt], vt[yt] = null, Ht = vt[--yt], vt[yt] = null;
  }
  var Zl = null, ml = null, I = !1, Oe = null, zt = !1, Ec = Error(g(519));
  function Me(l) {
    var t = Error(g(418, ""));
    throw Ba(dt(t, l)), Ec;
  }
  function fs(l) {
    var t = l.stateNode, e = l.type, a = l.memoizedProps;
    switch (t[Xl] = l, t[Ll] = a, e) {
      case "dialog":
        V("cancel", t), V("close", t);
        break;
      case "iframe":
      case "object":
      case "embed":
        V("load", t);
        break;
      case "video":
      case "audio":
        for (e = 0; e < cu.length; e++)
          V(cu[e], t);
        break;
      case "source":
        V("error", t);
        break;
      case "img":
      case "image":
      case "link":
        V("error", t), V("load", t);
        break;
      case "details":
        V("toggle", t);
        break;
      case "input":
        V("invalid", t), Ti(
          t,
          a.value,
          a.defaultValue,
          a.checked,
          a.defaultChecked,
          a.type,
          a.name,
          !0
        ), Ou(t);
        break;
      case "select":
        V("invalid", t);
        break;
      case "textarea":
        V("invalid", t), zi(t, a.value, a.defaultValue, a.children), Ou(t);
    }
    e = a.children, typeof e != "string" && typeof e != "number" && typeof e != "bigint" || t.textContent === "" + e || a.suppressHydrationWarning === !0 || Or(t.textContent, e) ? (a.popover != null && (V("beforetoggle", t), V("toggle", t)), a.onScroll != null && V("scroll", t), a.onScrollEnd != null && V("scrollend", t), a.onClick != null && (t.onclick = En), t = !0) : t = !1, t || Me(l);
  }
  function is(l) {
    for (Zl = l.return; Zl; )
      switch (Zl.tag) {
        case 5:
        case 13:
          zt = !1;
          return;
        case 27:
        case 3:
          zt = !0;
          return;
        default:
          Zl = Zl.return;
      }
  }
  function Ha(l) {
    if (l !== Zl) return !1;
    if (!I) return is(l), I = !0, !1;
    var t = l.tag, e;
    if ((e = t !== 3 && t !== 27) && ((e = t === 5) && (e = l.type, e = !(e !== "form" && e !== "button") || Yf(l.type, l.memoizedProps)), e = !e), e && ml && Me(l), is(l), t === 13) {
      if (l = l.memoizedState, l = l !== null ? l.dehydrated : null, !l) throw Error(g(317));
      l: {
        for (l = l.nextSibling, t = 0; l; ) {
          if (l.nodeType === 8)
            if (e = l.data, e === "/$") {
              if (t === 0) {
                ml = pt(l.nextSibling);
                break l;
              }
              t--;
            } else
              e !== "$" && e !== "$!" && e !== "$?" || t++;
          l = l.nextSibling;
        }
        ml = null;
      }
    } else
      t === 27 ? (t = ml, re(l.type) ? (l = Cf, Cf = null, ml = l) : ml = t) : ml = Zl ? pt(l.stateNode.nextSibling) : null;
    return !0;
  }
  function qa() {
    ml = Zl = null, I = !1;
  }
  function ss() {
    var l = Oe;
    return l !== null && (Wl === null ? Wl = l : Wl.push.apply(
      Wl,
      l
    ), Oe = null), l;
  }
  function Ba(l) {
    Oe === null ? Oe = [l] : Oe.push(l);
  }
  var pc = T(null), _e = null, Bt = null;
  function $t(l, t, e) {
    _(pc, t._currentValue), t._currentValue = e;
  }
  function Yt(l) {
    l._currentValue = pc.current, D(pc);
  }
  function Tc(l, t, e) {
    for (; l !== null; ) {
      var a = l.alternate;
      if ((l.childLanes & t) !== t ? (l.childLanes |= t, a !== null && (a.childLanes |= t)) : a !== null && (a.childLanes & t) !== t && (a.childLanes |= t), l === e) break;
      l = l.return;
    }
  }
  function Ac(l, t, e, a) {
    var u = l.child;
    for (u !== null && (u.return = l); u !== null; ) {
      var n = u.dependencies;
      if (n !== null) {
        var c = u.child;
        n = n.firstContext;
        l: for (; n !== null; ) {
          var f = n;
          n = u;
          for (var i = 0; i < t.length; i++)
            if (f.context === t[i]) {
              n.lanes |= e, f = n.alternate, f !== null && (f.lanes |= e), Tc(
                n.return,
                e,
                l
              ), a || (c = null);
              break l;
            }
          n = f.next;
        }
      } else if (u.tag === 18) {
        if (c = u.return, c === null) throw Error(g(341));
        c.lanes |= e, n = c.alternate, n !== null && (n.lanes |= e), Tc(c, e, l), c = null;
      } else c = u.child;
      if (c !== null) c.return = u;
      else
        for (c = u; c !== null; ) {
          if (c === l) {
            c = null;
            break;
          }
          if (u = c.sibling, u !== null) {
            u.return = c.return, c = u;
            break;
          }
          c = c.return;
        }
      u = c;
    }
  }
  function Ya(l, t, e, a) {
    l = null;
    for (var u = t, n = !1; u !== null; ) {
      if (!n) {
        if ((u.flags & 524288) !== 0) n = !0;
        else if ((u.flags & 262144) !== 0) break;
      }
      if (u.tag === 10) {
        var c = u.alternate;
        if (c === null) throw Error(g(387));
        if (c = c.memoizedProps, c !== null) {
          var f = u.type;
          lt(u.pendingProps.value, c.value) || (l !== null ? l.push(f) : l = [f]);
        }
      } else if (u === Fl.current) {
        if (c = u.alternate, c === null) throw Error(g(387));
        c.memoizedState.memoizedState !== u.memoizedState.memoizedState && (l !== null ? l.push(du) : l = [du]);
      }
      u = u.return;
    }
    l !== null && Ac(
      t,
      l,
      e,
      a
    ), t.flags |= 262144;
  }
  function Qu(l) {
    for (l = l.firstContext; l !== null; ) {
      if (!lt(
        l.context._currentValue,
        l.memoizedValue
      ))
        return !0;
      l = l.next;
    }
    return !1;
  }
  function De(l) {
    _e = l, Bt = null, l = l.dependencies, l !== null && (l.firstContext = null);
  }
  function Ql(l) {
    return os(_e, l);
  }
  function Cu(l, t) {
    return _e === null && De(l), os(l, t);
  }
  function os(l, t) {
    var e = t._currentValue;
    if (t = { context: t, memoizedValue: e, next: null }, Bt === null) {
      if (l === null) throw Error(g(308));
      Bt = t, l.dependencies = { lanes: 0, firstContext: t }, l.flags |= 524288;
    } else Bt = Bt.next = t;
    return e;
  }
  var b0 = typeof AbortController < "u" ? AbortController : function() {
    var l = [], t = this.signal = {
      aborted: !1,
      addEventListener: function(e, a) {
        l.push(a);
      }
    };
    this.abort = function() {
      t.aborted = !0, l.forEach(function(e) {
        return e();
      });
    };
  }, S0 = O.unstable_scheduleCallback, E0 = O.unstable_NormalPriority, Ol = {
    $$typeof: Al,
    Consumer: null,
    Provider: null,
    _currentValue: null,
    _currentValue2: null,
    _threadCount: 0
  };
  function zc() {
    return {
      controller: new b0(),
      data: /* @__PURE__ */ new Map(),
      refCount: 0
    };
  }
  function Ga(l) {
    l.refCount--, l.refCount === 0 && S0(E0, function() {
      l.controller.abort();
    });
  }
  var Xa = null, Oc = 0, Pe = 0, la = null;
  function p0(l, t) {
    if (Xa === null) {
      var e = Xa = [];
      Oc = 0, Pe = Df(), la = {
        status: "pending",
        value: void 0,
        then: function(a) {
          e.push(a);
        }
      };
    }
    return Oc++, t.then(rs, rs), t;
  }
  function rs() {
    if (--Oc === 0 && Xa !== null) {
      la !== null && (la.status = "fulfilled");
      var l = Xa;
      Xa = null, Pe = 0, la = null;
      for (var t = 0; t < l.length; t++) (0, l[t])();
    }
  }
  function T0(l, t) {
    var e = [], a = {
      status: "pending",
      value: null,
      reason: null,
      then: function(u) {
        e.push(u);
      }
    };
    return l.then(
      function() {
        a.status = "fulfilled", a.value = t;
        for (var u = 0; u < e.length; u++) (0, e[u])(t);
      },
      function(u) {
        for (a.status = "rejected", a.reason = u, u = 0; u < e.length; u++)
          (0, e[u])(void 0);
      }
    ), a;
  }
  var ds = b.S;
  b.S = function(l, t) {
    typeof t == "object" && t !== null && typeof t.then == "function" && p0(l, t), ds !== null && ds(l, t);
  };
  var Ue = T(null);
  function Mc() {
    var l = Ue.current;
    return l !== null ? l : cl.pooledCache;
  }
  function ju(l, t) {
    t === null ? _(Ue, Ue.current) : _(Ue, t.pool);
  }
  function ms() {
    var l = Mc();
    return l === null ? null : { parent: Ol._currentValue, pool: l };
  }
  var Qa = Error(g(460)), vs = Error(g(474)), Zu = Error(g(542)), _c = { then: function() {
  } };
  function ys(l) {
    return l = l.status, l === "fulfilled" || l === "rejected";
  }
  function Vu() {
  }
  function hs(l, t, e) {
    switch (e = l[e], e === void 0 ? l.push(t) : e !== t && (t.then(Vu, Vu), t = e), t.status) {
      case "fulfilled":
        return t.value;
      case "rejected":
        throw l = t.reason, bs(l), l;
      default:
        if (typeof t.status == "string") t.then(Vu, Vu);
        else {
          if (l = cl, l !== null && 100 < l.shellSuspendCounter)
            throw Error(g(482));
          l = t, l.status = "pending", l.then(
            function(a) {
              if (t.status === "pending") {
                var u = t;
                u.status = "fulfilled", u.value = a;
              }
            },
            function(a) {
              if (t.status === "pending") {
                var u = t;
                u.status = "rejected", u.reason = a;
              }
            }
          );
        }
        switch (t.status) {
          case "fulfilled":
            return t.value;
          case "rejected":
            throw l = t.reason, bs(l), l;
        }
        throw Ca = t, Qa;
    }
  }
  var Ca = null;
  function gs() {
    if (Ca === null) throw Error(g(459));
    var l = Ca;
    return Ca = null, l;
  }
  function bs(l) {
    if (l === Qa || l === Zu)
      throw Error(g(483));
  }
  var Ft = !1;
  function Dc(l) {
    l.updateQueue = {
      baseState: l.memoizedState,
      firstBaseUpdate: null,
      lastBaseUpdate: null,
      shared: { pending: null, lanes: 0, hiddenCallbacks: null },
      callbacks: null
    };
  }
  function Uc(l, t) {
    l = l.updateQueue, t.updateQueue === l && (t.updateQueue = {
      baseState: l.baseState,
      firstBaseUpdate: l.firstBaseUpdate,
      lastBaseUpdate: l.lastBaseUpdate,
      shared: l.shared,
      callbacks: null
    });
  }
  function It(l) {
    return { lane: l, tag: 0, payload: null, callback: null, next: null };
  }
  function Pt(l, t, e) {
    var a = l.updateQueue;
    if (a === null) return null;
    if (a = a.shared, (P & 2) !== 0) {
      var u = a.pending;
      return u === null ? t.next = t : (t.next = u.next, u.next = t), a.pending = t, t = Bu(l), us(l, null, e), t;
    }
    return qu(l, a, t, e), Bu(l);
  }
  function ja(l, t, e) {
    if (t = t.updateQueue, t !== null && (t = t.shared, (e & 4194048) !== 0)) {
      var a = t.lanes;
      a &= l.pendingLanes, e |= a, t.lanes = e, ri(l, e);
    }
  }
  function xc(l, t) {
    var e = l.updateQueue, a = l.alternate;
    if (a !== null && (a = a.updateQueue, e === a)) {
      var u = null, n = null;
      if (e = e.firstBaseUpdate, e !== null) {
        do {
          var c = {
            lane: e.lane,
            tag: e.tag,
            payload: e.payload,
            callback: null,
            next: null
          };
          n === null ? u = n = c : n = n.next = c, e = e.next;
        } while (e !== null);
        n === null ? u = n = t : n = n.next = t;
      } else u = n = t;
      e = {
        baseState: a.baseState,
        firstBaseUpdate: u,
        lastBaseUpdate: n,
        shared: a.shared,
        callbacks: a.callbacks
      }, l.updateQueue = e;
      return;
    }
    l = e.lastBaseUpdate, l === null ? e.firstBaseUpdate = t : l.next = t, e.lastBaseUpdate = t;
  }
  var Nc = !1;
  function Za() {
    if (Nc) {
      var l = la;
      if (l !== null) throw l;
    }
  }
  function Va(l, t, e, a) {
    Nc = !1;
    var u = l.updateQueue;
    Ft = !1;
    var n = u.firstBaseUpdate, c = u.lastBaseUpdate, f = u.shared.pending;
    if (f !== null) {
      u.shared.pending = null;
      var i = f, v = i.next;
      i.next = null, c === null ? n = v : c.next = v, c = i;
      var S = l.alternate;
      S !== null && (S = S.updateQueue, f = S.lastBaseUpdate, f !== c && (f === null ? S.firstBaseUpdate = v : f.next = v, S.lastBaseUpdate = i));
    }
    if (n !== null) {
      var p = u.baseState;
      c = 0, S = v = i = null, f = n;
      do {
        var y = f.lane & -536870913, h = y !== f.lane;
        if (h ? (k & y) === y : (a & y) === y) {
          y !== 0 && y === Pe && (Nc = !0), S !== null && (S = S.next = {
            lane: 0,
            tag: f.tag,
            payload: f.payload,
            callback: null,
            next: null
          });
          l: {
            var B = l, H = f;
            y = t;
            var al = e;
            switch (H.tag) {
              case 1:
                if (B = H.payload, typeof B == "function") {
                  p = B.call(al, p, y);
                  break l;
                }
                p = B;
                break l;
              case 3:
                B.flags = B.flags & -65537 | 128;
              case 0:
                if (B = H.payload, y = typeof B == "function" ? B.call(al, p, y) : B, y == null) break l;
                p = x({}, p, y);
                break l;
              case 2:
                Ft = !0;
            }
          }
          y = f.callback, y !== null && (l.flags |= 64, h && (l.flags |= 8192), h = u.callbacks, h === null ? u.callbacks = [y] : h.push(y));
        } else
          h = {
            lane: y,
            tag: f.tag,
            payload: f.payload,
            callback: f.callback,
            next: null
          }, S === null ? (v = S = h, i = p) : S = S.next = h, c |= y;
        if (f = f.next, f === null) {
          if (f = u.shared.pending, f === null)
            break;
          h = f, f = h.next, h.next = null, u.lastBaseUpdate = h, u.shared.pending = null;
        }
      } while (!0);
      S === null && (i = p), u.baseState = i, u.firstBaseUpdate = v, u.lastBaseUpdate = S, n === null && (u.shared.lanes = 0), fe |= c, l.lanes = c, l.memoizedState = p;
    }
  }
  function Ss(l, t) {
    if (typeof l != "function")
      throw Error(g(191, l));
    l.call(t);
  }
  function Es(l, t) {
    var e = l.callbacks;
    if (e !== null)
      for (l.callbacks = null, l = 0; l < e.length; l++)
        Ss(e[l], t);
  }
  var ta = T(null), Lu = T(0);
  function ps(l, t) {
    l = Vt, _(Lu, l), _(ta, t), Vt = l | t.baseLanes;
  }
  function Rc() {
    _(Lu, Vt), _(ta, ta.current);
  }
  function wc() {
    Vt = Lu.current, D(ta), D(Lu);
  }
  var le = 0, X = null, tl = null, El = null, Ku = !1, ea = !1, xe = !1, Ju = 0, La = 0, aa = null, A0 = 0;
  function gl() {
    throw Error(g(321));
  }
  function Hc(l, t) {
    if (t === null) return !1;
    for (var e = 0; e < t.length && e < l.length; e++)
      if (!lt(l[e], t[e])) return !1;
    return !0;
  }
  function qc(l, t, e, a, u, n) {
    return le = n, X = t, t.memoizedState = null, t.updateQueue = null, t.lanes = 0, b.H = l === null || l.memoizedState === null ? uo : no, xe = !1, n = e(a, u), xe = !1, ea && (n = As(
      t,
      e,
      a,
      u
    )), Ts(l), n;
  }
  function Ts(l) {
    b.H = Pu;
    var t = tl !== null && tl.next !== null;
    if (le = 0, El = tl = X = null, Ku = !1, La = 0, aa = null, t) throw Error(g(300));
    l === null || Dl || (l = l.dependencies, l !== null && Qu(l) && (Dl = !0));
  }
  function As(l, t, e, a) {
    X = l;
    var u = 0;
    do {
      if (ea && (aa = null), La = 0, ea = !1, 25 <= u) throw Error(g(301));
      if (u += 1, El = tl = null, l.updateQueue != null) {
        var n = l.updateQueue;
        n.lastEffect = null, n.events = null, n.stores = null, n.memoCache != null && (n.memoCache.index = 0);
      }
      b.H = x0, n = t(e, a);
    } while (ea);
    return n;
  }
  function z0() {
    var l = b.H, t = l.useState()[0];
    return t = typeof t.then == "function" ? Ka(t) : t, l = l.useState()[0], (tl !== null ? tl.memoizedState : null) !== l && (X.flags |= 1024), t;
  }
  function Bc() {
    var l = Ju !== 0;
    return Ju = 0, l;
  }
  function Yc(l, t, e) {
    t.updateQueue = l.updateQueue, t.flags &= -2053, l.lanes &= ~e;
  }
  function Gc(l) {
    if (Ku) {
      for (l = l.memoizedState; l !== null; ) {
        var t = l.queue;
        t !== null && (t.pending = null), l = l.next;
      }
      Ku = !1;
    }
    le = 0, El = tl = X = null, ea = !1, La = Ju = 0, aa = null;
  }
  function Jl() {
    var l = {
      memoizedState: null,
      baseState: null,
      baseQueue: null,
      queue: null,
      next: null
    };
    return El === null ? X.memoizedState = El = l : El = El.next = l, El;
  }
  function pl() {
    if (tl === null) {
      var l = X.alternate;
      l = l !== null ? l.memoizedState : null;
    } else l = tl.next;
    var t = El === null ? X.memoizedState : El.next;
    if (t !== null)
      El = t, tl = l;
    else {
      if (l === null)
        throw X.alternate === null ? Error(g(467)) : Error(g(310));
      tl = l, l = {
        memoizedState: tl.memoizedState,
        baseState: tl.baseState,
        baseQueue: tl.baseQueue,
        queue: tl.queue,
        next: null
      }, El === null ? X.memoizedState = El = l : El = El.next = l;
    }
    return El;
  }
  function Xc() {
    return { lastEffect: null, events: null, stores: null, memoCache: null };
  }
  function Ka(l) {
    var t = La;
    return La += 1, aa === null && (aa = []), l = hs(aa, l, t), t = X, (El === null ? t.memoizedState : El.next) === null && (t = t.alternate, b.H = t === null || t.memoizedState === null ? uo : no), l;
  }
  function ku(l) {
    if (l !== null && typeof l == "object") {
      if (typeof l.then == "function") return Ka(l);
      if (l.$$typeof === Al) return Ql(l);
    }
    throw Error(g(438, String(l)));
  }
  function Qc(l) {
    var t = null, e = X.updateQueue;
    if (e !== null && (t = e.memoCache), t == null) {
      var a = X.alternate;
      a !== null && (a = a.updateQueue, a !== null && (a = a.memoCache, a != null && (t = {
        data: a.data.map(function(u) {
          return u.slice();
        }),
        index: 0
      })));
    }
    if (t == null && (t = { data: [], index: 0 }), e === null && (e = Xc(), X.updateQueue = e), e.memoCache = t, e = t.data[t.index], e === void 0)
      for (e = t.data[t.index] = Array(l), a = 0; a < l; a++)
        e[a] = fl;
    return t.index++, e;
  }
  function Gt(l, t) {
    return typeof t == "function" ? t(l) : t;
  }
  function Wu(l) {
    var t = pl();
    return Cc(t, tl, l);
  }
  function Cc(l, t, e) {
    var a = l.queue;
    if (a === null) throw Error(g(311));
    a.lastRenderedReducer = e;
    var u = l.baseQueue, n = a.pending;
    if (n !== null) {
      if (u !== null) {
        var c = u.next;
        u.next = n.next, n.next = c;
      }
      t.baseQueue = u = n, a.pending = null;
    }
    if (n = l.baseState, u === null) l.memoizedState = n;
    else {
      t = u.next;
      var f = c = null, i = null, v = t, S = !1;
      do {
        var p = v.lane & -536870913;
        if (p !== v.lane ? (k & p) === p : (le & p) === p) {
          var y = v.revertLane;
          if (y === 0)
            i !== null && (i = i.next = {
              lane: 0,
              revertLane: 0,
              action: v.action,
              hasEagerState: v.hasEagerState,
              eagerState: v.eagerState,
              next: null
            }), p === Pe && (S = !0);
          else if ((le & y) === y) {
            v = v.next, y === Pe && (S = !0);
            continue;
          } else
            p = {
              lane: 0,
              revertLane: v.revertLane,
              action: v.action,
              hasEagerState: v.hasEagerState,
              eagerState: v.eagerState,
              next: null
            }, i === null ? (f = i = p, c = n) : i = i.next = p, X.lanes |= y, fe |= y;
          p = v.action, xe && e(n, p), n = v.hasEagerState ? v.eagerState : e(n, p);
        } else
          y = {
            lane: p,
            revertLane: v.revertLane,
            action: v.action,
            hasEagerState: v.hasEagerState,
            eagerState: v.eagerState,
            next: null
          }, i === null ? (f = i = y, c = n) : i = i.next = y, X.lanes |= p, fe |= p;
        v = v.next;
      } while (v !== null && v !== t);
      if (i === null ? c = n : i.next = f, !lt(n, l.memoizedState) && (Dl = !0, S && (e = la, e !== null)))
        throw e;
      l.memoizedState = n, l.baseState = c, l.baseQueue = i, a.lastRenderedState = n;
    }
    return u === null && (a.lanes = 0), [l.memoizedState, a.dispatch];
  }
  function jc(l) {
    var t = pl(), e = t.queue;
    if (e === null) throw Error(g(311));
    e.lastRenderedReducer = l;
    var a = e.dispatch, u = e.pending, n = t.memoizedState;
    if (u !== null) {
      e.pending = null;
      var c = u = u.next;
      do
        n = l(n, c.action), c = c.next;
      while (c !== u);
      lt(n, t.memoizedState) || (Dl = !0), t.memoizedState = n, t.baseQueue === null && (t.baseState = n), e.lastRenderedState = n;
    }
    return [n, a];
  }
  function zs(l, t, e) {
    var a = X, u = pl(), n = I;
    if (n) {
      if (e === void 0) throw Error(g(407));
      e = e();
    } else e = t();
    var c = !lt(
      (tl || u).memoizedState,
      e
    );
    c && (u.memoizedState = e, Dl = !0), u = u.queue;
    var f = _s.bind(null, a, u, l);
    if (Ja(2048, 8, f, [l]), u.getSnapshot !== t || c || El !== null && El.memoizedState.tag & 1) {
      if (a.flags |= 2048, ua(
        9,
        $u(),
        Ms.bind(
          null,
          a,
          u,
          e,
          t
        ),
        null
      ), cl === null) throw Error(g(349));
      n || (le & 124) !== 0 || Os(a, t, e);
    }
    return e;
  }
  function Os(l, t, e) {
    l.flags |= 16384, l = { getSnapshot: t, value: e }, t = X.updateQueue, t === null ? (t = Xc(), X.updateQueue = t, t.stores = [l]) : (e = t.stores, e === null ? t.stores = [l] : e.push(l));
  }
  function Ms(l, t, e, a) {
    t.value = e, t.getSnapshot = a, Ds(t) && Us(l);
  }
  function _s(l, t, e) {
    return e(function() {
      Ds(t) && Us(l);
    });
  }
  function Ds(l) {
    var t = l.getSnapshot;
    l = l.value;
    try {
      var e = t();
      return !lt(l, e);
    } catch {
      return !0;
    }
  }
  function Us(l) {
    var t = We(l, 2);
    t !== null && ct(t, l, 2);
  }
  function Zc(l) {
    var t = Jl();
    if (typeof l == "function") {
      var e = l;
      if (l = e(), xe) {
        Jt(!0);
        try {
          e();
        } finally {
          Jt(!1);
        }
      }
    }
    return t.memoizedState = t.baseState = l, t.queue = {
      pending: null,
      lanes: 0,
      dispatch: null,
      lastRenderedReducer: Gt,
      lastRenderedState: l
    }, t;
  }
  function xs(l, t, e, a) {
    return l.baseState = e, Cc(
      l,
      tl,
      typeof a == "function" ? a : Gt
    );
  }
  function O0(l, t, e, a, u) {
    if (Iu(l)) throw Error(g(485));
    if (l = t.action, l !== null) {
      var n = {
        payload: u,
        action: l,
        next: null,
        isTransition: !0,
        status: "pending",
        value: null,
        reason: null,
        listeners: [],
        then: function(c) {
          n.listeners.push(c);
        }
      };
      b.T !== null ? e(!0) : n.isTransition = !1, a(n), e = t.pending, e === null ? (n.next = t.pending = n, Ns(t, n)) : (n.next = e.next, t.pending = e.next = n);
    }
  }
  function Ns(l, t) {
    var e = t.action, a = t.payload, u = l.state;
    if (t.isTransition) {
      var n = b.T, c = {};
      b.T = c;
      try {
        var f = e(u, a), i = b.S;
        i !== null && i(c, f), Rs(l, t, f);
      } catch (v) {
        Vc(l, t, v);
      } finally {
        b.T = n;
      }
    } else
      try {
        n = e(u, a), Rs(l, t, n);
      } catch (v) {
        Vc(l, t, v);
      }
  }
  function Rs(l, t, e) {
    e !== null && typeof e == "object" && typeof e.then == "function" ? e.then(
      function(a) {
        ws(l, t, a);
      },
      function(a) {
        return Vc(l, t, a);
      }
    ) : ws(l, t, e);
  }
  function ws(l, t, e) {
    t.status = "fulfilled", t.value = e, Hs(t), l.state = e, t = l.pending, t !== null && (e = t.next, e === t ? l.pending = null : (e = e.next, t.next = e, Ns(l, e)));
  }
  function Vc(l, t, e) {
    var a = l.pending;
    if (l.pending = null, a !== null) {
      a = a.next;
      do
        t.status = "rejected", t.reason = e, Hs(t), t = t.next;
      while (t !== a);
    }
    l.action = null;
  }
  function Hs(l) {
    l = l.listeners;
    for (var t = 0; t < l.length; t++) (0, l[t])();
  }
  function qs(l, t) {
    return t;
  }
  function Bs(l, t) {
    if (I) {
      var e = cl.formState;
      if (e !== null) {
        l: {
          var a = X;
          if (I) {
            if (ml) {
              t: {
                for (var u = ml, n = zt; u.nodeType !== 8; ) {
                  if (!n) {
                    u = null;
                    break t;
                  }
                  if (u = pt(
                    u.nextSibling
                  ), u === null) {
                    u = null;
                    break t;
                  }
                }
                n = u.data, u = n === "F!" || n === "F" ? u : null;
              }
              if (u) {
                ml = pt(
                  u.nextSibling
                ), a = u.data === "F!";
                break l;
              }
            }
            Me(a);
          }
          a = !1;
        }
        a && (t = e[0]);
      }
    }
    return e = Jl(), e.memoizedState = e.baseState = t, a = {
      pending: null,
      lanes: 0,
      dispatch: null,
      lastRenderedReducer: qs,
      lastRenderedState: t
    }, e.queue = a, e = to.bind(
      null,
      X,
      a
    ), a.dispatch = e, a = Zc(!1), n = Wc.bind(
      null,
      X,
      !1,
      a.queue
    ), a = Jl(), u = {
      state: t,
      dispatch: null,
      action: l,
      pending: null
    }, a.queue = u, e = O0.bind(
      null,
      X,
      u,
      n,
      e
    ), u.dispatch = e, a.memoizedState = l, [t, e, !1];
  }
  function Ys(l) {
    var t = pl();
    return Gs(t, tl, l);
  }
  function Gs(l, t, e) {
    if (t = Cc(
      l,
      t,
      qs
    )[0], l = Wu(Gt)[0], typeof t == "object" && t !== null && typeof t.then == "function")
      try {
        var a = Ka(t);
      } catch (c) {
        throw c === Qa ? Zu : c;
      }
    else a = t;
    t = pl();
    var u = t.queue, n = u.dispatch;
    return e !== t.memoizedState && (X.flags |= 2048, ua(
      9,
      $u(),
      M0.bind(null, u, e),
      null
    )), [a, n, l];
  }
  function M0(l, t) {
    l.action = t;
  }
  function Xs(l) {
    var t = pl(), e = tl;
    if (e !== null)
      return Gs(t, e, l);
    pl(), t = t.memoizedState, e = pl();
    var a = e.queue.dispatch;
    return e.memoizedState = l, [t, a, !1];
  }
  function ua(l, t, e, a) {
    return l = { tag: l, create: e, deps: a, inst: t, next: null }, t = X.updateQueue, t === null && (t = Xc(), X.updateQueue = t), e = t.lastEffect, e === null ? t.lastEffect = l.next = l : (a = e.next, e.next = l, l.next = a, t.lastEffect = l), l;
  }
  function $u() {
    return { destroy: void 0, resource: void 0 };
  }
  function Qs() {
    return pl().memoizedState;
  }
  function Fu(l, t, e, a) {
    var u = Jl();
    a = a === void 0 ? null : a, X.flags |= l, u.memoizedState = ua(
      1 | t,
      $u(),
      e,
      a
    );
  }
  function Ja(l, t, e, a) {
    var u = pl();
    a = a === void 0 ? null : a;
    var n = u.memoizedState.inst;
    tl !== null && a !== null && Hc(a, tl.memoizedState.deps) ? u.memoizedState = ua(t, n, e, a) : (X.flags |= l, u.memoizedState = ua(
      1 | t,
      n,
      e,
      a
    ));
  }
  function Cs(l, t) {
    Fu(8390656, 8, l, t);
  }
  function js(l, t) {
    Ja(2048, 8, l, t);
  }
  function Zs(l, t) {
    return Ja(4, 2, l, t);
  }
  function Vs(l, t) {
    return Ja(4, 4, l, t);
  }
  function Ls(l, t) {
    if (typeof t == "function") {
      l = l();
      var e = t(l);
      return function() {
        typeof e == "function" ? e() : t(null);
      };
    }
    if (t != null)
      return l = l(), t.current = l, function() {
        t.current = null;
      };
  }
  function Ks(l, t, e) {
    e = e != null ? e.concat([l]) : null, Ja(4, 4, Ls.bind(null, t, l), e);
  }
  function Lc() {
  }
  function Js(l, t) {
    var e = pl();
    t = t === void 0 ? null : t;
    var a = e.memoizedState;
    return t !== null && Hc(t, a[1]) ? a[0] : (e.memoizedState = [l, t], l);
  }
  function ks(l, t) {
    var e = pl();
    t = t === void 0 ? null : t;
    var a = e.memoizedState;
    if (t !== null && Hc(t, a[1]))
      return a[0];
    if (a = l(), xe) {
      Jt(!0);
      try {
        l();
      } finally {
        Jt(!1);
      }
    }
    return e.memoizedState = [a, t], a;
  }
  function Kc(l, t, e) {
    return e === void 0 || (le & 1073741824) !== 0 ? l.memoizedState = t : (l.memoizedState = e, l = Io(), X.lanes |= l, fe |= l, e);
  }
  function Ws(l, t, e, a) {
    return lt(e, t) ? e : ta.current !== null ? (l = Kc(l, e, a), lt(l, t) || (Dl = !0), l) : (le & 42) === 0 ? (Dl = !0, l.memoizedState = e) : (l = Io(), X.lanes |= l, fe |= l, t);
  }
  function $s(l, t, e, a, u) {
    var n = d.p;
    d.p = n !== 0 && 8 > n ? n : 8;
    var c = b.T, f = {};
    b.T = f, Wc(l, !1, t, e);
    try {
      var i = u(), v = b.S;
      if (v !== null && v(f, i), i !== null && typeof i == "object" && typeof i.then == "function") {
        var S = T0(
          i,
          a
        );
        ka(
          l,
          t,
          S,
          nt(l)
        );
      } else
        ka(
          l,
          t,
          a,
          nt(l)
        );
    } catch (p) {
      ka(
        l,
        t,
        { then: function() {
        }, status: "rejected", reason: p },
        nt()
      );
    } finally {
      d.p = n, b.T = c;
    }
  }
  function _0() {
  }
  function Jc(l, t, e, a) {
    if (l.tag !== 5) throw Error(g(476));
    var u = Fs(l).queue;
    $s(
      l,
      u,
      t,
      M,
      e === null ? _0 : function() {
        return Is(l), e(a);
      }
    );
  }
  function Fs(l) {
    var t = l.memoizedState;
    if (t !== null) return t;
    t = {
      memoizedState: M,
      baseState: M,
      baseQueue: null,
      queue: {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: Gt,
        lastRenderedState: M
      },
      next: null
    };
    var e = {};
    return t.next = {
      memoizedState: e,
      baseState: e,
      baseQueue: null,
      queue: {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: Gt,
        lastRenderedState: e
      },
      next: null
    }, l.memoizedState = t, l = l.alternate, l !== null && (l.memoizedState = t), t;
  }
  function Is(l) {
    var t = Fs(l).next.queue;
    ka(l, t, {}, nt());
  }
  function kc() {
    return Ql(du);
  }
  function Ps() {
    return pl().memoizedState;
  }
  function lo() {
    return pl().memoizedState;
  }
  function D0(l) {
    for (var t = l.return; t !== null; ) {
      switch (t.tag) {
        case 24:
        case 3:
          var e = nt();
          l = It(e);
          var a = Pt(t, l, e);
          a !== null && (ct(a, t, e), ja(a, t, e)), t = { cache: zc() }, l.payload = t;
          return;
      }
      t = t.return;
    }
  }
  function U0(l, t, e) {
    var a = nt();
    e = {
      lane: a,
      revertLane: 0,
      action: e,
      hasEagerState: !1,
      eagerState: null,
      next: null
    }, Iu(l) ? eo(t, e) : (e = vc(l, t, e, a), e !== null && (ct(e, l, a), ao(e, t, a)));
  }
  function to(l, t, e) {
    var a = nt();
    ka(l, t, e, a);
  }
  function ka(l, t, e, a) {
    var u = {
      lane: a,
      revertLane: 0,
      action: e,
      hasEagerState: !1,
      eagerState: null,
      next: null
    };
    if (Iu(l)) eo(t, u);
    else {
      var n = l.alternate;
      if (l.lanes === 0 && (n === null || n.lanes === 0) && (n = t.lastRenderedReducer, n !== null))
        try {
          var c = t.lastRenderedState, f = n(c, e);
          if (u.hasEagerState = !0, u.eagerState = f, lt(f, c))
            return qu(l, t, u, 0), cl === null && Hu(), !1;
        } catch {
        } finally {
        }
      if (e = vc(l, t, u, a), e !== null)
        return ct(e, l, a), ao(e, t, a), !0;
    }
    return !1;
  }
  function Wc(l, t, e, a) {
    if (a = {
      lane: 2,
      revertLane: Df(),
      action: a,
      hasEagerState: !1,
      eagerState: null,
      next: null
    }, Iu(l)) {
      if (t) throw Error(g(479));
    } else
      t = vc(
        l,
        e,
        a,
        2
      ), t !== null && ct(t, l, 2);
  }
  function Iu(l) {
    var t = l.alternate;
    return l === X || t !== null && t === X;
  }
  function eo(l, t) {
    ea = Ku = !0;
    var e = l.pending;
    e === null ? t.next = t : (t.next = e.next, e.next = t), l.pending = t;
  }
  function ao(l, t, e) {
    if ((e & 4194048) !== 0) {
      var a = t.lanes;
      a &= l.pendingLanes, e |= a, t.lanes = e, ri(l, e);
    }
  }
  var Pu = {
    readContext: Ql,
    use: ku,
    useCallback: gl,
    useContext: gl,
    useEffect: gl,
    useImperativeHandle: gl,
    useLayoutEffect: gl,
    useInsertionEffect: gl,
    useMemo: gl,
    useReducer: gl,
    useRef: gl,
    useState: gl,
    useDebugValue: gl,
    useDeferredValue: gl,
    useTransition: gl,
    useSyncExternalStore: gl,
    useId: gl,
    useHostTransitionStatus: gl,
    useFormState: gl,
    useActionState: gl,
    useOptimistic: gl,
    useMemoCache: gl,
    useCacheRefresh: gl
  }, uo = {
    readContext: Ql,
    use: ku,
    useCallback: function(l, t) {
      return Jl().memoizedState = [
        l,
        t === void 0 ? null : t
      ], l;
    },
    useContext: Ql,
    useEffect: Cs,
    useImperativeHandle: function(l, t, e) {
      e = e != null ? e.concat([l]) : null, Fu(
        4194308,
        4,
        Ls.bind(null, t, l),
        e
      );
    },
    useLayoutEffect: function(l, t) {
      return Fu(4194308, 4, l, t);
    },
    useInsertionEffect: function(l, t) {
      Fu(4, 2, l, t);
    },
    useMemo: function(l, t) {
      var e = Jl();
      t = t === void 0 ? null : t;
      var a = l();
      if (xe) {
        Jt(!0);
        try {
          l();
        } finally {
          Jt(!1);
        }
      }
      return e.memoizedState = [a, t], a;
    },
    useReducer: function(l, t, e) {
      var a = Jl();
      if (e !== void 0) {
        var u = e(t);
        if (xe) {
          Jt(!0);
          try {
            e(t);
          } finally {
            Jt(!1);
          }
        }
      } else u = t;
      return a.memoizedState = a.baseState = u, l = {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: l,
        lastRenderedState: u
      }, a.queue = l, l = l.dispatch = U0.bind(
        null,
        X,
        l
      ), [a.memoizedState, l];
    },
    useRef: function(l) {
      var t = Jl();
      return l = { current: l }, t.memoizedState = l;
    },
    useState: function(l) {
      l = Zc(l);
      var t = l.queue, e = to.bind(null, X, t);
      return t.dispatch = e, [l.memoizedState, e];
    },
    useDebugValue: Lc,
    useDeferredValue: function(l, t) {
      var e = Jl();
      return Kc(e, l, t);
    },
    useTransition: function() {
      var l = Zc(!1);
      return l = $s.bind(
        null,
        X,
        l.queue,
        !0,
        !1
      ), Jl().memoizedState = l, [!1, l];
    },
    useSyncExternalStore: function(l, t, e) {
      var a = X, u = Jl();
      if (I) {
        if (e === void 0)
          throw Error(g(407));
        e = e();
      } else {
        if (e = t(), cl === null)
          throw Error(g(349));
        (k & 124) !== 0 || Os(a, t, e);
      }
      u.memoizedState = e;
      var n = { value: e, getSnapshot: t };
      return u.queue = n, Cs(_s.bind(null, a, n, l), [
        l
      ]), a.flags |= 2048, ua(
        9,
        $u(),
        Ms.bind(
          null,
          a,
          n,
          e,
          t
        ),
        null
      ), e;
    },
    useId: function() {
      var l = Jl(), t = cl.identifierPrefix;
      if (I) {
        var e = qt, a = Ht;
        e = (a & ~(1 << 32 - Pl(a) - 1)).toString(32) + e, t = "«" + t + "R" + e, e = Ju++, 0 < e && (t += "H" + e.toString(32)), t += "»";
      } else
        e = A0++, t = "«" + t + "r" + e.toString(32) + "»";
      return l.memoizedState = t;
    },
    useHostTransitionStatus: kc,
    useFormState: Bs,
    useActionState: Bs,
    useOptimistic: function(l) {
      var t = Jl();
      t.memoizedState = t.baseState = l;
      var e = {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: null,
        lastRenderedState: null
      };
      return t.queue = e, t = Wc.bind(
        null,
        X,
        !0,
        e
      ), e.dispatch = t, [l, t];
    },
    useMemoCache: Qc,
    useCacheRefresh: function() {
      return Jl().memoizedState = D0.bind(
        null,
        X
      );
    }
  }, no = {
    readContext: Ql,
    use: ku,
    useCallback: Js,
    useContext: Ql,
    useEffect: js,
    useImperativeHandle: Ks,
    useInsertionEffect: Zs,
    useLayoutEffect: Vs,
    useMemo: ks,
    useReducer: Wu,
    useRef: Qs,
    useState: function() {
      return Wu(Gt);
    },
    useDebugValue: Lc,
    useDeferredValue: function(l, t) {
      var e = pl();
      return Ws(
        e,
        tl.memoizedState,
        l,
        t
      );
    },
    useTransition: function() {
      var l = Wu(Gt)[0], t = pl().memoizedState;
      return [
        typeof l == "boolean" ? l : Ka(l),
        t
      ];
    },
    useSyncExternalStore: zs,
    useId: Ps,
    useHostTransitionStatus: kc,
    useFormState: Ys,
    useActionState: Ys,
    useOptimistic: function(l, t) {
      var e = pl();
      return xs(e, tl, l, t);
    },
    useMemoCache: Qc,
    useCacheRefresh: lo
  }, x0 = {
    readContext: Ql,
    use: ku,
    useCallback: Js,
    useContext: Ql,
    useEffect: js,
    useImperativeHandle: Ks,
    useInsertionEffect: Zs,
    useLayoutEffect: Vs,
    useMemo: ks,
    useReducer: jc,
    useRef: Qs,
    useState: function() {
      return jc(Gt);
    },
    useDebugValue: Lc,
    useDeferredValue: function(l, t) {
      var e = pl();
      return tl === null ? Kc(e, l, t) : Ws(
        e,
        tl.memoizedState,
        l,
        t
      );
    },
    useTransition: function() {
      var l = jc(Gt)[0], t = pl().memoizedState;
      return [
        typeof l == "boolean" ? l : Ka(l),
        t
      ];
    },
    useSyncExternalStore: zs,
    useId: Ps,
    useHostTransitionStatus: kc,
    useFormState: Xs,
    useActionState: Xs,
    useOptimistic: function(l, t) {
      var e = pl();
      return tl !== null ? xs(e, tl, l, t) : (e.baseState = l, [l, e.queue.dispatch]);
    },
    useMemoCache: Qc,
    useCacheRefresh: lo
  }, na = null, Wa = 0;
  function ln(l) {
    var t = Wa;
    return Wa += 1, na === null && (na = []), hs(na, l, t);
  }
  function $a(l, t) {
    t = t.props.ref, l.ref = t !== void 0 ? t : null;
  }
  function tn(l, t) {
    throw t.$$typeof === ul ? Error(g(525)) : (l = Object.prototype.toString.call(t), Error(
      g(
        31,
        l === "[object Object]" ? "object with keys {" + Object.keys(t).join(", ") + "}" : l
      )
    ));
  }
  function co(l) {
    var t = l._init;
    return t(l._payload);
  }
  function fo(l) {
    function t(r, o) {
      if (l) {
        var m = r.deletions;
        m === null ? (r.deletions = [o], r.flags |= 16) : m.push(o);
      }
    }
    function e(r, o) {
      if (!l) return null;
      for (; o !== null; )
        t(r, o), o = o.sibling;
      return null;
    }
    function a(r) {
      for (var o = /* @__PURE__ */ new Map(); r !== null; )
        r.key !== null ? o.set(r.key, r) : o.set(r.index, r), r = r.sibling;
      return o;
    }
    function u(r, o) {
      return r = wt(r, o), r.index = 0, r.sibling = null, r;
    }
    function n(r, o, m) {
      return r.index = m, l ? (m = r.alternate, m !== null ? (m = m.index, m < o ? (r.flags |= 67108866, o) : m) : (r.flags |= 67108866, o)) : (r.flags |= 1048576, o);
    }
    function c(r) {
      return l && r.alternate === null && (r.flags |= 67108866), r;
    }
    function f(r, o, m, E) {
      return o === null || o.tag !== 6 ? (o = hc(m, r.mode, E), o.return = r, o) : (o = u(o, m), o.return = r, o);
    }
    function i(r, o, m, E) {
      var U = m.type;
      return U === rl ? S(
        r,
        o,
        m.props.children,
        E,
        m.key
      ) : o !== null && (o.elementType === U || typeof U == "object" && U !== null && U.$$typeof === yl && co(U) === o.type) ? (o = u(o, m.props), $a(o, m), o.return = r, o) : (o = Yu(
        m.type,
        m.key,
        m.props,
        null,
        r.mode,
        E
      ), $a(o, m), o.return = r, o);
    }
    function v(r, o, m, E) {
      return o === null || o.tag !== 4 || o.stateNode.containerInfo !== m.containerInfo || o.stateNode.implementation !== m.implementation ? (o = gc(m, r.mode, E), o.return = r, o) : (o = u(o, m.children || []), o.return = r, o);
    }
    function S(r, o, m, E, U) {
      return o === null || o.tag !== 7 ? (o = Te(
        m,
        r.mode,
        E,
        U
      ), o.return = r, o) : (o = u(o, m), o.return = r, o);
    }
    function p(r, o, m) {
      if (typeof o == "string" && o !== "" || typeof o == "number" || typeof o == "bigint")
        return o = hc(
          "" + o,
          r.mode,
          m
        ), o.return = r, o;
      if (typeof o == "object" && o !== null) {
        switch (o.$$typeof) {
          case W:
            return m = Yu(
              o.type,
              o.key,
              o.props,
              null,
              r.mode,
              m
            ), $a(m, o), m.return = r, m;
          case Nl:
            return o = gc(
              o,
              r.mode,
              m
            ), o.return = r, o;
          case yl:
            var E = o._init;
            return o = E(o._payload), p(r, o, m);
        }
        if (zl(o) || hl(o))
          return o = Te(
            o,
            r.mode,
            m,
            null
          ), o.return = r, o;
        if (typeof o.then == "function")
          return p(r, ln(o), m);
        if (o.$$typeof === Al)
          return p(
            r,
            Cu(r, o),
            m
          );
        tn(r, o);
      }
      return null;
    }
    function y(r, o, m, E) {
      var U = o !== null ? o.key : null;
      if (typeof m == "string" && m !== "" || typeof m == "number" || typeof m == "bigint")
        return U !== null ? null : f(r, o, "" + m, E);
      if (typeof m == "object" && m !== null) {
        switch (m.$$typeof) {
          case W:
            return m.key === U ? i(r, o, m, E) : null;
          case Nl:
            return m.key === U ? v(r, o, m, E) : null;
          case yl:
            return U = m._init, m = U(m._payload), y(r, o, m, E);
        }
        if (zl(m) || hl(m))
          return U !== null ? null : S(r, o, m, E, null);
        if (typeof m.then == "function")
          return y(
            r,
            o,
            ln(m),
            E
          );
        if (m.$$typeof === Al)
          return y(
            r,
            o,
            Cu(r, m),
            E
          );
        tn(r, m);
      }
      return null;
    }
    function h(r, o, m, E, U) {
      if (typeof E == "string" && E !== "" || typeof E == "number" || typeof E == "bigint")
        return r = r.get(m) || null, f(o, r, "" + E, U);
      if (typeof E == "object" && E !== null) {
        switch (E.$$typeof) {
          case W:
            return r = r.get(
              E.key === null ? m : E.key
            ) || null, i(o, r, E, U);
          case Nl:
            return r = r.get(
              E.key === null ? m : E.key
            ) || null, v(o, r, E, U);
          case yl:
            var Q = E._init;
            return E = Q(E._payload), h(
              r,
              o,
              m,
              E,
              U
            );
        }
        if (zl(E) || hl(E))
          return r = r.get(m) || null, S(o, r, E, U, null);
        if (typeof E.then == "function")
          return h(
            r,
            o,
            m,
            ln(E),
            U
          );
        if (E.$$typeof === Al)
          return h(
            r,
            o,
            m,
            Cu(o, E),
            U
          );
        tn(o, E);
      }
      return null;
    }
    function B(r, o, m, E) {
      for (var U = null, Q = null, N = o, q = o = 0, xl = null; N !== null && q < m.length; q++) {
        N.index > q ? (xl = N, N = null) : xl = N.sibling;
        var F = y(
          r,
          N,
          m[q],
          E
        );
        if (F === null) {
          N === null && (N = xl);
          break;
        }
        l && N && F.alternate === null && t(r, N), o = n(F, o, q), Q === null ? U = F : Q.sibling = F, Q = F, N = xl;
      }
      if (q === m.length)
        return e(r, N), I && ze(r, q), U;
      if (N === null) {
        for (; q < m.length; q++)
          N = p(r, m[q], E), N !== null && (o = n(
            N,
            o,
            q
          ), Q === null ? U = N : Q.sibling = N, Q = N);
        return I && ze(r, q), U;
      }
      for (N = a(N); q < m.length; q++)
        xl = h(
          N,
          r,
          q,
          m[q],
          E
        ), xl !== null && (l && xl.alternate !== null && N.delete(
          xl.key === null ? q : xl.key
        ), o = n(
          xl,
          o,
          q
        ), Q === null ? U = xl : Q.sibling = xl, Q = xl);
      return l && N.forEach(function(he) {
        return t(r, he);
      }), I && ze(r, q), U;
    }
    function H(r, o, m, E) {
      if (m == null) throw Error(g(151));
      for (var U = null, Q = null, N = o, q = o = 0, xl = null, F = m.next(); N !== null && !F.done; q++, F = m.next()) {
        N.index > q ? (xl = N, N = null) : xl = N.sibling;
        var he = y(r, N, F.value, E);
        if (he === null) {
          N === null && (N = xl);
          break;
        }
        l && N && he.alternate === null && t(r, N), o = n(he, o, q), Q === null ? U = he : Q.sibling = he, Q = he, N = xl;
      }
      if (F.done)
        return e(r, N), I && ze(r, q), U;
      if (N === null) {
        for (; !F.done; q++, F = m.next())
          F = p(r, F.value, E), F !== null && (o = n(F, o, q), Q === null ? U = F : Q.sibling = F, Q = F);
        return I && ze(r, q), U;
      }
      for (N = a(N); !F.done; q++, F = m.next())
        F = h(N, r, q, F.value, E), F !== null && (l && F.alternate !== null && N.delete(F.key === null ? q : F.key), o = n(F, o, q), Q === null ? U = F : Q.sibling = F, Q = F);
      return l && N.forEach(function(Nm) {
        return t(r, Nm);
      }), I && ze(r, q), U;
    }
    function al(r, o, m, E) {
      if (typeof m == "object" && m !== null && m.type === rl && m.key === null && (m = m.props.children), typeof m == "object" && m !== null) {
        switch (m.$$typeof) {
          case W:
            l: {
              for (var U = m.key; o !== null; ) {
                if (o.key === U) {
                  if (U = m.type, U === rl) {
                    if (o.tag === 7) {
                      e(
                        r,
                        o.sibling
                      ), E = u(
                        o,
                        m.props.children
                      ), E.return = r, r = E;
                      break l;
                    }
                  } else if (o.elementType === U || typeof U == "object" && U !== null && U.$$typeof === yl && co(U) === o.type) {
                    e(
                      r,
                      o.sibling
                    ), E = u(o, m.props), $a(E, m), E.return = r, r = E;
                    break l;
                  }
                  e(r, o);
                  break;
                } else t(r, o);
                o = o.sibling;
              }
              m.type === rl ? (E = Te(
                m.props.children,
                r.mode,
                E,
                m.key
              ), E.return = r, r = E) : (E = Yu(
                m.type,
                m.key,
                m.props,
                null,
                r.mode,
                E
              ), $a(E, m), E.return = r, r = E);
            }
            return c(r);
          case Nl:
            l: {
              for (U = m.key; o !== null; ) {
                if (o.key === U)
                  if (o.tag === 4 && o.stateNode.containerInfo === m.containerInfo && o.stateNode.implementation === m.implementation) {
                    e(
                      r,
                      o.sibling
                    ), E = u(o, m.children || []), E.return = r, r = E;
                    break l;
                  } else {
                    e(r, o);
                    break;
                  }
                else t(r, o);
                o = o.sibling;
              }
              E = gc(m, r.mode, E), E.return = r, r = E;
            }
            return c(r);
          case yl:
            return U = m._init, m = U(m._payload), al(
              r,
              o,
              m,
              E
            );
        }
        if (zl(m))
          return B(
            r,
            o,
            m,
            E
          );
        if (hl(m)) {
          if (U = hl(m), typeof U != "function") throw Error(g(150));
          return m = U.call(m), H(
            r,
            o,
            m,
            E
          );
        }
        if (typeof m.then == "function")
          return al(
            r,
            o,
            ln(m),
            E
          );
        if (m.$$typeof === Al)
          return al(
            r,
            o,
            Cu(r, m),
            E
          );
        tn(r, m);
      }
      return typeof m == "string" && m !== "" || typeof m == "number" || typeof m == "bigint" ? (m = "" + m, o !== null && o.tag === 6 ? (e(r, o.sibling), E = u(o, m), E.return = r, r = E) : (e(r, o), E = hc(m, r.mode, E), E.return = r, r = E), c(r)) : e(r, o);
    }
    return function(r, o, m, E) {
      try {
        Wa = 0;
        var U = al(
          r,
          o,
          m,
          E
        );
        return na = null, U;
      } catch (N) {
        if (N === Qa || N === Zu) throw N;
        var Q = tt(29, N, null, r.mode);
        return Q.lanes = E, Q.return = r, Q;
      } finally {
      }
    };
  }
  var ca = fo(!0), io = fo(!1), ht = T(null), Ot = null;
  function te(l) {
    var t = l.alternate;
    _(Ml, Ml.current & 1), _(ht, l), Ot === null && (t === null || ta.current !== null || t.memoizedState !== null) && (Ot = l);
  }
  function so(l) {
    if (l.tag === 22) {
      if (_(Ml, Ml.current), _(ht, l), Ot === null) {
        var t = l.alternate;
        t !== null && t.memoizedState !== null && (Ot = l);
      }
    } else ee();
  }
  function ee() {
    _(Ml, Ml.current), _(ht, ht.current);
  }
  function Xt(l) {
    D(ht), Ot === l && (Ot = null), D(Ml);
  }
  var Ml = T(0);
  function en(l) {
    for (var t = l; t !== null; ) {
      if (t.tag === 13) {
        var e = t.memoizedState;
        if (e !== null && (e = e.dehydrated, e === null || e.data === "$?" || Qf(e)))
          return t;
      } else if (t.tag === 19 && t.memoizedProps.revealOrder !== void 0) {
        if ((t.flags & 128) !== 0) return t;
      } else if (t.child !== null) {
        t.child.return = t, t = t.child;
        continue;
      }
      if (t === l) break;
      for (; t.sibling === null; ) {
        if (t.return === null || t.return === l) return null;
        t = t.return;
      }
      t.sibling.return = t.return, t = t.sibling;
    }
    return null;
  }
  function $c(l, t, e, a) {
    t = l.memoizedState, e = e(a, t), e = e == null ? t : x({}, t, e), l.memoizedState = e, l.lanes === 0 && (l.updateQueue.baseState = e);
  }
  var Fc = {
    enqueueSetState: function(l, t, e) {
      l = l._reactInternals;
      var a = nt(), u = It(a);
      u.payload = t, e != null && (u.callback = e), t = Pt(l, u, a), t !== null && (ct(t, l, a), ja(t, l, a));
    },
    enqueueReplaceState: function(l, t, e) {
      l = l._reactInternals;
      var a = nt(), u = It(a);
      u.tag = 1, u.payload = t, e != null && (u.callback = e), t = Pt(l, u, a), t !== null && (ct(t, l, a), ja(t, l, a));
    },
    enqueueForceUpdate: function(l, t) {
      l = l._reactInternals;
      var e = nt(), a = It(e);
      a.tag = 2, t != null && (a.callback = t), t = Pt(l, a, e), t !== null && (ct(t, l, e), ja(t, l, e));
    }
  };
  function oo(l, t, e, a, u, n, c) {
    return l = l.stateNode, typeof l.shouldComponentUpdate == "function" ? l.shouldComponentUpdate(a, n, c) : t.prototype && t.prototype.isPureReactComponent ? !Ra(e, a) || !Ra(u, n) : !0;
  }
  function ro(l, t, e, a) {
    l = t.state, typeof t.componentWillReceiveProps == "function" && t.componentWillReceiveProps(e, a), typeof t.UNSAFE_componentWillReceiveProps == "function" && t.UNSAFE_componentWillReceiveProps(e, a), t.state !== l && Fc.enqueueReplaceState(t, t.state, null);
  }
  function Ne(l, t) {
    var e = t;
    if ("ref" in t) {
      e = {};
      for (var a in t)
        a !== "ref" && (e[a] = t[a]);
    }
    if (l = l.defaultProps) {
      e === t && (e = x({}, e));
      for (var u in l)
        e[u] === void 0 && (e[u] = l[u]);
    }
    return e;
  }
  var an = typeof reportError == "function" ? reportError : function(l) {
    if (typeof window == "object" && typeof window.ErrorEvent == "function") {
      var t = new window.ErrorEvent("error", {
        bubbles: !0,
        cancelable: !0,
        message: typeof l == "object" && l !== null && typeof l.message == "string" ? String(l.message) : String(l),
        error: l
      });
      if (!window.dispatchEvent(t)) return;
    } else if (typeof process == "object" && typeof process.emit == "function") {
      process.emit("uncaughtException", l);
      return;
    }
    console.error(l);
  };
  function mo(l) {
    an(l);
  }
  function vo(l) {
    console.error(l);
  }
  function yo(l) {
    an(l);
  }
  function un(l, t) {
    try {
      var e = l.onUncaughtError;
      e(t.value, { componentStack: t.stack });
    } catch (a) {
      setTimeout(function() {
        throw a;
      });
    }
  }
  function ho(l, t, e) {
    try {
      var a = l.onCaughtError;
      a(e.value, {
        componentStack: e.stack,
        errorBoundary: t.tag === 1 ? t.stateNode : null
      });
    } catch (u) {
      setTimeout(function() {
        throw u;
      });
    }
  }
  function Ic(l, t, e) {
    return e = It(e), e.tag = 3, e.payload = { element: null }, e.callback = function() {
      un(l, t);
    }, e;
  }
  function go(l) {
    return l = It(l), l.tag = 3, l;
  }
  function bo(l, t, e, a) {
    var u = e.type.getDerivedStateFromError;
    if (typeof u == "function") {
      var n = a.value;
      l.payload = function() {
        return u(n);
      }, l.callback = function() {
        ho(t, e, a);
      };
    }
    var c = e.stateNode;
    c !== null && typeof c.componentDidCatch == "function" && (l.callback = function() {
      ho(t, e, a), typeof u != "function" && (ie === null ? ie = /* @__PURE__ */ new Set([this]) : ie.add(this));
      var f = a.stack;
      this.componentDidCatch(a.value, {
        componentStack: f !== null ? f : ""
      });
    });
  }
  function N0(l, t, e, a, u) {
    if (e.flags |= 32768, a !== null && typeof a == "object" && typeof a.then == "function") {
      if (t = e.alternate, t !== null && Ya(
        t,
        e,
        u,
        !0
      ), e = ht.current, e !== null) {
        switch (e.tag) {
          case 13:
            return Ot === null ? Af() : e.alternate === null && vl === 0 && (vl = 3), e.flags &= -257, e.flags |= 65536, e.lanes = u, a === _c ? e.flags |= 16384 : (t = e.updateQueue, t === null ? e.updateQueue = /* @__PURE__ */ new Set([a]) : t.add(a), Of(l, a, u)), !1;
          case 22:
            return e.flags |= 65536, a === _c ? e.flags |= 16384 : (t = e.updateQueue, t === null ? (t = {
              transitions: null,
              markerInstances: null,
              retryQueue: /* @__PURE__ */ new Set([a])
            }, e.updateQueue = t) : (e = t.retryQueue, e === null ? t.retryQueue = /* @__PURE__ */ new Set([a]) : e.add(a)), Of(l, a, u)), !1;
        }
        throw Error(g(435, e.tag));
      }
      return Of(l, a, u), Af(), !1;
    }
    if (I)
      return t = ht.current, t !== null ? ((t.flags & 65536) === 0 && (t.flags |= 256), t.flags |= 65536, t.lanes = u, a !== Ec && (l = Error(g(422), { cause: a }), Ba(dt(l, e)))) : (a !== Ec && (t = Error(g(423), {
        cause: a
      }), Ba(
        dt(t, e)
      )), l = l.current.alternate, l.flags |= 65536, u &= -u, l.lanes |= u, a = dt(a, e), u = Ic(
        l.stateNode,
        a,
        u
      ), xc(l, u), vl !== 4 && (vl = 2)), !1;
    var n = Error(g(520), { cause: a });
    if (n = dt(n, e), au === null ? au = [n] : au.push(n), vl !== 4 && (vl = 2), t === null) return !0;
    a = dt(a, e), e = t;
    do {
      switch (e.tag) {
        case 3:
          return e.flags |= 65536, l = u & -u, e.lanes |= l, l = Ic(e.stateNode, a, l), xc(e, l), !1;
        case 1:
          if (t = e.type, n = e.stateNode, (e.flags & 128) === 0 && (typeof t.getDerivedStateFromError == "function" || n !== null && typeof n.componentDidCatch == "function" && (ie === null || !ie.has(n))))
            return e.flags |= 65536, u &= -u, e.lanes |= u, u = go(u), bo(
              u,
              l,
              e,
              a
            ), xc(e, u), !1;
      }
      e = e.return;
    } while (e !== null);
    return !1;
  }
  var So = Error(g(461)), Dl = !1;
  function ql(l, t, e, a) {
    t.child = l === null ? io(t, null, e, a) : ca(
      t,
      l.child,
      e,
      a
    );
  }
  function Eo(l, t, e, a, u) {
    e = e.render;
    var n = t.ref;
    if ("ref" in a) {
      var c = {};
      for (var f in a)
        f !== "ref" && (c[f] = a[f]);
    } else c = a;
    return De(t), a = qc(
      l,
      t,
      e,
      c,
      n,
      u
    ), f = Bc(), l !== null && !Dl ? (Yc(l, t, u), Qt(l, t, u)) : (I && f && bc(t), t.flags |= 1, ql(l, t, a, u), t.child);
  }
  function po(l, t, e, a, u) {
    if (l === null) {
      var n = e.type;
      return typeof n == "function" && !yc(n) && n.defaultProps === void 0 && e.compare === null ? (t.tag = 15, t.type = n, To(
        l,
        t,
        n,
        a,
        u
      )) : (l = Yu(
        e.type,
        null,
        a,
        t,
        t.mode,
        u
      ), l.ref = t.ref, l.return = t, t.child = l);
    }
    if (n = l.child, !cf(l, u)) {
      var c = n.memoizedProps;
      if (e = e.compare, e = e !== null ? e : Ra, e(c, a) && l.ref === t.ref)
        return Qt(l, t, u);
    }
    return t.flags |= 1, l = wt(n, a), l.ref = t.ref, l.return = t, t.child = l;
  }
  function To(l, t, e, a, u) {
    if (l !== null) {
      var n = l.memoizedProps;
      if (Ra(n, a) && l.ref === t.ref)
        if (Dl = !1, t.pendingProps = a = n, cf(l, u))
          (l.flags & 131072) !== 0 && (Dl = !0);
        else
          return t.lanes = l.lanes, Qt(l, t, u);
    }
    return Pc(
      l,
      t,
      e,
      a,
      u
    );
  }
  function Ao(l, t, e) {
    var a = t.pendingProps, u = a.children, n = l !== null ? l.memoizedState : null;
    if (a.mode === "hidden") {
      if ((t.flags & 128) !== 0) {
        if (a = n !== null ? n.baseLanes | e : e, l !== null) {
          for (u = t.child = l.child, n = 0; u !== null; )
            n = n | u.lanes | u.childLanes, u = u.sibling;
          t.childLanes = n & ~a;
        } else t.childLanes = 0, t.child = null;
        return zo(
          l,
          t,
          a,
          e
        );
      }
      if ((e & 536870912) !== 0)
        t.memoizedState = { baseLanes: 0, cachePool: null }, l !== null && ju(
          t,
          n !== null ? n.cachePool : null
        ), n !== null ? ps(t, n) : Rc(), so(t);
      else
        return t.lanes = t.childLanes = 536870912, zo(
          l,
          t,
          n !== null ? n.baseLanes | e : e,
          e
        );
    } else
      n !== null ? (ju(t, n.cachePool), ps(t, n), ee(), t.memoizedState = null) : (l !== null && ju(t, null), Rc(), ee());
    return ql(l, t, u, e), t.child;
  }
  function zo(l, t, e, a) {
    var u = Mc();
    return u = u === null ? null : { parent: Ol._currentValue, pool: u }, t.memoizedState = {
      baseLanes: e,
      cachePool: u
    }, l !== null && ju(t, null), Rc(), so(t), l !== null && Ya(l, t, a, !0), null;
  }
  function nn(l, t) {
    var e = t.ref;
    if (e === null)
      l !== null && l.ref !== null && (t.flags |= 4194816);
    else {
      if (typeof e != "function" && typeof e != "object")
        throw Error(g(284));
      (l === null || l.ref !== e) && (t.flags |= 4194816);
    }
  }
  function Pc(l, t, e, a, u) {
    return De(t), e = qc(
      l,
      t,
      e,
      a,
      void 0,
      u
    ), a = Bc(), l !== null && !Dl ? (Yc(l, t, u), Qt(l, t, u)) : (I && a && bc(t), t.flags |= 1, ql(l, t, e, u), t.child);
  }
  function Oo(l, t, e, a, u, n) {
    return De(t), t.updateQueue = null, e = As(
      t,
      a,
      e,
      u
    ), Ts(l), a = Bc(), l !== null && !Dl ? (Yc(l, t, n), Qt(l, t, n)) : (I && a && bc(t), t.flags |= 1, ql(l, t, e, n), t.child);
  }
  function Mo(l, t, e, a, u) {
    if (De(t), t.stateNode === null) {
      var n = $e, c = e.contextType;
      typeof c == "object" && c !== null && (n = Ql(c)), n = new e(a, n), t.memoizedState = n.state !== null && n.state !== void 0 ? n.state : null, n.updater = Fc, t.stateNode = n, n._reactInternals = t, n = t.stateNode, n.props = a, n.state = t.memoizedState, n.refs = {}, Dc(t), c = e.contextType, n.context = typeof c == "object" && c !== null ? Ql(c) : $e, n.state = t.memoizedState, c = e.getDerivedStateFromProps, typeof c == "function" && ($c(
        t,
        e,
        c,
        a
      ), n.state = t.memoizedState), typeof e.getDerivedStateFromProps == "function" || typeof n.getSnapshotBeforeUpdate == "function" || typeof n.UNSAFE_componentWillMount != "function" && typeof n.componentWillMount != "function" || (c = n.state, typeof n.componentWillMount == "function" && n.componentWillMount(), typeof n.UNSAFE_componentWillMount == "function" && n.UNSAFE_componentWillMount(), c !== n.state && Fc.enqueueReplaceState(n, n.state, null), Va(t, a, n, u), Za(), n.state = t.memoizedState), typeof n.componentDidMount == "function" && (t.flags |= 4194308), a = !0;
    } else if (l === null) {
      n = t.stateNode;
      var f = t.memoizedProps, i = Ne(e, f);
      n.props = i;
      var v = n.context, S = e.contextType;
      c = $e, typeof S == "object" && S !== null && (c = Ql(S));
      var p = e.getDerivedStateFromProps;
      S = typeof p == "function" || typeof n.getSnapshotBeforeUpdate == "function", f = t.pendingProps !== f, S || typeof n.UNSAFE_componentWillReceiveProps != "function" && typeof n.componentWillReceiveProps != "function" || (f || v !== c) && ro(
        t,
        n,
        a,
        c
      ), Ft = !1;
      var y = t.memoizedState;
      n.state = y, Va(t, a, n, u), Za(), v = t.memoizedState, f || y !== v || Ft ? (typeof p == "function" && ($c(
        t,
        e,
        p,
        a
      ), v = t.memoizedState), (i = Ft || oo(
        t,
        e,
        i,
        a,
        y,
        v,
        c
      )) ? (S || typeof n.UNSAFE_componentWillMount != "function" && typeof n.componentWillMount != "function" || (typeof n.componentWillMount == "function" && n.componentWillMount(), typeof n.UNSAFE_componentWillMount == "function" && n.UNSAFE_componentWillMount()), typeof n.componentDidMount == "function" && (t.flags |= 4194308)) : (typeof n.componentDidMount == "function" && (t.flags |= 4194308), t.memoizedProps = a, t.memoizedState = v), n.props = a, n.state = v, n.context = c, a = i) : (typeof n.componentDidMount == "function" && (t.flags |= 4194308), a = !1);
    } else {
      n = t.stateNode, Uc(l, t), c = t.memoizedProps, S = Ne(e, c), n.props = S, p = t.pendingProps, y = n.context, v = e.contextType, i = $e, typeof v == "object" && v !== null && (i = Ql(v)), f = e.getDerivedStateFromProps, (v = typeof f == "function" || typeof n.getSnapshotBeforeUpdate == "function") || typeof n.UNSAFE_componentWillReceiveProps != "function" && typeof n.componentWillReceiveProps != "function" || (c !== p || y !== i) && ro(
        t,
        n,
        a,
        i
      ), Ft = !1, y = t.memoizedState, n.state = y, Va(t, a, n, u), Za();
      var h = t.memoizedState;
      c !== p || y !== h || Ft || l !== null && l.dependencies !== null && Qu(l.dependencies) ? (typeof f == "function" && ($c(
        t,
        e,
        f,
        a
      ), h = t.memoizedState), (S = Ft || oo(
        t,
        e,
        S,
        a,
        y,
        h,
        i
      ) || l !== null && l.dependencies !== null && Qu(l.dependencies)) ? (v || typeof n.UNSAFE_componentWillUpdate != "function" && typeof n.componentWillUpdate != "function" || (typeof n.componentWillUpdate == "function" && n.componentWillUpdate(a, h, i), typeof n.UNSAFE_componentWillUpdate == "function" && n.UNSAFE_componentWillUpdate(
        a,
        h,
        i
      )), typeof n.componentDidUpdate == "function" && (t.flags |= 4), typeof n.getSnapshotBeforeUpdate == "function" && (t.flags |= 1024)) : (typeof n.componentDidUpdate != "function" || c === l.memoizedProps && y === l.memoizedState || (t.flags |= 4), typeof n.getSnapshotBeforeUpdate != "function" || c === l.memoizedProps && y === l.memoizedState || (t.flags |= 1024), t.memoizedProps = a, t.memoizedState = h), n.props = a, n.state = h, n.context = i, a = S) : (typeof n.componentDidUpdate != "function" || c === l.memoizedProps && y === l.memoizedState || (t.flags |= 4), typeof n.getSnapshotBeforeUpdate != "function" || c === l.memoizedProps && y === l.memoizedState || (t.flags |= 1024), a = !1);
    }
    return n = a, nn(l, t), a = (t.flags & 128) !== 0, n || a ? (n = t.stateNode, e = a && typeof e.getDerivedStateFromError != "function" ? null : n.render(), t.flags |= 1, l !== null && a ? (t.child = ca(
      t,
      l.child,
      null,
      u
    ), t.child = ca(
      t,
      null,
      e,
      u
    )) : ql(l, t, e, u), t.memoizedState = n.state, l = t.child) : l = Qt(
      l,
      t,
      u
    ), l;
  }
  function _o(l, t, e, a) {
    return qa(), t.flags |= 256, ql(l, t, e, a), t.child;
  }
  var lf = {
    dehydrated: null,
    treeContext: null,
    retryLane: 0,
    hydrationErrors: null
  };
  function tf(l) {
    return { baseLanes: l, cachePool: ms() };
  }
  function ef(l, t, e) {
    return l = l !== null ? l.childLanes & ~e : 0, t && (l |= gt), l;
  }
  function Do(l, t, e) {
    var a = t.pendingProps, u = !1, n = (t.flags & 128) !== 0, c;
    if ((c = n) || (c = l !== null && l.memoizedState === null ? !1 : (Ml.current & 2) !== 0), c && (u = !0, t.flags &= -129), c = (t.flags & 32) !== 0, t.flags &= -33, l === null) {
      if (I) {
        if (u ? te(t) : ee(), I) {
          var f = ml, i;
          if (i = f) {
            l: {
              for (i = f, f = zt; i.nodeType !== 8; ) {
                if (!f) {
                  f = null;
                  break l;
                }
                if (i = pt(
                  i.nextSibling
                ), i === null) {
                  f = null;
                  break l;
                }
              }
              f = i;
            }
            f !== null ? (t.memoizedState = {
              dehydrated: f,
              treeContext: Ae !== null ? { id: Ht, overflow: qt } : null,
              retryLane: 536870912,
              hydrationErrors: null
            }, i = tt(
              18,
              null,
              null,
              0
            ), i.stateNode = f, i.return = t, t.child = i, Zl = t, ml = null, i = !0) : i = !1;
          }
          i || Me(t);
        }
        if (f = t.memoizedState, f !== null && (f = f.dehydrated, f !== null))
          return Qf(f) ? t.lanes = 32 : t.lanes = 536870912, null;
        Xt(t);
      }
      return f = a.children, a = a.fallback, u ? (ee(), u = t.mode, f = cn(
        { mode: "hidden", children: f },
        u
      ), a = Te(
        a,
        u,
        e,
        null
      ), f.return = t, a.return = t, f.sibling = a, t.child = f, u = t.child, u.memoizedState = tf(e), u.childLanes = ef(
        l,
        c,
        e
      ), t.memoizedState = lf, a) : (te(t), af(t, f));
    }
    if (i = l.memoizedState, i !== null && (f = i.dehydrated, f !== null)) {
      if (n)
        t.flags & 256 ? (te(t), t.flags &= -257, t = uf(
          l,
          t,
          e
        )) : t.memoizedState !== null ? (ee(), t.child = l.child, t.flags |= 128, t = null) : (ee(), u = a.fallback, f = t.mode, a = cn(
          { mode: "visible", children: a.children },
          f
        ), u = Te(
          u,
          f,
          e,
          null
        ), u.flags |= 2, a.return = t, u.return = t, a.sibling = u, t.child = a, ca(
          t,
          l.child,
          null,
          e
        ), a = t.child, a.memoizedState = tf(e), a.childLanes = ef(
          l,
          c,
          e
        ), t.memoizedState = lf, t = u);
      else if (te(t), Qf(f)) {
        if (c = f.nextSibling && f.nextSibling.dataset, c) var v = c.dgst;
        c = v, a = Error(g(419)), a.stack = "", a.digest = c, Ba({ value: a, source: null, stack: null }), t = uf(
          l,
          t,
          e
        );
      } else if (Dl || Ya(l, t, e, !1), c = (e & l.childLanes) !== 0, Dl || c) {
        if (c = cl, c !== null && (a = e & -e, a = (a & 42) !== 0 ? 1 : Qn(a), a = (a & (c.suspendedLanes | e)) !== 0 ? 0 : a, a !== 0 && a !== i.retryLane))
          throw i.retryLane = a, We(l, a), ct(c, l, a), So;
        f.data === "$?" || Af(), t = uf(
          l,
          t,
          e
        );
      } else
        f.data === "$?" ? (t.flags |= 192, t.child = l.child, t = null) : (l = i.treeContext, ml = pt(
          f.nextSibling
        ), Zl = t, I = !0, Oe = null, zt = !1, l !== null && (vt[yt++] = Ht, vt[yt++] = qt, vt[yt++] = Ae, Ht = l.id, qt = l.overflow, Ae = t), t = af(
          t,
          a.children
        ), t.flags |= 4096);
      return t;
    }
    return u ? (ee(), u = a.fallback, f = t.mode, i = l.child, v = i.sibling, a = wt(i, {
      mode: "hidden",
      children: a.children
    }), a.subtreeFlags = i.subtreeFlags & 65011712, v !== null ? u = wt(v, u) : (u = Te(
      u,
      f,
      e,
      null
    ), u.flags |= 2), u.return = t, a.return = t, a.sibling = u, t.child = a, a = u, u = t.child, f = l.child.memoizedState, f === null ? f = tf(e) : (i = f.cachePool, i !== null ? (v = Ol._currentValue, i = i.parent !== v ? { parent: v, pool: v } : i) : i = ms(), f = {
      baseLanes: f.baseLanes | e,
      cachePool: i
    }), u.memoizedState = f, u.childLanes = ef(
      l,
      c,
      e
    ), t.memoizedState = lf, a) : (te(t), e = l.child, l = e.sibling, e = wt(e, {
      mode: "visible",
      children: a.children
    }), e.return = t, e.sibling = null, l !== null && (c = t.deletions, c === null ? (t.deletions = [l], t.flags |= 16) : c.push(l)), t.child = e, t.memoizedState = null, e);
  }
  function af(l, t) {
    return t = cn(
      { mode: "visible", children: t },
      l.mode
    ), t.return = l, l.child = t;
  }
  function cn(l, t) {
    return l = tt(22, l, null, t), l.lanes = 0, l.stateNode = {
      _visibility: 1,
      _pendingMarkers: null,
      _retryCache: null,
      _transitions: null
    }, l;
  }
  function uf(l, t, e) {
    return ca(t, l.child, null, e), l = af(
      t,
      t.pendingProps.children
    ), l.flags |= 2, t.memoizedState = null, l;
  }
  function Uo(l, t, e) {
    l.lanes |= t;
    var a = l.alternate;
    a !== null && (a.lanes |= t), Tc(l.return, t, e);
  }
  function nf(l, t, e, a, u) {
    var n = l.memoizedState;
    n === null ? l.memoizedState = {
      isBackwards: t,
      rendering: null,
      renderingStartTime: 0,
      last: a,
      tail: e,
      tailMode: u
    } : (n.isBackwards = t, n.rendering = null, n.renderingStartTime = 0, n.last = a, n.tail = e, n.tailMode = u);
  }
  function xo(l, t, e) {
    var a = t.pendingProps, u = a.revealOrder, n = a.tail;
    if (ql(l, t, a.children, e), a = Ml.current, (a & 2) !== 0)
      a = a & 1 | 2, t.flags |= 128;
    else {
      if (l !== null && (l.flags & 128) !== 0)
        l: for (l = t.child; l !== null; ) {
          if (l.tag === 13)
            l.memoizedState !== null && Uo(l, e, t);
          else if (l.tag === 19)
            Uo(l, e, t);
          else if (l.child !== null) {
            l.child.return = l, l = l.child;
            continue;
          }
          if (l === t) break l;
          for (; l.sibling === null; ) {
            if (l.return === null || l.return === t)
              break l;
            l = l.return;
          }
          l.sibling.return = l.return, l = l.sibling;
        }
      a &= 1;
    }
    switch (_(Ml, a), u) {
      case "forwards":
        for (e = t.child, u = null; e !== null; )
          l = e.alternate, l !== null && en(l) === null && (u = e), e = e.sibling;
        e = u, e === null ? (u = t.child, t.child = null) : (u = e.sibling, e.sibling = null), nf(
          t,
          !1,
          u,
          e,
          n
        );
        break;
      case "backwards":
        for (e = null, u = t.child, t.child = null; u !== null; ) {
          if (l = u.alternate, l !== null && en(l) === null) {
            t.child = u;
            break;
          }
          l = u.sibling, u.sibling = e, e = u, u = l;
        }
        nf(
          t,
          !0,
          e,
          null,
          n
        );
        break;
      case "together":
        nf(t, !1, null, null, void 0);
        break;
      default:
        t.memoizedState = null;
    }
    return t.child;
  }
  function Qt(l, t, e) {
    if (l !== null && (t.dependencies = l.dependencies), fe |= t.lanes, (e & t.childLanes) === 0)
      if (l !== null) {
        if (Ya(
          l,
          t,
          e,
          !1
        ), (e & t.childLanes) === 0)
          return null;
      } else return null;
    if (l !== null && t.child !== l.child)
      throw Error(g(153));
    if (t.child !== null) {
      for (l = t.child, e = wt(l, l.pendingProps), t.child = e, e.return = t; l.sibling !== null; )
        l = l.sibling, e = e.sibling = wt(l, l.pendingProps), e.return = t;
      e.sibling = null;
    }
    return t.child;
  }
  function cf(l, t) {
    return (l.lanes & t) !== 0 ? !0 : (l = l.dependencies, !!(l !== null && Qu(l)));
  }
  function R0(l, t, e) {
    switch (t.tag) {
      case 3:
        il(t, t.stateNode.containerInfo), $t(t, Ol, l.memoizedState.cache), qa();
        break;
      case 27:
      case 5:
        qn(t);
        break;
      case 4:
        il(t, t.stateNode.containerInfo);
        break;
      case 10:
        $t(
          t,
          t.type,
          t.memoizedProps.value
        );
        break;
      case 13:
        var a = t.memoizedState;
        if (a !== null)
          return a.dehydrated !== null ? (te(t), t.flags |= 128, null) : (e & t.child.childLanes) !== 0 ? Do(l, t, e) : (te(t), l = Qt(
            l,
            t,
            e
          ), l !== null ? l.sibling : null);
        te(t);
        break;
      case 19:
        var u = (l.flags & 128) !== 0;
        if (a = (e & t.childLanes) !== 0, a || (Ya(
          l,
          t,
          e,
          !1
        ), a = (e & t.childLanes) !== 0), u) {
          if (a)
            return xo(
              l,
              t,
              e
            );
          t.flags |= 128;
        }
        if (u = t.memoizedState, u !== null && (u.rendering = null, u.tail = null, u.lastEffect = null), _(Ml, Ml.current), a) break;
        return null;
      case 22:
      case 23:
        return t.lanes = 0, Ao(l, t, e);
      case 24:
        $t(t, Ol, l.memoizedState.cache);
    }
    return Qt(l, t, e);
  }
  function No(l, t, e) {
    if (l !== null)
      if (l.memoizedProps !== t.pendingProps)
        Dl = !0;
      else {
        if (!cf(l, e) && (t.flags & 128) === 0)
          return Dl = !1, R0(
            l,
            t,
            e
          );
        Dl = (l.flags & 131072) !== 0;
      }
    else
      Dl = !1, I && (t.flags & 1048576) !== 0 && cs(t, Xu, t.index);
    switch (t.lanes = 0, t.tag) {
      case 16:
        l: {
          l = t.pendingProps;
          var a = t.elementType, u = a._init;
          if (a = u(a._payload), t.type = a, typeof a == "function")
            yc(a) ? (l = Ne(a, l), t.tag = 1, t = Mo(
              null,
              t,
              a,
              l,
              e
            )) : (t.tag = 0, t = Pc(
              null,
              t,
              a,
              l,
              e
            ));
          else {
            if (a != null) {
              if (u = a.$$typeof, u === jl) {
                t.tag = 11, t = Eo(
                  null,
                  t,
                  a,
                  l,
                  e
                );
                break l;
              } else if (u === Hl) {
                t.tag = 14, t = po(
                  null,
                  t,
                  a,
                  l,
                  e
                );
                break l;
              }
            }
            throw t = xt(a) || a, Error(g(306, t, ""));
          }
        }
        return t;
      case 0:
        return Pc(
          l,
          t,
          t.type,
          t.pendingProps,
          e
        );
      case 1:
        return a = t.type, u = Ne(
          a,
          t.pendingProps
        ), Mo(
          l,
          t,
          a,
          u,
          e
        );
      case 3:
        l: {
          if (il(
            t,
            t.stateNode.containerInfo
          ), l === null) throw Error(g(387));
          a = t.pendingProps;
          var n = t.memoizedState;
          u = n.element, Uc(l, t), Va(t, a, null, e);
          var c = t.memoizedState;
          if (a = c.cache, $t(t, Ol, a), a !== n.cache && Ac(
            t,
            [Ol],
            e,
            !0
          ), Za(), a = c.element, n.isDehydrated)
            if (n = {
              element: a,
              isDehydrated: !1,
              cache: c.cache
            }, t.updateQueue.baseState = n, t.memoizedState = n, t.flags & 256) {
              t = _o(
                l,
                t,
                a,
                e
              );
              break l;
            } else if (a !== u) {
              u = dt(
                Error(g(424)),
                t
              ), Ba(u), t = _o(
                l,
                t,
                a,
                e
              );
              break l;
            } else {
              switch (l = t.stateNode.containerInfo, l.nodeType) {
                case 9:
                  l = l.body;
                  break;
                default:
                  l = l.nodeName === "HTML" ? l.ownerDocument.body : l;
              }
              for (ml = pt(l.firstChild), Zl = t, I = !0, Oe = null, zt = !0, e = io(
                t,
                null,
                a,
                e
              ), t.child = e; e; )
                e.flags = e.flags & -3 | 4096, e = e.sibling;
            }
          else {
            if (qa(), a === u) {
              t = Qt(
                l,
                t,
                e
              );
              break l;
            }
            ql(
              l,
              t,
              a,
              e
            );
          }
          t = t.child;
        }
        return t;
      case 26:
        return nn(l, t), l === null ? (e = qr(
          t.type,
          null,
          t.pendingProps,
          null
        )) ? t.memoizedState = e : I || (e = t.type, l = t.pendingProps, a = pn(
          Y.current
        ).createElement(e), a[Xl] = t, a[Ll] = l, Yl(a, e, l), _l(a), t.stateNode = a) : t.memoizedState = qr(
          t.type,
          l.memoizedProps,
          t.pendingProps,
          l.memoizedState
        ), null;
      case 27:
        return qn(t), l === null && I && (a = t.stateNode = Rr(
          t.type,
          t.pendingProps,
          Y.current
        ), Zl = t, zt = !0, u = ml, re(t.type) ? (Cf = u, ml = pt(
          a.firstChild
        )) : ml = u), ql(
          l,
          t,
          t.pendingProps.children,
          e
        ), nn(l, t), l === null && (t.flags |= 4194304), t.child;
      case 5:
        return l === null && I && ((u = a = ml) && (a = cm(
          a,
          t.type,
          t.pendingProps,
          zt
        ), a !== null ? (t.stateNode = a, Zl = t, ml = pt(
          a.firstChild
        ), zt = !1, u = !0) : u = !1), u || Me(t)), qn(t), u = t.type, n = t.pendingProps, c = l !== null ? l.memoizedProps : null, a = n.children, Yf(u, n) ? a = null : c !== null && Yf(u, c) && (t.flags |= 32), t.memoizedState !== null && (u = qc(
          l,
          t,
          z0,
          null,
          null,
          e
        ), du._currentValue = u), nn(l, t), ql(l, t, a, e), t.child;
      case 6:
        return l === null && I && ((l = e = ml) && (e = fm(
          e,
          t.pendingProps,
          zt
        ), e !== null ? (t.stateNode = e, Zl = t, ml = null, l = !0) : l = !1), l || Me(t)), null;
      case 13:
        return Do(l, t, e);
      case 4:
        return il(
          t,
          t.stateNode.containerInfo
        ), a = t.pendingProps, l === null ? t.child = ca(
          t,
          null,
          a,
          e
        ) : ql(
          l,
          t,
          a,
          e
        ), t.child;
      case 11:
        return Eo(
          l,
          t,
          t.type,
          t.pendingProps,
          e
        );
      case 7:
        return ql(
          l,
          t,
          t.pendingProps,
          e
        ), t.child;
      case 8:
        return ql(
          l,
          t,
          t.pendingProps.children,
          e
        ), t.child;
      case 12:
        return ql(
          l,
          t,
          t.pendingProps.children,
          e
        ), t.child;
      case 10:
        return a = t.pendingProps, $t(t, t.type, a.value), ql(
          l,
          t,
          a.children,
          e
        ), t.child;
      case 9:
        return u = t.type._context, a = t.pendingProps.children, De(t), u = Ql(u), a = a(u), t.flags |= 1, ql(l, t, a, e), t.child;
      case 14:
        return po(
          l,
          t,
          t.type,
          t.pendingProps,
          e
        );
      case 15:
        return To(
          l,
          t,
          t.type,
          t.pendingProps,
          e
        );
      case 19:
        return xo(l, t, e);
      case 31:
        return a = t.pendingProps, e = t.mode, a = {
          mode: a.mode,
          children: a.children
        }, l === null ? (e = cn(
          a,
          e
        ), e.ref = t.ref, t.child = e, e.return = t, t = e) : (e = wt(l.child, a), e.ref = t.ref, t.child = e, e.return = t, t = e), t;
      case 22:
        return Ao(l, t, e);
      case 24:
        return De(t), a = Ql(Ol), l === null ? (u = Mc(), u === null && (u = cl, n = zc(), u.pooledCache = n, n.refCount++, n !== null && (u.pooledCacheLanes |= e), u = n), t.memoizedState = {
          parent: a,
          cache: u
        }, Dc(t), $t(t, Ol, u)) : ((l.lanes & e) !== 0 && (Uc(l, t), Va(t, null, null, e), Za()), u = l.memoizedState, n = t.memoizedState, u.parent !== a ? (u = { parent: a, cache: a }, t.memoizedState = u, t.lanes === 0 && (t.memoizedState = t.updateQueue.baseState = u), $t(t, Ol, a)) : (a = n.cache, $t(t, Ol, a), a !== u.cache && Ac(
          t,
          [Ol],
          e,
          !0
        ))), ql(
          l,
          t,
          t.pendingProps.children,
          e
        ), t.child;
      case 29:
        throw t.pendingProps;
    }
    throw Error(g(156, t.tag));
  }
  function Ct(l) {
    l.flags |= 4;
  }
  function Ro(l, t) {
    if (t.type !== "stylesheet" || (t.state.loading & 4) !== 0)
      l.flags &= -16777217;
    else if (l.flags |= 16777216, !Qr(t)) {
      if (t = ht.current, t !== null && ((k & 4194048) === k ? Ot !== null : (k & 62914560) !== k && (k & 536870912) === 0 || t !== Ot))
        throw Ca = _c, vs;
      l.flags |= 8192;
    }
  }
  function fn(l, t) {
    t !== null && (l.flags |= 4), l.flags & 16384 && (t = l.tag !== 22 ? si() : 536870912, l.lanes |= t, oa |= t);
  }
  function Fa(l, t) {
    if (!I)
      switch (l.tailMode) {
        case "hidden":
          t = l.tail;
          for (var e = null; t !== null; )
            t.alternate !== null && (e = t), t = t.sibling;
          e === null ? l.tail = null : e.sibling = null;
          break;
        case "collapsed":
          e = l.tail;
          for (var a = null; e !== null; )
            e.alternate !== null && (a = e), e = e.sibling;
          a === null ? t || l.tail === null ? l.tail = null : l.tail.sibling = null : a.sibling = null;
      }
  }
  function dl(l) {
    var t = l.alternate !== null && l.alternate.child === l.child, e = 0, a = 0;
    if (t)
      for (var u = l.child; u !== null; )
        e |= u.lanes | u.childLanes, a |= u.subtreeFlags & 65011712, a |= u.flags & 65011712, u.return = l, u = u.sibling;
    else
      for (u = l.child; u !== null; )
        e |= u.lanes | u.childLanes, a |= u.subtreeFlags, a |= u.flags, u.return = l, u = u.sibling;
    return l.subtreeFlags |= a, l.childLanes = e, t;
  }
  function w0(l, t, e) {
    var a = t.pendingProps;
    switch (Sc(t), t.tag) {
      case 31:
      case 16:
      case 15:
      case 0:
      case 11:
      case 7:
      case 8:
      case 12:
      case 9:
      case 14:
        return dl(t), null;
      case 1:
        return dl(t), null;
      case 3:
        return e = t.stateNode, a = null, l !== null && (a = l.memoizedState.cache), t.memoizedState.cache !== a && (t.flags |= 2048), Yt(Ol), Kt(), e.pendingContext && (e.context = e.pendingContext, e.pendingContext = null), (l === null || l.child === null) && (Ha(t) ? Ct(t) : l === null || l.memoizedState.isDehydrated && (t.flags & 256) === 0 || (t.flags |= 1024, ss())), dl(t), null;
      case 26:
        return e = t.memoizedState, l === null ? (Ct(t), e !== null ? (dl(t), Ro(t, e)) : (dl(t), t.flags &= -16777217)) : e ? e !== l.memoizedState ? (Ct(t), dl(t), Ro(t, e)) : (dl(t), t.flags &= -16777217) : (l.memoizedProps !== a && Ct(t), dl(t), t.flags &= -16777217), null;
      case 27:
        bu(t), e = Y.current;
        var u = t.type;
        if (l !== null && t.stateNode != null)
          l.memoizedProps !== a && Ct(t);
        else {
          if (!a) {
            if (t.stateNode === null)
              throw Error(g(166));
            return dl(t), null;
          }
          l = w.current, Ha(t) ? fs(t) : (l = Rr(u, a, e), t.stateNode = l, Ct(t));
        }
        return dl(t), null;
      case 5:
        if (bu(t), e = t.type, l !== null && t.stateNode != null)
          l.memoizedProps !== a && Ct(t);
        else {
          if (!a) {
            if (t.stateNode === null)
              throw Error(g(166));
            return dl(t), null;
          }
          if (l = w.current, Ha(t))
            fs(t);
          else {
            switch (u = pn(
              Y.current
            ), l) {
              case 1:
                l = u.createElementNS(
                  "http://www.w3.org/2000/svg",
                  e
                );
                break;
              case 2:
                l = u.createElementNS(
                  "http://www.w3.org/1998/Math/MathML",
                  e
                );
                break;
              default:
                switch (e) {
                  case "svg":
                    l = u.createElementNS(
                      "http://www.w3.org/2000/svg",
                      e
                    );
                    break;
                  case "math":
                    l = u.createElementNS(
                      "http://www.w3.org/1998/Math/MathML",
                      e
                    );
                    break;
                  case "script":
                    l = u.createElement("div"), l.innerHTML = "<script><\/script>", l = l.removeChild(l.firstChild);
                    break;
                  case "select":
                    l = typeof a.is == "string" ? u.createElement("select", { is: a.is }) : u.createElement("select"), a.multiple ? l.multiple = !0 : a.size && (l.size = a.size);
                    break;
                  default:
                    l = typeof a.is == "string" ? u.createElement(e, { is: a.is }) : u.createElement(e);
                }
            }
            l[Xl] = t, l[Ll] = a;
            l: for (u = t.child; u !== null; ) {
              if (u.tag === 5 || u.tag === 6)
                l.appendChild(u.stateNode);
              else if (u.tag !== 4 && u.tag !== 27 && u.child !== null) {
                u.child.return = u, u = u.child;
                continue;
              }
              if (u === t) break l;
              for (; u.sibling === null; ) {
                if (u.return === null || u.return === t)
                  break l;
                u = u.return;
              }
              u.sibling.return = u.return, u = u.sibling;
            }
            t.stateNode = l;
            l: switch (Yl(l, e, a), e) {
              case "button":
              case "input":
              case "select":
              case "textarea":
                l = !!a.autoFocus;
                break l;
              case "img":
                l = !0;
                break l;
              default:
                l = !1;
            }
            l && Ct(t);
          }
        }
        return dl(t), t.flags &= -16777217, null;
      case 6:
        if (l && t.stateNode != null)
          l.memoizedProps !== a && Ct(t);
        else {
          if (typeof a != "string" && t.stateNode === null)
            throw Error(g(166));
          if (l = Y.current, Ha(t)) {
            if (l = t.stateNode, e = t.memoizedProps, a = null, u = Zl, u !== null)
              switch (u.tag) {
                case 27:
                case 5:
                  a = u.memoizedProps;
              }
            l[Xl] = t, l = !!(l.nodeValue === e || a !== null && a.suppressHydrationWarning === !0 || Or(l.nodeValue, e)), l || Me(t);
          } else
            l = pn(l).createTextNode(
              a
            ), l[Xl] = t, t.stateNode = l;
        }
        return dl(t), null;
      case 13:
        if (a = t.memoizedState, l === null || l.memoizedState !== null && l.memoizedState.dehydrated !== null) {
          if (u = Ha(t), a !== null && a.dehydrated !== null) {
            if (l === null) {
              if (!u) throw Error(g(318));
              if (u = t.memoizedState, u = u !== null ? u.dehydrated : null, !u) throw Error(g(317));
              u[Xl] = t;
            } else
              qa(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            dl(t), u = !1;
          } else
            u = ss(), l !== null && l.memoizedState !== null && (l.memoizedState.hydrationErrors = u), u = !0;
          if (!u)
            return t.flags & 256 ? (Xt(t), t) : (Xt(t), null);
        }
        if (Xt(t), (t.flags & 128) !== 0)
          return t.lanes = e, t;
        if (e = a !== null, l = l !== null && l.memoizedState !== null, e) {
          a = t.child, u = null, a.alternate !== null && a.alternate.memoizedState !== null && a.alternate.memoizedState.cachePool !== null && (u = a.alternate.memoizedState.cachePool.pool);
          var n = null;
          a.memoizedState !== null && a.memoizedState.cachePool !== null && (n = a.memoizedState.cachePool.pool), n !== u && (a.flags |= 2048);
        }
        return e !== l && e && (t.child.flags |= 8192), fn(t, t.updateQueue), dl(t), null;
      case 4:
        return Kt(), l === null && Rf(t.stateNode.containerInfo), dl(t), null;
      case 10:
        return Yt(t.type), dl(t), null;
      case 19:
        if (D(Ml), u = t.memoizedState, u === null) return dl(t), null;
        if (a = (t.flags & 128) !== 0, n = u.rendering, n === null)
          if (a) Fa(u, !1);
          else {
            if (vl !== 0 || l !== null && (l.flags & 128) !== 0)
              for (l = t.child; l !== null; ) {
                if (n = en(l), n !== null) {
                  for (t.flags |= 128, Fa(u, !1), l = n.updateQueue, t.updateQueue = l, fn(t, l), t.subtreeFlags = 0, l = e, e = t.child; e !== null; )
                    ns(e, l), e = e.sibling;
                  return _(
                    Ml,
                    Ml.current & 1 | 2
                  ), t.child;
                }
                l = l.sibling;
              }
            u.tail !== null && At() > rn && (t.flags |= 128, a = !0, Fa(u, !1), t.lanes = 4194304);
          }
        else {
          if (!a)
            if (l = en(n), l !== null) {
              if (t.flags |= 128, a = !0, l = l.updateQueue, t.updateQueue = l, fn(t, l), Fa(u, !0), u.tail === null && u.tailMode === "hidden" && !n.alternate && !I)
                return dl(t), null;
            } else
              2 * At() - u.renderingStartTime > rn && e !== 536870912 && (t.flags |= 128, a = !0, Fa(u, !1), t.lanes = 4194304);
          u.isBackwards ? (n.sibling = t.child, t.child = n) : (l = u.last, l !== null ? l.sibling = n : t.child = n, u.last = n);
        }
        return u.tail !== null ? (t = u.tail, u.rendering = t, u.tail = t.sibling, u.renderingStartTime = At(), t.sibling = null, l = Ml.current, _(Ml, a ? l & 1 | 2 : l & 1), t) : (dl(t), null);
      case 22:
      case 23:
        return Xt(t), wc(), a = t.memoizedState !== null, l !== null ? l.memoizedState !== null !== a && (t.flags |= 8192) : a && (t.flags |= 8192), a ? (e & 536870912) !== 0 && (t.flags & 128) === 0 && (dl(t), t.subtreeFlags & 6 && (t.flags |= 8192)) : dl(t), e = t.updateQueue, e !== null && fn(t, e.retryQueue), e = null, l !== null && l.memoizedState !== null && l.memoizedState.cachePool !== null && (e = l.memoizedState.cachePool.pool), a = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (a = t.memoizedState.cachePool.pool), a !== e && (t.flags |= 2048), l !== null && D(Ue), null;
      case 24:
        return e = null, l !== null && (e = l.memoizedState.cache), t.memoizedState.cache !== e && (t.flags |= 2048), Yt(Ol), dl(t), null;
      case 25:
        return null;
      case 30:
        return null;
    }
    throw Error(g(156, t.tag));
  }
  function H0(l, t) {
    switch (Sc(t), t.tag) {
      case 1:
        return l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 3:
        return Yt(Ol), Kt(), l = t.flags, (l & 65536) !== 0 && (l & 128) === 0 ? (t.flags = l & -65537 | 128, t) : null;
      case 26:
      case 27:
      case 5:
        return bu(t), null;
      case 13:
        if (Xt(t), l = t.memoizedState, l !== null && l.dehydrated !== null) {
          if (t.alternate === null)
            throw Error(g(340));
          qa();
        }
        return l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 19:
        return D(Ml), null;
      case 4:
        return Kt(), null;
      case 10:
        return Yt(t.type), null;
      case 22:
      case 23:
        return Xt(t), wc(), l !== null && D(Ue), l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 24:
        return Yt(Ol), null;
      case 25:
        return null;
      default:
        return null;
    }
  }
  function wo(l, t) {
    switch (Sc(t), t.tag) {
      case 3:
        Yt(Ol), Kt();
        break;
      case 26:
      case 27:
      case 5:
        bu(t);
        break;
      case 4:
        Kt();
        break;
      case 13:
        Xt(t);
        break;
      case 19:
        D(Ml);
        break;
      case 10:
        Yt(t.type);
        break;
      case 22:
      case 23:
        Xt(t), wc(), l !== null && D(Ue);
        break;
      case 24:
        Yt(Ol);
    }
  }
  function Ia(l, t) {
    try {
      var e = t.updateQueue, a = e !== null ? e.lastEffect : null;
      if (a !== null) {
        var u = a.next;
        e = u;
        do {
          if ((e.tag & l) === l) {
            a = void 0;
            var n = e.create, c = e.inst;
            a = n(), c.destroy = a;
          }
          e = e.next;
        } while (e !== u);
      }
    } catch (f) {
      nl(t, t.return, f);
    }
  }
  function ae(l, t, e) {
    try {
      var a = t.updateQueue, u = a !== null ? a.lastEffect : null;
      if (u !== null) {
        var n = u.next;
        a = n;
        do {
          if ((a.tag & l) === l) {
            var c = a.inst, f = c.destroy;
            if (f !== void 0) {
              c.destroy = void 0, u = t;
              var i = e, v = f;
              try {
                v();
              } catch (S) {
                nl(
                  u,
                  i,
                  S
                );
              }
            }
          }
          a = a.next;
        } while (a !== n);
      }
    } catch (S) {
      nl(t, t.return, S);
    }
  }
  function Ho(l) {
    var t = l.updateQueue;
    if (t !== null) {
      var e = l.stateNode;
      try {
        Es(t, e);
      } catch (a) {
        nl(l, l.return, a);
      }
    }
  }
  function qo(l, t, e) {
    e.props = Ne(
      l.type,
      l.memoizedProps
    ), e.state = l.memoizedState;
    try {
      e.componentWillUnmount();
    } catch (a) {
      nl(l, t, a);
    }
  }
  function Pa(l, t) {
    try {
      var e = l.ref;
      if (e !== null) {
        switch (l.tag) {
          case 26:
          case 27:
          case 5:
            var a = l.stateNode;
            break;
          case 30:
            a = l.stateNode;
            break;
          default:
            a = l.stateNode;
        }
        typeof e == "function" ? l.refCleanup = e(a) : e.current = a;
      }
    } catch (u) {
      nl(l, t, u);
    }
  }
  function Mt(l, t) {
    var e = l.ref, a = l.refCleanup;
    if (e !== null)
      if (typeof a == "function")
        try {
          a();
        } catch (u) {
          nl(l, t, u);
        } finally {
          l.refCleanup = null, l = l.alternate, l != null && (l.refCleanup = null);
        }
      else if (typeof e == "function")
        try {
          e(null);
        } catch (u) {
          nl(l, t, u);
        }
      else e.current = null;
  }
  function Bo(l) {
    var t = l.type, e = l.memoizedProps, a = l.stateNode;
    try {
      l: switch (t) {
        case "button":
        case "input":
        case "select":
        case "textarea":
          e.autoFocus && a.focus();
          break l;
        case "img":
          e.src ? a.src = e.src : e.srcSet && (a.srcset = e.srcSet);
      }
    } catch (u) {
      nl(l, l.return, u);
    }
  }
  function ff(l, t, e) {
    try {
      var a = l.stateNode;
      tm(a, l.type, e, t), a[Ll] = t;
    } catch (u) {
      nl(l, l.return, u);
    }
  }
  function Yo(l) {
    return l.tag === 5 || l.tag === 3 || l.tag === 26 || l.tag === 27 && re(l.type) || l.tag === 4;
  }
  function sf(l) {
    l: for (; ; ) {
      for (; l.sibling === null; ) {
        if (l.return === null || Yo(l.return)) return null;
        l = l.return;
      }
      for (l.sibling.return = l.return, l = l.sibling; l.tag !== 5 && l.tag !== 6 && l.tag !== 18; ) {
        if (l.tag === 27 && re(l.type) || l.flags & 2 || l.child === null || l.tag === 4) continue l;
        l.child.return = l, l = l.child;
      }
      if (!(l.flags & 2)) return l.stateNode;
    }
  }
  function of(l, t, e) {
    var a = l.tag;
    if (a === 5 || a === 6)
      l = l.stateNode, t ? (e.nodeType === 9 ? e.body : e.nodeName === "HTML" ? e.ownerDocument.body : e).insertBefore(l, t) : (t = e.nodeType === 9 ? e.body : e.nodeName === "HTML" ? e.ownerDocument.body : e, t.appendChild(l), e = e._reactRootContainer, e != null || t.onclick !== null || (t.onclick = En));
    else if (a !== 4 && (a === 27 && re(l.type) && (e = l.stateNode, t = null), l = l.child, l !== null))
      for (of(l, t, e), l = l.sibling; l !== null; )
        of(l, t, e), l = l.sibling;
  }
  function sn(l, t, e) {
    var a = l.tag;
    if (a === 5 || a === 6)
      l = l.stateNode, t ? e.insertBefore(l, t) : e.appendChild(l);
    else if (a !== 4 && (a === 27 && re(l.type) && (e = l.stateNode), l = l.child, l !== null))
      for (sn(l, t, e), l = l.sibling; l !== null; )
        sn(l, t, e), l = l.sibling;
  }
  function Go(l) {
    var t = l.stateNode, e = l.memoizedProps;
    try {
      for (var a = l.type, u = t.attributes; u.length; )
        t.removeAttributeNode(u[0]);
      Yl(t, a, e), t[Xl] = l, t[Ll] = e;
    } catch (n) {
      nl(l, l.return, n);
    }
  }
  var jt = !1, bl = !1, rf = !1, Xo = typeof WeakSet == "function" ? WeakSet : Set, Ul = null;
  function q0(l, t) {
    if (l = l.containerInfo, qf = _n, l = Wi(l), ic(l)) {
      if ("selectionStart" in l)
        var e = {
          start: l.selectionStart,
          end: l.selectionEnd
        };
      else
        l: {
          e = (e = l.ownerDocument) && e.defaultView || window;
          var a = e.getSelection && e.getSelection();
          if (a && a.rangeCount !== 0) {
            e = a.anchorNode;
            var u = a.anchorOffset, n = a.focusNode;
            a = a.focusOffset;
            try {
              e.nodeType, n.nodeType;
            } catch {
              e = null;
              break l;
            }
            var c = 0, f = -1, i = -1, v = 0, S = 0, p = l, y = null;
            t: for (; ; ) {
              for (var h; p !== e || u !== 0 && p.nodeType !== 3 || (f = c + u), p !== n || a !== 0 && p.nodeType !== 3 || (i = c + a), p.nodeType === 3 && (c += p.nodeValue.length), (h = p.firstChild) !== null; )
                y = p, p = h;
              for (; ; ) {
                if (p === l) break t;
                if (y === e && ++v === u && (f = c), y === n && ++S === a && (i = c), (h = p.nextSibling) !== null) break;
                p = y, y = p.parentNode;
              }
              p = h;
            }
            e = f === -1 || i === -1 ? null : { start: f, end: i };
          } else e = null;
        }
      e = e || { start: 0, end: 0 };
    } else e = null;
    for (Bf = { focusedElem: l, selectionRange: e }, _n = !1, Ul = t; Ul !== null; )
      if (t = Ul, l = t.child, (t.subtreeFlags & 1024) !== 0 && l !== null)
        l.return = t, Ul = l;
      else
        for (; Ul !== null; ) {
          switch (t = Ul, n = t.alternate, l = t.flags, t.tag) {
            case 0:
              break;
            case 11:
            case 15:
              break;
            case 1:
              if ((l & 1024) !== 0 && n !== null) {
                l = void 0, e = t, u = n.memoizedProps, n = n.memoizedState, a = e.stateNode;
                try {
                  var B = Ne(
                    e.type,
                    u,
                    e.elementType === e.type
                  );
                  l = a.getSnapshotBeforeUpdate(
                    B,
                    n
                  ), a.__reactInternalSnapshotBeforeUpdate = l;
                } catch (H) {
                  nl(
                    e,
                    e.return,
                    H
                  );
                }
              }
              break;
            case 3:
              if ((l & 1024) !== 0) {
                if (l = t.stateNode.containerInfo, e = l.nodeType, e === 9)
                  Xf(l);
                else if (e === 1)
                  switch (l.nodeName) {
                    case "HEAD":
                    case "HTML":
                    case "BODY":
                      Xf(l);
                      break;
                    default:
                      l.textContent = "";
                  }
              }
              break;
            case 5:
            case 26:
            case 27:
            case 6:
            case 4:
            case 17:
              break;
            default:
              if ((l & 1024) !== 0) throw Error(g(163));
          }
          if (l = t.sibling, l !== null) {
            l.return = t.return, Ul = l;
            break;
          }
          Ul = t.return;
        }
  }
  function Qo(l, t, e) {
    var a = e.flags;
    switch (e.tag) {
      case 0:
      case 11:
      case 15:
        ue(l, e), a & 4 && Ia(5, e);
        break;
      case 1:
        if (ue(l, e), a & 4)
          if (l = e.stateNode, t === null)
            try {
              l.componentDidMount();
            } catch (c) {
              nl(e, e.return, c);
            }
          else {
            var u = Ne(
              e.type,
              t.memoizedProps
            );
            t = t.memoizedState;
            try {
              l.componentDidUpdate(
                u,
                t,
                l.__reactInternalSnapshotBeforeUpdate
              );
            } catch (c) {
              nl(
                e,
                e.return,
                c
              );
            }
          }
        a & 64 && Ho(e), a & 512 && Pa(e, e.return);
        break;
      case 3:
        if (ue(l, e), a & 64 && (l = e.updateQueue, l !== null)) {
          if (t = null, e.child !== null)
            switch (e.child.tag) {
              case 27:
              case 5:
                t = e.child.stateNode;
                break;
              case 1:
                t = e.child.stateNode;
            }
          try {
            Es(l, t);
          } catch (c) {
            nl(e, e.return, c);
          }
        }
        break;
      case 27:
        t === null && a & 4 && Go(e);
      case 26:
      case 5:
        ue(l, e), t === null && a & 4 && Bo(e), a & 512 && Pa(e, e.return);
        break;
      case 12:
        ue(l, e);
        break;
      case 13:
        ue(l, e), a & 4 && Zo(l, e), a & 64 && (l = e.memoizedState, l !== null && (l = l.dehydrated, l !== null && (e = V0.bind(
          null,
          e
        ), im(l, e))));
        break;
      case 22:
        if (a = e.memoizedState !== null || jt, !a) {
          t = t !== null && t.memoizedState !== null || bl, u = jt;
          var n = bl;
          jt = a, (bl = t) && !n ? ne(
            l,
            e,
            (e.subtreeFlags & 8772) !== 0
          ) : ue(l, e), jt = u, bl = n;
        }
        break;
      case 30:
        break;
      default:
        ue(l, e);
    }
  }
  function Co(l) {
    var t = l.alternate;
    t !== null && (l.alternate = null, Co(t)), l.child = null, l.deletions = null, l.sibling = null, l.tag === 5 && (t = l.stateNode, t !== null && Zn(t)), l.stateNode = null, l.return = null, l.dependencies = null, l.memoizedProps = null, l.memoizedState = null, l.pendingProps = null, l.stateNode = null, l.updateQueue = null;
  }
  var sl = null, kl = !1;
  function Zt(l, t, e) {
    for (e = e.child; e !== null; )
      jo(l, t, e), e = e.sibling;
  }
  function jo(l, t, e) {
    if (Il && typeof Il.onCommitFiberUnmount == "function")
      try {
        Il.onCommitFiberUnmount(Ea, e);
      } catch {
      }
    switch (e.tag) {
      case 26:
        bl || Mt(e, t), Zt(
          l,
          t,
          e
        ), e.memoizedState ? e.memoizedState.count-- : e.stateNode && (e = e.stateNode, e.parentNode.removeChild(e));
        break;
      case 27:
        bl || Mt(e, t);
        var a = sl, u = kl;
        re(e.type) && (sl = e.stateNode, kl = !1), Zt(
          l,
          t,
          e
        ), iu(e.stateNode), sl = a, kl = u;
        break;
      case 5:
        bl || Mt(e, t);
      case 6:
        if (a = sl, u = kl, sl = null, Zt(
          l,
          t,
          e
        ), sl = a, kl = u, sl !== null)
          if (kl)
            try {
              (sl.nodeType === 9 ? sl.body : sl.nodeName === "HTML" ? sl.ownerDocument.body : sl).removeChild(e.stateNode);
            } catch (n) {
              nl(
                e,
                t,
                n
              );
            }
          else
            try {
              sl.removeChild(e.stateNode);
            } catch (n) {
              nl(
                e,
                t,
                n
              );
            }
        break;
      case 18:
        sl !== null && (kl ? (l = sl, xr(
          l.nodeType === 9 ? l.body : l.nodeName === "HTML" ? l.ownerDocument.body : l,
          e.stateNode
        ), hu(l)) : xr(sl, e.stateNode));
        break;
      case 4:
        a = sl, u = kl, sl = e.stateNode.containerInfo, kl = !0, Zt(
          l,
          t,
          e
        ), sl = a, kl = u;
        break;
      case 0:
      case 11:
      case 14:
      case 15:
        bl || ae(2, e, t), bl || ae(4, e, t), Zt(
          l,
          t,
          e
        );
        break;
      case 1:
        bl || (Mt(e, t), a = e.stateNode, typeof a.componentWillUnmount == "function" && qo(
          e,
          t,
          a
        )), Zt(
          l,
          t,
          e
        );
        break;
      case 21:
        Zt(
          l,
          t,
          e
        );
        break;
      case 22:
        bl = (a = bl) || e.memoizedState !== null, Zt(
          l,
          t,
          e
        ), bl = a;
        break;
      default:
        Zt(
          l,
          t,
          e
        );
    }
  }
  function Zo(l, t) {
    if (t.memoizedState === null && (l = t.alternate, l !== null && (l = l.memoizedState, l !== null && (l = l.dehydrated, l !== null))))
      try {
        hu(l);
      } catch (e) {
        nl(t, t.return, e);
      }
  }
  function B0(l) {
    switch (l.tag) {
      case 13:
      case 19:
        var t = l.stateNode;
        return t === null && (t = l.stateNode = new Xo()), t;
      case 22:
        return l = l.stateNode, t = l._retryCache, t === null && (t = l._retryCache = new Xo()), t;
      default:
        throw Error(g(435, l.tag));
    }
  }
  function df(l, t) {
    var e = B0(l);
    t.forEach(function(a) {
      var u = L0.bind(null, l, a);
      e.has(a) || (e.add(a), a.then(u, u));
    });
  }
  function et(l, t) {
    var e = t.deletions;
    if (e !== null)
      for (var a = 0; a < e.length; a++) {
        var u = e[a], n = l, c = t, f = c;
        l: for (; f !== null; ) {
          switch (f.tag) {
            case 27:
              if (re(f.type)) {
                sl = f.stateNode, kl = !1;
                break l;
              }
              break;
            case 5:
              sl = f.stateNode, kl = !1;
              break l;
            case 3:
            case 4:
              sl = f.stateNode.containerInfo, kl = !0;
              break l;
          }
          f = f.return;
        }
        if (sl === null) throw Error(g(160));
        jo(n, c, u), sl = null, kl = !1, n = u.alternate, n !== null && (n.return = null), u.return = null;
      }
    if (t.subtreeFlags & 13878)
      for (t = t.child; t !== null; )
        Vo(t, l), t = t.sibling;
  }
  var Et = null;
  function Vo(l, t) {
    var e = l.alternate, a = l.flags;
    switch (l.tag) {
      case 0:
      case 11:
      case 14:
      case 15:
        et(t, l), at(l), a & 4 && (ae(3, l, l.return), Ia(3, l), ae(5, l, l.return));
        break;
      case 1:
        et(t, l), at(l), a & 512 && (bl || e === null || Mt(e, e.return)), a & 64 && jt && (l = l.updateQueue, l !== null && (a = l.callbacks, a !== null && (e = l.shared.hiddenCallbacks, l.shared.hiddenCallbacks = e === null ? a : e.concat(a))));
        break;
      case 26:
        var u = Et;
        if (et(t, l), at(l), a & 512 && (bl || e === null || Mt(e, e.return)), a & 4) {
          var n = e !== null ? e.memoizedState : null;
          if (a = l.memoizedState, e === null)
            if (a === null)
              if (l.stateNode === null) {
                l: {
                  a = l.type, e = l.memoizedProps, u = u.ownerDocument || u;
                  t: switch (a) {
                    case "title":
                      n = u.getElementsByTagName("title")[0], (!n || n[Aa] || n[Xl] || n.namespaceURI === "http://www.w3.org/2000/svg" || n.hasAttribute("itemprop")) && (n = u.createElement(a), u.head.insertBefore(
                        n,
                        u.querySelector("head > title")
                      )), Yl(n, a, e), n[Xl] = l, _l(n), a = n;
                      break l;
                    case "link":
                      var c = Gr(
                        "link",
                        "href",
                        u
                      ).get(a + (e.href || ""));
                      if (c) {
                        for (var f = 0; f < c.length; f++)
                          if (n = c[f], n.getAttribute("href") === (e.href == null || e.href === "" ? null : e.href) && n.getAttribute("rel") === (e.rel == null ? null : e.rel) && n.getAttribute("title") === (e.title == null ? null : e.title) && n.getAttribute("crossorigin") === (e.crossOrigin == null ? null : e.crossOrigin)) {
                            c.splice(f, 1);
                            break t;
                          }
                      }
                      n = u.createElement(a), Yl(n, a, e), u.head.appendChild(n);
                      break;
                    case "meta":
                      if (c = Gr(
                        "meta",
                        "content",
                        u
                      ).get(a + (e.content || ""))) {
                        for (f = 0; f < c.length; f++)
                          if (n = c[f], n.getAttribute("content") === (e.content == null ? null : "" + e.content) && n.getAttribute("name") === (e.name == null ? null : e.name) && n.getAttribute("property") === (e.property == null ? null : e.property) && n.getAttribute("http-equiv") === (e.httpEquiv == null ? null : e.httpEquiv) && n.getAttribute("charset") === (e.charSet == null ? null : e.charSet)) {
                            c.splice(f, 1);
                            break t;
                          }
                      }
                      n = u.createElement(a), Yl(n, a, e), u.head.appendChild(n);
                      break;
                    default:
                      throw Error(g(468, a));
                  }
                  n[Xl] = l, _l(n), a = n;
                }
                l.stateNode = a;
              } else
                Xr(
                  u,
                  l.type,
                  l.stateNode
                );
            else
              l.stateNode = Yr(
                u,
                a,
                l.memoizedProps
              );
          else
            n !== a ? (n === null ? e.stateNode !== null && (e = e.stateNode, e.parentNode.removeChild(e)) : n.count--, a === null ? Xr(
              u,
              l.type,
              l.stateNode
            ) : Yr(
              u,
              a,
              l.memoizedProps
            )) : a === null && l.stateNode !== null && ff(
              l,
              l.memoizedProps,
              e.memoizedProps
            );
        }
        break;
      case 27:
        et(t, l), at(l), a & 512 && (bl || e === null || Mt(e, e.return)), e !== null && a & 4 && ff(
          l,
          l.memoizedProps,
          e.memoizedProps
        );
        break;
      case 5:
        if (et(t, l), at(l), a & 512 && (bl || e === null || Mt(e, e.return)), l.flags & 32) {
          u = l.stateNode;
          try {
            je(u, "");
          } catch (h) {
            nl(l, l.return, h);
          }
        }
        a & 4 && l.stateNode != null && (u = l.memoizedProps, ff(
          l,
          u,
          e !== null ? e.memoizedProps : u
        )), a & 1024 && (rf = !0);
        break;
      case 6:
        if (et(t, l), at(l), a & 4) {
          if (l.stateNode === null)
            throw Error(g(162));
          a = l.memoizedProps, e = l.stateNode;
          try {
            e.nodeValue = a;
          } catch (h) {
            nl(l, l.return, h);
          }
        }
        break;
      case 3:
        if (zn = null, u = Et, Et = Tn(t.containerInfo), et(t, l), Et = u, at(l), a & 4 && e !== null && e.memoizedState.isDehydrated)
          try {
            hu(t.containerInfo);
          } catch (h) {
            nl(l, l.return, h);
          }
        rf && (rf = !1, Lo(l));
        break;
      case 4:
        a = Et, Et = Tn(
          l.stateNode.containerInfo
        ), et(t, l), at(l), Et = a;
        break;
      case 12:
        et(t, l), at(l);
        break;
      case 13:
        et(t, l), at(l), l.child.flags & 8192 && l.memoizedState !== null != (e !== null && e.memoizedState !== null) && (bf = At()), a & 4 && (a = l.updateQueue, a !== null && (l.updateQueue = null, df(l, a)));
        break;
      case 22:
        u = l.memoizedState !== null;
        var i = e !== null && e.memoizedState !== null, v = jt, S = bl;
        if (jt = v || u, bl = S || i, et(t, l), bl = S, jt = v, at(l), a & 8192)
          l: for (t = l.stateNode, t._visibility = u ? t._visibility & -2 : t._visibility | 1, u && (e === null || i || jt || bl || Re(l)), e = null, t = l; ; ) {
            if (t.tag === 5 || t.tag === 26) {
              if (e === null) {
                i = e = t;
                try {
                  if (n = i.stateNode, u)
                    c = n.style, typeof c.setProperty == "function" ? c.setProperty("display", "none", "important") : c.display = "none";
                  else {
                    f = i.stateNode;
                    var p = i.memoizedProps.style, y = p != null && p.hasOwnProperty("display") ? p.display : null;
                    f.style.display = y == null || typeof y == "boolean" ? "" : ("" + y).trim();
                  }
                } catch (h) {
                  nl(i, i.return, h);
                }
              }
            } else if (t.tag === 6) {
              if (e === null) {
                i = t;
                try {
                  i.stateNode.nodeValue = u ? "" : i.memoizedProps;
                } catch (h) {
                  nl(i, i.return, h);
                }
              }
            } else if ((t.tag !== 22 && t.tag !== 23 || t.memoizedState === null || t === l) && t.child !== null) {
              t.child.return = t, t = t.child;
              continue;
            }
            if (t === l) break l;
            for (; t.sibling === null; ) {
              if (t.return === null || t.return === l) break l;
              e === t && (e = null), t = t.return;
            }
            e === t && (e = null), t.sibling.return = t.return, t = t.sibling;
          }
        a & 4 && (a = l.updateQueue, a !== null && (e = a.retryQueue, e !== null && (a.retryQueue = null, df(l, e))));
        break;
      case 19:
        et(t, l), at(l), a & 4 && (a = l.updateQueue, a !== null && (l.updateQueue = null, df(l, a)));
        break;
      case 30:
        break;
      case 21:
        break;
      default:
        et(t, l), at(l);
    }
  }
  function at(l) {
    var t = l.flags;
    if (t & 2) {
      try {
        for (var e, a = l.return; a !== null; ) {
          if (Yo(a)) {
            e = a;
            break;
          }
          a = a.return;
        }
        if (e == null) throw Error(g(160));
        switch (e.tag) {
          case 27:
            var u = e.stateNode, n = sf(l);
            sn(l, n, u);
            break;
          case 5:
            var c = e.stateNode;
            e.flags & 32 && (je(c, ""), e.flags &= -33);
            var f = sf(l);
            sn(l, f, c);
            break;
          case 3:
          case 4:
            var i = e.stateNode.containerInfo, v = sf(l);
            of(
              l,
              v,
              i
            );
            break;
          default:
            throw Error(g(161));
        }
      } catch (S) {
        nl(l, l.return, S);
      }
      l.flags &= -3;
    }
    t & 4096 && (l.flags &= -4097);
  }
  function Lo(l) {
    if (l.subtreeFlags & 1024)
      for (l = l.child; l !== null; ) {
        var t = l;
        Lo(t), t.tag === 5 && t.flags & 1024 && t.stateNode.reset(), l = l.sibling;
      }
  }
  function ue(l, t) {
    if (t.subtreeFlags & 8772)
      for (t = t.child; t !== null; )
        Qo(l, t.alternate, t), t = t.sibling;
  }
  function Re(l) {
    for (l = l.child; l !== null; ) {
      var t = l;
      switch (t.tag) {
        case 0:
        case 11:
        case 14:
        case 15:
          ae(4, t, t.return), Re(t);
          break;
        case 1:
          Mt(t, t.return);
          var e = t.stateNode;
          typeof e.componentWillUnmount == "function" && qo(
            t,
            t.return,
            e
          ), Re(t);
          break;
        case 27:
          iu(t.stateNode);
        case 26:
        case 5:
          Mt(t, t.return), Re(t);
          break;
        case 22:
          t.memoizedState === null && Re(t);
          break;
        case 30:
          Re(t);
          break;
        default:
          Re(t);
      }
      l = l.sibling;
    }
  }
  function ne(l, t, e) {
    for (e = e && (t.subtreeFlags & 8772) !== 0, t = t.child; t !== null; ) {
      var a = t.alternate, u = l, n = t, c = n.flags;
      switch (n.tag) {
        case 0:
        case 11:
        case 15:
          ne(
            u,
            n,
            e
          ), Ia(4, n);
          break;
        case 1:
          if (ne(
            u,
            n,
            e
          ), a = n, u = a.stateNode, typeof u.componentDidMount == "function")
            try {
              u.componentDidMount();
            } catch (v) {
              nl(a, a.return, v);
            }
          if (a = n, u = a.updateQueue, u !== null) {
            var f = a.stateNode;
            try {
              var i = u.shared.hiddenCallbacks;
              if (i !== null)
                for (u.shared.hiddenCallbacks = null, u = 0; u < i.length; u++)
                  Ss(i[u], f);
            } catch (v) {
              nl(a, a.return, v);
            }
          }
          e && c & 64 && Ho(n), Pa(n, n.return);
          break;
        case 27:
          Go(n);
        case 26:
        case 5:
          ne(
            u,
            n,
            e
          ), e && a === null && c & 4 && Bo(n), Pa(n, n.return);
          break;
        case 12:
          ne(
            u,
            n,
            e
          );
          break;
        case 13:
          ne(
            u,
            n,
            e
          ), e && c & 4 && Zo(u, n);
          break;
        case 22:
          n.memoizedState === null && ne(
            u,
            n,
            e
          ), Pa(n, n.return);
          break;
        case 30:
          break;
        default:
          ne(
            u,
            n,
            e
          );
      }
      t = t.sibling;
    }
  }
  function mf(l, t) {
    var e = null;
    l !== null && l.memoizedState !== null && l.memoizedState.cachePool !== null && (e = l.memoizedState.cachePool.pool), l = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (l = t.memoizedState.cachePool.pool), l !== e && (l != null && l.refCount++, e != null && Ga(e));
  }
  function vf(l, t) {
    l = null, t.alternate !== null && (l = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== l && (t.refCount++, l != null && Ga(l));
  }
  function _t(l, t, e, a) {
    if (t.subtreeFlags & 10256)
      for (t = t.child; t !== null; )
        Ko(
          l,
          t,
          e,
          a
        ), t = t.sibling;
  }
  function Ko(l, t, e, a) {
    var u = t.flags;
    switch (t.tag) {
      case 0:
      case 11:
      case 15:
        _t(
          l,
          t,
          e,
          a
        ), u & 2048 && Ia(9, t);
        break;
      case 1:
        _t(
          l,
          t,
          e,
          a
        );
        break;
      case 3:
        _t(
          l,
          t,
          e,
          a
        ), u & 2048 && (l = null, t.alternate !== null && (l = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== l && (t.refCount++, l != null && Ga(l)));
        break;
      case 12:
        if (u & 2048) {
          _t(
            l,
            t,
            e,
            a
          ), l = t.stateNode;
          try {
            var n = t.memoizedProps, c = n.id, f = n.onPostCommit;
            typeof f == "function" && f(
              c,
              t.alternate === null ? "mount" : "update",
              l.passiveEffectDuration,
              -0
            );
          } catch (i) {
            nl(t, t.return, i);
          }
        } else
          _t(
            l,
            t,
            e,
            a
          );
        break;
      case 13:
        _t(
          l,
          t,
          e,
          a
        );
        break;
      case 23:
        break;
      case 22:
        n = t.stateNode, c = t.alternate, t.memoizedState !== null ? n._visibility & 2 ? _t(
          l,
          t,
          e,
          a
        ) : lu(l, t) : n._visibility & 2 ? _t(
          l,
          t,
          e,
          a
        ) : (n._visibility |= 2, fa(
          l,
          t,
          e,
          a,
          (t.subtreeFlags & 10256) !== 0
        )), u & 2048 && mf(c, t);
        break;
      case 24:
        _t(
          l,
          t,
          e,
          a
        ), u & 2048 && vf(t.alternate, t);
        break;
      default:
        _t(
          l,
          t,
          e,
          a
        );
    }
  }
  function fa(l, t, e, a, u) {
    for (u = u && (t.subtreeFlags & 10256) !== 0, t = t.child; t !== null; ) {
      var n = l, c = t, f = e, i = a, v = c.flags;
      switch (c.tag) {
        case 0:
        case 11:
        case 15:
          fa(
            n,
            c,
            f,
            i,
            u
          ), Ia(8, c);
          break;
        case 23:
          break;
        case 22:
          var S = c.stateNode;
          c.memoizedState !== null ? S._visibility & 2 ? fa(
            n,
            c,
            f,
            i,
            u
          ) : lu(
            n,
            c
          ) : (S._visibility |= 2, fa(
            n,
            c,
            f,
            i,
            u
          )), u && v & 2048 && mf(
            c.alternate,
            c
          );
          break;
        case 24:
          fa(
            n,
            c,
            f,
            i,
            u
          ), u && v & 2048 && vf(c.alternate, c);
          break;
        default:
          fa(
            n,
            c,
            f,
            i,
            u
          );
      }
      t = t.sibling;
    }
  }
  function lu(l, t) {
    if (t.subtreeFlags & 10256)
      for (t = t.child; t !== null; ) {
        var e = l, a = t, u = a.flags;
        switch (a.tag) {
          case 22:
            lu(e, a), u & 2048 && mf(
              a.alternate,
              a
            );
            break;
          case 24:
            lu(e, a), u & 2048 && vf(a.alternate, a);
            break;
          default:
            lu(e, a);
        }
        t = t.sibling;
      }
  }
  var tu = 8192;
  function ia(l) {
    if (l.subtreeFlags & tu)
      for (l = l.child; l !== null; )
        Jo(l), l = l.sibling;
  }
  function Jo(l) {
    switch (l.tag) {
      case 26:
        ia(l), l.flags & tu && l.memoizedState !== null && pm(
          Et,
          l.memoizedState,
          l.memoizedProps
        );
        break;
      case 5:
        ia(l);
        break;
      case 3:
      case 4:
        var t = Et;
        Et = Tn(l.stateNode.containerInfo), ia(l), Et = t;
        break;
      case 22:
        l.memoizedState === null && (t = l.alternate, t !== null && t.memoizedState !== null ? (t = tu, tu = 16777216, ia(l), tu = t) : ia(l));
        break;
      default:
        ia(l);
    }
  }
  function ko(l) {
    var t = l.alternate;
    if (t !== null && (l = t.child, l !== null)) {
      t.child = null;
      do
        t = l.sibling, l.sibling = null, l = t;
      while (l !== null);
    }
  }
  function eu(l) {
    var t = l.deletions;
    if ((l.flags & 16) !== 0) {
      if (t !== null)
        for (var e = 0; e < t.length; e++) {
          var a = t[e];
          Ul = a, $o(
            a,
            l
          );
        }
      ko(l);
    }
    if (l.subtreeFlags & 10256)
      for (l = l.child; l !== null; )
        Wo(l), l = l.sibling;
  }
  function Wo(l) {
    switch (l.tag) {
      case 0:
      case 11:
      case 15:
        eu(l), l.flags & 2048 && ae(9, l, l.return);
        break;
      case 3:
        eu(l);
        break;
      case 12:
        eu(l);
        break;
      case 22:
        var t = l.stateNode;
        l.memoizedState !== null && t._visibility & 2 && (l.return === null || l.return.tag !== 13) ? (t._visibility &= -3, on(l)) : eu(l);
        break;
      default:
        eu(l);
    }
  }
  function on(l) {
    var t = l.deletions;
    if ((l.flags & 16) !== 0) {
      if (t !== null)
        for (var e = 0; e < t.length; e++) {
          var a = t[e];
          Ul = a, $o(
            a,
            l
          );
        }
      ko(l);
    }
    for (l = l.child; l !== null; ) {
      switch (t = l, t.tag) {
        case 0:
        case 11:
        case 15:
          ae(8, t, t.return), on(t);
          break;
        case 22:
          e = t.stateNode, e._visibility & 2 && (e._visibility &= -3, on(t));
          break;
        default:
          on(t);
      }
      l = l.sibling;
    }
  }
  function $o(l, t) {
    for (; Ul !== null; ) {
      var e = Ul;
      switch (e.tag) {
        case 0:
        case 11:
        case 15:
          ae(8, e, t);
          break;
        case 23:
        case 22:
          if (e.memoizedState !== null && e.memoizedState.cachePool !== null) {
            var a = e.memoizedState.cachePool.pool;
            a != null && a.refCount++;
          }
          break;
        case 24:
          Ga(e.memoizedState.cache);
      }
      if (a = e.child, a !== null) a.return = e, Ul = a;
      else
        l: for (e = l; Ul !== null; ) {
          a = Ul;
          var u = a.sibling, n = a.return;
          if (Co(a), a === e) {
            Ul = null;
            break l;
          }
          if (u !== null) {
            u.return = n, Ul = u;
            break l;
          }
          Ul = n;
        }
    }
  }
  var Y0 = {
    getCacheForType: function(l) {
      var t = Ql(Ol), e = t.data.get(l);
      return e === void 0 && (e = l(), t.data.set(l, e)), e;
    }
  }, G0 = typeof WeakMap == "function" ? WeakMap : Map, P = 0, cl = null, Z = null, k = 0, ll = 0, ut = null, ce = !1, sa = !1, yf = !1, Vt = 0, vl = 0, fe = 0, we = 0, hf = 0, gt = 0, oa = 0, au = null, Wl = null, gf = !1, bf = 0, rn = 1 / 0, dn = null, ie = null, Bl = 0, se = null, ra = null, da = 0, Sf = 0, Ef = null, Fo = null, uu = 0, pf = null;
  function nt() {
    if ((P & 2) !== 0 && k !== 0)
      return k & -k;
    if (b.T !== null) {
      var l = Pe;
      return l !== 0 ? l : Df();
    }
    return di();
  }
  function Io() {
    gt === 0 && (gt = (k & 536870912) === 0 || I ? ii() : 536870912);
    var l = ht.current;
    return l !== null && (l.flags |= 32), gt;
  }
  function ct(l, t, e) {
    (l === cl && (ll === 2 || ll === 9) || l.cancelPendingCommit !== null) && (ma(l, 0), oe(
      l,
      k,
      gt,
      !1
    )), Ta(l, e), ((P & 2) === 0 || l !== cl) && (l === cl && ((P & 2) === 0 && (we |= e), vl === 4 && oe(
      l,
      k,
      gt,
      !1
    )), Dt(l));
  }
  function Po(l, t, e) {
    if ((P & 6) !== 0) throw Error(g(327));
    var a = !e && (t & 124) === 0 && (t & l.expiredLanes) === 0 || pa(l, t), u = a ? C0(l, t) : zf(l, t, !0), n = a;
    do {
      if (u === 0) {
        sa && !a && oe(l, t, 0, !1);
        break;
      } else {
        if (e = l.current.alternate, n && !X0(e)) {
          u = zf(l, t, !1), n = !1;
          continue;
        }
        if (u === 2) {
          if (n = t, l.errorRecoveryDisabledLanes & n)
            var c = 0;
          else
            c = l.pendingLanes & -536870913, c = c !== 0 ? c : c & 536870912 ? 536870912 : 0;
          if (c !== 0) {
            t = c;
            l: {
              var f = l;
              u = au;
              var i = f.current.memoizedState.isDehydrated;
              if (i && (ma(f, c).flags |= 256), c = zf(
                f,
                c,
                !1
              ), c !== 2) {
                if (yf && !i) {
                  f.errorRecoveryDisabledLanes |= n, we |= n, u = 4;
                  break l;
                }
                n = Wl, Wl = u, n !== null && (Wl === null ? Wl = n : Wl.push.apply(
                  Wl,
                  n
                ));
              }
              u = c;
            }
            if (n = !1, u !== 2) continue;
          }
        }
        if (u === 1) {
          ma(l, 0), oe(l, t, 0, !0);
          break;
        }
        l: {
          switch (a = l, n = u, n) {
            case 0:
            case 1:
              throw Error(g(345));
            case 4:
              if ((t & 4194048) !== t) break;
            case 6:
              oe(
                a,
                t,
                gt,
                !ce
              );
              break l;
            case 2:
              Wl = null;
              break;
            case 3:
            case 5:
              break;
            default:
              throw Error(g(329));
          }
          if ((t & 62914560) === t && (u = bf + 300 - At(), 10 < u)) {
            if (oe(
              a,
              t,
              gt,
              !ce
            ), Tu(a, 0, !0) !== 0) break l;
            a.timeoutHandle = Dr(
              lr.bind(
                null,
                a,
                e,
                Wl,
                dn,
                gf,
                t,
                gt,
                we,
                oa,
                ce,
                n,
                2,
                -0,
                0
              ),
              u
            );
            break l;
          }
          lr(
            a,
            e,
            Wl,
            dn,
            gf,
            t,
            gt,
            we,
            oa,
            ce,
            n,
            0,
            -0,
            0
          );
        }
      }
      break;
    } while (!0);
    Dt(l);
  }
  function lr(l, t, e, a, u, n, c, f, i, v, S, p, y, h) {
    if (l.timeoutHandle = -1, p = t.subtreeFlags, (p & 8192 || (p & 16785408) === 16785408) && (ru = { stylesheets: null, count: 0, unsuspend: Em }, Jo(t), p = Tm(), p !== null)) {
      l.cancelPendingCommit = p(
        fr.bind(
          null,
          l,
          t,
          n,
          e,
          a,
          u,
          c,
          f,
          i,
          S,
          1,
          y,
          h
        )
      ), oe(l, n, c, !v);
      return;
    }
    fr(
      l,
      t,
      n,
      e,
      a,
      u,
      c,
      f,
      i
    );
  }
  function X0(l) {
    for (var t = l; ; ) {
      var e = t.tag;
      if ((e === 0 || e === 11 || e === 15) && t.flags & 16384 && (e = t.updateQueue, e !== null && (e = e.stores, e !== null)))
        for (var a = 0; a < e.length; a++) {
          var u = e[a], n = u.getSnapshot;
          u = u.value;
          try {
            if (!lt(n(), u)) return !1;
          } catch {
            return !1;
          }
        }
      if (e = t.child, t.subtreeFlags & 16384 && e !== null)
        e.return = t, t = e;
      else {
        if (t === l) break;
        for (; t.sibling === null; ) {
          if (t.return === null || t.return === l) return !0;
          t = t.return;
        }
        t.sibling.return = t.return, t = t.sibling;
      }
    }
    return !0;
  }
  function oe(l, t, e, a) {
    t &= ~hf, t &= ~we, l.suspendedLanes |= t, l.pingedLanes &= ~t, a && (l.warmLanes |= t), a = l.expirationTimes;
    for (var u = t; 0 < u; ) {
      var n = 31 - Pl(u), c = 1 << n;
      a[n] = -1, u &= ~c;
    }
    e !== 0 && oi(l, e, t);
  }
  function mn() {
    return (P & 6) === 0 ? (nu(0), !1) : !0;
  }
  function Tf() {
    if (Z !== null) {
      if (ll === 0)
        var l = Z.return;
      else
        l = Z, Bt = _e = null, Gc(l), na = null, Wa = 0, l = Z;
      for (; l !== null; )
        wo(l.alternate, l), l = l.return;
      Z = null;
    }
  }
  function ma(l, t) {
    var e = l.timeoutHandle;
    e !== -1 && (l.timeoutHandle = -1, am(e)), e = l.cancelPendingCommit, e !== null && (l.cancelPendingCommit = null, e()), Tf(), cl = l, Z = e = wt(l.current, null), k = t, ll = 0, ut = null, ce = !1, sa = pa(l, t), yf = !1, oa = gt = hf = we = fe = vl = 0, Wl = au = null, gf = !1, (t & 8) !== 0 && (t |= t & 32);
    var a = l.entangledLanes;
    if (a !== 0)
      for (l = l.entanglements, a &= t; 0 < a; ) {
        var u = 31 - Pl(a), n = 1 << u;
        t |= l[u], a &= ~n;
      }
    return Vt = t, Hu(), e;
  }
  function tr(l, t) {
    X = null, b.H = Pu, t === Qa || t === Zu ? (t = gs(), ll = 3) : t === vs ? (t = gs(), ll = 4) : ll = t === So ? 8 : t !== null && typeof t == "object" && typeof t.then == "function" ? 6 : 1, ut = t, Z === null && (vl = 1, un(
      l,
      dt(t, l.current)
    ));
  }
  function er() {
    var l = b.H;
    return b.H = Pu, l === null ? Pu : l;
  }
  function ar() {
    var l = b.A;
    return b.A = Y0, l;
  }
  function Af() {
    vl = 4, ce || (k & 4194048) !== k && ht.current !== null || (sa = !0), (fe & 134217727) === 0 && (we & 134217727) === 0 || cl === null || oe(
      cl,
      k,
      gt,
      !1
    );
  }
  function zf(l, t, e) {
    var a = P;
    P |= 2;
    var u = er(), n = ar();
    (cl !== l || k !== t) && (dn = null, ma(l, t)), t = !1;
    var c = vl;
    l: do
      try {
        if (ll !== 0 && Z !== null) {
          var f = Z, i = ut;
          switch (ll) {
            case 8:
              Tf(), c = 6;
              break l;
            case 3:
            case 2:
            case 9:
            case 6:
              ht.current === null && (t = !0);
              var v = ll;
              if (ll = 0, ut = null, va(l, f, i, v), e && sa) {
                c = 0;
                break l;
              }
              break;
            default:
              v = ll, ll = 0, ut = null, va(l, f, i, v);
          }
        }
        Q0(), c = vl;
        break;
      } catch (S) {
        tr(l, S);
      }
    while (!0);
    return t && l.shellSuspendCounter++, Bt = _e = null, P = a, b.H = u, b.A = n, Z === null && (cl = null, k = 0, Hu()), c;
  }
  function Q0() {
    for (; Z !== null; ) ur(Z);
  }
  function C0(l, t) {
    var e = P;
    P |= 2;
    var a = er(), u = ar();
    cl !== l || k !== t ? (dn = null, rn = At() + 500, ma(l, t)) : sa = pa(
      l,
      t
    );
    l: do
      try {
        if (ll !== 0 && Z !== null) {
          t = Z;
          var n = ut;
          t: switch (ll) {
            case 1:
              ll = 0, ut = null, va(l, t, n, 1);
              break;
            case 2:
            case 9:
              if (ys(n)) {
                ll = 0, ut = null, nr(t);
                break;
              }
              t = function() {
                ll !== 2 && ll !== 9 || cl !== l || (ll = 7), Dt(l);
              }, n.then(t, t);
              break l;
            case 3:
              ll = 7;
              break l;
            case 4:
              ll = 5;
              break l;
            case 7:
              ys(n) ? (ll = 0, ut = null, nr(t)) : (ll = 0, ut = null, va(l, t, n, 7));
              break;
            case 5:
              var c = null;
              switch (Z.tag) {
                case 26:
                  c = Z.memoizedState;
                case 5:
                case 27:
                  var f = Z;
                  if (!c || Qr(c)) {
                    ll = 0, ut = null;
                    var i = f.sibling;
                    if (i !== null) Z = i;
                    else {
                      var v = f.return;
                      v !== null ? (Z = v, vn(v)) : Z = null;
                    }
                    break t;
                  }
              }
              ll = 0, ut = null, va(l, t, n, 5);
              break;
            case 6:
              ll = 0, ut = null, va(l, t, n, 6);
              break;
            case 8:
              Tf(), vl = 6;
              break l;
            default:
              throw Error(g(462));
          }
        }
        j0();
        break;
      } catch (S) {
        tr(l, S);
      }
    while (!0);
    return Bt = _e = null, b.H = a, b.A = u, P = e, Z !== null ? 0 : (cl = null, k = 0, Hu(), vl);
  }
  function j0() {
    for (; Z !== null && !od(); )
      ur(Z);
  }
  function ur(l) {
    var t = No(l.alternate, l, Vt);
    l.memoizedProps = l.pendingProps, t === null ? vn(l) : Z = t;
  }
  function nr(l) {
    var t = l, e = t.alternate;
    switch (t.tag) {
      case 15:
      case 0:
        t = Oo(
          e,
          t,
          t.pendingProps,
          t.type,
          void 0,
          k
        );
        break;
      case 11:
        t = Oo(
          e,
          t,
          t.pendingProps,
          t.type.render,
          t.ref,
          k
        );
        break;
      case 5:
        Gc(t);
      default:
        wo(e, t), t = Z = ns(t, Vt), t = No(e, t, Vt);
    }
    l.memoizedProps = l.pendingProps, t === null ? vn(l) : Z = t;
  }
  function va(l, t, e, a) {
    Bt = _e = null, Gc(t), na = null, Wa = 0;
    var u = t.return;
    try {
      if (N0(
        l,
        u,
        t,
        e,
        k
      )) {
        vl = 1, un(
          l,
          dt(e, l.current)
        ), Z = null;
        return;
      }
    } catch (n) {
      if (u !== null) throw Z = u, n;
      vl = 1, un(
        l,
        dt(e, l.current)
      ), Z = null;
      return;
    }
    t.flags & 32768 ? (I || a === 1 ? l = !0 : sa || (k & 536870912) !== 0 ? l = !1 : (ce = l = !0, (a === 2 || a === 9 || a === 3 || a === 6) && (a = ht.current, a !== null && a.tag === 13 && (a.flags |= 16384))), cr(t, l)) : vn(t);
  }
  function vn(l) {
    var t = l;
    do {
      if ((t.flags & 32768) !== 0) {
        cr(
          t,
          ce
        );
        return;
      }
      l = t.return;
      var e = w0(
        t.alternate,
        t,
        Vt
      );
      if (e !== null) {
        Z = e;
        return;
      }
      if (t = t.sibling, t !== null) {
        Z = t;
        return;
      }
      Z = t = l;
    } while (t !== null);
    vl === 0 && (vl = 5);
  }
  function cr(l, t) {
    do {
      var e = H0(l.alternate, l);
      if (e !== null) {
        e.flags &= 32767, Z = e;
        return;
      }
      if (e = l.return, e !== null && (e.flags |= 32768, e.subtreeFlags = 0, e.deletions = null), !t && (l = l.sibling, l !== null)) {
        Z = l;
        return;
      }
      Z = l = e;
    } while (l !== null);
    vl = 6, Z = null;
  }
  function fr(l, t, e, a, u, n, c, f, i) {
    l.cancelPendingCommit = null;
    do
      yn();
    while (Bl !== 0);
    if ((P & 6) !== 0) throw Error(g(327));
    if (t !== null) {
      if (t === l.current) throw Error(g(177));
      if (n = t.lanes | t.childLanes, n |= mc, Ed(
        l,
        e,
        n,
        c,
        f,
        i
      ), l === cl && (Z = cl = null, k = 0), ra = t, se = l, da = e, Sf = n, Ef = u, Fo = a, (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? (l.callbackNode = null, l.callbackPriority = 0, K0(Su, function() {
        return dr(), null;
      })) : (l.callbackNode = null, l.callbackPriority = 0), a = (t.flags & 13878) !== 0, (t.subtreeFlags & 13878) !== 0 || a) {
        a = b.T, b.T = null, u = d.p, d.p = 2, c = P, P |= 4;
        try {
          q0(l, t, e);
        } finally {
          P = c, d.p = u, b.T = a;
        }
      }
      Bl = 1, ir(), sr(), or();
    }
  }
  function ir() {
    if (Bl === 1) {
      Bl = 0;
      var l = se, t = ra, e = (t.flags & 13878) !== 0;
      if ((t.subtreeFlags & 13878) !== 0 || e) {
        e = b.T, b.T = null;
        var a = d.p;
        d.p = 2;
        var u = P;
        P |= 4;
        try {
          Vo(t, l);
          var n = Bf, c = Wi(l.containerInfo), f = n.focusedElem, i = n.selectionRange;
          if (c !== f && f && f.ownerDocument && ki(
            f.ownerDocument.documentElement,
            f
          )) {
            if (i !== null && ic(f)) {
              var v = i.start, S = i.end;
              if (S === void 0 && (S = v), "selectionStart" in f)
                f.selectionStart = v, f.selectionEnd = Math.min(
                  S,
                  f.value.length
                );
              else {
                var p = f.ownerDocument || document, y = p && p.defaultView || window;
                if (y.getSelection) {
                  var h = y.getSelection(), B = f.textContent.length, H = Math.min(i.start, B), al = i.end === void 0 ? H : Math.min(i.end, B);
                  !h.extend && H > al && (c = al, al = H, H = c);
                  var r = Ji(
                    f,
                    H
                  ), o = Ji(
                    f,
                    al
                  );
                  if (r && o && (h.rangeCount !== 1 || h.anchorNode !== r.node || h.anchorOffset !== r.offset || h.focusNode !== o.node || h.focusOffset !== o.offset)) {
                    var m = p.createRange();
                    m.setStart(r.node, r.offset), h.removeAllRanges(), H > al ? (h.addRange(m), h.extend(o.node, o.offset)) : (m.setEnd(o.node, o.offset), h.addRange(m));
                  }
                }
              }
            }
            for (p = [], h = f; h = h.parentNode; )
              h.nodeType === 1 && p.push({
                element: h,
                left: h.scrollLeft,
                top: h.scrollTop
              });
            for (typeof f.focus == "function" && f.focus(), f = 0; f < p.length; f++) {
              var E = p[f];
              E.element.scrollLeft = E.left, E.element.scrollTop = E.top;
            }
          }
          _n = !!qf, Bf = qf = null;
        } finally {
          P = u, d.p = a, b.T = e;
        }
      }
      l.current = t, Bl = 2;
    }
  }
  function sr() {
    if (Bl === 2) {
      Bl = 0;
      var l = se, t = ra, e = (t.flags & 8772) !== 0;
      if ((t.subtreeFlags & 8772) !== 0 || e) {
        e = b.T, b.T = null;
        var a = d.p;
        d.p = 2;
        var u = P;
        P |= 4;
        try {
          Qo(l, t.alternate, t);
        } finally {
          P = u, d.p = a, b.T = e;
        }
      }
      Bl = 3;
    }
  }
  function or() {
    if (Bl === 4 || Bl === 3) {
      Bl = 0, rd();
      var l = se, t = ra, e = da, a = Fo;
      (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? Bl = 5 : (Bl = 0, ra = se = null, rr(l, l.pendingLanes));
      var u = l.pendingLanes;
      if (u === 0 && (ie = null), Cn(e), t = t.stateNode, Il && typeof Il.onCommitFiberRoot == "function")
        try {
          Il.onCommitFiberRoot(
            Ea,
            t,
            void 0,
            (t.current.flags & 128) === 128
          );
        } catch {
        }
      if (a !== null) {
        t = b.T, u = d.p, d.p = 2, b.T = null;
        try {
          for (var n = l.onRecoverableError, c = 0; c < a.length; c++) {
            var f = a[c];
            n(f.value, {
              componentStack: f.stack
            });
          }
        } finally {
          b.T = t, d.p = u;
        }
      }
      (da & 3) !== 0 && yn(), Dt(l), u = l.pendingLanes, (e & 4194090) !== 0 && (u & 42) !== 0 ? l === pf ? uu++ : (uu = 0, pf = l) : uu = 0, nu(0);
    }
  }
  function rr(l, t) {
    (l.pooledCacheLanes &= t) === 0 && (t = l.pooledCache, t != null && (l.pooledCache = null, Ga(t)));
  }
  function yn(l) {
    return ir(), sr(), or(), dr();
  }
  function dr() {
    if (Bl !== 5) return !1;
    var l = se, t = Sf;
    Sf = 0;
    var e = Cn(da), a = b.T, u = d.p;
    try {
      d.p = 32 > e ? 32 : e, b.T = null, e = Ef, Ef = null;
      var n = se, c = da;
      if (Bl = 0, ra = se = null, da = 0, (P & 6) !== 0) throw Error(g(331));
      var f = P;
      if (P |= 4, Wo(n.current), Ko(
        n,
        n.current,
        c,
        e
      ), P = f, nu(0, !1), Il && typeof Il.onPostCommitFiberRoot == "function")
        try {
          Il.onPostCommitFiberRoot(Ea, n);
        } catch {
        }
      return !0;
    } finally {
      d.p = u, b.T = a, rr(l, t);
    }
  }
  function mr(l, t, e) {
    t = dt(e, t), t = Ic(l.stateNode, t, 2), l = Pt(l, t, 2), l !== null && (Ta(l, 2), Dt(l));
  }
  function nl(l, t, e) {
    if (l.tag === 3)
      mr(l, l, e);
    else
      for (; t !== null; ) {
        if (t.tag === 3) {
          mr(
            t,
            l,
            e
          );
          break;
        } else if (t.tag === 1) {
          var a = t.stateNode;
          if (typeof t.type.getDerivedStateFromError == "function" || typeof a.componentDidCatch == "function" && (ie === null || !ie.has(a))) {
            l = dt(e, l), e = go(2), a = Pt(t, e, 2), a !== null && (bo(
              e,
              a,
              t,
              l
            ), Ta(a, 2), Dt(a));
            break;
          }
        }
        t = t.return;
      }
  }
  function Of(l, t, e) {
    var a = l.pingCache;
    if (a === null) {
      a = l.pingCache = new G0();
      var u = /* @__PURE__ */ new Set();
      a.set(t, u);
    } else
      u = a.get(t), u === void 0 && (u = /* @__PURE__ */ new Set(), a.set(t, u));
    u.has(e) || (yf = !0, u.add(e), l = Z0.bind(null, l, t, e), t.then(l, l));
  }
  function Z0(l, t, e) {
    var a = l.pingCache;
    a !== null && a.delete(t), l.pingedLanes |= l.suspendedLanes & e, l.warmLanes &= ~e, cl === l && (k & e) === e && (vl === 4 || vl === 3 && (k & 62914560) === k && 300 > At() - bf ? (P & 2) === 0 && ma(l, 0) : hf |= e, oa === k && (oa = 0)), Dt(l);
  }
  function vr(l, t) {
    t === 0 && (t = si()), l = We(l, t), l !== null && (Ta(l, t), Dt(l));
  }
  function V0(l) {
    var t = l.memoizedState, e = 0;
    t !== null && (e = t.retryLane), vr(l, e);
  }
  function L0(l, t) {
    var e = 0;
    switch (l.tag) {
      case 13:
        var a = l.stateNode, u = l.memoizedState;
        u !== null && (e = u.retryLane);
        break;
      case 19:
        a = l.stateNode;
        break;
      case 22:
        a = l.stateNode._retryCache;
        break;
      default:
        throw Error(g(314));
    }
    a !== null && a.delete(t), vr(l, e);
  }
  function K0(l, t) {
    return Yn(l, t);
  }
  var hn = null, ya = null, Mf = !1, gn = !1, _f = !1, He = 0;
  function Dt(l) {
    l !== ya && l.next === null && (ya === null ? hn = ya = l : ya = ya.next = l), gn = !0, Mf || (Mf = !0, k0());
  }
  function nu(l, t) {
    if (!_f && gn) {
      _f = !0;
      do
        for (var e = !1, a = hn; a !== null; ) {
          if (l !== 0) {
            var u = a.pendingLanes;
            if (u === 0) var n = 0;
            else {
              var c = a.suspendedLanes, f = a.pingedLanes;
              n = (1 << 31 - Pl(42 | l) + 1) - 1, n &= u & ~(c & ~f), n = n & 201326741 ? n & 201326741 | 1 : n ? n | 2 : 0;
            }
            n !== 0 && (e = !0, br(a, n));
          } else
            n = k, n = Tu(
              a,
              a === cl ? n : 0,
              a.cancelPendingCommit !== null || a.timeoutHandle !== -1
            ), (n & 3) === 0 || pa(a, n) || (e = !0, br(a, n));
          a = a.next;
        }
      while (e);
      _f = !1;
    }
  }
  function J0() {
    yr();
  }
  function yr() {
    gn = Mf = !1;
    var l = 0;
    He !== 0 && (em() && (l = He), He = 0);
    for (var t = At(), e = null, a = hn; a !== null; ) {
      var u = a.next, n = hr(a, t);
      n === 0 ? (a.next = null, e === null ? hn = u : e.next = u, u === null && (ya = e)) : (e = a, (l !== 0 || (n & 3) !== 0) && (gn = !0)), a = u;
    }
    nu(l);
  }
  function hr(l, t) {
    for (var e = l.suspendedLanes, a = l.pingedLanes, u = l.expirationTimes, n = l.pendingLanes & -62914561; 0 < n; ) {
      var c = 31 - Pl(n), f = 1 << c, i = u[c];
      i === -1 ? ((f & e) === 0 || (f & a) !== 0) && (u[c] = Sd(f, t)) : i <= t && (l.expiredLanes |= f), n &= ~f;
    }
    if (t = cl, e = k, e = Tu(
      l,
      l === t ? e : 0,
      l.cancelPendingCommit !== null || l.timeoutHandle !== -1
    ), a = l.callbackNode, e === 0 || l === t && (ll === 2 || ll === 9) || l.cancelPendingCommit !== null)
      return a !== null && a !== null && Gn(a), l.callbackNode = null, l.callbackPriority = 0;
    if ((e & 3) === 0 || pa(l, e)) {
      if (t = e & -e, t === l.callbackPriority) return t;
      switch (a !== null && Gn(a), Cn(e)) {
        case 2:
        case 8:
          e = ci;
          break;
        case 32:
          e = Su;
          break;
        case 268435456:
          e = fi;
          break;
        default:
          e = Su;
      }
      return a = gr.bind(null, l), e = Yn(e, a), l.callbackPriority = t, l.callbackNode = e, t;
    }
    return a !== null && a !== null && Gn(a), l.callbackPriority = 2, l.callbackNode = null, 2;
  }
  function gr(l, t) {
    if (Bl !== 0 && Bl !== 5)
      return l.callbackNode = null, l.callbackPriority = 0, null;
    var e = l.callbackNode;
    if (yn() && l.callbackNode !== e)
      return null;
    var a = k;
    return a = Tu(
      l,
      l === cl ? a : 0,
      l.cancelPendingCommit !== null || l.timeoutHandle !== -1
    ), a === 0 ? null : (Po(l, a, t), hr(l, At()), l.callbackNode != null && l.callbackNode === e ? gr.bind(null, l) : null);
  }
  function br(l, t) {
    if (yn()) return null;
    Po(l, t, !0);
  }
  function k0() {
    um(function() {
      (P & 6) !== 0 ? Yn(
        ni,
        J0
      ) : yr();
    });
  }
  function Df() {
    return He === 0 && (He = ii()), He;
  }
  function Sr(l) {
    return l == null || typeof l == "symbol" || typeof l == "boolean" ? null : typeof l == "function" ? l : _u("" + l);
  }
  function Er(l, t) {
    var e = t.ownerDocument.createElement("input");
    return e.name = t.name, e.value = t.value, l.id && e.setAttribute("form", l.id), t.parentNode.insertBefore(e, t), l = new FormData(l), e.parentNode.removeChild(e), l;
  }
  function W0(l, t, e, a, u) {
    if (t === "submit" && e && e.stateNode === u) {
      var n = Sr(
        (u[Ll] || null).action
      ), c = a.submitter;
      c && (t = (t = c[Ll] || null) ? Sr(t.formAction) : c.getAttribute("formAction"), t !== null && (n = t, c = null));
      var f = new Nu(
        "action",
        "action",
        null,
        a,
        u
      );
      l.push({
        event: f,
        listeners: [
          {
            instance: null,
            listener: function() {
              if (a.defaultPrevented) {
                if (He !== 0) {
                  var i = c ? Er(u, c) : new FormData(u);
                  Jc(
                    e,
                    {
                      pending: !0,
                      data: i,
                      method: u.method,
                      action: n
                    },
                    null,
                    i
                  );
                }
              } else
                typeof n == "function" && (f.preventDefault(), i = c ? Er(u, c) : new FormData(u), Jc(
                  e,
                  {
                    pending: !0,
                    data: i,
                    method: u.method,
                    action: n
                  },
                  n,
                  i
                ));
            },
            currentTarget: u
          }
        ]
      });
    }
  }
  for (var Uf = 0; Uf < dc.length; Uf++) {
    var xf = dc[Uf], $0 = xf.toLowerCase(), F0 = xf[0].toUpperCase() + xf.slice(1);
    St(
      $0,
      "on" + F0
    );
  }
  St(Ii, "onAnimationEnd"), St(Pi, "onAnimationIteration"), St(ls, "onAnimationStart"), St("dblclick", "onDoubleClick"), St("focusin", "onFocus"), St("focusout", "onBlur"), St(v0, "onTransitionRun"), St(y0, "onTransitionStart"), St(h0, "onTransitionCancel"), St(ts, "onTransitionEnd"), Xe("onMouseEnter", ["mouseout", "mouseover"]), Xe("onMouseLeave", ["mouseout", "mouseover"]), Xe("onPointerEnter", ["pointerout", "pointerover"]), Xe("onPointerLeave", ["pointerout", "pointerover"]), be(
    "onChange",
    "change click focusin focusout input keydown keyup selectionchange".split(" ")
  ), be(
    "onSelect",
    "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(
      " "
    )
  ), be("onBeforeInput", [
    "compositionend",
    "keypress",
    "textInput",
    "paste"
  ]), be(
    "onCompositionEnd",
    "compositionend focusout keydown keypress keyup mousedown".split(" ")
  ), be(
    "onCompositionStart",
    "compositionstart focusout keydown keypress keyup mousedown".split(" ")
  ), be(
    "onCompositionUpdate",
    "compositionupdate focusout keydown keypress keyup mousedown".split(" ")
  );
  var cu = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(
    " "
  ), I0 = new Set(
    "beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(cu)
  );
  function pr(l, t) {
    t = (t & 4) !== 0;
    for (var e = 0; e < l.length; e++) {
      var a = l[e], u = a.event;
      a = a.listeners;
      l: {
        var n = void 0;
        if (t)
          for (var c = a.length - 1; 0 <= c; c--) {
            var f = a[c], i = f.instance, v = f.currentTarget;
            if (f = f.listener, i !== n && u.isPropagationStopped())
              break l;
            n = f, u.currentTarget = v;
            try {
              n(u);
            } catch (S) {
              an(S);
            }
            u.currentTarget = null, n = i;
          }
        else
          for (c = 0; c < a.length; c++) {
            if (f = a[c], i = f.instance, v = f.currentTarget, f = f.listener, i !== n && u.isPropagationStopped())
              break l;
            n = f, u.currentTarget = v;
            try {
              n(u);
            } catch (S) {
              an(S);
            }
            u.currentTarget = null, n = i;
          }
      }
    }
  }
  function V(l, t) {
    var e = t[jn];
    e === void 0 && (e = t[jn] = /* @__PURE__ */ new Set());
    var a = l + "__bubble";
    e.has(a) || (Tr(t, l, 2, !1), e.add(a));
  }
  function Nf(l, t, e) {
    var a = 0;
    t && (a |= 4), Tr(
      e,
      l,
      a,
      t
    );
  }
  var bn = "_reactListening" + Math.random().toString(36).slice(2);
  function Rf(l) {
    if (!l[bn]) {
      l[bn] = !0, vi.forEach(function(e) {
        e !== "selectionchange" && (I0.has(e) || Nf(e, !1, l), Nf(e, !0, l));
      });
      var t = l.nodeType === 9 ? l : l.ownerDocument;
      t === null || t[bn] || (t[bn] = !0, Nf("selectionchange", !1, t));
    }
  }
  function Tr(l, t, e, a) {
    switch (Kr(t)) {
      case 2:
        var u = Om;
        break;
      case 8:
        u = Mm;
        break;
      default:
        u = Kf;
    }
    e = u.bind(
      null,
      t,
      e,
      l
    ), u = void 0, !Pn || t !== "touchstart" && t !== "touchmove" && t !== "wheel" || (u = !0), a ? u !== void 0 ? l.addEventListener(t, e, {
      capture: !0,
      passive: u
    }) : l.addEventListener(t, e, !0) : u !== void 0 ? l.addEventListener(t, e, {
      passive: u
    }) : l.addEventListener(t, e, !1);
  }
  function wf(l, t, e, a, u) {
    var n = a;
    if ((t & 1) === 0 && (t & 2) === 0 && a !== null)
      l: for (; ; ) {
        if (a === null) return;
        var c = a.tag;
        if (c === 3 || c === 4) {
          var f = a.stateNode.containerInfo;
          if (f === u) break;
          if (c === 4)
            for (c = a.return; c !== null; ) {
              var i = c.tag;
              if ((i === 3 || i === 4) && c.stateNode.containerInfo === u)
                return;
              c = c.return;
            }
          for (; f !== null; ) {
            if (c = Be(f), c === null) return;
            if (i = c.tag, i === 5 || i === 6 || i === 26 || i === 27) {
              a = n = c;
              continue l;
            }
            f = f.parentNode;
          }
        }
        a = a.return;
      }
    Di(function() {
      var v = n, S = Fn(e), p = [];
      l: {
        var y = es.get(l);
        if (y !== void 0) {
          var h = Nu, B = l;
          switch (l) {
            case "keypress":
              if (Uu(e) === 0) break l;
            case "keydown":
            case "keyup":
              h = Kd;
              break;
            case "focusin":
              B = "focus", h = ac;
              break;
            case "focusout":
              B = "blur", h = ac;
              break;
            case "beforeblur":
            case "afterblur":
              h = ac;
              break;
            case "click":
              if (e.button === 2) break l;
            case "auxclick":
            case "dblclick":
            case "mousedown":
            case "mousemove":
            case "mouseup":
            case "mouseout":
            case "mouseover":
            case "contextmenu":
              h = Ni;
              break;
            case "drag":
            case "dragend":
            case "dragenter":
            case "dragexit":
            case "dragleave":
            case "dragover":
            case "dragstart":
            case "drop":
              h = Hd;
              break;
            case "touchcancel":
            case "touchend":
            case "touchmove":
            case "touchstart":
              h = Wd;
              break;
            case Ii:
            case Pi:
            case ls:
              h = Yd;
              break;
            case ts:
              h = Fd;
              break;
            case "scroll":
            case "scrollend":
              h = Rd;
              break;
            case "wheel":
              h = Pd;
              break;
            case "copy":
            case "cut":
            case "paste":
              h = Xd;
              break;
            case "gotpointercapture":
            case "lostpointercapture":
            case "pointercancel":
            case "pointerdown":
            case "pointermove":
            case "pointerout":
            case "pointerover":
            case "pointerup":
              h = wi;
              break;
            case "toggle":
            case "beforetoggle":
              h = t0;
          }
          var H = (t & 4) !== 0, al = !H && (l === "scroll" || l === "scrollend"), r = H ? y !== null ? y + "Capture" : null : y;
          H = [];
          for (var o = v, m; o !== null; ) {
            var E = o;
            if (m = E.stateNode, E = E.tag, E !== 5 && E !== 26 && E !== 27 || m === null || r === null || (E = Oa(o, r), E != null && H.push(
              fu(o, E, m)
            )), al) break;
            o = o.return;
          }
          0 < H.length && (y = new h(
            y,
            B,
            null,
            e,
            S
          ), p.push({ event: y, listeners: H }));
        }
      }
      if ((t & 7) === 0) {
        l: {
          if (y = l === "mouseover" || l === "pointerover", h = l === "mouseout" || l === "pointerout", y && e !== $n && (B = e.relatedTarget || e.fromElement) && (Be(B) || B[qe]))
            break l;
          if ((h || y) && (y = S.window === S ? S : (y = S.ownerDocument) ? y.defaultView || y.parentWindow : window, h ? (B = e.relatedTarget || e.toElement, h = v, B = B ? Be(B) : null, B !== null && (al = ol(B), H = B.tag, B !== al || H !== 5 && H !== 27 && H !== 6) && (B = null)) : (h = null, B = v), h !== B)) {
            if (H = Ni, E = "onMouseLeave", r = "onMouseEnter", o = "mouse", (l === "pointerout" || l === "pointerover") && (H = wi, E = "onPointerLeave", r = "onPointerEnter", o = "pointer"), al = h == null ? y : za(h), m = B == null ? y : za(B), y = new H(
              E,
              o + "leave",
              h,
              e,
              S
            ), y.target = al, y.relatedTarget = m, E = null, Be(S) === v && (H = new H(
              r,
              o + "enter",
              B,
              e,
              S
            ), H.target = m, H.relatedTarget = al, E = H), al = E, h && B)
              t: {
                for (H = h, r = B, o = 0, m = H; m; m = ha(m))
                  o++;
                for (m = 0, E = r; E; E = ha(E))
                  m++;
                for (; 0 < o - m; )
                  H = ha(H), o--;
                for (; 0 < m - o; )
                  r = ha(r), m--;
                for (; o--; ) {
                  if (H === r || r !== null && H === r.alternate)
                    break t;
                  H = ha(H), r = ha(r);
                }
                H = null;
              }
            else H = null;
            h !== null && Ar(
              p,
              y,
              h,
              H,
              !1
            ), B !== null && al !== null && Ar(
              p,
              al,
              B,
              H,
              !0
            );
          }
        }
        l: {
          if (y = v ? za(v) : window, h = y.nodeName && y.nodeName.toLowerCase(), h === "select" || h === "input" && y.type === "file")
            var U = Ci;
          else if (Xi(y))
            if (ji)
              U = r0;
            else {
              U = s0;
              var Q = i0;
            }
          else
            h = y.nodeName, !h || h.toLowerCase() !== "input" || y.type !== "checkbox" && y.type !== "radio" ? v && Wn(v.elementType) && (U = Ci) : U = o0;
          if (U && (U = U(l, v))) {
            Qi(
              p,
              U,
              e,
              S
            );
            break l;
          }
          Q && Q(l, y, v), l === "focusout" && v && y.type === "number" && v.memoizedProps.value != null && kn(y, "number", y.value);
        }
        switch (Q = v ? za(v) : window, l) {
          case "focusin":
            (Xi(Q) || Q.contentEditable === "true") && (Ke = Q, sc = v, wa = null);
            break;
          case "focusout":
            wa = sc = Ke = null;
            break;
          case "mousedown":
            oc = !0;
            break;
          case "contextmenu":
          case "mouseup":
          case "dragend":
            oc = !1, $i(p, e, S);
            break;
          case "selectionchange":
            if (m0) break;
          case "keydown":
          case "keyup":
            $i(p, e, S);
        }
        var N;
        if (nc)
          l: {
            switch (l) {
              case "compositionstart":
                var q = "onCompositionStart";
                break l;
              case "compositionend":
                q = "onCompositionEnd";
                break l;
              case "compositionupdate":
                q = "onCompositionUpdate";
                break l;
            }
            q = void 0;
          }
        else
          Le ? Yi(l, e) && (q = "onCompositionEnd") : l === "keydown" && e.keyCode === 229 && (q = "onCompositionStart");
        q && (Hi && e.locale !== "ko" && (Le || q !== "onCompositionStart" ? q === "onCompositionEnd" && Le && (N = Ui()) : (Wt = S, lc = "value" in Wt ? Wt.value : Wt.textContent, Le = !0)), Q = Sn(v, q), 0 < Q.length && (q = new Ri(
          q,
          l,
          null,
          e,
          S
        ), p.push({ event: q, listeners: Q }), N ? q.data = N : (N = Gi(e), N !== null && (q.data = N)))), (N = a0 ? u0(l, e) : n0(l, e)) && (q = Sn(v, "onBeforeInput"), 0 < q.length && (Q = new Ri(
          "onBeforeInput",
          "beforeinput",
          null,
          e,
          S
        ), p.push({
          event: Q,
          listeners: q
        }), Q.data = N)), W0(
          p,
          l,
          v,
          e,
          S
        );
      }
      pr(p, t);
    });
  }
  function fu(l, t, e) {
    return {
      instance: l,
      listener: t,
      currentTarget: e
    };
  }
  function Sn(l, t) {
    for (var e = t + "Capture", a = []; l !== null; ) {
      var u = l, n = u.stateNode;
      if (u = u.tag, u !== 5 && u !== 26 && u !== 27 || n === null || (u = Oa(l, e), u != null && a.unshift(
        fu(l, u, n)
      ), u = Oa(l, t), u != null && a.push(
        fu(l, u, n)
      )), l.tag === 3) return a;
      l = l.return;
    }
    return [];
  }
  function ha(l) {
    if (l === null) return null;
    do
      l = l.return;
    while (l && l.tag !== 5 && l.tag !== 27);
    return l || null;
  }
  function Ar(l, t, e, a, u) {
    for (var n = t._reactName, c = []; e !== null && e !== a; ) {
      var f = e, i = f.alternate, v = f.stateNode;
      if (f = f.tag, i !== null && i === a) break;
      f !== 5 && f !== 26 && f !== 27 || v === null || (i = v, u ? (v = Oa(e, n), v != null && c.unshift(
        fu(e, v, i)
      )) : u || (v = Oa(e, n), v != null && c.push(
        fu(e, v, i)
      ))), e = e.return;
    }
    c.length !== 0 && l.push({ event: t, listeners: c });
  }
  var P0 = /\r\n?/g, lm = /\u0000|\uFFFD/g;
  function zr(l) {
    return (typeof l == "string" ? l : "" + l).replace(P0, `
`).replace(lm, "");
  }
  function Or(l, t) {
    return t = zr(t), zr(l) === t;
  }
  function En() {
  }
  function el(l, t, e, a, u, n) {
    switch (e) {
      case "children":
        typeof a == "string" ? t === "body" || t === "textarea" && a === "" || je(l, a) : (typeof a == "number" || typeof a == "bigint") && t !== "body" && je(l, "" + a);
        break;
      case "className":
        zu(l, "class", a);
        break;
      case "tabIndex":
        zu(l, "tabindex", a);
        break;
      case "dir":
      case "role":
      case "viewBox":
      case "width":
      case "height":
        zu(l, e, a);
        break;
      case "style":
        Mi(l, a, n);
        break;
      case "data":
        if (t !== "object") {
          zu(l, "data", a);
          break;
        }
      case "src":
      case "href":
        if (a === "" && (t !== "a" || e !== "href")) {
          l.removeAttribute(e);
          break;
        }
        if (a == null || typeof a == "function" || typeof a == "symbol" || typeof a == "boolean") {
          l.removeAttribute(e);
          break;
        }
        a = _u("" + a), l.setAttribute(e, a);
        break;
      case "action":
      case "formAction":
        if (typeof a == "function") {
          l.setAttribute(
            e,
            "javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')"
          );
          break;
        } else
          typeof n == "function" && (e === "formAction" ? (t !== "input" && el(l, t, "name", u.name, u, null), el(
            l,
            t,
            "formEncType",
            u.formEncType,
            u,
            null
          ), el(
            l,
            t,
            "formMethod",
            u.formMethod,
            u,
            null
          ), el(
            l,
            t,
            "formTarget",
            u.formTarget,
            u,
            null
          )) : (el(l, t, "encType", u.encType, u, null), el(l, t, "method", u.method, u, null), el(l, t, "target", u.target, u, null)));
        if (a == null || typeof a == "symbol" || typeof a == "boolean") {
          l.removeAttribute(e);
          break;
        }
        a = _u("" + a), l.setAttribute(e, a);
        break;
      case "onClick":
        a != null && (l.onclick = En);
        break;
      case "onScroll":
        a != null && V("scroll", l);
        break;
      case "onScrollEnd":
        a != null && V("scrollend", l);
        break;
      case "dangerouslySetInnerHTML":
        if (a != null) {
          if (typeof a != "object" || !("__html" in a))
            throw Error(g(61));
          if (e = a.__html, e != null) {
            if (u.children != null) throw Error(g(60));
            l.innerHTML = e;
          }
        }
        break;
      case "multiple":
        l.multiple = a && typeof a != "function" && typeof a != "symbol";
        break;
      case "muted":
        l.muted = a && typeof a != "function" && typeof a != "symbol";
        break;
      case "suppressContentEditableWarning":
      case "suppressHydrationWarning":
      case "defaultValue":
      case "defaultChecked":
      case "innerHTML":
      case "ref":
        break;
      case "autoFocus":
        break;
      case "xlinkHref":
        if (a == null || typeof a == "function" || typeof a == "boolean" || typeof a == "symbol") {
          l.removeAttribute("xlink:href");
          break;
        }
        e = _u("" + a), l.setAttributeNS(
          "http://www.w3.org/1999/xlink",
          "xlink:href",
          e
        );
        break;
      case "contentEditable":
      case "spellCheck":
      case "draggable":
      case "value":
      case "autoReverse":
      case "externalResourcesRequired":
      case "focusable":
      case "preserveAlpha":
        a != null && typeof a != "function" && typeof a != "symbol" ? l.setAttribute(e, "" + a) : l.removeAttribute(e);
        break;
      case "inert":
      case "allowFullScreen":
      case "async":
      case "autoPlay":
      case "controls":
      case "default":
      case "defer":
      case "disabled":
      case "disablePictureInPicture":
      case "disableRemotePlayback":
      case "formNoValidate":
      case "hidden":
      case "loop":
      case "noModule":
      case "noValidate":
      case "open":
      case "playsInline":
      case "readOnly":
      case "required":
      case "reversed":
      case "scoped":
      case "seamless":
      case "itemScope":
        a && typeof a != "function" && typeof a != "symbol" ? l.setAttribute(e, "") : l.removeAttribute(e);
        break;
      case "capture":
      case "download":
        a === !0 ? l.setAttribute(e, "") : a !== !1 && a != null && typeof a != "function" && typeof a != "symbol" ? l.setAttribute(e, a) : l.removeAttribute(e);
        break;
      case "cols":
      case "rows":
      case "size":
      case "span":
        a != null && typeof a != "function" && typeof a != "symbol" && !isNaN(a) && 1 <= a ? l.setAttribute(e, a) : l.removeAttribute(e);
        break;
      case "rowSpan":
      case "start":
        a == null || typeof a == "function" || typeof a == "symbol" || isNaN(a) ? l.removeAttribute(e) : l.setAttribute(e, a);
        break;
      case "popover":
        V("beforetoggle", l), V("toggle", l), Au(l, "popover", a);
        break;
      case "xlinkActuate":
        Nt(
          l,
          "http://www.w3.org/1999/xlink",
          "xlink:actuate",
          a
        );
        break;
      case "xlinkArcrole":
        Nt(
          l,
          "http://www.w3.org/1999/xlink",
          "xlink:arcrole",
          a
        );
        break;
      case "xlinkRole":
        Nt(
          l,
          "http://www.w3.org/1999/xlink",
          "xlink:role",
          a
        );
        break;
      case "xlinkShow":
        Nt(
          l,
          "http://www.w3.org/1999/xlink",
          "xlink:show",
          a
        );
        break;
      case "xlinkTitle":
        Nt(
          l,
          "http://www.w3.org/1999/xlink",
          "xlink:title",
          a
        );
        break;
      case "xlinkType":
        Nt(
          l,
          "http://www.w3.org/1999/xlink",
          "xlink:type",
          a
        );
        break;
      case "xmlBase":
        Nt(
          l,
          "http://www.w3.org/XML/1998/namespace",
          "xml:base",
          a
        );
        break;
      case "xmlLang":
        Nt(
          l,
          "http://www.w3.org/XML/1998/namespace",
          "xml:lang",
          a
        );
        break;
      case "xmlSpace":
        Nt(
          l,
          "http://www.w3.org/XML/1998/namespace",
          "xml:space",
          a
        );
        break;
      case "is":
        Au(l, "is", a);
        break;
      case "innerText":
      case "textContent":
        break;
      default:
        (!(2 < e.length) || e[0] !== "o" && e[0] !== "O" || e[1] !== "n" && e[1] !== "N") && (e = xd.get(e) || e, Au(l, e, a));
    }
  }
  function Hf(l, t, e, a, u, n) {
    switch (e) {
      case "style":
        Mi(l, a, n);
        break;
      case "dangerouslySetInnerHTML":
        if (a != null) {
          if (typeof a != "object" || !("__html" in a))
            throw Error(g(61));
          if (e = a.__html, e != null) {
            if (u.children != null) throw Error(g(60));
            l.innerHTML = e;
          }
        }
        break;
      case "children":
        typeof a == "string" ? je(l, a) : (typeof a == "number" || typeof a == "bigint") && je(l, "" + a);
        break;
      case "onScroll":
        a != null && V("scroll", l);
        break;
      case "onScrollEnd":
        a != null && V("scrollend", l);
        break;
      case "onClick":
        a != null && (l.onclick = En);
        break;
      case "suppressContentEditableWarning":
      case "suppressHydrationWarning":
      case "innerHTML":
      case "ref":
        break;
      case "innerText":
      case "textContent":
        break;
      default:
        if (!yi.hasOwnProperty(e))
          l: {
            if (e[0] === "o" && e[1] === "n" && (u = e.endsWith("Capture"), t = e.slice(2, u ? e.length - 7 : void 0), n = l[Ll] || null, n = n != null ? n[e] : null, typeof n == "function" && l.removeEventListener(t, n, u), typeof a == "function")) {
              typeof n != "function" && n !== null && (e in l ? l[e] = null : l.hasAttribute(e) && l.removeAttribute(e)), l.addEventListener(t, a, u);
              break l;
            }
            e in l ? l[e] = a : a === !0 ? l.setAttribute(e, "") : Au(l, e, a);
          }
    }
  }
  function Yl(l, t, e) {
    switch (t) {
      case "div":
      case "span":
      case "svg":
      case "path":
      case "a":
      case "g":
      case "p":
      case "li":
        break;
      case "img":
        V("error", l), V("load", l);
        var a = !1, u = !1, n;
        for (n in e)
          if (e.hasOwnProperty(n)) {
            var c = e[n];
            if (c != null)
              switch (n) {
                case "src":
                  a = !0;
                  break;
                case "srcSet":
                  u = !0;
                  break;
                case "children":
                case "dangerouslySetInnerHTML":
                  throw Error(g(137, t));
                default:
                  el(l, t, n, c, e, null);
              }
          }
        u && el(l, t, "srcSet", e.srcSet, e, null), a && el(l, t, "src", e.src, e, null);
        return;
      case "input":
        V("invalid", l);
        var f = n = c = u = null, i = null, v = null;
        for (a in e)
          if (e.hasOwnProperty(a)) {
            var S = e[a];
            if (S != null)
              switch (a) {
                case "name":
                  u = S;
                  break;
                case "type":
                  c = S;
                  break;
                case "checked":
                  i = S;
                  break;
                case "defaultChecked":
                  v = S;
                  break;
                case "value":
                  n = S;
                  break;
                case "defaultValue":
                  f = S;
                  break;
                case "children":
                case "dangerouslySetInnerHTML":
                  if (S != null)
                    throw Error(g(137, t));
                  break;
                default:
                  el(l, t, a, S, e, null);
              }
          }
        Ti(
          l,
          n,
          f,
          i,
          v,
          c,
          u,
          !1
        ), Ou(l);
        return;
      case "select":
        V("invalid", l), a = c = n = null;
        for (u in e)
          if (e.hasOwnProperty(u) && (f = e[u], f != null))
            switch (u) {
              case "value":
                n = f;
                break;
              case "defaultValue":
                c = f;
                break;
              case "multiple":
                a = f;
              default:
                el(l, t, u, f, e, null);
            }
        t = n, e = c, l.multiple = !!a, t != null ? Ce(l, !!a, t, !1) : e != null && Ce(l, !!a, e, !0);
        return;
      case "textarea":
        V("invalid", l), n = u = a = null;
        for (c in e)
          if (e.hasOwnProperty(c) && (f = e[c], f != null))
            switch (c) {
              case "value":
                a = f;
                break;
              case "defaultValue":
                u = f;
                break;
              case "children":
                n = f;
                break;
              case "dangerouslySetInnerHTML":
                if (f != null) throw Error(g(91));
                break;
              default:
                el(l, t, c, f, e, null);
            }
        zi(l, a, u, n), Ou(l);
        return;
      case "option":
        for (i in e)
          if (e.hasOwnProperty(i) && (a = e[i], a != null))
            switch (i) {
              case "selected":
                l.selected = a && typeof a != "function" && typeof a != "symbol";
                break;
              default:
                el(l, t, i, a, e, null);
            }
        return;
      case "dialog":
        V("beforetoggle", l), V("toggle", l), V("cancel", l), V("close", l);
        break;
      case "iframe":
      case "object":
        V("load", l);
        break;
      case "video":
      case "audio":
        for (a = 0; a < cu.length; a++)
          V(cu[a], l);
        break;
      case "image":
        V("error", l), V("load", l);
        break;
      case "details":
        V("toggle", l);
        break;
      case "embed":
      case "source":
      case "link":
        V("error", l), V("load", l);
      case "area":
      case "base":
      case "br":
      case "col":
      case "hr":
      case "keygen":
      case "meta":
      case "param":
      case "track":
      case "wbr":
      case "menuitem":
        for (v in e)
          if (e.hasOwnProperty(v) && (a = e[v], a != null))
            switch (v) {
              case "children":
              case "dangerouslySetInnerHTML":
                throw Error(g(137, t));
              default:
                el(l, t, v, a, e, null);
            }
        return;
      default:
        if (Wn(t)) {
          for (S in e)
            e.hasOwnProperty(S) && (a = e[S], a !== void 0 && Hf(
              l,
              t,
              S,
              a,
              e,
              void 0
            ));
          return;
        }
    }
    for (f in e)
      e.hasOwnProperty(f) && (a = e[f], a != null && el(l, t, f, a, e, null));
  }
  function tm(l, t, e, a) {
    switch (t) {
      case "div":
      case "span":
      case "svg":
      case "path":
      case "a":
      case "g":
      case "p":
      case "li":
        break;
      case "input":
        var u = null, n = null, c = null, f = null, i = null, v = null, S = null;
        for (h in e) {
          var p = e[h];
          if (e.hasOwnProperty(h) && p != null)
            switch (h) {
              case "checked":
                break;
              case "value":
                break;
              case "defaultValue":
                i = p;
              default:
                a.hasOwnProperty(h) || el(l, t, h, null, a, p);
            }
        }
        for (var y in a) {
          var h = a[y];
          if (p = e[y], a.hasOwnProperty(y) && (h != null || p != null))
            switch (y) {
              case "type":
                n = h;
                break;
              case "name":
                u = h;
                break;
              case "checked":
                v = h;
                break;
              case "defaultChecked":
                S = h;
                break;
              case "value":
                c = h;
                break;
              case "defaultValue":
                f = h;
                break;
              case "children":
              case "dangerouslySetInnerHTML":
                if (h != null)
                  throw Error(g(137, t));
                break;
              default:
                h !== p && el(
                  l,
                  t,
                  y,
                  h,
                  a,
                  p
                );
            }
        }
        Jn(
          l,
          c,
          f,
          i,
          v,
          S,
          n,
          u
        );
        return;
      case "select":
        h = c = f = y = null;
        for (n in e)
          if (i = e[n], e.hasOwnProperty(n) && i != null)
            switch (n) {
              case "value":
                break;
              case "multiple":
                h = i;
              default:
                a.hasOwnProperty(n) || el(
                  l,
                  t,
                  n,
                  null,
                  a,
                  i
                );
            }
        for (u in a)
          if (n = a[u], i = e[u], a.hasOwnProperty(u) && (n != null || i != null))
            switch (u) {
              case "value":
                y = n;
                break;
              case "defaultValue":
                f = n;
                break;
              case "multiple":
                c = n;
              default:
                n !== i && el(
                  l,
                  t,
                  u,
                  n,
                  a,
                  i
                );
            }
        t = f, e = c, a = h, y != null ? Ce(l, !!e, y, !1) : !!a != !!e && (t != null ? Ce(l, !!e, t, !0) : Ce(l, !!e, e ? [] : "", !1));
        return;
      case "textarea":
        h = y = null;
        for (f in e)
          if (u = e[f], e.hasOwnProperty(f) && u != null && !a.hasOwnProperty(f))
            switch (f) {
              case "value":
                break;
              case "children":
                break;
              default:
                el(l, t, f, null, a, u);
            }
        for (c in a)
          if (u = a[c], n = e[c], a.hasOwnProperty(c) && (u != null || n != null))
            switch (c) {
              case "value":
                y = u;
                break;
              case "defaultValue":
                h = u;
                break;
              case "children":
                break;
              case "dangerouslySetInnerHTML":
                if (u != null) throw Error(g(91));
                break;
              default:
                u !== n && el(l, t, c, u, a, n);
            }
        Ai(l, y, h);
        return;
      case "option":
        for (var B in e)
          if (y = e[B], e.hasOwnProperty(B) && y != null && !a.hasOwnProperty(B))
            switch (B) {
              case "selected":
                l.selected = !1;
                break;
              default:
                el(
                  l,
                  t,
                  B,
                  null,
                  a,
                  y
                );
            }
        for (i in a)
          if (y = a[i], h = e[i], a.hasOwnProperty(i) && y !== h && (y != null || h != null))
            switch (i) {
              case "selected":
                l.selected = y && typeof y != "function" && typeof y != "symbol";
                break;
              default:
                el(
                  l,
                  t,
                  i,
                  y,
                  a,
                  h
                );
            }
        return;
      case "img":
      case "link":
      case "area":
      case "base":
      case "br":
      case "col":
      case "embed":
      case "hr":
      case "keygen":
      case "meta":
      case "param":
      case "source":
      case "track":
      case "wbr":
      case "menuitem":
        for (var H in e)
          y = e[H], e.hasOwnProperty(H) && y != null && !a.hasOwnProperty(H) && el(l, t, H, null, a, y);
        for (v in a)
          if (y = a[v], h = e[v], a.hasOwnProperty(v) && y !== h && (y != null || h != null))
            switch (v) {
              case "children":
              case "dangerouslySetInnerHTML":
                if (y != null)
                  throw Error(g(137, t));
                break;
              default:
                el(
                  l,
                  t,
                  v,
                  y,
                  a,
                  h
                );
            }
        return;
      default:
        if (Wn(t)) {
          for (var al in e)
            y = e[al], e.hasOwnProperty(al) && y !== void 0 && !a.hasOwnProperty(al) && Hf(
              l,
              t,
              al,
              void 0,
              a,
              y
            );
          for (S in a)
            y = a[S], h = e[S], !a.hasOwnProperty(S) || y === h || y === void 0 && h === void 0 || Hf(
              l,
              t,
              S,
              y,
              a,
              h
            );
          return;
        }
    }
    for (var r in e)
      y = e[r], e.hasOwnProperty(r) && y != null && !a.hasOwnProperty(r) && el(l, t, r, null, a, y);
    for (p in a)
      y = a[p], h = e[p], !a.hasOwnProperty(p) || y === h || y == null && h == null || el(l, t, p, y, a, h);
  }
  var qf = null, Bf = null;
  function pn(l) {
    return l.nodeType === 9 ? l : l.ownerDocument;
  }
  function Mr(l) {
    switch (l) {
      case "http://www.w3.org/2000/svg":
        return 1;
      case "http://www.w3.org/1998/Math/MathML":
        return 2;
      default:
        return 0;
    }
  }
  function _r(l, t) {
    if (l === 0)
      switch (t) {
        case "svg":
          return 1;
        case "math":
          return 2;
        default:
          return 0;
      }
    return l === 1 && t === "foreignObject" ? 0 : l;
  }
  function Yf(l, t) {
    return l === "textarea" || l === "noscript" || typeof t.children == "string" || typeof t.children == "number" || typeof t.children == "bigint" || typeof t.dangerouslySetInnerHTML == "object" && t.dangerouslySetInnerHTML !== null && t.dangerouslySetInnerHTML.__html != null;
  }
  var Gf = null;
  function em() {
    var l = window.event;
    return l && l.type === "popstate" ? l === Gf ? !1 : (Gf = l, !0) : (Gf = null, !1);
  }
  var Dr = typeof setTimeout == "function" ? setTimeout : void 0, am = typeof clearTimeout == "function" ? clearTimeout : void 0, Ur = typeof Promise == "function" ? Promise : void 0, um = typeof queueMicrotask == "function" ? queueMicrotask : typeof Ur < "u" ? function(l) {
    return Ur.resolve(null).then(l).catch(nm);
  } : Dr;
  function nm(l) {
    setTimeout(function() {
      throw l;
    });
  }
  function re(l) {
    return l === "head";
  }
  function xr(l, t) {
    var e = t, a = 0, u = 0;
    do {
      var n = e.nextSibling;
      if (l.removeChild(e), n && n.nodeType === 8)
        if (e = n.data, e === "/$") {
          if (0 < a && 8 > a) {
            e = a;
            var c = l.ownerDocument;
            if (e & 1 && iu(c.documentElement), e & 2 && iu(c.body), e & 4)
              for (e = c.head, iu(e), c = e.firstChild; c; ) {
                var f = c.nextSibling, i = c.nodeName;
                c[Aa] || i === "SCRIPT" || i === "STYLE" || i === "LINK" && c.rel.toLowerCase() === "stylesheet" || e.removeChild(c), c = f;
              }
          }
          if (u === 0) {
            l.removeChild(n), hu(t);
            return;
          }
          u--;
        } else
          e === "$" || e === "$?" || e === "$!" ? u++ : a = e.charCodeAt(0) - 48;
      else a = 0;
      e = n;
    } while (e);
    hu(t);
  }
  function Xf(l) {
    var t = l.firstChild;
    for (t && t.nodeType === 10 && (t = t.nextSibling); t; ) {
      var e = t;
      switch (t = t.nextSibling, e.nodeName) {
        case "HTML":
        case "HEAD":
        case "BODY":
          Xf(e), Zn(e);
          continue;
        case "SCRIPT":
        case "STYLE":
          continue;
        case "LINK":
          if (e.rel.toLowerCase() === "stylesheet") continue;
      }
      l.removeChild(e);
    }
  }
  function cm(l, t, e, a) {
    for (; l.nodeType === 1; ) {
      var u = e;
      if (l.nodeName.toLowerCase() !== t.toLowerCase()) {
        if (!a && (l.nodeName !== "INPUT" || l.type !== "hidden"))
          break;
      } else if (a) {
        if (!l[Aa])
          switch (t) {
            case "meta":
              if (!l.hasAttribute("itemprop")) break;
              return l;
            case "link":
              if (n = l.getAttribute("rel"), n === "stylesheet" && l.hasAttribute("data-precedence"))
                break;
              if (n !== u.rel || l.getAttribute("href") !== (u.href == null || u.href === "" ? null : u.href) || l.getAttribute("crossorigin") !== (u.crossOrigin == null ? null : u.crossOrigin) || l.getAttribute("title") !== (u.title == null ? null : u.title))
                break;
              return l;
            case "style":
              if (l.hasAttribute("data-precedence")) break;
              return l;
            case "script":
              if (n = l.getAttribute("src"), (n !== (u.src == null ? null : u.src) || l.getAttribute("type") !== (u.type == null ? null : u.type) || l.getAttribute("crossorigin") !== (u.crossOrigin == null ? null : u.crossOrigin)) && n && l.hasAttribute("async") && !l.hasAttribute("itemprop"))
                break;
              return l;
            default:
              return l;
          }
      } else if (t === "input" && l.type === "hidden") {
        var n = u.name == null ? null : "" + u.name;
        if (u.type === "hidden" && l.getAttribute("name") === n)
          return l;
      } else return l;
      if (l = pt(l.nextSibling), l === null) break;
    }
    return null;
  }
  function fm(l, t, e) {
    if (t === "") return null;
    for (; l.nodeType !== 3; )
      if ((l.nodeType !== 1 || l.nodeName !== "INPUT" || l.type !== "hidden") && !e || (l = pt(l.nextSibling), l === null)) return null;
    return l;
  }
  function Qf(l) {
    return l.data === "$!" || l.data === "$?" && l.ownerDocument.readyState === "complete";
  }
  function im(l, t) {
    var e = l.ownerDocument;
    if (l.data !== "$?" || e.readyState === "complete")
      t();
    else {
      var a = function() {
        t(), e.removeEventListener("DOMContentLoaded", a);
      };
      e.addEventListener("DOMContentLoaded", a), l._reactRetry = a;
    }
  }
  function pt(l) {
    for (; l != null; l = l.nextSibling) {
      var t = l.nodeType;
      if (t === 1 || t === 3) break;
      if (t === 8) {
        if (t = l.data, t === "$" || t === "$!" || t === "$?" || t === "F!" || t === "F")
          break;
        if (t === "/$") return null;
      }
    }
    return l;
  }
  var Cf = null;
  function Nr(l) {
    l = l.previousSibling;
    for (var t = 0; l; ) {
      if (l.nodeType === 8) {
        var e = l.data;
        if (e === "$" || e === "$!" || e === "$?") {
          if (t === 0) return l;
          t--;
        } else e === "/$" && t++;
      }
      l = l.previousSibling;
    }
    return null;
  }
  function Rr(l, t, e) {
    switch (t = pn(e), l) {
      case "html":
        if (l = t.documentElement, !l) throw Error(g(452));
        return l;
      case "head":
        if (l = t.head, !l) throw Error(g(453));
        return l;
      case "body":
        if (l = t.body, !l) throw Error(g(454));
        return l;
      default:
        throw Error(g(451));
    }
  }
  function iu(l) {
    for (var t = l.attributes; t.length; )
      l.removeAttributeNode(t[0]);
    Zn(l);
  }
  var bt = /* @__PURE__ */ new Map(), wr = /* @__PURE__ */ new Set();
  function Tn(l) {
    return typeof l.getRootNode == "function" ? l.getRootNode() : l.nodeType === 9 ? l : l.ownerDocument;
  }
  var Lt = d.d;
  d.d = {
    f: sm,
    r: om,
    D: rm,
    C: dm,
    L: mm,
    m: vm,
    X: hm,
    S: ym,
    M: gm
  };
  function sm() {
    var l = Lt.f(), t = mn();
    return l || t;
  }
  function om(l) {
    var t = Ye(l);
    t !== null && t.tag === 5 && t.type === "form" ? Is(t) : Lt.r(l);
  }
  var ga = typeof document > "u" ? null : document;
  function Hr(l, t, e) {
    var a = ga;
    if (a && typeof t == "string" && t) {
      var u = rt(t);
      u = 'link[rel="' + l + '"][href="' + u + '"]', typeof e == "string" && (u += '[crossorigin="' + e + '"]'), wr.has(u) || (wr.add(u), l = { rel: l, crossOrigin: e, href: t }, a.querySelector(u) === null && (t = a.createElement("link"), Yl(t, "link", l), _l(t), a.head.appendChild(t)));
    }
  }
  function rm(l) {
    Lt.D(l), Hr("dns-prefetch", l, null);
  }
  function dm(l, t) {
    Lt.C(l, t), Hr("preconnect", l, t);
  }
  function mm(l, t, e) {
    Lt.L(l, t, e);
    var a = ga;
    if (a && l && t) {
      var u = 'link[rel="preload"][as="' + rt(t) + '"]';
      t === "image" && e && e.imageSrcSet ? (u += '[imagesrcset="' + rt(
        e.imageSrcSet
      ) + '"]', typeof e.imageSizes == "string" && (u += '[imagesizes="' + rt(
        e.imageSizes
      ) + '"]')) : u += '[href="' + rt(l) + '"]';
      var n = u;
      switch (t) {
        case "style":
          n = ba(l);
          break;
        case "script":
          n = Sa(l);
      }
      bt.has(n) || (l = x(
        {
          rel: "preload",
          href: t === "image" && e && e.imageSrcSet ? void 0 : l,
          as: t
        },
        e
      ), bt.set(n, l), a.querySelector(u) !== null || t === "style" && a.querySelector(su(n)) || t === "script" && a.querySelector(ou(n)) || (t = a.createElement("link"), Yl(t, "link", l), _l(t), a.head.appendChild(t)));
    }
  }
  function vm(l, t) {
    Lt.m(l, t);
    var e = ga;
    if (e && l) {
      var a = t && typeof t.as == "string" ? t.as : "script", u = 'link[rel="modulepreload"][as="' + rt(a) + '"][href="' + rt(l) + '"]', n = u;
      switch (a) {
        case "audioworklet":
        case "paintworklet":
        case "serviceworker":
        case "sharedworker":
        case "worker":
        case "script":
          n = Sa(l);
      }
      if (!bt.has(n) && (l = x({ rel: "modulepreload", href: l }, t), bt.set(n, l), e.querySelector(u) === null)) {
        switch (a) {
          case "audioworklet":
          case "paintworklet":
          case "serviceworker":
          case "sharedworker":
          case "worker":
          case "script":
            if (e.querySelector(ou(n)))
              return;
        }
        a = e.createElement("link"), Yl(a, "link", l), _l(a), e.head.appendChild(a);
      }
    }
  }
  function ym(l, t, e) {
    Lt.S(l, t, e);
    var a = ga;
    if (a && l) {
      var u = Ge(a).hoistableStyles, n = ba(l);
      t = t || "default";
      var c = u.get(n);
      if (!c) {
        var f = { loading: 0, preload: null };
        if (c = a.querySelector(
          su(n)
        ))
          f.loading = 5;
        else {
          l = x(
            { rel: "stylesheet", href: l, "data-precedence": t },
            e
          ), (e = bt.get(n)) && jf(l, e);
          var i = c = a.createElement("link");
          _l(i), Yl(i, "link", l), i._p = new Promise(function(v, S) {
            i.onload = v, i.onerror = S;
          }), i.addEventListener("load", function() {
            f.loading |= 1;
          }), i.addEventListener("error", function() {
            f.loading |= 2;
          }), f.loading |= 4, An(c, t, a);
        }
        c = {
          type: "stylesheet",
          instance: c,
          count: 1,
          state: f
        }, u.set(n, c);
      }
    }
  }
  function hm(l, t) {
    Lt.X(l, t);
    var e = ga;
    if (e && l) {
      var a = Ge(e).hoistableScripts, u = Sa(l), n = a.get(u);
      n || (n = e.querySelector(ou(u)), n || (l = x({ src: l, async: !0 }, t), (t = bt.get(u)) && Zf(l, t), n = e.createElement("script"), _l(n), Yl(n, "link", l), e.head.appendChild(n)), n = {
        type: "script",
        instance: n,
        count: 1,
        state: null
      }, a.set(u, n));
    }
  }
  function gm(l, t) {
    Lt.M(l, t);
    var e = ga;
    if (e && l) {
      var a = Ge(e).hoistableScripts, u = Sa(l), n = a.get(u);
      n || (n = e.querySelector(ou(u)), n || (l = x({ src: l, async: !0, type: "module" }, t), (t = bt.get(u)) && Zf(l, t), n = e.createElement("script"), _l(n), Yl(n, "link", l), e.head.appendChild(n)), n = {
        type: "script",
        instance: n,
        count: 1,
        state: null
      }, a.set(u, n));
    }
  }
  function qr(l, t, e, a) {
    var u = (u = Y.current) ? Tn(u) : null;
    if (!u) throw Error(g(446));
    switch (l) {
      case "meta":
      case "title":
        return null;
      case "style":
        return typeof e.precedence == "string" && typeof e.href == "string" ? (t = ba(e.href), e = Ge(
          u
        ).hoistableStyles, a = e.get(t), a || (a = {
          type: "style",
          instance: null,
          count: 0,
          state: null
        }, e.set(t, a)), a) : { type: "void", instance: null, count: 0, state: null };
      case "link":
        if (e.rel === "stylesheet" && typeof e.href == "string" && typeof e.precedence == "string") {
          l = ba(e.href);
          var n = Ge(
            u
          ).hoistableStyles, c = n.get(l);
          if (c || (u = u.ownerDocument || u, c = {
            type: "stylesheet",
            instance: null,
            count: 0,
            state: { loading: 0, preload: null }
          }, n.set(l, c), (n = u.querySelector(
            su(l)
          )) && !n._p && (c.instance = n, c.state.loading = 5), bt.has(l) || (e = {
            rel: "preload",
            as: "style",
            href: e.href,
            crossOrigin: e.crossOrigin,
            integrity: e.integrity,
            media: e.media,
            hrefLang: e.hrefLang,
            referrerPolicy: e.referrerPolicy
          }, bt.set(l, e), n || bm(
            u,
            l,
            e,
            c.state
          ))), t && a === null)
            throw Error(g(528, ""));
          return c;
        }
        if (t && a !== null)
          throw Error(g(529, ""));
        return null;
      case "script":
        return t = e.async, e = e.src, typeof e == "string" && t && typeof t != "function" && typeof t != "symbol" ? (t = Sa(e), e = Ge(
          u
        ).hoistableScripts, a = e.get(t), a || (a = {
          type: "script",
          instance: null,
          count: 0,
          state: null
        }, e.set(t, a)), a) : { type: "void", instance: null, count: 0, state: null };
      default:
        throw Error(g(444, l));
    }
  }
  function ba(l) {
    return 'href="' + rt(l) + '"';
  }
  function su(l) {
    return 'link[rel="stylesheet"][' + l + "]";
  }
  function Br(l) {
    return x({}, l, {
      "data-precedence": l.precedence,
      precedence: null
    });
  }
  function bm(l, t, e, a) {
    l.querySelector('link[rel="preload"][as="style"][' + t + "]") ? a.loading = 1 : (t = l.createElement("link"), a.preload = t, t.addEventListener("load", function() {
      return a.loading |= 1;
    }), t.addEventListener("error", function() {
      return a.loading |= 2;
    }), Yl(t, "link", e), _l(t), l.head.appendChild(t));
  }
  function Sa(l) {
    return '[src="' + rt(l) + '"]';
  }
  function ou(l) {
    return "script[async]" + l;
  }
  function Yr(l, t, e) {
    if (t.count++, t.instance === null)
      switch (t.type) {
        case "style":
          var a = l.querySelector(
            'style[data-href~="' + rt(e.href) + '"]'
          );
          if (a)
            return t.instance = a, _l(a), a;
          var u = x({}, e, {
            "data-href": e.href,
            "data-precedence": e.precedence,
            href: null,
            precedence: null
          });
          return a = (l.ownerDocument || l).createElement(
            "style"
          ), _l(a), Yl(a, "style", u), An(a, e.precedence, l), t.instance = a;
        case "stylesheet":
          u = ba(e.href);
          var n = l.querySelector(
            su(u)
          );
          if (n)
            return t.state.loading |= 4, t.instance = n, _l(n), n;
          a = Br(e), (u = bt.get(u)) && jf(a, u), n = (l.ownerDocument || l).createElement("link"), _l(n);
          var c = n;
          return c._p = new Promise(function(f, i) {
            c.onload = f, c.onerror = i;
          }), Yl(n, "link", a), t.state.loading |= 4, An(n, e.precedence, l), t.instance = n;
        case "script":
          return n = Sa(e.src), (u = l.querySelector(
            ou(n)
          )) ? (t.instance = u, _l(u), u) : (a = e, (u = bt.get(n)) && (a = x({}, e), Zf(a, u)), l = l.ownerDocument || l, u = l.createElement("script"), _l(u), Yl(u, "link", a), l.head.appendChild(u), t.instance = u);
        case "void":
          return null;
        default:
          throw Error(g(443, t.type));
      }
    else
      t.type === "stylesheet" && (t.state.loading & 4) === 0 && (a = t.instance, t.state.loading |= 4, An(a, e.precedence, l));
    return t.instance;
  }
  function An(l, t, e) {
    for (var a = e.querySelectorAll(
      'link[rel="stylesheet"][data-precedence],style[data-precedence]'
    ), u = a.length ? a[a.length - 1] : null, n = u, c = 0; c < a.length; c++) {
      var f = a[c];
      if (f.dataset.precedence === t) n = f;
      else if (n !== u) break;
    }
    n ? n.parentNode.insertBefore(l, n.nextSibling) : (t = e.nodeType === 9 ? e.head : e, t.insertBefore(l, t.firstChild));
  }
  function jf(l, t) {
    l.crossOrigin == null && (l.crossOrigin = t.crossOrigin), l.referrerPolicy == null && (l.referrerPolicy = t.referrerPolicy), l.title == null && (l.title = t.title);
  }
  function Zf(l, t) {
    l.crossOrigin == null && (l.crossOrigin = t.crossOrigin), l.referrerPolicy == null && (l.referrerPolicy = t.referrerPolicy), l.integrity == null && (l.integrity = t.integrity);
  }
  var zn = null;
  function Gr(l, t, e) {
    if (zn === null) {
      var a = /* @__PURE__ */ new Map(), u = zn = /* @__PURE__ */ new Map();
      u.set(e, a);
    } else
      u = zn, a = u.get(e), a || (a = /* @__PURE__ */ new Map(), u.set(e, a));
    if (a.has(l)) return a;
    for (a.set(l, null), e = e.getElementsByTagName(l), u = 0; u < e.length; u++) {
      var n = e[u];
      if (!(n[Aa] || n[Xl] || l === "link" && n.getAttribute("rel") === "stylesheet") && n.namespaceURI !== "http://www.w3.org/2000/svg") {
        var c = n.getAttribute(t) || "";
        c = l + c;
        var f = a.get(c);
        f ? f.push(n) : a.set(c, [n]);
      }
    }
    return a;
  }
  function Xr(l, t, e) {
    l = l.ownerDocument || l, l.head.insertBefore(
      e,
      t === "title" ? l.querySelector("head > title") : null
    );
  }
  function Sm(l, t, e) {
    if (e === 1 || t.itemProp != null) return !1;
    switch (l) {
      case "meta":
      case "title":
        return !0;
      case "style":
        if (typeof t.precedence != "string" || typeof t.href != "string" || t.href === "")
          break;
        return !0;
      case "link":
        if (typeof t.rel != "string" || typeof t.href != "string" || t.href === "" || t.onLoad || t.onError)
          break;
        switch (t.rel) {
          case "stylesheet":
            return l = t.disabled, typeof t.precedence == "string" && l == null;
          default:
            return !0;
        }
      case "script":
        if (t.async && typeof t.async != "function" && typeof t.async != "symbol" && !t.onLoad && !t.onError && t.src && typeof t.src == "string")
          return !0;
    }
    return !1;
  }
  function Qr(l) {
    return !(l.type === "stylesheet" && (l.state.loading & 3) === 0);
  }
  var ru = null;
  function Em() {
  }
  function pm(l, t, e) {
    if (ru === null) throw Error(g(475));
    var a = ru;
    if (t.type === "stylesheet" && (typeof e.media != "string" || matchMedia(e.media).matches !== !1) && (t.state.loading & 4) === 0) {
      if (t.instance === null) {
        var u = ba(e.href), n = l.querySelector(
          su(u)
        );
        if (n) {
          l = n._p, l !== null && typeof l == "object" && typeof l.then == "function" && (a.count++, a = On.bind(a), l.then(a, a)), t.state.loading |= 4, t.instance = n, _l(n);
          return;
        }
        n = l.ownerDocument || l, e = Br(e), (u = bt.get(u)) && jf(e, u), n = n.createElement("link"), _l(n);
        var c = n;
        c._p = new Promise(function(f, i) {
          c.onload = f, c.onerror = i;
        }), Yl(n, "link", e), t.instance = n;
      }
      a.stylesheets === null && (a.stylesheets = /* @__PURE__ */ new Map()), a.stylesheets.set(t, l), (l = t.state.preload) && (t.state.loading & 3) === 0 && (a.count++, t = On.bind(a), l.addEventListener("load", t), l.addEventListener("error", t));
    }
  }
  function Tm() {
    if (ru === null) throw Error(g(475));
    var l = ru;
    return l.stylesheets && l.count === 0 && Vf(l, l.stylesheets), 0 < l.count ? function(t) {
      var e = setTimeout(function() {
        if (l.stylesheets && Vf(l, l.stylesheets), l.unsuspend) {
          var a = l.unsuspend;
          l.unsuspend = null, a();
        }
      }, 6e4);
      return l.unsuspend = t, function() {
        l.unsuspend = null, clearTimeout(e);
      };
    } : null;
  }
  function On() {
    if (this.count--, this.count === 0) {
      if (this.stylesheets) Vf(this, this.stylesheets);
      else if (this.unsuspend) {
        var l = this.unsuspend;
        this.unsuspend = null, l();
      }
    }
  }
  var Mn = null;
  function Vf(l, t) {
    l.stylesheets = null, l.unsuspend !== null && (l.count++, Mn = /* @__PURE__ */ new Map(), t.forEach(Am, l), Mn = null, On.call(l));
  }
  function Am(l, t) {
    if (!(t.state.loading & 4)) {
      var e = Mn.get(l);
      if (e) var a = e.get(null);
      else {
        e = /* @__PURE__ */ new Map(), Mn.set(l, e);
        for (var u = l.querySelectorAll(
          "link[data-precedence],style[data-precedence]"
        ), n = 0; n < u.length; n++) {
          var c = u[n];
          (c.nodeName === "LINK" || c.getAttribute("media") !== "not all") && (e.set(c.dataset.precedence, c), a = c);
        }
        a && e.set(null, a);
      }
      u = t.instance, c = u.getAttribute("data-precedence"), n = e.get(c) || a, n === a && e.set(null, u), e.set(c, u), this.count++, a = On.bind(this), u.addEventListener("load", a), u.addEventListener("error", a), n ? n.parentNode.insertBefore(u, n.nextSibling) : (l = l.nodeType === 9 ? l.head : l, l.insertBefore(u, l.firstChild)), t.state.loading |= 4;
    }
  }
  var du = {
    $$typeof: Al,
    Provider: null,
    Consumer: null,
    _currentValue: M,
    _currentValue2: M,
    _threadCount: 0
  };
  function zm(l, t, e, a, u, n, c, f) {
    this.tag = 1, this.containerInfo = l, this.pingCache = this.current = this.pendingChildren = null, this.timeoutHandle = -1, this.callbackNode = this.next = this.pendingContext = this.context = this.cancelPendingCommit = null, this.callbackPriority = 0, this.expirationTimes = Xn(-1), this.entangledLanes = this.shellSuspendCounter = this.errorRecoveryDisabledLanes = this.expiredLanes = this.warmLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0, this.entanglements = Xn(0), this.hiddenUpdates = Xn(null), this.identifierPrefix = a, this.onUncaughtError = u, this.onCaughtError = n, this.onRecoverableError = c, this.pooledCache = null, this.pooledCacheLanes = 0, this.formState = f, this.incompleteTransitions = /* @__PURE__ */ new Map();
  }
  function Cr(l, t, e, a, u, n, c, f, i, v, S, p) {
    return l = new zm(
      l,
      t,
      e,
      c,
      f,
      i,
      v,
      p
    ), t = 1, n === !0 && (t |= 24), n = tt(3, null, null, t), l.current = n, n.stateNode = l, t = zc(), t.refCount++, l.pooledCache = t, t.refCount++, n.memoizedState = {
      element: a,
      isDehydrated: e,
      cache: t
    }, Dc(n), l;
  }
  function jr(l) {
    return l ? (l = $e, l) : $e;
  }
  function Zr(l, t, e, a, u, n) {
    u = jr(u), a.context === null ? a.context = u : a.pendingContext = u, a = It(t), a.payload = { element: e }, n = n === void 0 ? null : n, n !== null && (a.callback = n), e = Pt(l, a, t), e !== null && (ct(e, l, t), ja(e, l, t));
  }
  function Vr(l, t) {
    if (l = l.memoizedState, l !== null && l.dehydrated !== null) {
      var e = l.retryLane;
      l.retryLane = e !== 0 && e < t ? e : t;
    }
  }
  function Lf(l, t) {
    Vr(l, t), (l = l.alternate) && Vr(l, t);
  }
  function Lr(l) {
    if (l.tag === 13) {
      var t = We(l, 67108864);
      t !== null && ct(t, l, 67108864), Lf(l, 67108864);
    }
  }
  var _n = !0;
  function Om(l, t, e, a) {
    var u = b.T;
    b.T = null;
    var n = d.p;
    try {
      d.p = 2, Kf(l, t, e, a);
    } finally {
      d.p = n, b.T = u;
    }
  }
  function Mm(l, t, e, a) {
    var u = b.T;
    b.T = null;
    var n = d.p;
    try {
      d.p = 8, Kf(l, t, e, a);
    } finally {
      d.p = n, b.T = u;
    }
  }
  function Kf(l, t, e, a) {
    if (_n) {
      var u = Jf(a);
      if (u === null)
        wf(
          l,
          t,
          a,
          Dn,
          e
        ), Jr(l, a);
      else if (Dm(
        u,
        l,
        t,
        e,
        a
      ))
        a.stopPropagation();
      else if (Jr(l, a), t & 4 && -1 < _m.indexOf(l)) {
        for (; u !== null; ) {
          var n = Ye(u);
          if (n !== null)
            switch (n.tag) {
              case 3:
                if (n = n.stateNode, n.current.memoizedState.isDehydrated) {
                  var c = ge(n.pendingLanes);
                  if (c !== 0) {
                    var f = n;
                    for (f.pendingLanes |= 2, f.entangledLanes |= 2; c; ) {
                      var i = 1 << 31 - Pl(c);
                      f.entanglements[1] |= i, c &= ~i;
                    }
                    Dt(n), (P & 6) === 0 && (rn = At() + 500, nu(0));
                  }
                }
                break;
              case 13:
                f = We(n, 2), f !== null && ct(f, n, 2), mn(), Lf(n, 2);
            }
          if (n = Jf(a), n === null && wf(
            l,
            t,
            a,
            Dn,
            e
          ), n === u) break;
          u = n;
        }
        u !== null && a.stopPropagation();
      } else
        wf(
          l,
          t,
          a,
          null,
          e
        );
    }
  }
  function Jf(l) {
    return l = Fn(l), kf(l);
  }
  var Dn = null;
  function kf(l) {
    if (Dn = null, l = Be(l), l !== null) {
      var t = ol(l);
      if (t === null) l = null;
      else {
        var e = t.tag;
        if (e === 13) {
          if (l = L(t), l !== null) return l;
          l = null;
        } else if (e === 3) {
          if (t.stateNode.current.memoizedState.isDehydrated)
            return t.tag === 3 ? t.stateNode.containerInfo : null;
          l = null;
        } else t !== l && (l = null);
      }
    }
    return Dn = l, null;
  }
  function Kr(l) {
    switch (l) {
      case "beforetoggle":
      case "cancel":
      case "click":
      case "close":
      case "contextmenu":
      case "copy":
      case "cut":
      case "auxclick":
      case "dblclick":
      case "dragend":
      case "dragstart":
      case "drop":
      case "focusin":
      case "focusout":
      case "input":
      case "invalid":
      case "keydown":
      case "keypress":
      case "keyup":
      case "mousedown":
      case "mouseup":
      case "paste":
      case "pause":
      case "play":
      case "pointercancel":
      case "pointerdown":
      case "pointerup":
      case "ratechange":
      case "reset":
      case "resize":
      case "seeked":
      case "submit":
      case "toggle":
      case "touchcancel":
      case "touchend":
      case "touchstart":
      case "volumechange":
      case "change":
      case "selectionchange":
      case "textInput":
      case "compositionstart":
      case "compositionend":
      case "compositionupdate":
      case "beforeblur":
      case "afterblur":
      case "beforeinput":
      case "blur":
      case "fullscreenchange":
      case "focus":
      case "hashchange":
      case "popstate":
      case "select":
      case "selectstart":
        return 2;
      case "drag":
      case "dragenter":
      case "dragexit":
      case "dragleave":
      case "dragover":
      case "mousemove":
      case "mouseout":
      case "mouseover":
      case "pointermove":
      case "pointerout":
      case "pointerover":
      case "scroll":
      case "touchmove":
      case "wheel":
      case "mouseenter":
      case "mouseleave":
      case "pointerenter":
      case "pointerleave":
        return 8;
      case "message":
        switch (dd()) {
          case ni:
            return 2;
          case ci:
            return 8;
          case Su:
          case md:
            return 32;
          case fi:
            return 268435456;
          default:
            return 32;
        }
      default:
        return 32;
    }
  }
  var Wf = !1, de = null, me = null, ve = null, mu = /* @__PURE__ */ new Map(), vu = /* @__PURE__ */ new Map(), ye = [], _m = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(
    " "
  );
  function Jr(l, t) {
    switch (l) {
      case "focusin":
      case "focusout":
        de = null;
        break;
      case "dragenter":
      case "dragleave":
        me = null;
        break;
      case "mouseover":
      case "mouseout":
        ve = null;
        break;
      case "pointerover":
      case "pointerout":
        mu.delete(t.pointerId);
        break;
      case "gotpointercapture":
      case "lostpointercapture":
        vu.delete(t.pointerId);
    }
  }
  function yu(l, t, e, a, u, n) {
    return l === null || l.nativeEvent !== n ? (l = {
      blockedOn: t,
      domEventName: e,
      eventSystemFlags: a,
      nativeEvent: n,
      targetContainers: [u]
    }, t !== null && (t = Ye(t), t !== null && Lr(t)), l) : (l.eventSystemFlags |= a, t = l.targetContainers, u !== null && t.indexOf(u) === -1 && t.push(u), l);
  }
  function Dm(l, t, e, a, u) {
    switch (t) {
      case "focusin":
        return de = yu(
          de,
          l,
          t,
          e,
          a,
          u
        ), !0;
      case "dragenter":
        return me = yu(
          me,
          l,
          t,
          e,
          a,
          u
        ), !0;
      case "mouseover":
        return ve = yu(
          ve,
          l,
          t,
          e,
          a,
          u
        ), !0;
      case "pointerover":
        var n = u.pointerId;
        return mu.set(
          n,
          yu(
            mu.get(n) || null,
            l,
            t,
            e,
            a,
            u
          )
        ), !0;
      case "gotpointercapture":
        return n = u.pointerId, vu.set(
          n,
          yu(
            vu.get(n) || null,
            l,
            t,
            e,
            a,
            u
          )
        ), !0;
    }
    return !1;
  }
  function kr(l) {
    var t = Be(l.target);
    if (t !== null) {
      var e = ol(t);
      if (e !== null) {
        if (t = e.tag, t === 13) {
          if (t = L(e), t !== null) {
            l.blockedOn = t, pd(l.priority, function() {
              if (e.tag === 13) {
                var a = nt();
                a = Qn(a);
                var u = We(e, a);
                u !== null && ct(u, e, a), Lf(e, a);
              }
            });
            return;
          }
        } else if (t === 3 && e.stateNode.current.memoizedState.isDehydrated) {
          l.blockedOn = e.tag === 3 ? e.stateNode.containerInfo : null;
          return;
        }
      }
    }
    l.blockedOn = null;
  }
  function Un(l) {
    if (l.blockedOn !== null) return !1;
    for (var t = l.targetContainers; 0 < t.length; ) {
      var e = Jf(l.nativeEvent);
      if (e === null) {
        e = l.nativeEvent;
        var a = new e.constructor(
          e.type,
          e
        );
        $n = a, e.target.dispatchEvent(a), $n = null;
      } else
        return t = Ye(e), t !== null && Lr(t), l.blockedOn = e, !1;
      t.shift();
    }
    return !0;
  }
  function Wr(l, t, e) {
    Un(l) && e.delete(t);
  }
  function Um() {
    Wf = !1, de !== null && Un(de) && (de = null), me !== null && Un(me) && (me = null), ve !== null && Un(ve) && (ve = null), mu.forEach(Wr), vu.forEach(Wr);
  }
  function xn(l, t) {
    l.blockedOn === t && (l.blockedOn = null, Wf || (Wf = !0, O.unstable_scheduleCallback(
      O.unstable_NormalPriority,
      Um
    )));
  }
  var Nn = null;
  function $r(l) {
    Nn !== l && (Nn = l, O.unstable_scheduleCallback(
      O.unstable_NormalPriority,
      function() {
        Nn === l && (Nn = null);
        for (var t = 0; t < l.length; t += 3) {
          var e = l[t], a = l[t + 1], u = l[t + 2];
          if (typeof a != "function") {
            if (kf(a || e) === null)
              continue;
            break;
          }
          var n = Ye(e);
          n !== null && (l.splice(t, 3), t -= 3, Jc(
            n,
            {
              pending: !0,
              data: u,
              method: e.method,
              action: a
            },
            a,
            u
          ));
        }
      }
    ));
  }
  function hu(l) {
    function t(i) {
      return xn(i, l);
    }
    de !== null && xn(de, l), me !== null && xn(me, l), ve !== null && xn(ve, l), mu.forEach(t), vu.forEach(t);
    for (var e = 0; e < ye.length; e++) {
      var a = ye[e];
      a.blockedOn === l && (a.blockedOn = null);
    }
    for (; 0 < ye.length && (e = ye[0], e.blockedOn === null); )
      kr(e), e.blockedOn === null && ye.shift();
    if (e = (l.ownerDocument || l).$$reactFormReplay, e != null)
      for (a = 0; a < e.length; a += 3) {
        var u = e[a], n = e[a + 1], c = u[Ll] || null;
        if (typeof n == "function")
          c || $r(e);
        else if (c) {
          var f = null;
          if (n && n.hasAttribute("formAction")) {
            if (u = n, c = n[Ll] || null)
              f = c.formAction;
            else if (kf(u) !== null) continue;
          } else f = c.action;
          typeof f == "function" ? e[a + 1] = f : (e.splice(a, 3), a -= 3), $r(e);
        }
      }
  }
  function $f(l) {
    this._internalRoot = l;
  }
  Rn.prototype.render = $f.prototype.render = function(l) {
    var t = this._internalRoot;
    if (t === null) throw Error(g(409));
    var e = t.current, a = nt();
    Zr(e, a, l, t, null, null);
  }, Rn.prototype.unmount = $f.prototype.unmount = function() {
    var l = this._internalRoot;
    if (l !== null) {
      this._internalRoot = null;
      var t = l.containerInfo;
      Zr(l.current, 2, null, l, null, null), mn(), t[qe] = null;
    }
  };
  function Rn(l) {
    this._internalRoot = l;
  }
  Rn.prototype.unstable_scheduleHydration = function(l) {
    if (l) {
      var t = di();
      l = { blockedOn: null, target: l, priority: t };
      for (var e = 0; e < ye.length && t !== 0 && t < ye[e].priority; e++) ;
      ye.splice(e, 0, l), e === 0 && kr(l);
    }
  };
  var Fr = K.version;
  if (Fr !== "19.1.1")
    throw Error(
      g(
        527,
        Fr,
        "19.1.1"
      )
    );
  d.findDOMNode = function(l) {
    var t = l._reactInternals;
    if (t === void 0)
      throw typeof l.render == "function" ? Error(g(188)) : (l = Object.keys(l).join(","), Error(g(268, l)));
    return l = R(t), l = l !== null ? A(l) : null, l = l === null ? null : l.stateNode, l;
  };
  var xm = {
    bundleType: 0,
    version: "19.1.1",
    rendererPackageName: "react-dom",
    currentDispatcherRef: b,
    reconcilerVersion: "19.1.1"
  };
  if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u") {
    var wn = __REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!wn.isDisabled && wn.supportsFiber)
      try {
        Ea = wn.inject(
          xm
        ), Il = wn;
      } catch {
      }
  }
  return gu.createRoot = function(l, t) {
    if (!Sl(l)) throw Error(g(299));
    var e = !1, a = "", u = mo, n = vo, c = yo, f = null;
    return t != null && (t.unstable_strictMode === !0 && (e = !0), t.identifierPrefix !== void 0 && (a = t.identifierPrefix), t.onUncaughtError !== void 0 && (u = t.onUncaughtError), t.onCaughtError !== void 0 && (n = t.onCaughtError), t.onRecoverableError !== void 0 && (c = t.onRecoverableError), t.unstable_transitionCallbacks !== void 0 && (f = t.unstable_transitionCallbacks)), t = Cr(
      l,
      1,
      !1,
      null,
      null,
      e,
      a,
      u,
      n,
      c,
      f,
      null
    ), l[qe] = t.current, Rf(l), new $f(t);
  }, gu.hydrateRoot = function(l, t, e) {
    if (!Sl(l)) throw Error(g(299));
    var a = !1, u = "", n = mo, c = vo, f = yo, i = null, v = null;
    return e != null && (e.unstable_strictMode === !0 && (a = !0), e.identifierPrefix !== void 0 && (u = e.identifierPrefix), e.onUncaughtError !== void 0 && (n = e.onUncaughtError), e.onCaughtError !== void 0 && (c = e.onCaughtError), e.onRecoverableError !== void 0 && (f = e.onRecoverableError), e.unstable_transitionCallbacks !== void 0 && (i = e.unstable_transitionCallbacks), e.formState !== void 0 && (v = e.formState)), t = Cr(
      l,
      1,
      !0,
      t,
      e ?? null,
      a,
      u,
      n,
      c,
      f,
      i,
      v
    ), t.context = jr(null), e = t.current, a = nt(), a = Qn(a), u = It(a), u.callback = null, Pt(e, u, a), e = a, t.current.lanes = e, Ta(t, e), Dt(t), l[qe] = t.current, Rf(l), new Rn(t);
  }, gu.version = "19.1.1", gu;
}
var nd;
function Xm() {
  if (nd) return If.exports;
  nd = 1;
  function O() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(O);
      } catch (K) {
        console.error(K);
      }
  }
  return O(), If.exports = Gm(), If.exports;
}
var Qm = Xm();
const Cm = ".cw-m-0{margin:0}.cw-my-2{margin-top:.5rem;margin-bottom:.5rem}.cw-my-5{margin-top:1.25rem;margin-bottom:1.25rem}.cw-mb-2{margin-bottom:.5rem}.cw-mb-4{margin-bottom:1rem}.cw-mb-6{margin-bottom:1.5rem}.cw-mt-1{margin-top:.25rem}.cw-mt-2{margin-top:.5rem}.cw-mt-3{margin-top:.75rem}.cw-mt-6{margin-top:1.5rem}.cw-mt-7{margin-top:1.75rem}.cw-block{display:block}.cw-flex{display:flex}.cw-grid{display:grid}.cw-w-full{width:100%}.cw-min-w-0{min-width:0px}.cw-max-w-2xl{max-width:42rem}.cw-flex-1{flex:1 1 0%}.cw-grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}.cw-flex-wrap{flex-wrap:wrap}.cw-items-start{align-items:flex-start}.cw-items-center{align-items:center}.cw-justify-between{justify-content:space-between}.cw-gap-2{gap:.5rem}.cw-gap-3{gap:.75rem}.cw-gap-5{gap:1.25rem}.cw-self-start{align-self:flex-start}.cw-overflow-hidden{overflow:hidden}.cw-overflow-x-auto{overflow-x:auto}.cw-break-all{word-break:break-all}.cw-rounded-2xl{border-radius:1rem}.cw-rounded-lg{border-radius:.5rem}.cw-rounded-xl{border-radius:.75rem}.cw-border{border-width:1px}.cw-border-0{border-width:0px}.cw-border-t{border-top-width:1px}.cw-border-solid{border-style:solid}.cw-border-line{--tw-border-opacity:1;border-color:rgb(41 55 70 / var(--tw-border-opacity, 1))}.cw-bg-\\[\\#0b1119\\]{--tw-bg-opacity:1;background-color:rgb(11 17 25 / var(--tw-bg-opacity, 1))}.cw-bg-panel{--tw-bg-opacity:1;background-color:rgb(17 25 35 / var(--tw-bg-opacity, 1))}.cw-bg-transparent{background-color:transparent}.cw-p-0{padding:0}.cw-p-10{padding:2.5rem}.cw-p-2{padding:.5rem}.cw-p-4{padding:1rem}.cw-p-5{padding:1.25rem}.cw-px-3{padding-left:.75rem;padding-right:.75rem}.cw-py-2{padding-top:.5rem;padding-bottom:.5rem}.cw-py-3{padding-top:.75rem;padding-bottom:.75rem}.cw-pt-4{padding-top:1rem}.cw-text-left{text-align:left}.cw-text-center{text-align:center}.cw-text-right{text-align:right}.cw-font-sans{font-family:Inter,ui-sans-serif,system-ui,sans-serif}.cw-text-2xl{font-size:1.5rem;line-height:2rem}.cw-text-3xl{font-size:1.875rem;line-height:2.25rem}.cw-text-base{font-size:1rem;line-height:1.5rem}.cw-text-sm{font-size:.875rem;line-height:1.25rem}.cw-text-xs{font-size:.75rem;line-height:1rem}.cw-font-semibold{font-weight:600}.cw-leading-relaxed{line-height:1.625}.cw-tracking-tight{letter-spacing:-.025em}.cw-tracking-widest{letter-spacing:.1em}.cw-text-\\[\\#ffb5a9\\]{--tw-text-opacity:1;color:rgb(255 181 169 / var(--tw-text-opacity, 1))}.cw-text-ink{--tw-text-opacity:1;color:rgb(230 237 245 / var(--tw-text-opacity, 1))}.cw-text-mint{--tw-text-opacity:1;color:rgb(117 229 192 / var(--tw-text-opacity, 1))}.cw-text-muted{--tw-text-opacity:1;color:rgb(167 180 199 / var(--tw-text-opacity, 1))}:host{display:block;color:#e6edf5;font-family:Inter,ui-sans-serif,system-ui,sans-serif}*{box-sizing:border-box}button,input,select{font:inherit}button{cursor:pointer}button:disabled{cursor:not-allowed;opacity:.55}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid #75e5c0;outline-offset:3px}input[type=range]{accent-color:#75e5c0;width:100%;min-height:36px}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #293746;padding:14px 12px;white-space:nowrap;text-align:right}th:first-child,td:first-child{text-align:left}th button{background:none;border:0;color:inherit;padding:0}th{font-weight:500;font-size:12px}td{font-size:13px}dialog{position:fixed;top:0;right:0;bottom:0;left:0;width:min(720px,calc(100vw - 24px));max-height:85vh;overflow:auto;background:#111923;color:#e6edf5;border:1px solid #41546c;border-radius:16px;padding:24px}dialog::backdrop{background:#000a}.score-bar{height:5px;background:#263645;border-radius:4px;overflow:hidden}.score-bar>span{display:block;height:100%;background:#75e5c0}.metric-track{height:7px;display:flex;overflow:hidden;border-radius:4px;background:#263645}.cw-badge{font-size:11px;padding:4px 8px;border:1px solid #41546c;border-radius:5px}@media(max-width:600px){th,td{padding:12px 10px}.mobile-stack{display:grid;grid-template-columns:1fr}}.hover\\:cw-bg-\\[\\#172434\\]:hover{--tw-bg-opacity:1;background-color:rgb(23 36 52 / var(--tw-bg-opacity, 1))}@media(min-width:768px){.md\\:cw-p-7{padding:1.75rem}}@media(min-width:1024px){.lg\\:cw-grid-cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}.lg\\:cw-grid-cols-\\[280px_minmax\\(0\\,1fr\\)\\]{grid-template-columns:280px minmax(0,1fr)}}", cd = { largeBuyShare: 35, impactPerSol: 30, concentration: 35 }, Hn = [
  { key: "largeBuyShare", label: "Large-trade buy share", short: "Large buys", color: "#75e5c0", description: "Share of observed five-minute buy volume from trades meeting the USD threshold. Higher gets more research points; this is not validated as predictive." },
  { key: "impactPerSol", label: "Price impact per SOL", short: "Depth", color: "#78aaff", description: "Modeled price change from a 1 SOL buy: 100 × ((1 + 1 / virtual SOL reserve)² − 1). Constant-product curve approximation, not an observed fill. Lower gets more points, reaching zero at 10%." },
  { key: "concentration", label: "Wallet concentration", short: "Distribution", color: "#c6a5ff", description: "Top-ten share of the observed positive wallet balances, not total token supply. Trade-tape balances omit transfers and can be incomplete. Lower gets more research points." }
];
function jm(O, K) {
  const C = Object.values(K).reduce((L, Tl) => L + Math.max(0, Number(Tl) || 0), 0);
  if (!O.scoreReady || !C) return { ...O, researchScore: null, components: [] };
  const g = (L) => Math.max(0, Math.min(100, L)), Sl = { largeBuyShare: g(O.largeBuyShare), impactPerSol: g(100 - O.impactPerSol * 10), concentration: g(100 - O.concentration) }, ol = Hn.map((L) => ({ ...L, raw: Sl[L.key], weight: Math.max(0, Number(K[L.key]) || 0) / C, contribution: Sl[L.key] * Math.max(0, Number(K[L.key]) || 0) / C }));
  return { ...O, researchScore: ol.reduce((L, Tl) => L + Tl.contribution, 0), components: ol };
}
function Zm(O, K, C = "desc") {
  return [...O].sort((g, Sl) => {
    const ol = g[K], L = Sl[K];
    return ol == null && L == null ? 0 : ol == null ? 1 : L == null ? -1 : (typeof ol == "string" ? ol.localeCompare(L) : ol - L) * (C === "desc" ? -1 : 1);
  });
}
const Vm = (window.CURVEWATCH_API || "").replace(/\/$/, ""), ft = (O, K = 1) => O == null ? "Unavailable" : Number(O).toLocaleString("en-US", { maximumFractionDigits: K, minimumFractionDigits: K }), fd = (O) => O == null ? "Unavailable" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(O), id = (O) => {
  const K = O.filter(Number.isFinite).sort((C, g) => C - g);
  return K.length ? K[Math.floor(K.length / 2)] : null;
}, ei = "cw-bg-panel cw-border cw-border-solid cw-border-line cw-rounded-xl", ai = "cw-bg-transparent cw-text-ink cw-border cw-border-solid cw-border-line cw-rounded-lg cw-px-3 cw-py-2 cw-text-sm";
function Lm() {
  var zl, b;
  const [O, K] = Gl.useState(null), [C, g] = Gl.useState(""), [Sl, ol] = Gl.useState(!1), [L, Tl] = Gl.useState({ ...cd }), [R, A] = Gl.useState(250), [x, ul] = Gl.useState(""), [W, Nl] = Gl.useState("all"), [rl, $l] = Gl.useState({ key: "researchScore", dir: "desc" }), [Rl, Tt] = Gl.useState(null), [it, Al] = Gl.useState(null), jl = Gl.useRef(null), j = Gl.useRef(0), wl = Gl.useRef(null);
  async function Hl() {
    var J;
    const d = ++j.current;
    (J = wl.current) == null || J.abort();
    const M = new AbortController();
    wl.current = M, ol(!0);
    try {
      const s = await fetch(`${Vm}/api/scoring?largeUsd=${R}`, { signal: M.signal });
      if (!s.ok) throw new Error(`HTTP ${s.status}`);
      const T = await s.json();
      d === j.current && (K(T), g(""));
    } catch (s) {
      s.name !== "AbortError" && d === j.current && g(s.message);
    } finally {
      d === j.current && ol(!1);
    }
  }
  Gl.useEffect(() => {
    Hl();
    const d = setInterval(() => {
      !document.hidden && !document.querySelector("#tab-scoring").hidden && Hl();
    }, 15e3);
    return () => {
      var M;
      clearInterval(d), (M = wl.current) == null || M.abort();
    };
  }, [R]);
  const yl = Gl.useMemo(() => ((O == null ? void 0 : O.rows) || []).map((d) => jm(d, L)), [O, L]), Vl = Gl.useMemo(() => Zm(yl.filter((d) => (W === "all" || (W === "ready" ? d.scoreReady : !!d.reject)) && `${d.symbol} ${d.name} ${d.mint}`.toLowerCase().includes(x.toLowerCase())), rl.key, rl.dir), [yl, x, W, rl]), fl = yl.find((d) => d.mint === Rl), st = Object.values(L).reduce((d, M) => d + M, 0), hl = (d = null, M = null) => {
    Tt(d), Al(M), jl.current.open || jl.current.showModal();
  }, Ut = (d) => $l((M) => ({ key: d, dir: M.key === d && M.dir === "desc" ? "asc" : "desc" })), xt = [["symbol", "Coin"], ["researchScore", "Research score"], ["largeBuyShare", "Large-buy share"], ["impactPerSol", "Impact / 1 SOL"], ["concentration", "Top-10 share"], ["buyVolumeUsd", "Buy volume"], ["marketCapUsd", "Market cap"], ["liveScore", "Live score"]];
  return /* @__PURE__ */ z.createElement("div", { className: "cw-bg-[#0b1119] cw-text-ink cw-rounded-2xl cw-p-4 md:cw-p-7 cw-font-sans" }, /* @__PURE__ */ z.createElement("header", { className: "cw-flex cw-flex-wrap cw-items-start cw-justify-between cw-gap-5" }, /* @__PURE__ */ z.createElement("div", null, /* @__PURE__ */ z.createElement("div", { className: "cw-text-xs cw-tracking-widest cw-text-mint cw-mb-2" }, "CURVEWATCH / SIGNAL WORKBENCH"), /* @__PURE__ */ z.createElement("h1", { className: "cw-m-0 cw-text-3xl cw-font-semibold cw-tracking-tight" }, "See what the score is made of."), /* @__PURE__ */ z.createElement("p", { className: "cw-text-muted cw-text-sm cw-max-w-2xl cw-leading-relaxed" }, "Live coin measurements, transparent contributions, and a weighting sandbox. Research scores never override safety rejects or change live paper entries.")), /* @__PURE__ */ z.createElement("div", { className: "cw-flex cw-gap-2 cw-items-center" }, /* @__PURE__ */ z.createElement("span", { className: "cw-badge cw-text-mint" }, "READ ONLY"), /* @__PURE__ */ z.createElement("button", { className: ai, onClick: Hl, disabled: Sl }, Sl ? "Updating…" : "Refresh"))), C && /* @__PURE__ */ z.createElement("div", { role: "alert", className: "cw-text-[#ffb5a9] cw-py-3" }, "Feed unavailable: ", C, ". ", O ? "Last successful snapshot remains visible." : "No sample coins have been invented."), /* @__PURE__ */ z.createElement("div", { className: "cw-text-xs cw-text-muted cw-mb-4" }, O ? `Snapshot ${new Date(O.asOf).toLocaleTimeString()} · five-minute window · up to 200 active curve tokens` : "Waiting for live measurements…"), /* @__PURE__ */ z.createElement("div", { className: "cw-grid cw-grid-cols-2 lg:cw-grid-cols-4 cw-gap-3 cw-mb-6" }, [["Observed coins", yl.length, "coverage"], ["Score-ready", yl.filter((d) => d.scoreReady).length, "coverage"], ["Median large-buy share", ft(id(yl.map((d) => d.largeBuyShare))) + "%", "largeBuyShare"], ["Median top-10 share", ft(id(yl.map((d) => d.concentration))) + "%", "concentration"]].map(([d, M, J], s) => /* @__PURE__ */ z.createElement("button", { key: s, className: `${ei} cw-text-left cw-p-4 cw-text-ink`, onClick: () => hl(null, J) }, /* @__PURE__ */ z.createElement("span", { className: "cw-text-xs cw-text-muted" }, d), /* @__PURE__ */ z.createElement("strong", { className: "cw-block cw-text-2xl cw-mt-3" }, M), /* @__PURE__ */ z.createElement("small", { className: "cw-block cw-mt-2 cw-text-muted" }, "Inspect definition and coverage")))), /* @__PURE__ */ z.createElement("div", { className: "cw-grid lg:cw-grid-cols-[280px_minmax(0,1fr)] cw-gap-5" }, /* @__PURE__ */ z.createElement("aside", { className: `${ei} cw-p-5 cw-self-start` }, /* @__PURE__ */ z.createElement("div", { className: "cw-flex cw-items-center cw-justify-between" }, /* @__PURE__ */ z.createElement("h2", { className: "cw-text-base cw-m-0" }, "Weighting lab"), /* @__PURE__ */ z.createElement("button", { onClick: () => Tl({ ...cd }), className: "cw-border-0 cw-bg-transparent cw-text-mint cw-text-xs cw-py-2" }, "Reset")), /* @__PURE__ */ z.createElement("p", { className: "cw-text-xs cw-text-muted cw-leading-relaxed" }, "Weights normalize to 100%. All-zero weights disable scoring. No weights are saved to the engine."), Hn.map((d) => /* @__PURE__ */ z.createElement("label", { key: d.key, className: "cw-block cw-mt-6" }, /* @__PURE__ */ z.createElement("span", { className: "cw-flex cw-justify-between cw-text-sm" }, /* @__PURE__ */ z.createElement("span", null, d.short), /* @__PURE__ */ z.createElement("b", { style: { color: d.color } }, st ? Math.round(L[d.key] / st * 100) : 0, "%")), /* @__PURE__ */ z.createElement("input", { type: "range", min: "0", max: "100", value: L[d.key], "aria-label": `${d.label} weight`, onChange: (M) => Tl((J) => ({ ...J, [d.key]: Number(M.target.value) })) }), /* @__PURE__ */ z.createElement("button", { type: "button", onClick: () => hl(null, d.key), className: "cw-bg-transparent cw-border-0 cw-text-muted cw-text-xs cw-p-0 cw-text-left" }, d.label, ": ", d.key === "largeBuyShare" ? "higher" : "lower", " = more points"))), /* @__PURE__ */ z.createElement("label", { className: "cw-block cw-mt-7 cw-text-sm" }, "Large-buy threshold", /* @__PURE__ */ z.createElement("select", { "aria-label": "Large buy threshold in USD", value: R, onChange: (d) => A(Number(d.target.value)), className: "cw-block cw-w-full cw-mt-2 cw-bg-[#0b1119] cw-text-ink cw-rounded-lg cw-border cw-border-solid cw-border-line cw-p-2" }, [100, 250, 500, 1e3, 2500].map((d) => /* @__PURE__ */ z.createElement("option", { value: d, key: d }, "$", d.toLocaleString())))), /* @__PURE__ */ z.createElement("div", { className: "cw-mt-6 cw-border-t cw-border-solid cw-border-line cw-pt-4 cw-text-xs cw-text-muted cw-leading-relaxed" }, "Higher large-buy share is not inherently safer. Impact is modeled. Wallet balances come from the observed trade tape, not a holder census.")), /* @__PURE__ */ z.createElement("section", { className: `${ei} cw-min-w-0 cw-overflow-hidden` }, /* @__PURE__ */ z.createElement("div", { className: "cw-flex cw-flex-wrap cw-gap-3 cw-p-4 cw-items-center cw-justify-between" }, /* @__PURE__ */ z.createElement("input", { "aria-label": "Search coins", value: x, onChange: (d) => ul(d.target.value), placeholder: "Search name, ticker or mint", className: "cw-bg-[#0b1119] cw-border cw-border-solid cw-border-line cw-rounded-lg cw-text-ink cw-px-3 cw-py-2 cw-text-sm cw-min-w-0 cw-flex-1" }), /* @__PURE__ */ z.createElement("select", { "aria-label": "Coin eligibility filter", className: `${ai} cw-bg-panel`, value: W, onChange: (d) => Nl(d.target.value) }, /* @__PURE__ */ z.createElement("option", { value: "all" }, "All observed"), /* @__PURE__ */ z.createElement("option", { value: "ready" }, "Score-ready"), /* @__PURE__ */ z.createElement("option", { value: "rejected" }, "Rejected"))), /* @__PURE__ */ z.createElement("div", { className: "cw-overflow-x-auto" }, /* @__PURE__ */ z.createElement("table", null, /* @__PURE__ */ z.createElement("thead", { className: "cw-text-muted" }, /* @__PURE__ */ z.createElement("tr", null, xt.map(([d, M]) => /* @__PURE__ */ z.createElement("th", { key: d, "aria-sort": rl.key === d ? rl.dir === "asc" ? "ascending" : "descending" : "none" }, /* @__PURE__ */ z.createElement("button", { onClick: () => Ut(d) }, M, rl.key === d ? rl.dir === "asc" ? " ↑" : " ↓" : ""))))), /* @__PURE__ */ z.createElement("tbody", null, Vl.map((d) => /* @__PURE__ */ z.createElement("tr", { key: d.mint, className: "hover:cw-bg-[#172434]" }, /* @__PURE__ */ z.createElement("td", null, /* @__PURE__ */ z.createElement("button", { className: "cw-bg-transparent cw-border-0 cw-text-ink cw-text-left cw-p-0", onClick: () => hl(d.mint) }, /* @__PURE__ */ z.createElement("b", null, d.symbol), /* @__PURE__ */ z.createElement("span", { className: "cw-block cw-text-muted cw-text-xs cw-mt-1" }, d.reject ? "Safety reject" : d.scoreReady ? "Score-ready" : "Limited coverage", " · ", d.trades, " trades"))), /* @__PURE__ */ z.createElement("td", null, /* @__PURE__ */ z.createElement("button", { className: "cw-border-0 cw-bg-transparent cw-text-ink cw-p-0 cw-w-full", onClick: () => hl(d.mint) }, d.researchScore == null ? "Not scored" : ft(d.researchScore), /* @__PURE__ */ z.createElement("div", { className: "metric-track cw-mt-2" }, d.components.map((M) => /* @__PURE__ */ z.createElement("span", { key: M.key, style: { width: M.contribution + "%", background: M.color } }))))), /* @__PURE__ */ z.createElement("td", null, d.largeBuyShare == null ? "Unavailable" : ft(d.largeBuyShare) + "%"), /* @__PURE__ */ z.createElement("td", null, d.impactPerSol == null ? "Unavailable" : ft(d.impactPerSol, 2) + "%"), /* @__PURE__ */ z.createElement("td", null, d.concentration == null ? "Unavailable" : ft(d.concentration) + "%"), /* @__PURE__ */ z.createElement("td", null, fd(d.buyVolumeUsd)), /* @__PURE__ */ z.createElement("td", null, fd(d.marketCapUsd)), /* @__PURE__ */ z.createElement("td", null, d.liveScore == null ? "Unavailable" : ft(d.liveScore, 0))))))), !Vl.length && /* @__PURE__ */ z.createElement("div", { className: "cw-p-10 cw-text-center cw-text-muted" }, Sl ? "Loading current coins…" : x || W !== "all" ? "No coins match these filters." : "No active curve coins are available. The collector must supply observations."), /* @__PURE__ */ z.createElement("div", { className: "cw-p-4 cw-text-xs cw-text-muted" }, Vl.length, " shown · Missing metrics are not treated as zero · Scores require ≥20 recent trades and a trade within 60 seconds."))), /* @__PURE__ */ z.createElement("dialog", { ref: jl, onClose: () => {
    Tt(null), Al(null);
  } }, /* @__PURE__ */ z.createElement("form", { method: "dialog", className: "cw-text-right" }, /* @__PURE__ */ z.createElement("button", { className: ai }, "Close")), fl ? /* @__PURE__ */ z.createElement(z.Fragment, null, /* @__PURE__ */ z.createElement("h2", { className: "cw-text-2xl" }, fl.symbol, " / score breakdown"), /* @__PURE__ */ z.createElement("p", { className: "cw-text-xs cw-text-muted cw-break-all" }, fl.mint), /* @__PURE__ */ z.createElement("p", null, "Research: ", fl.researchScore == null ? "Not scored" : ft(fl.researchScore), " · Live engine: ", ft(fl.liveScore), " · ", fl.reject ? "Rejected: " + fl.reject : "No current rejection shown"), fl.components.map((d) => /* @__PURE__ */ z.createElement("div", { key: d.key, className: "cw-my-5" }, /* @__PURE__ */ z.createElement("div", { className: "cw-flex cw-justify-between cw-text-sm" }, /* @__PURE__ */ z.createElement("span", null, d.label), /* @__PURE__ */ z.createElement("b", null, ft(d.contribution), " points")), /* @__PURE__ */ z.createElement("div", { className: "score-bar cw-my-2" }, /* @__PURE__ */ z.createElement("span", { style: { width: d.raw + "%", background: d.color } })), /* @__PURE__ */ z.createElement("div", { className: "cw-text-xs cw-text-muted" }, ft(d.raw), " normalized × ", ft(d.weight * 100), "% weight"))), /* @__PURE__ */ z.createElement("h3", { className: "cw-text-base" }, "Coverage"), /* @__PURE__ */ z.createElement("ul", { className: "cw-text-sm cw-text-muted cw-leading-relaxed" }, (fl.reasons.length ? fl.reasons : ["Current observations meet the display-score coverage requirements."]).map((d) => /* @__PURE__ */ z.createElement("li", { key: d }, d)), /* @__PURE__ */ z.createElement("li", null, fl.observedHolders, " positive observed wallets; ", fl.buys, " buys, ", fl.largeBuys, " large buys."), /* @__PURE__ */ z.createElement("li", null, fl.evidence.concentrationScope), /* @__PURE__ */ z.createElement("li", null, "Quote conversion: $", ft(fl.evidence.solUsd, 2), " per SOL. Impact is a percentage per modeled 1 SOL trade, not a dollar balance.")), /* @__PURE__ */ z.createElement("a", { className: "cw-text-mint cw-text-sm", href: `https://pump.fun/coin/${encodeURIComponent(fl.mint)}`, target: "_blank", rel: "noopener noreferrer" }, "Open coin on pump.fun")) : Rl ? /* @__PURE__ */ z.createElement("p", null, "The coin left the live observation window. Close and select a current row.") : /* @__PURE__ */ z.createElement(z.Fragment, null, /* @__PURE__ */ z.createElement("h2", null, ((zl = Hn.find((d) => d.key === it)) == null ? void 0 : zl.label) || "Observation coverage"), /* @__PURE__ */ z.createElement("p", { className: "cw-text-muted cw-text-sm cw-leading-relaxed" }, ((b = Hn.find((d) => d.key === it)) == null ? void 0 : b.description) || "Only active curve coins with intact trade detail are measured. Unsupported quotes, stale tapes, missing USD conversion, fewer than 20 trades, or exhausted tape storage prevent scoring. Rejects remain rejects even if their exploratory score is high."))));
}
const sd = document.querySelector("#scoringRoot");
if (sd) {
  const O = sd.attachShadow({ mode: "open" }), K = document.createElement("style");
  K.textContent = Cm, O.append(K);
  const C = document.createElement("div");
  O.append(C), Qm.createRoot(C).render(/* @__PURE__ */ z.createElement(Lm, null));
}
