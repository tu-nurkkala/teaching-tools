#!/usr/bin/env bash

jupyter nbconvert $1 \
	--SlidesExporter.reveal_transition="fade" \
	--SlidesExporter.reveal_theme="sky" \
	--no-prompt \
	--to slides \
	--post serve
