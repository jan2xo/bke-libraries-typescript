# License lookup

`LicensingLicenseLookup` is an internal trusted-server lookup by an
already hashed license key. It returns the public `LicensingLicenseSnapshot`
projection only. The repository does not trim or interpret the hash, make
status, version, authorization, or expiry decisions, write data, or read
foreign-domain tables. Key hashes and encrypted/raw key material are never
returned.
