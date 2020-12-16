import { Command, program } from "commander";
import CanvasApi from "../api/api";
import CacheDb from "../CacheDb";
import { formatSubmissionType, warning } from "../util/formatting";
import chalk from "chalk";
import prettyBytes from "pretty-bytes";
import TurndownService from "turndown";
import { promisify } from "util";
import stream from "stream";
import { debugCache, debugDownload, debugExtract } from "../debug";
import got from "got";
import { createWriteStream, writeFileSync } from "fs";
import { submissionPath } from "../util/fileSystem";
import extractZip from "extract-zip";
import { dirname } from "path";
import tar from "tar";
import { ExtractHelper } from "../util/ExtractHelper";
import { Attachment, Submission } from "../entities/Assignment";

export class DownloadCommands {
  private turndownService = new TurndownService({
    headingStyle: "atx",
  });
  private pipeline = promisify(stream.pipeline);

  constructor(
    private downloadCmd: Command,
    private api: CanvasApi,
    private cache: CacheDb
  ) {
    downloadCmd
      .command("download [studentId]")
      .description("Download submissions")
      .option(
        "--max-size <size>",
        "Don't get attachments larger than this (bytes)"
      )
      .option("--show-details", "Show submission details")
      .action(async (studentId, options) => {
        if (studentId) {
          await this.processOneSubmission(
            await api.getOneSubmission(studentId),
            options
          );
        } else {
          for (const submission of await api.getSubmissions()) {
            await this.processOneSubmission(submission, options);
          }
        }
      });
  }

  async processOneSubmission(submission, options) {
    console.log(
      submission.id,
      submission.user.name,
      `(${submission.user.id})`,
      formatSubmissionType(submission.submission_type)
    );
    if (options.showDetails) {
      console.log(submission);
    }

    this.cache.cacheSubmission(submission);
    this.clearStudentFiles(submission);

    switch (submission.workflow_state) {
      // Not sure we care about this; download again anyhow.
      // case "graded":
      //   console.log("\t", chalk.green("Already graded"));
      //   continue;
      case "unsubmitted":
        console.log("\t", chalk.red("Workflow state shows nothing submitted"));
        return;
    }

    switch (submission.submission_type) {
      case "online_text_entry":
        this.writeAndCacheOneStudentFile(
          submission,
          "submission.html",
          submission.body
        );
        this.writeAndCacheOneStudentFile(
          submission,
          "submission.md",
          this.turndownService.turndown(submission.body)
        );
        break;

      case "online_upload":
        if (!submission.hasOwnProperty("attachments")) {
          console.log(
            submission.id,
            chalk.red("NO SUBMISSION"),
            submission.user.name
          );
          return;
        }
        for (const attachment of submission.attachments) {
          console.log(
            "\t",
            chalk.green(attachment.display_name),
            chalk.yellow(prettyBytes(attachment.size)),
            attachment["content-type"]
          );
          if (options.maxSize) {
            const sizeLimit = parseInt(options.maxSize);
            if (attachment.size > sizeLimit) {
              console.log(
                "\t",
                chalk.yellow(
                  `Too large [${prettyBytes(attachment.size)} > ${prettyBytes(
                    sizeLimit
                  )}]`
                )
              );
              continue;
            }
          }
          await this.downloadAndProcessOneAttachment(submission, attachment);
        }
        break;

      case "online_url":
        this.writeAndCacheOneStudentFile(
          submission,
          "url.txt",
          "submission.url" + "\n"
        );
        console.log("\t", chalk.green(submission.url));
        break;

      case "online_quiz":
        console.log(chalk.green("Nothing to do for a quiz"));
        break;

      case null:
        console.log("\t", chalk.red("Nothing submitted by this student"));
        break;

      default:
        console.error(
          chalk.red(
            `Not set up to handle submission type '${submission.submission_type}'`
          )
        );
    }
  }

  downloadOneAttachment(url: string, absPath: string) {
    debugDownload(absPath);
    return this.pipeline(got.stream(url), createWriteStream(absPath));
  }

  dbStudentFilePath(submission: Submission) {
    return `course.students.${submission.user.id}.files`;
  }

  clearStudentFiles(submission: Submission) {
    debugCache("Clear student files");
    this.cache.set(this.dbStudentFilePath(submission), []).write();
  }

  cacheOneStudentFile(submission: Submission, name: string, size: number) {
    const entry = { name, size };
    debugCache("Cache %O", entry);
    this.cache.get(this.dbStudentFilePath(submission)).push(entry).write();
  }

  writeAndCacheOneStudentFile(
    submission: Submission,
    name: string,
    content: string
  ) {
    writeFileSync(submissionPath(submission.user, name), content);
    this.cacheOneStudentFile(submission, name, content.length);
  }

  async downloadAndProcessOneAttachment(
    submission: Submission,
    attachment: Attachment
  ) {
    const absPath = submissionPath(submission.user, attachment.display_name);
    const contentType = attachment["content-type"];

    try {
      await this.downloadOneAttachment(attachment.url, absPath);
    } catch (err) {
      warning(`Problem with download: ${err}`);
    }

    const extractHelper = new ExtractHelper();

    switch (contentType) {
      case "application/zip":
      case "application/x-zip-compressed":
        console.log("\t", chalk.cyan("Zip file"));
        try {
          await extractZip(absPath, {
            dir: dirname(absPath),
            onEntry: (entry) => {
              debugExtract("Zip entry %O", entry);
              if (!entry.fileName.endsWith("/")) {
                // According to the yauzl docs, directories end with a slash.
                // Don't add them.
                extractHelper.addEntry(entry.fileName, entry.uncompressedSize);
              }
            },
          });
          extractHelper.report();
        } catch (err) {
          warning(`Problem extracting zip file: ${err}`);
        }
        break;

      case "application/gzip":
      case "application/x-tar":
      case "application/x-gzip":
        console.log("\t", chalk.cyan("Tar file"));
        try {
          await tar.extract({
            file: absPath,
            cwd: dirname(absPath),
            filter: (path, entry) => !extractHelper.skipEntry(path),
            onentry: (entry) => {
              debugExtract("Tar entry %O", entry);
              if (entry.type !== "Directory") {
                extractHelper.addEntry(entry.path, entry.size);
              }
            },
          });
          extractHelper.report();
        } catch (err) {
          warning(`Problem extracting tar file: ${err}`);
        }
        break;

      case "application/json":
      case "application/pdf":
      case "application/sql":
      case "text/javascript":
      case "text/plain":
      case "text/x-python":
      case "text/x-python-script":
      case "text/x-sql":
        extractHelper.addEntry(attachment.display_name, attachment.size);
        console.log("\t", chalk.green("No processing required"));
        break;

      default:
        warning(
          `Not configured to process ${attachment.display_name} (${attachment["content-type"]})`
        );
        break;
    }

    extractHelper.studentFiles.forEach((fileInfo) =>
      this.cacheOneStudentFile(submission, fileInfo.name, fileInfo.size)
    );
  }
}
