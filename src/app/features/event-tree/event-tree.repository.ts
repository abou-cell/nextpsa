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
      { key: 'S2', category: 'SEQUENCE', label: 'Sequence 2', sequenceNo: 2, frequency: '2.11E-09', consequence: 'CD,CD3', resultCode: 'W' },
      { key: 'S3', category: 'SEQUENCE', label: 'Sequence 3', sequenceNo: 3, frequency: '3.55E-07', consequence: 'CD,CD2,RC1', resultCode: 'V' }
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
      { key: 'S2', category: 'SEQUENCE', label: 'Sequence 2', sequenceNo: 2, frequency: '8.50E-08', consequence: 'CD1', resultCode: 'DHR' },
      { key: 'S3', category: 'SEQUENCE', label: 'Sequence 3', sequenceNo: 3, frequency: '6.10E-07', consequence: 'CD2', resultCode: 'SBO' }
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
      { key: 'S2', category: 'SEQUENCE', label: 'Sequence 2', sequenceNo: 2, frequency: '1.22E-05', consequence: 'BOIL', resultCode: 'MU' },
      { key: 'S3', category: 'SEQUENCE', label: 'Sequence 3', sequenceNo: 3, frequency: '3.10E-06', consequence: 'FUEL-DMG', resultCode: 'LOPC' }
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

      const sequenceCount = tree.nodes.filter((node) => node.category === 'SEQUENCE').length;
      const branchCount = tree.nodes.filter((node) => node.category === 'BRANCH').length;
      const source = tree.nodes.find((node) => node.key === fromKey);
      if (!source) return tree;

      const branchKey = `B${branchCount + 1}`;
      const sequenceKey = `S${sequenceCount + 1}`;
      const columnIndex = Math.max(1, source.columnIndex ?? tree.functionEvents.length);

      return {
        ...tree,
        nodes: [
          ...tree.nodes,
          {
            key: branchKey,
            category: 'BRANCH' as const,
            label: `Branch ${branchCount + 1}`,
            columnIndex,
            level: (source.level ?? 0) + 1
          },
          {
            key: sequenceKey,
            category: 'SEQUENCE' as const,
            label: `Sequence ${sequenceCount + 1}`,
            sequenceNo: sequenceCount + 1,
            frequency: '0.00E+00',
            consequence: 'TBD',
            resultCode: ''
          }
        ],
        links: [
          ...tree.links,
          { from: fromKey, to: branchKey, label: 'New branch', outcome: 'OTHER' as const },
          { from: branchKey, to: sequenceKey, label: 'Result', outcome: 'OTHER' as const }
        ]
      };
    }));
  }
}
