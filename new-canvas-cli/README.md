canvas-cli
==========

CLI for Canvas LMS

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/canvas-cli.svg)](https://npmjs.org/package/canvas-cli)
[![Downloads/week](https://img.shields.io/npm/dw/canvas-cli.svg)](https://npmjs.org/package/canvas-cli)
[![License](https://img.shields.io/npm/l/canvas-cli.svg)](https://github.com/nurkkala/canvas-cli/blob/master/package.json)

<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g canvas-cli
$ canvas-cli COMMAND
running command...
$ canvas-cli (-v|--version|version)
canvas-cli/0.0.0 darwin-x64 node-v14.15.3
$ canvas-cli --help [COMMAND]
USAGE
  $ canvas-cli COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`canvas-cli hello [FILE]`](#canvas-cli-hello-file)
* [`canvas-cli help [COMMAND]`](#canvas-cli-help-command)

## `canvas-cli hello [FILE]`

describe the command here

```
USAGE
  $ canvas-cli hello [FILE]

OPTIONS
  -f, --force
  -h, --help       show CLI help
  -n, --name=name  name to print

EXAMPLE
  $ canvas-cli hello
  hello world from ./src/hello.ts!
```

_See code: [src/commands/hello.ts](https://github.com/nurkkala/canvas-cli/blob/v0.0.0/src/commands/hello.ts)_

## `canvas-cli help [COMMAND]`

display help for canvas-cli

```
USAGE
  $ canvas-cli help [COMMAND]

ARGUMENTS
  COMMAND  command to show help for

OPTIONS
  --all  see all commands in CLI
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v3.2.1/src/commands/help.ts)_
<!-- commandsstop -->
