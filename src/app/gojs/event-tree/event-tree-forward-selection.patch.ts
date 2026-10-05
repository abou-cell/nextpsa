import * as go from 'gojs';
import { EventTreeEditorComponent } from './event-tree-editor.component';

const NORMAL_LINK_STROKE = '#1f2937';
const ACTIVE_LINK_STROKE = '#0f5bd8';
const NORMAL_LINK_WIDTH = 1;
const ACTIVE_LINK_WIDTH = 1.25;
const ACTIVE_SEQUENCE_FILL = '#e8f1ff';
const ACTIVE_SEQUENCE_STROKE = '#0f5bd8';

const BASELINE_START_KEY = '__BASELINE_START__';
const BASELINE_END_KEY = '__BASELINE_END__';
const CENTER_ROUTE = '__etCenteredRoute';
const CENTER_ANCHOR_PREFIX = '__ETC-';

export function installEventTreeForwardSelectionPatch(): void {
  const prototype = EventTreeEditorComponent.prototype as any;
  if (prototype.__eventTreeForwardSelectionPatchInstalled) return;
  prototype.__eventTreeForwardSelectionPatchInstalled = true;

  const originalSelectBranchSource = prototype.selectBranchSource;

  const resetVisuals = (component: any): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return;

    diagram.links.each((link: go.Link) => {
      if (!link.path) return;
      link.path.stroke = NORMAL_LINK_STROKE;
      link.path.strokeWidth = NORMAL_LINK_WIDTH;
    });

    diagram.nodes.each((node: go.Node) => {
      const data = node.data as any;
      if (data?.category !== 'SEQUENCE') return;
      const shape = node.findObject('SEQUENCE_ROW_BG') as go.Shape | null;
      if (!shape) return;
      shape.fill = '#ffffff';
      shape.stroke = '#cbd5e1';
      shape.strokeWidth = 1;
    });
  };

  const setLinkActive = (link: go.Link): void => {
    if (!link.path) return;
    link.path.stroke = ACTIVE_LINK_STROKE;
    link.path.strokeWidth = ACTIVE_LINK_WIDTH;
  };

  const setSequenceActive = (node: go.Node): void => {
    const shape = node.findObject('SEQUENCE_ROW_BG') as go.Shape | null;
    if (!shape) return;
    shape.fill = ACTIVE_SEQUENCE_FILL;
    shape.stroke = ACTIVE_SEQUENCE_STROKE;
    shape.strokeWidth = 1.5;
  };

  /**
   * Build the logical Event Tree independently from the rendered GoJS routes.
   *
   * This is required by consequence-first centered mode because its vertical
   * spines are drawn geometrically from top to bottom. Their visual link direction
   * is therefore not always the logical ET direction. Selection must follow the
   * model, not the direction of the rendered spine segments.
   */
  const buildLogicalOutgoing = (component: any): Map<string, string[]> => {
    const outgoing = new Map<string, string[]>();
    const seen = new Set<string>();

    const add = (from: string, to: string): void => {
      if (!from || !to) return;
      const edgeKey = `${from}\u0000${to}`;
      if (seen.has(edgeKey)) return;
      seen.add(edgeKey);
      const list = outgoing.get(from) ?? [];
      list.push(to);
      outgoing.set(from, list);
    };

    const sequences = (component.model?.nodes ?? [])
      .filter((node: any) => node.category === 'SEQUENCE')
      .map((node: any) => ({
        key: String(node.key),
        sequenceNo: Number(node.sequenceNo ?? 0)
      }));

    const mainSequenceKey = sequences.some((sequence: any) => sequence.key === 'S1')
      ? 'S1'
      : [...sequences].sort((a: any, b: any) => a.sequenceNo - b.sequenceNo)[0]?.key ?? '';

    const feCount = Number(component.model?.functionEvents?.length ?? 0);
    if (feCount > 0) {
      add(BASELINE_START_KEY, 'FEPOINT-1');
      for (let column = 1; column < feCount; column += 1) {
        add(`FEPOINT-${column}`, `FEPOINT-${column + 1}`);
      }
      add(`FEPOINT-${feCount}`, BASELINE_END_KEY);
    } else {
      add(BASELINE_START_KEY, BASELINE_END_KEY);
    }

    if (mainSequenceKey) add(BASELINE_END_KEY, mainSequenceKey);

    (component.model?.links ?? []).forEach((link: any) => {
      add(String(link.from ?? ''), String(link.to ?? ''));
    });

    return outgoing;
  };

  const collectLogicalDescendants = (component: any, sourceKey: string): Set<string> => {
    const outgoing = buildLogicalOutgoing(component);
    const reachable = new Set<string>();
    const queue = [sourceKey];

    while (queue.length) {
      const key = queue.shift()!;
      if (reachable.has(key)) continue;
      reachable.add(key);
      (outgoing.get(key) ?? []).forEach((target) => {
        if (!reachable.has(target)) queue.push(target);
      });
    }

    return reachable;
  };

  const centeredAnchorOwner = (key: string): string | null => {
    if (!key.startsWith(CENTER_ANCHOR_PREFIX)) return null;
    const match = /^__ETC-(.+)-(\d+)$/.exec(key);
    if (!match) return null;
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  };

  const hasCenteredRoutes = (diagram: go.Diagram): boolean => {
    let centered = false;
    diagram.links.each((link: go.Link) => {
      if ((link.data as any)?.[CENTER_ROUTE]) centered = true;
    });
    return centered;
  };

  /**
   * Standard mode can still be followed directly through GoJS because its links
   * preserve the logical source -> target direction.
   */
  const applyStandardForwardHighlight = (component: any, sourceKey: string): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return;

    const source = diagram.findNodeForKey(sourceKey);
    if (!source) return;

    const visitedNodes = new Set<go.Node>([source]);
    const visitedLinks = new Set<go.Link>();
    const queue: go.Node[] = [source];

    while (queue.length) {
      const current = queue.shift()!;
      current.findLinksOutOf().each((link: go.Link) => {
        visitedLinks.add(link);
        const target = link.toNode;
        if (!target || visitedNodes.has(target)) return;
        visitedNodes.add(target);
        queue.push(target);
      });
    }

    visitedLinks.forEach(setLinkActive);
    visitedNodes.forEach((node) => {
      if ((node.data as any)?.category === 'SEQUENCE') setSequenceActive(node);
    });
  };

  /**
   * Centered mode follows the logical ET and then maps that logical subtree back
   * to the synthetic consequence-first routes.
   *
   * Result: selecting FE2 highlights only FE2 -> ... -> consequences and every
   * branch created from that point. Nothing upstream of FE2 is selected, and a
   * branch located geometrically above the selected node is no longer missed.
   */
  const applyCenteredForwardHighlight = (component: any, sourceKey: string): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return;

    const reachable = collectLogicalDescendants(component, sourceKey);

    diagram.links.each((link: go.Link) => {
      const data = link.data as any;
      if (!data?.[CENTER_ROUTE]) return;

      const fromKey = String((link.fromNode?.data as any)?.key ?? data?.from ?? '');
      const toKey = String((link.toNode?.data as any)?.key ?? data?.to ?? '');

      // Every centered source owns one spine plus all horizontal exits. Anchor keys
      // encode that logical source. When an exit is directly on sourceY, its from
      // node is the logical source itself and is used as the fallback owner.
      const owner = centeredAnchorOwner(fromKey)
        ?? centeredAnchorOwner(toKey)
        ?? fromKey;

      if (reachable.has(owner)) setLinkActive(link);
    });

    diagram.nodes.each((node: go.Node) => {
      const data = node.data as any;
      if (data?.category === 'SEQUENCE' && reachable.has(String(data.key))) {
        setSequenceActive(node);
      }
    });
  };

  const applyForwardOnlyHighlight = (component: any, sourceKey: string): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram || !diagram.findNodeForKey(sourceKey)) return;

    resetVisuals(component);

    if (hasCenteredRoutes(diagram)) {
      applyCenteredForwardHighlight(component, sourceKey);
    } else {
      applyStandardForwardHighlight(component, sourceKey);
    }
  };

  prototype.selectBranchSource = function(key: string): void {
    originalSelectBranchSource.call(this, key);

    // The context-menu patch also applies a sequence-subtree highlight. Run after
    // it so the final visual state is always the exact forward subtree beginning at
    // the selected node, in both Standard and consequence-first Centered modes.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => applyForwardOnlyHighlight(this, key));
    });
  };
}
