// =============================================================
//  fill.js — turns a job's answers into the filled PSEG forms.
//  Everything runs in the browser: no data leaves the computer.
//
//  PDFs  -> pdf-lib  (fills the existing form fields)
//  Excel -> JSZip    (edits the cell XML directly, so the workbook's
//                     dropdowns, formulas, protection and hidden NEEP
//                     list are all kept exactly as PSEG built them)
// =============================================================

const TEMPLATES = {
  homeComfort: "templates/HomeComfort-app.xlsx",
  income: "templates/Income-Screening-App.pdf",
  assignment: "templates/Assignment-Letter.pdf",
  completion: "templates/Project-Completion-Certification.pdf",
};

async function fetchBytes(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

function usDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}
function todayISO() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}
const fullName = (f) => [f.firstName, f.lastName].filter(Boolean).join(" ");
const accountName = (f) => f.accountName || fullName(f);
const streetLine = (f) => [f.street, f.unit && `Unit ${f.unit}`].filter(Boolean).join(", ");
const contractorLine = (c) => [c.contactName, c.contactTitle].filter(Boolean).join(" / ");

// -------------------------------------------------------------
//  Excel: HomeComfort application workbook
// -------------------------------------------------------------

// Which cell on the "Customer Information" sheet gets which answer.
function customerInfoCells(f, c) {
  return {
    C5: f.account,
    C7: accountName(f),
    I7: f.homePhone,
    L7: f.cellPhone,
    C9: streetLine(f),
    I9: f.city,
    L9: f.zip,
    C11: f.email,
    C13: f.altContact,
    C15: f.income,
    K15: num(f.sqft),
    C17: f.efsFile,
    K17: num(f.yearBuilt),
    C19: f.empower,
    K19: f.buildingType,
    C21: f.dac,
    K21: f.projectType,
    C24: c.companyName,
    I24: f.payment,
    C26: contractorLine(c),
    I26: c.businessPhone,
    L26: c.cellPhone,
    C28: c.address,
    I28: c.city,
    L28: c.zip,
    B46: f.decline580,
    C48: accountName(f),
  };
}

// "ASHP Equipment Information" sheet. Each of the 8 systems is a block
// 23 rows tall, starting at row 28 (system 1), 51 (system 2), ...
function ashpCells(f, systems) {
  // Existing efficiencies are only allowed when the equipment is being retired early.
  const heatER = f.heatCond === "Early Retirement";
  const coolER = f.coolCond === "Early Retirement";
  const electricHeat = /^(Electric|PTHP)/.test(f.heatEquip || "");
  const cells = {
    D20: f.heatEquip,
    H20: f.coolEquip,
    D22: f.heatCond,
    H22: f.coolCond,
    K20: coolER ? num(f.seer) : undefined,
    K22: coolER ? num(f.eer) : undefined,
    N20: heatER && !electricHeat ? num(f.heatAfue) : undefined,
    N22: heatER && electricHeat ? num(f.heatEff) : undefined,
  };
  systems.slice(0, 8).forEach((s, i) => {
    const r = 28 + 23 * i;
    Object.assign(cells, {
      [`D${r}`]: num(s.ahri),          // AHRI # -> workbook looks up models/capacity itself
      [`M${r}`]: num(s.cost),          // total installed cost
      [`M${r + 9}`]: s.condSerial,     // condenser serial
      [`M${r + 11}`]: s.coilSerial,    // coil / air handler serial
      [`D${r + 16}`]: num(s.mjCool),   // Manual J cooling load
      [`H${r + 16}`]: num(s.mjHeat),   // Manual J heating load
      [`H${r + 13}`]: f.fossilRemains === "Yes" ? s.unit : undefined, // "Unit Controlled" (chosen on the website)
    });
  });
  return cells;
}

function num(v) {
  if (v === "" || v === null || v === undefined) return undefined;
  const n = Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : v;
}

const xmlEsc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const colNum = (col) => [...col].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

