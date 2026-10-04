export type EventTreeNodeCategory = 'INITIATING' | 'FUNCTION' | 'BRANCH' | 'SEQUENCE';

export interface EventTreeNodeData {
  key: string;
  category: EventTreeNodeCategory;
  label: string;
  code?: string;
  columnIndex?: number;
  originColumnIndex?: number;
  pathSequenceKey?: string;
  parentSequenceKey?: string;
  branchColumnIndex?: number;
  level?: number;
  sequenceNo?: number;
  frequency?: string;
  consequence?: string;
  resultCode?: string;
}

export interface EventTreeLinkData {
  from: string;
  to: string;
  label?: string;
  outcome?: 'SUCCESS' | 'FAILURE' | 'OTHER';
}

export interface EventTreeModel {
  id: string;
  description: string;
  initiatingEvent: string;
  initiatingCode: string;
  functionEvents: { id: string; description: string; code: string }[];
  nodes: EventTreeNodeData[];
  links: EventTreeLinkData[];
  editedDate: string;
  editedBy: string;
  tagColor?: string | null;
}
