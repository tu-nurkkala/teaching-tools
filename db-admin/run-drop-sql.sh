#!/usr/bin/env bash

psql \
    --host=faraday.cse.taylor.edu \
    --username=tnurkkala \
    --file=drop-student-dbs.sql
