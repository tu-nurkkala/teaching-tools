import { config } from "dotenv";
config();

import chalk from "chalk";
import { forkJoin, from, of } from "rxjs";
import { delay, map, mergeAll, mergeMap, tap } from "rxjs/operators";
import _ from "lodash";
import "reflect-metadata";

import CanvasApi from "../../src/api/api";
import CacheDb from "../../src/CacheDb";
import { plainToClass } from "class-transformer";
import { APIGroup, Group, GroupCategory } from "../../src/entities/Group";
import Chance from "chance";
const chance = new Chance();

const courseId = 65;
const cache = new CacheDb();
const api = new CanvasApi(cache);

function tryFork() {
  forkJoin({
    categories: from(api.apiGetGroupCategories(courseId)),
    groups: from(api.apiGetGroups(courseId)).pipe(
      tap((grp) => {
        console.log(`TAP LENGTH: ${grp.length}`);
        console.log(`TAP ARRAY?: ${Array.isArray(grp)}`);
      }),
      map((value, index) => console.log("VALUE", /* value, */ "INDEX", index))
    ),
  }).subscribe({
    next: (v) => console.log(`NEXT - Got ${_.size(v)}`),
    error: (err) => console.error("ERR", err),
    complete: () => console.log("COMPLETE"),
  });
}

async function simpleApi() {
  from(api.unwedgeGroupCats(courseId))
    .pipe(
      tap((val) => console.log("TIP TAP")),
      map((response) => response.body)
    )
    .subscribe({
      next: (val) => {
        console.log("NEXT", typeof val, _.size(val), val);
      },
      error: (err) => console.error("ERR", err),
      complete: () => console.log("COMPLETE"),
    });
}

// This helped:
// https://www.thinktecture.com/en/angular/rxjs-antipattern-1-nested-subs/
function takeTwo() {
  // const groupCategories$ = from(api.apiGetGroupCategories(courseId));
  const groups$ = from(api.apiGetGroups(courseId));
  const groupsAndMembers$ = groups$.pipe(
    tap((v) => console.log("BEFORE", v)),
    mergeAll(),
    tap((v) => console.log("AFTER", typeof v, v)),
    mergeMap((grp) =>
      from(api.apiGetGroupMembers(grp.id)).pipe(
        map((members) => {
          grp.members = members;
          return grp;
        })
      )
    ),
    map((grp) => plainToClass(Group, grp, { excludeExtraneousValues: true }))
  );

  groupsAndMembers$.subscribe({
    next: (val) => {
      console.log("NEXT", typeof val, _.size(val), val);
    },
    error: (err) => console.error("ERR", err),
    complete: () => console.log("COMPLETE"),
  });
}

async function takeThree() {
  console.log("TAKE THREE");
  const groupCategories = await api.apiGetGroupCategories(courseId);

  function addToCategory(group: APIGroup) {
    const groupCat = groupCategories.find(
      (grpCat) => grpCat.id === group.group_category_id
    );
    if (groupCat) {
      if (!groupCat.groups) {
        groupCat.groups = [];
      }
      groupCat.groups.push(group);
    } else {
      throw Error(`No group category with ID ${group.group_category_id}`);
    }
  }

  from(api.apiGetGroups(courseId))
    .pipe(
      mergeAll(),
      mergeMap((grp) => {
        addToCategory(grp);
        return from(api.apiGetGroupMembers(grp.id)).pipe(
          map((members) => {
            grp.members = members;
            return grp;
          })
        );
      })
    )
    .subscribe({
      complete: () => {
        const rtn = plainToClass(GroupCategory, groupCategories, {
          excludeExtraneousValues: true,
        });
        console.dir(rtn, { depth: null });
      },
    });
}

function superSimple() {
  const numbers$ = from([1, 2, 3, 5, 7]);
  numbers$.subscribe({
    next: (val) => console.log(`NEXT '${val}'`),
    error: (err) => console.error("ERR", err),
    complete: () => console.log("COMPLETE"),
  });
}

function fakeHTTP(msge: string) {
  return of(`FAKE HTTP ${msge}`).pipe(delay(100));
}

function log(message: string, ...args: any[]) {
  const header = `_____ ${message} _____`;
  console.log(chalk.hsv(chance.integer({ min: 0, max: 255 }), 75, 75)(header));
  args.forEach((arg) => console.log(arg));
}

function banner(message: string) {
  const rule = "-".repeat(20);
  console.log(chalk.black.bgYellow([rule, message, rule].join(" ")));
}

function mapOMatic(which: string) {
  banner(which);
  const letters$ = from(["alpha", "beta", "gamma"]);
  let ob$ = null;

  switch (which) {
    case "one":
      ob$ = letters$.pipe(
        tap((v) => log("before map", v)),
        map((letter) => fakeHTTP(letter)),
        tap((v) => log("before mergeAll", v)),
        mergeAll(),
        tap((v) => log("end", v))
      );
      break;
    case "two":
      ob$ = letters$.pipe(
        tap((v) => log("before mergeMap", v)),
        mergeMap((letter) => fakeHTTP(letter)),
        tap((v) => log("end", v))
      );

      break;
  }

  ob$!.subscribe({
    next: (v) => console.log(chalk.green("NEXT"), v),
    error: (e) => console.log(chalk.red("ERR"), e),
    complete: () => console.log(chalk.green("COMPLETE")),
  });
}

// mapOMatic("one");
// mapOMatic("two");
takeTwo(); // THIS ONE WORKS
takeThree(); // THIS ONE WORKS
// primrosePath();
// simpleApi();
// tryFork();
// superSimple();
