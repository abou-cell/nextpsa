import * as go from 'gojs';
import { EventTreeEditorComponent } from './event-tree-editor.component';

const ACTION_CATEGORIES = new Set(['START_POINT', 'FE_POINT', 'BRANCH']);
const CENTER_ROUTE = '__etCenteredRoute';
const FIXED_PORT_NAME = 'ET_FIXED_PORT';
const FIXED_PORT_SIZE = 0.01;
const SETTLE_FRAMES = 8;

/**
 * Final rendering authority for Event Tree connections.
 *
 * Several ET features intentionally decorate the same GoJS nodes/links (layout,
 * selection, tagging, hover dots). The visible DOT used to be the default GoJS
 * port, so changing its size on hover/selection changed link clipping and could
 * create small apparent breaks. Async centered-layout passes could also briefly
 * overwrite routing options after a branch was added.
 *
 * This patch removes those two sources of non-determinism:
 *  - links use a dedicated, fixed, practically dimensionless port at the node
 *    centre; the visible/hover DOT is presentation only;
 *  - routing invariants are re-applied through the complete render-settling
 *    window, always after the older async passes in the same animation frame.
 */
export function installEventTreeRenderIntegrityPatch(): void {
  const prototype = EventTreeEditorComponent.prototype as any;
  if (prototype.__eventTreeRenderIntegrityPatchInstalled) return;
  prototype.__eventTreeRenderIntegrityPatchInstalled = true;

  const originalInstallTemplates = prototype.installTemplates;
  const originalApplyModel = prototype.applyModel;
  const originalAfterViewInit = prototype.ngAfterViewInit;
  const originalOnDestroy = prototype.ngOnDestroy;

  const installFixedPort = (template: go.Node): void => {
    const dot = template.findObject('DOT') as go.Shape | null;
    if (dot) {
      // Keep the visible dot completely independent from link geometry.
      dot.portId = 'ET_DOT_VISUAL';
    }

    let port = template.findObject(FIXED_PORT_NAME) as go.Shape | null;
    if (!port) {
      port = go.GraphObject.make(go.Shape, 'Circle', {
        name: FIXED_PORT_NAME,
        width: FIXED_PORT_SIZE,
        height: FIXED_PORT_SIZE,
        fill: null,
        stroke: null,
        portId: '',
        alignment: go.Spot.Center,
        fromSpot: go.Spot.Center,
        toSpot: go.Spot.Center,
        pickable: false
      }) as go.Shape;
      template.add(port);
    }

    port.width = FIXED_PORT_SIZE;
    port.height = FIXED_PORT_SIZE;
    port.portId = '';
  };

  const normalizeLinks = (component: any): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return;

    let routeChanged = false;
    diagram.links.each((link: go.Link) => {
      // Both Standard and Centered representations already encode their bends
      // explicitly with zero-size anchors. Normal routing therefore gives one
      // exact continuous segment between each pair of explicit endpoints.
      if (link.routing !== go.Routing.Normal) {
        link.routing = go.Routing.Normal;
        routeChanged = true;
      }
      if (link.curve !== go.Curve.None) {
        link.curve = go.Curve.None;
        routeChanged = true;
      }
      if (link.corner !== 0) {
        link.corner = 0;
        routeChanged = true;
      }
      if (link.fromShortLength !== 0) {
        link.fromShortLength = 0;
        routeChanged = true;
      }
      if (link.toShortLength !== 0) {
        link.toShortLength = 0;
        routeChanged = true;
      }

      const path = link.path;
      if (path?.strokeDashArray) path.strokeDashArray = null;

      // Centered links are split into explicit vertical spines and horizontal
      // exits. Never let a later GoJS auto-router replace that direct geometry.
      if ((link.data as any)?.[CENTER_ROUTE] && link.routing !== go.Routing.Normal) {
        link.routing = go.Routing.Normal;
        routeChanged = true;
      }
    });

    if (routeChanged) diagram.links.each((link: go.Link) => link.invalidateRoute());
    diagram.requestUpdate();
  };

  const normalizePorts = (component: any): void => {
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return;

    diagram.nodes.each((node: go.Node) => {
      const category = String((node.data as any)?.category ?? '');
      if (!ACTION_CATEGORIES.has(category)) return;

      const dot = node.findObject('DOT') as go.Shape | null;
      if (dot && dot.portId !== 'ET_DOT_VISUAL') dot.portId = 'ET_DOT_VISUAL';

      const port = node.findObject(FIXED_PORT_NAME) as go.Shape | null;
      if (!port) return;
      port.width = FIXED_PORT_SIZE;
      port.height = FIXED_PORT_SIZE;
      port.portId = '';
    });
  };

  const normalize = (component: any): void => {
    normalizePorts(component);
    normalizeLinks(component);
  };

  const scheduleIntegrity = (component: any): void => {
    const epoch = Number(component.__eventTreeRenderIntegrityEpoch ?? 0) + 1;
    component.__eventTreeRenderIntegrityEpoch = epoch;
    let frame = 0;

    const tick = (): void => {
      if (component.__eventTreeRenderIntegrityEpoch !== epoch) return;
      normalize(component);
      frame += 1;
      if (frame < SETTLE_FRAMES) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  };

  prototype.installTemplates = function(metrics: unknown): void {
    originalInstallTemplates.call(this, metrics);
    const diagram = this.diagram as go.Diagram | undefined;
    if (!diagram) return;

    ACTION_CATEGORIES.forEach((category) => {
      const template = diagram.nodeTemplateMap.get(category) as go.Node | null;
      if (template) installFixedPort(template);
    });
  };

  prototype.applyModel = function(metrics: unknown): void {
    originalApplyModel.call(this, metrics);
    scheduleIntegrity(this);
  };

  prototype.ngAfterViewInit = function(): void {
    originalAfterViewInit.call(this);

    const layoutCompleted = (): void => scheduleIntegrity(this);
    this.__eventTreeRenderIntegrityLayoutCompleted = layoutCompleted;
    this.diagram?.addDiagramListener('LayoutCompleted', layoutCompleted);

    // Structural toolbar operations such as +Branch/+Function Event ultimately
    // rebuild the model, but this capture listener closes any timing gap between
    // the command and the Angular refresh cycle.
    const div = this.diagramDiv?.nativeElement as HTMLDivElement | undefined;
    const interaction = (): void => scheduleIntegrity(this);
    this.__eventTreeRenderIntegrityInteraction = interaction;
    div?.addEventListener('click', interaction, true);
    div?.addEventListener('contextmenu', interaction, true);

    scheduleIntegrity(this);
  };

  prototype.ngOnDestroy = function(): void {
    if (this.__eventTreeRenderIntegrityLayoutCompleted) {
      this.diagram?.removeDiagramListener('LayoutCompleted', this.__eventTreeRenderIntegrityLayoutCompleted);
    }

    const div = this.diagramDiv?.nativeElement as HTMLDivElement | undefined;
    if (this.__eventTreeRenderIntegrityInteraction) {
      div?.removeEventListener('click', this.__eventTreeRenderIntegrityInteraction, true);
      div?.removeEventListener('contextmenu', this.__eventTreeRenderIntegrityInteraction, true);
    }

    this.__eventTreeRenderIntegrityEpoch = Number(this.__eventTreeRenderIntegrityEpoch ?? 0) + 1;
    originalOnDestroy.call(this);
  };
}
