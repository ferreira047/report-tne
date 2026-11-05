// Ajuste estas constantes caso o layout ou os valores da planilha mudem.
// As duas planilhas são extrações do TOA, com as mesmas colunas do Report Backlog.
const COLUMNS = {
  bucket: "A",
  tsk: "B",
  type: "D",
  status: "E",
  uf: "K",
  cm: "AK",
  neId: "CF",
  criterion: "GD",
  priority: "GI"
};
const TARGET_TYPE = "Planta Interna - Manutenção Corretiva";
const REPEATED_CRITERION = "Repetido";
const NOT_STARTED_STATUS = "Não iniciado";

// storageKey: onde a planilha fica guardada na sessão (shared-file.js) para voltar após o F5.
// A ONLINE usa a chave compartilhada com o Backlog e a Análise de técnicos; a NÃO AGENDADAS, uma só desta página.
const SOURCES = {
  online: { label: "Online", storageKey: SHARED_FILE_KEY },
  unscheduled: { label: "Não agendadas", storageKey: "reportFilaTecTNE.naoAgendadas" }
};

// Estado pela sigla do CM (TNE-AL-…); sem CM reconhecido, pela coluna UF. Ordem: TNE 1, depois TNE 2.
const STATES = {
  AL: "ALAGOAS",
  BA: "BAHIA",
  PI: "PIAUÍ",
  SE: "SERGIPE",
  CE: "CEARÁ",
  PB: "PARAÍBA",
  PE: "PERNAMBUCO",
  RN: "RIO GRANDE DO NORTE"
};
const OTHER_STATE = "Outros";
const STATE_GROUP_DESCRIPTIONS = {
  all: "TSKs repetidas de Planta Interna, agrupadas pelo estado do CM (coluna AK).",
  technician: "Somente TSKs repetidas da fila técnica, agrupadas pelo estado do CM (coluna AK).",
  commandCenter: "Somente TSKs repetidas do Centralizado, agrupadas pelo estado do CM (coluna AK)."
};
let currentStateGroup = "all";

const feedback = document.getElementById("feedback");
const results = document.getElementById("results");
const clearButton = document.getElementById("clear-button");
let currentFilter = "all";
// Estado (UF do CM) escolhido no filtro da tabela; vazio mostra todos.
let currentStateFilter = "";
// Status (coluna E, normalizado) escolhido no filtro da tabela; vazio mostra todos.
// Abre sempre em "Não iniciado".
const DEFAULT_STATUS_FILTER = normalizeText(NOT_STARTED_STATUS);
let currentStatusFilter = DEFAULT_STATUS_FILTER;
let currentTickets = [];

// Estado de cada campo de upload (ONLINE e NÃO AGENDADAS).
const slots = Object.fromEntries(Object.keys(SOURCES).map((key) => [key, {
  key,
  input: document.getElementById(`file-input-${key}`),
  zone: document.getElementById(`drop-zone-${key}`),
  meta: document.getElementById(`file-meta-${key}`),
  pickerWrap: document.getElementById(`sheet-picker-wrap-${key}`),
  picker: document.getElementById(`sheet-picker-${key}`),
  workbook: null,
  fileName: "",
  analysis: null
}]));

// Comparações de cabeçalho e critério ignoram acentos, caixa e espaços excedentes.
function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

