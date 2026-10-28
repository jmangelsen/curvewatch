(() => {
  const MINT_RE = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;
  const LINK_RE = /(?:pump\.fun\/(?:coin\/)?|dexscreener\.com\/solana\/|solscan\.io\/token\/)([1-9A-HJ-NP-Za-km-z]{32,44})/;
  const panel = document.getElementById("panel");
  const form = document.getElementById("lookup-form");
  const input = document.getElementById("mint");
  const status = document.getElementById("lookup-status");
  const modeLine = document.getElementById("mode-line");
  const submitBtn = document.getElementById("lookup-submit");
  const exampleBtn = document.getElementById("show-example");
  let abort = null;
  let booted = false;

  const KIND = {
    "same-slot": "Same-slot buys",
    "time-window": "1.5 second window",
    "shared-funder": "Shared funders",
    "coordinated-timing": "Coordinated timing"
  };
  const SIGNAL_TITLE = {
    sameSlot: "Same-slot buys",
    sharedFunders: "Shared funders",
    coordinatedTiming: "Coordinated timing"
  };
  const STATUS_LABEL = {
    measured: "Measured",
    "not-collected": "Not collected",
    "measured-as-slot-window": "Slot window",
    unavailable: "Unavailable",
    illustrative: "Example",
    unvalidated: "Unvalidated",
    released: "Detail released"
  };

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (value == null || value === false) continue;
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = String(value);
        else node.setAttribute(key, value === true ? "" : String(value));
      }
    }
    for (const child of children || []) {
      if (child == null || child === false) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function str(value) {
    if (typeof value === "string") return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return "";
  }

  function num(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
    return null;
  }

  function arr(value) {
    return Array.isArray(value) ? value : [];
  }

  function pct(value) {
    const n = num(value);
    if (n == null) return "—";
    return `${n.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
  }

  function sol(value) {
    const n = num(value);
    if (n == null) return "—";
    return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} SOL`;
  }

  function usd(value) {
    const n = num(value);
    if (n == null) return "—";
    return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  }

  function tokens(value) {
    const n = num(value);
    if (n == null) return "—";
    return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }

  function age(value) {
    const n = num(value);
    if (n == null) return "—";
    const s = Math.max(0, Math.round(n));
    if (s < 90) return `${s} seconds`;
    const minutes = Math.floor(s / 60);
    const rem = s % 60;
    return rem ? `${minutes} min ${rem} s` : `${minutes} min`;
  }

  function when(value) {
    const text = str(value);
    if (!text) return "—";
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return text.slice(0, 80);
    return date.toISOString().replace(".000", "").replace("T", " ").replace("Z", " UTC");
  }

  function slotLabel(offset) {
    const n = num(offset);
    if (n == null) return "—";
    if (n === 0) return "Create slot";
    if (n === 1) return "Next slot";
    return `Slot +${n}`;
  }

  function offsetLabel(ms) {
    const n = num(ms);
    if (n == null) return "—";
    if (n < 1000) return `${Math.round(n)} ms after create`;
    return `${(n / 1000).toLocaleString("en-US", { maximumFractionDigits: 2 })} s after create`;
  }

  function statusLabel(value) {
    const key = str(value);
    return STATUS_LABEL[key] || (key ? key.slice(0, 40) : "—");
  }

  function clip(value, max) {
    const text = str(value).trim();
    if (text.length <= max) return text;
    return `${text.slice(0, max)}…`;
  }

  function say(message, kind) {
    status.textContent = message || "";
    status.className = kind ? `lookup-status is-${kind}` : "lookup-status";
  }

  function apiPrefix() {
    const raw = str(window.CURVEWATCH_RISK_API).trim();
    if (!raw) return { prefix: "", problem: "" };
    let url;
    try {
      url = new URL(raw);
    } catch {
      return { prefix: "", problem: "The API setting is not a URL. Demo mode stays on." };
    }
    if (url.username || url.password || url.search || url.hash) {
      return { prefix: "", problem: "The API setting included credentials or a query. It was ignored. Demo mode stays on." };
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return { prefix: "", problem: "The API setting must be http or https. Demo mode stays on." };
    }
    const path = url.pathname.replace(/\/$/, "");
    const prefix = path && path !== "/" ? url.origin + path : url.origin;
    return { prefix, problem: "" };
  }

  function extractMint(raw) {
    const text = str(raw).trim();
    if (!text) return "";
    const linked = text.match(LINK_RE);
    if (linked) return linked[1];
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text)) return text;
    const found = text.match(MINT_RE) || [];
    return found.find((item) => item.endsWith("pump")) || found.find((item) => item.length >= 43) || "";
  }

  function isDemo(data) {
    return data.mode === "demo" || data.illustrative === true;
  }

  function ruleSentence(bundle, rules, demo) {
    const lead = demo ? "On these invented figures, " : "On this response, ";
    const gate = num(rules.bundleBuyVolumePct);
    const wallets = num(rules.minBundleWallets);
    const partial = num(rules.partialBundleBuyVolumePct);
    if (gate == null || wallets == null) {
      return `${lead}the response did not include the reject thresholds it applied. A missing threshold is not a clearance.`;
    }
    const hard = bundle.hardReject === true;
    const part = bundle.partialFlag === true;
    const gateText = `${gate}% of buy volume and at least ${wallets} wallets`;
    if (hard && part) {
      const partialText = partial == null ? "The partial-bundle flag would also be on." : `The partial-bundle flag would also be on, at or above ${partial}% of buy volume.`;
      return `${lead}the published bundled-launch rule would reject (${gateText}). ${partialText} The rule is a scorer filter. It does not time a later sell.`;
    }
    if (hard) {
      return `${lead}the published bundled-launch rule would reject (${gateText}). The rule is a scorer filter. It does not time a later sell.`;
    }
    if (part) {
      return `${lead}the hard reject would not fire. The partial-bundle flag would (${partial == null ? "share of buy volume" : `at least ${partial}%`}). Staying under the reject line is not a clearance.`;
    }
    return `${lead}neither the hard reject (${gateText}) nor the partial-bundle flag would fire. Staying under those lines is not a clearance.`;
  }

  function renderSignals(data) {
    const signals = data.signals && typeof data.signals === "object" ? data.signals : {};
    const keys = ["sameSlot", "sharedFunders", "coordinatedTiming"].filter((key) => signals[key] && typeof signals[key] === "object");
    if (!keys.length) return null;
    return el("ul", { class: "signals" }, keys.map((key) => {
      const item = signals[key];
      const state = str(item.status) || "unavailable";
      return el("li", { class: `signal is-${state}` }, [
        el("p", { class: "signal-k" }, [SIGNAL_TITLE[key] || key]),
        el("p", { class: "signal-s" }, [statusLabel(state)]),
        el("p", { class: "signal-d" }, [clip(item.summary, 280) || "—"])
      ]);
    }));
  }

  function renderWallet(wallet, reserved) {
    const address = clip(wallet.address, 120) || "—";
    const rows = [
      ["Bought in window", sol(wallet.solBought)],
      ["Tokens bought", tokens(wallet.tokensBought)],
      ["Still credited", tokens(wallet.stillHeldTokens)],
      ["Supply share", pct(wallet.supplyHeldPct)],
      ["First buy", offsetLabel(wallet.firstBuyOffsetMs)],
      ["Slot", slotLabel(wallet.slotOffset)]
    ];
    const funder = str(wallet.funder);
    if (funder || reserved) rows.push(["Funder", funder ? clip(funder, 120) : "—"]);
    const copy = str(wallet.address).trim();
    return el("li", { class: reserved ? "wallet is-reserved" : "wallet" }, [
      el("div", { class: "wallet-top" }, [
        el("code", { class: "addr", text: address }),
        copy ? el("button", { type: "button", class: "copy", "data-copy": copy }, ["Copy"]) : null
      ]),
      el("dl", { class: "wallet-dl" }, rows.map(([term, value]) => (
        el("div", {}, [el("dt", { text: term }), el("dd", { text: value })])
      )))
    ]);
  }

  function renderCluster(cluster) {
    const measured = cluster.measured === true;
    const kind = str(cluster.kind);
    const wallets = arr(cluster.wallets).slice(0, 40);
    const hidden = arr(cluster.wallets).length - wallets.length;
    const title = clip(cluster.label, 80) || KIND[kind] || "Cluster";
    return el("article", { class: measured ? "cluster" : "cluster is-reserved" }, [
      el("header", { class: "cluster-h" }, [
        el("h3", { text: title }),
        el("p", { class: "badge" }, [measured ? "Included in totals" : "Not a detection"])
      ]),
      el("p", { class: "cluster-meta" }, [
        `${KIND[kind] || clip(kind, 40) || "Cluster"} · ${num(cluster.walletCount) == null ? "—" : `${num(cluster.walletCount)} wallets`} · ${sol(cluster.solBought)} · supply ${pct(cluster.supplyHeldPct)}`
      ]),
      str(cluster.note) ? el("p", { class: "note" }, [clip(cluster.note, 400)]) : null,
      wallets.length
        ? el("ul", { class: "wallets" }, wallets.map((wallet) => renderWallet(wallet && typeof wallet === "object" ? wallet : {}, !measured)))
        : el("p", { class: "note" }, ["No wallets in this cluster."]),
      hidden > 0 ? el("p", { class: "note" }, [`${hidden} more wallets were omitted in the browser.`]) : null
    ]);
  }

  function renderZone(zone, demo) {
    const z = zone && typeof zone === "object" ? zone : {};
    const statusName = str(z.status) || "unavailable";
    const lowUsd = num(z.mcapUsd && z.mcapUsd.low);
    const highUsd = num(z.mcapUsd && z.mcapUsd.high);
    const lowSol = num(z.mcapSol && z.mcapSol.low);
    const highSol = num(z.mcapSol && z.mcapSol.high);
    const hasUsd = lowUsd != null && highUsd != null;
    const hasSol = lowSol != null && highSol != null;
    const confidence = num(z.confidence);
    const bits = [
      el("div", { class: "zone-h" }, [
        el("h3", { text: "Rug zone" }),
        el("p", { class: "badge" }, [demo ? "Example band" : statusLabel(statusName)])
      ]),
      el("p", { class: "zone-def" }, [
        "A market-cap band where supply still credited to bundle wallets might be sold. Empty means the collector has no estimate."
      ])
    ];
    if (hasUsd || hasSol) {
      const range = el("p", { class: "zone-range" });
      range.append(
        el("span", { text: hasUsd ? usd(lowUsd) : sol(lowSol) }),
        el("span", { class: "zone-line", "aria-hidden": "true" }),
        el("span", { text: hasUsd ? usd(highUsd) : sol(highSol) })
      );
      bits.push(range);
      bits.push(el("p", { class: "zone-unit" }, [
        hasUsd ? "Market cap, US dollars" : "Market cap, SOL"
      ]));
      if (hasUsd && hasSol) {
        bits.push(el("p", { class: "note" }, [`Same band in SOL: ${sol(lowSol)} – ${sol(highSol)}.`]));
      }
    } else {
      bits.push(el("p", { class: "zone-empty" }, ["No market-cap band."]));
    }
    bits.push(el("p", { class: "confidence" }, [
      confidence == null ? "Confidence: unvalidated" : `Confidence score: ${confidence.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
    ]));
    const note = clip(z.confidenceNote, 400) || "Unvalidated until a dump-zone model is backtested and then tracked on later launches.";
    bits.push(el("p", { class: "note" }, [note]));
    const assumptions = arr(z.assumptions).slice(0, 8).map((item) => str(item)).filter(Boolean);
    if (assumptions.length) {
      bits.push(el("ul", { class: "assume" }, assumptions.map((item) => el("li", { text: clip(item, 240) }))));
    }
    return el("section", { class: "zone", "aria-label": "Rug zone" }, bits);
  }

  function renderPanel(data, options) {
    const opts = options || {};
    const demo = isDemo(data);
    const token = data.token && typeof data.token === "object" ? data.token : {};
    const coverage = data.coverage && typeof data.coverage === "object" ? data.coverage : {};
    const bundle = data.bundle && typeof data.bundle === "object" ? data.bundle : {};
    const rules = data.rules && typeof data.rules === "object" ? data.rules : {};
    const name = clip(token.name, 80) || "Unnamed";
    const symbol = clip(token.symbol, 24);
    const mint = clip(data.mint, 80) || "—";

    const facts = [
      ["Age", age(token.ageSec)],
      ["Curve", pct(token.progressPct)],
      ["Market cap", sol(token.mcapSol)],
      ["Peak", sol(token.peakMcapSol)],
      ["Trades kept", num(coverage.tradeCount) == null ? "—" : num(coverage.tradeCount).toLocaleString("en-US")]
    ];
    if (num(token.mcapUsd) != null) {
      facts.push([demo ? "Example USD" : "USD", usd(token.mcapUsd)]);
    }

    const limits = arr(coverage.limits).slice(0, 12).map((item) => str(item)).filter(Boolean);
    const clusters = arr(data.clusters).slice(0, 12);
    const hiddenClusters = arr(data.clusters).length - clusters.length;

    const bannerText = demo
      ? "Demo mode. No lookup was performed. Every wallet, percentage, and market-cap figure in this panel is fictional."
      : "Live response. Read it as a risk signal from one collector's tape. It is not a guarantee.";

    const root = el("article", { class: demo ? "panel panel-demo" : "panel panel-live" }, [
      el("div", { class: demo ? "demo-flag" : "live-flag", role: "status" }, [
        el("p", { text: bannerText }),
        opts.ignoredMint ? el("p", { text: `Nothing was requested for ${clip(opts.ignoredMint, 64)}.` }) : null
      ]),
      el("header", { class: "panel-h" }, [
        el("p", { class: "eyebrow" }, [demo ? "Fictional example" : "Collector reading"]),
        el("h2", { id: "panel-title", text: "Bundle risk" }),
        el("p", { class: "token-name" }, [symbol ? `${name} · ${symbol}` : name]),
        el("p", { class: "mint" }, [el("code", { text: mint })]),
        el("dl", { class: "facts" }, facts.flatMap(([term, value]) => [
          el("div", {}, [el("dt", { text: term }), el("dd", { text: value })])
        ]))
      ]),
      token.quoteOk === false ? el("p", { class: "callout" }, ["Non-SOL quote. A SOL market cap for this mint is not meaningful."]) : null,
      token.graduated === true ? el("p", { class: "callout" }, ["Graduated off the bonding curve. The bundle window is still the launch slots."]) : null,
      token.lite === true || str(coverage.detail) === "released"
        ? el("p", { class: "callout" }, ["Trade-level detail has been released for this mint. Bundle wallets and supply share should be empty. Empty is unknown, not a clearance."])
        : null,
      renderSignals(data),
      el("div", { class: "stats" }, [
        el("section", {}, [
          el("h3", { text: "Supply still credited" }),
          el("p", { class: "stat" }, [pct(bundle.supplyHeldPct)]),
          el("p", { class: "stat-d" }, ["Share of the 1,000,000,000 supply still credited to the measured bundle wallets, from curve trades only."])
        ]),
        el("section", {}, [
          el("h3", { text: "Buy volume in the window" }),
          el("p", { class: "stat" }, [pct(bundle.buyVolumeSharePct)]),
          el("p", { class: "stat-d" }, [
            num(bundle.solBought) != null && num(bundle.buyVolSol) != null
              ? `${sol(bundle.solBought)} of ${sol(bundle.buyVolSol)} bought. This is the share the scorer uses.`
              : "Share of buy SOL in the bundle window. This is the share the scorer uses."
          ])
        ])
      ]),
      el("p", { class: "rule" }, [ruleSentence(bundle, rules, demo)]),
      str(bundle.definition) ? el("p", { class: "note" }, [clip(bundle.definition, 400)]) : null,
      el("div", { class: "clusters" }, [
        el("h3", { class: "block-title", text: "Clusters" }),
        clusters.length
          ? el("div", {}, clusters.map((cluster) => renderCluster(cluster && typeof cluster === "object" ? cluster : {})))
          : el("p", { class: "note" }, ["No clusters in this response."]),
        hiddenClusters > 0 ? el("p", { class: "note" }, [`${hiddenClusters} more clusters were omitted in the browser.`]) : null
      ]),
      renderZone(data.rugZone, demo),
      limits.length ? el("section", { class: "limits" }, [
        el("h3", { text: "Limits of this reading" }),
        el("ul", {}, limits.map((item) => el("li", { text: clip(item, 400) })))
      ]) : null,
      el("p", { class: "disclaimer" }, [clip(data.disclaimer, 500) || "Risk signal only. Not a guarantee. Not financial advice."]),
      el("p", { class: "observed" }, [`Observed ${when(data.observedAt)} · contract ${clip(data.contract, 20) || "—"}`])
    ]);

    panel.replaceChildren(root);
    if (opts.focus) {
      const title = document.getElementById("panel-title");
      if (title) title.setAttribute("tabindex", "-1");
      if (title) title.focus();
    }
  }

  function showDemo(ignoredMint, focus) {
    const data = window.CURVEWATCH_DEMO;
    if (!data) {
      say("The fictional example failed to load.", "bad");
      return;
    }
    renderPanel(data, { ignoredMint, focus });
  }

  async function lookup(mint) {
    const { prefix } = apiPrefix();
    if (!prefix) {
      showDemo(mint, true);
      say("Demo mode stayed on. No request was sent.", "demo");
      return;
    }
    if (abort) abort.abort();
    abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 12000);
    submitBtn.disabled = true;
    panel.setAttribute("aria-busy", "true");
    say(`Requesting a reading for ${mint}.`, "wait");
    try {
      const response = await fetch(`${prefix}/api/risk/${encodeURIComponent(mint)}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "omit",
        signal: abort.signal
      });
      const text = await response.text();
      let body = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
      if (!response.ok || !body || typeof body !== "object" || Array.isArray(body)) {
        const message = body && typeof body === "object" ? clip(body.message, 240) : "";
        const code = body && typeof body === "object" ? str(body.error) : "";
        say(message || (code ? `The risk API returned ${response.status} (${code}).` : `The risk API returned ${response.status} and no readable JSON.`), "bad");
        panel.replaceChildren(el("p", { class: "panel-error" }, [
          "No panel. A failed request is not evidence about the mint."
        ]));
        return;
      }
      if (body.error && !body.bundle && !body.clusters) {
        say(clip(body.message, 240) || `The risk API returned ${str(body.error) || "an error"}.`, "bad");
        panel.replaceChildren(el("p", { class: "panel-error" }, [
          "No panel. The collector did not return a reading."
        ]));
        return;
      }
      renderPanel(body, { focus: true });
      say(isDemo(body) ? "The API returned a demo-shaped payload." : "Reading loaded.", "ok");
    } catch (error) {
      if (error && error.name === "AbortError") {
        say("The request was cancelled or timed out. Nothing was concluded about the mint.", "bad");
      } else {
        say("The risk API could not be reached. Nothing was concluded about the mint.", "bad");
      }
      panel.replaceChildren(el("p", { class: "panel-error" }, [
        "No panel. A network failure is not evidence about the mint."
      ]));
    } finally {
      clearTimeout(timer);
      submitBtn.disabled = false;
      panel.setAttribute("aria-busy", "false");
    }
  }

  function describeMode() {
    const { prefix, problem } = apiPrefix();
    if (!prefix) {
      modeLine.textContent = problem || "Demo mode. No risk API is configured, so the panel is a fictional example.";
      return;
    }
    modeLine.textContent = `Live mode. A check calls GET /api/risk/:mint on ${prefix}.`;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const raw = input.value;
    const mint = extractMint(raw);
    if (!str(raw).trim()) {
      showDemo("", true);
      say("Showing the fictional example.", "demo");
      return;
    }
    if (!mint) {
      input.setAttribute("aria-invalid", "true");
      say("Enter a Solana mint, or a pump.fun, DexScreener, or Solscan token link. No request was sent.", "bad");
      return;
    }
    input.removeAttribute("aria-invalid");
    lookup(mint);
  });

  exampleBtn.addEventListener("click", () => {
    input.value = "";
    input.removeAttribute("aria-invalid");
    showDemo("", true);
    say("Showing the fictional example. No request was sent.", "demo");
  });

  panel.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-copy]");
    if (!button) return;
    const value = button.getAttribute("data-copy") || "";
    try {
      await navigator.clipboard.writeText(value);
      button.textContent = "Copied";
    } catch {
      button.textContent = "Select the address";
    }
    setTimeout(() => {
      button.textContent = "Copy";
    }, 1600);
  });

  describeMode();
  showDemo("", false);
  booted = true;
  document.documentElement.dataset.ready = booted ? "1" : "0";
})();
