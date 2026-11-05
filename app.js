// =============================================================
//  app.js — the step-by-step job form, saving jobs, equipment search
//  and the "Generate forms" step.
// =============================================================

// ---------- Dropdown choices (copied from the PSEG workbook's lists) ----------
const OPT = {
  income: ["Low Income (60% AMI)", "Moderate Income (80% AMI)", "Market"],
  buildingType: ["Existing Building", "New Construction"],
  projectType: ["Whole House", "Partial to Whole House"],
  yesNo: ["Yes", "No"],
  yesNoUnsure: ["Yes", "No", "Unsure"],
  payment: ["Bill Credit", "Check", "Assigned to Contractor"],
  county: ["Nassau", "Suffolk", "Queens"],
  occupancy: ["Owner Occupied", "Rental Unit"],
  units: ["Single Family", "2-Family Home", "3-Family Home", "4-Family Home", "Mobile Home"],
  paidBy: ["Owner", "Tenant"],
  heatEquip: ["Oil Boiler", "Oil Furnace", "Oil Other", "Natural Gas Boiler", "Natural Gas Furnace", "Natural Gas Other",
    "Electric ASHP", "Propane Boiler", "Propane Furnace", "Propane Other", "Electric Boiler", "Electric Furnace",
    "Electric Resistance", "PTHP", "Electric Other", "None", "New Construction"],
  coolEquip: ["Ducted Air Source HP", "Central Air Conditioner", "Ductless Mini Split - AC", "Ductless Mini Split - HP",
    "PTHP", "Other", "None", "New Construction"],
  condition: ["End of Life", "Early Retirement", "New Unit"],
  // same list & order as the Technology Type dropdown on the "Integrated Control & Electrical" tab
  controlType: ["Integrated/Modulating Control", "No Fossil Fuel Heater", "Dual Fuel Thermostat", "Integrated/Fixed Control"],
  waterExisting: ["Gas Storage Water Heater", "Oil Storage Water Heater", "Propane Storage Water Heater", "Electric Storage Water Heater",
    "Gas Tankless Water Heater", "Electric Tankless Water Heater", "Heat Pump Water Heater", "None"],
  gshpType: ["Geothermal System, WTW  - Closed", "Geothermal HP, WTW - Closed", "Geothermal System, WTW  - Open", "Geothermal HP, WTW - Open"],
};

// ---------- The steps and their questions ----------
// type: text | tel | email | number | date | select | tiles
const STEPS = [
  {
    id: "customer", title: "Customer", heading: "Add a new job",
    sub: "Start with the homeowner and the PSEG Long Island account.",
    sections: [
      { title: "Homeowner details", fields: [
        { id: "firstName", label: "First name", req: true },
        { id: "lastName", label: "Last name", req: true },
        { id: "email", label: "Email address", type: "email", req: true },
        { id: "cellPhone", label: "Cell phone", type: "tel", req: true },
        { id: "homePhone", label: "Home phone", type: "tel" },
        { id: "altContact", label: "Alternate contact" },
      ]},
      { title: "Installation address", fields: [
        { id: "street", label: "Street address", req: true, full: true },
        { id: "unit", label: "Unit / apt" },
        { id: "city", label: "Town / city", req: true },
        { id: "zip", label: "Zip", req: true },
        { id: "county", label: "County", type: "select", options: OPT.county },
      ]},
      { title: "PSEG Long Island account", fields: [
        { id: "account", label: "PSEG LI account number", help: "Leave blank if new construction / awaiting account number." },
        { id: "accountName", label: "Name on account", help: "Leave blank if same as homeowner." },
      ]},
    ],
  },
  {
    id: "home", title: "Home & program", heading: "Home and program details",
    sub: "Used for eligibility and the rebate tier.",
    sections: [
      { title: "Home", fields: [
        { id: "buildingType", label: "Building type", type: "tiles", options: OPT.buildingType, req: true, full: true },
        { id: "projectType", label: "Whole house project type", type: "tiles", options: OPT.projectType, req: true, full: true },
        { id: "yearBuilt", label: "Year the home was built", type: "number", req: true },
        { id: "sqft", label: "Finished square footage", type: "number", req: true },
        { id: "_zillow", type: "hint", full: true, html: () => {
            const f = state.job.f;
            const q = encodeURIComponent([f.street, f.city, "NY", f.zip].filter(Boolean).join(" "));
            return `Need home details? Check the home's <a target="_blank" href="https://www.zillow.com/homes/${q}_rb/">Zillow page</a>.`;
        }},
      ]},
      { title: "Income & incentives", fields: [
        { id: "income", label: "Income eligibility", type: "tiles", options: OPT.income, req: true, full: true },
        { id: "efsFile", label: "EFS file number", help: "From the EFS Low/Moderate Income Verification letter (if income eligible)." },
        { id: "empower", label: "Applying for EmPower+ funding?", type: "select", options: OPT.yesNo, req: true },
        { id: "dac", label: "Located in a Disadvantaged Community?", type: "select", options: OPT.yesNoUnsure, req: true,
          help: '<a target="_blank" href="https://www.nyserda.ny.gov/ny/disadvantaged-communities">Check the DAC map</a>' },
        { id: "payment", label: "Rebate payment method", type: "select", options: OPT.payment, req: true },
        { id: "decline580", label: "Customer declines Rate Code 580?", type: "select", options: OPT.yesNo },
      ]},
    ],
  },
  { id: "screening", title: "Income form", heading: "Income screening application",
    sub: "Property and household details for the Residential Household Income Screening form (Low / Moderate income customers).",
    custom: renderScreening },
  {
    id: "existing", title: "Existing system", heading: "Existing heating and cooling",
    sub: "What's in the house before the work. If the condition is Early Retirement, the efficiencies are required.",
    sections: [
      { title: "Existing heating", fields: [
        { id: "heatEquip", label: "Existing heating equipment", type: "select", options: OPT.heatEquip, req: true, rerender: true },
        { id: "heatCond", label: "Heating equipment condition", type: "select", options: OPT.condition, req: true, rerender: true },
        { id: "_heatNote", type: "hint", full: true, showIf: (f) => f.heatCond && f.heatCond !== "Early Retirement",
          html: () => "Existing heating efficiency is only entered for <b>Early Retirement</b>." },
        { id: "heatAfue", label: "Existing heating AFUE (0.70 – 0.95)", type: "number", req: true,
          showIf: (f) => f.heatCond === "Early Retirement" && !isElectricHeat(f.heatEquip) },
        { id: "heatEff", label: "Existing heating HSPF / COP", type: "number", req: true,
          help: "HSPF (6–14) for heat pumps; COP for other electric heat (1.0 for electric resistance).",
          showIf: (f) => f.heatCond === "Early Retirement" && isElectricHeat(f.heatEquip) },
      ]},
      { title: "Existing cooling", fields: [
        { id: "coolEquip", label: "Existing cooling equipment", type: "select", options: OPT.coolEquip, req: true },
        { id: "coolCond", label: "Cooling equipment condition", type: "select", options: OPT.condition, req: true, rerender: true },
        { id: "_coolNote", type: "hint", full: true, showIf: (f) => f.coolCond && f.coolCond !== "Early Retirement",
          html: () => "Existing cooling SEER / EER are only entered for <b>Early Retirement</b>." },
        { id: "seer", label: "Existing cooling SEER", type: "number", req: true, showIf: (f) => f.coolCond === "Early Retirement" },
        { id: "eer", label: "Existing cooling EER", type: "number", req: true, showIf: (f) => f.coolCond === "Early Retirement" },
      ]},
      { title: "Electrical panel", fields: [
        { id: "breakerAmps", label: "Existing main breaker size (amps)", type: "number" },
        { id: "panelUpgrade", label: "Was an electrical panel upgrade needed?", type: "tiles", options: OPT.yesNo, rerender: true },
        { id: "panelCost", label: "Panel upgrade cost ($)", type: "number", showIf: (f) => f.panelUpgrade === "Yes" },
      ]},
    ],
  },
  { id: "equipment", title: "New equipment", heading: "New heat pump systems",
    sub: "Search the NEEP cold-climate list by model number or AHRI number. Up to 8 systems.", custom: renderEquipment },
  {
    id: "install", title: "Completion", heading: "Install dates and completion",
    sub: "Fill these after the job is done to generate the Project Completion Certification.",
    sections: [
      { title: "Completion", fields: [
        { id: "installDate", label: "Installation date", type: "date" },
        { id: "projectNumber", label: "PSEG project number", help: "From the pre-approval letter / portal." },
        { id: "estRebate", label: "Estimated rebate amount ($)", type: "number", help: "Shown on the Customer Information tab of the Excel file once equipment is entered." },
      ]},
    ],
  },
  { id: "docs", title: "Photos & docs", heading: "Documents and photos",
    sub: "Attach files so they go in the same download as the forms.", custom: renderUploads },
  { id: "review", title: "Generate", heading: "Review and generate forms",
    sub: "Pick the forms you need. They download pre-filled and still editable, ready to check and send for signature.", custom: renderReview },
];

