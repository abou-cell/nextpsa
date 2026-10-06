import * as go from 'gojs';
import { EventTreeEditorComponent } from './event-tree-editor.component';

const NORMAL_LINK = '#1f2937';
const ACTIVE_LINK = '#0f5bd8';
const ACTIVE_FILL = '#e8f1ff';
const ROW_STROKE = '#2563eb';
const NORMAL_STROKE = '#cbd5e1';
const BASELINE_START = '__BASELINE_START__';
const BASELINE_END = '__BASELINE_END__';
const CENTER_ROUTE = '__etCenteredRoute';
const CENTER_ANCHOR_PREFIX = '__ETC-';
const ACTION_CATEGORIES = new Set(['START_POINT', 'FE_POINT', 'BRANCH']);

/**
 * Final authority for ET selection + tagging.
 *
 * The older patches evolved independently and could leave three different
 * selection states out of sync (native GoJS selection, branch selection and
 * result-row selection). This controller keeps one explicit selection domain at
 * a time and derives every visual/tag target from it.
 */
export function installEventTreeSelectionTaggingControllerPatch(): void {
  const prototype = EventTreeEditorComponent.prototype as any;
  if (prototype.__eventTreeSelectionTaggingControllerInstalled) return;
  prototype.__eventTreeSelectionTaggingControllerInstalled = true;

  const originalInstallTemplates = prototype.installTemplates;
  const originalApplyModel = prototype.applyModel;
  const originalAfterViewInit = prototype.ngAfterViewInit;
  const originalOnDestroy = prototype.ngOnDestroy;

  const branchSet = (component: any): Set<string> => {
    component.__eventTreeSelectedBranchKeys ??= new Set<string>();
    return component.__eventTreeSelectedBranchKeys as Set<string>;
  };

  const rowSet = (component: any): Set<string> => {
    component.__eventTreeSelectedResultRowKeys ??= new Set<string>();
    return component.__eventTreeSelectedResultRowKeys as Set<string>;
  };

  const tagStore = (component: any): Map<string, string> => {
    component.__eventTreeTagColors ??= new Map<string, string>();
    return component.__eventTreeTagColors as Map<string, string>;
  };

  const clearNativeSelection = (component: any): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram || diagram.selection.count === 0) return;
    diagram.clearSelection();
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
      .map((node: any) => ({ key: String(node.key), no: Number(node.sequenceNo ?? 0) }));
    const mainSequence = sequences.some((s: any) => s.key === 'S1')
      ? 'S1'
      : [...sequences].sort((a: any, b: any) => a.no - b.no)[0]?.key ?? '';

    const feCount = Number(component.model?.functionEvents?.length ?? 0);
    if (feCount > 0) {
      add(BASELINE_START, 'FEPOINT-1');
      for (let i = 1; i < feCount; i += 1) add(`FEPOINT-${i}`, `FEPOINT-${i + 1}`);
      add(`FEPOINT-${feCount}`, BASELINE_END);
    } else {
      add(BASELINE_START, BASELINE_END);
    }
    if (mainSequence) add(BASELINE_END, mainSequence);

    (component.model?.links ?? []).forEach((link: any) => {
      add(String(link.from ?? ''), String(link.to ?? ''));
    });
    return outgoing;
  };

  const collectReachable = (outgoing: Map<string, string[]>, source: string): Set<string> => {
    const result = new Set<string>();
    const queue = [source];
    while (queue.length) {
      const key = queue.shift()!;
      if (result.has(key)) continue;
      result.add(key);
      (outgoing.get(key) ?? []).forEach((next) => {
        if (!result.has(next)) queue.push(next);
      });
    }
    return result;
  };

  const consequenceKeys = (component: any): Set<string> => {
    const sources = branchSet(component);
    if (!sources.size) {
      component.__eventTreeSelectedConsequenceKeys = new Set<string>();
      return new Set<string>();
    }

    const outgoing = buildLogicalOutgoing(component);
    const reachable = new Set<string>();
    sources.forEach((source) => collectReachable(outgoing, source).forEach((key) => reachable.add(key)));
    const sequences = new Set(
      (component.model?.nodes ?? [])
        .filter((node: any) => node.category === 'SEQUENCE')
        .map((node: any) => String(node.key))
    );
    const consequences = new Set([...reachable].filter((key) => sequences.has(key)));
    component.__eventTreeSelectedConsequenceKeys = consequences;
    return consequences;
  };

  const countDirectBranches = (component: any, key: string | null): number => {
    if (!key) return 0;
    return (component.model?.links ?? []).filter(
      (link: any) => String(link.from) === key && /^Branch\s\d+/.test(String(link.label ?? ''))
    ).length;
  };

  const syncToolbar = (component: any, preferred?: string): void => {
    const sources = branchSet(component);
    const active = preferred && sources.has(preferred)
      ? preferred
      : [...sources][sources.size - 1] ?? null;
    component.selectedBranchKey?.set?.(active);
    component.selectedBranchCount?.set?.(countDirectBranches(component, active));
  };

  const centeredAnchorOwner = (key: string): string | null => {
    if (!key.startsWith(CENTER_ANCHOR_PREFIX)) return null;
    const match = /^__ETC-(.+)-(\d+)$/.exec(key);
    if (!match) return null;
    try { return decodeURIComponent(match[1]); } catch { return match[1]; }
  };

  const hasCenteredRoutes = (diagram: go.Diagram): boolean => {
    let centered = false;
    diagram.links.each((link: go.Link) => {
      if ((link.data as any)?.[CENTER_ROUTE]) centered = true;
    });
    return centered;
  };

  const render = (component: any): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return;

    const sources = branchSet(component);
    const rows = rowSet(component);
    const consequences = consequenceKeys(component);
    const tags = tagStore(component);

    diagram.links.each((link: go.Link) => {
      if (!link.path) return;
      link.path.stroke = NORMAL_LINK;
      link.path.strokeWidth = 1;
    });

    if (sources.size) {
      if (hasCenteredRoutes(diagram)) {
        const outgoing = buildLogicalOutgoing(component);
        const reachable = new Set<string>();
        sources.forEach((source) => collectReachable(outgoing, source).forEach((key) => reachable.add(key)));
        diagram.links.each((link: go.Link) => {
          const data = link.data as any;
          if (!data?.[CENTER_ROUTE] || !link.path) return;
          const from = String((link.fromNode?.data as any)?.key ?? data?.from ?? '');
          const to = String((link.toNode?.data as any)?.key ?? data?.to ?? '');
          const owner = centeredAnchorOwner(from) ?? centeredAnchorOwner(to) ?? from;
          if (reachable.has(owner)) {
            link.path.stroke = ACTIVE_LINK;
            link.path.strokeWidth = 1.25;
          }
        });
      } else {
        sources.forEach((sourceKey) => {
          const source = diagram.findNodeForKey(sourceKey);
          if (!source) return;
          const visited = new Set<go.Node>([source]);
          const queue: go.Node[] = [source];
          while (queue.length) {
            const current = queue.shift()!;
            current.findLinksOutOf().each((link: go.Link) => {
              if (link.path) {
                link.path.stroke = ACTIVE_LINK;
                link.path.strokeWidth = 1.25;
              }
              const target = link.toNode;
              if (target && !visited.has(target)) {
                visited.add(target);
                queue.push(target);
              }
            });
          }
        });
      }
    }

    diagram.nodes.each((node: go.Node) => {
      const data = node.data as any;
      const key = String(data?.key ?? '');
      if (!key) return;

      if (data?.category === 'SEQUENCE') {
        const shape = node.findObject('SEQUENCE_ROW_BG') as go.Shape | null;
        if (!shape) return;
        const tagged = tags.get(key);
        const branchActive = consequences.has(key);
        const rowActive = rows.has(key);
        shape.fill = tagged ?? (branchActive || rowActive ? ACTIVE_FILL : '#ffffff');
        shape.stroke = branchActive ? ACTIVE_LINK : rowActive ? ROW_STROKE : NORMAL_STROKE;
        shape.strokeWidth = branchActive || rowActive ? 1.5 : 1;
        return;
      }

      if (ACTION_CATEGORIES.has(String(data?.category))) {
        const dot = node.findObject('DOT') as go.Shape | null;
        if (!dot) return;
        const active = sources.has(key);
        dot.fill = active ? ACTIVE_LINK : '#111111';
        dot.stroke = active ? ACTIVE_LINK : '#111111';
        dot.width = active ? 8 : 5;
        dot.height = active ? 8 : 5;
      }
    });

    diagram.requestUpdate();
  };

  const scheduleRender = (component: any): void => {
    const epoch = Number(component.__eventTreeSelectionControllerEpoch ?? 0) + 1;
    component.__eventTreeSelectionControllerEpoch = epoch;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (component.__eventTreeSelectionControllerEpoch !== epoch) return;
      render(component);
    }));
  };

  const selectBranch = (component: any, key: string, additive: boolean): void => {
    clearNativeSelection(component);
    rowSet(component).clear();
    const sources = branchSet(component);
    if (additive) {
      if (sources.has(key)) sources.delete(key);
      else sources.add(key);
    } else {
      sources.clear();
      sources.add(key);
    }
    consequenceKeys(component);
    syncToolbar(component, key);
    scheduleRender(component);
  };

  const selectRow = (component: any, key: string, additive: boolean): void => {
    clearNativeSelection(component);
    branchSet(component).clear();
    component.__eventTreeSelectedConsequenceKeys = new Set<string>();
    syncToolbar(component);
    const rows = rowSet(component);
    if (additive) {
      if (rows.has(key)) rows.delete(key);
      else rows.add(key);
    } else {
      rows.clear();
      rows.add(key);
    }
    scheduleRender(component);
  };

  const tagTargets = (component: any): Set<string> => {
    const consequences = consequenceKeys(component);
    if (branchSet(component).size && consequences.size) return consequences;
    return new Set(rowSet(component));
  };

  const toggleTags = (component: any): boolean => {
    const targets = tagTargets(component);
    if (!targets.size) return false;
    const store = tagStore(component);
    const allTagged = [...targets].every((key) => store.has(key));
    if (allTagged) {
      targets.forEach((key) => store.delete(key));
    } else {
      const color = String(component.__eventTreeActiveTagColor ?? '#fff200');
      targets.forEach((key) => store.set(key, color));
    }
    scheduleRender(component);
    return true;
  };

  const clearTags = (component: any): boolean => {
    const targets = tagTargets(component);
    if (!targets.size) return false;
    const store = tagStore(component);
    targets.forEach((key) => store.delete(key));
    scheduleRender(component);
    return true;
  };

  const addMenuItem = (menu: HTMLElement, label: string, action: () => void): void => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    Object.assign(button.style, {
      display: 'block', width: '100%', padding: '7px 12px', border: '0',
      background: 'transparent', textAlign: 'left', font: 'inherit',
      color: '#111827', cursor: 'pointer'
    });
    button.addEventListener('mouseenter', () => { button.style.background = '#eef4fb'; });
    button.addEventListener('mouseleave', () => { button.style.background = 'transparent'; });
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      menu.remove();
      action();
    });
    menu.appendChild(button);
  };

  const separator = (menu: HTMLElement): void => {
    const div = document.createElement('div');
    Object.assign(div.style, { height: '1px', margin: '4px 0', background: '#e5e7eb' });
    menu.appendChild(div);
  };

  const standaloneMenu = (component: any, event: MouseEvent): void => {
    (component.__eventTreeControllerMenu as HTMLElement | undefined)?.remove();
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    Object.assign(menu.style, {
      position: 'fixed', left: `${event.clientX}px`, top: `${event.clientY}px`,
      zIndex: '100003', minWidth: '210px', padding: '4px 0', background: '#fff',
      border: '1px solid #cbd5e1', borderRadius: '4px',
      boxShadow: '0 8px 24px rgba(15,23,42,.18)', font: '12px Arial, sans-serif'
    });
    const count = tagTargets(component).size;
    addMenuItem(menu, count > 1 ? `Tag / Untag (${count}) — Alt+T` : 'Tag / Untag — Alt+T', () => toggleTags(component));
    addMenuItem(menu, count > 1 ? `Retirer le tag (${count})` : 'Retirer le tag', () => clearTags(component));
    document.body.appendChild(menu);
    component.__eventTreeControllerMenu = menu;
  };

  const findLegacyBranchMenu = (): HTMLElement | null => {
    const menus = [...document.querySelectorAll<HTMLElement>('body [role="menu"]')];
    for (let i = menus.length - 1; i >= 0; i -= 1) {
      const labels = [...menus[i].querySelectorAll('button')].map((b) => b.textContent ?? '');
      if (labels.some((label) => label.includes('Ajouter une branche'))) return menus[i];
    }
    return null;
  };

  const augmentLegacyBranchMenu = (component: any): void => {
    const menu = findLegacyBranchMenu();
    if (!menu || menu.dataset['etControllerTagActions'] === 'true') return;
    menu.dataset['etControllerTagActions'] = 'true';
    separator(menu);
    const count = tagTargets(component).size;
    addMenuItem(menu, count > 1 ? `Tag / Untag (${count}) — Alt+T` : 'Tag / Untag — Alt+T', () => toggleTags(component));
    addMenuItem(menu, count > 1 ? `Retirer le tag (${count})` : 'Retirer le tag', () => clearTags(component));
  };

  prototype.installTemplates = function(metrics: unknown): void {
    originalInstallTemplates.call(this, metrics);
    const diagram = this.diagram as go.Diagram | undefined;
    if (!diagram) return;

    const installAction = (category: string): void => {
      const template = diagram.nodeTemplateMap.get(category) as go.Node | null;
      if (!template) return;
      template.selectable = false;
      template.selectionAdorned = false;
      template.cursor = 'pointer';
      const first = template.elt(0) as go.Shape | null;
      if (first && !first.name) first.name = 'DOT';
      template.click = (event: go.InputEvent, object: go.GraphObject): void => {
        const node = object.part as go.Node | null;
        const key = String((node?.data as any)?.key ?? '');
        if (!node || !key) return;
        selectBranch(this, key, Boolean((event as any).control || (event as any).meta));
      };
    };

    installAction('START_POINT');
    installAction('FE_POINT');
    installAction('BRANCH');

    const sequence = diagram.nodeTemplateMap.get('SEQUENCE') as go.Node | null;
    if (sequence) {
      sequence.selectable = false;
      sequence.selectionAdorned = false;
      sequence.cursor = 'pointer';
      const first = sequence.elt(0) as go.Shape | null;
      if (first) first.name = 'SEQUENCE_ROW_BG';
      sequence.selectionChanged = undefined;
      sequence.click = (event: go.InputEvent, object: go.GraphObject): void => {
        const node = object.part as go.Node | null;
        const key = String((node?.data as any)?.key ?? '');
        if (!node || !key) return;
        selectRow(this, key, Boolean((event as any).control || (event as any).meta));
      };
    }
  };

  prototype.applyModel = function(metrics: unknown): void {
    originalApplyModel.call(this, metrics);
    const diagram = this.diagram as go.Diagram | undefined;
    if (!diagram) return;

    const sources = branchSet(this);
    [...sources].forEach((key) => {
      if (!diagram.findNodeForKey(key)) sources.delete(key);
    });
    const rows = rowSet(this);
    [...rows].forEach((key) => {
      const node = diagram.findNodeForKey(key);
      if (!node || (node.data as any)?.category !== 'SEQUENCE') rows.delete(key);
    });
    consequenceKeys(this);
    syncToolbar(this);
    scheduleRender(this);
  };

  prototype.ngAfterViewInit = function(): void {
    originalAfterViewInit.call(this);
    branchSet(this);
    rowSet(this);

    const div = this.diagramDiv?.nativeElement as HTMLDivElement | undefined;

    // Remove every older selection/tag command listener. Their state remains
    // compatible, but only this controller is allowed to react to user input.
    const keyHandlers = [
      this.__eventTreeTagKeyHandler,
      this.__eventTreeMultiTagKeyHandler,
      this.__eventTreeAuthoritativeTagKeyHandler,
      this.__eventTreeTagToggleKeyHandler
    ];
    keyHandlers.forEach((handler) => {
      if (handler) window.removeEventListener('keydown', handler, true);
    });
    if (div && this.__eventTreeAuthoritativeContextHandler) {
      div.removeEventListener('contextmenu', this.__eventTreeAuthoritativeContextHandler, true);
    }
    if (div && this.__eventTreeMultiTagContextHandler) {
      div.removeEventListener('contextmenu', this.__eventTreeMultiTagContextHandler, true);
    }

    const keyHandler = (event: KeyboardEvent): void => {
      if (!event.altKey || event.key.toLowerCase() !== 't') return;
      if (!toggleTags(this)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    this.__eventTreeControllerKeyHandler = keyHandler;
    window.addEventListener('keydown', keyHandler, true);

    const legacyBranchContext = this.__eventTreeBranchContextListener as ((event: MouseEvent) => void) | undefined;
    const contextHandler = (event: MouseEvent): void => {
      const diagram = this.diagram as go.Diagram | undefined;
      if (!diagram || !div) return;
      const rect = div.getBoundingClientRect();
      const point = diagram.transformViewToDoc(new go.Point(event.clientX - rect.left, event.clientY - rect.top));
      const part = diagram.findPartAt(point, true) as go.Part | null;
      const node = part instanceof go.Node ? part : null;
      const data = node?.data as any;
      if (!node || !data?.category) return;

      if (data.category === 'SEQUENCE') {
        event.preventDefault();
        event.stopImmediatePropagation();
        const key = String(data.key);
        if (!rowSet(this).has(key)) selectRow(this, key, false);
        standaloneMenu(this, event);
        return;
      }

      if (ACTION_CATEGORIES.has(String(data.category))) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const key = String(data.key);
        if (!branchSet(this).has(key)) selectBranch(this, key, false);
        const snapshot = new Set(branchSet(this));
        legacyBranchContext?.(event);
        // Legacy menu code may select its node natively; restore the authoritative
        // source set immediately and again after its deferred callbacks.
        this.__eventTreeSelectedBranchKeys = new Set(snapshot);
        consequenceKeys(this);
        syncToolbar(this, key);
        clearNativeSelection(this);
        requestAnimationFrame(() => {
          this.__eventTreeSelectedBranchKeys = new Set(snapshot);
          consequenceKeys(this);
          syncToolbar(this, key);
          render(this);
          augmentLegacyBranchMenu(this);
        });
      }
    };
    this.__eventTreeControllerContextHandler = contextHandler;
    div?.addEventListener('contextmenu', contextHandler, true);

    const dismiss = (event: MouseEvent): void => {
      const menu = this.__eventTreeControllerMenu as HTMLElement | undefined;
      if (menu && !menu.contains(event.target as Node)) {
        menu.remove();
        this.__eventTreeControllerMenu = null;
      }
    };
    this.__eventTreeControllerDismissHandler = dismiss;
    document.addEventListener('mousedown', dismiss, true);

    this.__eventTreeApplyTagToSelectedConsequences = () => toggleTags(this);
    this.__eventTreeClearTagFromSelectedConsequences = () => clearTags(this);
    scheduleRender(this);
  };

  prototype.ngOnDestroy = function(): void {
    const div = this.diagramDiv?.nativeElement as HTMLDivElement | undefined;
    if (this.__eventTreeControllerKeyHandler) {
      window.removeEventListener('keydown', this.__eventTreeControllerKeyHandler, true);
    }
    if (div && this.__eventTreeControllerContextHandler) {
      div.removeEventListener('contextmenu', this.__eventTreeControllerContextHandler, true);
    }
    if (this.__eventTreeControllerDismissHandler) {
      document.removeEventListener('mousedown', this.__eventTreeControllerDismissHandler, true);
    }
    (this.__eventTreeControllerMenu as HTMLElement | undefined)?.remove();
    this.__eventTreeControllerMenu = null;
    originalOnDestroy.call(this);
  };
}
