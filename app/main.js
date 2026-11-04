// Ajuste estas constantes caso o layout ou os valores da planilha mudem.
const COLUMN_BUCKET = "A";
const COLUMN_TSK = "B";
const COLUMN_TYPE = "D";
const COLUMN_STATUS = "E";
const COLUMN_CM = "AK";
const COLUMN_PRIORITY = "GI";
const TARGET_TYPE = "Planta Interna - Manutenção Corretiva";
const STATUS_VALUES = {
  started: "iniciada",
  cancelled: "cancelada",
  completed: "concluída",
  notStarted: "não iniciado",
  pending: "pendente"
};
// TSKs concluídas mais vezes que este limite ficam fora do report de encerradas.
const MAX_COMPLETIONS_PER_TSK = 2;
// NE IDs fora (Flag 1) do Genesis, servidos pelo TrocaIP.exe (o Genesis não libera leitura direta).
// O fluxo completo está no bloco "TrocaIP / Genesis", logo acima de fetchGenesisNeDownCount.
const GENESIS_NE_DOWN_URL = "http://127.0.0.1:8765/genesis/ne-fora";
// Folga para o usuário responder ao pedido de acesso à rede local do navegador.
const GENESIS_TIMEOUT_MS = 15000;
const TECHNICIAN_LOCATION_ORDER = ["ALAGOAS", "BAHIA", "PIAUÍ", "SERGIPE", "CEARÁ", "PARAÍBA", "PERNAMBUCO", "RIO GRANDE DO NORTE", "JFA", "GVS", "URA", "ULA", "VGA", "DVL", "MCL"];
const TECHNICIAN_STATE_ORDER = TECHNICIAN_LOCATION_ORDER.slice(0, 8);
const TNE_ONE_TECHNICIAN_LOCATIONS = new Set(["ALAGOAS", "BAHIA", "PIAUÍ", "SERGIPE"]);
const TNE_TWO_TECHNICIAN_LOCATIONS = new Set(TECHNICIAN_STATE_ORDER.slice(TNE_ONE_TECHNICIAN_LOCATIONS.size));
const ALAGOAS_TECHNICIAN_CMS = new Set([
  "TNE-AL-AIR01-AIR01",
  "TNE-AL-MCO01-MCO01"
]);
const BAHIA_TECHNICIAN_CMS = new Set([
  "TNE-BA-SDR01-SDR01",
  "TNE-BA-EUS01-EUS01",
  "TNE-BA-ITB01-ITB01",
  "TNE-BA-JEE01-JEE01",
  "TNE-BA-TAF01-TAF01",
  "TNE-BA-JUO01-JUO01",
  "TNE-BA-FSA01-FSA01",
  "TNE-BA-PAF01-PAF01",
  "TNE-BA-SEB01-SEB01",
  "TNE-BA-SNJ01-SNJ01",
  "TNE-BA-BES01-BES01",
  "TNE-BA-GNB01-GNB01",
  "TNE-BA-VCA01-VCA01"
]);
const PIAUI_TECHNICIAN_CMS = new Set([
  "TNE-PI-TSA01-PIP03",
  "TNE-PI-TSA01-PNA02",
  "TNE-PI-TSA01-TSA01",
  "TNE-PI-FLO01-BOM03",
  "TNE-PI-FLO01-FLO01",
  "TNE-PI-FLO01-PCZ02"
]);
const SERGIPE_TECHNICIAN_CMS = new Set([
  "TNE-SE-AJU01-AJU01"
]);
const CEARA_TECHNICIAN_CMS = new Set([
  "TNE-CE-FLA01-FLA01",
  "TNE-CE-CTS01-CTS01",
  "TNE-CE-IAU01-IAU01",
  "TNE-CE-JNE01-JNE01",
  "TNE-CE-QXA01-QXA01",
  "TNE-CE-SOL01-SOL01"
]);
const PARAIBA_TECHNICIAN_CMS = new Set([
  "TNE-PB-CGE01-CGE01",
  "TNE-PB-JPA01-JPA01",
  "TNE-PB-POS01-POS01"
]);
const PERNAMBUCO_TECHNICIAN_CMS = new Set([
  "TNE-PE-RCE01-CAA04",
  "TNE-PE-RCE01-CBO05",
  "TNE-PE-RCE01-GOI01",
  "TNE-PE-RCE01-JBO02",
  "TNE-PE-RCE01-RCE01",
  "TNE-PE-RCE01-RCE03",
  "TNE-PE-ACV01-ACV01",
  "TNE-PE-CRU01-CRU01",
  "TNE-PE-PLS01-PLS01",
  "TNE-PE-PTA01-PTA01",
  "TNE-PE-SGI01-SGI01"
]);
const RIO_GRANDE_DO_NORTE_TECHNICIAN_CMS = new Set([
  "TNE-RN-ACU01-ACU01",
  "TNE-RN-MRO01-MRO01",
  "TNE-RN-NTL01-NTL01",
  "TNE-RN-PFR01-PFR01"
]);

const OPEN_STATUSES = [STATUS_VALUES.started, STATUS_VALUES.notStarted, STATUS_VALUES.pending];
const STATUS_ORDER = [STATUS_VALUES.started, STATUS_VALUES.cancelled, STATUS_VALUES.completed, STATUS_VALUES.notStarted, STATUS_VALUES.pending];
const STATUS_LABELS = {
  [STATUS_VALUES.started]: "Iniciada",
  [STATUS_VALUES.cancelled]: "Cancelada",
  [STATUS_VALUES.completed]: "Concluída",
  [STATUS_VALUES.notStarted]: "Não iniciado",
  [STATUS_VALUES.pending]: "Pendente"
};

const fileInput = document.getElementById("file-input");
const dropZone = document.getElementById("drop-zone");
const feedback = document.getElementById("feedback");
const fileMeta = document.getElementById("file-meta");
const sheetPickerWrap = document.getElementById("sheet-picker-wrap");
const sheetPicker = document.getElementById("sheet-picker");
const results = document.getElementById("results");
const clearButton = document.getElementById("clear-button");
let workbook = null;
let currentAnalysis = null;
let selectedFileName = "";
let technicianSortOrder = "most";
let currentView = "completed";
let currentStateGroup = "all";

const STATE_GROUP_DESCRIPTIONS = {
  all: "Todas as TSKs do tipo selecionado, agrupadas pelo estado do CM (coluna AK).",
  technician: "Somente TSKs da fila técnica, agrupadas pelo estado do CM (coluna AK).",
  commandCenter: "Somente TSKs do Centralizado, agrupadas pelo estado do CM (coluna AK)."
};

// Textos dos gráficos para cada visão escolhida nos cards de Encerradas e Pendenciamentos.
const VIEW_LABELS = {
  completed: {
    title: "Encerradas",
    lower: "encerradas",
    statusLabel: "concluídas",
    events: "encerramentos",
    total: "Total de encerradas",
    technicianTotal: "Total de encerramentos técnicos",
    volume: "Volume encerrado por bucket",
    empty: "Nenhuma TSK encerrada nesta aba.",
    technicianEmpty: "Nenhum encerramento técnico nesta aba."
  },
  pending: {
    title: "Pendenciamentos",
    lower: "pendenciamentos",
    statusLabel: "pendentes",
    events: "pendenciamentos",
    total: "Total de pendenciamentos",
    technicianTotal: "Total de pendenciamentos técnicos",
    volume: "Volume pendente por bucket",
    empty: "Nenhuma TSK pendente nesta aba.",
    technicianEmpty: "Nenhum pendenciamento técnico nesta aba."
  }
};

// Junta a análise geral com os números do status escolhido (encerradas ou pendentes).
function getAnalysisView(analysis) {
  return { ...analysis, ...analysis.views[currentView], labels: VIEW_LABELS[currentView] };
}

function setView(view) {
  currentView = view;
  for (const card of document.querySelectorAll(".view-card")) {
    card.setAttribute("aria-pressed", String(card.dataset.view === view));
  }
  if (currentAnalysis) renderAnalysis(currentAnalysis);
}

// Comparações de tipo e status ignoram acentos, caixa e espaços excedentes.
function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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

