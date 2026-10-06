import * as go from 'gojs';
import { EventTreeEditorComponent } from './event-tree-editor.component';

const NORMAL_LINK_STROKE = '#1f2937';
const ACTIVE_LINK_STROKE = '#0f5bd8';
const NORMAL_LINK_WIDTH = 1;
const ACTIVE_LINK_WIDTH = 1.25;
const ACTIVE_SEQUENCE_FILL = '#e8f1ff';
const ACTIVE_SEQUENCE_STROKE = '#0f5bd8';
const BASELINE_START_KEY = '__BASELINE_START__';
const BASELINE_END_KEY = '__BASELINE_END__';
const CENTER_ROUTE = '__etCenteredRoute';
const CENTER_ANCHOR_PREFIX = '__ETC-';

export function installEventTreeMultiBranchSelectionPatch(): void {
  const prototype = EventTreeEditorComponent.prototype as any;
  if (prototype.__eventTreeMultiBranchSelectionPatchInstalled) return;
  prototype.__eventTreeMultiBranchSelectionPatchInstalled = true;

  const originalInstallTemplates = prototype.installTemplates;
  const originalApplyModel = prototype.applyModel;
  const originalAfterViewInit = prototype.ngAfterViewInit;
  const originalOnDestroy = prototype.ngOnDestroy;
  const originalSelectBranchSource = prototype.selectBranchSource;

  const ensureSourceSet = (component: any): Set<string> => {
    component.__eventTreeSelectedBranchKeys ??= new Set<string>();
    return component.__eventTreeSelectedBranchKeys as Set<string>;
  };

  const buildLogicalOutgoing = (component: any): Map<string, string[]> => {
    const outgoing = new Map<string, string[]>();
    const seen = new Set<string>();
    const add = (from: string, to: string): void => {
      if (!from || !to) return;
      const id = `${from}\u0000${to}`;
      if (seen.has(id)) return;
      seen.add(id);
      const list = outgoing.get(from) ?? [];
      list.push(to);
      outgoing.set(from, list);
    };

    const sequences = (component.model?.nodes ?? [])
      .filter((node: any) => node.category === 'SEQUENCE')
      .map((node: any) => ({ key: String(node.key), sequenceNo: Number(node.sequenceNo ?? 0) }));
    const mainSequenceKey = sequences.some((sequence: any) => sequence.key === 'S1')
      ? 'S1'
      : [...sequences].sort((a: any, b: any) => a.sequenceNo - b.sequenceNo)[0]?.key ?? '';

    const feCount = Number(component.model?.functionEvents?.length ?? 0);
    if (feCount > 0) {
      add(BASELINE_START_KEY, 'FEPOINT-1');
      for (let column = 1; column < feCount; column += 1) {
        add(`FEPOINT-${column}`, `FEPOINT-${column + 1}`);
      }
      add(`FEPOINT-${feCount}`, BASELINE_END_KEY);
    } else {
      add(BASELINE_START_KEY, BASELINE_END_KEY);
    }
    if (mainSequenceKey) add(BASELINE_END_KEY, mainSequenceKey);

    (component.model?.links ?? []).forEach((link: any) => {
      add(String(link.from ?? ''), String(link.to ?? ''));
    });
    return outgoing;
  };

  const collectReachable = (outgoing: Map<string, string[]>, sourceKey: string): Set<string> => {
    const reachable = new Set<string>();
    const queue = [sourceKey];
    while (queue.length) {
      const key = queue.shift()!;
      if (reachable.has(key)) continue;
      reachable.add(key);
      (outgoing.get(key) ?? []).forEach((target) => {
        if (!reachable.has(target)) queue.push(target);
      });
    }
    return reachable;
  };

  const centeredAnchorOwner = (key: string): string | null => {
    if (!key.startsWith(CENTER_ANCHOR_PREFIX)) return null;
    const match = /^__ETC-(.+)-(\d+)$/.exec(key);
    if (!match) return null;
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  };

  const hasCenteredRoutes = (diagram: go.Diagram): boolean => {
    let centered = false;
    diagram.links.each((link: go.Link) => {
      if ((link.data as any)?.[CENTER_ROUTE]) centered = true;
    });
    return centered;
  };

  const tagColorFor = (component: any, key: string): string | undefined => {
    const map = component.__eventTreeTagColors as Map<string, string> | undefined;
    return map?.get(key);
  };

  const resetVisuals = (component: any): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return;

    diagram.links.each((link: go.Link) => {
      if (!link.path) return;
      link.path.stroke = NORMAL_LINK_STROKE;
      link.path.strokeWidth = NORMAL_LINK_WIDTH;
    });

    diagram.nodes.each((node: go.Node) => {
      const data = node.data as any;
      const key = String(data?.key ?? '');
      if (data?.category === 'SEQUENCE') {
        const shape = node.findObject('SEQUENCE_ROW_BG') as go.Shape | null;
        if (!shape) return;
        shape.fill = tagColorFor(component, key) ?? '#ffffff';
        shape.stroke = '#cbd5e1';
        shape.strokeWidth = 1;
      }
      if (data?.category === 'FE_POINT' || data?.category === 'BRANCH') {
        const dot = node.findObject('DOT') as go.Shape | null;
        if (dot) {
          dot.fill = '#111111';
          dot.stroke = '#111111';
        }
      }
    });
  };

  const setLinkActive = (link: go.Link): void => {
    if (!link.path) return;
    link.path.stroke = ACTIVE_LINK_STROKE;
    link.path.strokeWidth = ACTIVE_LINK_WIDTH;
  };

  const setSequenceActive = (component: any, node: go.Node): void => {
    const key = String((node.data as any)?.key ?? '');
    const shape = node.findObject('SEQUENCE_ROW_BG') as go.Shape | null;
    if (!shape) return;
    shape.fill = tagColorFor(component, key) ?? ACTIVE_SEQUENCE_FILL;
    shape.stroke = ACTIVE_SEQUENCE_STROKE;
    shape.strokeWidth = 1.5;
  };

  const applyMultiSelection = (component: any): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return;

    const selectedSources = ensureSourceSet(component);
    resetVisuals(component);

    const outgoing = buildLogicalOutgoing(component);
    const validSources = [...selectedSources].filter((key) => diagram.findNodeForKey(key));
    component.__eventTreeSelectedBranchKeys = new Set(validSources);

    if (!validSources.length) {
      component.__eventTreeSelectedConsequenceKeys = new Set<string>();
      diagram.requestUpdate();
      return;
    }

    const reachableUnion = new Set<string>();
    validSources.forEach((sourceKey) => {
      collectReachable(outgoing, sourceKey).forEach((key) => reachableUnion.add(key));
    });

    const sequenceKeys = new Set(
      (component.model?.nodes ?? [])
        .filter((node: any) => node.category === 'SEQUENCE')
        .map((node: any) => String(node.key))
    );
    const selectedConsequences = new Set(
      [...reachableUnion].filter((key) => sequenceKeys.has(key))
    );
    component.__eventTreeSelectedConsequenceKeys = selectedConsequences;

    if (hasCenteredRoutes(diagram)) {
      diagram.links.each((link: go.Link) => {
        const data = link.data as any;
        if (!data?.[CENTER_ROUTE]) return;
        const fromKey = String((link.fromNode?.data as any)?.key ?? data?.from ?? '');
        const toKey = String((link.toNode?.data as any)?.key ?? data?.to ?? '');
        const owner = centeredAnchorOwner(fromKey) ?? centeredAnchorOwner(toKey) ?? fromKey;
        if (reachableUnion.has(owner)) setLinkActive(link);
      });
    } else {
      validSources.forEach((sourceKey) => {
        const source = diagram.findNodeForKey(sourceKey);
        if (!source) return;
        const visited = new Set<go.Node>([source]);
        const queue: go.Node[] = [source];
        while (queue.length) {
          const current = queue.shift()!;
          current.findLinksOutOf().each((link: go.Link) => {
            setLinkActive(link);
            const target = link.toNode;
            if (!target || visited.has(target)) return;
            visited.add(target);
            queue.push(target);
          });
        }
      });
    }

    diagram.nodes.each((node: go.Node) => {
      const data = node.data as any;
      const key = String(data?.key ?? '');
      if (data?.category === 'SEQUENCE' && selectedConsequences.has(key)) {
        setSequenceActive(component, node);
      }
      if ((data?.category === 'FE_POINT' || data?.category === 'BRANCH')
        && component.__eventTreeSelectedBranchKeys.has(key)) {
        const dot = node.findObject('DOT') as go.Shape | null;
        if (dot) {
          dot.fill = ACTIVE_LINK_STROKE;
          dot.stroke = ACTIVE_LINK_STROKE;
        }
      }
    });

    diagram.requestUpdate();
  };

  const scheduleApply = (component: any): void => {
    const epoch = Number(component.__eventTreeMultiBranchEpoch ?? 0) + 1;
    component.__eventTreeMultiBranchEpoch = epoch;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (component.__eventTreeMultiBranchEpoch !== epoch) return;
        applyMultiSelection(component);
      });
    });
  };

  const selectSource = (component: any, key: string, additive: boolean): void => {
    const selected = ensureSourceSet(component);
    if (additive) {
      if (selected.has(key)) selected.delete(key);
      else selected.add(key);
    } else {
      selected.clear();
      selected.add(key);
    }

    if (selected.size) {
      const activeKey = selected.has(key) ? key : [...selected][selected.size - 1];
      component.__eventTreePreserveMultiSelection = true;
      try {
        originalSelectBranchSource.call(component, activeKey);
      } finally {
        component.__eventTreePreserveMultiSelection = false;
      }
    } else {
      component.selectedBranchKey?.set?.(null);
      component.selectedBranchCount?.set?.(0);
    }
    scheduleApply(component);
  };

  const selectedConsequenceKeys = (component: any, fallbackKey?: string): Set<string> => {
    const selected = component.__eventTreeSelectedConsequenceKeys as Set<string> | undefined;
    if (selected?.size) return new Set(selected);
    return fallbackKey ? new Set([fallbackKey]) : new Set<string>();
  };

  const applyTagToConsequences = (component: any, fallbackKey?: string): boolean => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return false;
    const keys = selectedConsequenceKeys(component, fallbackKey);
    if (!keys.size) return false;

    component.__eventTreeTagColors ??= new Map<string, string>();
    const tagMap = component.__eventTreeTagColors as Map<string, string>;
    const color = String(component.__eventTreeActiveTagColor ?? '#fff200');

    keys.forEach((key) => {
      tagMap.set(key, color);
      const node = diagram.findNodeForKey(key);
      if (!node) return;
      const data = node.data as any;
      data.tagColor = color;
      const shape = node.findObject('SEQUENCE_ROW_BG') as go.Shape | null;
      if (shape) {
        shape.fill = color;
        shape.stroke = ACTIVE_SEQUENCE_STROKE;
        shape.strokeWidth = 1.5;
      }
    });
    diagram.requestUpdate();
    return true;
  };

  const clearTagsFromConsequences = (component: any, fallbackKey?: string): boolean => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return false;
    const keys = selectedConsequenceKeys(component, fallbackKey);
    if (!keys.size) return false;
    const tagMap = component.__eventTreeTagColors as Map<string, string> | undefined;

    keys.forEach((key) => {
      tagMap?.delete(key);
      const node = diagram.findNodeForKey(key);
      if (node) (node.data as any).tagColor = null;
    });
    applyMultiSelection(component);
    return true;
  };

  const removeTagMenu = (component: any): void => {
    (component.__eventTreeMultiTagMenu as HTMLElement | undefined)?.remove();
    component.__eventTreeMultiTagMenu = null;
  };

  const showSequenceTagMenu = (component: any, sequenceKey: string, event: MouseEvent): void => {
    removeTagMenu(component);

    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    Object.assign(menu.style, {
      position: 'fixed',
      left: `${event.clientX}px`,
      top: `${event.clientY}px`,
      zIndex: '100001',
      minWidth: '230px',
      padding: '4px 0',
      background: '#ffffff',
      border: '1px solid #cbd5e1',
      borderRadius: '4px',
      boxShadow: '0 8px 24px rgba(15,23,42,.18)',
      font: '12px Arial, sans-serif',
      color: '#111827'
    });

    const addItem = (label: string, action: () => void): void => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      Object.assign(button.style, {
        display: 'block',
        width: '100%',
        padding: '7px 12px',
        border: '0',
        background: 'transparent',
        textAlign: 'left',
        font: 'inherit',
        color: '#111827',
        cursor: 'pointer'
      });
      button.addEventListener('mouseenter', () => { button.style.background = '#eef4fb'; });
      button.addEventListener('mouseleave', () => { button.style.background = 'transparent'; });
      button.addEventListener('click', (clickEvent) => {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
        removeTagMenu(component);
        action();
      });
      menu.appendChild(button);
    };

    const count = selectedConsequenceKeys(component, sequenceKey).size;
    addItem(`Tagger ${count} conséquence${count > 1 ? 's' : ''} (Alt+T)`, () => {
      applyTagToConsequences(component, sequenceKey);
    });
    addItem('Retirer le tag', () => {
      clearTagsFromConsequences(component, sequenceKey);
    });

    document.body.appendChild(menu);
    component.__eventTreeMultiTagMenu = menu;

    requestAnimationFrame(() => {
      const bounds = menu.getBoundingClientRect();
      if (bounds.right > window.innerWidth - 4) {
        menu.style.left = `${Math.max(4, window.innerWidth - bounds.width - 4)}px`;
      }
      if (bounds.bottom > window.innerHeight - 4) {
        menu.style.top = `${Math.max(4, window.innerHeight - bounds.height - 4)}px`;
      }
    });
  };

  prototype.selectBranchSource = function(key: string): void {
    if (!this.__eventTreePreserveMultiSelection) {
      const selected = ensureSourceSet(this);
      selected.clear();
      selected.add(key);
    }
    originalSelectBranchSource.call(this, key);
    scheduleApply(this);
  };

  prototype.installTemplates = function(metrics: unknown): void {
    originalInstallTemplates.call(this, metrics);
    const diagram = this.diagram as go.Diagram | undefined;
    if (!diagram) return;

    const installClick = (category: string): void => {
      const template = diagram.nodeTemplateMap.get(category) as go.Node | null;
      if (!template) return;
      template.selectionAdorned = false;
      template.cursor = 'pointer';
      template.click = (event: go.InputEvent, object: go.GraphObject): void => {
        const part = object.part as go.Node | null;
        const key = String((part?.data as any)?.key ?? '');
        if (!part || !key) return;
        const additive = Boolean((event as any).control || (event as any).meta);
        selectSource(this, key, additive);
      };
    };

    installClick('FE_POINT');
    installClick('BRANCH');
  };

  prototype.applyModel = function(metrics: unknown): void {
    originalApplyModel.call(this, metrics);
    scheduleApply(this);
  };

  prototype.ngAfterViewInit = function(): void {
    originalAfterViewInit.call(this);
    this.__eventTreeSelectedBranchKeys ??= new Set<string>();
    this.__eventTreeSelectedConsequenceKeys ??= new Set<string>();
    this.__eventTreeApplyTagToSelectedConsequences = () => applyTagToConsequences(this);

    const keyHandler = (event: KeyboardEvent): void => {
      if (!event.altKey || event.key.toLowerCase() !== 't') return;
      if (!applyTagToConsequences(this)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    this.__eventTreeMultiTagKeyHandler = keyHandler;
    window.addEventListener('keydown', keyHandler, true);

    const div = this.diagramDiv?.nativeElement as HTMLDivElement | undefined;
    if (div) {
      const contextHandler = (event: MouseEvent): void => {
        const diagram = this.diagram as go.Diagram | undefined;
        if (!diagram) return;
        const rect = div.getBoundingClientRect();
        const docPoint = diagram.transformViewToDoc(new go.Point(event.clientX - rect.left, event.clientY - rect.top));
        const part = diagram.findPartAt(docPoint, true) as go.Part | null;
        const node = part instanceof go.Node ? part : null;
        const data = node?.data as any;
        if (!node || data?.category !== 'SEQUENCE') return;

        event.preventDefault();
        event.stopPropagation();
        showSequenceTagMenu(this, String(data.key), event);
      };
      this.__eventTreeMultiTagContextHandler = contextHandler;
      div.addEventListener('contextmenu', contextHandler, true);
    }

    const dismissHandler = (event: MouseEvent): void => {
      const menu = this.__eventTreeMultiTagMenu as HTMLElement | undefined;
      if (menu && !menu.contains(event.target as Node)) removeTagMenu(this);
    };
    this.__eventTreeMultiTagDismissHandler = dismissHandler;
    document.addEventListener('mousedown', dismissHandler, true);
  };

  prototype.ngOnDestroy = function(): void {
    const div = this.diagramDiv?.nativeElement as HTMLDivElement | undefined;
    if (div && this.__eventTreeMultiTagContextHandler) {
      div.removeEventListener('contextmenu', this.__eventTreeMultiTagContextHandler, true);
    }
    if (this.__eventTreeMultiTagKeyHandler) {
      window.removeEventListener('keydown', this.__eventTreeMultiTagKeyHandler, true);
    }
    if (this.__eventTreeMultiTagDismissHandler) {
      document.removeEventListener('mousedown', this.__eventTreeMultiTagDismissHandler, true);
    }
    removeTagMenu(this);
    originalOnDestroy.call(this);
  };
}
