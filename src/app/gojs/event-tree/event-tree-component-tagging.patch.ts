import * as go from 'gojs';
import { EventTreeEditorComponent } from './event-tree-editor.component';

const ACTIVE = '#0f5bd8';
const ACTIVE_FILL = '#e8f1ff';
const NORMAL_HEADER_STROKE = '#4b5563';
const NORMAL_SEQUENCE_STROKE = '#cbd5e1';
const HEADER_TAG_PREFIX = '__ET_HEADER_TAG__:';

/**
 * Unified selection/tagging for ET editor components.
 *
 * Important distinction:
 * - clicking an IE/FE HEADER selects the IE/FE component itself (taggable);
 * - clicking a branch dot keeps the existing branch-selection behaviour and
 *   therefore tags its consequence rows;
 * - consequence rows are taggable directly and can be multi-selected together
 *   with IE/FE headers using Ctrl/Cmd;
 * - tags are durable visual state and selection is only an outline.
 */
export function installEventTreeComponentTaggingPatch(): void {
  const prototype = EventTreeEditorComponent.prototype as any;
  if (prototype.__eventTreeComponentTaggingPatchInstalled) return;
  prototype.__eventTreeComponentTaggingPatchInstalled = true;

  const originalInstallTemplates = prototype.installTemplates;
  const originalApplyModel = prototype.applyModel;
  const originalAfterViewInit = prototype.ngAfterViewInit;
  const originalOnDestroy = prototype.ngOnDestroy;

  const selectedComponents = (component: any): Set<string> => {
    component.__eventTreeSelectedComponents ??= new Set<string>();
    return component.__eventTreeSelectedComponents as Set<string>;
  };

  const branchSet = (component: any): Set<string> => {
    component.__eventTreeSelectedBranchKeys ??= new Set<string>();
    return component.__eventTreeSelectedBranchKeys as Set<string>;
  };

  const rowSet = (component: any): Set<string> => {
    component.__eventTreeSelectedResultRowKeys ??= new Set<string>();
    return component.__eventTreeSelectedResultRowKeys as Set<string>;
  };

  const sequenceTagStore = (component: any): Map<string, string> => {
    component.__eventTreeTagColors ??= new Map<string, string>();
    return component.__eventTreeTagColors as Map<string, string>;
  };

  const headerTagStore = (component: any): Map<string, string> => {
    component.__eventTreeHeaderTagColorsByTree ??= new Map<string, Map<string, string>>();
    const all = component.__eventTreeHeaderTagColorsByTree as Map<string, Map<string, string>>;
    const treeId = String(component.model?.id ?? '__default__');
    let store = all.get(treeId);
    if (!store) {
      store = new Map<string, string>();
      all.set(treeId, store);
    }
    return store;
  };

  const tagKey = (componentKey: string): string =>
    componentKey.startsWith('HDR-') ? `${HEADER_TAG_PREFIX}${componentKey}` : componentKey;

  const notifyEditorActive = (component: any): void => {
    window.dispatchEvent(new CustomEvent('nextpsa-et-editor-selection', {
      detail: { treeId: String(component.model?.id ?? ''), active: true }
    }));
  };

  const render = (component: any): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return;
    const selected = selectedComponents(component);
    const sequenceTags = sequenceTagStore(component);
    const headerTags = headerTagStore(component);

    diagram.nodes.each((node: go.Node) => {
      const data = node.data as any;
      const key = String(data?.key ?? '');
      if (!key) return;

      if (data?.category === 'HEADER') {
        const shape = node.findObject('HEADER_BG') as go.Shape | null;
        if (!shape) return;
        const tagged = headerTags.get(tagKey(key));
        const active = selected.has(key);
        shape.fill = tagged ?? (data?.initiating ? '#d8d8d8' : '#ffffff');
        shape.stroke = active ? ACTIVE : NORMAL_HEADER_STROKE;
        shape.strokeWidth = active ? 2 : 1;
        return;
      }

      if (data?.category === 'SEQUENCE') {
        const shape = node.findObject('SEQUENCE_ROW_BG') as go.Shape | null;
        if (!shape) return;
        const active = selected.has(key);
        const branchActive = Boolean((component.__eventTreeSelectedConsequenceKeys as Set<string> | undefined)?.has(key));
        const tagged = sequenceTags.get(key);
        shape.fill = tagged ?? (active || branchActive ? ACTIVE_FILL : '#ffffff');
        shape.stroke = branchActive ? ACTIVE : active ? '#2563eb' : NORMAL_SEQUENCE_STROKE;
        shape.strokeWidth = active || branchActive ? 1.5 : 1;
      }
    });
    diagram.requestUpdate();
  };

  const scheduleRender = (component: any): void => {
    const epoch = Number(component.__eventTreeComponentRenderEpoch ?? 0) + 1;
    component.__eventTreeComponentRenderEpoch = epoch;
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => {
      if (component.__eventTreeComponentRenderEpoch !== epoch) return;
      render(component);
    })));
  };

  const syncRowsForCompatibility = (component: any): void => {
    const rows = rowSet(component);
    rows.clear();
    selectedComponents(component).forEach((key) => {
      const node = (component.diagram as go.Diagram | undefined)?.findNodeForKey(key);
      if ((node?.data as any)?.category === 'SEQUENCE') rows.add(key);
    });
  };

  const clearBranches = (component: any): void => {
    branchSet(component).clear();
    component.__eventTreeSelectedConsequenceKeys = new Set<string>();
    component.selectedBranchKey?.set?.(null);
    component.selectedBranchCount?.set?.(0);
  };

  const selectComponent = (component: any, key: string, additive: boolean): void => {
    clearBranches(component);
    const selected = selectedComponents(component);
    if (additive) {
      if (selected.has(key)) selected.delete(key);
      else selected.add(key);
    } else {
      selected.clear();
      selected.add(key);
    }
    syncRowsForCompatibility(component);
    notifyEditorActive(component);
    scheduleRender(component);
  };

  const clearUnifiedSelection = (component: any): void => {
    selectedComponents(component).clear();
    rowSet(component).clear();
    clearBranches(component);
    component.diagram?.clearSelection?.();
    scheduleRender(component);
  };

  const selectedTagTargets = (component: any): Set<string> => {
    const result = new Set<string>();
    selectedComponents(component).forEach((key) => result.add(tagKey(key)));
    return result;
  };

  const isHeaderTag = (key: string): boolean => key.startsWith(HEADER_TAG_PREFIX);

  const hasTag = (component: any, key: string): boolean =>
    isHeaderTag(key) ? headerTagStore(component).has(key) : sequenceTagStore(component).has(key);

  const setTag = (component: any, key: string, color: string): void => {
    if (isHeaderTag(key)) headerTagStore(component).set(key, color);
    else sequenceTagStore(component).set(key, color);
  };

  const deleteTag = (component: any, key: string): void => {
    if (isHeaderTag(key)) headerTagStore(component).delete(key);
    else sequenceTagStore(component).delete(key);
  };

  const toggleSelectedComponentTags = (component: any): boolean => {
    const targets = selectedTagTargets(component);
    if (!targets.size) return false;
    const allTagged = [...targets].every((key) => hasTag(component, key));
    if (allTagged) targets.forEach((key) => deleteTag(component, key));
    else {
      const color = String(component.__eventTreeActiveTagColor ?? '#fff200');
      targets.forEach((key) => setTag(component, key, color));
    }
    scheduleRender(component);
    return true;
  };

  const clearSelectedComponentTags = (component: any): boolean => {
    const targets = selectedTagTargets(component);
    if (!targets.size) return false;
    targets.forEach((key) => deleteTag(component, key));
    scheduleRender(component);
    return true;
  };

  const makeMenu = (component: any, event: MouseEvent): void => {
    (component.__eventTreeComponentTagMenu as HTMLElement | undefined)?.remove();
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    Object.assign(menu.style, {
      position: 'fixed', left: `${event.clientX}px`, top: `${event.clientY}px`, zIndex: '100010',
      minWidth: '220px', padding: '4px 0', background: '#fff', border: '1px solid #cbd5e1',
      borderRadius: '4px', boxShadow: '0 8px 24px rgba(15,23,42,.18)', font: '12px Arial, sans-serif'
    });
    const add = (label: string, action: () => void): void => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      Object.assign(button.style, {
        display: 'block', width: '100%', padding: '7px 12px', border: '0', background: 'transparent',
        textAlign: 'left', font: 'inherit', color: '#111827', cursor: 'pointer'
      });
      button.addEventListener('mouseenter', () => { button.style.background = '#eef4fb'; });
      button.addEventListener('mouseleave', () => { button.style.background = 'transparent'; });
      button.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation(); menu.remove(); action();
      });
      menu.appendChild(button);
    };
    const count = selectedComponents(component).size;
    add(count > 1 ? `Tag / Untag (${count}) — Alt+T` : 'Tag / Untag — Alt+T', () => toggleSelectedComponentTags(component));
    add(count > 1 ? `Retirer le tag (${count})` : 'Retirer le tag', () => clearSelectedComponentTags(component));
    document.body.appendChild(menu);
    component.__eventTreeComponentTagMenu = menu;
  };

  prototype.installTemplates = function(metrics: unknown): void {
    originalInstallTemplates.call(this, metrics);
    const diagram = this.diagram as go.Diagram | undefined;
    if (!diagram) return;

    const header = diagram.nodeTemplateMap.get('HEADER') as go.Node | null;
    if (header) {
      header.cursor = 'pointer';
      const bg = header.elt(0) as go.Shape | null;
      if (bg) bg.name = 'HEADER_BG';
      header.click = (event: go.InputEvent, object: go.GraphObject): void => {
        const node = object.part as go.Node | null;
        const key = String((node?.data as any)?.key ?? '');
        if (!node || !key) return;
        selectComponent(this, key, Boolean((event as any).control || (event as any).meta));
      };
    }

    const sequence = diagram.nodeTemplateMap.get('SEQUENCE') as go.Node | null;
    if (sequence) {
      const oldClick = sequence.click;
      void oldClick;
      sequence.cursor = 'pointer';
      const bg = sequence.elt(0) as go.Shape | null;
      if (bg) bg.name = 'SEQUENCE_ROW_BG';
      sequence.click = (event: go.InputEvent, object: go.GraphObject): void => {
        const node = object.part as go.Node | null;
        const key = String((node?.data as any)?.key ?? '');
        if (!node || !key) return;
        selectComponent(this, key, Boolean((event as any).control || (event as any).meta));
      };
    }

    ['START_POINT', 'FE_POINT', 'BRANCH'].forEach((category) => {
      const template = diagram.nodeTemplateMap.get(category) as go.Node | null;
      if (!template) return;
      const oldClick = template.click;
      template.click = (event: go.InputEvent, object: go.GraphObject): void => {
        selectedComponents(this).clear();
        rowSet(this).clear();
        notifyEditorActive(this);
        oldClick?.(event, object);
        scheduleRender(this);
      };
    });
  };

  prototype.applyModel = function(metrics: unknown): void {
    originalApplyModel.call(this, metrics);
    const diagram = this.diagram as go.Diagram | undefined;
    if (!diagram) return;
    const selected = selectedComponents(this);
    [...selected].forEach((key) => {
      const node = diagram.findNodeForKey(key);
      const category = (node?.data as any)?.category;
      if (!node || (category !== 'HEADER' && category !== 'SEQUENCE')) selected.delete(key);
    });
    syncRowsForCompatibility(this);
    scheduleRender(this);
  };

  prototype.ngAfterViewInit = function(): void {
    originalAfterViewInit.call(this);
    selectedComponents(this);

    // Replace the previous final Alt+T handler with one that understands IE/FE
    // headers as first-class taggable components.
    if (this.__eventTreeControllerKeyHandler) {
      window.removeEventListener('keydown', this.__eventTreeControllerKeyHandler, true);
    }

    const keyHandler = (event: KeyboardEvent): void => {
      if (!event.altKey || event.key.toLowerCase() !== 't') return;

      if (selectedComponents(this).size) {
        if (!toggleSelectedComponentTags(this)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      // No IE/FE/Sequence component selection: preserve branch -> consequence
      // tagging from the existing controller.
      if (branchSet(this).size && this.__eventTreeApplyTagToSelectedConsequences?.()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    this.__eventTreeUnifiedComponentKeyHandler = keyHandler;
    window.addEventListener('keydown', keyHandler, true);

    const div = this.diagramDiv?.nativeElement as HTMLDivElement | undefined;
    const contextHandler = (event: MouseEvent): void => {
      const diagram = this.diagram as go.Diagram | undefined;
      if (!diagram || !div) return;
      const rect = div.getBoundingClientRect();
      const point = diagram.transformViewToDoc(new go.Point(event.clientX - rect.left, event.clientY - rect.top));
      const part = diagram.findPartAt(point, true) as go.Part | null;
      const node = part instanceof go.Node ? part : null;
      const data = node?.data as any;
      if (!node || data?.category !== 'HEADER') return;

      event.preventDefault();
      event.stopImmediatePropagation();
      const key = String(data.key ?? '');
      if (!selectedComponents(this).has(key)) selectComponent(this, key, false);
      makeMenu(this, event);
    };
    this.__eventTreeUnifiedComponentContextHandler = contextHandler;
    div?.addEventListener('contextmenu', contextHandler, true);

    const dismiss = (event: MouseEvent): void => {
      const menu = this.__eventTreeComponentTagMenu as HTMLElement | undefined;
      if (menu && !menu.contains(event.target as Node)) {
        menu.remove();
        this.__eventTreeComponentTagMenu = null;
      }
    };
    this.__eventTreeUnifiedComponentDismissHandler = dismiss;
    document.addEventListener('mousedown', dismiss, true);

    this.__eventTreeClearUnifiedSelection = () => clearUnifiedSelection(this);
    this.__eventTreeHasUnifiedSelection = () => selectedComponents(this).size > 0 || branchSet(this).size > 0;
    scheduleRender(this);
  };

  prototype.ngOnDestroy = function(): void {
    const div = this.diagramDiv?.nativeElement as HTMLDivElement | undefined;
    if (this.__eventTreeUnifiedComponentKeyHandler) {
      window.removeEventListener('keydown', this.__eventTreeUnifiedComponentKeyHandler, true);
    }
    if (div && this.__eventTreeUnifiedComponentContextHandler) {
      div.removeEventListener('contextmenu', this.__eventTreeUnifiedComponentContextHandler, true);
    }
    if (this.__eventTreeUnifiedComponentDismissHandler) {
      document.removeEventListener('mousedown', this.__eventTreeUnifiedComponentDismissHandler, true);
    }
    (this.__eventTreeComponentTagMenu as HTMLElement | undefined)?.remove();
    originalOnDestroy.call(this);
  };
}
