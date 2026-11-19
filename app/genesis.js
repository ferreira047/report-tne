// Report Genesis TNE: substitui a planilha Gera-Reports_online.xlsm.
// Lê a extração do Painel Online do Genesis, calcula dias, aging, tecnologia e região,
// define o responsável (coluna RESPONSAVEL do arquivo ou sugestão pela causa) e monta os
// resumos que antes eram as tabelas dinâmicas. Tudo roda no navegador.

// Ajuste estas constantes caso o layout ou os valores da extração mudem.
// As colunas são lidas pelo nome do cabeçalho (sem diferenciar maiúsculas e acentos), não pela letra.
const COLUMNS = {
  horario: "horario",
  site: "site",
  tecnologia: "tecnologia",
  uf: "uf",
  anf: "anf",
  causa: "causa",
  eveCrq: "eve_crq",
  eveCrqLink: "eve_crq_link",
  status: "status",
  regional: "regional"
};
// Coluna preenchida à mão na planilha antiga; se vier no arquivo, os valores dela são usados.
const COLUMN_RESPONSIBLE = "RESPONSAVEL";
// Colunas calculadas da planilha antiga (AL:AN): a página recalcula e não as repete no Excel.
const LEGACY_CALCULATED_COLUMNS = ["CALCULO_DIA", "AGING", "TEC_FILTER"];
// O cabeçalho é a primeira linha (entre as primeiras HEADER_SEARCH_ROWS) com a célula "horario".
const HEADER_SEARCH_ROWS = 30;

// Chaves próprias desta página no sessionStorage (não é a mesma extração do TOA das outras páginas).
const GENESIS_FILE_KEY = "reportFilaTecTNE.genesis";
const RESPONSIBLE_EDITS_KEY = "reportFilaTecTNE.genesis.responsaveis";

// Faixas de aging pelos dias desde o horário do evento (dias < maxDays), nesta ordem.
const AGING_BUCKETS = [
  { label: "<1d", maxDays: 1 },
  { label: "Entre 1d e 3d", maxDays: 3 },
  { label: "Entre 3d e 5d", maxDays: 5 },
  { label: "Entre 5d e 10d", maxDays: 10 },
  { label: ">10d", maxDays: Infinity }
];
const OVER_10_DAYS = ">10d";

// Só estas tecnologias entram no report (o 2G fica fora). Tecnologia = 1º caractere + "G".
const REPORT_TECHNOLOGIES = ["3G", "4G", "5G"];
// Região pela UF, mesma divisão do restante do projeto.
const REGIONS = {
  "TNE 1": ["AL", "BA", "PI", "SE"],
  "TNE 2": ["CE", "PB", "PE", "RN"]
};

// Responsáveis que entram no report, nesta ordem. Linhas sem responsável ficam fora das tabelas.
// A TLP entra como mais uma linha (na planilha antiga ela ficava fora das tabelas dinâmicas).
const REPORT_RESPONSIBLES = ["EM ANALISE", "IMPLANTAÇÃO", "PROVEDOR", "REGIONAL", "TLP"];
const PROVIDER_RESPONSIBLE = "PROVEDOR";
const EXTRA_RESPONSIBLE_OPTIONS = [];
// Quando o arquivo não traz a coluna RESPONSAVEL (ex.: painel_online.csv baixado do Genesis),
// o responsável vem primeiro da etiqueta que a equipe escreve no início da coluna "detalhe"
// (ex.: "*TLP* Téc acionado…", "*PROVEDOR* …", "13/11 02:41 - *IMP* - …"): é o mesmo critério
// usado para preencher o RESPONSAVEL à mão na planilha antiga. A primeira etiqueta do texto vale.
const COLUMN_DETAIL = "detalhe";
// Coluna W do painel_online.csv: texto completo do detalhe. Vazia = ninguém tratou ainda → EM ANALISE.
const COLUMN_DETAIL_TOOLTIP = "detalhe_tooltip";
const EMPTY_DETAIL_RESPONSIBLE = "EM ANALISE";
const DETAIL_TAGS = {
  TLP: "TLP",
  REGIONAL: "REGIONAL",
  PROVEDOR: "PROVEDOR",
  IMPLANTACAO: "IMPLANTAÇÃO",
  IMP: "IMPLANTAÇÃO"
};
// Sem etiqueta no detalhe, vale a primeira regra da causa que bater; sem regra, a linha fica
// sem responsável para classificar.
//   emptyCause: causa vazia ou só " / "
//   startsWith / contains: comparação sem diferenciar maiúsculas e acentos
const RESPONSIBLE_RULES = [
  { responsible: "EM ANALISE", emptyCause: true },
  { responsible: "PROVEDOR", startsWith: ["Tx Terceira", "Tx SWAP", "Ran-sharing"] },
  { responsible: "IMPLANTAÇÃO", contains: ["Implantação"] }
];

const DAY_MS = 24 * 60 * 60 * 1000;

const feedback = document.getElementById("feedback");
const results = document.getElementById("results");
const clearButton = document.getElementById("clear-button");
const fileInput = document.getElementById("file-input");
const dropZone = document.getElementById("drop-zone");
const fileMeta = document.getElementById("file-meta");
const sheetPickerWrap = document.getElementById("sheet-picker-wrap");
const sheetPicker = document.getElementById("sheet-picker");
const regionButtons = [...document.querySelectorAll("[data-region]")];
const ufFilter = document.getElementById("uf-filter");
const technologyInputs = [...document.querySelectorAll("[data-technology]")];
const unassignedButton = document.getElementById("unassigned-button");

let workbook = null;
let fileName = "";
// Arquivo novo só é guardado na sessão depois de conferir que tem as colunas do Genesis.
let pendingFile = null;
// { sheetName, header, records, hasResponsibleColumn }
let dataset = null;
// Responsável escolhido à mão por linha (chave eve_crq + site), guardado na sessão.
let responsibleEdits = loadResponsibleEdits();
const filters = { region: "", uf: "", technologies: new Set(REPORT_TECHNOLOGIES), onlyUnassigned: false };
// Resumo da última renderização, usado pelas ações de copiar e exportar.
let currentView = null;

// Comparações de cabeçalho, causa e responsável ignoram acentos, caixa e espaços excedentes.
function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

