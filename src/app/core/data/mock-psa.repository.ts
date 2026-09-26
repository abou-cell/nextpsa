import { Injectable, signal } from '@angular/core';
import {
  BasicEventRecord,
  ChangeNodeCandidate,
  FaultTreeModel,
  FaultTreeNodeData,
  GateRecord,
  ValidationIssue
} from '../models/psa.models';

const audit = {
  createdBy: 'ABOU',
  createdAt: '2026-09-26T00:00:00Z',
  updatedBy: 'ABOU',
  updatedAt: '2026-09-26T00:00:00Z',
  version: 1
} as const;

@Injectable({ providedIn: 'root' })
export class MockPsaRepository {
  readonly faultTree = signal<FaultTreeModel>({
    id: 'PTR-LOPC',
    description: 'Loss of spent fuel pool cooling',
    topGateId: 'PTR-LOPC',
    nodes: [
      { key: 'PTR-LOPC', category: 'TOP_EVENT', id: 'PTR-LOPC', description: 'Loss of spent fuel pool cooling', state: 'NORMAL', gateType: 'OR', recordType: 'GAT' },
      { key: 'G-PTR-TRN', category: 'GATE', id: 'G-PTR-TRN', description: 'PTR cooling trains fail', state: 'NORMAL', gateType: 'AND', recordType: 'GAT' },
      { key: 'G-AC-FAIL', category: 'GATE', id: 'G-AC-FAIL', description: 'Loss of AC supply', state: 'NORMAL', gateType: 'OR', recordType: 'GAT' },
      { key: 'G-MAKEUP', category: 'GATE', id: 'G-MAKEUP', description: 'Loss of 2 of 3 make-up paths', state: 'NORMAL', gateType: 'KOFN', k: 2, recordType: 'GAT' },
      { key: 'PTR101PO-FS', category: 'BASIC_EVENT', id: 'PTR101PO-FS', description: 'PTR train A pump fails to start', state: 'NORMAL', reliabilityModel: 3, symbol: 'CIRCLE', recordType: 'BEV' },
      { key: 'PTR201PO-FS', category: 'BASIC_EVENT', id: 'PTR201PO-FS', description: 'PTR train B pump fails to start', state: 'NORMAL', reliabilityModel: 3, symbol: 'CIRCLE', recordType: 'BEV' },
      { key: 'DG1-FS', category: 'BASIC_EVENT', id: 'DG1-FS', description: 'Diesel generator 1 fails to start', state: 'NORMAL', reliabilityModel: 3, symbol: 'CIRCLE', recordType: 'BEV' },
      { key: 'DG2-FS', category: 'BASIC_EVENT', id: 'DG2-FS', description: 'Diesel generator 2 fails to start', state: 'NORMAL', reliabilityModel: 3, symbol: 'CIRCLE', recordType: 'BEV' },
      { key: 'MAKEUP-01', category: 'BASIC_EVENT', id: 'MAKEUP-01', description: 'Make-up path 1 unavailable', state: 'NORMAL', reliabilityModel: 1, symbol: 'CIRCLE', recordType: 'BEV' },
      { key: 'MAKEUP-02', category: 'BASIC_EVENT', id: 'MAKEUP-02', description: 'Make-up path 2 unavailable', state: 'NORMAL', reliabilityModel: 1, symbol: 'CIRCLE', recordType: 'BEV' },
      { key: 'MAKEUP-03', category: 'BASIC_EVENT', id: 'MAKEUP-03', description: 'Make-up path 3 unavailable', state: 'NORMAL', reliabilityModel: 1, symbol: 'CIRCLE', recordType: 'BEV' },
      { key: 'HE-MAINT', category: 'HOUSE_EVENT', id: 'HE-MAINT', description: 'Maintenance configuration active', state: 'FALSE', recordType: 'HEV' },
      { key: 'XFR-AUX', category: 'TRANSFER', id: 'XFR-AUX', description: 'Transfer to auxiliary power FT', state: 'NORMAL', recordType: 'FTR' }
    ],
    links: [
      { key: 'L1', from: 'PTR-LOPC', to: 'G-PTR-TRN' },
      { key: 'L2', from: 'PTR-LOPC', to: 'G-AC-FAIL' },
      { key: 'L3', from: 'PTR-LOPC', to: 'G-MAKEUP' },
      { key: 'L4', from: 'PTR-LOPC', to: 'HE-MAINT' },
      { key: 'L5', from: 'PTR-LOPC', to: 'XFR-AUX' },
      { key: 'L6', from: 'G-PTR-TRN', to: 'PTR101PO-FS' },
      { key: 'L7', from: 'G-PTR-TRN', to: 'PTR201PO-FS' },
      { key: 'L8', from: 'G-AC-FAIL', to: 'DG1-FS' },
      { key: 'L9', from: 'G-AC-FAIL', to: 'DG2-FS' },
      { key: 'L10', from: 'G-MAKEUP', to: 'MAKEUP-01' },
      { key: 'L11', from: 'G-MAKEUP', to: 'MAKEUP-02', negated: false },
      { key: 'L12', from: 'G-MAKEUP', to: 'MAKEUP-03' }
    ]
  });

