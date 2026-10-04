import * as go from 'gojs';
import { EventTreeEditorComponent } from './event-tree-editor.component';
import { EventTreePageComponent } from '../../features/event-tree/event-tree-page.component';
import { EventTreeRepository } from '../../features/event-tree/event-tree.repository';

type BranchClipboard = {
  sourceTreeId: string;
  sourceSequenceKey: string;
  frequency?: string;
  consequence?: string;
  resultCode?: string;
};

const MAIN_SEQUENCE_KEY = 'S1';
const BASELINE_START_KEY = '__BASELINE_START__';
const ACTION_NODE_CATEGORIES = new Set(['START_POINT', 'FE_POINT', 'BRANCH']);
const NORMAL_LINK_STROKE = '#1f2937';
const ACTIVE_LINK_STROKE = '#0f5bd8';
const NORMAL_LINK_WIDTH = 1;
const ACTIVE_LINK_WIDTH = 1.25;
const ACTIVE_SEQUENCE_FILL = '#e8f1ff';
const ACTIVE_SEQUENCE_STROKE = '#0f5bd8';

let branchClipboard: BranchClipboard | null = null;
let activeEventTreePage: any = null;
let activeDomMenu: HTMLDivElement | null = null;

export function installEventTreeBranchContextMenuPatch(): void {
  const pagePrototype = EventTreePageComponent.prototype as any;
  if (!pagePrototype.__eventTreeBranchContextPageCaptureInstalled) {
    pagePrototype.__eventTreeBranchContextPageCaptureInstalled = true;
    const originalTableMinWidth = pagePrototype.tableMinWidth;
    pagePrototype.tableMinWidth = function(): number {
      activeEventTreePage = this;
      return originalTableMinWidth.call(this);
    };
  }

  const normalizeSequences = (nodes: any[]): any[] => {
    const sequences = nodes.filter((node) => node.category === 'SEQUENCE');
    const children = new Map<string, any[]>();
    sequences.forEach((sequence) => {
      const parent = sequence.parentSequenceKey;
      if (!parent) return;
      const list = children.get(parent) ?? [];
      list.push(sequence);
      children.set(parent, list);
    });
    children.forEach((list) => list.sort((a, b) => {
      const columnDiff = (b.branchColumnIndex ?? 0) - (a.branchColumnIndex ?? 0);
      return columnDiff !== 0 ? columnDiff : (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0);
    }));

    const orderedKeys: string[] = [];
    const visit = (key: string): void => {
      orderedKeys.push(key);
      (children.get(key) ?? []).forEach((child) => visit(child.key));
    };
    sequences
      .filter((sequence) => !sequence.parentSequenceKey)
      .sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0))
      .forEach((root) => visit(root.key));

    const displayNo = new Map(orderedKeys.map((key, index) => [key, index + 1]));
    return nodes.map((node) => {
      if (node.category !== 'SEQUENCE') return node;
      const sequenceNo = displayNo.get(node.key) ?? node.sequenceNo ?? 1;
      return { ...node, sequenceNo, label: `Sequence ${sequenceNo}` };
    });
  };

  // The left-most IE point is a real branch source too. The original repository
  // accepted FE points and existing branch points only, so extend it for column 0.
  const repositoryPrototype = EventTreeRepository.prototype as any;
  if (!repositoryPrototype.__eventTreeIeBranchSourceInstalled) {
    repositoryPrototype.__eventTreeIeBranchSourceInstalled = true;
    const originalAddBranch = repositoryPrototype.addBranch;

    repositoryPrototype.addBranch = function(treeId: string, fromKey: string): void {
      if (fromKey !== BASELINE_START_KEY) {
        originalAddBranch.call(this, treeId, fromKey);
        return;
      }

      const currentTree = this.eventTrees().find((tree: any) => tree.id === treeId);
      if (!currentTree) return;

      const directBranchCount = currentTree.links.filter(
        (link: any) => link.from === fromKey && /^Branch\s\d+/.test(link.label ?? '')
      ).length;
      if (directBranchCount >= 10) return;

      (this as any).saveHistory?.();
      this.eventTrees.update((trees: any[]) => trees.map((tree: any) => {
        if (tree.id !== treeId) return tree;

        const sequenceCount = tree.nodes.filter((node: any) => node.category === 'SEQUENCE').length;
        const sequenceNo = sequenceCount + 1;
        const sequenceKey = `S${sequenceNo}`;
        const branchGroup = `B${sequenceNo}`;
        const branchNodes: any[] = [];
        const branchLinks: any[] = [];
        let previousKey = fromKey;

        for (let column = 1; column <= tree.functionEvents.length; column += 1) {
          const branchKey = `${branchGroup}-C${column}`;
          branchNodes.push({
            key: branchKey,
            category: 'BRANCH',
            label: `FE ${column} branch point`,
            columnIndex: column,
            originColumnIndex: 0,
            pathSequenceKey: sequenceKey,
            level: 1
          });
          branchLinks.push({
            from: previousKey,
            to: branchKey,
            label: previousKey === fromKey ? `Branch ${directBranchCount + 1}` : 'Continue',
            outcome: 'OTHER' as const
          });
          previousKey = branchKey;
        }

        branchLinks.push({
          from: previousKey,
          to: sequenceKey,
          label: previousKey === fromKey ? `Branch ${directBranchCount + 1}` : 'Result',
          outcome: 'OTHER' as const
        });

        const nodes = normalizeSequences([
          ...tree.nodes,
          ...branchNodes,
          {
            key: sequenceKey,
            category: 'SEQUENCE',
            label: `Sequence ${sequenceNo}`,
            sequenceNo,
            parentSequenceKey: MAIN_SEQUENCE_KEY,
            branchColumnIndex: 0,
            frequency: '',
            consequence: '',
            resultCode: ''
          }
        ]);

        return { ...tree, nodes, links: [...tree.links, ...branchLinks] };
      }));
      (this as any).updateHistorySignals?.();
    };
  }

  const prototype = EventTreeEditorComponent.prototype as any;
  if (prototype.__eventTreeBranchContextMenuInstalled) return;
  prototype.__eventTreeBranchContextMenuInstalled = true;

  const originalCreateDiagram = prototype.createDiagram;
  const originalDestroy = prototype.ngOnDestroy;
  const originalSelectBranchSource = prototype.selectBranchSource;

  const getNodeSequenceKey = (component: any, nodeKey: string): string | null => {
    if (nodeKey === BASELINE_START_KEY || /^FEPOINT-\d+$/.test(nodeKey)) return MAIN_SEQUENCE_KEY;
    const branch = component.model?.nodes?.find(
      (node: any) => node.key === nodeKey && node.category === 'BRANCH'
    );
    return branch?.pathSequenceKey ?? null;
  };

  const collectSequenceSubtree = (component: any, rootSequenceKey: string): Set<string> => {
    const result = new Set<string>([rootSequenceKey]);
    const sequences = component.model?.nodes?.filter((node: any) => node.category === 'SEQUENCE') ?? [];
    let changed = true;
    while (changed) {
      changed = false;
      sequences.forEach((sequence: any) => {
        if (sequence.parentSequenceKey && result.has(sequence.parentSequenceKey) && !result.has(sequence.key)) {
          result.add(sequence.key);
          changed = true;
        }
      });
    }
    return result;
  };

  const resetBranchHighlight = (component: any): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return;

    diagram.links.each((link: go.Link) => {
      const shape = link.path;
      if (!shape) return;
      shape.stroke = NORMAL_LINK_STROKE;
      shape.strokeWidth = NORMAL_LINK_WIDTH;
    });

    diagram.nodes.each((node: go.Node) => {
      const data = node.data as any;
      if (data?.category !== 'SEQUENCE') return;
      const rowShape = node.findObject('SEQUENCE_ROW_BG') as go.Shape | null;
      if (!rowShape) return;
      if (!node.isSelected) {
        rowShape.fill = '#ffffff';
        rowShape.stroke = '#cbd5e1';
        rowShape.strokeWidth = 1;
      }
    });
  };

  const applyBranchHighlight = (component: any, nodeKey: string): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    const rootSequenceKey = getNodeSequenceKey(component, nodeKey);
    if (!diagram || !rootSequenceKey) return;

    resetBranchHighlight(component);
    const sequenceKeys = collectSequenceSubtree(component, rootSequenceKey);
    const pathKeys = new Set<string>();

    // S1 is the main horizontal ET path from IE through every FE.
    if (sequenceKeys.has(MAIN_SEQUENCE_KEY)) {
      pathKeys.add(BASELINE_START_KEY);
      pathKeys.add('__BASELINE_END__');
      (component.model?.functionEvents ?? []).forEach((_event: any, index: number) => {
        pathKeys.add(`FEPOINT-${index + 1}`);
      });
    }

    (component.model?.nodes ?? []).forEach((node: any) => {
      if (node.category === 'BRANCH' && node.pathSequenceKey && sequenceKeys.has(node.pathSequenceKey)) {
        pathKeys.add(node.key);
      }
    });

    // The editor splits a Branch-N link into source→bend and bend→target.
    // Include the synthetic bend whenever it feeds one of the highlighted paths.
    const bendKeys = new Set<string>();
    diagram.nodes.each((node: go.Node) => {
      const data = node.data as any;
      if (data?.category !== 'ANCHOR' || !String(data.key ?? '').startsWith('__BEND-')) return;
      let belongs = false;
      node.findLinksOutOf().each((link: go.Link) => {
        const targetKey = (link.toNode?.data as any)?.key as string | undefined;
        if (targetKey && (pathKeys.has(targetKey) || sequenceKeys.has(targetKey))) belongs = true;
      });
      if (belongs) bendKeys.add(String(data.key));
    });

    diagram.links.each((link: go.Link) => {
      const fromKey = (link.fromNode?.data as any)?.key as string | undefined;
      const toKey = (link.toNode?.data as any)?.key as string | undefined;
      if (!fromKey || !toKey) return;

      const highlighted =
        (pathKeys.has(fromKey) && (pathKeys.has(toKey) || bendKeys.has(toKey) || sequenceKeys.has(toKey)))
        || (bendKeys.has(fromKey) && (pathKeys.has(toKey) || sequenceKeys.has(toKey)));

      if (!highlighted) return;
      const shape = link.path;
      if (!shape) return;
      shape.stroke = ACTIVE_LINK_STROKE;
      shape.strokeWidth = ACTIVE_LINK_WIDTH;
    });

    // Highlight every sequence row that belongs to the selected branch subtree,
    // not just the first result row.
    diagram.nodes.each((node: go.Node) => {
      const data = node.data as any;
      if (data?.category !== 'SEQUENCE' || !sequenceKeys.has(data.key)) return;
      const rowShape = node.findObject('SEQUENCE_ROW_BG') as go.Shape | null;
      if (rowShape) {
        rowShape.fill = ACTIVE_SEQUENCE_FILL;
        rowShape.stroke = ACTIVE_SEQUENCE_STROKE;
        rowShape.strokeWidth = 1.5;
      }
    });
  };

  prototype.selectBranchSource = function(key: string): void {
    originalSelectBranchSource.call(this, key);
    requestAnimationFrame(() => applyBranchHighlight(this, key));
  };

  const refresh = (component: any): void => {
    requestAnimationFrame(() => component.refreshLayout?.());
  };

  const copyBranch = (component: any, nodeKey: string): boolean => {
    const tree = component.model;
    const sequenceKey = getNodeSequenceKey(component, nodeKey);
    if (!tree || !sequenceKey) return false;
    const sequence = tree.nodes.find((node: any) => node.key === sequenceKey && node.category === 'SEQUENCE');
    if (!sequence) return false;

    branchClipboard = {
      sourceTreeId: tree.id,
      sourceSequenceKey: sequenceKey,
      frequency: sequence.frequency ?? '',
      consequence: sequence.consequence ?? '',
      resultCode: sequence.resultCode ?? ''
    };
    return true;
  };

  const cutBranch = (component: any, nodeKey: string): void => {
    const rootSequenceKey = getNodeSequenceKey(component, nodeKey);
    if (!rootSequenceKey || rootSequenceKey === MAIN_SEQUENCE_KEY) return;
    if (!copyBranch(component, nodeKey)) return;
    const repository = activeEventTreePage?.repository;
    const treeId = component.model?.id;
    if (!repository || !treeId) return;

    (repository as any).saveHistory?.();
    repository.eventTrees.update((trees: any[]) => trees.map((tree: any) => {
      if (tree.id !== treeId) return tree;

      const sequenceKeys = new Set<string>([rootSequenceKey]);
      let changed = true;
      while (changed) {
        changed = false;
        tree.nodes.forEach((node: any) => {
          if (node.category !== 'SEQUENCE' || !node.parentSequenceKey) return;
          if (sequenceKeys.has(node.parentSequenceKey) && !sequenceKeys.has(node.key)) {
            sequenceKeys.add(node.key);
            changed = true;
          }
        });
      }

      const removedNodeKeys = new Set<string>();
      tree.nodes.forEach((node: any) => {
        if ((node.category === 'SEQUENCE' && sequenceKeys.has(node.key))
          || (node.category === 'BRANCH' && node.pathSequenceKey && sequenceKeys.has(node.pathSequenceKey))) {
          removedNodeKeys.add(node.key);
        }
      });

      const nodes = normalizeSequences(tree.nodes.filter((node: any) => !removedNodeKeys.has(node.key)));
      const links = tree.links.filter((link: any) => !removedNodeKeys.has(link.from) && !removedNodeKeys.has(link.to));
      return { ...tree, nodes, links };
    }));
    (repository as any).updateHistorySignals?.();
    component.selectedBranchKey?.set?.(null);
    component.selectedBranchCount?.set?.(0);
    resetBranchHighlight(component);
    refresh(component);
  };

  const pasteBranch = (component: any, targetKey: string): void => {
    if (!branchClipboard) return;
    const repository = activeEventTreePage?.repository;
    const treeId = component.model?.id;
    if (!repository || !treeId) return;

    const beforeTree = repository.eventTrees().find((tree: any) => tree.id === treeId);
    if (!beforeTree) return;
    const beforeSequences = new Set(
      beforeTree.nodes.filter((node: any) => node.category === 'SEQUENCE').map((node: any) => node.key)
    );

    repository.addBranch(treeId, targetKey);

    repository.eventTrees.update((trees: any[]) => trees.map((tree: any) => {
      if (tree.id !== treeId) return tree;
      const created = tree.nodes.find(
        (node: any) => node.category === 'SEQUENCE' && !beforeSequences.has(node.key)
      );
      if (!created) return tree;
      return {
        ...tree,
        nodes: tree.nodes.map((node: any) => node.key === created.key
          ? {
              ...node,
              frequency: branchClipboard?.frequency ?? '',
              consequence: branchClipboard?.consequence ?? '',
              resultCode: branchClipboard?.resultCode ?? ''
            }
          : node)
      };
    }));
    refresh(component);
  };

  const selectWholeBranch = (component: any, nodeKey: string): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    const rootSequenceKey = getNodeSequenceKey(component, nodeKey);
    if (!diagram || !rootSequenceKey) return;

    const sequenceKeys = collectSequenceSubtree(component, rootSequenceKey);
    diagram.clearSelection();
    diagram.nodes.each((node: go.Node) => {
      const data = node.data as any;
      const belongsToMain = rootSequenceKey === MAIN_SEQUENCE_KEY
        && (data?.category === 'START_POINT' || data?.category === 'FE_POINT');
      const belongsToBranch = data?.category === 'BRANCH'
        && data.pathSequenceKey
        && sequenceKeys.has(data.pathSequenceKey);
      const belongsToSequence = data?.category === 'SEQUENCE' && sequenceKeys.has(data.key);
      if (belongsToMain || belongsToBranch || belongsToSequence) node.isSelected = true;
    });
    component.selectBranchSource?.(nodeKey);
    applyBranchHighlight(component, nodeKey);
  };

  const removeDomMenu = (): void => {
    activeDomMenu?.remove();
    activeDomMenu = null;
  };

  const isActionNode = (node: go.Node | null): node is go.Node =>
    Boolean(node && ACTION_NODE_CATEGORIES.has((node.data as any)?.category));

  const findActionNodeAtEvent = (component: any, event: MouseEvent): go.Node | null => {
    const diagram = component.diagram as go.Diagram | undefined;
    const div = component.diagramDiv?.nativeElement as HTMLDivElement | undefined;
    if (!diagram || !div) return null;

    const rect = div.getBoundingClientRect();
    const viewPoint = new go.Point(event.clientX - rect.left, event.clientY - rect.top);
    const docPoint = diagram.transformViewToDoc(viewPoint);
    const direct = diagram.findPartAt(docPoint, true) as go.Part | null;
    if (direct instanceof go.Node && isActionNode(direct)) return direct;

    let nearest: go.Node | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    diagram.nodes.each((node: go.Node) => {
      if (!isActionNode(node)) return;
      const center = node.actualBounds.center;
      const distance = Math.hypot(center.x - docPoint.x, center.y - docPoint.y);
      if (distance <= 20 && distance < nearestDistance) {
        nearest = node;
        nearestDistance = distance;
      }
    });
    return nearest;
  };

  const showDomMenu = (component: any, node: go.Node, event: MouseEvent): void => {
    removeDomMenu();

    const key = node.data?.key as string | undefined;
    if (!key) return;

    node.isSelected = true;
    component.selectBranchSource?.(key);
    applyBranchHighlight(component, key);

    const sequenceKey = getNodeSequenceKey(component, key);
    const canCut = Boolean(sequenceKey && sequenceKey !== MAIN_SEQUENCE_KEY);

    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    menu.style.position = 'fixed';
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    menu.style.zIndex = '100000';
    menu.style.minWidth = '190px';
    menu.style.padding = '4px 0';
    menu.style.background = '#ffffff';
    menu.style.border = '1px solid #cbd5e1';
    menu.style.borderRadius = '4px';
    menu.style.boxShadow = '0 8px 24px rgba(15,23,42,.18)';
    menu.style.font = '12px Arial, sans-serif';
    menu.style.color = '#111827';

    const addItem = (label: string, handler: () => void, enabled = true): void => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.disabled = !enabled;
      button.style.display = 'block';
      button.style.width = '100%';
      button.style.padding = '7px 12px';
      button.style.border = '0';
      button.style.background = 'transparent';
      button.style.textAlign = 'left';
      button.style.font = 'inherit';
      button.style.color = enabled ? '#111827' : '#94a3b8';
      button.style.cursor = enabled ? 'pointer' : 'default';
      if (enabled) {
        button.addEventListener('mouseenter', () => { button.style.background = '#eef4fb'; });
        button.addEventListener('mouseleave', () => { button.style.background = 'transparent'; });
        button.addEventListener('click', (clickEvent) => {
          clickEvent.preventDefault();
          clickEvent.stopPropagation();
          removeDomMenu();
          handler();
        });
      }
      menu.appendChild(button);
    };

    addItem('Ajouter une branche', () => {
      component.selectBranchSource?.(key);
      if ((component.selectedBranchCount?.() ?? 0) < 10) component.addBranch.emit(key);
    }, (component.selectedBranchCount?.() ?? 0) < 10);
    addItem('Sélectionner la branche', () => selectWholeBranch(component, key));

    const separator = document.createElement('div');
    separator.style.height = '1px';
    separator.style.margin = '4px 0';
    separator.style.background = '#e5e7eb';
    menu.appendChild(separator);

    addItem('Copier', () => { copyBranch(component, key); });
    addItem('Coller', () => pasteBranch(component, key), branchClipboard !== null);
    addItem('Couper', () => cutBranch(component, key), canCut);

    document.body.appendChild(menu);
    activeDomMenu = menu;

    requestAnimationFrame(() => {
      const bounds = menu.getBoundingClientRect();
      if (bounds.right > window.innerWidth - 4) menu.style.left = `${Math.max(4, window.innerWidth - bounds.width - 4)}px`;
      if (bounds.bottom > window.innerHeight - 4) menu.style.top = `${Math.max(4, window.innerHeight - bounds.height - 4)}px`;
    });
  };

  prototype.createDiagram = function(): void {
    originalCreateDiagram.call(this);
    const div = this.diagramDiv?.nativeElement as HTMLDivElement | undefined;
    const diagram = this.diagram as go.Diagram | undefined;
    if (!div || !diagram || this.__eventTreeBranchContextListener) return;

    const contextListener = (event: MouseEvent): void => {
      const actionNode = findActionNodeAtEvent(this, event);
      if (!actionNode) {
        removeDomMenu();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      showDomMenu(this, actionNode, event);
    };
    const dismissListener = (event: MouseEvent): void => {
      if (activeDomMenu && !activeDomMenu.contains(event.target as Node)) removeDomMenu();
    };

    const selectionListener = (): void => {
      requestAnimationFrame(() => {
        const key = this.selectedBranchKey?.() as string | null;
        if (key) applyBranchHighlight(this, key);
        else resetBranchHighlight(this);
      });
    };

    this.__eventTreeBranchContextListener = contextListener;
    this.__eventTreeBranchContextDismissListener = dismissListener;
    this.__eventTreeBranchSelectionListener = selectionListener;
    div.addEventListener('contextmenu', contextListener, true);
    document.addEventListener('mousedown', dismissListener, true);
    diagram.addDiagramListener('ChangedSelection', selectionListener);
  };

  prototype.ngOnDestroy = function(): void {
    const div = this.diagramDiv?.nativeElement as HTMLDivElement | undefined;
    const diagram = this.diagram as go.Diagram | undefined;
    if (div && this.__eventTreeBranchContextListener) {
      div.removeEventListener('contextmenu', this.__eventTreeBranchContextListener, true);
    }
    if (this.__eventTreeBranchContextDismissListener) {
      document.removeEventListener('mousedown', this.__eventTreeBranchContextDismissListener, true);
    }
    if (diagram && this.__eventTreeBranchSelectionListener) {
      diagram.removeDiagramListener('ChangedSelection', this.__eventTreeBranchSelectionListener);
    }
    removeDomMenu();
    originalDestroy.call(this);
  };
}
