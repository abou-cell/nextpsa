import * as go from 'gojs';
import { EventTreeEditorComponent } from './event-tree-editor.component';

const DEFAULT_TAG_COLOR = '#fff200';
const ACTIVE_SEQUENCE_FILL = '#e8f1ff';
const ACTIVE_SEQUENCE_STROKE = '#0f5bd8';
const SELECTED_SEQUENCE_STROKE = '#2563eb';
const NORMAL_SEQUENCE_STROKE = '#cbd5e1';

/**
 * Final authority for consequence-row tagging.
 *
 * This patch deliberately separates three states that used to be mixed together:
 *   1) row selection (temporary GoJS state),
 *   2) branch/consequence selection (temporary ET navigation state),
 *   3) tags (persistent user annotation state).
 *
 * A tag is now changed ONLY by an explicit command: Alt+T, "Tag" or
 * "Retirer le tag" from a context menu. Selecting/deselecting rows or branches
 * never mutates the tag store.
 */
export function installEventTreeTaggingConsistencyPatch(): void {
  const prototype = EventTreeEditorComponent.prototype as any;
  if (prototype.__eventTreeTaggingConsistencyPatchInstalled) return;
  prototype.__eventTreeTaggingConsistencyPatchInstalled = true;

  const originalInstallTemplates = prototype.installTemplates;
  const originalApplyModel = prototype.applyModel;
  const originalAfterViewInit = prototype.ngAfterViewInit;
  const originalOnDestroy = prototype.ngOnDestroy;

  const treeId = (component: any): string => String(component.model?.id ?? '__default__');

  const ensureTagStore = (component: any): Map<string, string> => {
    component.__eventTreeTagColorsByTree ??= new Map<string, Map<string, string>>();
    const byTree = component.__eventTreeTagColorsByTree as Map<string, Map<string, string>>;
    const id = treeId(component);
    let store = byTree.get(id);
    if (!store) {
      store = new Map<string, string>();
      byTree.set(id, store);
    }

    // Keep compatibility with the existing palette/selection patches, but make
    // this tree-specific store the single source of truth.
    component.__eventTreeTagColors = store;
    component.__eventTreeActiveTagColor ??= DEFAULT_TAG_COLOR;
    return store;
  };

  const selectedBranchConsequences = (component: any): Set<string> => {
    const branchKeys = component.__eventTreeSelectedBranchKeys as Set<string> | undefined;
    const consequences = component.__eventTreeSelectedConsequenceKeys as Set<string> | undefined;
    if (!branchKeys?.size || !consequences?.size) return new Set<string>();
    return new Set(consequences);
  };

  const selectedResultRows = (component: any): Set<string> => {
    const result = new Set<string>();
    const diagram = component.diagram as go.Diagram | undefined;
    diagram?.selection.each((part: go.Part) => {
      if (!(part instanceof go.Node)) return;
      const data = part.data as any;
      if (data?.category === 'SEQUENCE' && data?.key) result.add(String(data.key));
    });
    return result;
  };

  const isBranchConsequence = (component: any, key: string): boolean => {
    const set = component.__eventTreeSelectedConsequenceKeys as Set<string> | undefined;
    return Boolean(set?.has(key));
  };

  const renderSequence = (component: any, node: go.Node): void => {
    const data = node.data as any;
    if (data?.category !== 'SEQUENCE') return;
    const key = String(data.key ?? '');
    const shape = node.findObject('SEQUENCE_ROW_BG') as go.Shape | null;
    if (!shape || !key) return;

    const tagColor = ensureTagStore(component).get(key);
    const branchActive = isBranchConsequence(component, key);
    const rowSelected = node.isSelected;

    // Fill precedence is intentional: a durable tag is never hidden or destroyed
    // by temporary selection. Selection is represented by the border when tagged.
    shape.fill = tagColor ?? (branchActive || rowSelected ? ACTIVE_SEQUENCE_FILL : '#ffffff');
    shape.stroke = branchActive
      ? ACTIVE_SEQUENCE_STROKE
      : rowSelected
        ? SELECTED_SEQUENCE_STROKE
        : NORMAL_SEQUENCE_STROKE;
    shape.strokeWidth = branchActive || rowSelected ? 1.5 : 1;
  };

  const renderAllSequences = (component: any): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return;
    ensureTagStore(component);
    diagram.nodes.each((node: go.Node) => renderSequence(component, node));
    diagram.requestUpdate();
  };

  const scheduleRender = (component: any): void => {
    const epoch = Number(component.__eventTreeTaggingRenderEpoch ?? 0) + 1;
    component.__eventTreeTaggingRenderEpoch = epoch;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (component.__eventTreeTaggingRenderEpoch !== epoch) return;
        renderAllSequences(component);
      });
    });
  };

  const resolveExplicitTagTargets = (
    component: any,
    fallbackSequenceKey?: string,
    allowSelectedRows = false
  ): Set<string> => {
    const branchConsequences = selectedBranchConsequences(component);
    if (branchConsequences.size) return branchConsequences;

    if (allowSelectedRows) {
      const rows = selectedResultRows(component);
      if (rows.size) return rows;
    }

    return fallbackSequenceKey ? new Set([fallbackSequenceKey]) : new Set<string>();
  };

  const setTag = (
    component: any,
    fallbackSequenceKey?: string,
    allowSelectedRows = false
  ): boolean => {
    const targets = resolveExplicitTagTargets(component, fallbackSequenceKey, allowSelectedRows);
    if (!targets.size) return false;

    const store = ensureTagStore(component);
    const color = String(component.__eventTreeActiveTagColor ?? DEFAULT_TAG_COLOR);
    targets.forEach((key) => store.set(key, color));
    scheduleRender(component);
    return true;
  };

  const clearTag = (
    component: any,
    fallbackSequenceKey?: string,
    allowSelectedRows = false
  ): boolean => {
    const targets = resolveExplicitTagTargets(component, fallbackSequenceKey, allowSelectedRows);
    if (!targets.size) return false;

    const store = ensureTagStore(component);
    targets.forEach((key) => store.delete(key));
    scheduleRender(component);
    return true;
  };

  const appendMenuItem = (
    menu: HTMLElement,
    label: string,
    action: () => void
  ): void => {
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
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      menu.remove();
      action();
    });
    menu.appendChild(button);
  };

  const appendSeparator = (menu: HTMLElement): void => {
    const separator = document.createElement('div');
    Object.assign(separator.style, {
      height: '1px',
      margin: '4px 0',
      background: '#e5e7eb'
    });
    menu.appendChild(separator);
  };

  const makeStandaloneTagMenu = (
    component: any,
    sequenceKey: string,
    event: MouseEvent
  ): HTMLElement => {
    const oldMenu = component.__eventTreeAuthoritativeTagMenu as HTMLElement | undefined;
    oldMenu?.remove();

    const targets = resolveExplicitTagTargets(component, sequenceKey, false);
    const count = Math.max(1, targets.size);
    const menu = document.createElement('div');
    menu.dataset['etAuthoritativeTagMenu'] = 'true';
    menu.setAttribute('role', 'menu');
    Object.assign(menu.style, {
      position: 'fixed',
      left: `${event.clientX}px`,
      top: `${event.clientY}px`,
      zIndex: '100002',
      minWidth: '220px',
      padding: '4px 0',
      background: '#ffffff',
      border: '1px solid #cbd5e1',
      borderRadius: '4px',
      boxShadow: '0 8px 24px rgba(15,23,42,.18)',
      font: '12px Arial, sans-serif',
      color: '#111827'
    });

    appendMenuItem(menu, count > 1 ? `Tag (${count} conséquences) — Alt+T` : 'Tag — Alt+T', () => {
      setTag(component, sequenceKey, false);
    });
    appendMenuItem(menu, count > 1 ? `Retirer le tag (${count})` : 'Retirer le tag', () => {
      clearTag(component, sequenceKey, false);
    });

    document.body.appendChild(menu);
    component.__eventTreeAuthoritativeTagMenu = menu;
    return menu;
  };

  const findBranchContextMenu = (): HTMLElement | null => {
    const menus = [...document.querySelectorAll<HTMLElement>('body [role="menu"]')];
    for (let index = menus.length - 1; index >= 0; index -= 1) {
      const menu = menus[index];
      const labels = [...menu.querySelectorAll('button')].map((button) => button.textContent ?? '');
      if (labels.some((label) => label.includes('Ajouter une branche'))) return menu;
    }
    return null;
  };

  const augmentBranchContextMenu = (component: any): void => {
    const menu = findBranchContextMenu();
    if (!menu || menu.dataset['etTagActionsAdded'] === 'true') return;
    menu.dataset['etTagActionsAdded'] = 'true';

    const count = selectedBranchConsequences(component).size;
    appendSeparator(menu);
    appendMenuItem(menu, count > 1 ? `Tag (${count} conséquences) — Alt+T` : 'Tag — Alt+T', () => {
      setTag(component, undefined, false);
    });
    appendMenuItem(menu, count > 1 ? `Retirer le tag (${count})` : 'Retirer le tag', () => {
      clearTag(component, undefined, false);
    });
  };

  prototype.installTemplates = function(metrics: unknown): void {
    originalInstallTemplates.call(this, metrics);
    const diagram = this.diagram as go.Diagram | undefined;
    if (!diagram) return;

    // Last-installed handler wins. It never changes the tag store.
    const sequenceTemplate = diagram.nodeTemplateMap.get('SEQUENCE') as go.Node | null;
    if (sequenceTemplate) {
      sequenceTemplate.selectionChanged = (part: go.Part): void => {
        renderSequence(this, part as go.Node);
      };
    }
  };

  prototype.applyModel = function(metrics: unknown): void {
    originalApplyModel.call(this, metrics);
    ensureTagStore(this);

    // Remove stale tag keys when a sequence has been deleted, while keeping tags
    // for other Event Trees isolated in their own stores.
    const valid = new Set(
      (this.model?.nodes ?? [])
        .filter((node: any) => node.category === 'SEQUENCE')
        .map((node: any) => String(node.key))
    );
    const store = ensureTagStore(this);
    [...store.keys()].forEach((key) => {
      if (!valid.has(key)) store.delete(key);
    });
    scheduleRender(this);
  };

  prototype.ngAfterViewInit = function(): void {
    originalAfterViewInit.call(this);
    ensureTagStore(this);

    // Disable the two legacy tagging paths. They both listened to Alt+T and could
    // fire for the same keystroke, which was the main source of inconsistent tags.
    if (this.__eventTreeTagKeyHandler) {
      window.removeEventListener('keydown', this.__eventTreeTagKeyHandler, true);
    }
    if (this.__eventTreeMultiTagKeyHandler) {
      window.removeEventListener('keydown', this.__eventTreeMultiTagKeyHandler, true);
    }

    // Replace the old sequence-only context handler with one authoritative handler.
    const div = this.diagramDiv?.nativeElement as HTMLDivElement | undefined;
    if (div && this.__eventTreeMultiTagContextHandler) {
      div.removeEventListener('contextmenu', this.__eventTreeMultiTagContextHandler, true);
    }

    const legacyBranchContext = this.__eventTreeBranchContextListener as ((event: MouseEvent) => void) | undefined;
    if (div && legacyBranchContext) {
      div.removeEventListener('contextmenu', legacyBranchContext, true);
    }

    const keyHandler = (event: KeyboardEvent): void => {
      if (!event.altKey || event.key.toLowerCase() !== 't') return;

      // Alt+T is explicit and deterministic: selected branch consequences first;
      // otherwise explicitly selected result rows. Merely selecting a row never tags it.
      if (!setTag(this, undefined, true)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    this.__eventTreeAuthoritativeTagKeyHandler = keyHandler;
    window.addEventListener('keydown', keyHandler, true);

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
        makeStandaloneTagMenu(this, String(data.key), event);
        return;
      }

      if (data.category === 'START_POINT' || data.category === 'FE_POINT' || data.category === 'BRANCH') {
        event.preventDefault();
        event.stopImmediatePropagation();

        // Preserve an existing Ctrl multi-selection while the legacy branch menu
        // selects its right-clicked node. If there is no multi-selection, legacy
        // behaviour naturally selects the clicked branch.
        const selectedBefore = new Set<string>(
          (this.__eventTreeSelectedBranchKeys as Set<string> | undefined) ?? []
        );
        this.__eventTreePreserveMultiSelection = selectedBefore.size > 1;
        try {
          legacyBranchContext?.(event);
        } finally {
          this.__eventTreePreserveMultiSelection = false;
        }

        if (selectedBefore.size > 1) {
          this.__eventTreeSelectedBranchKeys = selectedBefore;
          // Existing multi-selection patch will recompute the consequence union on
          // its scheduled pass. Delay menu augmentation by one frame to use it.
          requestAnimationFrame(() => {
            scheduleRender(this);
            augmentBranchContextMenu(this);
          });
        } else {
          requestAnimationFrame(() => augmentBranchContextMenu(this));
        }
      }
    };
    this.__eventTreeAuthoritativeContextHandler = contextHandler;
    div?.addEventListener('contextmenu', contextHandler, true);

    const selectionListener = (): void => scheduleRender(this);
    this.__eventTreeAuthoritativeSelectionListener = selectionListener;
    this.diagram?.addDiagramListener('ChangedSelection', selectionListener);

    const dismissHandler = (event: MouseEvent): void => {
      const menu = this.__eventTreeAuthoritativeTagMenu as HTMLElement | undefined;
      if (menu && !menu.contains(event.target as Node)) {
        menu.remove();
        this.__eventTreeAuthoritativeTagMenu = null;
      }
    };
    this.__eventTreeAuthoritativeTagDismissHandler = dismissHandler;
    document.addEventListener('mousedown', dismissHandler, true);

    // Expose explicit commands for the branch context menu and future toolbar use.
    this.__eventTreeApplyTagToSelectedConsequences = () => setTag(this, undefined, true);
    this.__eventTreeClearTagFromSelectedConsequences = () => clearTag(this, undefined, true);
    scheduleRender(this);
  };

  prototype.ngOnDestroy = function(): void {
    const div = this.diagramDiv?.nativeElement as HTMLDivElement | undefined;
    if (div && this.__eventTreeAuthoritativeContextHandler) {
      div.removeEventListener('contextmenu', this.__eventTreeAuthoritativeContextHandler, true);
    }
    if (this.__eventTreeAuthoritativeTagKeyHandler) {
      window.removeEventListener('keydown', this.__eventTreeAuthoritativeTagKeyHandler, true);
    }
    if (this.__eventTreeAuthoritativeTagDismissHandler) {
      document.removeEventListener('mousedown', this.__eventTreeAuthoritativeTagDismissHandler, true);
    }
    if (this.diagram && this.__eventTreeAuthoritativeSelectionListener) {
      this.diagram.removeDiagramListener('ChangedSelection', this.__eventTreeAuthoritativeSelectionListener);
    }
    (this.__eventTreeAuthoritativeTagMenu as HTMLElement | undefined)?.remove();
    this.__eventTreeAuthoritativeTagMenu = null;
    originalOnDestroy.call(this);
  };
}