function columnIndex(columnLetters) {
  return columnLetters.toUpperCase().split("").reduce((index, letter) => index * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function showFeedback(message, kind = "error") {
  const styles = kind === "error"
    ? "border-[color:var(--error-line)] bg-[color:var(--error-bg)] text-[color:var(--error-ink)]"
    : "border-[color:var(--ok-line)] bg-[color:var(--ok-bg)] text-[color:var(--ok-ink)]";
  feedback.className = `mt-4 rounded-sm border px-4 py-3 text-sm ${styles}`;
  feedback.textContent = message;
  feedback.classList.remove("hidden");
}

function hideFeedback() {
  feedback.textContent = "";
  feedback.className = "mt-4 hidden rounded-sm border px-4 py-3 text-sm";
}

function isSupportedFile(file) {
  return /\.(xlsx|xls|csv)$/i.test(file.name);
}

// fromShared: planilha guardada na sessão (importada antes nesta ou em outra página).
async function loadFile(slot, file, fromShared = false) {
  clearSlot(slot, false);
  if (!file) return render();
  slot.fileName = file.name;
  const label = SOURCES[slot.key].label;
  if (!isSupportedFile(file)) return render(`${label}: arquivo inválido. Selecione uma planilha .xlsx, .xls ou .csv.`);
  if (file.size === 0) return render(`${label}: o arquivo está vazio. Selecione uma planilha com dados.`);
  if (!window.XLSX) return render("Não foi possível carregar o leitor de planilhas. Verifique sua conexão e recarregue a página.");

  try {
    slot.workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
    if (!slot.workbook.SheetNames.length) throw new Error("O arquivo não contém abas para leitura.");
  } catch (error) {
    slot.workbook = null;
    return render(`${label}: não foi possível ler o arquivo. Confirme se ele é uma planilha válida. ${error.message || ""}`.trim());
  }
  if (!fromShared) saveSharedFile(file, SOURCES[slot.key].storageKey);
  const sharedNote = fromShared && SOURCES[slot.key].storageKey === SHARED_FILE_KEY ? " · mesma planilha do Report Backlog" : "";
  slot.meta.textContent = `Arquivo: ${file.name}${sharedNote}`;
  slot.meta.classList.remove("hidden");
  slot.zone.dataset.loaded = "true";
  if (slot.workbook.SheetNames.length > 1) {
    slot.picker.replaceChildren(...slot.workbook.SheetNames.map((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      return option;
    }));
    // Extração do TOA: abre na aba "Page 1" quando ela existe.
    slot.picker.value = slot.workbook.SheetNames.find((name) => normalizeText(name) === "page 1") || slot.workbook.SheetNames[0];
    slot.pickerWrap.classList.remove("hidden");
  }
  analyzeSlot(slot);
}

// Lê a aba escolhida e guarda as TSKs de Planta Interna com "Repetido" na coluna Critério (uma linha por TSK).
// Uma TSK com várias atividades conta como não iniciada se alguma delas estiver em "Não iniciado".
function analyzeSlot(slot) {
  const sheetName = slot.picker.value || slot.workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(slot.workbook.Sheets[sheetName], { header: 1, defval: "", raw: false });
  const index = Object.fromEntries(Object.entries(COLUMNS).map(([key, letter]) => [key, columnIndex(letter)]));
  const tickets = new Map();
  let dataRows = 0;
  for (const [rowNumber, row] of rows.entries()) {
    if (rowNumber === 0 || normalizeText(row[index.type]) !== normalizeText(TARGET_TYPE)) continue;
    dataRows += 1;
    if (normalizeText(row[index.criterion]) !== normalizeText(REPEATED_CRITERION)) continue;
    const tsk = String(row[index.tsk] ?? "").trim() || `Linha ${rowNumber + 1}`;
    const ticket = Object.fromEntries(Object.keys(COLUMNS).map((key) => [key, String(row[index[key]] ?? "").trim()]));
    ticket.notStarted = normalizeText(ticket.status) === normalizeText(NOT_STARTED_STATUS);
    const existing = tickets.get(tsk);
    if (!existing) tickets.set(tsk, ticket);
    else if (ticket.notStarted && !existing.notStarted) Object.assign(existing, { status: ticket.status, notStarted: true });
  }
  slot.analysis = { sheetName, dataRows, tickets };
  render();
}

// Junta as TSKs repetidas das duas planilhas; os dados da ONLINE têm prioridade, mas
// a TSK fica como não iniciada se estiver em "Não iniciado" em qualquer uma delas.
function mergeTickets() {
  const merged = new Map();
  for (const slot of Object.values(slots)) {
    if (!slot.analysis) continue;
    for (const [tsk, ticket] of slot.analysis.tickets) {
      const entry = merged.get(tsk) || { ...ticket, tsk, sources: [] };
      entry.sources.push(slot.key);
      if (ticket.notStarted && !entry.notStarted) Object.assign(entry, { status: ticket.status, notStarted: true });
      merged.set(tsk, entry);
    }
  }
  return [...merged.values()].sort((a, b) =>
    Number(b.notStarted) - Number(a.notStarted)
    || a.priority.localeCompare(b.priority, "pt-BR", { numeric: true })
    || a.tsk.localeCompare(b.tsk, "pt-BR"));
}

function filterTickets(tickets) {
  const byState = tickets.filter((ticket) => (!currentStateFilter || ticketState(ticket) === currentStateFilter)
    && (!currentStatusFilter || normalizeText(ticket.status) === currentStatusFilter));
  if (currentFilter === "notStarted") return byState.filter((ticket) => ticket.notStarted);
  if (currentFilter === "all") return byState;
  return byState.filter((ticket) => ticket.sources.includes(currentFilter));
}

// Opções do filtro de status: os status das TSKs carregadas ("pendente" e "Pendente" viram um só).
function renderStatusOptions() {
  const statusFilter = document.getElementById("status-filter");
  // "Não iniciado" fica sempre na lista, mesmo sem TSK nesse status.
  const statuses = new Map([[DEFAULT_STATUS_FILTER, NOT_STARTED_STATUS]]);
  for (const ticket of currentTickets) {
    const key = normalizeText(ticket.status);
    if (key && !statuses.has(key)) statuses.set(key, ticket.status.charAt(0).toLocaleUpperCase("pt-BR") + ticket.status.slice(1));
  }
  if (!statuses.has(currentStatusFilter)) currentStatusFilter = "";
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "Todos os status";
  statusFilter.replaceChildren(allOption, ...[...statuses]
    .sort(([, a], [, b]) => a.localeCompare(b, "pt-BR"))
    .map(([key, label]) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = label;
      return option;
    }));
  statusFilter.value = currentStatusFilter;
}

function renderTable() {
  const tickets = filterTickets(currentTickets);
  const body = document.getElementById("repeated-rows");
  if (!tickets.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 7;
    cell.className = "px-5 py-6 text-center text-sm text-[color:var(--muted)]";
    cell.textContent = "Nenhum chamado repetido neste filtro.";
    row.append(cell);
    body.replaceChildren(row);
  } else {
    body.replaceChildren(...tickets.map((ticket) => {
      const row = document.createElement("tr");
      row.className = "hover:bg-[color:var(--hover)]";
      const cells = [
        ["tsk", "tabular font-semibold text-[color:var(--ink)]"],
        ["bucket", "text-[color:var(--ink-3)]"],
        ["status", "text-[color:var(--ink-3)]"],
        ["neId", "tabular text-[color:var(--ink-3)]"],
        ["cm", "text-[color:var(--ink-3)]"],
        ["uf", "text-[color:var(--ink-3)]"],
        ["priority", "tabular text-[color:var(--ink-3)]"]
      ];
      row.append(...cells.map(([key, className]) => {
        const cell = document.createElement("td");
        cell.className = `px-4 py-2.5 ${className}`;
        cell.textContent = ticket[key] || "—";
        return cell;
      }));
      return row;
    }));
  }
  document.getElementById("table-total").textContent = `${tickets.length} TSK(s)`;
  for (const button of document.querySelectorAll(".filter-button")) {
    button.setAttribute("aria-pressed", String(button.dataset.filter === currentFilter));
  }
}

// Buckets TLP-T<número> são da fila técnica; os demais, do Centralizado (mesma regra do backlog).
// Aceita espaço depois do hífen, como em "TLP- T3751680-…" na extração do TOA.
function isTechnicianBucket(bucket) {
  return /^TLP-\s*T\d+(?:-|$)/.test(String(bucket ?? "").trim().toLocaleUpperCase("pt-BR"));
}

function ticketState(ticket) {
  const code = /^TNE-([A-Z]{2})-/.exec(ticket.cm.toUpperCase())?.[1] || ticket.uf.toUpperCase();
  return STATES[code] || OTHER_STATE;
}

function renderStateSummary() {
  const rows = document.getElementById("state-rows");
  const foot = document.getElementById("state-foot");
  document.getElementById("state-description").textContent = STATE_GROUP_DESCRIPTIONS[currentStateGroup];
  for (const button of document.querySelectorAll(".state-group-button")) {
    button.setAttribute("aria-pressed", String(button.dataset.stateGroup === currentStateGroup));
  }
  const tickets = currentTickets.filter((ticket) => currentStateGroup === "all"
    || isTechnicianBucket(ticket.bucket) === (currentStateGroup === "technician"));
  const emptyCounts = () => ({ online: 0, unscheduled: 0, notStarted: 0, total: 0 });
  const counts = new Map([...Object.values(STATES), OTHER_STATE].map((state) => [state, emptyCounts()]));
  for (const ticket of tickets) {
    const stateCounts = counts.get(ticketState(ticket));
    for (const key of ticket.sources) stateCounts[key] += 1;
    if (ticket.notStarted) stateCounts.notStarted += 1;
    stateCounts.total += 1;
  }

  const columns = [
    ["online", "text-[color:var(--green)]", "px-2"],
    ["unscheduled", "text-[color:var(--orange)]", "px-2"],
    ["notStarted", "text-[color:var(--red)]", "px-2"],
    ["total", "text-[color:var(--ink)]", "px-5"]
  ];
  const buildRow = (label, stateCounts, isTotal = false) => {
    const row = document.createElement("tr");
    const labelCell = document.createElement(isTotal ? "th" : "td");
    if (isTotal) labelCell.scope = "row";
    labelCell.className = `px-5 py-2.5 ${isTotal ? "text-[color:var(--ink)]" : "text-[color:var(--ink-4)]"}`;
    labelCell.textContent = label;
    row.append(labelCell);
    for (const [key, color, padding] of columns) {
      const cell = document.createElement("td");
      cell.className = `tabular ${padding} py-2.5 text-right font-semibold ${color}`;
      const unavailable = slots[key]?.analysis === null;
      cell.textContent = unavailable ? "—" : stateCounts[key].toLocaleString("pt-BR");
      row.append(cell);
    }
    return row;
  };

  foot.replaceChildren();
  // Os estados da TNE aparecem sempre; "Outros" só quando tem TSK.
  const filled = [...counts].filter(([state, stateCounts]) => state !== OTHER_STATE || stateCounts.total);
  if (!tickets.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.className = "px-5 py-6 text-center text-sm text-[color:var(--muted)]";
    cell.textContent = "Nenhuma TSK repetida neste grupo.";
    row.append(cell);
    rows.replaceChildren(row);
    return;
  }
  rows.replaceChildren(...filled.map(([state, stateCounts]) => buildRow(state, stateCounts)));
  const total = emptyCounts();
  for (const [, stateCounts] of filled) {
    for (const key of Object.keys(total)) total[key] += stateCounts[key];
  }
  foot.append(buildRow("Total", total, true));
}

function render(errorMessage = "") {
  const loaded = Object.values(slots).filter((slot) => slot.analysis);
  const anyFile = Object.values(slots).some((slot) => slot.fileName);
  clearButton.classList.toggle("hidden", !anyFile);
  clearButton.classList.toggle("inline-flex", anyFile);

  if (errorMessage) showFeedback(errorMessage);
  else if (loaded.some((slot) => !slot.analysis.dataRows)) {
    showFeedback(loaded.filter((slot) => !slot.analysis.dataRows).map((slot) =>
      `${SOURCES[slot.key].label}: nenhuma linha de "${TARGET_TYPE}" na coluna ${COLUMNS.type} da aba "${slot.analysis.sheetName}".`
    ).join(" "));
  } else if (loaded.length) {
    showFeedback(loaded.map((slot) =>
      `${SOURCES[slot.key].label}: ${slot.analysis.tickets.size} TSK(s) repetida(s) em ${slot.analysis.dataRows} linha(s) de Planta Interna da aba "${slot.analysis.sheetName}".`
    ).join(" "), "ok");
  } else hideFeedback();

  if (!loaded.length) {
    currentTickets = [];
    results.classList.add("hidden");
    return;
  }
  currentTickets = mergeTickets();
  document.getElementById("count-total").textContent = currentTickets.length;
  results.classList.remove("hidden");
  renderStateSummary();
  renderStatusOptions();
  renderTable();
}

function exportRepeated() {
  const tickets = filterTickets(currentTickets);
  if (!tickets.length || !window.XLSX) return;
  const rows = tickets.map((ticket) => ({
    TSK: ticket.tsk,
    Planilha: ticket.sources.map((key) => SOURCES[key].label).join(" + "),
    Provedor: ticket.bucket,
    Status: ticket.status,
    "NE ID": ticket.neId,
    CM: ticket.cm,
    UF: ticket.uf,
    Prioridade: ticket.priority
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = [18, 22, 40, 14, 12, 22, 6, 11].map((wch) => ({ wch }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Repetidos");
  XLSX.writeFile(book, `chamados-repetidos-TNE-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function clearSlot(slot, clearFileInput = true) {
  slot.workbook = null;
  slot.analysis = null;
  slot.fileName = "";
  slot.meta.classList.add("hidden");
  slot.pickerWrap.classList.add("hidden");
  delete slot.zone.dataset.loaded;
  if (clearFileInput) slot.input.value = "";
}

for (const slot of Object.values(slots)) {
  slot.input.addEventListener("change", (event) => loadFile(slot, event.target.files[0]));
  slot.picker.addEventListener("change", () => analyzeSlot(slot));
  slot.zone.addEventListener("click", () => slot.input.click());
  slot.zone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      slot.input.click();
    }
  });
  slot.zone.addEventListener("dragover", (event) => {
    event.preventDefault();
    slot.zone.classList.add("is-dragging");
  });
  slot.zone.addEventListener("dragleave", () => slot.zone.classList.remove("is-dragging"));
  slot.zone.addEventListener("drop", (event) => {
    event.preventDefault();
    slot.zone.classList.remove("is-dragging");
    loadFile(slot, event.dataTransfer.files[0]);
  });
}
for (const button of document.querySelectorAll(".filter-button")) {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    renderTable();
  });
}
const stateFilter = document.getElementById("state-filter");
stateFilter.append(...[...Object.values(STATES), OTHER_STATE].map((state) => {
  const option = document.createElement("option");
  option.value = state;
  // "RIO GRANDE DO NORTE" → "Rio Grande do Norte".
  option.textContent = state.toLocaleLowerCase("pt-BR").replace(/(^|\s)(?!do\s)(\S)/g, (_, space, letter) => space + letter.toLocaleUpperCase("pt-BR"));
  return option;
}));
stateFilter.addEventListener("change", () => {
  currentStateFilter = stateFilter.value;
  renderTable();
});
document.getElementById("status-filter").addEventListener("change", (event) => {
  currentStatusFilter = event.target.value;
  renderTable();
});
document.getElementById("export-button").addEventListener("click", exportRepeated);
clearButton.addEventListener("click", () => {
  for (const slot of Object.values(slots)) {
    clearSlot(slot);
    clearSharedFile(SOURCES[slot.key].storageKey);
  }
  currentFilter = "all";
  currentStateFilter = "";
  stateFilter.value = "";
  currentStatusFilter = DEFAULT_STATUS_FILTER;
  currentStateGroup = "all";
  render();
});
for (const button of document.querySelectorAll(".state-group-button")) {
  button.addEventListener("click", () => {
    currentStateGroup = button.dataset.stateGroup;
    renderStateSummary();
  });
}

// Planilhas guardadas na sessão: a ONLINE pode vir do Report Backlog ou da Análise de técnicos.
for (const slot of Object.values(slots)) {
  const storedFile = loadSharedFile(SOURCES[slot.key].storageKey);
  if (storedFile) loadFile(slot, storedFile, true);
}
