#!/usr/bin/env python3

import csv
import json
import re
import sys
from os import path

from helpers import make_password


def read_canvas_grades_file(file_name):
    students = []
    with open(file_name) as csvfile:
        reader = csv.reader(csvfile)
        for row in reader:
            if 'Student' in row[0] or 'Points Possible' in row[0] or 'Test Student' in row[0]:
                continue
            else:
                # Get max of two names.
                [first_name, last_name] = row[0].split(None, 1)
                last_name = last_name.replace(' ', '')  # Handle Dutch names :-)
                first_last_lower = f"{first_name}_{last_name}".lower()

                login_id = row[3]
                if '@' in login_id:
                    # Looks like an email address too
                    email = login_id
                    login_id = re.sub(r'@.*', '', login_id)
                else:
                    email = f"{first_last_lower}@taylor.edu"

                students.append({
                    "first_name": first_name,
                    "last_name": last_name,
                    "email": email,

                    "pg_username": first_last_lower,
                    "pg_password": make_password(),
                    "pg_db_name": first_last_lower
                })
    return students


## Provide the name of a Canvas grade file (export CSV from grade book).
grade_file_path = path.abspath(sys.argv[1])
(grade_file_dir, grade_file) = path.split(grade_file_path)

students = read_canvas_grades_file(grade_file_path)

with open(path.join(grade_file_dir, "student-data.json"), "w") as out:
    print(json.dumps(students, indent=2), file=out)
