# Automatic work email

New accounts created through the main account form use the database-assigned
`users.id_number`. For example, `10B-00172` produces
`cruz.10b00172@10builders.com`. The email does not have a separate counter.

Account creation inserts the user once, reads the generated ID, and sets the
final email inside the same transaction. An internal temporary address never
becomes a committed account email. Missing or invalid database IDs roll back
creation instead of inventing a second ID.

The configured database already has its own `id_number` default. For a fresh
database created from the original repository schema, apply migration
`016-user-id-numbers.sql`; it preserves existing IDs and an existing default.
It does not rewrite existing account emails. No live migration or account
repair is performed automatically.

Repeated account creation requests retain the same request ID and return the
original account. Database sequences may have gaps after rolled-back inserts;
the email always uses the ID actually assigned to its account.
