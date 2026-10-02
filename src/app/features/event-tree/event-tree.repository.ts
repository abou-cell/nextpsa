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
      { key: 'S1', category: 'SEQUENCE', label: 'Sequence 1', sequenceNo: 1, frequency: '1.00E-04', consequence: 'CD3,OK,TEST', resultCode: '' },
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
      { key: 'S1', category: 'SEQUENCE', label: 'Sequence 1', sequenceNo: 1, frequency: '4.20E-06', consequence: 'OK', resultCode: 'ACR' },
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
      { key: 'S1', category: 'SEQUENCE', label: 'Sequence 1', sequenceNo: 1, frequency: '6.10E-04', consequence: 'SFP-OK', resultCode: 'REC' },
    ],
    links: [],
    editedDate: '01/10/2026',
    editedBy: 'AR'
  }
];

@Injectable({ providedIn: 'root' })
export class EventTreeRepository {
  readonly eventTrees = signal<EventTreeModel[]>(EVENT_TREES);
  readonly activeEventTreeId = signal('ET-LOCA');

  readonly eventTree = computed(() =>
    this.eventTrees().find((tree) => tree.id === this.activeEventTreeId()) ?? this.eventTrees()[0]
  );

  selectEventTree(id: string): void {
    if (this.eventTrees().some((tree) => tree.id === id)) this.activeEventTreeId.set(id);
  }

  addFunctionEvent(treeId: string): void {
    this.eventTrees.update((trees) => trees.map((tree) => {
      if (tree.id !== treeId) return tree;

      const index = tree.functionEvents.length + 1;
      const functionId = `FE-${index + 1}`;
      const code = `F${index + 1}`;
      const nodeKey = `FE${index + 1}`;

      return {
        ...tree,
        functionEvents: [
          ...tree.functionEvents,
          { id: functionId, description: `Function Event ${index + 1}`, code }
        ],
        nodes: [
          ...tree.nodes,
          {
            key: nodeKey,
            category: 'FUNCTION' as const,
            label: `Function Event ${index + 1}`,
            code,
            columnIndex: index + 1
          }
        ]
      };
    }));
  }

  removeFunctionEvent(treeId: string): void {
    this.eventTrees.update((trees) => trees.map((tree) => {
      if (tree.id !== treeId || !tree.functionEvents.length) return tree;

      const nextFunctionEvents = tree.functionEvents.slice(0, -1);
      const removedColumn = tree.functionEvents.length;
      const maxColumn = Math.max(1, nextFunctionEvents.length);

      return {
        ...tree,
        functionEvents: nextFunctionEvents,
        nodes: tree.nodes
          .filter((node) => !(node.category === 'FUNCTION' && node.columnIndex === removedColumn))
          .map((node) =>
            node.category === 'BRANCH' && (node.columnIndex ?? 1) > maxColumn
              ? { ...node, columnIndex: maxColumn }
              : node
          )
      };
    }));
  }

  addBranch(treeId: string, fromKey: string): void {
    this.eventTrees.update((trees) => trees.map((tree) => {
      if (tree.id !== treeId) return tree;

      const directBranchCount = tree.links.filter(
        (link) => link.from === fromKey && /^Branch\s\d+/.test(link.label ?? '')
      ).length;

      if (directBranchCount >= 10) return tree;

      const sequenceCount = tree.nodes.filter((node) => node.category === 'SEQUENCE').length;

      let columnIndex: number | null = null;
      let sourceLevel = 0;
      let sourcePathSequenceKey = 'S1';

      const functionPointMatch = /^FEPOINT-(\d+)$/.exec(fromKey);
      if (functionPointMatch) {
        columnIndex = Number(functionPointMatch[1]);
      } else {
        const source = tree.nodes.find((node) => node.key === fromKey && node.category === 'BRANCH');
        if (source) {
          columnIndex = source.columnIndex ?? 1;
          sourceLevel = source.level ?? 0;
          sourcePathSequenceKey = source.pathSequenceKey ?? 'S1';
        }
      }

      if (columnIndex === null || columnIndex < 1 || columnIndex > tree.functionEvents.length) {
        return tree;
      }

      const sequenceNo = sequenceCount + 1;
      const sequenceKey = `S${sequenceNo}`;
      const branchGroup = `B${sequenceNo}`;

      const branchNodes = [];
      const branchLinks = [];
      let previousKey = fromKey;

      // The selected node is the only visible node on the branch vertical.
      // Do NOT create another node at the lower bend. For each following FE,
      // create exactly one visible node on the new horizontal branch line.
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
          label: previousKey === fromKey
            ? `Branch ${directBranchCount + 1}`
            : 'Continue',
          outcome: 'OTHER' as const
        });

        previousKey = branchKey;
      }

      // If the selected node belongs to the last FE, the branch goes directly
      // to the new sequence. Otherwise the last following-FE node goes to it.
      branchLinks.push({
        from: previousKey,
        to: sequenceKey,
        label: previousKey === fromKey
          ? `Branch ${directBranchCount + 1}`
          : 'Result',
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

      children.forEach((list) => {
        list.sort((a, b) => {
          const columnDiff = (b.branchColumnIndex ?? 0) - (a.branchColumnIndex ?? 0);
          if (columnDiff !== 0) return columnDiff;
          return (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0);
        });
      });

      const orderedKeys: string[] = [];
      const visit = (key: string): void => {
        orderedKeys.push(key);
        (children.get(key) ?? []).forEach((child) => visit(child.key));
      };

      const roots = sequences
        .filter((sequence) => !sequence.parentSequenceKey)
        .sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0));

      roots.forEach((root) => visit(root.key));

      const displayNo = new Map(
        orderedKeys.map((key, index) => [key, index + 1])
      );

      const normalizedNodes = nextNodes.map((node) => {
        if (node.category !== 'SEQUENCE') return node;
        const nextNo = displayNo.get(node.key) ?? node.sequenceNo ?? 1;
        return {
          ...node,
          sequenceNo: nextNo,
          label: `Sequence ${nextNo}`
        };
      });

      return {
        ...tree,
        nodes: normalizedNodes,
        links: [
          ...tree.links,
          ...branchLinks
        ]
      };
    }));
  }
}
