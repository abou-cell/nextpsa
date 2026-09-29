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


## Invisible logical attachment points

The GoJS connection ports are logical attachment locations only. They are not graphical symbols.

Rules:

- Gate / Top Event: one invisible `IN` port at the top of the record and one invisible `OUT` port at the bottom of the Gate symbol.
- Basic Event: one invisible `IN` port only.
- House Event: one invisible `IN` port only.
- Undeveloped (Diamond) Event: one invisible `IN` port only.
- Transfer: one invisible `IN` port only.
- No terminal event receives an `OUT` port.
- No port is rendered as a circle, dot, handle or marker.
- NAND/NOR inversion bubbles remain part of the gate symbol itself; they are not connection ports.

The visual connector previously drawn between the record box and the Gate/BE/HE/Diamond/Transfer symbol has been removed. The record box and its symbol remain a single GoJS Node, but there is no decorative vertical stroke between them.

The logical link still attaches through the invisible ports:

```
Gate / Top Event:
IN (invisible)
record box
gate symbol
OUT (invisible)

Terminal event:
IN (invisible)
record box
event symbol
(no OUT)
```


## Fixed logical levels and palette-click insertion

The tree is organised by logical depth rather than free node coordinates.

- Level 1: Top Event.
- Level 2: all direct children of the Top Event.
- Level 3: all direct children of level-2 Gates.
- Level N: all linked components with the same graph depth share one fixed Y coordinate.
- Fixed level pitch: 131 px, chosen from the current 103 px Gate node height plus the 28 px RiskSpectrum branch gap.
- Linked nodes are not freely movable; their coordinates are controlled by the layout.
- The Top Event anchor is preserved across subsequent re-layouts so adding children does not move the root.

Quick insertion workflow:

1. click/select a Gate or Top Event in the diagram;
2. click an icon in the horizontal palette;
3. NextPSA creates a new child record position;
4. NextPSA creates the relation `parent.OUT -> child.IN`;
5. the fixed-level layout runs;
6. the parent stays selected so several children can be added successively.

Terminal events (Basic Event, House Event, Undeveloped Event, Transfer) cannot be used as logical fathers.


## Horizontal movement and branch placement

Movement follows the requested RiskSpectrum-style level semantics:

- Top Event remains completely fixed.
- A component that is not attached to any branch is a free workspace object and may move in both X and Y.
- From level 2 downward, an attached component remains fixed on its logical Y level but may be repositioned horizontally.
- A leaf / unique attached component can be moved horizontally on its own.
- A Gate that owns descendants cannot be moved independently from its subtree.
- To reposition a whole branch, first use **Select branch**, then drag the selected branch horizontally.
- During a whole-branch drag, every selected node preserves its own fixed Y level and receives the same horizontal displacement.
- Manual horizontal placement is persisted and restored after later layout recalculations.
- Unattached free-node X/Y placement is also persisted.

This keeps the vertical hierarchy invariant while allowing an engineer to arrange branches horizontally like the RiskSpectrum editor.


## Attach an existing free component to a branch

A component that already exists in the FT workspace but is not yet connected can be attached with a two-click workflow:

1. click/select the target branch;
2. NextPSA stores the source Gate / Top Event of that branch as the logical parent;
3. click the free component;
4. create `parent.OUT -> component.IN`;
5. preserve the component's horizontal X placement;
6. snap only its Y coordinate to the next fixed logical level;
7. clear the armed branch after one successful attachment.

Rules:

- only an unattached component can be attached;
- Top Event cannot be attached as a child;
- terminal events remain terminal;
- a free Gate with its own descendants may be attached as a complete subtree;
- cycle creation is rejected;
- clicking an already attached component does not create a second incoming relation;
- selecting a branch is different from selecting a Gate for palette insertion.

The UI helper displays:

`Branch: <parent-id> -> click a free component`

while this mode is armed.


## Magnetic horizontal slots and collision avoidance

Attached components and attached FT subtrees use magnetic horizontal slots rather than arbitrary pixel X positions.

Behavior:

- no attached record boxes or attached subtrees may overlap;
- dragging an attached leaf horizontally determines its new sibling order;
- dropping it between two siblings inserts it into that position;
- dragging a complete selected branch determines the new sibling order of the branch root;
- TreeLayout recalculates the exact X coordinates for all sibling subtrees;
- fixed logical Y levels remain unchanged;
- the moved item/subtree occupies a valid collision-free slot;
- neighbouring siblings shift automatically to make room;
- attached components do not persist arbitrary manual X coordinates anymore;
- unattached/free workspace components still keep free X/Y placement.

Example:

Before:

```
A    B    C    D
```

Drag D between B and C:

```
A    B    D    C
```

For a selected subtree, the entire subtree is treated as one horizontal unit for sibling ordering. The layout keeps its descendants collision-free with neighbouring subtrees.

When an existing free component is attached to a selected branch, its current X position is used to determine the nearest insertion slot before the layout runs.


## Move a component or selected branch to another branch

A selected component or a complete selected subtree may be reassigned to another Gate branch by drag/drop.

Workflow:

1. select one attached component; or use **Select branch** to select a complete subtree;
2. drag the selected item/subtree onto the target branch line;
3. the target branch highlights while it can accept the drop;
4. on drop, remove the old incoming relation of the moved root;
5. create `targetParent.OUT -> movedRoot.IN`;
6. preserve all descendant relations inside the moved subtree;
7. append the moved root as the **last/rightmost child** of the target parent;
8. recompute fixed Y levels and magnetic non-overlapping X slots.

Rules:

- a Gate with descendants must have its complete branch selected before it can be reparented;
- Top Event cannot be moved under another branch;
- a branch cannot be dropped into itself or one of its descendants;
- if a component is already a child of the target parent, dropping it on that parent's branch moves it to the last/rightmost position;
- the target branch has a wider invisible hit area for easier drop interaction while retaining the thin RiskSpectrum visual line;
- the new relation keeps the moved root's previous negation flag when applicable.


## Cross-level transfer to another branch

This operation is intentionally different from ordinary lateral magnetic reordering.

### Ordinary lateral movement
- attached component/subtree stays on the same logical level;
- drop is interpreted only as sibling ordering;
- TreeLayout snaps back to the fixed Y level.

### Transfer to another branch
- during the drag, the selected component or complete selected subtree may move freely in X and Y;
- source and target branches may be on completely different logical levels;
- on mouse release, NextPSA searches near the actual cursor position for the nearest branch line;
- the branch is valid only if its source node is a Gate or Top Event with an OUT port;
- no branch highlight, blue overlay, enlarged visible stroke or other colour feedback is shown;
- the previous incoming relation of the moved root is removed;
- a new `targetParent.OUT -> movedRoot.IN` relation is created;
- the moved component/subtree is appended after the target parent's existing children;
- descendants of a moved subtree remain unchanged;
- after logical reparenting, fixed levels are recalculated from the new parent depth.

A Gate with descendants must be moved only after **Select branch** has selected the complete subtree. A terminal component may be moved directly. Cycles are rejected.


## Detached component branch snap

A detached/free FT component can be attached by physically moving the component box onto a valid FT branch.

Important detection rule:

- attachment is determined primarily from the moved component/root bounding box intersecting or approaching a branch;
- the mouse cursor position is only a secondary fallback;
- therefore dropping a large record box across a thin RiskSpectrum branch still attaches correctly even when the pointer is near the center of the box.

After attachment:

- create `targetParent.OUT -> component.IN`;
- clear free-node Y placement;
- preserve logical subtree contents if the moved root is a Gate;
- recalculate the component's fixed level from the new parent;
- preserve normal magnetic non-overlap behavior.


## Palette component -> Gate output snap

A component dragged from the horizontal palette is normalized into a persistent NextPSA fault-tree node before attachment logic runs.

Attachment must work against a Gate / Top Event even when that Gate has no existing child link yet.

Target detection combines:

- the Gate/Top Event invisible `OUT` port;
- a virtual output stem below the gate symbol;
- the existing outgoing RiskSpectrum branch, when present;
- moved node bounding-box contact as the primary criterion;
- mouse pointer distance only as fallback.

Therefore a newly created palette component placed under/onto the output of a Gate attaches as:

`Gate.OUT -> NewComponent.IN`

The new node receives a unique FT-position key and is persisted in the Angular-side model, so later move/reparent operations work identically to pre-existing model nodes.


## Drop selected component or branch on a Gate at any level

A selected FT component or a complete selected subtree may be reparented by dragging it directly onto a Gate / Top Event, regardless of whether the target is at a higher or lower logical level.

Accepted targets:

- the visible Gate / Top Event node itself;
- the invisible `OUT` port;
- the short virtual output stem below the Gate;
- an existing outgoing RiskSpectrum branch.

Selection rules:

- terminal component: may be moved directly;
- Gate with descendants: use **Select branch** first so the complete subtree is selected;
- Top Event itself cannot become a child;
- cycles are rejected.

After a successful drop:

1. remove the moved root's previous incoming relation;
2. create `targetGate.OUT -> movedRoot.IN`;
3. preserve all descendants of the moved subtree;
4. append it after the target Gate's existing children;
5. recompute the moved subtree's logical depth and fixed Y levels from the new parent;
6. recompute magnetic X slots to prevent overlap.

No source/target level restriction is applied. A component from a lower level can be moved to a higher-level Gate and vice versa, provided the new relation is acyclic.


## Left-aligned and centered pyramid views

The Fault Tree toolbar exposes two mutually exclusive layout modes next to **Fit**.

### Left-aligned RiskSpectrum mode
- uses `TreeAlignment.Start`;
- the first/leftmost child of each Gate is aligned on the exact X-axis of the parent `OUT` port;
- this removes the small horizontal hook on the first branch;
- additional children extend to the right;
- Top Event stays anchored.

### Centered pyramid mode
- uses `TreeAlignment.CenterChildren`;
- each parent is centered over its children/subtrees;
- the complete FT reads as a centered pyramid;
- fixed logical Y levels, sibling order and non-overlap remain unchanged;
- Top Event stays anchored while children redistribute around it.