async function loadFile(file, fromShared = false) {
  clearAnalysis(false);
  if (!file) return;
  selectedFileName = file.name;
  if (!isSupportedFile(file)) {
    showFeedback("Arquivo inválido. Selecione uma planilha .xlsx, .xls ou .csv.");
    return;
  }
  if (file.size === 0) {
    showFeedback("O arquivo está vazio. Selecione uma planilha com dados.");
    return;
  }
  if (!window.XLSX) {
    showFeedback("Não foi possível carregar o leitor de planilhas. Verifique sua conexão e recarregue a página.");
    return;
  }

  try {
    const data = await file.arrayBuffer();
    workbook = XLSX.read(data, { type: "array", cellDates: false });
    if (!workbook.SheetNames.length) throw new Error("O arquivo não contém abas para leitura.");
    if (!fromShared) saveSharedFile(file);
    fileMeta.textContent = `Arquivo: ${file.name}${fromShared ? " · mesma planilha da Análise diária de técnicos" : ""}`;
    fileMeta.classList.remove("hidden");
    if (workbook.SheetNames.length > 1) {
      sheetPicker.replaceChildren(...workbook.SheetNames.map((name) => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        return option;
      }));
      // Extração do TOA: abre na aba "Page 1" quando ela existe.
      sheetPicker.value = workbook.SheetNames.find((name) => normalizeText(name) === "page 1") || workbook.SheetNames[0];
      sheetPickerWrap.classList.remove("hidden");
    }
    analyzeSelectedSheet();
  } catch (error) {
    workbook = null;
    showFeedback(`Não foi possível ler o arquivo. Confirme se ele é uma planilha válida. ${error.message || ""}`.trim());
  }
}

function classifyBucket(bucket) {
  const normalizedBucket = String(bucket ?? "").trim().toLocaleUpperCase("pt-BR");
  // Aceita espaço depois do hífen, como em "TLP- T3751680-…" na extração do TOA.
  return /^TLP-\s*T\d+(?:-|$)/.test(normalizedBucket)
    ? "Fila de técnicos"
    : "Command Center";
}

function classifyTechnicianLocation(cm) {
  const normalizedCm = String(cm).toLocaleUpperCase("pt-BR");
  if (ALAGOAS_TECHNICIAN_CMS.has(normalizedCm)) return "ALAGOAS";
  if (BAHIA_TECHNICIAN_CMS.has(normalizedCm)) return "BAHIA";
  if (PIAUI_TECHNICIAN_CMS.has(normalizedCm)) return "PIAUÍ";
  if (SERGIPE_TECHNICIAN_CMS.has(normalizedCm)) return "SERGIPE";
  if (CEARA_TECHNICIAN_CMS.has(normalizedCm)) return "CEARÁ";
  if (PARAIBA_TECHNICIAN_CMS.has(normalizedCm)) return "PARAÍBA";
  if (PERNAMBUCO_TECHNICIAN_CMS.has(normalizedCm)) return "PERNAMBUCO";
  if (RIO_GRANDE_DO_NORTE_TECHNICIAN_CMS.has(normalizedCm)) return "RIO GRANDE DO NORTE";
  return TECHNICIAN_LOCATION_ORDER.find((location) => new RegExp(`(?:^|[^A-Z])${location}(?=$|[^A-Z])`).test(normalizedCm)) || "Outros";
}

function isDeactivatedTechnicianCm(cm) {
  return /(?:^|[^A-Z])VGS\d*(?=$|[^A-Z])/i.test(String(cm));
}

function groupTechnicianCms(technicianCms) {
  const groupedCms = new Map([...TECHNICIAN_LOCATION_ORDER, "Outros"].map((location) => [location, []]));
  for (const item of technicianCms) {
    groupedCms.get(classifyTechnicianLocation(item.cm)).push(item);
  }
  return [...groupedCms.entries()]
    .filter(([, cms]) => cms.length)
    .map(([location, cms]) => {
      cms.sort((left, right) => right.count - left.count || left.cm.localeCompare(right.cm, "pt-BR"));
      return { location, cms, total: cms.reduce((total, item) => total + item.count, 0) };
    });
}

function getTechnicianLocation(bucket, analysis) {
  const cms = analysis.technicianCmsByBucket.get(bucket) || [];
  const locations = cms.map(({ cm }) => classifyTechnicianLocation(cm));
  return TECHNICIAN_LOCATION_ORDER.find((location) => locations.includes(location)) || "Outros";
}

function getTechnicianSortCm(bucket, analysis, location) {
  return (analysis.technicianCmsByBucket.get(bucket) || [])
    .filter(({ cm }) => classifyTechnicianLocation(cm) === location)
    .sort((left, right) => right.count - left.count || left.cm.localeCompare(right.cm, "pt-BR", { sensitivity: "base" }))[0] || { cm: "", count: 0 };
}

function formatBucketLabel(bucket, cmValue) {
  const text = String(bucket ?? "").trim();
  if (!text) {
    return { name: "(Sem bucket)", cm: "" };
  }

  const technicianMatch = text.match(/^\s*TLP[-_\s]*T?\d+[-_\s]+(.+?)\s*$/i);
  const isTechnician = classifyBucket(text) === "Fila de técnicos";
  const name = isTechnician && technicianMatch
    ? technicianMatch[1].trim()
    : text;
  const cmText = String(cmValue ?? "").trim();
  const cm = !cmText && isTechnician && text !== "(Sem bucket)"
    ? "CM não informado"
    : /^\d+$/.test(cmText)
    ? `CM ${cmText}`
    : cmText.replace(/^CM\s*(\d+)$/i, "CM $1");

  return { name: name || text, cm };
}

// Agrupa por bucket, CM, estado e prioridade as TSKs de um único status (encerradas ou pendentes).
function buildStatusBreakdown(rows, statusValue, { bucketIndex, statusIndex, cmIndex, priorityIndex }) {
  const targetStatus = normalizeText(statusValue);
  const priorityCounts = Object.fromEntries(["P1", "P2", "P3", "P4", "P5"].map((priority) => [priority, 0]));
  const buckets = new Map();
  const technicianCmCounts = new Map();
  const technicianCmsByBucket = new Map();
  const commandCenterClosuresByState = Object.fromEntries(TECHNICIAN_STATE_ORDER.map((state) => [state, 0]));
  let count = 0;

  for (const row of rows) {
    if (normalizeText(row[statusIndex]) !== targetStatus) continue;
    count += 1;
    const priority = normalizeText(row[priorityIndex]);
    if (["p1", "p2", "p3", "p4", "p5"].includes(priority)) {
      priorityCounts[priority.toUpperCase()] += 1;
    }
    const bucket = String(row[bucketIndex] ?? "").trim() || "(Sem bucket)";
    const isTechnicianBucket = classifyBucket(bucket) === "Fila de técnicos";
    const cm = String(row[cmIndex] ?? "").trim();
    const bucketCm = isTechnicianBucket ? cm : "";
    const bucketKey = JSON.stringify([bucket, bucketCm]);
    const bucketEntry = buckets.get(bucketKey);
    if (bucketEntry) {
      bucketEntry.count += 1;
    } else {
      buckets.set(bucketKey, { bucket, cm: bucketCm, count: 1 });
    }
    if (isTechnicianBucket) {
      const technicianCm = cm || "(Sem CM)";
      if (!isDeactivatedTechnicianCm(technicianCm)) {
        technicianCmCounts.set(technicianCm, (technicianCmCounts.get(technicianCm) || 0) + 1);
        if (!technicianCmsByBucket.has(bucket)) technicianCmsByBucket.set(bucket, new Map());
        const bucketCms = technicianCmsByBucket.get(bucket);
        bucketCms.set(technicianCm, (bucketCms.get(technicianCm) || 0) + 1);
      }
    } else if (cm && !isDeactivatedTechnicianCm(cm)) {
      const state = classifyTechnicianLocation(cm);
      if (Object.hasOwn(commandCenterClosuresByState, state)) {
        commandCenterClosuresByState[state] += 1;
      }
    }
  }

  const sortedBuckets = [...buckets.entries()]
    .map(([, item]) => {
      const { name, cm } = formatBucketLabel(item.bucket, item.cm);
      return { ...item, cmValue: item.cm, group: classifyBucket(item.bucket), name, cm };
    })
    .sort((left, right) => right.count - left.count || left.bucket.localeCompare(right.bucket, "pt-BR"));
  const sortedTechnicianCms = [...technicianCmCounts.entries()]
    .map(([cm, count]) => ({ cm, count }))
    .sort((left, right) => right.count - left.count || left.cm.localeCompare(right.cm, "pt-BR"));
  const technicianClosuresByState = Object.fromEntries(TECHNICIAN_STATE_ORDER.map((state) => [state, 0]));
  for (const { cm, count } of sortedTechnicianCms) {
    const state = classifyTechnicianLocation(cm);
    if (Object.hasOwn(technicianClosuresByState, state)) {
      technicianClosuresByState[state] += count;
    }
  }
  const technicianCmsByBucketEntries = [...technicianCmsByBucket.entries()].map(([bucket, cms]) => [
    bucket,
    [...cms.entries()]
      .map(([cm, count]) => ({ cm, count }))
      .sort((left, right) => right.count - left.count || left.cm.localeCompare(right.cm, "pt-BR"))
  ]);
  const technicianClosuresByBucket = new Map();
  for (const item of sortedBuckets.filter((bucket) => bucket.group === "Fila de técnicos")) {
    let technician = technicianClosuresByBucket.get(item.bucket);
    if (!technician) {
      technician = { bucket: item.bucket, count: 0 };
      technicianClosuresByBucket.set(item.bucket, technician);
    }
    technician.count += item.count;
  }
  const technicianClosures = [...technicianClosuresByBucket.values()].map((technician) => ({
    ...technician,
    group: "Fila de técnicos",
    cmSummary: [...(technicianCmsByBucket.get(technician.bucket) || new Map()).entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "pt-BR"))
      .map(([cm, count]) => `${cm} (${count})`)
      .join(", ")
  }));
  const commandCenterTotal = sortedBuckets.filter((item) => item.group === "Command Center").reduce((total, item) => total + item.count, 0);
  const technicianQueueTotal = sortedBuckets.filter((item) => item.group === "Fila de técnicos").reduce((total, item) => total + item.count, 0);

  return {
    count,
    priorityCounts,
    sortedBuckets,
    sortedTechnicianCms,
    technicianCmsByBucket: new Map(technicianCmsByBucketEntries),
    technicianClosures,
    commandCenterTotal,
    technicianQueueTotal,
    technicianClosuresByState,
    commandCenterClosuresByState
  };
}

