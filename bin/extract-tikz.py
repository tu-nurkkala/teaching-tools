#!/usr/bin/env python3

import fileinput
import subprocess
import os
import argparse
from os.path import basename, splitext
from jinja2 import Environment, FileSystemLoader


class TikzConverter(object):
    """Handle the conversion of ONE tikz picture."""

    def __init__(self, org_file_name, org_lineno, picture_number, template_directory):
        self.org_file_name = org_file_name
        self.org_file_base = splitext(basename(self.org_file_name))[0]
        self.org_lineno = org_lineno
        self.picture_number = picture_number
        self.tikz_buffer = []

        jinja_env = Environment(loader=FileSystemLoader(template_directory))
        self.template = jinja_env.get_template("tikz-template.tex.jinja")

        print(f"{self.org_file_name} line {self.org_lineno}")

    def append(self, line):
        self.tikz_buffer.append(line)

    def make_file_name(self, suffix):
        base_name = f"{self.org_file_base}-pic-{self.picture_number}"
        return f"{base_name}.{suffix}"

    def wrap_buffer(self):
        tmp_buffer = self.tikz_buffer[:]
        tmp_buffer.insert(
            0, f"% ----- START {self.org_file_name} l.{self.org_lineno} -----"
        )
        tmp_buffer.append(r"% ----- END -----")
        return tmp_buffer

    def write_tikz_file(self):
        tikz = "\n".join(self.wrap_buffer())
        with open(self.make_file_name("tikz"), "w") as tikz_file:
            tikz_file.write(tikz)

    def write_tex_file(self):
        tikz = "\n".join(self.wrap_buffer())
        latex = self.template.render(tikz=tikz)

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


def process_source_file(file_name, cmd_line_args):
    inside_tikz = False
    picture_number = 1
    line_number = 0

    with open(file_name) as file:
        for line in file:
            line_number += 1
            line_prefix = line.lstrip()
            line = line.rstrip()

            if line_prefix.startswith(r"\begin{tikzpicture}"):
                pf = TikzConverter(
                    file_name,
                    line_number,
                    picture_number,
                    cmd_line_args.template_directory,
                )
                pf.append(line)
                picture_number += 1
                inside_tikz = True
                continue
            elif line_prefix.startswith(r"\end{tikzpicture}"):
                pf.append(line)
                if cmd_line_args.make_tikz:
                    pf.write_tikz_file()
                pf.write_tex_file()
                if not cmd_line_args.skip_convert:
                    pf.run_tex()
                    pf.run_convert()
                    if not cmd_line_args.skip_cleanup:
                        pf.clean_up()
                inside_tikz = False
                continue

            if inside_tikz:
                pf.append(line)


parser = argparse.ArgumentParser()
parser.add_argument(
    "--template-directory",
    default="/Users/tom/Taylor/Classes/share/jinja2",
    help="Directory containing Jinja templates",
)
parser.add_argument(
    "--make-tikz",
    action="store_true",
    help="Create a file that has just the TikZ source",
    default=False,
)
parser.add_argument(
    "--skip-convert",
    action="store_true",
    help="Skip the conversion step",
    default=False,
)
parser.add_argument(
    "--skip-cleanup", action="store_true", help="Skip the clean-up step", default=False
)
parser.add_argument("file", nargs="+", help="Input file to process")

args = parser.parse_args()

for source_file in args.file:
    process_source_file(source_file, args)
