'use strict';

// ============================================================
// 1) Constantes e configuração
// ============================================================

// Aba de atividades analisada por padrão (comparada sem acento, caixa e espaços).
// Se não existir, a primeira aba do arquivo é usada; o seletor permite trocar.
const ACTIVITY_SHEET_NAME = 'Planilha2';

// Ordem das regiões (TNE1: AL, BA, PI e SE; TNE2: CE, PB, PE e RN). Vazio = ordem em que aparecem na aba.
const REGION_ORDER = ['TNE1', 'TNE2'];

// Quantas linhas iniciais são examinadas para localizar a linha de cabeçalho.
const HEADER_SCAN_ROWS = 15;

// Aliases de cabeçalho da aba de atividades. A ordem das chaves é a prioridade de
// mapeamento: campos mais específicos vêm antes dos genéricos (naoIniciado antes de
// iniciado, gerente antes de responsavel). Uma coluna nunca é usada por dois campos.
const ACTIVITY_HEADER_ALIASES = {
  tecnicos: ['Técnicos', 'Tecnicos', 'Técnico', 'Rótulos de Linha'],
  cancelada: ['Cancelada'],
  concluida: ['Concluída', 'Concluida'],
  naoIniciado: ['Não iniciado', 'Nao iniciado', 'Não iniciada', 'Nao iniciada'],
  iniciado: ['Iniciado', 'Iniciada'],
  pendente: ['Pendente'],
  totalGeral: ['Total Geral'],
  horario: ['Horário', 'Horario', 'Tempo de trabalho'],
  regiao: ['Região', 'Regiao', 'Regional'],
  cm: ['Unidade organizacional', 'CM'],
  gerente: ['Gerente', 'Gerente Responsável'],
  responsavel: ['Responsável', 'Coordenador', 'Responsável Coordenador']
};
const ACTIVITY_REQUIRED = ['tecnicos', 'concluida', 'pendente'];

// Extração bruta do TOA (aba "Page 1"): uma linha por atividade. Quando essas três
// colunas existem, a contagem por técnico é montada aqui, como na tabela dinâmica.
const TOA_HEADER_ALIASES = {
  provedor: ['Provedor'],
  tipo: ['Tipo da Atividade'],
  estado: ['Estado']
};

// Tipos de atividade preventiva; todos os demais contam como corretiva.
const TOA_PREVENTIVA_TYPES = ['Atividade Preventiva'];

// Estados que contam como TSK em fila (base da classificação do técnico).
const FILA_FIELDS = ['iniciado', 'naoIniciado', 'pendente'];

// Visão por tipo de técnico. Corretiva conta só atividades não preventivas (como a
// tabela dinâmica), Preventiva só as preventivas e Todos conta tudo. A conclusão é a
// exceção: conta as concluídas de qualquer tipo (TIPO_ALL_FIELDS).
const TIPO_ALL_FIELDS = ['concluida'];
const TIPO_TECNICO_OPTIONS = [
  ['all', 'Todos'],
  ['corretiva', 'Corretivas'],
  ['preventiva', 'Preventivas']
];

// Estado do TOA (normalizado) → campo numérico.
const TOA_ESTADOS = {
  cancelada: 'cancelada',
  concluida: 'concluida',
  iniciado: 'iniciado',
  iniciada: 'iniciado',
  'nao iniciado': 'naoIniciado',
  'nao iniciada': 'naoIniciado',
  pendente: 'pendente'
};

// Provedor que é um técnico ("TLP-T0000000-NOME"); os demais (CMs, centrais,
// COMMAND_CENTER etc.) ficam fora da contagem sem gerar aviso.
const TECNICO_PROVEDOR = /^[A-Z]+-T\d+-/i;

// Cabeçalhos aceitos na planilha de cadastro enviada pela tela.
const CADASTRO_HEADER_ALIASES = {
  tecnico: ['Nome do recurso', 'Técnicos', 'Tecnicos', 'Técnico'],
  horario: ['Tempo de trabalho', 'Horário', 'Horario'],
  cm: ['Unidade organizacional', 'CM'],
  responsavel: ['Coordenador', 'Responsável', 'Responsavel', 'Responsável Coordenador'],
  regiao: ['Regional', 'Região', 'Regiao'],
  gerente: ['Gerente', 'Gerente Responsável']
};

const CADASTRO_STORAGE_KEY = 'reportFilaTecTNE.cadastro';

const FIELD_LABELS = { tecnicos: 'Técnicos', concluida: 'Concluída', pendente: 'Pendente' };

const FALLBACK = {
  codigo: 'Não informado',
  regiao: 'Região não identificada',
  cm: 'CM não informado',
  responsavel: 'Responsável não informado',
  gerente: 'Gerente não informado',
  horario: 'Não informado'
};

// Linhas de totalização de tabela dinâmica que não são técnicos.
const SUMMARY_ROW_LABELS = new Set(['total geral', 'total', '(vazio)', 'rotulos de linha']);

const NUMERIC_FIELDS = ['cancelada', 'concluida', 'iniciado', 'naoIniciado', 'pendente'];

// Vocabulário único de situação. "order" define a severidade (0 = mais crítico).
const SITUACAO = {
  semConclusaoSemPendencia: {
    label: 'Sem conclusão + sem pendência', color: 'var(--red)', order: 0,
    badge: 'bg-[color:var(--red-soft)] text-[color:var(--red)]'
  },
  semConclusaoComPendencia: {
    label: 'Sem conclusão + com pendência', color: 'var(--amber)', order: 1,
    badge: 'bg-[color:var(--orange-soft)] text-[color:var(--orange)]'
  },
  comConclusao: {
    label: 'Com conclusão', color: 'var(--green)', order: 2,
    badge: 'bg-[color:var(--green-soft)] text-[color:var(--green)]'
  }
};

// Técnicos por imagem no "Exportar report"; acima disso o print é dividido em partes.
const REPORT_ROWS_PER_IMAGE = 30;

// Centro do gráfico de situação conforme o filtro de situação (padrão: taxa de conclusão).
const DONUT_CENTERS = {
  comConclusao: { predicate: (r) => isComConclusao(r), color: 'var(--green)', caption: ['Taxa de conclusão'], descricao: 'concluíram' },
  semConclusao: { predicate: (r) => isSemConclusao(r), color: 'var(--orange)', caption: ['Sem conclusão'], descricao: 'sem conclusão' },
  semConclusaoComPendencia: { predicate: (r) => isSemConclusaoComPendencia(r), color: 'var(--amber)', caption: ['Sem conclusão', '+ com pendência'], descricao: 'sem conclusão com pendência' },
  semConclusaoSemPendencia: { predicate: (r) => isSemConclusaoSemPendencia(r), color: 'var(--red)', caption: ['Sem conclusão', '+ sem pendência'], descricao: 'sem conclusão sem pendência' }
};

// Cor do card e da fatia "Não iniciaram" (mesmo azul do card Técnicos).
const NAO_INICIARAM_COLOR = 'var(--blue)';

const SITUACAO_FILTER_OPTIONS = [
  ['all', 'Todas'],
  ['comConclusao', 'Com conclusão'],
  ['semConclusao', 'Sem conclusão'],
  ['semConclusaoComPendencia', 'Sem conclusão + com pendência'],
  ['semConclusaoSemPendencia', 'Sem conclusão + sem pendência'],
  ['naoIniciaram', 'Não iniciaram']
];

const TECH_TABLE_VIEWS = {
  semConclusao: { title: 'Técnicos sem conclusão', description: 'Concluída = 0, com ou sem pendência.' },
  semConclusaoComPendencia: { title: 'Técnicos sem conclusão + com pendência', description: 'Concluída = 0 e pelo menos uma pendência.' },
  semConclusaoSemPendencia: { title: 'Técnicos sem conclusão + sem pendência', description: 'Caso crítico: concluída = 0 e pendente = 0.' },
  comConclusao: { title: 'Técnicos com conclusão', description: 'Pelo menos uma atividade concluída.' },
  naoIniciaram: { title: 'Técnicos que não iniciaram', description: 'Só atividades não iniciadas: nada concluído, iniciado ou pendente.' },
  todos: { title: 'Todos os técnicos', description: 'Todas as situações.' }
};

const FEEDBACK_STYLES = {
  error: 'border-[color:var(--error-line)] bg-[color:var(--error-bg)] text-[color:var(--error-ink)]',
  warning: 'border-[color:var(--warn-line)] bg-[color:var(--orange-soft)] text-[color:var(--warn-ink)]',
  success: 'border-[color:var(--ok-line)] bg-[color:var(--ok-bg)] text-[color:var(--ok-ink)]'
};

const DEFAULT_FILTERS = { tipo: 'all', gerente: 'all', responsavel: 'all', regiao: 'all', cm: 'all', situacao: 'all', tecnico: '' };
const DEFAULT_VIEW = { techTable: 'semConclusao', techSort: 'situacao', responsibleSort: 'critical', chartSort: 'desc' };

const state = {
  workbook: null,
  fileName: '',
  sheetName: '',
  // allData: todos os técnicos lidos; data: os da visão por tipo de técnico (filters.tipo).
  allData: [],
  data: [],
  appliedTipo: null,
  validation: null,
  regionOrder: [],
  filters: { ...DEFAULT_FILTERS },
  view: { ...DEFAULT_VIEW },
  showDetails: false,
  // Cadastro de técnicos por código: padrão (aberto no login, ver auth.js) ou enviado pela tela.
  cadastro: { byCodigo: new Map(), fileName: '', savedAt: '' }
};

