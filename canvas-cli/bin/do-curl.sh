#!/usr/bin/env bash -x

curl \
	--verbose \
	-L \
	-H "Authorization: Bearer bCyhPrjjkFW0POykfDeWMQvJFlJ83h0WXahIy6lCdtgGG3NXkUT93SY12l7UVyL5" \
	-o foo42 \
	"https://canvas.cse.taylor.edu/files/9883/download?download_frd=1&verifier=dyfYSwRPGAbPwIRB9N3kGVUhFkpg4l8Eem5g60b8"
# WORKS "https://canvas.cse.taylor.edu/files/9884/download?download_frd=1&verifier=EyiLuOl3RQe3pcIi1BKDxTdl9gSIYX1s8UMJw518"