// Write one value into a sheet's XML, keeping the cell's existing style.
function setCell(xml, ref, value) {
  if (value === undefined || value === null || value === "") return xml;
  const col = ref.match(/[A-Z]+/)[0];
  const row = Number(ref.match(/\d+/)[0]);

  const cellRe = new RegExp(`<c r="${ref}"(?=[\\s>/])([^>]*?)(\\/>|>[\\s\\S]*?<\\/c>)`);
  const existing = xml.match(cellRe);
  const style = existing ? (existing[1].match(/\ss="(\d+)"/) || [])[0] || "" : "";
  const newCell = typeof value === "number"
    ? `<c r="${ref}"${style}><v>${value}</v></c>`
    : `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(value)}</t></is></c>`;

  if (existing) return xml.replace(cellRe, newCell);

  // Cell doesn't exist yet: insert it into its row in column order.
  const rowRe = new RegExp(`<row r="${row}"(?=[\\s>/])([^>]*?)(\\/>|>([\\s\\S]*?)<\\/row>)`);
  const rowMatch = xml.match(rowRe);
  if (!rowMatch) {
    // Row missing: add a new row before the first row with a higher number.
    const rows = [...xml.matchAll(/<row r="(\d+)"/g)];
    const after = rows.find((m) => Number(m[1]) > row);
    const rowXml = `<row r="${row}">${newCell}</row>`;
    return after ? xml.slice(0, after.index) + rowXml + xml.slice(after.index) : xml.replace("</sheetData>", rowXml + "</sheetData>");
  }
  let inner = rowMatch[3] || "";
  const cells = [...inner.matchAll(/<c r="([A-Z]+)\d+"/g)];
  const next = cells.find((m) => colNum(m[1]) > colNum(col));
  inner = next ? inner.slice(0, next.index) + newCell + inner.slice(next.index) : inner + newCell;
  return xml.replace(rowRe, `<row r="${row}"${rowMatch[1]}>${inner}</row>`);
}

// Find the XML file for a sheet by its tab name.
async function sheetPath(zip, sheetName) {
  const wb = await zip.file("xl/workbook.xml").async("string");
  const rels = await zip.file("xl/_rels/workbook.xml.rels").async("string");
  const esc = xmlEsc(sheetName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = wb.match(new RegExp(`<sheet [^>]*name="${esc}"[^>]*r:id="([^"]+)"`));
  if (!m) throw new Error(`Sheet "${sheetName}" not found in template`);
  const rel = rels.match(new RegExp(`<Relationship [^>]*Id="${m[1]}"[^>]*>`))[0];
  const target = rel.match(/Target="([^"]+)"/)[1];
  return target.startsWith("/") ? target.slice(1) : "xl/" + target;
}

async function fillSheet(zip, sheetName, cells) {
  const path = await sheetPath(zip, sheetName);
  let xml = await zip.file(path).async("string");
  for (const [ref, val] of Object.entries(cells)) xml = setCell(xml, ref, val);
  zip.file(path, xml);
}

// "Integrated Control & Electrical" tab: electrical panel + one control row per system (Unit 1 = row 27 ...).
function integratedControlCells(f, controls) {
  const cells = {
    C16: num(f.breakerAmps),
    D16: f.panelUpgrade,
    F16: f.panelUpgrade === "Yes" ? num(f.panelCost) : undefined,
  };
  if (f.fossilRemains !== "Yes") return cells;
  (controls || []).slice(0, 10).forEach((c, k) => {   // Unit 1 = row 27 … Unit 10 = row 36
    const r = 27 + k;
    Object.assign(cells, {
      [`C${r}`]: c.type,
      [`E${r}`]: c.mfr,
      [`F${r}`]: c.model,
      [`G${r}`]: c.serial,
    });
  });
  return cells;
}

// "Water Heating Worksheet" tab — only when the job includes water heating.
function waterHeatingCells(f) {
  if (f.waterInclude !== "Yes") return {};
  if (f.waterKind === "Heat Pump Water Heater") return {
    D18: num(f.whId),        // ENERGY STAR ID -> workbook looks up type, brand, model, UEF
    G18: f.whExisting,
    G22: f.whSerial,
    G24: f.whInvoice,
    G26: num(f.whCost),
  };
  if (f.waterKind === "GSHP Dedicated Water Heating") return {
    D35: f.gsType, G35: f.gsExisting,
    D37: num(f.gsBtuh), G37: num(f.gsTank),
    D39: f.gsMfr, G39: num(f.gsCop),
    D41: f.gsModel, G41: f.gsSupp,
    D43: f.gsSerial, G43: num(f.gsCost),
  };
  return {};
}

