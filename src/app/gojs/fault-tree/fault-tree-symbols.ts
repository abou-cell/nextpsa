import { GateType } from '../../core/models/psa.models';

/**
 * RiskSpectrum-inspired geometry for the NextPSA Fault Tree editor.
 *
 * These paths are original GoJS equivalents based on the visual conventions
 * used by RiskSpectrum: they are not raster assets copied from the desktop UI.
 */
const AND_GEOMETRY = 'F M7 36 L7 22 C7 10 16 5 28 5 C40 5 49 10 49 22 L49 36 Z';
const OR_GEOMETRY = 'F M6 36 C9 18 17 7 28 6 C39 7 47 18 50 36 C39 30 17 30 6 36 Z';
const XOR_GEOMETRY = 'F M9 36 C12 18 19 7 29 6 C40 7 48 18 51 36 C40 30 19 30 9 36 Z M4 36 C15 29 42 29 56 36';

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

export const HOUSE_EVENT_GEOMETRY = 'F M2 39 L2 16 L22 2 L42 16 L42 39 Z';
export const TRANSFER_GEOMETRY = 'M22 2 L42 39 M22 2 L2 39';