const $ = (id) => document.getElementById(id);

class UserError extends Error {}

// ============================================================
// 2) Normalização
// ============================================================
const NA_TOKENS = new Set(['#N/D', '#N/A', 'N/D', 'N/A']);

function stripAccents(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Cabeçalhos: sem acento, minúsculos, pontuação vira espaço ("CM/Matrícula" → "cm matricula").
function normalizeHeader(value) {
  return stripAccents(value).replace(/[^a-zA-Z0-9]+/g, ' ').trim().toLowerCase();
}

function normalizeName(value) {
  return stripAccents(value).replace(/\s+/g, ' ').trim().toLowerCase();
}

function isMissing(value) {
  if (value === null || value === undefined) return true;
  const text = String(value).trim();
  return !text || NA_TOKENS.has(text.toUpperCase());
}

function toText(value, fallback = '') {
  return isMissing(value) ? fallback : String(value).trim().replace(/\s+/g, ' ');
}

// Aceita números reais e textos como "1.234", "1.234,5", "1234,5" e "1234.5".
function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (isMissing(value)) return 0;
  let text = String(value).replace(/[\s ]/g, '');
  if (text.includes(',')) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) {
    text = text.replace(/\./g, '');
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Horários do Excel chegam como fração do dia quando lidos com raw: true.
function toHorario(value) {
  if (typeof value === 'number' && value >= 0 && value < 1) {
    const minutes = Math.round(value * 1440) % 1440;
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }
  return toText(value, FALLBACK.horario);
}

// "XXX-NNNN-Nome do Técnico" → código "XXX-NNNN" e nome "Nome do Técnico".
function parseTecnico(value) {
  const original = toText(value);
  const parts = original.split('-');
  if (parts.length >= 3) {
    const nome = parts.slice(2).join('-').trim();
    return { original, codigo: `${parts[0].trim()}-${parts[1].trim()}`, nome: nome || original };
  }
  return { original, codigo: FALLBACK.codigo, nome: original };
}

function fmt(value) {
  return Number(value || 0).toLocaleString('pt-BR');
}

function percent(part, total) {
  return total ? Math.round((part / total) * 100) : 0;
}

// Ordenação alfabética que manda os valores "não informado" para o fim.
function compareLabels(a, b) {
  const aFallback = Object.values(FALLBACK).includes(a);
  const bFallback = Object.values(FALLBACK).includes(b);
  if (aFallback !== bFallback) return aFallback ? 1 : -1;
  return a.localeCompare(b, 'pt-BR');
}

// ============================================================
// 3) Leitura e mapeamento das abas
// ============================================================
function sheetRows(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '', blankrows: false });
}

// Igualdade exata após normalização, testando primeiro o alias mais longo.
function matchHeaders(headerRow, aliasMap) {
  const cells = headerRow.map(normalizeHeader);
  const used = new Set();
  const map = {};
  for (const [field, aliases] of Object.entries(aliasMap)) {
    const candidates = aliases.map(normalizeHeader).sort((a, b) => b.length - a.length);
    for (const alias of candidates) {
      const index = cells.findIndex((cell, i) => cell === alias && !used.has(i));
      if (index !== -1) {
        map[field] = index;
        used.add(index);
        break;
      }
    }
  }
  return map;
}

// A linha de cabeçalho é a que mais mapeia campos entre as primeiras linhas.
function locateHeader(rows, aliasMap) {
  let best = null;
  rows.slice(0, HEADER_SCAN_ROWS).forEach((row, index) => {
    const map = matchHeaders(row, aliasMap);
    const count = Object.keys(map).length;
    if (count && (!best || count > best.count)) best = { index, map, count };
  });
  return best;
}

function hasContent(row) {
  return row.some((cell) => !isMissing(cell));
}

function buildRecord(tecnico, info, counts, totalGeral) {
  const record = { ...tecnico, ...info, totalGeral };
  for (const field of NUMERIC_FIELDS) record[field] = toNumber(counts[field]);
  record.atividadeTotal = NUMERIC_FIELDS.reduce((sum, field) => sum + record[field], 0);
  record.inconsistente = record.totalGeral > 0 && Math.abs(record.totalGeral - record.atividadeTotal) > 1e-9;
  record.searchText = normalizeName(`${record.original} ${record.codigo} ${record.nome} ${record.cm}`);
  return record;
}

// Monta a contagem por técnico a partir das atividades do TOA, só com técnicos do
// cadastro (que fornece CM, responsável etc.). As contagens ficam separadas em corretiva
// e preventiva para a visão por tipo de técnico (applyTipoView).
function readToaSheet(rows, header, sheetName) {
  const { map } = header;
  const preventivas = new Set(TOA_PREVENTIVA_TYPES.map(normalizeName));
  const byCodigo = new Map();
  const foraDoCadastro = new Map();
  const estadosDesconhecidos = new Map();
  const atividades = { corretiva: 0, preventiva: 0 };

  for (const row of rows.slice(header.index + 1)) {
    const provedor = toText(row[map.provedor]);
    if (!provedor || !TECNICO_PROVEDOR.test(provedor)) continue;

    const tecnico = parseTecnico(provedor);
    const info = state.cadastro.byCodigo.get(tecnico.codigo.toUpperCase());
    if (!info) {
      foraDoCadastro.set(provedor, (foraDoCadastro.get(provedor) || 0) + 1);
      continue;
    }
    const estado = toText(row[map.estado], '(vazio)');
    const field = TOA_ESTADOS[normalizeHeader(estado)];
    if (!field) {
      estadosDesconhecidos.set(estado, (estadosDesconhecidos.get(estado) || 0) + 1);
      continue;
    }
    const tipo = preventivas.has(normalizeName(row[map.tipo])) ? 'preventiva' : 'corretiva';
    if (!byCodigo.has(tecnico.codigo)) byCodigo.set(tecnico.codigo, { tecnico, info, counts: { corretiva: {}, preventiva: {} } });
    const counts = byCodigo.get(tecnico.codigo).counts[tipo];
    counts[field] = (counts[field] || 0) + 1;
    atividades[tipo] += 1;
  }

  const records = [...byCodigo.values()].map(({ tecnico, info, counts }) => {
    const all = Object.fromEntries(NUMERIC_FIELDS.map((f) => [f, (counts.corretiva[f] || 0) + (counts.preventiva[f] || 0)]));
    const record = buildRecord(tecnico, info, all, 0);
    record.countsByTipo = { all, ...counts };
    record.tipoTecnico = classifyTipoTecnico(counts);
    return record;
  });
  if (!records.length) {
    throw new UserError(`Nenhum técnico do cadastro encontrado na aba "${sheetName}". Confira se a extração do TOA é da região certa ou atualize o cadastro.`);
  }
  return { records, toa: { atividades, foraDoCadastro, estadosDesconhecidos } };
}

// Técnico de corretiva: tem TSK corretiva em fila. De preventiva: só preventiva em fila.
// Sem nada em fila, vale o tipo das atividades do dia (qualquer corretiva → corretiva).
function classifyTipoTecnico(counts) {
  const sum = (c, fields) => fields.reduce((total, f) => total + (c[f] || 0), 0);
  if (sum(counts.corretiva, FILA_FIELDS)) return 'corretiva';
  if (sum(counts.preventiva, FILA_FIELDS)) return 'preventiva';
  return sum(counts.corretiva, NUMERIC_FIELDS) ? 'corretiva' : 'preventiva';
}

// Aplica a visão por tipo de técnico: escolhe os técnicos e troca as contagens de cada um.
// Planilhas já consolidadas (sem countsByTipo) não têm essa separação.
function applyTipoView() {
  const tipo = state.allData.some((r) => r.countsByTipo) ? state.filters.tipo : 'all';
  if (state.appliedTipo === tipo) return;
  state.appliedTipo = tipo;
  const records = state.allData.filter((r) => tipo === 'all' || r.tipoTecnico === tipo);
  for (const record of records) {
    if (record.countsByTipo) {
      for (const field of NUMERIC_FIELDS) {
        const counts = TIPO_ALL_FIELDS.includes(field) ? record.countsByTipo.all : record.countsByTipo[tipo];
        record[field] = counts[field] || 0;
      }
      record.atividadeTotal = NUMERIC_FIELDS.reduce((sum, field) => sum + record[field], 0);
    }
    record.situacao = getSituacao(record);
  }
  state.data = records;
  state.validation = buildValidation(records);
}

function readActivitySheet(workbook, sheetName) {
  const rows = sheetRows(workbook.Sheets[sheetName]);
  if (!rows.some(hasContent)) throw new UserError(`A aba "${sheetName}" não tem dados.`);

  const toaHeader = locateHeader(rows, TOA_HEADER_ALIASES);
  if (toaHeader?.count === Object.keys(TOA_HEADER_ALIASES).length) return readToaSheet(rows, toaHeader, sheetName);

  const header = locateHeader(rows, ACTIVITY_HEADER_ALIASES);
  const missing = ACTIVITY_REQUIRED.filter((field) => header?.map[field] === undefined);
  if (missing.length) {
    const headerRow = header ? rows[header.index] : rows.find(hasContent);
    const found = headerRow.filter((cell) => !isMissing(cell)).map((cell) => String(cell).trim());
    throw new UserError(
      `Colunas obrigatórias não encontradas na aba "${sheetName}": ${missing.map((f) => FIELD_LABELS[f]).join(', ')}. ` +
      `Colunas encontradas: ${found.join(', ') || 'nenhuma'}.`
    );
  }

  const { map } = header;
  const cell = (row, field) => (map[field] === undefined ? '' : row[map[field]]);
  const records = [];

  for (const row of rows.slice(header.index + 1)) {
    const rawTecnico = cell(row, 'tecnicos');
    if (isMissing(rawTecnico) || SUMMARY_ROW_LABELS.has(normalizeName(rawTecnico))) continue;

    const info = {
      horario: toHorario(cell(row, 'horario')),
      regiao: toText(cell(row, 'regiao'), FALLBACK.regiao),
      cm: toText(cell(row, 'cm'), FALLBACK.cm),
      responsavel: toText(cell(row, 'responsavel'), FALLBACK.responsavel),
      gerente: toText(cell(row, 'gerente'), FALLBACK.gerente)
    };
    const counts = Object.fromEntries(NUMERIC_FIELDS.map((field) => [field, cell(row, field)]));
    records.push(buildRecord(parseTecnico(rawTecnico), info, counts, toNumber(cell(row, 'totalGeral'))));
  }

  if (!records.length) throw new UserError(`A aba "${sheetName}" não tem técnicos para analisar.`);
  return { records, toa: null };
}