function cleanText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function formatCount(count) {
  return count.toLocaleString("pt-BR");
}

function pad(number) {
  return String(number).padStart(2, "0");
}

function formatDateTime(date) {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localDateStamp(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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
  return /\.(xlsx|xlsm|xls|csv)$/i.test(file.name);
}

// ===== Datas =====
// Serial do Excel (dias desde 30/12/1899) no horário local, como o Excel mostra.
function excelSerialToDate(serial) {
  const utc = new Date(Math.round((serial - 25569) * DAY_MS));
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), utc.getUTCHours(), utc.getUTCMinutes(), utc.getUTCSeconds());
}

// Aceita serial do Excel, Date, "dd/mm/aaaa hh:mm[:ss]", "dd/mm hh:mm" (sem ano, como vem
// no painel_online.csv) e "aaaa-mm-dd hh:mm[:ss]".
function parseDateTime(value, now = new Date()) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? excelSerialToDate(value) : null;
  const text = cleanText(value);
  if (!text) return null;
  let match = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (match) {
    const [, day, month, year, hours = 0, minutes = 0, seconds = 0] = match;
    if (!year) {
      // Sem ano: o ano atual, como o Excel faz ao colar; se a data cairia mais de um dia
      // no futuro (ex.: 28/12 lido em janeiro), é do ano anterior.
      const date = validDate(new Date(now.getFullYear(), month - 1, day, hours, minutes, seconds), Number(day), Number(month));
      if (date && date.getTime() - now.getTime() > DAY_MS) date.setFullYear(now.getFullYear() - 1);
      return date;
    }
    const fullYear = year.length === 2 ? 2000 + Number(year) : Number(year);
    return validDate(new Date(fullYear, month - 1, day, hours, minutes, seconds), Number(day), Number(month));
  }
  match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(text);
  if (match) {
    const [, year, month, day, hours = 0, minutes = 0, seconds = 0] = match;
    return validDate(new Date(year, month - 1, day, hours, minutes, seconds), Number(day), Number(month));
  }
  const serial = Number(text.replace(",", "."));
  return /^\d+([.,]\d+)?$/.test(text) && serial > 0 ? excelSerialToDate(serial) : null;
}

// Recusa datas que o JavaScript "corrige" sozinho (ex.: 31/02 vira 03/03).
function validDate(date, day, month) {
  return date.getDate() === day && date.getMonth() === month - 1 ? date : null;
}

// Dias inteiros entre o horário do evento e agora, como INT(NOW()-horario) da planilha.
function daysSince(date, now) {
  return Math.floor((now.getTime() - date.getTime()) / DAY_MS);
}

function agingLabel(days) {
  return AGING_BUCKETS.find((bucket) => days < bucket.maxDays).label;
}

// "2G|S" → "2G", "4G" → "4G".
function technologyFilterValue(technology) {
  const first = cleanText(technology).charAt(0).toUpperCase();
  return first ? `${first}G` : "";
}

function regionOf(uf) {
  return Object.keys(REGIONS).find((region) => REGIONS[region].includes(uf)) || "";
}

// ===== Responsável =====
const RESPONSIBLE_OPTIONS = [...REPORT_RESPONSIBLES, ...EXTRA_RESPONSIBLE_OPTIONS];

// Valor do arquivo na grafia padrão ("Implantacao " → "IMPLANTAÇÃO"); outros valores ficam em maiúsculas.
function canonicalResponsible(value) {
  const key = normalizeText(value);
  if (!key) return "";
  return RESPONSIBLE_OPTIONS.find((option) => normalizeText(option) === key) || cleanText(value).toLocaleUpperCase("pt-BR");
}

// Etiqueta "*TAG*" no detalhe; aceita também "TAG*" no começo (asterisco inicial esquecido).
// A ordem das alternativas põe IMPLANTACAO antes de IMP.
const DETAIL_TAG_PATTERN = new RegExp(
  `(?:^|[^a-z0-9])\\*?\\s*(${Object.keys(DETAIL_TAGS).sort((a, b) => b.length - a.length).join("|")})\\s*\\*`,
  "i"
);

// O detalhe é comparado sem acentos ("*IMPLANTAÇÃO*" bate com IMPLANTACAO).
function detailTag(detail) {
  const match = DETAIL_TAG_PATTERN.exec(normalizeText(detail));
  return match ? DETAIL_TAGS[match[1].toUpperCase()] : "";
}

// Retorna { responsible, source }: source = "detalhe", "causa" ou "" (sem sugestão).
// detailTooltip = null quando o arquivo não tem a coluna detalhe_tooltip (a regra da coluna W não se aplica).
function suggestResponsible(detail, cause, detailTooltip = null) {
  if (detailTooltip !== null && !detailTooltip) return { responsible: EMPTY_DETAIL_RESPONSIBLE, source: "detalhe-vazio" };
  const tagged = detailTag(detail);
  if (tagged) return { responsible: tagged, source: "detalhe" };
  const key = normalizeText(cause);
  for (const rule of RESPONSIBLE_RULES) {
    if ((rule.emptyCause && !key.replace(/[\s/]/g, ""))
      || rule.startsWith?.some((prefix) => key.startsWith(normalizeText(prefix)))
      || rule.contains?.some((part) => key.includes(normalizeText(part)))) {
      return { responsible: rule.responsible, source: "causa" };
    }
  }
  return { responsible: "", source: "" };
}

function recordResponsible(record) {
  return Object.hasOwn(responsibleEdits, record.key) ? responsibleEdits[record.key] : record.baseResponsible;
}

function loadResponsibleEdits() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(RESPONSIBLE_EDITS_KEY) || "{}");
    return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  } catch {
    return {};
  }
}

function saveResponsibleEdits() {
  try {
    if (Object.keys(responsibleEdits).length) sessionStorage.setItem(RESPONSIBLE_EDITS_KEY, JSON.stringify(responsibleEdits));
    else sessionStorage.removeItem(RESPONSIBLE_EDITS_KEY);
  } catch {
    // Sem acesso ao armazenamento: as classificações valem só até recarregar a página.
  }
}

function setResponsible(record, value) {
  // Voltar ao valor original do arquivo (ou da sugestão) apaga a edição.
  if (value === record.baseResponsible) delete responsibleEdits[record.key];
  else responsibleEdits[record.key] = value;
  saveResponsibleEdits();
  render();
}

