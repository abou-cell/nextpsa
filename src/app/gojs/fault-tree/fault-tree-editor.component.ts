import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import * as go from 'gojs';
import {
  FaultTreeLinkData,
  FaultTreeModel,
  FaultTreeNodeData,
  GateType
} from '../../core/models/psa.models';
import {
  gateCaption,
  gateGeometry,
  hasOutputNegationBubble,
  HOUSE_EVENT_GEOMETRY,
  isKofNGate,
  TRANSFER_GEOMETRY
} from './fault-tree-symbols';

/**
 * RiskSpectrum-style branch link.
 *
 * The supplied RiskSpectrum screenshots use a fixed local branch grammar:
 * parent symbol -> 22 px vertical drop -> shared horizontal rail ->
 * 6 px vertical drop into every direct child on that branch.
 *
 * Because all direct children of a gate are placed on one TreeLayout layer,
 * links from the same parent overlap on the first vertical segment and on
 * the common rail. This reproduces the compact "bus" appearance of the
 * desktop Fault Tree editor instead of generic per-link orthogonal routing.
 */
type FaultTreeLayoutMode = 'LEFT' | 'CENTERED';

interface FaultTreeClipboardSnapshot {
  nodes: FaultTreeNodeData[];
  links: FaultTreeLinkData[];
  positions: Map<string, go.Point>;
  rootKeys: string[];
}

class FaultTreeCommandHandler extends go.CommandHandler {
  cutAction?: () => boolean;
  copyAction?: () => boolean;
  pasteAction?: () => boolean;
  tagAction?: () => boolean;
  canCutAction?: () => boolean;
  canCopyAction?: () => boolean;
  canPasteAction?: () => boolean;
  canTagAction?: () => boolean;

  override canCutSelection(): boolean {
    if (this.canCutAction?.()) return true;
    return super.canCutSelection();
  }

  override canCopySelection(): boolean {
    if (this.canCopyAction?.()) return true;
    return super.canCopySelection();
  }

  override canPasteSelection(): boolean {
    if (this.canPasteAction?.()) return true;
    return super.canPasteSelection();
  }

  override cutSelection(): void {
    if (this.cutAction?.()) return;
    super.cutSelection();
  }

  override copySelection(): void {
    if (this.copyAction?.()) return;
    super.copySelection();
  }

  override pasteSelection(pos?: go.Point): void {
    if (this.pasteAction?.()) return;
    super.pasteSelection(pos);
  }

  override doKeyDown(): void {
    const input = this.diagram?.lastInput;
    const key = input?.key?.toLowerCase();
    const modifier = Boolean(input?.control || input?.meta);

    // Explicitly route Ctrl/Cmd+X/C/V through the NextPSA FT clipboard.
    if (modifier && key === 'x' && this.canCutSelection()) {
      this.cutSelection();
      return;
    }

    if (modifier && key === 'c' && this.canCopySelection()) {
      this.copySelection();
      return;
    }

    if (modifier && key === 'v' && this.canPasteSelection()) {
      this.pasteSelection();
      return;
    }

    // RiskSpectrum-style Tag shortcut. Ctrl/Cmd+T applies the currently
    // selected tag colour to one selected component or a selected branch.
    if (modifier && key === 't' && this.canTagAction?.()) {
      const nativeEvent = input?.event as KeyboardEvent | null | undefined;
      nativeEvent?.preventDefault();
      this.tagAction?.();
      return;
    }

    super.doKeyDown();
  }
}

interface CenteredSubtreePlan {
  positions: Map<go.Node, number>;
  left: number[];
  right: number[];
}

class RiskSpectrumLevelLayout extends go.TreeLayout {
  static readonly LEVEL_PITCH = 131;

  mode: FaultTreeLayoutMode = 'LEFT';

  private rootAnchor: go.Point | null = null;

  resetRootAnchor(): void {
    this.rootAnchor = null;
  }

  override commitNodes(): void {
    super.commitNodes();

    const diagram = this.diagram;
    if (!diagram) return;

    let root: go.Node | null = null;

    const nodeIterator = diagram.nodes;
    while (nodeIterator.next()) {
      const candidate = nodeIterator.value;
      const data = candidate.data as FaultTreeNodeData;
      if (data.category === 'TOP_EVENT') {
        root = candidate;
        break;
      }
    }

    if (!root) {
      const fallbackIterator = diagram.nodes;
      while (fallbackIterator.next()) {
        const candidate = fallbackIterator.value;
        if (!candidate.findLinksInto().first()) {
          root = candidate;
          break;
        }
      }
    }

    if (!root) return;

    const fixedRoot = root;
    const layoutRootPosition = fixedRoot.position.copy();
    const anchor = this.rootAnchor ?? layoutRootPosition.copy();

    this.rootAnchor = anchor;

    const xShift = anchor.x - layoutRootPosition.x;
    const depth = new Map<go.Node, number>();
    const queue: go.Node[] = [fixedRoot];

    depth.set(fixedRoot, 0);

    while (queue.length) {
      const current = queue.shift()!;
      const currentDepth = depth.get(current) ?? 0;

      current.findNodesOutOf().each((child) => {
        const nextDepth = currentDepth + 1;
        const existingDepth = depth.get(child);

        if (existingDepth === undefined || nextDepth < existingDepth) {
          depth.set(child, nextDepth);
          queue.push(child);
        }
      });
    }

    depth.forEach((level, node) => {
      const layoutX = node.position.x + xShift;
      const x = level === 0 ? anchor.x : layoutX;
      const y = anchor.y + level * RiskSpectrumLevelLayout.LEVEL_PITCH;

      // Attached nodes use TreeLayout X positions so every component/subtree
      // occupies a collision-free magnetic slot. Y remains level-locked.
      node.moveTo(x, y);
    });

    // In LEFT mode the first/leftmost child of every Gate is placed on the exact
    // same X axis as the parent's OUT port. This removes the tiny horizontal hook
    // visible on the first branch and produces the straight RiskSpectrum stem.
    if (this.mode === 'LEFT') {
      this.alignFirstChildrenToParentOutputs(fixedRoot);
    } else {
      this.arrangeCenteredSubtrees(fixedRoot);
    }

    // Nodes that are not connected to the Top Event are free objects. TreeLayout
    // may inspect/place them internally, but their user-defined X/Y position must
    // be restored whenever a layout is recomputed elsewhere in the tree.
    diagram.nodes.each((node) => {
      if (depth.has(node)) return;

      const data = node.data as FaultTreeNodeData;

      if (Number.isFinite(data.manualX) && Number.isFinite(data.manualY)) {
        node.moveTo(data.manualX!, data.manualY!);
      }
    });
  }

  private alignFirstChildrenToParentOutputs(root: go.Node): void {
    const queue: go.Node[] = [root];
    const visited = new Set<go.Key>();

    while (queue.length) {
      const parent = queue.shift()!;
      if (visited.has(parent.key)) continue;
      visited.add(parent.key);

      const children: go.Node[] = [];
      parent.findNodesOutOf().each((child) => children.push(child));

      children.sort((a, b) => {
        const ao = Number((a.data as FaultTreeNodeData).siblingOrder ?? 0);
        const bo = Number((b.data as FaultTreeNodeData).siblingOrder ?? 0);
        if (ao !== bo) return ao - bo;
        return a.actualBounds.center.x - b.actualBounds.center.x;
      });

      const firstChild = children[0];

      if (firstChild) {
        const outPort = parent.findPort('OUT');
        const inPort = firstChild.findPort('IN');

        if (outPort && inPort) {
          const parentX = outPort.getDocumentPoint(go.Spot.Center).x;
          const childX = inPort.getDocumentPoint(go.Spot.Center).x;
          const dx = parentX - childX;

          if (Math.abs(dx) > 0.25) {
            this.shiftSubtree(firstChild, dx);
          }
        }
      }

      children.forEach((child) => queue.push(child));
    }
  }

  /**
   * Strict non-overlapping centered/pyramid layout.
   *
   * Each subtree is represented by horizontal contours at every relative depth.
   * Sibling subtrees are separated until NONE of those contours intersect.
   * The FT is allowed to become as wide as necessary; Fit is responsible for
   * fitting the resulting engineering drawing into the viewport.
   */
  private arrangeCenteredSubtrees(root: go.Node): void {
    const plan = this.buildCenteredSubtreePlan(root);

    // The root of the displayed FT is anchored by its OUT axis. Every other
    // subtree root is positioned by its IN axis, because that is where the
    // parent branch physically terminates.
    const rootAxisX = this.getOutputAxisX(root);

    plan.positions.forEach((relativeX, node) => {
      const targetAxisX = rootAxisX + relativeX;
      const currentAxisX = node === root
        ? this.getOutputAxisX(node)
        : this.getInputAxisX(node);
      const dx = targetAxisX - currentAxisX;

      if (Math.abs(dx) > 0.001) {
        node.moveTo(node.position.x + dx, node.position.y);
      }
    });

    // Final deterministic pass: for one child or any odd child count, align
    // the child IN to the REAL Gate-symbol OUT port. The OUT port remains on
    // the gate artwork so the visible line always starts directly on the gate.
    this.enforceCenteredParentChildAxes(root);

    // Final routes must be computed from the reconciled exact axes.
    root.diagram?.links.each((link) => link.invalidateRoute());
  }

  private buildCenteredSubtreePlan(root: go.Node): CenteredSubtreePlan {
    const gap = 30;
    const inputAxisX = this.getInputAxisX(root);
    const outputAxisX = this.getOutputAxisX(root);
    const outputOffsetFromInput = outputAxisX - inputAxisX;
    const bounds = root.actualBounds;

    // A subtree is externally connected through its IN axis. Its children,
    // however, originate from the parent's OUT axis. Keeping this offset
    // explicit prevents a small "dog-leg" on K/N, OR, AND, etc.
    const leftFromAxis = bounds.left - inputAxisX;
    const rightFromAxis = bounds.right - inputAxisX;

    const result: CenteredSubtreePlan = {
      positions: new Map<go.Node, number>([[root, 0]]),
      left: [leftFromAxis],
      right: [rightFromAxis]
    };

    const children = this.sortedChildren(root);
    if (!children.length) return result;

    const childPlans = children.map((child) => ({
      child,
      plan: this.buildCenteredSubtreePlan(child),
      offset: 0
    }));

    const unionLeft: number[] = [];
    const unionRight: number[] = [];

    const addToUnion = (plan: CenteredSubtreePlan, offset: number): void => {
      const depthCount = Math.max(plan.left.length, plan.right.length);

      for (let depth = 0; depth < depthCount; depth += 1) {
        const left = plan.left[depth] + offset;
        const right = plan.right[depth] + offset;

        unionLeft[depth] = unionLeft[depth] === undefined
          ? left
          : Math.min(unionLeft[depth], left);

        unionRight[depth] = unionRight[depth] === undefined
          ? right
          : Math.max(unionRight[depth], right);
      }
    };

    const placeLeftOfUnion = (plan: CenteredSubtreePlan): number => {
      let offset = Number.POSITIVE_INFINITY;
      const depthCount = Math.min(plan.right.length, unionLeft.length);

      for (let depth = 0; depth < depthCount; depth += 1) {
        offset = Math.min(
          offset,
          unionLeft[depth] - gap - plan.right[depth]
        );
      }

      return Number.isFinite(offset) ? offset : 0;
    };

    const placeRightOfUnion = (plan: CenteredSubtreePlan): number => {
      let offset = Number.NEGATIVE_INFINITY;
      const depthCount = Math.min(plan.left.length, unionRight.length);

      for (let depth = 0; depth < depthCount; depth += 1) {
        offset = Math.max(
          offset,
          unionRight[depth] + gap - plan.left[depth]
        );
      }

      return Number.isFinite(offset) ? offset : 0;
    };

    const count = childPlans.length;

    if (count % 2 === 1) {
      // A unique middle child exists: its IN axis is exactly the parent OUT axis.
      const middleIndex = Math.floor(count / 2);
      const middle = childPlans[middleIndex];

      // Align the middle child's IN axis with THIS parent's OUT axis.
      // child plan coordinates are relative to child IN, parent plan coordinates
      // are relative to parent IN, hence the explicit OUT-vs-IN offset.
      middle.offset = outputOffsetFromInput;
      addToUnion(middle.plan, middle.offset);

      for (let index = middleIndex - 1; index >= 0; index -= 1) {
        const entry = childPlans[index];
        entry.offset = placeLeftOfUnion(entry.plan);
        addToUnion(entry.plan, entry.offset);
      }

      for (let index = middleIndex + 1; index < count; index += 1) {
        const entry = childPlans[index];
        entry.offset = placeRightOfUnion(entry.plan);
        addToUnion(entry.plan, entry.offset);
      }
    } else {
      // No unique center child. Determine the minimum separation required
      // between the two central subtrees across ALL their contour depths.
      const rightMiddleIndex = count / 2;
      const leftMiddleIndex = rightMiddleIndex - 1;
      const leftMiddle = childPlans[leftMiddleIndex];
      const rightMiddle = childPlans[rightMiddleIndex];

      let requiredSeparation = gap;
      const commonDepth = Math.min(
        leftMiddle.plan.right.length,
        rightMiddle.plan.left.length
      );

      for (let depth = 0; depth < commonDepth; depth += 1) {
        requiredSeparation = Math.max(
          requiredSeparation,
          leftMiddle.plan.right[depth] +
            gap -
            rightMiddle.plan.left[depth]
        );
      }

      leftMiddle.offset = -requiredSeparation / 2;
      rightMiddle.offset = requiredSeparation / 2;

      addToUnion(leftMiddle.plan, leftMiddle.offset);
      addToUnion(rightMiddle.plan, rightMiddle.offset);

      for (let index = leftMiddleIndex - 1; index >= 0; index -= 1) {
        const entry = childPlans[index];
        entry.offset = placeLeftOfUnion(entry.plan);
        addToUnion(entry.plan, entry.offset);
      }

      for (let index = rightMiddleIndex + 1; index < count; index += 1) {
        const entry = childPlans[index];
        entry.offset = placeRightOfUnion(entry.plan);
        addToUnion(entry.plan, entry.offset);
      }
    }

    // Merge all child-relative node positions into the parent-relative plan.
    childPlans.forEach(({ plan, offset }) => {
      plan.positions.forEach((relativeX, node) => {
        result.positions.set(node, relativeX + offset);
      });
    });

    // Parent occupies relative depth 0. Child contour depth 0 becomes parent
    // contour depth 1, etc.
    for (let depth = 0; depth < unionLeft.length; depth += 1) {
      result.left[depth + 1] = unionLeft[depth];
      result.right[depth + 1] = unionRight[depth];
    }

    return result;
  }