// ============================================================
// 3b) Cadastro de técnicos
// ============================================================
// Linhas no formato do privado/cadastro.js: [técnico, horário, CM, responsável, região, gerente].
// O cadastro enviado pela tela tem prioridade e o padrão completa quem não estiver nele.
// Código repetido mantém a primeira ocorrência (como um PROCV).
function setCadastro(rows, fileName = '', savedAt = '') {
  const byCodigo = new Map();
  const padrao = typeof CADASTRO_PADRAO === 'undefined' ? [] : CADASTRO_PADRAO;
  for (const [tecnico, horario, cm, responsavel, regiao, gerente] of [...rows, ...padrao]) {
    const { codigo } = parseTecnico(tecnico);
    if (codigo === FALLBACK.codigo || byCodigo.has(codigo.toUpperCase())) continue;
    byCodigo.set(codigo.toUpperCase(), {
      horario: toHorario(horario),
      cm: toText(cm, FALLBACK.cm),
      responsavel: toText(responsavel, FALLBACK.responsavel),
      regiao: toText(regiao, FALLBACK.regiao),
      gerente: toText(gerente, FALLBACK.gerente)
    });
  }
  state.cadastro = { byCodigo, fileName, savedAt };
}

function loadStoredCadastro() {
  try {
    const stored = JSON.parse(localStorage.getItem(CADASTRO_STORAGE_KEY) || 'null');
    if (stored?.rows?.length) {
      setCadastro(stored.rows, stored.fileName, stored.savedAt);
      return;
    }
  } catch {
    // Sem acesso ao armazenamento ou conteúdo inválido: usa o padrão.
  }
  setCadastro([]);
}

// Usa a aba que mais mapeia colunas de cadastro (precisa ter a coluna do técnico).
function readCadastroWorkbook(workbook) {
  let best = null;
  for (const name of workbook.SheetNames) {
    const rows = sheetRows(workbook.Sheets[name]);
    const header = locateHeader(rows, CADASTRO_HEADER_ALIASES);
    if (header?.map.tecnico === undefined || header.count < 2) continue;
    if (!best || header.count > best.header.count) best = { rows, header };
  }
  if (!best) {
    throw new UserError('Nenhuma aba de cadastro encontrada. A planilha precisa da coluna "Nome do recurso" (ou "Técnicos") e de colunas como Unidade organizacional, Coordenador/Responsável, Regional e Gerente.');
  }
  const { map } = best.header;
  const cell = (row, field) => (map[field] === undefined ? '' : row[map[field]]);
  const rows = best.rows.slice(best.header.index + 1)
    .filter((row) => parseTecnico(cell(row, 'tecnico')).codigo !== FALLBACK.codigo)
    .map((row) => ['tecnico', 'horario', 'cm', 'responsavel', 'regiao', 'gerente'].map((field) => {
      const value = cell(row, field);
      return field === 'horario' ? toHorario(value) : toText(value);
    }));
  if (!rows.length) throw new UserError('A aba de cadastro não tem técnicos no formato CÓDIGO-NOME.');
  return rows;
}

function isActivitySheetName(name) {
  return normalizeHeader(name).replace(/\s/g, '') === normalizeHeader(ACTIVITY_SHEET_NAME).replace(/\s/g, '');
}

function defaultSheetName(workbook) {
  return workbook.SheetNames.find(isActivitySheetName) || workbook.SheetNames[0];
}

// ============================================================
// 4) Regiões
// ============================================================
function regionRank(region) {
  if (region === FALLBACK.regiao) return Number.MAX_SAFE_INTEGER;
  const index = state.regionOrder.indexOf(region);
  return index === -1 ? state.regionOrder.length : index;
}

function compareRegions(a, b) {
  return regionRank(a) - regionRank(b) || a.localeCompare(b, 'pt-BR');
}

// ============================================================
// 5) Regras e métricas
// ============================================================
const isComConclusao = (record) => record.concluida > 0;
const isSemConclusao = (record) => !isComConclusao(record);
const isSemConclusaoComPendencia = (record) => isSemConclusao(record) && record.pendente > 0;
const isSemConclusaoSemPendencia = (record) => isSemConclusao(record) && record.pendente <= 0;
// Ainda não mexeu em nada: só tem atividades não iniciadas (canceladas não contam).
// Iniciado e pendente valem de qualquer tipo: quem iniciou uma preventiva (ATSK) e tem
// corretiva não iniciada já começou o dia.
const isNaoIniciou = (record) => {
  const all = record.countsByTipo ? record.countsByTipo.all : record;
  return record.naoIniciado > 0 && record.concluida <= 0 && (all.iniciado || 0) <= 0 && (all.pendente || 0) <= 0;
};

const SITUACAO_PREDICATES = {
  all: () => true,
  todos: () => true,
  comConclusao: isComConclusao,
  semConclusao: isSemConclusao,
  semConclusaoComPendencia: isSemConclusaoComPendencia,
  semConclusaoSemPendencia: isSemConclusaoSemPendencia,
  naoIniciaram: isNaoIniciou
};

function getSituacao(record) {
  if (isComConclusao(record)) return 'comConclusao';
  return isSemConclusaoComPendencia(record) ? 'semConclusaoComPendencia' : 'semConclusaoSemPendencia';
}

function summarize(records) {
  const summary = {
    tecnicos: records.length,
    atividades: 0,
    comConclusao: 0,
    semConclusao: 0,
    semConclusaoComPendencia: 0,
    semConclusaoSemPendencia: 0
  };
  for (const field of NUMERIC_FIELDS) summary[field] = 0;
  for (const record of records) {
    summary.atividades += record.atividadeTotal;
    for (const field of NUMERIC_FIELDS) summary[field] += record[field];
    if (isComConclusao(record)) summary.comConclusao += 1;
    if (isSemConclusao(record)) summary.semConclusao += 1;
    if (isSemConclusaoComPendencia(record)) summary.semConclusaoComPendencia += 1;
    if (isSemConclusaoSemPendencia(record)) summary.semConclusaoSemPendencia += 1;
  }
  return summary;
}

function groupRecords(records, key) {
  const groups = new Map();
  for (const record of records) {
    if (!groups.has(record[key])) groups.set(record[key], []);
    groups.get(record[key]).push(record);
  }
  return groups;
}

function summarizeBy(records, key) {
  return [...groupRecords(records, key)].map(([label, items]) => ({ label, records: items, ...summarize(items) }));
}

function compareTechnicians(a, b) {
  return SITUACAO[a.situacao].order - SITUACAO[b.situacao].order || a.nome.localeCompare(b.nome, 'pt-BR');
}

// Campos conferidos na validação: quem ficou com o valor de FALLBACK está sem o dado.
const VALIDATION_FIELDS = [
  ['regiao', 'região'],
  ['cm', 'CM'],
  ['responsavel', 'responsável'],
  ['gerente', 'gerente']
];

function buildValidation(records) {
  const missing = (field) => records.filter((r) => r[field] === FALLBACK[field]);
  return {
    total: records.length,
    semRegiao: missing('regiao').length,
    semCm: missing('cm').length,
    semResponsavel: missing('responsavel').length,
    semGerente: missing('gerente').length,
    // Técnicos com algum dado faltando e quais são, para mostrar quem corrigir no cadastro.
    incompletos: records
      .map((r) => ({ record: r, faltando: VALIDATION_FIELDS.filter(([field]) => r[field] === FALLBACK[field]).map(([, label]) => label) }))
      .filter(({ faltando }) => faltando.length),
    inconsistentes: records.filter((r) => r.inconsistente)
  };
}

// ============================================================
// 6) Filtros
// ============================================================
function matchesFilters(record, filters) {
  if (filters.gerente !== 'all' && record.gerente !== filters.gerente) return false;
  if (filters.responsavel !== 'all' && record.responsavel !== filters.responsavel) return false;
  if (filters.regiao !== 'all' && record.regiao !== filters.regiao) return false;
  if (filters.cm !== 'all' && record.cm !== filters.cm) return false;
  if (!SITUACAO_PREDICATES[filters.situacao](record)) return false;
  const query = normalizeName(filters.tecnico);
  return !query || record.searchText.includes(query);
}

function applyFilters(data) {
  return data.filter((record) => matchesFilters(record, state.filters));
}