const isElectricHeat = (equip) => /^(Electric|PTHP)/.test(equip || "");

const UPLOAD_TYPES = ["Pre-install photos", "Post-install photos", "Manual J report", "Utility bill", "Invoice / proof of payment", "Other"];

// ---------- Saving (browser storage) ----------
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* private mode etc. */ } },
};
// Company info saved in the browser is only used while config.js defaults are unchanged.
// If you edit COMPANY_DEFAULTS in config.js, everyone gets the new defaults.
function loadCompany() {
  const saved = store.get("acr.company", null);
  if (!saved || saved._defaults !== JSON.stringify(COMPANY_DEFAULTS)) return { ...COMPANY_DEFAULTS };
  const { _defaults, ...values } = saved;
  return { ...COMPANY_DEFAULTS, ...values };
}
const newJob = () => ({ id: "job-" + Date.now(), created: new Date().toISOString(), updated: null, step: 0, f: {}, systems: [] });

const state = {
  job: null,
  company: loadCompany(),
  uploads: {},        // files live in memory only (too big for browser storage)
  neep: null,         // equipment list, loaded on first search
};

function saveJob() {
  state.job.updated = new Date().toISOString();
  const jobs = store.get("acr.jobs", {});
  jobs[state.job.id] = state.job;
  store.set("acr.jobs", jobs);
  store.set("acr.current", state.job.id);
  $("#savedNote").textContent = "Saved " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  updateJobCard();
}
function loadJob(id) {
  const jobs = store.get("acr.jobs", {});
  state.job = jobs[id] || newJob();
  state.uploads = {};
  render();
}

