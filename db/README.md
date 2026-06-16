# Database Notes

`schema.sql` is the current draft schema. It includes the V1 trip lifecycle fields for payment status, theme pack, password flags, photo metrics, token rotation, and sensitive-field visibility.

The next database step is to turn this into real Supabase migrations and wire:

1. Auth.
2. Owner-scoped trip creation.
3. Dashboard trip listing.
4. Upload records.
5. Published trip snapshots.

The prototype must keep building without Supabase env vars. In that mode, maker routes use the Wren's Adventure demo trip while the production code paths remain Supabase-ready.