function analyzeSelectedSheet() {
  if (!workbook) return;
  hideFeedback();
  const sheetName = workbook.SheetNames.includes(sheetPicker.value) ? sheetPicker.value : workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "", raw: false, blankrows: false });
  if (!rows.length || rows.length < 2) {
    results.classList.add("hidden");
    showFeedback("A aba selecionada está vazia ou contém apenas o cabeçalho.");
    return;
  }

  const bucketIndex = columnIndex(COLUMN_BUCKET);
  const tskIndex = columnIndex(COLUMN_TSK);
  const typeIndex = columnIndex(COLUMN_TYPE);
  const statusIndex = columnIndex(COLUMN_STATUS);
  const cmIndex = columnIndex(COLUMN_CM);
  const priorityIndex = columnIndex(COLUMN_PRIORITY);
  const targetType = normalizeText(TARGET_TYPE);
  const typeRows = rows.slice(1).filter((row) => row.some((value) => String(value ?? "").trim() !== "") && normalizeText(row[typeIndex]) === targetType);
  if (!typeRows.length) {
    results.classList.add("hidden");
    showFeedback(`Nenhuma linha do tipo "${TARGET_TYPE}" foi encontrada na aba "${sheetName}".`);
    return;
  }

  const completedStatus = normalizeText(STATUS_VALUES.completed);
  const completionsByTsk = new Map();
  for (const row of typeRows) {
    const tsk = String(row[tskIndex] ?? "").trim();
    if (tsk && normalizeText(row[statusIndex]) === completedStatus) {
      completionsByTsk.set(tsk, (completionsByTsk.get(tsk) || 0) + 1);
    }
  }
  const repeatedCompletedTsks = new Map([...completionsByTsk.entries()].filter(([, count]) => count > MAX_COMPLETIONS_PER_TSK));
  const matchingRows = typeRows.filter((row) => !(normalizeText(row[statusIndex]) === completedStatus && repeatedCompletedTsks.has(String(row[tskIndex] ?? "").trim())));
  const excludedCompletedCount = typeRows.length - matchingRows.length;

  const reportType = detectReportType(rows, selectedFileName);
  const statusCounts = Object.fromEntries(STATUS_ORDER.map((status) => [status, 0]));
  const unknownStatuses = new Map();
  const createStateCounts = () => new Map([...TECHNICIAN_LOCATION_ORDER, "Outros"].map((location) => [location, { completed: 0, cancelled: 0, pending: 0 }]));
  const statusCountsByState = { all: createStateCounts(), technician: createStateCounts(), commandCenter: createStateCounts() };
  let cancelledCount = 0;
  let completedCount = 0;
  let openCount = 0;

  for (const row of matchingRows) {
    const normalizedStatus = normalizeText(row[statusIndex]);
    const matchingStatus = STATUS_ORDER.find((status) => normalizeText(status) === normalizedStatus);
    if (matchingStatus) {
      statusCounts[matchingStatus] += 1;
    } else {
      const label = String(row[statusIndex] ?? "").trim() || "(vazio)";
      const existing = unknownStatuses.get(label) || 0;
      unknownStatuses.set(label, existing + 1);
    }

    const stateStatusKey = matchingStatus === STATUS_VALUES.completed ? "completed"
      : matchingStatus === STATUS_VALUES.cancelled ? "cancelled"
      : matchingStatus === STATUS_VALUES.pending ? "pending"
      : null;
    if (stateStatusKey) {
      const stateCm = String(row[cmIndex] ?? "").trim();
      const location = stateCm ? classifyTechnicianLocation(stateCm) : "Outros";
      const bucketGroup = classifyBucket(row[bucketIndex]) === "Fila de técnicos" ? "technician" : "commandCenter";
      statusCountsByState.all.get(location)[stateStatusKey] += 1;
      statusCountsByState[bucketGroup].get(location)[stateStatusKey] += 1;
    }

    if (normalizedStatus === normalizeText(STATUS_VALUES.completed)) {
      completedCount += 1;
    } else if (normalizedStatus === normalizeText(STATUS_VALUES.cancelled)) {
      cancelledCount += 1;
    } else if (OPEN_STATUSES.some((status) => normalizedStatus === normalizeText(status))) {
      openCount += 1;
    }
  }

  const columnIndexes = { bucketIndex, statusIndex, cmIndex, priorityIndex };
  const views = {
    completed: buildStatusBreakdown(matchingRows, STATUS_VALUES.completed, columnIndexes),
    pending: buildStatusBreakdown(matchingRows, STATUS_VALUES.pending, columnIndexes)
  };

  // Os campos de "completed" ficam também na raiz: o parcial e a exportação usam sempre as encerradas.
  currentAnalysis = {
    ...views.completed,
    sheetName,
    reportType,
    total: matchingRows.length,
    completedCount,
    cancelledCount,
    openCount,
    pendingCount: statusCounts[STATUS_VALUES.pending],
    statusCountsByState: Object.fromEntries(Object.entries(statusCountsByState).map(([group, counts]) => [
      group,
      [...counts.entries()]
        .map(([location, stateCounts]) => ({ location, ...stateCounts }))
        .filter(({ completed, cancelled, pending }) => completed || cancelled || pending)
    ])),
    statusCounts,
    unknownStatuses,
    views
  };
  renderAnalysis(currentAnalysis);
  const warnings = [];
  if (!reportType) {
    warnings.push(`Não foi possível identificar FMT, TMG, TNE ou TRJ no nome do arquivo ou na aba "${sheetName}". A máscara será copiada sem um tipo de relatório.`);
  }
  if (repeatedCompletedTsks.size) {
    const details = [...repeatedCompletedTsks.entries()].map(([tsk, count]) => `${tsk} (${count}x)`).join(", ");
    warnings.push(`${repeatedCompletedTsks.size} TSK(s) concluída(s) mais de ${MAX_COMPLETIONS_PER_TSK} vezes foram retiradas do report de encerradas (${excludedCompletedCount} linhas): ${details}.`);
  }
  if (unknownStatuses.size) {
    const details = [...unknownStatuses.entries()].map(([status, count]) => `"${status}" (${count})`).join(", ");
    warnings.push(`Foram encontrados status fora das cinco opções esperadas: ${details}. Essas linhas aparecem no total, mas não entram nos grupos de encerrada, cancelada ou em aberto.`);
  }
  if (warnings.length) showFeedback(warnings.join(" "), "warning");
}

