#!/usr/bin/env bash

basename=$(basename $1 .ipynb)

pandoc \
    --atx-headers \
    --output=$basename.ipynb \
    $basename.org
