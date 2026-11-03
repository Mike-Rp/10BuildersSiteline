# Thesis-Backend

## Database migration rollout

Use the explicit migration plan rather than applying every numbered SQL file by
filename. The plan is checked against a reviewed manifest, runs in a fixed order,
and refuses unknown migrations. Recovery and data-sensitive migrations remain
on their dedicated scripts.

```sh
npm run db:migrate -- --plan
npm run db:migrate -- --dry-run
npm run db:migrate -- --apply
```

The default is `--plan`; it reads the migration ledger and changes no schema.
`--dry-run` executes the approved runner migrations in one transaction and rolls
it back. `--apply` commits them. Applying against a non-local database also
requires `--confirm-backup` after verifying a current backup:

```sh
npm run db:migrate -- --apply --confirm-backup
```

The runner intentionally excludes recovery and data-sensitive changes. Its
plan prints the dedicated instructions for those files. In particular, migration
017 (`017-project-photo-review.sql`) is included in the approved order after
010 (`010-photo-release.sql`). Confirm its applied status with `--plan`; do not
infer the live database state from the checked-in SQL file.
