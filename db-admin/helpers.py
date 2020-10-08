import random
from datetime import datetime


def time_stamp():
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S')


def create_pg_user(username, password):
    return f"CREATE USER {username} WITH ENCRYPTED PASSWORD '{password}';"


def create_pg_database(username, db_name):
    return f"CREATE DATABASE {db_name} WITH OWNER {username};"


def drop_pg_user(username):
    return f"DROP USER {username};"


def drop_pg_database(db_name):
    return f"DROP DATABASE {db_name};"


def alter_table_owner(table_name, user_name):
    return f"ALTER TABLE {table_name} OWNER TO {user_name};"


def alter_sequence_owner(sequence_name, user_name):
    return f"ALTER SEQUENCE {sequence_name} OWNER TO {user_name};"


def alter_view_owner(view_name, user_name):
    return f"ALTER VIEW {view_name} OWNER TO {user_name};"


def random_vowel():
    return random.choice("aeiou")


def random_consonant():
    return random.choice("bcdfghjklmnpqrstvwxyz")


def make_password():
    return "".join(random_consonant() + random_vowel() for i in range(4))
