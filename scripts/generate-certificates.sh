#!/bin/bash

openssl req -x509 -nodes -days 365 -newkey rsa:2048 -config cert.conf -keyout ../certs/server.key -out ../certs/server.crt