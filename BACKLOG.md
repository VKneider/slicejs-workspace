# Backlog

Short, ordered list for **workspace/ecosystem** work. Detailed specs live in
[`features/`](./features/README.md); product/framework features live in their own repo's
`BACKLOG.md` + `features/`.

| Order | Item | Status | Area | Spec |
|---|---|---|---|---|
| 1 | Workspace dashboard for features and repo status | done | workspace | [`0001`](./features/0001-workspace-dashboard-for-features-and-repo-status.md) |
| 2 | Slice.js lab: full app showcase and UI fluidity lab | in-progress | ecosystem | [`0002`](./features/0002-slice-js-lab-full-app-showcase-and-ui-fluidity.md) |

When an item earns a spec:

```bash
pnpm feature:new "Title" --repo workspace --area ecosystem
```

Then add one row here linking to the generated file, and keep the detailed status in the feature
frontmatter (source of truth).
