# Profession Pages — Incoming Drop-In

These six page components arrived as part of the April 18 grudge-warlords
upload. They are stashed here (outside `src/`) so they don't break the build
while the supporting subsystem is still being designed.

## Files

- `BaseProfessionPage.tsx` — shared profession layout (skill-tree / crafting /
  upgrades / activities tabs). Generic, accent-color theming.
- `Chef.tsx`, `Engineer.tsx`, `Forester.tsx`, `Miner.tsx`, `Mystic.tsx` — the
  five profession pages, each a thin wrapper around `BaseProfessionPage` with
  profession-specific data and accent color.

## Unmet Dependencies

To wire these into `src/pages/` and route them, the following must exist:

| Import path                                       | What it must export                                 |
| ------------------------------------------------- | --------------------------------------------------- |
| `@/components/ui/tabs`                            | shadcn `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` |
| `@/components/ui/button`                          | shadcn `Button`                                     |
| `@/components/ui/card`                            | shadcn `Card`                                       |
| `@/lib/utils`                                     | `cn()` className helper                             |
| `@/lib/craftingTypes`                             | `ProfessionData` type                               |
| `@/components/profession/CraftingInterface`       | crafting-tab UI                                     |
| `@/components/profession/UpgradeInterface`        | upgrades-tab UI                                     |
| `@/components/profession/ActivitiesPanel`         | activities-tab UI                                   |
| `@/components/profession/TreeVisualizer`          | skill-tree-tab UI                                   |
| `@/data/crafting/professionActivities`            | `ProfessionKey` union                               |
| `@/data/crafting/{chef,engineer,forester,miner,mystic}` | per-profession data objects                  |

Once those land, move these files into `src/pages/profession/` and add them to
the wouter route table in `src/App.tsx`.