  private getInputAxisX(node: go.Node): number {
    const input = node.findPort('IN');
    const x = input?.getDocumentPoint(go.Spot.Center).x;
    return Number.isFinite(x) ? x! : node.actualBounds.center.x;
  }

  private getOutputAxisX(node: go.Node): number {
    const output = node.findPort('OUT');
    const x = output?.getDocumentPoint(go.Spot.Center).x;
    return Number.isFinite(x) ? x! : node.actualBounds.center.x;
  }

  /**
   * Exact centered-axis reconciliation after all contour packing is complete.
   * This is intentionally a final pass so no later layout operation can
   * reintroduce a 1-3 px horizontal kink.
   */
  private enforceCenteredParentChildAxes(root: go.Node): void {
    const queue: go.Node[] = [root];
    const visited = new Set<go.Key>();

    while (queue.length) {
      const parent = queue.shift()!;
      if (visited.has(parent.key)) continue;
      visited.add(parent.key);

      const children = this.sortedChildren(parent);

      if (children.length > 0 && children.length % 2 === 1) {
        const middle = children[Math.floor(children.length / 2)];
        const parentOutX = this.getOutputAxisX(parent);
        const childInX = this.getInputAxisX(middle);
        const dx = parentOutX - childInX;

        if (Math.abs(dx) > 0.0001) {
          this.shiftSubtree(middle, dx);
        }
      }

      children.forEach((child) => queue.push(child));
    }
  }

  private sortedChildren(parent: go.Node): go.Node[] {
    const children: go.Node[] = [];
    parent.findNodesOutOf().each((child) => children.push(child));

    children.sort((a, b) => {
      const ao = Number((a.data as FaultTreeNodeData).siblingOrder ?? 0);
      const bo = Number((b.data as FaultTreeNodeData).siblingOrder ?? 0);

      if (ao !== bo) return ao - bo;

      return a.actualBounds.center.x - b.actualBounds.center.x;
    });

    return children;
  }

  private shiftSubtree(root: go.Node, dx: number): void {
    const stack: go.Node[] = [root];
    const visited = new Set<go.Key>();

    while (stack.length) {
      const current = stack.pop()!;
      if (visited.has(current.key)) continue;
      visited.add(current.key);

      current.moveTo(current.position.x + dx, current.position.y);

      current.findNodesOutOf().each((child) => stack.push(child));
    }
  }
}

class RiskSpectrumBranchLink extends go.Link {
  static readonly PARENT_DROP = 22;

  private isCenteredMiddleChildLink(): boolean {
    const diagram = this.diagram;
    const parent = this.fromNode;
    const child = this.toNode;

    if (!diagram || !parent || !child) return false;

    const layout = diagram.layout;
    if (!(layout instanceof RiskSpectrumLevelLayout) || layout.mode !== 'CENTERED') {
      return false;
    }

    const children: go.Node[] = [];
    parent.findNodesOutOf().each((node) => children.push(node));

    children.sort((a, b) => {
      const ao = Number((a.data as FaultTreeNodeData).siblingOrder ?? 0);
      const bo = Number((b.data as FaultTreeNodeData).siblingOrder ?? 0);
      if (ao !== bo) return ao - bo;
      return a.actualBounds.center.x - b.actualBounds.center.x;
    });

    if (!children.length || children.length % 2 === 0) return false;

    return children[Math.floor(children.length / 2)] === child;
  }

  override computePoints(): boolean {
    const fromPort = this.fromPort;
    const toPort = this.toPort;

    if (!fromPort || !toPort) return super.computePoints();

    const start = fromPort.getDocumentPoint(go.Spot.Center);
    const end = toPort.getDocumentPoint(go.Spot.Center);

    if (
      !Number.isFinite(start.x) ||
      !Number.isFinite(start.y) ||
      !Number.isFinite(end.x) ||
      !Number.isFinite(end.y)
    ) {
      return super.computePoints();
    }

    this.clearPoints();

    // CENTERED mode: the unique/middle branch is always one continuous
    // vertical vector. Using only two points also avoids sub-pixel joins after Fit.
    if (this.isCenteredMiddleChildLink()) {
      this.addPoint(start);
      this.addPoint(new go.Point(start.x, end.y));
      return true;
    }

    const railY = start.y + RiskSpectrumBranchLink.PARENT_DROP;

    this.addPoint(start);

    if (Math.abs(start.x - end.x) <= 0.01) {
      // Keep the existing clean vertical behavior in left mode when axes
      // already happen to be identical.
      this.addPoint(new go.Point(start.x, end.y));
    } else {
      this.addPoint(new go.Point(start.x, railY));
      this.addPoint(new go.Point(end.x, railY));
      this.addPoint(end);
    }

    return true;
  }
}

