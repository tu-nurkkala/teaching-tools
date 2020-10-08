#!/usr/bin/env bash

createuser postgres
createdb --owner=postgres dvdrental
pg_restore --username postgres --dbname dvdrental dvdrental.tar 
