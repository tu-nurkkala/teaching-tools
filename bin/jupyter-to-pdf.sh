#!/usr/bin/env bash

echo "REWRITE THIS TO USE NBCONVERT"
exit 1

basename=$(basename $1 .ipynb)

pandoc \
    --number-sections \
    --output=$basename.pdf \
    $basename.ipynb