// ---------- Helpers ----------
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function updateJobCard() {
  const f = state.job.f;
  $("#jobName").textContent = FILL.fullName(f) || "New job";
  $("#jobAddr").textContent = [f.street, f.city, f.zip].filter(Boolean).join(", ") || "No address yet";
  const systems = state.job.systems.filter((s) => s.ahri);
  const facts = [
    ["Account #", f.account],
    ["Income", f.income && f.income.replace(/ \(.*\)/, "")],
    ["Project", f.projectType],
    ["Systems", systems.length ? `${systems.length} (${[...new Set(systems.map((s) => s.brand).filter(Boolean))].join(", ") || "AHRI entered"})` : ""],
    ["Payment", f.payment],
    ["Installed", f.installDate && FILL.usDate(f.installDate)],
  ];
  $("#jobFacts").innerHTML = facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v) || "—"}</dd>`).join("");
  renderStepList();
}

function stepComplete(step) {
  if (step.id === "equipment") return state.job.systems.some((s) => s.ahri);
  if (step.id === "screening") return state.job.f.income === "Market" ||
    (!!state.job.f.occupancy && (state.job.household?.earners || []).some((e) => e.first));
  if (!step.sections) return false;
  const req = step.sections.flatMap((s) => s.fields).filter((x) => x.req && (!x.showIf || x.showIf(state.job.f)));
  return req.length > 0 && req.every((x) => state.job.f[x.id]);
}

// ---------- Rendering ----------
let lastShownStep = null;
function renderStepList() {
  $("#stepList").innerHTML = STEPS.map((s, i) => `
    <li class="${i === state.job.step ? "active" : ""} ${stepComplete(s) ? "done" : ""}" data-step="${i}">
      <span class="dot">${stepComplete(s) ? "✓" : i + 1}</span><span class="label">${s.title}</span></li>`).join("");
  $("#stepList").querySelectorAll("li").forEach((li) =>
    li.addEventListener("click", () => { state.job.step = Number(li.dataset.step); saveJob(); render(); }));
  // On narrow screens, slide the tab strip sideways so the current step is visible.
  // (Only sideways, and only when the step changes, so the page itself never jumps.)
  if (lastShownStep !== state.job.step) {
    lastShownStep = state.job.step;
    const wrap = $(".progress-wrap"), li = $("#stepList li.active");
    if (wrap && li) wrap.scrollLeft += li.getBoundingClientRect().left - wrap.getBoundingClientRect().left - (wrap.clientWidth - li.offsetWidth) / 2;
  }
}

function fieldHtml(x) {
  if (x.showIf && !x.showIf(state.job.f)) return "";
  const v = state.job.f[x.id] ?? "";
  const cls = `field${x.full ? " full" : ""}`;
  const label = `<label for="f_${x.id}">${esc(x.label)}${x.req ? ' <span class="req">*</span>' : ""}</label>`;
  const help = x.help ? `<div class="help">${x.help}</div>` : "";
  if (x.type === "hint") return `<div class="${cls}"><div class="hint">${x.html()}</div></div>`;
  if (x.type === "select") {
    return `<div class="${cls}">${label}<select id="f_${x.id}" data-id="${x.id}">
      <option value="">Select…</option>${x.options.map((o) => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}
      </select>${help}</div>`;
  }
  if (x.type === "tiles") {
    return `<div class="${cls}">${label}<div class="tiles" data-tiles="${x.id}">${x.options.map((o) => `
      <label class="tile ${o === v ? "on" : ""}">${esc(o)}<input type="checkbox" value="${esc(o)}" ${o === v ? "checked" : ""}></label>`).join("")}
      </div>${help}</div>`;
  }
  return `<div class="${cls}">${label}<input id="f_${x.id}" data-id="${x.id}" type="${x.type || "text"}" value="${esc(v)}" ${x.type === "number" ? 'step="any"' : ""}>${help}</div>`;
}

// keepScroll = stay where you are on the page (used when adding/removing items in a step)
function render(keepScroll = false) {
  const scrollY = window.scrollY;
  $("#stepContainer").oninput = null; // step-specific live handlers are re-attached by the step
  const step = STEPS[state.job.step];
  const box = $("#stepContainer");
  box.innerHTML = `<h1>${step.heading}</h1><p class="sub">${step.sub}</p>`;
  if (step.custom) step.custom(box);
  else {
    box.innerHTML += step.sections.map((sec) =>
      `<h3>${sec.title}</h3><div class="grid">${sec.fields.map(fieldHtml).join("")}</div>`).join("");
    wireFields(box);
  }
  $("#btnBack").style.visibility = state.job.step === 0 ? "hidden" : "visible";
  $("#btnNext").style.display = state.job.step === STEPS.length - 1 ? "none" : "";
  updateJobCard();
  if (keepScroll) window.scrollTo({ top: scrollY, behavior: "instant" });
  else window.scrollTo({ top: 0 });
}

function wireFields(box) {
  box.querySelectorAll("[data-id]").forEach((el) => {
    el.addEventListener("input", () => {
      state.job.f[el.dataset.id] = el.value; el.classList.remove("invalid");
      if (el.dataset.id === "whId") Object.assign(state.job.f, { whBrand: "", whModel: "", whGallons: "", whUef: "" });
      saveJob();
    });
    el.addEventListener("change", () => { if (FIELD_BY_ID[el.dataset.id]?.rerender) render(true); });
  });
  box.querySelectorAll("[data-tiles]").forEach((group) => {
    group.querySelectorAll("input").forEach((cb) => cb.addEventListener("change", () => {
      state.job.f[group.dataset.tiles] = cb.checked ? cb.value : "";
      group.querySelectorAll(".tile").forEach((t) => t.classList.toggle("on", t.querySelector("input") === cb && cb.checked));
      group.querySelectorAll("input").forEach((o) => { if (o !== cb) o.checked = false; });
      saveJob();
      if (FIELD_BY_ID[group.dataset.tiles]?.rerender) render(true);
    }));
  });
}

function validateStep() {
  const step = STEPS[state.job.step];
  if (!step.sections) return true;
  const missing = step.sections.flatMap((s) => s.fields).filter((x) => x.req && (!x.showIf || x.showIf(state.job.f)) && !state.job.f[x.id]);
  missing.forEach((x) => $(`#f_${x.id}`)?.classList.add("invalid"));
  if (missing.length) {
    const goOn = confirm(`Missing: ${missing.map((x) => x.label).join(", ")}.\n\nContinue anyway? (You can come back later.)`);
    return goOn;
  }
  return true;
}

// ---------- Step: New equipment ----------
async function loadNeep() {
  if (state.neep) return state.neep;
  const data = await (await fetch("data/neep-ashp.json")).json();
  const fav = new Set(FAVORITE_BRANDS.map((b) => b.toLowerCase()));
  state.neep = data.rows.map((r) => {
    const o = Object.fromEntries(data.cols.map((c, i) => [c, r[i]]));
    o.search = [o.ahri, o.brand, o.outdoor, o.indoor].join(" ").toLowerCase().replace(/[-\s]+/g, " ");
    o.fav = fav.has(String(o.brand).toLowerCase());
    return o;
  });
  return state.neep;
}

// Top of the equipment step: does fossil-fuel backup heat stay? (drives the Integrated Controls tab)
const CONTROLS_SECTION = { title: "Integrated controls", fields: [
  { id: "fossilRemains", label: "Will fossil-fuel backup heat (oil / gas / propane) remain after the project?", type: "tiles",
    options: OPT.yesNo, req: true, full: true, rerender: true,
    help: "Yes = enter each control unit (Unit 1, Unit 2…) for the Integrated Control &amp; Electrical tab, then pick which unit each heat pump system uses." },
]};

