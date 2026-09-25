# NextPSA

NextPSA is a cloud/web PRA/PSA workbench whose domain concepts are grounded in the supplied RiskSpectrum documentation while the user experience is redesigned for a modern browser application.

## Frontend baseline

- Angular 22.2.0
- TypeScript 6.0.x
- GoJS 4.0.4
- standalone Angular components
- strict templates / strict TypeScript
- desktop-first engineering UI

## Current implementation

The `feat/frontend-v1` branch implements the first vertical slice:

1. NextPSA AppShell
2. project/model navigation
3. GoJS Fault Tree workspace
4. PSA-oriented gate / Basic Event / House Event / transfer symbols
5. selection → Properties panel
6. double-click Gate/Top Event → Gate Record dialog
7. Inputs and recursive Basic Events under the selected gate
8. double-click Basic Event row → Basic Event Record editor
9. editable reliability value in the mock repository
10. validation dock
11. route boundaries for Event Tree, Analysis, I&AB, Results, QA and RSA

See:

- `docs/risk-spectrum-traceability.md`
- `docs/gojs-fault-tree.md`
- `docs/architecture.md`

## Run

Requirements follow Angular 22 compatibility:

- Node.js 22.22.3+, 24.15.0+ or 26.x
- npm compatible with the selected Node release

```bash
npm install
npm start
```

Then open:

`http://localhost:4200`

The primary validation route is:

`/model/fault-tree/PTR-LOPC`

## Interaction to validate

1. open the Fault Tree workspace
2. click `G-AC-FAIL` → right-side properties update
3. double-click `G-AC-FAIL` → Gate Record dialog
4. choose **Basic Events**
5. double-click `DG1-FS`
6. edit the Basic Event record
7. save it; the mock repository record version increments

## Important product rule

RiskSpectrum is the functional/domain reference, not the visual target. NextPSA keeps PSA semantics but adds web-native functionality such as recursive related-record views, deep navigation, live validation, cloud analysis jobs and version/audit workflows.

## Next milestone

Implement the dedicated GoJS Event Tree editor:

Initiating Event → Function Event columns → branch points → alternatives → BC Sets → sequence / consequence.
