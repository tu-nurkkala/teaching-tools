import { Command, flags } from "@oclif/command";

export default class Term extends Command {
  static description = "list terms";

  static flags = {
    help: flags.help({ char: "h" }),
    // flag with a value (-n, --name=VALUE)
    name: flags.string({ char: "n", description: "name to print" }),
    // flag with no value (-f, --force)
    force: flags.boolean({ char: "f" }),
  };

  static args = [{ name: "file" }];

  async run() {
    const { args, flags } = this.parse(Term);

    const name = flags.name ?? "world";
    this.log(
      `hello ${name} from /Users/tom/Taylor/Tools/new-canvas-cli/src/commands/term.ts`
    );
    if (args.file && flags.force) {
      this.log(`you input --force and --file: ${args.file}`);
    }
  }
}