// Optional water heating (Water Heating Worksheet tab)
const WATER_SECTIONS = [
  { title: "Water heating (optional)", fields: [
    { id: "waterInclude", label: "Include water heating on this application?", type: "tiles", options: ["No", "Yes"], full: true, rerender: true },
    { id: "waterKind", label: "Water heating type", type: "tiles", options: ["Heat Pump Water Heater", "GSHP Dedicated Water Heating"], full: true,
      rerender: true, showIf: (f) => f.waterInclude === "Yes" },
  ]},
];
const HPWH_FIELDS = [
  { id: "whExisting", label: "Existing water heater type", type: "select", options: OPT.waterExisting, req: true },
  { id: "whSerial", label: "Serial number", req: true },
  { id: "whInvoice", label: "Invoice / receipt number", req: true },
  { id: "whCost", label: "Cost ($)", type: "number", req: true },
];
const GSHP_FIELDS = [
  { id: "gsType", label: "New equipment type", type: "select", options: OPT.gshpType, req: true, rerender: true },
  { id: "gsExisting", label: "Existing equipment type", type: "select", req: true,
    options: [...OPT.waterExisting, "Geothermal"] },
  { id: "gsBtuh", label: "AHRI heating full load (BTUh)", type: "number", req: true },
  { id: "gsTank", label: "Proposed storage tank size (gallons)", type: "number", req: true },
  { id: "gsMfr", label: "Manufacturer", req: true },
  { id: "gsCop", label: "AHRI full load COP", type: "number", req: true },
  { id: "gsModel", label: "Model number", req: true },
  { id: "gsSupp", label: "Supplemental electric heat?", type: "select", options: OPT.yesNo, req: true },
  { id: "gsSerial", label: "Serial number", req: true },
  { id: "gsCost", label: "Cost ($)", type: "number", req: true },
];

async function loadHpwh() {
  if (state.hpwh) return state.hpwh;
  const data = await (await fetch("data/hpwh.json")).json();
  state.hpwh = data.rows.map((r) => {
    const o = Object.fromEntries(data.cols.map((c, i) => [c, r[i]]));
    o.search = [o.id, o.brand, o.model].join(" ").toLowerCase().replace(/[-\s]+/g, " ");
    return o;
  });
  return state.hpwh;
}