function detectReportType(rows, fileName) {
  const fileReportTypes = new Set();
  const reportTypePattern = /(?:^|[^a-z0-9])(fmt|tmg|tne|trj)(?=$|[^a-z0-9])/g;
  for (const match of normalizeText(fileName).matchAll(reportTypePattern)) {
    fileReportTypes.add(match[1].toUpperCase());
  }
  if (fileReportTypes.size === 1) return [...fileReportTypes][0];

  const reportTypes = new Set();
  for (const row of rows) {
    for (const value of row) {
      for (const match of normalizeText(value).matchAll(reportTypePattern)) {
        reportTypes.add(match[1].toUpperCase());
      }
    }
  }
  return reportTypes.size === 1 ? [...reportTypes][0] : null;
}

function renderTechnicianClosures(fullAnalysis) {
  const analysis = getAnalysisView(fullAnalysis);
  const { labels } = analysis;
  const sortMode = document.getElementById("technician-sort").value;
  const sortWrap = document.getElementById("technician-sort-wrap");
  const rows = document.getElementById("technician-closure-rows");
  const foot = document.getElementById("technician-closure-foot");
  const groupsToggle = document.getElementById("technician-groups-toggle");
  const technicianQueueOnly = groupsToggle.getAttribute("aria-pressed") === "true";
  sortWrap.classList.toggle("hidden", !technicianQueueOnly);
  sortWrap.classList.toggle("flex", technicianQueueOnly);
  document.getElementById("technician-closures-title").textContent = technicianQueueOnly
    ? `${labels.title} por bucket · Fila de técnicos`
    : `${labels.title} por bucket`;
  document.getElementById("technician-closures-description").textContent = technicianQueueOnly
    ? `Distribuição das TSKs ${labels.statusLabel} por técnico, sem chamados do Centralizado.`
    : `Distribuição das TSKs ${labels.statusLabel}, do maior para o menor volume.`;
  document.getElementById("technician-cm-title").textContent = `${labels.title} por CM · Fila de técnicos`;
  document.getElementById("technician-cm-description").textContent = `CM identificados na coluna AK, agrupados por estado e ordenados por ${labels.events}.`;
  document.getElementById("technician-cm-count-header").textContent = labels.title;
  groupsToggle.textContent = technicianQueueOnly ? "Mostrar todos os grupos" : "Filtrar fila técnica";
  rows.replaceChildren();
  foot.replaceChildren();

  let displayItems;
  if (technicianQueueOnly) {
    displayItems = [...analysis.technicianClosures];
  } else {
    displayItems = analysis.sortedBuckets.map((item) => ({
      ...item,
      cmSummary: item.group === "Fila de técnicos"
        ? (analysis.technicianCmsByBucket.get(item.bucket) || [])
          .map(({ cm, count }) => `${cm} (${count})`)
          .join(", ")
        : ""
    }));
  }

  if (technicianQueueOnly && sortMode === "cm") {
    const regionOrder = [...TECHNICIAN_LOCATION_ORDER, "Outros"];
    displayItems.sort((left, right) => {
      const leftRegion = getTechnicianLocation(left.bucket, analysis);
      const rightRegion = getTechnicianLocation(right.bucket, analysis);
      const leftCm = getTechnicianSortCm(left.bucket, analysis, leftRegion);
      const rightCm = getTechnicianSortCm(right.bucket, analysis, rightRegion);
      return regionOrder.indexOf(leftRegion) - regionOrder.indexOf(rightRegion)
        || rightCm.count - leftCm.count
        || leftCm.cm.localeCompare(rightCm.cm, "pt-BR", { sensitivity: "base" })
        || left.bucket.localeCompare(right.bucket, "pt-BR", { sensitivity: "base" });
    });
  } else displayItems.sort((left, right) => {
    if (sortMode === "least") {
      return left.count - right.count || left.bucket.localeCompare(right.bucket, "pt-BR");
    }
    return right.count - left.count || left.bucket.localeCompare(right.bucket, "pt-BR");
  });

  if (!displayItems.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 3;
    cell.className = "px-5 py-6 text-center text-sm text-[color:var(--muted)]";
    cell.textContent = technicianQueueOnly ? labels.technicianEmpty : labels.empty;
    row.append(cell);
    rows.append(row);
  } else {
    let previousLocation = null;
    const locationTotals = new Map();
    if (technicianQueueOnly && sortMode === "cm") {
      for (const item of displayItems) {
        const location = getTechnicianLocation(item.bucket, analysis);
        locationTotals.set(location, (locationTotals.get(location) || 0) + item.count);
      }
    }
    for (const item of displayItems) {
      if (technicianQueueOnly && sortMode === "cm") {
        const location = getTechnicianLocation(item.bucket, analysis);
        if (location !== previousLocation) {
          const groupRow = document.createElement("tr");
          groupRow.className = "border-t border-[color:var(--line)] bg-[color:var(--sunken)] font-semibold";
          const groupCell = document.createElement("th");
          groupCell.scope = "row";
          groupCell.colSpan = 2;
          groupCell.className = "px-5 py-2.5 text-[color:var(--ink-3)]";
          groupCell.textContent = location;
          const groupTotalCell = document.createElement("td");
          groupTotalCell.className = "tabular px-5 py-2.5 text-right text-[color:var(--ink-3)]";
          groupTotalCell.textContent = (locationTotals.get(location) || 0).toLocaleString("pt-BR");
          groupRow.append(groupCell, groupTotalCell);
          rows.append(groupRow);
          previousLocation = location;
        }
      }
      const row = document.createElement("tr");
      const bucketCell = document.createElement("td");
      bucketCell.className = "break-all px-5 py-3 font-medium text-[color:var(--ink-2)]";
      const labelWrap = document.createElement("div");
      labelWrap.className = "flex min-w-0 flex-col";
      const bucketName = document.createElement("span");
      bucketName.className = "truncate uppercase";
      bucketName.textContent = (item.bucket || "(Sem bucket)").toUpperCase();
      labelWrap.append(bucketName);
      if (item.cmSummary) {
        const cmLine = document.createElement("span");
        cmLine.className = "mt-0.5 text-[11px] font-normal text-[color:var(--muted)]";
        cmLine.textContent = `CM: ${item.cmSummary}`;
        labelWrap.append(cmLine);
      }
      bucketCell.append(labelWrap);

      const groupCell = document.createElement("td");
      groupCell.className = "px-5 py-3 text-[color:var(--muted)]";
      groupCell.textContent = item.group;
      const countCell = document.createElement("td");
      countCell.className = "tabular px-5 py-3 text-right font-semibold";
      countCell.textContent = item.count.toLocaleString("pt-BR");
      row.append(bucketCell, groupCell, countCell);
      rows.append(row);
    }
  }

  const subtotalRows = technicianQueueOnly
    ? [[labels.technicianTotal, analysis.technicianQueueTotal]]
    : [
        ["Subtotal · Command Center", analysis.commandCenterTotal],
        ["Subtotal · Fila de técnicos", analysis.technicianQueueTotal],
        [labels.total, analysis.count]
      ];
  for (const [label, count] of subtotalRows) {
    const row = document.createElement("tr");
    const labelCell = document.createElement("td");
    labelCell.colSpan = 2;
    labelCell.className = "px-5 py-2.5 text-[color:var(--ink-3)]";
    labelCell.textContent = label;
    const countCell = document.createElement("td");
    countCell.className = "tabular px-5 py-2.5 text-right";
    countCell.textContent = count.toLocaleString("pt-BR");
    row.append(labelCell, countCell);
    foot.append(row);
  }

  const cmPanel = document.getElementById("technician-cm-panel");
  cmPanel.classList.toggle("hidden", !technicianQueueOnly);
  if (technicianQueueOnly) {
    const cmRows = document.getElementById("technician-cm-rows");
    const groupedTechnicianCms = groupTechnicianCms(analysis.sortedTechnicianCms);
    cmRows.replaceChildren();
    if (!groupedTechnicianCms.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 2;
      cell.className = "px-5 py-6 text-center text-sm text-[color:var(--muted)]";
      cell.textContent = `Nenhuma atividade ${currentView === "pending" ? "pendente" : "encerrada"} da fila técnica possui CM para exibir.`;
      row.append(cell);
      cmRows.append(row);
    } else {
      let previousTne = null;
      for (const group of groupedTechnicianCms) {
        const tne = TNE_ONE_TECHNICIAN_LOCATIONS.has(group.location)
          ? "TNE 1"
          : TNE_TWO_TECHNICIAN_LOCATIONS.has(group.location)
            ? "TNE 2"
            : null;
        if (tne && tne !== previousTne) {
          const tneRow = document.createElement("tr");
          tneRow.className = "border-t border-[color:var(--line-strong)] bg-[color:var(--tne-row)] font-bold";
          const tneLabel = document.createElement("th");
          tneLabel.scope = "row";
          tneLabel.className = "px-5 py-2.5 text-[color:var(--ink-2)]";
          tneLabel.textContent = tne;
          const tneTotal = document.createElement("td");
          tneTotal.className = "tabular px-5 py-2.5 text-right text-[color:var(--ink-2)]";
          const tneLocations = tne === "TNE 1" ? TNE_ONE_TECHNICIAN_LOCATIONS : TNE_TWO_TECHNICIAN_LOCATIONS;
          tneTotal.textContent = groupedTechnicianCms
            .filter(({ location }) => tneLocations.has(location))
            .reduce((total, locationGroup) => total + locationGroup.total, 0)
            .toLocaleString("pt-BR");
          tneRow.append(tneLabel, tneTotal);
          cmRows.append(tneRow);
          previousTne = tne;
        }
        const groupRow = document.createElement("tr");
        groupRow.className = "border-t border-[color:var(--line)] bg-[color:var(--sunken)] font-semibold";
        const groupLabel = document.createElement("th");
        groupLabel.scope = "row";
        groupLabel.className = "px-5 py-2.5 text-[color:var(--ink-3)]";
        groupLabel.textContent = tne ? `  ${group.location}` : group.location;
        const groupTotal = document.createElement("td");
        groupTotal.className = "tabular px-5 py-2.5 text-right text-[color:var(--ink-3)]";
        groupTotal.textContent = group.total.toLocaleString("pt-BR");
        groupRow.append(groupLabel, groupTotal);
        cmRows.append(groupRow);

        for (const item of group.cms) {
          const row = document.createElement("tr");
          const cmCell = document.createElement("td");
          cmCell.className = "break-all px-5 py-3 pl-8 font-medium text-[color:var(--ink-2)]";
          cmCell.textContent = item.cm;
          const countCell = document.createElement("td");
          countCell.className = "tabular px-5 py-3 text-right font-semibold";
          countCell.textContent = item.count.toLocaleString("pt-BR");
          row.append(cmCell, countCell);
          cmRows.append(row);
        }
      }
    }
  }
}