async function buildHomeComfortXlsx(job, company) {
  const zip = await JSZip.loadAsync(await fetchBytes(TEMPLATES.homeComfort));
  await fillSheet(zip, "Customer Information", customerInfoCells(job.f, company));
  await fillSheet(zip, "ASHP Equipment Information", ashpCells(job.f, job.systems));
  await fillSheet(zip, "Integrated Control & Electrical", integratedControlCells(job.f, job.controls));
  const water = waterHeatingCells(job.f);
  if (Object.keys(water).length) await fillSheet(zip, "Water Heating Worksheet", water);

  // Force Excel to recalculate EVERY formula when the file is opened, so the
  // equipment details, Manual J pass/fail, rebates and Equipment Summary all
  // update from the AHRI numbers. Two switches, because Excel skips the
  // recalculation if it thinks the file was last calculated by the same version:
  //   fullCalcOnLoad="1"  -> "recalculate everything on load"
  //   calcId (old value)  -> "last calculated by an older Excel", so it must recalc
  //   calcMode="auto"     -> in case the template was saved in manual mode
  let wb = await zip.file("xl/workbook.xml").async("string");
  wb = wb.replace(/<calcPr[^>]*?\/>/, '<calcPr calcId="124519" calcMode="auto" fullCalcOnLoad="1"/>');
  zip.file("xl/workbook.xml", wb);

  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

// -------------------------------------------------------------
//  PDFs
// -------------------------------------------------------------
async function fillPdf(path, setter) {
  const pdf = await PDFLib.PDFDocument.load(await fetchBytes(path));
  const form = pdf.getForm();
  const txt = (name, value, size) => {
    if (value === undefined || value === null || value === "") return;
    try {
      const field = form.getTextField(name);
      // Fields set to "auto" font size blow up in short boxes; pin them to a normal size.
      const da = field.acroField.getDefaultAppearance() || "";
      try {
        if (size) field.setFontSize(size);
        else if (/\s0(\.0+)?\s+Tf/.test(" " + da)) field.setFontSize(9);
      } catch { /* field has no font info — keep its default size */ }
      field.setText(String(value));
    }
    catch (e) { console.warn("PDF field not set:", name, e.message); }
  };
  const radio = (name, option) => {
    if (!option) return;
    try { form.getRadioGroup(name).select(option); }
    catch (e) { console.warn("PDF radio not set:", name, e.message); }
  };
  // Some boxes in PSEG's PDFs aren't real form fields, so we draw an "X" at that spot instead.
  const markX = (x, y) => pdf.getPage(0).drawText("X", { x, y, size: 10 });
  const check = (name) => {
    try { form.getCheckBox(name).check(); }
    catch (e) { console.warn("PDF checkbox not set:", name, e.message); }
  };
  setter({ txt, radio, markX, check });
  return pdf.save(); // fields stay editable so you can fix anything before sending
}

// NYSERDA / EFS Residential Household Income Screening application.
// Sections A, C and D are filled; the customer completes household income (Section E) and signs.
function buildIncomeScreening(job, company) {
  const f = job.f;
  const OCC = { "Owner Occupied": "Choice1", "Rental Unit": "Choice2" };
  const UNITS = { "Single Family": "Choice1", "2-Family Home": "Choice2", "3-Family Home": "Choice3", "4-Family Home": "Choice4", "Mobile Home": "Choice5" };
  const PAID = { Owner: "Choice1", Tenant: "Choice2" };
  return fillPdf(TEMPLATES.income, ({ txt, radio, check }) => {
    txt("First Name", f.firstName);
    txt("Last Name", f.lastName);
    txt("Primary Phone No", f.cellPhone || f.homePhone);
    txt("Ext", f.phoneExt);
    txt("Email Address", f.email);
    txt("Street", f.street);
    txt("Unit", f.unit);
    txt("City", f.city);
    txt("State", "NY");
    txt("Zip", f.zip);
    txt("County", f.county);
    radio("Occupancy", OCC[f.occupancy]);
    radio("Number of Units", UNITS[f.units]);
    // Section B — only when the property owner is someone else
    if (f.ownerDifferent === "Yes") {
      txt("First Name_2", f.ownerFirst);
      txt("Last Name_2", f.ownerLast);
      txt("Primary Phone No_2", f.ownerPhone);
      txt("Ext_2", f.ownerExt);
      txt("Email Address_2", f.ownerEmail);
      txt("Mailing Address if different than installation address", f.ownerMailing);
      txt("Unit_2", f.ownerUnit);
      txt("City_2", f.ownerCity);
      txt("State_2", f.ownerState);
      txt("Zip_2", f.ownerZip);
      txt("County_2", f.ownerCounty);
    }
    txt("Contractor Name if known", company.companyName);
    txt("ConstituencyBased Organization Name if applicable", f.cbo);
    txt("Electric Utility Name", "PSEG Long Island");
    txt("Account Number", f.account);
    txt("Name on Account", accountName(f));
    radio("Electricity Paid", PAID[f.elecPaidBy]);
    txt("Natural Gas Utility Name if applicable", f.gasUtility);
    txt("Account Number_2", f.gasAccount);
    txt("Name on Account_2", f.gasAccount ? (f.gasName || accountName(f)) : "");
    radio("Heat Paid", PAID[f.heatPaidBy]);

    // Section E — household income table
    const hh = job.household || { earners: [], members: [] };
    const money = (v) => (v === "" || v == null ? "" : Number(String(v).replace(/[$,]/g, "")).toLocaleString());
    hh.earners.slice(0, 4).forEach((e, i) => {
      const k = i + 1;
      txt(`First NameHousehold Inocome Row${k}`, e.first, 9);   // (sic — PDF's own field name)
      txt(`Last NameHousehold Income Earner ${k}`, e.last);
      txt(`AgeHousehold Income Earner ${k}`, e.age);
      txt(`Full Time Student YNHousehold Income Earner ${k}`, e.student);
      (e.incomes || []).slice(0, 3).forEach((inc, j) => {
        txt(`Income Type ex WagesHousehold Income Earner ${k}${["", "_2", "_3"][j]}`, inc.type);
        txt(`fill_${43 + 3 * i + j}`, money(inc.amount));
      });
    });
    const memberFirst = ["Household Income Earner 4Row1", "Household Income Earner 4Row2", "Household Income Earner 4Row3",
      "Household Income Earner 4Row4", "Household Income Earner 5Row5"];
    hh.members.slice(0, 5).forEach((m, i) => {
      txt(memberFirst[i], m.first, 9);
      txt(`Last NameRow${5 + i}`, m.last);
      txt(`AgeRow${5 + i}`, m.age);
    });
    // Always earners + non-income members, so the total matches the table.
    const filled = (r) => !!(r.first || r.last || r.age);
    const counted = hh.earners.slice(0, 4).filter(filled).length + hh.members.slice(0, 5).filter(filled).length;
    txt("Total number of people in the household", counted ? String(counted) : "");
    if (f.nyserdaProgram === "Yes") check("NYSERDA");
  });
}

// PSEG Long Island Assignment Letter (rebate paid to the contractor).
function buildAssignmentLetter(job, company) {
  const f = job.f;
  return fillPdf(TEMPLATES.assignment, ({ txt, markX }) => {
    txt("Text1", f.account);
    if (!f.account && f.buildingType === "New Construction") markX(374.5, 676.5); // "New Construction" box
    else if (!f.account) markX(477.3, 676.5);                                     // "Awaiting Account Number" box
    txt("Text2", accountName(f));
    txt("Text3", f.email);
    txt("Text4", f.cellPhone || f.homePhone);
    txt("Text5", usDate(todayISO()));
    txt("Text6", accountName(f));                // customer name (signature block)
    txt("Text11", company.companyName);          // assignee company
    txt("Text12", company.contactName);          // assignee authorized representative
    txt("Text14", company.contactTitle);         // assignee title
    // Signatures and signature dates are left blank on purpose.
  });
}

// PSEG Long Island Project Completion Certification (after install is 100% complete).
function buildCompletionCert(job, company) {
  const f = job.f;
  return fillPdf(TEMPLATES.completion, ({ txt }) => {
    txt("Text1", f.account);
    txt("Text2", f.projectNumber);
    txt("Text3", streetLine(f));
    txt("Text4", f.city);
    txt("Text5", f.zip);
    txt("Text6", accountName(f));
    txt("Text7", f.cellPhone || f.homePhone);
    txt("Text8", f.email);
    txt("Text9", usDate(f.installDate));
    txt("Text10", f.estRebate ? `$${Number(String(f.estRebate).replace(/[$,]/g, "")).toLocaleString()}` : "");
    txt("Text11", accountName(f));               // customer printed name
    txt("Text13", company.contactName);          // contractor printed name
  });
}

window.FILL = {
  buildHomeComfortXlsx, buildIncomeScreening, buildAssignmentLetter, buildCompletionCert,
  setCell, usDate, todayISO, fullName, accountName,
};