// Filtros dependentes: Gerente restringe Responsável; Gerente + Responsável restringem Região;
// os três restringem CM.
function syncFilterOptions() {
  const { filters } = state;
  const gerentes = unique(state.data.map((r) => r.gerente)).sort(compareLabels);
  if (!gerentes.includes(filters.gerente)) filters.gerente = 'all';

  const byGerente = state.data.filter((r) => filters.gerente === 'all' || r.gerente === filters.gerente);
  const responsaveis = unique(byGerente.map((r) => r.responsavel)).sort(compareLabels);
  if (!responsaveis.includes(filters.responsavel)) filters.responsavel = 'all';

  const byResponsavel = byGerente.filter((r) => filters.responsavel === 'all' || r.responsavel === filters.responsavel);
  const regioes = unique(byResponsavel.map((r) => r.regiao)).sort(compareRegions);
  if (!regioes.includes(filters.regiao)) filters.regiao = 'all';

  const byRegiao = byResponsavel.filter((r) => filters.regiao === 'all' || r.regiao === filters.regiao);
  const cms = unique(byRegiao.map((r) => r.cm)).sort(compareLabels);
  if (!cms.includes(filters.cm)) filters.cm = 'all';

  fillSelect($('filter-gerente'), [['all', 'Todos'], ...gerentes.map((v) => [v, v])], filters.gerente);
  fillSelect($('filter-responsavel'), [['all', 'Todos'], ...responsaveis.map((v) => [v, v])], filters.responsavel);
  fillSelect($('filter-regiao'), [['all', 'Todas'], ...regioes.map((v) => [v, v])], filters.regiao);
  fillSelect($('filter-cm'), [['all', 'Todos'], ...cms.map((v) => [v, v])], filters.cm);
  fillSelect($('filter-situacao'), SITUACAO_FILTER_OPTIONS, filters.situacao);
  const temTipo = state.allData.some((r) => r.countsByTipo);
  const contagem = (tipo) => state.allData.filter((r) => tipo === 'all' || r.tipoTecnico === tipo).length;
  fillSelect($('filter-tipo'), TIPO_TECNICO_OPTIONS.map(([value, label]) => [value, temTipo ? `${label} (${fmt(contagem(value))})` : label]), temTipo ? filters.tipo : 'all');
  $('filter-tipo').disabled = !temTipo;
  $('filter-tipo').title = temTipo ? 'Classificação pelas TSKs em fila' : 'Disponível ao importar a extração do TOA';
  if ($('filter-tecnico').value !== filters.tecnico) $('filter-tecnico').value = filters.tecnico;
}

function unique(values) {
  return [...new Set(values)];
}

