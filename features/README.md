# Workspace features

This folder holds **workspace-level and ecosystem** features only. Product/framework features live
in the repo that owns them (`repos/slice.js/features/`, `repos/slicejs-cli/features/`, etc.).

The full standard, lifecycle and file contract live in
[`docs/FEATURES.md`](../docs/FEATURES.md). The short version:

```bash
pnpm feature:new "Title" --area framework      # creates repos/slice.js/features/NNNN-....md
pnpm feature:new "Title" --repo workspace --area ecosystem
pnpm feature:list                              # aggregates every repo
pnpm feature:list --status planned```

A feature is not approval to implement it. Move it to `planned`/`in-progress` explicitly before
writing code. Feature files are committed in the owning repo, not here.

`BACKLOG.md` remains the short ordered list; a `features/` file is the detail behind one item.

The canonical template used by the CLI is [`_TEMPLATE.md`](./_TEMPLATE.md).
