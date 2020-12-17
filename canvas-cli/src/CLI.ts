import { config } from "dotenv";
config();

import chalk from "chalk";
import { ListCommands } from "./commands/list";
import { version } from "../package.json";
import { ShowCommands } from "./commands/show";
import { FindCommands } from "./commands/find";
import { GradeCommands } from "./commands/grade";
import { DownloadCommands } from "./commands/download";
import { SetCommands } from "./commands/set";
import { longestKeyLength } from "./util/formatting";
import _ from "lodash";
import { CacheService } from "./services/CacheService";
import { Service } from "typedi";
import { HttpService } from "./services/HttpService";

// Something seems goofed up with importing from the typings file.
const { Command } = require("commander");

const prettyError = require("pretty-error").start();
prettyError.appendStyle({
  "pretty-error > trace > item": {
    marginBottom: 0,
    bullet: '"<red>-</red>"',
  },
});

@Service()
export default class CLI {
  constructor(
    private downloadCommands: DownloadCommands,
    private findCommands: FindCommands,
    private gradeCommands: GradeCommands,
    private listCommands: ListCommands,
    private setCommands: SetCommands,
    private showCommands: ShowCommands,
    private httpService: HttpService,
    private cache: CacheService
  ) {}

  private showCurrentState() {
    const details = [
      { name: "Term", value: this.cache.getTerm() },
      { name: "Course", value: this.cache.getCourse() },
      { name: "Assignment", value: this.cache.getAssignment() },
    ];
    const longestLength = longestKeyLength(details, "name");

    for (const detail of details) {
      const segments = [
        chalk.blue(_.padStart(detail.name, longestLength)),
        chalk.green(detail.value ? detail.value.toString() : "[Unknown]"),
      ];
      console.log(segments.join(" "));
    }
  }

  run() {
    const program = new Command();
    program.version(version);
    program.option("--chatty-api", "Show API actions");

    program
      .command("current")
      .alias("status")
      .description("Show current settings");

    this.showCommands.addCommands(program);
    this.setCommands.addCommands(program);
    this.listCommands.addCommands(program);
    this.findCommands.addCommands(program);
    this.downloadCommands.addCommands(program);
    this.gradeCommands.addCommands(program);

    this.showCurrentState();
    program.parse();
  }
}
