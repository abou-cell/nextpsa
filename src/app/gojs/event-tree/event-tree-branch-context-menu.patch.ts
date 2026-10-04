import * as go from 'gojs';
import { EventTreeEditorComponent } from './event-tree-editor.component';
import { EventTreePageComponent } from '../../features/event-tree/event-tree-page.component';

type BranchClipboard = {
  sourceTreeId: string;
  sourceSequenceKey: string;
  frequency?: string;
  consequence?: string;
  resultCode?: string;
};

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

  const prototype = EventTreeEditorComponent.prototype as any;
  if (prototype.__eventTreeBranchContextMenuInstalled) return;
  prototype.__eventTreeBranchContextMenuInstalled = true;

  const originalCreateDiagram = prototype.createDiagram;
  const originalDestroy = prototype.ngOnDestroy;

  const getBranchSequenceKey = (component: any, branchKey: string): string | null => {
    const branch = component.model?.nodes?.find(
      (node: any) => node.key === branchKey && node.category === 'BRANCH'
    );
    return branch?.pathSequenceKey ?? null;
  };

  const refresh = (component: any): void => {
    requestAnimationFrame(() => component.refreshLayout?.());
  };

  const copyBranch = (component: any, branchKey: string): boolean => {
    const tree = component.model;
    const sequenceKey = getBranchSequenceKey(component, branchKey);
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

  const cutBranch = (component: any, branchKey: string): void => {
    if (!copyBranch(component, branchKey)) return;
    const repository = activeEventTreePage?.repository;
    const treeId = component.model?.id;
    const rootSequenceKey = getBranchSequenceKey(component, branchKey);
    if (!repository || !treeId || !rootSequenceKey) return;

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

  const selectWholeBranch = (component: any, branchKey: string): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    const sequenceKey = getBranchSequenceKey(component, branchKey);
    if (!diagram || !sequenceKey) return;

    diagram.clearSelection();
    diagram.nodes.each((node: go.Node) => {
      const data = node.data as any;
      if ((data?.category === 'BRANCH' && data.pathSequenceKey === sequenceKey)
        || (data?.category === 'SEQUENCE' && data.key === sequenceKey)) {
        node.isSelected = true;
      }
    });
    component.selectBranchSource?.(branchKey);
  };

  const removeDomMenu = (): void => {
    activeDomMenu?.remove();
    activeDomMenu = null;
  };

  const findBranchAtEvent = (component: any, event: MouseEvent): go.Node | null => {
    const diagram = component.diagram as go.Diagram | undefined;
    const div = component.diagramDiv?.nativeElement as HTMLDivElement | undefined;
    if (!diagram || !div) return null;

    const rect = div.getBoundingClientRect();
    const viewPoint = new go.Point(event.clientX - rect.left, event.clientY - rect.top);
    const docPoint = diagram.transformViewToDoc(viewPoint);
    const direct = diagram.findPartAt(docPoint, true) as go.Part | null;
    if (direct instanceof go.Node && (direct.data as any)?.category === 'BRANCH') return direct;

    let nearest: go.Node | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    diagram.nodes.each((node: go.Node) => {
      if ((node.data as any)?.category !== 'BRANCH') return;
      const center = node.actualBounds.center;
      const distance = Math.hypot(center.x - docPoint.x, center.y - docPoint.y);
      if (distance <= 18 && distance < nearestDistance) {
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
    addItem('Couper', () => cutBranch(component, key));

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
    if (!div || this.__eventTreeBranchContextListener) return;

    const contextListener = (event: MouseEvent): void => {
      const branchNode = findBranchAtEvent(this, event);
      if (!branchNode) {
        removeDomMenu();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      showDomMenu(this, branchNode, event);
    };
    const dismissListener = (event: MouseEvent): void => {
      if (activeDomMenu && !activeDomMenu.contains(event.target as Node)) removeDomMenu();
    };

    this.__eventTreeBranchContextListener = contextListener;
    this.__eventTreeBranchContextDismissListener = dismissListener;
    div.addEventListener('contextmenu', contextListener, true);
    document.addEventListener('mousedown', dismissListener, true);
  };

  prototype.ngOnDestroy = function(): void {
    const div = this.diagramDiv?.nativeElement as HTMLDivElement | undefined;
    if (div && this.__eventTreeBranchContextListener) {
      div.removeEventListener('contextmenu', this.__eventTreeBranchContextListener, true);
    }
    if (this.__eventTreeBranchContextDismissListener) {
      document.removeEventListener('mousedown', this.__eventTreeBranchContextDismissListener, true);
    }
    removeDomMenu();
    originalDestroy.call(this);
  };
}