  readonly basicEvents = signal<BasicEventRecord[]>([
    this.be('PTR101PO-FS', 'PTR train A pump fails to start', 3, 'Q_PTR_A_FS', 2.5e-3, 'PTR', 'PTR101PO'),
    this.be('PTR201PO-FS', 'PTR train B pump fails to start', 3, 'Q_PTR_B_FS', 2.5e-3, 'PTR', 'PTR201PO'),
    this.be('DG1-FS', 'Diesel generator 1 fails to start', 3, 'Q_DG1_START', 1.0e-3, 'ACP', 'DG1'),
    this.be('DG2-FS', 'Diesel generator 2 fails to start', 3, 'Q_DG2_START', 1.0e-3, 'ACP', 'DG2'),
    this.be('MAKEUP-01', 'Make-up path 1 unavailable', 1, 'R_MAKEUP_01', 2.0e-6, 'PTR', 'MAKEUP01'),
    this.be('MAKEUP-02', 'Make-up path 2 unavailable', 1, 'R_MAKEUP_02', 2.0e-6, 'PTR', 'MAKEUP02'),
    this.be('MAKEUP-03', 'Make-up path 3 unavailable', 1, 'R_MAKEUP_03', 2.0e-6, 'PTR', 'MAKEUP03')
  ]);

  readonly validationIssues = signal<ValidationIssue[]>([
    { id: 'FT-002', severity: 'ERROR', recordId: 'MAKEUP-03', message: 'Basic event is missing an uncertainty definition.', location: 'PTR-LOPC' },
    { id: 'FT-017', severity: 'WARNING', recordId: 'XFR-AUX', message: 'Transferred fault tree is not loaded in the mock repository.', location: 'PTR-LOPC' },
    { id: 'FT-021', severity: 'INFO', recordId: 'HE-MAINT', message: 'House event is FALSE in the active configuration.', location: 'PTR-LOPC' }
  ]);

  gateRecord(id: string): GateRecord | undefined {
    const node = this.faultTree().nodes.find((item) => item.id === id && (item.category === 'GATE' || item.category === 'TOP_EVENT'));
    if (!node?.gateType) return undefined;
    return {
      id: node.id,
      description: node.description,
      state: node.state,
      type: node.gateType,
      faultTreeId: this.faultTree().id,
      isTopGate: node.category === 'TOP_EVENT',
      k: node.k,
      attributes: node.id === 'G-AC-FAIL' ? ['SYS=ACP', 'SAFETY_CLASS=1E'] : ['SYS=PTR'],
      memo: '',
      audit
    };
  }

  basicEvent(id: string): BasicEventRecord | undefined {
    return this.basicEvents().find((event) => event.id === id);
  }

