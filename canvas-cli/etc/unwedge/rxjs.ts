import { config } from "dotenv";
config();

import { forkJoin, from, of } from "rxjs";
import { map, mergeAll, mergeMap, switchMap, tap } from "rxjs/operators";
import _ from "lodash";
import "reflect-metadata";

import CanvasApi from "../../src/api/api";
import CacheDb from "../../src/cacheDb";

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

async function takeTwo() {
  const groups$ = from(api.apiGetGroups(courseId));

  const groupsAndMembers$ = groups$.pipe(
    mergeAll(),
    map((grp) => ({ id: grp.id, name: grp.name })),
    mergeMap((grp) => {
      console.log("GRP ID", grp.id);
      return from(api.apiGetGroupMembers(grp.id)).pipe(
        map((members) => ({ grp, members }))
      );
    })
  );

  groupsAndMembers$.subscribe({
    next: (val) => {
      console.log("NEXT", typeof val, _.size(val), val);
    },
    error: (err) => console.error("ERR", err),
    complete: () => console.log("COMPLETE"),
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

takeTwo();
// primrosePath();
// simpleApi();
// tryFork();
// superSimple();
