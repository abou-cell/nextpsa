# NextPSA Fault Tree Editor - RiskSpectrum fidelity specification

## Source-driven behavior

The implementation is grounded in the supplied **Working with RiskSpectrum PSA-FTA** manual and the RiskSpectrum screenshots used during review.

### Fault-tree structure

- Gate inputs may be another Gate, Basic Event, House Event, Undeveloped Event (diamond), or Transfer.
- Parent/child routing is Gate `OUT` -> child `IN`.
- Gates are created/deleted in the Fault Tree editor.
- Fault-tree branches are compact and orthogonal.
- Drag/drop preserves the logical parent/child direction.
- Ports are GoJS implementation details and remain visually hidden.

### RiskSpectrum record + symbol proportions

Target at 100%:

- Record box: ~132 x 69 px
- Description band: ~50 px
- ID band: ~19 px
- Gate artwork: ~32 x 27 px
- NAND/NOR inversion bubble: ~6 px
- Basic Event: 28 px diameter
- Undeveloped Event: ~26 x 26 px
- House Event: ~28 x 24 px
- Transfer: ~26 x 26 px
- Record-to-symbol connector: ~4 px

The record description is above the ID band, matching RiskSpectrum.

### Connection ports

Gate / Top Event:
- invisible `IN` on top
- invisible `OUT` on bottom

Basic Event / Undeveloped Event / House Event / Transfer:
- invisible `IN` only

No visible connection-handle circles are allowed.

### Context menu

The visual structure follows the RiskSpectrum context menu shown for Gate and Basic Event nodes:

- Edit Event...
- Change node Event...
- Add input node >
- Negate node
- State >
- separator
- Edit Fault Tree...
- Insert Fault Tree...
- separator
- Break into Transfer...
- Join transfer
- Jump
- Jump to IE/FE
- Open Transfer branch
- Open CCF Group (gate context where applicable)
- separator
- Select branch
- Select inputs
- separator
- Cut
- Copy
- Paste
- Delete
- separator
- Find...
- Replace...
- separator
- Set record Status >

Availability is record-type dependent. In particular, **Change node Event...** applies to Basic Events, House Events and Transfers, not Gates.

### Implemented context-menu behavior

- Edit Event -> opens the corresponding NextPSA record editor.
- Change node Event -> opens the NextPSA Change Node Event dialog.
- Negate node -> toggles the incoming-link negation flag.
- Select branch -> selects a Gate and all descendants.
- Select inputs -> selects direct children.
- Cut / Copy / Paste / Delete -> GoJS CommandHandler.
- Find -> centers the selected node.

Other RiskSpectrum menu entries are displayed for visual/interaction fidelity and are reserved for later domain/backend slices.

### Change Node Event semantics

Changing a node event changes the record referenced at that **fault-tree position** while preserving the node position and its links.

Current NextPSA implementation:
- Basic Event -> choose another Basic Event record.
- House Event / Transfer -> framework is present; candidates depend on available records in the current mock project.

### GoJS implementation rules

- Separate templates for `GATE_AND`, `GATE_OR`, `GATE_NAND`, `GATE_NOR`, `GATE_XOR`, `GATE_KOFN`.
- Matching `TOP_EVENT_*` variants.
- `BASIC_EVENT_CIRCLE`, `BASIC_EVENT_DIAMOND`, `HOUSE_EVENT`, `TRANSFER`.
- Use vector GoJS `Shape` / `Geometry`; no raster gate icons.
- Use `Orthogonal` links with no arrowheads.
- Keep the grid hidden by default for RiskSpectrum visual fidelity.
- Use the horizontal NextPSA palette for modern UX, but reuse exactly the same symbol geometry.


## Fixed branch rail geometry

The supplied RiskSpectrum screenshots show a stable local routing pattern for every Gate branch.

Measured on the reference screenshot used for the `Change Node Event` example:

- parent symbol output -> horizontal rail: approximately **22 px** vertically;
- horizontal rail -> top edge of every direct child record box: approximately **6 px**;
- total parent/child inter-layer space: approximately **28 px**;
- neighbouring record boxes on the same row: approximately **5-8 px** apart depending on screenshot zoom.

Implementation rule:

```
parent gate output
        |
        | 22 px
        |
--------+------------------------------ shared branch rail
        | 6 px              | 6 px
     child A              child B
```

All direct inputs of one Gate MUST therefore:

1. share the same local Y coordinate for their record-box top edges;
2. share the same horizontal branch rail;
3. keep the first vertical drop from the Gate fixed at 22 px;
4. extend horizontally when a new Basic Event / House Event / Gate / Transfer is inserted;
5. not produce independent auto-routed elbows with different rail heights.

In GoJS this is implemented with a dedicated `RiskSpectrumBranchLink.computePoints()` router plus a `TreeLayout` with:

- `angle = 90`;
- `layerSpacing = 28`;
- `nodeSpacing = 7`;
- `alignment = TreeAlignment.Start`;
- `compaction = TreeCompaction.Block`;
- explicit port spots retained.

The parent is intentionally aligned with the first/leftmost child, matching the supplied RiskSpectrum examples. Additional children extend to the right while the branch datum remains stable.