function renderStatusCountsByState(analysis) {
  const rows = document.getElementById("state-status-rows");
  const foot = document.getElementById("state-status-foot");
  const stateCounts = analysis.statusCountsByState[currentStateGroup];
  rows.replaceChildren();
  foot.replaceChildren();
  document.getElementById("state-status-description").textContent = STATE_GROUP_DESCRIPTIONS[currentStateGroup];
  for (const button of document.querySelectorAll(".state-group-button")) {
    button.setAttribute("aria-pressed", String(button.dataset.stateGroup === currentStateGroup));
  }
  const buildRow = (label, counts, isTotal = false) => {
    const row = document.createElement("tr");
    const labelCell = document.createElement(isTotal ? "th" : "td");
    if (isTotal) labelCell.scope = "row";
    labelCell.className = `px-5 py-2.5 ${isTotal ? "text-[color:var(--ink)]" : "text-[color:var(--ink-4)]"}`;
    labelCell.textContent = label;
    row.append(labelCell);
    for (const [key, color, padding] of [["completed", "text-[color:var(--green)]", "px-2"], ["cancelled", "text-[color:var(--orange)]", "px-2"], ["pending", "text-[color:var(--orange)]", "px-5"]]) {
      const cell = document.createElement("td");
      cell.className = `tabular ${padding} py-2.5 text-right font-semibold ${color}`;
      cell.textContent = counts[key].toLocaleString("pt-BR");
      row.append(cell);
    }
    return row;
  };

  if (!stateCounts.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.className = "px-5 py-6 text-center text-sm text-[color:var(--muted)]";
    cell.textContent = "Nenhuma TSK encerrada, cancelada ou pendente nesta aba.";
    row.append(cell);
    rows.append(row);
    return;
  }
  for (const item of stateCounts) {
    rows.append(buildRow(item.location, item));
  }
  const sumOf = (key) => stateCounts.reduce((total, item) => total + item[key], 0);
  foot.append(buildRow("Total", { completed: sumOf("completed"), cancelled: sumOf("cancelled"), pending: sumOf("pending") }, true));
}

function renderAnalysis(fullAnalysis) {
  renderTechnicianClosures(fullAnalysis);
  const analysis = getAnalysisView(fullAnalysis);
  const { labels } = analysis;
  document.getElementById("group-share-title").textContent = `${labels.title} por grupo`;
  document.getElementById("group-share-description").textContent = `Percentual no total de TSKs ${labels.statusLabel}.`;
  document.getElementById("tne-total-comparison-title").textContent = `${labels.title}: TNE 1 x TNE 2`;
  document.getElementById("tne-total-comparison-description").textContent = `Percentual do total de ${labels.events} atribuído a cada TNE, incluindo técnicos e Centralizado.`;
  document.getElementById("priority-title").textContent = `${labels.title} por prioridade`;
  document.getElementById("priority-description").textContent = `${labels.title} por prioridade.`;
  document.getElementById("chart-description").textContent = `Cada barra representa a participação no total de ${labels.lower}.`;
  document.getElementById("total-count").textContent = analysis.total.toLocaleString("pt-BR");
  document.getElementById("closed-count").textContent = analysis.completedCount.toLocaleString("pt-BR");
  document.getElementById("cancelled-count").textContent = analysis.cancelledCount.toLocaleString("pt-BR");
  document.getElementById("pending-count").textContent = analysis.pendingCount.toLocaleString("pt-BR");
  renderStatusCountsByState(analysis);
  document.getElementById("analyzed-sheet").textContent = `Aba: ${analysis.sheetName}`;

  for (const priority of ["P1", "P2", "P3", "P4", "P5"]) {
    document.getElementById(`priority-${priority.toLowerCase()}`).textContent = analysis.priorityCounts[priority].toLocaleString("pt-BR");
  }

  const statusRows = document.getElementById("status-rows");
  statusRows.replaceChildren();
  for (const status of STATUS_ORDER) {
    const row = document.createElement("div");
    row.className = "flex items-center justify-between gap-4 py-3 text-sm";
    const label = document.createElement("span");
    label.className = "text-[color:var(--ink-4)]";
    label.textContent = STATUS_LABELS[status];
    const count = document.createElement("span");
    count.className = "tabular font-semibold text-[color:var(--ink)]";
    count.textContent = analysis.statusCounts[status].toLocaleString("pt-BR");
    row.append(label, count);
    statusRows.append(row);
  }

  const commandCenterPercentage = analysis.count
    ? (analysis.commandCenterTotal / analysis.count) * 100
    : 0;
  const technicianQueuePercentage = analysis.count
    ? (analysis.technicianQueueTotal / analysis.count) * 100
    : 0;
  const groupDonut = document.getElementById("group-donut");
  groupDonut.style.background = analysis.count
    ? `conic-gradient(var(--green) 0% ${commandCenterPercentage}%, var(--amber) ${commandCenterPercentage}% 100%)`
    : "var(--track)";
  groupDonut.setAttribute(
    "aria-label",
    `${labels.title} por grupo: Centralizado ${Math.round(commandCenterPercentage)}%, Fila de técnicos ${Math.round(technicianQueuePercentage)}%`
  );
  document.getElementById("command-center-percent").textContent = `${Math.round(commandCenterPercentage)}%`;

  const groupLegend = document.getElementById("group-donut-legend");
  groupLegend.replaceChildren();
  for (const group of [
    { label: "Centralizado", count: analysis.commandCenterTotal, percentage: commandCenterPercentage, color: "var(--green)" },
    { label: "Fila de técnicos", count: analysis.technicianQueueTotal, percentage: technicianQueuePercentage, color: "var(--amber)" }
  ]) {
    const row = document.createElement("div");
    row.className = "flex items-center justify-between gap-3 text-xs";
    const labelWrap = document.createElement("span");
    labelWrap.className = "flex min-w-0 items-center gap-2 text-[color:var(--ink-4)]";
    const swatch = document.createElement("span");
    swatch.className = "h-2.5 w-2.5 shrink-0 rounded-full";
    swatch.style.backgroundColor = group.color;
    const label = document.createElement("span");
    label.textContent = group.label;
    const value = document.createElement("span");
    value.className = "tabular shrink-0 font-semibold text-[color:var(--ink-3)]";
    value.textContent = `${Math.round(group.percentage)}% · ${group.count.toLocaleString("pt-BR")}`;
    labelWrap.append(swatch, label);
    row.append(labelWrap, value);
    groupLegend.append(row);
  }

  const tneOneClosures = [...TNE_ONE_TECHNICIAN_LOCATIONS]
    .reduce((total, state) => total + analysis.technicianClosuresByState[state], 0);
  const tneTwoClosures = [...TNE_TWO_TECHNICIAN_LOCATIONS]
    .reduce((total, state) => total + analysis.technicianClosuresByState[state], 0);
  const tneOneCommandCenterClosures = [...TNE_ONE_TECHNICIAN_LOCATIONS]
    .reduce((total, state) => total + analysis.commandCenterClosuresByState[state], 0);
  const tneTwoCommandCenterClosures = [...TNE_TWO_TECHNICIAN_LOCATIONS]
    .reduce((total, state) => total + analysis.commandCenterClosuresByState[state], 0);
  renderComparisonDonut({
    id: "tne-one-comparison",
    technicianLabel: "TNE 1",
    technicianCount: tneOneClosures,
    commandCenterCount: tneOneCommandCenterClosures,
    viewTitle: labels.title
  });
  renderComparisonDonut({
    id: "tne-two-comparison",
    technicianLabel: "TNE 2",
    technicianCount: tneTwoClosures,
    commandCenterCount: tneTwoCommandCenterClosures,
    viewTitle: labels.title
  });
  renderComparisonDonut({
    id: "tne-total-comparison",
    technicianLabel: "TNE 2",
    technicianCount: tneTwoClosures + tneTwoCommandCenterClosures,
    commandCenterLabel: "TNE 1",
    commandCenterCount: tneOneClosures + tneOneCommandCenterClosures,
    viewTitle: labels.title
  });

  renderBucketChart(fullAnalysis);
  results.classList.remove("hidden");
  clearButton.classList.remove("hidden");
  clearButton.classList.add("inline-flex");
}