// ===== Leitura da planilha =====
// fromShared: planilha guardada na sessão (importada antes, voltando após o F5).
async function loadFile(file, fromShared = false) {
  clearFile(false);
  if (!file) return render();
  fileName = file.name;
  if (!isSupportedFile(file)) return render("Arquivo inválido. Selecione uma planilha .xlsx, .xlsm, .xls ou .csv.");
  if (file.size === 0) return render("O arquivo está vazio. Selecione uma planilha com dados.");
  if (!window.XLSX) return render("Não foi possível carregar o leitor de planilhas. Verifique sua conexão e recarregue a página.");

  try {
    // CSV: lido como texto UTF-8 e sem conversão automática, para as datas dd/mm não virarem mm/dd.
    workbook = /\.csv$/i.test(file.name)
      ? XLSX.read(new TextDecoder("utf-8").decode(await file.arrayBuffer()), { type: "string", raw: true })
      : XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
    if (!workbook.SheetNames.length) throw new Error("O arquivo não contém abas para leitura.");
  } catch (error) {
    workbook = null;
    return render(`Não foi possível ler o arquivo. Confirme se ele é uma planilha válida. ${error.message || ""}`.trim());
  }
  pendingFile = fromShared ? null : file;
  fileMeta.textContent = `Arquivo: ${file.name}${fromShared ? " · planilha guardada nesta sessão" : ""}`;
  fileMeta.classList.remove("hidden");
  dropZone.dataset.loaded = "true";
  if (workbook.SheetNames.length > 1) {
    sheetPicker.replaceChildren(...workbook.SheetNames.map((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      return option;
    }));
    // Abre na primeira aba que tem o cabeçalho do Genesis (na planilha antiga, "DADOS Genesis").
    sheetPicker.value = workbook.SheetNames.find((name) => findHeaderRow(sheetRows(name)) >= 0) || workbook.SheetNames[0];
    sheetPickerWrap.classList.remove("hidden");
  }
  analyzeSheet();
}

function sheetRows(sheetName) {
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", raw: true, blankrows: false });
}

function findHeaderRow(rows) {
  const marker = normalizeText(COLUMNS.horario);
  return rows.slice(0, HEADER_SEARCH_ROWS).findIndex((row) => row.some((cell) => normalizeText(cell) === marker));
}

function analyzeSheet() {
  const sheetName = sheetPicker.value || workbook.SheetNames[0];
  const rows = sheetRows(sheetName);
  const headerIndex = findHeaderRow(rows);
  if (headerIndex < 0) {
    dataset = null;
    return render(`A aba "${sheetName}" não tem a coluna "${COLUMNS.horario}" no cabeçalho. Anexe a extração do Painel Online do Genesis.`);
  }
  const header = rows[headerIndex].map(cleanText);
  const findColumn = (name) => header.findIndex((cell) => normalizeText(cell) === normalizeText(name));
  const index = Object.fromEntries(Object.entries(COLUMNS).map(([key, name]) => [key, findColumn(name)]));
  const missing = Object.keys(COLUMNS).filter((key) => index[key] < 0).map((key) => COLUMNS[key]);
  if (missing.length) {
    dataset = null;
    return render(`Faltam colunas na aba "${sheetName}": ${missing.join(", ")}. Confira se é a extração do Painel Online do Genesis.`);
  }
  const responsibleIndex = findColumn(COLUMN_RESPONSIBLE);
  const hasResponsibleColumn = responsibleIndex >= 0;
  const detailIndex = findColumn(COLUMN_DETAIL);
  const detailTooltipIndex = findColumn(COLUMN_DETAIL_TOOLTIP);
  if (pendingFile) saveSharedFile(pendingFile, GENESIS_FILE_KEY);
  pendingFile = null;

  const text = (row, key) => cleanText(row[index[key]]);
  const records = [];
  let invalidDates = 0;
  for (const row of rows.slice(headerIndex + 1)) {
    if (!cleanText(row[index.horario])) continue;
    const horario = parseDateTime(row[index.horario]);
    if (!horario) {
      invalidDates += 1;
      continue;
    }
    const uf = text(row, "uf").toUpperCase();
    const record = {
      row,
      horario,
      site: text(row, "site"),
      technology: text(row, "tecnologia"),
      technologyFilter: technologyFilterValue(row[index.tecnologia]),
      uf,
      region: regionOf(uf),
      anf: text(row, "anf"),
      cause: text(row, "causa"),
      eveCrq: text(row, "eveCrq"),
      eveCrqLink: text(row, "eveCrqLink"),
      status: text(row, "status"),
      regional: text(row, "regional"),
      detail: detailIndex >= 0 ? cleanText(row[detailIndex]).replace(/_x000D_/gi, " ") : "",
      detailTooltip: detailTooltipIndex >= 0 ? cleanText(row[detailTooltipIndex]) : null
    };
    record.key = `${record.eveCrq}|${record.site}`;
    if (hasResponsibleColumn) {
      record.baseResponsible = canonicalResponsible(row[responsibleIndex]);
      record.responsibleSource = "arquivo";
    } else {
      const suggestion = suggestResponsible(record.detail, record.cause, record.detailTooltip);
      record.baseResponsible = suggestion.responsible;
      record.responsibleSource = suggestion.source;
    }
    records.push(record);
  }
  dataset = { sheetName, header, records, hasResponsibleColumn, invalidDates };
  render();
}

// ===== Resumos (equivalentes às tabelas dinâmicas) =====
function emptyCounts() {
  return { aging: Object.fromEntries(AGING_BUCKETS.map(({ label }) => [label, 0])), total: 0 };
}

function addCount(counts, aging) {
  counts.aging[aging] += 1;
  counts.total += 1;
}

// Linhas na ordem de `labels` (todas aparecem, mesmo zeradas) ou, sem labels, ordenadas pelo total.
function buildPivot(records, rowKey, labels = null) {
  const rows = new Map((labels || []).map((label) => [label, emptyCounts()]));
  const total = emptyCounts();
  for (const record of records) {
    const key = rowKey(record);
    if (!rows.has(key)) {
      if (labels) continue;
      rows.set(key, emptyCounts());
    }
    addCount(rows.get(key), record.aging);
    addCount(total, record.aging);
  }
  const entries = [...rows];
  if (!labels) entries.sort(([a, countsA], [b, countsB]) => countsB.total - countsA.total || a.localeCompare(b, "pt-BR"));
  return { rows: entries, total };
}

