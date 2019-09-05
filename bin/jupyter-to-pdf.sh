#!/usr/bin/env bash

basename=$(basename $1 .ipynb)

pandoc \
    --number-sections \
    --output=$basename.pdf \
    $basename.ipynb
