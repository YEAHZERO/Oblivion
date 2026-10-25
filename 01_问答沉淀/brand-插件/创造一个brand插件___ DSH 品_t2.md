# 创造一个brand插件——# DSH 品 · 轮 2

- 来源会话: `session-d7319a2b-0344-4696-bd95-43b36cc73caa`

## 问题

该插件位置在哪？

## 回答

The `oblivion-brand` plugin has been created in the following location:

**`C:\Projects\HarmonyOSDevelopment\Oblivion_deepseek\packages\oblivion-brand\`**

Structure:
```
packages/oblivion-brand/
├── package.json          # dsh.client manifest (inject: ui-renderer, ui-sidebar, ui-conversation)
├── tsconfig.json         # extends ../../tsconfig.base.json, jsx: react-jsx
├── README.md
└── src/
    ├── index.ts          # Empty node half: export function apply(): void {}
    └── client/
        ├── index.ts      # Client entry: inject=['slots'], registers 3 brand slots
        ├── Brand.tsx     # OblivionBrandMark({size}) + OblivionBrandName()
        └── polaris.ts    # 北极星 SVG path 与渐变常量
```

Three slot registrations:
| Slot | Component |
|---|---|
| `sidebar.brand.mark` | `OblivionBrandMark` (Polaris star, 24px) |
| `sidebar.brand.name` | `OblivionBrandName` ("Oblivion", Montserrat 16px) |
| `conversation.hero.brand.mark` | `OblivionBrandMark` (same star in hero area) |

**Additionally updated:**
- [package.json](/c:/Projects/HarmonyOSDevelopment/Oblivion_deepseek/package.json) — added `oblivion-brand` to the `oblivion.profile.bundles` list (line 74)

**Not yet done (from the original plan):**
- Web profile patch to set `DSH_CLIENT_BUILD_PROFILE=local`
- `pnpm-workspace.yaml` already uses `packages/*` so no change needed
- Build verification

---