function compareAnf(a, b) {
  return a.anf.localeCompare(b.anf, "pt-BR", { numeric: true }) || a.eveCrq.localeCompare(b.eveCrq, "pt-BR") || a.site.localeCompare(b.site, "pt-BR");
}

function computeView() {
  const now = new Date();
  for (const record of dataset.records) {
    record.days = daysSince(record.horario, now);
    record.aging = agingLabel(record.days);
    record.responsible = recordResponsible(record);
  }
  // Linhas que passam pelos filtros (tecnologia, região e UF): base de todas as tabelas.
  const scoped = dataset.records.filter((record) => REPORT_TECHNOLOGIES.includes(record.technologyFilter)
    && filters.technologies.has(record.technologyFilter)
    && (!filters.region || record.region === filters.region)
    && (!filters.uf || record.uf === filters.uf));
  const reported = scoped.filter((record) => REPORT_RESPONSIBLES.includes(record.responsible));
  const byResponsible = (records) => buildPivot(records, (record) => record.responsible, REPORT_RESPONSIBLES);
  const regions = Object.keys(REGIONS).filter((region) => !filters.region || filters.region === region);
  const providers = reported.filter((record) => record.responsible === PROVIDER_RESPONSIBLE);
  return {
    now,
    scoped,
    reported,
    unassigned: scoped.filter((record) => !record.responsible),
    general: byResponsible(reported),
    regional: regions.map((region) => ({ region, pivot: byResponsible(reported.filter((record) => record.region === region)) })),
    providerCauses: buildPivot(providers, (record) => record.cause || "(sem causa)"),
    providers: [...providers].sort(compareAnf)
  };
}