function renderEquipment(box) {
  const systems = state.job.systems;
  const f = state.job.f;
  if (!systems.length) systems.push({});
  const fossil = f.fossilRemains === "Yes";
  const controls = (state.job.controls ||= []);
  if (fossil && !controls.length) controls.push({});
  const unitLabel = (k) => `Unit ${k + 1}${controls[k]?.type ? " — " + controls[k].type : ""}`;

  // Integrated controls: the question, and (if Yes) the unit rows of the Integrated Control & Electrical tab
  box.insertAdjacentHTML("beforeend", `<h3>${CONTROLS_SECTION.title}</h3><div class="grid">${CONTROLS_SECTION.fields.map(fieldHtml).join("")}</div>` +
    (fossil ? controls.map((c, k) => `
      <div class="system" data-unit="${k}">
        <div class="system-head"><strong>Unit ${k + 1}</strong>
          ${controls.length > 1 ? `<button class="danger" data-rm-unit="${k}">Remove</button>` : ""}</div>
        <div class="grid">
          <div class="field"><label>Technology type <span class="req">*</span></label>
            <select data-c="type"><option value="">Select…</option>
              ${OPT.controlType.map((o) => `<option ${o === c.type ? "selected" : ""}>${o}</option>`).join("")}</select></div>
          <div class="field"><label>Manufacturer <span class="req">*</span></label><input data-c="mfr" value="${esc(c.mfr)}"></div>
          <div class="field"><label>Model number <span class="req">*</span></label><input data-c="model" value="${esc(c.model)}"></div>
          <div class="field"><label>Serial number <span class="req">*</span></label><input data-c="serial" value="${esc(c.serial)}">
            <div class="help">Must match the invoice.</div></div>
        </div>
      </div>`).join("") + (controls.length < 10 ? `<button class="secondary" id="addUnit">+ Add another unit</button>` : "")
    : f.fossilRemains === "No" ? `<div class="note">No integrated controls will be entered. Note: the workbook only calculates a system's rebate once a "Unit Controlled" is chosen, so if PSEG needs one listed (for example as "No Fossil Fuel Heater"), answer Yes and add it.</div>` : "") +
    `<h3>Heat pump systems</h3>`);
  box.insertAdjacentHTML("beforeend", systems.map((s, i) => `
    <div class="system" data-i="${i}">
      <div class="system-head"><strong>System ${i + 1}</strong>
        ${systems.length > 1 ? `<button class="danger" data-remove="${i}">Remove</button>` : ""}</div>
      <div class="field full"><label>Search NEEP list (model # or AHRI #)</label>
        <input class="neep-search" placeholder="e.g. MXZ-3C24NAHZ or 211234567" autocomplete="off">
        <div class="results" hidden></div></div>
      ${s.ahri ? pickedHtml(s) : ""}
      <div class="grid">
        <div class="field"><label>AHRI reference number <span class="req">*</span></label><input data-sys="ahri" value="${esc(s.ahri)}"></div>
        <div class="field"><label>Total installed cost ($) <span class="req">*</span></label><input data-sys="cost" type="number" step="any" value="${esc(s.cost)}"></div>
        <div class="field"><label>Manual J cooling load (BTUh, sensible + latent) <span class="req">*</span></label><input data-sys="mjCool" type="number" value="${esc(s.mjCool)}"></div>
        <div class="field"><label>Manual J heating load (BTUh) <span class="req">*</span></label><input data-sys="mjHeat" type="number" value="${esc(s.mjHeat)}"></div>
        <div class="field"><label>Condenser serial number</label><input data-sys="condSerial" value="${esc(s.condSerial)}"></div>
        <div class="field"><label>Coil / air handler serial number</label><input data-sys="coilSerial" value="${esc(s.coilSerial)}"></div>
      </div>
      ${fossil ? `
      <div class="grid" style="margin-top:16px">
        <div class="field"><label>Unit controlled (from Integrated Controls)</label>
          <select data-unit-pick="${i}"><option value="">Select…</option>
            ${controls.map((c, k) => `<option value="Unit ${k + 1}" ${s.unit === `Unit ${k + 1}` ? "selected" : ""}>${esc(unitLabel(k))}</option>`).join("")}</select></div>
      </div>` : ""}
    </div>`).join("") +
    (systems.length < 8 ? `<button class="secondary" id="addSystem">+ Add another system</button>` : ""));

  // Water heating (optional)
  const wk = f.waterInclude === "Yes" ? f.waterKind : "";
  box.insertAdjacentHTML("beforeend", WATER_SECTIONS.map((sec) =>
    `<h3>${sec.title}</h3><div class="grid">${sec.fields.map(fieldHtml).join("")}</div>`).join("") +
    (wk === "Heat Pump Water Heater" ? `
      <div class="system" style="margin-top:28px">
        <div class="system-head"><strong>Heat pump water heater</strong></div>
        <div class="field full"><label>Search ENERGY STAR list (brand or model #)</label>
          <input id="hpwhSearch" placeholder="e.g. Rheem PROPH50 or AO Smith" autocomplete="off"><div class="results" id="hpwhResults" hidden></div></div>
        ${f.whId ? `<div class="picked"><div><span>ENERGY STAR ID</span>${esc(f.whId)}</div><div><span>Brand</span>${esc(f.whBrand) || "—"}</div>
          <div><span>Model</span>${esc(f.whModel) || "—"}</div><div><span>Tank / UEF</span>${esc(f.whGallons) || "—"} gal / ${esc(f.whUef) || "—"}</div></div>` : ""}
        <div class="grid">
          ${fieldHtml({ id: "whId", label: "ENERGY STAR unique ID", req: true })}
          ${HPWH_FIELDS.map(fieldHtml).join("")}
        </div>
      </div>` : "") +
    (wk === "GSHP Dedicated Water Heating" ? `
      <div class="system" style="margin-top:28px">
        <div class="system-head"><strong>GSHP dedicated water heating</strong></div>
        <div class="grid">${GSHP_FIELDS.map(fieldHtml).join("")}</div>
      </div>` : ""));
  wireFields(box);

  // control units
  box.querySelectorAll("[data-unit]").forEach((card) => {
    const c = controls[Number(card.dataset.unit)];
    card.querySelectorAll("[data-c]").forEach((el) => el.addEventListener("input", () => { c[el.dataset.c] = el.value; saveJob(); }));
    // changing the type updates the labels in each system's "Unit controlled" dropdown
    card.querySelector('[data-c="type"]').addEventListener("change", () => render(true));
  });
  box.querySelectorAll("[data-rm-unit]").forEach((b) => b.addEventListener("click", () => {
    const k = Number(b.dataset.rmUnit);
    controls.splice(k, 1);
    // keep each system pointing at the same unit after renumbering
    systems.forEach((s) => {
      const n = Number((s.unit || "").replace("Unit ", ""));
      if (n === k + 1) s.unit = ""; else if (n > k + 1) s.unit = `Unit ${n - 1}`;
    });
    saveJob(); render(true);
  }));
  $("#addUnit")?.addEventListener("click", () => {
    controls.push({}); saveJob(); render(true);
    focusNew(`[data-unit="${controls.length - 1}"]`, '[data-c="type"]');
  });
  box.querySelectorAll("[data-unit-pick]").forEach((sel) => sel.addEventListener("change", () => {
    systems[Number(sel.dataset.unitPick)].unit = sel.value; saveJob();
  }));

  const hs = $("#hpwhSearch");
  if (hs) {
    let t;
    hs.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        const out = $("#hpwhResults");
        const q = hs.value.toLowerCase().replace(/[-\s]+/g, " ").trim();
        if (q.length < 2) { out.hidden = true; return; }
        const words = q.split(" ");
        const hits = (await loadHpwh()).filter((r) => words.every((w) => r.search.includes(w))).slice(0, 40);
        out.hidden = false;
        out.innerHTML = hits.length ? hits.map((h, k) => `<div class="result" data-k="${k}"><b>${esc(h.brand)}</b> · ${esc(h.model)}<br>
          <span class="muted">ENERGY STAR ID ${h.id} · ${h.gallons} gal · UEF ${h.uef}</span></div>`).join("")
          : '<div class="result">No match. You can still type the ENERGY STAR ID below.</div>';
        out.querySelectorAll("[data-k]").forEach((el) => el.addEventListener("click", () => {
          const h = hits[Number(el.dataset.k)];
          Object.assign(f, { whId: String(h.id), whBrand: h.brand, whModel: h.model, whGallons: h.gallons, whUef: h.uef });
          saveJob(); render(true);
        }));
      }, 200);
    });
  }

  box.querySelectorAll(".system[data-i]").forEach((card) => {
    const i = Number(card.dataset.i);
    card.querySelectorAll("[data-sys]").forEach((el) => el.addEventListener("input", () => {
      systems[i][el.dataset.sys] = el.value;
      if (el.dataset.sys === "ahri") Object.assign(systems[i], { brand: "", outdoor: "", indoor: "" }); // typed by hand
      saveJob();
    }));
    const input = card.querySelector(".neep-search");
    const results = card.querySelector(".results");
    let timer;
    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const q = input.value.toLowerCase().replace(/[-\s]+/g, " ").trim();
        if (q.length < 3) { results.hidden = true; return; }
        results.hidden = false; results.innerHTML = '<div class="result">Searching…</div>';
        const list = await loadNeep();
        const words = q.split(" ");
        const hits = list.filter((r) => words.every((w) => r.search.includes(w)))
          .sort((a, b) => b.fav - a.fav).slice(0, 40);
        results.innerHTML = hits.length ? hits.map((h, k) => `
          <div class="result" data-k="${k}"><b>${esc(h.brand)}</b> · ${esc(h.outdoor)}${h.indoor ? " / " + esc(h.indoor) : ""}<br>
          <span class="muted">AHRI ${h.ahri} · ${esc(h.config)} · 17°F max ${fmt(h.cap17max)} BTUh</span></div>`).join("")
          : '<div class="result">No match on the NEEP list. You can still type the AHRI number below.</div>';
        results.querySelectorAll("[data-k]").forEach((el) => el.addEventListener("click", () => {
          const h = hits[Number(el.dataset.k)];
          Object.assign(systems[i], { ahri: String(h.ahri), brand: h.brand, outdoor: h.outdoor, indoor: h.indoor,
            config: h.config, cap17max: h.cap17max, cap17rated: h.cap17rated, cap95: h.cap95, seer2: h.seer2, hspf2: h.hspf2 });
          saveJob(); render(true);
        }));
      }, 200);
    });
  });
  box.querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", () => {
    systems.splice(Number(b.dataset.remove), 1); saveJob(); render(true);
  }));
  $("#addSystem")?.addEventListener("click", () => {
    systems.push({}); saveJob(); render(true);
    focusNew(`.system[data-i="${systems.length - 1}"]`, ".neep-search");
  });
}
const fmt = (n) => (n === null || n === undefined || n === "" ? "—" : Number(n).toLocaleString());
function pickedHtml(s) {
  if (!s.brand) return "";
  return `<div class="picked">
    <div><span>Brand</span>${esc(s.brand)}</div>
    <div><span>Outdoor model</span>${esc(s.outdoor)}</div>
    <div><span>Indoor model</span>${esc(s.indoor) || "—"}</div>
    <div><span>Type</span>${esc(s.config)}</div>
    <div><span>SEER2 / HSPF2</span>${s.seer2 ?? "—"} / ${s.hspf2 ?? "—"}</div>
    <div><span>Capacity @95°F</span>${fmt(s.cap95)}</div>
    <div><span>Capacity @17°F rated / max</span>${fmt(s.cap17rated)} / ${fmt(s.cap17max)}</div></div>`;
}