// ============================================================
// 7) Renderização
// ============================================================
function el(tag, className = '', text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function fillSelect(select, options, value) {
  select.replaceChildren(...options.map(([optionValue, label]) => {
    const option = el('option', '', label);
    option.value = optionValue;
    return option;
  }));
  select.value = value;
}

function emptyMessage(text) {
  return el('p', 'py-3 text-sm text-[color:var(--muted)]', text);
}

function emptyTableRow(colSpan, text) {
  const row = el('tr');
  const cell = el('td', 'px-5 py-6 text-center text-sm text-[color:var(--muted)]', text);
  cell.colSpan = colSpan;
  row.append(cell);
  return row;
}

// "classes" inclui o padding da célula; o padrão serve à tabela de técnicos.
function numberCell(value, classes = 'px-3 py-3') {
  return el('td', `tabular text-right ${classes}`, fmt(value));
}

function badge(situacao) {
  return el('span', `inline-flex whitespace-nowrap rounded-sm px-2 py-1 text-xs font-semibold ${SITUACAO[situacao].badge}`, SITUACAO[situacao].label);
}

function compactRow({ label, sub, value, valueClass = 'text-[color:var(--ink)]' }) {
  const row = el('div', 'flex items-center justify-between gap-4 py-3 text-sm');
  const left = el('div', 'min-w-0');
  const title = el('p', 'truncate text-[color:var(--ink-4)]', label);
  title.title = label;
  left.append(title);
  if (sub) left.append(el('p', 'mt-0.5 text-xs text-[color:var(--faint)]', sub));
  row.append(left, el('span', `tabular shrink-0 font-semibold ${valueClass}`, fmt(value)));
  return row;
}

function render() {
  const hasData = state.allData.length > 0;
  for (const id of ['validation-section', 'filters-section', 'results']) $(id).classList.toggle('hidden', !hasData);
  $('clear-button').classList.toggle('hidden', !state.fileName);
  $('clear-button').classList.toggle('inline-flex', Boolean(state.fileName));
  if (!hasData) return;

  applyTipoView();
  syncFilterOptions();
  const filtered = applyFilters(state.data);
  const summary = summarize(filtered);

  renderValidation();
  $('filters-status').textContent = `${fmt(filtered.length)} de ${fmt(state.data.length)} técnicos exibidos.`;
  $('analyzed-sheet').textContent = `Aba: ${state.sheetName}`;
  // Base do % de "não iniciaram": todos os técnicos dos demais filtros, sem o de situação.
  const base = state.data.filter((record) => matchesFilters(record, { ...state.filters, situacao: 'all' }));
  renderCards(summary, base);
  renderTechTable(filtered);
  renderDonut(base);
  renderRegionSummary(filtered);
  renderManagerSummary(filtered);
  renderResponsibleTable(filtered);
  renderResponsibleChart(filtered);
}

function chip(label, value, tone) {
  const tones = {
    neutral: 'border-[color:var(--line)] bg-[color:var(--surface)] text-[color:var(--ink-3)]',
    ok: 'border-[color:var(--green-line)] bg-[color:var(--green-soft)] text-[color:var(--green)]',
    warn: 'border-[color:var(--warn-line)] bg-[color:var(--orange-soft)] text-[color:var(--warn-ink)]'
  };
  const node = el('span', `inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-xs font-medium ${tones[tone]}`);
  node.append(el('span', 'tabular font-semibold', fmt(value)), el('span', '', label));
  return node;
}

function renderValidation() {
  const v = state.validation;
  const warnIf = (count) => (count > 0 ? 'warn' : 'ok');
  $('validation-chips').replaceChildren(
    chip('técnicos lidos', v.total, 'neutral'),
    chip('sem região', v.semRegiao, warnIf(v.semRegiao)),
    chip('sem CM', v.semCm, warnIf(v.semCm)),
    chip('sem responsável', v.semResponsavel, warnIf(v.semResponsavel)),
    chip('sem gerente', v.semGerente, warnIf(v.semGerente)),
    chip('inconsistências de Total Geral', v.inconsistentes.length, warnIf(v.inconsistentes.length))
  );

  const alerts = [];
  if (v.incompletos.length) {
    const nomes = v.incompletos.map(({ record, faltando }) => `${record.original} (sem ${faltando.join(', ')})`);
    const visiveis = nomes.slice(0, 5).join('; ');
    const resto = nomes.length > 5 ? `; e mais ${fmt(nomes.length - 5)} em "Ver detalhes"` : '';
    alerts.push(el('p', 'rounded-sm border-l-4 border-l-[color:var(--orange)] bg-[color:var(--orange-soft)] px-3 py-2 text-xs text-[color:var(--warn-ink)]',
      `${fmt(v.incompletos.length)} ${v.incompletos.length === 1 ? 'técnico com dados faltando' : 'técnicos com dados faltando'} no cadastro: ${visiveis}${resto}.`));
  }
  if (v.inconsistentes.length) {
    alerts.push(el('p', 'rounded-sm border-l-4 border-l-[color:var(--orange)] bg-[color:var(--orange-soft)] px-3 py-2 text-xs text-[color:var(--warn-ink)]',
      `${fmt(v.inconsistentes.length)} técnicos têm Total Geral diferente da soma das atividades.`));
  }
  $('validation-alerts').replaceChildren(...alerts);

  const hasDetails = v.incompletos.length > 0 || v.inconsistentes.length > 0;
  const toggle = $('toggle-details-button');
  toggle.classList.toggle('hidden', !hasDetails);
  toggle.setAttribute('aria-expanded', String(state.showDetails));
  toggle.textContent = state.showDetails ? 'Ocultar lista' : 'Ver detalhes';

  const panel = $('details-panel');
  panel.classList.toggle('hidden', !(hasDetails && state.showDetails));
  if (!state.showDetails) return;
  const lists = [
    ['Dados faltando', v.incompletos.map(({ record, faltando }) => `${record.original} · sem ${faltando.join(', ')}`)],
    ['Total Geral inconsistente', v.inconsistentes.map((r) => `${r.original} · Total Geral ${fmt(r.totalGeral)}, soma ${fmt(r.atividadeTotal)}`)]
  ].filter(([, items]) => items.length);
  panel.replaceChildren(...lists.map(([title, items]) => {
    const block = el('div', 'mb-4 last:mb-0');
    block.append(el('h3', 'mb-2 text-sm font-semibold', `${title} (${fmt(items.length)})`));
    const list = el('ul', 'max-h-56 overflow-y-auto rounded-sm border border-[color:var(--line-soft)] text-xs text-[color:var(--ink-3)] divide-y divide-[color:var(--line-soft)]');
    list.append(...items.map((text) => el('li', 'break-words px-3 py-2', text)));
    block.append(list);
    return block;
  }));
}

// Base dos percentuais de situação dos cards: técnicos de corretiva da
// base. Na visão Preventivas, ou em planilha sem tipo de técnico, todos da base.
function percentBase(base) {
  const porCorretiva = base.some((r) => r.tipoTecnico) && state.appliedTipo !== 'preventiva';
  return { porCorretiva, ref: porCorretiva ? base.filter((r) => r.tipoTecnico === 'corretiva') : base };
}

function renderCards(summary, base) {
  $('count-tecnicos').textContent = fmt(summary.tecnicos);
  const naoIniciaram = base.filter(isNaoIniciou).length;
  $('count-nao-iniciaram').textContent = fmt(naoIniciaram);
  $('caption-nao-iniciaram').textContent = `${percent(naoIniciaram, base.length)}% de ${fmt(base.length)} técnicos`;
  $('count-com-conclusao').textContent = fmt(summary.comConclusao);
  $('count-sem-conclusao').textContent = fmt(summary.semConclusao);
  $('count-critico').textContent = fmt(summary.semConclusaoSemPendencia);
  $('count-com-pendencia').textContent = fmt(summary.semConclusaoComPendencia);
  // Percentuais sobre os técnicos de corretiva, sem o filtro de
  // situação; as quantidades continuam contando todos os técnicos filtrados.
  const { ref, porCorretiva } = percentBase(base);
  const pct = (predicate) => `${percent(ref.filter(predicate).length, ref.length)}%`;
  const dos = porCorretiva ? 'da corretiva' : 'dos técnicos';
  $('caption-com-conclusao').textContent = `${pct(isComConclusao)} ${dos}`;
  $('caption-sem-conclusao').textContent = `${pct(isSemConclusao)} ${dos} · com e sem pendência`;
  $('caption-critico').textContent = `${pct(isSemConclusaoSemPendencia)} ${dos} · caso crítico`;
  $('caption-com-pendencia').textContent = `${pct(isSemConclusaoComPendencia)} ${dos}`;
  document.querySelectorAll('.situation-card').forEach((card) => {
    card.setAttribute('aria-pressed', String(card.dataset.situacao === state.filters.situacao));
  });
}

function techTableRows(filtered) {
  const sorter = state.view.techSort === 'responsavel'
    ? (a, b) => compareLabels(a.responsavel, b.responsavel) || compareTechnicians(a, b)
    : compareTechnicians;
  return filtered.filter(SITUACAO_PREDICATES[state.view.techTable]).sort(sorter);
}

function renderTechTable(filtered) {
  const view = TECH_TABLE_VIEWS[state.view.techTable];
  $('tech-table-filter').value = state.view.techTable;
  $('tech-table-sort').value = state.view.techSort;
  const rows = techTableRows(filtered);
  $('tech-table-title').textContent = view.title;
  $('tech-table-description').textContent = `${view.description} ${fmt(rows.length)} técnicos.`;

  const body = $('tech-rows');
  const foot = $('tech-foot');
  if (!rows.length) {
    body.replaceChildren(emptyTableRow(11, 'Nenhum técnico nesta situação com os filtros atuais.'));
    foot.replaceChildren();
    return;
  }

  body.replaceChildren(...rows.map((record) => {
    const row = el('tr', 'align-top hover:bg-[color:var(--hover)]');
    const name = el('td', 'px-3 py-3');
    name.append(el('span', 'block font-medium text-[color:var(--ink)]', record.nome), el('span', 'block text-xs text-[color:var(--muted)]', record.codigo));
    const total = numberCell(record.atividadeTotal, 'px-2 py-3 font-semibold');
    if (record.inconsistente) {
      total.classList.add('text-[color:var(--orange)]');
      total.title = `Total Geral da planilha: ${fmt(record.totalGeral)}`;
    }
    const situacao = el('td', 'px-3 py-3');
    situacao.append(badge(record.situacao));
    row.append(
      name,
      el('td', 'px-3 py-3 text-[color:var(--ink-4)]', record.regiao),
      el('td', 'whitespace-nowrap px-3 py-3 text-[color:var(--ink-4)]', record.cm),
      el('td', 'px-3 py-3 text-[color:var(--ink-4)]', record.responsavel),
      ...NUMERIC_FIELDS.map((field) => numberCell(record[field], 'px-2 py-3')),
      total,
      situacao
    );
    return row;
  }));

  const totals = summarize(rows);
  const footRow = el('tr');
  const label = el('td', 'px-3 py-3', `Total · ${fmt(rows.length)} técnicos`);
  label.colSpan = 4;
  footRow.append(label, ...NUMERIC_FIELDS.map((field) => numberCell(totals[field], 'px-2 py-3')), numberCell(totals.atividades, 'px-2 py-3'), el('td'));
  foot.replaceChildren(footRow);
}

// Com "Não iniciaram" selecionado, o gráfico compara quem não iniciou com todos os
// técnicos dos demais filtros (mesma base do card).
function donutView(base) {
  const { situacao } = state.filters;
  if (situacao === 'naoIniciaram') {
    const naoIniciaram = base.filter(isNaoIniciou).length;
    const segments = [
      { label: 'Não iniciaram', color: NAO_INICIARAM_COLOR, count: naoIniciaram },
      { label: 'Iniciaram alguma atividade', color: 'var(--track-strong)', count: base.length - naoIniciaram }
    ];
    return { segments, total: base.length, center: segments[0], caption: ['Não iniciaram'], subtitle: 'Percentual sobre todos os técnicos, sem o filtro de situação.' };
  }

  // Fatias, legenda e centro usam a mesma base: os técnicos dos filtros atuais, sem o de
  // situação (sem filtro de situação, é exatamente a lista exibida). O centro destaca a
  // situação escolhida (padrão: taxa de conclusão) e bate com a legenda.
  const totals = summarize(base);
  const keys = ['comConclusao', 'semConclusaoComPendencia', 'semConclusaoSemPendencia'];
  const segments = keys.map((key) => ({ key, label: SITUACAO[key].label, color: SITUACAO[key].color, count: totals[key] }));
  const centro = DONUT_CENTERS[situacao] || DONUT_CENTERS.comConclusao;
  return {
    segments,
    total: base.length,
    center: { color: centro.color, count: base.filter(centro.predicate).length, total: base.length },
    caption: centro.caption,
    subtitle: situacao === 'all'
      ? 'Percentual sobre os técnicos filtrados.'
      : `Percentual sobre os técnicos filtrados, sem o filtro de situação; centro: ${centro.descricao}.`
  };
}

function renderDonut(base) {
  const { segments, total, center, caption, subtitle } = donutView(base);
  const donut = $('situation-donut');
  let start = 0;
  const stops = segments.map(({ color, count }) => {
    const end = start + (total ? (count / total) * 100 : 0);
    const stop = `${color} ${start}% ${end}%`;
    start = end;
    return stop;
  });
  donut.style.background = total ? `conic-gradient(${stops.join(', ')})` : 'var(--track)';
  donut.setAttribute('aria-label', `Situação dos técnicos: ${segments.map((s) => `${s.label} ${percent(s.count, total)}% (${s.count})`).join(', ')}`);
  $('donut-subtitle').textContent = subtitle;
  $('donut-percent').textContent = `${percent(center.count, center.total ?? total)}%`;
  $('donut-percent').style.color = center.color;
  $('donut-caption').replaceChildren(...caption.flatMap((line, i) => (i ? [el('br'), line] : [line])));

  $('donut-legend').replaceChildren(...segments.map(({ label, color, count }) => {
    const row = el('div', 'flex items-center justify-between gap-3 text-xs');
    const labelWrap = el('span', 'flex min-w-0 items-center gap-2 text-[color:var(--ink-4)]');
    const swatch = el('span', 'h-2.5 w-2.5 shrink-0 rounded-full');
    swatch.style.backgroundColor = color;
    labelWrap.append(swatch, el('span', '', label));
    row.append(labelWrap, el('span', 'tabular shrink-0 font-semibold text-[color:var(--ink-3)]', `${percent(count, total)}% · ${fmt(count)}`));
    return row;
  }));
}

function renderRegionSummary(filtered) {
  const groups = summarizeBy(filtered, 'regiao').sort((a, b) => compareRegions(a.label, b.label));
  const container = $('region-summary');
  if (!groups.length) {
    container.replaceChildren(emptyMessage('Nenhum técnico com os filtros atuais.'));
    return;
  }
  container.replaceChildren(...groups.map((g) => compactRow({
    label: g.label,
    sub: `${fmt(g.comConclusao)} com conclusão · ${fmt(g.semConclusao)} sem conclusão`,
    value: g.tecnicos
  })));
}

function renderManagerSummary(filtered) {
  const groups = summarizeBy(filtered, 'gerente')
    .sort((a, b) => b.semConclusaoSemPendencia - a.semConclusaoSemPendencia || compareLabels(a.label, b.label));
  const container = $('manager-summary');
  if (!groups.length) {
    container.replaceChildren(emptyMessage('Nenhum técnico com os filtros atuais.'));
    return;
  }
  container.replaceChildren(...groups.map((g) => compactRow({
    label: g.label,
    sub: `de ${fmt(g.tecnicos)} técnicos · ${fmt(g.semConclusao)} sem conclusão`,
    value: g.semConclusaoSemPendencia,
    valueClass: g.semConclusaoSemPendencia ? 'text-[color:var(--red)]' : 'text-[color:var(--ink)]'
  })));
}

function renderResponsibleTable(filtered) {
  const sorters = {
    critical: (a, b) => b.semConclusaoSemPendencia - a.semConclusaoSemPendencia || b.semConclusao - a.semConclusao || compareLabels(a.label, b.label),
    volume: (a, b) => b.tecnicos - a.tecnicos || compareLabels(a.label, b.label),
    az: (a, b) => compareLabels(a.label, b.label)
  };
  $('responsible-sort').value = state.view.responsibleSort;
  const groups = summarizeBy(filtered, 'responsavel').sort(sorters[state.view.responsibleSort]);
  const body = $('responsible-rows');
  if (!groups.length) {
    body.replaceChildren(emptyTableRow(5, 'Nenhum responsável com os filtros atuais.'));
    return;
  }
  body.replaceChildren(...groups.map((g) => {
    const row = el('tr', 'hover:bg-[color:var(--hover)]');
    row.append(
      el('td', 'px-5 py-3 font-medium text-[color:var(--ink)]', g.label),
      numberCell(g.tecnicos, 'px-4 py-3 font-semibold'),
      numberCell(g.comConclusao, 'px-4 py-3 text-[color:var(--green)]'),
      numberCell(g.semConclusaoComPendencia, 'px-4 py-3 text-[color:var(--orange)]'),
      numberCell(g.semConclusaoSemPendencia, `px-5 py-3 ${g.semConclusaoSemPendencia ? 'font-semibold text-[color:var(--red)]' : ''}`)
    );
    return row;
  }));
}

function renderResponsibleChart(filtered) {
  $('chart-sort').value = state.view.chartSort;
  const groups = summarizeBy(filtered, 'responsavel')
    .filter((g) => g.semConclusao > 0)
    .sort((a, b) => (state.view.chartSort === 'desc' ? b.semConclusao - a.semConclusao : 0) || compareLabels(a.label, b.label));
  const chart = $('responsible-chart');
  const totalSemConclusao = groups.reduce((sum, g) => sum + g.semConclusao, 0);
  $('chart-total').textContent = `${fmt(totalSemConclusao)} sem conclusão`;
  if (!groups.length) {
    chart.replaceChildren(emptyMessage('Nenhum técnico sem conclusão com os filtros atuais.'));
    return;
  }

  const max = Math.max(...groups.map((g) => g.semConclusao));
  chart.replaceChildren(...groups.map((g) => {
    const row = el('div', 'grid grid-cols-[minmax(92px,1.1fr)_minmax(100px,3fr)_36px] items-center gap-3 text-xs sm:grid-cols-[minmax(150px,1.2fr)_minmax(120px,4fr)_42px]');
    row.title = `${g.label}: ${g.semConclusaoComPendencia} com pendência, ${g.semConclusaoSemPendencia} sem pendência`;
    const label = el('span', 'truncate font-medium text-[color:var(--ink-3)]', g.label);
    const track = el('div', 'bar-track h-2.5 overflow-hidden rounded-full');
    const bar = el('div', 'flex h-full overflow-hidden rounded-full');
    bar.style.width = `${Math.max((g.semConclusao / max) * 100, 2)}%`;
    for (const key of ['semConclusaoComPendencia', 'semConclusaoSemPendencia']) {
      if (!g[key]) continue;
      const segment = el('div', 'h-full');
      segment.style.width = `${(g[key] / g.semConclusao) * 100}%`;
      segment.style.backgroundColor = SITUACAO[key].color;
      bar.append(segment);
    }
    track.append(bar);
    row.append(label, track, el('span', 'tabular text-right font-semibold text-[color:var(--ink-3)]', fmt(g.semConclusao)));
    return row;
  }));
}

// ============================================================
// 8) Exportação
// ============================================================
function todayStamp() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function safeSheetName(name, used) {
  const base = (String(name).replace(/[\[\]:*?\/\\]/g, ' ').trim() || 'Aba').slice(0, 31);
  let candidate = base;
  for (let i = 2; used.has(candidate.toLowerCase()); i += 1) {
    const suffix = ` (${i})`;
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function buildSheet(rows, headers) {
  const sheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  sheet['!cols'] = headers.map((header) => ({
    wch: Math.min(Math.max(header.length, ...rows.map((row) => String(row[header] ?? '').length)) + 2, 50)
  }));
  return sheet;
}

// sheets: [{ name, rows, headers }]
function writeWorkbook(baseName, sheets) {
  if (!sheets.some((s) => s.rows.length)) {
    showFeedback('Não há técnicos para exportar com os filtros atuais.', 'warning');
    return;
  }
  const workbook = XLSX.utils.book_new();
  const used = new Set();
  for (const { name, rows, headers } of sheets) {
    XLSX.utils.book_append_sheet(workbook, buildSheet(rows, headers), safeSheetName(name, used));
  }
  const fileName = `${baseName}-${todayStamp()}.xlsx`;
  XLSX.writeFile(workbook, fileName);
  showFeedback(`Arquivo ${fileName} gerado.`, 'success');
}

const situacaoLabel = (record) => SITUACAO[record.situacao].label;

function exportTechList() {
  const headers = ['Técnico', 'Código', 'Região', 'CM', 'Responsável', 'Gerente', 'Horário', 'Cancelada', 'Concluída', 'Iniciado', 'Não iniciado', 'Pendente', 'Total', 'Situação'];
  const rows = techTableRows(applyFilters(state.data)).map((r) => ({
    'Técnico': r.nome, 'Código': r.codigo, 'Região': r.regiao, 'CM': r.cm, 'Responsável': r.responsavel, 'Gerente': r.gerente,
    'Horário': r.horario, 'Cancelada': r.cancelada, 'Concluída': r.concluida, 'Iniciado': r.iniciado,
    'Não iniciado': r.naoIniciado, 'Pendente': r.pendente, 'Total': r.atividadeTotal, 'Situação': situacaoLabel(r)
  }));
  writeWorkbook('tecnicos', [{ name: 'Técnicos', rows, headers }]);
}

// Relatório do gerente separado por estado do CM, como o "Tec por região": uma aba geral
// e uma aba por estado com os técnicos sem conclusão + sem pendência.
function exportManagerReport() {
  const headers = ['Gerente', 'Técnico', 'Matrícula', 'Coordenador', 'Região', 'CM', 'Pendência', 'Situação'];
  const toRow = (r) => ({
    'Gerente': r.gerente, 'Técnico': r.nome, 'Matrícula': r.codigo, 'Coordenador': r.responsavel,
    'Região': r.regiao, 'CM': r.cm, 'Pendência': r.pendente, 'Situação': situacaoLabel(r)
  });
  const sortTechs = (records) => [...records]
    .sort((a, b) => compareLabels(a.gerente, b.gerente) || compareLabels(a.responsavel, b.responsavel) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const groups = groupByCmState(applyFilters(state.data).filter(isSemConclusaoSemPendencia));
  const general = groups.flatMap(([estado, records]) => sortTechs(records).map((r) => ({ 'Estado': estado, ...toRow(r) })));
  writeWorkbook('relatorio-gerente-TNE', [
    { name: 'Sem conclusão sem pendência', rows: general, headers: ['Estado', ...headers] },
    ...groups.map(([estado, records]) => ({ name: estado, rows: sortTechs(records).map(toRow), headers }))
  ]);
}

// Técnicos por responsável separados por estado do CM: uma aba geral e uma aba por estado.
function exportResponsible() {
  const headers = ['Responsável', 'Técnico', 'Código', 'Região', 'CM', 'Situação'];
  const toRow = (r) => ({ 'Responsável': r.responsavel, 'Técnico': r.nome, 'Código': r.codigo, 'Região': r.regiao, 'CM': r.cm, 'Situação': situacaoLabel(r) });
  const sortTechs = (records) => [...records].sort((a, b) => compareLabels(a.responsavel, b.responsavel) || compareTechnicians(a, b));
  const groups = groupByCmState(applyFilters(state.data));
  const general = groups.flatMap(([estado, records]) => sortTechs(records).map((r) => ({ 'Estado': estado, ...toRow(r) })));
  writeWorkbook('tecnicos-por-responsavel-TNE', [
    { name: 'Por responsável', rows: general, headers: ['Estado', ...headers] },
    ...groups.map(([estado, records]) => ({ name: estado, rows: sortTechs(records).map(toRow), headers }))
  ]);
}

// Estado do técnico pela sigla do CM ("TNE-BA-ANF75-PREV" → BAHIA), na ordem do Report Backlog.
const CM_STATES = [
  ['AL', 'ALAGOAS'], ['BA', 'BAHIA'], ['PI', 'PIAUÍ'], ['SE', 'SERGIPE'],
  ['CE', 'CEARÁ'], ['PB', 'PARAÍBA'], ['PE', 'PERNAMBUCO'], ['RN', 'RIO GRANDE DO NORTE']
];
const OUTROS_ESTADOS = 'Outros';

function cmState(cm) {
  const sigla = String(cm).toUpperCase().split('-')[1]?.trim();
  return CM_STATES.find(([uf]) => uf === sigla)?.[1] || OUTROS_ESTADOS;
}

// [[estado, técnicos]] na ordem dos estados, só com os estados que têm técnicos.
function groupByCmState(records) {
  const order = [...CM_STATES.map(([, nome]) => nome), OUTROS_ESTADOS];
  return [...groupRecords(records.map((r) => ({ ...r, estado: cmState(r.cm) })), 'estado')]
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b));
}

// Mesmo formato do "Exportar técnicos por região" do Report Backlog: uma aba geral
// ("Tec por região") e uma aba por estado do CM, com CM, técnico e TSKs encerradas.
function exportRegionSummary() {
  const headers = ['CM', 'Nome do técnico', 'TSKs encerradas'];
  const byName = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
  const toRow = (r) => ({ 'CM': r.cm, 'Nome do técnico': r.nome, 'TSKs encerradas': r.concluida });
  const groups = groupByCmState(applyFilters(state.data));
  const general = groups.flatMap(([, records]) => [...records].sort(byName).map(toRow));
  writeWorkbook('tecnicos-por-regiao-TNE', [
    { name: 'Tec por região', rows: general, headers },
    ...groups.map(([estado, records]) => ({ name: estado, rows: [...records].sort(byName).map(toRow), headers }))
  ]);
}

const TECH_EXPORT_HEADERS = ['Código', 'Técnico', 'CM', 'Responsável', 'Concluídas', 'Pendentes', 'Situação'];

function techExportRow(r) {
  return {
    'Código': r.codigo, 'Técnico': r.nome, 'CM': r.cm, 'Responsável': r.responsavel,
    'Concluídas': r.concluida, 'Pendentes': r.pendente, 'Situação': situacaoLabel(r)
  };
}

// Aba geral com região e estado, uma aba por região (TNE1/TNE2) e uma aba por estado do CM.
function exportByRegion() {
  const filtered = applyFilters(state.data);
  const sortTechs = (records) => [...records].sort((a, b) => compareLabels(a.responsavel, b.responsavel) || compareTechnicians(a, b));
  const regions = [...groupRecords(filtered, 'regiao')].sort(([a], [b]) => compareRegions(a, b));
  const states = groupByCmState(filtered);
  const general = regions.flatMap(([regiao, records]) => groupByCmState(records)
    .flatMap(([estado, items]) => sortTechs(items).map((r) => ({ 'Região': regiao, 'Estado': estado, ...techExportRow(r) }))));
  const tab = ([name, records]) => ({ name, rows: sortTechs(records).map(techExportRow), headers: TECH_EXPORT_HEADERS });
  writeWorkbook('tecnicos-por-regiao', [
    { name: 'Tec por região', rows: general, headers: ['Região', 'Estado', ...TECH_EXPORT_HEADERS] },
    ...regions.map(tab),
    ...states.map(tab)
  ]);
}

// Gera imagens da tabela de técnicos (todas as linhas, sem o corte da rolagem). Até
// REPORT_ROWS_PER_IMAGE técnicos vira uma imagem copiada direto para a área de
// transferência; acima disso, a tabela é dividida em partes listadas numa janela, cada
// uma com seu botão de copiar (o clipboard guarda uma imagem por vez).
function renderTechTableImage({ start = 0, end = Infinity, part = 1, parts = 1 } = {}) {
  const table = $('tech-rows').closest('table');
  const wrapper = el('div', 'bg-[color:var(--surface)]');
  // A imagem sai sempre no tema claro, independente do tema da tela.
  wrapper.dataset.theme = 'light';
  Object.assign(wrapper.style, { position: 'fixed', left: '-10000px', top: '0', width: `${table.scrollWidth}px` });
  const clone = table.cloneNode(true);
  clone.querySelector('thead').classList.remove('sticky');
  [...clone.tBodies[0].rows].forEach((row, index) => {
    if (index < start || index >= end) row.remove();
  });
  if (part < parts) clone.querySelector('tfoot')?.remove();
  if (parts > 1) {
    wrapper.append(el('div', 'px-3 py-2 text-sm font-semibold text-[color:var(--ink)]',
      `${$('tech-table-title').textContent} · Parte ${part} de ${parts}`));
  }
  wrapper.append(clone);
  document.body.append(wrapper);
  return html2canvas(wrapper, { backgroundColor: '#ffffff', scale: Math.max(2, window.devicePixelRatio || 1), logging: false })
    .then((canvas) => new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Falha ao gerar imagem'))), 'image/png')))
    .finally(() => wrapper.remove());
}

function downloadBlob(blob, fileName) {
  const link = el('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function copyImage(blobOrPromise) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Clipboard indisponível');
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobOrPromise })]);
}