// ===== Renderização =====
function cell(tag, text, className = "") {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

const AGING_TONES = {
  "<1d": "text-[color:var(--ink-3)]",
  "Entre 1d e 3d": "text-[color:var(--ink-3)]",
  "Entre 3d e 5d": "text-[color:var(--amber)]",
  "Entre 5d e 10d": "text-[color:var(--orange)]",
  ">10d": "text-[color:var(--red)]"
};

// Tabela Linha × Aging com Total e Total geral, no padrão das tabelas do backlog.
function renderPivotTable(container, pivot, firstColumnLabel, emptyMessage) {
  const table = document.createElement("table");
  table.className = "w-full min-w-[540px] text-left text-sm";
  const head = document.createElement("thead");
  head.className = "bg-[color:var(--sunken)] text-[11px] uppercase tracking-wide text-[color:var(--muted)]";
  const headRow = document.createElement("tr");
  const headCell = (label, className) => {
    const element = cell("th", label, `${className} py-2.5 font-semibold`);
    element.scope = "col";
    return element;
  };
  headRow.append(
    headCell(firstColumnLabel, "px-4"),
    ...AGING_BUCKETS.map(({ label }) => headCell(label, "whitespace-nowrap px-2 text-right normal-case")),
    headCell("Total", "px-4 text-right")
  );
  head.append(headRow);

  const body = document.createElement("tbody");
  body.className = "divide-y divide-[color:var(--line-soft)]";
  const buildRow = (label, counts, isTotal = false) => {
    const row = document.createElement("tr");
    if (!isTotal) row.className = "hover:bg-[color:var(--hover)]";
    const labelCell = cell(isTotal ? "th" : "td", label, `px-4 py-2.5 ${isTotal ? "text-[color:var(--ink)]" : "text-[color:var(--ink-4)]"}`);
    if (isTotal) labelCell.scope = "row";
    row.append(labelCell);
    for (const { label: aging } of AGING_BUCKETS) {
      const count = counts.aging[aging];
      row.append(cell("td", count ? formatCount(count) : "–", `tabular px-2 py-2.5 text-right ${count ? `font-semibold ${AGING_TONES[aging]}` : "text-[color:var(--faint)]"}`));
    }
    row.append(cell("td", formatCount(counts.total), "tabular px-4 py-2.5 text-right font-semibold text-[color:var(--ink)]"));
    return row;
  };
  if (!pivot.rows.length) {
    const row = document.createElement("tr");
    const emptyCell = cell("td", emptyMessage, "px-4 py-6 text-center text-sm text-[color:var(--muted)]");
    emptyCell.colSpan = AGING_BUCKETS.length + 2;
    row.append(emptyCell);
    body.append(row);
  } else {
    body.append(...pivot.rows.map(([label, counts]) => buildRow(label, counts)));
  }
  const foot = document.createElement("tfoot");
  foot.className = "border-t border-[color:var(--line)] bg-[color:var(--sunken)] font-semibold";
  foot.append(buildRow("Total geral", pivot.total, true));
  table.append(head, body, foot);
  container.replaceChildren(table);
}

function renderCards(view) {
  const total = view.general.total.total;
  const cards = [
    { label: "Total no report", value: total, note: `Sites dos ${REPORT_RESPONSIBLES.length} responsáveis`, tone: "var(--blue)" },
    ...view.general.rows.map(([responsible, counts]) => ({
      label: responsible,
      value: counts.total,
      note: `${total ? Math.round((counts.total / total) * 100) : 0}% do report`,
      tone: responsible === PROVIDER_RESPONSIBLE ? "var(--green)" : "var(--line-strong)"
    })),
    { label: "Acima de 10 dias", value: view.general.total.aging[OVER_10_DAYS], note: "Faixa >10d", tone: "var(--red)" }
  ];
  document.getElementById("summary-cards").replaceChildren(...cards.map(({ label, value, note, tone }) => {
    const article = document.createElement("article");
    article.className = "panel rounded-md border-l-4 p-4";
    article.style.borderLeftColor = tone;
    article.append(
      cell("p", label, "text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]"),
      cell("p", formatCount(value), "tabular mt-2 text-2xl font-semibold tracking-tight"),
      cell("p", note, "mt-1 text-xs text-[color:var(--muted)]")
    );
    return article;
  }));
}

function safeLink(url) {
  return /^https?:\/\//i.test(url) ? url : "";
}

function eveCrqCell(record) {
  const td = document.createElement("td");
  td.className = "tabular px-4 py-2.5";
  const href = safeLink(record.eveCrqLink);
  if (href) {
    const link = cell("a", record.eveCrq || "Abrir", "font-semibold text-[color:var(--green)] underline decoration-[color:var(--green-line)] underline-offset-2 hover:decoration-[color:var(--green)]");
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = "Abrir no ServiceNow (nova aba)";
    td.append(link);
  } else {
    td.textContent = record.eveCrq || "—";
    td.classList.add("text-[color:var(--ink-3)]");
  }
  return td;
}

function emptyTableRow(colSpan, message) {
  const row = document.createElement("tr");
  const td = cell("td", message, "px-4 py-6 text-center text-sm text-[color:var(--muted)]");
  td.colSpan = colSpan;
  row.append(td);
  return row;
}

function renderProviders(view) {
  const body = document.getElementById("provider-rows");
  document.getElementById("provider-total").textContent = `${formatCount(view.providers.length)} site(s)`;
  if (!view.providers.length) {
    body.replaceChildren(emptyTableRow(4, "Nenhuma pendência de provedor com estes filtros."));
    return;
  }
  body.replaceChildren(...view.providers.map((record) => {
    const row = document.createElement("tr");
    row.className = "hover:bg-[color:var(--hover)]";
    row.append(
      cell("td", record.anf || "—", "tabular px-4 py-2.5 text-[color:var(--ink-3)]"),
      eveCrqCell(record),
      cell("td", record.site || "—", "tabular px-4 py-2.5 text-[color:var(--ink-3)]"),
      cell("td", record.aging, `px-4 py-2.5 font-semibold ${AGING_TONES[record.aging]}`)
    );
    return row;
  }));
}

function responsibleSelect(record) {
  const select = document.createElement("select");
  select.className = "w-full min-w-[150px] rounded-sm border border-[color:var(--line-strong)] bg-[color:var(--surface)] px-2 py-1.5 text-xs text-[color:var(--ink)] focus:border-[color:var(--green)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)]";
  select.setAttribute("aria-label", `Responsável de ${record.site || "linha"} ${record.eveCrq}`.trim());
  // Valores do arquivo fora da lista (ex.: "FALHA FERRAMENTAS") continuam selecionáveis, mas ficam fora do report.
  const options = ["", ...RESPONSIBLE_OPTIONS];
  if (record.responsible && !options.includes(record.responsible)) options.push(record.responsible);
  if (record.baseResponsible && !options.includes(record.baseResponsible)) options.push(record.baseResponsible);
  select.append(...options.map((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value || "— sem responsável —";
    return option;
  }));
  select.value = record.responsible;
  if (!record.responsible) select.classList.add("border-[color:var(--orange)]");
  select.addEventListener("change", () => setResponsible(record, select.value));
  return select;
}

// De onde veio o responsável sugerido (aparece embaixo do seletor).
const SOURCE_NOTES = { "detalhe-vazio": "detalhe (coluna W) vazio", detalhe: "pela etiqueta do detalhe", causa: "pela causa" };

// Causa e, embaixo, o começo do detalhe (onde fica a etiqueta *TLP*, *PROVEDOR*…); o texto inteiro fica no title.
function causeCell(record) {
  const td = cell("td", record.cause || "—", "min-w-[240px] max-w-[360px] px-4 py-2.5 text-[color:var(--ink-3)]");
  if (record.detail && record.detail !== "#") {
    const detail = cell("span", record.detail.length > 90 ? `${record.detail.slice(0, 90)}…` : record.detail, "mt-1 block text-[11px] leading-4 text-[color:var(--muted)]");
    detail.title = record.detail;
    td.append(detail);
  }
  return td;
}

function renderDetails(view) {
  const records = (filters.onlyUnassigned ? view.unassigned : view.scoped)
    .slice()
    // Sem responsável primeiro; depois os mais antigos.
    .sort((a, b) => Number(Boolean(a.responsible)) - Number(Boolean(b.responsible)) || b.days - a.days || compareAnf(a, b));
  document.getElementById("details-total").textContent = `${formatCount(records.length)} linha(s)`;
  const body = document.getElementById("detail-rows");
  if (!records.length) {
    body.replaceChildren(emptyTableRow(9, filters.onlyUnassigned ? "Todas as linhas destes filtros têm responsável." : "Nenhuma linha com estes filtros."));
    return;
  }
  body.replaceChildren(...records.map((record) => {
    const row = document.createElement("tr");
    row.className = "hover:bg-[color:var(--hover)]";
    const edited = Object.hasOwn(responsibleEdits, record.key);
    const selectCell = document.createElement("td");
    selectCell.className = "px-4 py-2";
    selectCell.append(responsibleSelect(record));
    if (edited) selectCell.append(cell("span", "editado nesta sessão", "mt-1 block text-[10px] text-[color:var(--muted)]"));
    else if (SOURCE_NOTES[record.responsibleSource]) {
      selectCell.append(cell("span", SOURCE_NOTES[record.responsibleSource], "mt-1 block text-[10px] text-[color:var(--muted)]"));
    }
    row.append(
      cell("td", formatDateTime(record.horario), "tabular whitespace-nowrap px-4 py-2.5 text-[color:var(--ink-3)]"),
      cell("td", record.aging, `whitespace-nowrap px-4 py-2.5 font-semibold ${AGING_TONES[record.aging]}`),
      cell("td", record.site || "—", "tabular px-4 py-2.5 font-semibold text-[color:var(--ink)]"),
      cell("td", record.technologyFilter, "px-4 py-2.5 text-[color:var(--ink-3)]"),
      cell("td", [record.uf, record.region].filter(Boolean).join(" · ") || "—", "whitespace-nowrap px-4 py-2.5 text-[color:var(--ink-3)]"),
      cell("td", record.anf || "—", "tabular px-4 py-2.5 text-[color:var(--ink-3)]"),
      causeCell(record),
      eveCrqCell(record),
      selectCell
    );
    return row;
  }));
}

function renderUnassigned(view) {
  const count = view.unassigned.length;
  if (filters.onlyUnassigned && !count) filters.onlyUnassigned = false;
  document.getElementById("unassigned-count").textContent = `${formatCount(count)} linha(s) sem responsável`;
  document.getElementById("unassigned-box").dataset.empty = String(!count);
  unassignedButton.disabled = !count && !filters.onlyUnassigned;
  unassignedButton.setAttribute("aria-pressed", String(filters.onlyUnassigned));
  unassignedButton.textContent = filters.onlyUnassigned ? "Mostrar todas as linhas" : "Mostrar só essas";
}

function renderFilterControls() {
  for (const button of regionButtons) button.setAttribute("aria-pressed", String(button.dataset.region === filters.region));
  const ufs = filters.region ? REGIONS[filters.region] : Object.values(REGIONS).flat();
  if (filters.uf && !ufs.includes(filters.uf)) filters.uf = "";
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "Todas as UFs";
  ufFilter.replaceChildren(allOption, ...ufs.map((uf) => {
    const option = document.createElement("option");
    option.value = uf;
    option.textContent = uf;
    return option;
  }));
  ufFilter.value = filters.uf;
  for (const input of technologyInputs) input.checked = filters.technologies.has(input.dataset.technology);
}

function describeFilters() {
  const parts = [filters.region || "TNE", filters.uf, REPORT_TECHNOLOGIES.filter((tech) => filters.technologies.has(tech)).join("/")];
  return parts.filter(Boolean).join(" · ");
}

function render(errorMessage = "") {
  clearButton.classList.toggle("hidden", !fileName);
  clearButton.classList.toggle("inline-flex", Boolean(fileName));

  if (errorMessage) showFeedback(errorMessage);
  if (!dataset) {
    if (!errorMessage) hideFeedback();
    currentView = null;
    results.classList.add("hidden");
    return;
  }
  if (!errorMessage) {
    const source = dataset.hasResponsibleColumn
      ? "responsável lido da coluna RESPONSAVEL"
      : "detalhe (coluna W) vazio = EM ANALISE; nos demais, responsável pela etiqueta do detalhe (*TLP*, *PROVEDOR*…) e, sem etiqueta, pela causa";
    const invalid = dataset.invalidDates ? ` ${dataset.invalidDates} linha(s) com horário inválido ficaram de fora.` : "";
    showFeedback(`${formatCount(dataset.records.length)} linha(s) com horário na aba "${dataset.sheetName}"; ${source}.${invalid}`, dataset.invalidDates ? "error" : "ok");
  }

  const view = computeView();
  currentView = view;
  results.classList.remove("hidden");
  renderFilterControls();
  document.getElementById("analyzed-sheet").textContent =
    `${fileName} · aba ${dataset.sheetName} · aging calculado em ${formatDateTime(view.now)} · ${describeFilters()}`;
  renderCards(view);
  renderUnassigned(view);
  renderPivotTable(document.getElementById("general-table"), view.general, "Responsável", "");
  const regionalWrap = document.getElementById("regional-tables");
  regionalWrap.replaceChildren(...view.regional.map(({ region, pivot }) => {
    const section = document.createElement("section");
    section.className = "panel overflow-hidden rounded-md";
    const titleId = `region-title-${region.replace(/\s+/g, "")}`;
    section.setAttribute("aria-labelledby", titleId);
    const header = document.createElement("div");
    header.className = "px-5 pb-3 pt-5";
    const title = cell("h3", `Responsável × Aging · ${region}`, "font-semibold");
    title.id = titleId;
    header.append(title, cell("p", `UFs ${REGIONS[region].join(", ")}.`, "mt-1 text-xs text-[color:var(--muted)]"));
    const scroll = document.createElement("div");
    scroll.className = "overflow-x-auto";
    renderPivotTable(scroll, pivot, "Responsável", "");
    section.append(header, scroll);
    return section;
  }));
  regionalWrap.className = `mb-7 grid grid-cols-1 gap-5 ${view.regional.length > 1 ? "xl:grid-cols-2" : ""}`;
  renderPivotTable(document.getElementById("provider-cause-table"), view.providerCauses, "Causa", "Nenhuma linha de provedor com estes filtros.");
  renderProviders(view);
  renderDetails(view);
}

// ===== Copiar report =====
function agingBreakdown(counts) {
  const parts = AGING_BUCKETS.filter(({ label }) => counts.aging[label]).map(({ label }) => `${label}: ${formatCount(counts.aging[label])}`);
  return parts.length ? ` (${parts.join(" / ")})` : "";
}

function pivotLines(title, pivot) {
  return [
    `${title}: ${formatCount(pivot.total.total)}`,
    ...pivot.rows.map(([responsible, counts]) => `• ${responsible}: ${formatCount(counts.total)}${agingBreakdown(counts)}`),
    `⏳ Acima de 10 dias: ${formatCount(pivot.total.aging[OVER_10_DAYS])}`
  ];
}

// Texto no formato do "Copiar parcial" do backlog, pronto para colar no chat.
function buildGenesisReport(view) {
  const now = new Date(view.now);
  now.setMinutes(0, 0, 0);
  const time = `${pad(now.getHours())}:00`;
  const technologies = REPORT_TECHNOLOGIES.filter((tech) => filters.technologies.has(tech)).join("/");
  const lines = [
    "➡️ Report Genesis TNE:",
    "",
    `Pendências do Painel Online por responsável e aging - ${pad(now.getDate())}/${pad(now.getMonth() + 1)} ${time}HS`,
    `Tecnologias: ${technologies}${filters.uf ? ` · UF ${filters.uf}` : ""}`,
    "",
    ...pivotLines(`📊 ${filters.region || "TNE geral"}`, view.general)
  ];
  // Com a região filtrada, o bloco geral já é a própria região.
  if (!filters.region) {
    for (const { region, pivot } of view.regional) lines.push("", ...pivotLines(`📍 ${region}`, pivot));
  }
  lines.push("", `🚚 Pendências de provedor: ${formatCount(view.providers.length)}`);
  // Agrupa por ANF e EVE/CRQ: uma linha por evento, com os sites e o aging de cada um.
  let currentAnf = null;
  const events = new Map();
  for (const record of view.providers) {
    const key = `${record.anf}|${record.eveCrq}`;
    if (!events.has(key)) events.set(key, { anf: record.anf, eveCrq: record.eveCrq, sites: [] });
    events.get(key).sites.push(`${record.site || "sem site"} (${record.aging})`);
  }
  for (const { anf, eveCrq, sites } of events.values()) {
    if (anf !== currentAnf) {
      lines.push(`ANF ${anf || "—"}`);
      currentAnf = anf;
    }
    lines.push(`- ${eveCrq || "Sem EVE/CRQ"}: ${sites.join(", ")}`);
  }
  return lines.join("\n");
}

function copyTextFallback(text) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.append(textArea);
  textArea.select();
  const copied = document.execCommand("copy");
  textArea.remove();
  return copied;
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Segue para a cópia pelo campo de texto.
  }
  if (!copyTextFallback(text)) throw new Error("A cópia não foi autorizada.");
}

