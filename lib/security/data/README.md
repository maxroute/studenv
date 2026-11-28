# Vendored security data

## disposable-email-domains.json

Disposable (temporary) email domains, used by `lib/security/disposable-email.ts`
to refuse new sign-ups and email changes to throwaway inboxes.

- Source: https://github.com/disposable-email-domains/disposable-email-domains
  (`disposable_email_blocklist.conf`)
- Upstream commit: `9cf2bee345b0276e1b65cee7484beb51e5c715b1` (2026-11-21), 10,455 domains
- License: CC0 1.0 Universal, see `disposable-email-domains.LICENSE.txt`

The JSON is the upstream file lower-cased, de-duplicated and sorted. Parent
domains also cover their subdomains, so only list the registrable domain.

To refresh, download the current `disposable_email_blocklist.conf`, regenerate
the JSON the same way, update the commit above, and run `npm run test:security`.
