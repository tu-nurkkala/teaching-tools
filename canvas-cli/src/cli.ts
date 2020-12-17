import { config } from "dotenv";
config();

import chalk from "chalk";
import { sprintf } from "sprintf-js";
import Cache from "./Cache";
import { ListCommands } from "./commands/list";
import CanvasApi from "./api/api";
import { Assignment } from "./entities/Assignment";
import { version } from "../package.json";
import { Term } from "./entities/Term";
import { Course } from "./entities/Course";
import { ShowCommands } from "./commands/show";
import { FindCommands } from "./commands/find";
import { GradeCommands } from "./commands/grade";
import { DownloadCommands } from "./commands/download";
import { SetCommands } from "./commands/set";

// Something seems goofed up with importing from the typings file.
const { Command } = require("commander");

const cache = Cache.getInstance();
const api = new CanvasApi(cache);

const program = new Command();
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
  console.log("FIX ME");
  return;
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

  new ListCommands(api).addCommands(program);
  new ShowCommands(api).addCommands(program);
  new FindCommands(api).addCommands(program);
  new GradeCommands(api).addCommands(program);
  new DownloadCommands(api).addCommands(program);
  new SetCommands(api).addCommands(program);

  program.parse(process.argv);
}
