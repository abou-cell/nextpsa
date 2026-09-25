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

@Component({
  selector: 'app-fault-tree-editor',
  standalone: true,
  template: `
    <div class="ft-shell">
      <aside class="palette-shell">
        <div class="panel-title">
          <span>PRA Elements</span>
          <span class="panel-hint">drag to canvas</span>
        </div>
        <div #paletteDiv class="palette-canvas"></div>
      </aside>

      <section class="diagram-shell">
        <div class="diagram-toolbar">
          <div class="toolbar-group">
            <button type="button" (click)="undo()">↶</button>
            <button type="button" (click)="redo()">↷</button>
          </div>
          <div class="toolbar-group">
            <button type="button" (click)="zoom(-0.1)">−</button>
            <span>{{ zoomPercent }}%</span>
            <button type="button" (click)="zoom(0.1)">+</button>
            <button type="button" (click)="fit()">Fit</button>
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
    .ft-shell { display: grid; grid-template-columns: 190px minmax(0, 1fr); height: 100%; background: #fff; }
    .palette-shell { border-right: 1px solid var(--nps-border); background: #f8fbff; min-width: 0; }
    .panel-title { height: 44px; padding: 0 12px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--nps-border); font-weight: 700; font-size: 12px; }
    .panel-hint { color: var(--nps-text-muted); font-weight: 500; font-size: 10px; }
    .palette-canvas { height: calc(100% - 44px); min-height: 470px; background: #f8fbff; }
    .diagram-shell { min-width: 0; min-height: 0; display: grid; grid-template-rows: 42px 1fr; }
    .diagram-toolbar { display: flex; align-items: center; gap: 12px; padding: 0 10px; border-bottom: 1px solid var(--nps-border); background: #fff; color: var(--nps-text-muted); font-size: 11px; }
    .toolbar-group { display: flex; align-items: center; gap: 5px; }
    .toolbar-group button { height: 28px; min-width: 30px; border: 1px solid var(--nps-border); border-radius: 7px; background: #fff; color: var(--nps-text); cursor: pointer; }
    .toolbar-group button:hover { background: #eef5ff; border-color: #b6cdf7; }
    .push-right { margin-left: auto; }
    .status-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; }
    .diagram-canvas { min-height: 470px; width: 100%; height: 100%; background-color: #fff; background-image: linear-gradient(#edf2f7 1px, transparent 1px), linear-gradient(90deg, #edf2f7 1px, transparent 1px); background-size: 16px 16px; }
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

    const gateShape = (fill = '#eff6ff') =>
      $(go.Panel, 'Spot',
        { desiredSize: new go.Size(58, 40) },
        $(go.Shape, {
          geometryString: 'F M0 38 L5 18 C10 3 48 3 53 18 L58 38 Z',
          fill,
          stroke: '#2563eb',
          strokeWidth: 2
        }),
        $(go.TextBlock, {
          font: '700 10px Inter, sans-serif',
          stroke: '#1d4ed8',
          alignment: new go.Spot(0.5, 0.58)
        }, new go.Binding('text', 'gateType', (type: string) => type === 'KOFN' ? 'K/N' : type))
      );

    const labelPanel = () =>
      $(go.Panel, 'Auto',
        $(go.Shape, 'RoundedRectangle', {
          fill: '#fffaf0',
          stroke: '#c08a2a',
          strokeWidth: 1.2,
          parameter1: 5
        }),
        $(go.Panel, 'Vertical', { margin: 6, maxSize: new go.Size(170, NaN) },
          $(go.TextBlock, {
            font: '700 10px Inter, sans-serif',
            stroke: '#172033',
            textAlign: 'center'
          }, new go.Binding('text', 'id')),
          $(go.TextBlock, {
            margin: new go.Margin(2, 0, 0, 0),
            font: '9px Inter, sans-serif',
            stroke: '#475569',
            textAlign: 'center',
            wrap: go.Wrap.Fit,
            maxSize: new go.Size(155, 34)
          }, new go.Binding('text', 'description'))
        )
      );

    const baseNodeProperties: Partial<go.Node> = {
      selectionAdorned: true,
      selectionChanged: (node) => {
        const data = node.isSelected ? node.data as FaultTreeNodeData : null;
        this.zone.run(() => this.selectedNodeChange.emit(data));
      },
      doubleClick: (_event, node) => {
        this.zone.run(() => this.recordOpen.emit(node.data as FaultTreeNodeData));
      }
    };

    const topTemplate =
      $(go.Node, 'Vertical',
        baseNodeProperties,
        { selectionObjectName: 'LABEL' },
        $(go.Panel, 'Auto',
          { name: 'LABEL' },
          $(go.Shape, 'RoundedRectangle', {
            fill: '#fee2e2',
            stroke: '#dc2626',
            strokeWidth: 1.4,
            parameter1: 6
          }),
          $(go.Panel, 'Vertical', { margin: 7 },
            $(go.TextBlock, { font: '800 11px Inter, sans-serif', stroke: '#7f1d1d' }, new go.Binding('text', 'id')),
            $(go.TextBlock, {
              margin: new go.Margin(2, 0, 0, 0),
              font: '10px Inter, sans-serif',
              stroke: '#991b1b',
              wrap: go.Wrap.Fit,
              textAlign: 'center',
              maxSize: new go.Size(190, 36)
            }, new go.Binding('text', 'description'))
          )
        ),
        $(go.Shape, { height: 20, width: 1, stroke: '#334155' }),
        gateShape('#eff6ff')
      );

    const gateTemplate =
      $(go.Node, 'Vertical',
        baseNodeProperties,
        { selectionObjectName: 'LABEL' },
        labelPanel(),
        $(go.Shape, { height: 16, width: 1, stroke: '#334155' }),
        gateShape()
      );

    const basicTemplate =
      $(go.Node, 'Vertical',
        baseNodeProperties,
        { selectionObjectName: 'LABEL' },
        labelPanel(),
        $(go.Shape, 'Circle', {
          width: 34,
          height: 34,
          fill: '#ffffff',
          stroke: '#2563eb',
          strokeWidth: 2
        })
      );

    const houseTemplate =
      $(go.Node, 'Vertical',
        baseNodeProperties,
        labelPanel(),
        $(go.Shape, {
          geometryString: 'F M0 14 L20 0 L40 14 L40 40 L0 40 Z',
          width: 34,
          height: 34,
          fill: '#dcfce7',
          stroke: '#16a34a',
          strokeWidth: 2
        })
      );

    const transferTemplate =
      $(go.Node, 'Vertical',
        baseNodeProperties,
        labelPanel(),
        $(go.Shape, 'TriangleUp', {
          width: 38,
          height: 34,
          fill: '#ffffff',
          stroke: '#7c3aed',
          strokeWidth: 2
        })
      );

    const diagram = $(go.Diagram, this.diagramDiv.nativeElement, {
      allowDrop: true,
      initialAutoScale: go.AutoScale.Uniform,
      contentAlignment: go.Spot.TopCenter,
      padding: 36,
      grid: $(go.Panel, 'Grid',
        { gridCellSize: new go.Size(16, 16) },
        $(go.Shape, 'LineH', { stroke: '#edf2f7', strokeWidth: 0.5 }),
        $(go.Shape, 'LineV', { stroke: '#edf2f7', strokeWidth: 0.5 })
      ),
      'draggingTool.isGridSnapEnabled': true,
      'undoManager.isEnabled': true,
      layout: $(go.TreeLayout, {
        angle: 90,
        layerSpacing: 78,
        nodeSpacing: 26,
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
          fromSpot: go.Spot.Bottom,
          toSpot: go.Spot.Top
        },
        $(go.Shape, { stroke: '#334155', strokeWidth: 1.7 }),
        $(go.Shape, {
            segmentIndex: -1,
            segmentFraction: 0.86,
            width: 9,
            height: 9,
            figure: 'Circle',
            fill: '#ffffff',
            stroke: '#334155',
            strokeWidth: 1.5
          },
          new go.Binding('visible', 'negated', Boolean)
        )
      );

    diagram.addDiagramListener('ViewportBoundsChanged', () => this.zone.run(() => this.updateZoomLabel()));

    this.diagram = diagram;

    this.palette = $(go.Palette, this.paletteDiv.nativeElement, {
      nodeTemplateMap: diagram.nodeTemplateMap,
      model: new go.GraphLinksModel([
        { key: 'palette-or', category: 'GATE', id: 'OR gate', description: 'Logic gate', gateType: 'OR', state: 'NORMAL', recordType: 'GAT' },
        { key: 'palette-and', category: 'GATE', id: 'AND gate', description: 'Logic gate', gateType: 'AND', state: 'NORMAL', recordType: 'GAT' },
        { key: 'palette-kn', category: 'GATE', id: 'K/N gate', description: 'Voting gate', gateType: 'KOFN', k: 2, state: 'NORMAL', recordType: 'GAT' },
        { key: 'palette-be', category: 'BASIC_EVENT', id: 'Basic Event', description: 'Root-cause event', state: 'NORMAL', recordType: 'BEV' },
        { key: 'palette-he', category: 'HOUSE_EVENT', id: 'House Event', description: 'TRUE / FALSE switch', state: 'FALSE', recordType: 'HEV' },
        { key: 'palette-xfr', category: 'TRANSFER', id: 'Transfer', description: 'Transfer to fault tree', state: 'NORMAL', recordType: 'FTR' }
      ] as FaultTreeNodeData[])
    });
  }

  private applyModel(): void {
    if (!this.diagram || !this.model) return;
    const model = new go.GraphLinksModel(
      this.model.nodes.map((node) => ({ ...node })),
      this.model.links.map((link) => ({ ...link }))
    );
    model.linkKeyProperty = 'key';
    this.diagram.model = model;
    this.diagram.layoutDiagram(true);
  }

  private updateZoomLabel(): void {
    this.zoomPercent = Math.round((this.diagram?.scale ?? 1) * 100);
  }
}
