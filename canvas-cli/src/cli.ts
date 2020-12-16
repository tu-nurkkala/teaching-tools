import { config } from "dotenv";
config();

import chalk from "chalk";
import { sprintf } from "sprintf-js";
import CacheDb from "./CacheDb";
import { ListCommands } from "./commands/list";
import CanvasApi from "./api/api";
import { Assignment } from "./entities/Assignment";
import { program } from "commander";
import { version } from "../package.json";
import { Term } from "./entities/Term";
import { Course } from "./entities/Course";
import { ShowCommands } from "./commands/show";
import { FindCommands } from "./commands/find";
import { GradeCommands } from "./commands/grade";
import { DownloadCommands } from "./commands/download";
import { SetCommands } from "./commands/set";

const cache = new CacheDb();
const api = new CanvasApi(cache);

program.version(version);
program.option("--api-chatter", "Show API actions");

const prettyError = require("pretty-error").start();
prettyError.appendStyle({
  "pretty-error > trace > item": {
    marginBottom: 0,
    bullet: '"<red>-</red>"',
  },
});

function showElement(typeName: string, value: number) {
  const segments = [
    chalk.blue(sprintf("%10s", typeName)),
    chalk.green(`(${value})`),
  ];
  console.log(segments.join(" "));
}

function showCurrentState() {
  const assignment = cache.getAssignment();
  showElement("Term", cache.getTerm().id);
  showElement("Course", cache.getCourse().id);
  showElement("Assignment", assignment.id);
  console.log(chalk.blue("       URL"), chalk.yellow(assignment.html_url));
}

export default function cli() {
  showCurrentState();

  program
    .command("current")
    .alias("status")
    .description("Show current settings");

  const foo = program.command("foo").description("List things");
  foo.command("zowie").action(() => console.log("foo"));

  new ListCommands(
    //program.command("list").description("List things"),
    foo,
    api,
    cache
  );

  new ShowCommands(
    program.command("show").description("Show details"),
    api,
    cache
  );

  new FindCommands(
    program.command("find").description("Find things"),
    api,
    cache
  );

  new GradeCommands(program, api, cache);
  new DownloadCommands(program, api, cache);

  new SetCommands(
    program
      .command("select")
      .alias("choose")
      .alias("set")
      .description("Set current values"),
    api,
    cache
  );

  program.parse(process.argv);
}
