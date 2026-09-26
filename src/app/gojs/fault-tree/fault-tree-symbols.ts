import { GateType } from '../../core/models/psa.models';

/**
 * Original GoJS vector equivalents of the RiskSpectrum fault-tree symbol family.
 *
 * Design constraints:
 * - all logic gates are strictly symmetric around x = 30
 * - the visible symbol is centered inside a fixed 60 px viewport
 * - NAND/NOR inversion bubbles sit ABOVE the gate body
 * - K/N uses a compact rectangular voting-gate symbol
 * - OR/XOR input-side curves use a symmetric lower arc
 *
 * The editor uses explicit named ports for links; geometry and port positions
 * are intentionally kept independent so a link can touch the exact visual symbol.
 */
const AND_GEOMETRY =
  'F M6 40 L6 22 C6 9 16 0 30 0 C44 0 54 9 54 22 L54 40 Z';

const OR_GEOMETRY =
  'F M4 40 Q8 9 30 0 Q52 9 56 40 Q30 29 4 40 Z';

const XOR_GEOMETRY =
  'F M4 40 Q8 9 30 0 Q52 9 56 40 Q30 29 4 40 Z ' +
  'M4 46 Q30 34 56 46';

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

/**
 * Total viewport height used by the symbol panel.
 * These values include the extra inversion bubble or XOR secondary curve.
 */
export function gateSymbolHeight(type: GateType | undefined): number {
  if (type === 'KOFN') return 28;
  if (type === 'NAND' || type === 'NOR') return 48;
  if (type === 'XOR') return 47;
  return 40;
}

/**
 * Y coordinate of the exact logical branch/output port measured in the 60 px
 * symbol viewport. This is where the child branch link starts visually.
 *
 * RiskSpectrum OR/NOR/XOR gates have a concave input-side curve; therefore the
 * link must start at that curve, not at the rectangular GraphObject bounds.
 */
export function gateOutputPortY(type: GateType | undefined): number {
  switch (type) {
    case 'AND':
      return 40;
    case 'NAND':
      return 48;
    case 'OR':
      return 35;
    case 'NOR':
      return 43;
    case 'XOR':
      return 40;
    case 'KOFN':
      return 28;
    default:
      return 30;
  }
}

/** House Event: closed, symmetric house / pentagon. */
export const HOUSE_EVENT_GEOMETRY =
  'F M22 0 L42 15 L42 38 L2 38 L2 15 Z';

/** Transfer: closed, symmetric triangle. */
export const TRANSFER_GEOMETRY =
  'F M22 0 L42 38 L2 38 Z';
