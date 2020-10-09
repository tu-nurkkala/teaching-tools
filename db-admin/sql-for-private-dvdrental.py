#!/usr/bin/env python3

import json
import sys
from os import path

from helpers import alter_table_owner, alter_sequence_owner, alter_view_owner

student_file_path = path.abspath(sys.argv[1])
(student_file_dir, student_file) = path.split(student_file_path)

with open(student_file_path, "r") as in_file:
    students = json.load(in_file)

    with open(path.join(student_file_dir, "rebuild-schema.sql"), "w") as out:
        for student in students:
            print(f"\n\\c {student['pg_username']}", file=out)
            print("DROP SCHEMA public CASCADE;", file=out)
            print("CREATE SCHEMA public;", file=out)

    with open(path.join(student_file_dir, "import-dvdrental.sh"), "w") as out:
        for student in students:
            print(f"pg_restore --clean --no-owner --dbname={student['pg_db_name']} --role={student['pg_username']} ../dvdrental.tar", file=out)
