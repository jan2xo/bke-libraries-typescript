# Accepted version policy

This pure licensing helper evaluates a supplied semantic version against optional product-owned minimum and maximum bounds. Bounds are inclusive; an omitted, `null`, or empty bound is unbounded. Values are canonicalized using `semver.valid` before comparison.

Malformed requested versions throw `INVALID_LICENSE_VERSION`. Malformed bounds or a minimum greater than the maximum throw `INVALID_VERSION_POLICY`. The requested version is validated first.

This capability evaluates supplied bounds only. It does not determine whether a version is active, read ProductVersion persistence, or adopt a host application's release or catalog records.