function renderBucketChart(fullAnalysis) {
  const analysis = getAnalysisView(fullAnalysis);
  const { labels } = analysis;
  const technicianQueueOnly = document.getElementById("technician-groups-toggle").getAttribute("aria-pressed") === "true";
  const buckets = technicianQueueOnly
    ? analysis.sortedBuckets.filter((item) => item.group !== "Command Center")
    : analysis.sortedBuckets;
  const total = buckets.reduce((sum, item) => sum + item.count, 0);
  document.getElementById("chart-title").textContent = technicianQueueOnly
    ? `${labels.volume} · Fila de técnicos`
    : labels.volume;
  const chart = document.getElementById("bucket-chart");
  chart.replaceChildren();
  document.getElementById("chart-total").textContent = `${total.toLocaleString("pt-BR")} ${labels.lower}`;
  if (!buckets.length) {
    const empty = document.createElement("p");
    empty.className = "py-4 text-sm text-[color:var(--muted)]";
    empty.textContent = "Sem dados para exibir no gráfico.";
    chart.append(empty);
  } else {
    const maxCount = buckets[0].count;
    for (const item of buckets) {
      const row = document.createElement("div");
      row.className = "grid grid-cols-[minmax(92px,1.1fr)_minmax(100px,3fr)_36px] items-center gap-3 text-xs sm:grid-cols-[minmax(150px,1.2fr)_minmax(120px,4fr)_42px]";
      const labelWrap = document.createElement("div");
      labelWrap.className = "flex min-w-0 flex-col";
      const label = document.createElement("span");
      label.className = "truncate font-medium uppercase text-[color:var(--ink-3)]";
      label.title = item.bucket;
      label.textContent = item.name.toUpperCase();
      labelWrap.append(label);
      if (item.cm) {
        const subLabel = document.createElement("span");
        subLabel.className = "mt-0.5 truncate text-[10px] font-medium uppercase tracking-[0.08em] text-[color:var(--muted)]";
        subLabel.textContent = item.cm.toUpperCase();
        labelWrap.append(subLabel);
      }
      const track = document.createElement("div");
      track.className = "bar-track h-2.5 overflow-hidden rounded-full";
      const bar = document.createElement("div");
      bar.className = `h-full rounded-full ${item.group === "Command Center" ? "bg-[color:var(--blue)]" : "bg-[color:var(--green)]"}`;
      bar.style.width = `${Math.max((item.count / maxCount) * 100, 2)}%`;
      track.append(bar);
      const count = document.createElement("span");
      count.className = "tabular text-right font-semibold text-[color:var(--ink-3)]";
      count.textContent = item.count.toLocaleString("pt-BR");
      row.append(labelWrap, track, count);
      chart.append(row);
    }
  }
}

function renderComparisonDonut({ id, technicianLabel, technicianCount, commandCenterLabel = "Centralizado", commandCenterCount, viewTitle = "Encerradas" }) {
  const total = technicianCount + commandCenterCount;
  const commandCenterPercentage = total ? (commandCenterCount / total) * 100 : 0;
  const technicianPercentage = total ? (technicianCount / total) * 100 : 0;
  const donut = document.getElementById(`${id}-donut`);
  donut.style.background = total
    ? `conic-gradient(var(--green) 0% ${commandCenterPercentage}%, var(--amber) ${commandCenterPercentage}% 100%)`
    : "var(--track)";
  donut.setAttribute(
    "aria-label",
    `${viewTitle}: ${commandCenterLabel} ${Math.round(commandCenterPercentage)}%, ${technicianLabel} ${Math.round(technicianPercentage)}%`
  );
  document.getElementById(`${id}-percent`).textContent = `${Math.round(commandCenterPercentage)}%`;
  document.getElementById(`${id}-center-label`).textContent = commandCenterLabel;

  const legend = document.getElementById(`${id}-legend`);
  legend.replaceChildren();
  for (const item of [
    { label: commandCenterLabel, count: commandCenterCount, percentage: commandCenterPercentage, color: "var(--green)" },
    { label: technicianLabel, count: technicianCount, percentage: technicianPercentage, color: "var(--amber)" }
  ]) {
    const row = document.createElement("div");
    row.className = "flex items-center justify-between gap-3 text-xs";
    const labelWrap = document.createElement("span");
    labelWrap.className = "flex min-w-0 items-center gap-2 text-[color:var(--ink-4)]";
    const swatch = document.createElement("span");
    swatch.className = "h-2.5 w-2.5 shrink-0 rounded-full";
    swatch.style.backgroundColor = item.color;
    const label = document.createElement("span");
    label.textContent = item.label;
    const value = document.createElement("span");
    value.className = "tabular shrink-0 font-semibold text-[color:var(--ink-3)]";
    value.textContent = `${Math.round(item.percentage)}% · ${item.count.toLocaleString("pt-BR")}`;
    labelWrap.append(swatch, label);
    row.append(labelWrap, value);
    legend.append(row);
  }
}

