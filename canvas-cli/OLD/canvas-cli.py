#!/usr/bin/env python3
import json
import os

import click
import requests
from dateutil.parser import *
from dotenv import load_dotenv

load_dotenv()
CANVAS_BASE_URL = os.getenv("CANVAS_BASE_URL")
CANVAS_TOK = os.getenv("CANVAS_TOK")
JSON_SERVER_URL = os.getenv("JSON_SERVER_URL");

CANVAS_API_URL = f"{CANVAS_BASE_URL}/api/v1"
AUTH_HEADER = {"Authorization": f"Bearer {CANVAS_TOK}"}


def dump_json(j):
    print(json.dumps(j, indent=2))


class Element:
    def __init__(self, data):
        self.data = data

    def id(self):
        return self.data['id']


class Collection:
    def __init__(self, config):
        self.config = config
        self.elements = []

    def get_all(self):
        result = requests.get(f"{CANVAS_API_URL}/{self.config['get']['url']}",
                              headers=AUTH_HEADER,
                              params=self.config['get']['params'] or {}).json()
        ctor = self.config['element_cls'];
        self.elements = [ctor(element) for element in result]
        return self.elements

    def by_id(self):
        return sorted(self.elements, key=lambda elt: elt.id())

    def db_read(self):
        pass

    def db_create(self):
        pass

    def db_update(self):
        pass

    def db_delete(self):
        pass


class Courses(Collection):
    def __init__(self):
        super().__init__({
            "element_cls": Course,
            "get": {
                "url": "courses",
                "params": {"include": "term"}
            }
        })


class Course(Element):
    def __init__(self, course_data):
        super().__init__(course_data)

    def __str__(self):
        return f"<Course {self.id()}: {self.data['course_code']}, {self.term['name']}, {self.date()}>"

    @property
    def term(self):
        return self.data['term']

    def timestamp(self):
        date = self.term['end_at'] or self.term['start_at'] or self.term['created_at']
        if not date:
            raise RuntimeError(f"No date for {self}")
        return date;

    def datetime(self):
        return parse(self.timestamp())

    def date(self):
        return self.datetime().date().isoformat()


def canvas_api(url):
    return requests.get(f"{CANVAS_API_URL}/{url}", headers=AUTH_HEADER).json()


def unique_by_id(items):
    all = {}
    for item in items:
        all[item['id']] = item
    return list(all.values())


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
    for idx, term in term_lookup.items():
        print(f"{idx}. {term['name']} {term['id']}")
    id = click.prompt("Choose a term", type=int)
    print(id, term_lookup[id])
    requests.post(f"{JSON_SERVER_URL}/defaults",
                  headers={"Content-Type": "application/json"},
                  json={"term": term_lookup[id]['id']})


# @terms.command('list')
# def list_terms():
#     for term in sorted(fetch_terms(), key=lambda t: t['id']):
#         print(f"{extract_date(term_date(term))} {term['name']}")


@courses.command('list')
def list_courses():
    collection = Courses()
    collection.get_all()
    for course in collection.by_id():
        print(course)
        # requests.post(f"{JSON_SERVER_URL}/courses",
        #               headers={"Content-Type": "application/json"},
        #               json=course)
        # print(
        #     f"{course['id']} {course['course_code']} {extract_date(term_date(course['term']))} {course['term']['name']} {course['name']}")


if __name__ == '__main__':
    cli()
