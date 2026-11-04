// Ajuste estas constantes caso o layout ou os valores da planilha mudem.
// As duas planilhas são extrações do TOA, com as mesmas colunas do Report Backlog.
const COLUMNS = {
  bucket: "A",
  tsk: "B",
  type: "D",
  status: "E",
  uf: "K",
  slaEnd: "U",
  cm: "AK",
  neId: "CF",
  criterion: "GD",
  priority: "GI"
};
const TARGET_TYPE = "Planta Interna - Manutenção Corretiva";
const REPEATED_CRITERION = "Repetido";

const SOURCES = {
  online: { label: "Online" },
  unscheduled: { label: "Não agendadas" }
};
// Campo que usa a planilha compartilhada entre as páginas (shared-file.js).
const SHARED_SOURCE = "online";

const feedback = document.getElementById("feedback");
const results = document.getElementById("results");
const clearButton = document.getElementById("clear-button");
let currentFilter = "all";
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

// fromShared: planilha importada no Backlog ou na Análise de técnicos (mesma aba do navegador).
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
  // Só a ONLINE é a extração do dia compartilhada com as outras páginas.
  if (slot.key === SHARED_SOURCE && !fromShared) saveSharedFile(file);
  slot.meta.textContent = `Arquivo: ${file.name}${fromShared ? " · mesma planilha do Report Backlog" : ""}`;
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
    if (tickets.has(tsk)) continue;
    tickets.set(tsk, Object.fromEntries(Object.keys(COLUMNS).map((key) => [key, String(row[index[key]] ?? "").trim()])));
  }
  slot.analysis = { sheetName, dataRows, tickets };
  render();
}

// Junta as TSKs repetidas das duas planilhas; os dados da ONLINE têm prioridade.
function mergeTickets() {
  const merged = new Map();
  for (const slot of Object.values(slots)) {
    if (!slot.analysis) continue;
    for (const [tsk, ticket] of slot.analysis.tickets) {
      const entry = merged.get(tsk) || { ...ticket, tsk, sources: [] };
      entry.sources.push(slot.key);
      merged.set(tsk, entry);
    }
  }
  return [...merged.values()].sort((a, b) =>
    b.sources.length - a.sources.length
    || a.priority.localeCompare(b.priority, "pt-BR", { numeric: true })
    || a.tsk.localeCompare(b.tsk, "pt-BR"));
}

function filterTickets(tickets) {
  if (currentFilter === "both") return tickets.filter((ticket) => ticket.sources.length === 2);
  if (currentFilter === "all") return tickets;
  return tickets.filter((ticket) => ticket.sources.includes(currentFilter));
}

function sourceBadges(sources) {
  return sources.map((key) => {
    const badge = document.createElement("span");
    badge.className = key === "online"
      ? "inline-flex rounded-sm bg-[color:var(--green-soft)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--green)]"
      : "inline-flex rounded-sm bg-[color:var(--orange-soft)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--orange)]";
    badge.textContent = SOURCES[key].label;
    return badge;
  });
}

function renderTable() {
  const tickets = filterTickets(currentTickets);
  const body = document.getElementById("repeated-rows");
  if (!tickets.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 9;
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
        ["sources", ""],
        ["bucket", "text-[color:var(--ink-3)]"],
        ["status", "text-[color:var(--ink-3)]"],
        ["neId", "tabular text-[color:var(--ink-3)]"],
        ["cm", "text-[color:var(--ink-3)]"],
        ["uf", "text-[color:var(--ink-3)]"],
        ["priority", "tabular text-[color:var(--ink-3)]"],
        ["slaEnd", "tabular whitespace-nowrap text-[color:var(--ink-3)]"]
      ];
      row.append(...cells.map(([key, className]) => {
        const cell = document.createElement("td");
        cell.className = `px-4 py-2.5 ${className}`;
        if (key === "sources") {
          const wrap = document.createElement("div");
          wrap.className = "flex flex-wrap gap-1";
          wrap.append(...sourceBadges(ticket.sources));
          cell.append(wrap);
        } else {
          cell.textContent = ticket[key] || "—";
        }
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
  for (const key of Object.keys(SOURCES)) {
    const analysis = slots[key].analysis;
    document.getElementById(`count-${key}`).textContent = analysis ? analysis.tickets.size : "—";
    document.getElementById(`count-${key}-note`).textContent = analysis
      ? `de ${analysis.dataRows} chamados de Planta Interna`
      : "Planilha não anexada";
  }
  document.getElementById("count-both").textContent = loaded.length === 2
    ? currentTickets.filter((ticket) => ticket.sources.length === 2).length
    : "—";
  document.getElementById("count-total").textContent = currentTickets.length;
  results.classList.remove("hidden");
  renderTable();
}

function exportRepeated() {
  const tickets = filterTickets(currentTickets);
  if (!tickets.length || !window.XLSX) return;
  const rows = tickets.map((ticket) => ({
    TSK: ticket.tsk,
    Planilha: ticket.sources.map((key) => SOURCES[key].label).join(" + "),
    Provedor: ticket.bucket,
    Estado: ticket.status,
    "NE ID": ticket.neId,
    CM: ticket.cm,
    UF: ticket.uf,
    Prioridade: ticket.priority,
    "Fim SLA": ticket.slaEnd
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = [18, 22, 40, 14, 12, 22, 6, 11, 16].map((wch) => ({ wch }));
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
document.getElementById("export-button").addEventListener("click", exportRepeated);
clearButton.addEventListener("click", () => {
  for (const slot of Object.values(slots)) clearSlot(slot);
  clearSharedFile();
  currentFilter = "all";
  render();
});

// Planilha importada no Report Backlog ou na Análise diária de técnicos (mesma aba do navegador).
const sharedFile = loadSharedFile();
if (sharedFile) loadFile(slots[SHARED_SOURCE], sharedFile, true);