function escapeCsv(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function buildBacklogSummary(analysis, neDownCount = null) {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const time = `${String(now.getHours()).padStart(2, "0")}:00`;
  const reportType = analysis.reportType || "Não identificado";
  const formatCount = (count) => count.toLocaleString("pt-BR");
  const formatOptionalCount = (value) => value === "" ? "" : Number(value).toLocaleString("pt-BR");
  const backlogValue = document.getElementById("backlog-input").value;
  const backlogCount = backlogValue === "" ? null : Number(backlogValue);
  const hasBacklog = Number.isInteger(backlogCount) && backlogCount >= 0;
  const analyzedCount = hasBacklog
    ? formatCount(backlogCount + analysis.cancelledCount + analysis.completedCount)
    : "";
  const entrants = formatOptionalCount(document.getElementById("entrants-input").value);
  const backlog = hasBacklog ? formatCount(backlogCount) : "";

  const lines = [
    `➡️ Parciais Backlog ${reportType}:`,
    "",
    `Análise de Limpeza de Fila FMMT ${reportType} - ${time}HS`,
    "",
    `✔️ Tickets Analisados: ${analyzedCount}`,
    `✅ Tickets Normalizados ${formatCount(analysis.completedCount)} - ${formatCount(analysis.commandCenterTotal)} (CCI) // ${formatCount(analysis.technicianQueueTotal)} (CAMPO)`,
    `🚫 Tickets Cancelados: ${formatCount(analysis.cancelledCount)}`,
    `❌ Tickets em falha: ${backlog}`,
    `▶️ Entrantes: ${entrants}`,
    "",
    `Backlog no momento: ${backlog}`
  ];
  // Sem o TrocaIP não há contagem do Genesis, então a linha sai do parcial.
  if (neDownCount !== null) lines.push("", `SITES FORA COM FLAG 1: ${formatCount(neDownCount)}`);
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

// Cores do tema ativo na tela (claro ou escuro, pelo data-theme do <html>): a imagem do
// gráfico sai no mesmo tema em que a página está.
function readThemeColors(names) {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(`--${name}`).trim()]));
}

// Desenha o gráfico "Encerradas por grupo" num canvas (o html2canvas não renderiza conic-gradient).
function renderGroupShareImage(analysis) {
  const colors = readThemeColors(["surface", "line", "ink", "ink-3", "ink-4", "muted", "green", "amber", "track"]);
  const font = getComputedStyle(document.body).fontFamily;
  const width = 420;
  const height = 360;
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

  context.textBaseline = "alphabetic";
  context.fillStyle = colors.ink;
  context.font = `600 17px ${font}`;
  context.fillText("Encerradas por grupo", 24, 40);
  context.fillStyle = colors.muted;
  context.font = `12px ${font}`;
  context.fillText("Percentual no total de TSKs concluídas.", 24, 60);

  const total = analysis.commandCenterTotal + analysis.technicianQueueTotal;
  const groups = [
    { label: "Centralizado", count: analysis.commandCenterTotal, color: colors.green },
    { label: "Fila de técnicos", count: analysis.technicianQueueTotal, color: colors.amber }
  ].map((group) => ({ ...group, percentage: total ? (group.count / total) * 100 : 0 }));

  const centerX = width / 2;
  const centerY = 165;
  const outerRadius = 90;
  const innerRadius = outerRadius * 0.52;
  let angle = -Math.PI / 2;
  for (const group of total ? groups : [{ percentage: 100, color: colors.track }]) {
    const sweep = (group.percentage / 100) * Math.PI * 2;
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.arc(centerX, centerY, outerRadius, angle, angle + sweep);
    context.closePath();
    context.fillStyle = group.color;
    context.fill();
    angle += sweep;
  }
  context.beginPath();
  context.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
  context.fillStyle = colors.surface;
  context.fill();

  context.textAlign = "center";
  context.fillStyle = colors.ink;
  context.font = `600 26px ${font}`;
  context.fillText(`${Math.round(groups[0].percentage)}%`, centerX, centerY + 4);
  context.fillStyle = colors.muted;
  context.font = `10px ${font}`;
  context.fillText("Centralizado", centerX, centerY + 22);

  groups.forEach((group, index) => {
    const y = 296 + index * 28;
    context.beginPath();
    context.arc(30, y - 4, 5, 0, Math.PI * 2);
    context.fillStyle = group.color;
    context.fill();
    context.textAlign = "left";
    context.fillStyle = colors["ink-4"];
    context.font = `13px ${font}`;
    context.fillText(group.label, 44, y);
    context.textAlign = "right";
    context.fillStyle = colors["ink-3"];
    context.font = `600 13px ${font}`;
    context.fillText(`${Math.round(group.percentage)}% · ${group.count.toLocaleString("pt-BR")}`, width - 24, y);
  });

  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Falha ao gerar imagem"))), "image/png"));
}

function downloadBlob(blob, fileName) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
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

// ===== TrocaIP / Genesis: NE IDs fora (Flag 1) no report =====
// Fluxo completo da consulta ao Genesis via TrocaIP.exe para o parcial do backlog:
//   1. GENESIS_NE_DOWN_URL / GENESIS_TIMEOUT_MS (topo do arquivo): endpoint local do TrocaIP.
//   2. fetchGenesisNeDownCount (abaixo): busca a contagem de NE IDs fora no Genesis.
//   3. isGenesisAccessBlocked / genesisUnavailableMessage: avisos quando a consulta falha.
//   4. copyBacklogSummary: junta a contagem ao texto e copia o parcial.
//   5. buildBacklogSummary: escreve a linha "SITES FORA COM FLAG 1" no report.
//   6. Fim do arquivo: consulta inicial ao abrir a página (pedido de acesso à rede local).
// Retorna null se o TrocaIP.exe não estiver rodando ou o Genesis não responder.
async function fetchGenesisNeDownCount() {
  try {
    const response = await fetch(GENESIS_NE_DOWN_URL, { cache: "no-store", signal: AbortSignal.timeout(GENESIS_TIMEOUT_MS) });
    if (!response.ok) return null;
    const { neFora } = await response.json();
    return Number.isInteger(neFora) ? neFora : null;
  } catch {
    return null;
  }
}

// No site publicado (https), o navegador só deixa falar com o TrocaIP (127.0.0.1) depois
// que o usuário permite o acesso à rede local; "denied" = bloqueado nas permissões do site.
async function isGenesisAccessBlocked() {
  try {
    return (await navigator.permissions.query({ name: "loopback-network" })).state === "denied";
  } catch {
    return false;
  }
}

async function genesisUnavailableMessage() {
  if (await isGenesisAccessBlocked()) {
    return "Parcial copiado, mas sem os sites fora com flag 1: o navegador bloqueou o acesso à rede local para este site. Clique no ícone à esquerda do endereço → Permissões do site → permita o acesso a dispositivos/rede local e recarregue a página.";
  }
  return "Parcial copiado, mas sem os sites fora com flag 1: não foi possível consultar o Genesis. Confira se o TrocaIP.exe está aberto (ícone TLP perto do relógio), a VPN conectada e, se o navegador perguntar, permita o acesso à rede local.";
}

// A cópia é pedida já no clique, com o texto como promessa: esperar o Genesis antes de
// copiar faz o navegador perder o gesto do usuário e bloquear a área de transferência.
async function copyTextWhenReady(textPromise) {
  try {
    if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
      const blobPromise = textPromise.then((text) => new Blob([text], { type: "text/plain" }));
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": blobPromise })]);
      return;
    }
  } catch {
    // Segue para a cópia comum.
  }
  await copyText(await textPromise);
}

async function copyBacklogSummary() {
  if (!currentAnalysis) return;
  const analysis = currentAnalysis;
  const countPromise = fetchGenesisNeDownCount();
  try {
    await copyTextWhenReady(countPromise.then((count) => buildBacklogSummary(analysis, count)));
    const neDownCount = await countPromise;
    showFeedback(
      neDownCount === null
        ? await genesisUnavailableMessage()
        : `Parcial copiado para a área de transferência (sites fora com flag 1: ${neDownCount.toLocaleString("pt-BR")}).`,
      neDownCount === null ? "error" : "success"
    );
  } catch {
    showFeedback("Não foi possível copiar. Verifique a permissão de área de transferência do navegador.");
  }
}

// Copia só a imagem do gráfico, para colar no report depois do texto do parcial.
async function copyGroupShareImage() {
  if (!currentAnalysis) return;
  const imagePromise = renderGroupShareImage(currentAnalysis);
  try {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("Clipboard indisponível");
    await navigator.clipboard.write([new ClipboardItem({ "image/png": imagePromise })]);
    showFeedback("Gráfico Encerradas por grupo copiado.", "success");
  } catch {
    try {
      downloadBlob(await imagePromise, "encerradas-por-grupo.png");
      showFeedback("O navegador não permite copiar a imagem; o gráfico foi baixado como PNG.", "success");
    } catch {
      showFeedback("Não foi possível gerar a imagem do gráfico.");
    }
  }
}

