import { program } from "commander";
import { version } from "../package.json";

export function cli(args) {
  program.version(version);
  program.parse(args);
}
