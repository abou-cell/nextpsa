import { GateType } from '../../core/models/psa.models';

/**
 * Vector equivalents of the RiskSpectrum fault-tree symbol family.
 *
 * All gate geometries are centered and symmetric inside a 56 x 36 artwork box.
 * The GoJS editor renders connection ports separately, so the geometry itself
 * remains dedicated to the RiskSpectrum visual convention.
 */
const AND_GEOMETRY =
  'F M8 34 L8 18 Q8 6 20 6 L40 6 Q52 6 52 18 L52 34 Z';

const OR_GEOMETRY =
  'F M6 34 Q12 18 28 8 Q44 18 50 34 Q28 28 6 34 Z';

const XOR_GEOMETRY =
  'F M10 34 Q16 18 28 8 Q40 18 46 34 Q28 28 10 34 Z ' +
  'M5 34 Q28 25 51 34';

export function gateGeometry(type: GateType | undefined): string {
  switch (type) {
    case 'AND':
    case 'NAND':
      return AND_GEOMETRY;
    case 'OR':
    case 'NOR':
      return OR_GEOMETRY;
    case 'XOR':
      return XOR_GEOMETRY;
    default:
      return OR_GEOMETRY;
  }
}

export function isKofNGate(type: GateType | undefined): boolean {
  return type === 'KOFN';
}

export function hasOutputNegationBubble(type: GateType | undefined): boolean {
  return type === 'NAND' || type === 'NOR';
}

export function gateCaption(type: GateType | undefined, k?: number): string {
  if (type === 'KOFN') return k ? `${k}/N` : 'K/N';
  return type ?? 'UNDEFINED';
}

/** House Event: closed, symmetric house / pentagon. */
export const HOUSE_EVENT_GEOMETRY =
  'F M22 0 L42 15 L42 38 L2 38 L2 15 Z';

/** Transfer: closed, symmetric triangle. */
export const TRANSFER_GEOMETRY =
  'F M22 0 L42 38 L2 38 Z';
