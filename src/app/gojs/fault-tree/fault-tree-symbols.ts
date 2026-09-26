import { GateType } from '../../core/models/psa.models';

/**
 * Original GoJS vector equivalents of the RiskSpectrum fault-tree symbol family.
 *
 * Coordinate conventions:
 * - every logic gate is symmetric around x = 30
 * - normal gate output is exactly at (30, 0)
 * - normal gate input base terminates at y = 40
 * - NAND/NOR add an inversion bubble above the same gate geometry
 * - K/N is a compact rectangular voting symbol
 *
 * Keeping the top and bottom boundaries exact is important because the parent/child
 * link is routed from the node bounds. This avoids the visible gaps that existed in V1.
 */
const AND_GEOMETRY =
  'F M6 40 L6 22 C6 9 16 0 30 0 C44 0 54 9 54 22 L54 40 Z';

const OR_GEOMETRY =
  'F M5 40 C8 20 15 5 30 0 C45 5 52 20 55 40 C43 33 17 33 5 40 Z';

const XOR_GEOMETRY =
  'F M7 38 C10 19 17 5 30 0 C43 5 50 19 53 38 C42 32 18 32 7 38 Z ' +
  'M4 42 C17 34 43 34 56 42';

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

export function gateSymbolHeight(type: GateType | undefined): number {
  if (type === 'KOFN') return 24;
  if (hasOutputNegationBubble(type)) return 48;
  return type === 'XOR' ? 42 : 40;
}

/** House Event: closed, symmetric house / pentagon. */
export const HOUSE_EVENT_GEOMETRY =
  'F M22 0 L42 15 L42 38 L2 38 L2 15 Z';

/** Transfer: closed, symmetric triangle as requested for NextPSA. */
export const TRANSFER_GEOMETRY =
  'F M22 0 L42 38 L2 38 Z';
