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
   * RiskSpectrum does not draw visible connection handles. The ports remain
   * available to GoJS for precise routing and hit-testing but are fully transparent.
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

  /** Invisible logical output for Gate / Top Event nodes only. */
  private makeBottomPort(): go.Shape {
    const $ = go.GraphObject.make;
    return $(go.Shape, 'Rectangle', {
      portId: 'OUT',
      width: 12,
      height: 8,
      fill: 'transparent',
      stroke: null,
      opacity: 0,
      alignment: go.Spot.Bottom,
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

    const recordToSymbolConnector = (height = 4) =>
      $(go.Shape, 'LineV', {
        width: 1,
        height,
        stroke: '#111111',
        strokeWidth: 1,
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
          width: 40,
          height: 34
        },
        $(go.Shape, {
            width: 32,
            height: 27,
            stretch: go.Stretch.Fill,
            fill: '#ffffff',
            stroke: '#111111',
            strokeWidth: 1.25,
            alignment: new go.Spot(0.5, 0.62),
            visible: !isKofNGate(gateType),
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
          alignment: new go.Spot(0.5, 0.60),
          visible: isKofNGate(gateType)
        }),
        $(go.TextBlock, {
            font: '8px Inter, sans-serif',
            stroke: '#111111',
            alignment: new go.Spot(0.5, 0.60),
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
      selectionChanged: (node) => {
        const data = node.isSelected ? node.data as FaultTreeNodeData : null;
        this.zone.run(() => this.selectedNodeChange.emit(data));
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
        menuButton('Cut', 'CUT'),
        menuButton('Copy', 'COPY'),
        menuButton('Paste', 'PASTE'),
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
        menuButton('Cut', 'CUT'),
        menuButton('Copy', 'COPY'),
        menuButton('Paste', 'PASTE'),
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
          contextMenu: gateContextMenu()
        },
        $(go.Panel, 'Vertical',
          labelPanel(topEvent ? '#d0d0d0' : '#ffffff', '#111111'),
          recordToSymbolConnector(4),
          gateArtwork(gateType, true)
        ),
        this.makeTopPort()
      );

    const makeTerminalNodeTemplate = (
      artwork: go.GraphObject,
      connectorHeight = 4
    ) =>
      $(go.Node, 'Spot',
        baseNodeProperties,
        {
          selectionObjectName: 'LABEL',
          contextMenu: terminalContextMenu(artwork instanceof go.Shape && artwork.geometryString === TRANSFER_GEOMETRY)
        },
        $(go.Panel, 'Vertical',
          labelPanel('#ffffff', '#111111'),
          recordToSymbolConnector(connectorHeight),
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
      layout: $(go.TreeLayout, {
        angle: 90,
        layerSpacing: 38,
        nodeSpacing: 16,
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

  private handleContextAction(action: string, node: go.Node): void {
    const diagram = node.diagram;
    if (!diagram) return;

    diagram.select(node);

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
        diagram.commandHandler.cutSelection();
        return;

      case 'COPY':
        diagram.commandHandler.copySelection();
        return;

      case 'PASTE':
        diagram.commandHandler.pasteSelection();
        return;

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