function flashButton(button, text, label = button.textContent) {
  button.textContent = text;
  setTimeout(() => { button.textContent = label; }, 2000);
}

function techRowCount() {
  return techTableRows(applyFilters(state.data)).length;
}

async function exportTechImage() {
  const button = $('export-tech-image-button');
  const label = button.textContent;
  const total = techRowCount();
  const parts = Math.max(1, Math.ceil(total / REPORT_ROWS_PER_IMAGE));
  button.disabled = true;
  button.textContent = 'Gerando...';
  try {
    if (parts === 1) {
      // O ClipboardItem recebe a Promise na hora do clique (exigência do Safari).
      const blobPromise = renderTechTableImage();
      try {
        await copyImage(blobPromise);
        flashButton(button, 'Copiado!', label);
      } catch {
        downloadBlob(await blobPromise, 'report-tecnicos.png');
        flashButton(button, 'PNG baixado', label);
      }
      return;
    }
    const images = [];
    for (let part = 1; part <= parts; part += 1) {
      const start = (part - 1) * REPORT_ROWS_PER_IMAGE;
      const end = Math.min(start + REPORT_ROWS_PER_IMAGE, total);
      images.push({ part, start, end, blob: await renderTechTableImage({ start, end, part, parts }) });
    }
    button.textContent = label;
    openReportDialog(images, total);
  } catch {
    flashButton(button, 'Erro ao gerar', label);
  } finally {
    button.disabled = false;
  }
}

