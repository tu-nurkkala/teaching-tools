#!/usr/bin/env python3

import fileinput
import subprocess
import os
import argparse
import re
from os.path import basename, splitext
from jinja2 import Environment, FileSystemLoader
from enum import Enum


class LaTeXConverter(object):
    """Handle the conversion of ONE LaTex/TikZ picture."""

    def __init__(self, org_file_name, org_lineno, picture_number, cmd_line_args):
        self.org_file_name = org_file_name
        self.org_file_base = splitext(basename(self.org_file_name))[0]
        self.org_lineno = org_lineno
        self.picture_number = picture_number
        self.cmd_line_args = cmd_line_args

        self.lines = []

        jinja_env = Environment(
            loader=FileSystemLoader(self.cmd_line_args.template_directory)
        )
        self.template = jinja_env.get_template("tikz-template.tex.jinja")

        print(f"{self.org_file_name} line {self.org_lineno}")

    def append(self, line):
        self.lines.append(line)

    def make_file_name(self, suffix):
        base_name = f"{self.org_file_base}-pic-{self.picture_number}"
        return f"{base_name}.{suffix}"

    def wrap_buffer(self):
        tmp = self.lines[:]
        tmp.insert(0, f"% START {self.org_file_name} l.{self.org_lineno}")
        tmp.append(r"% END")
        return tmp

    def write_tikz_file(self):
        tikz = "\n".join(self.wrap_buffer())
        with open(self.make_file_name("tikz"), "w") as tikz_file:
            tikz_file.write(tikz)

    def write_tex_file(self, extra_headers):
        latex = self.template.render(
            tikz="\n".join(self.wrap_buffer()), headers="\n".join(extra_headers)
        )

        with open(self.make_file_name("tex"), "w") as tikz_file:
            tikz_file.write(latex)

    def run_tex(self):
        command = ["lualatex", "-shell-escape", self.make_file_name("tex")]
        subprocess.run(command, check=True)

    def run_convert(self):
        # This is the default command performed by the LaTeX `standalone` package
        # when you supply the `convert` option with no sub-options.
        # N.B., these all have to be separate list items to keep ImageMagick happy.
        default_command = [
            "magick",
            "-density",
            "300",  # Set this _before_ reading the image
            "-units",
            "PixelsPerInch",
            self.make_file_name("pdf"),
            "-resize",
            "x800",  # Our projectors are 1280x800
            "-quality",
            "90",
            self.make_file_name("png"),
        ]
        subprocess.run(default_command, check=True)

    def clean_up(self):
        for suffix in ["pdf", "log", "aux"]:
            os.remove(self.make_file_name(suffix))

    def convert(self, extra_headers):
        if self.cmd_line_args.make_tikz:
            self.write_tikz_file()
        self.write_tex_file(extra_headers)
        if not self.cmd_line_args.no_convert:
            self.run_tex()
            self.run_convert()
            if not self.cmd_line_args.no_cleanup:
                self.clean_up()


class ReaderState(Enum):
    DEFAULT = "default"
    IN_LATEX = "latex"
    IN_TIKZ = "tikz"


class FileProcessor(object):
    def __init__(self, file_name, cmd_line_args):
        self.file_name = file_name
        self.cmd_line_args = cmd_line_args
        self.picture_number = 1
        self.line_number = 0
        self.headers = []
        self.converter = None

    def start_converter(self, line=None):
        if self.converter is not None:
            raise RuntimeError("Converter already active")
        self.converter = LaTeXConverter(
            self.file_name, self.line_number, self.picture_number, self.cmd_line_args
        )
        if line is not None:
            self.converter.append(line)
        self.picture_number += 1

    def complete_converter(self, line=None):
        if line is not None:
            self.converter.append(line)
        self.converter.convert(self.headers)
        self.converter = None

    def process_file(self):
        state = ReaderState.DEFAULT

        with open(self.file_name) as file:
            for line in file:
                self.line_number += 1
                line_prefix = line.strip()
                line = line.rstrip()

                if state == ReaderState.DEFAULT:
                    if line_prefix.startswith(r"#+LATEX_HEADER:"):
                        match = re.fullmatch(r"#\+LATEX_HEADER:\s+(.+)", line_prefix)
                        if match is None:
                            raise RuntimeError(f"Can't match '{line_prefix}'")
                        else:
                            self.headers.append(match[1])

                    elif line_prefix.startswith(r"\begin{tikzpicture}"):
                        self.start_converter(line)
                        state = ReaderState.IN_TIKZ
                        continue

                    elif re.match(r"#\+BEGIN_EXPORT\s+latex", line_prefix):
                        self.start_converter()
                        state = ReaderState.IN_LATEX
                        continue

                elif state == ReaderState.IN_TIKZ:
                    if line_prefix.startswith(r"\end{tikzpicture}"):
                        self.complete_converter(line)
                        state = ReaderState.DEFAULT
                        continue
                    else:
                        self.converter.append(line)

                elif state == ReaderState.IN_LATEX:
                    if line_prefix.startswith(r"#+END_EXPORT"):
                        self.complete_converter()
                        state = ReaderState.DEFAULT
                        continue
                    else:
                        self.converter.append(line)


parser = argparse.ArgumentParser()
parser.add_argument(
    "--template-directory",
    default="/Users/tom/Taylor/Tools/share/jinja2",
    help="Directory containing Jinja templates",
)
parser.add_argument(
    "--make-tikz",
    action="store_true",
    help="Create a file that has just the TikZ source",
    default=False,
)
parser.add_argument(
    "--no-convert", action="store_true", help="Skip the conversion step", default=False
)
parser.add_argument(
    "--no-cleanup", action="store_true", help="Skip the clean-up step", default=False
)
parser.add_argument("file", nargs="+", help="Input file to process")

args = parser.parse_args()

for source_file in args.file:
    processor = FileProcessor(source_file, args)
    processor.process_file()
