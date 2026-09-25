# RiskSpectrum → NextPSA traceability

This document is the implementation crosswalk for the first frontend vertical slice.

| RiskSpectrum source concept | NextPSA implementation | Status |
|---|---|---|
| Fault tree top event / gate / basic event / house event / transfer | `FaultTreeEditorComponent` using GoJS | Implemented in V1 slice |
| Gate operators OR, AND, K/N, NOR, NAND, XOR, Comment / Continuation / Undefined | Domain `GateType` and palette/template foundation | Partially implemented visually; full palette follows |
| NOT operator on an input | `FaultTreeLinkData.negated` | Modelled; visual indicator planned |
| Gate record and input relationships | Gate record dialog | Implemented |
| Basic Event record | Basic Event dialog | Implemented |
| Reliability models 1–7 | `ReliabilityModelType` domain model | Modelled; detailed per-model editor follows |
| Parameters q, r, f, TR, TI, TF, TM | `ReliabilityParameterRef` | Modelled |
| Event Tree / Initiating Event / Function Event / Branch Point / BC Set / Sequence / Consequence | Routes + feature boundary | Planned Phase 5 |
| MCS, uncertainty, importance/sensitivity, time dependent | Analysis/results route boundaries | Planned |
| MCS BDD: MCS Limit, Q Limit, FV Limit, Max nodes | Analysis feature boundary | Planned |
| I&AB six tabs and Assign References | Analysis feature boundary | Planned |
| RSA main records SYS/FTR/GAT/BEV/HEV/PAR/ATT/CCG/MEM; GIN/EXC relations | Tools/RSA feature boundary | Planned |

## Design rule

RiskSpectrum is the functional/domain reference. NextPSA is a cloud/web redesign. New web features such as global command search, cloud jobs, audit/version review and deep linking are labelled as NextPSA enhancements rather than attributed to RiskSpectrum.
