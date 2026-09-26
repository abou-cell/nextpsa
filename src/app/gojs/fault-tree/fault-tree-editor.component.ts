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
            <span>Drag a symbol onto the fault tree</span>
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

    .diagram-canvas {
      min-height: 470px;
      width: 100%;
      height: 100%;
      background-color: #fff;
      background-image:
        linear-gradient(#eef2f6 1px, transparent 1px),
        linear-gradient(90deg, #eef2f6 1px, transparent 1px);
      background-size: 16px 16px;
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

  /**
   * Visible input port used by every Fault Tree record.
   * For Gate records this is paired with an OUT port at the bottom.
   * Terminal records (BE / HE / Diamond / Transfer) only expose this IN port.
   */
  private makeTopPort(): go.Shape {
    const $ = go.GraphObject.make;
    return $(go.Shape, 'Circle', {
      portId: 'IN',
      desiredSize: new go.Size(7, 7),
      fill: '#ffffff',
      stroke: '#111827',
      strokeWidth: 1.2,
      alignment: new go.Spot(0.5, 0, 0, -3),
      fromLinkable: false,
      toLinkable: true,
      toSpot: go.Spot.Top,
      cursor: 'pointer'
    });
  }

  /** Visible Gate output port. */
  private makeBottomPort(): go.Shape {
    const $ = go.GraphObject.make;
    return $(go.Shape, 'Circle', {
      portId: 'OUT',
      desiredSize: new go.Size(7, 7),
      fill: '#ffffff',
      stroke: '#111827',
      strokeWidth: 1.2,
      alignment: new go.Spot(0.5, 1, 0, 0),
      fromLinkable: true,
      toLinkable: false,
      fromSpot: go.Spot.Bottom,
      cursor: 'pointer'
    });
  }

  private initializeDiagram(): void {
    const $ = go.GraphObject.make;

    const labelPanel = (fill = '#f2f2f2', stroke = '#777777') =>
      $(go.Panel, 'Auto',
        { name: 'LABEL' },
        $(go.Shape, 'RoundedRectangle', {
          fill,
          stroke,
          strokeWidth: 1,
          parameter1: 3
        }),
        $(go.Panel, 'Vertical',
          {
            margin: new go.Margin(5, 8),
            maxSize: new go.Size(178, NaN)
          },
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

    /**
     * RiskSpectrum-style Gate artwork.
     * The gate body is intentionally separate from the GoJS connection ports.
     * NAND / NOR use the same gate body plus the inversion bubble above it.
     */
    const gateArtwork = (gateType: GateType, includeOutputPort = true) =>
      $(go.Panel, 'Spot',
        {
          width: 64,
          height: 50
        },
        $(go.Shape, {
            width: 56,
            height: 36,
            stretch: go.Stretch.Fill,
            fill: '#ffffff',
            stroke: '#1f2937',
            strokeWidth: gateType === 'AND' || gateType === 'NAND' ? 1.9 : 1.8,
            alignment: new go.Spot(0.5, 0.58),
            visible: !isKofNGate(gateType),
            geometryString: gateGeometry(gateType)
          }
        ),
        $(go.Shape, 'Circle', {
          desiredSize: new go.Size(8, 8),
          fill: '#ffffff',
          stroke: '#1f2937',
          strokeWidth: 1.4,
          alignment: new go.Spot(0.5, 0, 0, 4),
          visible: hasOutputNegationBubble(gateType)
        }),
        $(go.Shape, 'Rectangle', {
          desiredSize: new go.Size(36, 22),
          fill: '#ffffff',
          stroke: '#1f2937',
          strokeWidth: 1.7,
          alignment: new go.Spot(0.5, 0.56),
          visible: isKofNGate(gateType)
        }),
        $(go.TextBlock, {
            font: '700 9px Inter, sans-serif',
            stroke: '#111827',
            alignment: new go.Spot(0.5, 0.56),
            visible: isKofNGate(gateType)
          },
          new go.Binding('text', 'k', (k: number | undefined) => gateCaption(gateType, k))
        ),
        ...(includeOutputPort ? [this.makeBottomPort()] : [])
      );

    const basicCircleArtwork = () =>
      $(go.Shape, 'Circle', {
        desiredSize: new go.Size(28, 28),
        fill: '#ffffff',
        stroke: '#1f2937',
        strokeWidth: 1.7
      });

    const diamondArtwork = () =>
      $(go.Shape, 'Diamond', {
        desiredSize: new go.Size(26, 26),
        fill: '#ffffff',
        stroke: '#1f2937',
        strokeWidth: 1.7
      });

    const houseArtwork = () =>
      $(go.Shape, {
        geometryString: HOUSE_EVENT_GEOMETRY,
        desiredSize: new go.Size(28, 24),
        stretch: go.Stretch.Fill,
        fill: '#ffffff',
        stroke: '#1f2937',
        strokeWidth: 1.7
      });

    const transferArtwork = () =>
      $(go.Shape, {
        geometryString: TRANSFER_GEOMETRY,
        desiredSize: new go.Size(26, 26),
        stretch: go.Stretch.Fill,
        fill: '#ffffff',
        stroke: '#1f2937',
        strokeWidth: 1.7
      });

    const baseNodeProperties: Partial<go.Node> = {
      selectionAdorned: true,
      locationSpot: go.Spot.Center,
      selectionChanged: (node) => {
        const data = node.isSelected ? node.data as FaultTreeNodeData : null;
        this.zone.run(() => this.selectedNodeChange.emit(data));
      },
      doubleClick: (_event, node) => {
        this.zone.run(() => this.recordOpen.emit((node as go.Node).data as FaultTreeNodeData));
      }
    };

    const makeGateNodeTemplate = (
      gateType: GateType,
      topEvent = false
    ) =>
      $(go.Node, 'Spot',
        baseNodeProperties,
        { selectionObjectName: 'LABEL' },
        $(go.Panel, 'Vertical',
          labelPanel(topEvent ? '#cfcfcf' : '#f2f2f2', topEvent ? '#5f5f5f' : '#777777'),
          recordToSymbolConnector(7),
          gateArtwork(gateType, true)
        ),
        this.makeTopPort()
      );

    const makeTerminalNodeTemplate = (
      artwork: go.GraphObject,
      connectorHeight = 6
    ) =>
      $(go.Node, 'Spot',
        baseNodeProperties,
        { selectionObjectName: 'LABEL' },
        $(go.Panel, 'Vertical',
          labelPanel('#f6f6f6', '#888888'),
          recordToSymbolConnector(connectorHeight),
          $(go.Panel, 'Spot',
            { width: 46, height: 46 },
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
      $(go.Link, {
          routing: go.Routing.Orthogonal,
          corner: 0,
          selectable: true,
          adjusting: go.LinkAdjusting.End
        },
        $(go.Shape, {
          stroke: '#374151',
          strokeWidth: 1.2
        }),
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

    diagram.addDiagramListener(
      'ViewportBoundsChanged',
      () => this.zone.run(() => this.updateZoomLabel())
    );

    diagram.addDiagramListener('ExternalObjectsDropped', () => {
      this.autoConnectDroppedNodes(diagram);
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
          cursor: 'grab',
          locationSpot: go.Spot.Center,
          toolTip: paletteToolTip()
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
   * Connect newly dropped palette nodes as CHILDREN of the most plausible
   * Gate / Top Event. Direction is always parent OUT -> child IN.
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

    const model = new go.GraphLinksModel(
      this.model.nodes.map((node) => ({
        ...node,
        symbol: node.category === 'BASIC_EVENT'
          ? (node.symbol ?? 'CIRCLE')
          : node.symbol,
        templateCategory: this.resolveTemplateCategory(node)
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