async function copyGenesisReport() {
  if (!currentView) return;
  try {
    await copyText(buildGenesisReport(currentView));
    showFeedback("Report copiado para a área de transferência.", "ok");
  } catch {
    showFeedback("Não foi possível copiar. Verifique a permissão de área de transferência do navegador.");
  }
}

// ===== Copiar imagem =====
// Cores do tema ativo na tela: a imagem sai no mesmo tema (claro ou escuro) da página.
// A imagem sai sempre no tema claro: lê as cores de um elemento com data-theme="light",
// que redefine a paleta mesmo com a página no escuro.
function readThemeColors(names) {
  const probe = document.createElement("div");
  probe.dataset.theme = "light";
  probe.hidden = true;
  document.body.append(probe);
  const style = getComputedStyle(probe);
  const colors = Object.fromEntries(names.map((name) => [name, style.getPropertyValue(`--${name}`).trim()]));
  probe.remove();
  return colors;
}

// Desenha as tabelas Responsável × Aging num canvas, como o "Copiar gráfico" do backlog.
function renderPivotImage(view) {
  const colors = readThemeColors(["surface", "sunken", "line", "line-soft", "ink", "ink-3", "ink-4", "muted", "faint", "amber", "orange", "red"]);
  const agingColors = { "Entre 3d e 5d": colors.amber, "Entre 5d e 10d": colors.orange, ">10d": colors.red };
  const font = getComputedStyle(document.body).fontFamily;
  const tables = [
    { title: `Responsável × Aging · ${filters.region || "TNE geral"}`, pivot: view.general },
    ...(filters.region ? [] : view.regional.map(({ region, pivot }) => ({ title: `Responsável × Aging · ${region}`, pivot })))
  ];
  const padding = 24;
  const labelWidth = 150;
  const agingWidth = 96;
  const totalWidth = 70;
  const rowHeight = 28;
  const width = padding * 2 + labelWidth + agingWidth * AGING_BUCKETS.length + totalWidth;
  const tableHeight = (table) => 30 + rowHeight * (table.pivot.rows.length + 2);
  const height = 84 + tables.reduce((sum, table) => sum + tableHeight(table) + 18, 0);
  const scale = Math.max(2, window.devicePixelRatio || 1);
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const context = canvas.getContext("2d");
  context.scale(scale, scale);

  context.fillStyle = colors.surface;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = colors.line;
  context.strokeRect(0.5, 0.5, width - 1, height - 1);
  context.textBaseline = "middle";
  context.fillStyle = colors.ink;
  context.font = `600 17px ${font}`;
  context.fillText("Report Genesis TNE", padding, 34);
  context.fillStyle = colors.muted;
  context.font = `12px ${font}`;
  context.fillText(`Sites por responsável e aging · ${describeFilters()} · ${formatDateTime(view.now)}`, padding, 56);

  const columnX = [padding + labelWidth, ...AGING_BUCKETS.map((_, index) => padding + labelWidth + agingWidth * (index + 1))];
  const drawRow = (y, label, values, { header = false, total = false } = {}) => {
    if (header || total) {
      context.fillStyle = colors.sunken;
      context.fillRect(padding, y, width - padding * 2, rowHeight);
    }
    context.strokeStyle = colors["line-soft"];
    context.beginPath();
    context.moveTo(padding, y + rowHeight + 0.5);
    context.lineTo(width - padding, y + rowHeight + 0.5);
    context.stroke();
    const middle = y + rowHeight / 2;
    context.textAlign = "left";
    context.fillStyle = header ? colors.muted : total ? colors.ink : colors["ink-4"];
    context.font = `${header || total ? 600 : 400} ${header ? 11 : 13}px ${font}`;
    context.fillText(label, padding + 10, middle);
    values.forEach((value, index) => {
      const right = (index < AGING_BUCKETS.length ? columnX[index] + agingWidth : columnX[index] + totalWidth) - 10;
      const aging = AGING_BUCKETS[index]?.label;
      context.textAlign = "right";
      context.font = `${header ? 600 : total || index === AGING_BUCKETS.length ? 600 : 500} ${header ? 11 : 13}px ${font}`;
      context.fillStyle = header ? colors.muted
        : value === "–" ? colors.faint
        : !total && agingColors[aging] ? agingColors[aging]
        : total || index === AGING_BUCKETS.length ? colors.ink : colors["ink-3"];
      context.fillText(value, right, middle);
    });
  };

  let y = 78;
  for (const table of tables) {
    context.textAlign = "left";
    context.fillStyle = colors.ink;
    context.font = `600 14px ${font}`;
    context.fillText(table.title, padding, y + 12);
    y += 30;
    drawRow(y, "RESPONSÁVEL", [...AGING_BUCKETS.map(({ label }) => label), "TOTAL"], { header: true });
    y += rowHeight;
    const values = (counts) => [...AGING_BUCKETS.map(({ label }) => (counts.aging[label] ? formatCount(counts.aging[label]) : "–")), formatCount(counts.total)];
    for (const [responsible, counts] of table.pivot.rows) {
      drawRow(y, responsible, values(counts));
      y += rowHeight;
    }
    drawRow(y, "Total geral", values(table.pivot.total), { total: true });
    y += rowHeight + 18;
  }
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Falha ao gerar imagem"))), "image/png"));
}