// After adding an item: gently bring it into view and put the cursor in its first box.
function focusNew(cardSelector, inputSelector) {
  const card = document.querySelector(cardSelector);
  if (!card) return;
  card.scrollIntoView({ block: "nearest", behavior: "smooth" });
  card.querySelector(inputSelector)?.focus({ preventScroll: true });
}

// ---------- Step: Income screening ----------
const SCREENING_SECTIONS = [
  { title: "Property (Section A)", fields: [
    { id: "occupancy", label: "Occupancy", type: "tiles", options: OPT.occupancy, req: true, full: true },
    { id: "units", label: "Number of units", type: "select", options: OPT.units, req: true },
    { id: "phoneExt", label: "Applicant phone ext." },
  ]},
  { title: "Property owner (Section B)", fields: [
    { id: "ownerDifferent", label: "Is the property owner different from the applicant?", type: "tiles", options: ["No", "Yes"], full: true, rerender: true },
    ...[
      { id: "ownerFirst", label: "Owner first name" }, { id: "ownerLast", label: "Owner last name" },
      { id: "ownerPhone", label: "Owner phone", type: "tel" }, { id: "ownerExt", label: "Ext." },
      { id: "ownerEmail", label: "Owner email", type: "email", full: true },
      { id: "ownerMailing", label: "Mailing address (if different than installation address)", full: true },
      { id: "ownerUnit", label: "Unit #" }, { id: "ownerCity", label: "City" },
      { id: "ownerState", label: "State" }, { id: "ownerZip", label: "Zip" },
      { id: "ownerCounty", label: "County" },
    ].map((x) => ({ ...x, showIf: (f) => f.ownerDifferent === "Yes" })),
  ]},
  { title: "Project partner (Section C)", fields: [
    { id: "cbo", label: "Constituency-based organization (if applicable)", full: true },
  ]},
  { title: "Energy supplier (Section D)", fields: [
    { id: "elecPaidBy", label: "Electricity paid by", type: "tiles", options: OPT.paidBy },
    { id: "heatPaidBy", label: "Heat paid by", type: "tiles", options: OPT.paidBy },
    { id: "gasUtility", label: "Natural gas utility (if any)" },
    { id: "gasAccount", label: "Gas account number" },
    { id: "gasName", label: "Name on gas account", help: "Leave blank if same as electric." },
  ]},
];

const household = () => (state.job.household ||= { earners: [], members: [] });
// Total people = income earners + non-income members (any row with a name or age filled in).
const filledRow = (r) => !!(r.first || r.last || r.age);
const householdCount = () => household().earners.filter(filledRow).length + household().members.filter(filledRow).length;

