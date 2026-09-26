export type RecordState = 'NORMAL' | 'TRUE' | 'FALSE';

export type GateType =
  | 'OR'
  | 'AND'
  | 'KOFN'
  | 'NOR'
  | 'NAND'
  | 'XOR'
  | 'COMMENT'
  | 'CONTINUATION'
  | 'UNDEFINED';

export type FaultTreeCategory =
  | 'TOP_EVENT'
  | 'GATE'
  | 'BASIC_EVENT'
  | 'HOUSE_EVENT'
  | 'TRANSFER'
  | 'EXCHANGE_EVENT'
  | 'COMMENT'
  | 'CONTINUATION'
  | 'UNDEFINED';

export type ReliabilityModelType =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7;

export interface AuditMetadata {
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedBy: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface PsaRecord {
  id: string;
  description: string;
  state: RecordState;
  attributes: readonly string[];
  memo?: string;
  audit: AuditMetadata;
}

export interface ReliabilityParameterRef {
  code: 'q' | 'r' | 'f' | 'TR' | 'TI' | 'TF' | 'TM';
  parameterId: string;
  mean: number;
  unit?: string;
}

export interface BasicEventRecord extends PsaRecord {
  symbol: 'CIRCLE' | 'DIAMOND';
  reliabilityModel: ReliabilityModelType;
  parameterRefs: ReliabilityParameterRef[];
  sequenceMttrId?: string;
  ccfGroupIds: string[];
  muxSetIds: string[];
  systemId?: string;
  componentId?: string;
}

export interface GateRecord extends PsaRecord {
  type: GateType;
  faultTreeId: string;
  isTopGate: boolean;
  k?: number;
}

export interface FaultTreeNodeData {
  key: string;
  category: FaultTreeCategory;
  id: string;
  description: string;
  state: RecordState;
  gateType?: GateType;
  k?: number;
  reliabilityModel?: ReliabilityModelType;
  symbol?: 'CIRCLE' | 'DIAMOND';
  recordType: 'GAT' | 'BEV' | 'HEV' | 'FTR';
}

export interface FaultTreeLinkData {
  key: string;
  from: string;
  to: string;
  negated?: boolean;
}

export interface FaultTreeModel {
  id: string;
  description: string;
  topGateId: string;
  nodes: FaultTreeNodeData[];
  links: FaultTreeLinkData[];
}

export interface ValidationIssue {
  id: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  recordId: string;
  message: string;
  location: string;
}