function downloadBlob(blob, name) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function copyPivotImage() {
  if (!currentView) return;
  const imagePromise = renderPivotImage(currentView);
  try {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("Clipboard indisponível");
    await navigator.clipboard.write([new ClipboardItem({ "image/png": imagePromise })]);
    showFeedback("Tabelas Responsável × Aging copiadas como imagem.", "ok");
  } catch {
    try {
      downloadBlob(await imagePromise, `report-genesis-TNE-${localDateStamp()}.png`);
      showFeedback("O navegador não permite copiar a imagem; as tabelas foram baixadas como PNG.", "ok");
    } catch {
      showFeedback("Não foi possível gerar a imagem das tabelas.");
    }
  }
}

// ===== Exportar Excel =====
function pivotSheet(pivot, firstColumnLabel) {
  const sheet = XLSX.utils.aoa_to_sheet([
    [firstColumnLabel, ...AGING_BUCKETS.map(({ label }) => label), "Total"],
    ...pivot.rows.map(([label, counts]) => [label, ...AGING_BUCKETS.map(({ label: aging }) => counts.aging[aging]), counts.total]),
    ["Total geral", ...AGING_BUCKETS.map(({ label }) => pivot.total.aging[label]), pivot.total.total]
  ]);
  sheet["!cols"] = [{ wch: firstColumnLabel === "Causa" ? 44 : 16 }, ...AGING_BUCKETS.map(() => ({ wch: 15 })), { wch: 8 }];
  return sheet;
}