function renderScreening(box) {
  const f = state.job.f;
  const hh = household();
  if (f.income === "Market") box.insertAdjacentHTML("beforeend",
    `<div class="hint" style="margin-top:16px">This customer is marked <b>Market</b> rate, so the income screening form usually isn't needed.</div>`);
  box.insertAdjacentHTML("beforeend", SCREENING_SECTIONS.map((sec) =>
    `<h3>${sec.title}</h3><div class="grid">${sec.fields.map(fieldHtml).join("")}</div>`).join(""));

  // Section E: household
  const inc = (e, j) => (e.incomes ||= [{}, {}, {}])[j] || {};
  box.insertAdjacentHTML("beforeend", `
    <h3>Household income (Section E)</h3>
    <p class="help" style="margin:0 0 12px">List everyone 18+ who isn't a full-time student and has income. Use gross annual amounts (net for self-employment / rental).</p>
    ${hh.earners.map((e, i) => `
      <div class="system" data-earner="${i}">
        <div class="system-head"><strong>Income earner ${i + 1}</strong><button class="danger" data-rm-earner="${i}">Remove</button></div>
        <div class="grid">
          <div class="field"><label>First name</label><input data-e="first" value="${esc(e.first)}"></div>
          <div class="field"><label>Last name</label><input data-e="last" value="${esc(e.last)}"></div>
          <div class="field"><label>Age</label><input data-e="age" type="number" value="${esc(e.age)}"></div>
          <div class="field"><label>Full-time student?</label><select data-e="student">
            ${["", "N", "Y"].map((o) => `<option value="${o}" ${o === (e.student || "") ? "selected" : ""}>${o ? (o === "Y" ? "Yes" : "No") : "Select…"}</option>`).join("")}</select></div>
          ${[0, 1, 2].map((j) => `
            <div class="field"><label>Income type ${j + 1} (e.g. Wages)</label><input data-inc="${j}" data-k="type" value="${esc(inc(e, j).type)}"></div>
            <div class="field"><label>Annual amount ${j + 1} ($)</label><input data-inc="${j}" data-k="amount" type="number" step="any" value="${esc(inc(e, j).amount)}"></div>`).join("")}
        </div>
      </div>`).join("")}
    ${hh.earners.length < 4 ? `<button class="secondary" id="addEarner">+ Add income earner</button>` : ""}

    <h3>Non-income household members</h3>
    ${hh.members.map((m, i) => `
      <div class="grid member" data-member="${i}" style="grid-template-columns: 1fr 1fr 90px auto; margin-bottom:10px; align-items:end">
        <div class="field"><label>First name</label><input data-m="first" value="${esc(m.first)}"></div>
        <div class="field"><label>Last name</label><input data-m="last" value="${esc(m.last)}"></div>
        <div class="field"><label>Age</label><input data-m="age" type="number" value="${esc(m.age)}"></div>
        <button class="danger" data-rm-member="${i}">Remove</button>
      </div>`).join("")}
    ${hh.members.length < 5 ? `<button class="secondary" id="addMember">+ Add household member</button>` : ""}

    <h3>Totals &amp; programs</h3>
    <div class="grid">
      <div class="field"><label>Total number of people in the household</label>
        <input id="totalPeople" type="number" value="${householdCount()}" readonly tabindex="-1" style="opacity:.85; cursor:default">
        <div class="help">Counted automatically: income earners + non-income members.</div></div>
      ${fieldHtml({ id: "nyserdaProgram", label: "Receiving EmPower+, HEAP, SNAP, WAP or SSI in the past 12 months?", type: "tiles", options: ["No", "Yes"],
        help: "If Yes, the customer attaches the award letter instead of income documents." })}
    </div>`);

  wireFields(box);
  box.querySelectorAll("[data-earner]").forEach((card) => {
    const e = hh.earners[Number(card.dataset.earner)];
    card.querySelectorAll("[data-e]").forEach((el) => el.addEventListener("input", () => { e[el.dataset.e] = el.value; saveJob(); }));
    card.querySelectorAll("[data-inc]").forEach((el) => el.addEventListener("input", () => {
      inc(e, 0); e.incomes[Number(el.dataset.inc)][el.dataset.k] = el.value; saveJob();
    }));
  });
  box.querySelectorAll("[data-member]").forEach((row) => {
    const m = hh.members[Number(row.dataset.member)];
    row.querySelectorAll("[data-m]").forEach((el) => el.addEventListener("input", () => { m[el.dataset.m] = el.value; saveJob(); }));
  });
  box.querySelectorAll("[data-rm-earner]").forEach((b) => b.addEventListener("click", () => { hh.earners.splice(Number(b.dataset.rmEarner), 1); saveJob(); render(true); }));
  box.querySelectorAll("[data-rm-member]").forEach((b) => b.addEventListener("click", () => { hh.members.splice(Number(b.dataset.rmMember), 1); saveJob(); render(true); }));
  $("#addEarner")?.addEventListener("click", () => {
    hh.earners.push(hh.earners.length ? { incomes: [{}, {}, {}] } : { first: f.firstName || "", last: f.lastName || "", incomes: [{ type: "Wages" }, {}, {}] });
    saveJob(); render(true);
    focusNew(`[data-earner="${hh.earners.length - 1}"]`, hh.earners.length === 1 ? '[data-e="age"]' : '[data-e="first"]');
  });
  $("#addMember")?.addEventListener("click", () => {
    hh.members.push({}); saveJob(); render(true);
    focusNew(`[data-member="${hh.members.length - 1}"]`, '[data-m="first"]');
  });
  // keep the total in step as names/ages are typed
  box.oninput = () => { const tp = $("#totalPeople"); if (tp) tp.value = householdCount(); };
}

// ---------- Step: Documents & photos ----------
function renderUploads(box) {
  box.insertAdjacentHTML("beforeend", `
    <div class="note">Files are kept only while this page is open and are added to the download zip. They are not uploaded anywhere.</div>
    <div class="grid" style="margin-top:16px">${UPLOAD_TYPES.map((t) => `
      <div class="field"><label>${t}</label><input type="file" multiple data-up="${t}">
        <div class="help">${(state.uploads[t] || []).map((f) => esc(f.name)).join(", ") || "No files yet"}</div></div>`).join("")}
    </div>`);
  box.querySelectorAll("[data-up]").forEach((inp) => inp.addEventListener("change", () => {
    state.uploads[inp.dataset.up] = [...(state.uploads[inp.dataset.up] || []), ...inp.files];
    render(true);
  }));
}

// ---------- Step: Review & generate ----------
function docChoices() {
  const f = state.job.f;
  return [
    { key: "xlsx", name: "Home Comfort rebate application (Excel)", why: "Always required.", on: true },
    { key: "income", name: "Residential Household Income Screening application (PDF)",
      why: "For Low/Moderate income customers. Customer fills in household income and signs.", on: true },
    { key: "assign", name: "Assignment Letter (PDF)", why: "When the rebate is paid to your company.", on: true },
    { key: "ppcc", name: "Project Completion Certification (PDF)", why: "Only after the install is 100% complete.", on: true },
  ];
}

function renderReview(box) {
  const f = state.job.f;
  const missing = STEPS.filter((s) => s.id !== "review" && s.id !== "docs" && s.id !== "screening" && s.id !== "install" && !stepComplete(s)).map((s) => s.title);
  const noCompany = !state.company.companyName;
  box.insertAdjacentHTML("beforeend", `
    ${noCompany ? `<div class="hint" style="margin-bottom:12px">Your company info is blank, so the contractor / assignee parts of the forms will be empty. <button class="link-btn" id="btnFixCompany">Add company info</button></div>` : ""}
    ${missing.length ? `<div class="hint">Still incomplete: <b>${missing.join(", ")}</b>. You can generate anyway and finish in the files.</div>` : ""}
    <h3>Forms to generate</h3>
    <div class="doclist">${docChoices().map((d) => `
      <label class="doc"><input type="checkbox" data-doc="${d.key}" ${d.on ? "checked" : ""}>
        <div><div>${d.name}</div><div class="why">${d.why}</div></div></label>`).join("")}</div>
    <div style="margin-top:20px; display:flex; gap:8px; flex-wrap:wrap">
      <button class="primary" id="btnGenerate">Generate forms</button>
    </div>
    <div class="downloads" id="downloads"></div>
    <h3>Still to do by hand</h3>
    <ul class="todo">
      <li>Open the Excel file and check the <b>ASHP Equipment Information</b> tab: models and capacities fill in from the AHRI number.</li>
      <li>Check the <b>Integrated Control &amp; Electrical</b> tab (filled from the New equipment and Existing system steps).</li>
      <li>Send the PDFs to the customer to sign (email, DocuSign/Adobe Sign, or sign in person).</li>
      <li>Upload everything to the <a href="https://www.pseglinyportal.com/Account" target="_blank">PSEG LI portal</a>.</li>
    </ul>`);
  $("#btnGenerate").addEventListener("click", generate);
  $("#btnFixCompany")?.addEventListener("click", openSettings);
}