  childBasicEvents(gateId: string): BasicEventRecord[] {
    const model = this.faultTree();
    const childrenByParent = new Map<string, string[]>();
    for (const link of model.links) {
      const children = childrenByParent.get(link.from) ?? [];
      children.push(link.to);
      childrenByParent.set(link.from, children);
    }

    const found = new Set<string>();
    const visit = (key: string): void => {
      for (const child of childrenByParent.get(key) ?? []) {
        const node = model.nodes.find((item) => item.key === child);
        if (!node) continue;
        if (node.category === 'BASIC_EVENT') found.add(node.id);
        if (node.category === 'GATE') visit(node.key);
      }
    };
    visit(gateId);
    return this.basicEvents().filter((event) => found.has(event.id));
  }

  replacementCandidates(node: FaultTreeNodeData | null): ChangeNodeCandidate[] {
    if (!node) return [];

    if (node.category === 'BASIC_EVENT') {
      return this.basicEvents()
        .filter((event) => event.id !== node.id)
        .map((event) => ({
          id: event.id,
          description: event.description,
          category: 'BASIC_EVENT' as const
        }));
    }

    if (node.category === 'HOUSE_EVENT' || node.category === 'TRANSFER') {
      const seen = new Set<string>();
      return this.faultTree().nodes
        .filter((candidate) =>
          candidate.category === node.category &&
          candidate.id !== node.id &&
          !seen.has(candidate.id)
        )
        .map((candidate) => {
          seen.add(candidate.id);
          return {
            id: candidate.id,
            description: candidate.description,
            category: candidate.category
          };
        });
    }

    return [];
  }

  changeFaultTreeNodeReference(nodeKey: string, replacementId: string): void {
    this.faultTree.update((model) => {
      const current = model.nodes.find((node) => node.key === nodeKey);
      if (!current) return model;

      let replacement: Partial<FaultTreeNodeData> | undefined;

      if (current.category === 'BASIC_EVENT') {
        const event = this.basicEvent(replacementId);
        if (!event) return model;
        replacement = {
          id: event.id,
          description: event.description,
          state: event.state,
          reliabilityModel: event.reliabilityModel,
          symbol: event.symbol
        };
      } else if (current.category === 'HOUSE_EVENT' || current.category === 'TRANSFER') {
        const candidate = model.nodes.find(
          (node) => node.category === current.category && node.id === replacementId
        );
        if (!candidate) return model;
        replacement = {
          id: candidate.id,
          description: candidate.description,
          state: candidate.state
        };
      } else {
        return model;
      }

      return {
        ...model,
        nodes: model.nodes.map((node) =>
          node.key === nodeKey
            ? { ...node, ...replacement }
            : node
        )
      };
    });
  }

  updateBasicEvent(updated: BasicEventRecord): void {
    this.basicEvents.update((events) =>
      events.map((event) =>
        event.id === updated.id
          ? {
              ...updated,
              audit: {
                ...updated.audit,
                updatedAt: new Date().toISOString(),
                version: updated.audit.version + 1
              }
            }
          : event
      )
    );
  }

  private be(
    id: string,
    description: string,
    reliabilityModel: BasicEventRecord['reliabilityModel'],
    parameterId: string,
    mean: number,
    systemId: string,
    componentId: string
  ): BasicEventRecord {
    return {
      id,
      description,
      state: 'NORMAL',
      attributes: ['MODEL_SOURCE=DEMO'],
      audit,
      symbol: 'CIRCLE',
      reliabilityModel,
      parameterRefs: [
        {
          code: reliabilityModel === 1 ? 'r' : 'q',
          parameterId,
          mean,
          unit: reliabilityModel === 1 ? '1/h' : undefined
        }
      ],
      sequenceMttrId: reliabilityModel === 1 ? 'MTTR-20' : undefined,
      ccfGroupIds: id.startsWith('DG') ? ['DG-CCF'] : [],
      muxSetIds: [],
      systemId,
      componentId
    };
  }
}
