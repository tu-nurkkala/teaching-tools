#!/usr/bin/env bash

basename=$(basename $1 .org)

pandoc \
    --atx-headers \
    --output=$basename.ipynb \
    $basename.org