function exportTechniciansByRegion() {
  if (!currentAnalysis) return;
  if (!window.XLSX?.utils?.book_new || !window.XLSX?.utils?.aoa_to_sheet || !window.XLSX?.writeFile) {
    showFeedback("Não foi possível criar a planilha Excel. Verifique sua conexão e recarregue a página.");
    return;
  }

  const techniciansByName = new Map();
  for (const bucket of currentAnalysis.sortedBuckets.filter((item) => item.group === "Fila de técnicos")) {
    const match = bucket.bucket.trim().match(/^TLP-\s*T?\d+-(.+)$/i);
    const technicianName = match ? match[1].trim() : bucket.bucket.trim();
    const record = techniciansByName.get(technicianName) || {
      technician: technicianName,
      count: 0,
      cmCounts: new Map()
    };
    record.count += bucket.count;
    for (const { cm, count } of currentAnalysis.technicianCmsByBucket.get(bucket.bucket) || []) {
      record.cmCounts.set(cm, (record.cmCounts.get(cm) || 0) + count);
    }
    techniciansByName.set(technicianName, record);
  }

  if (!techniciansByName.size) {
    showFeedback("Não há técnicos da fila técnica com TSKs encerradas para exportar.", "warning");
    return;
  }

  const locationOrder = TECHNICIAN_STATE_ORDER;
  const techniciansByState = new Map(locationOrder.map((state) => [state, new Map()]));
  const overviewTechnicians = [];

  for (const technician of techniciansByName.values()) {
    const cmEntries = [...technician.cmCounts.entries()]
      .map(([cm, count]) => ({ cm, count, state: classifyTechnicianLocation(cm) }))
      .filter(({ state }) => locationOrder.includes(state));
    const technicianStateCounts = new Map();
    for (const { cm, count, state } of cmEntries) {
      technicianStateCounts.set(state, (technicianStateCounts.get(state) || 0) + count);
      const techniciansInState = techniciansByState.get(state);
      const stateTechnician = techniciansInState.get(technician.technician) || {
        technician: technician.technician,
        cmCounts: new Map(),
        count: 0
      };
      stateTechnician.cmCounts.set(cm, (stateTechnician.cmCounts.get(cm) || 0) + count);
      stateTechnician.count += count;
      techniciansInState.set(technician.technician, stateTechnician);
    }
    for (const [state, count] of technicianStateCounts) {
      const stateCms = cmEntries
        .filter((entry) => entry.state === state)
        .map(({ cm }) => cm)
        .sort((left, right) => left.localeCompare(right, "pt-BR", { sensitivity: "base" }));
      overviewTechnicians.push({ technician: technician.technician, cm: stateCms.join(", "), count, region: state });
    }
  }

  const exportWorkbook = XLSX.utils.book_new();
  const overviewRows = [...overviewTechnicians].sort((left, right) =>
    locationOrder.indexOf(left.region) - locationOrder.indexOf(right.region)
    || left.technician.localeCompare(right.technician, "pt-BR", { sensitivity: "base" })
  );
  const techniciansSheet = XLSX.utils.aoa_to_sheet([
    ["CM", "Nome do técnico", "TSKs encerradas"],
    ...overviewRows.map(({ cm, technician, count }) => [cm, technician, count])
  ]);
  XLSX.utils.book_append_sheet(exportWorkbook, techniciansSheet, "Tec por região");
  for (const [state, technicians] of techniciansByState) {
    const stateRows = [...technicians.values()]
      .map(({ technician, cmCounts, count }) => ({
        technician,
        cm: [...cmCounts.keys()].sort((left, right) => left.localeCompare(right, "pt-BR", { sensitivity: "base" })).join(", "),
        count
      }))
      .sort((left, right) => left.technician.localeCompare(right.technician, "pt-BR", { sensitivity: "base" }));
    const stateSheet = XLSX.utils.aoa_to_sheet([
      ["CM", "Nome do técnico", "TSKs encerradas"],
      ...stateRows.map(({ cm, technician, count }) => [cm, technician, count])
    ]);
    XLSX.utils.book_append_sheet(exportWorkbook, stateSheet, state);
  }

  XLSX.writeFile(exportWorkbook, `tecnicos-por-regiao-TNE-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function exportCsv() {
  if (!currentAnalysis) return;
  const analysis = currentAnalysis;
  const rows = [
    ["Tipo da Atividade", TARGET_TYPE],
    ["Estado", STATUS_LABELS[STATUS_VALUES.completed]],
    [],
    ["Rótulos de Linha", "Contagem de Número de Ordem"],
    ...analysis.sortedBuckets.map((item) => [item.bucket, item.count]),
    ["Total Geral", analysis.completedCount],
    ["P1 Encerradas", analysis.priorityCounts.P1],
    ["P2 Encerradas", analysis.priorityCounts.P2],
    ["P3 Encerradas", analysis.priorityCounts.P3],
    ["P4 Encerradas", analysis.priorityCounts.P4],
    ["P5 Encerradas", analysis.priorityCounts.P5]
  ];
  const csv = "\uFEFF" + rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `resumo-tsks-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function clearAnalysis(clearFileInput = true) {
  workbook = null;
  currentAnalysis = null;
  currentStateGroup = "all";
  setView("completed");
  results.classList.add("hidden");
  sheetPickerWrap.classList.add("hidden");
  fileMeta.classList.add("hidden");
  clearButton.classList.add("hidden");
  clearButton.classList.remove("inline-flex");
  hideFeedback();
  document.getElementById("entrants-input").value = "";
  document.getElementById("backlog-input").value = "";
  document.getElementById("technician-sort").value = "most";
  document.getElementById("technician-groups-toggle").setAttribute("aria-pressed", "false");
  document.getElementById("technician-sort-wrap").classList.add("hidden");
  document.getElementById("technician-sort-wrap").classList.remove("flex");
  document.getElementById("technician-cm-panel").classList.add("hidden");
  document.getElementById("technician-closures-title").textContent = "Encerradas por bucket";
  document.getElementById("technician-closures-description").textContent = "Distribuição das TSKs concluídas, do maior para o menor volume.";
  document.getElementById("technician-groups-toggle").textContent = "Filtrar fila técnica";
  for (const priority of ["P1", "P2", "P3", "P4", "P5"]) {
    document.getElementById(`priority-${priority.toLowerCase()}`).textContent = "0";
  }
  if (clearFileInput) {
    fileInput.value = "";
    selectedFileName = "";
    clearSharedFile();
  }
}

fileInput.addEventListener("change", (event) => loadFile(event.target.files[0]));
sheetPicker.addEventListener("change", analyzeSelectedSheet);
document.getElementById("technician-sort").addEventListener("change", () => {
  if (currentAnalysis) renderTechnicianClosures(currentAnalysis);
});
document.getElementById("technician-groups-toggle").addEventListener("click", (event) => {
  const button = event.currentTarget;
  button.setAttribute("aria-pressed", button.getAttribute("aria-pressed") !== "true");
  if (currentAnalysis) {
    renderTechnicianClosures(currentAnalysis);
    renderBucketChart(currentAnalysis);
  }
});
for (const button of document.querySelectorAll(".state-group-button")) {
  button.addEventListener("click", () => {
    currentStateGroup = button.dataset.stateGroup;
    if (currentAnalysis) renderStatusCountsByState(currentAnalysis);
  });
}
for (const card of document.querySelectorAll(".view-card")) {
  card.addEventListener("click", () => {
    setView(card.dataset.view);
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("technician-closures-title").closest("section")
      .scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  });
}
document.getElementById("copy-summary-button").addEventListener("click", copyBacklogSummary);
// Consulta já ao abrir: o pedido de acesso à rede local aparece agora, e não no meio da cópia.
fetchGenesisNeDownCount();
document.getElementById("copy-chart-button").addEventListener("click", copyGroupShareImage);
document.getElementById("export-technicians-button").addEventListener("click", exportTechniciansByRegion);
clearButton.addEventListener("click", () => clearAnalysis());
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

// Planilha importada na Análise diária de técnicos (mesma aba do navegador).
const sharedFile = loadSharedFile();
if (sharedFile) loadFile(sharedFile, true);
