#!/bin/bash

# Self-signed certificate for TLS_MODE=self.
#
# Two things this has to do for itself. cert.conf is read from the working
# directory, so the script locates itself rather than requiring the caller to
# cd into scripts/ first. And certs/ holds no tracked file — .gitignore has
# `certs/*` — so a fresh clone does not have the directory openssl is asked to
# write into, and the whole Docker quick start died on that.

set -e

cd "$(dirname "$0")"
mkdir -p ../certs

openssl req -x509 -nodes -days 365 -newkey rsa:2048 -config cert.conf \
  -keyout ../certs/server.key -out ../certs/server.crt

printf 'Wrote certs/server.key and certs/server.crt (self-signed, 365 days).\n'
