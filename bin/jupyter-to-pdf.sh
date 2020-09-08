#!/usr/bin/env bash

source $HOME/jupyter-venv/bin/activate

jupyter-nbconvert --to pdf $1
