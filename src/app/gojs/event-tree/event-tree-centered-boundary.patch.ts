import * as go from 'gojs';
import { EventTreeEditorComponent } from './event-tree-editor.component';

const CENTER_ROUTE = '__etCenteredRoute';

/**
 * Final routing guard for the centered Event Tree.
 *
 * The centered model already encodes orthogonal geometry explicitly: vertical
 * spines are separate links between same-X anchors and exits are separate links
 * between same-Y points. Asking GoJS to orthogonally route those already-split
 * links adds an automatic end segment which can overshoot the RESULT boundary
 * before returning to the target (most visible on the main Sequence 1 path).
 *
 * Render every centered segment directly between its explicit endpoints instead.
 * This keeps the geometry strictly horizontal/vertical while guaranteeing that a
 * terminal segment stops exactly at the left edge of the consequences table.
 */
export function installEventTreeCenteredBoundaryPatch(): void {
  const prototype = EventTreeEditorComponent.prototype as any;
  if (prototype.__eventTreeCenteredBoundaryPatchInstalled) return;
  prototype.__eventTreeCenteredBoundaryPatchInstalled = true;

  const originalApplyModel = prototype.applyModel;
  const originalAfterViewInit = prototype.ngAfterViewInit;
  const originalOnDestroy = prototype.ngOnDestroy;

  const normalizeCenteredRoutes = (component: any): void => {
    if (component.__eventTreeLayoutModeV2 !== 'CENTERED') return;
    const diagram = component.diagram as go.Diagram | undefined;
    if (!diagram) return;

    diagram.links.each((link: go.Link) => {
      if (!(link.data as any)?.[CENTER_ROUTE]) return;

      // The centered graph has already inserted all required bend anchors. Normal
      // routing therefore draws one exact axis-aligned segment and cannot create a
      // dog-leg past the consequences-table boundary.
      link.routing = go.Routing.Normal;
      link.curve = go.Curve.None;
      link.corner = 0;
      link.fromShortLength = 0;
      link.toShortLength = 0;
      link.invalidateRoute();
    });

    diagram.requestUpdate();
  };

  const scheduleNormalization = (component: any): void => {
    const epoch = Number(component.__eventTreeCenteredBoundaryEpoch ?? 0) + 1;
    component.__eventTreeCenteredBoundaryEpoch = epoch;

    // Root centering currently finishes after three animation frames. Run later
    // than every centered-layout pass so this remains the final routing authority.
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() =>
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (component.__eventTreeCenteredBoundaryEpoch !== epoch) return;
        normalizeCenteredRoutes(component);
      }))
    )));
  };

  prototype.applyModel = function(metrics: unknown): void {
    originalApplyModel.call(this, metrics);
    if (this.__eventTreeLayoutModeV2 === 'CENTERED') scheduleNormalization(this);
  };

  prototype.ngAfterViewInit = function(): void {
    originalAfterViewInit.call(this);

    requestAnimationFrame(() => requestAnimationFrame(() => {
      const controls = this.__eventTreeLayoutControlsV2 as HTMLElement | undefined;
      if (controls && !this.__eventTreeCenteredBoundaryClickListener) {
        const listener = (): void => scheduleNormalization(this);
        controls.addEventListener('click', listener);
        this.__eventTreeCenteredBoundaryClickListener = listener;
      }
      if (this.__eventTreeLayoutModeV2 === 'CENTERED') scheduleNormalization(this);
    }));
  };

  prototype.ngOnDestroy = function(): void {
    const controls = this.__eventTreeLayoutControlsV2 as HTMLElement | undefined;
    const listener = this.__eventTreeCenteredBoundaryClickListener as EventListener | undefined;
    if (controls && listener) controls.removeEventListener('click', listener);
    this.__eventTreeCenteredBoundaryClickListener = null;
    originalOnDestroy.call(this);
  };
}
