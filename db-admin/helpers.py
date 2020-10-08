import csv
import json
import random
import re
from datetime import datetime

import psycopg2


def time_stamp():
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S')


def run_psql(sql_statement):
    with psycopg2.connect(host="faraday.cse.taylor.edu", user="tnurkkala", dbname="postgres") as connection:
        with connection.cursor() as cursor:
            cursor.execute(sql_statement)


def create_pg_user(username, password):
    return f"CREATE USER {username} WITH ENCRYPTED PASSWORD '{password}';"


def create_pg_database(username, db_name):
    return f"CREATE DATABASE {db_name} WITH OWNER {username};"


def drop_pg_user(username):
    return f"DROP USER {username};"


def drop_pg_database(db_name):
    return f"DROP DATABASE {db_name};"


def random_vowel():
    return random.choice("aeiou")


def random_consonant():
    return random.choice("bcdfghjklmnpqrstvwxyz")


def make_password():
    return "".join(random_consonant() + random_vowel() for i in range(4))


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


if __name__ == '__main__':
    import sys

    students = read_canvas_grades_file(sys.argv[1])

    # run_psql('SELECT 2 + 2')
    with open("create-student-dbs.sql", "w") as out:
        for student in students:
            print(create_pg_user(student["pg_username"], student["pg_password"]), file=out)
            print(create_pg_database(student["pg_username"], student["pg_db_name"]), file=out)

    with open("drop-student-dbs.sql", "w") as out:
        for student in students:
            print(drop_pg_database(student["pg_db_name"]), file=out)
            print(drop_pg_user(student["pg_username"]), file=out)

    with open("student-data.json", "w") as out:
        print(json.dumps(students, indent=2), file=out)
