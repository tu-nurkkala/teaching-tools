#!/usr/bin/env python3

import json
import sys
from os import path

from helpers import create_pg_user, create_pg_database, drop_pg_user, drop_pg_database

student_file_path = path.abspath(sys.argv[1])
(student_file_dir, student_file) = path.split(student_file_path)

with open(student_file_path, "r") as in_file:
    students = json.load(in_file)

    with open(path.join(student_file_dir, "create-student-dbs.sql"), "w") as out:
        for student in students:
            print(create_pg_user(student["pg_username"], student["pg_password"]), file=out)
            print(create_pg_database(student["pg_username"], student["pg_db_name"]), file=out)

    with open(path.join(student_file_dir, "drop-student-dbs.sql"), "w") as out:
        for student in students:
            print(drop_pg_database(student["pg_db_name"]), file=out)
            print(drop_pg_user(student["pg_username"]), file=out)