function openReportDialog(images, total) {
  const dialog = $('report-dialog');
  const urls = [];
  $('report-dialog-desc').textContent =
    `${fmt(total)} técnicos divididos em ${images.length} imagens de até ${REPORT_ROWS_PER_IMAGE}. Copie e cole uma de cada vez.`;
  $('report-parts').replaceChildren(...images.map(({ part, start, end, blob }) => {
    const url = URL.createObjectURL(blob);
    urls.push(url);
    const row = el('div', 'flex flex-wrap items-center gap-3 rounded-sm border border-[color:var(--line-2)] p-3');
    const thumb = el('img', 'h-16 w-28 shrink-0 rounded-sm border border-[color:var(--line-2)] object-cover object-top');
    thumb.src = url;
    thumb.alt = `Prévia da parte ${part}`;
    const info = el('div', 'min-w-0 flex-1');
    info.append(
      el('p', 'text-sm font-semibold text-[color:var(--ink)]', `Parte ${part} de ${images.length}`),
      el('p', 'text-xs text-[color:var(--muted)]', `Técnicos ${fmt(start + 1)} a ${fmt(end)}`)
    );
    const actions = el('div', 'flex gap-2');
    const copy = el('button', 'rounded-sm bg-[color:var(--green-solid)] px-3 py-2 text-xs font-semibold text-white hover:bg-[color:var(--green-solid-hover)] focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-[color:var(--green)]', 'Copiar');
    copy.type = 'button';
    copy.addEventListener('click', async () => {
      try {
        await copyImage(blob);
        flashButton(copy, 'Copiado!', 'Copiar');
      } catch {
        downloadBlob(blob, `report-tecnicos-parte-${part}.png`);
        flashButton(copy, 'PNG baixado', 'Copiar');
      }
    });
    const download = el('button', 'rounded-sm border border-[color:var(--green)] px-3 py-2 text-xs font-semibold text-[color:var(--green)] hover:bg-[color:var(--green-soft)] focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-[color:var(--green)]', 'Baixar');
    download.type = 'button';
    download.addEventListener('click', () => downloadBlob(blob, `report-tecnicos-parte-${part}.png`));
    actions.append(copy, download);
    row.append(thumb, info, actions);
    return row;
  }));
  $('report-download-all').onclick = () => {
    images.forEach(({ part, blob }, i) => setTimeout(() => downloadBlob(blob, `report-tecnicos-parte-${part}.png`), i * 300));
  };
  dialog.addEventListener('close', () => urls.forEach((url) => URL.revokeObjectURL(url)), { once: true });
  dialog.showModal();
}

// ============================================================
// 9) Eventos e inicialização
// ============================================================
function showFeedback(message, kind = 'error') {
  const feedback = $('feedback');
  feedback.className = `mt-4 whitespace-pre-line rounded-sm border px-4 py-3 text-sm ${FEEDBACK_STYLES[kind]}`;
  feedback.textContent = message;
}

function hideFeedback() {
  const feedback = $('feedback');
  feedback.textContent = '';
  feedback.className = 'mt-4 hidden rounded-sm border px-4 py-3 text-sm';
}

function resetState() {
  Object.assign(state, {
    workbook: null, fileName: '', sheetName: '', allData: [], data: [], appliedTipo: null, validation: null, regionOrder: [],
    filters: { ...DEFAULT_FILTERS }, view: { ...DEFAULT_VIEW }, showDetails: false
  });
  $('file-input').value = '';
  $('file-meta').classList.add('hidden');
  $('file-meta').textContent = '';
  $('sheet-picker-wrap').classList.add('hidden');
  $('sheet-picker').replaceChildren();
  $('filter-tecnico').value = '';
  hideFeedback();
}