// Uma aba por tabela (com os filtros da tela) e a aba "Dados" com todas as linhas do arquivo
// e as colunas calculadas, que substituem as fórmulas AL:AN da planilha antiga.
function exportGenesisExcel() {
  if (!currentView) return;
  if (!window.XLSX?.utils?.book_new || !window.XLSX?.writeFile) {
    showFeedback("Não foi possível criar a planilha Excel. Verifique sua conexão e recarregue a página.");
    return;
  }
  const view = currentView;
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, pivotSheet(view.general, "Responsável"), `Responsável ${filters.region || "TNE"}`);
  for (const { region, pivot } of view.regional) {
    if (!filters.region) XLSX.utils.book_append_sheet(book, pivotSheet(pivot, "Responsável"), `Responsável ${region}`);
  }
  XLSX.utils.book_append_sheet(book, pivotSheet(view.providerCauses, "Causa"), "Provedores por causa");
  const providerSheet = XLSX.utils.aoa_to_sheet([
    ["ANF", "EVE/CRQ", "Site", "Aging", "Link"],
    ...view.providers.map((record) => [record.anf, record.eveCrq, record.site, record.aging, safeLink(record.eveCrqLink)])
  ]);
  view.providers.forEach((record, index) => {
    const href = safeLink(record.eveCrqLink);
    const cellRef = XLSX.utils.encode_cell({ r: index + 1, c: 1 });
    if (href && providerSheet[cellRef]) providerSheet[cellRef].l = { Target: href };
  });
  providerSheet["!cols"] = [{ wch: 6 }, { wch: 18 }, { wch: 16 }, { wch: 15 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(book, providerSheet, "Pendências provedor");

  const horarioColumn = dataset.header.findIndex((name) => normalizeText(name) === normalizeText(COLUMNS.horario));
  const skipped = [COLUMN_RESPONSIBLE, ...LEGACY_CALCULATED_COLUMNS].map(normalizeText);
  const keptColumns = dataset.header.map((name, index) => ({ name, index }))
    .filter(({ name }) => name && !skipped.includes(normalizeText(name)));
  const dataSheet = XLSX.utils.aoa_to_sheet([
    [...keptColumns.map(({ name }) => name), "Dias", "Aging", "Tecnologia filtro", "Região", "Responsável"],
    ...dataset.records.map((record) => [
      ...keptColumns.map(({ index }) => (index === horarioColumn ? record.horario : record.row[index] ?? "")),
      record.days,
      record.aging,
      record.technologyFilter,
      record.region,
      record.responsible
    ])
  ], { cellDates: true, dateNF: "dd/mm/yyyy hh:mm" });
  XLSX.utils.book_append_sheet(book, dataSheet, "Dados");
  XLSX.writeFile(book, `report-genesis-TNE-${localDateStamp()}.xlsx`);
}

// ===== Limpar =====
function clearFile(clearFileInput = true) {
  workbook = null;
  dataset = null;
  pendingFile = null;
  fileName = "";
  fileMeta.classList.add("hidden");
  sheetPickerWrap.classList.add("hidden");
  delete dropZone.dataset.loaded;
  if (clearFileInput) fileInput.value = "";
}

// Equivale ao botão "APAGAR" da planilha antiga, sem limite de linhas nem filtro preso.
function clearAll() {
  if (!window.confirm("Descartar a planilha carregada e as classificações de responsável feitas nesta sessão?")) return;
  clearFile();
  clearSharedFile(GENESIS_FILE_KEY);
  responsibleEdits = {};
  saveResponsibleEdits();
  filters.region = "";
  filters.uf = "";
  filters.technologies = new Set(REPORT_TECHNOLOGIES);
  filters.onlyUnassigned = false;
  render();
}

// ===== Eventos =====
fileInput.addEventListener("change", (event) => loadFile(event.target.files[0]));
sheetPicker.addEventListener("change", analyzeSheet);
dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput.click();
  }
});
dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("is-dragging");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("is-dragging"));
dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("is-dragging");
  loadFile(event.dataTransfer.files[0]);
});
for (const button of regionButtons) {
  button.addEventListener("click", () => {
    filters.region = button.dataset.region;
    render();
  });
}
ufFilter.addEventListener("change", () => {
  filters.uf = ufFilter.value;
  render();
});
for (const input of technologyInputs) {
  input.addEventListener("change", () => {
    if (input.checked) filters.technologies.add(input.dataset.technology);
    else filters.technologies.delete(input.dataset.technology);
    render();
  });
}
unassignedButton.addEventListener("click", () => {
  filters.onlyUnassigned = !filters.onlyUnassigned;
  render();
  if (filters.onlyUnassigned) document.getElementById("details-title").scrollIntoView({ behavior: "smooth", block: "start" });
});
document.getElementById("copy-report-button").addEventListener("click", copyGenesisReport);
document.getElementById("copy-image-button").addEventListener("click", copyPivotImage);
document.getElementById("export-button").addEventListener("click", exportGenesisExcel);
clearButton.addEventListener("click", clearAll);

// Planilha guardada na sessão desta página: volta após o F5, até usar Limpar ou fechar a aba.
const storedFile = loadSharedFile(GENESIS_FILE_KEY);
if (storedFile) loadFile(storedFile, true);
