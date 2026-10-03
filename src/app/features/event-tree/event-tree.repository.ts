import { Injectable, computed, signal } from '@angular/core';
import { EventTreeModel } from './event-tree.models';

const EVENT_TREES: EventTreeModel[] = [
  {
    id: 'ET-LOCA',
    description: 'Large Loss of Coolant Accident',
    initiatingEvent: 'Large Loss Of Coolant Accident',
    initiatingCode: 'ALOCA',
    functionEvents: [
      { id: 'FE-ECC', description: 'Emergency Core Cooling', code: 'V' },
      { id: 'FE-RHR', description: 'Residual Heat Removal', code: 'W' }
    ],
    nodes: [
      { key: 'IE', category: 'INITIATING', label: 'Large Loss Of Coolant\nAccident', code: 'ALOCA', columnIndex: 0 },
      { key: 'FE1', category: 'FUNCTION', label: 'Emergency Core Cooling', code: 'V', columnIndex: 1 },
      { key: 'FE2', category: 'FUNCTION', label: 'Residual Heat Removal', code: 'W', columnIndex: 2 },
      { key: 'S1', category: 'SEQUENCE', label: 'Sequence 1', sequenceNo: 1, frequency: '1.00E-04', consequence: 'CD3,OK,TEST', resultCode: '' }
    ],
    links: [],
    editedDate: '01/10/2026',
    editedBy: 'AR'
  },
  {
    id: 'ET-SBO',
    description: 'Station Blackout',
    initiatingEvent: 'Station Blackout',
    initiatingCode: 'SBO',
    functionEvents: [
      { id: 'FE-AC', description: 'AC Power Recovery', code: 'ACR' },
      { id: 'FE-DHR', description: 'Decay Heat Removal', code: 'DHR' }
    ],
    nodes: [
      { key: 'IE', category: 'INITIATING', label: 'Station Blackout', code: 'SBO', columnIndex: 0 },
      { key: 'FE1', category: 'FUNCTION', label: 'AC Power Recovery', code: 'ACR', columnIndex: 1 },
      { key: 'FE2', category: 'FUNCTION', label: 'Decay Heat Removal', code: 'DHR', columnIndex: 2 },
      { key: 'S1', category: 'SEQUENCE', label: 'Sequence 1', sequenceNo: 1, frequency: '4.20E-06', consequence: 'OK', resultCode: 'ACR' }
    ],
    links: [],
    editedDate: '01/10/2026',
    editedBy: 'AR'
  },
  {
    id: 'ET-SFP',
    description: 'Spent fuel pool loss of cooling',
    initiatingEvent: 'Loss of SFP Cooling',
    initiatingCode: 'LOPC-SFP',
    functionEvents: [
      { id: 'FE-MU', description: 'Make-up Available', code: 'MU' },
      { id: 'FE-REC', description: 'Cooling Recovery', code: 'REC' }
    ],
    nodes: [
      { key: 'IE', category: 'INITIATING', label: 'Loss of SFP Cooling', code: 'LOPC-SFP', columnIndex: 0 },
      { key: 'FE1', category: 'FUNCTION', label: 'Make-up Available', code: 'MU', columnIndex: 1 },
      { key: 'FE2', category: 'FUNCTION', label: 'Cooling Recovery', code: 'REC', columnIndex: 2 },
      { key: 'S1', category: 'SEQUENCE', label: 'Sequence 1', sequenceNo: 1, frequency: '6.10E-04', consequence: 'SFP-OK', resultCode: 'REC' }
    ],
    links: [],
    editedDate: '01/10/2026',
    editedBy: 'AR'
  }
];

