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
  FaultTreeModel,
  FaultTreeNodeData
} from '../../core/models/psa.models';
import {
  gateCaption,
  gateGeometry,
  gateOutputPortY,
  gateSymbolHeight,
  hasOutputNegationBubble,
  HOUSE_EVENT_GEOMETRY,
  isKofNGate,
  TRANSFER_GEOMETRY
} from './fault-tree-symbols';

@Component({
  selector: 'app-fault-tree-editor',
  standalone: true,
  template: `
    <div class="ft-shell">
      <aside class="palette-shell">
        <div class="panel-title">
          <span>Fault Tree Symbols</span>
          <span class="panel-hint">RiskSpectrum-style</span>
        </div>
        <div class="palette-help">Drag a symbol to the diagram.</div>
        <div #paletteDiv class="palette-canvas"></div>
      </aside>

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
          </div>
          <div class="toolbar-note">
            OR · AND · NAND · NOR · XOR · K/N · Basic · House · Undeveloped · Transfer
          </div>
          <div class="toolbar-group push-right">
            <span class="status-dot"></span>
            GoJS Fault Tree
          </div>
        </div>
        <div #diagramDiv class="diagram-canvas" aria-label="NextPSA fault tree diagram"></div>
      </section>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; min-height: 520px; }
    .ft-shell { display: grid; grid-template-columns: 228px minmax(0, 1fr); height: 100%; background: #fff; }
    .palette-shell { border-right: 1px solid var(--nps-border); background: #f8fafc; min-width: 0; display: grid; grid-template-rows: 44px 28px 1fr; }
    .panel-title { padding: 0 12px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--nps-border); font-weight: 700; font-size: 12px; background: #fff; }
    .panel-hint { color: var(--nps-text-muted); font-weight: 600; font-size: 9px; }
    .palette-help { display: flex; align-items: center; padding: 0 12px; color: var(--nps-text-muted); font-size: 9px; border-bottom: 1px solid #edf2f7; }
    .palette-canvas { min-height: 440px; background: #f8fafc; }
    .diagram-shell { min-width: 0; min-height: 0; display: grid; grid-template-rows: 42px 1fr; }
    .diagram-toolbar { display: flex; align-items: center; gap: 10px; padding: 0 10px; border-bottom: 1px solid var(--nps-border); background: #fff; color: var(--nps-text-muted); font-size: 10px; }
    .toolbar-group { display: flex; align-items: center; gap: 5px; }
    .toolbar-group button { height: 28px; min-width: 30px; border: 1px solid var(--nps-border); border-radius: 6px; background: #fff; color: var(--nps-text); cursor: pointer; font-weight: 600; }
    .toolbar-group button:hover { background: #eef5ff; border-color: #b6cdf7; }
    .toolbar-separator { width: 1px; height: 20px; background: var(--nps-border); }
    .toolbar-note { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #7b8798; }
    .zoom-label { min-width: 38px; text-align: center; font-variant-numeric: tabular-nums; }
    .push-right { margin-left: auto; white-space: nowrap; }
    .status-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; }
    .diagram-canvas { min-height: 470px; width: 100%; height: 100%; background-color: #fff; background-image: linear-gradient(#eef2f6 1px, transparent 1px), linear-gradient(90deg, #eef2f6 1px, transparent 1px); background-size: 16px 16px; }
  `]
})
export class FaultTreeEditorComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('diagramDiv', { static: true }) private diagramDiv!: ElementRef<HTMLDivElement>;
  @ViewChild('paletteDiv', { static: true }) private paletteDiv!: ElementRef<HTMLDivElement>;

  @Input({ required: true }) model!: FaultTreeModel;
  @Output() readonly selectedNodeChange = new EventEmitter<FaultTreeNodeData | null>();
  @Output() readonly recordOpen = new EventEmitter<FaultTreeNodeData>();

  private diagram?: go.Diagram;
  private palette?: go.Palette;
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

  fit(): void {
    this.diagram?.commandHandler.zoomToFit();
    this.updateZoomLabel();
  }

  zoom(delta: number): void {
    if (!this.diagram) return;
    this.diagram.scale = Math.min(2.5, Math.max(0.35, this.diagram.scale + delta));
    this.updateZoomLabel();
  }

  private initializeDiagram(): void {
    const $ = go.GraphObject.make;

    /**
     * The symbol panel has no decorative padding:
     * its top is the exact logical output point and its bottom is the exact input base.
     * Therefore the vertical record-to-gate line and the GoJS branch link visibly touch.
     */
    const gateSymbolPanel = () =>
      $(go.Panel, 'Position',
        {
          width: 60
        },
        new go.Binding('height', 'gateType', gateSymbolHeight),
        $(go.Shape, {
            position: new go.Point(0, 0),
            width: 60,
            height: 40,
            stretch: go.Stretch.Fill,
            fill: '#ffffff',
            stroke: '#111827',
            strokeWidth: 1.25
          },
          new go.Binding('geometryString', 'gateType', gateGeometry),
          new go.Binding('position', 'gateType', (type: FaultTreeNodeData['gateType']) =>
            new go.Point(0, hasOutputNegationBubble(type) ? 8 : 0)
          ),
          new go.Binding('visible', 'gateType', (type: FaultTreeNodeData['gateType']) => !isKofNGate(type))
        ),
        $(go.Shape, 'Circle', {
            position: new go.Point(26, 0),
            width: 8,
            height: 8,
            fill: '#ffffff',
            stroke: '#111827',
            strokeWidth: 1.15,
            visible: false
          },
          new go.Binding('visible', 'gateType', hasOutputNegationBubble)
        ),
        $(go.Shape, 'Rectangle', {
            position: new go.Point(10, 0),
            width: 40,
            height: 24,
            fill: '#ffffff',
            stroke: '#111827',
            strokeWidth: 1.15,
            visible: false
          },
          new go.Binding('visible', 'gateType', isKofNGate)
        ),
        $(go.TextBlock, {
            position: new go.Point(16, 6),
            width: 28,
            textAlign: 'center',
            font: '700 9px Inter, sans-serif',
            stroke: '#111827',
            visible: false
          },
          new go.Binding('text', '', (data: FaultTreeNodeData) => gateCaption(data.gateType, data.k)),
          new go.Binding('visible', 'gateType', isKofNGate)
        ),
        // Exact branch origin. Using a named port removes the visual gap between
        // the gate curve and the orthogonal child branch.
        $(go.Shape, 'Circle', {
            portId: 'OUT',
            fromLinkable: true,
            fromSpot: go.Spot.Bottom,
            width: 2,
            height: 2,
            fill: null,
            stroke: null
          },
          new go.Binding('position', 'gateType', (type: FaultTreeNodeData['gateType']) =>
            new go.Point(29, gateOutputPortY(type) - 1)
          )
        )
      );

    const labelPanel = (fill = '#f2f2f2', stroke = '#777777') =>
      $(go.Panel, 'Auto',
        {
          name: 'LABEL',
          portId: 'IN',
          toLinkable: true,
          toSpot: go.Spot.Top
        },
        $(go.Shape, 'RoundedRectangle', {
          fill,
          stroke,
          strokeWidth: 1,
          parameter1: 3
        }),
        $(go.Panel, 'Vertical', { margin: new go.Margin(5, 8), maxSize: new go.Size(178, NaN) },
          $(go.TextBlock, {
            font: '700 9px Inter, sans-serif',
            stroke: '#111827',
            textAlign: 'center'
          }, new go.Binding('text', 'id')),
          $(go.TextBlock, {
            margin: new go.Margin(2, 0, 0, 0),
            font: '8px Inter, sans-serif',
            stroke: '#475569',
            textAlign: 'center',
            wrap: go.Wrap.Fit,
            maxSize: new go.Size(160, 32)
          }, new go.Binding('text', 'description'))
        )
      );

    const recordToSymbolConnector = (height = 7) =>
      $(go.Shape, 'LineV', {
        width: 1,
        height,
        stroke: '#374151',
        strokeWidth: 1.15,
        margin: 0
      });

    const basicEventSymbol = () =>
      $(go.Panel, 'Spot',
        { width: 40, height: 40 },
        $(go.Shape, {
            width: 32,
            height: 32,
            fill: '#ffffff',
            stroke: '#111827',
            strokeWidth: 1.25
          },
          new go.Binding('figure', 'symbol', (symbol: FaultTreeNodeData['symbol']) =>
            symbol === 'DIAMOND' ? 'Diamond' : 'Circle'
          ),
          new go.Binding('width', 'symbol', (symbol: FaultTreeNodeData['symbol']) =>
            symbol === 'DIAMOND' ? 28 : 32
          ),
          new go.Binding('height', 'symbol', (symbol: FaultTreeNodeData['symbol']) =>
            symbol === 'DIAMOND' ? 28 : 32
          )
        )
      );

    const houseEventSymbol = () =>
      $(go.Shape, {
        geometryString: HOUSE_EVENT_GEOMETRY,
        width: 38,
        height: 34,
        stretch: go.Stretch.Fill,
        fill: '#ffffff',
        stroke: '#111827',
        strokeWidth: 1.2
      });

    const transferSymbol = () =>
      $(go.Shape, {
        geometryString: TRANSFER_GEOMETRY,
        width: 38,
        height: 34,
        stretch: go.Stretch.Fill,
        fill: '#ffffff',
        stroke: '#111827',
        strokeWidth: 1.2
      });

    const baseNodeProperties: Partial<go.Node> = {
      selectionAdorned: true,
      selectionChanged: (node) => {
        const data = node.isSelected ? node.data as FaultTreeNodeData : null;
        this.zone.run(() => this.selectedNodeChange.emit(data));
      },
      doubleClick: (_event, node) => {
        this.zone.run(() => this.recordOpen.emit((node as go.Node).data as FaultTreeNodeData));
      }
    };

    const topTemplate =
      $(go.Node, 'Vertical',
        baseNodeProperties,
        { selectionObjectName: 'LABEL' },
        labelPanel('#cfcfcf', '#5f5f5f'),
        recordToSymbolConnector(7),
        gateSymbolPanel()
      );

    const gateTemplate =
      $(go.Node, 'Vertical',
        baseNodeProperties,
        { selectionObjectName: 'LABEL' },
        labelPanel(),
        recordToSymbolConnector(7),
        gateSymbolPanel()
      );

    const basicTemplate =
      $(go.Node, 'Vertical',
        baseNodeProperties,
        { selectionObjectName: 'LABEL' },
        labelPanel('#f6f6f6', '#888888'),
        recordToSymbolConnector(6),
        basicEventSymbol()
      );

    const houseTemplate =
      $(go.Node, 'Vertical',
        baseNodeProperties,
        { selectionObjectName: 'LABEL' },
        labelPanel('#f6f6f6', '#888888'),
        recordToSymbolConnector(6),
        houseEventSymbol()
      );

    const transferTemplate =
      $(go.Node, 'Vertical',
        baseNodeProperties,
        { selectionObjectName: 'LABEL' },
        labelPanel('#f6f6f6', '#888888'),
        recordToSymbolConnector(6),
        transferSymbol()
      );

    const diagram = $(go.Diagram, this.diagramDiv.nativeElement, {
      allowDrop: true,
      initialAutoScale: go.AutoScale.Uniform,
      contentAlignment: go.Spot.TopCenter,
      padding: 42,
      grid: $(go.Panel, 'Grid',
        { gridCellSize: new go.Size(16, 16) },
        $(go.Shape, 'LineH', { stroke: '#eef2f6', strokeWidth: 0.45 }),
        $(go.Shape, 'LineV', { stroke: '#eef2f6', strokeWidth: 0.45 })
      ),
      'draggingTool.isGridSnapEnabled': true,
      'undoManager.isEnabled': true,
      layout: $(go.TreeLayout, {
        angle: 90,
        layerSpacing: 66,
        nodeSpacing: 30,
        alignment: go.TreeAlignment.CenterChildren,
        compaction: go.TreeCompaction.Block
      })
    });

    diagram.nodeTemplateMap.add('TOP_EVENT', topTemplate);
    diagram.nodeTemplateMap.add('GATE', gateTemplate);
    diagram.nodeTemplateMap.add('BASIC_EVENT', basicTemplate);
    diagram.nodeTemplateMap.add('HOUSE_EVENT', houseTemplate);
    diagram.nodeTemplateMap.add('TRANSFER', transferTemplate);
    diagram.nodeTemplateMap.add('EXCHANGE_EVENT', transferTemplate);
    diagram.nodeTemplateMap.add('COMMENT', gateTemplate);
    diagram.nodeTemplateMap.add('CONTINUATION', gateTemplate);
    diagram.nodeTemplateMap.add('UNDEFINED', gateTemplate);

    diagram.linkTemplate =
      $(go.Link, {
          routing: go.Routing.Orthogonal,
          corner: 0,
          selectable: true,
          adjusting: go.LinkAdjusting.End
        },
        $(go.Shape, { stroke: '#374151', strokeWidth: 1.2 }),
        $(go.Shape, {
            segmentIndex: -1,
            segmentFraction: 0.87,
            width: 8,
            height: 8,
            figure: 'Circle',
            fill: '#ffffff',
            stroke: '#111827',
            strokeWidth: 1.15
          },
          new go.Binding('visible', 'negated', Boolean)
        )
      );

    diagram.addDiagramListener('ViewportBoundsChanged', () => this.zone.run(() => this.updateZoomLabel()));

    // When a symbol is dragged from the palette into the fault tree, automatically
    // create the logical link FROM the nearest gate/top event ABOVE the drop
    // TO the newly inserted component. No dangling/virtual branch is drawn before
    // a child actually exists.
    diagram.addDiagramListener('ExternalObjectsDropped', () => {
      this.autoConnectDroppedNodes(diagram);
    });

    this.diagram = diagram;

    /**
     * Palette symbols are another 15% smaller than the previous revision.
     * The visual scale is now ~64% of the diagram symbol size.
     *
     * Scaling alone would also thin the vector strokes, so the palette copies
     * get reinforced strokes before scaling. This keeps the compact symbols
     * clearly visible, like the RiskSpectrum symbol catalogue.
     */
    const reinforcePaletteStrokes = (object: go.GraphObject): void => {
      if (object instanceof go.Shape && object.stroke) {
        object.strokeWidth = Math.max(1.8, object.strokeWidth * 1.65);
      }
      if (object instanceof go.Panel) {
        object.elements.each((child) => reinforcePaletteStrokes(child));
      }
    };

    const fixedSymbolSlot = (content: go.GraphObject) => {
      reinforcePaletteStrokes(content);
      content.scale = 0.64;
      return $(go.Panel, 'Spot',
        {
          width: 48,
          height: 38,
          alignment: go.Spot.Center
        },
        content
      );
    };

    const paletteGateTemplate =
      $(go.Node, 'Horizontal',
        {
          width: 202,
          height: 46,
          selectionAdorned: true,
          cursor: 'grab',
          defaultAlignment: go.Spot.Center
        },
        fixedSymbolSlot(gateSymbolPanel()),
        $(go.TextBlock, {
            width: 146,
            margin: new go.Margin(0, 0, 0, 8),
            verticalAlignment: go.Spot.Center,
            font: '600 9.5px Inter, sans-serif',
            stroke: '#1f2937'
          },
          new go.Binding('text', 'id')
        )
      );

    const paletteBasicTemplate =
      $(go.Node, 'Horizontal',
        {
          width: 202,
          height: 46,
          selectionAdorned: true,
          cursor: 'grab',
          defaultAlignment: go.Spot.Center
        },
        fixedSymbolSlot(basicEventSymbol()),
        $(go.TextBlock, {
            width: 146,
            margin: new go.Margin(0, 0, 0, 8),
            verticalAlignment: go.Spot.Center,
            font: '600 9.5px Inter, sans-serif',
            stroke: '#1f2937'
          },
          new go.Binding('text', 'id')
        )
      );

    const paletteHouseTemplate =
      $(go.Node, 'Horizontal',
        {
          width: 202,
          height: 46,
          selectionAdorned: true,
          cursor: 'grab',
          defaultAlignment: go.Spot.Center
        },
        fixedSymbolSlot(houseEventSymbol()),
        $(go.TextBlock, {
            width: 146,
            margin: new go.Margin(0, 0, 0, 8),
            verticalAlignment: go.Spot.Center,
            font: '600 9.5px Inter, sans-serif',
            stroke: '#1f2937'
          },
          new go.Binding('text', 'id')
        )
      );

    const paletteTransferTemplate =
      $(go.Node, 'Horizontal',
        {
          width: 202,
          height: 46,
          selectionAdorned: true,
          cursor: 'grab',
          defaultAlignment: go.Spot.Center
        },
        fixedSymbolSlot(transferSymbol()),
        $(go.TextBlock, {
            width: 146,
            margin: new go.Margin(0, 0, 0, 8),
            verticalAlignment: go.Spot.Center,
            font: '600 9.5px Inter, sans-serif',
            stroke: '#1f2937'
          },
          new go.Binding('text', 'id')
        )
      );

    const palette = $(go.Palette, this.paletteDiv.nativeElement, {
      layout: $(go.GridLayout, {
        wrappingColumn: 1,
        spacing: new go.Size(0, 4),
        cellSize: new go.Size(202, 46)
      })
    });

    palette.nodeTemplateMap.add('GATE', paletteGateTemplate);
    palette.nodeTemplateMap.add('BASIC_EVENT', paletteBasicTemplate);
    palette.nodeTemplateMap.add('HOUSE_EVENT', paletteHouseTemplate);
    palette.nodeTemplateMap.add('TRANSFER', paletteTransferTemplate);

    palette.model = new go.GraphLinksModel([
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
    ] as FaultTreeNodeData[]);

    this.palette = palette;
  }

  /**
   * Connect newly dropped palette nodes as CHILDREN of the most plausible
   * RiskSpectrum logic parent. The link direction is always:
   *
   *   parent gate/top event OUT  --->  child record IN
   *
   * This is intentionally not reversed: in a fault tree the branch leaves the
   * gate and terminates on the child component/record.
   */
  private autoConnectDroppedNodes(diagram: go.Diagram): void {
    const droppedNodes: go.Node[] = [];
    diagram.selection.each((part) => {
      if (part instanceof go.Node) droppedNodes.push(part);
    });

    if (!droppedNodes.length) return;

    const droppedKeys = new Set(droppedNodes.map((node) => node.key));
    const parentCandidates: go.Node[] = [];

    diagram.nodes.each((node) => {
      if (droppedKeys.has(node.key)) return;
      const data = node.data as FaultTreeNodeData;
      if (data.category === 'TOP_EVENT' || data.category === 'GATE') {
        parentCandidates.push(node);
      }
    });

    if (!parentCandidates.length) return;

    const model = diagram.model as go.GraphLinksModel;
    let createdLink = false;

    diagram.startTransaction('Auto-connect dropped fault-tree component');

    droppedNodes.forEach((child, index) => {
      // Do not add a second parent if the copied object already arrived linked.
      let alreadyConnected = false;
      child.findLinksInto().each(() => {
        alreadyConnected = true;
      });
      if (alreadyConnected) return;

      const parent = this.findNearestFaultTreeParent(child, parentCandidates);
      if (!parent) return;

      const duplicate = model.linkDataArray.some((linkData) => {
        const link = linkData as { from?: unknown; to?: unknown };
        return link.from === parent.key && link.to === child.key;
      });
      if (duplicate) return;

      model.addLinkData({
        key: `AUTO-${String(parent.key)}-${String(child.key)}-${model.linkDataArray.length + index + 1}`,
        from: parent.key,
        to: child.key,
        fromPort: 'OUT',
        toPort: 'IN',
        negated: false
      });
      createdLink = true;
    });

    diagram.commitTransaction('Auto-connect dropped fault-tree component');

    if (createdLink) {
      // Once linked, let the fault-tree layout place the new child cleanly
      // beneath its parent branch.
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

      // The new record must be visually below its logical parent.
      if (verticalDistance < -8) continue;

      // Prevent accidental connection to a far-away gate in another branch.
      if (horizontalDistance > 260 || verticalDistance > 300) continue;

      // Horizontal alignment matters strongly in a fault tree: a component
      // dropped below a gate should join that gate's branch.
      const score = Math.max(0, verticalDistance) + horizontalDistance * 1.6;

      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    return best;
  }

  private applyModel(): void {
    if (!this.diagram || !this.model) return;
    const model = new go.GraphLinksModel(
      this.model.nodes.map((node) => ({
        ...node,
        symbol: node.category === 'BASIC_EVENT' ? (node.symbol ?? 'CIRCLE') : node.symbol
      })),
      this.model.links.map((link) => ({
        ...link,
        fromPort: 'OUT',
        toPort: 'IN'
      }))
    );
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
