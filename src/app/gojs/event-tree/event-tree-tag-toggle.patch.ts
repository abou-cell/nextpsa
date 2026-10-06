import * as go from 'gojs';
import { EventTreeEditorComponent } from './event-tree-editor.component';

/**
 * Make Alt+T a deterministic group toggle for Event Tree consequence tags.
 *
 * Rules:
 * - if every current target is already tagged, Alt+T removes the tag from all;
 * - otherwise Alt+T applies the active tag colour to all targets;
 * - branch consequence selection has priority over explicitly selected result rows;
 * - selection itself never changes tag state.
 */
export function installEventTreeTagTogglePatch(): void {
  const prototype = EventTreeEditorComponent.prototype as any;
  if (prototype.__eventTreeTagTogglePatchInstalled) return;
  prototype.__eventTreeTagTogglePatchInstalled = true;

  const originalAfterViewInit = prototype.ngAfterViewInit;
  const originalOnDestroy = prototype.ngOnDestroy;

  const resolveTargets = (component: any): Set<string> => {
    const branchKeys = component.__eventTreeSelectedBranchKeys as Set<string> | undefined;
    const consequenceKeys = component.__eventTreeSelectedConsequenceKeys as Set<string> | undefined;
    if (branchKeys?.size && consequenceKeys?.size) return new Set(consequenceKeys);

    const rows = new Set<string>();
    const diagram = component.diagram as go.Diagram | undefined;
    diagram?.selection.each((part: go.Part) => {
      if (!(part instanceof go.Node)) return;
      const data = part.data as any;
      if (data?.category === 'SEQUENCE' && data?.key) rows.add(String(data.key));
    });
    return rows;
  };

  prototype.ngAfterViewInit = function(): void {
    originalAfterViewInit.call(this);

    // The consistency patch installs the single authoritative Alt+T handler.
    // Replace it with toggle semantics rather than adding a second listener.
    if (this.__eventTreeAuthoritativeTagKeyHandler) {
      window.removeEventListener('keydown', this.__eventTreeAuthoritativeTagKeyHandler, true);
    }

    const handler = (event: KeyboardEvent): void => {
      if (!event.altKey || event.key.toLowerCase() !== 't') return;

      const targets = resolveTargets(this);
      if (!targets.size) return;

      const store = this.__eventTreeTagColors as Map<string, string> | undefined;
      const allTagged = Boolean(store) && [...targets].every((key) => store!.has(key));

      const changed = allTagged
        ? Boolean(this.__eventTreeClearTagFromSelectedConsequences?.())
        : Boolean(this.__eventTreeApplyTagToSelectedConsequences?.());
      if (!changed) return;

      event.preventDefault();
      event.stopImmediatePropagation();
    };

    this.__eventTreeTagToggleKeyHandler = handler;
    window.addEventListener('keydown', handler, true);
  };

  prototype.ngOnDestroy = function(): void {
    if (this.__eventTreeTagToggleKeyHandler) {
      window.removeEventListener('keydown', this.__eventTreeTagToggleKeyHandler, true);
    }
    originalOnDestroy.call(this);
  };
}