@Injectable({ providedIn: 'root' })
export class EventTreeRepository {
  readonly eventTrees = signal<EventTreeModel[]>(this.cloneTrees(EVENT_TREES));
  readonly activeEventTreeId = signal('ET-LOCA');
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);

  private readonly undoStack: EventTreeModel[][] = [];
  private readonly redoStack: EventTreeModel[][] = [];

  readonly eventTree = computed(() =>
    this.eventTrees().find((tree) => tree.id === this.activeEventTreeId()) ?? this.eventTrees()[0]
  );

  selectEventTree(id: string): void {
    if (this.eventTrees().some((tree) => tree.id === id)) this.activeEventTreeId.set(id);
  }

  undo(): void {
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.redoStack.push(this.cloneTrees(this.eventTrees()));
    this.eventTrees.set(this.cloneTrees(previous));
    this.updateHistorySignals();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.cloneTrees(this.eventTrees()));
    this.eventTrees.set(this.cloneTrees(next));
    this.updateHistorySignals();
  }

  addFunctionEvent(treeId: string): void {
    this.saveHistory();
    this.eventTrees.update((trees) => trees.map((tree) => {
      if (tree.id !== treeId) return tree;

      const newColumn = tree.functionEvents.length + 1;
      const functionId = `FE-${newColumn}`;
      const code = `F${newColumn}`;
      const nodeKey = `FE${newColumn}`;
      const newFunctionNode = {
        key: nodeKey,
        category: 'FUNCTION' as const,
        label: `Function Event ${newColumn}`,
        code,
        columnIndex: newColumn
      };

      const nextNodes = [...tree.nodes, newFunctionNode];
      const nextLinks = [...tree.links];

      const branchSequences = tree.nodes.filter(
        (node) => node.category === 'SEQUENCE' && node.key !== 'S1'
      );

      branchSequences.forEach((sequence) => {
        const alreadyExtended = nextNodes.some(
          (node) => node.category === 'BRANCH'
            && node.pathSequenceKey === sequence.key
            && node.columnIndex === newColumn
        );

        if (!alreadyExtended) {
          const incomingIndex = nextLinks.findIndex((link) => link.to === sequence.key);

          if (incomingIndex >= 0) {
            const incoming = nextLinks[incomingIndex];
            const predecessor = nextNodes.find((node) => node.key === incoming.from);
            const branchGroup = sequence.key.replace(/^S/, 'B');
            let branchKey = `${branchGroup}-C${newColumn}`;
            let suffix = 2;

            while (nextNodes.some((node) => node.key === branchKey)) {
              branchKey = `${branchGroup}-C${newColumn}-${suffix}`;
              suffix += 1;
            }

            const originColumnIndex = sequence.branchColumnIndex
              ?? predecessor?.originColumnIndex
              ?? predecessor?.columnIndex
              ?? Math.max(1, newColumn - 1);

            nextNodes.push({
              key: branchKey,
              category: 'BRANCH' as const,
              label: `FE ${newColumn} branch point`,
              columnIndex: newColumn,
              originColumnIndex,
              pathSequenceKey: sequence.key,
              level: predecessor?.level ?? 1
            });

            nextLinks[incomingIndex] = {
              ...incoming,
              to: branchKey,
              label: /^Branch\s\d+/.test(incoming.label ?? '') ? incoming.label : 'Continue'
            };
            nextLinks.push({
              from: branchKey,
              to: sequence.key,
              label: 'Result',
              outcome: 'OTHER' as const
            });
          }
        }

        // Repair invariant: every branch path must expose one selectable point
        // at every Function Event column after its origin. This also repairs
        // older trees that were created before the extension logic existed.
        const originColumn = Math.max(1, sequence.branchColumnIndex ?? 1);
        for (let column = originColumn + 1; column <= newColumn; column += 1) {
          const pointExists = nextNodes.some(
            (node) => node.category === 'BRANCH'
              && node.pathSequenceKey === sequence.key
              && node.columnIndex === column
          );
          if (pointExists) continue;

          const branchGroup = sequence.key.replace(/^S/, 'B');
          let pointKey = `${branchGroup}-P${column}`;
          let suffix = 2;
          while (nextNodes.some((node) => node.key === pointKey)) {
            pointKey = `${branchGroup}-P${column}-${suffix}`;
            suffix += 1;
          }

          nextNodes.push({
            key: pointKey,
            category: 'BRANCH' as const,
            label: `FE ${column} branch point`,
            columnIndex: column,
            originColumnIndex: originColumn,
            pathSequenceKey: sequence.key,
            level: 1
          });
        }
      });

      return {
        ...tree,
        functionEvents: [
          ...tree.functionEvents,
          { id: functionId, description: `Function Event ${newColumn}`, code }
        ],
        nodes: nextNodes,
        links: nextLinks
      };
    }));
  }

  removeFunctionEvent(treeId: string): void {
    const tree = this.eventTrees().find((item) => item.id === treeId);
    if (!tree?.functionEvents.length) return;
    this.saveHistory();
    this.eventTrees.update((trees) => trees.map((item) => {
      if (item.id !== treeId || !item.functionEvents.length) return item;
      const nextFunctionEvents = item.functionEvents.slice(0, -1);
      const removedColumn = item.functionEvents.length;
      const maxColumn = Math.max(1, nextFunctionEvents.length);
      return {
        ...item,
        functionEvents: nextFunctionEvents,
        nodes: item.nodes
          .filter((node) => !(node.category === 'FUNCTION' && node.columnIndex === removedColumn))
          .map((node) => node.category === 'BRANCH' && (node.columnIndex ?? 1) > maxColumn ? { ...node, columnIndex: maxColumn } : node)
      };
    }));
  }

  addBranch(treeId: string, fromKey: string): void {
    const currentTree = this.eventTrees().find((tree) => tree.id === treeId);
    if (!currentTree) return;

    const directBranchCount = currentTree.links.filter(
      (link) => link.from === fromKey && /^Branch\s\d+/.test(link.label ?? '')
    ).length;
    if (directBranchCount >= 10) return;

    let sourceColumn: number | null = null;
    const functionPointMatch = /^FEPOINT-(\d+)$/.exec(fromKey);
    if (functionPointMatch) {
      sourceColumn = Number(functionPointMatch[1]);
    } else {
      const source = currentTree.nodes.find((node) => node.key === fromKey && node.category === 'BRANCH');
      sourceColumn = source?.columnIndex ?? null;
    }
    if (sourceColumn === null || sourceColumn < 1 || sourceColumn > currentTree.functionEvents.length) return;

    this.saveHistory();
    this.eventTrees.update((trees) => trees.map((tree) => {
      if (tree.id !== treeId) return tree;

      const sequenceCount = tree.nodes.filter((node) => node.category === 'SEQUENCE').length;
      let columnIndex: number | null = null;
      let sourceLevel = 0;
      let sourcePathSequenceKey = 'S1';

      const match = /^FEPOINT-(\d+)$/.exec(fromKey);
      if (match) {
        columnIndex = Number(match[1]);
      } else {
        const source = tree.nodes.find((node) => node.key === fromKey && node.category === 'BRANCH');
        if (source) {
          columnIndex = source.columnIndex ?? 1;
          sourceLevel = source.level ?? 0;
          sourcePathSequenceKey = source.pathSequenceKey ?? 'S1';
        }
      }
      if (columnIndex === null) return tree;

      const sequenceNo = sequenceCount + 1;
      const sequenceKey = `S${sequenceNo}`;
      const branchGroup = `B${sequenceNo}`;
      const branchNodes = [];
      const branchLinks = [];
      let previousKey = fromKey;

      for (let column = columnIndex + 1; column <= tree.functionEvents.length; column += 1) {
        const branchKey = `${branchGroup}-C${column}`;
        branchNodes.push({
          key: branchKey,
          category: 'BRANCH' as const,
          label: `FE ${column} branch point`,
          columnIndex: column,
          originColumnIndex: columnIndex,
          pathSequenceKey: sequenceKey,
          level: sourceLevel + 1
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

      const nextNodes = [
        ...tree.nodes,
        ...branchNodes,
        {
          key: sequenceKey,
          category: 'SEQUENCE' as const,
          label: `Sequence ${sequenceNo}`,
          sequenceNo,
          parentSequenceKey: sourcePathSequenceKey,
          branchColumnIndex: columnIndex,
          frequency: '',
          consequence: '',
          resultCode: ''
        }
      ];

      const sequences = nextNodes.filter((node) => node.category === 'SEQUENCE');
      const children = new Map<string, typeof sequences>();
      sequences.forEach((sequence) => {
        const parent = sequence.parentSequenceKey;
        if (!parent) return;
        const list = children.get(parent) ?? [];
        list.push(sequence);
        children.set(parent, list);
      });
      children.forEach((list) => list.sort((a, b) => {
        const columnDiff = (b.branchColumnIndex ?? 0) - (a.branchColumnIndex ?? 0);
        if (columnDiff !== 0) return columnDiff;
        return (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0);
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
      const normalizedNodes = nextNodes.map((node) => {
        if (node.category !== 'SEQUENCE') return node;
        const nextNo = displayNo.get(node.key) ?? node.sequenceNo ?? 1;
        return { ...node, sequenceNo: nextNo, label: `Sequence ${nextNo}` };
      });

      return { ...tree, nodes: normalizedNodes, links: [...tree.links, ...branchLinks] };
    }));
  }

  private saveHistory(): void {
    this.undoStack.push(this.cloneTrees(this.eventTrees()));
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack.length = 0;
    this.updateHistorySignals();
  }

  private updateHistorySignals(): void {
    this.canUndo.set(this.undoStack.length > 0);
    this.canRedo.set(this.redoStack.length > 0);
  }

  private cloneTrees(trees: EventTreeModel[]): EventTreeModel[] {
    return trees.map((tree) => ({
      ...tree,
      functionEvents: tree.functionEvents.map((event) => ({ ...event })),
      nodes: tree.nodes.map((node) => ({ ...node })),
      links: tree.links.map((link) => ({ ...link }))
    }));
  }
}
