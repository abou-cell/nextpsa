import * as go from 'gojs';
import { EventTreeEditorComponent } from './event-tree-editor.component';
import { EventTreePageComponent } from '../../features/event-tree/event-tree-page.component';
import { EventTreeModel } from '../../features/event-tree/event-tree.models';

type RecordKind = 'IE' | 'FE' | 'SEQUENCE' | 'EVENT_TREE';

interface RecordSpec {
  kind: RecordKind;
  title: string;
  saveLabel: string;
  tabs: string[];
  draft: any;
  tree: EventTreeModel;
  onSave: (draft: any) => void;
}

let pageInstance: any = null;
let activeDialog: HTMLElement | null = null;

const SUCCESS_TREATMENTS = [
  'Ignore ET success',
  'Logical ET success',
  'Logical and simple quantification',
  'DeMorgan in FT',
  'DeMorgan in FT and ET'
];

const IE_INPUT_TYPES = [
  'Basic Event',
  'Gate',
  'Consequence',
  'Fault Tree Analysis Case',
  'Sequence Analysis Case',
  'Consequence Analysis Case',
  'MCS Analysis Case'
];

const FE_INPUT_TYPES = ['Basic Event', 'Gate'];

function clone<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function nowStamp(): string {
  const d = new Date();
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function notifyModelChanged(editor?: any): void {
  const page = pageInstance;
  if (page?.repository?.eventTrees) {
    const current = page.repository.eventTrees();
    page.repository.eventTrees.set([...current]);
  }
  requestAnimationFrame(() => editor?.refreshLayout?.());
}

function ensureStyles(): void {
  if (document.getElementById('nextpsa-et-record-dialog-style')) return;
  const style = document.createElement('style');
  style.id = 'nextpsa-et-record-dialog-style';
  style.textContent = `
    .nps-et-record-backdrop{position:fixed;inset:0;z-index:180;pointer-events:none}
    .nps-et-record-dialog{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(940px,84vw);height:min(640px,80vh);min-width:520px;min-height:360px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);resize:both;overflow:hidden;pointer-events:auto;background:#fff;border:1px solid var(--nps-border,#cbd5e1);border-radius:8px;box-shadow:0 10px 28px rgba(15,23,42,.18);display:grid;grid-template-rows:auto auto 1fr auto;font-family:Inter,Arial,sans-serif;color:#111827}
    .nps-et-record-dialog.moved{transform:none}
    .nps-et-record-header{padding:10px 12px;background:#f8fafc;border-bottom:1px solid var(--nps-border,#cbd5e1);display:flex;align-items:center;justify-content:space-between;cursor:move;user-select:none;touch-action:none}
    .nps-et-record-eyebrow{font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:#64748b}
    .nps-et-record-title{margin:2px 0 0;font-size:13px;font-weight:700}
    .nps-et-record-close{width:28px;height:26px;border:1px solid transparent;border-radius:6px;background:transparent;color:#64748b;font-size:18px;line-height:1;cursor:pointer}
    .nps-et-record-close:hover{background:#fee2e2;border-color:#fecaca;color:#b91c1c}
    .nps-et-record-tabs{display:flex;overflow-x:auto;padding:0 10px;border-bottom:1px solid var(--nps-border,#cbd5e1);background:#fff}
    .nps-et-record-tabs button{border:0;background:transparent;padding:9px 10px;color:#64748b;border-bottom:2px solid transparent;font-size:10px;white-space:nowrap;cursor:pointer}
    .nps-et-record-tabs button.active{color:var(--nps-blue,#2563eb);border-color:var(--nps-blue,#2563eb);font-weight:700}
    .nps-et-record-body{overflow:auto;padding:20px}
    .nps-et-section{margin-bottom:20px}
    .nps-et-section h3{margin:0 0 10px;font-size:11px;color:#475569;text-transform:none}
    .nps-et-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .nps-et-field{display:grid;gap:6px;color:#64748b;font-size:10px;font-weight:700}
    .nps-et-field input,.nps-et-field select,.nps-et-field textarea{width:100%;box-sizing:border-box;border:1px solid var(--nps-border,#cbd5e1);border-radius:8px;padding:0 10px;background:#fff;color:#111827;font:500 11px Inter,Arial,sans-serif}
    .nps-et-field input,.nps-et-field select{height:36px}
    .nps-et-field textarea{min-height:240px;padding:10px;resize:vertical}
    .nps-et-field input:disabled{background:#f1f5f9;color:#64748b}
    .nps-et-record-table{width:100%;border-collapse:collapse;font-size:11px}
    .nps-et-record-table th,.nps-et-record-table td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--nps-border,#cbd5e1);vertical-align:middle}
    .nps-et-record-table th{background:#f8fbff;color:#64748b;font-weight:700}
    .nps-et-record-table input,.nps-et-record-table select{width:100%;box-sizing:border-box;height:30px;border:1px solid var(--nps-border,#cbd5e1);border-radius:6px;padding:0 8px;background:#fff;color:#111827;font-size:11px}
    .nps-et-empty{padding:20px;border:1px dashed #cbd5e1;border-radius:10px;color:#64748b;font-size:11px}
    .nps-et-record-footer{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:10px 12px;border-top:1px solid var(--nps-border,#cbd5e1);background:#f8fafc}
    .nps-et-record-version{margin-right:auto;color:#64748b;font-size:10px}
    .nps-et-record-footer button{border:1px solid var(--nps-border,#cbd5e1);background:#fff;border-radius:8px;padding:8px 12px;cursor:pointer}
    .nps-et-record-footer button.primary{background:var(--nps-blue,#2563eb);border-color:var(--nps-blue,#2563eb);color:#fff}
    @media(max-width:700px){.nps-et-record-dialog{min-width:0;width:calc(100vw - 12px);height:calc(100vh - 12px)}.nps-et-form-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function makeField(label: string, value: any, onChange: (value: string) => void, options?: string[], disabled = false): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'nps-et-field';
  const caption = document.createElement('span');
  caption.textContent = label;
  wrap.appendChild(caption);

  if (options) {
    const select = document.createElement('select');
    options.forEach((option) => {
      const item = document.createElement('option');
      item.value = option;
      item.textContent = option;
      if (option === String(value ?? '')) item.selected = true;
      select.appendChild(item);
    });
    select.disabled = disabled;
    select.addEventListener('change', () => onChange(select.value));
    wrap.appendChild(select);
  } else {
    const input = document.createElement('input');
    input.value = String(value ?? '');
    input.disabled = disabled;
    input.addEventListener('input', () => onChange(input.value));
    wrap.appendChild(input);
  }
  return wrap;
}

function renderGeneral(body: HTMLElement, spec: RecordSpec): void {
  const draft = spec.draft;
  const general = document.createElement('section');
  general.className = 'nps-et-section';
  const title = document.createElement('h3');
  title.textContent = 'General';
  general.appendChild(title);
  const grid = document.createElement('div');
  grid.className = 'nps-et-form-grid';
  grid.appendChild(makeField('ID', draft.id, (v) => { draft.id = v; }, undefined, draft.idLocked !== false));
  grid.appendChild(makeField('Description', draft.description, (v) => { draft.description = v; }));

  if (spec.kind === 'IE') {
    grid.appendChild(makeField('State', draft.state, (v) => { draft.state = v; }));
  } else if (spec.kind === 'FE') {
    grid.appendChild(makeField('Success Treatment', draft.successTreatment, (v) => { draft.successTreatment = v; }, SUCCESS_TREATMENTS));
    grid.appendChild(makeField('State', draft.state, (v) => { draft.state = v; }));
  } else if (spec.kind === 'SEQUENCE') {
    grid.appendChild(makeField('Mean', draft.mean, (v) => { draft.mean = v; }));
    grid.appendChild(makeField('Calculation Type', draft.calculationType, (v) => { draft.calculationType = v; }));
  }
  general.appendChild(grid);
  body.appendChild(general);

  const audit = document.createElement('section');
  audit.className = 'nps-et-section';
  const auditTitle = document.createElement('h3');
  auditTitle.textContent = 'Audit';
  audit.appendChild(auditTitle);
  const auditGrid = document.createElement('div');
  auditGrid.className = 'nps-et-form-grid';
  auditGrid.appendChild(makeField('Edited by', draft.editedBy, () => {}, undefined, true));
  auditGrid.appendChild(makeField('Edited date', draft.editedDate, () => {}, undefined, true));
  audit.appendChild(auditGrid);
  body.appendChild(audit);
}

function renderInputs(body: HTMLElement, spec: RecordSpec): void {
  const rows = spec.draft.inputs as any[];
  if (!rows.length) rows.push({ alt: 1, inputType: '', inputEvent: '', bcSet: '' });
  const table = document.createElement('table');
  table.className = 'nps-et-record-table';
  table.innerHTML = '<thead><tr><th style="width:60px">Alt #</th><th>Input type</th><th>Input event</th><th>BC Set</th></tr></thead>';
  const tbody = document.createElement('tbody');
  rows.forEach((row, index) => {
    const tr = document.createElement('tr');
    const alt = document.createElement('td');
    alt.textContent = String(row.alt ?? index + 1);
    tr.appendChild(alt);

    const typeCell = document.createElement('td');
    const type = document.createElement('select');
    const choices = spec.kind === 'IE' ? IE_INPUT_TYPES : FE_INPUT_TYPES;
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '—';
    type.appendChild(blank);
    choices.forEach((choice) => {
      const option = document.createElement('option');
      option.value = choice;
      option.textContent = choice;
      option.selected = choice === row.inputType;
      type.appendChild(option);
    });
    type.addEventListener('change', () => { row.inputType = type.value; });
    typeCell.appendChild(type);
    tr.appendChild(typeCell);

    const eventCell = document.createElement('td');
    const eventInput = document.createElement('input');
    eventInput.value = row.inputEvent ?? '';
    eventInput.addEventListener('input', () => { row.inputEvent = eventInput.value; });
    eventCell.appendChild(eventInput);
    tr.appendChild(eventCell);

    const bcCell = document.createElement('td');
    const bcInput = document.createElement('input');
    bcInput.value = row.bcSet ?? '';
    bcInput.addEventListener('input', () => { row.bcSet = bcInput.value; });
    bcCell.appendChild(bcInput);
    tr.appendChild(bcCell);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  body.appendChild(table);
}

function renderUsage(body: HTMLElement, tree: EventTreeModel): void {
  const table = document.createElement('table');
  table.className = 'nps-et-record-table';
  table.innerHTML = '<thead><tr><th>ID Event Tree</th><th>Description</th></tr></thead>';
  const row = document.createElement('tr');
  const id = document.createElement('td');
  id.textContent = tree.id;
  const desc = document.createElement('td');
  desc.textContent = tree.description;
  row.append(id, desc);
  const tbody = document.createElement('tbody');
  tbody.appendChild(row);
  table.appendChild(tbody);
  body.appendChild(table);
}

function renderMemo(body: HTMLElement, spec: RecordSpec): void {
  const field = document.createElement('label');
  field.className = 'nps-et-field';
  const caption = document.createElement('span');
  caption.textContent = 'Memo';
  const area = document.createElement('textarea');
  area.value = spec.draft.memo ?? '';
  area.addEventListener('input', () => { spec.draft.memo = area.value; });
  field.append(caption, area);
  body.appendChild(field);
}

function renderConsequence(body: HTMLElement, spec: RecordSpec): void {
  const grid = document.createElement('div');
  grid.className = 'nps-et-form-grid';
  grid.appendChild(makeField('Consequence', spec.draft.consequence, (v) => { spec.draft.consequence = v; }));
  grid.appendChild(makeField('Code', spec.draft.resultCode, (v) => { spec.draft.resultCode = v; }));
  body.appendChild(grid);
}

function renderAnalysisCases(body: HTMLElement, spec: RecordSpec): void {
  const cases = spec.draft.analysisCases as string[];
  if (!cases.length) {
    const empty = document.createElement('div');
    empty.className = 'nps-et-empty';
    empty.textContent = 'No Sequence Analysis Case configured for this sequence.';
    body.appendChild(empty);
    return;
  }
  const table = document.createElement('table');
  table.className = 'nps-et-record-table';
  table.innerHTML = '<thead><tr><th>Analysis Case</th></tr></thead>';
  const tbody = document.createElement('tbody');
  cases.forEach((item) => {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.textContent = item;
    tr.appendChild(td);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  body.appendChild(table);
}

function renderFeGroup(body: HTMLElement, tree: EventTreeModel): void {
  const table = document.createElement('table');
  table.className = 'nps-et-record-table';
  table.innerHTML = '<thead><tr><th style="width:70px">Order</th><th>ID</th><th>Description</th></tr></thead>';
  const tbody = document.createElement('tbody');
  tree.functionEvents.forEach((event, index) => {
    const tr = document.createElement('tr');
    [String(index + 1), event.code, event.description].forEach((text) => {
      const td = document.createElement('td');
      td.textContent = text;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  body.appendChild(table);
}

function renderTab(body: HTMLElement, spec: RecordSpec, tab: string): void {
  body.innerHTML = '';
  switch (tab) {
    case 'Main': renderGeneral(body, spec); break;
    case 'Input': renderInputs(body, spec); break;
    case 'Event Tree': renderUsage(body, spec.tree); break;
    case 'Memo': renderMemo(body, spec); break;
    case 'Consequence': renderConsequence(body, spec); break;
    case 'Analysis Case': renderAnalysisCases(body, spec); break;
    case 'FE Group': renderFeGroup(body, spec.tree); break;
    default: break;
  }
}

function openDialog(spec: RecordSpec): void {
  activeDialog?.remove();
  ensureStyles();

  const backdrop = document.createElement('div');
  backdrop.className = 'nps-et-record-backdrop';
  const dialog = document.createElement('section');
  dialog.className = 'nps-et-record-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'false');
  backdrop.appendChild(dialog);
  activeDialog = backdrop;

  const header = document.createElement('header');
  header.className = 'nps-et-record-header';
  const heading = document.createElement('div');
  const eyebrow = document.createElement('div');
  eyebrow.className = 'nps-et-record-eyebrow';
  eyebrow.textContent = `${spec.kind.replace('_', ' ')} RECORD`;
  const title = document.createElement('h2');
  title.className = 'nps-et-record-title';
  title.textContent = spec.title;
  heading.append(eyebrow, title);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'nps-et-record-close';
  close.textContent = '×';
  close.addEventListener('click', () => backdrop.remove());
  header.append(heading, close);
  dialog.appendChild(header);

  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;
  header.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
    const rect = dialog.getBoundingClientRect();
    dialog.classList.add('moved');
    dialog.style.left = `${rect.left}px`;
    dialog.style.top = `${rect.top}px`;
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    dragging = true;
    header.setPointerCapture?.(event.pointerId);
  });
  const onMove = (event: PointerEvent) => {
    if (!dragging) return;
    const x = Math.max(0, Math.min(window.innerWidth - dialog.offsetWidth, event.clientX - offsetX));
    const y = Math.max(0, Math.min(window.innerHeight - dialog.offsetHeight, event.clientY - offsetY));
    dialog.style.left = `${Math.round(x)}px`;
    dialog.style.top = `${Math.round(y)}px`;
  };
  const onUp = () => { dragging = false; };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  backdrop.addEventListener('DOMNodeRemoved', () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }, { once: true });

  const tabs = document.createElement('nav');
  tabs.className = 'nps-et-record-tabs';
  const body = document.createElement('div');
  body.className = 'nps-et-record-body';
  let activeTab = spec.tabs[0];
  const updateTabs = () => {
    [...tabs.querySelectorAll('button')].forEach((button) => button.classList.toggle('active', button.textContent === activeTab));
  };
  spec.tabs.forEach((name) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = name;
    button.addEventListener('click', () => {
      activeTab = name;
      updateTabs();
      renderTab(body, spec, activeTab);
    });
    tabs.appendChild(button);
  });
  dialog.append(tabs, body);
  updateTabs();
  renderTab(body, spec, activeTab);

  const footer = document.createElement('footer');
  footer.className = 'nps-et-record-footer';
  const version = document.createElement('span');
  version.className = 'nps-et-record-version';
  version.textContent = `Record version v${spec.draft.version ?? 1}`;
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => backdrop.remove());
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'primary';
  save.textContent = spec.saveLabel;
  save.addEventListener('click', () => {
    spec.onSave(spec.draft);
    backdrop.remove();
  });
  footer.append(version, cancel, save);
  dialog.appendChild(footer);
  document.body.appendChild(backdrop);
}

function audit(tree: any, key: string): { updatedBy: string; updatedAt: string; version: number } {
  return clone(tree[key] ?? { updatedBy: tree.editedBy ?? '—', updatedAt: tree.editedDate ?? '—', version: 1 });
}

function openIeRecord(editor: any, tree: EventTreeModel): void {
  const data: any = tree;
  const a = audit(data, '__ieAudit');
  const draft = {
    id: tree.initiatingCode,
    idLocked: false,
    description: tree.initiatingEvent,
    state: data.__ieState ?? 'Normal',
    inputs: clone(data.__ieInputs ?? []),
    memo: data.__ieMemo ?? '',
    editedBy: a.updatedBy,
    editedDate: a.updatedAt,
    version: a.version
  };
  openDialog({
    kind: 'IE',
    title: `${draft.id} · ${draft.description}`,
    saveLabel: 'Save Initiating Event',
    tabs: ['Main', 'Input', 'Event Tree', 'Memo'],
    draft,
    tree,
    onSave: (next) => {
      tree.initiatingCode = next.id;
      tree.initiatingEvent = next.description;
      data.__ieState = next.state;
      data.__ieInputs = clone(next.inputs);
      data.__ieMemo = next.memo;
      data.__ieAudit = { updatedBy: tree.editedBy ?? next.editedBy, updatedAt: nowStamp(), version: (next.version ?? 1) + 1 };
      notifyModelChanged(editor);
    }
  });
}

function openFeRecord(editor: any, tree: EventTreeModel, headerData: any): void {
  const key = String(headerData?.key ?? '').replace(/^HDR-/, '');
  const event: any = tree.functionEvents.find((item) => item.id === key || item.code === headerData?.code);
  if (!event) return;
  const a = clone(event.__audit ?? { updatedBy: tree.editedBy ?? '—', updatedAt: tree.editedDate ?? '—', version: 1 });
  const draft = {
    id: event.code,
    idLocked: false,
    description: event.description,
    successTreatment: event.successTreatment ?? 'Logical ET success',
    state: event.state ?? 'Normal',
    inputs: clone(event.inputs ?? []),
    memo: event.memo ?? '',
    editedBy: a.updatedBy,
    editedDate: a.updatedAt,
    version: a.version
  };
  openDialog({
    kind: 'FE',
    title: `${draft.id} · ${draft.description}`,
    saveLabel: 'Save Function Event',
    tabs: ['Main', 'Input', 'Event Tree', 'Memo'],
    draft,
    tree,
    onSave: (next) => {
      event.code = next.id;
      event.description = next.description;
      event.successTreatment = next.successTreatment;
      event.state = next.state;
      event.inputs = clone(next.inputs);
      event.memo = next.memo;
      event.__audit = { updatedBy: tree.editedBy ?? next.editedBy, updatedAt: nowStamp(), version: (next.version ?? 1) + 1 };
      notifyModelChanged(editor);
    }
  });
}

function openSequenceRecord(editor: any, tree: EventTreeModel, key: string): void {
  const sequence: any = tree.nodes.find((node) => node.category === 'SEQUENCE' && node.key === key);
  if (!sequence) return;
  const a = clone(sequence.__audit ?? { updatedBy: tree.editedBy ?? '—', updatedAt: tree.editedDate ?? '—', version: 1 });
  const draft = {
    id: sequence.key,
    description: sequence.label ?? `Sequence ${sequence.sequenceNo ?? ''}`,
    mean: sequence.frequency ?? '',
    calculationType: sequence.calculationType ?? 'F',
    consequence: sequence.consequence ?? '',
    resultCode: sequence.resultCode ?? '',
    analysisCases: clone(sequence.analysisCases ?? []),
    memo: sequence.memo ?? '',
    editedBy: a.updatedBy,
    editedDate: a.updatedAt,
    version: a.version
  };
  openDialog({
    kind: 'SEQUENCE',
    title: `${draft.id} · ${draft.description}`,
    saveLabel: 'Save Sequence',
    tabs: ['Main', 'Consequence', 'Analysis Case', 'Event Tree', 'Memo'],
    draft,
    tree,
    onSave: (next) => {
      sequence.label = next.description;
      sequence.frequency = next.mean;
      sequence.calculationType = next.calculationType;
      sequence.consequence = next.consequence;
      sequence.resultCode = next.resultCode;
      sequence.analysisCases = clone(next.analysisCases);
      sequence.memo = next.memo;
      sequence.__audit = { updatedBy: tree.editedBy ?? next.editedBy, updatedAt: nowStamp(), version: (next.version ?? 1) + 1 };
      notifyModelChanged(editor);
    }
  });
}

function openEventTreeRecord(page: any, tree: EventTreeModel): void {
  const data: any = tree;
  const a = audit(data, '__etAudit');
  const draft = {
    id: tree.id,
    description: tree.description,
    memo: data.__etMemo ?? '',
    editedBy: a.updatedBy,
    editedDate: a.updatedAt,
    version: a.version
  };
  openDialog({
    kind: 'EVENT_TREE',
    title: `${draft.id} · ${draft.description}`,
    saveLabel: 'Save Event Tree',
    tabs: ['Main', 'FE Group', 'Memo'],
    draft,
    tree,
    onSave: (next) => {
      tree.description = next.description;
      data.__etMemo = next.memo;
      data.__etAudit = { updatedBy: tree.editedBy ?? next.editedBy, updatedAt: nowStamp(), version: (next.version ?? 1) + 1 };
      const records = page?.repository?.eventTrees?.();
      if (records) page.repository.eventTrees.set([...records]);
    }
  });
}

export function installEventTreeRecordDialogPatch(): void {
  const editorPrototype = EventTreeEditorComponent.prototype as any;
  if (editorPrototype.__eventTreeRecordDialogPatchInstalled) return;
  editorPrototype.__eventTreeRecordDialogPatchInstalled = true;

  const originalInstallTemplates = editorPrototype.installTemplates;
  editorPrototype.installTemplates = function(metrics: unknown): void {
    originalInstallTemplates.call(this, metrics);
    const diagram = this.diagram as go.Diagram | undefined;
    if (!diagram) return;

    const header = diagram.nodeTemplateMap.get('HEADER') as go.Node | null;
    if (header) {
      const previous = header.doubleClick;
      header.doubleClick = (event: go.InputEvent, object: go.GraphObject): void => {
        previous?.(event, object);
        const node = object.part as go.Node | null;
        const data = node?.data as any;
        if (!data) return;
        event.handled = true;
        if (data.initiating) openIeRecord(this, this.model);
        else openFeRecord(this, this.model, data);
      };
    }

    const sequence = diagram.nodeTemplateMap.get('SEQUENCE') as go.Node | null;
    if (sequence) {
      const previous = sequence.doubleClick;
      sequence.doubleClick = (event: go.InputEvent, object: go.GraphObject): void => {
        previous?.(event, object);
        const node = object.part as go.Node | null;
        const key = String((node?.data as any)?.key ?? '');
        if (!key) return;
        event.handled = true;
        openSequenceRecord(this, this.model, key);
      };
    }
  };

  const pagePrototype = EventTreePageComponent.prototype as any;
  const originalTableMinWidth = pagePrototype.tableMinWidth;
  pagePrototype.tableMinWidth = function(): number {
    pageInstance = this;
    return originalTableMinWidth.call(this);
  };

  const originalSelectEventTree = pagePrototype.selectEventTree;
  pagePrototype.selectEventTree = function(tree: EventTreeModel, event?: Event): void {
    pageInstance = this;
    originalSelectEventTree.call(this, tree, event);
    const mouse = event as MouseEvent | undefined;
    const target = mouse?.target as HTMLElement | null;
    if (mouse && mouse.detail >= 2 && !target?.closest('.row-resizer')) {
      mouse.preventDefault();
      mouse.stopPropagation();
      openEventTreeRecord(this, tree);
    }
  };
}
