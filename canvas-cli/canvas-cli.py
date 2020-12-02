#!/usr/bin/env python3
import json

import click
import requests
from dateutil.parser import *

CANVAS_BASE_URL = "https://canvas.cse.taylor.edu"
CANVAS_API_URL = f"{CANVAS_BASE_URL}/api/v1"
JSON_SERVER_URL = "http://localhost:3000"
CANVAS_TOK = "NfnIbHzm2Hp4lS5WjBJBjXceQc5XZ4WrdsgBzyQKYQgOd9Bu7G7urVwNmGG277L0"
AUTH_HEADER = {"Authorization": f"Bearer {CANVAS_TOK}"}


def canvas_api(url):
    return requests.get(f"{CANVAS_API_URL}/{url}", headers=AUTH_HEADER).json()


def unique_by_id(items):
    all = {}
    for item in items:
        all[item['id']] = item
    return list(all.values())


def extract_date(iso_string):
    dt = parse(iso_string)
    return dt.date().isoformat()


def term_date(term):
    return term['end_at'] or term['start_at'] or term['created_at'] or RuntimeError("No date")


def fetch_terms():
    return unique_by_id([course['term']
                         for course
                         in requests.get(f"{JSON_SERVER_URL}/courses").json()])


@click.group()
def cli():
    pass


@cli.group()
def courses():
    pass


@cli.group()
def terms():
    pass


@cli.group()
def defaults():
    pass


@defaults.command('term')
def default_term():
    term_lookup = {idx: term for idx, term in enumerate(fetch_terms(), 1)}
    print("TERM LOOKUP", term_lookup)
    id = click.prompt("Choose a term", type=int)
    print(id)
    if 1 < id < len(term_lookup):
        requests.post(f"{JSON_SERVER_URL}/defaults",
                      headers={"Content-Type": "application/json"},
                      json={"term": term_lookup[id]['id']})


@terms.command('list')
def list_terms():
    for term in sorted(fetch_terms(), key=lambda t: t['id']):
        print(f"{extract_date(term_date(term))} {term['name']}")


@courses.command('list')
def list_courses():
    courses = requests.get(f"{CANVAS_API_URL}/courses",
                           headers=AUTH_HEADER,
                           params={"include": "term"}).json()
    for course in sorted(set(courses), key=lambda c: term_date(c['term'])):
        print(json.dumps(course, indent=2))
        requests.post(f"{JSON_SERVER_URL}/courses",
                      headers={"Content-Type": "application/json"},
                      json=course)
        print(
            f"{course['id']} {course['course_code']} {extract_date(term_date(course['term']))} {course['term']['name']} {course['name']}")


if __name__ == '__main__':
    cli()