function processSheet(sheetName) {
  state.data = [];
  state.allData = [];
  state.appliedTipo = null;
  state.validation = null;
  state.sheetName = sheetName;
  state.filters = { ...DEFAULT_FILTERS };
  state.view = { ...DEFAULT_VIEW };
  state.showDetails = false;
  try {
    const { records, toa } = readActivitySheet(state.workbook, sheetName);
    state.regionOrder = REGION_ORDER.length
      ? [...REGION_ORDER]
      : unique(records.map((r) => r.regiao).filter((regiao) => regiao !== FALLBACK.regiao));
    state.allData = records;
    state.appliedTipo = null;
    applyTipoView();

    const v = state.validation;
    const warnings = [];
    if (v.inconsistentes.length) warnings.push(`${fmt(v.inconsistentes.length)} técnicos com Total Geral inconsistente.`);
    let summaryLine = `${fmt(records.length)} técnicos lidos da aba "${sheetName}".`;
    if (toa) {
      const porTipo = (tipo) => records.filter((r) => r.tipoTecnico === tipo).length;
      summaryLine = `${fmt(records.length)} técnicos montados a partir da extração do TOA (aba "${sheetName}"): ` +
        `${fmt(porTipo('corretiva'))} de corretiva e ${fmt(porTipo('preventiva'))} de preventiva, pelas TSKs em fila. ` +
        `${fmt(toa.atividades.corretiva + toa.atividades.preventiva)} atividades (${fmt(toa.atividades.corretiva)} corretivas, ${fmt(toa.atividades.preventiva)} preventivas).`;
      if (toa.foraDoCadastro.size) {
        const nomes = [...toa.foraDoCadastro.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
        warnings.push(`${fmt(nomes.length)} técnicos fora do cadastro não entraram na análise: ${nomes.join('; ')}.`);
      }
      if (toa.estadosDesconhecidos.size) {
        const estados = [...toa.estadosDesconhecidos].map(([estado, n]) => `${estado} (${fmt(n)})`);
        warnings.push(`Estados não reconhecidos, fora da contagem: ${estados.join(', ')}.`);
      }
    }
    showFeedback([summaryLine, ...warnings].join('\n'), warnings.length ? 'warning' : 'success');
  } catch (error) {
    state.data = [];
    showFeedback(error instanceof UserError ? error.message : `Não foi possível analisar a aba "${sheetName}". ${error.message || ''}`.trim(), 'error');
  }
  render();
}

async function loadFile(file) {
  resetState();
  render();
  if (!file) return;
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
    showFeedback('Arquivo inválido. Selecione uma planilha .xlsx, .xls ou .csv.', 'error');
    return;
  }
  if (file.size === 0) {
    showFeedback('O arquivo está vazio. Selecione uma planilha com dados.', 'error');
    return;
  }
  if (!window.XLSX) {
    showFeedback('Não foi possível carregar o leitor de planilhas (SheetJS). Verifique sua conexão e recarregue a página.', 'error');
    return;
  }

  try {
    // CSV é lido como texto (preserva acentos) e com raw: true para que "1.234" seja tratado por toNumber.
    const workbook = /\.csv$/i.test(file.name)
      ? XLSX.read(await file.text(), { type: 'string', raw: true })
      : XLSX.read(await file.arrayBuffer(), { type: 'array' });
    state.workbook = workbook;
    state.fileName = file.name;
    saveSharedFile(file);
    $('file-meta').textContent = `Arquivo: ${file.name}`;
    $('file-meta').classList.remove('hidden');

    if (!workbook.SheetNames.length) throw new UserError('O arquivo não tem abas.');
    const initial = defaultSheetName(workbook);
    if (workbook.SheetNames.length > 1) {
      fillSelect($('sheet-picker'), workbook.SheetNames.map((name) => [name, name]), initial);
      $('sheet-picker-wrap').classList.remove('hidden');
    }
    processSheet(initial);
  } catch (error) {
    state.data = [];
    render();
    showFeedback(error instanceof UserError ? error.message : `Não foi possível ler o arquivo. Confirme se ele é uma planilha válida. ${error.message || ''}`.trim(), 'error');
  }
}

function renderCadastroStatus(message = '', kind = '') {
  const { byCodigo, fileName, savedAt } = state.cadastro;
  const regioes = unique([...byCodigo.values()].map((info) => info.regiao)).sort(compareLabels);
  const origem = fileName
    ? `${fileName}${savedAt ? ` (enviado em ${new Date(savedAt).toLocaleDateString('pt-BR')})` : ''}`
    : 'padrão do sistema';
  const sufixo = fileName ? ' + padrão' : '';
  $('cadastro-status').textContent = `${fmt(byCodigo.size)} técnicos · ${regioes.join(', ') || 'sem regiões'} · ${origem}${sufixo}`;
  $('cadastro-reset-button').classList.toggle('hidden', !fileName);
  const feedback = $('cadastro-feedback');
  feedback.textContent = message;
  feedback.className = `w-full text-xs ${message ? '' : 'hidden'} ${kind === 'error' ? 'text-[color:var(--error-ink)]' : 'text-[color:var(--ok-ink)]'}`;
}

// Cadastro novo vale na hora: se a aba aberta for do TOA, ela é recalculada.
function applyCadastroChange(message) {
  renderCadastroStatus(message);
  if (state.workbook && state.sheetName) processSheet(state.sheetName);
}

async function loadCadastroFile(file) {
  $('cadastro-input').value = '';
  if (!file) return;
  try {
    if (!window.XLSX) throw new UserError('O leitor de planilhas (SheetJS) não carregou. Recarregue a página.');
    const workbook = /\.csv$/i.test(file.name)
      ? XLSX.read(await file.text(), { type: 'string', raw: true })
      : XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const rows = readCadastroWorkbook(workbook);
    const savedAt = new Date().toISOString();
    setCadastro(rows, file.name, savedAt);
    let message = `Cadastro atualizado: ${fmt(rows.length)} técnicos do arquivo, ${fmt(state.cadastro.byCodigo.size)} no total com o padrão.`;
    try {
      localStorage.setItem(CADASTRO_STORAGE_KEY, JSON.stringify({ rows, fileName: file.name, savedAt }));
    } catch {
      message += ' Não foi possível salvar no navegador: vale só até fechar a página.';
    }
    applyCadastroChange(message);
  } catch (error) {
    renderCadastroStatus(error instanceof UserError ? error.message : `Não foi possível ler o cadastro. ${error.message || ''}`.trim(), 'error');
  }
}

function resetCadastro() {
  try {
    localStorage.removeItem(CADASTRO_STORAGE_KEY);
  } catch {
    // Sem acesso ao armazenamento: só volta ao padrão nesta sessão.
  }
  setCadastro([]);
  applyCadastroChange('Cadastro padrão restaurado.');
}

function scrollToTechTable() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('tech-section').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

function setSituacaoFilter(value) {
  state.filters.situacao = value;
  if (value !== 'all') state.view.techTable = value;
}

function bindEvents() {
  const fileInput = $('file-input');
  const dropZone = $('drop-zone');

  fileInput.addEventListener('change', () => loadFile(fileInput.files[0]));
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput.click();
    }
  });
  for (const type of ['dragenter', 'dragover']) {
    dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      dropZone.classList.add('is-dragging');
    });
  }
  for (const type of ['dragleave', 'drop']) {
    dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      if (type === 'dragleave' && dropZone.contains(event.relatedTarget)) return;
      dropZone.classList.remove('is-dragging');
    });
  }
  dropZone.addEventListener('drop', (event) => loadFile(event.dataTransfer?.files?.[0]));

  $('clear-button').addEventListener('click', () => {
    clearSharedFile();
    resetState();
    render();
  });
  $('sheet-picker').addEventListener('change', (event) => processSheet(event.target.value));
  $('cadastro-input').addEventListener('change', (event) => loadCadastroFile(event.target.files[0]));
  $('cadastro-reset-button').addEventListener('click', resetCadastro);

  for (const id of ['filter-tipo', 'filter-gerente', 'filter-responsavel', 'filter-regiao', 'filter-cm']) {
    $(id).addEventListener('change', (event) => {
      state.filters[event.target.dataset.filter] = event.target.value;
      render();
    });
  }
  $('filter-situacao').addEventListener('change', (event) => {
    setSituacaoFilter(event.target.value);
    render();
  });
  $('filter-tecnico').addEventListener('input', (event) => {
    state.filters.tecnico = event.target.value;
    render();
  });
  $('clear-filters-button').addEventListener('click', () => {
    state.filters = { ...DEFAULT_FILTERS };
    render();
  });
  // Card "Técnicos": sem nenhum filtro e com a tabela na visão inicial.
  $('reset-view-card').addEventListener('click', () => {
    state.filters = { ...DEFAULT_FILTERS };
    state.view.techTable = DEFAULT_VIEW.techTable;
    render();
  });

  document.querySelectorAll('.situation-card').forEach((card) => {
    card.addEventListener('click', () => {
      const value = card.dataset.situacao;
      const deactivate = state.filters.situacao === value;
      setSituacaoFilter(deactivate ? 'all' : value);
      render();
      if (!deactivate) scrollToTechTable();
    });
  });

  $('toggle-details-button').addEventListener('click', () => {
    state.showDetails = !state.showDetails;
    render();
  });

  const viewSelects = { 'tech-table-filter': 'techTable', 'tech-table-sort': 'techSort', 'responsible-sort': 'responsibleSort', 'chart-sort': 'chartSort' };
  for (const [id, key] of Object.entries(viewSelects)) {
    $(id).addEventListener('change', (event) => {
      state.view[key] = event.target.value;
      render();
    });
  }

  $('export-tech-button').addEventListener('click', exportTechList);
  $('export-tech-image-button').addEventListener('click', exportTechImage);
  $('report-dialog-close').addEventListener('click', () => $('report-dialog').close());
  $('export-manager-button').addEventListener('click', exportManagerReport);
  $('export-responsible-button').addEventListener('click', exportResponsible);
  $('export-region-button').addEventListener('click', exportRegionSummary);
  $('export-by-region-button').addEventListener('click', exportByRegion);
}

loadStoredCadastro();
bindEvents();
renderCadastroStatus();
render();
// Planilha importada antes nesta aba (aqui ou no Report Backlog) é carregada de volta.
const sharedFile = loadSharedFile();
if (sharedFile) loadFile(sharedFile);
