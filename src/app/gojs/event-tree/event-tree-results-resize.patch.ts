import * as go from 'gojs';
import { EventTreeEditorComponent } from './event-tree-editor.component';

interface ResultResizeMetrics {
  viewportWidth: number;
  headerHeight: number;
  resultWidth: number;
  resultX: number;
  blockWidth: number;
  resultNoWidth: number;
  resultFreqWidth: number;
  resultConseqWidth: number;
  resultCodeWidth: number;
  sequenceRowHeight: number;
}

const MIN_RESULT_WIDTH = 260;
const MIN_TREE_WIDTH = 280;
const RESIZER_HIT_WIDTH = 12;

export function installEventTreeResultsResizePatch(): void {
  const prototype = EventTreeEditorComponent.prototype as any;
  if (prototype.__resultsResizePatchInstalled) return;
  prototype.__resultsResizePatchInstalled = true;

  const originalCreateDiagram = prototype.createDiagram;
  const originalMeasureLayout = prototype.measureLayout;
  const originalInstallTemplates = prototype.installTemplates;
  const originalApplyModel = prototype.applyModel;

  prototype.createDiagram = function(): void {
    originalCreateDiagram.call(this);

    const diagram = this.diagram as go.Diagram | undefined;
    if (!diagram) return;

    diagram.addDiagramListener('SelectionMoved', () => {
      const node = diagram.selection.first() as go.Node | null;
      const data = node?.data as { category?: string } | undefined;
      const metrics = this.__resultsResizeMetrics as ResultResizeMetrics | undefined;
      if (!node || data?.category !== 'RESULT_RESIZER' || !metrics) return;

      const minX = MIN_TREE_WIDTH;
      const maxX = Math.max(minX, metrics.viewportWidth - MIN_RESULT_WIDTH);
      const x = Math.max(minX, Math.min(maxX, node.location.x));
      const nextWidth = Math.round(metrics.viewportWidth - x);

      this.__resultTableWidth = nextWidth;
      requestAnimationFrame(() => this.refreshLayout());
    });
  };

  prototype.measureLayout = function(): ResultResizeMetrics {
    const metrics = originalMeasureLayout.call(this) as ResultResizeMetrics;
    const requestedWidth = this.__resultTableWidth as number | undefined;

    if (requestedWidth === undefined) return metrics;

    const maxWidth = Math.max(MIN_RESULT_WIDTH, metrics.viewportWidth - MIN_TREE_WIDTH);
    const resultWidth = Math.max(MIN_RESULT_WIDTH, Math.min(maxWidth, requestedWidth));
    const resultX = metrics.viewportWidth - resultWidth;
    const blockCount = Math.max(1, (this.model?.functionEvents?.length ?? 0) + 1);
    const blockWidth = resultX / blockCount;
    const resultNoWidth = Math.round(resultWidth * 0.09);
    const resultFreqWidth = Math.round(resultWidth * 0.22);
    const resultConseqWidth = Math.round(resultWidth * 0.45);
    const resultCodeWidth = resultWidth - resultNoWidth - resultFreqWidth - resultConseqWidth;

    return {
      ...metrics,
      resultWidth,
      resultX,
      blockWidth,
      resultNoWidth,
      resultFreqWidth,
      resultConseqWidth,
      resultCodeWidth
    };
  };

  prototype.installTemplates = function(metrics: ResultResizeMetrics): void {
    originalInstallTemplates.call(this, metrics);
    this.__resultsResizeMetrics = metrics;

    const diagram = this.diagram as go.Diagram | undefined;
    if (!diagram) return;

    const $ = go.GraphObject.make;
    diagram.nodeTemplateMap.add('RESULT_RESIZER',
      $(go.Node, 'Spot',
        {
          selectable: true,
          selectionAdorned: false,
          movable: true,
          cursor: 'ew-resize',
          locationSpot: go.Spot.TopCenter,
          layerName: 'Foreground',
          dragComputation: (_part: go.Part, newLocation: go.Point) => {
            const minX = MIN_TREE_WIDTH;
            const maxX = Math.max(minX, metrics.viewportWidth - MIN_RESULT_WIDTH);
            const x = Math.max(minX, Math.min(maxX, newLocation.x));
            return new go.Point(x, 0);
          }
        },
        new go.Binding('location', 'loc', go.Point.parse),
        $(go.Shape, 'Rectangle', {
          width: RESIZER_HIT_WIDTH,
          height: 10000,
          fill: 'rgba(37,99,235,0.001)',
          stroke: null
        }),
        $(go.Shape, 'LineV', {
          height: 10000,
          stroke: '#94a3b8',
          strokeWidth: 1,
          opacity: 0.35
        })
      )
    );
  };

  prototype.applyModel = function(metrics: ResultResizeMetrics): void {
    originalApplyModel.call(this, metrics);

    const diagram = this.diagram as go.Diagram | undefined;
    if (!diagram) return;

    const model = diagram.model as go.GraphLinksModel;
    if (!model.findNodeDataForKey('__RESULT_RESIZER__')) {
      model.addNodeData({
        key: '__RESULT_RESIZER__',
        category: 'RESULT_RESIZER',
        loc: `${metrics.resultX} 0`
      });
    }
  };
}
