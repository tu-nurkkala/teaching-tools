#!/usr/bin/env bash

psql \
    --host=faraday.cse.taylor.edu \
    --username=tnurkkala \
    --file=create-student-dbs.sql