function filePrefix() {
  const f = state.job.f;
  return ([f.lastName, f.street].filter(Boolean).join("_").replace(/[^\w]+/g, "_") || "job") + "_";
}
function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

async function generate() {
  const btn = $("#btnGenerate");
  const out = $("#downloads");
  btn.disabled = true; btn.textContent = "Generating…"; out.innerHTML = "";
  const want = Object.fromEntries([...document.querySelectorAll("[data-doc]")].map((c) => [c.dataset.doc, c.checked]));
  const p = filePrefix();
  const files = [];
  try {
    const { job } = state, c = state.company;
    if (want.xlsx) files.push([`${p}HomeComfort-Application.xlsx`, await FILL.buildHomeComfortXlsx(job, c)]);
    if (want.income) files.push([`${p}Income-Screening.pdf`, await FILL.buildIncomeScreening(job, c)]);
    if (want.assign) files.push([`${p}Assignment-Letter.pdf`, await FILL.buildAssignmentLetter(job, c)]);
    if (want.ppcc) files.push([`${p}Project-Completion-Certification.pdf`, await FILL.buildCompletionCert(job, c)]);

    const zip = new JSZip();
    files.forEach(([name, bytes]) => zip.file(name, bytes));
    Object.entries(state.uploads).forEach(([type, list]) =>
      list.forEach((file) => zip.file(`${type.replace(/[^\w]+/g, "_")}/${file.name}`, file)));
    const zipBlob = await zip.generateAsync({ type: "blob" });

    out.innerHTML = "<h3>Downloads</h3>";
    const add = (name, blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = name; a.textContent = "⬇ " + name;
      out.appendChild(a);
    };
    add(`${p}packet.zip`, zipBlob);
    files.forEach(([name, bytes]) => add(name, new Blob([bytes])));
    downloadBlob(zipBlob, `${p}packet.zip`);
  } catch (e) {
    console.error(e);
    out.innerHTML = `<div class="hint">Something went wrong: ${esc(e.message)}. If you opened index.html by double-clicking, run it through a web server instead (see README).</div>`;
  }
  btn.disabled = false; btn.textContent = "Generate forms";
}

// ---------- Jobs + settings dialogs ----------
function openJobs() {
  const jobs = Object.values(store.get("acr.jobs", {})).sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
  $("#jobsList").innerHTML = jobs.length ? jobs.map((j) => `
    <div class="jobrow"><div><b>${esc(FILL.fullName(j.f) || "Untitled job")}</b>
      <div class="meta">${esc([j.f.street, j.f.city].filter(Boolean).join(", "))} · updated ${j.updated ? new Date(j.updated).toLocaleString() : "—"}</div></div>
      <div><button class="secondary" data-open="${j.id}">Open</button><button class="danger" data-del="${j.id}">Delete</button></div></div>`).join("")
    : '<p class="muted">No saved jobs yet.</p>';
  $("#jobsList").querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => { loadJob(b.dataset.open); $("#jobsDialog").close(); }));
  $("#jobsList").querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
    if (!confirm("Delete this job?")) return;
    const all = store.get("acr.jobs", {}); delete all[b.dataset.del]; store.set("acr.jobs", all);
    if (state.job.id === b.dataset.del) { state.job = newJob(); render(); }
    openJobs();
  }));
  if (!$("#jobsDialog").open) $("#jobsDialog").showModal();
}

const SETTINGS_FIELDS = [
  ["companyName", "Company name"], ["contactName", "Contact name"], ["contactTitle", "Title"],
  ["businessPhone", "Business phone"], ["cellPhone", "Cell phone"], ["email", "Email"],
  ["address", "Address"], ["city", "City"], ["zip", "Zip"],
];
function openSettings() {
  $("#settingsForm").innerHTML = SETTINGS_FIELDS.map(([k, l]) =>
    `<div class="field"><label>${l}</label><input data-set="${k}" value="${esc(state.company[k])}"></div>`).join("");
  $("#settingsDialog").showModal();
}

// Every declared field by id (used for show/hide re-rendering).
const FIELD_BY_ID = Object.fromEntries([
  ...STEPS.flatMap((s) => (s.sections || []).flatMap((sec) => sec.fields)),
  ...SCREENING_SECTIONS.flatMap((sec) => sec.fields),
  ...CONTROLS_SECTION.fields, ...WATER_SECTIONS.flatMap((sec) => sec.fields), ...HPWH_FIELDS, ...GSHP_FIELDS,
].map((x) => [x.id, x]));

// ---------- Start up ----------
function init() {
  $("#btnNext").addEventListener("click", () => {
    if (!validateStep()) return;
    state.job.step = Math.min(state.job.step + 1, STEPS.length - 1); saveJob(); render();
  });
  $("#btnBack").addEventListener("click", () => { state.job.step = Math.max(state.job.step - 1, 0); saveJob(); render(); });
  $("#btnJobs").addEventListener("click", openJobs);
  $("#btnSettings").addEventListener("click", openSettings);
  $("#btnNewJob").addEventListener("click", () => { state.job = newJob(); state.uploads = {}; saveJob(); render(); $("#jobsDialog").close(); });
  $("#btnSaveSettings").addEventListener("click", () => {
    document.querySelectorAll("[data-set]").forEach((i) => (state.company[i.dataset.set] = i.value));
    store.set("acr.company", { ...state.company, _defaults: JSON.stringify(COMPANY_DEFAULTS) }); $("#settingsDialog").close();
    render(true);
  });
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));

  const current = store.get("acr.current", null);
  if (current) loadJob(current); else { state.job = newJob(); render(); }
}
init();