Switching mode only changes the layout view; it does not alter FT logical relations.


## Centered mode fit and straight center axis

When the centered/pyramid toolbar mode is activated:

- the FT layout switches to `TreeAlignment.CenterChildren`;
- the complete Fault Tree is immediately fit into the editor viewport;
- the document is centered in the visible canvas;
- for any Gate with an odd number of direct children, the middle child is aligned exactly with the Gate `OUT` axis;
- therefore the Gate output, branch rail junction and middle-child input share the same X coordinate, eliminating the small horizontal kink shown in the review screenshot.

This affects presentation only; FT logical relations remain unchanged.


## Collision-safe centered subtree packing

Centered/pyramid mode must never realign a child subtree independently after sibling packing, because that can make neighbouring branches overlap.

The centered layout therefore treats every direct child subtree as one horizontal block:

- arrange descendants bottom-up;
- compute the full bounds of each child subtree;
- odd number of children: align the middle child's input exactly with the parent Gate OUT axis;
- pack left sibling subtrees outward from the middle subtree;
- pack right sibling subtrees outward from the middle subtree;
- even number of children: keep a centered gap around the parent OUT axis and pack subtrees to both sides;
- minimum horizontal gap between sibling subtree bounds: 18 px;
- invalidate branch routes after final node positions are applied.

This preserves a straight center axis without allowing components or subtrees to overlap.


## Absolute no-overlap rule for centered layout

Centered/pyramid mode follows one non-negotiable rule:

**No two attached FT components or subtrees may overlap.**

The centered layout uses subtree contour packing rather than post-layout pixel shifts.

- each subtree exposes left/right horizontal contours at every relative depth;
- sibling subtrees are separated until their contours are at least 30 px apart at every common depth;
- the FT is allowed to expand horizontally without limit when necessary;
- odd child counts keep the middle child exactly on the parent OUT axis;
- even child counts keep a true central gap between the two middle subtrees;
- child subtrees are packed from the center outward;
- only after the collision-free geometry is complete are branch routes recomputed;
- the centered toolbar command then runs Fit so the wider FT remains fully visible.

Visual centering must never override collision avoidance.


## Exact centered IN/OUT axis

In **CENTERED + Fit** mode, alignment is defined by logical connection ports, not by visual record-box centers.

For a Gate/Top Event with exactly one child, or with an odd number of direct children:

- the unique/middle child's `IN.x` is exactly equal to the parent `OUT.x`;
- contour packing is measured relative to this logical port axis;
- the central branch is rendered as one continuous vertical line;
- no redundant horizontal segment is inserted when `OUT.x == IN.x`;
- collision-free subtree spacing remains enforced.

This rule applies only to the centered/pyramid geometry. The left-aligned RiskSpectrum mode remains unchanged.


## Structural centered-axis rule

To eliminate persistent 1-3 px dog-legs after Centered + Fit, Gate connection ports are defined on the same root GoJS Spot panel:

- `IN`: root top-center;
- `OUT`: root bottom-center;
- both therefore share the same exact X axis, independent of OR/AND/K-N artwork geometry.

Centered layout rules:

- subtree external position is referenced by the subtree root `IN` axis;
- children originate from the parent `OUT` axis;
- for one child or any odd number of children, the unique middle child is reconciled so `parent.OUT.x === middle.IN.x`;
- the unique/middle link is rendered as a single two-point vertical vector in CENTERED mode, avoiding orthogonal join artifacts after Fit;
- contour-based no-overlap packing remains active;
- LEFT mode behavior is unchanged.


## Restore Gate-attached output ports in centered mode

The centered-mode axis correction must not detach branch lines from Gate symbols.

Required geometry:

- Gate / Top Event `OUT` remains inside the Gate artwork panel, exactly as in the earlier RiskSpectrum-style implementation;
- every outgoing link therefore starts directly on the visible Gate symbol with no white gap;
- `IN` remains the invisible root-top attachment point of the child node;
- CENTERED mode may move the middle child/subtree horizontally until `parent.OUT.x === child.IN.x`;
- the unique/middle centered link may then be rendered as one vertical vector from the REAL Gate-symbol OUT to the child IN;
- LEFT mode keeps the earlier Gate-attached routing unchanged.

Do not move the Gate OUT port to the bottom of the whole record node: that creates a visible gap between the Gate symbol and the branch line.


## Flush Gate-to-link geometry

Outgoing branch lines must start on the visible Gate symbol itself, with no white gap.

Rules:

- AND/NAND: `OUT` is at the visual lower edge of the Gate;
- OR/NOR/XOR: because the lower edge is concave, `OUT` is positioned on the actual center-bottom curve rather than the artwork container bottom;
- K/N: the Gate artwork container is exactly 20 px high, matching the visible 28x20 K/N rectangle;
- therefore the K/N rectangle sits directly under the record box with no blank band;
- the K/N `OUT` remains on the lower edge of the small rectangle;
- no changes are made to FT logical relations or centered/left layout semantics.

This keeps all outgoing branch strokes visually attached to the RiskSpectrum-style Gate artwork.
