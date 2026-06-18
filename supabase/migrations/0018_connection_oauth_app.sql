-- BYO OAuth app credentials. Connectors like Vincere issue a client_id per
-- customer instance (registered in the customer's own Vincere App Store), so a
-- single shared env app can't authorize every tenant. For these the workspace
-- registers its OWN OAuth app and stores the client_id (+ optional secret,
-- encrypted at rest like the tokens) here. NULL for connectors that use a
-- shared app from env. The row is created with status='pending' when the
-- credentials are saved, then flips to 'active' once the OAuth round-trip
-- completes and tokens land.
alter table workspace_connections
  add column oauth_client_id text,
  add column oauth_client_secret_cipher text;
