import { FileInfo } from "../entities/Assignment";
import chalk from "chalk";
import prettyBytes from "pretty-bytes";
import pluralize from "pluralize";

interface ExtractInfo {
  extracted: number;
  skipped: number;
}

export class ExtractHelper {
  studentFiles: FileInfo[];
  files: ExtractInfo;
  bytes: ExtractInfo;

  constructor() {
    this.studentFiles = [];
    this.files = { extracted: 0, skipped: 0 };
    this.bytes = { extracted: 0, skipped: 0 };
  }

  skipEntry(name: string) {
    return (
      name.includes("node_modules/") ||
      name.includes(".git/") ||
      name.includes(".idea/") ||
      name.includes("/.DS_Store") ||
      name.includes("/._") ||
      name.includes("/venv/")
    );
  }

  addEntry(name: string, size: number) {
    if (this.skipEntry(name)) {
      this.files.skipped += 1;
      this.bytes.skipped += size;
    } else {
      this.files.extracted += 1;
      this.bytes.extracted += size;
      this.studentFiles.push({ name, size });

      console.log(
        "\t",
        chalk.green(`${name}`),
        chalk.yellow(`(${prettyBytes(size)})`)
      );
    }
  }

  report() {
    const segments = [];
    if (this.files.skipped === 0) {
      segments.push(
        `${this.files.extracted} ${pluralize("file", this.files.extracted)}`
      );
    } else {
      const totalFiles = this.files.skipped + this.files.extracted;
      segments.push(`${this.files.extracted}/${totalFiles}`);
      segments.push(`${this.files.skipped} skipped`);
    }
    if (this.bytes.skipped === 0) {
      segments.push(prettyBytes(this.bytes.extracted));
    } else {
      const totalBytes = this.bytes.skipped + this.bytes.extracted;
      segments.push(
        `${prettyBytes(this.bytes.extracted)}/${prettyBytes(totalBytes)}`
      );
      segments.push(`${prettyBytes(this.bytes.skipped)} skipped`);
    }
    const report = ["\t "] + segments.join(" | ");
    const color = this.bytes.skipped || this.files.skipped ? "red" : "teal";
    console.log(chalk.keyword(color)(report));
  }
}
