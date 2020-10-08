#!/usr/bin/env python3

import json
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
        print("/usr/bin/env bash\n", file=out)
        for student in students:
            print(f"pg_restore -d {student['pg_db_name']} dvdrental.tar", file=out)

    tables = ['actor', 'address', 'category', 'city', 'country', 'customer',
              'film', 'film_actor', 'film_category', 'inventory', 'language',
              'payment', 'rental', 'staff', 'store']

    sequences = ['actor_actor_id_seq', 'address_address_id_seq',
                 'category_category_id_seq', 'city_city_id_seq', 'country_country_id_seq',
                 'customer_customer_id_seq', 'film_film_id_seq', 'inventory_inventory_id_seq',
                 'language_language_id_seq', 'payment_payment_id_seq', 'rental_rental_id_seq',
                 'staff_staff_id_seq', 'store_store_id_seq']

    views = ['actor_info', 'customer_list', 'film_list', 'nicer_but_slower_film_list',
             'sales_by_film_category', 'sales_by_store', 'staff_list']

    with open(path.join(student_file_dir, "update-owner.sql"), "w") as out:
        for student in students:
            print(f"\n\\c {student['pg_username']}", file=out)
            for table in tables:
                print(alter_table_owner(table, student["pg_username"]), file=out)
            for sequence in sequences:
                print(alter_sequence_owner(sequence, student["pg_username"]), file=out)
            for view in views:
                print(alter_view_owner(view, student["pg_username"]), file=out)
