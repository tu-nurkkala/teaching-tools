#!/usr/bin/env bash

jupyter nbconvert $1 \
	--SlidesExporter.reveal_transition="fade" \
	--no-prompt \
	--to slides \
	--post serve