@Component({
  selector: 'app-fault-tree-editor',
  standalone: true,
  template: `
    <div class="ft-shell">
      <section class="diagram-shell">
        <div class="diagram-toolbar">
          <div class="toolbar-group">
            <button type="button" title="Undo" (click)="undo()">↶</button>
            <button type="button" title="Redo" (click)="redo()">↷</button>
          </div>
          <div class="toolbar-separator"></div>
          <div class="toolbar-group">
            <button type="button" title="Zoom out" (click)="zoom(-0.1)">−</button>
            <span class="zoom-label">{{ zoomPercent }}%</span>
            <button type="button" title="Zoom in" (click)="zoom(0.1)">+</button>
            <button type="button" (click)="fit()">Fit</button>
            <button
              type="button"
              class="layout-toggle"
              [class.active]="layoutMode === 'LEFT'"
              title="Left-aligned RiskSpectrum layout"
              aria-label="Left-aligned Fault Tree"
              (click)="setLayoutMode('LEFT')">
              <svg viewBox="0 0 26 18" aria-hidden="true">
                <path d="M5 2v5h16M5 7v9M13 7v9M21 7v9"></path>
              </svg>
            </button>
            <button
              type="button"
              class="layout-toggle"
              [class.active]="layoutMode === 'CENTERED'"
              title="Centered pyramid layout"
              aria-label="Centered pyramid Fault Tree"
              (click)="setLayoutMode('CENTERED')">
              <svg viewBox="0 0 26 18" aria-hidden="true">
                <path d="M13 2v5M4 7h18M4 7v9M13 7v9M22 7v9"></path>
              </svg>
            </button>
          </div>
          <div class="toolbar-group push-right">
            <span class="status-dot"></span>
            GoJS Fault Tree
          </div>
        </div>

        <div class="palette-toolbar">
          <div class="palette-toolbar-left">
            <strong>Fault Tree Symbols</strong>
          </div>

          <div class="palette-toolbar-center">
            <div
              #paletteDiv
              class="palette-toolbar-canvas"
              aria-label="Fault Tree symbol palette">
            </div>
          </div>

          <div class="palette-toolbar-right">
            <span [class.armed-parent]="!!insertionParentId || !!branchAttachParentId">
              {{
                branchAttachParentId
                  ? ('Branch: ' + branchAttachParentId + ' → click a free component')
                  : insertionParentId
                    ? ('Parent: ' + insertionParentId + ' → click a symbol')
                    : 'Select a Gate, then click a symbol'
              }}
            </span>
          </div>
        </div>

        <div #diagramDiv class="diagram-canvas" aria-label="NextPSA fault tree diagram"></div>
      </section>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; min-height: 520px; }
    .ft-shell { height: 100%; background: #fff; }
    .diagram-shell {
      min-width: 0;
      min-height: 0;
      height: 100%;
      display: grid;
      grid-template-rows: 42px 56px 1fr;
    }

    .diagram-toolbar {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 10px;
      border-bottom: 1px solid var(--nps-border);
      background: #fff;
      color: var(--nps-text-muted);
      font-size: 10px;
    }
    .toolbar-group { display: flex; align-items: center; gap: 5px; }
    .toolbar-group button {
      height: 28px;
      min-width: 30px;
      border: 1px solid var(--nps-border);
      border-radius: 6px;
      background: #fff;
      color: var(--nps-text);
      cursor: pointer;
      font-weight: 600;
    }
    .toolbar-group button:hover { background: #eef5ff; border-color: #b6cdf7; }
    .toolbar-group button.layout-toggle {
      width: 34px;
      min-width: 34px;
      padding: 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .toolbar-group button.layout-toggle svg {
      width: 24px;
      height: 17px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: square;
      stroke-linejoin: miter;
    }
    .toolbar-group button.layout-toggle.active {
      color: #0f5bd8;
      border-color: #6ea2f8;
      background: #eaf2ff;
      box-shadow: inset 0 0 0 1px #b7d0fb;
    }
    .toolbar-separator { width: 1px; height: 20px; background: var(--nps-border); }
    .zoom-label { min-width: 38px; text-align: center; font-variant-numeric: tabular-nums; }
    .push-right { margin-left: auto; white-space: nowrap; }
    .status-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; }

    .palette-toolbar {
      display: grid;
      grid-template-columns: 220px minmax(0, 1fr) 220px;
      align-items: center;
      gap: 8px;
      min-height: 56px;
      padding: 0 10px;
      border-bottom: 1px solid #d7dee7;
      background: #f8fafc;
    }
    .palette-toolbar-left {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      font-size: 14px;
      color: #0f172a;
    }
    .palette-toolbar-center {
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .palette-toolbar-canvas {
      width: 100%;
      height: 44px;
      max-width: 760px;
      background: transparent;
    }
    .palette-toolbar-right {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      font-size: 12px;
      color: #64748b;
      white-space: nowrap;
    }
    .palette-toolbar-right .armed-parent {
      color: #0f5bd8;
      font-weight: 700;
    }

    .diagram-canvas {
      min-height: 470px;
      width: 100%;
      height: 100%;
      background: #fff;
    }

    @media (max-width: 1180px) {
      .palette-toolbar {
        grid-template-columns: 150px minmax(0, 1fr) 170px;
      }
      .palette-toolbar-left { font-size: 12px; }
      .palette-toolbar-right { font-size: 10px; }
    }
  `]
})
export class FaultTreeEditorComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('diagramDiv', { static: true }) private diagramDiv!: ElementRef<HTMLDivElement>;
  @ViewChild('paletteDiv', { static: true }) private paletteDiv!: ElementRef<HTMLDivElement>;

  @Input({ required: true }) model!: FaultTreeModel;
  @Output() readonly selectedNodeChange = new EventEmitter<FaultTreeNodeData | null>();
  @Output() readonly recordOpen = new EventEmitter<FaultTreeNodeData>();
  @Output() readonly changeNodeEvent = new EventEmitter<FaultTreeNodeData>();

  private diagram?: go.Diagram;
  private palette?: go.Palette;
  private insertionSerial = 0;
  private faultTreeClipboard: FaultTreeClipboardSnapshot | null = null;

  // The logical father selected in the FT canvas. This survives focus changes
  // when the user clicks the separate GoJS Palette diagram.
  private insertionParentKey: go.Key | null = null;
  insertionParentId: string | null = null;

  // Existing free-node attachment mode:
  // click a branch link, then click an unattached component.
  private branchAttachParentKey: go.Key | null = null;
  branchAttachParentId: string | null = null;

  layoutMode: FaultTreeLayoutMode = 'LEFT';
  zoomPercent = 100;

  constructor(private readonly zone: NgZone) {}

  ngAfterViewInit(): void {
    this.initializeDiagram();
    this.applyModel();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['model'] && this.diagram) this.applyModel();
  }

  ngOnDestroy(): void {
    if (this.diagram) this.diagram.div = null;
    if (this.palette) this.palette.div = null;
  }

  undo(): void {
    this.diagram?.commandHandler.undo();
  }

  redo(): void {
    this.diagram?.commandHandler.redo();
  }

  setLayoutMode(mode: FaultTreeLayoutMode): void {
    if (!this.diagram) return;

    const layout = this.diagram.layout;

    if (!(layout instanceof RiskSpectrumLevelLayout)) return;

    this.layoutMode = mode;
    layout.mode = mode;
    layout.alignment = mode === 'LEFT'
      ? go.TreeAlignment.Start
      : go.TreeAlignment.CenterChildren;

    layout.invalidateLayout();
    this.diagram.layoutDiagram(true);

    if (mode === 'CENTERED') {
      // Centered mode is also a presentation command: always fit the complete
      // FT into the current editor viewport and center the resulting document.
      this.diagram.commandHandler.zoomToFit();
      this.diagram.centerRect(this.diagram.documentBounds);
      this.updateZoomLabel();
    }
  }

  fit(): void {
    this.diagram?.commandHandler.zoomToFit();
    this.updateZoomLabel();
  }

  zoom(delta: number): void {
    if (!this.diagram) return;
    this.diagram.scale = Math.min(2.5, Math.max(0.35, this.diagram.scale + delta));
    this.updateZoomLabel();
  }

  /**
   * RiskSpectrum does not draw visible connection handles. The ports remain
   * available to GoJS only as logical attachment points for routing/hit-testing.
   * They are rectangular, fully transparent and never rendered as circles.
   */
  private makeTopPort(): go.Shape {
    const $ = go.GraphObject.make;
    return $(go.Shape, 'Rectangle', {
      portId: 'IN',
      width: 12,
      height: 8,
      fill: 'transparent',
      stroke: null,
      opacity: 0,
      alignment: go.Spot.Top,
      alignmentFocus: go.Spot.Center,
      fromLinkable: false,
      toLinkable: true,
      toSpot: go.Spot.Top,
      cursor: 'pointer'
    });
  }

  /**
   * Invisible logical output for Gate / Top Event nodes only.
   * BE / HE / Diamond / Transfer intentionally never receive an OUT port.
   */
  private makeBottomPort(alignment: go.Spot = go.Spot.Bottom): go.Shape {
    const $ = go.GraphObject.make;
    return $(go.Shape, 'Rectangle', {
      portId: 'OUT',
      width: 12,
      height: 8,
      fill: 'transparent',
      stroke: null,
      opacity: 0,
      alignment,
      alignmentFocus: go.Spot.Center,
      fromLinkable: true,
      toLinkable: false,
      fromSpot: go.Spot.Bottom,
      cursor: 'pointer'
    });
  }

  private initializeDiagram(): void {
    const $ = go.GraphObject.make;

    const labelPanel = (fill = '#ffffff', stroke = '#111827') =>
      $(go.Panel, 'Auto',
        {
          name: 'LABEL',
          width: 132,
          height: 69
        },
        $(go.Shape, 'RoundedRectangle', {
          fill,
          stroke,
          strokeWidth: 1,
          parameter1: 2
        }),
        $(go.Panel, 'Table',
          {
            width: 132,
            height: 69,
            defaultStretch: go.Stretch.Horizontal
          },
          $(go.RowColumnDefinition, { row: 0, height: 50 }),
          $(go.RowColumnDefinition, { row: 1, height: 19 }),
          $(go.TextBlock, {
            row: 0,
            margin: new go.Margin(3, 4, 2, 4),
            font: '10px Inter, "Segoe UI", sans-serif',
            stroke: '#111111',
            textAlign: 'left',
            verticalAlignment: go.Spot.Top,
            wrap: go.Wrap.Fit,
            overflow: go.TextOverflow.Ellipsis,
            maxLines: 3
          }, new go.Binding('text', 'description')),
          $(go.Shape, 'LineH', {
            row: 1,
            alignment: go.Spot.Top,
            stretch: go.Stretch.Horizontal,
            stroke,
            strokeWidth: 1
          }),
          $(go.TextBlock, {
            row: 1,
            margin: new go.Margin(2, 3, 1, 3),
            font: '10px Inter, "Segoe UI", sans-serif',
            stroke: '#111111',
            textAlign: 'center',
            verticalAlignment: go.Spot.Center
          }, new go.Binding('text', 'id'))
        )
      );

    /**
     * RiskSpectrum-style Gate artwork.
     * The gate body is intentionally separate from the GoJS connection ports.
     * NAND / NOR use the same gate body plus the inversion bubble above it.
     */
    const gateArtwork = (gateType: GateType, includeOutputPort = true) => {
      const kofn = isKofNGate(gateType);

      // The OR/NOR/XOR lower boundary is concave: at X=50% the visible curve
      // sits a few pixels above the artwork-box bottom. Place OUT on that real
      // visible boundary instead of on the container bottom.
      const outputAlignment = kofn
        // K/N uses an explicit visible rectangle starting at the top of a
        // slightly taller panel. Put OUT on the rectangle's real lower edge,
        // not on the panel bottom.
        ? new go.Spot(0.5, 0, 0, 20.8)
        : (gateType === 'OR' || gateType === 'NOR' || gateType === 'XOR')
          ? new go.Spot(0.5, 0.925)
          : go.Spot.Bottom;

      return $(go.Panel, 'Spot',
        {
          width: 40,
          // K/N gets 2 px of internal safety height so the 1.1 px outline is
          // never clipped. The visible rectangle itself still starts directly
          // below the record box, so no top blank band is reintroduced.
          height: kofn ? 22 : 34
        },
        $(go.Shape, {
            width: 32,
            height: 27,
            stretch: go.Stretch.Fill,
            fill: '#ffffff',
            stroke: '#111111',
            strokeWidth: 1.25,
            alignment: new go.Spot(0.5, 0.62),
            visible: !kofn,
            geometryString: gateGeometry(gateType)
          }
        ),
        $(go.Shape, 'Circle', {
          desiredSize: new go.Size(6, 6),
          fill: '#ffffff',
          stroke: '#111111',
          strokeWidth: 1.1,
          alignment: new go.Spot(0.5, 0, 0, 3),
          visible: hasOutputNegationBubble(gateType)
        }),
        $(go.Shape, 'Rectangle', {
          desiredSize: new go.Size(28, 20),
          fill: '#ffffff',
          stroke: '#111111',
          strokeWidth: 1.1,
          alignment: new go.Spot(0.5, 0, 0, 0.8),
          alignmentFocus: go.Spot.Top,
          visible: kofn
        }),
        $(go.TextBlock, {
            font: '8px Inter, sans-serif',
            stroke: '#111111',
            alignment: new go.Spot(0.5, 0, 0, 10.8),
            visible: kofn
          },
          new go.Binding('text', 'k', (k: number | undefined) => gateCaption(gateType, k))
        ),
        ...(includeOutputPort ? [this.makeBottomPort(outputAlignment)] : [])
      );
    };

    const basicCircleArtwork = () =>
      $(go.Shape, 'Circle', {
        desiredSize: new go.Size(28, 28),
        fill: '#ffffff',
        stroke: '#111111',
        strokeWidth: 1.2
      });

    const diamondArtwork = () =>
      $(go.Shape, 'Diamond', {
        desiredSize: new go.Size(26, 26),
        fill: '#ffffff',
        stroke: '#111111',
        strokeWidth: 1.2
      });

    const houseArtwork = () =>
      $(go.Shape, {
        geometryString: HOUSE_EVENT_GEOMETRY,
        desiredSize: new go.Size(28, 24),
        stretch: go.Stretch.Fill,
        fill: '#ffffff',
        stroke: '#111111',
        strokeWidth: 1.2
      });

    const transferArtwork = () =>
      $(go.Shape, {
        geometryString: TRANSFER_GEOMETRY,
        desiredSize: new go.Size(26, 26),
        stretch: go.Stretch.Fill,
        fill: '#ffffff',
        stroke: '#111111',
        strokeWidth: 1.2
      });

    const baseNodeProperties: Partial<go.Node> = {
      selectionAdorned: true,
      locationSpot: go.Spot.Center,

      // Components are draggable, but dragComputation applies RiskSpectrum rules:
      // free X/Y when unattached, horizontal-only when attached, and whole-branch
      // movement only after the complete branch has been selected.
      movable: true,
      dragComputation: (part, newLoc, snappedLoc) =>
        this.computeFaultTreeDrag(part, newLoc, snappedLoc),
      selectionChanged: (node) => {
        const data = node.isSelected ? node.data as FaultTreeNodeData : null;

        this.zone.run(() => {
          this.selectedNodeChange.emit(data);

          if (!data) {
            if (this.insertionParentKey === node.key) {
              this.insertionParentKey = null;
              this.insertionParentId = null;
            }
            return;
          }

          if (data.category === 'TOP_EVENT' || data.category === 'GATE') {
            this.insertionParentKey = node.key;
            this.insertionParentId = data.id;
          } else {
            // Clicking a terminal event cancels the armed father. A palette click
            // must never attach a new child to BE / HE / Diamond / Transfer.
            this.insertionParentKey = null;
            this.insertionParentId = null;
          }
        });
      },
      click: (_event, node) => {
        this.tryAttachExistingNodeToSelectedBranch(node as go.Node);
      },
      doubleClick: (_event, node) => {
        this.zone.run(() => this.recordOpen.emit((node as go.Node).data as FaultTreeNodeData));
      }
    };

    const contextNode = (obj: go.GraphObject): go.Node | null => {
      const adornment = obj.part;
      if (!(adornment instanceof go.Adornment)) return null;
      return adornment.adornedPart instanceof go.Node ? adornment.adornedPart : null;
    };

    const menuSeparator = () =>
      $(go.Shape, 'LineH', {
        stretch: go.Stretch.Horizontal,
        height: 1,
        stroke: '#d1d5db',
        margin: new go.Margin(3, 2)
      });

    const menuButton = (
      label: string,
      action: string,
      enabled = true
    ) =>
      $('ContextMenuButton',
        {
          height: 25,
          stretch: go.Stretch.Horizontal,
          isEnabled: enabled,
          opacity: enabled ? 1 : 0.42,
          click: (_event: go.InputEvent, obj: go.GraphObject) => {
            if (!enabled) return;
            const node = contextNode(obj);
            if (node) this.handleContextAction(action, node);
          }
        },
        $(go.TextBlock, label, {
          width: 176,
          margin: new go.Margin(3, 8),
          font: '10px Inter, "Segoe UI", sans-serif',
          stroke: '#111827',
          textAlign: 'left'
        })
      );

    const gateContextMenu = () =>
      $('ContextMenu',
        menuButton('Edit Event...', 'EDIT'),
        menuButton('Change node Event...', 'CHANGE_NODE', false),
        menuButton('Add input node   ›', 'ADD_INPUT'),
        menuButton('Negate node', 'NEGATE'),
        menuButton('State   ›', 'STATE'),
        menuSeparator(),
        menuButton('Edit Fault Tree...', 'EDIT_FAULT_TREE'),
        menuButton('Insert Fault Tree...', 'INSERT_FAULT_TREE'),
        menuSeparator(),
        menuButton('Break into Transfer...', 'BREAK_TRANSFER'),
        menuButton('Join transfer', 'JOIN_TRANSFER', false),
        menuButton('Jump', 'JUMP', false),
        menuButton('Jump to IE/FE', 'JUMP_IEFE', false),
        menuButton('Open Transfer branch', 'OPEN_TRANSFER_BRANCH', false),
        menuButton('Open CCF Group', 'OPEN_CCF_GROUP', false),
        menuSeparator(),
        menuButton('Select branch', 'SELECT_BRANCH'),
        menuButton('Select inputs', 'SELECT_INPUTS'),
        menuSeparator(),
        menuButton('Cut     Ctrl+X', 'CUT'),
        menuButton('Copy    Ctrl+C', 'COPY'),
        menuButton('Paste   Ctrl+V', 'PASTE'),
        menuButton('Delete', 'DELETE'),
        menuSeparator(),
        menuButton('Find...', 'FIND'),
        menuButton('Replace...', 'REPLACE'),
        menuSeparator(),
        menuButton('Set record Status   ›', 'RECORD_STATUS')
      );

    const terminalContextMenu = (transfer = false) =>
      $('ContextMenu',
        menuButton('Edit Event...', 'EDIT'),
        menuButton('Change node Event...', 'CHANGE_NODE'),
        menuButton('Add input node   ›', 'ADD_INPUT'),
        menuButton('Negate node', 'NEGATE'),
        menuButton('State   ›', 'STATE'),
        menuSeparator(),
        menuButton('Edit Fault Tree...', 'EDIT_FAULT_TREE'),
        menuButton('Insert Fault Tree...', 'INSERT_FAULT_TREE'),
        menuSeparator(),
        menuButton('Break into Transfer...', 'BREAK_TRANSFER', false),
        menuButton('Join transfer', 'JOIN_TRANSFER', transfer),
        menuButton('Jump', 'JUMP', transfer),
        menuButton('Jump to IE/FE', 'JUMP_IEFE', false),
        menuButton('Open Transfer branch', 'OPEN_TRANSFER_BRANCH', transfer),
        menuSeparator(),
        menuButton('Select branch', 'SELECT_BRANCH', false),
        menuButton('Select inputs', 'SELECT_INPUTS', false),
        menuSeparator(),
        menuButton('Cut     Ctrl+X', 'CUT'),
        menuButton('Copy    Ctrl+C', 'COPY'),
        menuButton('Paste   Ctrl+V', 'PASTE'),
        menuButton('Delete', 'DELETE'),
        menuSeparator(),
        menuButton('Find...', 'FIND'),
        menuButton('Replace...', 'REPLACE'),
        menuSeparator(),
        menuButton('Set record Status   ›', 'RECORD_STATUS')
      );

    const makeGateNodeTemplate = (
      gateType: GateType,
      topEvent = false
    ) =>
      $(go.Node, 'Spot',
        baseNodeProperties,
        {
          selectionObjectName: 'LABEL',
          contextMenu: gateContextMenu(),
          movable: !topEvent,
          copyable: !topEvent,
          deletable: !topEvent,
          cursor: topEvent ? 'default' : 'move'
        },
        $(go.Panel, 'Vertical',
          labelPanel(topEvent ? '#d0d0d0' : '#ffffff', '#111111'),
          // Restore the previous RiskSpectrum geometry: OUT belongs to the Gate
          // artwork itself, so every link starts directly on the symbol with no gap.
          gateArtwork(gateType, true)
        ),
        this.makeTopPort()
      );

    const makeTerminalNodeTemplate = (
      artwork: go.GraphObject
    ) =>
      $(go.Node, 'Spot',
        baseNodeProperties,
        {
          selectionObjectName: 'LABEL',
          contextMenu: terminalContextMenu(artwork instanceof go.Shape && artwork.geometryString === TRANSFER_GEOMETRY)
        },
        $(go.Panel, 'Vertical',
          labelPanel('#ffffff', '#111111'),
          $(go.Panel, 'Spot',
            { width: 34, height: 32 },
            artwork
          )
        ),
        this.makeTopPort()
      );

    const diagram = $(go.Diagram, this.diagramDiv.nativeElement, {
      allowDrop: true,
      initialAutoScale: go.AutoScale.Uniform,
      contentAlignment: go.Spot.TopCenter,
      padding: 42,
      grid: $(go.Panel, 'Grid',
        { gridCellSize: new go.Size(16, 16), visible: false },
        $(go.Shape, 'LineH', { stroke: '#eef2f6', strokeWidth: 0.45 }),
        $(go.Shape, 'LineV', { stroke: '#eef2f6', strokeWidth: 0.45 })
      ),
      'draggingTool.isGridSnapEnabled': true,
      'undoManager.isEnabled': true,
      layout: $(RiskSpectrumLevelLayout, {
        angle: 90,

        // Measured from the supplied RiskSpectrum FT screenshots:
        // parent output -> branch rail ~22 px; rail -> child box ~6 px.
        // TreeLayout layerSpacing is therefore 22 + 6 = 28 px.
        layerSpacing: 28,

        // RiskSpectrum keeps sibling record boxes very close: about 5-8 px
        // depending on zoom. Seven pixels gives the same compact branch row
        // with our 132 px record boxes.
        nodeSpacing: 14,

        // Default view: RiskSpectrum left-aligned branch grammar. The toolbar
        // can switch this same layout to CenterChildren for pyramid mode.
        alignment: go.TreeAlignment.Start,
        compaction: go.TreeCompaction.Block,
        sorting: go.TreeSorting.Ascending,
        comparer: (a: go.TreeVertex, b: go.TreeVertex) => {
          const ao = Number((a.node?.data as FaultTreeNodeData | undefined)?.siblingOrder ?? 0);
          const bo = Number((b.node?.data as FaultTreeNodeData | undefined)?.siblingOrder ?? 0);
          return ao - bo;
        },

        // Preserve the explicit IN/OUT spots used by the fixed branch router.
        setsPortSpot: false,
        setsChildPortSpot: false
      })
    });

    const commandHandler = new FaultTreeCommandHandler();
    commandHandler.cutAction = () => this.cutFaultTreeSelection(diagram);
    commandHandler.copyAction = () => this.copyFaultTreeSelection(diagram);
    commandHandler.pasteAction = () => this.pasteFaultTreeSelection(diagram);

    const hasCopyableSelection = (): boolean => {
      let hasCopyableNode = false;
      diagram.selection.each((part) => {
        if (
          part instanceof go.Node &&
          (part.data as FaultTreeNodeData).category !== 'TOP_EVENT'
        ) {
          hasCopyableNode = true;
        }
      });
      return hasCopyableNode;
    };

    commandHandler.canCutAction = hasCopyableSelection;
    commandHandler.canCopyAction = hasCopyableSelection;
    commandHandler.canPasteAction = () =>
      Boolean(this.faultTreeClipboard?.nodes.length);
    diagram.commandHandler = commandHandler;


    const gateTypes: readonly GateType[] = ['AND', 'OR', 'NAND', 'NOR', 'XOR', 'KOFN'];
    gateTypes.forEach((type) => {
      diagram.nodeTemplateMap.add(`GATE_${type}`, makeGateNodeTemplate(type));
      diagram.nodeTemplateMap.add(`TOP_EVENT_${type}`, makeGateNodeTemplate(type, true));
    });

    diagram.nodeTemplateMap.add('GATE_DEFAULT', makeGateNodeTemplate('OR'));
    diagram.nodeTemplateMap.add('TOP_EVENT_DEFAULT', makeGateNodeTemplate('OR', true));
    diagram.nodeTemplateMap.add('BASIC_EVENT_CIRCLE', makeTerminalNodeTemplate(basicCircleArtwork()));
    diagram.nodeTemplateMap.add('BASIC_EVENT_DIAMOND', makeTerminalNodeTemplate(diamondArtwork()));
    diagram.nodeTemplateMap.add('HOUSE_EVENT', makeTerminalNodeTemplate(houseArtwork()));
    diagram.nodeTemplateMap.add('TRANSFER', makeTerminalNodeTemplate(transferArtwork()));
    diagram.nodeTemplateMap.add('EXCHANGE_EVENT', makeTerminalNodeTemplate(transferArtwork()));

    diagram.linkTemplate =
      $(RiskSpectrumBranchLink, {
          selectable: true,
          relinkableFrom: false,
          relinkableTo: false,
          click: (_event: go.InputEvent, obj: go.GraphObject) => {
            if (obj.part instanceof go.Link) {
              this.armBranchAttachment(obj.part);
            }
          }
        },
        $(go.Shape, {
          stroke: '#111111',
          strokeWidth: 1.05
        })
      );

    diagram.addDiagramListener(
      'ViewportBoundsChanged',
      () => this.zone.run(() => this.updateZoomLabel())
    );

    diagram.addDiagramListener('SelectionMoved', () => {
      if (this.tryReparentSelectionAtDrop(diagram)) return;
      this.finalizeMagneticPlacement(diagram);
    });

    diagram.addDiagramListener('ExternalObjectsDropped', () => {
      const droppedNodes = this.normalizeExternalPaletteDrop(diagram);
      this.autoConnectDroppedNodes(diagram, droppedNodes);
      this.finalizeMagneticPlacement(diagram);
    });

    this.diagram = diagram;

    /**
     * The palette reuses the exact same vector artwork as the diagram.
     * GoJS renders these as vectors, so resolution remains sharp at any DPI.
     */
    const reinforcePaletteStrokes = (object: go.GraphObject): void => {
      if (object instanceof go.Shape && object.stroke) {
        object.strokeWidth = Math.max(3.4, object.strokeWidth * 2.35);
      }
      if (object instanceof go.Panel) {
        object.elements.each((child) => reinforcePaletteStrokes(child));
      }
    };

    const fixedSymbolSlot = (content: go.GraphObject) => {
      reinforcePaletteStrokes(content);
      content.scale = 0.46125;
      return $(go.Panel, 'Spot',
        {
          width: 56,
          height: 40,
          alignment: go.Spot.Center
        },
        content
      );
    };

    const paletteToolTip = () =>
      $('ToolTip',
        $(go.Panel, 'Auto',
          $(go.Shape, 'RoundedRectangle', {
            fill: '#0f172a',
            stroke: null,
            parameter1: 5
          }),
          $(go.TextBlock, {
              margin: new go.Margin(5, 8),
              font: '600 9px Inter, sans-serif',
              stroke: '#ffffff'
            },
            new go.Binding('text', 'id')
          )
        )
      );

    const makePaletteNode = (artwork: go.GraphObject) =>
      $(go.Node, 'Spot',
        {
          width: 56,
          height: 40,
          selectionAdorned: true,
          cursor: 'pointer',
          locationSpot: go.Spot.Center,
          toolTip: paletteToolTip(),
          click: (_event: go.InputEvent, obj: go.GraphObject) => {
            const paletteNode = obj.part;
            if (paletteNode instanceof go.Node) {
              this.insertPaletteNodeFromClick(
                diagram,
                paletteNode.data as FaultTreeNodeData
              );
            }
          }
        },
        fixedSymbolSlot(artwork)
      );

    gateTypes.forEach((type) => {
      diagram.nodeTemplateMap.get(`GATE_${type}`);
    });

    const palette = $(go.Palette, this.paletteDiv.nativeElement, {
      allowMove: false,
      allowDelete: false,
      contentAlignment: go.Spot.Center,
      padding: new go.Margin(0, 0, 0, 0),
      layout: $(go.GridLayout, {
        wrappingColumn: 10,
        spacing: new go.Size(12, 0),
        cellSize: new go.Size(56, 40),
        alignment: go.GridAlignment.Location
      })
    });

    gateTypes.forEach((type) => {
      palette.nodeTemplateMap.add(`GATE_${type}`, makePaletteNode(gateArtwork(type, false)));
    });
    palette.nodeTemplateMap.add('BASIC_EVENT_CIRCLE', makePaletteNode(basicCircleArtwork()));
    palette.nodeTemplateMap.add('BASIC_EVENT_DIAMOND', makePaletteNode(diamondArtwork()));
    palette.nodeTemplateMap.add('HOUSE_EVENT', makePaletteNode(houseArtwork()));
    palette.nodeTemplateMap.add('TRANSFER', makePaletteNode(transferArtwork()));

    const paletteData: FaultTreeNodeData[] = [
      { key: 'palette-and', category: 'GATE', id: 'AND gate', description: 'All inputs TRUE', gateType: 'AND', state: 'NORMAL', recordType: 'GAT' },
      { key: 'palette-or', category: 'GATE', id: 'OR gate', description: 'At least one input TRUE', gateType: 'OR', state: 'NORMAL', recordType: 'GAT' },
      { key: 'palette-nand', category: 'GATE', id: 'NAND (NOT AND)', description: 'Negated AND', gateType: 'NAND', state: 'NORMAL', recordType: 'GAT' },
      { key: 'palette-nor', category: 'GATE', id: 'NOR (NOT OR)', description: 'Negated OR', gateType: 'NOR', state: 'NORMAL', recordType: 'GAT' },
      { key: 'palette-xor', category: 'GATE', id: 'XOR gate', description: 'Exactly one input TRUE', gateType: 'XOR', state: 'NORMAL', recordType: 'GAT' },
      { key: 'palette-kn', category: 'GATE', id: 'K/N gate', description: 'K out of N inputs', gateType: 'KOFN', k: 2, state: 'NORMAL', recordType: 'GAT' },
      { key: 'palette-be', category: 'BASIC_EVENT', id: 'Basic Event', description: 'Root-cause event', symbol: 'CIRCLE', state: 'NORMAL', recordType: 'BEV' },
      { key: 'palette-undeveloped', category: 'BASIC_EVENT', id: 'Undeveloped Event', description: 'Undeveloped fault-tree branch', symbol: 'DIAMOND', state: 'NORMAL', recordType: 'BEV' },
      { key: 'palette-he', category: 'HOUSE_EVENT', id: 'House Event', description: 'TRUE / FALSE logical switch', state: 'FALSE', recordType: 'HEV' },
      { key: 'palette-xfr', category: 'TRANSFER', id: 'Transfer', description: 'Link to another fault tree', state: 'NORMAL', recordType: 'FTR' }
    ];

    const paletteModel = new go.GraphLinksModel(
      paletteData.map((node) => ({
        ...node,
        templateCategory: this.resolveTemplateCategory(node)
      }))
    );
    paletteModel.nodeCategoryProperty = 'templateCategory';
    palette.model = paletteModel;

    this.palette = palette;
  }

  /**
   * Returns the roots of the current selected move set.
   *
   * For a selected branch, descendants whose parent is also selected are not
   * considered roots: the whole subtree travels under its selected branch root.
   * For one selected component, that component is the only root.
   */
  private selectedMoveRoots(diagram: go.Diagram): go.Node[] {
    const selectedNodes: go.Node[] = [];

    diagram.selection.each((part) => {
      if (part instanceof go.Node) selectedNodes.push(part);
    });

    return selectedNodes.filter((node) => {
      const incoming = node.findLinksInto().first();
      const parent = incoming?.fromNode ?? null;
      return !parent || !parent.isSelected;
    });
  }

  /**
   * Cross-level branch move.
   *
   * The drag itself is NOT constrained by logical level. On mouse release we
   * inspect the cursor position and look for the nearest valid branch line.
   * If one is found, the selected component / complete selected subtree is
   * reparented to that branch. Otherwise normal magnetic horizontal placement
   * handles the move and restores the fixed Y level.
   */
  private tryReparentSelectionAtDrop(diagram: go.Diagram): boolean {
    const roots = this.selectedMoveRoots(diagram)
      .filter((node) => (node.data as FaultTreeNodeData).category !== 'TOP_EVENT');

    if (!roots.length) return false;

    for (const root of roots) {
      // A Gate/subtree may only be transferred after Select branch has selected
      // the complete subtree. A terminal component has no descendants, so it can
      // be transferred directly.
      if (root.findLinksOutOf().first() && !this.isCompleteBranchSelected(root)) {
        return false;
      }
    }

    // A mostly-horizontal drag on the current logical level is a sibling reorder,
    // not a reparent operation.
    const sameLevelMove = roots.every((root) => {
      const incoming = root.findLinksInto().first();
      const parent = incoming?.fromNode ?? null;
      if (!parent) return false;
      const expectedY = parent.position.y + RiskSpectrumLevelLayout.LEVEL_PITCH;
      return Math.abs(root.position.y - expectedY) <= 42;
    });

    if (sameLevelMove) return false;

    const dropPoint = diagram.lastInput.documentPoint;
    const targetParent = this.findNearestValidTargetParent(
      diagram,
      dropPoint,
      roots
    );

    if (!targetParent) return false;

    return this.reparentSelectionToParentAsLast(
      diagram,
      targetParent,
      roots
    );
  }

  /**
   * Locate a branch near the physical mouse-drop position.
   *
   * This replaces the previous Link mouseDrop/highlight implementation.
   * No branch is coloured or visually enlarged. We simply measure distance to
   * the existing thin RiskSpectrum link geometry.
   */
  /**
   * Resolve the logical target parent from what the user visually drops onto.
   *
   * A valid target is a Gate / Top Event with an OUT port. Detection combines:
   *  - its existing outgoing RiskSpectrum branch, when present;
   *  - the invisible OUT attachment point and the short virtual output stem,
   *    even when the Gate has no child yet;
   *  - cursor proximity only as a fallback.
   *
   * This is essential for new palette components: a Gate with zero children has
   * no Link to hit, but its OUT port must still accept the new component.
   */
  private findNearestValidTargetParent(
    diagram: go.Diagram,
    point: go.Point,
    roots: readonly go.Node[]
  ): go.Node | null {
    const scale = Math.max(0.35, diagram.scale);
    const nodeTolerance = 18 / scale;
    const gateTolerance = 16 / scale;
    const pointerTolerance = 24 / scale;

    let bestParent: go.Node | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    diagram.nodes.each((candidate) => {
      const data = candidate.data as FaultTreeNodeData;

      if (data.category !== 'TOP_EVENT' && data.category !== 'GATE') return;

      // A selected component/subtree can be transferred to a Gate at ANY
      // graphical/logical level, above or below its current one. Only cycles are
      // forbidden.
      if (
        roots.some(
          (root) =>
            root === candidate ||
            this.nodeCanReach(root, candidate)
        )
      ) {
        return;
      }

      const outPort = candidate.findPort('OUT');
      if (!outPort) return;

      const outPoint = outPort.getDocumentPoint(go.Spot.Center);
      const virtualStemEnd = new go.Point(
        outPoint.x,
        outPoint.y + RiskSpectrumBranchLink.PARENT_DROP
      );

      // The Gate/Top Event itself is a valid drop target. Use its whole visible
      // node area (record + gate symbol), slightly inflated for natural snapping.
      const gateBounds = candidate.actualBounds.copy();
      gateBounds.inflate(gateTolerance, gateTolerance);

      let gateContactDistance = Number.POSITIVE_INFINITY;
      let outputContactDistance = Number.POSITIVE_INFINITY;

      roots.forEach((root) => {
        const rootBounds = root.actualBounds.copy();

        gateContactDistance = Math.min(
          gateContactDistance,
          this.distanceBetweenRects(rootBounds, gateBounds)
        );

        const expandedRootBounds = rootBounds.copy();
        expandedRootBounds.inflate(nodeTolerance, nodeTolerance);

        // Output port / virtual stem remains a valid target, including Gates
        // with no existing children.
        outputContactDistance = Math.min(
          outputContactDistance,
          this.distanceFromRectToSegment(
            expandedRootBounds,
            outPoint,
            virtualStemEnd
          )
        );

        // Existing outgoing branch is also a valid target.
        candidate.findLinksOutOf().each((link) => {
          outputContactDistance = Math.min(
            outputContactDistance,
            this.distanceFromRectToLink(expandedRootBounds, link)
          );
        });
      });

      const pointerToGate = this.distanceFromPointToRect(point, gateBounds);

      let pointerToOutput = this.distanceFromPointToSegment(
        point,
        outPoint,
        virtualStemEnd
      );

      candidate.findLinksOutOf().each((link) => {
        pointerToOutput = Math.min(
          pointerToOutput,
          this.distanceFromPointToLink(point, link)
        );
      });

      const gateAccepted =
        gateContactDistance <= gateTolerance ||
        pointerToGate <= pointerTolerance;

      const outputAccepted =
        outputContactDistance <= nodeTolerance ||
        pointerToOutput <= pointerTolerance;

      if (!gateAccepted && !outputAccepted) return;

      // Priority:
      // 1. actual component touching the Gate itself;
      // 2. actual component touching its OUT/branch;
      // 3. pointer proximity as fallback.
      let score: number;

      if (gateContactDistance <= gateTolerance) {
        score = gateContactDistance;
      } else if (outputContactDistance <= nodeTolerance) {
        score = gateTolerance + outputContactDistance;
      } else if (pointerToGate <= pointerTolerance) {
        score = gateTolerance + nodeTolerance + pointerToGate;
      } else {
        score =
          gateTolerance +
          nodeTolerance +
          pointerTolerance +
          pointerToOutput;
      }

      if (score < bestScore) {
        bestScore = score;
        bestParent = candidate;
      }
    });

    return bestParent;
  }

  private distanceBetweenRects(a: go.Rect, b: go.Rect): number {
    const dx = a.right < b.left
      ? b.left - a.right
      : b.right < a.left
        ? a.left - b.right
        : 0;

    const dy = a.bottom < b.top
      ? b.top - a.bottom
      : b.bottom < a.top
        ? a.top - b.bottom
        : 0;

    return Math.hypot(dx, dy);
  }

  private distanceFromPointToRect(point: go.Point, rect: go.Rect): number {
    const dx = point.x < rect.left
      ? rect.left - point.x
      : point.x > rect.right
        ? point.x - rect.right
        : 0;

    const dy = point.y < rect.top
      ? rect.top - point.y
      : point.y > rect.bottom
        ? point.y - rect.bottom
        : 0;

    return Math.hypot(dx, dy);
  }

  private findNearestValidBranchLink(
    diagram: go.Diagram,
    point: go.Point,
    roots: readonly go.Node[]
  ): go.Link | null {
    const pointerTolerance = 18 / Math.max(0.35, diagram.scale);
    const nodeTolerance = 12 / Math.max(0.35, diagram.scale);

    let best: go.Link | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    diagram.links.each((link) => {
      const parent = link.fromNode;
      if (!parent) return;

      const parentData = parent.data as FaultTreeNodeData;
      if (parentData.category !== 'TOP_EVENT' && parentData.category !== 'GATE') return;

      // Target branch must originate from a logical component with an OUT port.
      if (!parent.findPort('OUT')) return;

      for (const root of roots) {
        if (root === parent) return;

        // A subtree cannot be reattached inside itself.
        if (this.nodeCanReach(root, parent)) return;
      }

      // Primary criterion: the moved root box itself touches / crosses / comes
      // close to the branch. This is what the user visually perceives as
      // "putting the component on the branch".
      let rootDistance = Number.POSITIVE_INFINITY;

      for (const root of roots) {
        const bounds = root.actualBounds.copy();
        bounds.inflate(nodeTolerance, nodeTolerance);

        rootDistance = Math.min(
          rootDistance,
          this.distanceFromRectToLink(bounds, link)
        );
      }

      // Secondary criterion: pointer proximity. This keeps the behavior usable
      // when the node is visually close but the pointer is released just beside
      // the branch.
      const pointerDistance = this.distanceFromPointToLink(point, link);

      const rootAccepted = rootDistance <= nodeTolerance;
      const pointerAccepted = pointerDistance <= pointerTolerance;

      if (!rootAccepted && !pointerAccepted) return;

      // Strongly prefer actual component/branch contact over cursor proximity.
      const score = rootAccepted
        ? rootDistance
        : nodeTolerance + pointerDistance;

      if (score < bestScore) {
        best = link;
        bestScore = score;
      }
    });

    return best;
  }

  /**
   * Distance between an axis-aligned node rectangle and an orthogonal GoJS link.
   * RiskSpectrumBranchLink uses horizontal/vertical segments, so this gives a
   * robust "component placed on branch" test even when the mouse cursor itself
   * is far from the thin line.
   */
  private distanceFromRectToLink(rect: go.Rect, link: go.Link): number {
    if (link.pointsCount < 2) return Number.POSITIVE_INFINITY;

    let minimum = Number.POSITIVE_INFINITY;

    for (let index = 0; index < link.pointsCount - 1; index += 1) {
      const a = link.getPoint(index);
      const b = link.getPoint(index + 1);

      minimum = Math.min(
        minimum,
        this.distanceFromRectToSegment(rect, a, b)
      );
    }

    return minimum;
  }

  private distanceFromRectToSegment(
    rect: go.Rect,
    a: go.Point,
    b: go.Point
  ): number {
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);

    // Horizontal segment.
    if (Math.abs(a.y - b.y) < 0.001) {
      const dx = maxX < rect.left
        ? rect.left - maxX
        : minX > rect.right
          ? minX - rect.right
          : 0;

      const dy = a.y < rect.top
        ? rect.top - a.y
        : a.y > rect.bottom
          ? a.y - rect.bottom
          : 0;

      return Math.hypot(dx, dy);
    }

    // Vertical segment.
    if (Math.abs(a.x - b.x) < 0.001) {
      const dx = a.x < rect.left
        ? rect.left - a.x
        : a.x > rect.right
          ? a.x - rect.right
          : 0;

      const dy = maxY < rect.top
        ? rect.top - maxY
        : minY > rect.bottom
          ? minY - rect.bottom
          : 0;

      return Math.hypot(dx, dy);
    }

    // Defensive fallback for any non-orthogonal segment.
    const corners = [
      new go.Point(rect.left, rect.top),
      new go.Point(rect.right, rect.top),
      new go.Point(rect.right, rect.bottom),
      new go.Point(rect.left, rect.bottom)
    ];

    let minimum = Number.POSITIVE_INFINITY;

    corners.forEach((corner) => {
      minimum = Math.min(
        minimum,
        this.distanceFromPointToSegment(corner, a, b)
      );
    });

    return minimum;
  }

  private distanceFromPointToLink(point: go.Point, link: go.Link): number {
    if (link.pointsCount < 2) return Number.POSITIVE_INFINITY;

    let minimum = Number.POSITIVE_INFINITY;

    for (let index = 0; index < link.pointsCount - 1; index += 1) {
      const a = link.getPoint(index);
      const b = link.getPoint(index + 1);
      minimum = Math.min(minimum, this.distanceFromPointToSegment(point, a, b));
    }

    return minimum;
  }

  private distanceFromPointToSegment(
    point: go.Point,
    a: go.Point,
    b: go.Point
  ): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
      return Math.hypot(point.x - a.x, point.y - a.y);
    }

    const t = Math.max(
      0,
      Math.min(
        1,
        ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared
      )
    );

    const projectionX = a.x + t * dx;
    const projectionY = a.y + t * dy;

    return Math.hypot(point.x - projectionX, point.y - projectionY);
  }

  /**
   * Reparent one selected component or one/more complete selected subtrees to a
   * Gate/Top Event, regardless of source/target level.
   *
   * Existing descendants remain untouched. Only each selected root's incoming
   * relation changes. The moved root(s) are appended after the target parent's
   * existing children, then the fixed-level layout recalculates their NEW depth.
   */
  private reparentSelectionToParentAsLast(
    diagram: go.Diagram,
    targetParent: go.Node,
    roots: readonly go.Node[]
  ): boolean {
    const targetData = targetParent.data as FaultTreeNodeData;

    if (targetData.category !== 'TOP_EVENT' && targetData.category !== 'GATE') {
      return false;
    }

    if (!targetParent.findPort('OUT')) return false;

    for (const root of roots) {
      if (root === targetParent) return false;
      if (this.nodeCanReach(root, targetParent)) return false;
    }

    const graphModel = diagram.model as go.GraphLinksModel;

    // Snapshot current target children in visual order. If a moved root is
    // already a child of this parent, excluding it here means the same-parent
    // operation simply sends it to the last/rightmost position.
    const targetLinksBefore: go.Link[] = [];
    targetParent.findLinksOutOf().each((link) => targetLinksBefore.push(link));

    targetLinksBefore.sort((a, b) => {
      const ax = a.toNode?.actualBounds.center.x ?? 0;
      const bx = b.toNode?.actualBounds.center.x ?? 0;
      return ax - bx;
    });

    const movedRootKeys = new Set(roots.map((root) => String(root.key)));

    const preservedTargetData = targetLinksBefore
      .filter((link) => !movedRootKeys.has(String(link.toNode?.key)))
      .map((link) => ({ ...link.data }));

    const removedIncoming: Array<{
      root: go.Node;
      data: Record<string, unknown>;
    }> = [];

    diagram.startTransaction('Reparent FT selection to branch');

    for (const root of roots) {
      const incoming = root.findLinksInto().first();

      if (incoming) {
        removedIncoming.push({
          root,
          data: { ...(incoming.data as Record<string, unknown>) }
        });
        graphModel.removeLinkData(incoming.data);
      }

      const rootData = root.data as FaultTreeNodeData;
      graphModel.setDataProperty(rootData, 'manualX', undefined);
      graphModel.setDataProperty(rootData, 'manualY', undefined);

      const sourceNode = this.model.nodes.find((node) => node.key === rootData.key);
      if (sourceNode) {
        sourceNode.manualX = undefined;
        sourceNode.manualY = undefined;
      }
    }

    // Rebuild only the target parent's outgoing link order: existing children
    // first, transferred component/subtree root(s) last.
    const currentTargetLinks: go.Link[] = [];
    targetParent.findLinksOutOf().each((link) => currentTargetLinks.push(link));
    currentTargetLinks.forEach((link) => graphModel.removeLinkData(link.data));

    preservedTargetData.forEach((linkData) => graphModel.addLinkData(linkData));

    const movedLinkData = roots.map((root, index) => {
      const previous = removedIncoming.find((entry) => entry.root === root)?.data;
      const serial = ++this.insertionSerial;

      return {
        key: `MOVE-${String(targetParent.key)}-${String(root.key)}-${serial}-${index}`,
        from: String(targetParent.key),
        to: String(root.key),
        fromPort: 'OUT' as const,
        toPort: 'IN' as const,
        negated: Boolean(previous?.['negated'])
      };
    });

    movedLinkData.forEach((linkData) => graphModel.addLinkData(linkData));

    diagram.commitTransaction('Reparent FT selection to branch');

    // Synchronize the Angular-side model.
    const targetParentKey = String(targetParent.key);

    this.model.links = this.model.links.filter((link) => {
      if (movedRootKeys.has(String(link.to))) return false;
      if (String(link.from) === targetParentKey) return false;
      return true;
    });

    preservedTargetData.forEach((linkData) => {
      this.model.links.push({
        key: String(linkData['key']),
        from: String(linkData['from']),
        to: String(linkData['to']),
        fromPort: 'OUT',
        toPort: 'IN',
        negated: Boolean(linkData['negated'])
      });
    });

    movedLinkData.forEach((linkData) => {
      this.model.links.push({ ...linkData });
    });

    // New parent may be at ANY level. Layout now derives the moved root's new
    // depth and places its complete subtree at the corresponding fixed levels.
    diagram.layoutDiagram(true);

    // Restore branch selection after layout for clear feedback, without any
    // colour-changing branch highlight.
    diagram.clearSelection();

    roots.forEach((root) => {
      const refreshed = diagram.findNodeForKey(root.key);
      if (!refreshed) return;

      if (refreshed.findLinksOutOf().first()) {
        const visit = (current: go.Node): void => {
          current.isSelected = true;
          current.findNodesOutOf().each((child) => visit(child));
        };
        visit(refreshed);
      } else {
        refreshed.isSelected = true;
      }
    });

    this.clearBranchAttachment();
    return true;
  }

  /**
   * Arm an existing logical branch for attaching one free component.
   *
   * Selecting any visible branch segment means: use the source Gate / Top Event
   * of that Link as the logical parent. The next click on an unattached component
   * creates a new sibling relation from parent.OUT to component.IN.
   */
  private armBranchAttachment(link: go.Link): void {
    const parent = link.fromNode;
    if (!parent) return;

    const data = parent.data as FaultTreeNodeData;
    if (data.category !== 'TOP_EVENT' && data.category !== 'GATE') return;

    this.zone.run(() => {
      this.branchAttachParentKey = parent.key;
      this.branchAttachParentId = data.id;

      // This is an attachment workflow, not palette insertion.
      this.insertionParentKey = null;
      this.insertionParentId = null;
    });
  }

  private tryAttachExistingNodeToSelectedBranch(node: go.Node): void {
    if (this.branchAttachParentKey === null) return;

    const diagram = node.diagram;
    if (!diagram) return;

    const childData = node.data as FaultTreeNodeData;

    if (childData.category === 'TOP_EVENT') return;

    // Only a free/unattached component can be attached by this workflow.
    if (node.findLinksInto().first()) return;

    const parent = diagram.findNodeForKey(this.branchAttachParentKey);
    if (!parent || parent === node) {
      this.clearBranchAttachment();
      return;
    }

    const parentData = parent.data as FaultTreeNodeData;
    if (parentData.category !== 'TOP_EVENT' && parentData.category !== 'GATE') {
      this.clearBranchAttachment();
      return;
    }

    // Prevent accidental cycles when a free Gate already owns descendants.
    if (this.nodeCanReach(node, parent)) {
      this.clearBranchAttachment();
      return;
    }

    const graphModel = diagram.model as go.GraphLinksModel;
    const linkKey =
      `ATTACH-${String(parent.key)}-${String(node.key)}-${graphModel.linkDataArray.length + 1}`;

    diagram.startTransaction('Attach free component to selected branch');

    graphModel.setDataProperty(childData, 'manualX', node.position.x);
    graphModel.setDataProperty(childData, 'manualY', undefined);

    const linkData = {
      key: linkKey,
      from: String(parent.key),
      to: String(node.key),
      fromPort: 'OUT' as const,
      toPort: 'IN' as const,
      negated: false
    };

    graphModel.addLinkData(linkData);

    diagram.commitTransaction('Attach free component to selected branch');

    const sourceNode = this.model.nodes.find((candidate) => candidate.key === childData.key);
    if (sourceNode) {
      sourceNode.manualX = node.position.x;
      sourceNode.manualY = undefined;
    }

    this.model.links.push({ ...linkData });

    // The free node's current X determines the insertion slot between existing
    // siblings. TreeLayout then resolves exact collision-free coordinates.
    diagram.startTransaction('Insert attached node into magnetic slot');
    this.reorderChildrenByCurrentX(diagram, parent);
    diagram.commitTransaction('Insert attached node into magnetic slot');

    diagram.layoutDiagram(true);

    // One branch click attaches one component. The user must explicitly choose
    // the branch again before attaching another free component.
    this.clearBranchAttachment();

    const refreshed = diagram.findNodeForKey(node.key);
    if (refreshed) diagram.select(refreshed);
  }

  private nodeCanReach(start: go.Node, target: go.Node): boolean {
    const visited = new Set<go.Key>();
    const stack: go.Node[] = [start];

    while (stack.length) {
      const current = stack.pop()!;
      if (current === target) return true;
      if (visited.has(current.key)) continue;

      visited.add(current.key);
      current.findNodesOutOf().each((child) => stack.push(child));
    }

    return false;
  }

  private clearBranchAttachment(): void {
    this.zone.run(() => {
      this.branchAttachParentKey = null;
      this.branchAttachParentId = null;
    });
  }

  /**
   * Movement rules:
   * - Top Event: never moves.
   * - Unattached component: free X/Y movement.
   * - Attached leaf / unique component: X movement only, Y remains on its level.
   * - Attached Gate with descendants: it can only move when its complete branch
   *   has been selected (Context menu -> Select branch). Then every selected
   *   branch member moves horizontally together and keeps its own fixed level Y.
   */
  private computeFaultTreeDrag(
    part: go.Part,
    newLoc: go.Point,
    snappedLoc: go.Point
  ): go.Point {
    if (!(part instanceof go.Node)) return snappedLoc;

    const data = part.data as FaultTreeNodeData;

    if (data.category === 'TOP_EVENT') {
      return part.location.copy();
    }

    const attached = Boolean(part.findLinksInto().first());

    if (!attached) {
      // A node that is not connected to a branch is a free workspace object.
      return snappedLoc.copy();
    }

    const hasChildren = Boolean(part.findLinksOutOf().first());

    if (hasChildren && !this.isCompleteBranchSelected(part)) {
      // A Gate that owns a subtree may not be shifted on its own. Select branch
      // first so the complete subtree keeps its internal geometry.
      return part.location.copy();
    }

    // During an active drag, an attached component / fully selected subtree
    // may move freely across levels so it can be dropped onto another branch.
    // If no valid target branch is found at drop time, finalizeMagneticPlacement
    // restores the original logical Y level and only keeps horizontal ordering.
    return snappedLoc.copy();
  }

  private isCompleteBranchSelected(root: go.Node): boolean {
    const visited = new Set<go.Key>();
    const stack: go.Node[] = [root];

    while (stack.length) {
      const current = stack.pop()!;

      if (visited.has(current.key)) continue;
      visited.add(current.key);

      if (!current.isSelected) return false;

      current.findNodesOutOf().each((child) => {
        stack.push(child);
      });
    }

    return true;
  }

  /**
   * Finalize a drag using "magnetic plate" semantics.
   *
   * - free/unattached components keep their exact X/Y workspace position;
   * - attached components do not keep arbitrary pixels: their drag only
   *   determines the sibling/subtree ordering;
   * - TreeLayout then recomputes collision-free X slots for all affected
   *   branches while RiskSpectrumLevelLayout preserves fixed Y levels.
   */
  private finalizeMagneticPlacement(diagram: go.Diagram): void {
    const graphModel = diagram.model as go.GraphLinksModel;
    const affectedParents = new Map<go.Key, go.Node>();

    diagram.selection.each((part) => {
      if (!(part instanceof go.Node)) return;

      const data = part.data as FaultTreeNodeData;
      if (data.category === 'TOP_EVENT') return;

      const incoming = part.findLinksInto().first();
      const parent = incoming?.fromNode ?? null;

      if (!parent) {
        // Free workspace object: preserve exact placement.
        graphModel.startTransaction('Persist free FT node placement');
        graphModel.setDataProperty(data, 'manualX', part.position.x);
        graphModel.setDataProperty(data, 'manualY', part.position.y);
        graphModel.commitTransaction('Persist free FT node placement');

        const source = this.model.nodes.find((node) => node.key === data.key);
        if (source) {
          source.manualX = part.position.x;
          source.manualY = part.position.y;
        }
        return;
      }

      // For a whole selected branch, only the branch root should reorder among
      // its siblings. Descendants whose parent is also selected keep their
      // internal order.
      if (!parent.isSelected) {
        affectedParents.set(parent.key, parent);
      }
    });

    if (!affectedParents.size) return;

    diagram.startTransaction('Reorder magnetic FT slots');

    affectedParents.forEach((parent) => {
      this.reorderChildrenByCurrentX(diagram, parent);
    });

    diagram.commitTransaction('Reorder magnetic FT slots');

    diagram.layoutDiagram(true);
  }

  /**
   * Reorder the parent's outgoing links according to the current horizontal
   * centers of its children. TreeLayout uses this order to allocate
   * non-overlapping sibling/subtree slots.
   */
  private reorderChildrenByCurrentX(diagram: go.Diagram, parent: go.Node): void {
    const graphModel = diagram.model as go.GraphLinksModel;
    const children: go.Node[] = [];
    parent.findNodesOutOf().each((child) => children.push(child));
    if (children.length < 2) return;

    children.sort((a, b) => a.actualBounds.center.x - b.actualBounds.center.x);

    children.forEach((child, index) => {
      const data = child.data as FaultTreeNodeData;
      graphModel.setDataProperty(data, 'siblingOrder', index);
      graphModel.setDataProperty(data, 'manualX', undefined);
      graphModel.setDataProperty(data, 'manualY', undefined);

      const source = this.model.nodes.find((node) => node.key === data.key);
      if (source) {
        source.siblingOrder = index;
        source.manualX = undefined;
        source.manualY = undefined;
      }
    });
  }

  /**
   * RiskSpectrum-like quick insertion:
   * 1. select an existing Gate / Top Event in the diagram;
   * 2. click one symbol in the horizontal palette;
   * 3. create the child and its logical OUT -> IN relation;
   * 4. re-layout the complete tree on fixed depth levels.
   */
  private insertPaletteNodeFromClick(
    diagram: go.Diagram,
    paletteData: FaultTreeNodeData
  ): void {
    if (this.insertionParentKey === null) return;

    const parent = diagram.findNodeForKey(this.insertionParentKey);
    if (!parent) {
      this.insertionParentKey = null;
      this.insertionParentId = null;
      return;
    }

    const selectedData = parent.data as FaultTreeNodeData;

    // Only Gate / Top Event may act as the logical father.
    if (
      selectedData.category !== 'TOP_EVENT' &&
      selectedData.category !== 'GATE'
    ) {
      this.insertionParentKey = null;
      this.insertionParentId = null;
      return;
    }

    const serial = ++this.insertionSerial;
    const prefix = this.paletteNodePrefix(paletteData);
    const serialText = String(serial).padStart(3, '0');
    const nodeKey = `FTNODE-NEW-${prefix}-${serialText}`;
    const nodeId = `NEW-${prefix}-${serialText}`;

    const child: FaultTreeNodeData = {
      ...paletteData,
      key: nodeKey,
      id: nodeId,
      description: `New ${paletteData.id}`,
      templateCategory: this.resolveTemplateCategory(paletteData)
    };

    const linkData = {
      key: `AUTO-${String(parent.key)}-${nodeKey}`,
      from: String(parent.key),
      to: nodeKey,
      fromPort: 'OUT' as const,
      toPort: 'IN' as const,
      negated: false
    };

    const graphModel = diagram.model as go.GraphLinksModel;

    diagram.startTransaction('Add fault-tree child from palette');
    graphModel.addNodeData(child);
    graphModel.addLinkData(linkData);
    diagram.commitTransaction('Add fault-tree child from palette');

    // Keep the in-memory Angular model aligned with the GoJS model so another
    // editor refresh does not discard the newly inserted child.
    this.model.nodes.push({ ...child });
    this.model.links.push({ ...linkData });

    diagram.layoutDiagram(true);

    // Keep the logical father selected so the user can add several children
    // by clicking multiple palette symbols in succession.
    const refreshedParent = diagram.findNodeForKey(parent.key);
    if (refreshedParent) {
      diagram.select(refreshedParent);
      const refreshedData = refreshedParent.data as FaultTreeNodeData;
      this.insertionParentKey = refreshedParent.key;
      this.insertionParentId = refreshedData.id;
    }
  }

  private paletteNodePrefix(node: FaultTreeNodeData): string {
    if (node.category === 'GATE') {
      return node.gateType === 'KOFN'
        ? 'KN'
        : (node.gateType ?? 'GATE');
    }

    if (node.category === 'BASIC_EVENT') {
      return node.symbol === 'DIAMOND' ? 'UE' : 'BE';
    }

    if (node.category === 'HOUSE_EVENT') return 'HE';
    if (node.category === 'TRANSFER') return 'XFR';

    return 'NODE';
  }

  /**
   * Custom FT clipboard.
   *
   * - one selected component => copy only that occurrence;
   * - Select branch => copy all selected descendants and only their INTERNAL links;
   * - the incoming relation from the old parent is never copied.
   */
  private selectedFaultTreeNodes(diagram: go.Diagram): go.Node[] {
    const selectedNodes: go.Node[] = [];

    diagram.selection.each((part) => {
      if (!(part instanceof go.Node)) return;

      const data = part.data as FaultTreeNodeData;
      if (data.category !== 'TOP_EVENT') selectedNodes.push(part);
    });

    return selectedNodes;
  }

  private writeFaultTreeClipboard(
    diagram: go.Diagram,
    selectedNodes: readonly go.Node[]
  ): boolean {
    if (!selectedNodes.length) return false;

    const selectedKeys = new Set(selectedNodes.map((node) => String(node.key)));
    const graphModel = diagram.model as go.GraphLinksModel;

    const nodes = selectedNodes.map((node) => ({
      ...(node.data as FaultTreeNodeData)
    }));

    const links = graphModel.linkDataArray
      .map((link) => link as FaultTreeLinkData)
      .filter((link) =>
        selectedKeys.has(String(link.from)) &&
        selectedKeys.has(String(link.to))
      )
      .map((link) => ({ ...link }));

    const rootKeys = selectedNodes
      .filter((node) => {
        const incoming = node.findLinksInto().first();
        return !incoming || !selectedKeys.has(String(incoming.fromNode?.key));
      })
      .map((node) => String(node.key));

    const positions = new Map<string, go.Point>();
    selectedNodes.forEach((node) => {
      positions.set(String(node.key), node.position.copy());
    });

    this.faultTreeClipboard = {
      nodes,
      links,
      positions,
      rootKeys
    };

    return true;
  }

  private copyFaultTreeSelection(diagram: go.Diagram): boolean {
    return this.writeFaultTreeClipboard(
      diagram,
      this.selectedFaultTreeNodes(diagram)
    );
  }

  /**
   * Atomic FT Cut.
   *
   * Native GoJS Cut operates on the instantaneous Part selection. If a
   * previously "Select branch" selection is collapsed by the context menu,
   * cutting only the root leaves its descendants behind and visually
   * decomposes the detached subtree.
   *
   * This routine snapshots the full FT selection first, then removes all
   * selected nodes + incident links in one transaction. A detached branch root
   * with no parent is automatically expanded to all descendants so a standalone
   * branch can never be split by Cut.
   */
  private cutFaultTreeSelection(diagram: go.Diagram): boolean {
    const initial = this.selectedFaultTreeNodes(diagram);
    if (!initial.length) return false;

    const cutNodes = new Map<string, go.Node>();

    const include = (node: go.Node): void => {
      const data = node.data as FaultTreeNodeData;
      if (data.category === 'TOP_EVENT') return;

      const key = String(node.key);
      if (cutNodes.has(key)) return;
      cutNodes.set(key, node);
    };

    initial.forEach((node) => include(node));

    // A free/independent branch is one logical unit. If its root has no parent,
    // include its complete subtree even if only the root was explicitly selected.
    initial.forEach((root) => {
      if (root.findLinksInto().first()) return;
      if (!root.findLinksOutOf().first()) return;

      const visit = (current: go.Node): void => {
        include(current);
        current.findNodesOutOf().each((child: go.Node) => visit(child));
      };

      visit(root);
    });

    const nodes = [...cutNodes.values()];
    if (!this.writeFaultTreeClipboard(diagram, nodes)) return false;

    const nodeKeys = new Set(nodes.map((node) => String(node.key)));
    const graphModel = diagram.model as go.GraphLinksModel;

    const linksToRemove = graphModel.linkDataArray
      .map((link) => link as FaultTreeLinkData)
      .filter((link) =>
        nodeKeys.has(String(link.from)) ||
        nodeKeys.has(String(link.to))
      );

    diagram.startTransaction('Cut Fault Tree selection atomically');

    linksToRemove.forEach((link) => graphModel.removeLinkData(link));
    nodes.forEach((node) => graphModel.removeNodeData(node.data));

    diagram.commitTransaction('Cut Fault Tree selection atomically');

    // Keep Angular-side source model synchronized with the GoJS model.
    this.model.links = this.model.links.filter((link) =>
      !nodeKeys.has(String(link.from)) &&
      !nodeKeys.has(String(link.to))
    );
    this.model.nodes = this.model.nodes.filter((node) =>
      !nodeKeys.has(String(node.key))
    );

    diagram.clearSelection();
    diagram.layoutDiagram(true);

    return true;
  }

  private pasteFaultTreeSelection(
    diagram: go.Diagram,
    explicitTargetParent: go.Node | null = null
  ): boolean {
    const snapshot = this.faultTreeClipboard;
    if (!snapshot?.nodes.length) return false;

    const graphModel = diagram.model as go.GraphLinksModel;

    let targetParent: go.Node | null = null;

    const acceptAsTarget = (candidate: go.Node | null): go.Node | null => {
      if (!candidate) return null;

      const data = candidate.data as FaultTreeNodeData;

      if (
        (data.category === 'TOP_EVENT' || data.category === 'GATE') &&
        candidate.findPort('OUT')
      ) {
        return candidate;
      }

      return null;
    };

    // Context-menu Paste may explicitly name the Gate under the pointer.
    targetParent = acceptAsTarget(explicitTargetParent);

    // Keyboard Paste: selecting a Gate/Top Event directly is enough.
    if (!targetParent) {
      const selectedPart = diagram.selection.first();

      if (selectedPart instanceof go.Node) {
        targetParent = acceptAsTarget(selectedPart);
      } else if (selectedPart instanceof go.Link) {
        // Preserve the previous branch-line target workflow.
        targetParent = acceptAsTarget(selectedPart.fromNode);
      }
    }

    const sourceToNewKey = new Map<string, string>();
    const clonedNodes: FaultTreeNodeData[] = [];

    snapshot.nodes.forEach((source) => {
      const serial = ++this.insertionSerial;
      const newKey = `FTNODE-COPY-${serial}-${source.key}`;
      sourceToNewKey.set(String(source.key), newKey);

      clonedNodes.push({
        ...source,
        key: newKey,
        manualX: undefined,
        manualY: undefined
      });
    });

    const clonedLinks: FaultTreeLinkData[] = snapshot.links.map((source, index) => ({
      ...source,
      key: `COPY-LINK-${++this.insertionSerial}-${index}`,
      from: sourceToNewKey.get(String(source.from))!,
      to: sourceToNewKey.get(String(source.to))!,
      fromPort: 'OUT',
      toPort: 'IN'
    }));

    const newRootKeys = snapshot.rootKeys
      .map((key) => sourceToNewKey.get(String(key)))
      .filter((key): key is string => Boolean(key));

    diagram.startTransaction('Paste Fault Tree selection');

    clonedNodes.forEach((node) => graphModel.addNodeData(node));
    clonedLinks.forEach((link) => graphModel.addLinkData(link));

    if (targetParent) {
      const existingChildren: go.Node[] = [];
      targetParent.findNodesOutOf().each((child: go.Node) => existingChildren.push(child));
      let nextOrder = existingChildren.length;

      newRootKeys.forEach((rootKey, index) => {
        const rootData = graphModel.findNodeDataForKey(rootKey) as FaultTreeNodeData | null;
        if (!rootData) return;

        graphModel.setDataProperty(rootData, 'manualX', undefined);
        graphModel.setDataProperty(rootData, 'manualY', undefined);
        graphModel.setDataProperty(rootData, 'siblingOrder', nextOrder + index);

        const link: FaultTreeLinkData = {
          key: `PASTE-ATTACH-${++this.insertionSerial}`,
          from: String(targetParent!.key),
          to: rootKey,
          fromPort: 'OUT',
          toPort: 'IN',
          negated: false
        };

        graphModel.addLinkData(link);
        clonedLinks.push(link);
      });
    } else {
      // No target branch: paste as a detached free object/subtree BELOW the
      // deepest current FT level. Internal copied links remain intact.
      const existingNodes: go.Node[] = [];
      diagram.nodes.each((node) => {
        if (!sourceToNewKey.has(String(node.key))) existingNodes.push(node);
      });

      const deepestBottom = existingNodes.length
        ? Math.max(...existingNodes.map((node) => node.actualBounds.bottom))
        : diagram.viewportBounds.center.y;

      const sourcePositions = [...snapshot.positions.values()];
      const minX = Math.min(...sourcePositions.map((p) => p.x));
      const maxX = Math.max(...sourcePositions.map((p) => p.x + 132));
      const minY = Math.min(...sourcePositions.map((p) => p.y));

      const groupWidth = Math.max(132, maxX - minX);
      const targetLeft = diagram.viewportBounds.center.x - groupWidth / 2;
      const offsetX = targetLeft - minX;
      const offsetY = deepestBottom + 90 - minY;

      snapshot.nodes.forEach((source) => {
        const newKey = sourceToNewKey.get(String(source.key));
        const sourcePosition = snapshot.positions.get(String(source.key));
        if (!newKey || !sourcePosition) return;

        const data = graphModel.findNodeDataForKey(newKey) as FaultTreeNodeData | null;
        if (!data) return;

        graphModel.setDataProperty(data, 'manualX', sourcePosition.x + offsetX);
        graphModel.setDataProperty(data, 'manualY', sourcePosition.y + offsetY);
      });
    }

    diagram.commitTransaction('Paste Fault Tree selection');

    // Synchronize Angular-side model with the new occurrences and relations.
    clonedNodes.forEach((node) => {
      const current = graphModel.findNodeDataForKey(node.key) as FaultTreeNodeData | null;
      if (current && !this.model.nodes.some((existing) => existing.key === current.key)) {
        this.model.nodes.push({ ...current });
      }
    });

    clonedLinks.forEach((link) => {
      if (!this.model.links.some((existing) => String(existing.key) === String(link.key))) {
        this.model.links.push({ ...link });
      }
    });

    diagram.layoutDiagram(true);

    // Keep the complete pasted occurrence/branch selected so it can immediately
    // be dragged onto another branch if it was pasted free.
    diagram.clearSelection();
    clonedNodes.forEach((nodeData) => {
      const node = diagram.findNodeForKey(nodeData.key);
      if (node) node.isSelected = true;
    });

    return true;
  }

  private handleContextAction(action: string, node: go.Node): void {
    const diagram = node.diagram;
    if (!diagram) return;

    const preserveExistingSelection =
      (action === 'CUT' || action === 'COPY') &&
      node.isSelected;

    if (!preserveExistingSelection) {
      diagram.select(node);
    }

    switch (action) {
      case 'EDIT':
        this.zone.run(() => this.recordOpen.emit(node.data as FaultTreeNodeData));
        return;

      case 'CHANGE_NODE': {
        const data = node.data as FaultTreeNodeData;
        if (
          data.category === 'BASIC_EVENT' ||
          data.category === 'HOUSE_EVENT' ||
          data.category === 'TRANSFER'
        ) {
          this.zone.run(() => this.changeNodeEvent.emit(data));
        }
        return;
      }

      case 'NEGATE': {
        const incoming = node.findLinksInto().first();
        if (!incoming) return;
        diagram.startTransaction('Negate fault-tree node');
        const model = diagram.model as go.GraphLinksModel;
        model.setDataProperty(
          incoming.data,
          'negated',
          !Boolean((incoming.data as { negated?: boolean }).negated)
        );
        diagram.commitTransaction('Negate fault-tree node');
        return;
      }

      case 'SELECT_BRANCH': {
        diagram.clearSelection();
        const visit = (current: go.Node): void => {
          current.isSelected = true;
          current.findNodesOutOf().each((child) => visit(child));
        };
        visit(node);
        return;
      }

      case 'SELECT_INPUTS':
        diagram.clearSelection();
        node.findNodesOutOf().each((child) => {
          child.isSelected = true;
        });
        return;

      case 'CUT':
        if (!node.isSelected) {
          diagram.clearSelection();
          node.isSelected = true;
        }
        diagram.commandHandler.cutSelection();
        return;

      case 'COPY':
        if (!node.isSelected) {
          diagram.clearSelection();
          node.isSelected = true;
        }
        diagram.commandHandler.copySelection();
        return;

      case 'PASTE': {
        const data = node.data as FaultTreeNodeData;
        const explicitTarget =
          data.category === 'TOP_EVENT' || data.category === 'GATE'
            ? node
            : null;

        if (diagram.commandHandler instanceof FaultTreeCommandHandler) {
          this.pasteFaultTreeSelection(diagram, explicitTarget);
        } else {
          diagram.commandHandler.pasteSelection();
        }
        return;
      }

      case 'DELETE':
        diagram.commandHandler.deleteSelection();
        return;

      case 'FIND':
        diagram.centerRect(node.actualBounds);
        return;

      case 'EDIT_FAULT_TREE':
        diagram.centerRect(node.actualBounds);
        return;

      default:
        // The remaining entries are intentionally present to mirror the
        // RiskSpectrum context menu. Their backend/domain workflows are added
        // in later NextPSA vertical slices.
        return;
    }
  }

  /**
   * Connect newly dropped palette nodes as CHILDREN of the most plausible
   * Gate / Top Event. Direction is always parent OUT -> child IN.
   */
  /**
   * Convert raw GoJS Palette copies into persistent NextPSA FT nodes.
   *
   * Palette records contain catalogue IDs such as "Basic Event" / "OR gate".
   * A dropped component needs a unique FT-position key + editable record ID so
   * that later drag/reparent operations operate on a real model object.
   */
  private normalizeExternalPaletteDrop(diagram: go.Diagram): go.Node[] {
    const graphModel = diagram.model as go.GraphLinksModel;
    const droppedNodes: go.Node[] = [];

    diagram.selection.each((part) => {
      if (!(part instanceof go.Node)) return;

      const data = part.data as FaultTreeNodeData;
      const serial = ++this.insertionSerial;
      const serialText = String(serial).padStart(3, '0');
      const prefix = this.paletteNodePrefix(data);

      const oldKey = part.key;
      const newKey = `FTNODE-NEW-${prefix}-${serialText}`;
      const newId = `NEW-${prefix}-${serialText}`;

      diagram.startTransaction('Normalize dropped palette component');

      graphModel.setKeyForNodeData(data, newKey);
      graphModel.setDataProperty(data, 'id', newId);
      graphModel.setDataProperty(data, 'description', `New ${data.id === newId ? prefix : data.id}`);
      graphModel.setDataProperty(data, 'manualX', part.position.x);
      graphModel.setDataProperty(data, 'manualY', part.position.y);

      diagram.commitTransaction('Normalize dropped palette component');

      // If GoJS generated/copies a palette key, make sure source persistence uses
      // the normalized key rather than the transient catalogue key.
      const sourceIndex = this.model.nodes.findIndex((node) => node.key === oldKey);
      if (sourceIndex >= 0) this.model.nodes.splice(sourceIndex, 1);

      const persisted = { ...(part.data as FaultTreeNodeData) };

      if (!this.model.nodes.some((node) => node.key === persisted.key)) {
        this.model.nodes.push(persisted);
      }

      droppedNodes.push(part);
    });

    return droppedNodes;
  }

  private autoConnectDroppedNodes(
    diagram: go.Diagram,
    droppedNodes?: readonly go.Node[]
  ): void {
    const nodes: go.Node[] = droppedNodes ? [...droppedNodes] : [];

    if (!droppedNodes) {
      diagram.selection.each((part) => {
        if (part instanceof go.Node) nodes.push(part);
      });
    }

    if (!nodes.length) return;

    const model = diagram.model as go.GraphLinksModel;
    let createdLink = false;

    diagram.startTransaction('Auto-connect dropped fault-tree component');

    nodes.forEach((child, index) => {
      if (child.findLinksInto().first()) return;

      const dropPoint = diagram.lastInput.documentPoint;
      const parent = this.findNearestValidTargetParent(
        diagram,
        dropPoint,
        [child]
      );

      if (!parent) return;

      const duplicate = model.linkDataArray.some((linkData) => {
        const link = linkData as { from?: unknown; to?: unknown };
        return String(link.from) === String(parent.key) &&
          String(link.to) === String(child.key);
      });

      if (duplicate) return;

      const linkData = {
        key: `AUTO-${String(parent.key)}-${String(child.key)}-${model.linkDataArray.length + index + 1}`,
        from: String(parent.key),
        to: String(child.key),
        fromPort: 'OUT' as const,
        toPort: 'IN' as const,
        negated: false
      };

      model.addLinkData(linkData);

      const childData = child.data as FaultTreeNodeData;
      model.setDataProperty(childData, 'manualY', undefined);

      const sourceNode = this.model.nodes.find((node) => node.key === childData.key);
      if (sourceNode) {
        sourceNode.manualY = undefined;
      }

      if (!this.model.links.some((link) => String(link.key) === String(linkData.key))) {
        this.model.links.push({ ...linkData });
      }

      createdLink = true;
    });

    diagram.commitTransaction('Auto-connect dropped fault-tree component');

    if (createdLink) {
      diagram.layoutDiagram(true);
    }
  }

  private findNearestFaultTreeParent(
    child: go.Node,
    candidates: readonly go.Node[]
  ): go.Node | null {
    const childCenter = child.actualBounds.center;
    let best: go.Node | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const candidate of candidates) {
      const parentCenter = candidate.actualBounds.center;
      const verticalDistance = childCenter.y - candidate.actualBounds.bottom;
      const horizontalDistance = Math.abs(childCenter.x - parentCenter.x);

      if (verticalDistance < -8) continue;
      if (horizontalDistance > 260 || verticalDistance > 300) continue;

      const score = Math.max(0, verticalDistance) + horizontalDistance * 1.6;

      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    return best;
  }

  private resolveTemplateCategory(node: FaultTreeNodeData): string {
    if (node.category === 'TOP_EVENT') {
      return this.gateTemplateKey('TOP_EVENT', node.gateType);
    }

    if (node.category === 'GATE') {
      return this.gateTemplateKey('GATE', node.gateType);
    }

    if (node.category === 'BASIC_EVENT') {
      return node.symbol === 'DIAMOND'
        ? 'BASIC_EVENT_DIAMOND'
        : 'BASIC_EVENT_CIRCLE';
    }

    if (node.category === 'HOUSE_EVENT') return 'HOUSE_EVENT';
    if (node.category === 'TRANSFER') return 'TRANSFER';
    if (node.category === 'EXCHANGE_EVENT') return 'EXCHANGE_EVENT';

    return 'GATE_DEFAULT';
  }

  private gateTemplateKey(prefix: 'GATE' | 'TOP_EVENT', type: GateType | undefined): string {
    switch (type) {
      case 'AND':
      case 'OR':
      case 'NAND':
      case 'NOR':
      case 'XOR':
      case 'KOFN':
        return `${prefix}_${type}`;
      default:
        return `${prefix}_DEFAULT`;
    }
  }

  private applyModel(): void {
    if (!this.diagram || !this.model) return;

    this.insertionParentKey = null;
    this.insertionParentId = null;
    this.branchAttachParentKey = null;
    this.branchAttachParentId = null;

    const siblingOrderByKey = new Map<string, number>();
    const parentCounts = new Map<string, number>();
    this.model.links.forEach((link) => {
      const parentKey = String(link.from);
      const index = parentCounts.get(parentKey) ?? 0;
      siblingOrderByKey.set(String(link.to), index);
      parentCounts.set(parentKey, index + 1);
    });

    const model = new go.GraphLinksModel(
      this.model.nodes.map((node) => ({
        ...node,
        symbol: node.category === 'BASIC_EVENT'
          ? (node.symbol ?? 'CIRCLE')
          : node.symbol,
        templateCategory: this.resolveTemplateCategory(node),
        siblingOrder: node.siblingOrder ?? siblingOrderByKey.get(String(node.key)) ?? 0
      })),
      this.model.links.map((link) => ({
        ...link,
        fromPort: 'OUT',
        toPort: 'IN'
      }))
    );

    model.nodeCategoryProperty = 'templateCategory';
    model.linkKeyProperty = 'key';
    model.linkFromPortIdProperty = 'fromPort';
    model.linkToPortIdProperty = 'toPort';

    this.diagram.model = model;
    this.diagram.layoutDiagram(true);
  }

  private updateZoomLabel(): void {
    this.zoomPercent = Math.round((this.diagram?.scale ?? 1) * 100);
  }
}
