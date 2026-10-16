# Standalone virtual-model design has moved

The canonical design now lives in the separate **pi-virtual-models** repository:

- [Project overview](../../pi-virtual-models/README.md)
- [Standalone design and research](../../pi-virtual-models/docs/DESIGN.md)

These are local workspace links assuming sibling checkouts under the same parent directory (for example, `~/code/pi-gsd` and `~/code/pi-virtual-models`). Replace them with stable repository URLs when remotes are chosen.

Do not maintain a second copy of the standalone design here. pi-virtual-models owns the proposed reusable catalog, classifier-shaped decision contract, selectors, physical resolution, and optional Pi extension. Its design includes `namespace/role:effort`, first-class `virt/auto`, and explicit effort/manual overrides.

pi-gsd remains a potential consumer. Its role precedence, pins, task boundaries, delegation authorization, workflow ownership, and compatibility gates remain documented in:

- [pi-gsd design](DESIGN.md#proposed-reusable-model-routing-dependency)
- [GSD routing implementation plan](MODEL-ROUTING-PLAN.md)
- [Routing compatibility evidence](ROUTING-COMPATIBILITY-SPIKE.md)

The new repository is design-only. Relocating the document does not add a dependency, migrate GSD configuration, enable automatic routing, or establish virtual child compatibility.
